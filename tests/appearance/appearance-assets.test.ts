import { expect, it } from 'vitest'
import { isSafeAssetKey, validateBackgroundCandidate } from '../../apps/desktop-main/src/appearance/appearance-assets.ts'

it('validates supported local image candidates', () => {
  expect(validateBackgroundCandidate('wallpaper.png', 12 * 1024 * 1024)).toEqual({ ok: true, extension: '.png' })
  expect(validateBackgroundCandidate('wallpaper.svg', 1)).toEqual({ ok: false, reason: 'unsupported-type' })
  expect(validateBackgroundCandidate('wallpaper.jpg', 12 * 1024 * 1024 + 1)).toEqual({ ok: false, reason: 'too-large' })
  expect(isSafeAssetKey('background.webp')).toBe(true)
  expect(isSafeAssetKey('../settings.yaml')).toBe(false)
})
