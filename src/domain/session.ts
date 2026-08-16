import { decideFollow } from './decide.ts'
import { MONITOR_SLIDE_MS, monitorSlide } from './monitorSlide.ts'
import { regionsEqual, streamCommand } from './streamCommand.ts'
import type {
  DesktopSnapshot,
  FollowDecision,
  FollowOptions,
  SessionLast,
  SessionState,
  SessionStep,
} from './types.ts'

function sameFollow(
  left: SessionLast | null,
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

function withLast(
  last: SessionLast,
  pendingFollow: SessionState['pendingFollow'] = null,
): SessionState {
  return { last, pendingFollow }
}

export function reduceSession(
  state: SessionState,
  snapshot: DesktopSnapshot,
  options: FollowOptions,
  nowMs = 0,
): SessionStep {
  const decision = decideFollow(snapshot, options)
  if (decision.kind === 'hold') {
    // Stryker disable next-line ConditionalExpression: last.kind === 'transition' already implies last is set
    if (state.last !== null && state.last.kind === 'transition' && nowMs < state.last.untilMs) {
      return { state, command: null }
    }
    if (state.last !== null && state.last.kind === 'follow') {
      return { state, command: null }
    }
    return { state: withLast(decision), command: null }
  }
  if (decision.kind === 'privacy') {
    const region = options.privacyRegion
    if (region === null) {
      if (state.last !== null && state.last.kind === 'follow') {
        return { state, command: null }
      }
      return { state: withLast(decision), command: null }
    }
    if (state.last !== null && state.last.kind === 'privacy') {
      return { state: withLast(decision), command: null }
    }
    return { state: withLast(decision), command: streamCommand(region) }
  }
  const follow = decision
  if (state.last !== null && state.last.kind === 'transition' && nowMs < state.last.untilMs) {
    if (sameFollow(state.pendingFollow, follow)) {
      return { state, command: null }
    }
    const slide = monitorSlide(
      {
        kind: 'follow',
        address: state.pendingFollow?.address ?? follow.address,
        region: {
          output: state.last.fromOutput,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      },
      follow,
      snapshot.monitors,
    )
    if (slide !== null && slide.toOutput !== state.last.toOutput) {
      return {
        state: {
          last: { kind: 'transition', ...slide, untilMs: nowMs + MONITOR_SLIDE_MS },
          pendingFollow: follow,
        },
        command: null,
      }
    }
    return { state: { last: state.last, pendingFollow: follow }, command: null }
  }
  if (sameFollow(state.last, follow) || sameFollow(state.pendingFollow, follow)) {
    if (state.last !== null && state.last.kind === 'transition') {
      return { state: withLast(follow), command: streamCommand(follow.region) }
    }
    return { state, command: null }
  }
  const previousFollow =
    state.last !== null && state.last.kind === 'follow' ? state.last : state.pendingFollow
  const slide = monitorSlide(previousFollow, follow, snapshot.monitors)
  if (slide !== null && (state.last === null || state.last.kind !== 'transition')) {
    return {
      state: {
        last: { kind: 'transition', ...slide, untilMs: nowMs + MONITOR_SLIDE_MS },
        pendingFollow: follow,
      },
      command: null,
    }
  }
  return { state: withLast(follow), command: streamCommand(follow.region) }
}
