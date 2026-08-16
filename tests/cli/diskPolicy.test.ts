import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { diskPolicy } from '../../src/cli/diskPolicy.ts'
import { DEFAULT_POLICY } from '../../src/domain/policy.ts'

describe('diskPolicy', () => {
  it('starts from the default policy and persists a toggle', () => {
    const home = mkdtempSync(join(tmpdir(), 'followcast-home-'))
    const store = diskPolicy({ HOME: home })
    expect(store.read()).toEqual(DEFAULT_POLICY)
    store.write({ monitors: { 'DP-1': false }, apps: { slack: false } })
    expect(store.read()).toEqual({ monitors: { 'DP-1': false }, apps: { slack: false } })
  })
})
