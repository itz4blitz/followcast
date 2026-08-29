import { describe, expect, it } from 'vitest'
import { orderShareableMonitors } from '../../src/domain/shareableOutput.ts'
import { monitor } from '../fixtures.ts'

describe('orderShareableMonitors', () => {
  it('puts the right-most display last when two sit on the same row', () => {
    const dp1 = monitor({ x: 0, y: 0 })
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0, focused: false })
    expect(orderShareableMonitors([hdmi, dp1]).map((item) => item.name)).toEqual([
      'DP-1',
      'HDMI-A-1',
    ])
    expect(orderShareableMonitors([dp1, hdmi]).map((item) => item.name)).toEqual([
      'DP-1',
      'HDMI-A-1',
    ])
  })

  it('puts the lower display last even when hyprctl lists it first', () => {
    const dp1 = monitor({ x: 0, y: 0 })
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
    expect(orderShareableMonitors([dp3, dp1]).at(-1)?.name).toBe('DP-3')
  })

  it('drops headless outputs before sorting', () => {
    const headless = monitor({ id: 3, name: 'HEADLESS-1', x: 0, y: 2000 })
    expect(orderShareableMonitors([headless, monitor()]).map((item) => item.name)).toEqual(['DP-1'])
  })

  it('does not treat the followcast dummy output as a share target', () => {
    const dummy = monitor({ id: 3, name: 'fc-dummy', x: 8000, y: 0, focused: false })
    expect(orderShareableMonitors([dummy, monitor()]).map((item) => item.name)).toEqual(['DP-1'])
  })
})
