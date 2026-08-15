import { describe, expect, it, vi } from 'vitest'
import { hideWindowOnClose, shouldKeepProcessAlive } from '../../apps/desktop-main/src/lifecycle/background-mode.ts'

describe('background mode lifecycle', () => {
  it('hides an ordinary close and keeps the process alive', () => {
    const event = { preventDefault: vi.fn() }
    const window = { hide: vi.fn(), isMinimized: () => false, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    expect(hideWindowOnClose(event, window, false)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()
    expect(shouldKeepProcessAlive(false)).toBe(true)
  })
})
