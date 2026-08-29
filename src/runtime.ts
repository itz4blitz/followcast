import { intervalTicks, nodeSchedule, type Schedule } from './clock/interval.ts'
import { createHyprlandPort, type HyprlandExec } from './hyprland/port.ts'
import type { HyprlandEnv } from './hyprland/socket.ts'
import { createSocketEvents } from './hyprland/socketEvents.ts'
import { createUnixLineReader } from './hyprland/unixLines.ts'
import { createMirrorPort, type SpawnedMirror } from './mirror/port.ts'
import type { FollowcastPorts } from './ports.ts'
import { createExecFile, type ExecFileFn } from './process/exec.ts'
import { createNodeSpawn, type SpawnFn } from './process/spawn.ts'
import { whichOnPath } from './process/which.ts'

export const GEOMETRY_TICK_MS = 100

export type RuntimeDeps = {
  readonly exec: HyprlandExec
  readonly openLines: (path: string) => AsyncIterable<string>
  readonly which: (binary: string) => string | null
  readonly spawn: (argv: readonly string[]) => SpawnedMirror
  readonly schedule: Schedule
  readonly tickMs: number
  readonly signal: AbortSignal
  readonly surfaceScript: string
}

export type RuntimeIo = {
  readonly execFile: ExecFileFn
  readonly spawn: SpawnFn
  readonly connect: (path: string) => { readonly readable: AsyncIterable<string> }
  readonly exists: (path: string) => boolean
  readonly pathEnv: string | undefined
  readonly surfaceScript: string
}

export function createRuntimePorts(env: HyprlandEnv, deps: RuntimeDeps): FollowcastPorts {
  return {
    hyprland: createHyprlandPort({
      exec: deps.exec,
      events: createSocketEvents(env, deps.openLines),
    }),
    mirror: createMirrorPort({
      which: deps.which,
      spawn: deps.spawn,
      surfaceScript: deps.surfaceScript,
    }),
    clock: {
      ticks: intervalTicks(deps.tickMs, deps.signal, deps.schedule),
    },
  }
}

export function runtimeDepsFromIo(io: RuntimeIo, signal: AbortSignal): RuntimeDeps {
  return {
    exec: createExecFile(io.execFile),
    openLines: createUnixLineReader(io.connect),
    which: (binary) => whichOnPath(binary, io.pathEnv, io.exists),
    spawn: createNodeSpawn(io.spawn),
    schedule: nodeSchedule,
    tickMs: GEOMETRY_TICK_MS,
    signal,
    surfaceScript: io.surfaceScript,
  }
}
