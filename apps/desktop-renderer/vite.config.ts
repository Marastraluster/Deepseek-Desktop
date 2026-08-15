import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const harness = (relative: string): string => fileURLToPath(
  new URL(`../../vendor/deepseek-harness/${relative}`, import.meta.url),
)

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
  },
  plugins: [react()],
  build: {
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      { find: /^node:module$/, replacement: harness('apps/web/src/node-module-stub.ts') },
      { find: /^@deepseek-ai\/dsh-client-web$/, replacement: harness('packages/client/web/src/boot.tsx') },
      { find: /^@deepseek-ai\/dsh-client-web-react$/, replacement: harness('packages/client/web-react/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-ui-slots$/, replacement: harness('packages/client/ui-slots/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: harness('packages/client/ui-primitives/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-ui-attachment$/, replacement: harness('packages/client/ui-attachment/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-schema-form$/, replacement: harness('packages/client/schema-form/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-modules\/client$/, replacement: harness('packages/client/modules/src/client/index.ts') },
    ],
  },
  define: {
    'process.versions.node': '"0.0.0"',
    'process.execArgv': '[]',
    'process.env.CORDIS_SHARED': 'undefined',
  },
})
