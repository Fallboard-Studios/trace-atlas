# Phase Spec: Oblique Cabinetry — RadioButton (Roadmap Phase 11.1.6)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/oblique-cabinetry-radio-button.md](../intent/oblique-cabinetry-radio-button.md) (confirmed via `/interview-me`, 2026-09-10). Source of scope: [docs/todo/roadmap.md § 11.1.6](../todo/roadmap.md#1116-oblique-cabinetry-radiobutton) — the fourth consumer of the shared mechanism [11.1.1](OBLIQUE_CABINETRY_FOUNDATION.md) built, and the first with more than one `CabinetBox` per control. Prior art this spec follows directly: `CabinetBox.tsx`/`.css`, `cabinetGeometry.ts`, `cabinetAnimation.ts`, `useCabinetBoxHeight.ts` (all reused unmodified — no new prop, no new export); `Button.css`'s accent-tint-on-text-bearing-front-face precedent (§1.4 below); `Toggle.tsx`'s value-keyed (not momentary) `popped` precedent (§1.1); `VoxelTrack.tsx`'s array-of-`CabinetBox`-instances rendering shape (§1.1), reused for structure only — RadioButton does **not** touch `VoxelTrack.tsx`, `voxelTrackMath.ts`, or `useVoxelTrackSlider` themselves, and needs none of the dual-fill/extrusion-falloff/straddle-box math those files implement. This phase touches presentation only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; `RadioButtonSchema`/`ControlSchema` are unchanged.

---

## 1. Overview & Claude Explanation

The intent doc resolves every product-level question already (in scope: every real `RadioButton` consumer including `CompanyButtonRow`; content-sized boxes; breakpoint-driven height; selected-only accent tint; gapped independent boxes replacing the bordered pill; wrap-on-overflow). Five implementation-shape questions remain, resolved below with real code rather than left to Tasks.

### 1.1 Structural placement: one `CabinetBox` per `ToggleGroup.Item`, `popped` derived from `value` directly

Same split as `Button`/`Toggle`: the real interactive elements (`ToggleGroup.Root`/`ToggleGroup.Item`) keep 100% of the interaction — role, keyboard (Radix's own roving-tabindex/arrow-key handling), `aria-checked`, disabled state, focus ring, the existing deselect-to-empty guard — and `CabinetBox` is a `pointer-events: none`-walled visual child of each `Item`, never a hit target of its own. This generalizes 11.1.2's value-keyed `popped` (Toggle's `popped={value}`, a single boolean) to N booleans, one per option, each derived the same way — `popped` for option `i` is `option.value === value`, computed directly from the component's own `value` prop, not read back from Radix's `data-state`:

```tsx
{schema.options.map((option) => (
  <ToggleGroup.Item key={option.value} className="sc-radio-button__item" value={option.value} aria-label={option.label}>
    <CabinetBox
      popped={option.value === value}
      timelineKey={`cabinet-radio-${schema.id}-${option.value}`}
    >
      {option.label}
    </CabinetBox>
  </ToggleGroup.Item>
))}
```

`option.label` moves from being `ToggleGroup.Item`'s own direct text content to being `CabinetBox`'s `children` — the same relationship `Button.tsx` already has with its own nested `DualLabel` (real content, rendered inside the box, not the bare/textless shape `Toggle` uses). No `boxHeight`, `frontWidth`, `popDistance`, or `skipMountAnimation` override is passed to any instance — see §1.2/§1.3/§1.5 for why each of those defaults is exactly what's wanted here, not an oversight.

### 1.2 Box height: the `useCabinetBoxHeight()` default, not an override — same reasoning as `Button`, opposite of `Toggle`

Confirmed intent: breakpoint-driven (32/40/48px), matching `Button`'s content-bearing-box-in-normal-flow precedent rather than `Toggle`'s fixed-32px-inline-control precedent. Concretely, this needs **no code at all** beyond omitting the `boxHeight` prop — `CabinetBox` already resolves `useCabinetBoxHeight()` internally whenever no override is supplied (11.1.1 §1.2, unchanged), which is exactly `Button.tsx`'s own call shape today. `RadioButton.tsx` does not need to call `useCabinetBoxHeight()` itself.

### 1.3 Box width: content-sized via `CabinetBox`'s own `ResizeObserver`, no CSS override needed — front-face padding is already `Button`'s own default

Confirmed intent: content-sized, like `Button`. This also needs **no new CSS** — `CabinetBox.css`'s own `.sc-cabinet-box__front` default (`display: inline-flex; padding: 0 14px; height: var(--cabinet-box-height)`, §1.2's resolved height feeding that custom property) is already the exact "size to content, height from the breakpoint tier" shape both `RadioButton` and `Button` want, and neither `Button.css` nor (per this spec) `RadioButton.css` needs to add a width/height override the way `Toggle.css` does (11.1.2 §1.2, scoped specifically to force a fixed 32×32px square against that same default). `RadioButton.css` only adds the accent-tint override below (§1.4) — no sizing rule.

### 1.4 Front-face tint: accent only when selected, via `[data-state='on']` — not `Button.css`'s unconditional class-scoped override

Confirmed intent: only the selected option's front face is accent-tinted; every unselected option stays on `CabinetBox.css`'s own `--color-surface` default. `Button.css`'s existing pattern (`.sc-button .sc-cabinet-box__front { background-color: var(--color-accent); }`, unconditional on the class) cannot be reused as-is here — it would accent-tint every option regardless of selection, defeating the point of a second cue distinct from pop/glow (confirmed intent's own rationale). Radix's `ToggleGroup.Item` already stamps `data-state="on"`/`"off"` on the real DOM element (today's `RadioButton.css` already keys off this same attribute for its now-superseded pill-segment coloring), so the override is a compound selector rather than a class-only one:

