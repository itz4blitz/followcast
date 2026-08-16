export type ParsedArgs =
  | { readonly kind: 'help' }
  | { readonly kind: 'run'; readonly denyClasses: readonly string[] }
  | { readonly kind: 'status' }
  | { readonly kind: 'policy-show' }
  | { readonly kind: 'policy-set-monitor'; readonly name: string; readonly enabled: boolean }
  | { readonly kind: 'policy-set-app'; readonly className: string; readonly enabled: boolean }
  | { readonly kind: 'error'; readonly message: string }

function parseSwitch(value: string | undefined): boolean | null {
  if (value === 'on' || value === 'true') {
    return true
  }
  if (value === 'off' || value === 'false') {
    return false
  }
  return null
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv[0] === 'status') {
    if (argv.length !== 1) {
      return { kind: 'error', message: 'unknown argument: ' + String(argv[1]) }
    }
    return { kind: 'status' }
  }
  if (argv[0] === 'policy') {
    if (argv.length === 1) {
      return { kind: 'policy-show' }
    }
    if (argv[1] === 'set-monitor') {
      const name = argv[2]
      const enabled = parseSwitch(argv[3])
      if (name === undefined || name.startsWith('-') || enabled === null) {
        return { kind: 'error', message: 'usage: followcast policy set-monitor <name> on|off' }
      }
      return { kind: 'policy-set-monitor', name, enabled }
    }
    if (argv[1] === 'set-app') {
      const className = argv[2]
      const enabled = parseSwitch(argv[3])
      if (className === undefined || className.startsWith('-') || enabled === null) {
        return { kind: 'error', message: 'usage: followcast policy set-app <class> on|off' }
      }
      return { kind: 'policy-set-app', className, enabled }
    }
    return { kind: 'error', message: `unknown argument: ${String(argv[1])}` }
  }

  const denyClasses: string[] = []
  let skipNext = false
  for (const [index, token] of argv.entries()) {
    if (skipNext) {
      skipNext = false
      continue
    }
    if (token === '--help' || token === '-h') {
      return { kind: 'help' }
    }
    if (token === 'start') {
      continue
    }
    if (token === '--deny-class') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('-')) {
        return { kind: 'error', message: '--deny-class requires a window class' }
      }
      denyClasses.push(value)
      skipNext = true
      continue
    }
    return { kind: 'error', message: `unknown argument: ${token}` }
  }
  return { kind: 'run', denyClasses }
}
