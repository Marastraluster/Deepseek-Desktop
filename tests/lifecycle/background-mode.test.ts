import { describe, expect, it, vi } from 'vitest'
import { hideWindowOnClose, shouldKeepProcessAlive, showWindow } from '../../apps/desktop-main/src/lifecycle/background-mode.ts'

describe('background mode lifecycle', () => {
  it('hides an ordinary close and keeps the process alive', () => {
    const event = { preventDefault: vi.fn() }
    const window = { hide: vi.fn(), isMinimized: () => false, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    expect(hideWindowOnClose(event, window, false)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()
    expect(shouldKeepProcessAlive(false)).toBe(true)
  })

  it('allows explicit quit and restores a minimized window', () => {
    const event = { preventDefault: vi.fn() }
    const window = { hide: vi.fn(), isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    expect(hideWindowOnClose(event, window, true)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(window.hide).not.toHaveBeenCalled()
    expect(shouldKeepProcessAlive(true)).toBe(false)
    showWindow(window)
    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('ignores a tray action when no main window exists', () => {
    expect(() => showWindow(undefined)).not.toThrow()
  })
})
