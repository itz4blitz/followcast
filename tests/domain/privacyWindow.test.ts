import { describe, expect, it } from 'vitest'
import {
  findPrivacyWindow,
  privacyRegionFrom,
  privacySlotRegion,
} from '../../src/domain/privacyWindow.ts'
import { monitor, windowSnap } from '../fixtures.ts'

describe('privacy window lookup', () => {
  it('finds the mapped Followcast Privacy surface', () => {
    const card = windowSnap({
      address: '0xcard',
      className: 'followcast-privacy',
      title: 'Followcast Privacy',
      at: { x: 40, y: 50 },
      size: { width: 640, height: 360 },
    })
    const fox = windowSnap({ address: '0xfox', className: 'firefox', title: 'Firefox' })
    expect(findPrivacyWindow([fox, card])?.address).toBe('0xcard')
    expect(
      privacyRegionFrom({
        focusedAddress: fox.address,
        windows: [fox, card],
        monitors: [monitor()],
      }),
    ).toEqual({ output: 'DP-1', x: 40, y: 50, width: 640, height: 360 })
  })

  it('returns null when the privacy surface is missing', () => {
    const fox = windowSnap({ address: '0xfox', className: 'firefox', title: 'Firefox' })
    expect(
      privacyRegionFrom({ focusedAddress: fox.address, windows: [fox], monitors: [monitor()] }),
    ).toBeNull()
  })

  it('returns null when the privacy surface has no matching monitor', () => {
    const card = windowSnap({
      address: '0xcard',
      className: 'followcast-privacy',
      title: 'Followcast Privacy',
      monitorId: 9,
    })
    expect(
      privacyRegionFrom({
        focusedAddress: card.address,
        windows: [card],
        monitors: [monitor()],
      }),
    ).toBeNull()
  })

  it('ignores an unmapped privacy surface and finds one by title', () => {
    const hidden = windowSnap({
      address: '0xhidecard',
      className: 'followcast-privacy',
      title: 'Followcast Privacy',
      mapped: false,
    })
    const titled = windowSnap({
      address: '0xtitlecard',
      className: 'python3',
      title: 'Followcast Privacy',
      at: { x: 8, y: 9 },
      size: { width: 100, height: 80 },
    })
    expect(findPrivacyWindow([hidden, titled])?.address).toBe('0xtitlecard')
  })

  it('finds a privacy surface by class even when the title is different', () => {
    const card = windowSnap({
      address: '0xclasscard',
      className: 'followcast-privacy',
      title: 'Hidden surface',
    })
    expect(findPrivacyWindow([card])?.address).toBe('0xclasscard')
  })
})

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
