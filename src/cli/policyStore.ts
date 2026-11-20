import { DEFAULT_POLICY, parsePolicy, serializePolicy, type SharePolicy } from '../domain/policy.ts'

function nonEmpty(value: string | undefined): string | undefined {
  return value === '' ? undefined : value
}

export function policyFilePath(env: {
  XDG_CONFIG_HOME?: string
  APPDATA?: string
  HOME?: string
  USERPROFILE?: string
}): string {
  const home = nonEmpty(env.HOME) ?? nonEmpty(env.USERPROFILE)
  const base =
    nonEmpty(env.XDG_CONFIG_HOME) ??
    nonEmpty(env.APPDATA) ??
    (home === undefined ? undefined : `${home}/.config`)
  if (base === undefined) {
    throw new Error(
      'HOME, APPDATA, USERPROFILE, or XDG_CONFIG_HOME is required for Followcast policy',
    )
  }
  return `${base}/followcast/policy.json`
}

export function runtimeDirFromEnv(
  env: {
    XDG_RUNTIME_DIR?: string
    LOCALAPPDATA?: string
    TEMP?: string
    TMP?: string
  },
  fallback = '/tmp',
): string {
  return (
    nonEmpty(env.XDG_RUNTIME_DIR) ??
    nonEmpty(env.LOCALAPPDATA) ??
    nonEmpty(env.TEMP) ??
    nonEmpty(env.TMP) ??
    fallback
  )
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
