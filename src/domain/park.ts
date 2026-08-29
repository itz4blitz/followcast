import { orderShareableMonitors } from './shareableOutput.ts'
import type { MonitorSnapshot, WindowSnapshot } from './types.ts'

const PARK_OVERLAP = 2

export type ParkPoint = {
  readonly x: number
  readonly y: number
}

export function parkPoint(monitors: readonly MonitorSnapshot[]): ParkPoint | null {
  const host = orderShareableMonitors(monitors).at(-1)
  if (host === undefined) {
    return null
  }
  return {
    x: host.x + host.width - PARK_OVERLAP,
    y: host.y + host.height - PARK_OVERLAP,
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
