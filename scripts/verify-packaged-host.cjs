const { cpSync, existsSync, mkdirSync, rmSync } = require('node:fs')
const { basename, dirname, join, resolve } = require('node:path')

const API_PROXY_PACKAGE = '@deepseek-ai/dsh-host-apiproxy'
const API_PROXY_SOURCE = join(__dirname, '..', 'vendor', 'deepseek-harness', 'packages', 'host', 'apiproxy')
const AGENT_PRESETS_SOURCE = join(__dirname, '..', 'vendor', 'deepseek-harness', 'apps', 'cli', 'config', 'agent-presets')

function materializeApiProxyPackage(appOutDir) {
  const target = join(
    resolve(appOutDir),
    'resources',
    'host',
    'node_modules',
    '@deepseek-ai',
    'dsh-host-apiproxy',
  )

  if (!existsSync(API_PROXY_SOURCE)) {
    throw new Error(`release source is missing ${API_PROXY_PACKAGE}: ${API_PROXY_SOURCE}`)
  }

  rmSync(target, { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  cpSync(API_PROXY_SOURCE, target, {
    recursive: true,
    filter: (path) => !['.cache', 'node_modules'].includes(basename(path)),
  })
}

function materializeAgentPresets(appOutDir) {
  const target = join(
    resolve(appOutDir),
    'resources',
    'host',
    'vendor',
    'deepseek-harness',
    'apps',
    'cli',
    'config',
    'agent-presets',
  )

  if (!existsSync(AGENT_PRESETS_SOURCE)) {
    throw new Error(`release source is missing shipped agent presets: ${AGENT_PRESETS_SOURCE}`)
  }

  rmSync(target, { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  cpSync(AGENT_PRESETS_SOURCE, target, {
    recursive: true,
    filter: (path) => basename(path) !== '.cache',
  })
}

function assertPackagedHostRuntime(appOutDir) {
  const hostRoot = join(resolve(appOutDir), 'resources', 'host')
  const packageJson = join(
    hostRoot,
    'node_modules',
    '@deepseek-ai',
    'dsh-host-apiproxy',
    'package.json',
  )

  if (!existsSync(packageJson)) {
    throw new Error(`packaged Host is missing ${API_PROXY_PACKAGE}: ${packageJson}`)
  }

  const agentPresets = join(hostRoot, 'vendor', 'deepseek-harness', 'apps', 'cli', 'config', 'agent-presets')
  if (!existsSync(agentPresets)) {
    throw new Error(`packaged Host is missing shipped agent presets: ${agentPresets}`)
  }
}

async function verifyPackagedHost(context) {
  materializeApiProxyPackage(context.appOutDir)
  materializeAgentPresets(context.appOutDir)
  assertPackagedHostRuntime(context.appOutDir)
}

module.exports = verifyPackagedHost
module.exports.assertPackagedHostRuntime = assertPackagedHostRuntime
module.exports.materializeApiProxyPackage = materializeApiProxyPackage
module.exports.materializeAgentPresets = materializeAgentPresets

if (require.main === module) {
  try {
    assertPackagedHostRuntime(process.argv[2] ?? '')
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
