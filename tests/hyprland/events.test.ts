import { describe, expect, it } from 'vitest'
import { classifyEvent } from '../../src/hyprland/events.ts'

const desktopChanged = [
  'activewindow>>firefox,Mozilla Firefox',
  'activewindowv2>>0x555751f58900',
  'openwindow>>0x1,1,kitty,term',
  'closewindow>>0x1',
  'movewindow>>0x1,2',
  'movewindowv2>>0x1,2,2',
  'fullscreen>>1',
  'changefloatingmode>>0x1,1',
  'focusedmon>>HDMI-A-1,2',
  'monitoradded>>DP-3',
  'monitorremoved>>DP-3',
  'moveintogroup>>0x1',
  'moveoutofgroup>>0x1',
  'pin>>0x1,1',
]

const ignored = [
  'workspace>>3',
  'windowtitle>>0x1,hi',
  'windowtitlev2>>0x1,hi',
  'screencast>>1,0',
  'configreloaded>>',
  'urgent>>0x1',
  '',
  'not-an-event',
  '>>activewindow',
]

describe('classifyEvent', () => {
  it('marks focus, map, move, and monitor events as desktop-changed', () => {
    for (const line of desktopChanged) {
      expect(classifyEvent(line), line).toBe('desktop-changed')
    }
    expect(classifyEvent('pin')).toBe('desktop-changed')
    expect(classifyEvent('fullscreen')).toBe('desktop-changed')
  })

  it('ignores title noise, workspace-only, and malformed lines', () => {
    for (const line of ignored) {
      expect(classifyEvent(line), line).toBe('ignore')
    }
  })
})
