export interface CloseEvent {
  preventDefault(): void
}

export interface BackgroundWindow {
  hide(): void
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
