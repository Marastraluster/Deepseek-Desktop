import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('desktop Connection browser bundle', () => {
  it('registers a lazy client plugin factory with the official module loader', () => {
    let handoff: { id: string; factory: unknown } | undefined
    const source = readFileSync('packages/desktop-connection/lib/client.js', 'utf8')

    runInNewContext(source, {
      window: {
        __ModuleLoader__: {
          load(value: { id: string; factory: unknown }) {
            handoff = value
          },
        },
      },
    })

    expect(handoff).toMatchObject({ id: '@deepseek-desktop/connection' })
    expect(handoff?.factory).toEqual(expect.any(Function))
  })
})
