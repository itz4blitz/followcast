import { describe, expect, it } from 'vitest'
import {
  acquirePidLock,
  pidFilePath,
  readRunningPid,
  stopRunningDaemon,
  type PidLockIo,
} from '../../src/cli/pidLock.ts'

function memoryIo(overrides: Partial<PidLockIo> = {}): {
  io: PidLockIo
  files: Map<string, string>
  killed: number[]
} {
  const files = new Map<string, string>()
  const killed: number[] = []
  const io: PidLockIo = {
    readFile: (path) => files.get(path) ?? null,
    writeFile: (path, content) => {
      files.set(path, content)
    },
    removeFile: (path) => {
      files.delete(path)
    },
    isAlive: () => false,
    killPid: (pid) => {
      killed.push(pid)
    },
    currentPid: 4242,
    ...overrides,
  }
  return { io, files, killed }
}

describe('pidFilePath', () => {
  it('places followcast.pid under the followcast runtime directory', () => {
    expect(pidFilePath('/run/user/1000')).toBe('/run/user/1000/followcast/followcast.pid')
  })
})

describe('acquirePidLock', () => {
  it('writes the current PID and removes it on release', () => {
    const { io, files } = memoryIo({ isAlive: () => true })
    const path = '/run/followcast/followcast.pid'
    const release = acquirePidLock(path, io)
    expect(files.get(path)).toBe('4242\n')
    release()
    expect(files.has(path)).toBe(false)
  })

  it('refuses to start when another live PID holds the lock', () => {
    const { io, files } = memoryIo({ isAlive: (pid) => pid === 9999 })
    const path = '/run/followcast/followcast.pid'
    files.set(path, '9999\n')
    expect(() => acquirePidLock(path, io)).toThrow(/already running \(pid 9999\)/)
    expect(files.get(path)).toBe('9999\n')
  })

  it('replaces a stale or invalid PID file', () => {
    const { io, files } = memoryIo({ isAlive: () => false })
    const path = '/run/followcast/followcast.pid'
    files.set(path, '9999\n')
    const release = acquirePidLock(path, io)
    expect(files.get(path)).toBe('4242\n')
    release()

    for (const invalid of ['not-a-pid', '123abc', '+123']) {
      const check = memoryIo({ isAlive: () => true })
      check.files.set(path, invalid)
      const rel = acquirePidLock(path, check.io)
      expect(check.files.get(path)).toBe('4242\n')
      rel()
    }
  })

  it('allows reacquiring when the PID file already matches currentPid', () => {
    const { io, files } = memoryIo({ isAlive: () => true })
    const path = '/run/followcast/followcast.pid'
    files.set(path, '4242\n')
    const release = acquirePidLock(path, io)
    expect(files.get(path)).toBe('4242\n')
    release()
    expect(files.has(path)).toBe(false)
  })
})

describe('stopRunningDaemon', () => {
  it('returns false without removing anything when no PID file exists', () => {
    let removed = 0
    const { io, killed } = memoryIo({
      removeFile: () => {
        removed += 1
      },
    })
    expect(stopRunningDaemon('/run/followcast/followcast.pid', io)).toBe(false)
    expect(killed).toEqual([])
    expect(removed).toBe(0)
  })

  it('removes a stale PID file and returns false when the process is gone', () => {
    const { io, files, killed } = memoryIo({ isAlive: () => false })
    const path = '/run/followcast/followcast.pid'
    files.set(path, '7777\n')
    expect(stopRunningDaemon(path, io)).toBe(false)
    expect(files.has(path)).toBe(false)
    expect(killed).toEqual([])
  })

  it('kills a live daemon PID, removes the lockfile, and returns true', () => {
    const { io, files, killed } = memoryIo({ isAlive: (pid) => pid === 7777 })
    const path = '/run/followcast/followcast.pid'
    files.set(path, '7777\n')
    expect(stopRunningDaemon(path, io)).toBe(true)
    expect(killed).toEqual([7777])
    expect(files.has(path)).toBe(false)
  })

  it('cleans up an unparseable PID file and returns false', () => {
    const { io, files, killed } = memoryIo({ isAlive: () => true })
    const path = '/run/followcast/followcast.pid'
    files.set(path, '0\n')
    expect(stopRunningDaemon(path, io)).toBe(false)
    expect(files.has(path)).toBe(false)
    expect(killed).toEqual([])
  })
})

describe('readRunningPid', () => {
  it('returns the live PID of another instance or null otherwise', () => {
    const path = '/run/followcast/followcast.pid'
    const noProbe = memoryIo({
      isAlive: () => {
        throw new Error('should not check liveness without a PID')
      },
    })
    expect(readRunningPid(path, noProbe.io)).toBeNull()
    const { io, files } = memoryIo({ isAlive: (pid) => pid === 9001 })
    files.set(path, '9001\n')
    expect(readRunningPid(path, io)).toBe(9001)
    files.set(path, '4242\n')
    expect(readRunningPid(path, io)).toBeNull()
  })
})