```css
.sc-radio-button__item[data-state='on'] .sc-cabinet-box__front {
  background-color: var(--color-accent);
}
```

This is additive to `CabinetBox.css`'s own default rule, not a duplicate of it — unselected items simply never match the selector and keep the shared `--color-surface` default untouched.

### 1.5 Row layout: gapped independent boxes, wrap on overflow, no `zIndex` needed — reusing `useVoxelTrackGap()` as-is, not renaming it

Confirmed intent: drop today's single bordered/rounded pill container (`RadioButton.css`'s `border`/`border-radius`/`overflow: hidden` on `.sc-radio-button__root`, `border-right` dividers between items) for independently-spaced boxes with real gaps, wrapping to a new line rather than scrolling when a row overflows its container — the shape `CompanyButtonRow`'s longer, user-generated lists actually need.

**Gap size:** reuses `useVoxelTrackGap()` (`useCabinetBoxHeight.ts`) directly — the same 8/10/12px breakpoint-tier values `VoxelTrack` (11.1.3) already resolves via the same shared `useCabinetTier()` detection `useCabinetBoxHeight()` itself uses. This is a genuine, if oddly-named, fit: the hook returns "the current tier's cabinet gap," a value this item needs exactly as much as a slider does. **Not renamed** to something more RadioButton-neutral (e.g. `useCabinetGap()`) — doing so would touch `SliderLinear.tsx`/`SliderLog.tsx`/`SliderCenteredZero.tsx`'s already-shipped, stable call sites (roadmap 11.1.5's own closing note: "`VoxelTrack.tsx`/`voxelTrackMath.ts`/`useVoxelTrackSlider` ... should be treated as stable, closed infrastructure going forward") for a cosmetic rename with no behavioral upside. A one-line comment at the `RadioButton.tsx` call site notes the reuse explicitly instead:

```tsx
// Reuses the same breakpoint-tier gap VoxelTrack (11.1.3) uses between its
// own boxes — not renamed to something RadioButton-neutral; see
// docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md §1.5 for why.
const gap = useVoxelTrackGap();
```

