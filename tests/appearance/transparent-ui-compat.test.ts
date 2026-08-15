/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest'
import { AquaLayer } from '../../packages/dsh-transparent-ui/src/client/theme-layer.ts'

const cleanup: Array<() => void> = []

afterEach(() => {
  while (cleanup.length > 0) cleanup.pop()?.()
  localStorage.clear()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-dsh-aqua')
  document.documentElement.removeAttribute('data-dsh-compat')
  document.documentElement.removeAttribute('data-dsh-float')
})

it('starts in native wallpaper compatibility mode without Aqua palette tokens', () => {
  const overrideTokens = vi.fn(() => () => {})
  const layer = new AquaLayer({
    effect: (callback: () => () => void) => { cleanup.push(callback()) },
    on: () => () => {},
    theme: {
      getTheme: () => ({ active: { colorScheme: 'light' } }),
      overrideTokens,
    },
  } as any)

  expect(layer.getSettings()).toMatchObject({ mode: 'compat', background: 'wallpaper', whale: false })
  expect(document.documentElement.hasAttribute('data-dsh-compat')).toBe(true)
  const tokens = overrideTokens.mock.calls[0]?.[1] as Record<string, { light: string; dark: string }>
  expect(tokens['--dsw-alias-bg-base']).toEqual({ light: 'transparent', dark: 'transparent' })
  expect(tokens['--dsw-font-family']).toBeUndefined()
  expect(tokens['--dsw-alias-brand-primary']).toBeUndefined()
})

it('stamps the Mica layout seams and keeps the base transparent for wallpaper', () => {
  document.body.innerHTML = `
    <div class="frame-shell" data-sidebar-collapsed>
      <div class="sidebarCol-shell"><div class="root-sidebar"></div></div>
    </div>
  `
  localStorage.setItem('dsh.ui-aqua.mode', 'mica')
  const overrideTokens = vi.fn(() => () => {})

  new AquaLayer({
    effect: (callback: () => () => void) => { cleanup.push(callback()) },
    on: () => () => {},
    theme: {
      getTheme: () => ({ active: { colorScheme: 'light' } }),
      overrideTokens,
    },
  } as any)

  expect(document.querySelector('.frame-shell')?.hasAttribute('data-dsh-frame')).toBe(true)
  expect(document.querySelector('.root-sidebar')?.hasAttribute('data-dsh-sidebar-root')).toBe(true)
  expect(document.documentElement.hasAttribute('data-dsh-float')).toBe(true)
  const tokens = overrideTokens.mock.calls[0]?.[1] as Record<string, { light: string; dark: string }>
  expect(tokens['--dsw-alias-bg-base']).toEqual({ light: 'transparent', dark: 'transparent' })
})
