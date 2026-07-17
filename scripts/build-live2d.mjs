import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = resolve(projectRoot, 'src/renderer/public/live2d')
const frameworkRoot = resolve(projectRoot, 'vendor/live2d-framework')

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

await build({
  entryPoints: [resolve(projectRoot, 'src/live2d-adapter/adapter.ts')],
  outfile: resolve(outputRoot, 'yachiyo-live2d-adapter.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome130'],
  minify: true,
  sourcemap: false,
  legalComments: 'eof',
  logLevel: 'info'
})

await cp(resolve(frameworkRoot, 'Shaders/WebGL'), resolve(outputRoot, 'WebGL'), {
  recursive: true
})
await cp(resolve(frameworkRoot, 'LICENSE.md'), resolve(outputRoot, 'CUBISM-FRAMEWORK-LICENSE.md'))
