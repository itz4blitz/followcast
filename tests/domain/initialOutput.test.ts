import { describe, expect, it } from 'vitest'
import { initialOutput } from '../../src/domain/initialOutput.ts'
import { monitor } from '../fixtures.ts'

describe('initialOutput', () => {
  it('prefers the focused monitor so the first frame is on the screen the user is using', () => {
    expect(
      initialOutput([
        monitor({ id: 0, name: 'DP-1', focused: false }),
        monitor({ id: 1, name: 'HDMI-A-1', focused: true }),
      ]),
    ).toBe('HDMI-A-1')
  })

  it('falls back to the first monitor when none is focused', () => {
    expect(
      initialOutput([
        monitor({ name: 'DP-1', focused: false }),
        monitor({ id: 1, name: 'HDMI-A-1', focused: false }),
      ]),
    ).toBe('DP-1')
  })

  it('throws when there are no monitors', () => {
    expect(() => initialOutput([])).toThrow(/no monitor/)
  })

  it('skips a focused headless output so the dummy never captures itself', () => {
    expect(
      initialOutput([
        monitor({ id: 0, name: 'DP-1', focused: false }),
        monitor({ id: 3, name: 'HEADLESS-1', focused: true }),
      ]),
    ).toBe('DP-1')
  })
})