**No `zIndex` override, unlike `VoxelTrack`:** `VoxelTrack`'s boxes need `computeVoxelBoxZIndex` because they're packed edge-to-edge (no gap in the pop-bleed direction) at a deep `VOXEL_TRACK_POP_DISTANCE` (8px), so a popped box's wall genuinely bleeds into its downstream neighbor's own footprint. `RadioButton` uses the *default* `CABINET_POP_DISTANCE` (2px, `Button`/`Toggle`'s own value — no `popDistance` override passed, per §1.1) — at full pop that's a top-face wall 2px tall and a left-face wall 4px wide (`2 × CABINET_POP_DISTANCE`), i.e. at most 4px of bleed past the flat footprint in any direction. The smallest gap tier (`CABINET_VOXEL_GAP.mobile`, 8px) already exceeds that by a comfortable margin at every breakpoint (8/10/12 all `> 4`), so no popped box's walls can ever reach a neighbor's space. Confirmed by direct calculation, not by eye — no manual check needed for this specific claim, though the general glow/wall visibility is still worth a look per §5's manual check.

**Wrap:** `flex-wrap: wrap` on `.sc-radio-button__root` (full CSS in §4) — the row's own natural block width (its drawer/parent's content box) is the wrap boundary; no `ResizeObserver`, no box-counting, no self-fitting logic of any kind. This is the one deliberate asymmetry with the sliders' voxel-track (11.1.3's self-fitting `ResizeObserver`-driven box count) — confirmed intent explicitly chose this over a clamp-and-scroll fallback, since `RadioButton` has no "how many boxes fit" design question the way a fixed-size-track slider does; a wrapped second line costs nothing extra to support.

---

## 2. Target File Structure

```text
src/
└── components/ui/controls/
    ├── RadioButton.tsx                # MODIFIED — renders through CabinetBox per-option (§1.1);
    │                                  #   imports useVoxelTrackGap (§1.5)
    ├── RadioButton.css                # MODIFIED — bordered-pill/segment-divider styling replaced
    │                                  #   by gapped flex-wrap row + selected-only accent-tint rule
    └── RadioButton.test.tsx            # MODIFIED — every existing test stays unchanged and passing;
                                        #   new coverage for per-option CabinetBox wiring (§5)

src/components/company/
└── CompanyButtonRow.test.tsx           # MODIFIED — one new test verifying a long/many-company list
                                        #   (approaching MAX_COMPANIES) still renders and wraps
                                        #   correctly through the new RadioButton (§5)

docs/
└── COMPONENT_LIBRARY.md                # MODIFIED — same "internal rendering changed, contract
                                        #   didn't" note Button/Toggle/the sliders already carry,
                                        #   added to RadioButton's row (roadmap 11.1.6's own Docs
                                        #   bullet)
```

**Explicitly not touched, and why:**

