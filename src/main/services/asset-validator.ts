import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, open, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'

import yauzl, { type Entry, type ZipFile } from 'yauzl'

import type {
  AssetIssue,
  AssetStatus,
  ExpressionInfo,
  Live2DAssetStatus,
  MotionInfo,
  VoiceAssetStatus
} from '../../shared/types'
import type { AppLogger } from './logger'

type ModelJson = {
  Version?: number
  FileReferences?: {
    Moc?: string
    Textures?: string[]
    Physics?: string
    Pose?: string
    DisplayInfo?: string
    Expressions?: { Name?: string; File?: string }[]
    Motions?: Record<string, { File?: string }[]>
  }
  Groups?: { Target?: string; Name?: string; Ids?: string[] }[]
}

type Candidate = { path: string; sourceKind: 'zip' | 'folder' }

const MODEL_ENTRY = 'mao_pro.model3.json'
const CHECKPOINT_NAME = 'kobov2.pth'
const INDEX_NAME = 'added_IVF454_Flat_nprobe_1_kobov2_v2.index'
const MAX_ZIP_ENTRIES = 5_000
const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024

export class AssetValidator {
  constructor(
    private readonly projectRoot: string,
    private readonly cacheRoot: string,
    private readonly logger: AppLogger,
    private readonly runtimeCapabilities: () => VoiceAssetStatus['runtime']
  ) {}

  async scan(configured: {
    live2dRoot: string
    voiceRoot: string
    cubismCorePath: string
  }): Promise<AssetStatus> {
    const [live2d, voice] = await Promise.all([
      this.scanLive2D(configured.live2dRoot, configured.cubismCorePath),
      this.scanVoice(configured.voiceRoot)
    ])
    return { live2d, voice, scannedAt: new Date().toISOString() }
  }

  refreshRuntime(status: AssetStatus): AssetStatus {
    const runtime = this.runtimeCapabilities()
    const issues = status.voice.issues.filter((item) => item.code !== 'RVC_RUNTIME_MISSING')
    const complete = Boolean(status.voice.checkpoint && status.voice.index)
    const inferenceReady = Object.values(runtime).every(Boolean)
    if (complete && !inferenceReady) issues.push(rvcRuntimeIssue())
    return {
      ...status,
      voice: {
        ...status.voice,
        state: complete ? (inferenceReady ? 'ready' : 'runtime-missing') : status.voice.state,
        runtime,
        issues
      }
    }
  }

