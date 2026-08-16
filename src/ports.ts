export type HyprlandPort = {
  clients(): Promise<unknown>
  monitors(): Promise<unknown>
  activeWindow(): Promise<unknown>
  events(): AsyncIterable<string>
}

export type MirrorPort = {
  start(initialOutput: string): Promise<void>
  send(line: string): void
  stop(): Promise<void>
}

type ClockPort = {
  readonly ticks: AsyncIterable<void>
}

export type PrivacyCardPort = {
  publish(card: { readonly appLabel: string } | null): void
}

export type FollowcastPorts = {
  readonly hyprland: HyprlandPort
  readonly mirror: MirrorPort
  readonly clock: ClockPort
  readonly privacyCard?: PrivacyCardPort
}
