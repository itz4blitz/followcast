import type { KnipConfiguration } from 'knip'

const config: KnipConfiguration = {
  entry: ['vitest.stryker.config.ts'],
  stryker: { config: ['stryker.config.ts'] },
}

export default config
