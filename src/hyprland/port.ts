import type { HyprlandPort } from '../ports.ts'

export type HyprlandExec = (argv: readonly string[]) => Promise<string>

export type HyprlandPortDeps = {
  exec: HyprlandExec
  events: () => AsyncIterable<string>
}

async function readJson(exec: HyprlandExec, subcommand: string): Promise<unknown> {
  let text: string
  try {
    text = await exec(['hyprctl', subcommand, '-j'])
  } catch (error) {
    throw new Error(`hyprctl ${subcommand}: ${formatError(error)}`, { cause: error })
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`hyprctl ${subcommand}: ${formatError(error)}`, { cause: error })
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'unknown error'
}

export function createHyprlandPort(deps: HyprlandPortDeps): HyprlandPort {
  return {
    clients: () => readJson(deps.exec, 'clients'),
    monitors: () => readJson(deps.exec, 'monitors'),
    activeWindow: () => readJson(deps.exec, 'activewindow'),
    events: () => deps.events(),
  }
}
