export const GTK4_LAYER_SHELL = '/usr/lib/libgtk4-layer-shell.so'

export function withLayerShellPreload(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      next[key] = value
    }
  }
  const parts = (next.LD_PRELOAD ?? '').split(':').filter((part) => part !== '')
  if (!parts.includes(GTK4_LAYER_SHELL)) {
    next.LD_PRELOAD = [GTK4_LAYER_SHELL, ...parts].join(':')
  }
  return next
}
