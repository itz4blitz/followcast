import { describe, expect, it } from 'vitest'
import { shareStatus } from '../../src/domain/shareStatus.ts'
import { monitor, options, windowSnap } from '../fixtures.ts'
import type { DesktopSnapshot } from '../../src/domain/types.ts'

describe('shareStatus', () => {
  it('lists monitors and their apps with allow flags for the bar', () => {
    const hdmi = monitor({ id: 1, name: 'HDMI-A-1', x: 1600, y: 0, focused: false })
    const fox = windowSnap({ address: '0xfox', className: 'firefox', title: 'Mozilla Firefox' })
    const slack = windowSnap({
      address: '0xslack',
      className: 'slack',
      title: 'Slack',
      monitorId: 1,
      at: { x: 1700, y: 80 },
    })
    const snapshot: DesktopSnapshot = {
      focusedAddress: slack.address,
      windows: [fox, slack],
      monitors: [monitor(), hdmi],
    }
    const status = shareStatus(
      snapshot,
      options({
        policy: { monitors: { 'HDMI-A-1': false }, apps: { slack: false } },
      }),
    )
    expect(status.decision.kind).toBe('privacy')
    expect(status.monitors).toEqual([
      {
        name: 'DP-1',
        enabled: true,
        apps: [{ className: 'firefox', title: 'Mozilla Firefox', enabled: true }],
      },
      {
        name: 'HDMI-A-1',
        enabled: false,
        apps: [{ className: 'slack', title: 'Slack', enabled: false }],
      },
    ])
  })

  it('skips Followcast surfaces in the app list', () => {
    const card = windowSnap({
      address: '0xcard',
      className: 'followcast.surface',
      title: 'Followcast',
    })
    const mirror = windowSnap({
      address: '0xself',
      className: 'at.yrlf.wl_mirror',
      title: 'DP-1',
    })
    const titled = windowSnap({
      address: '0xtitle',
      className: 'custom-mirror',
      title: 'Followcast live',
    })
    const fox = windowSnap({ address: '0xfox', className: 'firefox', title: 'Firefox' })
    const status = shareStatus(
      {
        focusedAddress: fox.address,
        windows: [fox, card, mirror, titled],
        monitors: [monitor()],
      },
      options({ selfTitleIncludes: ['Nope', 'Followcast'] }),
    )
    expect(status.monitors[0]?.apps).toEqual([
      { className: 'firefox', title: 'Firefox', enabled: true },
    ])
  })

  it('lists each window of the same app so the bar can show titles only when there are two', () => {
    const first = windowSnap({ address: '0xone', className: 'firefox', title: 'Mozilla Firefox' })
    const second = windowSnap({
      address: '0xtwo',
      className: 'firefox',
      title: 'another tab',
      at: { x: 40, y: 40 },
    })
    const bare = windowSnap({
      address: '0xbare',
      className: 'secret',
      title: '',
      at: { x: 80, y: 80 },
    })
    const status = shareStatus(
      {
        focusedAddress: first.address,
        windows: [first, second, bare],
        monitors: [monitor()],
      },
      options(),
    )
    expect(status.monitors[0]?.apps).toEqual([
      { className: 'firefox', title: 'Mozilla Firefox', enabled: true },
      { className: 'firefox', title: 'another tab', enabled: true },
      { className: 'secret', title: 'secret', enabled: true },
    ])
  })
})
