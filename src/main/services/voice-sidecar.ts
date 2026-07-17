import { randomBytes } from 'node:crypto'
import { type ChildProcessByStdio, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Readable } from 'node:stream'

import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

import type { VoiceCapabilities, VoiceRequest, VoiceResult } from '../../shared/types'
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
}

export class VoiceSidecar {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null
  private token = ''
  private port = 0
  private health: HealthPayload | null = null
  private state: VoiceCapabilities['sidecar'] = 'offline'
  private abortController: AbortController | null = null

  constructor(
    private readonly projectRoot: string,
    private readonly resourcesPath: string,
    private readonly tempRoot: string,
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
      if (this.child === child) this.child = null
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
    this.stop()
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
  }

  capabilities(): VoiceCapabilities {
    return {
      sidecar: this.state,
      edgeTts: Boolean(this.health?.edge_tts),
      browserTts: true,
      rvc: Boolean(this.health?.rvc),
      ffmpeg: Boolean(this.health?.ffmpeg && this.health.ffprobe),
      device: this.health?.device ?? 'cpu',
      detail:
        this.state === 'ready'
          ? this.health?.rvc
            ? 'RVC dan Basic TTS siap.'
            : 'Basic TTS siap; RVC belum lengkap.'
          : 'Sidecar offline; Windows/browser TTS tetap tersedia.'
    }
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
        fellBack: false
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
      const response = await fetch(`http://127.0.0.1:${String(this.port)}${route}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: this.abortController.signal
      })
      if (!response.ok) {
        if (preferRvc) return await this.synthesize({ ...request, mode: 'basic' })
        return browserFallback(`Basic TTS sidecar gagal (${String(response.status)}).`)
      }
      const data = Buffer.from(await response.arrayBuffer())
      if (data.length > 24 * 1024 * 1024) return browserFallback('Audio melebihi batas aman.')
      return {
        ok: true,
        source: route === '/voice/rvc' ? 'sidecar-rvc' : 'sidecar-basic',
        mimeType:
          response.headers.get('content-type') ??
          (route === '/voice/rvc' ? 'audio/wav' : 'audio/mpeg'),
        audioBase64: data.toString('base64'),
        message: route === '/voice/rvc' ? 'Audio RVC siap.' : 'Basic TTS siap.',
        fellBack: preferRvc && route !== '/voice/rvc'
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
      join(this.projectRoot, '.venv', 'Scripts', 'python.exe'),
      join(this.projectRoot, '.venv-sidecar', 'Scripts', 'python.exe')
    ]) {
      if (executable && existsSync(executable)) {
        return { executable, args: ['-m', 'rvc_service.app'], cwd: sidecarParent }
      }
    }
    return process.platform === 'win32'
      ? { executable: 'py', args: ['-3.13', '-m', 'rvc_service.app'], cwd: sidecarParent }
      : { executable: 'python3', args: ['-m', 'rvc_service.app'], cwd: sidecarParent }
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      if (!this.child) throw new Error('Sidecar berhenti saat startup.')
      try {
        const response = await fetch(`http://127.0.0.1:${String(this.port)}/health`, {
          headers: { Authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(800)
        })
        if (response.ok) {
          this.health = (await response.json()) as HealthPayload
          return
        }
      } catch {
        // Startup polling is expected to fail briefly.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 180))
    }
    throw new Error('Voice sidecar melewati batas waktu startup.')
  }
}

function browserFallback(message: string): VoiceResult {
  return {
    ok: true,
    source: 'browser-basic',
    mimeType: null,
    audioBase64: null,
    message,
    fellBack: true
  }
}

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

function normalizeBinaryPath(value: string | null): string {
  if (!value) return ''
  return resolve(value.replace('app.asar', 'app.asar.unpacked'))
}
