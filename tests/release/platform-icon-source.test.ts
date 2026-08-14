import { describe, expect, it } from 'vitest'
import { resolvePlatformIconSource } from '../../scripts/generate-platform-icons.mjs'

describe('platform icon sources', () => {
  it('uses the native ICO source only on Windows', () => {
    expect(resolvePlatformIconSource('win32')).toMatch(/DeepSeek_AppleStyle\.ico$/)
    expect(resolvePlatformIconSource('darwin')).toMatch(/DeepSeek_AppleStyle\.png$/)
    expect(resolvePlatformIconSource('linux')).toMatch(/DeepSeek_AppleStyle\.png$/)
  })
})
