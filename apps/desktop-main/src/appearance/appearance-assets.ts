import { createReadStream, promises as fs } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

export const MAX_BACKGROUND_BYTES = 12 * 1024 * 1024
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

export type BackgroundValidation =
  | { ok: true; extension: string }
  | { ok: false; reason: 'unsupported-type' | 'too-large' | 'invalid-name' }

export function validateBackgroundCandidate(name: string, size: number): BackgroundValidation {
  const extension = extname(name).toLowerCase()
  if (!basename(name).includes('.') || !EXTENSIONS.has(extension)) return { ok: false, reason: 'unsupported-type' }
  if (!Number.isFinite(size) || size > MAX_BACKGROUND_BYTES) return { ok: false, reason: 'too-large' }
  return { ok: true, extension }
}

export function isSafeAssetKey(key: string): boolean {
  return /^background\.(?:jpg|jpeg|png|webp|gif)$/.test(key)
}

export function appearanceDirectory(userData: string): string {
  return join(resolve(userData), 'appearance')
}

export async function storeBackground(userData: string, sourcePath: string, extension: string): Promise<string> {
  const directory = appearanceDirectory(userData)
  await fs.mkdir(directory, { recursive: true })
  const assetKey = `background${extension}`
  const target = join(directory, assetKey)
  const temporary = `${target}.tmp-${process.pid}`
  await fs.copyFile(sourcePath, temporary)
  await fs.rename(temporary, target)
  return assetKey
}

export async function removeBackground(userData: string, assetKey: string): Promise<void> {
  if (!isSafeAssetKey(assetKey)) throw new Error('unsafe appearance asset key')
  await fs.rm(join(appearanceDirectory(userData), assetKey), { force: true })
}

export function openBackground(userData: string, assetKey: string) {
  if (!isSafeAssetKey(assetKey)) throw new Error('unsafe appearance asset key')
  return createReadStream(join(appearanceDirectory(userData), assetKey))
}
