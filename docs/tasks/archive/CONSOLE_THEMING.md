# Implementation Plan: Console Theming (Roadmap Phase 11)

> **Status: cut.** All 6 tasks below were completed exactly as planned (TDD, one commit per task,
> every checkpoint green) and then reverted at Crawford's call after evaluating the shipped feature
> against the real running app — not a bug, an aesthetic call. See
> [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md) for the reasoning and what replaced it. Kept as a
> historical record that this plan executed cleanly end-to-end; not current or planned behavior.

Source spec: [docs/specs/CONSOLE_THEMING.md](../specs/CONSOLE_THEMING.md). Source intent:
[docs/intent/console-theming.md](../intent/console-theming.md). No dependency on any unshipped
phase — Oblique Cabinetry (Phase 11.1) depends on this phase's output, not the reverse.

## Overview

A small, self-contained phase: 2 new pure-function utility modules (`contrastRatio.ts`,
`consoleTheme.ts`), one component wiring change (`Tablet.tsx`), and 3 small CSS/doc updates. 10
files total, none of them large. The real engineering weight sits in one place — the exhaustive
contrast sweep in `consoleTheme.test.ts`, which is the permanent proof behind spec §1.1's bounds
table, not incidental coverage. Every other task is comparatively mechanical once that one lands.

## Architecture Decisions

- **`contrastRatio.ts` lands first, alone, with no dependency on anything else in this phase.** It's
  general-purpose WCAG math, useful and testable in complete isolation — `consoleTheme.ts` doesn't
  import it at runtime (the HSL bounds are the guarantee; contrast-checking happens once, in the test
  suite, not per render), but `consoleTheme.test.ts` does, so it must exist first.
