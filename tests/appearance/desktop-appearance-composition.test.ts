import { expect, it } from 'vitest'
import { composeDesktopEntries } from '../../apps/desktop-host/src/compose-host.ts'

it('ships the upstream-derived transparent UI client instead of the retired desktop appearance plugin', () => {
  const names = composeDesktopEntries().map(entry => entry.name)
  expect(names.filter(name => name === '@deepseek-desktop/transparent-ui')).toHaveLength(1)
  expect(names).not.toContain('@deepseek-desktop/appearance')
})
