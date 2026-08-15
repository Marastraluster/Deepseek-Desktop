import type { Context } from '@deepseek-ai/cordis'
import {
  boot,
  composeEntries,
  loadOverlayPatches,
} from '@deepseek-ai/dsh-app-boot'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DISABLED_BROWSER_ROWS = [
  'hmr',
  'web-startup',
  'webserver',
  'web-runtime',
  'client-hmr',
  'modules',
  'connection',
] as const

export interface DesktopHostOptions {
  harnessRoot?: string
  configPath?: string
}

export function resolveHarnessRoot(explicit?: string): string {
  const configured = explicit ?? process.env.DSH_DESKTOP_HARNESS_ROOT
  if (configured !== undefined && configured !== '') return resolve(configured)
  return resolve(fileURLToPath(new URL('../../../vendor/deepseek-harness/', import.meta.url)))
}

/**
 * The desktop Host owns the full official composition, so its manifest is the
 * authoritative bare-specifier base for both source and packaged layouts.
 */
export function resolveDesktopHostModuleBaseUrl(): string {
  return pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')).href
}

export function composeDesktopEntries(harnessRoot = resolveHarnessRoot()) {
  const basePatch = join(harnessRoot, 'packages', 'bundle', 'base', 'cordis.patch.yml')
  const webPatch = join(harnessRoot, 'packages', 'bundle', 'web-app', 'cordis.patch.yml')
  const shippedPresetRoot = join(harnessRoot, 'apps', 'cli', 'config', 'agent-presets')
  if (!existsSync(basePatch) || !existsSync(webPatch) || !existsSync(shippedPresetRoot)) {
    throw new Error(`DeepSeek Harness composition patches are missing under ${harnessRoot}`)
  }

  const overrides = [
    ...DISABLED_BROWSER_ROWS.map(id => ({ id, disabled: true })),
    {
      id: 'directory-picker',
      disabled: true,
    },
    {
      id: 'api-gateway',
      config: { nativeOpen: true },
    },
    {
      id: 'agent-presets',
      config: {
        default: 'standard',
        roots: [{ path: shippedPresetRoot, trust: 'system' }],
      },
    },
  ]
  return composeEntries([
    loadOverlayPatches('deepseek-desktop', basePatch),
    loadOverlayPatches('deepseek-desktop', webPatch),
    overrides,
    [{ insert: [{
      id: 'desktop-directory-picker',
      name: '@deepseek-ai/dsh-host-directory-picker-native',
    }, {
      id: 'ui-directory-picker-native',
      name: '@deepseek-ai/dsh-client-ui-directory-picker-native',
    }, {
      id: 'desktop-connection',
      name: '@deepseek-desktop/connection',
    }, {
      id: 'desktop-appearance',
      name: '@deepseek-desktop/transparent-ui',
    }] }],
  ])
}

export async function bootDesktopHost(options: DesktopHostOptions = {}): Promise<Context> {
  const harnessRoot = resolveHarnessRoot(options.harnessRoot)
  const configPath = options.configPath
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'cordis.yml')
  const entries = composeDesktopEntries(harnessRoot)
  return boot(
    'deepseek-desktop-host',
    resolve(configPath),
    [{ insert: entries }],
    undefined,
    resolveDesktopHostModuleBaseUrl(),
  )
}
