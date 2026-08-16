import { describe, expect, it } from 'vitest'
import { createSocketEvents } from '../../src/hyprland/socketEvents.ts'

describe('createSocketEvents', () => {
  it('opens the Hyprland socket2 path and yields its lines', async () => {
    const opened: string[] = []
    const events = createSocketEvents(
      {
        XDG_RUNTIME_DIR: '/run/user/1000',
        HYPRLAND_INSTANCE_SIGNATURE: 'sig',
      },
      (path) => {
        opened.push(path)
        return (async function* () {
          yield 'activewindowv2>>0x1'
        })()
      },
    )
    const lines: string[] = []
    for await (const line of events()) {
      lines.push(line)
    }
    expect(opened).toEqual(['/run/user/1000/hypr/sig/.socket2.sock'])
    expect(lines).toEqual(['activewindowv2>>0x1'])
  })
})
