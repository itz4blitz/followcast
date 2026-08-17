import { initialOutput } from '../domain/initialOutput.ts'
import { parkPoint, surfaceWindow } from '../domain/park.ts'
import { privacyRegionFrom, privacySlotRegion } from '../domain/privacyWindow.ts'
import { reduceSession } from '../domain/session.ts'
import type { DesktopSnapshot, FollowOptions, SessionState } from '../domain/types.ts'
import { classifyEvent } from '../hyprland/events.ts'
import { toDesktopSnapshot } from '../hyprland/parse.ts'
import type { FollowcastPorts } from '../ports.ts'

export type FollowcastHandle = {
  readonly ready: Promise<void>
  readonly finished: Promise<void>
}

export type FollowOptionsSource = FollowOptions | (() => FollowOptions)

function resolveOptions(source: FollowOptionsSource): FollowOptions {
  if (typeof source === 'function') {
    return source()
  }
  return source
}

export function startFollowcast(
  ports: FollowcastPorts,
  options: FollowOptionsSource,
  signal: AbortSignal,
): FollowcastHandle {
  const ready = Promise.withResolvers<void>()
  const finished = run(ports, options, signal, ready)
  return { ready: ready.promise, finished }
}

export async function runFollowcast(
  ports: FollowcastPorts,
  options: FollowOptionsSource,
  signal: AbortSignal,
): Promise<void> {
  const handle = startFollowcast(ports, options, signal)
  await Promise.all([handle.ready, handle.finished])
}

async function run(
  ports: FollowcastPorts,
  options: FollowOptionsSource,
  signal: AbortSignal,
  ready: PromiseWithResolvers<void>,
): Promise<void> {
  let started = false
  let state: SessionState = { last: null, pendingFollow: null }
  const parkMemo = { key: '' }
  try {
    const first = toDesktopSnapshot(
      await ports.hyprland.clients(),
      await ports.hyprland.monitors(),
      await ports.hyprland.activeWindow(),
    )
    const output = initialOutput(first.monitors)
    await ports.mirror.start(output)
    started = true
    state = apply(state, first, resolveOptions(options), ports)
    await parkSurface(ports, first, resolveOptions(options), parkMemo)
    ready.resolve()
    await Promise.race([
      waitForAbort(signal),
      consumeEvents(
        ports,
        options,
        signal,
        () => state,
        (next) => {
          state = next
        },
        parkMemo,
      ),
      consumeTicks(
        ports,
        options,
        signal,
        () => state,
        (next) => {
          state = next
        },
        parkMemo,
      ),
    ])
  } catch (error) {
    ready.reject(error)
    throw error
  } finally {
    if (started) {
      await ports.mirror.stop()
    }
  }
}

function apply(
  state: SessionState,
  snapshot: ReturnType<typeof toDesktopSnapshot>,
  options: FollowOptions,
  ports: FollowcastPorts,
): SessionState {
  const nowMs = ports.clock.now !== undefined ? ports.clock.now() : Date.now()
  const step = reduceSession(
    state,
    snapshot,
    {
      ...options,
      privacyRegion: privacyRegionFrom(snapshot) ?? privacySlotRegion(snapshot.monitors),
    },
    nowMs,
  )
  if (step.command !== null) {
    ports.mirror.send(step.command)
  }
  const card = ports.privacyCard
  if (card !== undefined) {
    const last = step.state.last
    // Stryker disable next-line ConditionalExpression: equivalent — reduceSession always leaves last set
    if (last !== null && last.kind === 'privacy') {
      card.publish({ appLabel: last.appLabel })
    } else if (
      // Stryker disable next-line ConditionalExpression: equivalent — reduceSession always leaves last set
      last !== null &&
      last.kind === 'transition'
    ) {
      card.publish({
        kind: 'slide',
        direction: last.direction,
        fromOutput: last.fromOutput,
        toOutput: last.toOutput,
        fromLabel: last.fromLabel,
        toLabel: last.toLabel,
      })
    } else {
      card.publish(null)
    }
  }
  return step.state
}

async function parkSurface(
  ports: FollowcastPorts,
  snapshot: DesktopSnapshot,
  options: FollowOptions,
  memo: { key: string },
): Promise<void> {
  const surface = surfaceWindow(snapshot.windows, options.selfClasses)
  const park = parkPoint(snapshot.monitors)
  if (surface === undefined || park === null) {
    return
  }
  if (surface.at.x === park.x && surface.at.y === park.y) {
    memo.key = ''
    return
  }
  const key = `${surface.address}:${park.x}:${park.y}`
  if (memo.key === key) {
    return
  }
  memo.key = key
  try {
    await ports.hyprland.moveWindow(surface.address, park.x, park.y)
  } catch {
    memo.key = ''
  }
}

async function refresh(
  ports: FollowcastPorts,
  options: FollowOptionsSource,
  signal: AbortSignal,
  readState: () => SessionState,
  writeState: (state: SessionState) => void,
  parkMemo: { key: string },
): Promise<void> {
  const snapshot = toDesktopSnapshot(
    await ports.hyprland.clients(),
    await ports.hyprland.monitors(),
    await ports.hyprland.activeWindow(),
  )
  if (signal.aborted) {
    return
  }
  writeState(apply(readState(), snapshot, resolveOptions(options), ports))
  await parkSurface(ports, snapshot, resolveOptions(options), parkMemo)
}

async function consumeEvents(
  ports: FollowcastPorts,
  options: FollowOptionsSource,
  signal: AbortSignal,
  readState: () => SessionState,
  writeState: (state: SessionState) => void,
  parkMemo: { key: string },
): Promise<void> {
  for await (const line of ports.hyprland.events()) {
    // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — refresh() also returns when aborted
    if (signal.aborted) {
      return
    }
    if (classifyEvent(line) === 'ignore') {
      continue
    }
    await refresh(ports, options, signal, readState, writeState, parkMemo)
  }
}

async function consumeTicks(
  ports: FollowcastPorts,
  options: FollowOptionsSource,
  signal: AbortSignal,
  readState: () => SessionState,
  writeState: (state: SessionState) => void,
  parkMemo: { key: string },
): Promise<void> {
  for await (const _tick of ports.clock.ticks) {
    // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — refresh() also returns when aborted
    if (signal.aborted) {
      return
    }
    await refresh(ports, options, signal, readState, writeState, parkMemo)
  }
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: equivalent — abort is delivered once per session
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}
