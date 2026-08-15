import { expect, it } from 'vitest'
import { backgroundMimeType } from '../../apps/desktop-main/src/appearance/appearance-ipc.ts'

it('returns an image content type for each supported appearance asset', () => {
  expect(backgroundMimeType('background.png')).toBe('image/png')
  expect(backgroundMimeType('background.jpg')).toBe('image/jpeg')
  expect(backgroundMimeType('background.webp')).toBe('image/webp')
  expect(backgroundMimeType('background.gif')).toBe('image/gif')
})
