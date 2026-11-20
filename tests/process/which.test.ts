import { delimiter } from 'node:path'
import { describe, expect, it } from 'vitest'
import { whichOnPath } from '../../src/process/which.ts'

describe('whichOnPath', () => {
  it('returns the first PATH entry that exists', () => {
    const found = whichOnPath(
      'wl-mirror',
      ['/missing', '/opt/bin', '/usr/bin'].join(delimiter),
      (path) => path === '/opt/bin/wl-mirror',
    )
    expect(found).toBe('/opt/bin/wl-mirror')
  })

  it('supports Windows PATH delimiter and executable extensions', () => {
    const found = whichOnPath(
      'python',
      'C:\\Missing;C:\\Python313;C:\\Windows',
      (path) => path === 'C:\\Python313/python.exe',
      ';',
      ['.exe', '.cmd'],
    )
    expect(found).toBe('C:\\Python313/python.exe')
  })

  it('returns null when PATH is missing or empty', () => {
    expect(whichOnPath('wl-mirror', undefined, () => true)).toBeNull()
    expect(whichOnPath('wl-mirror', '', () => true)).toBeNull()
  })

  it('returns null when no entry exists', () => {
    const checked: string[] = []
    expect(
      whichOnPath('wl-mirror', ['/usr/bin', '/bin'].join(delimiter), (path) => {
        checked.push(path)
        return false
      }),
    ).toBeNull()
    expect(checked).toEqual(['/usr/bin/wl-mirror', '/bin/wl-mirror'])
  })
})
