import type { FollowRegion } from './types.ts'

export function streamCommand(region: FollowRegion): string {
  return `--output '${region.output}'`
}

export function regionsEqual(left: FollowRegion, right: FollowRegion): boolean {
  return (
    left.output === right.output &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}
