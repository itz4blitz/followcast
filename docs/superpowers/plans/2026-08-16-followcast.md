# Followcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `followcast` CLI that opens a window named Followcast whose contents always show the Hyprland keyboard-focused application, even across monitors, so the user picks that one window in the Omarchy share picker.

**Architecture:** Pure domain (region, skip, session) with no I/O. Zod parsers for hyprctl JSON. Owned ports for Hyprland and wl-mirror. A thin CLI wires the real adapters.

**Tech Stack:** TypeScript, Vitest, Stryker, Zod, fast-check, Node ≥ 20.19. Runtime host tool: `wl-mirror --stream`.

**Spec:** `docs/superpowers/specs/2026-08-16-followcast-design.md`

## Global Constraints

- TypeScript only. No `.js`/`.mjs`/`.cjs` sources.
- No `as` assertions, `any`, `!`, or `@ts-expect-error`.
- 100% Vitest coverage (lines, branches, functions, statements).
- Stryker `thresholds.break` 100 on mutated sources.
- Never mock hyprctl/wl-mirror in domain tests — they do not exist there.
- Mock only owned ports (`HyprlandPort`, `MirrorPort`, `ClockPort`).
- Red-green-refactor. No production code before a failing test.

---

### Task 1: Domain geometry

**Files:**

- Create: `src/domain/types.ts`
- Create: `src/domain/geometry.ts`
- Test: `tests/domain/geometry.test.ts`

**Produces:** `windowToRegion(window, monitor): FollowRegion | null`

- [x] Write failing tests for logical clamp, empty intersection, scale
- [x] Implement `windowToRegion`
- [x] Green + property: region always inside the logical monitor box

### Task 2: Decide follow / hold

**Files:**

- Create: `src/domain/decide.ts`
- Test: `tests/domain/decide.test.ts`

**Produces:** `decideFollow(snapshot, options): FollowDecision`

- [x] Tests: missing, unmapped, self class, self title, deny class, no monitor, empty region, follow
- [x] Implement
- [x] Green

### Task 3: Stream command + session reduce

**Files:**

- Create: `src/domain/streamCommand.ts`
- Create: `src/domain/session.ts`
- Test: `tests/domain/streamCommand.test.ts`
- Test: `tests/domain/session.test.ts`

**Produces:** `streamCommand(region): string`, `reduceSession(state, snapshot, options)`

- [x] Tests: quoted region line; no emit on identical follow; no emit on hold; emit on output or size change
- [x] Implement
- [x] Green

### Task 4: Hyprland parsers + event classify

**Files:**

- Create: `src/hyprland/schemas.ts`
- Create: `src/hyprland/parse.ts`
- Create: `src/hyprland/events.ts`
- Test: `tests/hyprland/parse.test.ts`
- Test: `tests/hyprland/events.test.ts`

**Produces:** `parseClients`, `parseMonitors`, `parseActiveWindow`, `classifyEvent`

- [x] Tests against fixtures shaped like real `hyprctl` JSON (scale 1.6, multi-monitor)
- [x] Implement with Zod (no `as`)
- [x] Green

### Task 5: App loop

**Files:**

- Create: `src/ports.ts`
- Create: `src/app/followcast.ts`
- Test: `tests/app/followcast.test.ts`

**Produces:** `runFollowcast(ports, options)` — start mirror, apply snapshots on events/ticks

- [x] Fake ports: start with first monitor, send only on change, stop on abort, skip self
- [x] Implement
- [x] Green

### Task 6: CLI + real adapters

**Files:**

- Create: `src/hyprland/real.ts`
- Create: `src/mirror/real.ts`
- Create: `src/cliMain.ts`
- Create: `src/cli.ts`
- Test: `tests/cli/cliMain.test.ts`
- Test: `tests/hyprland/real.test.ts` (command argv only / error mapping via injected runner)
- Test: `tests/mirror/real.test.ts`

**Produces:** `buildCliMain`, real hyprctl/socket/wl-mirror behind ports

- [x] Tests: missing wl-mirror, missing monitor, deny-class flags, SIGINT stop
- [x] Implement
- [x] Green

### Task 7: Gates

- [x] `npm run typecheck && npm run lint && npm run format && npm run knip && npm run coverage`
- [x] `npm run mutation` — triage every survivor
- [x] README + Hyprland snippet
- [x] Init git, commit
