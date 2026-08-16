import { describe, expect, it } from 'vitest'
import {
  parseActiveWindow,
  parseClients,
  parseMonitors,
  toDesktopSnapshot,
} from '../../src/hyprland/parse.ts'

const clientsJson = [
  {
    address: '0x5557520c2f20',
    mapped: true,
    hidden: false,
    at: [1612, 38],
    size: [1576, 850],
    monitor: 1,
    class: 'Spotify',
    title: 'Pearl Jam - Even Flow',
    extraIgnored: true,
  },
  {
    address: '0x555751f58900',
    mapped: true,
    hidden: false,
    at: [212, 940],
    size: [1416, 758],
    monitor: 2,
    class: 'org.mozilla.Thunderbird',
    title: 'Mail',
  },
]

const monitorsJson = [
  {
    id: 0,
    name: 'DP-1',
    width: 2560,
    height: 1440,
    x: 0,
    y: 0,
    scale: 1.6,
    focused: false,
  },
  {
    id: 1,
    name: 'HDMI-A-1',
    width: 2560,
    height: 1440,
    x: 1600,
    y: 0,
    scale: 1.6,
    focused: true,
  },
]

describe('parseClients', () => {
  it('reads the hyprctl clients fields Followcast needs and drops the rest', () => {
    expect(parseClients(clientsJson)).toEqual([
      {
        address: '0x5557520c2f20',
        className: 'Spotify',
        title: 'Pearl Jam - Even Flow',
        mapped: true,
        hidden: false,
        monitorId: 1,
        at: { x: 1612, y: 38 },
        size: { width: 1576, height: 850 },
      },
      {
        address: '0x555751f58900',
        className: 'org.mozilla.Thunderbird',
        title: 'Mail',
        mapped: true,
        hidden: false,
        monitorId: 2,
        at: { x: 212, y: 940 },
        size: { width: 1416, height: 758 },
      },
    ])
  })

  it('rejects a non-array payload', () => {
    expect(() => parseClients({ address: '0x1' })).toThrow(/clients/)
  })

  it('rejects a client missing an address', () => {
    expect(() => parseClients([{ mapped: true }])).toThrow(/address/)
  })
})

describe('parseMonitors', () => {
  it('reads layout origin, physical size, and scale', () => {
    expect(parseMonitors(monitorsJson)).toEqual([
      {
        id: 0,
        name: 'DP-1',
        width: 2560,
        height: 1440,
        x: 0,
        y: 0,
        scale: 1.6,
        focused: false,
      },
      {
        id: 1,
        name: 'HDMI-A-1',
        width: 2560,
        height: 1440,
        x: 1600,
        y: 0,
        scale: 1.6,
        focused: true,
      },
    ])
  })

  it('rejects a monitor with scale 0', () => {
    const first = monitorsJson[0]
    expect(first).toBeDefined()
    if (first === undefined) {
      throw new Error('fixture missing')
    }
    expect(() => parseMonitors([{ ...first, scale: 0 }])).toThrow(/^monitors:[\s\S]*scale/)
  })
})

describe('parseActiveWindow', () => {
  it('returns the address of the focused client', () => {
    expect(parseActiveWindow({ address: '0x5557520c2f20', title: 'x' })).toBe('0x5557520c2f20')
  })

  it('returns null when hyprctl reports an empty object (no focused window)', () => {
    expect(parseActiveWindow({})).toBeNull()
  })

  it('returns null for a non-object payload', () => {
    expect(parseActiveWindow(null)).toBeNull()
    expect(parseActiveWindow('0xabc')).toBeNull()
  })
})

describe('toDesktopSnapshot', () => {
  it('assembles a domain snapshot from the three hyprctl payloads', () => {
    const snapshot = toDesktopSnapshot(clientsJson, monitorsJson, {
      address: '0x5557520c2f20',
    })
    expect(snapshot.focusedAddress).toBe('0x5557520c2f20')
    expect(snapshot.windows).toHaveLength(2)
    expect(snapshot.monitors).toHaveLength(2)
    expect(snapshot.windows[0]?.className).toBe('Spotify')
    expect(snapshot.monitors[1]?.name).toBe('HDMI-A-1')
  })
})
