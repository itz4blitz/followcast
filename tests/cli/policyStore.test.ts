import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY, toggleApp } from '../../src/domain/policy.ts'
import { loadPolicyText, policyFilePath, savePolicyText } from '../../src/cli/policyStore.ts'

describe('policyFilePath', () => {
  it('uses XDG_CONFIG_HOME when set', () => {
    expect(policyFilePath({ XDG_CONFIG_HOME: '/cfg', HOME: '/home/user' })).toBe(
      '/cfg/followcast/policy.json',
    )
  })

  it('falls back to ~/.config/followcast/policy.json', () => {
    expect(policyFilePath({ HOME: '/home/user' })).toBe('/home/user/.config/followcast/policy.json')
  })

  it('throws when no config home is available', () => {
    expect(() => policyFilePath({})).toThrow(/HOME or XDG_CONFIG_HOME/)
    expect(() => policyFilePath({ XDG_CONFIG_HOME: '' })).toThrow(/HOME or XDG_CONFIG_HOME/)
  })
})

describe('loadPolicyText', () => {
  it('returns the default policy when the file is missing', () => {
    expect(loadPolicyText(undefined)).toEqual(DEFAULT_POLICY)
  })

  it('rejects invalid JSON', () => {
    let thrown: unknown
    try {
      loadPolicyText('{')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    if (!(thrown instanceof Error)) {
      throw new Error('expected invalid JSON to throw')
    }
    expect(thrown.message).toMatch(/invalid JSON/)
    expect(thrown.cause).toBeInstanceOf(SyntaxError)
  })

  it('parses a saved policy', () => {
    expect(loadPolicyText('{"apps":{"slack":false},"monitors":{}}')).toEqual({
      monitors: {},
      apps: { slack: false },
    })
  })
})

describe('savePolicyText', () => {
  it('writes JSON the loader can read', () => {
    const policy = toggleApp(DEFAULT_POLICY, 'slack', false)
    expect(loadPolicyText(savePolicyText(policy))).toEqual(policy)
  })
})
