import { windowToRegion } from './geometry.ts'
import type { DesktopSnapshot, FollowRegion, WindowSnapshot } from './types.ts'

function isPrivacyWindow(window: WindowSnapshot): boolean {
  return window.className === 'followcast-privacy' || window.title.includes('Followcast Privacy')
}

export function findPrivacyWindow(windows: readonly WindowSnapshot[]): WindowSnapshot | undefined {
  return windows.find((window) => isPrivacyWindow(window) && window.mapped && !window.hidden)
}

export function privacyRegionFrom(snapshot: DesktopSnapshot): FollowRegion | null {
  const card = findPrivacyWindow(snapshot.windows)
  if (card === undefined) {
    return null
  }
  const host = snapshot.monitors.find((monitor) => monitor.id === card.monitorId)
  if (host === undefined) {
    return null
  }
  return windowToRegion(card, host)
}
