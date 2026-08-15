export interface CloseEvent {
  preventDefault(): void
}

export interface BackgroundWindow {
  hide(): void
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function hideWindowOnClose(
  event: CloseEvent,
  window: BackgroundWindow,
  explicitQuit: boolean
): boolean {
  if (explicitQuit) {
    return false
  }

  event.preventDefault()
  window.hide()
  return true
}

export function shouldKeepProcessAlive(explicitQuit: boolean): boolean {
  return !explicitQuit
}

export function showWindow(window: BackgroundWindow | undefined): void {
  if (window === undefined) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}
