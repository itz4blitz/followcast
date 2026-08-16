import { windowToRegion } from './geometry.ts'
import type { DesktopSnapshot, FollowRegion, MonitorSnapshot, WindowSnapshot } from './types.ts'

const SLOT_WIDTH = 480
const SLOT_HEIGHT = 270
const SLOT_MARGIN = 16

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

export function privacySlotRegion(monitors: readonly MonitorSnapshot[]): FollowRegion | null {
  const host = monitors.at(-1)
  if (host === undefined) {
    return null
  }
  const logicalWidth = host.width / host.scale
  const logicalHeight = host.height / host.scale
  const width = Math.min(SLOT_WIDTH, Math.max(1, Math.floor(logicalWidth / 3)))
  const height = Math.min(SLOT_HEIGHT, Math.max(1, Math.floor(logicalHeight / 3)))
  return {
    output: host.name,
    x: host.x + logicalWidth - width - SLOT_MARGIN,
    y: host.y + logicalHeight - height - SLOT_MARGIN,
    width,
    height,
  }
}
