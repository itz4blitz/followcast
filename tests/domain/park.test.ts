import { describe, expect, it } from 'vitest'
import { parkPoint, surfaceWindow } from '../../src/domain/park.ts'
import { monitor, options, windowSnap } from '../fixtures.ts'

const dp1 = monitor({
  id: 0,
  name: 'DP-1',
  x: 0,
  y: 0,
  width: 2560,
  height: 1440,
  scale: 1.6,
})

const hdmi = monitor({
  id: 1,
  name: 'HDMI-A-1',
  x: 1600,
  y: 0,
  width: 2560,
  height: 1440,
  scale: 1.6,
})

const dp3 = monitor({
  id: 2,
  name: 'DP-3',
  x: 200,
  y: 900,
  width: 1920,
  height: 1080,
  scale: 1.3333334,
  focused: false,
})

describe('parkPoint', () => {
  it('parks two logical pixels onto the bottom-right of the lowest display', () => {
    expect(parkPoint([dp1, hdmi, dp3])).toEqual({ x: 2118, y: 1978 })
  })

  it('breaks row ties by picking the right-most display', () => {
    expect(parkPoint([dp1, hdmi])).toEqual({ x: 4158, y: 1438 })
  })

  it('ignores headless outputs when choosing the parking display', () => {
    const headless = monitor({
      id: 3,
      name: 'HEADLESS-1',
      x: 0,
      y: 2000,
      width: 3840,
      height: 2160,
    })
    expect(parkPoint([dp1, headless])).toEqual({ x: 2558, y: 1438 })
  })

  it('returns null when no shareable display exists', () => {
    expect(parkPoint([])).toBeNull()
    expect(
      parkPoint([monitor({ id: 4, name: 'HEADLESS-2', x: 0, y: 0, width: 1920, height: 1080 })]),
    ).toBeNull()
  })
})

describe('surfaceWindow', () => {
  it('finds the mapped followcast surface by class', () => {
    const surface = windowSnap({
      address: '0xsurface',
      className: 'followcast.surface',
      title: 'Followcast',
    })
    expect(surfaceWindow([windowSnap(), surface], options().selfClasses)).toBe(surface)
  })

  it('still finds the retired wl-mirror dummy', () => {
    const legacy = windowSnap({
      address: '0xlegacy',
      className: 'at.yrlf.wl_mirror',
      title: 'Followcast',
    })
    expect(surfaceWindow([legacy], options().selfClasses)).toBe(legacy)
  })

  it('skips hidden or unmapped copies', () => {
    const hidden = windowSnap({ className: 'followcast.surface', hidden: true })
    const unmapped = windowSnap({ className: 'followcast.surface', mapped: false })
    expect(surfaceWindow([hidden, unmapped], options().selfClasses)).toBeUndefined()
  })
})
