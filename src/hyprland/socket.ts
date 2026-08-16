export type HyprlandEnv = {
  readonly XDG_RUNTIME_DIR?: string
  readonly HYPRLAND_INSTANCE_SIGNATURE?: string
}

export function hyprlandSocketPath(env: HyprlandEnv): string {
  const signature = env.HYPRLAND_INSTANCE_SIGNATURE
  if (signature === undefined || signature === '') {
    throw new Error('HYPRLAND_INSTANCE_SIGNATURE is not set; is Hyprland running?')
  }
  const runtime = env.XDG_RUNTIME_DIR
  if (runtime === undefined || runtime === '') {
    throw new Error('XDG_RUNTIME_DIR is not set')
  }
  return `${runtime}/hypr/${signature}/.socket2.sock`
}
