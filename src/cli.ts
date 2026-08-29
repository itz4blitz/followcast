#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { filePrivacyCard } from './cli/cardPublisher.ts'
import { dummySurfaceEnv } from './cli/privacyCardProcess.ts'
import { buildCliMain } from './cli/cliMain.ts'
import { diskPolicy } from './cli/diskPolicy.ts'
import { toDesktopSnapshot } from './hyprland/parse.ts'
import { createHyprlandPort } from './hyprland/port.ts'
import { createExecFile } from './process/exec.ts'
import { createRuntimePorts, runtimeDepsFromIo } from './runtime.ts'

const controller = new AbortController()
process.once('SIGINT', () => {
  controller.abort()
})
process.once('SIGTERM', () => {
  controller.abort()
})

const policy = diskPolicy(process.env)
const runtimeDir = process.env.XDG_RUNTIME_DIR ?? '/tmp'
const privacyCard = filePrivacyCard(runtimeDir)
const hyprExec = createExecFile((command, args, options, callback) => {
  execFile(command, [...args], options, (error, stdout, stderr) => {
    callback(error, stdout, stderr)
  })
})
const hyprland = createHyprlandPort({
  exec: hyprExec,
  events: async function* empty() {},
})

const cardScript = join(dirname(fileURLToPath(import.meta.url)), '..', 'privacy-card.py')

const code = await buildCliMain({
  argv: process.argv.slice(2),
  stdout: process.stdout,
  stderr: process.stderr,
  policy,
  snapshot: async () =>
    toDesktopSnapshot(
      await hyprland.clients(),
      await hyprland.monitors(),
      await hyprland.activeWindow(),
    ),
  createPorts: () => {
    const ports = createRuntimePorts(
      process.env,
      runtimeDepsFromIo(
        {
          execFile: (command, args, options, callback) => {
            execFile(command, [...args], options, (error, stdout, stderr) => {
              callback(error, stdout, stderr)
            })
          },
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