- `src/components/ui/controls/CabinetBox.tsx`/`.css`, `src/utils/cabinetGeometry.ts`, `cabinetAnimation.ts`, `cabinetBreakpoints.ts`, `useCabinetBoxHeight.ts` — the shared mechanism, including `useVoxelTrackGap`, is reused exactly as 11.1.1/11.1.3 shipped it (§1.2/§1.3/§1.5). No new prop, no new export, no rename.
- `src/components/ui/controls/VoxelTrack.tsx`, `src/utils/voxelTrackMath.ts`, `useVoxelTrackSlider.ts` — not imported, not modified. `RadioButton` needs only `CabinetBox` directly and `useVoxelTrackGap` (one small piece of `useCabinetBoxHeight.ts`), never the dual-fill/extrusion-falloff/straddle-box machinery those files implement — there is no "current value," only a discrete selection.
- `Button.tsx`/`.css`/`.test.tsx`, `Toggle.tsx`/`.css`/`.test.tsx` — unaffected; nothing in this phase changes `CabinetBox`'s props or shared CSS, both of which this phase leaves untouched (§1.1–§1.4).
- `src/types/controls.ts` — `RadioButtonSchema`/`ControlSchema` are unchanged (confirmed intent; `{ value: string; label: string }[]` options shape carries everything this phase needs).
- `src/components/ui/controls/Lfo.tsx` — composes `RadioButton` for its Shape row unchanged; its own `shapeSchema`/`value`/`onChange` call site needs no edit, since `RadioButton`'s props contract doesn't change.
- `src/data/robotOptionsConfig.ts`, `src/data/audioRigConfig.ts`, `src/data/companyConfig.ts` — no schema shape changes; `AUDIO_SETTING_SCHEMA`, `DECAY_MODE_SCHEMA`, the per-layer `type` radio schemas, and `buildCompanyButtonRowSchema` all continue to produce plain `RadioButtonSchema` values.
- `src/components/company/CompanyButtonRow.tsx`/`.css` — the wrapping `<div className="company-button-row">` and its own `display: flex; flex-direction: column; gap: 0.5rem` are unaffected; only its own test file gains new coverage (§5), not its implementation.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — no new global custom property; `--cabinet-radio-gap` (§4) is `RadioButton.tsx`-local, applied as an inline style on `ToggleGroup.Root`, following `Toggle.tsx`'s own `--cabinet-toggle-box-size` precedent exactly.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`ToggleGroup.Root`/`ToggleGroup.Item` keep 100% of the actual interaction.** `CabinetBox`'s walls carry `pointer-events: none` already (11.1.1, unchanged); nothing in this phase adds a second hit-testable element per option. Do not give any wall element or the front-face `<div>` its own `onClick`/selection handling.
* **`popped` is computed per-option in `RadioButton.tsx` (`option.value === value`), never inside `CabinetBox` and never read back from Radix's own `data-state`.** `CabinetBox` itself remains opinion-free about *why* it's popped, exactly as every prior item established.
* **No timer-based animation.** This phase adds no new timing logic — it reuses `cabinetAnimation.ts`/`CabinetBox.tsx`'s existing GSAP timeline, once per option, unmodified. Do not introduce `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's files.
* **GSAP never calls `AudioEngine`.** Unchanged from every prior item — `onChange` continues to fire straight from Radix's `onValueChange`, entirely independent of any `CabinetBox`'s own GSAP timeline.
* **Every GSAP timeline is registered in `timelineMap`**, keyed uniquely per option instance — `` `cabinet-radio-${schema.id}-${option.value}` `` (§1.1), distinct from every other consumer's own prefix (`cabinet-button-`, `cabinet-toggle-`, VoxelTrack's own per-slider prefix) so a shared `schema.id` reused elsewhere in the app can never collide, and distinct *per option* so two options never share one timeline.
* **No `boxHeight`, `frontWidth`/`frontHeight`, `popDistance`, or `skipMountAnimation` override on any `CabinetBox` instance** — §1.2/§1.3/§1.5 establish why each of `CabinetBox`'s existing optional props is deliberately left at its default here, not omitted by oversight. A genuinely new option appearing (e.g. a freshly-created company in `CompanyButtonRow`) is a real first mount and deserves the ordinary pop-in flourish — do not add `skipMountAnimation` to work around it.
* **No `zIndex` override on any instance** — §1.5's calculation (4px maximum wall bleed at `CABINET_POP_DISTANCE`, vs. an 8px+ gap at every breakpoint) is the reason, not an oversight; do not reintroduce `computeVoxelBoxZIndex` or a bespoke equivalent for this phase.
* **`useVoxelTrackGap` is reused verbatim, not renamed or forked**, per §1.5 — do not rename the hook, do not duplicate its breakpoint table into a new `RADIO_BUTTON_GAP` constant, and do not touch `SliderLinear.tsx`/`SliderLog.tsx`/`SliderCenteredZero.tsx`'s own existing calls to it.
* **No new `ControlSchema` variant, no schema field addition.** `RadioButton`'s `{ schema, value, onChange, disabled }` props contract is byte-for-byte unchanged.
* **`disabled` continues to disable the whole `ToggleGroup.Root` at once — no per-item disabled**, unchanged from today; do not add per-option disabling logic.
* **The old bordered-pill/segment CSS (`.sc-radio-button__root`'s `border`/`border-radius`/`overflow: hidden`, `.sc-radio-button__item`'s `border-right`/`padding`/`font-size`/`background-color`/`color`) is deleted, not retained as dead/unused CSS.**
* **Out of scope, per the intent doc:** per-item `disabled`; any new hover/partial-pop mechanism on unselected options; changes to the deselect-to-empty guard's own behavior; exact pixel values beyond what §1.5 already resolves; `Stepper`/`StepperWithToggle` (dropped from Cabinetry entirely, per 11.1.1); `AccordionContainer`, `Select`, `TextInput`/`CoordsInput` (11.1.7–11.1.9); WorldView/terrain/sky styling, robot visuals, the power rocker switch and the rest of the Sleeve casing; 11.2's accessibility/performance verification pass.

