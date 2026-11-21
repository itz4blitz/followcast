const DIGITS_RE = /^\d+$/

export function parseSemver(version: string): readonly [number, number, number] | null {
  const trimmed = version.trim()
  const body = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed
  const parts = body.split('.')
  if (parts.length !== 3 || !parts.every((part) => DIGITS_RE.test(part))) {
    return null
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])]
}

export function isNewerVersion(current: string, latest: string): boolean {
  const left = parseSemver(current)
  const right = parseSemver(latest)
  if (left === null || right === null) {
    return false
  }
  const diff = right[0] - left[0] || right[1] - left[1] || right[2] - left[2]
  return diff > 0
}

export function formatUpdatePrompt(latestVersion: string): string {
  const clean = latestVersion.trim()
  const tag = clean.startsWith('v') ? clean : `v${clean}`
  return `A new version of Followcast is available (${tag}). Would you like to upgrade?`
}
