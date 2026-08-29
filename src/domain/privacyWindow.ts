import { orderShareableMonitors } from './shareableOutput.ts'
import type { FollowRegion, MonitorSnapshot } from './types.ts'

const SLOT_WIDTH = 480
const SLOT_HEIGHT = 270
const SLOT_MARGIN = 16

export function privacySlotRegion(monitors: readonly MonitorSnapshot[]): FollowRegion | null {
  const host = orderShareableMonitors(monitors).at(-1)
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
