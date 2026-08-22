import { describe, expect, it } from 'vitest'
import { displayLabel, monitorSlide, slideDirection } from '../../src/domain/monitorSlide.ts'
import { monitor } from '../fixtures.ts'

const dp1 = monitor()
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

describe('slideDirection', () => {
  it('slides right when the destination monitor sits to the right', () => {
    expect(slideDirection(dp1, hdmi)).toBe('right')
  })

  it('slides left when the destination monitor sits to the left', () => {
    expect(slideDirection(hdmi, dp1)).toBe('left')
  })

  it('slides down when the destination monitor sits below', () => {
    expect(slideDirection(dp1, dell)).toBe('down')
  })

  it('slides up when the destination monitor sits above', () => {
    expect(slideDirection(dell, dp1)).toBe('up')
  })

  it('uses the monitor center so a small screen on the left edge is still left of a wide one', () => {
    const wide = monitor({ name: 'WIDE', x: 0, y: 0, width: 2560, height: 1440, scale: 1 })
    const inset = monitor({ name: 'INSET', x: 0, y: 0, width: 200, height: 200, scale: 1 })
    expect(slideDirection(wide, inset)).toBe('left')
    expect(slideDirection(inset, wide)).toBe('right')
  })

  it('treats an equal horizontal and vertical offset as horizontal', () => {
    const origin = monitor({ name: 'A', x: 0, y: 0, width: 100, height: 100, scale: 1 })
    const diagonal = monitor({ name: 'B', x: 400, y: 400, width: 100, height: 100, scale: 1 })
    expect(slideDirection(origin, diagonal)).toBe('right')
  })

  it('slides right when two monitors share the same center', () => {
    const a = monitor({ name: 'A', x: 0, y: 0, width: 100, height: 100, scale: 1 })
    const b = monitor({ name: 'B', x: 0, y: 0, width: 100, height: 100, scale: 1 })
    expect(slideDirection(a, b)).toBe('right')
  })

  it('uses physical pixels so a 2x-scaled panel on the left is still left of its neighbor', () => {
    const scaled = monitor({ name: 'A', x: 0, y: 0, width: 200, height: 200, scale: 2 })
    const native = monitor({ name: 'B', x: 80, y: 0, width: 100, height: 200, scale: 1 })
    expect(slideDirection(scaled, native)).toBe('right')
    expect(slideDirection(native, scaled)).toBe('left')
  })

  it('uses half the scaled width when comparing centers, not double', () => {
    const left = monitor({ name: 'A', x: 0, y: 0, width: 200, height: 100, scale: 1 })
    const right = monitor({ name: 'B', x: 150, y: 0, width: 100, height: 100, scale: 1 })
    expect(slideDirection(left, right)).toBe('right')
    expect(slideDirection(right, left)).toBe('left')
  })

  it('slides up when a tall monitor sits slightly above a short neighbor', () => {
    const tall = monitor({ name: 'A', x: 0, y: 0, width: 100, height: 400, scale: 1 })
    const short = monitor({ name: 'B', x: 0, y: 50, width: 100, height: 100, scale: 1 })
    expect(slideDirection(tall, short)).toBe('up')
    expect(slideDirection(short, tall)).toBe('down')
  })
})

describe('displayLabel', () => {
  it('numbers displays top-to-bottom then left-to-right', () => {
    const row = [dell, hdmi, dp1]
    expect(displayLabel(row, 'DP-1')).toBe('Display 1')
    expect(displayLabel(row, 'HDMI-A-1')).toBe('Display 2')
    expect(displayLabel(row, 'DP-3')).toBe('Display 3')
  })

  it('falls back to Display 1 when the name is unknown', () => {
    expect(displayLabel([dp1], 'missing')).toBe('Display 1')
  })
})

describe('monitorSlide', () => {
  const follow = (output: string) => ({
    kind: 'follow' as const,
    address: '0x1',
    region: { output, x: 0, y: 0, width: 10, height: 10 },
  })

  it('describes a rightward move from DP-1 onto HDMI', () => {
    expect(monitorSlide(follow('DP-1'), follow('HDMI-A-1'), [dp1, hdmi, dell])).toEqual({
      fromOutput: 'DP-1',
      toOutput: 'HDMI-A-1',
      direction: 'right',
      fromLabel: 'Display 1',
      toLabel: 'Display 2',
    })
  })

  it('returns null when staying on the same output', () => {
    expect(monitorSlide(follow('DP-1'), follow('DP-1'), [dp1, hdmi])).toBeNull()
  })

  it('returns null on the first follow', () => {
    expect(monitorSlide(null, follow('HDMI-A-1'), [dp1, hdmi])).toBeNull()
  })

  it('returns null when a monitor is missing from the snapshot', () => {
    expect(monitorSlide(follow('DP-1'), follow('HDMI-A-1'), [dp1])).toBeNull()
  })

  it('returns null when the source monitor is missing from the snapshot', () => {
    expect(monitorSlide(follow('HDMI-A-1'), follow('DP-1'), [dp1])).toBeNull()
  })

  it('returns null when the previous decision is not a follow', () => {
    expect(
      monitorSlide({ kind: 'hold', reason: 'self' }, follow('HDMI-A-1'), [dp1, hdmi]),
    ).toBeNull()
  })

  it('returns null when the next decision is not a follow', () => {
    expect(monitorSlide(follow('DP-1'), { kind: 'hold', reason: 'self' }, [dp1, hdmi])).toBeNull()
  })

  it('keeps the source output when the first listed monitor is not the previous one', () => {
    expect(monitorSlide(follow('HDMI-A-1'), follow('DP-1'), [dp1, hdmi])).toEqual({
      fromOutput: 'HDMI-A-1',
      toOutput: 'DP-1',
      direction: 'left',
      fromLabel: 'Display 2',
      toLabel: 'Display 1',
    })
  })
})
