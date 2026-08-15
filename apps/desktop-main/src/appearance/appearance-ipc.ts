import { dialog, ipcMain, protocol, type BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import { removeBackground, storeBackground, validateBackgroundCandidate, appearanceDirectory, isSafeAssetKey } from './appearance-assets.ts'

export const APPEARANCE_SCHEME = 'deepseek-appearance'
const SELECT = 'desktop-appearance:select'
const REMOVE = 'desktop-appearance:remove'
const ASSET_URL = 'desktop-appearance:url'

export function backgroundMimeType(assetKey: string): string {
  switch (extname(assetKey).toLowerCase()) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.png': return 'image/png'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    default: return 'application/octet-stream'
  }
}

export function registerAppearanceProtocol(userData: string): void {
  protocol.handle(APPEARANCE_SCHEME, async (request) => {
    try {
      const parsed = new globalThis.URL(request.url)
      if (parsed.hostname !== 'background' || parsed.search || parsed.hash) throw new Error('invalid appearance URL')
      const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
      if (!isSafeAssetKey(key)) throw new Error('unsafe appearance asset key')
      if (process.env.ELECTRON_RENDERER_URL !== undefined) console.log('[desktop-appearance:protocol] serving', key)
      const data = await fs.readFile(join(appearanceDirectory(userData), key))
      return new Response(data, { headers: { 'Cache-Control': 'no-store', 'Content-Type': backgroundMimeType(key) } })
    } catch (error) {
      if (process.env.ELECTRON_RENDERER_URL !== undefined) console.error('[desktop-appearance:protocol] failed', error)
      return new Response(null, { status: 404 })
    }
  })
}

export function registerAppearanceIpc(window: BrowserWindow, userData: string): () => void {
  const owned = (event: Electron.IpcMainInvokeEvent) => event.sender.id === window.webContents.id
  const debug = (...values: unknown[]): void => {
    if (process.env.ELECTRON_RENDERER_URL !== undefined) console.log('[desktop-appearance:ipc]', ...values)
  }
  const select = async (event: Electron.IpcMainInvokeEvent) => {
    if (!owned(event)) return { ok: false as const, reason: 'unauthorized' }
    const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] })
    if (result.canceled || result.filePaths[0] === undefined) {
      debug('selection cancelled')
      return { ok: false as const, reason: 'cancelled' }
    }
    const source = result.filePaths[0]
    const stat = await fs.stat(source)
    const valid = validateBackgroundCandidate(source, stat.size)
    if (!valid.ok) return valid
    const assetKey = await storeBackground(userData, source, valid.extension)
    debug('stored', { assetKey, bytes: stat.size })
    return { ok: true as const, assetKey, assetUrl: `${APPEARANCE_SCHEME}://background/${assetKey}` }
  }
  const remove = async (event: Electron.IpcMainInvokeEvent, key: string) => {
    if (!owned(event) || !isSafeAssetKey(key)) return { ok: false as const, reason: 'invalid-asset' }
    await removeBackground(userData, key)
    return { ok: true as const }
  }
  const assetUrl = async (event: Electron.IpcMainInvokeEvent, key: string) => {
    if (!owned(event) || !isSafeAssetKey(key)) return { ok: false as const, reason: 'invalid-asset' }
    try { await fs.access(join(appearanceDirectory(userData), key)) } catch {
      debug('asset missing', key)
      return { ok: false as const, reason: 'missing' }
    }
    debug('resolved', key)
    return { ok: true as const, assetUrl: `${APPEARANCE_SCHEME}://background/${key}` }
  }
  ipcMain.handle(SELECT, select); ipcMain.handle(REMOVE, remove); ipcMain.handle(ASSET_URL, assetUrl)
  return () => { ipcMain.removeHandler(SELECT); ipcMain.removeHandler(REMOVE); ipcMain.removeHandler(ASSET_URL) }
}
