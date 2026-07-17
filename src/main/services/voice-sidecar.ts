import { randomBytes, randomUUID } from 'node:crypto'
import { type ChildProcessByStdio, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Readable } from 'node:stream'

import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

import type {
  OperationResult,
  VoiceCapabilities,
  VoiceMetrics,
  VoicePlaybackSummary,
  VoiceRequest,
  VoiceResult,
  VoiceRuntimeStatus
} from '../../shared/types'
import type { AppLogger } from './logger'

type HealthPayload = {
  ok?: boolean
  edge_tts?: boolean
  ffmpeg?: boolean
  ffprobe?: boolean
  rvc?: boolean
  rvc_package?: boolean
  rmvpe?: boolean
  content_vec?: boolean
  device?: string
  device_info?: {
    selected?: string
    cudaAvailable?: boolean
    cudaName?: string | null
    devices?: unknown
    torch?: string | null
    torchCuda?: string | null
  }
  runtime?: VoiceRuntimeStatus
  versions?: Record<string, string | null>
}

type PendingPlayback = {
  source: 'sidecar-rvc' | 'sidecar-basic'
  metrics: VoiceMetrics | null
}

export class VoiceSidecar {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null
  private token = ''
  private port = 0
  private health: HealthPayload | null = null
  private state: VoiceCapabilities['sidecar'] = 'offline'
  private abortController: AbortController | null = null
  private pendingPlayback = new Map<string, PendingPlayback>()
  private lastMetrics: VoiceMetrics | null = null
  private lastPlayback: VoicePlaybackSummary | null = null

  constructor(
    private readonly projectRoot: string,
    private readonly resourcesPath: string,
    private readonly tempRoot: string,
    private readonly runtimeRoot: string,
    private readonly logger: AppLogger
  ) {}

  async start(voiceRoot: string | null): Promise<void> {
    if (this.child) return
    this.state = 'starting'
    this.token = randomBytes(32).toString('hex')
    this.port = await reservePort()
    const command = this.resolveCommand()
    if (!command) {
      this.state = 'offline'
      this.logger.warn('Python voice sidecar tidak tersedia; browser TTS akan dipakai.')
      return
    }

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONDONTWRITEBYTECODE: '1',
      YACHIYO_SIDECAR_TOKEN: this.token,
      YACHIYO_PORT: String(this.port),
      YACHIYO_TEMP_ROOT: this.tempRoot,
      YACHIYO_RUNTIME_ROOT: this.runtimeRoot,
      YACHIYO_VOICE_ROOT: voiceRoot ?? '',
      YACHIYO_FFMPEG: normalizeBinaryPath(ffmpegPath),
      YACHIYO_FFPROBE: normalizeBinaryPath(ffprobeStatic.path)
    }
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: environment,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.child = child
    child.stdout.on('data', (data: Buffer) =>
      this.logger.debug('Voice sidecar.', data.toString().trim())
    )
    child.stderr.on('data', (data: Buffer) =>
      this.logger.debug('Voice sidecar stderr.', data.toString().trim())
    )
    child.once('exit', (code) => {
      this.logger.warn('Voice sidecar berhenti.', { code })
      if (this.child !== child) return
      this.child = null
      this.health = null
      this.state = 'offline'
    })

