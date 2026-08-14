import { describe, expect, it } from 'vitest'
import {
  createWindowOptions,
  resolveExternalNavigation,
} from '../../apps/desktop-main/src/security/navigation-policy.ts'

describe('Electron security policy', () => {
  it('creates a sandboxed renderer without Node integration', () => {
    expect(createWindowOptions('D:\\app\\preload.mjs').webPreferences).toMatchObject({
      preload: 'D:\\app\\preload.mjs',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    })
  })

  it('allows app content, externalizes HTTPS, and denies other schemes', () => {
    expect(resolveExternalNavigation('file:///D:/app/index.html')).toBe('allow')
    expect(resolveExternalNavigation('https://github.com/deepseek-ai')).toBe('external')
    expect(resolveExternalNavigation('javascript:alert(1)')).toBe('deny')
    expect(resolveExternalNavigation('file:///C:/Windows/System32/cmd.exe')).toBe('deny')
  })
})
