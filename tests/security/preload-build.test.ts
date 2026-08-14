import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('sandbox preload build', () => {
  it('emits a CommonJS preload that Electron sandbox can execute', () => {
    const source = readFileSync('apps/desktop-main/dist/preload/preload.cjs', 'utf8')

    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).toContain('contextBridge')
    expect(source).toContain('desktopHarness')
  })
})