  private async scanLive2D(configuredRoot: string, corePath: string): Promise<Live2DAssetStatus> {
    const empty = emptyLive2D()
    let resolvedCore: string | null = null
    try {
      resolvedCore = await this.resolveCore(corePath)
      const selectedRoot = configuredRoot.trim()
      const candidate = await this.firstExistingCandidate(
        selectedRoot
          ? [selectedRoot]
          : [
              process.env.YACHIYO_LIVE2D_ROOT ?? '',
              join(this.projectRoot, 'project-assets', 'live2d', 'mao_en.zip'),
              join(this.projectRoot, 'project-assets', 'live2d', 'mao'),
              join(this.projectRoot, 'assets', 'source', 'mao_en')
            ]
      )
      if (!candidate) {
        const invalidCore = corePath.trim() && !resolvedCore ? invalidCoreIssue(corePath) : null
        if (!selectedRoot) {
          return {
            ...empty,
            hasCore: Boolean(resolvedCore),
            issues: invalidCore ? [...empty.issues, invalidCore] : empty.issues
          }
        }
        return {
          ...empty,
          state: 'invalid',
          sourceKind: sourceKindForPath(selectedRoot),
          root: resolve(selectedRoot),
          hasCore: Boolean(resolvedCore),
          issues: [
            issue(
              'LIVE2D_PATH_INVALID',
              'Folder atau ZIP Mao yang dipilih sudah tidak ada atau bukan sumber aset yang dapat dibaca.',
              selectedRoot
            ),
            ...(invalidCore ? [invalidCore] : [])
          ]
        }
      }

      const root =
        candidate.sourceKind === 'zip'
          ? await this.extractZip(candidate.path, 'live2d')
          : candidate.path
      const entry = await findNamedFile(root, MODEL_ENTRY, 5)
      if (!entry) {
        return {
          ...empty,
          state: 'invalid',
          sourceKind: candidate.sourceKind,
          root,
          issues: [
            issue('LIVE2D_ENTRY_MISSING', 'Entry mao_pro.model3.json tidak ditemukan.', root)
          ]
        }
      }

      const runtimeRoot = dirname(entry)
      const parsed = JSON.parse(await readFile(entry, 'utf8')) as ModelJson
      const fileReferences = parsed.FileReferences
      if (!fileReferences?.Moc || !fileReferences.Textures?.length) {
        throw new Error('Model JSON tidak memiliki MOC atau texture.')
      }

      const referenced = collectModelReferences(fileReferences)
      const issues: AssetIssue[] = []
      for (const ref of referenced) {
        const target = safeChild(runtimeRoot, ref.path)
        if (!target || !(await exists(target))) {
          issues.push(
            issue(
              'LIVE2D_REFERENCE_MISSING',
              `Referensi ${ref.kind} tidak aman atau hilang.`,
              ref.path
            )
          )
        }
      }

      const expressions: ExpressionInfo[] = []
      for (const expression of fileReferences.Expressions ?? []) {
        if (!expression.File) continue
        const target = safeChild(runtimeRoot, expression.File)
        if (!target || !(await exists(target))) continue
        const data = JSON.parse(await readFile(target, 'utf8')) as { Parameters?: unknown[] }
        expressions.push({
          name: expression.Name?.trim()
            ? expression.Name
            : basename(expression.File, extname(expression.File)),
          file: expression.File,
          parameterCount: data.Parameters?.length ?? 0
        })
      }

      const motions: MotionInfo[] = []
      for (const [group, entries] of Object.entries(fileReferences.Motions ?? {})) {
        for (const [index, motion] of entries.entries()) {
          if (!motion.File) continue
          const target = safeChild(runtimeRoot, motion.File)
          if (!target || !(await exists(target))) continue
          const data = JSON.parse(await readFile(target, 'utf8')) as {
            Meta?: { Duration?: number; Loop?: boolean }
          }
          motions.push({
            group,
            index,
            name: basename(motion.File, '.motion3.json'),
            file: motion.File,
            durationSeconds: data.Meta?.Duration ?? null,
            loop: data.Meta?.Loop ?? null
          })
        }
      }

      const textures: Live2DAssetStatus['textures'] = []
      for (const texture of fileReferences.Textures) {
        const texturePath = safeChild(runtimeRoot, texture)
        if (!texturePath || !(await exists(texturePath))) continue
        const size = await readPngSize(texturePath)
        textures.push({
          file: texture,
          width: size?.width ?? null,
          height: size?.height ?? null
        })
        if (!size) {
          issues.push(
            issue('LIVE2D_TEXTURE_INVALID', 'Texture model bukan PNG yang dapat dibaca.', texture)
          )
        }
      }
      const textureSize = textures[0]?.width
        ? { width: textures[0].width, height: textures[0].height ?? 0 }
        : null

      if (!resolvedCore) {
        issues.push(
          corePath.trim()
            ? invalidCoreIssue(corePath)
            : issue(
                'CUBISM_CORE_MISSING',
                'Aset Mao valid, tetapi Cubism Core resmi belum dipasang. Avatar fallback tetap aktif.'
              )
        )
      }

      const hashes: Record<string, string> = {}
      const primaryTexture = safeChild(runtimeRoot, fileReferences.Textures[0] ?? '')
      for (const target of [entry, safeChild(runtimeRoot, fileReferences.Moc), primaryTexture]) {
        if (target && (await exists(target))) hashes[basename(target)] = await sha256(target)
      }

      const groups = parsed.Groups ?? []
      const lipSync = groups.find((group) => group.Name === 'LipSync')?.Ids ?? []
      const eyeBlink = groups.find((group) => group.Name === 'EyeBlink')?.Ids ?? []
      const [hasPhysics, hasPose] = await Promise.all([
        referencedFileExists(runtimeRoot, fileReferences.Physics),
        referencedFileExists(runtimeRoot, fileReferences.Pose)
      ])

      return {
        state: issues.some((item) => item.code !== 'CUBISM_CORE_MISSING')
          ? 'invalid'
          : resolvedCore
            ? 'ready'
            : 'core-missing',
        sourceKind: candidate.sourceKind,
        root: runtimeRoot,
        entry,
        modelName: 'Niziiro Mao',
        modelVersion: parsed.Version ?? null,
        textureSize,
        textures,
        expressions,
        motions,
        eyeBlinkParameters: eyeBlink,
        lipSyncParameters: lipSync,
        hasPhysics,
        hasPose,
        hasCore: Boolean(resolvedCore),
        issues,
        hashes
      }
    } catch (error) {
      this.logger.warn('Validasi Live2D gagal.', error)
      return {
        ...empty,
        state: 'invalid',
        sourceKind: configuredRoot.trim() ? sourceKindForPath(configuredRoot) : 'none',
        root: configuredRoot.trim() ? resolve(configuredRoot) : null,
        hasCore: Boolean(resolvedCore),
        issues: [issue('LIVE2D_INVALID', toMessage(error))]
      }
    }
  }

