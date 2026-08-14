import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveRuntimePaths } from '../../apps/desktop-main/src/runtime/runtime-paths.ts'

describe('runtime paths', () => {
  it('uses the bundled Node executable in packaged Windows mode', () => {
    expect(resolveRuntimePaths({
      isPackaged: true,
      resourcesPath: 'C:\\Program Files\\DeepSeek Desktop\\resources',
      appPath: 'C:\\Program Files\\DeepSeek Desktop\\resources\\app.asar',
      nodeExecutable: 'C:\\Windows\\node.exe',
      platform: 'win32',
    })).toEqual({
      nodeExecutable: join('C:\\Program Files\\DeepSeek Desktop\\resources', 'node', 'node.exe'),
      hostEntry: join('C:\\Program Files\\DeepSeek Desktop\\resources', 'host', 'dist', 'main.js'),
    })
  })

  it('uses the development Node and source Host outside a package', () => {
    expect(resolveRuntimePaths({
      isPackaged: false,
      resourcesPath: 'unused',
      appPath: 'D:\\ProgramFiles\\Deepseek',
      nodeExecutable: 'C:\\node24\\node.exe',
      platform: 'win32',
    })).toEqual({
      nodeExecutable: 'C:\\node24\\node.exe',
      hostEntry: join('D:\\ProgramFiles\\Deepseek', 'apps', 'desktop-host', 'dist', 'main.js'),
    })
  })

  it('uses the bundled Node binary in packaged macOS and Linux mode', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      expect(resolveRuntimePaths({
        isPackaged: true,
        resourcesPath: '/Applications/DeepSeek Desktop.app/Contents/Resources',
        appPath: '/Applications/DeepSeek Desktop.app/Contents/Resources/app.asar',
        nodeExecutable: '/usr/local/bin/node',
        platform,
      })).toEqual({
        nodeExecutable: '/Applications/DeepSeek Desktop.app/Contents/Resources/node/bin/node',
        hostEntry: '/Applications/DeepSeek Desktop.app/Contents/Resources/host/dist/main.js',
      })
    }
  })
})
