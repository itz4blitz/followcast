import { decideFollow } from './decide.ts'
import { regionsEqual, streamCommand } from './streamCommand.ts'
import type {
  DesktopSnapshot,
  FollowDecision,
  FollowOptions,
  SessionState,
  SessionStep,
} from './types.ts'

function sameFollow(
  left: FollowDecision | null,
  right: Extract<FollowDecision, { kind: 'follow' }>,
): boolean {
  if (left === null) {
    return false
  }
  if (left.kind !== 'follow') {
    return false
  }
  return regionsEqual(left.region, right.region)
}

export function reduceSession(
  state: SessionState,
  snapshot: DesktopSnapshot,
  options: FollowOptions,
): SessionStep {
  const decision = decideFollow(snapshot, options)
  if (decision.kind === 'hold') {
    if (state.last !== null && state.last.kind === 'follow') {
      return { state, command: null }
    }
    return { state: { last: decision }, command: null }
  }
  if (decision.kind === 'privacy') {
    const region = options.privacyRegion
    if (region === null) {
      if (state.last !== null && state.last.kind === 'follow') {
        return { state, command: null }
      }
      return { state: { last: decision }, command: null }
    }
    if (state.last !== null && state.last.kind === 'privacy') {
      return { state: { last: decision }, command: null }
    }
    return { state: { last: decision }, command: streamCommand(region) }
  }
  if (sameFollow(state.last, decision)) {
    return { state, command: null }
  }
  return { state: { last: decision }, command: streamCommand(decision.region) }
}
