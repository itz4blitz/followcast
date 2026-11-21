import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POLICY,
  isAppAllowed,
  isMonitorAllowed,
  isPaused,
  parsePolicy,
  serializePolicy,
  setPaused,
  toggleApp,
  toggleMonitor,
} from '../../src/domain/policy.ts'

describe('parsePolicy', () => {
  it('treats an empty object as everything allowed', () => {
    expect(parsePolicy({})).toEqual({ monitors: {}, apps: {} })
  })

  it('reads monitor and app flags', () => {
    expect(
      parsePolicy({
        monitors: { 'HDMI-A-1': false, 'DP-1': true },
        apps: { slack: false },
      }),
    ).toEqual({
      monitors: { 'HDMI-A-1': false, 'DP-1': true },
      apps: { slack: false },
    })
  })

  it('ignores non-boolean entries', () => {
    expect(parsePolicy({ monitors: { 'DP-1': 'no' }, apps: { slack: 0 } })).toEqual({
      monitors: {},
      apps: {},
    })
  })

  it('treats a non-object monitors or apps map as empty', () => {
    expect(parsePolicy({ monitors: ['DP-1'], apps: null })).toEqual({
      monitors: {},
      apps: {},
    })
    expect(parsePolicy({ monitors: 'nope', apps: 3 })).toEqual({
      monitors: {},
      apps: {},
    })
  })

  it('rejects a non-object payload', () => {
    expect(() => parsePolicy(null)).toThrow(/policy/)
    expect(() => parsePolicy('nope')).toThrow(/policy/)
    expect(() => parsePolicy([])).toThrow(/policy/)
  })
})

describe('allow checks', () => {
  it('allows unknown monitors and apps', () => {
    expect(isMonitorAllowed(DEFAULT_POLICY, 'DP-1')).toBe(true)
    expect(isAppAllowed(DEFAULT_POLICY, 'firefox')).toBe(true)
  })

  it('honors explicit off and on', () => {
    const policy = parsePolicy({
      monitors: { 'HDMI-A-1': false, 'DP-1': true },
      apps: { slack: false, firefox: true },
    })
    expect(isMonitorAllowed(policy, 'HDMI-A-1')).toBe(false)
    expect(isMonitorAllowed(policy, 'DP-1')).toBe(true)
    expect(isAppAllowed(policy, 'slack')).toBe(false)
    expect(isAppAllowed(policy, 'firefox')).toBe(true)
  })
})

describe('toggles', () => {
  it('turns a monitor off and back on', () => {
    const off = toggleMonitor(DEFAULT_POLICY, 'DP-1', false)
    expect(isMonitorAllowed(off, 'DP-1')).toBe(false)
    expect(isMonitorAllowed(toggleMonitor(off, 'DP-1', true), 'DP-1')).toBe(true)
  })

  it('turns an app off without changing other apps', () => {
    const next = toggleApp(DEFAULT_POLICY, 'slack', false)
    expect(isAppAllowed(next, 'slack')).toBe(false)
    expect(isAppAllowed(next, 'firefox')).toBe(true)
  })
})

describe('serializePolicy', () => {
  it('round-trips flags', () => {
    const policy = toggleApp(toggleMonitor(DEFAULT_POLICY, 'HDMI-A-1', false), 'slack', false)
    expect(parsePolicy(JSON.parse(serializePolicy(policy)))).toEqual(policy)
  })

  it('round-trips paused state and preserves it across monitor/app toggles', () => {
    expect(isPaused(DEFAULT_POLICY)).toBe(false)
    const paused = setPaused(DEFAULT_POLICY, true)
    expect(isPaused(paused)).toBe(true)
    expect(parsePolicy(JSON.parse(serializePolicy(paused)))).toEqual(paused)
    expect(isPaused(toggleMonitor(paused, 'DP-1', false))).toBe(true)
    expect(isPaused(toggleApp(paused, 'slack', false))).toBe(true)
    const resumed = setPaused(paused, false)
    expect(isPaused(resumed)).toBe(false)
    expect(
      setPaused({ monitors: { 'DP-1': false }, apps: { slack: false }, paused: true }, false),
    ).toEqual({ monitors: { 'DP-1': false }, apps: { slack: false } })
    expect(parsePolicy({ paused: 'yes' })).toEqual({ monitors: {}, apps: {} })
    expect(parsePolicy({ paused: false })).toEqual({ monitors: {}, apps: {} })
    expect(parsePolicy({ paused: true })).toEqual({ monitors: {}, apps: {}, paused: true })
  })
})
