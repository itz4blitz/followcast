export function isShareableOutput(name: string): boolean {
  return !name.startsWith('HEADLESS')
}

export function shareableMonitors<T extends { readonly name: string }>(
  monitors: readonly T[],
): T[] {
  return monitors.filter((monitor) => isShareableOutput(monitor.name))
}
