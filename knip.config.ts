import type { KnipConfiguration } from 'knip'

const config: KnipConfiguration = {
  entry: ['src/cli.ts', 'vitest.stryker.config.ts'],
  stryker: { config: ['stryker.config.ts'] },
}

export default config
