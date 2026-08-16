import type { MonitorSnapshot } from './types.ts'

export function initialOutput(monitors: readonly MonitorSnapshot[]): string {
  const focused = monitors.find((monitor) => monitor.focused)
  if (focused !== undefined) {
    return focused.name
  }
  const first = monitors[0]
  if (first === undefined) {
    throw new Error('no monitor')
  }
  return first.name
}
