import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          launcher: resolve('src/preload/launcher.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          launcher: resolve('src/renderer/launcher.html')
        }
      }
    }
  }
})
