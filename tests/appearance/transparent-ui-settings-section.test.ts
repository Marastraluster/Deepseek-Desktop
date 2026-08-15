import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('registers transparent UI controls in the General page right pane', async () => {
  const source = await readFile(new URL('../../packages/dsh-transparent-ui/src/client/index.ts', import.meta.url), 'utf8')

  expect(source).toContain("ctx.slots.inject('settings.general.item'")
  expect(source).toContain("name: 'settings.general.item'")
  expect(source).not.toContain("id: 'transparent-ui'")
})
