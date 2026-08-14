import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')

describe('repository foundation', () => {
  it('declares the pinned Harness and release scripts', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      packageManager: string
      scripts: Record<string, string>
    }

    expect(pkg.packageManager).toBe('pnpm@11.19.0')
    expect(pkg.scripts['harness:prepare']).toBe('node scripts/prepare-harness.mjs')
    expect(pkg.scripts['dist:win']).toBe('electron-builder --config electron-builder.yml --win')
    expect(existsSync(join(root, 'vendor', 'deepseek-harness', '.git'))).toBe(true)
  })

  it('tracks the workspace lockfile and pinned Harness gitlink', () => {
    expect(existsSync(join(root, 'pnpm-lock.yaml'))).toBe(true)

    const ignored = spawnSync('git', ['check-ignore', 'pnpm-lock.yaml'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(ignored.status).not.toBe(0)

    const gitlink = spawnSync('git', ['ls-files', '-s', '--', 'vendor/deepseek-harness'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(gitlink.status).toBe(0)
    expect(gitlink.stdout.trim()).toBe(
      '160000 47f943859bef60e4160492346772ded9b24f765a 0\tvendor/deepseek-harness',
    )
  })
})
