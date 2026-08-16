import { describe, expect, it } from 'vitest'
import { createHyprlandPort } from '../../src/hyprland/port.ts'

describe('createHyprlandPort', () => {
  it('asks hyprctl for clients, monitors, and the active window', async () => {
    const calls: string[][] = []
    const port = createHyprlandPort({
      exec: async (argv) => {
        calls.push([...argv])
        if (argv.includes('clients')) {
          return '[]'
        }
        if (argv.includes('monitors')) {
          return '[]'
        }
        return '{}'
      },
      events: () => (async function* () {})(),
    })

    await expect(port.clients()).resolves.toEqual([])
    await expect(port.monitors()).resolves.toEqual([])
    await expect(port.activeWindow()).resolves.toEqual({})
    expect(calls).toEqual([
      ['hyprctl', 'clients', '-j'],
      ['hyprctl', 'monitors', '-j'],
      ['hyprctl', 'activewindow', '-j'],
    ])
  })

  it('wraps a hyprctl failure with the subcommand name', async () => {
    const port = createHyprlandPort({
      exec: async () => {
        throw new Error('exit 1: not running')
      },
      events: () => (async function* () {})(),
    })
    await expect(port.clients()).rejects.toThrow(/hyprctl clients: exit 1: not running/)
    await expect(port.clients()).rejects.toHaveProperty('cause')
  })

  it('stringifies a non-Error throw from exec', async () => {
    const port = createHyprlandPort({
      exec: async () => {
        throw 'nope'
      },
      events: () => (async function* () {})(),
    })
    await expect(port.activeWindow()).rejects.toThrow(/hyprctl activewindow: unknown error/)
  })

  it('wraps invalid JSON with the subcommand name', async () => {
    const port = createHyprlandPort({
      exec: async () => 'not-json',
      events: () => (async function* () {})(),
    })
    await expect(port.monitors()).rejects.toThrow(/hyprctl monitors: /)
    const failure = await port.monitors().then(
      () => {
        throw new Error('expected JSON failure')
      },
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    if (failure instanceof Error) {
      expect(failure.cause).toBeInstanceOf(Error)
    }
  })

  it('yields socket2 lines from the injected event source', async () => {
    const port = createHyprlandPort({
      exec: async () => '[]',
      events: async function* () {
        yield 'activewindowv2>>0x1'
      },
    })
    const lines: string[] = []
    for await (const line of port.events()) {
      lines.push(line)
    }
    expect(lines).toEqual(['activewindowv2>>0x1'])
  })
})
