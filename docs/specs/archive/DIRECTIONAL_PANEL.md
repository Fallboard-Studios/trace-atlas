# Phase Spec: `DirectionalPanel` Primitive

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/directional-panel.md](../intent/directional-panel.md) (confirmed via `/interview-me`, 2026-09-04; design discussion added 2026-09-04). Related prior art: [docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md) (the `ControlSchema` primitive inventory this becomes the 15th member of), [docs/specs/VERTICAL_SLIDERS.md](VERTICAL_SLIDERS.md) (the sibling feature this spec's process and `data-orientation` CSS pattern follow), and `AccordionContainer` (`src/components/ui/controls/AccordionContainer.tsx`) — the existing precedent for a schema-driven container primitive with no `value`/`onChange`. This phase touches presentation only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; it adds one new `ControlSchema` variant and touches no existing schema's `value`/`onChange` contract.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

Every drawer that renders more than one control in a group today wraps each control in its own separate block-level row `<div>` (e.g. `.audio-rig-drawer__param-row`, `AudioRigDrawer.tsx:177-181`), and none of those row wrappers set `display` — they default to `display: block`. Since each control is the *sole child* of its own block box, three sibling controls (e.g. EQ Low/Mid/High) stack vertically regardless of what `display` the *slider itself* uses internally. There is currently no primitive whose entire job is "lay out already-rendered controls as a flex row or column" — `AccordionContainer` groups controls but only ever stacks its content vertically (it's a single collapsible section, not an axis-flippable layout box).

This phase adds that primitive: `DirectionalPanel` (`src/components/ui/controls/DirectionalPanel.tsx`/`.css`/`.test.tsx`), the 15th `ControlSchema` variant:

- **Schema:** `DirectionalPanelSchema extends ControlSchemaBase { type: 'directionalPanel'; orientation?: PanelOrientation }`, where `PanelOrientation = 'row' | 'column'` (new exported type, `src/types/controls.ts`, mirroring `SliderOrientation`'s own precedent). `orientation` is **optional** — unlike `SliderOrientation`, which is required on all 3 slider schemas — and defaults to `'row'` at the component level when omitted (confirmed intent).
- **Props:** `{ schema: DirectionalPanelSchema; children: ReactNode }` — no `value`/`onChange`, no local state of any kind (not even `AccordionContainer`'s open/closed `useState` — this primitive has nothing to toggle).
- **Rendering:** `DualLabel` composed internally (reads `schema.loreLabel`/`schema.humanLabel`, identical convention to every other primitive), rendered above a flex content wrapper whose `flex-direction` follows the resolved orientation, exposed as `data-orientation="row" | "column"` on that wrapper — reusing the exact `data-orientation` CSS-attribute-selector pattern `docs/specs/VERTICAL_SLIDERS.md` established for the 3 slider components, rather than inventing a second pattern for the same concept.
- **No Radix primitive wrapped.** Unlike `AccordionContainer` (`@radix-ui/react-accordion`) or `RadioButton`/`Select` (`@radix-ui/react-toggle-group`/`@radix-ui/react-select`), `DirectionalPanel` is plain CSS flexbox with no interactive behavior of its own — there is nothing for a library to manage (no open/closed state, no keyboard navigation, no focus management), so no new dependency is needed.
- **Not an "interactive primitive."** `docs/COMPONENT_LIBRARY.md`'s `resolveAccessibleName`/`aria-label` machinery (`accessibleName.ts`) is documented as covering the primitives that are themselves focusable form controls (`Button`, `Toggle`, `TextInput`, `RadioButton`, the 3 sliders, `Stepper`). `DirectionalPanel` is not focusable and carries no domain value — same category as `DualLabel` itself, which also renders with no `aria-label`/`role` of its own. `DirectionalPanel` follows that same precedent: a plain `<div>` wrapper, no ARIA grouping role added. (Flagged again, not re-litigated, in §7.)

### 1.2 Composition: standalone, and nesting is expected

Two points confirmed during design discussion, not changed from the intent doc, recorded here because they shape §3's boundaries:

- `DirectionalPanel` has zero dependency on `AccordionContainer`. Same `{ schema, children }` prop shape as every other primitive — it renders correctly directly inside a drawer's top-level JSX, inside an `AccordionContainer`'s children, or nested inside another `DirectionalPanel`.
- `DirectionalPanel` instances nesting inside each other (e.g. a `column` grouping several `row`s) is the intended way to build 2D layouts from this one axis-flippable primitive — the same approach flexbox itself, and every `HStack`/`VStack`-style design-system stack, uses. This is deliberately **not** solved with CSS Grid `grid-template-areas`: grid would need per-field area names threaded through the schema and coordinated CSS, which is more configuration surface than nested `row`/`column` panels, not less. Checked against the real target list in the intent doc's "Why now" section, actual nesting depth stays shallow (at most `row` inside `column`, e.g. Signature Array's per-layer slider groups) — nothing on that list needs 3+ levels.

### 1.3 Composing around `LfoTargetGroup`'s click/focus targeting

Checked directly against `LfoTargetGroup.tsx` and `AudioRigDrawer.tsx`'s hand-rolled `AudioRigLfoGroup` (`docs/COMPONENT_LIBRARY.md`'s `LfoTargetGroup` section) while drafting this spec, since EQ3's 3 rows are the primary example this primitive fixes: each field's `select(field)`-on-click/focus targeting is wired directly onto that field's own row `<div>` (`onClick={() => select(f.field)}`, `onFocus={() => select(f.field)}` — `LfoTargetGroup.tsx:51-56`, `AudioRigDrawer.tsx:83-85`), with the caller's rendered control (`renderField`'s output) nested *inside* that row. `DirectionalPanel` adds no event handlers of its own, so anything it wraps still bubbles clicks/focus up to an ancestor row's handler exactly as before — nesting is transparent to this mechanism.

**The safe composition is wrapping `DirectionalPanel` *around* the existing per-field row `<div>`s (as its `children`), not using it *as* one of those rows.** For EQ3 specifically: `<DirectionalPanel orientation="row">` containing the 3 already-existing `sc-lfo-target-group__row` divs as children is exactly how the visual fix happens — each row keeps its own `onClick`/`onFocus`/`isActive` class untouched, `DirectionalPanel` just becomes their shared flex parent. This is a direct consequence of §1.2 (nesting is the intended composition model), not a new mechanism.

**Boundary this rules out:** because `DirectionalPanel`'s props stay locked to `{ schema, children }` (§3 — no prop passthrough), it can never itself *become* one of `LfoTargetGroup`'s targeted rows (which need `onClick`/`onFocus`/a conditional class). That's not a problem for EQ3 (the goal is wrapping the rows, not replacing them), but it means a future wiring pass can't reach for `DirectionalPanel` to *also* replace `LfoTargetGroup`'s own row markup — that markup stays hand-rolled, `DirectionalPanel` only ever wraps around it.

### 1.4 Row orientation never wraps

`'row'` orientation renders `flex-wrap: nowrap` (confirmed during design discussion, 2026-09-04) — stated explicitly in the CSS (§4) rather than left as an implicit default, since it's a deliberate decision, not an oversight. There is no `wrap` prop and none is planned for this phase. If a real drawer's row overflows once wiring begins, the fix is an explicit second-level `DirectionalPanel` around the group that needs to break onto its own line, or revisiting this decision with a real case in hand — not a speculative `wrap` prop added now with no consumer to validate it against.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── controls.ts                  # MODIFIED — new `PanelOrientation` type; new
│   │                                 #   `DirectionalPanelSchema` interface; added to the
│   │                                 #   `ControlSchema` union and `CONTROL_SCHEMA_TYPES`
│   │                                 #   (14 → 15 entries)
│   └── controls.test.ts             # MODIFIED — `CONTROL_SCHEMA_TYPES` count/sorted-list
│                                     #   assertions updated to 15; new `directionalPanel`
│                                     #   literal fixture; new `PanelOrientation` describe block
└── components/ui/controls/
    ├── DirectionalPanel.tsx         # NEW — see §4
    ├── DirectionalPanel.css         # NEW — see §4
    └── DirectionalPanel.test.tsx    # NEW — see §5

docs/
└── COMPONENT_LIBRARY.md             # MODIFIED — new primitive table row; "All 14 live in" →
                                      #   "All 15 live in"; short note on PanelOrientation
```

**Explicitly not touched, and why:**

- `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/robot/SignatureArrayDrawer.tsx`, `src/components/robot/PingControlsDrawer.tsx`, `src/components/robot/PingContourDrawer.tsx`, or any other drawer — wiring `DirectionalPanel` into a real consumer to actually fix a stacked param row is explicitly out of scope this round (confirmed intent). The component lands with zero consumers, same "component first, consumers later" sequencing `useAutoSliderOrientation` used in `docs/specs/VERTICAL_SLIDERS.md`.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change. No new store field; `DirectionalPanel` has no state of its own to store anywhere.
- `src/animation/timelineMap.ts` — no GSAP timeline; `DirectionalPanel` has no open/closed or other transition to animate.
- `src/components/ui/controls/accessibleName.ts` — not imported; `DirectionalPanel` isn't an interactive primitive (§1.1).

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No `value`/`onChange`, no internal state.** `DirectionalPanel` is a pure layout container — not even `AccordionContainer`'s local open/closed `useState` applies here.
* **`orientation` is optional on the schema, defaulting to `'row'` in the component** (`schema.orientation ?? 'row'`) — the opposite of `SliderOrientation`, which is required on all 3 slider schemas. Do not make it required; the intent doc is explicit that omitting it should just work.
* **No `wrap` prop. `'row'` is always `flex-wrap: nowrap`** (§1.4). Do not add wrapping behavior speculatively in this phase.
* **No gap override prop, no alignment prop.** Gap is a fixed value baked into the CSS (§4), matching every other primitive's own wrapper spacing being fixed in its `.css` file rather than exposed as a prop. Do not add `gap`/`align`/`justify` props — confirmed out of scope in the intent doc's Constraint section ("no additional configurability beyond `'row' | 'column'` unless asked for later").
* **No ARIA grouping role.** Do not add `role="group"`/`aria-label` to the wrapper — `DirectionalPanel` is not an interactive primitive (§1.1); it follows `DualLabel`'s own no-role precedent, not `Toggle`/`Select`'s `resolveAccessibleName` precedent.
* **No drawer wiring.** Do not touch `AudioRigDrawer.tsx`, `SignatureArrayDrawer.tsx`, `PingControlsDrawer.tsx`, `PingContourDrawer.tsx`, or any other consumer to fix a real stacked param row — explicitly deferred to a follow-up pass (confirmed intent's Out of Scope).
* **No new dependency.** Plain `<div>`s and CSS flexbox — no Radix primitive is wrapped (§1.1).
* **CLAUDE.md's audio/animation rules are not implicated.** No Tone synth, no `AudioEngine` call, no GSAP timeline, no `setTimeout`/`setInterval`/`requestAnimationFrame` — `DirectionalPanel` is static layout markup with a data attribute, nothing else.
* **`data-orientation` is always stamped** on the content wrapper (both `'row'` and `'column'`, not only the non-default value) — unlike Radix's own sliders, nothing else sets this attribute for free here, so the component sets it explicitly for both values, useful for both CSS (`[data-orientation='column']` overrides `flex-direction`) and test assertions.

---

## 4. Code Style & Architecture Conventions

**`types/controls.ts`** (diff — alongside the existing `SliderOrientation`/schema interfaces):

```typescript
/** Layout axis for DirectionalPanel — mirrors SliderOrientation's own precedent
 *  as a named, exported union rather than an inline literal type. Optional on
 *  the schema (unlike SliderOrientation, which is required): omitting it
 *  defaults to 'row' in the component, not the type. */
export type PanelOrientation = 'row' | 'column';

export interface DirectionalPanelSchema extends ControlSchemaBase {
  type: 'directionalPanel';
  orientation?: PanelOrientation;
}

export type ControlSchema =
  | StepperSchema | StepperWithToggleSchema
  | SliderLinearSchema | SliderLogSchema | SliderCenteredZeroSchema
  | RadioButtonSchema | ToggleSchema | TextInputSchema | CoordsInputSchema
  | ButtonSchema | DualLabelSchema | AccordionSchema | LfoSchema | SelectSchema
  | DirectionalPanelSchema;

export const CONTROL_SCHEMA_TYPES: readonly ControlSchema['type'][] = [
  'stepper', 'stepperToggle',
  'sliderLinear', 'sliderLog', 'sliderCenteredZero',
  'radio', 'toggle', 'textInput', 'coordsInput',
  'button', 'dualLabel', 'accordion', 'lfo', 'select',
  'directionalPanel',
];
```

**`components/ui/controls/DirectionalPanel.tsx`** (new — full shape):

```tsx
import type { ReactNode } from 'react';

import { DualLabel } from './DualLabel';
import type { DirectionalPanelSchema } from '@/types/controls';
import './DirectionalPanel.css';

interface DirectionalPanelProps {
  schema: DirectionalPanelSchema;
  children: ReactNode;
}

/**
 * A pure layout container — groups already-rendered controls into a row or
 * column flex box. No value/onChange, no state of its own (unlike
 * AccordionContainer's open/closed useState). 'row' is the default
 * orientation when schema.orientation is omitted, and 'row' never wraps
 * (docs/specs/DIRECTIONAL_PANEL.md §1.4) — an overflowing row is solved with
 * a nested DirectionalPanel, not a wrap prop on this one.
 */
export function DirectionalPanel({ schema, children }: DirectionalPanelProps) {
  const orientation = schema.orientation ?? 'row';

  return (
    <div className="sc-directional-panel">
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <div className="sc-directional-panel__content" data-orientation={orientation}>
        {children}
      </div>
    </div>
  );
}
```

**`components/ui/controls/DirectionalPanel.css`** (new — full shape; gap values match this codebase's existing convention of a fixed value per wrapper, not a `--spacing-*` custom property, per `SliderLinear.css`/`Toggle.css`/`CoordsInput.css` etc., none of which reference `--spacing-*` today):

```css
.sc-directional-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sc-directional-panel__content {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 8px;
}

.sc-directional-panel__content[data-orientation='column'] {
  flex-direction: column;
}
```

* **Naming conventions:** `DirectionalPanel` (PascalCase component, matching file name), `PanelOrientation` (PascalCase type, alongside `SliderOrientation` in `controls.ts`), `sc-directional-panel`/`sc-directional-panel__content` (CSS class prefix + BEM-style element suffix, matching every other primitive's `sc-` convention — e.g. `sc-slider-linear__track`, `sc-accordion__content`).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing in `controls.ts`/`controls.test.ts`.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`DirectionalPanel.test.tsx` (new):**
  1. Renders its children.
  2. Renders `DualLabel`'s output when `loreLabel`/`humanLabel` is present on the schema, and renders neither when both are absent — same "renders nothing/one/both" assertion shape `AccordionContainer.test.tsx`/other primitives' tests already use for their own composed `DualLabel`.
  3. `schema.orientation` omitted: the content wrapper's `data-orientation` attribute is `'row'`.
  4. `schema.orientation: 'row'` (explicit): `data-orientation` is `'row'`.
  5. `schema.orientation: 'column'`: `data-orientation` is `'column'`.
  6. Renders multiple children in the same DOM order they were passed in (flex-direction changes the layout axis, not DOM order — this guards against a future refactor accidentally reordering nodes).
  7. **Not asserted here (CSS-only, not testable via RTL/jsdom):** that `'row'` never wraps. `flex-wrap: nowrap` lives in `DirectionalPanel.css`, which jsdom does not apply computed layout for — this is a static-CSS decision (§1.4), not a runtime behavior, so it has no corresponding unit test. Verified by reading the stylesheet, same as `VERTICAL_SLIDERS.md`'s own precedent of not unit-testing CSS-only rules.
* **`controls.test.ts` (modified):**
  - `CONTROL_SCHEMA_TYPES` "has exactly N entries, no duplicates" assertion: `14` → `15`.
  - `CONTROL_SCHEMA_TYPES` "matches the ControlSchema union discriminants exactly" sorted-list assertion: add `'directionalPanel'`.
  - "accepts one literal object per variant" test: add a `directionalPanel: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel', orientation: 'row' }` literal, add it to the `variants` array, bump the `toHaveLength` assertion to `15`.
  - New `describe('PanelOrientation', ...)` block, mirroring the existing `describe('SliderOrientation', ...)` block: (a) accepts `'row'` and `'column'` as literal values; (b) `DirectionalPanelSchema.orientation` is optional — a literal omitting it type-checks and reads as `undefined`.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** None applicable this phase — `DirectionalPanel` has zero real consumers (§2), so there is no drawer to open and visually inspect yet. The next wiring pass is where a manual check (row grouping actually appearing side-by-side in a real drawer) becomes meaningful.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** add a `DirectionalPanel` row to the primitives table (`ControlSchema` variant `DirectionalPanelSchema`, props `{ schema: DirectionalPanelSchema; children: ReactNode }`, no `ROBOT_DATA_GRID.md` row — same "not in the robot grid" treatment `TextInput`/`CoordsInput` already get, since this is pure layout, not a data-backed field); update "All 14 live in `src/components/ui/controls/`" to "All 15"; add a short subsection (mirroring "Slider orientation (`SliderOrientation`)") introducing `PanelOrientation`, the `'row'`-never-wraps decision, and a pointer to this spec.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/panels` (already checked out).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `types/controls.ts` + its test — the new `PanelOrientation` type, `DirectionalPanelSchema`, and the 14→15 union/array update; (2) `DirectionalPanel.tsx`/`.css`/`.test.tsx` — the component itself, no consumer wired; (3) `docs/COMPONENT_LIBRARY.md`.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and the 2026-09-04 design discussion, not left open):

- ~~Does this depend on `AccordionContainer`?~~ **Resolved: no — standalone, same `{ schema, children }` shape as every other primitive** (design discussion, confirmed).
- ~~Is nesting `DirectionalPanel` inside `DirectionalPanel` an anti-pattern to design against?~~ **Resolved: no — it's the intended composition model, and real nesting depth stays shallow (1-2 levels) against the actual wiring target list** (design discussion, confirmed).
- ~~Does this interfere with `LfoTargetGroup`'s click/focus targeting (EQ3 and every other LFO-tied slider group)?~~ **Resolved: no — checked directly against `LfoTargetGroup.tsx`/`AudioRigDrawer.tsx`. Targeting is wired onto each field's own row `<div>`, not onto anything `DirectionalPanel` would replace; `DirectionalPanel` adds no event handlers, so it composes safely by wrapping *around* those existing rows** (§1.3, confirmed 2026-09-04 mid-spec).
- ~~Does `'row'` wrap when its children overflow?~~ **Resolved: no, `flex-wrap: nowrap`, no `wrap` prop this phase** (design discussion, confirmed 2026-09-04).
- ~~Is `orientation` required or optional on the schema?~~ **Resolved: optional, defaults to `'row'` in the component** (intent doc, confirmed) — the opposite of `SliderOrientation`'s required-field precedent, called out explicitly in §3 so it isn't "corrected" to match the sliders during implementation.
- ~~Does `DirectionalPanel` need an ARIA grouping role (`role="group"`, `aria-label`)?~~ **Resolved: no — not an interactive primitive, follows `DualLabel`'s no-role precedent, not `resolveAccessibleName`'s** (§1.1, resolved by precedent during Specify rather than asked, since it followed directly from the existing "interactive primitive" definition in `docs/COMPONENT_LIBRARY.md`). Flagged here in case that reasoning doesn't hold once a real drawer wires this in and a screen-reader pass reveals grouped-fields are hard to navigate without it — revisit then with a real case, not speculatively now.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **Gap values (4px label-to-content, 8px between grouped children) were inferred from existing sibling-primitive CSS conventions, not explicitly confirmed with the user.** `4px` matches the outer-wrapper gap used by `SliderLinear`/`RadioButton`/`CoordsInput`/`Stepper`/`SliderCenteredZero`/`TextInput`/`SliderLog`/`Select` (all: `DualLabel` + control), and `8px` matches the inner "between multiple grouped elements" gap used by `Toggle`/`CoordsInput`'s inner row/`Stepper`'s inner row/`Select`'s inner row. Low risk since both values have direct precedent, but worth a visual confirmation once this is wired into a real drawer (the next pass) rather than assuming the inference was exactly right in isolation.
2. **The fuller list of where `DirectionalPanel` should apply across the app** (referenced in the intent doc's Out of Scope) is still pending from the user, separate from this spec — it will shape the follow-up wiring pass's own Plan/Tasks, not this one.
3. **`VERTICAL_SLIDERS.md` §7's flagged residual risk still applies to the eventual wiring pass**, not to this phase: once a real drawer wraps an `'auto'`-orientation slider inside a `DirectionalPanel`, that panel's container needs a genuinely external size constraint (not a shrink-wrapped box) for `useAutoSliderOrientation`'s `ResizeObserver` measurement to stay stable. `DirectionalPanel` itself doesn't fix or worsen this — it's a re-flag, not a new risk, so the next wiring pass's Plan should read both this spec and that one before choosing how each panel gets sized.
