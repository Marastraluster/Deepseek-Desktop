import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { configureDesktopProfile } from '../../apps/desktop-main/src/runtime/development-profile.ts'

it('uses an isolated identity and user-data directory for an unpackaged desktop run', () => {
  const setName = vi.fn()
  const setPath = vi.fn()

  configureDesktopProfile({ isPackaged: false, setName, setPath, getPath: () => 'C:\\Users\\marti\\AppData\\Roaming' })

  expect(setName).toHaveBeenCalledWith('DeepSeek Desktop Dev')
  expect(setPath).toHaveBeenCalledWith(
    'userData',
    join('C:\\Users\\marti\\AppData\\Roaming', 'DeepSeek Desktop Dev'),
  )
})

it('keeps the release identity unchanged for packaged builds', () => {
  const setName = vi.fn()
  const setPath = vi.fn()

  configureDesktopProfile({ isPackaged: true, setName, setPath, getPath: () => 'C:\\Users\\marti\\AppData\\Roaming' })

  expect(setName).toHaveBeenCalledWith('DeepSeek Desktop')
  expect(setPath).not.toHaveBeenCalled()
})
