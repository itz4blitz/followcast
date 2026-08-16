export type PrivacyCardCopy = {
  readonly extensionName: string
  readonly appLabel: string
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function privacyCardSvg(copy: PrivacyCardCopy): string {
  const brand = escapeXml(copy.extensionName)
  const app = escapeXml(copy.appLabel)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1b1d23"/>
      <stop offset="100%" stop-color="#2a3140"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <circle cx="240" cy="160" r="180" fill="#4d6bff" opacity="0.18" filter="url(#blur)"/>
  <circle cx="1080" cy="560" r="220" fill="#7c5cff" opacity="0.16" filter="url(#blur)"/>
  <rect x="200" y="180" width="880" height="360" rx="28" fill="#12141a" fill-opacity="0.72"/>
  <text x="640" y="310" text-anchor="middle" font-family="Inter, sans-serif" font-size="28" fill="#9aa3b5">Hidden by ${brand}</text>
  <text x="640" y="380" text-anchor="middle" font-family="Inter, sans-serif" font-size="48" font-weight="600" fill="#f4f6fb">${app}</text>
  <text x="640" y="450" text-anchor="middle" font-family="Inter, sans-serif" font-size="22" fill="#c5cddb">This application is off in the ${brand} privacy filter.</text>
</svg>
`
}
