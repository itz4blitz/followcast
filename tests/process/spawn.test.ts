import { describe, expect, it } from 'vitest'
import { createNodeSpawn } from '../../src/process/spawn.ts'

describe('createNodeSpawn', () => {
  it('writes newline-terminated stream lines and SIGTERMs the child', () => {
    const writes: string[] = []
    let killed = false
    const spawn = createNodeSpawn((command, args) => {
      expect(command).toBe('python3')
      expect(args[0]).toBe('/opt/followcast/privacy-card.py')
      return {
        stdin: {
          write: (chunk: string) => {
            writes.push(chunk)
          },
        },
        kill: () => {
          killed = true
        },
      }
    })
    const child = spawn(['python3', '/opt/followcast/privacy-card.py'])
    child.write('--freeze')
    child.kill()
    expect(writes).toEqual(['--freeze\n'])
    expect(killed).toBe(true)
  })

  it('rejects an empty argv', () => {
    const spawn = createNodeSpawn(() => {
      throw new Error('should not run')
    })
    expect(() => spawn([])).toThrow(/empty argv/)
  })
})
