import { access, readFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { net, protocol } from 'electron'

import type { AppSettings, AssetStatus } from '../../shared/types'
import type { AppLogger } from './logger'

const LIVE2D_EXTENSIONS = new Set(['.json', '.moc3', '.png'])
const CORE_FILENAME = 'live2dcubismcore.min.js'

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'yachiyo-asset',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: false,
        allowServiceWorkers: false
      }
    }
  ])
}

export function configureAssetProtocol(
  projectRoot: string,
  getAssets: () => AssetStatus,
  getSettings: () => AppSettings,
  logger: AppLogger
): void {
  protocol.handle('yachiyo-asset', async (request) => {
    if (request.method !== 'GET') return errorResponse(405)
    try {
      const url = new URL(request.url)
      const target =
        url.hostname === 'live2d'
          ? resolveLive2DTarget(url, getAssets())
          : url.hostname === 'core'
            ? await resolveCoreTarget(projectRoot, getSettings())
            : null
      if (!target) return errorResponse(404)

      const response = await net.fetch(pathToFileURL(target).toString())
      if (!response.ok) return errorResponse(response.status)
      const headers = new Headers(response.headers)
      headers.set('Cache-Control', 'no-store')
      headers.set('Cross-Origin-Resource-Policy', 'same-site')
      headers.set('X-Content-Type-Options', 'nosniff')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    } catch (error) {
      logger.warn('Permintaan protokol aset ditolak.', error)
      return errorResponse(404)
    }
  })
}

function resolveLive2DTarget(url: URL, assets: AssetStatus): string | null {
  const entry = assets.live2d.entry
  if (!entry) return null
  const root = dirname(entry)
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  if (
    !relativePath ||
    isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    relativePath.split('/').some((part) => part === '..' || part === '.') ||
    !LIVE2D_EXTENSIONS.has(extname(relativePath).toLowerCase())
  ) {
    return null
  }
  const target = resolve(root, relativePath)
  const rootPrefix = `${resolve(root)}${sep}`.toLowerCase()
  return target.toLowerCase().startsWith(rootPrefix) ? target : null
}

async function resolveCoreTarget(
  projectRoot: string,
  settings: AppSettings
): Promise<string | null> {
  const candidates = [
    settings.assets.cubismCorePath,
    process.env.YACHIYO_CUBISM_CORE ?? '',
    join(projectRoot, 'project-assets', 'live2d', 'sdk', 'Core', CORE_FILENAME)
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    const target = resolve(candidate)
    if (basename(target).toLowerCase() !== CORE_FILENAME) continue
    if (!(await isOfficialCoreShape(target))) continue
    return target
  }
  return null
}

async function isOfficialCoreShape(path: string): Promise<boolean> {
  try {
    await access(path)
    const source = await readFile(path, 'utf8')
    return source.includes('Live2DCubismCore') && source.includes('Cubism Core')
  } catch {
    return false
  }
}

function errorResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
