import type { DshWindow } from '@deepseek-ai/dsh-client-modules/client'
import type { DesktopHarnessBridge } from '@deepseek-desktop/ipc-client'

declare global {
  interface Window extends DshWindow {
    desktopHarness: DesktopHarnessBridge
    desktopAppearance: {
      selectBackground(): Promise<{ ok: true; assetKey: string; assetUrl: string } | { ok: false; reason: string }>
      removeBackground(assetKey: string): Promise<{ ok: true } | { ok: false; reason: string }>
      assetUrl(assetKey: string): Promise<{ ok: true; assetUrl: string } | { ok: false; reason: string }>
    }
  }
}

export {}
