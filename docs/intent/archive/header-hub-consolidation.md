# Intent: Header & Hub Consolidation + Temperature

Confirmed via `interview-me` on 2026-09-11, ahead of a `spec-driven-development` pass. Not part of the roadmap.

## Outcome

Collapse [TransportBar.tsx](../../src/components/panels/screen/TransportBar.tsx) and [HubNav.tsx](../../src/components/panels/screen/console/HubNav.tsx)'s swappable tile grid into one persistent 3-row header docked to the top of `ScreenViewport`, wrapped around the power-switch deadzone (today's `--sleeve-bar-width`/corner-exclusion mechanism in [ScreenViewport.css](../../src/components/panels/physical/ScreenViewport.css)). The hub's navigation buttons move into that header and stay on screen at all times instead of disappearing once a tile is selected. A new purely-decorative seeded temperature readout is added alongside the clock.

## Rows

1. **Volume slider** (horizontal). Starts clear of the deadzone and stretches to fill the rest of the row — same padding/offset approach `.screen-content .transport-bar` already uses. Label CSS polish explicitly deferred to a later pass.
2. **Time + temperature**, e.g. `12:23 -45°C`. A short row, always its own separate row — this never merges into the wide-screen inline layout, unlike rows 1 and 3.
3. **Four Cabinetry buttons**, flowing right after the deadzone:
   - **Mute** — a Cabinetry `Toggle` (popped = currently muted), replacing today's `Toolbar.Button` emoji icon.
   - **Robots / Audio Rig / Sector Settings** — one Cabinetry `RadioButton` group, `value` bound directly to `uiStore.activeHubTile` (content-width boxes, not fixed squares, mirroring `Button`'s sizing rather than `Toggle`'s fixed square).

### Nav group behavior

- Selecting an option sets `activeHubTile` and navigates there, same as today's `HubNav` click behavior.
- `RadioButton`'s existing deselect-to-empty guard (re-clicking the active option emits `''`) is left unmodified and doubles as a second way back to the blank hub, alongside the existing per-tile Back button — no special-casing to suppress it.
- Clicking a nav option while deep in a robot's detail view (`activeHubTile === 'robots'` with `selectedRobotId` set) behaves like selecting that tile fresh: drops to the robot list (clearing `selectedRobotId`), not a toggle-to-blank, even though Radix would otherwise see `activeHubTile` as already `'robots'` and fire the deselect path.

## Removed from the header

Attenuation Style name, locale coordinates, and BPM ("tempo") readouts drop out entirely — not relocated. [SectorSettingsDrawer.tsx](../../src/components/panels/screen/console/SectorSettingsDrawer.tsx) already shows Attenuation Style name and coordinates on its own screen, so nothing there needs to change to cover the gap.

`HubNav.tsx`'s tile grid is removed. `ConsolePanel.tsx`'s `activeHubTile === null` branch becomes genuinely empty (no `HubNav`) so `WorldView`'s swimming robots show through unobstructed. The existing per-tile Back button (`console-panel__back`) is unchanged in behavior — it still returns to that same blank state, just via the same header nav buttons rather than a re-appearing tile grid.

## Temperature

- Purely decorative/immersion — no gameplay or audio effect, not read by any other system.
- Range: -120°C to -30°C, integer display (`-45°C`, always negative so no explicit sign-handling needed for positive values).
- Seeded per-locale, drifting continuously rather than stepping — reuses the exact mechanism [AttenuationStyleView.tsx](../../src/components/panels/screen/worldView/AttenuationStyleView.tsx) already has: the same 1s `setInterval` tick that recomputes `computeLocaleHour(dayStartTimestamp)` (a continuous float, 0-24) for local time. Temperature samples `getSeededVal(noiseMap, 'temperature', currentHour, -120, -30)` against the active locale's own noise map (`getLocaleNoiseMap`/`tryGetLocaleNoiseMap`, per [PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md)) on that same tick — continuous simplex noise sampling is what produces the smooth drift, not a discrete per-hour jump-and-hold.
- "Updated every in-world hour" describes the drift's timescale (one in-world hour ≈ 15 real seconds at the current 6-minute `DAY_DURATION_MS`), not a step function.
- Storage: a plain number in `uiStore`, set on the same tick as `activeLocaleLocalTime` — mirrors that field's existing placement and update pattern exactly, not a new store or a derived-on-render computation.

## Responsive layout

- **Narrow:** 3 stacked rows. Row 2 (time+temp) always stays separate/short, in both narrow and wide layouts.
- **Wide:** row 1 (volume) and row 3 (buttons) merge into a single inline row, in the same left-to-right order, once the button row genuinely fits at its 44×44 minimum. This is measured via a `ResizeObserver`-driven self-fit check — the same pattern `useVoxelTrackBoxCount` already established for "does this row of controls fit" (roadmap 11.1.3) — not a guessed fixed-`px` CSS breakpoint.
- Row 2 never participates in this merge regardless of width.

## Out of scope

- The actual time-system rework ("moving time in a moment") — a separate, later task.
- Volume slider's label CSS polish.
- Any content changes inside `SectorSettingsDrawer`/`AudioRigDrawer`/`RobotsTab` themselves beyond being reached via the new persistent nav button instead of a tile-grid button.
- Any active/selected-indicator changes to those three drawers/tabs.
- Temperature having any effect on audio, visuals, or any other system — display only.

## Known implementation notes (not yet spec'd)

- `TransportBar.tsx` is likely replaced/renamed outright rather than incrementally patched, given how much of its current content (attenuation style, coords, BPM) is removed and how much new structure (3 rows, nav group) is added — left for the `spec-driven-development` pass to decide.
- Whether the deadzone offset (`--sleeve-bar-width` padding) needs to apply to more than row 1, depending on how `--power-corner-height` compares to the stacked 3-row header's total height in the narrow layout — left for that pass to verify against the real corner geometry.
- Exact home for the `ResizeObserver` self-fit hook (new hook vs. reusing/generalizing `useVoxelTrackBoxCount`) — left open.
