const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')

const API_PROXY_PACKAGE = '@deepseek-ai/dsh-host-apiproxy'

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
  assertPackagedHostRuntime(context.appOutDir)
}

module.exports = verifyPackagedHost
module.exports.assertPackagedHostRuntime = assertPackagedHostRuntime

if (require.main === module) {
  try {
    assertPackagedHostRuntime(process.argv[2] ?? '')
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
