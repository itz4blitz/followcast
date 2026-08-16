import { describe, expect, it } from 'vitest'
import { createExecFile } from '../../src/process/exec.ts'

describe('createExecFile', () => {
  it('resolves stdout on success', async () => {
    const exec = createExecFile((cmd, args, opts, callback) => {
      expect(cmd).toBe('hyprctl')
      expect(args).toEqual(['clients', '-j'])
      expect(opts).toEqual({ encoding: 'utf8' })
      callback(null, '[]', '')
    })
    await expect(exec(['hyprctl', 'clients', '-j'])).resolves.toBe('[]')
  })

  it('rejects when argv is empty', async () => {
    const exec = createExecFile(() => {
      throw new Error('should not run')
    })
    await expect(exec([])).rejects.toThrow(/empty argv/)
  })

  it('rejects with stderr when the process fails', async () => {
    const exec = createExecFile((_cmd, _args, _opts, callback) => {
      callback(new Error('exit 1'), '', 'not running')
    })
    await expect(exec(['hyprctl', 'clients', '-j'])).rejects.toThrow(/not running/)
  })

  it('falls back to the error message when stderr is empty', async () => {
    const exec = createExecFile((_cmd, _args, _opts, callback) => {
      callback(new Error('spawn failed'), '', '')
    })
    await expect(exec(['hyprctl', 'clients', '-j'])).rejects.toThrow(/spawn failed/)
  })
})
