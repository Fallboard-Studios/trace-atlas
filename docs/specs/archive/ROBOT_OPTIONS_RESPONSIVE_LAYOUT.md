# Phase Spec: Robot Options — Responsive Layout Rework

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-options-responsive-layout.md](../intent/robot-options-responsive-layout.md) (confirmed via `/interview-me`, 2026-09-10). Related prior art: [docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md](AUDIO_RIG_RESPONSIVE_LAYOUT.md) (the `'responsive'` mechanism this phase reuses verbatim — no new panel-orientation mechanism is introduced here), [docs/specs/DIRECTIONAL_PANEL_WIRING.md](DIRECTIONAL_PANEL_WIRING.md) (today's Robot Options structure this phase modifies), [docs/specs/VERTICAL_SLIDERS.md](VERTICAL_SLIDERS.md) (the `'auto'` classification this phase retires for the last remaining `audioRigConfig.ts`-adjacent file that still has it). This phase is layout-only — no `AudioEngine`, `BeatClock`, or Zustand-shape change, no new `ControlSchema` variant, every existing control's `value`/`onChange` contract is untouched — **except** Source's Robot Drift rendering bug (§1.5), which is a real defect fix, not a pure layout change.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

`robotOptionsConfig.ts` and its 3 consumer drawers (`AudioSettingSection.tsx`, `PingControlsDrawer.tsx`, `PingContourDrawer.tsx`) are the last place in the app still using `'auto'`-resolved panel/slider orientation — deliberately deferred when `AUDIO_RIG_RESPONSIVE_LAYOUT.md` shipped. This phase retires it here too, reusing the exact same `'responsive'` `PanelOrientation` and fixed-slider-value approach — **no new mechanism**, `useResponsivePanelOrientation`/`useCabinetTier` are consumed as-is. `SignatureArrayDrawer.tsx` (Source) is explicitly out of scope for orientation work — its layer sliders are already fixed `'vertical'`, its per-layer panels already fixed `'row'` — but it does get one real bug fix (§1.5).

### 1.2 First panel (Volume): a new accordion replaces the bare panel

Today, `AudioSettingSection.tsx` self-wraps in a bare `DirectionalPanel` (`ROBOT_OUTPUT_PANEL_SCHEMA`, humanLabel `'Output'`) with **no accordion** — the one Robot Options section that doesn't get the Melody/Envelope/Source treatment. This phase gives it one: a new `VOLUME_ACCORDION_SCHEMA` (`humanLabel: 'Volume'`, `loreLabel: 'Probe Acoustic Amplitude'`) becomes the outer wrapper, and `ROBOT_OUTPUT_PANEL_SCHEMA` is removed — no separate inner label duplicating the accordion's own.

Inside, the layout changes shape too: today, `AudioSettingSection` renders through `LfoTargetGroup` (the shared wrapper component), which always stacks `[sliders-panel, Lfo display]` vertically in one wrapper — there is no existing way to put the sliders and the Lfo display side by side. Since the confirmed intent needs exactly that (Audio Setting + Volume in one column, the Lfo display in a second column, side by side on desktop, all stacked in one column on mobile/tablet), this phase makes `AudioSettingSection` call `useLfoTargetGroup` (the hook) **directly** instead of rendering `<LfoTargetGroup>` (the wrapper component), and hand-composes the split — the exact same escape hatch `AudioRigLfoGroup` (`AudioRigDrawer.tsx`) already uses for its own custom composition needs. **No change to `LfoTargetGroup`/`useLfoTargetGroup`'s own shared contract.**

New structure:

```tsx
// AudioSettingSection.tsx — shape, not final code
<AccordionContainer schema={VOLUME_ACCORDION_SCHEMA}>
  <DirectionalPanel schema={VOLUME_ROW_PANEL_SCHEMA}>          {/* 'responsive', unlabeled, top-level (gets a facade) */}
    <DirectionalPanel schema={VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA}> {/* fixed 'column', unlabeled, nested */}
      <div className="audio-setting-section__row">
        <RadioButton schema={AUDIO_SETTING_SCHEMA} .../>
      </div>
      <div className={withActiveClass('audio-setting-section__row sc-lfo-target-group__row', isTargeted('volume'))}
           onClick={() => select('volume')} onFocus={() => select('volume')}>
        <SliderLinear schema={VOLUME_SCHEMA} .../>
      </div>
    </DirectionalPanel>
    <div className={withActiveClass('sc-lfo-target-group__display', transitioning)}>
      <Lfo schema={{ id: 'robotOptions.volume.lfo', type: 'lfo', humanLabel: displayLabel }} value={displayValue} onChange={...} disabled={disabled || transitioning} />
    </div>
  </DirectionalPanel>
</AccordionContainer>
```

`useLfoTargetGroup({ groupId: 'robotOptions.volume', fields: [{ field: 'volume', label: VOLUME_SCHEMA.humanLabel!, lfoValue: value.volumeLfo }] })` replaces the current `<LfoTargetGroup groupId="robotOptions.volume" fields={[...]} renderField={...} />` call — same `groupId`, same single-field `fields` array, so `useLfoTargetGroup`'s own internal state (`selected`, `transitioning`, `displayValue`, `displayLabel`) behaves identically; only the JSX composing it changes. `select`/`isTargeted`/`onLfoChange`'s call shape (`(v) => onVolumeLfoChange(v)`, since `selected` is always `'volume'` here — the only field) mirrors `AudioSettingSection`'s existing `renderField` callback exactly.

`VOLUME_ROW_PANEL_SCHEMA` is `'responsive'`: `'column'` on mobile/tablet (Audio Setting → Volume → Lfo display, in DOM order, one stack) and `'row'` on desktop (left = the settings column, right = the Lfo display — each an equal-share flex child via `DirectionalPanel.css`'s own default, no custom split needed, same reasoning the Audio Rig phase's own EQ-split correction established). `VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA` stays fixed `'column'` regardless of tier — it's always a 2-row stack, whether it's alone in mobile's single column or sitting beside the Lfo display on desktop.

### 1.3 "Off" → "Auto"

`AUDIO_SETTING_SCHEMA`'s `{ value: 'none', label: 'Off' }` option becomes `{ value: 'none', label: 'Auto' }` — display text only. The stored value (`'none'`), every `robotOptionsActions` call, and `Robot['audioMode']`'s own type are all unchanged.

### 1.4 Melody and Envelope: reusing the `'responsive'` mechanism verbatim

- `RHYTHM_PANEL_SCHEMA` (nested inside `PHRASING_PANEL_SCHEMA`, wraps Density/Motif Length/Pitch Repeat): `orientation: 'row'` → `'responsive'`. `PHRASING_PANEL_SCHEMA` itself (the outer column also holding the dev-only Click Track toggle and Reset Melody) is untouched — still fixed `'column'`.
- `FREQUENCY_PANEL_SCHEMA` (Octave Min/Max, Note Variance): `orientation: 'row'` → `'responsive'`.
- `PING_CONTOUR_PANEL_SCHEMA` (today: one row of 4 sliders — Attack, Decay, Sustain, Release) becomes a fixed `'column'` wrapper around 2 new, unlabeled, inline `'responsive'` sub-row panels — Attack+Decay, then Sustain+Release — mirroring Audio Rig's Compressor pairing (`Threshold+Ratio`/`Attack+Release`) exactly, including where those sub-schemas live: **inline anonymous objects in `PingContourDrawer.tsx`**, not new exported consts in `robotOptionsConfig.ts` (same "unlabeled, pure layout, drawer-local" precedent Compressor's `topRow`/`bottomRow` already set).

