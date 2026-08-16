export type SharePolicy = {
  readonly monitors: Readonly<Record<string, boolean>>
  readonly apps: Readonly<Record<string, boolean>>
}

export const DEFAULT_POLICY: SharePolicy = {
  monitors: {},
  apps: {},
}

function asFlagMap(value: unknown): Record<string, boolean> {
  // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — undefined also fails the object check below
  if (value === undefined) {
    return {}
  }
  // Stryker disable next-line ConditionalExpression: equivalent — Object.entries on a primitive plus the boolean filter still yields {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const flags: Record<string, boolean> = {}
  for (const [key, flag] of Object.entries(value)) {
    if (typeof flag === 'boolean') {
      flags[key] = flag
    }
  }
  return flags
}

export function parsePolicy(value: unknown): SharePolicy {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('policy: expected an object')
  }
  const record = value
  return {
    monitors: asFlagMap('monitors' in record ? record.monitors : undefined),
    apps: asFlagMap('apps' in record ? record.apps : undefined),
  }
}

export function serializePolicy(policy: SharePolicy): string {
  return `${JSON.stringify({ monitors: policy.monitors, apps: policy.apps }, null, 2)}\n`
}

export function isMonitorAllowed(policy: SharePolicy, name: string): boolean {
  return policy.monitors[name] ?? true
}

export function isAppAllowed(policy: SharePolicy, className: string): boolean {
  return policy.apps[className] ?? true
}

export function toggleMonitor(policy: SharePolicy, name: string, enabled: boolean): SharePolicy {
  return {
    monitors: { ...policy.monitors, [name]: enabled },
    apps: policy.apps,
  }
}

export function toggleApp(policy: SharePolicy, className: string, enabled: boolean): SharePolicy {
  return {
    monitors: policy.monitors,
    apps: { ...policy.apps, [className]: enabled },
  }
}
