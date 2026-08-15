import { expect, it } from 'vitest'
import { restoreDesktopWallpaper } from '../../packages/dsh-transparent-ui/src/client/desktop-wallpaper.ts'

it('migrates the selected desktop wallpaper into the upstream plugin layer', async () => {
  const changes: string[] = []

  await restoreDesktopWallpaper({
    assetUrl: async (key) => ({ ok: true, assetUrl: `deepseek-appearance://background/${key}` }),
  }, {
    setBackground: (value) => changes.push(`background:${value}`),
    setWallpaper: (value) => changes.push(`wallpaper:${value}`),
  }, JSON.stringify({ backgroundAsset: 'background.png', surfaceOpacity: 75 }))

  expect(changes).toEqual([
    'background:wallpaper',
    'wallpaper:deepseek-appearance://background/background.png',
  ])
})

it('uses a migrated background file when the development profile has no prior setting', async () => {
  const changes: string[] = []

  await restoreDesktopWallpaper({
    assetUrl: async (key) => key === 'background.png'
      ? { ok: true, assetUrl: 'deepseek-appearance://background/background.png' }
      : { ok: false, reason: 'missing' },
  }, {
    setBackground: (value) => changes.push(`background:${value}`),
    setWallpaper: (value) => changes.push(`wallpaper:${value}`),
  }, null)

  expect(changes).toEqual([
    'background:wallpaper',
    'wallpaper:deepseek-appearance://background/background.png',
  ])
})
