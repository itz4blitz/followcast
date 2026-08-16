import { initialOutput } from '../domain/initialOutput.ts'
import { privacyRegionFrom, privacySlotRegion } from '../domain/privacyWindow.ts'
import { reduceSession } from '../domain/session.ts'
import type { FollowOptions, SessionState } from '../domain/types.ts'
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
  let state: SessionState = { last: null }
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
      ),
      consumeTicks(
        ports,
        options,
        signal,
        () => state,
        (next) => {
          state = next
        },
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
  const step = reduceSession(state, snapshot, {
    ...options,
    privacyRegion: privacyRegionFrom(snapshot) ?? privacySlotRegion(snapshot.monitors),
  })
  if (step.command !== null) {
    ports.mirror.send(step.command)
  }
  const card = ports.privacyCard
  if (card !== undefined) {
    const last = step.state.last
    // Stryker disable next-line ConditionalExpression: equivalent — reduceSession always leaves last set
    if (last !== null && last.kind === 'privacy') {
      card.publish({ appLabel: last.appLabel })
    } else {
      card.publish(null)
    }
  }
  return step.state
}

async function refresh(
  ports: FollowcastPorts,
  options: FollowOptionsSource,
  signal: AbortSignal,
  readState: () => SessionState,
  writeState: (state: SessionState) => void,
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
}

async function consumeEvents(
  ports: FollowcastPorts,
  options: FollowOptionsSource,
  signal: AbortSignal,
  readState: () => SessionState,
  writeState: (state: SessionState) => void,
): Promise<void> {
  for await (const line of ports.hyprland.events()) {
    // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — refresh() also returns when aborted
    if (signal.aborted) {
      return
    }
    if (classifyEvent(line) === 'ignore') {
      continue
    }
    await refresh(ports, options, signal, readState, writeState)
  }
}

async function consumeTicks(
  ports: FollowcastPorts,
  options: FollowOptionsSource,
  signal: AbortSignal,
  readState: () => SessionState,
  writeState: (state: SessionState) => void,
): Promise<void> {
  for await (const _tick of ports.clock.ticks) {
    // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — refresh() also returns when aborted
    if (signal.aborted) {
      return
    }
    await refresh(ports, options, signal, readState, writeState)
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
