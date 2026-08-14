import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { registerMainRouter } from './ipc/main-router.ts'
import { resolveRuntimePaths } from './runtime/runtime-paths.ts'
import { RuntimeSupervisor } from './runtime/runtime-supervisor.ts'
import { createWindowOptions, resolveExternalNavigation } from './security/navigation-policy.ts'

const PROTOCOL_VERSION = '1'
let runtime: RuntimeSupervisor | undefined
let mainWindow: BrowserWindow | undefined

app.setName('DeepSeek Desktop')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(startDesktop).catch((error: unknown) => {
    console.error('[desktop-main] startup failed:', error)
    app.exit(1)
  })
}

app.on('before-quit', (event) => {
  if (runtime === undefined || runtime.status().state === 'stopped') return
  event.preventDefault()
  const active = runtime
  runtime = undefined
  void active.stop().finally(() => app.quit())
})

app.on('window-all-closed', () => app.quit())

async function startDesktop(): Promise<void> {
  const appRoot = app.getAppPath()
  const identity = readBuildIdentity(appRoot)
  const nodeExecutable = app.isPackaged
    ? process.execPath
    : process.env.npm_node_execpath ?? 'node'
  runtime = new RuntimeSupervisor({
    paths: resolveRuntimePaths({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: appRoot,
      nodeExecutable,
      platform: process.platform,
    }),
    protocolVersion: PROTOCOL_VERSION,
    buildCommit: identity.harnessCommit,
    env: {
      DSH_HOME: join(app.getPath('userData'), 'dsh'),
      ...(app.isPackaged ? {
        DSH_DESKTOP_HARNESS_ROOT: join(process.resourcesPath, 'host', 'vendor', 'deepseek-harness'),
      } : {
        DSH_DESKTOP_HARNESS_ROOT: join(appRoot, 'vendor', 'deepseek-harness'),
      }),
    },
  })
  await runtime.start()

  const preload = join(import.meta.dirname, '..', 'preload', 'preload.cjs')
  const window = new BrowserWindow(createWindowOptions(preload))
  mainWindow = window
  registerMainRouter({
    ownedWebContentsId: window.webContents.id,
    registrar: ipcMain,
    runtime,
  })

  const developmentUrl = process.env.ELECTRON_RENDERER_URL
  const rendererRoot = resolve(appRoot, 'apps', 'desktop-renderer', 'dist')
  const rendererUrl = developmentUrl ?? new URL(`file:///${join(rendererRoot, 'index.html').replaceAll('\\', '/')}`).href
  installNavigationPolicy(window, rendererUrl, rendererRoot)
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  if (developmentUrl === undefined) {
    await window.loadFile(join(rendererRoot, 'index.html'))
  } else {
    await window.loadURL(developmentUrl)
  }
}

function installNavigationPolicy(window: BrowserWindow, rendererUrl: string, rendererRoot: string): void {
  const rendererOrigin = new URL(rendererUrl).origin
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (resolveExternalNavigation(url, rendererRoot) === 'external') void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const sameDevelopmentOrigin = rendererOrigin !== 'null' && new URL(url).origin === rendererOrigin
    const decision = resolveExternalNavigation(url, rendererRoot)
    if (sameDevelopmentOrigin || decision === 'allow') return
    event.preventDefault()
    if (decision === 'external') void shell.openExternal(url)
  })
}

function readBuildIdentity(appRoot: string): { harnessCommit: string } {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'build-identity.json')
    : join(appRoot, 'resources', 'build-identity.json')
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  if (typeof value.harnessCommit !== 'string' || !/^[0-9a-f]{40}$/.test(value.harnessCommit)) {
    throw new Error(`invalid build identity at ${path}`)
  }
  return { harnessCommit: value.harnessCommit }
}
