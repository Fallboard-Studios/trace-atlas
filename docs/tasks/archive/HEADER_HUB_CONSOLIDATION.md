# Implementation Plan: Header & Hub Consolidation + Temperature

Source spec: [docs/specs/HEADER_HUB_CONSOLIDATION.md](../specs/HEADER_HUB_CONSOLIDATION.md). Source intent: [docs/intent/header-hub-consolidation.md](../intent/header-hub-consolidation.md). Not part of the roadmap. Deletes `TransportBar.*`/`HubNav.*`/`hubNavConfig.ts`, adds `Header.tsx` (3-row header), a seeded decorative temperature readout, and an optional `boxSize` override on `Toggle`/`RadioButton`.

**Status: all 14 tasks implemented and committed on `feature/header-hub-updates`. Every automated verification step is green. Manual (browser/real-layout) checks were not performed in the implementing session that closed this plan's original 14 tasks — no devtools tooling available at the time — but Crawford subsequently ran the app directly and iterated on it live (see "Post-implementation follow-up" near the end of this doc), which stands in for that review. Reviewed and ready to push.**

## Overview

Two independent foundation layers — temperature plumbing (a pure function + a store field) and a primitive capability addition (`boxSize` on `Toggle`/`RadioButton`) — land first, each fully testable in isolation with zero visible change to the running app. `Header.tsx` is then built and unit-tested against mocked stores, still unmounted — `TransportBar` stays live. Only once `Header` is proven does the plan swap it in, which is also where the spec's one genuinely risky mechanism lives (§1.6's vertical deadzone fix) — isolated into its own task so it's individually reviewable and revertable. The old hub tile grid (`HubNav`/`ConsolePanel`'s grid branch/`Console`'s pointer-events dance) is retired last, once `Header`'s nav group is the confirmed, live replacement — never before, so the app is never left without a way to navigate between tiles.

## Architecture Decisions

- **Temperature and `boxSize` are built and merged before `Header` even exists**, not alongside it — both are small, independently testable, and `Header` needs both simultaneously (spec §1.3/§1.4), so building them first means `Header`'s own task is pure assembly of already-proven pieces, not assembly-plus-invention.
- **`Header.tsx` is built and fully unit-tested (mocked stores, RTL) before it's wired into `ScreenViewport`** — same "build in isolation, prove it, then swap it in" shape `TransportBar.test.tsx` itself already uses. This keeps every task up to and including Task 8 leaving `main`/the branch in an unchanged, working, visually-identical state (old `TransportBar` still renders) — the risk of the swap itself (Task 9) is isolated to exactly one task.
- **The horizontal deadzone relocation and the vertical deadzone fix are one task (Task 9), not two** — shipping the `Header` swap without the corresponding `Console.css` margin-top fix would leave the app in a *known-broken* intermediate state (drawer content hidden under the header, the exact failure the deadzone requirement exists to prevent — spec §1.6). Splitting them would violate "every task leaves the system working."
- **The old hub grid is dismantled in 3 small tasks (10-12), never 1 large one** — `ConsolePanel`'s null-branch change (Task 10) must land before `Console.css`'s now-dead pointer-events rule is removed (Task 11), which must land before `HubNav.tsx`/`hubNavConfig.ts` are deleted (Task 12) — each step is mechanical and low-risk individually; bundling them would exceed the ~5-file task guideline and make a single bad diff harder to bisect.
- **Docs land last, after the code they describe has actually shipped** — same ordering `OBLIQUE_CABINETRY_RADIO_BUTTON.md`'s own plan used, so the doc note is spot-checked against real shipped code, not a spec draft.

