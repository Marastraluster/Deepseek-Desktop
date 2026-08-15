import { expect, it } from 'vitest'
import { buildReleaseNotices } from '../../scripts/package-release.mjs'

it('includes the modified transparent UI plugin MIT license in packaged notices', () => {
  const notices = buildReleaseNotices({
    harnessLicense: 'Harness license',
    harnessNotices: 'Harness notices',
    nodeLicense: 'Node license',
    transparentUiLicense: 'MIT License\nCopyright (c) 2026 John Wu',
  })

  expect(notices).toContain('DeepSeek Harness license\nHarness license')
  expect(notices).toContain('Node.js license\nNode license')
  expect(notices).toContain('DSH Transparent UI Plugin (modified)\nMIT License\nCopyright (c) 2026 John Wu')
})
