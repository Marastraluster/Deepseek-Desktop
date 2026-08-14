import type { DshWindow } from '@deepseek-ai/dsh-client-modules/client'
import type { DesktopHarnessBridge } from '@deepseek-desktop/ipc-client'

declare global {
  interface Window extends DshWindow {
    desktopHarness: DesktopHarnessBridge
  }
}

export {}
