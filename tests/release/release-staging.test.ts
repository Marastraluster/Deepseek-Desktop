import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')

describe('release staging', () => {
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
    expect(workspace).toMatch(/injectWorkspacePackages:\s*true/)
    expect(workspace).toMatch(/'@deepseek-ai\/dsh-subprocess-local':\s*true/)
    expect(workspace).toMatch(/'@deepseek-ai\/dsh-subprocess-local@file:vendor\/deepseek-harness\/packages\/subprocess\/subprocess-local':\s*true/)
    expect(workspace).not.toMatch(/file:\/\/\/[A-Za-z]:\//)

    const stagingScript = readFileSync(join(root, 'scripts', 'package-release.mjs'), 'utf8')
    expect(stagingScript).toMatch(/\['--ignore-scripts', '--filter', '@deepseek-desktop\/host', 'deploy'/)
  })

  it('defines tag-triggered native release builds with Astraluster signing', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8')
    const signer = readFileSync(join(root, 'scripts', 'sign-windows-artifacts.ps1'), 'utf8')

    expect(workflow).toMatch(/windows-latest/)
    expect(workflow).toMatch(/macos-13/)
    expect(workflow).toMatch(/macos-14/)
    expect(workflow).toMatch(/ubuntu-latest/)
    expect(workflow).toMatch(/sign-windows-artifacts\.ps1/)
    expect(signer).toMatch(/CN=Astraluster/)
    expect(workflow).toMatch(/refs\/tags\/v/)
    expect(workflow).toMatch(/actions\/upload-artifact/)
    expect(workflow).not.toMatch(/pnpm install --frozen-lockfile(?: --force)?\s*\n\s*- run: pnpm harness:prepare/)
    expect(workflow).toMatch(/pnpm harness:prepare\s*\n\s*- run: pnpm install --frozen-lockfile\s*\n\s*- run: pnpm build\s*\n\s*- run: pnpm test/)
  })
})
