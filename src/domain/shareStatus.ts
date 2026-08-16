import { decideFollow } from './decide.ts'
import { isAppAllowed, isMonitorAllowed } from './policy.ts'
import type { DesktopSnapshot, FollowDecision, FollowOptions, WindowSnapshot } from './types.ts'

type AppStatus = {
  readonly className: string
  readonly title: string
  readonly enabled: boolean
}

type MonitorStatus = {
  readonly name: string
  readonly enabled: boolean
  readonly apps: readonly AppStatus[]
}

export type ShareStatus = {
  readonly decision: FollowDecision
  readonly monitors: readonly MonitorStatus[]
}

function isSelfWindow(window: WindowSnapshot, options: FollowOptions): boolean {
  if (options.selfClasses.includes(window.className)) {
    return true
  }
  return options.selfTitleIncludes.some((needle) => window.title.includes(needle))
}

export function shareStatus(snapshot: DesktopSnapshot, options: FollowOptions): ShareStatus {
  return {
    decision: decideFollow(snapshot, options),
    monitors: snapshot.monitors.map((monitor) => {
      const apps: AppStatus[] = []
      const seen = new Set<string>()
      for (const window of snapshot.windows) {
        if (window.monitorId !== monitor.id || isSelfWindow(window, options)) {
          continue
        }
        if (seen.has(window.className)) {
          continue
        }
        seen.add(window.className)
        apps.push({
          className: window.className,
          title: window.title === '' ? window.className : window.title,
          enabled: isAppAllowed(options.policy, window.className),
        })
      }
      return {
        name: monitor.name,
        enabled: isMonitorAllowed(options.policy, monitor.name),
        apps,
      }
    }),
  }
}
