import { describe, expect, it } from 'vitest'
import { privacySlotRegion } from '../../src/domain/privacyWindow.ts'
import { monitor } from '../fixtures.ts'

describe('privacySlotRegion', () => {
  it('reserves a bottom-right slot on the last monitor', () => {
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0, focused: false })
    expect(privacySlotRegion([monitor(), hdmi])).toEqual({
      output: 'HDMI-A-1',
      x: 1600 + 1600 - 480 - 16,
      y: 0 + 900 - 270 - 16,
      width: 480,
      height: 270,
    })
  })

  it('returns null when there are no monitors', () => {
    expect(privacySlotRegion([])).toBeNull()
  })

  it('uses the last monitor when three outputs are present', () => {
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0, focused: false })
    const dell = monitor({
      id: 2,
      name: 'DP-3',
      x: 200,
      y: 900,
      width: 1920,
      height: 1080,
      scale: 1,
      focused: false,
    })
    expect(privacySlotRegion([monitor(), hdmi, dell])).toMatchObject({ output: 'DP-3' })
  })

  it('sorts like parkPoint so hyprctl order does not pick the wrong display', () => {
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0, focused: false })
    const dell = monitor({
      id: 2,
      name: 'DP-3',
      x: 200,
      y: 900,
      width: 1920,
      height: 1080,
      scale: 1.3333334,
      focused: false,
    })
    expect(privacySlotRegion([dell, hdmi, monitor()])).toMatchObject({ output: 'DP-3' })
  })

  it('does not park the privacy slot on a headless share surface', () => {
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0, focused: false })
    const headless = monitor({ id: 3, name: 'HEADLESS-1', x: 8000, y: 0, focused: false })
    expect(privacySlotRegion([monitor(), hdmi, headless])).toMatchObject({ output: 'HDMI-A-1' })
  })

  it('shrinks the slot when the last monitor is smaller than the default card', () => {
    const tiny = monitor({ name: 'eDP-1', width: 900, height: 600, scale: 1 })
    expect(privacySlotRegion([tiny])).toEqual({
      output: 'eDP-1',
      x: 900 - 300 - 16,
      y: 600 - 200 - 16,
      width: 300,
      height: 200,
    })
  })
})
