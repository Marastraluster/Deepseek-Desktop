import { describe, expect, it } from 'vitest'
import { createMacIconArguments, resolvePlatformIconSource } from '../../scripts/generate-platform-icons.mjs'

describe('platform icon sources', () => {
  it('uses the native ICO source only on Windows', () => {
    expect(resolvePlatformIconSource('win32')).toMatch(/DeepSeek_AppleStyle\.ico$/)
    expect(resolvePlatformIconSource('darwin')).toMatch(/DeepSeek_AppleStyle\.png$/)
    expect(resolvePlatformIconSource('linux')).toMatch(/DeepSeek_AppleStyle\.png$/)
  })

  it('passes the selected PNG path to macOS image conversion', () => {
    expect(createMacIconArguments('/icons/DeepSeek_AppleStyle.png', 512, '/out/icon.png')).toEqual([
      '-z', '512', '512', '/icons/DeepSeek_AppleStyle.png', '--out', '/out/icon.png',
    ])
  })
})
