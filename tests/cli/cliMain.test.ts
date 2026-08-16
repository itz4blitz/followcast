import { describe, expect, it } from 'vitest'
import { buildCliMain, USAGE } from '../../src/cli/cliMain.ts'
import { DEFAULT_POLICY } from '../../src/domain/policy.ts'
import { DEFAULT_FOLLOW_OPTIONS } from '../../src/domain/types.ts'
import type { SharePolicy } from '../../src/domain/policy.ts'
import { AsyncQueue } from '../app/queue.ts'
import type { FollowcastPorts } from '../../src/ports.ts'

const dp1 = {
  id: 0,
  name: 'DP-1',
  width: 1920,
  height: 1080,
  x: 0,
  y: 0,
  scale: 1,
  focused: true,
}

const fox = {
  address: '0xfox',
  mapped: true,
  hidden: false,
  at: [0, 0],
  size: [100, 100],
  monitor: 0,
  class: 'firefox',
  title: 'Mozilla Firefox',
}

const card = {
  address: '0xcard',
  mapped: true,
  hidden: false,
  at: [40, 50],
  size: [640, 360],
  monitor: 0,
  class: 'followcast-privacy',
  title: 'Followcast Privacy',
}

function fakePorts(): {
  ports: FollowcastPorts
  events: AsyncQueue<string>
  ticks: AsyncQueue<void>
} {
  const events = new AsyncQueue<string>()
  const ticks = new AsyncQueue<void>()
  return {
    events,
    ticks,
    ports: {
      hyprland: {
        clients: async () => [fox],
        monitors: async () => [dp1],
        activeWindow: async () => ({ address: '0xfox' }),
        events: () => events,
      },
      mirror: {
        start: async () => {},
        send: () => {},
        stop: async () => {},
      },
      clock: { ticks },
    },
  }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('timed out waiting for CLI Followcast')
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
  }
}

