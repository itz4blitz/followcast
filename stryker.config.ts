import type { PartialStrykerOptions } from '@stryker-mutator/api/core'

type StrykerConfig = Omit<PartialStrykerOptions, 'fileLogLevel'> & {
  fileLogLevel?: string
}

const config: StrykerConfig = {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.stryker.config.ts' },
  mutate: ['src/**/*.ts', '!src/cli.ts'],
  coverageAnalysis: 'perTest',
  ignoreStatic: true,
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  timeoutMS: 30000,
  reporters: ['html', 'json', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation.html' },
  thresholds: { high: 100, low: 100, break: 100 },
  symlinkNodeModules: true,
  tempDirName: '.stryker-tmp',
  fileLogLevel: 'info',
  jsonReporter: { fileName: 'reports/mutation.json' },
  checkers: [],
}

export default config
