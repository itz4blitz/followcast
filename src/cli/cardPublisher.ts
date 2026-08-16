import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { privacyCardSvg } from '../domain/privacyCard.ts'
import type { PrivacyCardPort } from '../ports.ts'

export function cardStatePath(runtimeDir: string): string {
  return `${runtimeDir}/followcast/privacy.json`
}

export function cardSvgPath(runtimeDir: string): string {
  return `${runtimeDir}/followcast/privacy.svg`
}

export function filePrivacyCard(runtimeDir: string): PrivacyCardPort {
  return {
    publish: (card) => {
      const jsonPath = cardStatePath(runtimeDir)
      const svgPath = cardSvgPath(runtimeDir)
      mkdirSync(dirname(jsonPath), { recursive: true })
      if (card === null) {
        writeFileSync(jsonPath, `${JSON.stringify({ visible: false })}\n`)
        return
      }
      writeFileSync(jsonPath, `${JSON.stringify({ visible: true, appLabel: card.appLabel })}\n`)
      writeFileSync(
        svgPath,
        privacyCardSvg({ extensionName: 'Followcast', appLabel: card.appLabel }),
      )
    },
  }
}
