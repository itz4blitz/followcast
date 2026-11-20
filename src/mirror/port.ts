import type { MirrorPort } from '../ports.ts'

export type SpawnedMirror = {
  write(line: string): void
  kill(): void
}

export function dummySurfaceArgv(script: string, pythonBinary = 'python3'): string[] {
  return [pythonBinary, '-u', script]
}

export type MirrorPortDeps = {
  which(binary: string): string | null
  spawn(argv: readonly string[]): SpawnedMirror
  surfaceScript: string
  pythonBinary?: string
  requiredBinary?: string
  missingBinaryMessage?: string
}

export function createMirrorPort(deps: MirrorPortDeps): MirrorPort {
  let child: SpawnedMirror | null = null
  const requiredBinary = deps.requiredBinary ?? 'grim'
  const missingMessage = deps.missingBinaryMessage ?? 'grim is not installed; pacman -S grim'
  return {
    start: async (output: string) => {
      if (deps.which(requiredBinary) === null) {
        throw new Error(missingMessage)
      }
      child = deps.spawn(dummySurfaceArgv(deps.surfaceScript, deps.pythonBinary))
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
