import { existsSync } from 'node:fs'
import { delimiter } from 'node:path'

export function whichOnPath(
  binary: string,
  pathEnv: string | undefined,
  exists: (path: string) => boolean = existsSync,
  pathDelimiter: string = delimiter,
  extensions: readonly string[] = [],
): string | null {
  if (pathEnv === undefined || pathEnv === '') {
    return null
  }
  const suffixes = ['', ...extensions]
  for (const directory of pathEnv.split(pathDelimiter)) {
    for (const suffix of suffixes) {
      const candidate = `${directory}/${binary}${suffix}`
      if (exists(candidate)) {
        return candidate
      }
    }
  }
  return null
}
