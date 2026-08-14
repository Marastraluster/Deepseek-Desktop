import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import renderer from './apps/desktop-renderer/vite.config.ts'

export default defineConfig({
  main: {
    build: {
      outDir: 'apps/desktop-main/dist/main',
      rollupOptions: {
        input: resolve('apps/desktop-main/src/main.ts'),
      },
    },
  },
  preload: {
    build: {
      outDir: 'apps/desktop-main/dist/preload',
      rollupOptions: {
        input: resolve('apps/desktop-main/src/preload.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'preload.cjs',
        },
      },
    },
  },
  renderer: {
    ...renderer,
    root: resolve('apps/desktop-renderer'),
    publicDir: resolve('apps/desktop-renderer/public'),
    build: {
      ...renderer.build,
      outDir: resolve('apps/desktop-renderer/dist'),
      rollupOptions: {
        ...renderer.build?.rollupOptions,
        input: resolve('apps/desktop-renderer/index.html'),
      },
    },
  },
})
