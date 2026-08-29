import { describe, expect, it } from 'vitest'
import { createMirrorPort, dummySurfaceArgv } from '../../src/mirror/port.ts'

const CARD = '/opt/followcast/privacy-card.py'

describe('dummySurfaceArgv', () => {
  it('starts the GTK share surface by script path', () => {
    expect(dummySurfaceArgv(CARD)).toEqual(['python3', '-u', CARD])
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
