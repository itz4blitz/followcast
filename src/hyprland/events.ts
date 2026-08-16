export type EventKind = 'desktop-changed' | 'ignore'

const DESKTOP_CHANGED = new Set([
  'activewindow',
  'activewindowv2',
  'openwindow',
  'closewindow',
  'movewindow',
  'movewindowv2',
  'fullscreen',
  'changefloatingmode',
  'focusedmon',
  'monitoradded',
  'monitorremoved',
  'moveintogroup',
  'moveoutofgroup',
  'pin',
])

export function classifyEvent(line: string): EventKind {
  const cut = line.indexOf('>>')
  const name = cut === -1 ? line : line.slice(0, cut)
  if (DESKTOP_CHANGED.has(name)) {
    return 'desktop-changed'
  }
  return 'ignore'
}
