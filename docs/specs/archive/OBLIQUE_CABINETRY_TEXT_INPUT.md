# Phase Spec: Oblique Cabinetry — TextInput / CoordsInput (Roadmap Phase 11.1.9)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npx eslint .`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/oblique-cabinetry-text-input.md](../intent/oblique-cabinetry-text-input.md)
(confirmed via `/interview-me`, 2026-09-10). Source of scope:
[docs/todo/roadmap.md § 11.1.9](../todo/roadmap.md#1119-oblique-cabinetry-textinput--coordsinput) —
the roadmap section itself was already corrected to match the confirmed intent before this spec was written
(same-session direct edit, not a superseded draft this spec needs to reconcile). Prior art this spec follows
directly: [DirectionalPanel](OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md)'s permanently-popped/non-animating
facade pattern (`popped={true}` + `skipMountAnimation` + `autoHeight`) and its exact facade-wrapping shape
(an outer `<div>` holding a `CabinetBox` whose `children` is the component's own original, unmodified
markup) — reused for its *boundary and mechanism*, explicitly **not** its nesting-context gate (see §1.1).
This phase touches presentation only — no `AudioEngine`, `BeatClock`, or Zustand-shape change;
`TextInputSchema`/`CoordsInputSchema`/`ControlSchema` are unchanged.

---

## 1. Overview & Claude Explanation

The intent doc resolves the two product-level questions (per-input facade, not shared; disabled never
changes the box) and leaves the implementation shape to this spec. Six implementation-shape questions are
resolved below with real code, including one correction to the intent doc's own tentative claim.

### 1.1 Facade shape: `DirectionalPanel`'s exact wrapping code, minus the nesting-context gate

`DirectionalPanel.tsx`'s facade is `{ isNested ? panel : <div className="sc-directional-panel-facade"><CabinetBox popped skipMountAnimation autoHeight timelineKey={...}>{panel}</CabinetBox></div> }`
— a context read gates whether the facade renders at all. `TextInput` reuses the exact same wrapping
structure but drops the gate entirely — there is no context, no `isNested` check, no conditional. Every
`TextInput` instance, unconditionally:

```tsx
return (
  <div className="sc-text-input-facade">
    <CabinetBox popped skipMountAnimation autoHeight timelineKey={`cabinet-text-input-facade-${schema.id}`}>
      <div className="sc-text-input">
        {/* ...unchanged DualLabel + <input>... */}
      </div>
    </CabinetBox>
  </div>
);
```

This is the intent doc's own confirmed correction (§ Design discussion, "CoordsInput's box count"): reusing
`DirectionalPanel`'s nesting-context mechanism was the first framing floated and explicitly rejected — every
`TextInput` instance must behave identically regardless of what composes it, since more standalone consumers
are coming. `CoordsInput` therefore needs **no code change at all** — its own `.tsx` still renders two
`<TextInput>` instances exactly as today, and each independently produces its own facade. `schema.id`
uniqueness (already guaranteed — `CoordsInput.tsx`'s own `${schema.id}.x`/`${schema.id}.y` construction)
carries through automatically to two distinct `timelineKey`s with zero new code, e.g.
`cabinet-text-input-facade-sectorCoords.x` / `cabinet-text-input-facade-sectorCoords.y`.

### 1.2 `autoHeight` **is** needed — corrects the intent doc's own tentative claim

The intent doc's Constraint section says: *"`TextInput`'s content (one `DualLabel` + one `<input>`) is
fixed-height, unlike `DirectionalPanel`'s variable-height content, so `autoHeight` is not expected to be
needed either — to be confirmed, not assumed."* Checked directly against every real `TextInputSchema` in the
app, not assumed: **this is wrong — content height genuinely varies.**

- `COMPANY_NAME_INPUT_SCHEMA` (`companyConfig.ts`) sets both `loreLabel: 'DESIGNATION'` and
  `humanLabel: 'Company Name'` — `DualLabel` renders 2 lines.
- `ATTENUATION_STYLE_SCHEMA` (`sectorSettingsConfig.ts`) likewise sets both `loreLabel`/`humanLabel` — 2
  lines.
- `CoordsInput.tsx`'s own `xSchema`/`ySchema` set **only** `humanLabel: 'X'`/`'Y'`, no `loreLabel` — `DualLabel`
  renders 1 line.

A single fixed `boxHeight` tier (`Button`'s breakpoint-driven 32/40/48px, or a new hand-tuned constant the way
`AccordionContainer`'s `CABINET_ACCORDION_TRIGGER_HEIGHT` was) would either clip the 2-line Company/AS-name
consumers or badly oversize `CoordsInput`'s tight 1-line X/Y fields sitting in an 8px-gap flex row. `autoHeight`
— already shipped, unmodified, proven by `DirectionalPanel` — solves exactly this with zero new measurement
code: the left-face wall resolves `height: 100%` against the wrapper's own real CSS-derived height, and the
front face's own `height: auto` (§1.3's CSS) lets that real height be whatever `DualLabel` + the `<input>`
actually render to, per instance. This spec supersedes the intent doc's tentative claim on this one point;
nothing else about the intent doc's outcome changes.

### 1.3 CSS: no selector-scoping complexity needed — genuinely simpler than `DirectionalPanel`/`AccordionContainer`

Both prior facade items needed careful selector scoping (`AccordionContainer`'s direct-child-vs-descendant
split, `DirectionalPanel`'s direct-child-only rules) specifically because their `children` could themselves
contain another `CabinetBox` instance (a nested `DirectionalPanel`, or `AccordionContainer`'s own inner
toggle box) — a plain descendant selector risked also matching that inner box's own front face.
`TextInput`'s facade content (`DualLabel` + a native `<input>`) contains **no** nested `CabinetBox` under any
real or hypothetical usage — `DualLabel` is a plain presentational component, and an `<input>` obviously
renders no `CabinetBox` of its own. Direct-child combinators are used anyway, for consistency with every
prior facade rule and as free defensive scoping, but — unlike the two prior items — there is no real ambiguity
they're resolving here:

```css
.sc-text-input-facade > .sc-cabinet-box {
  width: 100%;
}

.sc-text-input-facade > .sc-cabinet-box > .sc-cabinet-box__front {
  display: block;
  width: 100%;
  height: auto;
  padding: 12px 14px;
}
```

Padding value (`12px 14px`) is `DirectionalPanel.css`'s own literal facade padding, reused as-is rather than
tuned separately — both frame a labeled block of content, not one centered inline line (`Button`'s own
horizontal-only default). Flagged for the manual check (§5), same "sized by feel, confirm in the real app"
status every Cabinetry padding/size value carries, not a load-bearing derivation.

### 1.4 The caret-cursor risk: citation corrected, and the actual risk direction is the opposite of `Toggle`'s

The intent doc cites *"the caret-cursor concern already resolved once for `Toggle`'s own empty box
(`docs/specs/OBLIQUE_CABINETRY_TOGGLE.md`)."* Checked directly: that bug is real, but it's recorded in
**`docs/tasks/OBLIQUE_CABINETRY_TOGGLE.md`** (Task 2's verification notes), not the spec doc — the intent
doc's citation is corrected here. More importantly, the actual failure mode doesn't transfer the way the
intent doc implied: Chrome's "Navigate pages with a text cursor" (caret browsing) mode parked a blinking
caret on `Toggle`'s box specifically **because that box contains no real text node at all** — caret browsing
finds nothing to latch onto and picks the nearest element, misreading a bare, textless box as editable. Fixed
there with `user-select: none` on `.sc-toggle__root`. `TextInput`'s facade is the structural opposite: it
always contains a real, genuinely editable `<input>` — caret browsing has an actual, correct target to find,
so this specific failure mode (a box with nothing to focus, mistaken for text) cannot recur here by
construction. **`user-select: none` must not be added to `.sc-text-input-facade`/`.sc-text-input`** — that
fix was for a box with no text to protect; applying it here would be actively wrong, since it risks
interfering with the user's ability to select the input's own real text (browser behavior for `user-select`
on an ancestor of a native form control is inconsistent enough across engines that this isn't worth risking
for a problem that doesn't exist here). Still worth a manual check (§5) — a different risk in the same
neighborhood (does clicking near, but not on, the input's own text ever place a caret in the wrong spot) isn't
ruled out by reasoning alone, just not expected.

### 1.5 `CoordsInput.css` needs no edit — checked directly, not assumed

`.sc-coords-input__fields > * { flex: 1; min-width: 0; }` targets *any* direct-child element via the
universal selector — it doesn't care that the child used to be `.sc-text-input` directly and is now
`.sc-text-input-facade` (the new outer wrapper). Confirmed by reading the rule, not assumed: no CSS change
needed for `CoordsInput` to keep working. One accepted, not-worked-around cost, mirroring `DirectionalPanel`'s
own precedent for the same class of trade-off (its own ~28px measured-width reduction from facade padding,
accepted rather than zeroed): the facade's new `14px` horizontal padding per field now eats into the already-
tight 8px-gap two-column X/Y row, leaving each `<input>` a bit narrower than before. Not worked around here;
flagged for the manual check.

### 1.6 Testing convention: `TextInput.test.tsx` gains the universal `CabinetBox` mock; `CoordsInput.test.tsx` needs no structural change

Every existing `CabinetBox` consumer's own test file (`Button`, `Toggle`, `RadioButton`, `AccordionContainer`,
`DirectionalPanel`) mocks `CabinetBox` to isolate its own assertions from `CabinetBox`'s already-proven
internals. `TextInput.test.tsx`/`CoordsInput.test.tsx` currently don't, because `TextInput` doesn't render
`CabinetBox` yet. `TextInput.test.tsx` gains the same mock, matching house convention exactly (§5).
`CoordsInput.test.tsx` needs no mock of its own (it never imports `CabinetBox` directly) and every existing
assertion (`getAllByRole('spinbutton')`, value/onChange wiring, rounding/blank-guard behavior) is unaffected,
since none of it depends on `TextInput`'s internal DOM structure beyond the `<input>` element itself — one new
test is added, using the real (unmocked) rendering path, to encode this item's own central decision as a
regression guard (§5).

---

## 2. Target File Structure

```text
src/
└── components/ui/controls/
    ├── TextInput.tsx        # MODIFIED — wraps existing markup in a CabinetBox facade (§1.1);
    │                         #   imports CabinetBox; no prop/contract change
    ├── TextInput.css        # MODIFIED — facade wrapper/front-face rules added (§1.3); existing
    │                         #   .sc-text-input/.sc-text-input__el rules unchanged
    └── TextInput.test.tsx   # MODIFIED — gains the universal CabinetBox mock (§1.6/§5); every
                              #   existing test unchanged; new facade-specific tests added

src/components/ui/controls/CoordsInput.test.tsx   # MODIFIED — one new test added (real,
                                                    #   unmocked rendering) confirming exactly 2
                                                    #   independent facades render, not 1 (§1.6/§5)

docs/
└── COMPONENT_LIBRARY.md   # MODIFIED — "internal rendering changed, contract didn't" note added
                             #   for TextInput, explicitly stating CoordsInput needed no code
                             #   change (roadmap 11.1.9's own Docs bullet)
```

**Explicitly not touched, and why:**

- `src/components/ui/controls/CoordsInput.tsx` — confirmed intent: no code change, no special-casing (§1.1).
  `CoordsInput.css` — confirmed no edit needed, its `> *` selector is agnostic to the child's class (§1.5).
- `src/components/ui/controls/CabinetBox.tsx`/`.css`, `src/utils/cabinetGeometry.ts`, `cabinetAnimation.ts`,
  `useCabinetBoxHeight.ts` — reused exactly as `DirectionalPanel` (§1.1/§1.2) already proved unmodified; no
  new prop, no new export, no shared-primitive change of any kind.
- `src/components/ui/controls/DirectionalPanel.tsx`/`.css` — unaffected; this phase imports no code from it,
  only reuses its already-public pattern by example.
- `src/types/controls.ts` — `TextInputSchema`/`CoordsInputSchema`/`ControlSchema` unchanged (confirmed
  intent; no field added, no new variant).
- Every real consumer — `src/components/company/CompanyCrudControls.tsx`,
  `src/components/panels/screen/console/SectorSettingsDrawer.tsx` — `TextInput`'s
  `{ schema, value, onChange, numeric?, disabled? }` props contract is byte-for-byte unchanged, and both
  files' own tests query purely by role/accessible-name (confirmed by direct inspection — neither mocks
  `CabinetBox` or asserts on `TextInput`'s internal DOM structure), so neither needs a call-site or test
  change.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — no new global custom property; every token this phase uses (`--cabinet-box-height`,
  `--cabinet-pop-distance`, `--color-surface`) is already shared and unmodified.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **The facade's `popped` prop is the literal `true`, never a variable, and never reads `disabled`.** Do not
  key it off focus, hover, content-non-empty, or `disabled` — every one of those was explicitly considered
  and rejected during the interview (see intent doc's Design discussion). `skipMountAnimation` and
  `autoHeight` must also be passed, unconditionally, on every instance.
* **No nesting-context, no per-instance opt-out.** Do not add a `DirectionalPanelNestingContext`-style
  mechanism, a new prop to suppress the facade, or any check for "is this `TextInput` composed inside
  something else." Every instance renders its own facade, full stop — this is the intent doc's own explicit,
  confirmed correction, not an oversight to "fix" by adding context-awareness later.
* **The native `<input>` element is functionally untouched.** Its `type`/`inputMode`/`step`/`className`/
  `aria-label`/`placeholder`/`maxLength`/`value`/`onChange`/`disabled` wiring is byte-for-byte unchanged from
  today — this phase only changes what wraps around it, never how it itself behaves.
* **`CabinetBox`'s walls stay `pointer-events: none`** (11.1.1, unmodified) — do not add any hit-testing to
  the walls or front face beyond what the real `<input>` already provides on its own.
* **Never add `user-select: none` anywhere in this phase's files** (§1.4) — that fix addressed a different,
  structurally-inverted problem (`Toggle`'s box has no text; `TextInput`'s always does) and risks interfering
  with the input's own real text selection.
* **No timer-based animation.** This phase adds no new timing logic of its own — the facade reuses
  `cabinetAnimation.ts`/`CabinetBox.tsx`'s existing GSAP timeline machinery unmodified, and (per the literal
  `popped`/`skipMountAnimation` combination) never actually produces a tween in practice, the same as
  `DirectionalPanel`'s and `AccordionContainer`'s own static facades. Do not introduce
  `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's files.
* **GSAP never calls `AudioEngine`.** Unchanged from every prior item — `onChange` continues to fire straight
  from the native `<input>`'s own `onChange` event, entirely independent of `CabinetBox`'s own (non-existent,
  in this case) GSAP timeline.
* **Every `CabinetBox` instance is registered in `timelineMap`** with a unique key —
  `` `cabinet-text-input-facade-${schema.id}` `` — distinct from every other consumer's own prefix
  (`cabinet-button-`, `cabinet-toggle-`, `cabinet-radio-`, `cabinet-accordion-facade-`,
  `cabinet-directional-panel-facade-`) and, by construction, distinct per `CoordsInput` field (§1.1). This is
  `CabinetBox`'s own existing behavior, unmodified — the box still needs the required `timelineKey` prop even
  though no real tween is ever produced, for the harmless unmount `killTimeline` call only.
* **No `boxHeight`, `frontWidth`/`frontHeight`, `popDistance`, or `zIndex` override on the `CabinetBox`
  instance** — §1.2/§1.3 establish why `autoHeight` alone is sufficient and every other optional prop is left
  at its default, matching `DirectionalPanel`'s own instance exactly.
* **No new `ControlSchema` variant, no schema field addition.** `TextInput`'s
  `{ schema, value, onChange, numeric?, disabled? }` props contract is byte-for-byte unchanged.
* **`CoordsInput.tsx` is not touched.** Its two-facade appearance is a side effect of `TextInput`'s own
  change, not a deliberate `CoordsInput`-specific feature — do not add any `CoordsInput`-aware code path to
  `TextInput.tsx`, and do not add any `TextInput`-aware code path to `CoordsInput.tsx`.
* **Out of scope, per the intent doc:** any reactive box behavior keyed off `disabled`/hover/focus; any
  change to `TextInput`'s own validation, `numeric` rendering, or `CoordsInput`'s rounding/blank-guard logic;
  `Select` (roadmap 11.1.8, cut); WorldView/terrain/sky styling, robot visuals, the power rocker switch, and
  the rest of the Sleeve casing; 11.2's accessibility/performance verification pass.

---

## 4. Code Style & Architecture Conventions

**`src/components/ui/controls/TextInput.tsx`** (full replacement):

```tsx
import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import type { TextInputSchema } from '@/types/controls';
import './TextInput.css';

interface TextInputProps {
  schema: TextInputSchema;
  value: string;
  onChange: (value: string) => void;
  /** Renders as a native numeric input (type="number", inputMode="decimal")
   *  instead of plain text — for callers whose value is always a number
   *  (e.g. CoordsInput's X/Y fields). Purely a rendering concern, not part
   *  of TextInputSchema — the schema still describes generic text entry. */
  numeric?: boolean;
  disabled?: boolean;
}

/**
 * Plain schema-driven text input. Controlled — calls onChange with the raw
 * string on every keystroke, no internal buffering.
 *
 * Renders through a permanently-popped, non-animating CabinetBox facade
 * (roadmap Phase 11.1.9) — the same static-facade mechanism DirectionalPanel
 * (docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md) already uses:
 * popped={true} (a literal, never a variable) plus skipMountAnimation, so
 * CabinetBox's own unmodified mount/transition logic never actually
 * produces a tween for this instance. autoHeight lets the box's own real
 * content height (DualLabel's 1 or 2 lines, depending on which labels the
 * schema sets, plus the input row) drive the facade's size — see
 * docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md §1.2 for why a fixed
 * breakpoint-tier height (Button's own pattern) doesn't fit every real
 * consumer here.
 *
 * Unlike DirectionalPanel, every instance renders its own facade
 * unconditionally — no nesting-context, no per-instance opt-out
 * (docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md §1.1, confirmed intent).
 * CoordsInput composes two of these and needs no code of its own to end up
 * with two independent facades. The native <input> itself is completely
 * unaffected — no new interaction, no hover/focus/disabled-reactive pop;
 * the box is purely decorative.
 */
export function TextInput({ schema, value, onChange, numeric, disabled }: TextInputProps) {
  return (
    <div className="sc-text-input-facade">
      <CabinetBox
        popped
        skipMountAnimation
        autoHeight
        timelineKey={`cabinet-text-input-facade-${schema.id}`}
      >
        <div className="sc-text-input">
          <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
          <input
            type={numeric ? 'number' : 'text'}
            inputMode={numeric ? 'decimal' : undefined}
            step={numeric ? 'any' : undefined}
            className="sc-text-input__el"
            aria-label={resolveAccessibleName(schema)}
            placeholder={schema.placeholder}
            maxLength={schema.maxLength}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      </CabinetBox>
    </div>
  );
}
```

**`src/components/ui/controls/TextInput.css`** (existing rules unchanged; facade rules added):

```css
.sc-text-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sc-text-input__el {
  /* Without an explicit width, a bare <input> keeps its browser-default
     intrinsic size (wider still for type="number", which adds spinner UI)
     instead of filling its container — the fix for the mobile overflow
     this caused inside CoordsInput's side-by-side X/Y layout. */
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  font: inherit;
}

.sc-text-input__el:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

/* Oblique Cabinetry facade wrapper (roadmap 11.1.9) — every TextInput
   instance renders one, unconditionally; unlike DirectionalPanel's own
   facade, there's no nesting-context here to gate it. Direct-child
   combinators used for consistency with every prior facade rule and as
   free defensive scoping — TextInput's own content (DualLabel + a native
   <input>) never contains a nested CabinetBox, so unlike DirectionalPanel/
   AccordionContainer there's no real selector-scoping ambiguity to solve
   here. See docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md §1.1/§1.3. */
.sc-text-input-facade > .sc-cabinet-box {
  width: 100%;
}

/* display: block + height: auto (overriding CabinetBox.css's own fixed
   height: var(--cabinet-box-height) default by selector specificity) lets
   the front face size itself to .sc-text-input's own real content height —
   exactly what CabinetBox.tsx's autoHeight prop expects its left-face wall
   to be measured against. Needed here, not just carried over from
   DirectionalPanel defensively: real TextInput consumers vary in DualLabel
   line count (CoordsInput's X/Y: 1 line; Company/Attenuation-Style name
   fields: 2 lines) — see docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md §1.2.
   Padding (12px 14px) is DirectionalPanel.css's own literal facade value,
   reused as-is — both frame a labeled block of content, not one centered
   inline line (Button's own horizontal-only default). */
.sc-text-input-facade > .sc-cabinet-box > .sc-cabinet-box__front {
  display: block;
  width: 100%;
  height: auto;
  padding: 12px 14px;
}
```

* **Naming conventions:** `sc-text-input-facade` (outer wrapper class, mirroring `sc-directional-panel-facade`'s
  own `-facade` suffix precedent), `` `cabinet-text-input-facade-${schema.id}` `` (`timelineMap` key,
  mirroring `` `cabinet-accordion-facade-${schema.id}` ``/`` `cabinet-directional-panel-facade-${schema.id}` ``).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines
  actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`TextInput.test.tsx` (modified)** — every existing test (placeholder, `maxLength`, `onChange` on
  keystroke, controlled `value`, `DualLabel` labels, plain-vs-numeric rendering, accessible-name fallback,
  `disabled` default/blocking) passes unmodified once the `CabinetBox` mock (below) is in place — none of them
  assert on `TextInput`'s own outer DOM structure, only on the `<input>`/`DualLabel` content, both still
  reachable through the mocked box. Add the mock, mirroring `Button.test.tsx`/`RadioButton.test.tsx`'s own
  precedent, extended to capture `skipMountAnimation`/`autoHeight` (neither prior mock needed to, since no
  earlier consumer passed both at once):

  ```tsx
  vi.mock('./CabinetBox', () => ({
    CabinetBox: ({ popped, timelineKey, skipMountAnimation, autoHeight, children }: {
      popped: boolean; timelineKey: string; skipMountAnimation?: boolean; autoHeight?: boolean;
      children?: React.ReactNode;
    }) => (
      <div
        data-testid="cabinet-box"
        data-popped={String(popped)}
        data-timeline-key={timelineKey}
        data-skip-mount-animation={String(!!skipMountAnimation)}
        data-auto-height={String(!!autoHeight)}
      >
        {children}
      </div>
    ),
  }));
  ```

  New coverage:

  1. **Renders through a permanently-popped facade**: `data-popped="true"`,
     `data-timeline-key="cabinet-text-input-facade-robotName"` (using the file's own existing `robotName`
     schema id fixture).
  2. **Passes `skipMountAnimation` and `autoHeight`, unconditionally**: both `data-skip-mount-animation` and
     `data-auto-height` are `"true"`.
  3. **Stays popped when `disabled` is true** — render with `disabled`, assert `data-popped` is still
     `"true"` (the regression guard for §1.4/the intent doc's confirmed "box never reacts to disabled"
     decision).
  4. **Both the `<input>` and its `DualLabel` render inside the facade** — `screen.getByTestId('cabinet-box')`
     contains both `screen.getByRole('textbox')` and the schema's `humanLabel` text, confirming the wrapping
     shape from §1.1 (label + field together inside the box, not beside it).

* **`CoordsInput.test.tsx` (modified)** — every existing test is unaffected (none mock `CabinetBox` or assert
  on `TextInput`'s internal structure). One new test added, using the real (unmocked) rendering path — this
  file already renders real `CabinetBox`es today via `TextInput`, relying on `vitest.setup.ts`'s global
  no-op `ResizeObserver`/GSAP mocks, the same way it always has:

  ```tsx
  it('renders two independent CabinetBox facades, one per field — not one shared facade (roadmap 11.1.9)', () => {
    const { container } = render(<CoordsInput schema={schema} value={{ x: 0, y: 0 }} onChange={() => {}} />);
    expect(container.querySelectorAll('.sc-text-input-facade')).toHaveLength(2);
  });
  ```

* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npx eslint .` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including every real consumer's own test file
     (`CompanyCrudControls.test.tsx`, `SectorSettingsDrawer.test.tsx`) — neither asserts against `TextInput`'s
     internal DOM structure (confirmed by the `grep` inventory in this spec's own research, §2), only against
     role/accessible-name, both unaffected.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** load the app and confirm, across all 3 real consumers (Company Manager's Create/Rename
  name fields, Sector Settings' Attenuation Style name field, and Sector Settings' coordinate `CoordsInput`):
  1. Every field renders as a permanently-popped cabinet facade at rest — walls/glow visible with no
     click/focus needed to reveal them — and never animates, including across a breakpoint-crossing browser
     resize (no visible flash/re-pop).
  2. The facade's height reads correctly against both a real 2-line label (Company/AS name) and a real 1-line
     label (`CoordsInput`'s X/Y) — no clipping, no obviously-oversized empty space.
  3. Typing, focus, caret placement/visibility, and text selection inside every field work exactly as before
     — specifically click near (not just squarely on) the input's own text to confirm the facade never
     intercepts or mispositions the caret (§1.4).
  4. A disabled field (Company Manager's Create-name field, disabled at the `MAX_COMPANIES` cap) still reads
     as disabled via the native input's own dimmed/`not-allowed` styling — the facade box itself looks
     identical to an enabled field's (no flattening).
  5. `CoordsInput`'s X and Y fields render as two visually distinct, independent popped boxes side by side,
     not one merged frame — and both fields remain comfortably usable at the facade's new, slightly reduced
     effective width (§1.5).
  6. The facade's pop/flat state (there being none — it's static) is unaffected by `prefers-reduced-motion`,
     since it never animates in the first place; confirm no console error/warning either way.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** a short note under `TextInput`'s row (mirroring
  `Button`/`Toggle`/`RadioButton`/`AccordionContainer`/`DirectionalPanel`'s own notes) — its internal
  rendering changed (wrapped in a permanently-popped, `autoHeight` `CabinetBox` facade) while its
  `ControlSchema`/props contract stayed byte-for-byte identical. Should explicitly state `CoordsInput` needed
  no code change of its own — its own row can point at `TextInput`'s note rather than duplicating it.
* **`docs/todo/roadmap.md`**: no further edit — `§ 11.1.9` was already brought in line with the confirmed
  intent in the same session this spec was written (see this spec's own header). Not re-edited here, per
  every prior item's own practice of not re-touching the roadmap once its relevant section already reflects
  reality.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/cabinetry-text-input`, following this series' own per-item branch-per-phase
  convention (e.g. `feature/cabinetry-toggle`, `feature/cabinetry-radio-button`, `feature/cabinetry-accordion`).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences.
  Suggested grouping, each independently reviewable: (1) `TextInput.tsx`/`.css`/`.test.tsx` (the facade
  itself); (2) `CoordsInput.test.tsx`'s one new regression test; (3) `docs/COMPONENT_LIBRARY.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and this codebase's own real files, not
left open):

- ~~Does `TextInput` need `autoHeight`, given the intent doc's own tentative "not expected to be needed"
  claim?~~ **Resolved: yes — the intent doc's claim was wrong**, corrected here with direct evidence
  (`CoordsInput`'s 1-line X/Y labels vs. Company/AS name fields' 2-line labels) that content height genuinely
  varies across real consumers (§1.2).
- ~~Is the "caret-cursor concern already resolved once for `Toggle`" citation accurate?~~ **Resolved:
  partially — the bug is real but lives in `docs/tasks/OBLIQUE_CABINETRY_TOGGLE.md`, not the spec doc the
  intent doc cited; corrected here.** More importantly, the actual risk doesn't transfer the way implied:
  `Toggle`'s bug was caused by a box with *no* text; `TextInput`'s box always has real text, so the same
  failure mode cannot recur by construction — still flagged for the manual check as a distinct, lower-risk
  concern (§1.4/§5).
- ~~Does `CoordsInput.css` need any edit for its two fields to keep fitting their row correctly once each
  wraps in a new outer `.sc-text-input-facade` div?~~ **Resolved: no — checked directly, the existing
  `.sc-coords-input__fields > *` universal-child selector is agnostic to the wrapper's class name** (§1.5).
- ~~Does the facade's CSS need `AccordionContainer`/`DirectionalPanel`'s own direct-child-vs-descendant
  selector-scoping care, since `CoordsInput` composing two `TextInput`s looks structurally similar to their
  own nested-box problem?~~ **Resolved: no — `TextInput`'s own content never contains a nested `CabinetBox`
  under any real or hypothetical usage**, so there's no actual ambiguity a plain descendant selector would
  need to resolve; direct-child combinators are used anyway for consistency, not necessity (§1.3).

Resolved by direct reasoning during Specify — flagged explicitly since the interview didn't ask these
directly, not silently assumed:

1. **Facade padding value (`12px 14px`).** **Resolved: reuse `DirectionalPanel.css`'s own literal value
   as-is**, rather than tuning a new one — both frame a labeled content block, not a single centered line.
   Flagged for the manual check like every other Cabinetry size/spacing value, not treated as load-bearing.
2. **`CabinetBox` mock shape for `TextInput.test.tsx`.** **Resolved: extend `Button.test.tsx`'s own mock
   pattern to also capture `skipMountAnimation`/`autoHeight`**, since this is the first consumer to pass both
   props on the same instance at once (`DirectionalPanel.test.tsx`'s own mock only needed `timelineKey`/
   `children`, per that file's own narrower assertions).
3. **Whether to add a `CoordsInput.test.tsx` regression test for the two-facade outcome.** **Resolved: yes,
   one small test, using the real rendering path already in use there** — this item's entire reason for
   existing (as a roadmap correction) is the "per-input, not shared" decision; leaving it unencoded as a test
   would leave the actual design decision unverified by anything but manual inspection.

No risks carried forward from `11.1.1`–`11.1.8`/`DirectionalPanel` apply here in a new way — this phase
reuses `CabinetBox.tsx`/`cabinetGeometry.ts`/`cabinetAnimation.ts`/`useCabinetBoxHeight.ts`'s core mechanism,
including `autoHeight`, entirely unmodified.

**Forward note:** This is the last of the 14 primitives to receive Cabinetry (roadmap `§ 11.1.9`'s own
"About" section) — once this ships, `11.2`'s accessibility/performance verification pass (already scoped to
extend its own check to "whatever pop-trigger `TextInput`/`CoordsInput` lands on") should specifically
confirm the facade doesn't fight native text selection/caret visibility in the real running app (§1.4/§5's
manual check item 3), and that a screen reader announces the `<input>`'s own `aria-label` correctly with the
new wrapper markup around it — nothing here resolves that ahead of time, since `11.2` is explicitly the
verification phase for exactly this class of question.
