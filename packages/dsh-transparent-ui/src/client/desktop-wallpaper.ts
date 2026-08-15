export interface DesktopAppearanceBridge {
  assetUrl(key: string): Promise<{ ok: true; assetUrl: string } | { ok: false; reason: string }>
}

export interface WallpaperLayer {
  setBackground(value: 'wallpaper'): void
  setWallpaper(value: string): void
}

const BACKGROUND_KEY = /^background\.(?:jpg|jpeg|png|webp|gif)$/
const BACKGROUND_CANDIDATES = ['background.png', 'background.jpg', 'background.jpeg', 'background.webp', 'background.gif']

export async function restoreDesktopWallpaper(
  bridge: DesktopAppearanceBridge | undefined,
  layer: WallpaperLayer,
  rawSettings: string | null,
): Promise<void> {
  if (bridge === undefined) return
  try {
    const settings = rawSettings === null ? undefined : JSON.parse(rawSettings) as { backgroundAsset?: unknown }
    const preferred = typeof settings?.backgroundAsset === 'string' && BACKGROUND_KEY.test(settings.backgroundAsset)
      ? [settings.backgroundAsset]
      : BACKGROUND_CANDIDATES
    for (const key of preferred) {
      const result = await bridge.assetUrl(key)
      if (!result.ok) continue
      layer.setBackground('wallpaper')
      layer.setWallpaper(result.assetUrl)
      return
    }
  } catch {
    // A stale desktop setting must not prevent the upstream plugin from booting.
  }
}
