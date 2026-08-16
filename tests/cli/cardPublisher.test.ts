import { mkdtempSync, readFileSync } from 'node:fs'
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

  it('marks the card hidden when publish is cleared', () => {
    const dir = mkdtempSync(join(tmpdir(), 'followcast-'))
    const card = filePrivacyCard(dir)
    card.publish({ appLabel: 'Slack' })
    card.publish(null)
    expect(JSON.parse(readFileSync(cardStatePath(dir), 'utf8'))).toEqual({ visible: false })
  })
})
