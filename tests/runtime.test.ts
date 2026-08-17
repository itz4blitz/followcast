import { describe, expect, it } from 'vitest'
import { createRuntimePorts, GEOMETRY_TICK_MS, runtimeDepsFromIo } from '../src/runtime.ts'

describe('runtimeDepsFromIo', () => {
  it('wires which() through PATH lookup', () => {
    const deps = runtimeDepsFromIo(
      {
        execFile: () => {},
        spawn: () => {
          throw new Error('unused')
        },
        connect: () => ({ readable: (async function* () {})() }),
        exists: (path) => path === '/usr/bin/wl-mirror',
        pathEnv: '/usr/bin',
      },
      new AbortController().signal,
    )
    expect(deps.which('wl-mirror')).toBe('/usr/bin/wl-mirror')
    expect(deps.tickMs).toBe(GEOMETRY_TICK_MS)
  })
})

describe('createRuntimePorts', () => {
  it('uses hyprctl exec and the Hyprland socket path', async () => {
    const argv: string[][] = []
    const opened: string[] = []
    const ports = createRuntimePorts(
      {
        XDG_RUNTIME_DIR: '/run/user/1000',
        HYPRLAND_INSTANCE_SIGNATURE: 'sig',
      },
      {
        exec: async (command) => {
          argv.push([...command])
          return '[]'
        },
        openLines: (path) => {
          opened.push(path)
          return (async function* () {
            yield 'focusedmon>>DP-1,1'
          })()
        },
        which: () => '/usr/bin/wl-mirror',
        spawn: () => ({ write: () => {}, kill: () => {} }),
        schedule: () => () => {},
        tickMs: 100,
        signal: new AbortController().signal,
      },
    )
    await ports.hyprland.clients()
    expect(argv).toEqual([['hyprctl', 'clients', '-j']])
    const lines: string[] = []
    for await (const line of ports.hyprland.events()) {
      lines.push(line)
    }
    expect(opened).toEqual(['/run/user/1000/hypr/sig/.socket2.sock'])
    expect(lines).toEqual(['focusedmon>>DP-1,1'])
    await ports.mirror.start('DP-1')
    ports.mirror.send('--freeze')
    await ports.mirror.stop()
  })

  it('moves a window through the hyprctl dispatch interface', async () => {
    const argv: string[][] = []
    const ports = createRuntimePorts(
      {
        XDG_RUNTIME_DIR: '/run/user/1000',
        HYPRLAND_INSTANCE_SIGNATURE: 'sig',
      },
      {
        exec: async (command) => {
          argv.push([...command])
          return 'ok'
        },
        openLines: async function* () {},
        which: () => '/usr/bin/grim',
        spawn: () => ({ write: () => {}, kill: () => {} }),
        schedule: () => () => {},
        tickMs: 100,
        signal: new AbortController().signal,
      },
    )
    await ports.hyprland.moveWindow('0xabc', 1638, 1708)
    expect(argv).toEqual([
      [
        'hyprctl',
        'dispatch',
        'hl.dsp.window.move({ x = 1638, y = 1708, window = "address:0xabc" })',
      ],
    ])
  })

  it('wraps dispatch failures with a labeled error', async () => {
    const ports = createRuntimePorts(
      {
        XDG_RUNTIME_DIR: '/run/user/1000',
        HYPRLAND_INSTANCE_SIGNATURE: 'sig',
      },
      {
        exec: async () => {
          throw new Error('no such window')
        },
        openLines: async function* () {},
        which: () => '/usr/bin/grim',
        spawn: () => ({ write: () => {}, kill: () => {} }),
        schedule: () => () => {},
        tickMs: 100,
        signal: new AbortController().signal,
      },
    )
    await expect(ports.hyprland.moveWindow('0xabc', 1, 2)).rejects.toThrow(/hyprctl dispatch move/)
  })

  it('exposes a clock that yields on the injected schedule', async () => {
    const controller = new AbortController()
    let pulse: (() => void) | undefined
    const ports = createRuntimePorts(
      {
        XDG_RUNTIME_DIR: '/run/user/1000',
        HYPRLAND_INSTANCE_SIGNATURE: 'sig',
      },
      {
        exec: async () => '[]',
        openLines: async function* () {},
        which: () => '/usr/bin/wl-mirror',
        spawn: () => ({ write: () => {}, kill: () => {} }),
        schedule: (_ms, callback) => {
          pulse = callback
          return () => {}
        },
        tickMs: 100,
        signal: controller.signal,
      },
    )
    const iterator = ports.clock.ticks[Symbol.asyncIterator]()
    const first = iterator.next()
    expect(pulse).toBeDefined()
    if (pulse === undefined) {
      throw new Error('schedule was not installed')
    }
    pulse()
    await expect(first).resolves.toEqual({ value: undefined, done: false })
    controller.abort()
    await iterator.next()
  })
})
