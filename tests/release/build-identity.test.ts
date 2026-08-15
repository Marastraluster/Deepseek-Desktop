import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { writeBuildIdentity } from '../../scripts/package-release.mjs'

it('writes the packaged host identity required at application startup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deepseek-build-identity-'))
  try {
    writeBuildIdentity(directory, 'a'.repeat(40))
    expect(JSON.parse(readFileSync(join(directory, 'build-identity.json'), 'utf8'))).toEqual({ harnessCommit: 'a'.repeat(40) })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
