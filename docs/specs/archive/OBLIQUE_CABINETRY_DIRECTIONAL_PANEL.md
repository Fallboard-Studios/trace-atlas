# Phase Spec: Oblique Cabinetry — DirectionalPanel

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/oblique-cabinetry-directional-panel.md](../intent/oblique-cabinetry-directional-panel.md)
(confirmed via `/interview-me`, 2026-09-10). Not a numbered roadmap item — `DirectionalPanel` was
explicitly out of scope for the original 11.1.x series (`docs/todo/roadmap.md § 11.1.9`: "`DualLabel`/
`DirectionalPanel` are pure layout/display... never in scope"); raised directly by Crawford after
AccordionContainer (11.1.7) shipped. Prior art this spec follows directly:
[AccordionContainer](OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md)'s permanently-popped/non-animating facade
pattern (`popped={true}` + `skipMountAnimation`) and its direct-child-combinator selector scoping for two
same-class `.sc-cabinet-box__front`s at different nesting depths (§1.4 there); [Toggle](OBLIQUE_CABINETRY_TOGGLE.md)'s
precedent for a small, purely-additive `CabinetBox` prop (§1.2 there). This phase touches presentation
only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; `DirectionalPanelSchema`/`ControlSchema` are
unchanged.

---

## 1. Overview & Claude Explanation

The intent doc resolves the product-level questions (top-level-only, whole-panel framing, no tint, the
padding trade-off accepted). Five implementation-shape questions remain, resolved below with real code.

### 1.1 `CabinetBox` gains `autoHeight` — smaller than the interview anticipated, no `ResizeObserver` needed

The intent doc's own Success section describes this as "live height measurement... a second
`ResizeObserver`, mirroring the width one it already has." Working through the actual mechanism during
Specify surfaces a simpler, already-proven-safe alternative: **no new measurement is needed at all.**
`CabinetBox.css`'s own `.sc-cabinet-box__backing` rule already sizes itself to `height: 100%` against the
wrapper (`.sc-cabinet-box`, `position: relative`) — an absolutely-positioned child resolving a percentage
height against its nearest positioned ancestor, standard CSS, already shipped and working today. The
left-face wall (`.sc-cabinet-box__left-face`) is exactly the same kind of element — absolutely positioned,
inside `.sc-cabinet-box__walls` (`position: absolute; inset: 0`, itself sized to the wrapper) — so giving
*it* `height: 100%` instead of a JS-computed pixel value resolves against that identical real wrapper
height, automatically, synchronously, with zero lag and zero new `ResizeObserver`. This works specifically
*because* the facade never animates (`popped={true}` literal + `skipMountAnimation`, per the intent doc) —
GSAP's own tween of the wall only ever writes `scaleX`/`scaleY`/`skewY` (never `height`), so a CSS
percentage height is never fought or overwritten by any tween this component runs, for this or any other
consumer.

**Flagged for review, not silently substituted:** the intent doc's confirmed *outcome* — `CabinetBox`
correctly sizing a facade's left-face wall against genuinely variable content height — is unchanged; only
the *mechanism* differs from what was floated mid-interview. See §7 for the full reasoning trail.

```typescript
interface CabinetBoxProps {
  // ...unchanged fields...
  /** Optional — when true, the left-face wall is sized to 100% of the
   *  wrapper's own real (CSS-derived) height instead of `frontHeight ??
   *  boxHeight`, and `boxHeight`/`--cabinet-box-height` become irrelevant to
   *  the front face's own visible height (the consumer's own CSS is
   *  expected to override `.sc-cabinet-box__front`'s height to `auto`, the
   *  same way every consumer's own scoped CSS already overrides its
   *  width/height). For a facade whose content genuinely varies in height
   *  per instance rather than a caller-known fixed/breakpoint size —
   *  DirectionalPanel is the first consumer. Requires no new measurement:
   *  `.sc-cabinet-box__backing` already sizes itself to 100% of the wrapper
   *  the same way (CabinetBox.css); the left-face wall, being an
   *  absolutely-positioned child of `.sc-cabinet-box__walls` (itself
   *  `inset: 0` against the wrapper), resolves `height: 100%` against that
   *  same real height — proven-safe by that existing precedent, not new
   *  territory. Only meaningful alongside a permanently-popped,
   *  non-animating instance (`popped={true}` + `skipMountAnimation`) — no
   *  animating consumer exists yet, and this doesn't newly support one
   *  (untested against a real height-tweening box, though nothing about the
   *  wall's own scaleX/scaleY tween touches height). See
   *  docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1.1. */
  autoHeight?: boolean;
}
```

The only other change to `CabinetBox.tsx` is threading the new prop into the left-face wall's inline style:

```tsx
<div
  ref={leftFaceRef}
  className="sc-cabinet-box__left-face"
  style={{ width: `${2 * resolvedPopDistance}px`, height: autoHeight ? '100%' : `${leftFaceHeight}px` }}
/>
```

`leftFaceHeight` itself (`frontHeight ?? boxHeight`) is untouched — still computed, still the fallback for
`autoHeight === false` (every existing consumer). No change to the width `ResizeObserver`, the geometry
effect, `cabinetTokens`, or any other prop.

### 1.2 "Top-level" is detected at render time via React Context, not a per-call-site prop

Confirmed by the intent doc's own audit (§ Scope there): the same `renderBlock()` call site in
`AudioRigDrawer.tsx` is top-level for most groups but nested for `eqFilters`/`timeSpace` — a static prop per
call site cannot express this. `DirectionalPanel.tsx` gains a module-level Context, defaulting to `false`
(not nested — i.e. "get a facade if you're the one rendering right now"), read via `useContext` and always
re-provided as `true` for whatever `children` a given instance renders:

```tsx
const DirectionalPanelNestingContext = createContext(false);
```

Every `DirectionalPanel` instance reads its own nesting state from the context (was *this* instance placed
inside another `DirectionalPanel`'s `children`?), decides whether to render its own facade accordingly, and
then unconditionally provides `true` to its own `children` — so a panel two, three, or more levels deep
still correctly reads as nested, without needing to walk the whole ancestor chain itself.

### 1.3 One new wrapper `<div>`, scoped via direct-child combinators — mirroring AccordionContainer's own §1.4

`CabinetBox` has no `className` prop (confirmed — not part of `CabinetBoxProps` today, and this phase
doesn't add one), so the outer facade's own CSS needs a stable ancestor to scope against. A plain
`<div className="sc-directional-panel-facade">` wraps the `CabinetBox` (only rendered for a top-level
instance) — pure layout, no state, no Radix primitive, matching `DirectionalPanel`'s own existing
"`DirectionalPanel` composes standalone... no state of its own" character (`docs/COMPONENT_LIBRARY.md`).
Scoped with direct-child combinators, exactly like AccordionContainer's own outer-facade rule, so a
`CabinetBox` belonging to one of this panel's own *child controls* (a `Slider`, `Button`, etc., rendered
somewhere inside `children`) can never be caught by the same selector — a plain descendant selector would
incorrectly match every nested `CabinetBox` at any depth:

```css
.sc-directional-panel-facade > .sc-cabinet-box { /* facade only */ }
.sc-directional-panel-facade > .sc-cabinet-box > .sc-cabinet-box__front { /* facade only */ }
```

### 1.4 A real, accepted consequence for `orientation="auto"`: the measured "parent" shifts for top-level panels

`useAutoPanelOrientation` measures `ref.current.parentElement` — deliberately the *true* DOM parent, never
the panel's own box (its own doc comment: "a self-observed measurement would feed back into itself"). For a
now-facaded top-level panel, that parent element becomes `.sc-cabinet-box__front` (a `display: block;
width: 100%` div, §4) instead of the drawer's own real layout container. Because the front face's own width
is itself derived from its parent chain (ultimately the same real container, minus the facade's own ~28px
horizontal padding, §1.3/intent doc's already-accepted padding trade-off), this is the *same* accepted
trade-off extended to a second measurement point, not a new one — `AUTO_PANEL_ROW_MIN_WIDTH`'s own 640px
threshold (already flagged as "first-pass, confirm visually," `useAutoPanelOrientation.ts`) absorbs a
~28px-narrower reading the same way it already absorbs any other real-world layout variance. Nested panels
are entirely unaffected — they never get a facade, so their own `parentElement` is exactly what it is
today. Flagged explicitly (not silently) because `DirectionalPanel.test.tsx`'s own existing "observes its
own parent element, not its own box" test asserts the literal top-level case, which now needs restructuring
(§5).

### 1.5 No accent tint, no `boxHeight` override, added vertical padding

Matches AccordionContainer's own facade: no `[data-state]`/`.isActive`-keyed tint, `CabinetBox.css`'s plain
`--color-surface` default. No `boxHeight` prop passed at all (irrelevant under `autoHeight`, per §1.1 — the
front's own CSS-forced `height: auto` always wins by selector specificity over whatever
`--cabinet-box-height` resolves to). Unlike every prior single-line/short-content consumer, the front face
gains **vertical** padding too (`12px 14px`, not `CabinetBox.css`'s own horizontal-only `0 14px` default) —
this facade frames a whole block of content, not one centered line, so breathing room above/below the
content matters the way it never did for Button/Toggle/RadioButton/AccordionContainer's own fixed-height,
`align-items: center`-centered fronts.

---

## 2. Target File Structure

```text
src/
└── components/ui/controls/
    ├── CabinetBox.tsx           # MODIFIED — 1 new optional prop, autoHeight (§1.1)
    ├── CabinetBox.test.tsx      # MODIFIED — new test cases for autoHeight (§5)
    ├── DirectionalPanel.tsx     # MODIFIED — Context-based top-level detection + facade wiring (§1.2/§1.3)
    ├── DirectionalPanel.css     # MODIFIED — new .sc-directional-panel-facade rules (§1.3/§1.5)
    └── DirectionalPanel.test.tsx # MODIFIED — mocks CabinetBox; 1 existing test restructured (§1.4/§5);
                                  #   new coverage for facade/no-facade-when-nested wiring (§5)

docs/
└── COMPONENT_LIBRARY.md    # MODIFIED — new "internal rendering changed" note under DirectionalPanel's
                             #   existing section, same pattern every prior item's own note follows
```

**Explicitly not touched, and why:**

- `src/utils/cabinetGeometry.ts`, `cabinetAnimation.ts`, `cabinetBreakpoints.ts`, `useCabinetBoxHeight.ts` —
  the shared mechanism (projection math, timing, breakpoint tiers) is reused exactly as 11.1.1 shipped it;
  `autoHeight` needs none of it.
- `Button.tsx`/`.css`, `Toggle.tsx`/`.css`, `RadioButton.tsx`/`.css`, `AccordionContainer.tsx`/`.css` —
  unaffected; `autoHeight` is optional and none of these consumers pass it.
- `useAutoPanelOrientation.ts` — its own logic (measure `ref.current.parentElement`, resolve row/column
  against `AUTO_PANEL_ROW_MIN_WIDTH`) is unchanged; only *what element it ends up measuring* changes for
  top-level panels, as a structural consequence of §1.3's new wrapper, not a code change to this file.
- `src/types/controls.ts` — `DirectionalPanelSchema`/`ControlSchema` are unchanged (confirmed intent).
- Every real `DirectionalPanel` call site (`AudioSettingSection.tsx`, `PingContourDrawer.tsx`,
  `PingControlsDrawer.tsx`, `SignatureArrayDrawer.tsx`, `AudioRigDrawer.tsx`, `LfoTargetGroup.tsx`) — the
  `{ schema, children }` props contract is byte-for-byte unchanged, so no call site needs to change; which
  instances get a facade is resolved entirely by §1.2's Context, not by any caller passing a new flag.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — no new global custom property.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **The facade's `popped` prop is the literal `true`, never a variable**, exactly like AccordionContainer's
  own facade — `DirectionalPanel` has no domain state of its own to key it off, and none should be invented.
* **`skipMountAnimation` is always passed** alongside the literal `popped` — the facade must never play a
  pop-in flourish on mount.
* **`autoHeight` is optional and purely additive on `CabinetBox`** — do not change the default (`false`)
  behavior for any existing consumer, and do not touch `Button.tsx`/`Toggle.tsx`/`RadioButton.tsx`/
  `AccordionContainer.tsx`'s own call sites as a side effect.
* **No `ResizeObserver` is added to `CabinetBox.tsx`** — §1.1's CSS-percentage approach is deliberate; do
  not reach for a JS measurement solution for this prop.
* **The Context (`DirectionalPanelNestingContext`) stays internal to `DirectionalPanel.tsx`** — not
  exported, not part of any public API. Tests observe behavior (is a facade rendered or not), never the
  context object directly.
* **No timer-based animation of any kind** — the facade never transitions, by design; do not introduce
  `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's files.
* **GSAP never calls `AudioEngine`.** Unchanged from every prior item — `DirectionalPanel` has no
  `onChange` of its own to protect, but `CabinetBox`'s own internals remain unmodified in this regard.
* **No `timelineMap` entry is ever actually written for the facade** — same reasoning as AccordionContainer
  §1.2: `popped` never changes after mount, so `CabinetBox`'s own `isFirstRun && skipMountAnimation` branch
  (a direct `gsap.set()`, no tween, no `setTimeline` call) is the only code path this instance ever takes.
* **No accent tint, no `boxHeight` override** — §1.5; do not add a `[data-state]`/`.isActive`-keyed color
  rule or a tuned height constant for this consumer.
* **The direct-child-combinator selectors (§1.3) must not be loosened to plain descendant selectors** — a
  descendant selector would incorrectly restyle every child control's own nested `CabinetBox` front face.
* **No new `ControlSchema` variant, no schema field addition.** `DirectionalPanel`'s `{ schema, children }`
  props contract is byte-for-byte unchanged.
* **Out of scope, per the intent doc:** any change to `DirectionalPanel`'s own orientation/wrap/`auto`-
  resolution *logic* (only what element gets measured changes, not the logic itself); zero-padding the
  facade; any animation on the facade; `Select`, `TextInput`/`CoordsInput` (roadmap 11.1.8–11.1.9, unrelated
  items).

---

## 4. Code Style & Architecture Conventions

**`src/components/ui/controls/CabinetBox.tsx`** (excerpt — full file otherwise unchanged from its
AccordionContainer-era state):

```tsx
interface CabinetBoxProps {
  popped: boolean | number;
  timelineKey: string;
  boxHeight?: number;
  popDistance?: number;
  frontWidth?: number;
  frontHeight?: number;
  zIndex?: number;
  skipMountAnimation?: boolean;
  /** See docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1.1 — full doc
   *  comment there. */
  autoHeight?: boolean;
  children?: ReactNode;
}

export function CabinetBox({
  popped, timelineKey, boxHeight: boxHeightOverride, popDistance, frontWidth, frontHeight,
  zIndex, skipMountAnimation, autoHeight, children,
}: CabinetBoxProps) {
  // ...unchanged...

  return (
    <div ref={wrapperRef} className="sc-cabinet-box" style={cabinetTokens}>
      <div className="sc-cabinet-box__backing" aria-hidden="true" />
      <div className="sc-cabinet-box__walls" aria-hidden="true">
        <div
          ref={topFaceRef}
          className="sc-cabinet-box__top-face"
          style={{ width: `${width}px`, height: `${resolvedPopDistance}px` }}
        />
        <div
          ref={leftFaceRef}
          className="sc-cabinet-box__left-face"
          style={{ width: `${2 * resolvedPopDistance}px`, height: autoHeight ? '100%' : `${leftFaceHeight}px` }}
        />
      </div>
      <div ref={frontRef} className="sc-cabinet-box__front" style={frontStyle}>
        {children}
      </div>
    </div>
  );
}
```

**`src/components/ui/controls/DirectionalPanel.tsx`** (full replacement):

```tsx
import { createContext, useContext, useRef, type ReactNode } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { useAutoPanelOrientation } from './useAutoPanelOrientation';
import type { DirectionalPanelSchema } from '@/types/controls';
import './DirectionalPanel.css';

interface DirectionalPanelProps {
  schema: DirectionalPanelSchema;
  children: ReactNode;
}

// Internal only — not exported. Defaults to false ("not yet inside a
// DirectionalPanel"); every instance re-provides `true` to its own children
// regardless of whether it renders its own facade, so a panel nested several
// levels deep still correctly reads as nested. See
// docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1.2.
const DirectionalPanelNestingContext = createContext(false);

/**
 * A pure layout container — groups already-rendered controls into a row or
 * column flex box. No value/onChange, no state of its own beyond 'auto'
 * orientation's own measured resolution (unlike AccordionContainer's
 * open/closed useState). 'row' is the default orientation when
 * schema.orientation is omitted, and 'row' never wraps (docs/specs/
 * DIRECTIONAL_PANEL.md §1.4) — an overflowing row is solved with a nested
 * DirectionalPanel, not a wrap prop on this one. 'auto' resolves via
 * useAutoPanelOrientation, measuring this panel's own parent element and
 * going 'row' once there's enough room, 'column' otherwise
 * (docs/tasks/DIRECTIONAL_PANEL_WIRING.md follow-up fix).
 *
 * Renders through a permanently-popped, non-animating CabinetBox facade
 * ("Oblique Cabinetry — DirectionalPanel") whenever this instance is
 * top-level — not itself nested inside another DirectionalPanel's own
 * children, detected via DirectionalPanelNestingContext rather than a prop,
 * since the same call site can be top-level in one caller and nested in
 * another (AudioRigDrawer's renderBlock(), see the intent doc's own Scope
 * section). A nested instance renders exactly as before, unframed. See
 * docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1 for the full
 * derivation, including why this needed one small additive change to
 * CabinetBox itself (autoHeight, §1.1).
 */
export function DirectionalPanel({ schema, children }: DirectionalPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const orientation = useAutoPanelOrientation(ref, schema.orientation ?? 'row');
  const isNested = useContext(DirectionalPanelNestingContext);

  const panel = (
    <div className="sc-directional-panel" ref={ref}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <div className="sc-directional-panel__content" data-orientation={orientation}>
        {children}
      </div>
    </div>
  );

  const content = isNested ? panel : (
    <div className="sc-directional-panel-facade">
      <CabinetBox
        popped
        skipMountAnimation
        autoHeight
        timelineKey={`cabinet-directional-panel-facade-${schema.id}`}
      >
        {panel}
      </CabinetBox>
    </div>
  );

  return (
    <DirectionalPanelNestingContext.Provider value={true}>
      {content}
    </DirectionalPanelNestingContext.Provider>
  );
}
```

**`src/components/ui/controls/DirectionalPanel.css`** (additions — existing rules unchanged):

```css
/* Oblique Cabinetry facade wrapper — only rendered for a top-level
   DirectionalPanel (DirectionalPanel.tsx's own isNested check). Direct-child
   combinators, not descendant selectors: a child control's own nested
   CabinetBox (a Slider, Button, etc. rendered somewhere inside `children`)
   must never be caught by either rule. See
   docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1.3. */
.sc-directional-panel-facade > .sc-cabinet-box {
  width: 100%;
}

/* display: block + height: auto (overriding CabinetBox.css's own fixed
   height: var(--cabinet-box-height) default by selector specificity) lets
   the front face size itself to .sc-directional-panel's own real content
   height — exactly what CabinetBox.tsx's new autoHeight prop (§1.1) expects
   its left-face wall to be measured against. Vertical padding added
   (12px, not CabinetBox.css's own horizontal-only default) since this
   facade frames a whole block of content, not one centered line. */
.sc-directional-panel-facade > .sc-cabinet-box > .sc-cabinet-box__front {
  display: block;
  width: 100%;
  height: auto;
  padding: 12px 14px;
}
```

* **Naming conventions:** `autoHeight` (camelCase boolean prop, matching `skipMountAnimation`'s own naming),
  `DirectionalPanelNestingContext` (PascalCase, internal), `sc-directional-panel-facade` (new wrapper
  class, `sc-` prefix matching every other primitive), `` `cabinet-directional-panel-facade-${schema.id}` ``
  (timelineMap key, mirroring `` `cabinet-accordion-facade-${schema.id}` ``).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines
  actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.

* **`CabinetBox.test.tsx` (modified, new cases)** — every existing assertion stays unchanged and passing
  (`autoHeight` is optional and no existing test passes it):
  1. **"sizes the left-face wall to 100% when `autoHeight` is true, instead of a pixel value"** —
     `render(<CabinetBox popped timelineKey="test-box" autoHeight>x</CabinetBox>)`; assert the left-face
     wall element's inline `height` style is `'100%'`.
  2. **"sizes the left-face wall to a pixel value when `autoHeight` is omitted"** (regression guard) —
     `render(<CabinetBox popped timelineKey="test-box" boxHeight={48}>x</CabinetBox>)`; assert the
     left-face wall's inline `height` style is `'48px'`, not `'100%'` — proves the new prop doesn't leak
     into the default path.
  3. **`Button`'s/`Toggle`'s/`RadioButton`'s/`AccordionContainer`'s own call sites are untouched** —
     `git diff` on each is empty for this task (verification step, not a unit test).

* **`DirectionalPanel.test.tsx` (modified)** — mocks `CabinetBox` (following every consumer's own
  precedent):
  ```tsx
  vi.mock('./CabinetBox', () => ({
    CabinetBox: ({ timelineKey, children }: { timelineKey: string; children?: React.ReactNode }) => (
      <div data-testid="cabinet-box" data-timeline-key={timelineKey}>{children}</div>
    ),
  }));
  ```
  Every existing test stays unchanged and passing **except**:

  1. **"observes its own parent element, not its own box" — restructured.** The old version asserted a
     *standalone* (therefore now top-level, now facaded) panel's `parentElement` is the literal sentinel
     div immediately outside it — no longer true, since that parent is now `.sc-cabinet-box__front`'s mock
     stand-in (§1.4). Split into two cases:
     - **Nested panel still measures its true parent** — render an outer `DirectionalPanel` containing an
       inner one with `orientation: 'auto'`; assert the inner panel's `.sc-directional-panel`'s
       `parentElement` is the outer's own `.sc-directional-panel__content` — exactly the old assertion's
       intent, now made against a genuinely-nested instance (the case that still behaves identically).
     - **Top-level panel now measures the facade's own wrapper, not the true DOM parent** — render a
       standalone `orientation: 'auto'` panel inside a `data-testid="parent"` sentinel div (the old test's
       own setup); assert `MockResizeObserver.instances` still has length 1, and that the observed
       parent is the mocked `[data-testid="cabinet-box"]` element, not the sentinel div — the real,
       intended consequence of §1.4, pinned as an explicit regression guard rather than left implicit.

  New coverage:

  2. **"renders through a CabinetBox facade when top-level"** — a standalone panel renders exactly one
     `[data-testid="cabinet-box"]`, with `data-timeline-key="cabinet-directional-panel-facade-<schema.id>"`.
  3. **"renders no facade when nested inside another DirectionalPanel"** — an outer panel containing an
     inner one renders exactly **one** `[data-testid="cabinet-box"]` total (the outer's), not two — the
     inner one contributes none.
  4. **"a panel nested inside a nested panel (3 levels) still renders no facade for the 2nd or 3rd level"**
     — confirms the Context propagates transitively, not just one level deep.
  5. **Every existing render/label/orientation/children-order test still passes unmodified** — verified by
     re-running the full file, not assumed; the mock passes `children` straight through, so none of these
     assertions (which query `.sc-directional-panel`/`.sc-directional-panel__content`/label text) should
     need to change.

* **Verification Steps:**
  1. `npx vitest run src/components/ui/controls/CabinetBox.test.tsx src/components/ui/controls/DirectionalPanel.test.tsx`
     passes.
  2. `npm run build:types` — zero TypeScript errors.
  3. `npm run lint` — zero ESLint errors.
  4. `npm run build` — production bundle builds cleanly.
  5. `npm test` (full suite) — including every real consumer's own test file (`AudioSettingSection.test.tsx`,
     `PingContourDrawer.test.tsx`, `PingControlsDrawer.test.tsx`, `SignatureArrayDrawer.test.tsx`,
     `AudioRigDrawer.test.tsx`, `LfoTargetGroup.test.tsx`). Several of these use
     `.closest('.sc-directional-panel')`/`:scope > .sc-directional-panel__content`-style queries to check
     nesting relationships **between** `DirectionalPanel` instances — audited during Specify and expected to
     be unaffected, since the new facade wrapper only ever inserts *above* a top-level panel, never between
     two already-nested `.sc-directional-panel` elements — but this must be confirmed by actually running
     the suite, not assumed from the audit alone. The 2 pre-existing/unrelated failures already recorded in
     AccordionContainer's own plan (`audioRigConfig.test.ts`'s slider-orientation-classification case,
     `AudioRigDrawer.test.tsx`'s 3-Band-EQ row-orientation case) are expected to still be present and still
     unrelated.
* **Manual check:** load the app and confirm, across at least one panel from each real consumer (Ping
  Controls' Phrasing/Frequency panels, Ping Contour's Envelope panel, Signature Array's Drift/per-layer
  panels, Audio Rig's Speed & Automation / EQ & Filters / Time & Space / a plain effect block like
  Compressor):
  1. Every top-level panel renders framed in a permanently-popped facade, at rest, with no animation ever —
     including across a breakpoint-crossing resize.
  2. Nested panels (Rhythm inside Phrasing; the EQ/filter sub-panels; the delay/reverb/compressor sub-rows)
     render unframed, sitting directly inside their own top-level panel's facade — confirm no facade-inside-
     facade stacking anywhere.
  3. `orientation="auto"` panels (EQ & Filters' own row-when-there's-room layout) still flip correctly
     between row/column at the expected width — confirm the ~28px facade-padding offset (§1.4) doesn't
     visibly misfire the threshold in practice.
  4. The facade's own vertical padding reads correctly against both a short (one-row) panel and a tall
     (multi-row EQ block) panel — no content crammed against the top/bottom walls, no excessive dead space.
  5. No popped-box wall/glow bleed between a top-level panel's own facade and any `CabinetBox`-rendered
     child control sitting near its edge.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** a short note under `DirectionalPanel`'s existing section —
  its internal rendering changed for top-level instances only (a permanently-popped `CabinetBox` facade,
  detected via an internal Context rather than a caller-supplied flag) while its `{ schema, children }`
  contract stayed byte-for-byte identical. Should also note `CabinetBox`'s own new `autoHeight` capability,
  the same way `Toggle`'s additive changes got a mention in `Toggle`'s own note.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/cabinetry-directional-panel`, following this series' own per-item
  branch-per-phase convention.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences.
  Suggested grouping, each independently reviewable: (1) `CabinetBox.tsx`/`.test.tsx` (the additive
  `autoHeight` prop, no consumer wired yet); (2) `DirectionalPanel.tsx`/`.css`/`.test.tsx` (the real
  consumer); (3) `docs/COMPONENT_LIBRARY.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, not left open):

- ~~Structural placement — one facade per `DirectionalPanel`, or something coarser/finer?~~ **Resolved:
  one facade per top-level instance, wrapping the whole panel** (§1.2/§1.3, confirmed intent).
- ~~"Top-level" detection mechanism~~ **Resolved: React Context, not a per-call-site prop** (§1.2) — the
  intent doc's own audit found the same call site (`renderBlock()`) is top-level in one caller and nested
  in another, ruling out a static flag.
- ~~No accent tint, no `boxHeight` override~~ **Resolved, matching AccordionContainer's own facade** (§1.5).

**Resolved by direct reasoning during Specify — the one place this spec deliberately diverges from what the
interview floated, flagged prominently rather than silently substituted:**

1. **`CabinetBox`'s height-sizing mechanism.** The intent doc's own Success section describes "live height
   measurement... a second `ResizeObserver`" — confirmed during the interview as the recommended option
   over "a different approach." Working through the actual implementation during Specify found a simpler
   mechanism that achieves the *identical* confirmed outcome (the left-face wall correctly matches variable
   content height) with no new measurement at all: `height: 100%` on the wall, resolved via the same CSS
   percentage-against-a-positioned-ancestor mechanism `.sc-cabinet-box__backing` already uses today (§1.1).
   This is smaller, simpler, and has zero timing/lag risk compared to a `ResizeObserver`, and is safe
   specifically because this facade never animates. **Surfaced here for explicit review**, not treated as
   equivalent-and-therefore-silently-swapped: if there's a reason the heavier `ResizeObserver` version is
   actually wanted (e.g. a future animating consumer, though none exists yet and nothing here forecloses
   adding one later), that's worth saying before this ships.

Carried forward from the intent doc, not blocking this plan:

2. **The `orientation="auto"` measurement-target shift for top-level panels** (§1.4) — a real, accepted
   consequence, not a bug, but genuinely new behavior for the one existing test that directly asserted the
   old target. Pinned as an explicit regression guard (§5, case 1) rather than left as a silent behavior
   change a future contributor might "fix" back.
3. **`AUTO_PANEL_ROW_MIN_WIDTH = 640`** (`useAutoPanelOrientation.ts`) was already flagged as "first-pass,
   confirm visually" before this phase; the facade's ~28px padding offset is one more reason the manual
   check (§5) matters here, not just a formality.

No risks carried forward from 11.1.1/11.1.2/11.1.7 apply here in a new way — `cabinetGeometry.ts`/
`cabinetAnimation.ts`/`useCabinetBoxHeight.ts` are reused entirely unmodified, and `autoHeight` (§1.1) is
additive to `CabinetBox.tsx`'s own already-shipped, test-covered structure.
