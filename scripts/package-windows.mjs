import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareNodeRuntime } from './prepare-node-runtime.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const resources = join(root, 'resources')

export async function stageReleaseInputs() {
  runPnpm(['build'])
  await prepareNodeRuntime()
  stageHost()
  stageNotices()
}

function stageHost() {
  const target = join(resources, 'host')
  rmSync(target, { recursive: true, force: true })
  runPnpm(['--filter', '@deepseek-desktop/host', 'deploy', '--prod', target])

  const harnessRoot = join(target, 'vendor', 'deepseek-harness')
  copyFile(join(root, 'vendor', 'deepseek-harness', 'packages', 'bundle', 'base', 'cordis.patch.yml'), join(harnessRoot, 'packages', 'bundle', 'base', 'cordis.patch.yml'))
  copyFile(join(root, 'vendor', 'deepseek-harness', 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), join(harnessRoot, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'))
  if (!existsSync(join(target, 'dist', 'main.js'))) throw new Error('deployed desktop Host is missing dist/main.js')
  assertInternalSymlinks(target)
}

function stageNotices() {
  const harnessNotices = readFileSync(join(root, 'vendor', 'deepseek-harness', 'THIRD_PARTY_NOTICES.md'), 'utf8')
  const harnessLicense = readFileSync(join(root, 'vendor', 'deepseek-harness', 'LICENSE'), 'utf8')
  const nodeLicense = readFileSync(join(resources, 'node', 'LICENSE'), 'utf8')
  writeFileSync(join(resources, 'THIRD-PARTY-NOTICES.txt'), [
    'DeepSeek Desktop release notices',
    '',
    'DeepSeek Harness license',
    harnessLicense.trim(),
    '',
    'Node.js license',
    nodeLicense.trim(),
    '',
    harnessNotices.trim(),
    '',
  ].join('\n'))
}

function copyFile(source, target) {
  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target)
}

function assertInternalSymlinks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = lstatSync(path)
    if (metadata.isSymbolicLink()) {
      const target = realpathSync(path)
      if (!isWithin(directory, target)) throw new Error(`release Host contains external symlink: ${path}`)
      continue
    }
    if (entry.isDirectory()) assertInternalSymlinks(path)
  }
}

function isWithin(directory, candidate) {
  const path = relative(directory, candidate)
  return path === '' || (!path.startsWith('..\\') && path !== '..' && !path.startsWith('../'))
}

function runPnpm(args) {
  const entrypoint = process.env.npm_execpath
  if (entrypoint === undefined || entrypoint === '') {
    execFileSync('pnpm.cmd', args, { cwd: root, stdio: 'inherit' })
    return
  }
  execFileSync(process.execPath, [entrypoint, ...args], { cwd: root, stdio: 'inherit', env: process.env })
}

function parseTargets(argv) {
  const index = argv.indexOf('--targets')
  if (index === -1) return ['nsis', 'portable']
  const value = argv[index + 1]
  if (value === undefined || !/^(nsis|portable)(,(nsis|portable))?$/.test(value)) {
    throw new Error('--targets must be a comma-separated list of nsis and portable')
  }
  return value.split(',')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stageOnly = process.argv.includes('--stage-only')
  await stageReleaseInputs()
  if (!stageOnly) runPnpm(['exec', 'electron-builder', '--config', 'electron-builder.yml', '--win', ...parseTargets(process.argv.slice(2))])
}
