# Phase Spec: Oblique Cabinetry — AccordionContainer (Roadmap Phase 11.1.7)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/oblique-cabinetry-accordion-container.md](../intent/oblique-cabinetry-accordion-container.md)
(confirmed via `/interview-me`, 2026-09-10). Source of scope:
[docs/todo/roadmap.md § 11.1.7](../todo/roadmap.md#1117-oblique-cabinetry-accordioncontainer) —
**superseded by the intent doc's own framing**, not implemented as originally drafted; see §7. Prior art
this spec follows directly: `CabinetBox.tsx`/`.css`, `cabinetGeometry.ts`, `cabinetAnimation.ts`,
`useCabinetBoxHeight.ts` (all reused unmodified — no new prop, no new export);
[Toggle](OBLIQUE_CABINETRY_TOGGLE.md)'s value-keyed `popped`/fixed-size/CSS-scoped-override precedent
(§1.3 below), reused directly for the small `+`/`−` box, including its exact
`CABINET_TOGGLE_BOX_SIZE` constant; `Button.tsx`'s "real interactive element stays in charge, `CabinetBox`
is a visual child" split, reused for the trigger as a whole. This phase touches presentation only — no
`AudioEngine`, `BeatClock`, or Zustand-shape change; `AccordionSchema`/`ControlSchema` are unchanged.

---

## 1. Overview & Claude Explanation

The intent doc resolves the two product-level questions the roadmap draft left open, and reframes the
mechanism entirely: not one state-keyed box (the draft's original framing, mirroring 11.1.2/11.1.6), but
two boxes with two different relationships to `popped`. Five implementation-shape questions remain,
resolved below with real code rather than left to Tasks.

### 1.1 Two `CabinetBox` instances, nested, not one

The trigger's content splits into an **outer, permanently-popped facade** (the whole row) and an **inner,
genuinely-animated toggle** (just the `+`/`−` glyph, in its existing position). Both are literal
`CabinetBox` instances — this is the first Cabinetry item to nest one `CabinetBox` inside another's front
face:

```tsx
<Accordion.Trigger className="sc-accordion__trigger">
  <CabinetBox
    popped
    skipMountAnimation
    boxHeight={CABINET_ACCORDION_TRIGGER_HEIGHT}
    timelineKey={`cabinet-accordion-facade-${schema.id}`}
  >
    <span className="sc-accordion__row">
      <CabinetBox
        popped={open}
        boxHeight={CABINET_TOGGLE_BOX_SIZE}
        timelineKey={`cabinet-accordion-toggle-${schema.id}`}
      >
        <span className="sc-accordion__indicator" aria-hidden="true">{open ? '−' : '+'}</span>
      </CabinetBox>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
    </span>
  </CabinetBox>
</Accordion.Trigger>
```

Same split as every prior item: `Accordion.Trigger` (the real interactive element — role, keyboard,
`aria-expanded`, click) keeps 100% of the interaction; both `CabinetBox`es are `pointer-events: none`-walled
visual children, never hit targets of their own. Neither box's own click/hover ever drives `onChange` or
`onValueChange` — `handleValueChange` (unchanged, §1.5) still fires directly from `Accordion.Root`.

### 1.2 The outer facade: `popped={true}` + `skipMountAnimation`, zero `timelineMap` writes, ever

Confirmed intent: no animation tied to the facade at all. Passing `popped={true}` as a literal (not a
variable that could change) already guarantees `poppedT` is constant `1` for the life of the instance; the
one moment that would otherwise still animate — the very first mount, which `CabinetBox`'s own geometry
effect always treats as "coming from the opposite state" (11.1.1 §1's own derivation) — is suppressed by
`skipMountAnimation`, which takes the direct `gsap.set()` path instead of a tween (`CabinetBox.tsx`'s
`isFirstRun && skipMountAnimation` branch). Every later re-run of that effect (e.g. a breakpoint-crossing
resize changing the front's measured `width`) finds `previousPopped === poppedT` (both `1`) and takes the
`!isTransition` branch, which is *also* a direct `gsap.set()`, never a tween. **No code path in the existing,
unmodified `CabinetBox.tsx` ever calls `setTimeline` for this instance** — `timelineMap` only ever sees a
`killTimeline` call on unmount (already a no-op if nothing was ever set). The facade still needs a
`timelineKey` (a required prop), used for exactly that harmless unmount call and nothing else.

### 1.3 The inner toggle: `Toggle`'s exact mechanism, reused verbatim — not a new size

Confirmed intent: reuse `Toggle`'s `CABINET_TOGGLE_BOX_SIZE = 32` constant and its state-keyed
(open/closed, never hover/focus/press), no-tint, glyph-bearing box — importing the constant directly rather
than re-declaring it:

```tsx
import { CABINET_TOGGLE_BOX_SIZE } from './Toggle';
```

Sized the same way `Toggle.css` sizes its own box — a CSS override forcing the front face's width to match
its `boxHeight`, scoped so it can't also catch the outer facade's own front (§1.4/§4):

```css
.sc-accordion__row .sc-cabinet-box__front {
  width: var(--cabinet-accordion-toggle-size);
  height: var(--cabinet-accordion-toggle-size);
  padding: 0;
}
```

`--cabinet-accordion-toggle-size` is computed once from the same imported `CABINET_TOGGLE_BOX_SIZE`
constant and applied as an inline style — the same "JS-owned value, not a second hand-typed literal"
pattern `Toggle.tsx`'s own `--cabinet-toggle-box-size` already established (11.1.2 §1.2), now doubly
important since this phase imports the *same* constant `Toggle.tsx` already exports rather than
re-declaring `32` a third time anywhere. The glyph stays as the box's `children` (confirmed intent: "keep
glyph, no tint") — `CabinetBox.css`'s own `--color-surface` default is untouched, no accent-tint rule is
added for either box.

### 1.4 Selector precision: distinguishing the outer facade's front from the inner toggle's front

Both boxes render the same `.sc-cabinet-box__front` class (`CabinetBox.css` is shared, unmodified,
consumer-agnostic). Because the inner box is now nested *inside* the outer box's own front face, a plain
descendant selector like `.sc-accordion__trigger .sc-cabinet-box__front` would incorrectly match both. Two
different scoping strategies resolve this, chosen per what's actually unambiguous at each site rather than
one convention forced onto both:

- **Outer** uses direct-child combinators, since the outer `CabinetBox` is `.sc-accordion__trigger`'s only
  child and its own front is that box's only child — a chain no other element can match:
  ```css
  .sc-accordion__trigger > .sc-cabinet-box > .sc-cabinet-box__front { /* outer only */ }
  ```
- **Inner** uses an ordinary descendant selector scoped to the new `.sc-accordion__row` wrapper, since that
  wrapper contains exactly one `CabinetBox` (the toggle) and nothing else that could also match:
  ```css
  .sc-accordion__row .sc-cabinet-box__front { /* inner only */ }
  ```

`.sc-accordion__row` itself is a new, plain (no Radix primitive, no state) `<span>` — pure layout, existing
only to give the inner box's selector something unambiguous to scope against and to lay out
toggle-box + `DualLabel` as a row. It carries no `CabinetBox` of its own and needs no `timelineMap` entry.

### 1.5 Row-natural facade height: a new tuned constant, not the breakpoint tiers

Confirmed intent: a fixed constant sized to the row's own content, not `Button`'s 32/40/48px tiers. Derived
from the two real inputs that determine that content's height — every real `AccordionContainer` schema sets
*both* `loreLabel` and `humanLabel` (`accordionSchema()` in `audioRigConfig.ts`; every schema in
`robotOptionsConfig.ts`), so `DualLabel` always stacks 2 lines in practice, not 1:

- `DualLabel`'s own stack (`DualLabel.css`, unchanged): `0.7rem` lore line + `0.85rem` human line + `2px`
  gap, at the app's `line-height: 1.5` (`index.css`) ≈ 16.8px + 20.4px + 2px ≈ **39px**.
- The original trigger's own vertical padding, now expressed as extra box height rather than literal
  padding (`CabinetBox.css`'s front face centers its children via `align-items: center` inside a fixed
  `height`, the same way every existing box already does — there is no separate padding concept for this):
  the original `8px`-top + `8px`-bottom ≈ **16px**.

39 + 16 ≈ 55px, rounded to a clean multiple of 8 (matching `CABINET_BOX_HEIGHT`'s own 32/40/48 spacing) —
**56px**. Comfortably larger than any breakpoint tile's own value, since a 2-line label stack is taller
content than any single-line `Button`/`RadioButton` box was ever built to hold. Flagged for the manual
check (§5) rather than treated as exact-by-derivation — this is a "sized by feel, confirmed against the
real running app" constant, the same status `CABINET_TOGGLE_BOX_SIZE`/`CABINET_BOX_HEIGHT`'s own three
tiers have.

```tsx
/** Row-natural facade height for AccordionContainer's trigger (roadmap Phase
 *  11.1.7) — not Button's breakpoint-driven 32/40/48px tiles. Sized to fit
 *  DualLabel's own 2-line stack (every real AccordionContainer schema sets
 *  both loreLabel and humanLabel) plus the original trigger's own 8px
 *  top/bottom padding, now expressed as box height instead of literal
 *  padding. See docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.5. */
export const CABINET_ACCORDION_TRIGGER_HEIGHT = 56;
```

### 1.6 The content panel: unchanged code, one new CSS rule to read as the same surface

Confirmed intent: the content panel isn't nested inside the facade's own resizing geometry, but is styled
to visually continue the same surface. `handleValueChange`/`animateTo`/`contentRef` are byte-for-byte
unchanged (§3). The only new rule: `.sc-accordion__content-inner` gains the same `--color-surface`
background the facade's own front face already defaults to (`CabinetBox.css`, untouched) — today it has no
background at all (the removed `.sc-accordion` wrapper never painted one either; only the old trigger's own
`background-color` did, which is also removed, §4) — so without this addition the content would read as a
bare gap against the drawer's own background once the outer border disappears, rather than a continuation
of the popped facade above it.

---

## 2. Target File Structure

```text
src/
└── components/ui/controls/
    ├── AccordionContainer.tsx   # MODIFIED — trigger content re-renders through 2 nested CabinetBox
    │                            #   instances (§1.1); imports CabinetBox, CABINET_TOGGLE_BOX_SIZE
    │                            #   (from Toggle.tsx); exports CABINET_ACCORDION_TRIGGER_HEIGHT
    ├── AccordionContainer.css   # MODIFIED — outer chrome (border/radius/overflow/trigger
    │                            #   background) removed; new facade/row/toggle sizing rules added;
    │                            #   content-inner gains --color-surface background (§1.6)
    └── AccordionContainer.test.tsx  # MODIFIED — 1 existing test restructured (indicator-before-label
                                     #   ordering, §5), new coverage for the 2-box wiring (§5)

docs/
└── COMPONENT_LIBRARY.md    # MODIFIED — same "internal rendering changed, contract didn't" note
                             #   every prior item's row already carries, added to AccordionContainer's
                             #   row (roadmap 11.1.7's own Docs bullet)
```

**Explicitly not touched, and why:**

- `src/components/ui/controls/CabinetBox.tsx`/`.css`, `src/utils/cabinetGeometry.ts`, `cabinetAnimation.ts`,
  `cabinetBreakpoints.ts`, `useCabinetBoxHeight.ts` — the shared mechanism is reused exactly as 11.1.1
  shipped it (§1.2/§1.3). No new prop, no new export — the "zero animation on the facade" behavior (§1.2)
  and the nested-box structure (§1.1) are both achieved entirely from `AccordionContainer.tsx`'s own call
  sites, not by extending `CabinetBox` itself.
- `Toggle.tsx`/`.css`/`.test.tsx` — unaffected; this phase imports `CABINET_TOGGLE_BOX_SIZE` (a plain
  numeric export, already public) but adds no new export to that file and changes no existing one.
- `Button.tsx`/`.css`/`.test.tsx`, `RadioButton.tsx`/`.css`/`.test.tsx` — unaffected; nothing in this phase
  touches `CabinetBox`'s shared props or CSS.
- `src/types/controls.ts` — `AccordionSchema`/`ControlSchema` are unchanged (confirmed intent; no field
  added).
- `accordionAnimation.ts` — `getAccordionDuration` is reused unmodified; the content-height tween's own
  timing is untouched by this phase.
- Every real consumer (`PingControlsDrawer.tsx`, `PingContourDrawer.tsx`, `SignatureArrayDrawer.tsx`,
  `AudioRigDrawer.tsx`) — `AccordionContainer`'s `{ schema, children, defaultOpen }` props contract is
  byte-for-byte unchanged, so no call site needs to change.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — no new global custom property; `--cabinet-accordion-toggle-size` (§1.3) is
  `AccordionContainer.tsx`-local, applied as an inline style, following `Toggle.tsx`'s own
  `--cabinet-toggle-box-size` precedent exactly.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`Accordion.Trigger` keeps 100% of the actual interaction.** Both `CabinetBox`es' walls carry
  `pointer-events: none` already (11.1.1, unchanged); this phase adds no second hit-testable element. Do
  not give either box's walls or front face its own click/keyboard handling.
* **The outer facade's `popped` prop is the literal `true`, never a variable.** Do not key it off `open` or
  any other state — that would silently reintroduce the animated single-box design the intent doc explicitly
  rejected (§1.2). `skipMountAnimation` must also be passed, unconditionally.
* **The inner toggle's `popped` prop is `open`, exactly as today's plain indicator was** — state-keyed only,
  never hover/focus/press (matching `Toggle`'s own precedent, 11.1.2 §1.5). No partial-pop, no new trigger.
* **`handleValueChange`/`animateTo` (the content-height GSAP timeline) are unchanged code** — this phase
  does not touch `contentRef`, the `forceMount`/height-tween logic, or `accordionAnimation.ts`. The trigger's
  two `CabinetBox` timelines are independent `timelineMap` entries alongside it, never a replacement.
* **No timer-based animation.** This phase adds no new timing logic of its own — both boxes reuse
  `cabinetAnimation.ts`/`CabinetBox.tsx`'s existing GSAP timeline machinery unmodified (and, per §1.2, the
  facade's own instance never actually produces a tween). Do not introduce
  `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's files.
* **GSAP never calls `AudioEngine`.** Unchanged from every prior item — `onValueChange` continues to fire
  straight from `Accordion.Root`, entirely independent of either `CabinetBox`'s own GSAP timeline.
* **Every GSAP timeline is registered in `timelineMap`** with a unique key —
  `` `cabinet-accordion-facade-${schema.id}` `` and `` `cabinet-accordion-toggle-${schema.id}` `` (§1.1),
  distinct from each other, from the existing content-tween key (`` `accordion-${schema.id}` ``, unchanged),
  and from every other consumer's own prefix (`cabinet-button-`, `cabinet-toggle-`, `cabinet-radio-`) — this
  is `CabinetBox`'s own existing behavior, unmodified.
* **No accent tint on either box.** Both stay on `CabinetBox.css`'s own `--color-surface` default — do not
  add a `[data-state]`/`.isActive`-keyed background override the way `RadioButton.css` does for its selected
  option (11.1.6 §1.4). That pattern was confirmed *not* wanted here during the interview.
* **`CABINET_TOGGLE_BOX_SIZE` is imported from `Toggle.tsx`, not re-declared.** Do not create a second,
  independently-tuned small-box constant for this phase's toggle — §1.3 confirms verbatim reuse.
* **No new `ControlSchema` variant, no schema field addition.** `AccordionContainer`'s
  `{ schema, children, defaultOpen }` props contract is byte-for-byte unchanged.
* **The old bordered/rounded/clipped chrome (`.sc-accordion`'s `border`/`border-radius`/`overflow: hidden`,
  `.sc-accordion__trigger`'s own `background-color`) is deleted, not retained as dead/unused CSS.**
  `.sc-accordion__content`'s own separate `overflow: hidden` (needed for the height tween) is unaffected and
  stays.
* **Out of scope, per the intent doc:** nesting the content panel inside the facade's own resizing geometry
  (explicitly rejected); any hover/focus partial-pop on either box; exact `zIndex`/spacing fine-tuning beyond
  what §1.4/§1.5 already resolve; `Stepper`/`StepperWithToggle` (dropped from Cabinetry entirely, per
  11.1.1); `Select`, `TextInput`/`CoordsInput` (11.1.8–11.1.9); WorldView/terrain/sky styling, robot visuals,
  the power rocker switch, and the rest of the Sleeve casing; 11.2's accessibility/performance verification
  pass.

---

## 4. Code Style & Architecture Conventions

**`src/components/ui/controls/AccordionContainer.tsx`** (full replacement):

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import gsap from 'gsap';

import { CabinetBox } from './CabinetBox';
import { CABINET_TOGGLE_BOX_SIZE } from './Toggle';
import { DualLabel } from './DualLabel';
import { getAccordionDuration } from './accordionAnimation';
import { withActiveClass } from './activeClass';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import type { AccordionSchema } from '@/types/controls';
import './AccordionContainer.css';

interface AccordionContainerProps {
  schema: AccordionSchema;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Row-natural facade height for the trigger's outer, permanently-popped
 *  CabinetBox (roadmap Phase 11.1.7) — not Button's breakpoint-driven
 *  32/40/48px tiles. Sized to fit DualLabel's own 2-line stack (every real
 *  AccordionContainer schema sets both loreLabel and humanLabel) plus the
 *  original trigger's own 8px top/bottom padding, now expressed as box
 *  height instead of literal padding. See
 *  docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.5. */
export const CABINET_ACCORDION_TRIGGER_HEIGHT = 56;

/**
 * A single independent collapsible section — wraps exactly one Radix
 * Accordion.Root (type="single" collapsible) + one Item, not a group
 * coordinator. A drawer wanting several independently-open sections renders
 * multiple AccordionContainer instances side by side. Open/closed is local
 * ephemeral UI state (spec §3) — presentational, not a domain value.
 * Expand/collapse animates via a GSAP timeline registered in timelineMap,
 * following PowerRockerSwitch.tsx's pattern, and respects
 * prefers-reduced-motion the same way PowerRockerSwitch.css does.
 *
 * Renders through 2 nested CabinetBoxes (roadmap Phase 11.1.7) — an outer,
 * permanently-popped facade wrapping the whole row (popped={true} +
 * skipMountAnimation, so it never actually tweens — see
 * docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.2) giving the
 * trigger the Oblique Cabinetry look, and an inner, genuinely-animated
 * CabinetBox in place of the old plain +/- text — state-keyed off `open`
 * exactly like Toggle (§1.3), reusing Toggle's own CABINET_TOGGLE_BOX_SIZE
 * constant rather than a new tuned size. This is the first Cabinetry item to
 * nest one CabinetBox inside another's front face; see §1.1/§1.4 for why
 * that's safe and how the two fronts stay independently styleable.
 */
export function AccordionContainer({ schema, children, defaultOpen = false }: AccordionContainerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const timelineKey = `accordion-${schema.id}`;

  useEffect(() => {
    return () => killTimeline(timelineKey);
  }, [timelineKey]);

  // If mounted already-open, the content still needs its height freed from
  // the CSS default (height: 0) — animateTo() only runs from user
  // interaction (handleValueChange), so without this the section renders
  // visually collapsed despite aria-expanded="true" on mount.
  useEffect(() => {
    if (defaultOpen && contentRef.current) {
      contentRef.current.style.height = 'auto';
    }
    // Intentionally mount-only: defaultOpen only describes the initial
    // state: post-mount opens/closes go through animateTo() instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function animateTo(nextOpen: boolean) {
    const el = contentRef.current;
    if (!el) return;
    killTimeline(timelineKey);

    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = getAccordionDuration(prefersReducedMotion);
    const targetHeight = nextOpen ? el.scrollHeight : 0;

    const tl = gsap.timeline();
    tl.to(el, {
      height: targetHeight,
      duration,
      ease: 'power2.out',
      onComplete: () => {
        if (nextOpen) el.style.height = 'auto';
      },
    });
    setTimeline(timelineKey, tl);
  }

  function handleValueChange(value: string) {
    const nextOpen = value === schema.id;
    setOpen(nextOpen);
    animateTo(nextOpen);
  }

  return (
    <Accordion.Root
      type="single"
      collapsible
      className={withActiveClass('sc-accordion', open)}
      value={open ? schema.id : ''}
      onValueChange={handleValueChange}
    >
      <Accordion.Item value={schema.id} className="sc-accordion__item">
        <Accordion.Header className="sc-accordion__header">
          <Accordion.Trigger className="sc-accordion__trigger">
            <CabinetBox
              popped
              skipMountAnimation
              boxHeight={CABINET_ACCORDION_TRIGGER_HEIGHT}
              timelineKey={`cabinet-accordion-facade-${schema.id}`}
            >
              <span className="sc-accordion__row">
                <CabinetBox
                  popped={open}
                  boxHeight={CABINET_TOGGLE_BOX_SIZE}
                  timelineKey={`cabinet-accordion-toggle-${schema.id}`}
                >
                  {/* Decorative — the open/closed affordance itself.
                      aria-expanded already carries the real state
                      accessibly; this (plus the box's own pop/flat) is
                      purely so a sighted user can tell at a glance the
                      section can be opened. */}
                  <span className="sc-accordion__indicator" aria-hidden="true">{open ? '−' : '+'}</span>
                </CabinetBox>
                <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
              </span>
            </CabinetBox>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content ref={contentRef} className="sc-accordion__content" forceMount>
          <div className="sc-accordion__content-inner">{children}</div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
```

**`src/components/ui/controls/AccordionContainer.css`** (full replacement):

```css
/* Outer border/radius/overflow chrome removed (roadmap 11.1.7) — the
   permanently-popped facade CabinetBox nested inside .sc-accordion__trigger
   is now the section's only visible edge. See
   docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.2/§1.6. */
.sc-accordion {
}

/* A transparent, full-width click target — the same "real interactive
   element stays in charge, CabinetBox renders the visuals" split every
   prior Cabinetry item uses (Button.css's own .sc-button, Toggle.css's own
   .sc-toggle__root), except full-width here rather than width: fit-content,
   since the facade spans the whole row rather than shrink-wrapping its own
   content. */
.sc-accordion__trigger {
  width: 100%;
  display: block;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.sc-accordion__trigger:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* Stretches the outer facade CabinetBox — an inline-flex element by default
   (CabinetBox.css) — to the trigger's own full width, then overrides the
   front face's default centered/content-sized layout to a left-aligned row
   that fills that width. Direct-child combinators, not descendant
   selectors: the inner toggle box's own front (nested one level deeper,
   inside .sc-accordion__row) must never match either rule. See
   docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.4. */
.sc-accordion__trigger > .sc-cabinet-box {
  width: 100%;
}

.sc-accordion__trigger > .sc-cabinet-box > .sc-cabinet-box__front {
  width: 100%;
  justify-content: flex-start;
  padding: 0 12px;
}

/* Plain layout row inside the facade's own front face — toggle box, then
   the label, mirroring the original trigger's own left-to-right order and
   15px gap. No CabinetBox of its own, no state. */
.sc-accordion__row {
  display: flex;
  align-items: center;
  gap: 15px;
  width: 100%;
}

/* Sizes the inner toggle box to a fixed square, matching Toggle.css's own
   .sc-toggle__root .sc-cabinet-box__front override exactly (roadmap
   11.1.2 §1.2) — --cabinet-accordion-toggle-size is computed once in
   AccordionContainer.tsx from the same imported CABINET_TOGGLE_BOX_SIZE
   constant Toggle.tsx exports, not a second hand-typed 32px literal. Scoped
   to .sc-accordion__row specifically so the outer facade's own full-width
   front (above) is untouched. See
   docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.3/§1.4. */
.sc-accordion__row .sc-cabinet-box__front {
  width: var(--cabinet-accordion-toggle-size);
  height: var(--cabinet-accordion-toggle-size);
  padding: 0;
}

.sc-accordion__indicator {
  font-weight: 600;
  line-height: 1;
}

.sc-accordion__content {
  overflow: hidden;
  height: 0;
}

/* Gains the same --color-surface background CabinetBox.css's own front-face
   default already paints the facade with, so the content panel reads as a
   continuation of that surface rather than a bare gap now that the old
   outer wrapper's own border no longer frames the two together. See
   docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.6. */
.sc-accordion__content-inner {
  padding: 12px;
  background-color: var(--color-surface);
}

@media (prefers-reduced-motion: reduce) {
  .sc-accordion__content {
    transition: none;
  }
}
```

* **Naming conventions:** `CABINET_ACCORDION_TRIGGER_HEIGHT` (SCREAMING_SNAKE_CASE, mirroring
  `CABINET_TOGGLE_BOX_SIZE`/`CABINET_POP_DISTANCE`), `--cabinet-accordion-toggle-size`
  (component-scoped custom property, distinct from `CabinetBox`'s own shared tokens and from `Toggle`'s own
  `--cabinet-toggle-box-size` so none collide), `` `cabinet-accordion-facade-${schema.id}` ``/
  `` `cabinet-accordion-toggle-${schema.id}` `` (timelineMap keys, mirroring
  `` `cabinet-button-${schema.id}` ``/`` `cabinet-toggle-${schema.id}` ``/
  `` `cabinet-radio-${schema.id}-${option.value}` ``).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines
  actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`AccordionContainer.test.tsx` (modified)** — most of the existing suite stays unchanged and passing
  (title-via-`DualLabel`, `aria-expanded` toggling, `setTimeline`/`killTimeline` generically called,
  reduced-motion snapping, no status light, `defaultOpen` height handling) — none of them assert against the
  removed outer border/radius/`overflow` CSS or against the trigger's direct-children shape, **except**:

  1. **"places the indicator before the label in the trigger, not after" — restructured, not deleted.** The
     old assertion walked `.sc-accordion__trigger`'s own direct `children` (previously `[indicator span,
     DualLabel]`); the trigger's only direct child is now the outer facade `CabinetBox`. Rewrite to walk
     `.sc-accordion__row`'s own children instead — the same relative-order guarantee (toggle box before
     `DualLabel`) one level deeper:
     ```tsx
     const row = container.querySelector('.sc-accordion__row');
     const children = Array.from(row?.children ?? []);
     const toggleBoxIndex = children.findIndex((el) => el.querySelector('.sc-accordion__indicator'));
     const labelIndex = children.findIndex((el) => el.classList.contains('sc-dual-label'));
     expect(toggleBoxIndex).toBeLessThan(labelIndex);
     ```

  New coverage, mocking `CabinetBox` directly (following `Button.test.tsx`/`RadioButton.test.tsx`'s own
  precedent), asserting on both instances by their distinct `data-timeline-key`:

  ```tsx
  vi.mock('./CabinetBox', () => ({
    CabinetBox: ({ popped, timelineKey, boxHeight, children }: {
      popped: boolean; timelineKey: string; boxHeight?: number; children?: React.ReactNode;
    }) => (
      <div data-testid="cabinet-box" data-popped={String(popped)} data-timeline-key={timelineKey} data-box-height={boxHeight}>
        {children}
      </div>
    ),
  }));
  ```

  2. **Renders exactly 2 `CabinetBox` instances** — one with `data-timeline-key="cabinet-accordion-facade-pingControls"`, one with `"cabinet-accordion-toggle-pingControls"` (the file's existing `schema.id`).
  3. **The facade instance's `popped` stays `"true"` regardless of open state** — render closed, assert
     `data-popped="true"` on the facade; click the trigger to open, assert it's *still* `"true"` — the
     defining behavior this test suite must never let regress silently back to a state-keyed single box.
  4. **The toggle instance's `popped` mirrors `open`** — `"false"` before clicking, `"true"` after —
     exactly the assertion the old plain-indicator tests made about the glyph, now made about the box.
  5. **The facade passes `boxHeight={CABINET_ACCORDION_TRIGGER_HEIGHT}` (56); the toggle passes
     `boxHeight={CABINET_TOGGLE_BOX_SIZE}` (32)** — proves the two boxes are sized independently and that
     the toggle's size is the genuinely-imported `Toggle` constant, not a coincidentally-equal local number.
  6. **The `+`/`−` glyph still renders inside the toggle instance specifically** (not the facade) — assert
     the facade's mocked element does not contain the glyph text, and the toggle's does.

* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including every real consumer's own test file
     (`PingControlsDrawer.test.tsx`, `PingContourDrawer.test.tsx`, `SignatureArrayDrawer.test.tsx`,
     `AudioRigDrawer.test.tsx`) — none assert against the removed chrome or the old direct-children shape
     (confirmed by the `grep` inventory in this spec's own research; they assert presence/count of
     `.sc-accordion`, `.sc-accordion__content-inner`, and `textContent`, all unaffected).
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** load the app and confirm, across all 4 real consumers (Ping Controls' Melody section,
  Ping Contour's Envelope section, Signature Array's Source section, and at least 2 of Audio Rig's sections
  including one with a long `humanLabel`):
  1. Every trigger row renders as a permanently-popped cabinet facade at rest — walls/glow visible with no
     hover/click needed to reveal them — and **never animates**, including across a breakpoint-crossing
     browser resize (no visible flash/re-pop).
  2. The small `+`/`−` box, and only that box, pops further out when the section is open and flattens when
     closed, animating smoothly on click; it reads as clearly smaller than the surrounding facade, not the
     same depth.
  3. The content panel's own background reads as a continuation of the facade's surface color, with no
     visible seam/gap where the old border used to sit.
  4. Keyboard interaction (`Tab` to the trigger, `Space`/`Enter` to toggle) still works exactly as before,
     and the focus ring renders clearly on top of the popped facade.
  5. Stacked accordions in the same drawer (Audio Rig's 4 sections) still read as visually separated by
     their drawer's own `gap`, with no facade's wall/glow bleeding into an adjacent section.
  6. The toggle box's pop/flat transition snaps instantly with "reduce motion" enabled instead of animating
     (inherited for free from `CabinetBox`/`cabinetAnimation.ts`); the facade, already static, is unaffected
     either way.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** a short note under `AccordionContainer`'s row (mirroring
  `Button`/`Toggle`/`RadioButton`'s own notes) — its internal rendering changed (a permanently-popped facade
  plus a small state-keyed toggle box, replacing plain trigger chrome + a text glyph) while its
  `ControlSchema`/props contract stayed byte-for-byte identical. Should also note the nested-`CabinetBox`
  pattern explicitly, as the first instance of it in the series (§1.1).
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/cabinetry-accordion`, following this series' own per-item branch-per-phase
  convention (e.g. `feature/cabinetry-toggle`, `feature/cabinetry-radio-button`).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences.
  Suggested grouping, each independently reviewable: (1) `AccordionContainer.tsx`/`.css`/`.test.tsx` (the
  full change); (2) `docs/COMPONENT_LIBRARY.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and this codebase's own prior Cabinetry
items, not left open):

- ~~Structural placement — one state-keyed box for the whole trigger (the roadmap draft's original framing),
  or something else?~~ **Resolved: two nested boxes — a permanently-popped facade and a separately-animated
  toggle** (§1.1) — the intent doc's own correction of the roadmap draft, confirmed via `/interview-me`,
  2026-09-10.
- ~~Does the facade ever animate?~~ **Resolved: no, never — achieved via a literal `popped={true}` plus
  `skipMountAnimation`, with no change to `CabinetBox` itself** (§1.2).
- ~~What size/constant does the toggle box use?~~ **Resolved: `Toggle`'s own exported
  `CABINET_TOGGLE_BOX_SIZE = 32`, imported verbatim, not a new tuned size** (§1.3, confirmed intent).
- ~~Does the toggle box carry the glyph, go bare, or get an accent tint?~~ **Resolved: keeps the `+`/`−`
  glyph, no tint** (§1.3, confirmed intent).
- ~~Does the content panel get nested inside the facade's own resizing geometry?~~ **Resolved: no —
  explicitly rejected during the interview; the content panel stays structurally separate, styled to match
  via one new CSS rule** (§1.6).
- ~~Outer chrome — kept, moved, or removed?~~ **Resolved: removed entirely** (§1.2/§1.6, confirmed intent).

Resolved by direct reasoning during Specify — flagged explicitly since the interview didn't ask these
directly, not silently assumed:

1. **Exact facade height value.** **Resolved: 56px** (§1.5), derived from `DualLabel`'s real 2-line stacked
   height (every real consumer's schema sets both label fields) plus the original trigger's own vertical
   padding, rounded to a clean multiple of 8. Flagged as a "sized by feel, confirm in the real app" constant
   like every other Cabinetry breakpoint/size value — not a load-bearing pixel-perfect derivation, and the
   manual check (§5) explicitly covers verifying it against real (not just short) labels.
2. **How to scope 2 same-class fronts without touching `CabinetBox.css`.** **Resolved: direct-child
   combinators for the outer, a scoped descendant selector for the inner** (§1.4) — no new class, no
   `className` prop added to `CabinetBox` itself; both scoping strategies rely only on the DOM shape this
   phase already builds.

No risks carried forward from 11.1.1/11.1.2/11.1.6 apply here in a new way — this phase reuses
`cabinetGeometry.ts`/`cabinetAnimation.ts`/`useCabinetBoxHeight.ts`/`CabinetBox.tsx`'s core mechanism
entirely unmodified, so none of those items' own now-resolved risks reopen here.

**Note on the roadmap draft:** `docs/todo/roadmap.md § 11.1.7`'s own prose (written before this item's
interview) describes a single state-keyed box generalizing 11.1.2/11.1.6's precedent directly — this spec,
following the confirmed intent doc, supersedes that framing rather than implementing it. The roadmap file
itself is left unedited by this phase (matching every prior item's own practice of not rewriting the
roadmap's draft prose after the fact); the intent doc is the authoritative record of the correction.

**Forward note for 11.1.8–11.1.9:** `Select`'s trigger (11.1.8) is described in the roadmap draft the same
way 11.1.7's was — a single state-keyed box, open vs. closed. Given this item's own reframing, that
assumption is worth re-checking during 11.1.8's own interview rather than carried forward automatically;
nothing here resolves it either way. `TextInput`/`CoordsInput` (11.1.9) has no open/closed state at all and
was already flagged in its own roadmap section as needing its own pop-trigger design — this item's
two-boxes-with-different-lifecycles pattern may or may not be relevant there, but is now at least a
precedent to consider rather than something 11.1.9 would have to invent from scratch.
