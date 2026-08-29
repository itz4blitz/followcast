import { orderShareableMonitors } from './shareableOutput.ts'
import type { FollowDecision, MonitorSnapshot } from './types.ts'

export type SlideDirection = 'left' | 'right' | 'up' | 'down'

export const MONITOR_SLIDE_MS = 450

export type MonitorSlide = {
  readonly fromOutput: string
  readonly toOutput: string
  readonly direction: SlideDirection
  readonly fromLabel: string
  readonly toLabel: string
}

function centerX(monitor: MonitorSnapshot): number {
  return monitor.x + monitor.width / 2
}

function centerY(monitor: MonitorSnapshot): number {
  return monitor.y + monitor.height / 2
}

export function slideDirection(from: MonitorSnapshot, to: MonitorSnapshot): SlideDirection {
  const dx = centerX(to) - centerX(from)
  const dy = centerY(to) - centerY(from)
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }
  // Stryker disable next-line EqualityOperator: dy is never 0 on this branch — abs(dx) < abs(dy)
  return dy >= 0 ? 'down' : 'up'
}

export function displayLabel(monitors: readonly MonitorSnapshot[], name: string): string {
  const ordered = orderShareableMonitors(monitors)
  const index = ordered.findIndex((monitor) => monitor.name === name)
  // Stryker disable next-line EqualityOperator: index 0 is Display 1 either as < 0 ? 1 : 1 or <= 0 ? 1
  return `Display ${index < 0 ? 1 : index + 1}`
}

export function monitorSlide(
  previous: FollowDecision | null,
  next: FollowDecision,
  monitors: readonly MonitorSnapshot[],
): MonitorSlide | null {
  if (previous === null || previous.kind !== 'follow' || next.kind !== 'follow') {
    return null
  }
  if (previous.region.output === next.region.output) {
    return null
  }
  const from = monitors.find((monitor) => monitor.name === previous.region.output)
  const to = monitors.find((monitor) => monitor.name === next.region.output)
  if (from === undefined || to === undefined) {
    return null
  }
  return {
    fromOutput: from.name,
    toOutput: to.name,
    direction: slideDirection(from, to),
    fromLabel: displayLabel(monitors, from.name),
    toLabel: displayLabel(monitors, to.name),
  }
}
