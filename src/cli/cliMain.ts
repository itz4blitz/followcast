import { startFollowcast } from '../app/followcast.ts'
import {
  DEFAULT_POLICY,
  isPaused,
  serializePolicy,
  setPaused,
  toggleApp,
  toggleMonitor,
  type SharePolicy,
} from '../domain/policy.ts'
import { shareStatus } from '../domain/shareStatus.ts'
import {
  DEFAULT_FOLLOW_OPTIONS,
  type DesktopSnapshot,
  type FollowOptions,
} from '../domain/types.ts'
import { isNewerVersion } from '../domain/updateCheck.ts'
import type { FollowcastPorts } from '../ports.ts'
import { parseArgs } from './parseArgs.ts'

export const USAGE = `followcast — share this window; it follows the focused display (Linux Hyprland & Windows)

Usage:
  followcast
  followcast start
  followcast stop
  followcast hide
  followcast resume
  followcast toggle
  followcast update
  followcast --version
  followcast --deny-class zoom --deny-class skype
  followcast policy
  followcast policy set-monitor <name> on|off
  followcast policy set-app <class> on|off
  followcast status
  followcast --help

In your share picker (Meet, Zoom, Discord), choose the window titled Followcast.
Use \`followcast policy\`, \`followcast hide/resume/toggle\` (or Ctrl+Shift+H / tray menu on Windows) to control privacy.
`

export type PolicyIo = {
  read(): SharePolicy
  write(policy: SharePolicy): void
}

type DaemonIo = {
  acquire(): () => void
  stop(): boolean
}

type UpdateIo = {
  fetchLatest(): Promise<string>
  apply(tag: string): Promise<void>
}

export type CliIo = {
  readonly argv: readonly string[]
  readonly stdout: { write(chunk: string): void }
  readonly stderr: { write(chunk: string): void }
  readonly createPorts: (options: FollowOptions) => FollowcastPorts
  readonly signal: AbortSignal
  readonly policy?: PolicyIo
  readonly snapshot?: () => Promise<DesktopSnapshot>
  readonly daemon?: DaemonIo
  readonly updater?: UpdateIo
  readonly version?: string
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'unknown error'
}

export async function buildCliMain(io: CliIo): Promise<number> {
  const parsed = parseArgs(io.argv)
  if (parsed.kind === 'help') {
    io.stdout.write(USAGE)
    return 0
  }
  if (parsed.kind === 'version') {
    io.stdout.write(`${io.version ?? '0.0.0'}\n`)
    return 0
  }
  if (parsed.kind === 'error') {
    io.stderr.write(`${parsed.message}\n`)
    return 1
  }
  if (
    parsed.kind === 'policy-show' ||
    parsed.kind === 'policy-set-monitor' ||
    parsed.kind === 'policy-set-app' ||
    parsed.kind === 'policy-set-paused' ||
    parsed.kind === 'policy-toggle-paused'
  ) {
    return handlePolicy(io, parsed)
  }
  if (parsed.kind === 'status') {
    return handleStatus(io)
  }
  if (parsed.kind === 'stop') {
    return handleStop(io)
  }
  if (parsed.kind === 'update') {
    return handleUpdate(io)
  }
  const options: FollowOptions = {
    selfClasses: DEFAULT_FOLLOW_OPTIONS.selfClasses,
    selfTitleIncludes: DEFAULT_FOLLOW_OPTIONS.selfTitleIncludes,
    denyClasses: parsed.denyClasses,
    policy: io.policy?.read() ?? DEFAULT_POLICY,
    privacyRegion: null,
  }
  let releaseLock: (() => void) | null = null
  try {
    releaseLock = io.daemon?.acquire() ?? null
    const ports = io.createPorts(options)
    const handle = startFollowcast(
      ports,
      () => ({
        ...options,
        policy: io.policy?.read() ?? options.policy,
      }),
      io.signal,
    )
    await Promise.all([handle.ready, handle.finished])
    return 0
  } catch (error) {
    io.stderr.write(`${formatError(error)}\n`)
    return 1
  } finally {
    releaseLock?.()
  }
}

function handlePolicy(
  io: CliIo,
  parsed: Extract<
    ReturnType<typeof parseArgs>,
    | { kind: 'policy-show' }
    | { kind: 'policy-set-monitor' }
    | { kind: 'policy-set-app' }
    | { kind: 'policy-set-paused' }
    | { kind: 'policy-toggle-paused' }
  >,
): number {
  const store = io.policy
  if (store === undefined) {
    io.stderr.write('policy store is unavailable\n')
    return 1
  }
  if (parsed.kind === 'policy-show') {
    io.stdout.write(serializePolicy(store.read()))
    return 0
  }
  const current = store.read()
  const next = nextPolicy(current, parsed)
  store.write(next)
  io.stdout.write(serializePolicy(next))
  return 0
}

function nextPolicy(
  current: SharePolicy,
  parsed: Extract<
    ReturnType<typeof parseArgs>,
    | { kind: 'policy-set-monitor' }
    | { kind: 'policy-set-app' }
    | { kind: 'policy-set-paused' }
    | { kind: 'policy-toggle-paused' }
  >,
): SharePolicy {
  if (parsed.kind === 'policy-set-monitor') {
    return toggleMonitor(current, parsed.name, parsed.enabled)
  }
  if (parsed.kind === 'policy-set-app') {
    return toggleApp(current, parsed.className, parsed.enabled)
  }
  if (parsed.kind === 'policy-set-paused') {
    return setPaused(current, parsed.paused)
  }
  return setPaused(current, !isPaused(current))
}

function handleStop(io: CliIo): number {
  if (io.daemon === undefined) {
    io.stderr.write('daemon control is unavailable\n')
    return 1
  }
  const stopped = io.daemon.stop()
  io.stdout.write(stopped ? 'Followcast stopped.\n' : 'Followcast is not running.\n')
  return 0
}

async function handleUpdate(io: CliIo): Promise<number> {
  if (io.updater === undefined) {
    io.stderr.write('update is unavailable\n')
    return 1
  }
  const current = io.version ?? '0.0.0'
  try {
    const latest = await io.updater.fetchLatest()
    if (!isNewerVersion(current, latest)) {
      io.stdout.write(`Followcast is up to date (v${current}).\n`)
      return 0
    }
    await io.updater.apply(latest)
    io.stdout.write(`Upgraded Followcast to ${latest}.\n`)
    return 0
  } catch (error) {
    io.stderr.write(`${formatError(error)}\n`)
    return 1
  }
}

async function handleStatus(io: CliIo): Promise<number> {
  if (io.snapshot === undefined || io.policy === undefined) {
    io.stderr.write('status requires a Hyprland session\n')
    return 1
  }
  try {
    const snapshot = await io.snapshot()
    const options: FollowOptions = {
      ...DEFAULT_FOLLOW_OPTIONS,
      policy: io.policy.read(),
    }
    io.stdout.write(`${JSON.stringify(shareStatus(snapshot, options))}\n`)
    return 0
  } catch (error) {
    io.stderr.write(`${formatError(error)}\n`)
    return 1
  }
}