> **Amendment, post-ship (during the Company Assignment RadioButton work, docs/specs/COMPANY_ASSIGNMENT_RADIO.md):**
> the "no hover/partial-pop mechanism on unselected options" exclusion directly above was reversed at
> Crawford's direct request ("the radio buttons should have the same hover effect as the buttons") —
> `RadioButton.tsx` now pops an option on `mouseEnter`/`mouseLeave` in addition to the selected-state pop
> this phase shipped, matching `Button`'s own hover-pop feedback. Confirmed to apply to every `RadioButton`
> consumer app-wide (no per-instance opt-out), since the primitive has no variant prop to scope it narrower.
> This paragraph amends the record rather than rewriting the historical text above, which still accurately
> describes what 11.1.6 itself shipped. See `docs/COMPONENT_LIBRARY.md`'s `RadioButton` section for the
> current, up-to-date behavior description.

---

## 4. Code Style & Architecture Conventions

**`src/components/ui/controls/RadioButton.tsx`** (full replacement):

```tsx
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import type { CSSProperties } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import { useVoxelTrackGap } from './useCabinetBoxHeight';
import type { RadioButtonSchema } from '@/types/controls';
import './RadioButton.css';

interface RadioButtonProps {
  schema: RadioButtonSchema;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Single-select control wrapping @radix-ui/react-toggle-group (type="single")
 *  — already installed elsewhere in the codebase (e.g. RobotAudioTab.tsx's
 *  Audio Mode row, pre-Phase-9), so this avoids adding a redundant
 *  @radix-ui/react-radio-group dependency for the same job. A deselect-to-empty
 *  event (Radix's single-mode ToggleGroup emits '' when the active item is
 *  clicked again) is guarded and does not call onChange. `disabled` disables
 *  the whole group at once (Radix's own `ToggleGroup.Root` prop) — there's no
 *  per-item disabled here, matching every other control primitive's single
 *  `disabled` flag.
 *
 *  Renders through CabinetBox (roadmap Phase 11.1.6) — one box per option,
 *  popped for the option matching `value`, flat for every other. Reuses
 *  Toggle's (11.1.2) value-keyed pop precedent generalized to N boxes, and
 *  Button's (11.1.1) content-sized/breakpoint-scaled box sizing — never
 *  Toggle's own fixed-32px/textless shape. Only the selected option's front
 *  face is accent-tinted (RadioButton.css, keyed off Radix's own
 *  data-state='on'); every other option stays on CabinetBox.css's
 *  --color-surface default. See docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md
 *  §1 for the full derivation, including why this is the first consumer with
 *  more than one CabinetBox per control. */
export function RadioButton({ schema, value, onChange, disabled }: RadioButtonProps) {
  // Reuses the same breakpoint-tier gap VoxelTrack (11.1.3) uses between its
  // own boxes — not renamed to something RadioButton-neutral; see
  // docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md §1.5 for why.
  const gap = useVoxelTrackGap();
  const rowTokens = { '--cabinet-radio-gap': `${gap}px` } as CSSProperties;

  return (
    <div className="sc-radio-button">
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <ToggleGroup.Root
        type="single"
        className="sc-radio-button__root"
        style={rowTokens}
        value={value}
        onValueChange={(next) => { if (next) onChange(next); }}
        aria-label={resolveAccessibleName(schema)}
        disabled={disabled}
      >
        {schema.options.map((option) => (
          <ToggleGroup.Item
            key={option.value}
            className="sc-radio-button__item"
            value={option.value}
            aria-label={option.label}
          >
            <CabinetBox
              popped={option.value === value}
              timelineKey={`cabinet-radio-${schema.id}-${option.value}`}
            >
              {option.label}
            </CabinetBox>
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
```

