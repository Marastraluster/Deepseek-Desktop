import { describe, expect, it } from 'vitest'
import { resolveArchiveExtractor } from '../../scripts/prepare-node-runtime.mjs'

describe('Node runtime archive extraction', () => {
  it('uses the native tar command on macOS and Linux', () => {
    expect(resolveArchiveExtractor('win32')).toBe('tar.exe')
    expect(resolveArchiveExtractor('darwin')).toBe('tar')
    expect(resolveArchiveExtractor('linux')).toBe('tar')
  })
})