  private async scanVoice(configuredRoot: string): Promise<VoiceAssetStatus> {
    const runtime = this.runtimeCapabilities()
    const empty = emptyVoice(runtime)
    try {
      const selectedRoot = configuredRoot.trim()
      const candidate = await this.firstExistingCandidate(
        selectedRoot
          ? [selectedRoot]
          : [
              process.env.YACHIYO_VOICE_ROOT ?? '',
              join(this.projectRoot, 'project-assets', 'voice', 'kobo.zip'),
              join(this.projectRoot, 'project-assets', 'voice', 'kobo'),
              join(this.projectRoot, 'assets', 'source', 'kobo')
            ]
      )
      if (!candidate) {
        if (!selectedRoot) return empty
        return {
          ...empty,
          state: 'invalid',
          sourceKind: sourceKindForPath(selectedRoot),
          root: resolve(selectedRoot),
          issues: [
            issue(
              'VOICE_PATH_INVALID',
              'Folder atau ZIP Kobo yang dipilih sudah tidak ada atau bukan sumber aset yang dapat dibaca.',
              selectedRoot
            )
          ]
        }
      }

      const root =
        candidate.sourceKind === 'zip'
          ? await this.extractZip(candidate.path, 'voice')
          : candidate.path
      const [checkpoint, index] = await Promise.all([
        findNamedFile(root, CHECKPOINT_NAME, 5),
        findNamedFile(root, INDEX_NAME, 5)
      ])
      const issues: AssetIssue[] = []
      if (!checkpoint)
        issues.push(issue('RVC_CHECKPOINT_MISSING', 'Checkpoint kobov2.pth tidak ditemukan.', root))
      if (!index) issues.push(issue('RVC_INDEX_MISSING', 'FAISS index Kobo tidak ditemukan.', root))

      const metadata = checkpoint
        ? await inspectTorchArchive(checkpoint)
        : { version: null, sampleRate: null, f0: null, info: null }
      const hashes: Record<string, string> = {}
      if (checkpoint) hashes[basename(checkpoint)] = await sha256(checkpoint)
      if (index) hashes[basename(index)] = await sha256(index)

      const inferenceReady = Object.values(runtime).every(Boolean)
      if (checkpoint && index && !inferenceReady) {
        issues.push(rvcRuntimeIssue())
      }

      return {
        state: !checkpoint || !index ? 'incomplete' : inferenceReady ? 'ready' : 'runtime-missing',
        sourceKind: candidate.sourceKind,
        root: checkpoint ? dirname(checkpoint) : root,
        checkpoint,
        index,
        metadata,
        runtime,
        issues,
        hashes
      }
    } catch (error) {
      this.logger.warn('Validasi voice asset gagal.', error)
      return {
        ...empty,
        state: 'invalid',
        sourceKind: configuredRoot.trim() ? sourceKindForPath(configuredRoot) : 'none',
        root: configuredRoot.trim() ? resolve(configuredRoot) : null,
        issues: [issue('VOICE_INVALID', toMessage(error))]
      }
    }
  }

  private async firstExistingCandidate(values: string[]): Promise<Candidate | null> {
    for (const value of values) {
      if (!value.trim()) continue
      const path = resolve(value)
      const details = await stat(path).catch(() => null)
      if (details?.isDirectory()) return { path, sourceKind: 'folder' }
      if (details?.isFile() && extname(path).toLowerCase() === '.zip') {
        return { path, sourceKind: 'zip' }
      }
    }
    return null
  }

