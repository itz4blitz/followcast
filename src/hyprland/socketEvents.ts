import { hyprlandSocketPath, type HyprlandEnv } from './socket.ts'

export function createSocketEvents(
  env: HyprlandEnv,
  openLines: (path: string) => AsyncIterable<string>,
): () => AsyncIterable<string> {
  return () => openLines(hyprlandSocketPath(env))
}
