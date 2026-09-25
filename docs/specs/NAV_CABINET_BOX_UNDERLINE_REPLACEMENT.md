# Phase Spec: Replace Nav Row Underline with a Colored Cabinet Box

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/nav-cabinet-box-underline-replacement.md](../intent/nav-cabinet-box-underline-replacement.md), confirmed via `/interview-me`, 2026-09-25. Prior art this spec follows directly: `CabinetBox.tsx`/`.css` (`docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md`) — the shared pop primitive this phase extends with 2 new optional props; `UnderlineLink.tsx`/`UnderlineLinkNavRow.tsx` (`docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md`) — the exact component pair being replaced; `NavTreeNode.tsx`'s existing `resolvedColor`/`inheritedColor` ancestor-trait resolution, reused unchanged; `traitColors.ts`'s `getTraitColorStyle`/`getRobotColorStyle` (unchanged); `Toggle.tsx`'s bare/textless `CabinetBox` usage as the closest existing precedent for a childless box. **Status: not started.** Everything below is a proposal for Crawford's review — §1.2 and §1.3 are corrections/discoveries beyond what the intent doc itself settled, and need an explicit yes before Phase 3 (Tasks) is written.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today

Per direct source reading (`CabinetBox.tsx`/`.css`, `UnderlineLink.tsx`/`.css`, `UnderlineLinkNavRow.tsx`/`.css`, `NavTreeNode.tsx`, `cabinetGeometry.ts`, `useCabinetBoxHeight.ts`, `Button.css`, `Toggle.css`, `CabinetBox.test.tsx`):