describe('buildCliMain', () => {
  it('writes usage and exits 0 for --help', async () => {
    const stdout: string[] = []
    const code = await buildCliMain({
      argv: ['--help'],
      stdout: { write: (chunk) => stdout.push(chunk) },
      stderr: { write: () => {} },
      createPorts: () => {
        throw new Error('should not start')
      },
      signal: new AbortController().signal,
    })
    expect(code).toBe(0)
    expect(stdout.join('')).toBe(USAGE)
  })

  it('writes the parse error and exits 1 for a bad flag', async () => {
    const stderr: string[] = []
    const code = await buildCliMain({
      argv: ['--nope'],
      stdout: { write: () => {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      createPorts: () => {
        throw new Error('should not start')
      },
      signal: new AbortController().signal,
    })
    expect(code).toBe(1)
    expect(stderr.join('')).toContain('unknown argument: --nope')
  })

  it('starts Followcast and exits 0 after the signal aborts', async () => {
    const fake = fakePorts()
    const controller = new AbortController()
    let started = false
    const ports = fake.ports
    const running = buildCliMain({
      argv: ['--deny-class', 'zoom'],
      stdout: { write: () => {} },
      stderr: { write: () => {} },
      createPorts: (opts) => {
        expect(opts.denyClasses).toEqual(['zoom'])
        expect(opts.selfClasses).toEqual(DEFAULT_FOLLOW_OPTIONS.selfClasses)
        return {
          ...ports,
          mirror: {
            ...ports.mirror,
            start: async () => {
              started = true
            },
          },
        }
      },
      signal: controller.signal,
    })
    const deadline = Date.now() + 1000
    while (!started && Date.now() < deadline) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
    }
    expect(started).toBe(true)
    let settled = false
    void running.then(() => {
      settled = true
    })
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    expect(settled).toBe(false)
    controller.abort()
    fake.events.close()
    fake.ticks.close()
    await expect(running).resolves.toBe(0)
    expect(settled).toBe(true)
  })

  it('re-reads the policy store on each tick so a bar toggle takes effect', async () => {
    const events = new AsyncQueue<string>()
    const ticks = new AsyncQueue<void>()
    const controller = new AbortController()
    let stored: SharePolicy = DEFAULT_POLICY
    const sent: string[] = []
    const published: Array<{ appLabel?: string; kind?: string } | null> = []
    const running = buildCliMain({
      argv: [],
      stdout: { write: () => {} },
      stderr: { write: () => {} },
      policy: {
        read: () => stored,
        write: (next) => {
          stored = { monitors: { ...next.monitors }, apps: { ...next.apps } }
        },
      },
      createPorts: () => ({
        hyprland: {
          clients: async () => [fox, card],
          monitors: async () => [dp1],
          activeWindow: async () => ({ address: '0xfox' }),
          events: () => events,
        },
        mirror: {
          start: async () => {},
          send: (line) => {
            sent.push(line)
          },
          stop: async () => {},
        },
        clock: { ticks },
        privacyCard: {
          publish: (next) => {
            published.push(next)
          },
        },
      }),
      signal: controller.signal,
    })
    await waitUntil(() => sent.length > 0)
    expect(sent).toEqual(["--region '0,0 100x100 DP-1'"])
    expect(published).toEqual([null])
    stored = { monitors: {}, apps: { firefox: false } }
    ticks.push(undefined)
    await waitUntil(() => published.some((item) => item?.appLabel === 'Mozilla Firefox'))
    expect(published).toEqual([null, { appLabel: 'Mozilla Firefox' }])
    expect(sent.at(-1)).toBe("--region '40,50 640x360 DP-1'")
    controller.abort()
    events.close()
    ticks.close()
    await expect(running).resolves.toBe(0)
  })

  it('stringifies a non-Error thrown while creating ports', async () => {
    const stderr: string[] = []
    const code = await buildCliMain({
      argv: [],
      stdout: { write: () => {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      createPorts: () => {
        throw 'nope'
      },
      signal: new AbortController().signal,
    })
    expect(code).toBe(1)
    expect(stderr.join('')).toBe('unknown error\n')
  })

  it('prints and updates the privacy policy', async () => {
    let stored: { monitors: Record<string, boolean>; apps: Record<string, boolean> } = {
      monitors: {},
      apps: {},
    }
    const stdout: string[] = []
    const io = {
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: () => {} },
      createPorts: () => {
        throw new Error('should not start')
      },
      signal: new AbortController().signal,
      policy: {
        read: () => stored,
        write: (next: typeof stored) => {
          stored = next
        },
      },
    }
    let writes = 0
    const counting = {
      ...io,
      policy: {
        read: () => stored,
        write: (next: typeof stored) => {
          writes += 1
          stored = next
        },
      },
    }
    expect(await buildCliMain({ ...counting, argv: ['policy'] })).toBe(0)
    expect(stdout.join('')).toBe('{\n  "monitors": {},\n  "apps": {}\n}\n')
    expect(writes).toBe(0)
    stdout.length = 0
    expect(await buildCliMain({ ...io, argv: ['policy', 'set-monitor', 'DP-1', 'off'] })).toBe(0)
    expect(stored.monitors['DP-1']).toBe(false)
    expect(stdout.join('')).toContain('"DP-1": false')
    stdout.length = 0
    expect(await buildCliMain({ ...io, argv: ['policy', 'set-app', 'slack', 'off'] })).toBe(0)
    expect(stored.apps.slack).toBe(false)
    expect(stdout.join('')).toContain('"slack": false')
  })

  it('exits 1 when a policy command has no store', async () => {
    const stderr: string[] = []
    const code = await buildCliMain({
      argv: ['policy'],
      stdout: { write: () => {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      createPorts: () => {
        throw new Error('should not start')
      },
      signal: new AbortController().signal,
    })
    expect(code).toBe(1)
    expect(stderr.join('')).toBe('policy store is unavailable\n')
  })

  it('exits 1 when status has no Hyprland snapshot', async () => {
    const stderr: string[] = []
    const code = await buildCliMain({
      argv: ['status'],
      stdout: { write: () => {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      createPorts: () => {
        throw new Error('should not start')
      },
      signal: new AbortController().signal,
      policy: {
        read: () => ({ monitors: {}, apps: {} }),
        write: () => {},
      },
    })
    expect(code).toBe(1)
    expect(stderr.join('')).toBe('status requires a Hyprland session\n')
  })

  it('exits 1 when status has a snapshot but no policy store', async () => {
    const stderr: string[] = []
    const code = await buildCliMain({
      argv: ['status'],
      stdout: { write: () => {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      createPorts: () => {
        throw new Error('should not start')
      },
      signal: new AbortController().signal,
      snapshot: async () => ({
        focusedAddress: null,
        windows: [],
        monitors: [],
      }),
    })
    expect(code).toBe(1)
    expect(stderr.join('')).toBe('status requires a Hyprland session\n')
  })

  it('writes the snapshot error when status cannot read the desktop', async () => {
    const stderr: string[] = []
    const code = await buildCliMain({
      argv: ['status'],
      stdout: { write: () => {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      createPorts: () => {
        throw new Error('should not start')
      },
      signal: new AbortController().signal,
      policy: {
        read: () => ({ monitors: {}, apps: {} }),
        write: () => {},
      },
      snapshot: async () => {
        throw new Error('hyprctl failed')
      },
    })
    expect(code).toBe(1)
    expect(stderr.join('')).toBe('hyprctl failed\n')
  })

  it('stringifies a non-Error thrown while reading status', async () => {
    const stderr: string[] = []
    const code = await buildCliMain({
      argv: ['status'],
      stdout: { write: () => {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      createPorts: () => {
        throw new Error('should not start')
      },
      signal: new AbortController().signal,
      policy: {
        read: () => ({ monitors: {}, apps: {} }),
        write: () => {},
      },
      snapshot: async () => {
        throw 'nope'
      },
    })
    expect(code).toBe(1)
    expect(stderr.join('')).toBe('unknown error\n')
  })

  it('prints share status as JSON', async () => {
    const stdout: string[] = []
    const code = await buildCliMain({
      argv: ['status'],
      stdout: { write: (chunk) => stdout.push(chunk) },
      stderr: { write: () => {} },
      createPorts: () => {
        throw new Error('should not start')
      },
      signal: new AbortController().signal,
      policy: {
        read: () => ({ monitors: {}, apps: { slack: false } }),
        write: () => {},
      },
      snapshot: async () => ({
        focusedAddress: '0xfox',
        windows: [
          {
            address: '0xfox',
            className: 'firefox',
            title: 'Firefox',
            mapped: true,
            hidden: false,
            monitorId: 0,
            at: { x: 0, y: 0 },
            size: { width: 100, height: 100 },
          },
        ],
        monitors: [
          {
            id: 0,
            name: 'DP-1',
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale: 1,
            focused: true,
          },
        ],
      }),
    })
    expect(code).toBe(0)
    const body = JSON.parse(stdout.join(''))
    expect(body.decision.kind).toBe('follow')
    expect(body.monitors[0].name).toBe('DP-1')
  })

  it('exits 1 and writes the error when the compositor is unavailable', async () => {
    const stderr: string[] = []
    const code = await buildCliMain({
      argv: [],
      stdout: { write: () => {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      createPorts: () => {
        throw new Error('HYPRLAND_INSTANCE_SIGNATURE is not set; is Hyprland running?')
      },
      signal: new AbortController().signal,
    })
    expect(code).toBe(1)
    expect(stderr.join('')).toContain('HYPRLAND_INSTANCE_SIGNATURE')
  })
})
