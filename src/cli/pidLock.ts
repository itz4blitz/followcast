export type PidLockIo = {
  readFile(path: string): string | null
  writeFile(path: string, content: string): void
  removeFile(path: string): void
  isAlive(pid: number): boolean
  killPid(pid: number): void
  readonly currentPid: number
}

export function pidFilePath(runtimeDir: string): string {
  return `${runtimeDir}/followcast/followcast.pid`
}

function parsePid(raw: string | null): number | null {
  if (raw === null) {
    return null
  }
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }
  const parsed = Number.parseInt(trimmed, 10)
  return parsed > 0 ? parsed : null
}

export function readRunningPid(path: string, io: PidLockIo): number | null {
  const existing = parsePid(io.readFile(path))
  if (existing !== null && existing !== io.currentPid && io.isAlive(existing)) {
    return existing
  }
  return null
}

export function acquirePidLock(path: string, io: PidLockIo): () => void {
  const existing = readRunningPid(path, io)
  if (existing !== null) {
    throw new Error(`Followcast is already running (pid ${String(existing)})`)
  }
  io.writeFile(path, `${String(io.currentPid)}\n`)
  return () => {
    io.removeFile(path)
  }
}

export function stopRunningDaemon(path: string, io: PidLockIo): boolean {
  const raw = io.readFile(path)
  if (raw === null) {
    return false
  }
  const pid = parsePid(raw)
  if (pid === null || !io.isAlive(pid)) {
    io.removeFile(path)
    return false
  }
  io.killPid(pid)
  io.removeFile(path)
  return true
}
