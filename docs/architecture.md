# Followcast Architecture

Followcast uses a **hexagonal (ports-and-adapters)** architecture so all focus-following,
privacy policy, monitor-slide, and status logic is 100% platform-agnostic.

## Layers

```text
src/
  domain/     Pure TypeScript logic (zero I/O, 100% coverage, 100% Stryker score)
  app/        Session loop (src/app/followcast.ts) operating only on ports
  cli/        CLI argument parsing, policy persistence, privacy card file publisher
  hyprland/   Linux Hyprland adapter (hyprctl + .socket2.sock + Zod schemas)
  windows/    Windows adapter (win32_desktop.py stdio JSON + SetWinEventHook)
  mirror/     Share surface process adapter (privacy-card.py on Linux, win32_surface.py on Windows)
  clock/      Tick scheduler
  process/    Cross-platform exec, spawn, and PATH lookup helpers
  runtime.ts  Platform port wiring (createRuntimePorts / createWindowsRuntimePorts)
  cli.ts      Composition root (selects Linux or Windows runtime at startup)
```

## Ports (`src/ports.ts`)

- **`HyprlandPort`** (desktop introspection port): provides `clients()`, `monitors()`,
  `activeWindow()`, `events()`, and `moveWindow()`. Both the Linux Hyprland adapter and
  the Windows Win32 adapter produce the same JSON snapshot schemas validated by
  `src/hyprland/schemas.ts`.
- **`MirrorPort`**: starts, updates (`--output '<name>'`), and stops the share surface
  window.
- **`ClockPort`**: periodic geometry/policy refresh ticks.
- **`PrivacyCardPort`**: writes atomic `privacy.json` state read by the active share
  surface (`privacy-card.py` on Linux, `win32_surface.py` on Windows).

## Adding a New Platform (e.g. macOS or another Wayland compositor)

1. Implement a desktop adapter returning `HyprlandPort` (producing `clients`, `monitors`,
   `activeWindow` JSON matching `src/hyprland/schemas.ts`, plus focus-change events).
2. Implement a share surface process that reads `--output '<name>'` lines from stdin,
   mirrors that display, and paints the **Hidden by Followcast** card when
   `privacy.json` marks a privacy card visible.
3. Wire the adapter in `src/runtime.ts` and `src/cli.ts`, maintaining 100% test coverage
   and 100% Stryker mutation score.
