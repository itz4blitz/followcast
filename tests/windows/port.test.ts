import { describe, expect, it } from 'vitest'
import { createWindowsDesktopPort } from '../../src/windows/port.ts'

describe('createWindowsDesktopPort', () => {
  it('queries clients, monitors, and activewindow as JSON', async () => {
    const called: string[] = []
    const port = createWindowsDesktopPort({
      query: async (command) => {
        called.push(command)
        if (command === 'clients') {
          return '[{"address":"0x1"}]'
        }
        if (command === 'monitors') {
          return '[{"id":0,"name":"DISPLAY1"}]'
        }
        return '{"address":"0x1"}'
      },
      events: async function* () {
        yield 'activewindowv2>>0x1'
      },
    })
    await expect(port.clients()).resolves.toEqual([{ address: '0x1' }])
    await expect(port.monitors()).resolves.toEqual([{ id: 0, name: 'DISPLAY1' }])
    await expect(port.activeWindow()).resolves.toEqual({ address: '0x1' })
    expect(called).toEqual(['clients', 'monitors', 'activewindow'])
    const lines: string[] = []
    for await (const line of port.events()) {
      lines.push(line)
    }
    expect(lines).toEqual(['activewindowv2>>0x1'])
    await expect(port.moveWindow('0x1', 10, 20)).resolves.toBeUndefined()
  })

  it('wraps query failures with a labeled error', async () => {
    const cause = new Error('pipe closed')
    const port = createWindowsDesktopPort({
      query: async () => {
        throw cause
      },
      events: async function* () {},
    })
    let thrown: unknown
    try {
      await port.clients()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    if (!(thrown instanceof Error)) {
      throw new Error('expected Error')
    }
    expect(thrown.message).toBe('win32 clients: pipe closed')
    expect(thrown.cause).toBe(cause)
  })

  it('stringifies non-Error query failures', async () => {
    const port = createWindowsDesktopPort({
      query: async () => {
        throw 'boom'
      },
      events: async function* () {},
    })
    await expect(port.monitors()).rejects.toThrow('win32 monitors: unknown error')
  })

  it('wraps invalid JSON responses with a labeled error', async () => {
    const port = createWindowsDesktopPort({
      query: async () => '{bad',
      events: async function* () {},
    })
    let thrown: unknown
    try {
      await port.activeWindow()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    if (!(thrown instanceof Error)) {
      throw new Error('expected Error')
    }
    expect(thrown.message).toMatch(/win32 activewindow:/)
    expect(thrown.cause).toBeInstanceOf(SyntaxError)
  })
})