**`src/components/ui/controls/RadioButton.css`** (full replacement):

```css
.sc-radio-button {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Independently-spaced boxes, wrapping to a new line when the row doesn't
   fit its container — replaces the old single bordered/rounded pill
   (border/border-radius/overflow: hidden) and its border-right item
   dividers entirely. --cabinet-radio-gap is computed once in RadioButton.tsx
   from useVoxelTrackGap() and applied as an inline style, following the same
   "JS-owned value applied as inline style" pattern CabinetBox.tsx/Toggle.tsx
   already use for their own tokens. See
   docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md §1.5. */
.sc-radio-button__root {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cabinet-radio-gap, 8px);
}

/* Never larger than its own content — same reasoning as Button.css's own
   .sc-button rule (roadmap 11.1.1): pins each item's real hit-testable
   button to CabinetBox's own flat-footprint width instead of stretching to
   fill the flex row. */
.sc-radio-button__item {
  display: inline-flex;
  width: fit-content;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.sc-radio-button__item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Only the selected option's front face is accent-tinted — color reinforces
   the pop/glow as a second cue for which option is selected, distinct from
   both Button (every instance accent-tinted, regardless of state — it's a
   momentary control, not a multi-way selection) and Toggle (never
   accent-tinted, bare box). Matches today's existing [data-state='on']
   color swap this rule replaces. See
   docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md §1.4. */
.sc-radio-button__item[data-state='on'] .sc-cabinet-box__front {
  background-color: var(--color-accent);
}
```

