import { describe, expect, it } from 'vitest'
import { runFollowcast, startFollowcast } from '../../src/app/followcast.ts'
import { options } from '../fixtures.ts'
import { AsyncQueue } from './queue.ts'

const dp1 = {
  id: 0,
  name: 'DP-1',
  width: 2560,
  height: 1440,
  x: 0,
  y: 0,
  scale: 1,
  focused: true,
}

const hdmi = {
  id: 1,
  name: 'HDMI-A-1',
  width: 2560,
  height: 1440,
  x: 2560,
  y: 0,
  scale: 1,
  focused: false,
}

const fox = {
  address: '0xfox',
  mapped: true,
  hidden: false,
  at: [10, 20],
  size: [800, 600],
  monitor: 0,
  class: 'firefox',
  title: 'Mozilla Firefox',
}

const code = {
  address: '0xcode',
  mapped: true,
  hidden: false,
  at: [2600, 40],
  size: [400, 300],
  monitor: 1,
  class: 'Code',
  title: 'followcast.ts',
}

const selfMirror = {
  address: '0xself',
  mapped: true,
  hidden: false,
  at: [0, 0],
  size: [640, 360],
  monitor: 0,
  class: 'at.yrlf.wl_mirror',
  title: 'Followcast',
}

type World = {
  clients: unknown[]
  monitors: unknown[]
  active: unknown
  events: AsyncQueue<string>
  ticks: AsyncQueue<void>
  started: string[]
  sent: string[]
  stops: number
}

function world(seed: Partial<World> = {}): World {
  return {
    clients: [fox],
    monitors: [dp1, hdmi],
    active: { address: '0xfox' },
    events: new AsyncQueue<string>(),
    ticks: new AsyncQueue<void>(),
    started: [],
    sent: [],
    stops: 0,
    ...seed,
  }
}

function portsOf(w: World) {
  return {
    hyprland: {
      clients: async () => w.clients,
      monitors: async () => w.monitors,
      activeWindow: async () => w.active,
      events: () => w.events,
    },
    mirror: {
      start: async (output: string) => {
        w.started.push(output)
      },
      send: (line: string) => {
        w.sent.push(line)
      },
      stop: async () => {
        w.stops += 1
      },
    },
    clock: { ticks: w.ticks },
  }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('timed out waiting for Followcast to apply')
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
  }
}

async function shutdown(
  controller: AbortController,
  w: World,
  finished: Promise<void>,
): Promise<void> {
  controller.abort()
  w.events.close()
  w.ticks.close()
  await finished
}