    try {
      await this.waitForHealth()
      this.state = 'ready'
      this.logger.info('Voice sidecar siap.', this.health)
    } catch (error) {
      this.logger.warn('Voice sidecar gagal sehat; browser TTS tetap tersedia.', error)
      this.stop()
    }
  }

  async restart(voiceRoot: string | null): Promise<void> {
    const previous = this.child
    const stopped = previous?.exitCode === null ? waitForChildExit(previous) : null
    this.stop()
    if (stopped) await stopped
    await this.start(voiceRoot)
  }

  stop(): void {
    this.abortController?.abort()
    this.abortController = null
    const child = this.child
    this.child = null
    if (child && !child.killed) child.kill()
    this.health = null
    this.state = 'offline'
    this.pendingPlayback.clear()
  }

  async stopAndWait(timeoutMs = 3_000): Promise<void> {
    const child = this.child
    const stopped = child?.exitCode === null ? waitForChildExit(child) : null
    this.stop()
    if (!stopped) return
    await Promise.race([
      stopped,
      new Promise<void>((resolvePromise) => setTimeout(resolvePromise, timeoutMs))
    ])
  }

  capabilities(): VoiceCapabilities {
    const runtime = normalizeRuntime(this.health?.runtime)
    const rvcReady = Boolean(this.health?.rvc)
    return {
      sidecar: this.state,
      edgeTts: Boolean(this.health?.edge_tts),
      browserTts: true,
      rvc: rvcReady,
      ffmpeg: Boolean(this.health?.ffmpeg && this.health.ffprobe),
      device: this.health?.device ?? 'cpu',
      detail: voiceDetail(this.state, runtime, rvcReady),
      runtime,
      deviceInfo: normalizeDeviceInfo(this.health),
      versions: { ...(this.health?.versions ?? {}) },
      lastMetrics: this.lastMetrics,
      lastPlayback: this.lastPlayback
    }
  }

  async refreshCapabilities(): Promise<VoiceCapabilities> {
    if (this.state !== 'ready') return this.capabilities()
    try {
      const response = await this.fetch('/capabilities', { signal: AbortSignal.timeout(8_000) })
      if (response.ok) this.health = (await response.json()) as HealthPayload
    } catch (error) {
      this.logger.warn('Status runtime voice tidak dapat diperbarui.', error)
    }
    return this.capabilities()
  }

  async setupRuntime(): Promise<VoiceCapabilities> {
    if (this.state !== 'ready') return this.capabilities()
    try {
      const response = await this.fetch('/runtime/setup', {
        method: 'POST',
        signal: AbortSignal.timeout(8_000)
      })
      if (response.ok) {
        const runtime = (await response.json()) as VoiceRuntimeStatus
        this.health = { ...(this.health ?? {}), runtime }
      }
    } catch (error) {
      this.logger.warn('Penyiapan runtime RVC tidak dapat dimulai.', error)
    }
    return this.capabilities()
  }

  runtimeStatus(): {
    ffmpeg: boolean
    ffprobe: boolean
    python: boolean
    rvc: boolean
    rmvpe: boolean
    contentVec: boolean
  } {
    return {
      ffmpeg: Boolean(this.health?.ffmpeg),
      ffprobe: Boolean(this.health?.ffprobe),
      python: this.state === 'ready',
      rvc: Boolean(this.health?.rvc_package),
      rmvpe: Boolean(this.health?.rmvpe),
      contentVec: Boolean(this.health?.content_vec)
    }
  }

  async synthesize(request: VoiceRequest): Promise<VoiceResult> {
    if (request.mode === 'disabled') {
      return {
        ok: true,
        source: 'disabled',
        mimeType: null,
        audioBase64: null,
        message: 'Suara dinonaktifkan.',
        fellBack: false,
        requestId: null,
        metrics: null
      }
    }
    if (this.state !== 'ready') return browserFallback('Voice sidecar belum siap.')

    const preferRvc = request.mode === 'rvc'
    const route = preferRvc && this.health?.rvc ? '/voice/rvc' : '/tts/basic'
    const payload =
      route === '/voice/rvc'
        ? {
            text: request.text,
            voice: request.voice,
            speed: request.speed,
            pitch: request.pitch,
            volume: 1,
            parameters: {
              pitch: request.rvc.pitch,
              index_rate: request.rvc.indexRate,
              protect: request.rvc.protect,
              f0_method: request.rvc.f0Method,
              device: request.rvc.device
            }
          }
        : {
            text: request.text,
            voice: request.voice,
            speed: request.speed,
            pitch: request.pitch,
            volume: 1
          }

    this.abortController?.abort()
    this.abortController = new AbortController()
    try {
      const response = await this.fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: this.abortController.signal
      })
      if (!response.ok) {
        if (route === '/voice/rvc') {
          this.logger.warn('RVC gagal; Basic TTS dipakai.', { status: response.status })
          const fallback = await this.synthesize({ ...request, mode: 'basic' })
          return {
            ...fallback,
            message: `RVC gagal (${String(response.status)}); Basic TTS dipakai otomatis.`,
            fellBack: true
          }
        }
        return browserFallback(`Basic TTS sidecar gagal (${String(response.status)}).`)
      }
      const data = Buffer.from(await response.arrayBuffer())
      if (data.length > 24 * 1024 * 1024) return browserFallback('Audio melebihi batas aman.')
      const source = route === '/voice/rvc' ? 'sidecar-rvc' : 'sidecar-basic'
      const metrics = decodeMetrics(response.headers.get('x-yachiyo-metrics'))
      const requestId = randomUUID()
      this.lastMetrics = metrics
      this.pendingPlayback.set(requestId, { source, metrics })
      while (this.pendingPlayback.size > 20) {
        const oldest = this.pendingPlayback.keys().next().value
        if (oldest) this.pendingPlayback.delete(oldest)
        else break
      }
      return {
        ok: true,
        source,
        mimeType:
          response.headers.get('content-type') ??
          (route === '/voice/rvc' ? 'audio/wav' : 'audio/mpeg'),
        audioBase64: data.toString('base64'),
        message: route === '/voice/rvc' ? 'Audio RVC siap.' : 'Basic TTS siap.',
        fellBack: preferRvc && route !== '/voice/rvc',
        requestId,
        metrics
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return browserFallback('Pemutaran dihentikan.')
      }
      this.logger.warn('Sintesis voice sidecar gagal.', error)
      return browserFallback('Voice sidecar tidak dapat menghasilkan audio.')
    } finally {
      this.abortController = null
    }
  }

  reportPlayback(payload: {
    requestId: string
    durationMs: number
    maxLipSync: number
  }): OperationResult {
    const pending = this.pendingPlayback.get(payload.requestId)
    if (!pending) return { ok: false, message: 'Laporan playback tidak dikenali.' }
    this.pendingPlayback.delete(payload.requestId)
    this.lastPlayback = {
      requestId: payload.requestId,
      source: pending.source,
      playedAt: new Date().toISOString(),
      durationMs: payload.durationMs,
      maxLipSync: payload.maxLipSync,
      metrics: pending.metrics
    }
    this.logger.info('Playback voice renderer selesai.', this.lastPlayback)
    return { ok: true, message: 'Playback voice terverifikasi.' }
  }

  stopCurrent(): void {
    this.abortController?.abort()
    this.abortController = null
  }

  private resolveCommand(): { executable: string; args: string[]; cwd: string } | null {
    const packaged = join(this.resourcesPath, 'voice-sidecar', 'yachiyo-voice-sidecar.exe')
    if (existsSync(packaged)) return { executable: packaged, args: [], cwd: this.resourcesPath }

    const sidecarParent = join(this.projectRoot, 'src', 'sidecar')
    for (const executable of [
      process.env.YACHIYO_PYTHON ?? '',
      join(this.projectRoot, '.venv-rvc', 'Scripts', 'python.exe'),
      join(this.projectRoot, '.venv-sidecar', 'Scripts', 'python.exe'),
      join(this.projectRoot, '.venv', 'Scripts', 'python.exe')
    ]) {
      if (executable && existsSync(executable)) {
        return { executable, args: ['-m', 'rvc_service.app'], cwd: sidecarParent }
      }
    }
    return process.platform === 'win32'
      ? { executable: 'py', args: ['-3.11', '-m', 'rvc_service.app'], cwd: sidecarParent }
      : { executable: 'python3', args: ['-m', 'rvc_service.app'], cwd: sidecarParent }
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      if (!this.child) throw new Error('Sidecar berhenti saat startup.')
      try {
        const response = await this.fetch('/health', { signal: AbortSignal.timeout(1_200) })
        if (response.ok) {
          this.health = (await response.json()) as HealthPayload
          return
        }
      } catch {
        // Startup polling is expected to fail briefly.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 220))
    }
    throw new Error('Voice sidecar melewati batas waktu startup.')
  }

  private fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    return fetch(`http://127.0.0.1:${String(this.port)}${path}`, {
      ...init,
      headers
    })
  }
}