```tsx
// PingContourDrawer.tsx — shape, not final code
<AccordionContainer schema={ENVELOPE_ACCORDION_SCHEMA}>
  <DirectionalPanel schema={PING_CONTOUR_PANEL_SCHEMA}>       {/* now 'column' */}
    <DirectionalPanel schema={{ id: 'robotOptions.pingContour.topRow', type: 'directionalPanel', orientation: 'responsive' }}>
      <SliderLog schema={ATTACK_SCHEMA} .../>
      <SliderLog schema={DECAY_SCHEMA} .../>
    </DirectionalPanel>
    <DirectionalPanel schema={{ id: 'robotOptions.pingContour.bottomRow', type: 'directionalPanel', orientation: 'responsive' }}>
      <SliderLinear schema={SUSTAIN_SCHEMA} .../>
      <SliderLog schema={RELEASE_SCHEMA} .../>
    </DirectionalPanel>
  </DirectionalPanel>
</AccordionContainer>
```

`PING_CONTOUR_PANEL_SCHEMA`'s own `loreLabel`/`humanLabel` (`'PING CONTOUR'`/`'Ping Contour'`) stay exactly as they are — only its `orientation` and its role (wrapping 2 sub-panels instead of 4 sliders directly) change.

### 1.5 Source: a real rendering bug, not a layout change

