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
  it('refuses to start when wl-mirror is not on PATH', async () => {
    const port = createMirrorPort({
      which: () => null,
      spawn: () => {
        throw new Error('should not spawn')
      },
    })
    await expect(port.start('DP-1')).rejects.toThrow(/wl-mirror/)
  })

  it('spawns wl-mirror, writes stream lines, and kills on stop', async () => {
    const writes: string[] = []
    let killed = false
    const asked: string[] = []
    const port = createMirrorPort({
      which: (binary) => {
        asked.push(binary)
        return binary === 'wl-mirror' ? '/usr/bin/wl-mirror' : null
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
    expect(asked).toEqual(['wl-mirror'])
    port.send("--region '0,0 10x10 DP-1'")
    expect(writes).toEqual(["--region '0,0 10x10 DP-1'"])
    await port.stop()
    expect(killed).toBe(true)
  })

  it('stop is a no-op when the child was never started', async () => {
    const port = createMirrorPort({
      which: () => '/usr/bin/wl-mirror',
      spawn: () => {
        throw new Error('should not spawn')
      },
    })
    await expect(port.stop()).resolves.toBeUndefined()
    port.send('ignored')
  })
})
