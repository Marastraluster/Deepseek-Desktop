import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { composeDesktopEntries } from '../../desktop-host/src/compose-host.ts'

interface WebBootEntry {
  id: string
  url: string
  rev: string
  inject?: string[]
  immediately?: boolean
}

interface WebBootGraph {
  rev: string
  entries: WebBootEntry[]
}

interface PrepareRendererPluginsOptions {
  root: string
  outputDir: string
}

interface ClientDeclaration {
  platform?: unknown
  inject?: unknown
  immediately?: unknown
}

export function prepareRendererPlugins(options: PrepareRendererPluginsOptions): WebBootGraph {
  const root = resolve(options.root)
  const outputDir = resolve(options.outputDir)
  const hostManifest = join(root, 'apps', 'desktop-host', 'package.json')
  const require = createRequire(pathToFileURL(hostManifest))
  const rows: WebBootEntry[] = []
  const seen = new Set<string>()

  for (const entry of composeDesktopEntries(join(root, 'vendor', 'deepseek-harness'))) {
    if (entry.disabled === true || typeof entry.name !== 'string' || seen.has(entry.name)) continue
    let packagePath: string
    try {
      packagePath = require.resolve(`${entry.name}/package.json`)
    } catch {
      continue
    }
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>
    const dsh = asRecord(manifest.dsh)
    const client = asRecord(dsh?.client) as ClientDeclaration | undefined
    if (client?.platform !== 'web') continue
    const inject = readStringArray(entry.name, 'inject', client.inject)
    const immediately = readBoolean(entry.name, 'immediately', client.immediately)
    const clientPath = resolveClientPath(entry.name, packagePath, manifest.exports)
    const source = readFileSync(clientPath)
    const rev = shortHash(source)
    const url = `./plugins/${entry.name}/client.js?rev=${rev}`
    const target = join(outputDir, url.replace(/^\.\//, '').replace(/\?.*$/, ''))
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(clientPath, target)
    const sourceMap = `${clientPath}.map`
    try {
      copyFileSync(sourceMap, `${target}.map`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    rows.push({
      id: entry.name,
      url,
      rev,
      ...(inject === undefined ? {} : { inject }),
      ...(immediately ? { immediately: true } : {}),
    })
    seen.add(entry.name)
  }

  const graph = { rev: shortHash(JSON.stringify(rows)), entries: rows }
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'boot-manifest.json'), `${JSON.stringify(graph, null, 2)}\n`)
  return graph
}

function resolveClientPath(packageName: string, packagePath: string, exportsField: unknown): string {
  const exportsRecord = asRecord(exportsField)
  const clientExport = exportsRecord?.['./client']
  const relative = typeof clientExport === 'string'
    ? clientExport
    : asRecord(clientExport)?.default
  if (typeof relative !== 'string') {
    throw new Error(`${packageName} declares dsh.client but exports no client bundle`)
  }
  return join(dirname(packagePath), relative)
}

function readStringArray(packageName: string, field: string, value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${packageName} dsh.client.${field} must be a string array`)
  }
  return [...value]
}

function readBoolean(packageName: string, field: string, value: unknown): boolean {
  if (value === undefined) return false
  if (typeof value !== 'boolean') throw new Error(`${packageName} dsh.client.${field} must be boolean`)
  return value
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function shortHash(value: string | Buffer): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 12)
}

const scriptPath = fileURLToPath(import.meta.url)
if (process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath) {
  const rendererRoot = resolve(dirname(scriptPath), '..')
  prepareRendererPlugins({
    root: resolve(rendererRoot, '..', '..'),
    outputDir: join(rendererRoot, 'public'),
  })
}