`RobotDriftPanel` (rendered last in `SignatureArrayDrawer.tsx`, after Baseline/Coaxial/Harmonic) is confirmed broken: its 2 `SliderCenteredZero` controls (Rate Drift, Depth Drift) render nothing visible — only the panel's own outer box/label shows. **Confirmed during the interview, reproduced by Crawford directly, not yet reproduced in this session** (no browser access here). The schema is already correct — `ROBOTS_DRIFT_GROUP.rateSchema`/`.depthSchema` are fixed `'horizontal'` (since `AUDIO_RIG_RESPONSIVE_LAYOUT.md` Task 4, which this component's data comes from — `LFO_DRIFT_GROUPS` lives in `audioRigConfig.ts`, shared with Audio Rig's own Robot Drift entry), `ROBOTS_DRIFT_GROUP.panel.orientation` is fixed `'column'`, and `SignatureArrayDrawer.test.tsx` already asserts (and passes, in jsdom) that the Rate Drift slider renders with the correct `aria-valuenow`. This strongly suggests a **real-browser-only** bug — the same category several `CabinetBox`/`VoxelTrack` fixes have already addressed, none of which jsdom's lack of real layout can reproduce (see `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md`'s own resize-flicker history for precedent). No hypothesis is confirmed as of this spec — §7 below covers the investigation plan and the live-reproduction dependency this one item has that nothing else in this phase does.

### 1.6 Slider orientation: fixed, no tier variation

| Sliders | File | Was | Becomes |
|---|---|---|---|
| Density, Motif Length, Pitch Repeat | `robotOptionsConfig.ts` | `'auto'` | `'horizontal'` |
| Octave Range Min, Octave Range Max, Note Variance | `robotOptionsConfig.ts` | `'auto'` | `'horizontal'` |
| Attack, Decay, Sustain, Release | `robotOptionsConfig.ts` | `'auto'` | `'horizontal'` |

Volume (already `'horizontal'`) and Signature Array's Gain/Detune/Phase/Interval (already `'vertical'`) are untouched — not in scope.

### 1.7 Propagation to the company/broadcast panel is free

`CompanyOptionsSection.tsx` renders `AudioSettingSection`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer` with **zero JSX difference** from `RobotOptionsTab.tsx` (confirmed in `docs/specs/DIRECTIONAL_PANEL_WIRING.md` §1.2 and unchanged since). Every change in this phase reaches the company/broadcast bulk-edit panel automatically — no task in this phase touches `CompanyOptionsSection.tsx` directly, and none should.

---

## 2. Target File Structure

```text
src/
├── data/
│   ├── robotOptionsConfig.ts       # MODIFIED — see §4.1
│   └── robotOptionsConfig.test.ts  # MODIFIED — see §5
└── components/robot/
    ├── AudioSettingSection.tsx       # MODIFIED — see §1.2, §4.2
    ├── AudioSettingSection.css       # MODIFIED, if new row/column classes need rules — verify during implementation
    ├── AudioSettingSection.test.tsx  # MODIFIED — see §5
    ├── PingContourDrawer.tsx         # MODIFIED — see §1.4, §4.3
    ├── PingContourDrawer.test.tsx    # MODIFIED — see §5
    ├── SignatureArrayDrawer.tsx      # MODIFIED — see §1.5 (bug fix only, mechanism TBD — §7)
    └── SignatureArrayDrawer.test.tsx # MODIFIED, once the bug fix's own regression test is known — §7
```

**Explicitly not touched, and why:**

- `PingControlsDrawer.tsx` — `RHYTHM_PANEL_SCHEMA`/`FREQUENCY_PANEL_SCHEMA`'s orientation values change in `robotOptionsConfig.ts` only; both are already rendered via existing `<DirectionalPanel schema={...}>` calls this component already makes, so no JSX change is needed here at all.
- `CompanyOptionsSection.tsx`/`.test.tsx` — no JSX change (§1.7); its test file only needs a look if it happens to assert internal DOM shape of a child component directly (verify during implementation, same caution `DIRECTIONAL_PANEL_WIRING.md` flagged for the same file).
- `useResponsivePanelOrientation.ts`, `useCabinetBoxHeight.ts`, `DirectionalPanel.tsx`, `types/controls.ts` — the `'responsive'` mechanism itself is unmodified; this phase only consumes it.
- `SIGNATURE_ARRAY_CONFIG`'s own layer schemas (Gain/Detune/Phase/Interval, already `'vertical'`) and each layer's own `panel` (already `'row'`) — untouched.
- `src/engine/`, `src/stores/`, `src/systems/robotOptionsActions.ts` — no behavior, state-shape, or wiring change beyond the Robot Drift bug fix itself (§1.5), which touches rendering, not action/store logic.

No new dependency.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No behavior change beyond layout/orientation and the one confirmed bug fix.** Every slider's min/max/step/unit, every handler, every `robotOptionsActions` call stays exactly as-is.
* **No new `'responsive'` mechanism, no changes to `useResponsivePanelOrientation`/`useCabinetTier`/`DirectionalPanel.tsx`.** This phase is a pure consumer of infrastructure `AUDIO_RIG_RESPONSIVE_LAYOUT.md` already built and verified.
* **`LfoTargetGroup`/`useLfoTargetGroup`'s shared contract does not change.** `AudioSettingSection`'s two-column need is met entirely by calling the hook directly and hand-composing JSX, the same way `AudioRigLfoGroup` already does — do not add a new prop (e.g. an orientation/layout option) to the shared `LfoTargetGroup` wrapper component to serve this one caller.
* **The Robot Drift bug fix (§1.5) is scoped to making the existing 2 sliders visible and correctly laid out — nothing more.** Do not use this bug fix as an opportunity to redesign `RobotDriftPanel`, give it a "real" LFO widget (Shape/Rate/Depth) it was never meant to have, or otherwise expand its scope beyond "the 2 drift sliders that are supposed to be there, actually render."
* **This bug fix cannot be verified by this session alone.** Per §7, root cause is unconfirmed and plausibly a real-browser-only layout issue jsdom cannot reproduce — the fix task's own verification requires Crawford's live confirmation in the running app, not just a passing test suite. Do not mark this task done on green tests alone.
* **Signature Array's layer sliders/panels are untouched** — confirmed already correct, not part of this phase's file list.
* **CLAUDE.md's audio/animation rules are not implicated.** No `Tone` synth, no `AudioEngine` call, no new GSAP timeline, no `setTimeout`/`setInterval`/`requestAnimationFrame`.

---

## 4. Code Style & Architecture Conventions

### 4.1 `src/data/robotOptionsConfig.ts`

This file's existing style is literal exported `const` schema objects (no helper functions, per `DIRECTIONAL_PANEL_WIRING.md` §4.2's own observation) — new schemas follow that same convention:

- **Remove** `ROBOT_OUTPUT_PANEL_SCHEMA` — fully superseded by the 3 new consts below.
- **Add** `VOLUME_ACCORDION_SCHEMA: AccordionSchema` (`id: 'robotOptions.volumeAccordion'` — distinct from `VOLUME_SCHEMA`'s own `id: 'robotOptions.volume'`, avoiding a collision; `type: 'accordion'`, `humanLabel: 'Volume'`, `loreLabel: 'Probe Acoustic Amplitude'`).
- **Add** `VOLUME_ROW_PANEL_SCHEMA: DirectionalPanelSchema` (`id: 'robotOptions.volumeRow'`, `type: 'directionalPanel'`, `orientation: 'responsive'`, unlabeled).
- **Add** `VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA: DirectionalPanelSchema` (`id: 'robotOptions.volumeSettingsColumn'`, `type: 'directionalPanel'`, `orientation: 'column'`, unlabeled).
- **`AUDIO_SETTING_SCHEMA`**: change the `{ value: 'none', label: 'Off' }` options-array entry to `{ value: 'none', label: 'Auto' }`. No other entry changes.
- **`RHYTHM_PANEL_SCHEMA.orientation`**: `'row'` → `'responsive'`.
- **`FREQUENCY_PANEL_SCHEMA.orientation`**: `'row'` → `'responsive'`.
- **`PING_CONTOUR_PANEL_SCHEMA.orientation`**: `'row'` → `'column'`. `loreLabel`/`humanLabel` unchanged.
- **`DENSITY_SCHEMA`, `MOTIF_LENGTH_SCHEMA`, `PITCH_REPEAT_SCHEMA`, `OCTAVE_RANGE_MIN_SCHEMA`, `OCTAVE_RANGE_MAX_SCHEMA`, `NOTE_VARIANCE_SCHEMA`, `ATTACK_SCHEMA`, `DECAY_SCHEMA`, `SUSTAIN_SCHEMA`, `RELEASE_SCHEMA`**: `orientation: 'auto'` → `orientation: 'horizontal'`, each in place.

### 4.2 `src/components/robot/AudioSettingSection.tsx`

Per §1.2 — import `useLfoTargetGroup` (the hook, from `@/components/ui/controls/useLfoTargetGroup`) and `withActiveClass` (from `@/components/ui/controls/activeClass`) instead of the `LfoTargetGroup` component; import `AccordionContainer`; import the 3 new schema consts (§4.1) in place of `ROBOT_OUTPUT_PANEL_SCHEMA`. `AudioSettingSectionProps` is unchanged — no new prop, matching every other component this phase touches.

### 4.3 `src/components/robot/PingContourDrawer.tsx`

Per §1.4 — the 2 new sub-row schemas are inline object literals at their call sites (matching `AudioRigDrawer.tsx`'s own Compressor `topRow`/`bottomRow` style exactly), not new `robotOptionsConfig.ts` exports. `PingContourDrawerProps` is unchanged.

### 4.4 Naming conventions

- New `AccordionSchema`/`DirectionalPanelSchema` constants: `SCREAMING_SNAKE_CASE` ending in `_ACCORDION_SCHEMA`/`_PANEL_SCHEMA`, matching every existing schema constant in `robotOptionsConfig.ts` exactly.
- Schema `id`s: `robotOptions.<camelCaseId>` prefix, matching every existing id in this file.
- **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library, colocated test files.
* **`robotOptionsConfig.test.ts`:**
  - Delete the `ROBOT_OUTPUT_PANEL_SCHEMA (Task 3)` describe block; add one for `VOLUME_ACCORDION_SCHEMA`/`VOLUME_ROW_PANEL_SCHEMA`/`VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA` (shape, labels, `'responsive'`/`'column'` orientation, unique ids, JSON-serializable).
  - Update `'Audio Setting has all 4 options, including Off'` — the test's own values-only assertion (`.map((o) => o.value)`) is unaffected by the label change, but rename the test description since "including Off" is no longer accurate; add a new assertion that the `'none'` option's `label` is `'Auto'`.
  - Rewrite `'Ping Controls (...) is auto'` to assert `'horizontal'` for all 6 schemas; rewrite `'Ping Contour (...) is auto'` to assert `'horizontal'` for all 4 ADSR schemas.
  - Update `PHRASING_PANEL_SCHEMA / FREQUENCY_PANEL_SCHEMA (Task 3)` describe block's `FREQUENCY_PANEL_SCHEMA` assertion to `orientation: 'responsive'`; add a new describe block for `RHYTHM_PANEL_SCHEMA` (no prior coverage existed — confirmed via direct search) asserting `orientation: 'responsive'`, correct labels, and non-collision with `PHRASING_PANEL_SCHEMA`'s id.
  - Update `PING_CONTOUR_PANEL_SCHEMA (...)` describe block: `orientation` assertion becomes `'column'`; `loreLabel`/`humanLabel` assertions unchanged.
* **`AudioSettingSection.test.tsx`:**
  - `'Off', 'Mute', 'Solo', 'Highlight'` → `'Auto', 'Mute', 'Solo', 'Highlight'` in the first test's label list.
  - Invert `'renders Volume as a bare slider... no AccordionContainer wrapping it'`: rename and rewrite to assert exactly one `.sc-accordion` exists, with humanLabel `'Volume'`.
  - Rewrite the `DirectionalPanel wrapper` describe block: `'the panel carries the Output label'` → asserts `'Volume'` is the *accordion's* label (not a panel's); add assertions for the 2-column desktop structure (settings-column panel contains Audio Setting radio + Volume row; Lfo display is a sibling, not nested inside the settings column) and for `data-orientation` resolving `'column'` at mobile/tablet, `'row'` at desktop (stub `matchMedia` per `AudioRigDrawer.test.tsx`'s own established stub pattern).
  - Every other existing test (Volume percent conversion, LFO rate/depth behavior, disabled-state propagation) should need no behavior change — regression-check them, don't assume.
* **`PingContourDrawer.test.tsx`:** add assertions (stubbing `matchMedia`) that Attack+Decay share a row and Sustain+Release share a row at desktop, and each stacks to its own row at mobile/tablet; verify existing Attack/Decay/Sustain/Release value-conversion and disabled-state tests are unaffected.
* **`robotOptionsConfig.test.ts` / `PingControlsDrawer.test.tsx`:** no new test file needed for `RHYTHM_PANEL_SCHEMA`'s *rendered* orientation (only its schema-level assertion, above) unless a DOM-level check is judged worth adding during implementation — `PingControlsDrawer.tsx`'s own JSX doesn't change, so its existing tests should keep passing unmodified; confirm rather than assume.
* **Source / `SignatureArrayDrawer.test.tsx`:** cannot be written until the bug's root cause and fix are known (§7) — this task's own test-first step is "write a test that reproduces the bug," which may require a browser-level check (Chrome DevTools MCP, if available, or Crawford's own live report) rather than a jsdom unit test, if the root cause turns out to be genuinely unreproducible in jsdom.
* **Verification Steps** (re-run in full after every task):
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (required, and — uniquely for the Source task — a precondition, not just a final confirmation):** Open Robot Options for a single robot and the company/broadcast panel (`npm run dev`). Confirm: Volume renders as its own accordion, 2 columns on desktop / 1 stacked column on mobile-and-tablet-width, "Auto" replacing "Off"; Melody's and Envelope's row-groups behave per §1.4 across the same 3 widths; Robot Drift's 2 sliders are actually visible and interactive at the bottom of Source, in both robot and company mode.

---

## 6. Documentation & Git/Workflow Context

* **`docs/specs/VERTICAL_SLIDERS.md`:** the classification table's `robotOptionsConfig.ts` rows (Density/Motif Length/Pitch Repeat/Octave Range/Note Variance, Attack/Decay/Sustain/Release, all listed `'auto'`) are now stale — add a short amendment note pointing at this spec, same treatment `AUDIO_RIG_RESPONSIVE_LAYOUT.md` already gave that table's `audioRigConfig.ts` rows. Leave the historical table itself as-is.
* **`docs/COMPONENT_LIBRARY.md`:** no change expected — the "Panel orientation" subsection already documents `'responsive'` generically (added by the Audio Rig phase); this phase adds no new literal or contract.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** Not yet opened as of this spec — suggest continuing on `layout/updates` if still active from the Audio Rig session, or a new `layout/robot-options-responsive` branch.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences, one task per commit, matching the Audio Rig phase's own precedent exactly.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed against the intent doc, not left open):

- ~~Does this introduce a new panel-orientation mechanism?~~ **Resolved: no — reuses `'responsive'`/`useResponsivePanelOrientation` verbatim.**
- ~~How does the Volume 2-column split get built, given `LfoTargetGroup` has no side-by-side mode?~~ **Resolved: `AudioSettingSection` calls `useLfoTargetGroup` directly and hand-composes the split, mirroring `AudioRigLfoGroup`'s existing escape hatch — no change to the shared component.**
- ~~Does "Off" → "Auto" change the stored value?~~ **Resolved: no — display label only.**
- ~~Where do Envelope's 2 new sub-row schemas live?~~ **Resolved: inline in `PingContourDrawer.tsx`, matching Compressor's `topRow`/`bottomRow` precedent — not new `robotOptionsConfig.ts` exports.**
- ~~Does this phase touch `CompanyOptionsSection.tsx`?~~ **Resolved: no — propagation is automatic via shared components (§1.7).**

Still open — **this section is load-bearing for this spec, not a formality**, because one item genuinely cannot be resolved by reading code alone:

1. **The Robot Drift rendering bug's root cause is unknown.** Working hypotheses, none confirmed: (a) a real-browser-only `ResizeObserver`/layout-timing issue in the voxel-track box-count-fitting path, the same class of bug `CabinetBox`'s own resize-flicker history already shows can hide behind passing jsdom tests; (b) something specific to `RobotDriftPanel` being a standalone function component rendered once (not via `.map()`) relative to its sibling layer panels — no concrete mechanism identified for why this would matter, flagged as a shape difference worth checking, not a confirmed lead; (c) a duplicate-mount scenario if `RobotOptionsTab` and `CompanyOptionsSection` (or 2 instances of the latter) both mount `SignatureArrayDrawer` — and therefore 2 `RobotDriftPanel`s sharing the exact same `audioRig.lfoDrift.robots`-derived `timelineMap`/facade key — simultaneously; not confirmed, but checkable by searching for any place both drawers might render concurrently rather than exclusively. **This task should start with `debugging-and-error-recovery`'s reproduce-first discipline**, not a guessed fix — if this session cannot reproduce it (no browser access), the task is blocked on Crawford running the dev server and reporting back (console errors, a screenshot, or confirming/ruling out one of the 3 hypotheses above) before a fix is attempted.
2. **Whether `AudioSettingSection.css`/`PingContourDrawer.css` need new rules** for the new row/column wrapper divs — likely no (every prior phase's equivalent wrappers needed none, relying on `DirectionalPanel.css`'s own defaults), but not confirmed until the JSX is real.
3. **Whether `CompanyOptionsSection.test.tsx` has any assertion reaching into these 3 components' internal DOM shape** — the same caution `DIRECTIONAL_PANEL_WIRING.md`'s own Task 10 flagged for this exact file — check directly during implementation, don't assume "no JSX change" means "no test change."
