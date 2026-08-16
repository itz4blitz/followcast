import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { windowToRegion } from '../../src/domain/geometry.ts'
import { monitor, windowSnap } from '../fixtures.ts'

describe('windowToRegion', () => {
  it('converts a window on a scaled monitor into a slurp region', () => {
    const dp1 = monitor()
    const firefox = windowSnap({
      at: { x: 100, y: 40 },
      size: { width: 400, height: 300 },
    })

    expect(windowToRegion(firefox, dp1)).toEqual({
      output: 'DP-1',
      x: 100,
      y: 40,
      width: 400,
      height: 300,
    })
  })

  it('keeps slurp global coordinates so the second display is not mapped onto DP-1', () => {
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0 })
    const slack = windowSnap({
      monitorId: 1,
      at: { x: 1700, y: 80 },
      size: { width: 200, height: 100 },
    })

    expect(windowToRegion(slack, hdmi)).toEqual({
      output: 'HDMI-A-1',
      x: 1700,
      y: 80,
      width: 200,
      height: 100,
    })
  })

  it('clamps a window that hangs off the right and bottom of the logical monitor box', () => {
    const dp1 = monitor()
    const overflow = windowSnap({
      at: { x: 1500, y: 800 },
      size: { width: 400, height: 400 },
    })

    expect(windowToRegion(overflow, dp1)).toEqual({
      output: 'DP-1',
      x: 1500,
      y: 800,
      width: 100,
      height: 100,
    })
  })

  it('clamps a window that starts left and above the monitor', () => {
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 100 })
    const overflow = windowSnap({
      monitorId: 1,
      at: { x: 1500, y: 50 },
      size: { width: 300, height: 200 },
    })

    expect(windowToRegion(overflow, hdmi)).toEqual({
      output: 'HDMI-A-1',
      x: 1600,
      y: 100,
      width: 200,
      height: 150,
    })
  })

  it('keeps a one-pixel-wide intersection instead of treating it as empty', () => {
    const dp1 = monitor({ scale: 1, width: 1600, height: 900 })
    const sliver = windowSnap({
      at: { x: 1599, y: 10 },
      size: { width: 40, height: 20 },
    })
    expect(windowToRegion(sliver, dp1)).toEqual({
      output: 'DP-1',
      x: 1599,
      y: 10,
      width: 1,
      height: 20,
    })
  })

  it('keeps a one-pixel-tall intersection instead of treating it as empty', () => {
    const dp1 = monitor({ scale: 1, width: 1600, height: 900 })
    const sliver = windowSnap({
      at: { x: 10, y: 899 },
      size: { width: 40, height: 20 },
    })
    expect(windowToRegion(sliver, dp1)).toEqual({
      output: 'DP-1',
      x: 10,
      y: 899,
      width: 40,
      height: 1,
    })
  })

  it('returns null when the window does not intersect the monitor', () => {
    const dp1 = monitor()
    const elsewhere = windowSnap({
      at: { x: 5000, y: 0 },
      size: { width: 100, height: 100 },
    })

    expect(windowToRegion(elsewhere, dp1)).toBeNull()
  })

  it('returns null for a zero-area intersection', () => {
    const dp1 = monitor()
    const edge = windowSnap({
      at: { x: 1600, y: 0 },
      size: { width: 10, height: 10 },
    })

    expect(windowToRegion(edge, dp1)).toBeNull()
  })

  it('keeps every generated intersecting region inside the logical monitor box', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: -200, max: 1800 }),
        fc.integer({ min: -200, max: 1000 }),
        fc.integer({ min: 1, max: 2000 }),
        fc.integer({ min: 1, max: 2000 }),
        (scaleTenths, atX, atY, width, height) => {
          const scale = scaleTenths / 2 + 0.5
          const mon = monitor({ scale, width: 2560, height: 1440, x: 100, y: 50 })
          const region = windowToRegion(
            windowSnap({ at: { x: atX, y: atY }, size: { width, height } }),
            mon,
          )
          if (region === null) {
            return true
          }
          const logicalW = 2560 / scale
          const logicalH = 1440 / scale
          return (
            region.x >= mon.x &&
            region.y >= mon.y &&
            region.width >= 1 &&
            region.height >= 1 &&
            region.x + region.width <= mon.x + logicalW + 1e-9 &&
            region.y + region.height <= mon.y + logicalH + 1e-9 &&
            region.output === 'DP-1'
          )
        },
      ),
    )
  })
})
