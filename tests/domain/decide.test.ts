import { describe, expect, it } from 'vitest'
import { decideFollow } from '../../src/domain/decide.ts'
import { monitor, options, windowSnap } from '../fixtures.ts'
import type { DesktopSnapshot } from '../../src/domain/types.ts'

function desktop(overrides: Partial<DesktopSnapshot> = {}): DesktopSnapshot {
  const firefox = windowSnap({ address: '0xfox', className: 'firefox', title: 'Mozilla Firefox' })
  return {
    focusedAddress: firefox.address,
    windows: [firefox],
    monitors: [monitor()],
    ...overrides,
  }
}

describe('decideFollow', () => {
  it('follows the focused window on its monitor', () => {
    const snapshot = desktop()
    expect(decideFollow(snapshot, options())).toEqual({
      kind: 'follow',
      address: '0xfox',
      region: { output: 'DP-1', x: 0, y: 0, width: 1600, height: 900 },
    })
  })

  it('holds when nothing is focused', () => {
    expect(decideFollow(desktop({ focusedAddress: null }), options())).toEqual({
      kind: 'hold',
      reason: 'missing',
    })
  })

  it('holds when the focused address is not in the client list', () => {
    expect(decideFollow(desktop({ focusedAddress: '0xdead' }), options())).toEqual({
      kind: 'hold',
      reason: 'missing',
    })
  })

  it('holds when the focused window is unmapped', () => {
    const hidden = windowSnap({ address: '0xhide', mapped: false })
    expect(
      decideFollow(desktop({ focusedAddress: hidden.address, windows: [hidden] }), options()),
    ).toEqual({ kind: 'hold', reason: 'unmapped' })
  })

  it('holds when the focused window is hidden', () => {
    const hidden = windowSnap({ address: '0xhide', hidden: true })
    expect(
      decideFollow(desktop({ focusedAddress: hidden.address, windows: [hidden] }), options()),
    ).toEqual({ kind: 'hold', reason: 'unmapped' })
  })

  it('holds when the focused window is Followcast itself by class', () => {
    const self = windowSnap({
      address: '0xself',
      className: 'at.yrlf.wl_mirror',
      title: 'DP-1',
    })
    expect(
      decideFollow(desktop({ focusedAddress: self.address, windows: [self] }), options()),
    ).toEqual({ kind: 'hold', reason: 'self' })
  })

  it('holds when any configured self-title needle matches', () => {
    const self = windowSnap({
      address: '0xself',
      className: 'custom-mirror',
      title: 'Followcast live',
    })
    expect(
      decideFollow(
        desktop({ focusedAddress: self.address, windows: [self] }),
        options({ selfTitleIncludes: ['Nope', 'Followcast'] }),
      ),
    ).toEqual({ kind: 'hold', reason: 'self' })
  })

  it('follows a regular app whose title only mentions Followcast', () => {
    const term = windowSnap({
      address: '0xterm',
      className: 'foot',
      title: 'grok — Hyprland Followcast picker',
    })
    expect(
      decideFollow(desktop({ focusedAddress: term.address, windows: [term] }), options()),
    ).toEqual({
      kind: 'follow',
      address: '0xterm',
      region: { output: 'DP-1', x: 0, y: 0, width: 1600, height: 900 },
    })
  })

  it('shows the privacy card when the focused class is on the deny list', () => {
    const zoom = windowSnap({ address: '0xzoom', className: 'zoom', title: 'Zoom Meeting' })
    expect(
      decideFollow(
        desktop({ focusedAddress: zoom.address, windows: [zoom] }),
        options({ denyClasses: ['zoom'] }),
      ),
    ).toEqual({
      kind: 'privacy',
      className: 'zoom',
      appLabel: 'Zoom Meeting',
      monitorName: 'DP-1',
      reason: 'app-off',
    })
  })

  it('shows the privacy card when the focused app is toggled off', () => {
    const slack = windowSnap({ address: '0xslack', className: 'slack', title: 'Slack' })
    expect(
      decideFollow(
        desktop({ focusedAddress: slack.address, windows: [slack] }),
        options({ policy: { monitors: {}, apps: { slack: false } } }),
      ),
    ).toEqual({
      kind: 'privacy',
      className: 'slack',
      appLabel: 'Slack',
      monitorName: 'DP-1',
      reason: 'app-off',
    })
  })

  it('prefers the monitor-off card when both the monitor and the app are muted', () => {
    const slack = windowSnap({ address: '0xslack', className: 'slack', title: 'Slack' })
    expect(
      decideFollow(
        desktop({ focusedAddress: slack.address, windows: [slack] }),
        options({ policy: { monitors: { 'DP-1': false }, apps: { slack: false } } }),
      ),
    ).toMatchObject({ kind: 'privacy', reason: 'monitor-off' })
  })

  it('shows the privacy card when the focused window sits on a muted monitor', () => {
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0 })
    const mail = windowSnap({
      address: '0xmail',
      className: 'thunderbird',
      title: 'Inbox',
      monitorId: 1,
      at: { x: 1700, y: 80 },
      size: { width: 200, height: 100 },
    })
    expect(
      decideFollow(
        desktop({
          focusedAddress: mail.address,
          windows: [mail],
          monitors: [monitor(), hdmi],
        }),
        options({ policy: { monitors: { 'HDMI-A-1': false }, apps: {} } }),
      ),
    ).toEqual({
      kind: 'privacy',
      className: 'thunderbird',
      appLabel: 'Inbox',
      monitorName: 'HDMI-A-1',
      reason: 'monitor-off',
    })
  })

  it('uses the class name on the privacy card when the window title is empty', () => {
    const bare = windowSnap({ address: '0xbare', className: 'secret', title: '' })
    expect(
      decideFollow(
        desktop({ focusedAddress: bare.address, windows: [bare] }),
        options({ policy: { monitors: {}, apps: { secret: false } } }),
      ),
    ).toEqual({
      kind: 'privacy',
      className: 'secret',
      appLabel: 'secret',
      monitorName: 'DP-1',
      reason: 'app-off',
    })
  })

  it('holds when the focused window has no matching monitor', () => {
    const stray = windowSnap({ address: '0xstray', monitorId: 9 })
    expect(
      decideFollow(desktop({ focusedAddress: stray.address, windows: [stray] }), options()),
    ).toEqual({ kind: 'hold', reason: 'no-monitor' })
  })

  it('holds when the focused window sits on the headless share surface', () => {
    const dummyHost = monitor({ id: 3, name: 'HEADLESS-1' })
    const stray = windowSnap({ address: '0xstray', monitorId: 3 })
    expect(
      decideFollow(
        desktop({
          focusedAddress: stray.address,
          windows: [stray],
          monitors: [monitor(), dummyHost],
        }),
        options(),
      ),
    ).toEqual({ kind: 'hold', reason: 'no-monitor' })
  })

  it('follows the focused output even when the window box misses the monitor', () => {
    const off = windowSnap({
      address: '0xoff',
      at: { x: 9000, y: 0 },
      size: { width: 10, height: 10 },
    })
    expect(
      decideFollow(desktop({ focusedAddress: off.address, windows: [off] }), options()),
    ).toEqual({
      kind: 'follow',
      address: '0xoff',
      region: { output: 'DP-1', x: 0, y: 0, width: 1600, height: 900 },
    })
  })

  it('follows a window on a second monitor when keyboard focus lands there', () => {
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0 })
    const code = windowSnap({
      address: '0xcode',
      className: 'Code',
      monitorId: 1,
      at: { x: 1700, y: 80 },
      size: { width: 200, height: 100 },
    })
    expect(
      decideFollow(
        desktop({
          focusedAddress: code.address,
          windows: [code],
          monitors: [monitor(), hdmi],
        }),
        options(),
      ),
    ).toEqual({
      kind: 'follow',
      address: '0xcode',
      region: { output: 'HDMI-A-1', x: 1600, y: 0, width: 1600, height: 900 },
    })
  })
})