function browserFallback(message: string): VoiceResult {
  return {
    ok: true,
    source: 'browser-basic',
    mimeType: null,
    audioBase64: null,
    message,
    fellBack: true,
    requestId: null,
    metrics: null
  }
}

function normalizeRuntime(value: VoiceRuntimeStatus | undefined): VoiceRuntimeStatus {
  if (value) return value
  return {
    state: 'checking',
    stage: 'Status runtime belum tersedia.',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    currentAsset: null,
    error: null,
    assets: {}
  }
}

function normalizeDeviceInfo(health: HealthPayload | null): VoiceCapabilities['deviceInfo'] {
  const source = health?.device_info
  const devices = Array.isArray(source?.devices)
    ? source.devices.filter((entry): entry is string => typeof entry === 'string').slice(0, 4)
    : ['cpu']
  return {
    selected: source?.selected ?? health?.device ?? 'cpu',
    cudaAvailable: source?.cudaAvailable === true,
    cudaName: typeof source?.cudaName === 'string' ? source.cudaName : null,
    devices,
    torch: typeof source?.torch === 'string' ? source.torch : null,
    torchCuda: typeof source?.torchCuda === 'string' ? source.torchCuda : null
  }
}

function voiceDetail(
  sidecar: VoiceCapabilities['sidecar'],
  runtime: VoiceRuntimeStatus,
  rvcReady: boolean
): string {
  if (sidecar !== 'ready') return 'Sidecar offline; Windows/browser TTS tetap tersedia.'
  if (runtime.state === 'downloading')
    return `Menyiapkan runtime RVC · ${runtime.progress.toFixed(1)}%.`
  if (runtime.state === 'setup-required') return 'Basic TTS siap; runtime RVC perlu disiapkan.'
  if (runtime.state === 'error') return 'Setup RVC gagal; Basic TTS tetap siap.'
  return rvcReady ? 'RVC dan Basic TTS siap.' : 'Basic TTS siap; aset Kobo belum lengkap.'
}

