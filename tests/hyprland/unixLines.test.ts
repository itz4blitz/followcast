import { describe, expect, it } from 'vitest'
import { createUnixLineReader } from '../../src/hyprland/unixLines.ts'

describe('createUnixLineReader', () => {
  it('returns the readable stream produced for the socket path', async () => {
    const paths: string[] = []
    const open = createUnixLineReader((path) => {
      paths.push(path)
      return {
        readable: (async function* () {
          yield 'pin>>0x1,1'
        })(),
      }
    })
    const lines: string[] = []
    for await (const line of open('/tmp/socket')) {
      lines.push(line)
    }
    expect(paths).toEqual(['/tmp/socket'])
    expect(lines).toEqual(['pin>>0x1,1'])
  })
})
