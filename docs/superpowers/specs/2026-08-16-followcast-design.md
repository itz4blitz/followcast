# Followcast Design

**Followcast** is a Hyprland companion that presents one stable window you pick
in the Omarchy share picker. That window always shows the keyboard-focused
application, including when focus moves to another monitor.

## Problem

xdg-desktop-portal-hyprland binds a share to one monitor, window, or region at
start. Meet, Zoom, and Discord cannot retarget mid-session. Keyboard focus
(Alt+Tab, Super+arrows, Super+Tab, Super+Shift app launch) therefore leaves
the audience on the wrong screen.

## Approach

Share a **stable dummy window** whose pixels change.

1. Followcast starts `wl-mirror --stream --title Followcast` as a normal window.
2. A daemon reads Hyprland socket2 + `hyprctl` snapshots.
3. On focus, move, or geometry change it writes `--region 'x,y wxh OUTPUT'`
   to the running `wl-mirror` stdin (stream mode).
4. The user picks the **Followcast** window once in
   `hyprland-preview-share-picker`. The meeting app keeps that source.

The portal never retargets. Only the dummy window's contents do.

## Name

**Followcast** — follow + screencast. It appears in the picker as an app named
Followcast. Package: `followcast`. Binary: `followcast`.

Rejected: Focal (opaque), hyprfollow (compositor-tied), Spotlight (generic),
share-desktop (present-workspace, not follow-focus).

## Non-goals (v1)

- Changing the portal / XDPH protocol
- Following a whole monitor instead of the focused window
- Auto-skipping the meeting client (hall-of-mirrors) beyond a user deny-list
- A GUI
- Nesting Followcast inside Omarchy packaging (README snippet only)

## Domain

Pure functions, no I/O:

- `windowToRegion(window, monitor)` — slurp-global region, clamped to
  the monitor's logical box (`width/scale` × `height/scale`). Empty if the
  intersection is smaller than 1×1.
- `decideFollow(snapshot, options)` — follow, or hold with a reason:
  `self`, `denylist`, `unmapped`, `missing`, `no-monitor`, `empty-region`.
- `streamCommand(region)` — one stdin line for `wl-mirror --stream`.
- `reduceSession(state, snapshot, options)` — emit a command only when the
  region/output actually changes. Hold never freezes the last target; it
  leaves `wl-mirror` on the previous region so that app keeps updating.

Default self-skip: class `at.yrlf.wl_mirror`, title containing `Followcast`.
Default deny-list: empty.

## Adapters

Owned interfaces, mocked in unit tests, exercised with fakes in integration:

- `HyprlandPort` — `clients()`, `monitors()`, `activeWindow()`, `events()`
- `MirrorPort` — `start(initialOutput)`, `send(line)`, `stop()`
- `ClockPort` — `now()`, `tick(ms)` for debounce / geometry poll

Real implementations wrap `hyprctl`, the Hyprland `.socket2.sock`, and a
child `wl-mirror` process. They do not leak `as` casts; hyprctl JSON is
parsed with Zod.

## Runtime loop

Triggers: classified socket2 events **or** a 100ms geometry tick (Hyprland
does not emit resize). Each trigger loads a fresh snapshot, reduces the
session, and optionally writes one stream line.

Relevant events: `activewindow`, `activewindowv2`, `openwindow`,
`closewindow`, `movewindow`, `movewindowv2`, `fullscreen`,
`changefloatingmode`, `focusedmon`, `monitoradded`, `monitorremoved`,
`moveintogroup`, `moveoutofgroup`, `pin`.

## CLI

```
followcast              # foreground daemon
followcast start        # same
followcast --deny-class zoom --deny-class skype
```

Exit 1 if `wl-mirror` is missing or no monitor exists. SIGINT/SIGTERM stop
the child and exit 0.

## Omarchy / Hyprland

Required on the host: `wl-mirror` (extra). Recommended Hyprland snippet:

```lua
hl.permission({ binary = "/usr/bin/wl-mirror", type = "screencopy", mode = "allow" })
o.window({ match = { title = "Followcast" } }, { float = true })
```

Pick **Windows → Followcast** in the share picker. Leave the Followcast
window mapped (any workspace). Do not put it on a special workspace that
unmaps hidden clients.

## Testing

Hardcore TDD. Vitest + fast-check + Stryker.

| Layer       | Owns                                                                                 |
| ----------- | ------------------------------------------------------------------------------------ |
| Unit        | geometry, decide, stream line, session reduce, event classify, Zod parse of fixtures |
| Integration | fake Hyprland socket + fake wl-mirror process through owned ports                    |
| E2E         | not in v1 (needs a live compositor)                                                  |

Coverage 100% lines/branches/functions/statements. Mutation break 100% on
`src/domain/**` and parsers. Process-spawn plumbing may carry adjudicated
`// Stryker disable` only with a written reason.

## Stack

TypeScript (Node ≥ 20.19), Vitest 4, Stryker 9, Zod, fast-check. TypeScript
only — no `.js`/`.mjs`/`.cjs` sources. Gates: typecheck, lint, format,
knip, test, coverage, mutation.
