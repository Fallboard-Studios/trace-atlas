# Phase Spec: Layout (Roadmap Phase 2)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/phase-2-layout.md](../intent/phase-2-layout.md) (confirmed via `/interview-me`). Source of scope: [docs/todo/roadmap.md § 2](../todo/roadmap.md#2-layout).

---

## 1. Overview & Claude Explanation

This phase collapses the two-layout-mode shell (mobile stack vs. desktop 2-column grid + landscape tablet frame) down to one layout that only scales, never reorients. `SleeveContainer`'s power-switch instance gets a cutaway: its matte area shrinks to a small corner housing `PowerRockerSwitch`, plus a thin ~16px strip of sleeve material continuing along the top to the switch's right, and `ScreenViewport` grows to fill the freed vertical space above where the full-height sleeve column used to sit. `PowerRockerSwitch` z-indexes over `ScreenViewport`'s top-left corner (it's the one interactive element `SleeveContainer` is already allowed to hold); `ScreenViewport`'s own CSS keeps its content clear of that corner via padding/margin exclusion — no markup moves between the two components. Inside that freed space, `TransportBar` is rebuilt as a sticky mute+metadata bar: restart and pause/play are removed outright with no replacement, mute stays as a user helper, and a metadata readout (planet name/seed, locale coordinates, BPM, time) is added, reading directly off `planetStore`/`localeStore`/`audioStore`/`constants/time.ts` — no new data file. The bar stays `position: sticky` at every viewport size, fixing today's `TransportBar.css` rule that silently turns stickiness off at `min-width: 48em`. Mute and metadata sit in one row when there's room to the right of the cutaway, wrapping to a second line when there isn't — a content-driven `flex-wrap`, not a new viewport-breakpoint override. `RobotList` is deleted outright (Phase 8's tile-based Robot Selection is different enough in shape that nothing here is worth preserving), and every remaining desktop-reorientation rule goes: `ScreenViewport.css`'s two-column content grid, `Tablet.css`'s row-flip and progressive widening of the outer sleeve/viewport/sleeve frame, and `SleeveContainer.css`'s matching column-flip and logo rotation. `ConsoleNavigation` stops being rendered from this layout but its code, `uiStore.activeConsoleTab`, and its tab content are left untouched — Phase 3 owns its real teardown and the tile-based `HubNav` rebuild.

---

## 2. Target File Structure

```text
src/
├── index.css                                    # MODIFIED — remove dead `--sleeve-width-tablet`/`--sleeve-width-desktop` tokens (defined, never referenced anywhere in src/)
├── components/
│   ├── tablet/
│   │   └── Tablet.css                           # MODIFIED — remove the `min-width: 48em/64em/80em/92em` row-flip + progressive-width rules; `.tablet` stays `flex-direction: column` at every size
│   └── panels/
│       ├── physical/
│       │   ├── SleeveContainer.tsx              # MODIFIED — the `hasPowerSwitch` instance renders the cutaway structure (small power-switch block + thin top strip) instead of one uniform-height bar
│       │   ├── SleeveContainer.css              # MODIFIED — remove the `min-width: 48em` column-flip + logo-rotation block; add cutaway/top-strip layout for the `hasPowerSwitch` instance; non-power instance is unchanged (still a plain full-width bar)
│       │   ├── ScreenViewport.tsx                # MODIFIED — drop the `RobotList` render
│       │   └── ScreenViewport.css                # MODIFIED — remove the `min-width: 64em` two-column grid + its `.screen-occlusion` override; `.screen-content` grid drops the `robotlist` area (3 areas: transport/meta bar, worldview, console); add padding/margin exclusion so content doesn't render under the power-switch corner
│       └── screen/
│           ├── TransportBar.tsx                  # MODIFIED — remove restart + pause/play controls and `isPaused` state; add metadata readout (planet name, locale coordinates, BPM, time — all already read via existing store hooks); keep `.transport-bar__displays`/`.transport-bar__btn` as the outer class names (see § 3, GSAP dependency)
│           ├── TransportBar.css                  # MODIFIED — remove the `min-width: 48em` `position: relative` override (stays `sticky` always); mute+metadata row becomes `flex-wrap: wrap` for content-driven wrapping
│           ├── RobotList.tsx                     # DELETED
│           └── RobotList.css                      # DELETED
│       └── ui/physical/
│           └── PowerRockerSwitch.css             # MODIFIED — remove the `min-width: 48em` `.rocker-panel { transform: none }` override; the rotated (mobile) transform applies at every size, matching the sleeve staying a horizontal bar always

docs/
└── UI_SHELL.md                                   # MODIFIED — Overview line no longer lists `RobotList`; `TransportBar` description updated to the mute+metadata bar, per the roadmap's own Docs note for this phase
```

**Not touched this phase** (confirmed out of scope in the intent doc): no new `src/data/localeMetadataConfig.ts`, no new `src/utils/planetTime.ts`, no changes to `ConsoleNavigation.tsx`/`ConsolePanel.tsx`/`uiStore.ts`'s `activeConsoleTab`, no changes to `AudioEngine`/`beatClock`/any Tone.js code.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in the Target File Structure above unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Guardrail — no interactive UI in `SleeveContainer`:** The cutaway is a pure CSS/z-index visual effect. `PowerRockerSwitch` is the only interactive element in `SleeveContainer` (already permitted). Mute and the metadata readout stay DOM-owned by `ScreenViewport`/`TransportBar` and are only *visually* positioned into the freed space — nothing moves into `SleeveContainer`'s markup.
* **GSAP cross-file dependency — do not silently break this:** `PowerRockerSwitch.tsx`'s `handlePowerOn` power-up animation directly targets `.transport-bar__displays` and `.transport-bar__btn` by class name (module-level `gsap.timeline()` selectors, not scoped to `TransportBar`). Since mute is now the only button and the metadata readout replaces the old measure/BPM display, these two class names must keep matching *something* meaningful in the rebuilt bar (the outer classes may stay as-is), or `PowerRockerSwitch.tsx`'s animation must be updated in the same change — it must not go on selecting elements that no longer exist.
* **No new data files or utils this phase** — `localeMetadataConfig.ts` and `planetTime.ts` are explicitly out of scope (see intent doc); read planet/locale/audio values directly off `planetStore`, `localeStore`, `audioStore`, and `constants/time.ts`.
* **State stays serializable, no new `uiStore` fields anticipated** — this phase reads existing store state; it does not add new persisted UI state.
* **No timers for musical timing** — nothing in this phase should need one; if any wrap/resize logic is tempted to reach for `ResizeObserver` callbacks that touch audio scheduling, that's out of bounds (there's no reason it should).
* **`RobotList` deletion is final** — do not leave the files in place "just in case"; Phase 8 builds its replacement from scratch.
* **`ConsoleNavigation` is hands-off** — stop rendering it, don't edit it.

