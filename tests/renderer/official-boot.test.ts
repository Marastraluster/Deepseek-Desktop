import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareRendererPlugins } from '../../apps/desktop-renderer/scripts/prepare-plugins.ts'

const temporaryPaths: string[] = []

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('official Renderer boot graph', () => {
  it('materializes the active official UI graph with the desktop connection carrier', () => {
    const output = mkdtempSync(join(tmpdir(), 'dsh-renderer-plugins-'))
    temporaryPaths.push(output)

    const graph = prepareRendererPlugins({ root: resolve('.'), outputDir: output })
    const ids = graph.entries.map(entry => entry.id)

    expect(ids).toContain('@deepseek-desktop/connection')
    expect(ids).toContain('@deepseek-ai/dsh-client-ui-theme')
    expect(ids).toContain('@deepseek-ai/dsh-client-ui-conversation')
    expect(ids).toContain('@deepseek-ai/dsh-client-ui-sidebar')
    expect(ids).toContain('@deepseek-ai/dsh-client-runtime')
    expect(ids).not.toContain('@deepseek-ai/dsh-client-connection')

    for (const entry of graph.entries) {
      const copied = join(output, entry.url.replace(/^\//, '').replace(/\?.*$/, ''))
      expect(readFileSync(copied, 'utf8')).toContain('__ModuleLoader__')
    }
  })
})
