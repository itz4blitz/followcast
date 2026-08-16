import { describe, expect, it } from 'vitest'
import { reduceSession } from '../../src/domain/session.ts'
import { monitor, options, windowSnap } from '../fixtures.ts'
import type { DesktopSnapshot, SessionState } from '../../src/domain/types.ts'

const empty: SessionState = { last: null, pendingFollow: null }

function desktop(overrides: Partial<DesktopSnapshot> = {}): DesktopSnapshot {
  const fox = windowSnap({ address: '0xfox', className: 'firefox', title: 'Mozilla Firefox' })
  return {
    focusedAddress: fox.address,
    windows: [fox],
    monitors: [monitor()],
    ...overrides,
  }
}

describe('reduceSession', () => {
  it('emits a stream command on the first follow', () => {
    const step = reduceSession(empty, desktop(), options())
    expect(step.command).toBe("--region '10,20 800x600 DP-1'")
    expect(step.state.last).toEqual({
      kind: 'follow',
      address: '0xfox',
      region: { output: 'DP-1', x: 10, y: 20, width: 800, height: 600 },
    })
  })

  it('emits nothing when the followed region has not changed', () => {
    const first = reduceSession(empty, desktop(), options())
    const second = reduceSession(first.state, desktop(), options())
    expect(second.command).toBeNull()
    expect(second.state).toEqual(first.state)
  })

  it('emits a new command when keyboard focus moves to another monitor', () => {
    const first = reduceSession(empty, desktop(), options())
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0 })
    const code = windowSnap({
      address: '0xcode',
      className: 'Code',
      monitorId: 1,
      at: { x: 1700, y: 80 },
      size: { width: 200, height: 100 },
    })
    const moved = reduceSession(
      first.state,
      desktop({
        focusedAddress: code.address,
        windows: [code],
        monitors: [monitor(), hdmi],
      }),
      options(),
    )
    expect(moved.command).toBe("--region '1700,80 200x100 HDMI-A-1'")
    expect(moved.state.last?.kind).toBe('follow')
  })

  it('emits a new command when the same window is resized', () => {
    const first = reduceSession(empty, desktop(), options())
    const resized = windowSnap({
      address: '0xfox',
      className: 'firefox',
      title: 'Mozilla Firefox',
      size: { width: 400, height: 300 },
    })
    const step = reduceSession(first.state, desktop({ windows: [resized] }), options())
    expect(step.command).toBe("--region '10,20 400x300 DP-1'")
  })

  it('emits nothing and keeps the last follow when the user focuses Followcast itself', () => {
    const first = reduceSession(empty, desktop(), options())
    const self = windowSnap({
      address: '0xself',
      className: 'at.yrlf.wl_mirror',
      title: 'Followcast',
    })
    const held = reduceSession(
      first.state,
      desktop({ focusedAddress: self.address, windows: [self] }),
      options(),
    )
    expect(held.command).toBeNull()
    expect(held.state.last).toEqual(first.state.last)
  })

  it('emits nothing on the first tick if there is nothing to follow', () => {
    const step = reduceSession(empty, desktop({ focusedAddress: null }), options())
    expect(step.command).toBeNull()
    expect(step.state.last).toEqual({ kind: 'hold', reason: 'missing' })
  })

  it('updates a hold reason when the desktop is still not followable', () => {
    const missing = reduceSession(empty, desktop({ focusedAddress: null }), options())
    expect(missing.state.last).toEqual({ kind: 'hold', reason: 'missing' })
    const unmapped = windowSnap({ address: '0xhide', mapped: false })
    const next = reduceSession(
      missing.state,
      desktop({ focusedAddress: unmapped.address, windows: [unmapped] }),
      options(),
    )
    expect(next.command).toBeNull()
    expect(next.state.last).toEqual({ kind: 'hold', reason: 'unmapped' })
  })

  it('points wl-mirror at the privacy card when an app is toggled off', () => {
    const card = { output: 'DP-1', x: 20, y: 30, width: 640, height: 360 }
    const slack = windowSnap({ address: '0xslack', className: 'slack', title: 'Slack' })
    const step = reduceSession(
      empty,
      desktop({ focusedAddress: slack.address, windows: [slack] }),
      options({
        policy: { monitors: {}, apps: { slack: false } },
        privacyRegion: card,
      }),
    )
    expect(step.command).toBe("--region '20,30 640x360 DP-1'")
    expect(step.state.last?.kind).toBe('privacy')
  })

  it('does not re-emit when staying on the privacy card for another blocked app', () => {
    const card = { output: 'DP-1', x: 20, y: 30, width: 640, height: 360 }
    const slack = windowSnap({ address: '0xslack', className: 'slack', title: 'Slack' })
    const first = reduceSession(
      empty,
      desktop({ focusedAddress: slack.address, windows: [slack] }),
      options({
        policy: { monitors: {}, apps: { slack: false, zoom: false } },
        privacyRegion: card,
      }),
    )
    const zoom = windowSnap({ address: '0xzoom', className: 'zoom', title: 'Zoom' })
    const second = reduceSession(
      first.state,
      desktop({ focusedAddress: zoom.address, windows: [zoom] }),
      options({
        policy: { monitors: {}, apps: { slack: false, zoom: false } },
        privacyRegion: card,
      }),
    )
    expect(second.command).toBeNull()
    expect(second.state.last).toMatchObject({ kind: 'privacy', className: 'zoom' })
  })

  it('keeps the last live app when privacy triggers but the card window is missing', () => {
    const first = reduceSession(empty, desktop(), options())
    const slack = windowSnap({ address: '0xslack', className: 'slack', title: 'Slack' })
    const blocked = reduceSession(
      first.state,
      desktop({ focusedAddress: slack.address, windows: [slack] }),
      options({ policy: { monitors: {}, apps: { slack: false } }, privacyRegion: null }),
    )
    expect(blocked.command).toBeNull()
    expect(blocked.state.last?.kind).toBe('follow')
  })

  it('records privacy without a stream command when the card is missing on the first tick', () => {
    const slack = windowSnap({ address: '0xslack', className: 'slack', title: 'Slack' })
    const step = reduceSession(
      empty,
      desktop({ focusedAddress: slack.address, windows: [slack] }),
      options({ policy: { monitors: {}, apps: { slack: false } }, privacyRegion: null }),
    )
    expect(step.command).toBeNull()
    expect(step.state.last).toMatchObject({ kind: 'privacy', className: 'slack' })
  })

  it('updates the blocked app when privacy stays on and the card is still missing', () => {
    const slack = windowSnap({ address: '0xslack', className: 'slack', title: 'Slack' })
    const first = reduceSession(
      empty,
      desktop({ focusedAddress: slack.address, windows: [slack] }),
      options({
        policy: { monitors: {}, apps: { slack: false, zoom: false } },
        privacyRegion: null,
      }),
    )
    const zoom = windowSnap({ address: '0xzoom', className: 'zoom', title: 'Zoom' })
    const second = reduceSession(
      first.state,
      desktop({ focusedAddress: zoom.address, windows: [zoom] }),
      options({
        policy: { monitors: {}, apps: { slack: false, zoom: false } },
        privacyRegion: null,
      }),
    )
    expect(second.command).toBeNull()
    expect(second.state.last).toMatchObject({ kind: 'privacy', className: 'zoom' })
  })

  it('emits a follow after a hold once a real window is focused', () => {
    const held = reduceSession(empty, desktop({ focusedAddress: null }), options())
    const followed = reduceSession(held.state, desktop(), options())
    expect(followed.command).toBe("--region '10,20 800x600 DP-1'")
  })

  it('plays a monitor slide before following an app on another display', () => {
    const slot = { output: 'DP-1', x: 1, y: 2, width: 480, height: 270 }
    const first = reduceSession(empty, desktop(), options({ privacyRegion: slot }), 0)
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0 })
    const code = windowSnap({
      address: '0xcode',
      className: 'Code',
      monitorId: 1,
      at: { x: 1700, y: 80 },
      size: { width: 200, height: 100 },
    })
    const moved = reduceSession(
      first.state,
      desktop({
        focusedAddress: code.address,
        windows: [code],
        monitors: [monitor(), hdmi],
      }),
      options({ privacyRegion: slot }),
      10,
    )
    expect(moved.command).toBe("--region '1,2 480x270 DP-1'")
    expect(moved.state.last).toMatchObject({
      kind: 'transition',
      direction: 'right',
      fromLabel: 'Display 1',
      toLabel: 'Display 2',
      fromOutput: 'DP-1',
      toOutput: 'HDMI-A-1',
      untilMs: 460,
    })
    expect(moved.state.pendingFollow).toMatchObject({ kind: 'follow', address: '0xcode' })
    const held = reduceSession(
      moved.state,
      desktop({
        focusedAddress: code.address,
        windows: [code],
        monitors: [monitor(), hdmi],
      }),
      options({ privacyRegion: slot }),
      200,
    )
    expect(held.command).toBeNull()
    expect(held.state).toBe(moved.state)
    const landed = reduceSession(
      held.state,
      desktop({
        focusedAddress: code.address,
        windows: [code],
        monitors: [monitor(), hdmi],
      }),
      options({ privacyRegion: slot }),
      460,
    )
    expect(landed.command).toBe("--region '1700,80 200x100 HDMI-A-1'")
    expect(landed.state.last?.kind).toBe('follow')
    expect(landed.state.pendingFollow).toBeNull()
  })

  it('keeps the slide playing when focus is lost mid-transition', () => {
    const slot = { output: 'DP-1', x: 1, y: 2, width: 480, height: 270 }
    const first = reduceSession(empty, desktop(), options({ privacyRegion: slot }), 0)
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0 })
    const code = windowSnap({
      address: '0xcode',
      className: 'Code',
      monitorId: 1,
      at: { x: 1700, y: 80 },
      size: { width: 200, height: 100 },
    })
    const moved = reduceSession(
      first.state,
      desktop({
        focusedAddress: code.address,
        windows: [code],
        monitors: [monitor(), hdmi],
      }),
      options({ privacyRegion: slot }),
      10,
    )
    const lost = reduceSession(
      moved.state,
      desktop({ focusedAddress: null, windows: [code], monitors: [monitor(), hdmi] }),
      options({ privacyRegion: slot }),
      80,
    )
    expect(lost.command).toBeNull()
    expect(lost.state.last?.kind).toBe('transition')
    const expiredHold = reduceSession(
      moved.state,
      desktop({ focusedAddress: null, windows: [code], monitors: [monitor(), hdmi] }),
      options({ privacyRegion: slot }),
      460,
    )
    expect(expiredHold.state.last).toMatchObject({ kind: 'hold', reason: 'missing' })
  })

  it('restarts the slide when focus jumps to a third monitor mid-transition', () => {
    const slot = { output: 'DP-1', x: 1, y: 2, width: 480, height: 270 }
    const first = reduceSession(empty, desktop(), options({ privacyRegion: slot }), 0)
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0 })
    const dell = monitor({
      id: 2,
      name: 'DP-3',
      x: 200,
      y: 900,
      width: 1920,
      height: 1080,
      scale: 1,
    })
    const code = windowSnap({
      address: '0xcode',
      className: 'Code',
      monitorId: 1,
      at: { x: 1700, y: 80 },
      size: { width: 200, height: 100 },
    })
    const mail = windowSnap({
      address: '0xmail',
      className: 'thunderbird',
      monitorId: 2,
      at: { x: 220, y: 920 },
      size: { width: 200, height: 100 },
    })
    const toHdmi = reduceSession(
      first.state,
      desktop({
        focusedAddress: code.address,
        windows: [code],
        monitors: [monitor(), hdmi, dell],
      }),
      options({ privacyRegion: slot }),
      10,
    )
    const toDell = reduceSession(
      { ...toHdmi.state, pendingFollow: null },
      desktop({
        focusedAddress: mail.address,
        windows: [mail],
        monitors: [monitor(), hdmi, dell],
      }),
      options({ privacyRegion: slot }),
      80,
    )
    expect(toDell.command).toBe("--region '1,2 480x270 DP-1'")
    expect(toDell.state.last).toMatchObject({
      kind: 'transition',
      fromOutput: 'DP-1',
      toOutput: 'DP-3',
      direction: 'down',
    })
    expect(toDell.state.pendingFollow).toMatchObject({ address: '0xmail' })
  })

  it('updates the pending window when focus stays on the destination monitor during the slide', () => {
    const slot = { output: 'DP-1', x: 1, y: 2, width: 480, height: 270 }
    const first = reduceSession(empty, desktop(), options({ privacyRegion: slot }), 0)
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0 })
    const code = windowSnap({
      address: '0xcode',
      className: 'Code',
      monitorId: 1,
      at: { x: 1700, y: 80 },
      size: { width: 200, height: 100 },
    })
    const other = windowSnap({
      address: '0xother',
      className: 'Code',
      monitorId: 1,
      at: { x: 1710, y: 90 },
      size: { width: 120, height: 80 },
    })
    const moved = reduceSession(
      first.state,
      desktop({
        focusedAddress: code.address,
        windows: [code],
        monitors: [monitor(), hdmi],
      }),
      options({ privacyRegion: slot }),
      10,
    )
    const swapped = reduceSession(
      moved.state,
      desktop({
        focusedAddress: other.address,
        windows: [other],
        monitors: [monitor(), hdmi],
      }),
      options({ privacyRegion: slot }),
      80,
    )
    expect(swapped.command).toBeNull()
    expect(swapped.state.last?.kind).toBe('transition')
    expect(swapped.state.pendingFollow).toMatchObject({ address: '0xother' })
  })
})
