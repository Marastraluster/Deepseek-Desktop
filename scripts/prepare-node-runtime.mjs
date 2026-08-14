import { createHash } from 'node:crypto'
import { createWriteStream, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(root, 'resources', 'node', 'checksums.json')

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function resolveNodeRuntimeArchive(platform = process.platform, arch = process.arch) {
  const extension = platform === 'win32' ? 'zip' : platform === 'darwin' ? 'tar.gz' : 'tar.xz'
  const distributionPlatform = platform === 'win32' ? 'win' : platform
  const supported = (platform === 'win32' && arch === 'x64')
    || (platform === 'darwin' && (arch === 'x64' || arch === 'arm64'))
    || (platform === 'linux' && arch === 'x64')
  if (!supported) throw new Error(`unsupported release runtime: ${platform}-${arch}`)
  return `node-v24.18.0-${distributionPlatform}-${arch}.${extension}`
}

export function resolveArchiveExtractor(platform = process.platform) {
  return platform === 'win32' ? 'tar.exe' : 'tar'
}

export async function prepareNodeRuntime() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const archiveName = resolveNodeRuntimeArchive()
  const entry = manifest.archives?.[archiveName]
  if (entry === undefined || typeof entry.sha256 !== 'string' || !Array.isArray(entry.urls)) {
    throw new Error(`invalid Node runtime manifest at ${manifestPath}`)
  }

  const cacheDirectory = join(root, '.cache', 'node-runtime')
  const archive = join(cacheDirectory, archiveName)
  const stageDirectory = join(root, 'resources', 'node')
  if (!existsSync(archive) || sha256(archive) !== entry.sha256) {
    await downloadArchive(entry.urls, archive)
  }
  if (sha256(archive) !== entry.sha256) {
    throw new Error(`Node archive checksum mismatch for ${archiveName}`)
  }

  const extractDirectory = mkdtempSync(join(tmpdir(), 'deepseek-node-'))
  try {
    execFileSync(resolveArchiveExtractor(), ['-xf', archive, '-C', extractDirectory], { stdio: 'inherit' })
    const rootName = archiveName.replace(/\.(zip|tar\.gz|tar\.xz)$/, '')
    const extracted = readdirSync(extractDirectory, { withFileTypes: true })
      .find(entry => entry.isDirectory() && entry.name === rootName)
    if (extracted === undefined) throw new Error(`Node archive has no ${rootName} root directory`)

    rmSync(stageDirectory, { recursive: true, force: true })
    cpSync(join(extractDirectory, extracted.name), stageDirectory, { recursive: true })
    writeFileSync(join(stageDirectory, 'checksums.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    const executable = process.platform === 'win32'
      ? join(stageDirectory, 'node.exe')
      : join(stageDirectory, 'bin', 'node')
    const result = execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim()
    if (result !== `v${manifest.version}`) throw new Error(`staged Node version mismatch: ${result}`)
  } finally {
    rmSync(extractDirectory, { recursive: true, force: true })
  }
}

async function downloadArchive(urls, archive) {
  mkdirSync(dirname(archive), { recursive: true })
  rmSync(archive, { force: true })
  let lastError
  for (const url of urls) {
    const temporary = `${archive}.${process.pid}.partial`
    try {
      const response = await fetch(url)
      if (!response.ok || response.body === null) throw new Error(`HTTP ${response.status}`)
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary))
      renameSync(temporary, archive)
      return
    } catch (error) {
      rmSync(temporary, { force: true })
      lastError = error
    }
  }
  throw new Error(`could not download ${archiveName}: ${String(lastError)}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareNodeRuntime()
}
