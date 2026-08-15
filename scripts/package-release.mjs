import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { generatePlatformIcons } from './generate-platform-icons.mjs'
import { prepareNodeRuntime } from './prepare-node-runtime.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const resources = join(root, 'resources')

export async function stageReleaseInputs() {
  runPnpm(['build'])
  await prepareNodeRuntime()
  generatePlatformIcons()
  stageHost()
  stageNotices()
}

function stageHost() {
  const target = join(resources, 'host')
  rmSync(target, { recursive: true, force: true })
  runPnpm(['--ignore-scripts', '--config.inject-workspace-packages=true', '--config.node-linker=hoisted', '--filter', '@deepseek-desktop/host', 'deploy', '--prod', target])

  copyDirectory(join(root, 'vendor', 'deepseek-harness', 'packages', 'host', 'apiproxy'), join(target, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy'))
  const harnessRoot = join(target, 'vendor', 'deepseek-harness')
  copyFile(join(root, 'vendor', 'deepseek-harness', 'packages', 'bundle', 'base', 'cordis.patch.yml'), join(harnessRoot, 'packages', 'bundle', 'base', 'cordis.patch.yml'))
  copyFile(join(root, 'vendor', 'deepseek-harness', 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), join(harnessRoot, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'))
  copyDirectory(join(root, 'vendor', 'deepseek-harness', 'apps', 'cli', 'config', 'agent-presets'), join(harnessRoot, 'apps', 'cli', 'config', 'agent-presets'))
  if (!existsSync(join(target, 'dist', 'main.js'))) throw new Error('deployed desktop Host is missing dist/main.js')
  materializeExternalSymlinks(target)
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

function copyDirectory(source, target) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, {
    recursive: true,
    filter: (path) => !['.cache', 'node_modules'].includes(basename(path)),
  })
}

function assertInternalSymlinks(directory, root = directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = lstatSync(path)
    if (metadata.isSymbolicLink()) {
      const target = realpathSync(path)
      if (!isWithin(root, target)) throw new Error(`release Host contains external symlink: ${path}`)
      continue
    }
    if (entry.isDirectory()) assertInternalSymlinks(path, root)
  }
}

function materializeExternalSymlinks(directory, root = directory, materialized = new Map()) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = lstatSync(path)
    if (metadata.isSymbolicLink()) {
      const target = realpathSync(path)
      if (isWithin(root, target)) continue
      rmSync(path, { recursive: true, force: true })
      const existing = materialized.get(target)
      if (existing !== undefined) {
        symlinkSync(existing, path, statSync(existing).isDirectory() ? 'junction' : 'file')
        continue
      }
      materialized.set(target, path)
      cpSync(target, path, { recursive: true, dereference: false })
      materializeExternalSymlinks(path, root, materialized)
      continue
    }
    if (entry.isDirectory()) materializeExternalSymlinks(path, root, materialized)
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

function parseBuildTarget(argv) {
  const requested = [
    ['--win', 'win'],
    ['--mac', 'mac'],
    ['--linux', 'linux'],
  ].filter(([flag]) => argv.includes(flag))
  if (requested.length !== 1) throw new Error('select exactly one of --win, --mac, or --linux')
  const [flag, target] = requested[0]
  const index = argv.indexOf(flag)
  const artifactTargets = argv.slice(index + 1).filter(value => !value.startsWith('--'))
  return { target, artifactTargets }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  await stageReleaseInputs()
  if (!argv.includes('--stage-only')) {
    const { target, artifactTargets } = parseBuildTarget(argv)
    runPnpm(['exec', 'electron-builder', '--config', 'electron-builder.yml', '--publish', 'never', `--${target}`, ...artifactTargets])
  }
}