**Corrections found during Implement, not anticipated by the spec/plan:**
1. **`Toggle`'s `cabinetTokens` (the `--cabinet-toggle-box-size` custom property) was a module-level constant.** Threading `boxSize` only into `CabinetBox`'s `boxHeight` prop (as planned) would have left the front face visually stuck at the old 32px size — `Toggle.css`'s own front-face override reads that separate custom property. Moved `cabinetTokens` inside the component so both agree (Task 4).
2. **`RadioButton`'s existing deselect-to-empty guard does not forward `''` to `onChange` — it silently swallows it**, unconditionally, for every consumer. The spec's assumption that reusing this unmodified would "double as a second way back to blank" for free was wrong. Added a new, separate, optional `onDeselect?: () => void` prop specifically for that event, leaving `onChange`'s existing (tested, relied-upon) contract untouched for every other consumer (found and fixed mid-Task-8, committed as its own atomic follow-up before Header's wiring was corrected).
3. **`MUTE_SCHEMA` gained a `humanLabel: 'Mute'`**, reversing the spec's original "no schema-level label, icon-first" plan for Mute specifically — `Toggle` never passes `children` through to `CabinetBox`, so an unlabeled Mute would render as a genuinely blank box next to 3 nav options that each show their own real text. (`RadioButton`'s own nav group keeps no group-level label, per spec §7 item #2 — only Mute's box-content gap was a real problem.)
4. **Task 9's `--header-height` plumbing is simpler than planned**: rather than `ScreenViewport.tsx` owning a `ResizeObserver` over a ref `Header` forwards out, `Header.tsx` self-contains both its own row-fit measurement and the height write on the same internal ref — no cross-component ref-forwarding needed. `Header` never actually needed to expose an external ref prop; Task 8's own "forwards/exposes a ref" acceptance criterion was satisfied internally instead.

## Dependency Graph

```
Task 1 (localeTemperature.ts)     Task 4 (Toggle boxSize)      Task 6 (headerNavConfig.ts)
        │                                 │                              │
Task 2 (uiStore temperature field)  Task 5 (RadioButton boxSize)  Task 7 (useHeaderRowFit)
        │                                 │                              │
Task 3 (wire into                        │                              │
  AttenuationStyleView) ───────┐          │                              │
        │                      │          │                              │
   [Checkpoint A]         [Checkpoint B]  │                        [independent]
        │                      │          │                              │
        └──────────────────────┴──────────┴──────────────┬───────────────┘
                                                            │
                                              Task 8 (Header.tsx, unmounted)
                                                            │
                                                      [Checkpoint C]
                                                            │
                                    Task 9 (wire into ScreenViewport + deadzone fix
                                             + delete TransportBar.*)
                                                            │
                                              Task 10 (ConsolePanel null branch)
                                                            │
                                              Task 11 (Console.tsx/.css cleanup)
                                                            │
                                    Task 12 (delete HubNav.*/hubNavConfig.ts/HubNavItem)
                                                            │
                                                      [Checkpoint D]
                                                            │
                                      Task 13 (docs/UI_SHELL.md)   Task 14 (docs/COMPONENT_LIBRARY.md)
                                                            │
                                                    [Final Checkpoint]
```

Tasks 1-2, 4-5, and 6-7 are three mutually-independent tracks — safe to build in any order or in parallel (separate sessions/agents) before Task 8. Task 3 depends on both 1 and 2 but not on 4-7. Task 14 depends only on 4-5 (not on the Header-swap tasks) and could move earlier; kept last to match "docs describe shipped code" (see Architecture Decisions).

---

## Task List

### Phase 1: Temperature plumbing

- [x] **Task 1: `localeTemperature.ts` — seeded, continuously-drifting temperature**

  **Description:** Add `src/utils/localeTemperature.ts` per spec §1.3 — `LOCALE_TEMPERATURE_RANGE` (`{ min: -120, max: -30 }`) and `computeLocaleTemperature(localeId, x, y, hour)`, mirroring `localeBpmSeed.ts`'s `generateLocaleBpm` shape but sampling `getSeededVal` at the live float `hour` as the offset instead of a fixed `0`.

  **Acceptance criteria:**
  - [x] `computeLocaleTemperature` is a pure function — no store reads, no side effects.
  - [x] Result is always an integer within `[-120, -30]` inclusive, for any `hour` in `[0, 24)`.
  - [x] Two different `hour` values for the same `(localeId, x, y)` produce different results (proving continuous-offset sampling, not a flat per-locale constant like BPM) — but the same `hour` for the same inputs is deterministic (same result every call).

  **Verification:**
  - [x] `npx vitest run src/utils/localeTemperature.test.ts` passes (7/7).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/localeTemperature.ts`, `src/utils/localeTemperature.test.ts`

  **Estimated scope:** XS (1 new file + test, no existing file touched)

- [x] **Task 2: `uiStore.ts` — `activeLocaleTemperature` field**

  **Description:** Add `activeLocaleTemperature: number | null` (default `null`) and `setActiveLocaleTemperature` to `UIStore`, placed immediately beside `activeLocaleLocalTime`/`setActiveLocaleLocalTime` — identical shape, no persistence, per spec §4's diff shape.

  **Acceptance criteria:**
  - [x] `activeLocaleTemperature` defaults to `null` on store creation.
  - [x] `setActiveLocaleTemperature(t)` sets exactly that field, no side effects on any other field.
  - [x] `UIStore` interface and store implementation both updated (no type/impl drift).

  **Verification:**
  - [x] `npx vitest run src/stores/uiStore.test.ts` passes (17/17).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`

  **Estimated scope:** XS (1 file + test)

