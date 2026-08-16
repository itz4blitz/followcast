import { DEFAULT_POLICY, parsePolicy, serializePolicy, type SharePolicy } from '../domain/policy.ts'

export function policyFilePath(env: { XDG_CONFIG_HOME?: string; HOME?: string }): string {
  const base = env.XDG_CONFIG_HOME ?? (env.HOME === undefined ? undefined : `${env.HOME}/.config`)
  if (base === undefined || base === '') {
    throw new Error('HOME or XDG_CONFIG_HOME is required for Followcast policy')
  }
  return `${base}/followcast/policy.json`
}

export function loadPolicyText(text: string | undefined): SharePolicy {
  if (text === undefined) {
    return DEFAULT_POLICY
  }
  try {
    return parsePolicy(JSON.parse(text))
  } catch (error) {
    throw new Error('policy: invalid JSON', { cause: error })
  }
}

export function savePolicyText(policy: SharePolicy): string {
  return serializePolicy(policy)
}
