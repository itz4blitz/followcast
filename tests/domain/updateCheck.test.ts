import { describe, expect, it } from 'vitest'
import { formatUpdatePrompt, isNewerVersion, parseSemver } from '../../src/domain/updateCheck.ts'

describe('parseSemver', () => {
  it('parses bare and v-prefixed semantic versions', () => {
    expect(parseSemver('0.6.1')).toEqual([0, 6, 1])
    expect(parseSemver('v1.2.3')).toEqual([1, 2, 3])
    expect(parseSemver(' v10.20.30 ')).toEqual([10, 20, 30])
  })

  it('rejects malformed version strings', () => {
    expect(parseSemver('')).toBeNull()
    expect(parseSemver('v1.2')).toBeNull()
    expect(parseSemver('1.2.3.4')).toBeNull()
    expect(parseSemver('1.2.3-beta')).toBeNull()
    expect(parseSemver('abc1.2.3')).toBeNull()
  })
})

describe('isNewerVersion', () => {
  it('detects newer major, minor, and patch versions', () => {
    expect(isNewerVersion('0.6.1', '0.6.2')).toBe(true)
    expect(isNewerVersion('0.6.1', '0.7.0')).toBe(true)
    expect(isNewerVersion('0.6.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('v0.6.1', 'v0.6.2')).toBe(true)
  })

  it('returns false when current is equal, newer, or either version is invalid', () => {
    expect(isNewerVersion('0.6.1', '0.6.1')).toBe(false)
    expect(isNewerVersion('0.6.2', '0.6.1')).toBe(false)
    expect(isNewerVersion('0.7.0', '0.6.9')).toBe(false)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(false)
    expect(isNewerVersion('bad', '0.6.2')).toBe(false)
    expect(isNewerVersion('0.6.1', 'bad')).toBe(false)
  })
})

describe('formatUpdatePrompt', () => {
  it('formats the upgrade prompt with a normalized v-prefix', () => {
    expect(formatUpdatePrompt('0.7.0')).toBe(
      'A new version of Followcast is available (v0.7.0). Would you like to upgrade?',
    )
    expect(formatUpdatePrompt('v0.7.0')).toBe(
      'A new version of Followcast is available (v0.7.0). Would you like to upgrade?',
    )
    expect(formatUpdatePrompt(' 0.7.0 ')).toBe(
      'A new version of Followcast is available (v0.7.0). Would you like to upgrade?',
    )
  })
})
