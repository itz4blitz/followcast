import { shareableMonitors } from './shareableOutput.ts'
import type { MonitorSnapshot, WindowSnapshot } from './types.ts'

const PARK_OVERLAP = 2

export type ParkPoint = {
  readonly x: number
  readonly y: number
}

export function parkPoint(monitors: readonly MonitorSnapshot[]): ParkPoint | null {
  const ordered = shareableMonitors(monitors).sort(
    (left, right) => left.y - right.y || left.x - right.x,
  )
  const host = ordered.at(-1)
  if (host === undefined) {
    return null
  }
  return {
    x: host.x + Math.round(host.width / host.scale) - PARK_OVERLAP,
    y: host.y + Math.round(host.height / host.scale) - PARK_OVERLAP,
  }
}

export function surfaceWindow(
  windows: readonly WindowSnapshot[],
  selfClasses: readonly string[],
): WindowSnapshot | undefined {
  return windows.find(
    (window) => window.mapped && !window.hidden && selfClasses.includes(window.className),
  )
}
