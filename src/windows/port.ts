import type { HyprlandPort } from '../ports.ts'

export type WindowsDesktopCommand = 'clients' | 'monitors' | 'activewindow'

export type WindowsQuery = (command: WindowsDesktopCommand) => Promise<string>

export type WindowsPortDeps = {
  query: WindowsQuery
  events: () => AsyncIterable<string>
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'unknown error'
}

async function readJson(query: WindowsQuery, command: WindowsDesktopCommand): Promise<unknown> {
  let text: string
  try {
    text = await query(command)
  } catch (error) {
    throw new Error(`win32 ${command}: ${formatError(error)}`, { cause: error })
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`win32 ${command}: ${formatError(error)}`, { cause: error })
  }
}

export function createWindowsDesktopPort(deps: WindowsPortDeps): HyprlandPort {
  return {
    clients: () => readJson(deps.query, 'clients'),
    monitors: () => readJson(deps.query, 'monitors'),
    activeWindow: () => readJson(deps.query, 'activewindow'),
    events: () => deps.events(),
    moveWindow: async () => {},
  }
}
