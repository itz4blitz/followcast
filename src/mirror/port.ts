import type { MirrorPort } from '../ports.ts'

export type SpawnedMirror = {
  write(line: string): void
  kill(): void
}

export function dummySurfaceArgv(script: string): string[] {
  return ['python3', '-u', script]
}

export type MirrorPortDeps = {
  which(binary: string): string | null
  spawn(argv: readonly string[]): SpawnedMirror
  surfaceScript: string
}

export function createMirrorPort(deps: MirrorPortDeps): MirrorPort {
  let child: SpawnedMirror | null = null
  return {
    start: async (output: string) => {
      if (deps.which('grim') === null) {
        throw new Error('grim is not installed; pacman -S grim')
      }
      child = deps.spawn(dummySurfaceArgv(deps.surfaceScript))
      child.write(`--output '${output}'`)
    },
    send: (line: string) => {
      if (child !== null) {
        child.write(line)
      }
    },
    stop: async () => {
      if (child !== null) {
        child.kill()
        child = null
      }
    },
  }
}
