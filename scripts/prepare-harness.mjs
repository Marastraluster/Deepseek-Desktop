import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const harnessDir = join(root, 'vendor', 'deepseek-harness')
const expectedCommit = '47f943859bef60e4160492346772ded9b24f765a'

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env })
}

function runPnpm(args, cwd) {
  const entrypoint = process.env.npm_execpath
  if (entrypoint === undefined || entrypoint === '') {
    throw new Error('pnpm entrypoint unavailable; run this script through pnpm harness:prepare')
  }
  run(process.execPath, [entrypoint, ...args], cwd)
}

if (!existsSync(join(harnessDir, 'package.json'))) {
  run('git', ['submodule', 'update', '--init', '--recursive', 'vendor/deepseek-harness'], root)
}
const indexLine = execFileSync('git', ['ls-files', '-s', '--', 'vendor/deepseek-harness'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const commit = indexLine === ''
  ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: harnessDir, encoding: 'utf8' }).trim()
  : indexLine.split(/\s+/)[1]
if (commit !== expectedCommit) {
  throw new Error(`DeepSeek Harness commit mismatch: expected ${expectedCommit}, got ${commit}`)
}

runPnpm(['install', '--frozen-lockfile'], harnessDir)
runPnpm(['build'], harnessDir)

const packageJson = JSON.parse(readFileSync(join(harnessDir, 'package.json'), 'utf8'))
const resources = join(root, 'resources')
mkdirSync(resources, { recursive: true })
writeFileSync(join(resources, 'build-identity.json'), `${JSON.stringify({
  harnessCommit: commit,
  packageVersion: packageJson.version,
  preparedAt: new Date().toISOString(),
}, null, 2)}\n`)
