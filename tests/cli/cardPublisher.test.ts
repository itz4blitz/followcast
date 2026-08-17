import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cardStatePath, cardSvgPath, filePrivacyCard } from '../../src/cli/cardPublisher.ts'

describe('filePrivacyCard', () => {
  it('writes JSON and an SVG branded Followcast', () => {
    const dir = mkdtempSync(join(tmpdir(), 'followcast-'))
    filePrivacyCard(dir).publish({ appLabel: 'Slack' })
    const state = JSON.parse(readFileSync(cardStatePath(dir), 'utf8'))
    expect(state).toEqual({ visible: true, appLabel: 'Slack' })
    expect(readFileSync(cardSvgPath(dir), 'utf8')).toContain('Hidden by Followcast')
  })

  it('writes a monitor slide beat', () => {
    const dir = mkdtempSync(join(tmpdir(), 'followcast-'))
    filePrivacyCard(dir).publish({
      kind: 'slide',
      direction: 'right',
      fromOutput: 'DP-1',
      toOutput: 'HDMI-A-1',
      fromLabel: 'Display 1',
      toLabel: 'Display 2',
    })
    expect(JSON.parse(readFileSync(cardStatePath(dir), 'utf8'))).toEqual({
      visible: true,
      kind: 'slide',
      direction: 'right',
      fromOutput: 'DP-1',
      toOutput: 'HDMI-A-1',
      fromLabel: 'Display 1',
      toLabel: 'Display 2',
    })
  })

  it('marks the card hidden when publish is cleared', () => {
    const dir = mkdtempSync(join(tmpdir(), 'followcast-'))
    const card = filePrivacyCard(dir)
    card.publish({ appLabel: 'Slack' })
    card.publish(null)
    expect(JSON.parse(readFileSync(cardStatePath(dir), 'utf8'))).toEqual({ visible: false })
  })

  it('skips rewriting identical cards', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'followcast-'))
    const state = cardStatePath(dir)
    const card = filePrivacyCard(dir)
    card.publish({ appLabel: 'Slack' })
    const firstWrite = statSync(state).mtimeMs
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10)
    })
    card.publish({ appLabel: 'Slack' })
    expect(statSync(state).mtimeMs).toBe(firstWrite)
    card.publish({ appLabel: 'Zoom' })
    expect(statSync(state).mtimeMs).toBeGreaterThan(firstWrite)
  })

  it('skips rewriting a repeated hide and rewrites after it changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'followcast-'))
    const state = cardStatePath(dir)
    const card = filePrivacyCard(dir)
    card.publish({ appLabel: 'Slack' })
    card.publish(null)
    const hiddenWrite = statSync(state).mtimeMs
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10)
    })
    card.publish(null)
    expect(statSync(state).mtimeMs).toBe(hiddenWrite)
    card.publish({ appLabel: 'Slack' })
    expect(statSync(state).mtimeMs).toBeGreaterThan(hiddenWrite)
  })

  it('leaves no temporary file behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'followcast-'))
    filePrivacyCard(dir).publish({ appLabel: 'Slack' })
    expect(existsSync(`${cardStatePath(dir)}.tmp`)).toBe(false)
    expect(existsSync(`${cardSvgPath(dir)}.tmp`)).toBe(false)
  })
})
