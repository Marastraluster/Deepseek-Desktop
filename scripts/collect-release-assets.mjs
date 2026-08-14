import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

const source = resolve(process.argv[2] ?? 'dist')
const output = resolve(process.argv[3] ?? 'release-assets')
const allowed = new Set(['.exe', '.dmg', '.zip', '.AppImage', '.cer'])

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
const files = readdirSync(source, { withFileTypes: true })
  .filter(entry => entry.isFile() && allowed.has(extensionOf(entry.name)))
  .map(entry => entry.name)
  .sort()
if (files.length === 0) throw new Error(`no release artifacts found in ${source}`)

const checksums = []
for (const name of files) {
  const input = join(source, name)
  const target = join(output, name)
  copyFileSync(input, target)
  const hash = createHash('sha256').update(readFileSync(input)).digest('hex')
  checksums.push(`${hash}  ${name}`)
}
writeFileSync(join(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`)

function extensionOf(name) {
  if (name.endsWith('.AppImage')) return '.AppImage'
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index)
}
