export function isShareableOutput(name: string): boolean {
  return !name.startsWith('HEADLESS') && name !== 'fc-dummy'
}

export function shareableMonitors<T extends { readonly name: string }>(
  monitors: readonly T[],
): T[] {
  return monitors.filter((monitor) => isShareableOutput(monitor.name))
}

export function orderShareableMonitors<
  T extends { readonly name: string; readonly x: number; readonly y: number },
>(monitors: readonly T[]): T[] {
  return shareableMonitors(monitors).sort((left, right) => left.y - right.y || left.x - right.x)
}
