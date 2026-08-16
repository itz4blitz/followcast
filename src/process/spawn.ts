import type { SpawnedMirror } from '../mirror/port.ts'

type ChildLike = {
  readonly stdin: { write(chunk: string): void }
  kill(): void
}

export type SpawnFn = (command: string, args: readonly string[]) => ChildLike

export function createNodeSpawn(spawnFn: SpawnFn): (argv: readonly string[]) => SpawnedMirror {
  return (argv) => {
    const command = argv[0]
    if (command === undefined) {
      throw new Error('empty argv')
    }
    const child = spawnFn(command, argv.slice(1))
    return {
      write: (line) => {
        child.stdin.write(`${line}\n`)
      },
      kill: () => {
        child.kill()
      },
    }
  }
}
