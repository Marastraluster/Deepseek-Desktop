import { promises as fs } from 'node:fs'
import { join } from 'node:path'

const BACKGROUND_CANDIDATES = ['background.png', 'background.jpg', 'background.jpeg', 'background.webp', 'background.gif']

export async function migrateDevelopmentAppearance(releaseUserData: string, developmentUserData: string): Promise<void> {
  const targetDirectory = join(developmentUserData, 'appearance')
  await fs.mkdir(targetDirectory, { recursive: true })

  for (const key of BACKGROUND_CANDIDATES) {
    try {
      await fs.access(join(targetDirectory, key))
      return
    } catch {
      // Continue until an existing development asset is found.
    }
  }

  for (const key of BACKGROUND_CANDIDATES) {
    try {
      await fs.copyFile(join(releaseUserData, 'appearance', key), join(targetDirectory, key))
      return
    } catch {
      // A candidate not present in the installed profile is expected.
    }
  }
}
