import { beforeEach, expect, it, vi } from 'vitest'
import { AquaLayer } from '../../packages/dsh-transparent-ui/src/client/theme-layer.ts'
import * as themeLayer from '../../packages/dsh-transparent-ui/src/client/theme-layer.ts'

function createStorage(values: Record<string, string>): Storage {
  const entries = new Map(Object.entries(values))
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage({
    'dsh.ui-aqua.enabled': 'false',
    'dsh.ui-aqua.mode': 'mica',
  }))
  vi.stubGlobal('document', {
    documentElement: {
      removeAttribute: () => undefined,
    },
    querySelectorAll: () => [],
  })
})

it('restores the saved Mica mode when the desktop renderer starts', () => {
  const ctx = {
    effect: () => undefined,
    theme: {
      getTheme: () => ({ active: { colorScheme: 'light' } }),
    },
  }

  const layer = new AquaLayer(ctx as never)

  expect(layer.getSettings().mode).toBe('mica')
})

it('keeps Mica layout surfaces transparent while compatibility mode supplies generic glass', () => {
  const select = (themeLayer as Record<string, unknown>).selectAquaTokenOverrides

  expect(select).toBeTypeOf('function')
  if (typeof select !== 'function') return

  const mica = select('mica') as Record<string, { light: string }>
  const compat = select('compat') as Record<string, { light: string }>

  expect(mica['--dsw-alias-bg-base'].light).toBe('transparent')
  expect(mica['--dsw-specific-sidebar-fill'].light).toBe('transparent')
  expect(compat['--dsw-alias-bg-base'].light).toBe('transparent')
  expect(compat['--dsw-specific-sidebar-fill'].light).toBe('rgba(255, 255, 255, 0.34)')
})
