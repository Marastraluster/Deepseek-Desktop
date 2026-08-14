import { clientBundle } from '../../vendor/deepseek-harness/packages/client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-desktop/connection',
  ['lib/types/index.js'],
  { hostPhase: true },
)
