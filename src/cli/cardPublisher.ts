import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { privacyCardSvg } from '../domain/privacyCard.ts'
import type { PrivacyCardPort } from '../ports.ts'

export function cardStatePath(runtimeDir: string): string {
  return `${runtimeDir}/followcast/privacy.json`
}

export function cardSvgPath(runtimeDir: string): string {
  return `${runtimeDir}/followcast/privacy.svg`
}

function writeAtomic(path: string, text: string): void {
  const staging = `${path}.tmp`
  writeFileSync(staging, text)
  renameSync(staging, path)
}

export function filePrivacyCard(runtimeDir: string): PrivacyCardPort {
  let lastCard: Parameters<PrivacyCardPort['publish']>[0] = null
  let wroteNull = false
  return {
    publish: (card) => {
      if (card === null) {
        if (wroteNull && lastCard === null) {
          return
        }
        lastCard = null
        wroteNull = true
        writeAtomic(cardStatePath(runtimeDir), `${JSON.stringify({ visible: false })}\n`)
        return
      }
      if (card !== null && lastCard !== null && JSON.stringify(card) === JSON.stringify(lastCard)) {
        return
      }
      lastCard = card
      wroteNull = false
      const jsonPath = cardStatePath(runtimeDir)
      mkdirSync(dirname(jsonPath), { recursive: true })
      if ('kind' in card) {
        writeAtomic(
          jsonPath,
          `${JSON.stringify({
            visible: true,
            kind: 'slide',
            direction: card.direction,
            fromOutput: card.fromOutput,
            toOutput: card.toOutput,
            fromLabel: card.fromLabel,
            toLabel: card.toLabel,
          })}\n`,
        )
        return
      }
      writeAtomic(jsonPath, `${JSON.stringify({ visible: true, appLabel: card.appLabel })}\n`)
      writeAtomic(
        cardSvgPath(runtimeDir),
        privacyCardSvg({ extensionName: 'Followcast', appLabel: card.appLabel }),
      )
    },
  }
}
