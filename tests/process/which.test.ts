import { describe, expect, it } from 'vitest'
import { whichOnPath } from '../../src/process/which.ts'

describe('whichOnPath', () => {
  it('returns the first PATH entry that exists', () => {
    const found = whichOnPath(
      'wl-mirror',
      '/missing:/opt/bin:/usr/bin',
      (path) => path === '/opt/bin/wl-mirror',
    )
    expect(found).toBe('/opt/bin/wl-mirror')
  })

  it('returns null when PATH is missing or empty', () => {
    expect(whichOnPath('wl-mirror', undefined, () => true)).toBeNull()
    expect(whichOnPath('wl-mirror', '', () => true)).toBeNull()
  })

  it('returns null when no entry exists', () => {
    expect(whichOnPath('wl-mirror', '/usr/bin:/bin', () => false)).toBeNull()
  })
})
