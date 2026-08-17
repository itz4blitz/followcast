import { monitorToRegion, windowToRegion } from './geometry.ts'
import { isAppAllowed, isMonitorAllowed } from './policy.ts'
import { isShareableOutput } from './shareableOutput.ts'
import type {
  DesktopSnapshot,
  FollowDecision,
  FollowOptions,
  MonitorSnapshot,
  WindowSnapshot,
} from './types.ts'

function findWindow(
  windows: readonly WindowSnapshot[],
  address: string,
): WindowSnapshot | undefined {
  return windows.find((window) => window.address === address)
}

function findMonitor(
  monitors: readonly MonitorSnapshot[],
  id: number,
): MonitorSnapshot | undefined {
  return monitors.find((monitor) => monitor.id === id)
}

function isSelf(window: WindowSnapshot, options: FollowOptions): boolean {
  if (options.selfClasses.includes(window.className)) {
    return true
  }
  return options.selfTitleIncludes.some((needle) => window.title.includes(needle))
}

export function decideFollow(snapshot: DesktopSnapshot, options: FollowOptions): FollowDecision {
  // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — findWindow never matches null, so the next missing return is identical
  if (snapshot.focusedAddress === null) {
    return { kind: 'hold', reason: 'missing' }
  }
  const focused = findWindow(snapshot.windows, snapshot.focusedAddress)
  if (focused === undefined) {
    return { kind: 'hold', reason: 'missing' }
  }
  if (!focused.mapped || focused.hidden) {
    return { kind: 'hold', reason: 'unmapped' }
  }
  if (isSelf(focused, options)) {
    return { kind: 'hold', reason: 'self' }
  }
  const host = findMonitor(snapshot.monitors, focused.monitorId)
  if (host === undefined || !isShareableOutput(host.name)) {
    return { kind: 'hold', reason: 'no-monitor' }
  }
  const appLabel = focused.title === '' ? focused.className : focused.title
  if (!isMonitorAllowed(options.policy, host.name)) {
    return {
      kind: 'privacy',
      className: focused.className,
      appLabel,
      monitorName: host.name,
      reason: 'monitor-off',
    }
  }
  if (
    options.denyClasses.includes(focused.className) ||
    !isAppAllowed(options.policy, focused.className)
  ) {
    return {
      kind: 'privacy',
      className: focused.className,
      appLabel,
      monitorName: host.name,
      reason: 'app-off',
    }
  }
  if (windowToRegion(focused, host) === null) {
    return { kind: 'hold', reason: 'empty-region' }
  }
  return { kind: 'follow', address: focused.address, region: monitorToRegion(host) }
}
