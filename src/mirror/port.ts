import type { MirrorPort } from '../ports.ts'

export type SpawnedMirror = {
  write(line: string): void
  kill(): void
}

export type MirrorPortDeps = {
  which(binary: string): string | null
  spawn(argv: readonly string[]): SpawnedMirror
}

export function wlMirrorArgv(output: string): string[] {
  return [
    'wl-mirror',
    '--stream',
    '--title',
    'Followcast',
    '--show-cursor',
    '--scaling',
    'fit',
    output,
  ]
}

export function createMirrorPort(deps: MirrorPortDeps): MirrorPort {
  let child: SpawnedMirror | null = null
  return {
    start: async (output: string) => {
      if (deps.which('grim') === null) {
        throw new Error('grim is not installed; pacman -S grim')
      }
      child = deps.spawn(wlMirrorArgv(output))
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