- [x] **Task 3: Wire temperature into `AttenuationStyleView.tsx`'s existing tick**

  **Description:** Per spec §1.3/§4 — inside the existing 1s `tick()`, after `setActiveLocaleLocalTime(hour)`, read the current locale's `coordinates` (same `locale` object `dayStartTimestamp` already comes from) and call `setActiveLocaleTemperature(computeLocaleTemperature(localeId, locale.coordinates.x, locale.coordinates.y, hour))`. No new effect, no new interval — same tick, one more line.

  **Acceptance criteria:**
  - [x] Each tick call updates both `activeLocaleLocalTime` and `activeLocaleTemperature` from the same `hour` value (no drift between the two).
  - [x] No second `setInterval`/timer introduced.
  - [x] Behavior when `locale` is not found (`if (!locale) return;`) is unchanged — temperature is not set to a stale/garbage value in that branch.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/worldView/AttenuationStyleView.test.tsx` passes (5/5, new file — none existed before this task), including a case asserting `setActiveLocaleTemperature`/`computeLocaleTemperature` are called with the tick's own `hour`/coordinates.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1, Task 2.

  **Files:** `src/components/panels/screen/worldView/AttenuationStyleView.tsx`, `src/components/panels/screen/worldView/AttenuationStyleView.test.tsx`

  **Estimated scope:** XS (1 file + test, few-line change)

### Checkpoint A: Temperature plumbing verified
- [x] `npm test`, `npm run build:types`, `npm run lint` all clean (2198/2199 — 1 confirmed pre-existing/unrelated flake in `worldTransition.test.ts`, 34/34 in isolation).
- [x] No visible app change yet — `activeLocaleTemperature` updates live in the store but nothing renders it until Task 8.
- [ ] Review with human before proceeding (optional at this checkpoint — not performed; combined with the rest of the run).

---

### Phase 2: Primitive capability — `boxSize` override

- [x] **Task 4: `Toggle.tsx` — optional `boxSize` prop**

  **Description:** Per spec §1.4/§4 — add `boxSize?: number` to `ToggleProps`, threaded as `boxHeight={boxSize ?? CABINET_TOGGLE_BOX_SIZE}` on the internal `CabinetBox` call. Omitted, behavior is byte-for-byte identical to today. **Correction found during implementation:** also required moving `cabinetTokens` (the `--cabinet-toggle-box-size` custom property) from a module-level constant to per-instance — see Architecture Decisions.

  **Acceptance criteria:**
  - [x] `boxSize={44}` results in `CabinetBox` receiving `boxHeight={44}` (assert via mocked `CabinetBox` props).
  - [x] Omitting `boxSize` still passes `boxHeight={CABINET_TOGGLE_BOX_SIZE}` (32) — regression guard.
  - [x] Every existing `Toggle.test.tsx` case passes unmodified.
  - [x] No other `Toggle` consumer in the app requires any call-site change — confirmed by `npm run build:types` surfacing nothing.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/Toggle.test.tsx` passes (21/21 — 17 existing + 4 new: `boxSize`→`boxHeight`, omitted-default regression guard, and the `--cabinet-toggle-box-size` custom-property pair).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/Toggle.tsx`, `src/components/ui/controls/Toggle.test.tsx`

  **Estimated scope:** XS (1 file + test, additive-only)

- [x] **Task 5: `RadioButton.tsx` — optional `boxSize` prop**

  **Description:** Per spec §1.4/§4 — add `boxSize?: number` to `RadioButtonProps`; when provided, pass `boxHeight`/`frontWidth`/`frontHeight` all equal to `boxSize` on every option's `CabinetBox` (spread conditionally so omitting `boxSize` passes none of the three, preserving today's content-sized/tiered default exactly). **Follow-up found mid-Task-8:** also gained a separate `onDeselect` prop — see Architecture Decisions and its own commit.

  **Acceptance criteria:**
  - [x] `boxSize={44}` results in every option's `CabinetBox` receiving `boxHeight={44} frontWidth={44} frontHeight={44}`.
  - [x] Omitting `boxSize` passes none of `boxHeight`/`frontWidth`/`frontHeight` — regression guard matching every current consumer's real behavior.
  - [x] Every existing `RadioButton.test.tsx` case passes unmodified.
  - [x] No existing `RadioButton` consumer requires any call-site change.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/RadioButton.test.tsx` passes (18/18 at Task 5; 21/21 after the later `onDeselect` follow-up).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/RadioButton.tsx`, `src/components/ui/controls/RadioButton.test.tsx`

  **Estimated scope:** XS (1 file + test, additive-only) — actual: 2 commits (`boxSize` here, `onDeselect` as a separate follow-up during Task 8)

### Checkpoint B: Primitives support `boxSize`
- [x] `npm test` (full suite) clean — 2205/2205, zero regression across every existing `Toggle`/`RadioButton` consumer app-wide.
- [x] `npm run build:types`, `npm run lint`, `npm run build` clean.
- [ ] Review with human before proceeding (optional — not performed).

---

### Phase 3: Header-only foundations (data + hook)

- [x] **Task 6: `headerNavConfig.ts` — `HEADER_NAV_SCHEMA`**

  **Description:** Add `src/data/headerNavConfig.ts` exporting `HEADER_NAV_SCHEMA: RadioButtonSchema` per spec §1.4 — 3 options (`robots`/`audioRig`/`settings`), no schema-level `loreLabel`/`humanLabel`. Did **not** touch `src/data/hubNavConfig.ts` at this point — left as `HubNav.tsx`'s only consumer until Task 12.

  **Acceptance criteria:**
  - [x] `HEADER_NAV_SCHEMA.options` values are exactly `'robots' | 'audioRig' | 'settings'`, matching the `HubTile` union.
  - [x] `src/data/hubNavConfig.ts` untouched at this point (still existed, still used by `HubNav.tsx`, until Task 12 deleted both).

  **Verification:**
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/data/headerNavConfig.ts`

  **Estimated scope:** XS (1 new file, no test — static data, exercised by Task 8's `Header.test.tsx`)

- [x] **Task 7: `useHeaderRowFit.ts` — row 1+3 merge threshold hook**

  **Description:** Add the `ResizeObserver`-driven self-fit hook per spec §1.5, mirroring `useVoxelTrackBoxCount`'s shape. `MIN_VOLUME_RESERVE_PX = 80` (matching the volume slider's pre-existing CSS width) is the reserved minimum for the volume slider.

  **Acceptance criteria:**
  - [x] Returns `false` below the computed threshold width, `true` at/above it.
  - [x] Recomputes on a simulated resize (mocked `ResizeObserver`).
  - [x] Disconnects its observer on unmount.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/useHeaderRowFit.test.ts` passes (9/9).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/useHeaderRowFit.ts`, `src/components/panels/screen/useHeaderRowFit.test.ts`

  **Estimated scope:** S (1 new file + test, real but self-contained logic)