function decodeMetrics(value: string | null): VoiceMetrics | null {
  if (!value || value.length > 8_192 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const padding = '='.repeat((4 - (value.length % 4)) % 4)
    const parsed: unknown = JSON.parse(Buffer.from(value + padding, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const safe: VoiceMetrics = {}
    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry === 'number' && Number.isFinite(entry) && Math.abs(entry) < 1e12) {
        if (METRIC_NUMBER_KEYS.has(key)) Object.assign(safe, { [key]: entry })
      } else if (typeof entry === 'boolean' && key === 'silence') {
        safe.silence = entry
      } else if (typeof entry === 'string' && entry.length <= 160) {
        if (key === 'device' || key === 'deviceName') Object.assign(safe, { [key]: entry })
      }
    }
    return safe
  } catch {
    return null
  }
}

const METRIC_NUMBER_KEYS = new Set([
  'coldStartMs',
  'conversionMs',
  'featureMs',
  'pitchMs',
  'indexMs',
  'inferMs',
  'ttsMs',
  'totalMs',
  'cpuPercent',
  'peakRamMb',
  'sourceDurationMs',
  'audioDurationMs',
  'outputBytes'
])

async function reservePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Port sidecar tidak tersedia.'))
        return
      }
      const port = address.port
      server.close((error) => (error ? reject(error) : resolvePromise(port)))
    })
  })
}

async function waitForChildExit(
  child: ChildProcessByStdio<null, Readable, Readable>
): Promise<void> {
  if (child.exitCode !== null) return
  await new Promise<void>((resolvePromise) => {
    const finish = (): void => {
      clearTimeout(timer)
      child.off('exit', finish)
      resolvePromise()
    }
    child.once('exit', finish)
    const timer = setTimeout(finish, 5_000)
  })
}

function normalizeBinaryPath(value: string | null): string {
  if (!value) return ''
  return resolve(value.replace('app.asar', 'app.asar.unpacked'))
}
