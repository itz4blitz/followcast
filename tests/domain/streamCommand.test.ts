import { describe, expect, it } from 'vitest'
import { regionsEqual, streamCommand } from '../../src/domain/streamCommand.ts'

describe('streamCommand', () => {
  it('formats a quoted slurp region line for wl-mirror --stream', () => {
    expect(streamCommand({ output: 'HDMI-A-1', x: 100, y: 80, width: 200, height: 100 })).toBe(
      "--region '100,80 200x100 HDMI-A-1'",
    )
  })

  it('keeps integer coordinates that came from a clamp', () => {
    expect(streamCommand({ output: 'DP-1', x: 0, y: 0, width: 1600, height: 900 })).toBe(
      "--region '0,0 1600x900 DP-1'",
    )
  })
})

describe('regionsEqual', () => {
  const left = { output: 'DP-1', x: 1, y: 2, width: 3, height: 4 }

  it('is true only when every field matches', () => {
    expect(regionsEqual(left, { output: 'DP-1', x: 1, y: 2, width: 3, height: 4 })).toBe(true)
  })

  it('is false when the output changes', () => {
    expect(regionsEqual(left, { ...left, output: 'HDMI-A-1' })).toBe(false)
  })

  it('is false when any numeric field changes', () => {
    expect(regionsEqual(left, { ...left, x: 0 })).toBe(false)
    expect(regionsEqual(left, { ...left, y: 0 })).toBe(false)
    expect(regionsEqual(left, { ...left, width: 1 })).toBe(false)
    expect(regionsEqual(left, { ...left, height: 1 })).toBe(false)
  })
})
