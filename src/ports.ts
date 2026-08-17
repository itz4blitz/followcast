export type HyprlandPort = {
  clients(): Promise<unknown>
  monitors(): Promise<unknown>
  activeWindow(): Promise<unknown>
  events(): AsyncIterable<string>
  moveWindow(address: string, x: number, y: number): Promise<void>
}

export type MirrorPort = {
  start(initialOutput: string): Promise<void>
  send(line: string): void
  stop(): Promise<void>
}

type ClockPort = {
  readonly ticks: AsyncIterable<void>
  now?(): number
}

type SlideCard = {
  readonly kind: 'slide'
  readonly direction: 'left' | 'right' | 'up' | 'down'
  readonly fromOutput: string
  readonly toOutput: string
  readonly fromLabel: string
  readonly toLabel: string
}

export type PrivacyCardPort = {
  publish(card: { readonly appLabel: string } | SlideCard | null): void
}

export type FollowcastPorts = {
  readonly hyprland: HyprlandPort
  readonly mirror: MirrorPort
  readonly clock: ClockPort
  readonly privacyCard?: PrivacyCardPort
}