- `NavTreeNode.tsx` already resolves a per-row accent color in JS (`resolvedColor`, computed from `node.color ?? node.trait ?? inheritedColor`, relayed to every child regardless of that child's own chrome) and passes it as a plain string prop — `UnderlineLinkNavRow`'s `color` — down to `UnderlineLink`, which applies it as an inline `--underline-link-color` custom property. This resolution logic is **already correct and unaffected by this phase** — see §1.2's intent doc reference; this spec only changes what consumes the resolved value.
- `UnderlineLink.tsx` (`sc-underline-link`, 4px tall, `width: 100%`) is a single-axis GSAP `y` tween (0 → 4px) registered in `timelineMap`, reusing `cabinetAnimation.ts`'s `getCabinetPopDuration`/`getCabinetPopEase` — no oblique wall geometry, no `CabinetBox` involvement at all.
- `CabinetBox.tsx`/`.css` has **no color-override mechanism today** — every color it renders (`.sc-cabinet-box__backing`'s `--color-accent-gradient` tint, `.sc-cabinet-box__top-face`/`.sc-cabinet-box__left-face-inner`'s `color-mix(... var(--color-accent) ...)`, `.sc-cabinet-box__front`'s `--color-surface` default) reads directly off the single global `--color-accent`/`--color-accent-gradient`/`--color-surface` custom properties — the same ones every trait/robot color style (`getTraitColorStyle`/`getRobotColorStyle`) sets via ordinary CSS cascade on an ancestor element. There is no prop that lets one `CabinetBox` instance render a different color than whatever it inherits from the DOM tree around it.
- **`CabinetBox.tsx` unconditionally floors its own rendered height at 44px** (`` '--cabinet-box-height': `${Math.max(boxHeight, 44)}px` `` — added `ffec8fd`, "taking a pass over the header," for Header's own touch-target-sized controls), **and this is directly tested** (`CabinetBox.test.tsx`: *"floors --cabinet-box-height at 44px, even when a smaller boxHeight override is given"*) — not an oversight, a deliberate accessibility floor. See §1.3 — this directly blocks the confirmed intent's "~4px resting height."
- `NavTreeNode.css`'s own `.nav-tree-node` reset (unrelated to this phase, already resolved by the prior phase's §1.2) plays no role here — this phase only touches how the row's already-resolved color reaches the box, not how it's resolved.

### 1.2 Confirmed from the intent doc, restated precisely

- `CabinetBox.tsx`/`.css` gets a new **optional** color-override prop (confirmed directly with Crawford: edit `CabinetBox` itself, not a sibling component) — applied to backing, walls, **and** front face, unlike `Button`'s existing accent-only-on-front-with-text precedent. Every part of the box renders in the override color when given; omitted, every existing consumer (`Button`, `Toggle`, `RadioButton`, `VoxelTrack`, `AccordionContainer`) is byte-for-byte unaffected.
- Color **resolution** (which value gets passed in) is unchanged — still `NavTreeNode.tsx`'s existing `resolvedColor` (§1.1), just handed to `CabinetBox` instead of `UnderlineLink`.
- Full row width, thin (~4px) resting height, 4px pop distance, same location beneath the label, no text/children.
- `UnderlineLink.tsx`/`.css`/`.test.tsx` are **deleted**, not kept as dead code. `UnderlineLinkNavRow.tsx`/`.css`/`.test.tsx` are **renamed** — this spec proposes `NavCabinetRow`/`sc-nav-cabinet-row`/`cabinet-nav-row-${node.id}` (§3), matching `CabinetBox`'s own `cabinet-toggle-${id}`/`cabinet-button-${id}` timelineKey convention; final name is Crawford's call, not fixed by this spec.

### 1.3 Correction — the 44px minimum height floor blocks a ~4px box, and is worse than cosmetic

`resolvedColor` and `boxHeight` are independent, unrelated to the floor's own logic, so this is purely about `boxHeight`. Reading `CabinetBox.tsx` closely (not just the tested `--cabinet-box-height` custom property) surfaces two separate problems, not one:

1. **The visible front face is forced to 44px tall regardless of `boxHeight`.** `.sc-cabinet-box__front`'s CSS reads `height: var(--cabinet-box-height)`, and that custom property is always `Math.max(boxHeight, 44)}px` — passing `boxHeight={4}` today produces a 44px-tall visible rectangle, not 4px. The confirmed intent's "~4px, first-pass, you're a little skeptical it's even thin enough" is not merely *not thin enough* under today's `CabinetBox` — it is not thin at all; the floor entirely overrides the requested value.
2. **The left-face wall's height does NOT go through the same floor** — `leftFaceHeight = frontHeight ?? boxHeight` uses the raw, unclamped `boxHeight` variable directly as an inline style, never the floored `--cabinet-box-height` custom property. Passing `boxHeight={4}` today would size the left-face wall to a true 4px while the front face renders at 44px — a real geometry/visual mismatch, not just an unwanted size, if the floor is left in place unmodified for this consumer.

**Resolution proposed here:** a new optional prop, `enforceMinTouchHeight?: boolean` (default `true` — every existing consumer keeps the floor with zero code change). `NavCabinetRow`'s own `CabinetBox` call passes `enforceMinTouchHeight={false}`, and the floor calculation becomes `` `${Math.max(boxHeight, enforceMinTouchHeight ? 44 : 0)}px` ``. This is a real accessibility floor for an actual touch target (Header's Mute button, sized exactly to the box) — it must stay `true` by default. It's correctly skippable here specifically because **the box itself is not the touch target**: the row's own `<button className="sc-nav-cabinet-row">` (unchanged from `UnderlineLinkNavRow`'s existing pattern) is the real click/tap target, sized by its own row layout, not by the decorative `CabinetBox` nested inside it — exactly the same "real interactive element stays in charge, decorative child renders the visuals" split `Button.tsx`'s own `.sc-button`/`CabinetBox` split already established (`docs/COMPONENT_LIBRARY.md`'s own `Button` entry).

This needs an explicit yes: the alternative (leaving the floor unconditional) is a real dead end — the confirmed ~4px design is not merely tunable-later-if-too-thin, it is currently unreachable at all through `CabinetBox`'s existing code path.

### 1.4 What's changing, at a glance

1. **`CabinetBox.tsx`/`.css` gains 2 new optional props:** `color?: string` (§4.1) and `enforceMinTouchHeight?: boolean` (§1.3/§4.1). Both additive and default-preserving — no existing consumer's rendered output changes.
2. **`UnderlineLink.tsx`/`.css`/`.test.tsx` deleted.**
3. **`UnderlineLinkNavRow.tsx`/`.css`/`.test.tsx` renamed** to `NavCabinetRow`/`sc-nav-cabinet-row` (§3), now rendering a bare `CabinetBox` (full-width, ~4px tall, 4px pop distance, colored) instead of `UnderlineLink`.
4. **`NavTreeNode.tsx`** swaps its `UnderlineLinkNavRow` import/usage for `NavCabinetRow` — `resolvedColor`/`inheritedColor` computation is untouched (§1.1).
5. **Docs updated:** `docs/COMPONENT_LIBRARY.md`'s existing `UnderlineLink`/`UnderlineLinkNavRow` section (lines 217–225) rewritten in place for `NavCabinetRow`; `docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md` left as-is (historical record of the prior design), cross-referenced from the new `COMPONENT_LIBRARY.md` text instead of rewritten.

---

## 2. Color & Sizing Mapping

`CabinetBox`'s new `color` prop is one already-resolved CSS color string (a `color-mix()` expression, a raw hex, or a `var(--color-accent)` fallback — exactly what `NavTreeNode.tsx`'s `resolvedColor` already produces today for `UnderlineLinkNavRow`), never a `Trait`/2-tone pair — no new color derivation, per the confirmed intent's "no new color-resolution logic."

```typescript
// NavTreeNode.tsx — only the row-chrome branch changes; resolvedColor itself is untouched (§1.1).
{useUnderlineChrome ? (
  <NavCabinetRow
    node={node}
    color={resolvedColor}
    onClick={() => { select(node.id); scrollToSection(node.id); }}
  />
) : ( /* unchanged Button+CabinetBox+Toggle branch */ )}
```

`NavCabinetRow`'s own `CabinetBox` call (§5.2) is the only place `enforceMinTouchHeight={false}` and the ~4px `boxHeight`/`popDistance` values are set — nothing upstream needs to know about either.

---

## 3. Target File Structure

```text
src/components/ui/controls/
    ├── CabinetBox.tsx                  # MODIFIED — new optional `color`/`enforceMinTouchHeight` props (§4.1)
    ├── CabinetBox.css                  # MODIFIED — color rules read `var(--cabinet-box-color, var(--color-accent...))` (§4.1)
    ├── CabinetBox.test.tsx             # MODIFIED — new coverage for both props (§6)
    ├── UnderlineLink.tsx               # DELETED
    ├── UnderlineLink.css               # DELETED
    └── UnderlineLink.test.tsx          # DELETED

src/components/panels/screen/nav/
    ├── NavCabinetRow.tsx               # NEW — renamed from UnderlineLinkNavRow.tsx (§5.2)
    ├── NavCabinetRow.css               # NEW — renamed from UnderlineLinkNavRow.css
    ├── NavCabinetRow.test.tsx          # NEW — renamed from UnderlineLinkNavRow.test.tsx, retargeted
    ├── UnderlineLinkNavRow.tsx         # DELETED
    ├── UnderlineLinkNavRow.css         # DELETED
    ├── UnderlineLinkNavRow.test.tsx    # DELETED
    ├── NavTreeNode.tsx                 # MODIFIED — swaps UnderlineLinkNavRow for NavCabinetRow (§2)
    └── NavTreeNode.test.tsx            # MODIFIED — renamed references only, same assertions

docs/
└── COMPONENT_LIBRARY.md                # MODIFIED — UnderlineLink/UnderlineLinkNavRow section rewritten for NavCabinetRow + CabinetBox's 2 new props
```

**Explicitly not touched, and why:**

- `useNavTree.ts` (`isDeepestTwoLevels`/`isAutoExpandTier`/`isCollapsible`) — this phase changes row *chrome* only, not which levels get it or how expansion works. Untouched.
- `uiStore.ts` — no new state; `color`/`enforceMinTouchHeight` are plain render-time props, matching this codebase's established "derive from context, don't store" convention (`docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md` §4).
- `cabinetGeometry.ts`/`cabinetAnimation.ts`/`useCabinetBoxHeight.ts` — no new geometry or timing derivation; `NavCabinetRow` passes literal `boxHeight`/`popDistance` overrides through `CabinetBox`'s existing prop contract, the same mechanism `Toggle`'s fixed 44px square already uses.
- Every other `CabinetBox` consumer (`Button`, `Toggle`, `RadioButton`, `VoxelTrack`, `AccordionContainer`) — both new props are optional and additive; none of these pass either one, so none change.
- `NavTreeNode.css` — no change; the `.nav-tree-node` reset and its interaction with `resolvedColor` (§1.1) are unaffected by what consumes `resolvedColor` downstream.
- `traitColors.ts` — `getTraitColorStyle`/`getRobotColorStyle` are unchanged; `resolvedColor`'s shape (a single string, already what `getTraitColorStyle(...)['--color-accent']` produces) is exactly what `CabinetBox`'s new `color` prop expects, with no adapter needed.

---

## 4. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §3 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Both new `CabinetBox` props are optional and default-preserving.** `color` omitted ⇒ every rule falls back to `var(--color-accent)`/`var(--color-surface)` exactly as today (byte-for-byte identical CSS output for every existing consumer). `enforceMinTouchHeight` omitted ⇒ defaults to `true`, the exact 44px floor that exists today, unconditionally — the existing `CabinetBox.test.tsx` floor test must keep passing unmodified.
* **`enforceMinTouchHeight={false}` is used ONLY by `NavCabinetRow`.** No other existing consumer passes it. Do not retroactively "fix" Header's Mute button or any other real touch target to use it — the floor exists specifically to protect those.
* **`color`, when provided, applies to backing, both walls, AND the front face** (§1.2) — not walls-only (the `Toggle`/`RadioButton`-unselected precedent) and not front-only (the `Button` precedent). This is a third, new combination; do not reuse an existing CSS selector pattern that only covers 2 of the 3 parts.
* **`UnderlineLink.tsx`/`.css`/`.test.tsx` are deleted outright, not deprecated or left in place unused** — per this codebase's own demonstrated convention (`AccordionContainer`'s status-light removal, `NAV_LAYOUT_REWRITE.md` Task 21, and the prior phase's own removal of 4 dead `uiStore` fields).
* **`NavCabinetRow` renders `CabinetBox` with no `children`** — matching `Toggle`'s bare/textless precedent exactly (`CabinetBoxProps.children` is already optional). Do not add placeholder content.
* **The transparent `<button className="sc-nav-cabinet-row">` computes `popped` exactly as `UnderlineLinkNavRow` does today** (local `hovered`/`focused`/`pressed` state, no `disabled` concept) — this logic is unchanged, only what it's passed into (`CabinetBox` instead of `UnderlineLink`) changes.
* **Full-width sizing is CSS, not a new `CabinetBox` prop** — `NavCabinetRow.css` sets `width: 100%` on `.sc-cabinet-box`/`.sc-cabinet-box__front` scoped under `.sc-nav-cabinet-row`, the same "CSS decides, the existing `ResizeObserver` measurement picks up the real width" pattern `CabinetBoxProps.frontWidth`'s own doc comment already describes for `VoxelTrack`. Do not add a `fullWidth` prop to `CabinetBox` itself.
* **Row height/pop-distance values (~4px each) are a first-pass, exactly carried over from `UnderlineLink`'s existing `UNDERLINE_POP_DISTANCE = 4` constant and today's 4px bar height** — Crawford has already flagged he's unsure 4px reads well; do not silently pick a different number to "make it look better" without asking. Tunable later in his own manual visual review, same as the original underline pass.
* **Out of scope, per the intent doc:** any change to color resolution/cascade; any change to which tree levels get this treatment; any other `CabinetBox` consumer adopting either new prop.

---

## 5. Code Style & Architecture Conventions

### 5.1 `CabinetBox.tsx`/`.css` — the 2 new props

```typescript
interface CabinetBoxProps {
  // ...existing props unchanged...

  /** Optional per-instance color override — a single already-resolved CSS color string (a
   *  color-mix() expression, hex, or var() reference; NOT a Trait or 2-tone pair — no new color
   *  derivation happens here). When provided, overrides --color-accent/--color-surface for THIS
   *  instance's backing, both walls, AND front face (unlike Button's accent-only-on-front
   *  precedent, which only makes sense when the front carries real text distinguishing it as
   *  "live"). Omitted, every rule falls back to the existing global --color-accent/--color-surface
   *  exactly as before this prop existed — every current consumer (Button/Toggle/RadioButton/
   *  VoxelTrack/AccordionContainer) omits it and is unaffected. First consumer: NavCabinetRow
   *  (roadmap nav panel polish), which needs a full box tinted in a resolved trait/robot color
   *  rather than the single ambient accent. See docs/specs/NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §1.2/§4.1. */
  color?: string;

  /** Optional — false skips the 44px minimum-touch-target floor this component otherwise always
   *  applies to --cabinet-box-height (added `ffec8fd` for Header's own touch-sized controls; see
   *  CabinetBox.test.tsx's own "floors ... at 44px" coverage). Defaults to true — every existing
   *  consumer keeps today's floor unconditionally, zero behavior change. Only correct to pass
   *  false when THIS box is not itself the touch/click target — e.g. NavCabinetRow, where the
   *  real interactive element is the row's own wrapping <button>, and the CabinetBox nested inside
   *  it is purely decorative, the same "real interactive element stays in charge, decorative child
   *  renders the visuals" split Button.tsx's own .sc-button/CabinetBox split already established.
   *  Do not pass false for any box that IS itself the real touch target. See
   *  docs/specs/NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §1.3. */
  enforceMinTouchHeight?: boolean;
}

function CabinetBoxInner({
  popped, timelineKey, boxHeight: boxHeightOverride, popDistance, frontWidth, frontHeight,
  zIndex, skipMountAnimation, autoHeight, color, enforceMinTouchHeight = true, children,
}: CabinetBoxProps) {
  // ...unchanged...

  const cabinetTokens = {
    '--cabinet-box-height': `${Math.max(boxHeight, enforceMinTouchHeight ? 44 : 0)}px`, // CHANGED
    '--cabinet-pop-distance': `${resolvedPopDistance}px`,
    ...(color !== undefined ? { '--cabinet-box-color': color } : {}), // NEW
    ...(zIndex !== undefined ? { zIndex } : {}),
  } as CSSProperties;

  // leftFaceHeight = frontHeight ?? boxHeight — UNCHANGED. Already uses the raw boxHeight, never
  // the floored value (§1.3's 2nd finding) — enforceMinTouchHeight only ever affected the FRONT
  // face's height via --cabinet-box-height; the wall was always correct. No code change needed
  // here specifically, only the front-face floor above — flagged in §1.3 so this isn't missed as
  // "the same bug, fixed twice."
}
```

```css
/* CabinetBox.css — every var(--color-accent...)/var(--color-surface) read below gains a
   --cabinet-box-color override tier. No change to specificity/selector structure — Button.css's
   own more-specific .sc-button .sc-cabinet-box__front rule still wins for Button regardless. */

.sc-cabinet-box__backing {
  /* was: background: var(--color-accent-gradient); */
  background: var(--cabinet-box-color, var(--color-accent-gradient));
  opacity: .4;
  /* ...unchanged... */
}

.sc-cabinet-box__top-face {
  /* was: background-color: color-mix(in srgb, var(--color-accent) 100%, white 20%); */
  background-color: color-mix(in srgb, var(--cabinet-box-color, var(--color-accent)) 100%, white 20%);
}

.sc-cabinet-box__left-face-inner {
  /* was: background-color: color-mix(in srgb, var(--color-accent) 100%, black 25%); */
  background-color: color-mix(in srgb, var(--cabinet-box-color, var(--color-accent)) 100%, black 25%);
}

.sc-cabinet-box__front {
  /* ...unchanged... */
  /* was: background-color: var(--color-surface); */
  background-color: var(--cabinet-box-color, var(--color-surface));
  color: var(--color-text-primary);
}
```

`--cabinet-box-color` is deliberately a single flat color, not a 2-tone gradient pair — `resolvedColor` (§1.1/§2) is already one resolved string (exactly the same "gradient of identical stops = solid fill" simplification `getRobotColorStyle` already relies on elsewhere in this codebase), so the backing's own `background` becomes a solid fill rather than a diagonal gradient specifically when overridden — closest to the original flat-bar look, and consistent with "no new color-resolution logic."

### 5.2 `NavCabinetRow.tsx` (renamed from `UnderlineLinkNavRow.tsx`)

```tsx
import { useState } from 'react';

import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';
import './NavCabinetRow.css';

/** First-pass resting height/pop distance for this row's own bare CabinetBox — carried over
 *  unchanged from UnderlineLink's own UNDERLINE_POP_DISTANCE/4px-tall-bar values (docs/specs/
 *  NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §4 — Crawford has already flagged he's unsure this
 *  reads well this thin; tune later, don't silently change it now). */
const NAV_CABINET_ROW_BOX_HEIGHT = 4;
const NAV_CABINET_ROW_POP_DISTANCE = 4;

interface NavCabinetRowProps {
  node: NavTreeNodeSchema;
  onClick: () => void;
  /** Resolved trait/robot color — either this node's own, or its nearest ancestor's (unchanged
   *  from UnderlineLinkNavRow — see NavTreeNode.tsx's own resolvedColor). Passed straight through
   *  to CabinetBox's new color prop. */
  color: string;
}

/**
 * The tree row chrome for the two deepest nav-tree levels (docs/specs/
 * NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §1.4) — a transparent <button> click target (mirroring
 * Button.css's own .sc-button split) wrapping a plain DualLabel (humanLabel only, no loreLabel)
 * and one bare, textless, full-width CabinetBox beneath it, replacing UnderlineLinkNavRow's flat
 * bar with the same oblique-pop mechanism every other interactive control in the design system
 * uses. `popped` is computed exactly like Button.tsx's own hover/focus/press wiring — no
 * `disabled` concept for a nav row. `enforceMinTouchHeight={false}`: this CabinetBox is not
 * itself the touch target — the <button> wrapping it is — see CabinetBox.tsx's own doc comment
 * and §1.3.
 */
export function NavCabinetRow({ node, onClick, color }: NavCabinetRowProps) {
  const accessibleName = resolveAccessibleName(node);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const popped = hovered || focused || pressed;

  return (
    <button
      type="button"
      className="sc-nav-cabinet-row"
      aria-label={accessibleName}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <DualLabel humanLabel={node.humanLabel} />
      <CabinetBox
        popped={popped}
        timelineKey={`cabinet-nav-row-${node.id}`}
        color={color}
        boxHeight={NAV_CABINET_ROW_BOX_HEIGHT}
        popDistance={NAV_CABINET_ROW_POP_DISTANCE}
        enforceMinTouchHeight={false}
      />
    </button>
  );
}

export default NavCabinetRow;
```

```css
/* NavCabinetRow.css — renamed from UnderlineLinkNavRow.css; .sc-underline-link-nav-row ->
   .sc-nav-cabinet-row, plus the new full-width CabinetBox override (§4). */
.sc-nav-cabinet-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 4px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-text-primary);
  font: inherit;
  text-align: left;
}

.sc-nav-cabinet-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* CabinetBox defaults to inline-flex/content-sized (CabinetBox.css's own .sc-cabinet-box /
   .sc-cabinet-box__front base rules) — this row needs the full row width instead, the same
   "CSS decides, the existing ResizeObserver measurement picks up the real width" pattern
   VoxelTrack's own straddling boxes already rely on (CabinetBoxProps.frontWidth's own doc
   comment) — no new CabinetBox prop needed for this. */
.sc-nav-cabinet-row .sc-cabinet-box,
.sc-nav-cabinet-row .sc-cabinet-box__front {
  width: 100%;
}
```

### 5.3 `NavTreeNode.tsx` — swap only

```tsx
import { NavCabinetRow } from './NavCabinetRow'; // was: import { UnderlineLinkNavRow } from './UnderlineLinkNavRow';

// ...resolvedColor/inheritedColor computation UNCHANGED (§1.1)...

{useUnderlineChrome ? (
  <NavCabinetRow // was: <UnderlineLinkNavRow
    node={node}
    color={resolvedColor}
    onClick={() => { select(node.id); scrollToSection(node.id); }}
  />
) : ( /* unchanged */ )}
```

`useUnderlineChrome` (the local variable name, still reading `isDeepestTwoLevels(node.id)`) is left as-is — renaming it is a cosmetic nicety this spec doesn't require, since it's a private local variable with no external contract; leave for Tasks to decide if it's worth the diff.

### 5.4 Naming and conventions

`NavCabinetRow` (PascalCase component), `sc-nav-cabinet-row` (`sc-` prefix, matching every other primitive/row), `cabinet-nav-row-${node.id}` (timelineKey, matching `CabinetBox`'s own `cabinet-toggle-${id}`/`cabinet-button-${id}`/`cabinet-nav-tree-group-${id}` convention already in `NavTreeNode.tsx`), `color`/`enforceMinTouchHeight` (camelCase props, matching every existing `CabinetBoxProps` field). Formatting matches each touched file's existing style exactly.

---

## 6. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library, colocated test files (matching every file in §3).
* **`CabinetBox.test.tsx` (modified) — new coverage, existing coverage unmodified:**
  1. **Existing "floors --cabinet-box-height at 44px" test is unchanged and must keep passing** — proves `enforceMinTouchHeight`'s default (`true`) preserves today's behavior exactly.
  2. `enforceMinTouchHeight={false}` with a `boxHeight` below 44 produces a `--cabinet-box-height` equal to that smaller value, not 44px.
  3. `enforceMinTouchHeight={false}` with `boxHeight` above 44 is unaffected (the floor never mattered at that size either way) — `Math.max` still does the right thing at the high end.
  4. Omitting `color` entirely: `.sc-cabinet-box` (or its front/wall children) applies no `--cabinet-box-color` inline style — confirms zero behavioral change for every existing consumer's snapshot-equivalent output.
  5. Providing `color="#ff0000"` sets `--cabinet-box-color: #ff0000` as an inline custom property on the wrapper (jsdom-visible; the actual `color-mix()`/`var()`-fallback resolution itself is a real-browser-only concern, same caveat this file's own existing comments already document for `color-mix()`).
  6. `enforceMinTouchHeight`/`color` are independent — passing one has no effect on the other's own test coverage from items 1-3/4-5.
* **`NavCabinetRow.test.tsx` (new, renamed+retargeted from `UnderlineLinkNavRow.test.tsx`):**
  1. Every existing `UnderlineLinkNavRow.test.tsx` assertion (hover/focus/press → `popped` true; click fires `onClick`; `aria-label` matches `resolveAccessibleName`; renders `DualLabel` with `humanLabel` only) carries over unchanged, just against `NavCabinetRow`.
  2. Renders a `CabinetBox` (not an `UnderlineLink`) — assert via a mocked `CabinetBox` (matching `NavTreeNode.test.tsx`'s own existing mocking convention for nested Oblique Cabinetry primitives) receiving `popped`/`color`/`boxHeight={4}`/`popDistance={4}`/`enforceMinTouchHeight={false}`/`timelineKey={cabinet-nav-row-<id>}` — not asserting real CSS output (jsdom limitation, same caveat as above).
  3. Renders no `children`/text inside the `CabinetBox` call.
* **`NavTreeNode.test.tsx` (modified):** every existing assertion referencing `UnderlineLinkNavRow` retargeted to `NavCabinetRow` — same behavior, same coverage, renamed references only. No new test needed here (the underlying `resolvedColor`/`isDeepestTwoLevels` logic this file already covers is unchanged — see §1.1).
* **Deleted:** `UnderlineLink.test.tsx` in full (the component it tests no longer exists), `UnderlineLinkNavRow.test.tsx` (superseded by `NavCabinetRow.test.tsx`, not kept alongside it).
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including the untouched `CabinetBox.test.tsx` 44px-floor test.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** open the nav panel, tab/hover through several rows at the two deepest levels and confirm each pops 4px with the full wall/glow/front-face animation (not a flat translateY), entirely tinted in that row's resolved color — an untraited leaf beneath a traited mid-level node should show the ancestor's color. Confirm the box reads as full row width, not a small square. Confirm `prefers-reduced-motion` still snaps instead of animating (unchanged GSAP timing path). Separately, confirm Header's Mute button and any other existing `CabinetBox` consumer are pixel-identical to before this change (spot-check, not exhaustive — the additive-prop guarantee is what §4/§6's `CabinetBox.test.tsx` coverage is actually proving). Confirm with Crawford directly whether the ~4px height reads well, per his own flagged uncertainty — this is the first real visual check of a concern raised before implementation even started.

---

## 7. Open Questions & Risks

Corrections found during Specify — **both need an explicit yes before Tasks:**

1. **The 44px minimum-height floor blocks the confirmed ~4px design entirely, not just partially (§1.3).** Not mentioned in the confirmed intent (which only discusses the color mechanism, not sizing internals) — discovered by reading `CabinetBox.tsx` closely enough to find `Math.max(boxHeight, 44)` and its own dedicated regression test. Proposed fix: a new `enforceMinTouchHeight?: boolean` prop, default `true`, false only for `NavCabinetRow`. Confirm this is acceptable, or that a different fix (e.g. a fixed alternate floor lower than 44 but above the raw request, or accepting a taller box than originally wanted) is preferred instead.
2. **Deleting `UnderlineLink.tsx`/`.css`/`.test.tsx` outright rather than keeping them as an unused-but-available primitive.** Confirmed via the interview ("rename... to minimize the diff" was explicitly rejected in favor of rename+delete), restated here because it's a real, irreversible-in-git-history-only-not-in-working-tree action worth Crawford's explicit awareness before Tasks executes it.

Still open — flag for Plan/Tasks, not blocking this spec:

3. **Exact final naming** (`NavCabinetRow`/`sc-nav-cabinet-row`/`cabinet-nav-row-${id}`, §3/§5.4) — proposed here, not fixed; Crawford may prefer different names when he actually sees the diff.
4. **Whether `useUnderlineChrome` (the local variable name in `NavTreeNode.tsx`) gets renamed too** (§5.3) — cosmetic only, left for Tasks.
5. **First-pass 4px height/pop-distance may need retuning** after the manual check (§6) — Crawford has already flagged this as likely; not a blocker for writing Tasks, but expect a fast follow-up tuning pass regardless of what ships first.