- **`consoleTheme.ts` is one task, not split further, even though it's this plan's largest.** Splitting
  `computeStructuralTheme`/`computeAccentTheme` into separate tasks would leave either one untestable
  in isolation for the property that actually matters (the exhaustive contrast sweep needs both
  tiers' bound constants defined together to assert every bg/surface × accent/border pairing from
  spec §1.1's table) — better to land the whole file, fully verified, in one pass.
- **`Tablet.tsx` depends on `consoleTheme.ts` only — not on the CSS tasks.** Its own test (asserting
  the 4 custom properties land in the inline `style`) doesn't need `Console.css`'s `color-mix()` fix
  or `index.css`'s comment/transition update to pass; those are independently verifiable.
- **`Console.css` and `index.css` have no real compile/test dependency on `Tablet.tsx`**, but are
  sequenced after it in this plan because their own manual-verification step (does the seed-driven
  color actually reach `.console`'s glass, does the crossfade actually run) is only meaningful once
  something is producing real theme values to look at.
- **Docs (Task 6) land last**, once the shipped API is real and spot-checkable against source — same
  reasoning every prior phase's plan in this repo uses.
- This task list's 6 tasks map 1:1 to spec §6's own suggested commit grouping — no re-derivation
  needed there.

## Dependency Graph

```
Task 1 (contrastRatio.ts + test)
    │
    ▼
Task 2 (consoleTheme.ts + test — test imports Task 1's contrastRatio.ts)
    │
    ├──→ Task 3 (Tablet.tsx + test)
    │
    ├──→ Task 4 (Console.css color-mix fix)      — no real compile dependency on Task 2/3;
    │                                                CSS-only, sequenced here so its manual
    │                                                verification has a real theme to check against
    │
    └──→ Task 5 (index.css comment + global transition rule) — same reasoning as Task 4
                    │
Tasks 3, 4, 5 ──────┴──→ Task 6 (docs sweep: CONSOLE_THEMING.md + PROCEDURAL_GENERATION.md)
```

## Task List

### Phase 1: Foundation

- [x] **Task 1: `src/utils/contrastRatio.ts` (+ test) — WCAG contrast math**

  **Description:** New file, full implementation per spec §4: `hslToRgb`, `relativeLuminance`,
  `contrastRatio`, `blendOverBackground`. Pure, general-purpose — no dependency on
  `consoleTheme.ts`'s own bound constants.

  **Acceptance criteria:**
  - [x] `hslToRgb(hue, saturation, lightness)` returns an `RGB` (`[number, number, number]`, 0-255
    each) matching the standard HSL→RGB conversion.
  - [x] `relativeLuminance`/`contrastRatio` implement the WCAG 2.x formulas exactly as given in spec
    §4 (sRGB linearization threshold at `0.03928`, the `0.2126`/`0.7152`/`0.0722` luminance weights,
    the `(lighter + 0.05) / (darker + 0.05)` ratio).
  - [x] `blendOverBackground(fg, alpha, bg)` alpha-composites `fg` over an opaque `bg`.

  **Verification:**
  - [x] `npx vitest run src/utils/contrastRatio.test.ts` — per spec §5: `contrastRatio(black, white)
    === 21` (tolerance), `contrastRatio(c, c) === 1` for any color, `hslToRgb` round-trips known
    reference colors (black, white, pure red), `blendOverBackground` at `alpha=1`/`alpha=0` returns
    `fg`/`bg` respectively.
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/contrastRatio.ts`, `src/utils/contrastRatio.test.ts`

  **Estimated scope:** S (1 new file + test, pure math, no external dependency)

### Checkpoint: Foundation

- [x] `npx vitest run src/utils/contrastRatio.test.ts` passing.
- [x] `npm run build:types`, `npm run lint` clean.
- [ ] Review with human before proceeding — confirm the formula itself (not yet the bounds it will
  be used to validate) reads correctly.

---

### Phase 2: Seeded theme generation

- [x] **Task 2: `src/utils/consoleTheme.ts` (+ test) — the phase's core**

  **Description:** New file, full implementation per spec §4: the §1.1 bound constants
  (`BG_HUE_RANGE`/`BG_SATURATION_RANGE`/`BG_LIGHTNESS_RANGE`/`SURFACE_LIGHTNESS_OFFSET`/
  `SURFACE_LIGHTNESS_MAX`, `ACCENT_HUE_RANGE`/`ACCENT_SATURATION_RANGE`/`ACCENT_LIGHTNESS_RANGE`,
  `BORDER_SATURATION_RANGE`/`BORDER_LIGHTNESS_RANGE`), `computeStructuralTheme`,
  `computeAccentTheme`, `computeConsoleTheme`, `consoleThemeToCSSProperties`. Sampling uses
  `getSeededVal(noiseMap, dataId, 0, min, max)` against `getAttenuationStyleNoiseMap`/
  `getLocaleNoiseMap`, with the exact `dataId` strings from spec §4
  (`'ui.theme.background.hue'`/`.saturation`/`.lightness`, `'ui.theme.accent.hue'`/`.saturation`/
  `.lightness`, `'ui.theme.border.saturation'`/`.lightness`).

  **Acceptance criteria:**
  - [x] `computeStructuralTheme(attenuationStyleId, attenuationStyleName)` returns `{ bg, surface }`
    as `hsl(...)` strings; `surface`'s lightness equals `min(bgLightness + 4, 18)` exactly, reusing
    `bg`'s own hue/saturation.
  - [x] `computeAccentTheme(localeId, x, y)` returns `{ accent, border }`; `border` reuses `accent`'s
    own sampled hue, with its own independently-sampled saturation/lightness.
  - [x] `computeConsoleTheme(attenuationStyleId, attenuationStyleName, localeId, x, y)` returns the
    full 4-field `ConsoleTheme` (spread of both halves above).
  - [x] `consoleThemeToCSSProperties(theme)` returns exactly the 4 keys `--color-bg`/
    `--color-surface`/`--color-accent`/`--color-border` — `--color-text-primary`/`--color-text-muted`
    are never emitted (spec §3 Constraint, directly tested).
  - [x] `consoleTheme.ts` computes values only — it does not touch the DOM anywhere in this file
    (spec §3).

  **Verification:**
  - [x] `npx vitest run src/utils/consoleTheme.test.ts` — per spec §5, all 5 groups:
    1. **Bounds coverage** — ≥50 distinct AS `(id, name)` pairs stay within the bg/surface ranges
       (surface lightness formula exact); ≥50 distinct locale `(localeId, x, y)` triples stay within
       the accent/border ranges.
    2. **Determinism** — identical inputs produce byte-identical `hsl(...)` output across repeated
       calls.
    3. **Non-degeneracy** — across the 50 AS samples, more than one distinct `bg` hue value appears.
    4. **The exhaustive contrast sweep** — hue `0..360` at ≤5° steps × every combination of
       `BG_SATURATION_RANGE`/`BG_LIGHTNESS_RANGE` extremes (surface lightness via the real
       offset/clamp formula), asserting via `contrastRatio`/`blendOverBackground` from Task 1:
       - `blendOverBackground([255,255,255], 0.87, surfaceRgb)` vs `surfaceRgb` ≥ `4.5`
       - `blendOverBackground([255,255,255], 0.6, surfaceRgb)` vs `surfaceRgb` ≥ `4.5`
       — and for every combination of `ACCENT_SATURATION_RANGE`/`ACCENT_LIGHTNESS_RANGE` extremes
       against every bg/surface extreme combination (same hue sweep): `contrastRatio(accentRgb,
       bgRgb)` ≥ `3` AND `contrastRatio(accentRgb, surfaceRgb)` ≥ `3`; same shape for
       `BORDER_SATURATION_RANGE`/`BORDER_LIGHTNESS_RANGE`. This is the literal proof behind spec
       §1.1's table — a failure here is a real regression, not a flaky test to loosen or skip.
    5. `consoleThemeToCSSProperties`'s key-set assertion (the 4 present, the 2 text tokens absent).
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 1 (test file imports `contrastRatio`/`blendOverBackground`).

  **Files:** `src/utils/consoleTheme.ts`, `src/utils/consoleTheme.test.ts`

  **Estimated scope:** M — the phase's real engineering weight, per spec §6's own commit grouping
  ("likely the largest single commit here").

### Checkpoint: Theme generation complete

- [x] `npx vitest run src/utils/consoleTheme.test.ts src/utils/contrastRatio.test.ts` — all passing,
  including the exhaustive sweep (expect this to be the slowest test in the new files — pure
  arithmetic, no DOM/async work, still well within Vitest's default timeout).
- [x] `npm run build:types`, `npm run lint` clean.
- [ ] Review with human before proceeding — this is the phase's actual correctness guarantee; worth
  confirming the sweep's bound constants match spec §1.1 exactly before building anything on top.

---

### Phase 3: Wiring + CSS

- [x] **Task 3: `src/components/tablet/Tablet.tsx` (+ test) — apply the theme**

  **Description:** Per spec §4's full replacement: read the active `AttenuationStyle`/`Locale` via
  `useAttenuationStyleStore(selectCurrentAttenuationStyle)` and `useLocaleStore`, `useMemo` the
  theme (keyed on `attenuationStyle?.id`/`.name`, `locale?.id`/`.coordinates.x`/`.coordinates.y`) via
  `computeConsoleTheme`/`consoleThemeToCSSProperties`, apply as the `.tablet` div's inline `style`
  prop (`as CSSProperties`, mirroring `App.tsx`'s own `realWorldStyle` pattern).

  **Acceptance criteria:**
  - [x] `.tablet`'s inline `style` carries `--color-bg`/`--color-surface`/`--color-accent`/
    `--color-border` once an Attenuation Style and Locale are resolved.
  - [x] The theme is computed via `useMemo`, not recomputed on every render (dependency array is
    exactly the 5 values named above — no broader/narrower array).
  - [x] No new store field, no `worldTransition.ts` change, no `useEffect`/DOM-ref imperative
    wiring — reactivity comes entirely from reading existing store fields (spec §3).
  - [x] Existing rendered structure (`sleeve-container__top-strip`, both `SleeveContainer`
    instances, `ScreenViewport`) is unchanged.

  **Verification:**
  - [x] `npx vitest run src/components/tablet/Tablet.test.tsx` — the 2 existing tests still pass
    unmodified (they don't mock `attenuationStyleStore`/`localeStore` today; real defaults populate
    fine); one new test renders `<Tablet />` with real default store state and asserts
    `container.querySelector('.tablet')`'s inline style has non-empty `hsl(...)`-format values for
    all 4 custom properties.
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/tablet/Tablet.tsx`, `src/components/tablet/Tablet.test.tsx`

  **Estimated scope:** S (1 component + its test, following an existing in-repo pattern)

- [x] **Task 4: `src/components/panels/screen/console/Console.css` — `.console`'s `color-mix()` fix**

  **Description:** Per spec §1.3/§4: replace `.console`'s hardcoded `--color-surface: rgba(26, 26,
  26, 0.75)` with the self-referential `--color-surface: color-mix(in srgb, var(--color-surface)
  75%, transparent)`. One property, one rule; every other declaration in `.console` (position,
  inset, margin-top, z-index) is untouched.

  **Acceptance criteria:**
  - [x] `.console`'s `--color-surface` is the `color-mix()` expression exactly as written in spec
    §4 — not a new custom-property name, not a JS-applied inline override.
  - [x] No other rule in `Console.css` (`.console--grid`, `.console--grid .sc-button`) changes.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/Console.test.tsx` — unaffected (no
    existing assertion inspects computed `--color-surface`; confirm still green).
  - [x] `npm run build:types`, `npm run lint` clean (CSS-only change, but confirm no import/build
    step chokes on `color-mix()`).
  - [ ] Manual check (paired with Task 6's checkpoint, once Task 3 is also in): the hub's "glass"
    translucency over `WorldView` is still visibly present and still reads as translucent, now
    re-derived from whatever the seed produced rather than a fixed gray.

  **Dependencies:** None (independent CSS-only change; sequenced here so its manual verification has
  a real theme, from Task 3, to check against).

  **Files:** `src/components/panels/screen/console/Console.css`

  **Estimated scope:** XS (1 property, 1 file)

- [x] **Task 5: `src/index.css` — token comment + global retransmit-crossfade rule**

  **Description:** Per spec §4: update the `:root` color-token comment block to state which 4
  properties are seed-driven (bg/surface/accent/border, via `consoleTheme.ts`, applied on
  `Tablet.tsx`'s `.tablet`) versus fixed (text-primary/text-muted); add the global
  `*, *::before, *::after { transition: background-color 250ms ease, border-color 250ms ease, color
  250ms ease; }` rule plus its `@media (prefers-reduced-motion: reduce)` override (`transition:
  none`, same pattern `PowerRockerSwitch.css` already uses). No token *value* in `:root` changes —
  the 6 existing values stay as the pre-theme fallback.

  **Acceptance criteria:**
  - [x] The `:root` comment accurately describes the 4-seed-driven/2-fixed split (matches spec §3's
    Constraint).
  - [x] The global transition rule and its reduced-motion override are present, worded/structured as
    in spec §4.
  - [x] None of the 6 existing `--color-*` values in `:root` changed.
  - [x] The transition rule's selector specificity is lower than any existing per-component
    `transition` declaration (e.g. `button`'s own, `index.css` line ~104) — confirmed by inspection,
    not just assumed (spec §3: "only affects elements that don't already declare their own
    transition").

  **Verification:**
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` (full suite) — confirm no existing test asserts on a specific `transition` value
    for any element that would now also match the new universal rule (a CSS-only addition should not
    break any DOM/behavior assertion, but this is the check that actually confirms it).
  - [ ] Manual check (paired with Task 3/4, once both are in): retransmitting a seed in Sector
    Settings crossfades the console's colors under normal settings, and snaps instantly with
    "reduce motion" enabled (OS-level setting or browser devtools emulation).

  **Dependencies:** None (independent of Task 2/3's code; sequenced here for the same
  verification-convenience reason as Task 4).

  **Files:** `src/index.css`

  **Estimated scope:** S (1 file, comment + 2 small new rules)

### Checkpoint: Wiring + CSS complete

- [x] `npx vitest run` (full suite) — 100% passing.
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] **Manual check** (spec §5, all in one pass now that Tasks 3-5 are all in): load the app fresh
  and confirm the console chrome (hub tiles, drawer backgrounds, buttons, borders) reads as a
  coherent, legible dark theme; retransmit a new Attenuation Style (name only) and confirm
  `--color-bg`/`--color-surface` visibly recolor while `--color-accent`/`--color-border` do not;
  retransmit new coordinates only and confirm the reverse; confirm the crossfade/reduced-motion
  behavior from Task 5; confirm the `.console` glass translucency from Task 4. Not run this session —
  needs a human with the app open in a real browser.
- [ ] Review with human before proceeding to docs.

---

### Phase 4: Docs

- [x] **Task 6: `docs/CONSOLE_THEMING.md` + `docs/PROCEDURAL_GENERATION.md` — close the loop**

  **Description:** `docs/CONSOLE_THEMING.md`: resolve the "not yet implemented" banner (spec's own
  instruction, inherited from the design doc itself); fold in the final §1.1 bounds table, the §1.2
  variety-generation resolution, and the §1.3 `Console.css` fix, spot-checked against the actually
  -shipped `consoleTheme.ts`/`Console.css` — not reconstructed from the spec alone.
  `docs/PROCEDURAL_GENERATION.md`: add one new row to the existing "Call Sites" table for
  `consoleTheme.ts` (its `dataId` prefix `ui.theme.*`, per that table's existing one-line-per-module
  convention).

  **Acceptance criteria:**
  - [x] `docs/CONSOLE_THEMING.md`'s banner no longer says "not yet implemented."
  - [x] Every bound value and `dataId` string quoted in `docs/CONSOLE_THEMING.md` matches
    `consoleTheme.ts`'s actual shipped constants exactly (spot-checked, not copy-pasted from the
    spec without verification — the spec itself could have drifted from an implementation detail
    resolved during Task 1/2's own execution).
  - [x] `docs/PROCEDURAL_GENERATION.md`'s Call Sites table has exactly one new row for
    `consoleTheme.ts`, in the same format as its existing rows.

  **Verification:**
  - [x] Manual review — every documented value/signature spot-checked directly against the shipped
    source in `src/utils/consoleTheme.ts`.
  - [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only
    change, no behavioral impact expected).

  **Dependencies:** Tasks 2-5 (documents what actually shipped).

  **Files:** `docs/CONSOLE_THEMING.md`, `docs/PROCEDURAL_GENERATION.md`

  **Estimated scope:** S (2 docs files, prose + one table row, no code changes)

### Checkpoint: Complete

- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 6 tasks met.
- [x] `docs/CONSOLE_THEMING.md` reflects the shipped implementation, not the pre-implementation design
  draft.
- [x] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The exhaustive contrast sweep (Task 2) is the phase's one real correctness guarantee — a subtly wrong bound constant or a sweep that doesn't actually cover the true worst-case hue would ship a theme that fails AA on some unlucky real seed | High | The sweep's step size and corner-combination coverage are specified explicitly in the task (≤5° hue steps, every extreme combination) rather than left to "reasonable coverage"; the Phase 2 checkpoint gates on it explicitly before anything else is built on top |
| The global `*, *::before, *::after` transition rule (Task 5) could visually interact with an existing component's own hover/press animation in a way no automated test catches (CSS-only, no DOM assertion covers "does this look right") | Medium | Task 5's own acceptance criteria require confirming specificity ordering by inspection; the Phase 3 checkpoint's manual check is the actual catch-all, and spec §7 flags this as a named open item to revisit if the manual check finds a problem |
| `useMemo`'s dependency array (Task 3) is easy to get subtly wrong — too narrow (stale theme after a real change) or too broad (recomputing every render, violating spec §3's "not on every render" constraint) | Medium | Task 3's acceptance criteria name the exact 5-value dependency array explicitly, not just "memoized appropriately" |
| `color-mix()` (Task 4) is the one new CSS feature this phase introduces — a build/lint tool unfamiliar with it could theoretically flag or mishandle it | Low | Task 4's verification explicitly checks `build:types`/`lint` don't choke on it, not just that the visual result is correct |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **The global transition rule's real-world interaction with existing component animations**
   (Task 5) — confirm or narrow during the Phase 3 checkpoint's manual check, not before.
2. **Whether the AS-tier lightness band (5-14%, +4pp surface offset) reads as visually varied enough
   across different seeds**, versus having been optimized primarily for contrast-safety margin
   (spec §7 item 2) — a judgment call for the Phase 3 checkpoint's manual check, not a blocking
   question for implementation.

## Implementation Status

All 6 tasks landed (TDD, one commit per task) and every automated checkpoint gate is green:
`build:types`, `lint`, the full test suite (112 files / 1746 tests), and `npm run build`. One real bug
was caught by Task 2's own non-degeneracy test and fixed with the user's sign-off before proceeding —
see `consoleTheme.ts`'s `THEME_SAMPLE_OFFSET` comment and `docs/CONSOLE_THEMING.md`'s Implementation
Shape section.

**Left unchecked above, on purpose:** the three "Manual check" items (Tasks 4/5, and the Phase 3
checkpoint) and the three "Review with human" checkpoints. Those require a human with the app open in
a real browser, or an explicit review pause this session's blanket "implement sequentially and commit"
direction didn't include — not run/held this session. Worth doing before merging.
