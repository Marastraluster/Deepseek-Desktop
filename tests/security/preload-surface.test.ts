import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('preload surface', () => {
  it('exposes only the frozen desktopHarness bridge', () => {
    const source = readFileSync('apps/desktop-main/src/preload.ts', 'utf8')
    expect(source).toContain("exposeInMainWorld('desktopHarness'")
    expect(source).toContain('Object.freeze')
    expect(source).not.toContain("exposeInMainWorld('ipcRenderer'")
    expect(source).not.toMatch(/\bnodeIntegration\b/)
    expect(source).not.toMatch(/from 'node:fs'/)
    expect(source).not.toMatch(/from 'node:child_process'/)
  })

  it('keeps MessagePort objects inside the isolated preload world', () => {
    const source = readFileSync('apps/desktop-main/src/preload.ts', 'utf8')
    expect(source).toContain('channel.port1.start()')
    expect(source).not.toContain('return channel.port1')
  })
})
