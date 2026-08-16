# Followcast — agent rules

- TypeScript only. No `.js` / `.mjs` / `.cjs` sources or configs.
- No `as`, `any`, `!`, or `@ts-ignore` / `@ts-expect-error`.
- Strict TDD: failing test first, then minimal code.
- 100% coverage and 100% Stryker score on mutated sources.
- Domain has no I/O. Mock only `HyprlandPort`, `MirrorPort`, and `ClockPort`.
