import { DEFAULT_POLICY, type SharePolicy } from './policy.ts'

type Point = {
  readonly x: number
  readonly y: number
}

type Size = {
  readonly width: number
  readonly height: number
}

export type WindowSnapshot = {
  readonly address: string
  readonly className: string
  readonly title: string
  readonly mapped: boolean
  readonly hidden: boolean
  readonly monitorId: number
  readonly at: Point
  readonly size: Size
}

export type MonitorSnapshot = {
  readonly id: number
  readonly name: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly focused: boolean
}

export type DesktopSnapshot = {
  readonly focusedAddress: string | null
  readonly windows: readonly WindowSnapshot[]
  readonly monitors: readonly MonitorSnapshot[]
}

export type FollowOptions = {
  readonly selfClasses: readonly string[]
  readonly selfTitleIncludes: readonly string[]
  readonly denyClasses: readonly string[]
  readonly policy: SharePolicy
  readonly privacyRegion: FollowRegion | null
}

export const DEFAULT_FOLLOW_OPTIONS: FollowOptions = {
  selfClasses: ['at.yrlf.wl_mirror', 'followcast-privacy', 'followcast.privacy'],
  selfTitleIncludes: [],
  denyClasses: [],
  policy: DEFAULT_POLICY,
  privacyRegion: null,
}

type HoldReason = 'self' | 'denylist' | 'unmapped' | 'missing' | 'no-monitor' | 'empty-region'

type PrivacyReason = 'monitor-off' | 'app-off'

export type FollowRegion = {
  readonly output: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type FollowDecision =
  | { readonly kind: 'follow'; readonly address: string; readonly region: FollowRegion }
  | { readonly kind: 'hold'; readonly reason: HoldReason }
  | {
      readonly kind: 'privacy'
      readonly className: string
      readonly appLabel: string
      readonly monitorName: string
      readonly reason: PrivacyReason
    }

export type TransitionDecision = {
  readonly kind: 'transition'
  readonly fromOutput: string
  readonly toOutput: string
  readonly direction: 'left' | 'right' | 'up' | 'down'
  readonly fromLabel: string
  readonly toLabel: string
  readonly untilMs: number
}

export type SessionLast = FollowDecision | TransitionDecision

export type SessionState = {
  readonly last: SessionLast | null
  readonly pendingFollow: Extract<FollowDecision, { kind: 'follow' }> | null
}

export type SessionStep = {
  readonly state: SessionState
  readonly command: string | null
}
