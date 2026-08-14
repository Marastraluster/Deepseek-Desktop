import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserWindowConstructorOptions } from 'electron'

export type NavigationDecision = 'allow' | 'external' | 'deny'

export function createWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: !process.env.DSH_DESKTOP_RELEASE,
    },
  }
}

export function resolveExternalNavigation(
  rawUrl: string,
  allowedFileRoot = 'D:\\app',
): NavigationDecision {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return 'deny'
  }

  if (url.protocol === 'https:') return 'external'
  if (url.protocol !== 'file:') return 'deny'

  let target: string
  try {
    target = resolve(fileURLToPath(url))
  } catch {
    return 'deny'
  }
  const root = resolve(allowedFileRoot)
  return target === root || target.startsWith(`${root}${sep}`) ? 'allow' : 'deny'
}
