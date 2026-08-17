import { describe, expect, it } from 'vitest'
import { createMirrorPort, wlMirrorArgv } from '../../src/mirror/port.ts'

describe('wlMirrorArgv', () => {
  it('starts a titled stream window on the given output', () => {
    expect(wlMirrorArgv('HDMI-A-1')).toEqual([
      'wl-mirror',
      '--stream',
      '--title',
      'Followcast',
      '--show-cursor',
      '--scaling',
      'fit',
      'HDMI-A-1',
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
    })
    await expect(port.start('DP-1')).rejects.toThrow(/grim/)
  })

  it('spawns the surface and immediately streams the initial output', async () => {
    const writes: string[] = []
    let killed = false
    const asked: string[] = []
    const port = createMirrorPort({
      which: (binary) => {
        asked.push(binary)
        return binary === 'grim' ? '/usr/bin/grim' : null
      },
      spawn: (argv) => {
        expect(argv[0]).toBe('wl-mirror')
        return {
          write: (line) => {
            writes.push(line)
          },
          kill: () => {
            killed = true
          },
        }
      },
    })
    await port.start('DP-1')
    expect(asked).toEqual(['grim'])
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
    })
    await expect(port.stop()).resolves.toBeUndefined()
    port.send('ignored')
  })
})
