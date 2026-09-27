# Phase Spec: Architecture & Components (Roadmap Phase 1)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/architecture-and-components.md](../intent/architecture-and-components.md) (confirmed via `/interview-me`). Source of scope: [docs/todo/roadmap.md § 1](../todo/roadmap.md#1-architecture--components). Source of target field data: [docs/reference/ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md) (component-to-field mapping, bounds, lore/human label pairs — the authoritative source for every schema variant below). Downstream consumers whose language this spec borrows: roadmap Phase 5's About (TextInput/CoordsInput/Button/DualLabel usage in Sector Settings) and Phase 9's Create list (robotOptionsConfig.ts drawers).

---

## 1. Overview & Claude Explanation

This phase establishes the type-safe Design System and Data Engine that every later drawer phase (Audio Rig, Sector Settings, Robot Options) builds on, with zero domain wiring yet. We are creating `src/types/controls.ts` to define `ControlSchema` as a discriminated union — one variant per primitive, each carrying shared `id`/`loreLabel`/`humanLabel` fields (mirroring `ROBOT_DATA_GRID.md`'s English Label/Lore Label columns, both optional — a schema entry may supply neither, either, or both) plus type-specific bounds — and building all 13 stateless primitives in `src/components/ui/controls/`, each accepting a schema plus a controlled `value`/`onChange` pair and containing zero hardcoded labels or domain logic. `DualLabel` is not just one of the 13 standalone primitives (used display-only for rows like Robot Name/Job Data/Battery Data/Docked Status) — every other primitive composes `DualLabel` internally for its own label rendering, sourced directly from that same primitive's own schema entry's `loreLabel`/`humanLabel` fields, never from a separate `DualLabelSchema` entry. `DualLabel` itself renders whatever subset of the pair is present — 0, 1, or 2 labels — so a schema entry that omits one or both still renders correctly. Components compose where the grid implies reuse: `StepperWithToggle` wraps `Toggle` + `Stepper` (Note Variance's row), `CoordsInput` wraps two `TextInput`s, and `Lfo` wraps `RadioButton` + two `SliderLinear`s + `Toggle` (the OSCILLATION rows) — its value type reuses the real `LfoSettings` interface from `src/types/lfo.ts` (Phase 0) plus a sibling `active: boolean`, since that is exactly what a Phase 9 drawer will eventually bind it to, without wiring any actual engine here. `RadioButton` is built on the already-installed `@radix-ui/react-toggle-group` (matching `RobotAudioTab.tsx`'s existing Audio Mode pattern) and `Toggle` on `@radix-ui/react-switch`, avoiding new dependencies for those two; `AccordionContainer` has no existing Radix primitive installed, so this phase adds `@radix-ui/react-accordion` (confirmed with the user) and animates expand/collapse through `useGSAP`/`timelineMap`, matching `PowerRockerSwitch.tsx`'s established pattern rather than a plain CSS transition. Content is proven with test fixtures defined inline in each component's own test file — no real domain config file (`audioRigConfig.ts`, `robotOptionsConfig.ts`, etc.) is written this phase, since those belong to Phases 4/5/9 and haven't been scoped yet. Components are built one at a time in dependency order (primitives, then composites, then the domain-specific `Lfo` last), each with a full TDD cycle. Verification beyond tests is a by-eye comparison against the still-live sliders/steppers in the existing robot editor (`RobotAudioTab.tsx`) — informal only; that editor's code is not touched until Phase 9. Finally, `docs/COMPONENT_LIBRARY.md` documents the primitive inventory and the `ControlSchema` contract, and is added to CLAUDE.md's reference doc list.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── controls.ts                        # NEW — ControlSchema discriminated union, one interface per variant
└── components/
    └── ui/
        └── controls/
            ├── Button.tsx / .css / .test.tsx              # NEW
            ├── Toggle.tsx / .css / .test.tsx               # NEW — wraps @radix-ui/react-switch
            ├── TextInput.tsx / .css / .test.tsx            # NEW
            ├── DualLabel.tsx / .css / .test.tsx            # NEW — renders 0/1/2 of loreLabel+humanLabel; used standalone (display-only rows) AND composed inside every other primitive below
            ├── Stepper.tsx / .css / .test.tsx              # NEW
            ├── StepperWithToggle.tsx / .css / .test.tsx    # NEW — composes Toggle + Stepper
            ├── RadioButton.tsx / .css / .test.tsx          # NEW — wraps @radix-ui/react-toggle-group (type="single")
            ├── SliderLinear.tsx / .css / .test.tsx         # NEW — wraps @radix-ui/react-slider
            ├── SliderLog.tsx / .css / .test.tsx            # NEW — wraps @radix-ui/react-slider, exponential value mapping
            ├── SliderCenteredZero.tsx / .css / .test.tsx   # NEW — wraps @radix-ui/react-slider, zero-anchored fill
            ├── CoordsInput.tsx / .css / .test.tsx          # NEW — composes two TextInputs (X/Y)
            ├── AccordionContainer.tsx / .css / .test.tsx   # NEW — wraps @radix-ui/react-accordion, GSAP expand/collapse
            └── Lfo.tsx / .css / .test.tsx                  # NEW — composes RadioButton + 2×SliderLinear + Toggle; value: LfoSettings + active

docs/
└── COMPONENT_LIBRARY.md                    # NEW — primitive inventory + ControlSchema contract + any new accent-tier CSS tokens (Phase 11 Forward Note)

CLAUDE.md                                   # MODIFIED — add docs/COMPONENT_LIBRARY.md to the reference doc list
package.json                                # MODIFIED — add @radix-ui/react-accordion (^1.2.20)
```

**Build order** (per confirmed intent — one component at a time, full TDD cycle each):
1. Button, Toggle, TextInput, DualLabel *(no sub-dependencies)*
2. Stepper, StepperWithToggle, RadioButton, SliderLinear, SliderLog, SliderCenteredZero *(built on the atoms above or directly on Radix)*
3. CoordsInput, AccordionContainer, Lfo *(composites/most domain-specific, built last)*

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in the Target File Structure above unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Zero Hardcoded Strings:** All labels, bounds, and defaults come from `ControlSchema` props — never a raw display string inside a component body. Test fixtures are the one exception (see § 5) since no real domain config exists yet.
* **No real domain config files this phase** — `audioRigConfig.ts`, `sectorSettingsConfig.ts`, `robotOptionsConfig.ts`, etc. stay out of scope; they belong to Phases 4/5/9, which haven't defined their fields yet.
* **No wiring into the existing robot editor** — `RobotAudioTab.tsx`/`RobotOscillatorsTab.tsx` are read-only reference points for by-eye comparison. Swapping them onto the new primitives is Phase 9's job, not this phase's.
* **One new dependency, and only this one:** `@radix-ui/react-accordion` — added because no accordion primitive exists in `package.json` today and CLAUDE.md requires asking first before adding a dependency (asked and confirmed). No other new dependency may be added without the same confirmation.
* **`RadioButton` and `Toggle` reuse existing installed Radix primitives** (`@radix-ui/react-toggle-group` type="single", `@radix-ui/react-switch` respectively) — do not reach for `@radix-ui/react-radio-group` or `@radix-ui/react-toggle`.
* **Accordion expand/collapse animates via `useGSAP` + `timelineMap`** (`setTimeline`/`killTimeline`), following `PowerRockerSwitch.tsx`'s pattern — not a bare CSS `transition`. Respect `prefers-reduced-motion` the same way `PowerRockerSwitch.css` already does.
* **Local ephemeral UI state may use plain React `useState`** (e.g. `AccordionContainer`'s own open/closed bookkeeping if not fully controlled by the caller) — this is presentational state, not domain state, so it does not need to live in Zustand. Domain values (the actual `value` a schema represents) are always controlled via props, never owned internally by a component.
* **`SliderLog`'s exponential mapping must handle a `min` of `0`** — Attack/Decay/Release (`ROBOT_DATA_GRID.md`) all start at `0s`, which a pure `value = min * (max/min)^t` exponential curve cannot represent (undefined at `min = 0`). Use an epsilon floor or an equivalent log-biased easing curve instead of a naive exponential — resolve the exact formula during task breakdown, not by inventing it silently mid-implementation.
* **`CoordsInput` is presentation only** — it does not implement the round-number/low-entropy coordinate guard described in roadmap Phase 5's Known Issue; that guard is Phase 5's responsibility.
* **New CSS custom properties, if any, must be named/grouped for Phase 11's scale split now** (per the roadmap's Forward Note). Component CSS pulls color from the existing accent-tier tokens in `src/index.css` (`--color-accent`, `--color-border`, `--color-text-primary`, `--color-text-muted`) — never hardcoded hex — since every one of these 13 components is small interactive-control chrome, not structural/background chrome (Phase 11 assigns `--color-bg`/`--color-surface` to the planet-seed/structural tier and the rest to the locale-seed/accent tier). Any genuinely new token a component needs (slider track fill, focus ring, disabled-state opacity) gets an accent-scoped name (e.g. a `--control-*` sub-group) and is listed in `docs/COMPONENT_LIBRARY.md`'s token section, so Phase 11 finds an already-classified list instead of regrouping ad hoc component CSS retroactively.
* **`AccordionContainer` is a single independent collapsible section, not a group coordinator.** `ROBOT_DATA_GRID.md` lists "Accordion Container" once per drawer (Ping Controls, Ping Contour, Signature Array), and Phase 4's own About text confirms the pattern — "Accordion containers for each effect module," plural, one per section. Internally it wraps exactly one Radix `Accordion.Root type="single" collapsible` + one `Accordion.Item` (collapsible so it can fully close), not a `type: 'single' | 'multiple'` prop coordinating several sections at once. A drawer that wants three independently-collapsible sections simply renders three `AccordionContainer` instances side by side — each already opens/closes on its own, so "can multiple sections be open simultaneously" is true for free, with no cross-instance coordination to build.
* **Every primitive composes `DualLabel` internally for its own label rendering** — `Stepper`, `SliderLinear`, `RadioButton`, `AccordionContainer`, etc. all render their `loreLabel`/`humanLabel` through an internally-rendered `<DualLabel />`, reading those fields off their *own* schema entry. There is no separate `DualLabelSchema` entry paired alongside a control's schema — one schema entry supplies both the control's bounds/options and its label pair. `DualLabelSchema` (the standalone `type: 'dualLabel'` variant) exists only for pure display-only rows that have no other control (Robot Name, Job Data, Battery Data, Docked Status).
* **`DualLabel`'s `loreLabel`/`humanLabel` props are both optional** — a schema entry may supply neither (renders nothing), either one (renders just that label), or both (renders the pair). Components must not assume both are always present.

---

## 4. Code Style & Architecture Conventions

`src/types/controls.ts` — discriminated union, one interface per variant, shared base fields match `ROBOT_DATA_GRID.md`'s English Label / Lore Label columns:

```typescript
// src/types/controls.ts
import type { LfoSettings } from './lfo';

interface ControlSchemaBase {
  id: string;
  /** Both optional — a schema entry may supply neither, either, or both.
   *  Rendered by this control's own internally-composed <DualLabel />. */
  loreLabel?: string;
  humanLabel?: string;
}

export interface StepperSchema extends ControlSchemaBase {
  type: 'stepper';
  min: number;
  max: number;
  step?: number;
}

export interface StepperWithToggleSchema extends ControlSchemaBase {
  type: 'stepperToggle';
  min: number;
  max: number;
}

export interface SliderLinearSchema extends ControlSchemaBase {
  type: 'sliderLinear';
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export interface SliderLogSchema extends ControlSchemaBase {
  type: 'sliderLog';
  min: number;
  max: number;
  unit?: string;
}

export interface SliderCenteredZeroSchema extends ControlSchemaBase {
  type: 'sliderCenteredZero';
  min: number; // negative bound, e.g. -50
  max: number; // positive bound, e.g. +50
  unit?: string;
}

export interface RadioButtonSchema extends ControlSchemaBase {
  type: 'radio';
  options: { value: string; label: string }[];
}

export interface ToggleSchema extends ControlSchemaBase {
  type: 'toggle';
}

export interface TextInputSchema extends ControlSchemaBase {
  type: 'textInput';
  placeholder?: string;
  maxLength?: number;
}

export interface CoordsInputSchema extends ControlSchemaBase {
  type: 'coordsInput';
}

export interface ButtonSchema extends ControlSchemaBase {
  type: 'button';
}

export interface DualLabelSchema extends ControlSchemaBase {
  type: 'dualLabel';
}

export interface AccordionSchema extends ControlSchemaBase {
  type: 'accordion';
}

export interface LfoSchema extends ControlSchemaBase {
  type: 'lfo';
}

export type ControlSchema =
  | StepperSchema | StepperWithToggleSchema
  | SliderLinearSchema | SliderLogSchema | SliderCenteredZeroSchema
  | RadioButtonSchema | ToggleSchema | TextInputSchema | CoordsInputSchema
  | ButtonSchema | DualLabelSchema | AccordionSchema | LfoSchema;

/** Lfo component's controlled value — reuses the real engine type from Phase 0,
 *  plus `active`, which sits outside LfoSettings per the OSCILLATION STATE row. */
export interface LfoValue extends LfoSettings {
  active: boolean;
}
```

`DualLabel` renders whichever subset of the pair is present — used standalone for display-only rows, and composed internally by every other primitive:

```typescript
// src/components/ui/controls/DualLabel.tsx
import './DualLabel.css';

interface DualLabelProps {
  loreLabel?: string;
  humanLabel?: string;
}

export function DualLabel({ loreLabel, humanLabel }: DualLabelProps) {
  if (!loreLabel && !humanLabel) return null;
  return (
    <div className="sc-dual-label">
      {loreLabel && <span className="sc-dual-label__lore">{loreLabel}</span>}
      {humanLabel && <span className="sc-dual-label__human">{humanLabel}</span>}
    </div>
  );
}
```

Component style — controlled, schema-driven, zero hardcoded strings:

```typescript
// src/components/ui/controls/SliderLinear.tsx
import * as Slider from '@radix-ui/react-slider';
import type { SliderLinearSchema } from '@/types/controls';
import { DualLabel } from './DualLabel';
import './SliderLinear.css';

interface SliderLinearProps {
  schema: SliderLinearSchema;
  value: number;
  onChange: (value: number) => void;
}

export function SliderLinear({ schema, value, onChange }: SliderLinearProps) {
  return (
    <div className="sc-slider-linear">
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <Slider.Root
        className="sc-slider-linear__root"
        min={schema.min}
        max={schema.max}
        step={schema.step ?? 1}
        value={[value]}
        onValueChange={(values) => onChange(values[0])}
      >
        <Slider.Track className="sc-slider-linear__track">
          <Slider.Range className="sc-slider-linear__range" />
        </Slider.Track>
        <Slider.Thumb className="sc-slider-linear__thumb" aria-label={schema.humanLabel} />
      </Slider.Root>
      {schema.unit && <span className="sc-slider-linear__value">{value}{schema.unit}</span>}
    </div>
  );
}
```

* **Naming Conventions:**
  * Components: PascalCase (`SliderLinear.tsx`), CSS class prefix `sc-` (schema control) to avoid collisions with existing `rat-`/`rocker-` prefixes.
  * Types & Interfaces: PascalCase (`ControlSchema`, `SliderLinearSchema`).
  * Schema discriminant values: camelCase strings matching `ROBOT_DATA_GRID.md`'s Component column (`'stepper'`, `'sliderLog'`, `'stepperToggle'`, etc.).
* **Formatting:** Plain named function component exports (not `React.FC`), explicit prop interfaces (`schema`/`value`/`onChange`, not spread props), co-located plain CSS per component, zero inline style objects except where a value must drive a computed transform (e.g. `SliderCenteredZero`'s zero-anchored fill width).

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate unit tests alongside implementation (`Stepper.tsx` → `Stepper.test.tsx`), matching `PowerRockerSwitch.tsx`/`.test.tsx`.
* **Test fixtures:** Defined inline as local consts within each component's own test file (e.g. a literal `SliderLinearSchema` object) — no shared fixture data file, so nothing is later mistaken for a real domain config.
* **Coverage targets specific to this phase:**
  1. Every component renders its own schema's `loreLabel`/`humanLabel` via an internally-composed `<DualLabel />`, never a hardcoded string. `DualLabel` itself is tested for all three cases — neither present (renders nothing), one present, both present — and every other primitive's test confirms it passes its *own* schema's label fields through rather than a separate label schema.
  2. Every interactive component calls `onChange` with the correct value on interaction, and clamps/respects `min`/`max`/`step` from its schema.
  3. `RadioButton` and `Toggle` correctly reflect the controlled `value` prop and don't manage their own selection state internally.
  4. `AccordionContainer` toggles `aria-expanded` on interaction and registers/kills its GSAP timeline via mocked `setTimeline`/`killTimeline` (same mocking pattern as `PowerRockerSwitch.test.tsx`).
  5. `StepperWithToggle`, `CoordsInput`, and `Lfo` composite tests assert the sub-components they wrap are actually rendered and wired (not reimplemented ad hoc).
  6. Basic a11y: every interactive element has an accessible name (`aria-label` or associated `<label>`), consistent with the existing `rat-sr`/`aria-label` pattern in `RobotAudioTab.tsx`.
* **Manual/visual check (not automated):** After each slider/stepper primitive is built, eyeball it side-by-side against the still-live equivalents in `RobotAudioTab.tsx`/`RobotOscillatorsTab.tsx` for a sanity comparison. This is informal — no code in the existing robot editor changes as a result.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/architecture-and-components`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences (e.g. `Add ControlSchema types and Button/Toggle primitives`), one commit roughly per component per the build order in § 2.

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan/Tasks phase before implementation, not silently during coding:

1. **`SliderLog`'s exact curve formula.** A `min = 0` bound (Attack/Decay/Release) breaks a naive `value = min * (max/min)^t` exponential. Needs a concrete epsilon-floor or alternate log-biased easing chosen and tested before this component is built (step 2 of the build order).
2. **`SliderCenteredZero`'s zero-anchored fill.** Radix's `Slider.Range` fills from the track start by default, not from a center zero-point — needs custom range-width/offset math (likely computed inline style, not CSS alone). Flag as non-trivial, not blocking.
3. ~~**`AccordionContainer`'s single-vs-multiple default.**~~ Resolved (§ 3): each instance is an independent single-section collapsible (Radix `type="single" collapsible`, one `Item`), not a group coordinator — a drawer composes multiple independent instances rather than one instance managing several sections' exclusivity.
4. **`Lfo`'s value type reuses `LfoSettings` from `src/types/lfo.ts`.** This is a type-only import (no engine wiring) — confirm during task breakdown that this doesn't create an unwanted coupling for a component meant to stay presentation-only.
