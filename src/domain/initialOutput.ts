import { shareableMonitors } from './shareableOutput.ts'
import type { MonitorSnapshot } from './types.ts'

export function initialOutput(monitors: readonly MonitorSnapshot[]): string {
  const usable = shareableMonitors(monitors)
  const focused = usable.find((monitor) => monitor.focused)
  if (focused !== undefined) {
    return focused.name
  }
  const first = usable[0]
  if (first === undefined) {
    throw new Error('no monitor')
  }
  return first.name
}
