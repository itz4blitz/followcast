import { existsSync } from 'node:fs'
import { delimiter } from 'node:path'

export function whichOnPath(
  binary: string,
  pathEnv: string | undefined,
  exists: (path: string) => boolean = existsSync,
): string | null {
  if (pathEnv === undefined || pathEnv === '') {
    return null
  }
  for (const directory of pathEnv.split(delimiter)) {
    const candidate = `${directory}/${binary}`
    if (exists(candidate)) {
      return candidate
    }
  }
  return null
}