  private async resolveCore(configuredPath: string): Promise<string | null> {
    const selectedPath = configuredPath.trim()
    const candidates = selectedPath
      ? [selectedPath]
      : [
          process.env.YACHIYO_CUBISM_CORE ?? '',
          join(
            this.projectRoot,
            'project-assets',
            'live2d',
            'sdk',
            'Core',
            'live2dcubismcore.min.js'
          )
        ]
    for (const candidate of candidates) {
      if (!candidate) continue
      const target = resolve(candidate)
      if (basename(target).toLowerCase() !== 'live2dcubismcore.min.js') continue
      if (!(await exists(target))) continue
      const source = await readFile(target, 'utf8').catch(() => '')
      if (looksLikeCubismCore(source)) return target
    }
    return null
  }

  private async extractZip(zipPath: string, kind: 'live2d' | 'voice'): Promise<string> {
    const zipHash = await sha256(zipPath)
    const destination = join(this.cacheRoot, kind, zipHash.slice(0, 16))
    const marker = join(destination, '.complete')
    if (await exists(marker)) return destination
    await mkdir(destination, { recursive: true })

    const zip = await openZip(zipPath)
    let entries = 0
    let totalBytes = 0
    try {
      await new Promise<void>((resolvePromise, reject) => {
        zip.on('error', reject)
        zip.on('entry', (entry: Entry) => {
          void (async () => {
            entries += 1
            totalBytes += entry.uncompressedSize
            if (entries > MAX_ZIP_ENTRIES || totalBytes > MAX_ZIP_BYTES) {
              throw new Error('ZIP aset melebihi batas keamanan.')
            }
            const target = safeZipTarget(destination, entry.fileName)
            if (!target) throw new Error(`Path ZIP tidak aman: ${entry.fileName}`)
            if (entry.fileName.endsWith('/')) {
              await mkdir(target, { recursive: true })
            } else {
              await mkdir(dirname(target), { recursive: true })
              const stream = await openZipStream(zip, entry)
              await pipeline(stream, createWriteStream(target, { flags: 'wx' }))
            }
            zip.readEntry()
          })().catch(reject)
        })
        zip.on('end', resolvePromise)
        zip.readEntry()
      })
      await writeFile(marker, zipHash, 'utf8')
      return destination
    } finally {
      zip.close()
    }
  }
}

function collectModelReferences(fileReferences: NonNullable<ModelJson['FileReferences']>): {
  kind: string
  path: string
}[] {
  const result: { kind: string; path: string }[] = []
  if (fileReferences.Moc) result.push({ kind: 'MOC', path: fileReferences.Moc })
  for (const path of fileReferences.Textures ?? []) result.push({ kind: 'texture', path })
  for (const key of ['Physics', 'Pose', 'DisplayInfo'] as const) {
    const path = fileReferences[key]
    if (path) result.push({ kind: key, path })
  }
  for (const expression of fileReferences.Expressions ?? []) {
    if (expression.File) result.push({ kind: 'expression', path: expression.File })
  }
  for (const motions of Object.values(fileReferences.Motions ?? {})) {
    for (const motion of motions) {
      if (motion.File) result.push({ kind: 'motion', path: motion.File })
    }
  }
  return result
}

function emptyLive2D(): Live2DAssetStatus {
  return {
    state: 'missing',
    sourceKind: 'none',
    root: null,
    entry: null,
    modelName: null,
    modelVersion: null,
    textureSize: null,
    textures: [],
    expressions: [],
    motions: [],
    eyeBlinkParameters: [],
    lipSyncParameters: [],
    hasPhysics: false,
    hasPose: false,
    hasCore: false,
    issues: [issue('LIVE2D_MISSING', 'Aset Mao belum ditemukan. Avatar fallback tetap tersedia.')],
    hashes: {}
  }
}

function emptyVoice(runtime: VoiceAssetStatus['runtime']): VoiceAssetStatus {
  return {
    state: 'missing',
    sourceKind: 'none',
    root: null,
    checkpoint: null,
    index: null,
    metadata: { version: null, sampleRate: null, f0: null, info: null },
    runtime,
    issues: [issue('VOICE_MISSING', 'Model suara Kobo belum ditemukan. Basic TTS tetap tersedia.')],
    hashes: {}
  }
}

function issue(code: string, message: string, path?: string): AssetIssue {
  return path === undefined ? { code, message } : { code, message, path }
}

