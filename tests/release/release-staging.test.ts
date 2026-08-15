import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')
const verificationScript = join(root, 'scripts', 'verify-packaged-host.cjs')
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('release staging', () => {
  it('declares Harness peer dependencies required by the packaged Host', () => {
    const host = JSON.parse(readFileSync(join(root, 'apps', 'desktop-host', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }

    for (const name of [
      '@deepseek-ai/dsh-anonymous-user-id',
      '@deepseek-ai/dsh-atomic-write',
      '@deepseek-ai/dsh-bash-local',
      '@deepseek-ai/dsh-code-runtime',
      '@deepseek-ai/dsh-compaction',
      '@deepseek-ai/dsh-fs',
      '@deepseek-ai/dsh-home-paths',
      '@deepseek-ai/dsh-invariants',
      '@deepseek-ai/dsh-launch-environment',
      '@deepseek-ai/dsh-output-retention',
      '@deepseek-ai/dsh-pwsh-local',
      '@deepseek-ai/dsh-sandbox',
      '@deepseek-ai/dsh-scope',
      '@deepseek-ai/dsh-session-telemetry',
      '@deepseek-ai/dsh-session-title-llm',
      '@deepseek-ai/dsh-shell',
      '@deepseek-ai/dsh-spill',
      '@deepseek-ai/dsh-subagent-in-process-driver',
      '@deepseek-ai/dsh-subprocess',
      '@deepseek-ai/dsh-timeout',
      '@deepseek-ai/dsh-workflow',
    ]) {
      expect(host.dependencies[name]).toBe('workspace:*')
    }
  })

  it('rejects a packaged Host without its API proxy runtime dependency', () => {
    const output = mkdtempSync(join(tmpdir(), 'deepseek-desktop-package-'))
    temporaryDirectories.push(output)

    const result = spawnSync(process.execPath, [verificationScript, output], { encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('packaged Host is missing @deepseek-ai/dsh-host-apiproxy')
  })

  it('accepts a packaged Host with its API proxy runtime dependency', () => {
    const output = mkdtempSync(join(tmpdir(), 'deepseek-desktop-package-'))
    temporaryDirectories.push(output)
    const packageJson = join(output, 'resources', 'host', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'package.json')
    mkdirSync(dirname(packageJson), { recursive: true })
    writeFileSync(packageJson, '{"name":"@deepseek-ai/dsh-host-apiproxy"}')
    mkdirSync(join(output, 'resources', 'host', 'vendor', 'deepseek-harness', 'apps', 'cli', 'config', 'agent-presets'), { recursive: true })

    const result = spawnSync(process.execPath, [verificationScript, output], { encoding: 'utf8' })

    expect(result.status).toBe(0)
  })

  it('rejects a packaged Host without its shipped agent presets', () => {
    const output = mkdtempSync(join(tmpdir(), 'deepseek-desktop-package-'))
    temporaryDirectories.push(output)
    const packageJson = join(output, 'resources', 'host', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'package.json')
    mkdirSync(dirname(packageJson), { recursive: true })
    writeFileSync(packageJson, '{"name":"@deepseek-ai/dsh-host-apiproxy"}')

    const result = spawnSync(process.execPath, [verificationScript, output], { encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('packaged Host is missing shipped agent presets')
  })

  it('pins a checksummed Node 24 runtime for every released platform', () => {
    const manifestPath = join(root, 'resources', 'node', 'checksums.json')
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      version?: string
      archives?: Record<string, { sha256?: string; urls?: unknown }>
    }

    const archive = manifest.archives?.['node-v24.18.0-win-x64.zip']
    expect(manifest.version).toBe('24.18.0')
    expect(archive?.sha256).toBe('0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821')
    expect(archive?.urls).toEqual(expect.arrayContaining([
      'https://nodejs.org/dist/v24.18.0/node-v24.18.0-win-x64.zip',
    ]))

    for (const name of [
      'node-v24.18.0-darwin-x64.tar.gz',
      'node-v24.18.0-darwin-arm64.tar.gz',
      'node-v24.18.0-linux-x64.tar.xz',
    ]) {
      expect(manifest.archives?.[name]?.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(manifest.archives?.[name]?.urls).toEqual(expect.arrayContaining([
        `https://nodejs.org/dist/v24.18.0/${name}`,
      ]))
    }
  })

  it('exposes native package commands and shared icon source', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')

    expect(pkg.scripts['prepare:release']).toBe('node scripts/package-release.mjs --stage-only')
    expect(pkg.scripts['dist:win']).toBe('node scripts/package-release.mjs --win nsis portable')
    expect(pkg.scripts['dist:portable']).toBe('node scripts/package-release.mjs --win portable')
    expect(pkg.scripts['dist:mac']).toBe('node scripts/package-release.mjs --mac dmg zip')
    expect(pkg.scripts['dist:linux']).toBe('node scripts/package-release.mjs --linux AppImage')
    expect(existsSync(join(root, 'resources', 'icons', 'DeepSeek_AppleStyle.ico'))).toBe(true)
    expect(workspace).not.toMatch(/injectWorkspacePackages:/)
    expect(workspace).toMatch(/'@deepseek-ai\/dsh-subprocess-local':\s*true/)
    expect(workspace).toMatch(/'@deepseek-ai\/dsh-subprocess-local@file:vendor\/deepseek-harness\/packages\/subprocess\/subprocess-local':\s*true/)
    expect(workspace).not.toMatch(/file:\/\/\/[A-Za-z]:\//)

    const stagingScript = readFileSync(join(root, 'scripts', 'package-release.mjs'), 'utf8')
    const builderConfig = readFileSync(join(root, 'electron-builder.yml'), 'utf8')
    expect(stagingScript).toMatch(/\['--ignore-scripts', '--config\.inject-workspace-packages=true', '--config\.node-linker=hoisted', '--filter', '@deepseek-desktop\/host', 'deploy', '--prod'/)
    expect(stagingScript).toMatch(/copyDirectory\(join\(root, 'vendor', 'deepseek-harness', 'packages', 'host', 'apiproxy'\), join\(target, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy'\)\)/)
    expect(builderConfig).toMatch(/from: resources\/icons\/DeepSeek_AppleStyle\.png\s*\n\s*to: tray-icon\.png/)
  })

  it('defines tag-triggered native release builds with Astraluster signing', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8')
    const signer = readFileSync(join(root, 'scripts', 'sign-windows-artifacts.ps1'), 'utf8')

    expect(workflow).toMatch(/windows-latest/)
    expect(workflow).not.toMatch(/macos-13/)
    expect(workflow).toMatch(/macos-14/)
    expect(workflow).toMatch(/ubuntu-latest/)
    expect(workflow).toMatch(/sign-windows-artifacts\.ps1/)
    expect(signer).toMatch(/CN=Astraluster/)
    expect(workflow).toMatch(/refs\/tags\/v/)
    expect(workflow).toMatch(/actions\/upload-artifact/)
    expect(workflow).toMatch(/pnpm install --frozen-lockfile\s*\n\s*- run: pnpm harness:prepare\s*\n\s*- run: pnpm build\s*\n\s*- run: pnpm test/)
    expect(workflow).toMatch(/cancel-in-progress: \$\{\{ !startsWith\(github\.ref, 'refs\/tags\/v'\) \}\}/)
  })
})
