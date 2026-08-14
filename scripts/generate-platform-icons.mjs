import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const icoSource = join(root, 'resources', 'icons', 'DeepSeek_AppleStyle.ico')
const pngSource = join(root, 'resources', 'icons', 'DeepSeek_AppleStyle.png')
const output = join(root, 'resources', 'generated-icons')

export function resolvePlatformIconSource(platform = process.platform) {
  return platform === 'win32' ? icoSource : pngSource
}

export function generatePlatformIcons(platform = process.platform) {
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  const source = resolvePlatformIconSource(platform)
  if (platform === 'win32') {
    cpSync(source, join(output, 'icon.ico'))
    return
  }
  if (platform === 'darwin') return generateMacIcons(source)
  if (platform === 'linux') return generateLinuxIcons(source)
  throw new Error(`unsupported icon platform: ${platform}`)
}

function generateMacIcons(source) {
  const iconset = join(output, 'icon.iconset')
  mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    writeMacPng(size, join(iconset, `icon_${size}x${size}.png`))
    writeMacPng(size * 2, join(iconset, `icon_${size}x${size}@2x.png`))
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(output, 'icon.icns')], { stdio: 'inherit' })
}

function writeMacPng(size, destination) {
  execFileSync('sips', ['-z', String(size), String(size), source, '--out', destination], { stdio: 'inherit' })
}

function generateLinuxIcons(source) {
  const directory = join(output, 'linux')
  mkdirSync(directory)
  for (const size of [16, 32, 64, 128, 256, 512]) {
    execFileSync('convert', [source, '-resize', `${size}x${size}`, join(directory, `${size}x${size}.png`)], { stdio: 'inherit' })
  }
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  generatePlatformIcons()
}