describe('runFollowcast', () => {
  it('starts wl-mirror on the focused monitor and shares the focused app', async () => {
    const w = world()
    const controller = new AbortController()
    const handle = startFollowcast(portsOf(w), options(), controller.signal)
    await handle.ready
    expect(w.started).toEqual(['DP-1'])
    expect(w.sent).toEqual(["--region '10,20 800x600 DP-1'"])
    await shutdown(controller, w, handle.finished)
    expect(w.stops).toBe(1)
  })

  it('retargets onto the other monitor when keyboard focus follows an app there', async () => {
    const w = world()
    const controller = new AbortController()
    const handle = startFollowcast(portsOf(w), options(), controller.signal)
    await handle.ready
    w.clients = [fox, code]
    w.active = { address: '0xcode' }
    w.events.push('activewindowv2>>0xcode')
    await waitUntil(() => w.sent.length === 2)
    expect(w.sent).toEqual(["--region '10,20 800x600 DP-1'", "--region '2600,40 400x300 HDMI-A-1'"])
    await shutdown(controller, w, handle.finished)
  })

  it('does not retarget when the user focuses the Followcast window itself', async () => {
    const w = world()
    const controller = new AbortController()
    const handle = startFollowcast(portsOf(w), options(), controller.signal)
    await handle.ready
    w.clients = [fox, selfMirror]
    w.active = { address: '0xself' }
    w.events.push('activewindowv2>>0xself')
    await waitUntil(() => w.clients.length === 2)
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    expect(w.sent).toEqual(["--region '10,20 800x600 DP-1'"])
    await shutdown(controller, w, handle.finished)
  })

  it('ignores title-only events and does not re-query', async () => {
    const w = world()
    let clientReads = 0
    const p = portsOf(w)
    const hyprland = {
      ...p.hyprland,
      clients: async () => {
        clientReads += 1
        return w.clients
      },
    }
    const controller = new AbortController()
    const handle = startFollowcast({ ...p, hyprland }, options(), controller.signal)
    await handle.ready
    const afterStart = clientReads
    w.events.push('windowtitle>>0xfox,spam')
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    expect(clientReads).toBe(afterStart)
    await shutdown(controller, w, handle.finished)
  })

  it('re-reads geometry on a clock tick so a resize follows without a Hyprland resize event', async () => {
    const w = world()
    const controller = new AbortController()
    const handle = startFollowcast(portsOf(w), options(), controller.signal)
    await handle.ready
    w.clients = [{ ...fox, size: [200, 100] }]
    w.ticks.push(undefined)
    await waitUntil(() => w.sent.at(-1) === "--region '10,20 200x100 DP-1'")
    await shutdown(controller, w, handle.finished)
  })

  it('finishes immediately when the signal is already aborted', async () => {
    const w = world()
    const controller = new AbortController()
    controller.abort()
    const handle = startFollowcast(portsOf(w), options(), controller.signal)
    await handle.ready
    await handle.finished
    expect(w.started).toEqual(['DP-1'])
    expect(w.stops).toBe(1)
  })

  it('emits again when focus returns to the first app after visiting another', async () => {
    const w = world()
    const controller = new AbortController()
    const handle = startFollowcast(portsOf(w), options(), controller.signal)
    await handle.ready
    w.clients = [fox, code]
    w.active = { address: '0xcode' }
    w.events.push('activewindowv2>>0xcode')
    await waitUntil(() => w.sent.length === 2)
    w.active = { address: '0xfox' }
    w.events.push('activewindowv2>>0xfox')
    await waitUntil(() => w.sent.length === 3)
    expect(w.sent[2]).toBe("--region '10,20 800x600 DP-1'")
    await shutdown(controller, w, handle.finished)
  })

  it('finishes on abort even if the Hyprland socket stays open', async () => {
    const w = world()
    const controller = new AbortController()
    const handle = startFollowcast(portsOf(w), options(), controller.signal)
    await handle.ready
    controller.abort()
    await handle.finished
    expect(w.stops).toBe(1)
  })

  it('retargets on ticks when focus moves away and back', async () => {
    const w = world()
    const controller = new AbortController()
    const handle = startFollowcast(portsOf(w), options(), controller.signal)
    await handle.ready
    w.clients = [fox, code]
    w.active = { address: '0xcode' }
    w.ticks.push(undefined)
    await waitUntil(() => w.sent.length === 2)
    w.active = { address: '0xfox' }
    w.ticks.push(undefined)
    await waitUntil(() => w.sent.length === 3)
    expect(w.sent[2]).toBe("--region '10,20 800x600 DP-1'")
    await shutdown(controller, w, handle.finished)
  })

  it('ignores events that arrive after abort', async () => {
    const w = world()
    const controller = new AbortController()
    const handle = startFollowcast(portsOf(w), options(), controller.signal)
    await handle.ready
    controller.abort()
    w.clients = [fox, code]
    w.active = { address: '0xcode' }
    w.events.push('activewindowv2>>0xcode')
    w.ticks.push(undefined)
    for (let extra = 0; extra < 8; extra += 1) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
    }
    w.events.close()
    w.ticks.close()
    await handle.finished
    expect(w.sent).toEqual(["--region '10,20 800x600 DP-1'"])
  })

  it('does not apply a refresh that started after abort', async () => {
    const w = world()
    const controller = new AbortController()
    let release: (() => void) | undefined
    let reads = 0
    const p = portsOf(w)
    const hyprland = {
      ...p.hyprland,
      clients: async () => {
        reads += 1
        if (reads === 1) {
          return w.clients
        }
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return w.clients
      },
    }
    const handle = startFollowcast({ ...p, hyprland }, options(), controller.signal)
    await handle.ready
    w.clients = [{ ...fox, size: [50, 50] }]
    w.events.push('movewindowv2>>0xfox,1,1')
    await waitUntil(() => release !== undefined)
    controller.abort()
    const finishHang = release
    expect(finishHang).toBeDefined()
    if (finishHang === undefined) {
      throw new Error('refresh did not start')
    }
    finishHang()
    await waitUntil(() => w.sent.length >= 1)
    for (let extra = 0; extra < 8; extra += 1) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
    }
    w.events.close()
    w.ticks.close()
    await handle.finished
    expect(w.sent).toEqual(["--region '10,20 800x600 DP-1'"])
  })

  it('publishes the privacy card when the focused app is toggled off', async () => {
    const w = world()
    const published: Array<{ appLabel: string } | null> = []
    const controller = new AbortController()
    const ports = {
      ...portsOf(w),
      privacyCard: {
        publish: (card: { appLabel: string } | null) => {
          published.push(card)
        },
      },
    }
    const handle = startFollowcast(
      ports,
      options({ policy: { monitors: {}, apps: { firefox: false } } }),
      controller.signal,
    )
    await handle.ready
    expect(published).toEqual([{ appLabel: 'Mozilla Firefox' }])
    await shutdown(controller, w, handle.finished)
  })

  it('still follows privacy without a card publisher', async () => {
    const w = world()
    const controller = new AbortController()
    const handle = startFollowcast(
      portsOf(w),
      options({ policy: { monitors: {}, apps: { firefox: false } } }),
      controller.signal,
    )
    await handle.ready
    expect(w.started).toEqual(['DP-1'])
    expect(w.sent).toEqual([])
    await shutdown(controller, w, handle.finished)
    expect(w.stops).toBe(1)
  })

  it('does not publish a privacy card while sharing an allowed app', async () => {
    const w = world()
    const published: Array<{ appLabel: string } | null> = []
    const controller = new AbortController()
    const ports = {
      ...portsOf(w),
      privacyCard: {
        publish: (card: { appLabel: string } | null) => {
          published.push(card)
        },
      },
    }
    const handle = startFollowcast(ports, options(), controller.signal)
    await handle.ready
    expect(published).toEqual([])
    expect(w.sent).toEqual(["--region '10,20 800x600 DP-1'"])
    await shutdown(controller, w, handle.finished)
  })

  it('throws before starting the mirror when no monitor exists', async () => {
    const w = world({ monitors: [] })
    await expect(
      runFollowcast(portsOf(w), options(), new AbortController().signal),
    ).rejects.toThrow(/no monitor/)
    expect(w.started).toEqual([])
    expect(w.stops).toBe(0)
  })
})