---

### Phase 4: `Header.tsx` — built and proven, not yet mounted

- [x] **Task 8: `Header.tsx`/`.css`/`.test.tsx`**

  **Description:** Built the full 3-row header per spec §1.2-§1.5. **Not wired into `ScreenViewport` yet** — `TransportBar` stayed the live header until Task 9. During this task, discovered and fixed two issues beyond its own original scope (see Architecture Decisions): `RadioButton` needed a new `onDeselect` prop (committed separately, before Header's own nav wiring was corrected to use it), and `MUTE_SCHEMA` needed a real `humanLabel` (Header never ended up needing to forward an external ref — see item 4 in Architecture Decisions).

  **Acceptance criteria:**
  - [x] Renders exactly one volume slider (role `slider`, name `/volume/i`), bound to `audioStore.volume`/`setVolume`, `disabled={!isPoweredOn}`.
  - [x] Renders `HH:MM -XX°C` from `activeLocaleLocalTime`/`activeLocaleTemperature` store fixtures; renders `—` when temperature is `null`.
  - [x] Renders one `Toggle` for Mute and one `RadioButton` group (3 options).
  - [x] Selecting a nav option calls `setActiveHubTile`; re-selecting the active option clears it to `null` — **via the new `onDeselect` prop**, not a bare unmodified `onChange('')` as originally assumed (RadioButton's `onChange` guard silently swallows that event — see Architecture Decisions item 2).
  - [x] Selecting `'robots'` while a `selectedRobotId` fixture is set also calls `selectRobot(null)` — implemented as `onDeselect`'s own logic (re-clicking 'robots' specifically), not `onChange`'s, since `onChange` never fires for a re-click of the already-active option.
  - [x] `header--inline` class presence tracks a mocked `useHeaderRowFit` return value (both cases).
  - [x] Component measures its own height internally (no external ref exposed — item 4, Architecture Decisions).
  - [x] Component was not imported or rendered anywhere outside its own test file at this point (`ScreenViewport.tsx` still rendered `TransportBar`).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/Header.test.tsx` passes (21/21 — 18 core + 3 `--header-height` measurement cases added alongside Task 9's own work, kept in this file rather than a separate one since they exercise `Header`'s own effect).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` (full suite) clean — 2235/2235.

  **Dependencies:** Task 2, Task 3, Task 4, Task 5, Task 6, Task 7.

  **Files:** `src/components/panels/screen/Header.tsx`, `src/components/panels/screen/Header.css`, `src/components/panels/screen/Header.test.tsx`. Plus, as a separate atomic commit discovered mid-task: `src/components/ui/controls/RadioButton.tsx`/`.test.tsx` (`onDeselect`).

  **Estimated scope:** M (3 files) — actual: 3 files for Header itself + 1 separate 2-file follow-up commit for `onDeselect`.

### Checkpoint C: `Header` built and proven in isolation
- [x] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [x] App is unchanged in-code — `TransportBar` was still the only file `ScreenViewport.tsx` imported at this point (confirmed by grep, not just by reasoning).
- [ ] Review with human before proceeding — **recommended, not performed**; the session continued straight through to Task 9 on the user's own explicit instruction to implement every task sequentially.

---

### Phase 5: Go live — swap `Header` in, fix the deadzone

- [x] **Task 9: Wire `Header` into `ScreenViewport`; fix horizontal + vertical deadzone clearance; delete `TransportBar.*`**

  **Description:** The highest-risk task in this plan (spec §1.6, §7 item #1). **Implemented differently from the original plan** (see Architecture Decisions item 4): rather than `ScreenViewport.tsx` owning a `ResizeObserver` over a ref `Header` forwards out, `Header.tsx` gained a second, self-contained effect on its own already-existing internal ref, writing `--header-height` directly to `document.documentElement`. `ScreenViewport.css`'s deadzone selector retargets `.header`. `Console.css`'s `margin-top` becomes `max(var(--header-height, var(--power-corner-height)), var(--power-corner-height))` verbatim. `TransportBar.tsx`/`.css`/`.test.tsx` deleted; stale doc-comments elsewhere (`audioStore.ts`, `Tablet.test.tsx`) describing `TransportBar` as current architecture updated to `Header`.

  **Acceptance criteria:**
  - [x] `Header` is the only header-like element rendered by `ScreenViewport` — `TransportBar` no longer exists anywhere in the codebase (confirmed via grep before deletion, and via `build:types` after).
  - [x] `--header-height` is set on `document.documentElement` and updates on resize — unit-tested via a controllable `ResizeObserver` mock (3 new cases in `Header.test.tsx`). **Real-layout confirmation is a manual check, not performed this session (no devtools tooling available).**
  - [x] `Console.css`'s `margin-top` uses the `max(...)` fallback-chain form verbatim.
  - [x] Horizontal deadzone (`padding-left: var(--sleeve-bar-width)`) is applied to `Header`'s whole root, not per-row.

  **Verification:**
  - [x] `npx vitest run src/components/panels/physical/ScreenViewport.test.tsx` passes (2/2, updated to mock/reference `Header` instead of `TransportBar`).
  - [x] `npm run build:types`, `npm run lint`, `npm run build` clean.
  - [x] `npm test` (full suite) clean — 2223/2223 (-12 from `TransportBar.test.tsx`'s deletion).
  - [ ] **Manual check — NOT PERFORMED this session (no browser/devtools tooling available).** Flagged for Crawford: at every breakpoint and both powered states, confirm (a) no header content renders under the power-switch corner, and (b) no `Console` content renders underneath the header's own lower row(s).

  **Dependencies:** Task 8.

  **Files:** `src/components/panels/physical/ScreenViewport.tsx`, `src/components/panels/physical/ScreenViewport.css`, `src/components/panels/screen/console/Console.css`, `src/components/panels/screen/Header.tsx` (the height-effect addition, not originally listed here — see Architecture Decisions item 4), `src/stores/audioStore.ts`, `src/components/tablet/Tablet.test.tsx` (stale-comment cleanup), plus deletion of `TransportBar.tsx`, `TransportBar.css`, `TransportBar.test.tsx`.

  **Estimated scope:** M — flagged high-risk despite modest file count; manual check still outstanding.

- [x] **Task 10: `ConsolePanel.tsx` — null-tile branch returns nothing**

  **Description:** Per spec §1.7/§4 — `activeHubTile === null` now returns `null`. `HubNav` import removed (unused).

  **Acceptance criteria:**
  - [x] `activeHubTile === null` renders nothing from `ConsolePanel`.
  - [x] Every other tile's existing content/back-button behavior unchanged.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/ConsolePanel.test.tsx` passes (8/8).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 9.

  **Files:** `src/components/panels/screen/console/ConsolePanel.tsx`, `src/components/panels/screen/console/ConsolePanel.test.tsx`

  **Estimated scope:** XS (1 file + test)

- [x] **Task 11: `Console.tsx`/`Console.css` — drop the now-dead `.console--grid` pointer-events mechanism**

  **Description:** Per spec §1.7/§7 item #5 — `Console.tsx` now returns `null` when `activeHubTile === null`, rather than an always-present `.console` wrapper with a conditional class. `Console.css`'s `.console--grid`/`.console--grid .sc-button` rules deleted. Stale `console--grid` doc-comments elsewhere (`Robot.tsx`, `Button.css`) updated.

  **Acceptance criteria:**
  - [x] `Console.tsx` no longer references `console--grid` anywhere.
  - [x] `Console.css`'s `.console--grid`/`.console--grid .sc-button` rules deleted.
  - [ ] Clicking in the empty hub area reaches `WorldView`'s robots underneath — **manual check, not performed this session.**

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/Console.test.tsx` passes (3/3, rewritten for the new render-nothing behavior).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: world-view click-through — **not performed this session (no browser tooling).**

  **Dependencies:** Task 10.

  **Files:** `src/components/panels/screen/console/Console.tsx`, `src/components/panels/screen/console/Console.css`, `src/components/panels/screen/console/Console.test.tsx`, plus stale-comment cleanup in `src/components/robot/Robot.tsx` and `src/components/ui/controls/Button.css` (not originally listed — same category as Task 9's `audioStore.ts`/`Tablet.test.tsx` cleanup).

  **Estimated scope:** XS (2-3 files, deletion-heavy) — actual: 5 files, 3 of them comment-only.

- [x] **Task 12: Delete `HubNav.*`, `hubNavConfig.ts`, `HubNavItem`**

  **Description:** Final cleanup, per spec §2/§3.

  **Acceptance criteria:**
  - [x] `HubNav.tsx`/`.css`/`.test.tsx` and `hubNavConfig.ts` no longer exist.
  - [x] `HubNavItem` no longer exists in `src/types/hub.ts`; `HubTile` untouched.
  - [x] No remaining import of any deleted file anywhere in `src/` (`npm run build:types` clean).

  **Verification:**
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.
  - [x] `npm test` (full suite) clean — 2220/2220 (-3 from `HubNav.test.tsx`'s deletion).

  **Dependencies:** Task 6, Task 10.

  **Files:** deleted `src/components/panels/screen/console/HubNav.tsx`, `HubNav.css`, `HubNav.test.tsx`, `src/data/hubNavConfig.ts`; edited `src/types/hub.ts`, `src/data/headerNavConfig.ts` (its own doc-comment, no longer future-tense about a deletion that's now done).

  **Estimated scope:** XS (pure deletion + 1 small edit)

### Checkpoint D: Feature complete, old hub grid fully retired
- [x] `npm run build:types`, `npm run lint`, `npm run build`, `npm test` (full suite) all clean.
- [x] No trace of `TransportBar`/`HubNav`/`hubNavConfig`/`HubNavItem` anywhere in `src/` (grep-confirmed).
- [ ] Manual checks from Task 9 (deadzone) and Task 11 (click-through) — **not performed this session.**
- [ ] Manual check (volume+buttons inline merge at real widths, temperature's visible drift over real time) — **not performed this session.**
- [ ] Review with human before proceeding to docs/PR — **not performed.**

---

### Phase 6: Docs

- [x] **Task 13: `docs/UI_SHELL.md` — replace `TransportBar`/`HubNav` description**

  **Description:** Updated per spec §2 — describes `Header`'s 3 rows, the retired `console--grid` mechanism, and the new `activeLocaleTemperature` uiStore field.

  **Acceptance criteria:**
  - [x] No remaining reference to `TransportBar` or `HubNav` as currently-existing components (the 2 remaining mentions are explicit lineage/history, e.g. "absorbed both the old TransportBar's controls").
  - [x] New text spot-checked against the actual shipped `Header.tsx`, `ConsolePanel.tsx`, `Console.tsx`, `uiStore.ts`.

  **Verification:**
  - [x] Manual review.
  - [x] `npm run lint` clean (project-wide).

  **Dependencies:** Task 9, Task 10, Task 11, Task 12.

  **Files:** `docs/UI_SHELL.md`

  **Estimated scope:** XS (docs only)

- [x] **Task 14: `docs/COMPONENT_LIBRARY.md` — `boxSize`/`onDeselect` override notes**

  **Description:** Added an "Update" note to both `Toggle`'s and `RadioButton`'s sections, matching the file's established per-primitive update-note pattern. Covers `onDeselect` alongside `boxSize` for `RadioButton`, since both shipped as part of this feature.

  **Acceptance criteria:**
  - [x] Both sections document the new props' purpose and default-omitted behavior.
  - [x] Spot-checked against the actual shipped prop interfaces directly (`grep`-verified, not re-read from the spec).

  **Verification:**
  - [x] Manual review.

  **Dependencies:** Task 4, Task 5.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Final Checkpoint: Complete
- [x] All acceptance criteria across all 14 tasks met, **except** the manual/real-layout checks below, which remain open.
- [x] `npm run build:types`, `npm run lint`, `npm run build`, `npm test` (full suite) all clean at every checkpoint.
- [x] **Manual checks that were outstanding (no browser tooling in this implementing session) — since resolved:** Task 9's deadzone check, Task 11's click-through check, and Checkpoint D's inline-merge/temperature-drift check were superseded by Crawford's own subsequent live iteration on the running app (the "big header restyle" pass — see "Post-implementation follow-up" at the end of this doc), which reworked the header's layout mechanism entirely and exercised these concerns directly rather than confirming the original CSS-grid shape as originally specified.
- [x] `docs/UI_SHELL.md` and `docs/COMPONENT_LIBRARY.md` reflect the shipped feature.
- [x] **Reviewed with Crawford via direct iteration — ready for PR.**

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 9's vertical deadzone fix (`--header-height` cross-sibling measurement) has no existing precedent in this codebase and can't be fully proven by jsdom (no real layout) | High — a miscalculation directly reproduces the "content hidden under the header" failure the whole feature is meant to avoid | Isolated into its own single task, explicit fail-safe `max(...)` fallback chain specified verbatim and implemented exactly as specified, unit-tested `ResizeObserver` wiring — **real-layout confirmation done via the post-implementation follow-up's own live iteration** |
| `Header.tsx` (Task 8) is the densest task in this plan — assembles 5 prior tasks' output across 3 files | Medium — higher chance of a mismatch surfacing only at integration | Materialized once, as the `RadioButton` `onDeselect` gap (Architecture Decisions item 2) — caught immediately by a failing test during Task 8 itself, fixed before proceeding, not discovered later |
| Retiring the old hub grid (Tasks 10-12) happens only after `Header`'s nav group is live (Task 9) | Low-Medium — narrow window, but a real regression class | Task 9 shipped with `Header`'s nav group already verified end-to-end (Task 8's tests); Tasks 10-12 only proceeded after Task 9's own full-suite pass |
| `MIN_VOLUME_RESERVE_PX` (Task 7, `80px`) is an unconfirmed engineering default; `Header.css`'s own volume-row sizing was later superseded entirely by the "big header restyle" below | Low — cosmetic, easy to retune | Flagged in Task 7's own description; moot for the shipped layout — the restyle's breakpoint-driven widths replaced the row this constant was tuned for |
| Dropping per-option lore-label flavor text when hub tiles moved from `Button` to `RadioButton` (Task 6) | Low — pure flavor text, no functional loss | Flagged in the spec (§7 item #3) and this plan; `HEADER_NAV_SCHEMA` intentionally carries only `value`/`label`, no lore text, confirmed during Task 6's review of this doc |

## Open Questions

Resolved during Plan (not left open):

- ~~Does `Header.tsx` get wired into `ScreenViewport` in the same task it's built in?~~ **Resolved: no.**
- ~~Does the old hub grid get torn down before or after `Header`'s nav group ships?~~ **Resolved: strictly after.**
- ~~Is `ConsolePanel` returning `null` vs. `Console.tsx` skipping its own wrapper the right split?~~ **Resolved: `Console.tsx` skips the wrapper**, `ConsolePanel` also returns `null` independently.

Resolved during Implement (new, not anticipated by Plan):

- ~~Does `RadioButton`'s existing deselect-to-empty guard forward `''` to `onChange`?~~ **Resolved: no, it silently swallows it — for every consumer, always did.** Required the new `onDeselect` prop (Architecture Decisions item 2), found via a failing test, not by re-reading the spec more carefully.
- ~~Does Header need to forward an external ref for Task 9's height measurement?~~ **Resolved: no** — self-contained on its own internal ref instead (Architecture Decisions item 4).

Carried forward from spec §7, genuinely still open (human input needed):

1. No group-level accessible name for the row-3 `Toggle`/`RadioButton` (spec §7 item #2) — each falls back to its raw `schema.id` for `aria-label`. Each individual `RadioButton` option still has its own real `aria-label`; this affects only the group root's own name. Worth a second look during the still-pending human review.
2. ~~`MIN_VOLUME_RESERVE_PX`'s exact value (`80px`)~~ **Moot** — the row it was tuned for no longer exists as originally specced; see "Post-implementation follow-up" below (the constant, and the `useHeaderRowFit` mechanism it belongs to, are dead code the restyle left behind, not cleaned up).
3. ~~Every manual/real-layout check across Tasks 9, 11, and the Final Checkpoint~~ **Resolved via post-implementation follow-up** — see below; no devtools/browser tooling was available in the implementing session that closed the 14 tasks above (same limitation every prior Oblique Cabinetry task doc in this repo has recorded under the same circumstance), but Crawford's own subsequent live iteration exercised the real running app directly.

---

## Post-implementation follow-up (outside this plan's 14 tasks)

Several commits landed on `feature/header-hub-updates` after this plan's Final Checkpoint, none re-running the spec-driven-development process above — live UI iteration by Crawford, plus a couple of small assisted fixes. Recorded here so a reader comparing this doc's 14 tasks against the shipped code isn't confused by the gap; `docs/UI_SHELL.md`/`docs/COMPONENT_LIBRARY.md` reflect the current, post-follow-up state, not just the 14-task plan's own shape.

- **Toggle facade content (`children` prop) + Header's Mute icon → text:** `Toggle` gained an optional `children` prop for facade content (icon or text) rendered on its `CabinetBox` front face, replacing the plain 🔇/🔊 icon Header's Mute switch originally shipped with (Task 8) — first with the icon still in place, then reworked to two stacked text strings (`"Volume/Mute"` unmuted, `"Volume Muted"` muted) that also double as the volume row's own label. `PingControlsDrawer`'s Click Track toggle adopted the same facade mechanism. See `docs/COMPONENT_LIBRARY.md`'s Toggle section.
- **"Big header restyle":** `Header.css` (and `Header.tsx`'s JSX structure) were substantially reworked — the original CSS-grid, 3-row layout with a `useHeaderRowFit`-driven inline merge was replaced by a hand-authored, breakpoint-driven flex layout (430/480/880/1220px). `useHeaderRowFit`/the `header--inline` class survive in the code but are no longer targeted by any CSS rule — a known-dead mechanism, not cleaned up (flagged in `docs/UI_SHELL.md`). Attenuation Style name and locale coordinates, dropped by this plan's own spec (§1.8), were reinstated in the header alongside `SectorSettingsDrawer`'s existing display of the same data. The nav `RadioButton` group now renders twice (`.primary`/`.secondary`), CSS-swapped by breakpoint rather than reflowed as one instance.
- **Volume slider bug fix:** the restyled `.header__row--volume` at narrow viewports (`flex-direction: column; align-items: center`) reintroduced the exact "measuring my own consequence" circularity `useVoxelTrackBoxCount.ts`'s own doc comment warns the horizontal self-observation case must avoid — a fast resize/snap down to ~320px left the volume slider's box count stuck at its old, too-wide value instead of re-fitting to 3 boxes. Fixed with a scoped `align-self: stretch` override (reverted back to default at ≥480px, where row-direction flex-grow/shrink already handles it) — see `Header.css`'s own comment at `.header__row--volume .sc-slider-linear`.
- **Per-tile Back button removed, kept only for robot detail:** `ConsolePanel`'s Back button, present on every tile in this plan's original Task 8/9 design, was removed from the Robots list, Audio Rig, and Sector Settings once Header's nav group alone was confirmed sufficient to reach the blank hub from any of them. It survives only for the nested robot-detail view (a robot selected within the Robots tile), which Header's nav has no direct one-step path back from. `handleBack`'s tile-aware branching (this plan's own Architecture Decisions) collapsed to a single `selectRobot(null)` call as a result. See `docs/UI_SHELL.md`'s Console Navigation section.