---

## 4. Code Style & Architecture Conventions

`TransportBar.tsx` keeps its existing hook-per-value pattern; controls shrink, metadata grows:

```typescript
// src/components/panels/screen/TransportBar.tsx — before/after shape
// BEFORE: restart button, pause/play ToggleGroup, mute ToggleGroup, measure+BPM display
// AFTER:  mute ToggleGroup only, plus a metadata row

function TransportBar() {
  const localeId = usePlanetStore((s) => selectCurrentPlanet(s)?.currentLocaleId ?? '');
  const planet = usePlanetStore((s) => selectCurrentPlanet(s));
  const locale = useLocaleStore((s) => s.locales[localeId]);
  const bpm = useAudioStore((s) => s.bpm);
  const isMuted = useAudioStore((s) => s.isMuted);
  // ...existing planetHour/localTime derivation via constants/time.ts, unchanged...

  return (
    <Toolbar.Root className="transport-bar" aria-label="Transport controls">
      <div className="transport-bar__buttons">
        {/* mute ToggleGroup only — restart/pause removed entirely */}
      </div>
      <div className="transport-bar__displays">
        {/* planet name, locale coordinates, BPM, time — flex-wrap: wrap */}
      </div>
    </Toolbar.Root>
  );
}
```

`SleeveContainer.tsx`'s power-switch instance splits into two visual pieces instead of one uniform bar — still a plain function component, no new abstraction layer:

```typescript
// src/components/panels/physical/SleeveContainer.tsx — shape, not final markup
function SleeveContainer({ hasPowerSwitch = false }: SleeveContainerProps) {
  return (
    <aside className="sleeve-container" aria-label="Device controls">
      {hasPowerSwitch ? (
        <>
          <div className="sleeve-container__power-corner">
            <PowerRockerSwitch />
          </div>
          <div className="sleeve-container__top-strip" aria-hidden="true" />
        </>
      ) : (
        <div className="sleeve-logo" role="img" aria-hidden="true">PELAGOS</div>
      )}
    </aside>
  );
}
```

