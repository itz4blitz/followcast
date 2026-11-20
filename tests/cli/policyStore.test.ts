import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY, toggleApp } from '../../src/domain/policy.ts'
import {
  loadPolicyText,
  policyFilePath,
  runtimeDirFromEnv,
  savePolicyText,
} from '../../src/cli/policyStore.ts'

describe('policyFilePath', () => {
  it('uses XDG_CONFIG_HOME when set', () => {
    expect(policyFilePath({ XDG_CONFIG_HOME: '/cfg', HOME: '/home/user' })).toBe(
      '/cfg/followcast/policy.json',
    )
  })

  it('uses APPDATA on Windows when XDG_CONFIG_HOME is unset', () => {
    expect(
      policyFilePath({
        APPDATA: 'C:\\Users\\alice\\AppData\\Roaming',
        USERPROFILE: 'C:\\Users\\alice',
      }),
    ).toBe('C:\\Users\\alice\\AppData\\Roaming/followcast/policy.json')
  })

  it('falls back to ~/.config/followcast/policy.json', () => {
    expect(policyFilePath({ HOME: '/home/user' })).toBe('/home/user/.config/followcast/policy.json')
  })

  it('falls back to USERPROFILE/.config/followcast/policy.json when HOME and APPDATA are unset', () => {
    expect(policyFilePath({ USERPROFILE: 'C:\\Users\\alice' })).toBe(
      'C:\\Users\\alice/.config/followcast/policy.json',
    )
  })

  it('throws when no config home is available', () => {
    expect(() => policyFilePath({})).toThrow(/XDG_CONFIG_HOME/)
    expect(() => policyFilePath({ XDG_CONFIG_HOME: '' })).toThrow(/XDG_CONFIG_HOME/)
    expect(() => policyFilePath({ APPDATA: '' })).toThrow(/XDG_CONFIG_HOME/)
    expect(() => policyFilePath({ HOME: '' })).toThrow(/XDG_CONFIG_HOME/)
    expect(() => policyFilePath({ USERPROFILE: '' })).toThrow(/XDG_CONFIG_HOME/)
  })
})

describe('runtimeDirFromEnv', () => {
  it('prefers XDG_RUNTIME_DIR, then LOCALAPPDATA, TEMP, TMP, then fallback', () => {
    expect(
      runtimeDirFromEnv({
        XDG_RUNTIME_DIR: '/run/user/1000',
        LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
      }),
    ).toBe('/run/user/1000')
    expect(
      runtimeDirFromEnv({
        LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
        TEMP: 'C:\\Temp',
      }),
    ).toBe('C:\\Users\\alice\\AppData\\Local')
    expect(runtimeDirFromEnv({ TEMP: 'C:\\Temp', TMP: 'C:\\Tmp' })).toBe('C:\\Temp')
    expect(runtimeDirFromEnv({ TMP: 'C:\\Tmp' })).toBe('C:\\Tmp')
    expect(runtimeDirFromEnv({}, '/fallback')).toBe('/fallback')
    expect(runtimeDirFromEnv({ XDG_RUNTIME_DIR: '', LOCALAPPDATA: '', TEMP: '', TMP: '' })).toBe(
      '/tmp',
    )
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
