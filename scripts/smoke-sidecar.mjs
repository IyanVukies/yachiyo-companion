import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'

const root = resolve('.')
const executable = join(
  root,
  'build',
  'sidecar',
  'yachiyo-voice-sidecar',
  'yachiyo-voice-sidecar.exe'
)
const port = await reservePort()
const token = randomBytes(32).toString('hex')
const outputRoot = join(root, '.cache', 'sidecar-smoke')
const audioPath = join(outputRoot, 'basic.mp3')
await mkdir(outputRoot, { recursive: true })

const child = spawn(executable, [], {
  cwd: root,
  env: {
    ...normalizedEnvironment(process.env),
    YACHIYO_SIDECAR_TOKEN: token,
    YACHIYO_PORT: String(port),
    YACHIYO_TEMP_ROOT: outputRoot,
    YACHIYO_VOICE_ROOT: join(root, 'assets', 'source', 'kobo'),
    YACHIYO_FFMPEG: join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    YACHIYO_FFPROBE: join(
      root,
      'node_modules',
      'ffprobe-static',
      'bin',
      'win32',
      'x64',
      'ffprobe.exe'
    )
  },
  windowsHide: true,
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe']
})

let stderr = ''
let stdout = ''
child.stderr.on('data', (chunk) => {
  stderr = `${stderr}${String(chunk)}`.slice(-8_000)
})
child.stdout.on('data', (chunk) => {
  stdout = `${stdout}${String(chunk)}`.slice(-8_000)
})

try {
  const health = await waitForHealth(child, port, token)
  const unauthorized = await fetch(`http://127.0.0.1:${String(port)}/health`)
  if (unauthorized.status !== 401) {
    throw new Error(`Unauthenticated health request returned ${String(unauthorized.status)}.`)
  }

  const response = await fetch(`http://127.0.0.1:${String(port)}/tts/basic`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: 'Halo, ini tes executable sidecar Yachiyo.',
      voice: 'id-ID-GadisNeural',
      speed: 1,
      pitch: 0,
      volume: 1
    }),
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) {
    throw new Error(`Basic TTS returned ${String(response.status)}: ${await response.text()}`)
  }
  await writeFile(audioPath, Buffer.from(await response.arrayBuffer()))
  const audio = await stat(audioPath)
  if (audio.size < 1_024) throw new Error('Packaged sidecar produced an empty audio file.')

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: health.ok,
        python: health.python,
        edgeTts: health.edge_tts,
        ffmpeg: health.ffmpeg,
        ffprobe: health.ffprobe,
        rvc: health.rvc,
        unauthorizedStatus: unauthorized.status,
        audioBytes: audio.size
      },
      null,
      2
    )}\n`
  )
} catch (error) {
  const detail = [error instanceof Error ? error.message : String(error), stdout, stderr]
    .filter(Boolean)
    .join('\n')
  throw new Error(detail, { cause: error })
} finally {
  if (child.exitCode === null) child.kill()
}

async function waitForHealth(childProcess, healthPort, bearerToken) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (childProcess.exitCode !== null) {
      throw new Error(`Packaged sidecar exited with code ${String(childProcess.exitCode)}.`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${String(healthPort)}/health`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(800)
      })
      if (response.ok) return await response.json()
    } catch {
      // Frozen runtime startup is expected to take a few polls.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  throw new Error('Packaged sidecar did not become healthy within 20 seconds.')
}

function reservePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not reserve a localhost port.'))
        return
      }
      server.close((error) => {
        if (error) reject(error)
        else resolvePromise(address.port)
      })
    })
  })
}

function normalizedEnvironment(environment) {
  const result = {}
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) continue
    const existing = Object.keys(result).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase()
    )
    if (existing) delete result[existing]
    result[key] = value
  }
  return result
}
