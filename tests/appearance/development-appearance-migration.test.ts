import { expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateDevelopmentAppearance } from '../../apps/desktop-main/src/appearance/development-appearance-migration.ts'

it('copies the existing production wallpaper into an empty development profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deepseek-appearance-'))
  const source = join(root, 'release')
  const target = join(root, 'development')
  try {
    await mkdir(join(source, 'appearance'), { recursive: true })
    await writeFile(join(source, 'appearance', 'background.png'), 'wallpaper')

    await migrateDevelopmentAppearance(source, target)

    expect(await readFile(join(target, 'appearance', 'background.png'), 'utf8')).toBe('wallpaper')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
