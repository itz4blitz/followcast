import { describe, expect, it } from 'vitest'
import { privacyCardSvg } from '../../src/domain/privacyCard.ts'

describe('privacyCardSvg', () => {
  it('brands the card Followcast and names the hidden app', () => {
    const svg = privacyCardSvg({ extensionName: 'Followcast', appLabel: 'Slack' })
    expect(svg).toContain('Hidden by Followcast')
    expect(svg).toContain('Slack')
    expect(svg).toContain('privacy filter')
  })

  it('escapes XML in the app label so a title cannot break the card', () => {
    const svg = privacyCardSvg({
      extensionName: 'Followcast',
      appLabel: `Inbox <script> & "mail" O'Brien`,
    })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('Inbox &lt;script&gt; &amp; &quot;mail&quot; O&apos;Brien')
  })
})
