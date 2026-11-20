import { describe, expect, it } from 'vitest'
import { createMirrorPort, dummySurfaceArgv } from '../../src/mirror/port.ts'

const CARD = '/opt/followcast/privacy-card.py'

describe('dummySurfaceArgv', () => {
  it('starts the GTK share surface by script path', () => {
    expect(dummySurfaceArgv(CARD)).toEqual(['python3', '-u', CARD])
  })

  it('uses an explicit python binary when provided', () => {
    expect(dummySurfaceArgv('C:\\followcast\\win32_surface.py', 'python')).toEqual([
      'python',
      '-u',
      'C:\\followcast\\win32_surface.py',
    ])
  })
})

describe('createMirrorPort', () => {
  it('refuses to start when grim is not on PATH', async () => {
    const port = createMirrorPort({
      which: () => null,
      spawn: () => {
        throw new Error('should not spawn')
      },
      surfaceScript: CARD,
    })
    await expect(port.start('DP-1')).rejects.toThrow(/grim/)
  })

  it('supports a custom required binary and python executable for Windows', async () => {
    const writes: string[] = []
    const asked: string[] = []
    const spawned: string[][] = []
    const port = createMirrorPort({
      which: (binary) => {
        asked.push(binary)
        return binary === 'python' ? 'C:\\Python313\\python.exe' : null
      },
      spawn: (argv) => {
        spawned.push([...argv])
        return {
          write: (line) => {
            writes.push(line)
          },
          kill: () => {},
        }
      },
      surfaceScript: 'C:\\followcast\\win32_surface.py',
      pythonBinary: 'python',
      requiredBinary: 'python',
      missingBinaryMessage: 'python is not installed',
    })
    await port.start('DISPLAY1')
    expect(asked).toEqual(['python'])
    expect(spawned).toEqual([['python', '-u', 'C:\\followcast\\win32_surface.py']])
    expect(writes).toEqual(["--output 'DISPLAY1'"])
  })

  it('throws the custom missingBinaryMessage when requiredBinary is absent', async () => {
    const port = createMirrorPort({
      which: () => null,
      spawn: () => {
        throw new Error('should not spawn')
      },
      surfaceScript: 'C:\\followcast\\win32_surface.py',
      pythonBinary: 'python',
      requiredBinary: 'python',
      missingBinaryMessage: 'python is not installed',
    })
    await expect(port.start('DISPLAY1')).rejects.toThrow('python is not installed')
  })

  it('spawns a standalone surface executable without PATH lookup when requiredBinary is null', async () => {
    const writes: string[] = []
    const spawned: string[][] = []
    const port = createMirrorPort({
      which: () => {
        throw new Error('which should not be called')
      },
      spawn: (argv) => {
        spawned.push([...argv])
        return {
          write: (line) => {
            writes.push(line)
          },
          kill: () => {},
        }
      },
      surfaceScript: 'C:\\followcast\\win32_surface.exe',
      surfaceArgv: ['C:\\followcast\\win32_surface.exe'],
      requiredBinary: null,
    })
    await port.start('DISPLAY1')
    expect(spawned).toEqual([['C:\\followcast\\win32_surface.exe']])
    expect(writes).toEqual(["--output 'DISPLAY1'"])
  })

  it('spawns the surface and immediately streams the initial output', async () => {
    const writes: string[] = []
    let killed = false
    const asked: string[] = []
    const spawned: string[][] = []
    const port = createMirrorPort({
      which: (binary) => {
        asked.push(binary)
        return binary === 'grim' ? '/usr/bin/grim' : null
      },
      spawn: (argv) => {
        spawned.push([...argv])
        return {
          write: (line) => {
            writes.push(line)
          },
          kill: () => {
            killed = true
          },
        }
      },
      surfaceScript: CARD,
    })
    await port.start('DP-1')
    expect(asked).toEqual(['grim'])
    expect(spawned).toEqual([['python3', '-u', CARD]])
    expect(writes).toEqual(["--output 'DP-1'"])
    port.send("--output 'HDMI-A-1'")
    expect(writes).toEqual(["--output 'DP-1'", "--output 'HDMI-A-1'"])
    await port.stop()
    expect(killed).toBe(true)
  })

  it('stop is a no-op when the child was never started', async () => {
    const port = createMirrorPort({
      which: () => '/usr/bin/grim',
      spawn: () => {
        throw new Error('should not spawn')
      },
      surfaceScript: CARD,
    })
    await expect(port.stop()).resolves.toBeUndefined()
    port.send('ignored')
  })
})