function invalidCoreIssue(path: string): AssetIssue {
  return issue(
    'CUBISM_CORE_INVALID',
    'Berkas Cubism Core yang dipilih tidak valid. Pilih live2dcubismcore.min.js resmi dari Cubism SDK for Web.',
    path
  )
}

function rvcRuntimeIssue(): AssetIssue {
  return issue(
    'RVC_RUNTIME_MISSING',
    'Model ditemukan, tetapi runtime RVC lengkap belum siap. Basic TTS akan dipakai.'
  )
}

function looksLikeCubismCore(source: string): boolean {
  return ['Live2DCubismCore', 'Cubism Core', 'csmGetVersion', 'Moc', 'Model'].every((marker) =>
    source.includes(marker)
  )
}

function sourceKindForPath(path: string): 'zip' | 'folder' {
  return extname(path).toLowerCase() === '.zip' ? 'zip' : 'folder'
}

async function referencedFileExists(root: string, reference: string | undefined): Promise<boolean> {
  if (!reference) return false
  const target = safeChild(root, reference)
  return Boolean(target && (await exists(target)))
}

function safeChild(root: string, child: string): string | null {
  if (!child || isAbsolute(child)) return null
  const target = resolve(root, child.replaceAll('/', sep))
  return target === root || target.startsWith(`${resolve(root)}${sep}`) ? target : null
}

function safeZipTarget(root: string, name: string): string | null {
  const normalized = name.replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null
  const target = resolve(root, ...normalized.split('/'))
  return target === root || target.startsWith(`${resolve(root)}${sep}`) ? target : null
}

async function findNamedFile(root: string, name: string, maxDepth: number): Promise<string | null> {
  async function walk(current: string, depth: number): Promise<string | null> {
    if (depth > maxDepth) return null
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) {
        return join(current, entry.name)
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        const found = await walk(join(current, entry.name), depth + 1)
        if (found) return found
      }
    }
    return null
  }
  return walk(resolve(root), 0)
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex').toUpperCase()
}

async function readPngSize(path: string): Promise<{ width: number; height: number } | null> {
  const handle = await open(path, 'r').catch(() => null)
  if (!handle) return null
  try {
    const buffer = Buffer.alloc(24)
    await handle.read(buffer, 0, 24, 0)
    const signature = '89504e470d0a1a0a'
    if (buffer.subarray(0, 8).toString('hex') !== signature) return null
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  } finally {
    await handle.close()
  }
}

async function inspectTorchArchive(path: string): Promise<VoiceAssetStatus['metadata']> {
  const zip = await openZip(path)
  try {
    const payload = await new Promise<Buffer>((resolvePromise, reject) => {
      zip.on('error', reject)
      zip.on('entry', (entry: Entry) => {
        if (entry.fileName.endsWith('/data.pkl') && entry.uncompressedSize <= 2_000_000) {
          void openZipStream(zip, entry)
            .then(async (stream) => {
              const chunks: Buffer[] = []
              for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array))
              resolvePromise(Buffer.concat(chunks))
            })
            .catch(reject)
          return
        }
        zip.readEntry()
      })
      zip.on('end', () => reject(new Error('data.pkl tidak ditemukan di checkpoint.')))
      zip.readEntry()
    })
    const text = payload.toString('latin1')
    return {
      version: text.includes('v2') ? 'v2' : text.includes('v1') ? 'v1' : null,
      sampleRate: text.includes('48k') ? '48k' : text.includes('40k') ? '40k' : null,
      f0: text.includes('f0') ? true : null,
      info: text.includes('500epoch') ? '500epoch' : null
    }
  } finally {
    zip.close()
  }
}

async function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolvePromise, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error) reject(error)
      else resolvePromise(zip)
    })
  })
}

async function openZipStream(zip: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolvePromise, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) reject(error)
      else resolvePromise(stream)
    })
  })
}

function toMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Kesalahan aset tidak dikenal.'
  if (/invalid relative path|absolute path/i.test(error.message)) {
    return 'ZIP berisi path tidak aman dan ditolak.'
  }
  if (/end of central directory|invalid zip|not a zip|unexpected end/i.test(error.message)) {
    return 'Berkas ZIP rusak atau bukan arsip ZIP yang dapat dibaca.'
  }
  return error.message
}
