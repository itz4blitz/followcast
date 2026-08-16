import type { FollowRegion, MonitorSnapshot, WindowSnapshot } from './types.ts'

function logicalSize(monitor: MonitorSnapshot): { width: number; height: number } {
  return {
    width: monitor.width / monitor.scale,
    height: monitor.height / monitor.scale,
  }
}

export function monitorToRegion(monitor: MonitorSnapshot): FollowRegion {
  const box = logicalSize(monitor)
  return {
    output: monitor.name,
    x: monitor.x,
    y: monitor.y,
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

export function windowToRegion(
  window: WindowSnapshot,
  monitor: MonitorSnapshot,
): FollowRegion | null {
  const box = logicalSize(monitor)
  const left = Math.max(window.at.x, monitor.x)
  const top = Math.max(window.at.y, monitor.y)
  const right = Math.min(window.at.x + window.size.width, monitor.x + box.width)
  const bottom = Math.min(window.at.y + window.size.height, monitor.y + box.height)
  const width = right - left
  const height = bottom - top
  if (width < 1 || height < 1) {
    return null
  }
  return {
    output: monitor.name,
    x: left,
    y: top,
    width,
    height,
  }
}