* **Naming Conventions:**
  * Components: PascalCase, unchanged file names (`TransportBar.tsx`, `SleeveContainer.tsx`) — no renames without a reason stronger than "the job changed slightly."
  * CSS classes: BEM-ish double-underscore convention already in use (`transport-bar__displays`, `sleeve-container__power-corner`) — new elements follow the same pattern as their parent.
* **Formatting:** Plain named function component exports (not `React.FC`), explicit prop interfaces, co-located plain CSS files per component, zero inline style objects unless calculating dynamic values.
* **Grid-area names stay put:** `TransportBar` keeps `grid-area: transport` in `ScreenViewport.css` even though its job changed — avoids a churn-only rename across the grid template.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate unit/component tests alongside implementation (`TransportBar.tsx` → `TransportBar.test.tsx`, `SleeveContainer.tsx` → `SleeveContainer.test.tsx`). Neither currently has a test file — this phase is a clean slate for both rather than an update to existing tests.
* **Coverage targets specific to this phase:**
  1. `TransportBar.test.tsx` — mute toggle still calls `AudioEngine.setMasterVolume`/`store.setMuted` correctly (existing behavior, just relocated); metadata readout renders planet name, locale coordinates, BPM, and time from store state; restart/pause controls are absent from the DOM.
  2. `SleeveContainer.test.tsx` — `hasPowerSwitch` instance renders `PowerRockerSwitch` inside the cutaway structure; the non-power instance renders unchanged (still just the logo).
  3. No test should assert on the removed `min-width` media queries — this phase's whole point is that none of that logic exists anymore.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
  5. Manual visual check across viewport widths (mobile, ~48em, ~64em, ~92em+): confirm the shell never reorients — only scales — that the mute+metadata row wraps correctly when narrow, and that no content renders under the power-switch corner.
  6. Manual a11y check (per CLAUDE.md's "Accessibility & performance" expectation): focus/keyboard navigation through the mute toggle, and reduced-motion preference still suppresses `PowerRockerSwitch`'s light-pulse animations (existing `@media (prefers-reduced-motion: reduce)` block in `PowerRockerSwitch.css` is untouched by this phase but should be re-checked after the cutaway layout change).

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/layout` (or similar — not yet opened as of this spec).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences (e.g. `Remove desktop reorientation rules from Tablet/SleeveContainer/ScreenViewport`).

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan phase before implementation, not silently during coding:

1. **Exact cutaway CSS mechanism is undecided.** The intent doc confirms the *behavior* (power switch z-indexed over the viewport corner, ~16px sleeve strip to its right, `ScreenViewport` filling the rest) but not the *mechanism* — e.g. whether `SleeveContainer`'s power instance becomes `position: absolute` over `ScreenViewport`, or whether `Tablet.css`'s grid/flex sizing shrinks the top sleeve's track to 16px with the power-switch block itself overflowing upward via negative margin. The Plan phase should pick one and note the exact pixel math (power-switch block width/height vs. the 16px strip height) before Implement starts.
2. **`.transport-bar__displays`/`.transport-bar__btn` selector contract** (§ 3) — confirm during Plan whether `PowerRockerSwitch.tsx`'s power-up timeline needs updating alongside `TransportBar.tsx`, or whether keeping the two class names on the right elements is sufficient. Don't discover this by watching the power-on animation silently no-op.
3. **Decorative rail/gradient media query not covered by the interview.** `ScreenViewport.css`'s `min-width: 48em` block also flips `.screen-viewport::before`'s stripe direction and `.screen-rail`'s bevel orientation from vertical (mobile) to horizontal (desktop) — purely decorative, written to accompany the physical sleeve reorientation that this phase removes. Left in place, it would flip the screen's decorative bevels to a horizontal-bar look that no longer matches anything (since the sleeve stays a horizontal top/bottom bar at every size now). Confirm with Crawford whether to remove this block too (keep the mobile/vertical-bevel look at every size) before Implement — it wasn't explicitly signed off in the interview, so treat it as a genuine open item rather than folding it in silently.
4. **`RobotList` grid-area removal changes row count.** `.screen-content`'s mobile `grid-template-rows` currently has one track per area (`auto auto 1fr 1fr` for 4 areas). Dropping `robotlist` leaves 3 areas; the Plan phase should pick the resulting row-size values (e.g. `auto 1fr 1fr` vs `auto 1fr auto`) based on how `Console`'s content is meant to fill remaining space, not invent it ad hoc mid-Implement.
