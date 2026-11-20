#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { filePrivacyCard } from './cli/cardPublisher.ts'
import { buildCliMain } from './cli/cliMain.ts'
import { diskPolicy } from './cli/diskPolicy.ts'
import { runtimeDirFromEnv } from './cli/policyStore.ts'
import { dummySurfaceEnv } from './cli/privacyCardProcess.ts'
import { nodeSchedule } from './clock/interval.ts'
import { toDesktopSnapshot } from './hyprland/parse.ts'
import { createHyprlandPort } from './hyprland/port.ts'
import { createExecFile } from './process/exec.ts'
import { createNodeSpawn } from './process/spawn.ts'
import { whichOnPath } from './process/which.ts'
import {
  createRuntimePorts,
  createWindowsRuntimePorts,
  GEOMETRY_TICK_MS,
  runtimeDepsFromIo,
} from './runtime.ts'
import { createWindowsDesktopPort, type WindowsDesktopCommand } from './windows/port.ts'

function resolvePackageRoot(): string {
  if (typeof import.meta.url === 'string' && import.meta.url !== '') {
    return join(dirname(fileURLToPath(import.meta.url)), '..')
  }
  return dirname(process.execPath)
}

function runExecFile(
  command: string,
  args: readonly string[],
  options: { encoding: 'utf8' },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
): void {
  execFile(command, [...args], { ...options, windowsHide: true }, (error, stdout, stderr) => {
    callback(error, stdout, stderr)
  })
}

function win32DesktopCommand(
  desktopExe: string | undefined,
  desktopScript: string,
  subcommand: string,
): { readonly command: string; readonly args: readonly string[] } {
  if (desktopExe !== undefined) {
    return { command: desktopExe, args: [subcommand] }
  }
  return { command: 'python', args: ['-u', desktopScript, subcommand] }
}

function createWin32ServeQuery(
  desktopExe: string | undefined,
  scriptPath: string,
  signal: AbortSignal,
): (command: WindowsDesktopCommand) => Promise<string> {
  const spec = win32DesktopCommand(desktopExe, scriptPath, 'serve')
  const child = spawn(spec.command, [...spec.args], {
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: true,
  })
  const stdin = child.stdin
  const stdout = child.stdout
  if (stdin === null || stdout === null) {
    throw new Error('Followcast win32 desktop helper stdio is not available')
  }
  const reader = createInterface({ input: stdout })
  const pending: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = []
  reader.on('line', (line) => {
    const next = pending.shift()
    if (next !== undefined) {
      next.resolve(line)
    }
  })
  const failAll = (reason: string) => {
    while (pending.length > 0) {
      const next = pending.shift()
      if (next !== undefined) {
        next.reject(new Error(reason))
      }
    }
  }
  child.once('exit', () => {
    failAll('win32 desktop helper exited')
  })
  child.once('error', (error) => {
    failAll(error.message)
  })
  signal.addEventListener(
    'abort',
    () => {
      child.kill()
    },
    { once: true },
  )
  return (command) =>
    new Promise<string>((resolve, reject) => {
      pending.push({ resolve, reject })
      stdin.write(`${command}\n`)
    })
}

async function* createWin32Events(
  desktopExe: string | undefined,
  scriptPath: string,
  signal: AbortSignal,
): AsyncIterable<string> {
  const spec = win32DesktopCommand(desktopExe, scriptPath, 'events')
  const child = spawn(spec.command, [...spec.args], {
    stdio: ['ignore', 'pipe', 'inherit'],
    windowsHide: true,
  })
  const stdout = child.stdout
  if (stdout === null) {
    return
  }
  const stop = () => {
    child.kill()
  }
  signal.addEventListener('abort', stop, { once: true })
  try {
    const reader = createInterface({ input: stdout })
    for await (const line of reader) {
      if (signal.aborted) {
        return
      }
      yield line
    }
  } finally {
    stop()
  }
}

async function main(): Promise<void> {
  const controller = new AbortController()
  process.once('SIGINT', () => {
    controller.abort()
  })
  process.once('SIGTERM', () => {
    controller.abort()
  })

  const packageRoot = resolvePackageRoot()
  const policy = diskPolicy(process.env)
  const runtimeDir = runtimeDirFromEnv(process.env, tmpdir())
  const privacyCard = filePrivacyCard(runtimeDir)
  const isWindows = process.platform === 'win32'

  const win32DesktopScript = join(packageRoot, 'win32_desktop.py')
  const win32SurfaceScript = join(packageRoot, 'win32_surface.py')
  const win32DesktopExePath = join(packageRoot, 'win32_desktop.exe')
  const win32SurfaceExePath = join(packageRoot, 'win32_surface.exe')
  const win32DesktopExe = existsSync(win32DesktopExePath) ? win32DesktopExePath : undefined
  const win32SurfaceExe = existsSync(win32SurfaceExePath) ? win32SurfaceExePath : undefined
  const cardScript = join(packageRoot, 'privacy-card.py')

  const snapshotExec = createExecFile(runExecFile)
  const snapshotPort = isWindows
    ? createWindowsDesktopPort({
        query: (command) => {
          const spec = win32DesktopCommand(win32DesktopExe, win32DesktopScript, command)
          return snapshotExec([spec.command, ...spec.args])
        },
        events: async function* empty() {},
      })
    : createHyprlandPort({
        exec: snapshotExec,
        events: async function* empty() {},
      })

  const code = await buildCliMain({
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr,
    policy,
    snapshot: async () =>
      toDesktopSnapshot(
        await snapshotPort.clients(),
        await snapshotPort.monitors(),
        await snapshotPort.activeWindow(),
      ),
    createPorts: () => {
      if (isWindows) {
        const ports = createWindowsRuntimePorts({
          query: createWin32ServeQuery(win32DesktopExe, win32DesktopScript, controller.signal),
          events: () => createWin32Events(win32DesktopExe, win32DesktopScript, controller.signal),
          which: (binary) =>
            whichOnPath(binary, process.env.PATH, existsSync, delimiter, ['.exe', '.cmd']),
          spawn: createNodeSpawn((command, args) => {
            const child = spawn(command, [...args], {
              stdio: ['pipe', 'ignore', 'inherit'],
              env: dummySurfaceEnv(process.env),
              windowsHide: true,
            })
            const stdin = child.stdin
            if (stdin === null) {
              throw new Error('Followcast surface stdin is not available')
            }
            return {
              stdin,
              kill: () => {
                child.kill()
              },
            }
          }),
          schedule: nodeSchedule,
          tickMs: GEOMETRY_TICK_MS,
          signal: controller.signal,
          surfaceScript: win32SurfaceScript,
          surfaceExecutable: win32SurfaceExe,
        })
        return { ...ports, privacyCard }
      }
      const ports = createRuntimePorts(
        process.env,
        runtimeDepsFromIo(
          {
            execFile: runExecFile,
            spawn: (command, args) => {
              const child = spawn(command, [...args], {
                stdio: ['pipe', 'ignore', 'inherit'],
                env: dummySurfaceEnv(process.env),
              })
              const stdin = child.stdin
              if (stdin === null) {
                throw new Error('Followcast surface stdin is not available')
              }
              return {
                stdin,
                kill: () => {
                  child.kill()
                },
              }
            },
            connect: (path) => ({
              readable: createInterface({ input: createConnection(path) }),
            }),
            exists: existsSync,
            pathEnv: process.env.PATH,
            surfaceScript: cardScript,
          },
          controller.signal,
        ),
      )
      return { ...ports, privacyCard }
    },
    signal: controller.signal,
  })

  process.exit(code)
}

void main()
