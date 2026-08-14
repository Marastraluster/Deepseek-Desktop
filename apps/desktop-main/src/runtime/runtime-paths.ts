import { posix, win32 } from 'node:path'

export interface RuntimePathOptions {
  isPackaged: boolean
  resourcesPath: string
  appPath: string
  nodeExecutable: string
  platform: NodeJS.Platform
}

export interface RuntimePaths {
  nodeExecutable: string
  hostEntry: string
}

export function resolveRuntimePaths(options: RuntimePathOptions): RuntimePaths {
  const path = options.platform === 'win32' ? win32 : posix
  if (!options.isPackaged) {
    return {
      nodeExecutable: options.nodeExecutable,
      hostEntry: path.join(options.appPath, 'apps', 'desktop-host', 'dist', 'main.js'),
    }
  }

  return {
    nodeExecutable: path.join(
      options.resourcesPath,
      'node',
      options.platform === 'win32' ? 'node.exe' : 'bin',
      options.platform === 'win32' ? '' : 'node',
    ),
    hostEntry: path.join(options.resourcesPath, 'host', 'dist', 'main.js'),
  }
}
