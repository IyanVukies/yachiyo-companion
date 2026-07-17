import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildRoot = resolve(projectRoot, 'build')
const source = await readFile(resolve(buildRoot, 'icon.svg'))
const sizes = [16, 24, 32, 48, 64, 128, 256]

await mkdir(buildRoot, { recursive: true })
const pngs = await Promise.all(
  sizes.map((size) =>
    sharp(source).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer()
  )
)
await writeFile(resolve(buildRoot, 'icon.png'), pngs.at(-1))
await writeFile(resolve(buildRoot, 'icon.ico'), await pngToIco(pngs))
