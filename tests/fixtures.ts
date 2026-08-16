import { DEFAULT_POLICY } from '../src/domain/policy.ts'
import type { FollowOptions, MonitorSnapshot, WindowSnapshot } from '../src/domain/types.ts'

export function monitor(overrides: Partial<MonitorSnapshot> = {}): MonitorSnapshot {
  return {
    id: 0,
    name: 'DP-1',
    x: 0,
    y: 0,
    width: 2560,
    height: 1440,
    scale: 1.6,
    focused: true,
    ...overrides,
  }
}

export function windowSnap(overrides: Partial<WindowSnapshot> = {}): WindowSnapshot {
  return {
    address: '0xabc',
    className: 'Alacritty',
    title: 'term',
    mapped: true,
    hidden: false,
    monitorId: 0,
    at: { x: 10, y: 20 },
    size: { width: 800, height: 600 },
    ...overrides,
  }
}

export function options(overrides: Partial<FollowOptions> = {}): FollowOptions {
  return {
    selfClasses: ['at.yrlf.wl_mirror', 'followcast-privacy', 'followcast.privacy'],
    selfTitleIncludes: ['Followcast'],
    denyClasses: [],
    policy: DEFAULT_POLICY,
    privacyRegion: null,
    ...overrides,
  }
}
