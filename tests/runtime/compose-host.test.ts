import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  composeDesktopEntries,
  resolveDesktopHostModuleBaseUrl,
} from '../../apps/desktop-host/src/compose-host.ts'

const hostPackagePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'apps',
  'desktop-host',
  'package.json',
)

describe('desktop Host composition', () => {
  it('keeps official Host and UI rows while disabling browser transport rows', () => {
    const entries = composeDesktopEntries()
    const byId = new Map(entries.map(entry => [entry.id, entry]))

    for (const id of ['api-gateway', 'workspace', 'cordis-host-runner', 'ui-theme', 'ui-conversation']) {
      expect(byId.get(id), `missing ${id}`).toBeDefined()
      expect(byId.get(id)?.disabled, `${id} is disabled`).not.toBe(true)
    }

    for (const id of ['hmr', 'web-startup', 'webserver', 'web-runtime', 'client-hmr', 'modules', 'connection']) {
      expect(byId.get(id)?.disabled, `${id} must be disabled`).toBe(true)
    }

    expect(byId.get('directory-picker')?.disabled).toBe(true)
    expect(byId.get('desktop-directory-picker')?.name).toBe(
      '@deepseek-ai/dsh-host-directory-picker-native',
    )
    expect(byId.get('ui-directory-picker-native')?.name).toBe(
      '@deepseek-ai/dsh-client-ui-directory-picker-native',
    )
    expect(byId.get('desktop-connection')?.name).toBe('@deepseek-desktop/connection')
    expect(entries.some(entry => entry.name === '@deepseek-ai/dsh-host-webserver'
      && entry.disabled !== true)).toBe(false)
  })

  it('declares every enabled official plugin at the Host module-resolution base', () => {
    const hostPackage = JSON.parse(readFileSync(hostPackagePath, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const dependencies = hostPackage.dependencies ?? {}
    const resolveFromHost = createRequire(pathToFileURL(hostPackagePath))
    const enabledPackages = [...new Set(composeDesktopEntries()
      .filter(entry => entry.disabled !== true && typeof entry.name === 'string')
      .map(entry => entry.name as string))]

    for (const packageName of enabledPackages) {
      expect(dependencies, `${packageName} must be a direct Host dependency`).toHaveProperty(packageName)
      expect(() => resolveFromHost.resolve(packageName), `${packageName} must resolve from the Host manifest`).not.toThrow()
    }
  })

  it('uses the Host manifest rather than the CLI as the official module base', () => {
    expect(fileURLToPath(resolveDesktopHostModuleBaseUrl())).toBe(hostPackagePath)
  })
})
