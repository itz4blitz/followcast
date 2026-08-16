import { startFollowcast } from '../app/followcast.ts'
import { DEFAULT_POLICY, toggleApp, toggleMonitor, type SharePolicy } from '../domain/policy.ts'
import { serializePolicy } from '../domain/policy.ts'
import { shareStatus } from '../domain/shareStatus.ts'
import {
  DEFAULT_FOLLOW_OPTIONS,
  type DesktopSnapshot,
  type FollowOptions,
} from '../domain/types.ts'
import type { FollowcastPorts } from '../ports.ts'
import { parseArgs } from './parseArgs.ts'

export const USAGE = `followcast — share this window; it follows the focused Hyprland app

Usage:
  followcast
  followcast start
  followcast --deny-class zoom --deny-class skype
  followcast policy
  followcast policy set-monitor <name> on|off
  followcast policy set-app <class> on|off
  followcast status
  followcast --help

In the Omarchy share picker, choose the window titled Followcast.
Use the Followcast bar chip to mute monitors or apps (privacy card).
`

export type PolicyIo = {
  read(): SharePolicy
  write(policy: SharePolicy): void
}

export type CliIo = {
  readonly argv: readonly string[]
  readonly stdout: { write(chunk: string): void }
  readonly stderr: { write(chunk: string): void }
  readonly createPorts: (options: FollowOptions) => FollowcastPorts
  readonly signal: AbortSignal
  readonly policy?: PolicyIo
  readonly snapshot?: () => Promise<DesktopSnapshot>
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
  if (parsed.kind === 'error') {
    io.stderr.write(`${parsed.message}\n`)
    return 1
  }
  if (
    parsed.kind === 'policy-show' ||
    parsed.kind === 'policy-set-monitor' ||
    parsed.kind === 'policy-set-app'
  ) {
    return handlePolicy(io, parsed)
  }
  if (parsed.kind === 'status') {
    return handleStatus(io)
  }
  const options: FollowOptions = {
    selfClasses: DEFAULT_FOLLOW_OPTIONS.selfClasses,
    selfTitleIncludes: DEFAULT_FOLLOW_OPTIONS.selfTitleIncludes,
    denyClasses: parsed.denyClasses,
    policy: io.policy?.read() ?? DEFAULT_POLICY,
    privacyRegion: null,
  }
  try {
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
  }
}

function handlePolicy(
  io: CliIo,
  parsed: Extract<
    ReturnType<typeof parseArgs>,
    { kind: 'policy-show' } | { kind: 'policy-set-monitor' } | { kind: 'policy-set-app' }
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
  const next =
    parsed.kind === 'policy-set-monitor'
      ? toggleMonitor(current, parsed.name, parsed.enabled)
      : toggleApp(current, parsed.className, parsed.enabled)
  store.write(next)
  io.stdout.write(serializePolicy(next))
  return 0
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