* **Naming conventions:** `` `cabinet-radio-${schema.id}-${option.value}` `` (timelineMap key, mirroring `` `cabinet-button-${schema.id}` ``/`` `cabinet-toggle-${schema.id}` ``, extended with the per-option discriminator this consumer alone needs), `--cabinet-radio-gap` (component-scoped custom property, distinct from `CabinetBox`'s own shared `--cabinet-box-height`/`--cabinet-pop-distance` tokens and from `Toggle`'s own `--cabinet-toggle-box-size`, so none collide).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`RadioButton.test.tsx` (modified)** — every existing test in the file (8 cases: renders one item per option, marks the matching option `aria-checked`, `onChange` on selection, no `onChange` on deselect-to-empty, accessible-name fallback to `schema.id`, not-disabled-by-default, every item `data-disabled` when `disabled`, no `onChange` when disabled) stays unchanged and passing — none assert against the now-removed pill/segment markup, and `aria-label={option.label}` (unchanged) keeps every `getByRole('radio', { name: ... })` query working regardless of where the label text physically renders. New coverage, following `Button.test.tsx`'s own precedent of mocking `CabinetBox` directly:

  ```tsx
  vi.mock('./CabinetBox', () => ({
    CabinetBox: ({ popped, timelineKey, children }: { popped: boolean; timelineKey: string; children: React.ReactNode }) => (
      <div data-testid="cabinet-box" data-popped={popped} data-timeline-key={timelineKey}>{children}</div>
    ),
  }));
  ```

  1. **Renders one `CabinetBox` per option, popped only for the option matching `value`** — with `value="sine"` and the file's existing 4-option schema, assert exactly 4 elements with `data-testid="cabinet-box"`, the one inside the "SINE" item has `data-popped="true"`, and the other three have `data-popped="false"`.
  2. **Passes a distinct `timelineKey` per option, derived from `schema.id` and the option's own value** — with `schema.id: 'lfoShape'`, assert the "TRIANGLE" item's `CabinetBox` receives `data-timeline-key="cabinet-radio-lfoShape-triangle"` and the "SQUARE" item's receives `"cabinet-radio-lfoShape-square"` — distinct per option, not one shared key for the whole group.
  3. **Renders the option's label as `CabinetBox`'s own children, not as the toggle item's direct text** — assert the mocked `cabinet-box` element (not its `ToggleGroup.Item` parent) contains the text `"SINE"`.
  4. **The real (unmocked) Radix `data-state` attribute still flips with selection** — a second `describe` block or separate test file section that does **not** mock `CabinetBox` (mirrors the file's own existing unmocked tests), asserting `getByRole('radio', { name: 'SINE' }).getAttribute('data-state')` is `'on'` and `getByRole('radio', { name: 'TRIANGLE' }).getAttribute('data-state')` is `'off'` — confirms the attribute §1.4's CSS selector depends on is still present and correct after the markup change, even though the CSS rule itself isn't exercised by RTL.
* **`CompanyButtonRow.test.tsx` (modified, 1 new case)** — **"renders and wraps correctly with a long list approaching `MAX_COMPANIES`"**: build a `companies` array of 6 entries (`MAX_COMPANIES`) with at least one deliberately long generated-style name (e.g. `"Static Bloom Vanguard"`), render `CompanyButtonRow`, and assert all 8 resulting radio items (`None`, `All`, plus the 6 companies) are present via `getByRole('radio', { name: ... })` — confirms the real `buildCompanyButtonRowSchema` output renders cleanly through the new per-option `CabinetBox` shape at the shape's actual ceiling, not just the shorter/typical lists other existing tests may use. Does not assert pixel-level wrapping (jsdom performs no real layout, per every prior Cabinetry item's own testing-limitation note) — that's the manual check below.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including `Lfo.test.tsx` (unmodified, composes `RadioButton` internally for its Shape row — confirms the change doesn't break its existing coverage).
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** load the app and confirm, across at least Robot Options' Audio Setting (4 short options), a Signature Array layer's Type row (4 short options), Audio Rig's Decay Mode (2 options, no `loreLabel`), and the Companies drawer's button row (2–8 options, including a real long company name):
  1. Each option renders as its own flat or popped box — selected option popped and accent-tinted, every other option flat and surface-tinted — with visible spacing between boxes (no touching/shared-border segments remaining).
  2. Clicking an unselected option flattens the previously-selected box and pops the newly-selected one; clicking the already-selected option does nothing (no deselect).
  3. Keyboard navigation (`Tab` to the group, arrow keys between options, `Space`/`Enter` to select) still works exactly as before, and the focus ring renders clearly on both flat and popped states.
  4. In the Companies drawer specifically: with enough companies to overflow the drawer's width, the row wraps to a second line rather than scrolling or clipping; creating a new company pops its new button in with the ordinary pop-in flourish (not an instant snap); deleting a company removes its box without disturbing the pop state of any remaining one.
  5. No popped box's wall/glow visibly overlaps or reads as clipped into an adjacent box, at any breakpoint (confirms §1.5's calculated gap margin holds in the real running app, not just in the abstract).
  6. The pop/flat transition snaps instantly with "reduce motion" enabled instead of animating (inherited for free from `CabinetBox`/`cabinetAnimation.ts` — no new check needed beyond confirming it wasn't broken).

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** a short note under `RadioButton`'s row (mirroring `Button`/`Toggle`/the sliders' own notes) — its internal rendering changed (per-option cabinet box instead of a bordered pill of flat segments) while its `ControlSchema`/props contract stayed byte-for-byte identical.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/cabinetry-radio-button`, following this series' own per-item branch-per-phase convention (e.g. `feature/cabinetry-foundation`, `feature/cabinetry-centered-slider`).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `RadioButton.tsx`/`.css`/`.test.tsx` (the full consumer change); (2) `CompanyButtonRow.test.tsx`'s new long-list coverage; (3) `docs/COMPONENT_LIBRARY.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and this codebase's own prior Cabinetry items, not left open):

