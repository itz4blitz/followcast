import type { DesktopSnapshot, MonitorSnapshot, WindowSnapshot } from '../domain/types.ts'
import { activeWindowSchema, clientsSchema, monitorsSchema } from './schemas.ts'

function fail(label: string, message: string): never {
  throw new Error(`${label}: ${message}`)
}

export function parseClients(value: unknown): WindowSnapshot[] {
  const parsed = clientsSchema.safeParse(value)
  if (!parsed.success) {
    fail('clients', parsed.error.message)
  }
  return parsed.data.map((client) => {
    const [atX, atY] = client.at
    const [width, height] = client.size
    return {
      address: client.address,
      className: client.class,
      title: client.title,
      mapped: client.mapped,
      hidden: client.hidden,
      monitorId: client.monitor,
      at: { x: atX, y: atY },
      size: { width, height },
    }
  })
}

export function parseMonitors(value: unknown): MonitorSnapshot[] {
  const parsed = monitorsSchema.safeParse(value)
  if (!parsed.success) {
    fail('monitors', parsed.error.message)
  }
  return parsed.data.map((monitor) => ({
    id: monitor.id,
    name: monitor.name,
    width: monitor.width,
    height: monitor.height,
    x: monitor.x,
    y: monitor.y,
    scale: monitor.scale,
    focused: monitor.focused,
  }))
}

export function parseActiveWindow(value: unknown): string | null {
  const parsed = activeWindowSchema.safeParse(value)
  if (!parsed.success) {
    return null
  }
  const address = parsed.data.address
  if (address === undefined) {
    return null
  }
  return address
}

export function toDesktopSnapshot(
  clients: unknown,
  monitors: unknown,
  activeWindow: unknown,
): DesktopSnapshot {
  return {
    windows: parseClients(clients),
    monitors: parseMonitors(monitors),
    focusedAddress: parseActiveWindow(activeWindow),
  }
}
