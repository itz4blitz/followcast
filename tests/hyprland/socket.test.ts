import { describe, expect, it } from 'vitest'
import { hyprlandSocketPath } from '../../src/hyprland/socket.ts'

describe('hyprlandSocketPath', () => {
  it('builds the Hyprland socket2 path from the session environment', () => {
    expect(
      hyprlandSocketPath({
        XDG_RUNTIME_DIR: '/run/user/1000',
        HYPRLAND_INSTANCE_SIGNATURE: 'abc_123',
      }),
    ).toBe('/run/user/1000/hypr/abc_123/.socket2.sock')
  })

  it('throws when the compositor session is missing', () => {
    expect(() => hyprlandSocketPath({})).toThrow(/HYPRLAND_INSTANCE_SIGNATURE/)
    expect(() => hyprlandSocketPath({ HYPRLAND_INSTANCE_SIGNATURE: '' })).toThrow(
      /HYPRLAND_INSTANCE_SIGNATURE/,
    )
    expect(() => hyprlandSocketPath({ HYPRLAND_INSTANCE_SIGNATURE: 'abc' })).toThrow(
      /XDG_RUNTIME_DIR/,
    )
    expect(() =>
      hyprlandSocketPath({ HYPRLAND_INSTANCE_SIGNATURE: 'abc', XDG_RUNTIME_DIR: '' }),
    ).toThrow(/XDG_RUNTIME_DIR/)
  })
})