- ~~Structural placement — does `CabinetBox` replace `ToggleGroup.Item`'s content, or wrap the whole group?~~ **Resolved: one `CabinetBox` per `ToggleGroup.Item`, as that item's own children** (§1.1) — generalizes Toggle's single-box/value-keyed precedent to N boxes.
- ~~Box height — breakpoint-driven or fixed?~~ **Resolved: the `useCabinetBoxHeight()` default, requiring no code beyond omitting the `boxHeight` prop** (§1.2, confirmed intent) — not `Toggle`'s fixed-32px override.
- ~~Box width — content-sized how, exactly?~~ **Resolved: `CabinetBox`'s own existing `ResizeObserver`/default front-face padding, no new CSS rule** (§1.3, confirmed intent) — `Button.css` and `RadioButton.css` both rely on the same unmodified `CabinetBox.css` default.
- ~~Front-face tint — all boxes or selected-only?~~ **Resolved: selected-only, via a `[data-state='on']` compound selector, not `Button.css`'s unconditional class-scoped rule** (§1.4, confirmed intent).
- ~~Row layout — shared bordered container or independent gapped boxes? Scroll or wrap on overflow? Exact gap value? `zIndex` needed?~~ **All resolved in §1.5** (confirmed intent for the gapped/wrap decisions; the exact gap value and the no-`zIndex` conclusion resolved here by direct calculation against `CABINET_POP_DISTANCE`): reuse `useVoxelTrackGap()` verbatim (8/10/12px), `flex-wrap: wrap`, no `zIndex` override — the smallest gap tier (8px) exceeds the largest possible wall bleed (4px) at every breakpoint.

Resolved by direct reasoning during Specify — flagged explicitly since neither the roadmap draft nor the interview asked this one directly, not silently assumed:

1. **Should `useVoxelTrackGap` be renamed to something RadioButton-neutral, since RadioButton isn't a voxel track?** **Resolved: no — reused verbatim** (§1.5). Reasoning: a rename would touch three already-shipped, stable slider files for a purely cosmetic improvement, working against this series' own stated intent (11.1.5's closing note) to treat that trio as closed infrastructure. Flagged here so a future reviewer sees this was a deliberate call, not a missed cleanup — if the name reads badly enough in practice to bother a future contributor, that's a fine reason to revisit it as its own small follow-up, not a reason to fold into this phase's diff.

No risks carried forward from 11.1.1/11.1.2 apply here in a new way — this phase reuses `cabinetGeometry.ts`/`cabinetAnimation.ts`/`useCabinetBoxHeight.ts`/`CabinetBox.tsx`'s core mechanism entirely unmodified, so none of those items' own now-resolved risks reopen here.

**Forward note for 11.1.7–11.1.9:** `AccordionContainer` (11.1.7) and `Select` (11.1.8) are both single-box, state-keyed consumers (open/closed) much closer in shape to `Toggle` than to this item — this phase's "more than one box per control" pattern likely isn't directly relevant to either. `TextInput`/`CoordsInput` (11.1.9) has no discrete option set at all and was already flagged in its own roadmap section as needing its own pop-trigger design; nothing here resolves that question for it.

**Forward note for 11.2 (accessibility/performance verification):** `Lfo.tsx` composes a 4-option `RadioButton` for every LFO-bearing target in the app (per-robot and global) — with the "70–100+ primaries in a typical session" figure the LFO Drift spec already documents, this phase's own contribution to on-screen `CabinetBox`/GSAP-timeline count could be substantial (up to 4× the number of `Lfo` instances, on top of every other primitive already carrying its own timeline). Nothing in this phase changes that arithmetic — it's flagged here only so 11.2's own performance pass doesn't discover the `RadioButton`-driven share of that total as a surprise.
