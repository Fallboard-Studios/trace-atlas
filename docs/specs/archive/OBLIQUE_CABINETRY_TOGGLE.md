# Phase Spec: Oblique Cabinetry — Toggle (Roadmap Phase 11.1.2)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/oblique-cabinetry-toggle.md](../intent/oblique-cabinetry-toggle.md) (confirmed via `/interview-me`, 2026-09-07). Source of scope: [docs/todo/roadmap.md § 11.1.2](../todo/roadmap.md#1112-oblique-cabinetry-toggle) — the second and last single-box (non-voxel-track) consumer of the shared mechanism [11.1.1](OBLIQUE_CABINETRY_FOUNDATION.md) built on `Button`. Prior art this spec follows directly: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md` in full — `CabinetBox.tsx`/`.css`, `cabinetGeometry.ts`, `cabinetAnimation.ts`, `useCabinetBoxHeight.ts` are all reused unmodified in mechanism, with one small additive change to `CabinetBox.tsx`'s own props (§1.2 below); `Button.tsx`'s own `.sc-button` transparent-click-target / `CabinetBox`-as-visual-child split, mirrored here onto `Switch.Root`. This phase touches presentation only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; `ToggleSchema`/`ControlSchema` are unchanged.

---

## 1. Overview & Claude Explanation

The intent doc resolves every user-facing question already (box replaces the pill+thumb entirely, fixed 32×32px, `DualLabel` stays external, no hover response). Four implementation-shape questions remain, resolved below with real code rather than left to Tasks.

### 1.1 Structural placement: `CabinetBox` replaces `Switch.Thumb`, inside `Switch.Root`

Same split as `Button`: the real interactive element keeps 100% of the interaction (role, `aria-checked`, keyboard, disabled, focus ring), and `CabinetBox` is a `pointer-events: none`-walled visual child of it, never a hit target of its own. For `Button` that element is a `<button>`; for `Toggle` it's Radix's `Switch.Root` (already rendering with `role="switch"` and Radix's own keyboard handling). Concretely, `Switch.Thumb` — the sliding circular indicator — is deleted outright and `CabinetBox` takes its place as `Switch.Root`'s only child:

```tsx
<Switch.Root className="sc-toggle__root" checked={value} onCheckedChange={...} disabled={disabled}>
  <CabinetBox popped={value} boxHeight={CABINET_TOGGLE_BOX_SIZE} timelineKey={`cabinet-toggle-${schema.id}`} />
</Switch.Root>
```

The "stationary hit box" rule from 11.1.1 §1.6 applies: `Switch.Root` is the stationary element every pointer/keyboard interaction targets; the front face slides inside it as a pure visual.

> **Post-implementation correction, 2026-09-09:** 11.1.1 §1.6's own padding-based hit-area *reservation* was later removed (see that section's own correction note) — `Switch.Root`'s hit area, like `Button`'s, now ends at `CabinetBox`'s flat resting footprint rather than extending to cover the popped-out one. The *stationary* part of this rule (the real interactive element never itself moves) still holds exactly as stated above; only the earlier claim that its hit area was sized to include the popped extent no longer does.

### 1.2 A fixed 32×32px box: one small additive change to `CabinetBox`'s own props, not a new component

`CabinetBox` currently has no way to be smaller than its breakpoint-resolved 32/40/48px tier (`useCabinetBoxHeight()` is called unconditionally inside it) or to render without `children` (currently a required prop). Confirmed intent needs both: a fixed 32px box regardless of viewport, with no content at all. Rather than fork a second component, `CabinetBoxProps` gains one new optional field:

```typescript
interface CabinetBoxProps {
  popped: boolean;
  timelineKey: string;
  /** Optional fixed box height, overriding the breakpoint-driven 32/40/48px
   *  default. Toggle (this phase) passes a fixed 32 regardless of viewport —
   *  it sits inline next to its own DualLabel row rather than filling a hub
   *  tile, so there's no content to accommodate at a larger size on wider
   *  breakpoints. */
  boxHeight?: number;
  /** Now optional — Button nests its own DualLabel here; Toggle renders a
   *  bare, textless box and omits this entirely (§1.3). */
  children?: ReactNode;
}
```

`useCabinetBoxHeight()` is still called unconditionally inside `CabinetBox` (Rules of Hooks — a hook can't be called conditionally), its result simply discarded when an override is supplied: `const boxHeight = boxHeightOverride ?? responsiveBoxHeight;`. This is the only change to `CabinetBox.tsx` itself, and it's purely additive — both new props are optional, so `Button`'s existing call site (always passing `children`, never passing `boxHeight`) is untouched and behaves identically.

The box's *width* isn't set via a prop at all — `CabinetBox` still measures the front face's own rendered border-box width via `ResizeObserver`, exactly as today (11.1.1 §1.6). To make that measured width come out to exactly 32px, `Toggle.css` overrides `.sc-cabinet-box__front`'s CSS size, scoped to `.sc-toggle__root` so `Button`'s own content-driven front face is untouched:

```css
.sc-toggle__root .sc-cabinet-box__front {
  width: var(--cabinet-toggle-box-size);
  height: var(--cabinet-toggle-box-size);
  padding: 0;
}
```

`--cabinet-toggle-box-size` is computed once, in `Toggle.tsx`, from the same `CABINET_TOGGLE_BOX_SIZE = 32` constant passed as `CabinetBox`'s `boxHeight` prop — applied as an inline style on `Switch.Root` — rather than a second, independently hand-typed `32px` literal in the CSS file. This follows 11.1.1 §1.3's own precedent exactly (the `--cabinet-box-height`/`--cabinet-pop-distance` duplication collapse, itself a code-review fix on that phase): a magic number written in two places is exactly the class of thing that phase's own review flagged and fixed once already, so this phase doesn't reintroduce it for a new number.

### 1.3 `DualLabel` stays external; the box renders no children at all

Confirmed intent: `DualLabel` was never the switch's own content (unlike `Button`, where the label *is* the button's nested content) and doesn't move. `CabinetBox` is rendered with no `children` — a bare rectangle whose only visual information is its flat/popped state, face-shading, and glow. No placeholder icon, checkmark, or text is added; the intent doc's Success section describes "a bare, textless `CabinetBox`" explicitly, and nothing in scope calls for new content inside it.

### 1.4 `popped` mirrors `value` even when `disabled` — resolved by reasoning, not directly interviewed

The interview confirmed `popped` is driven purely by `checked`/`value`, never by hover/focus/press — but didn't separately ask what a *disabled* toggle's `popped` state should be. Resolved here, flagged explicitly rather than silently assumed: **`popped = value`, unconditionally — `disabled` never overrides it.** This is a deliberate departure from `Button`'s own `!disabled && (...)` guard (11.1.1 §3), and the two aren't actually analogous once compared directly — `Button`'s `popped` is *derived from momentary interaction* (hover/focus/press), and disabling a button correctly suppresses its ability to register those interactions at all. `Toggle`'s `popped` instead mirrors a real, already-committed piece of state (`checked`) that exists independently of whether the control can currently be changed — a disabled-but-checked toggle is still, factually, on, and hiding that by forcing it flat would misrepresent the actual state it's disabled from changing. `disabled` still fully suppresses interaction via `Switch.Root`'s own native handling (Radix), exactly as it does today — nothing about *interactivity* changes, only whether `popped` additionally consults `disabled`.

### 1.5 No hover/focus visual response; the pill/thumb styling is deleted, not layered under

Confirmed intent: hovering or focusing a flat (off) toggle does nothing beyond Radix's existing `:focus-visible` outline — no partial-pop, no hover glow, since `CabinetBox` only exposes a binary `popped` prop with no intermediate state (11.1.1 §3, unchanged here). Concretely, this means `Toggle.css`'s current pill-track styling (`.sc-toggle__root`'s rounded background/`[data-state='checked']` color swap, `.sc-toggle__thumb`'s translate transition, the component-local `prefers-reduced-motion` media query) is **deleted outright**, not layered underneath the new box — `CabinetBox` already owns 100% of the visible on/off signal (flat vs. popped, face-shading, glow) and already handles `prefers-reduced-motion` internally via `cabinetAnimation.ts`, so a second, parallel motion-reduction rule in `Toggle.css` would be dead code from the moment this ships.

---

## 2. Target File Structure

```text
src/
└── components/ui/controls/
    ├── CabinetBox.tsx                # MODIFIED — 2 new optional props (§1.2): `boxHeight?: number`
    │                                 #   overriding useCabinetBoxHeight(), `children?: ReactNode`
    │                                 #   (was required). No other logic change.
    ├── CabinetBox.test.tsx           # MODIFIED — 2 new test cases for the additive props (§5)
    ├── Toggle.tsx                     # MODIFIED — renders through CabinetBox in place of
    │                                 #   Switch.Thumb; exports CABINET_TOGGLE_BOX_SIZE
    ├── Toggle.css                     # MODIFIED — pill/thumb styling deleted; scoped
    │                                 #   .sc-toggle__root .sc-cabinet-box__front size override added
    └── Toggle.test.tsx                # MODIFIED — every existing test stays unchanged and passing;
                                        #   new coverage for popped/boxHeight/timelineKey wiring (§5)

docs/
└── COMPONENT_LIBRARY.md    # MODIFIED — same "internal rendering changed, contract didn't" note
                             #   Button's row already carries, added to Toggle's row (roadmap
                             #   11.1.2's own Docs bullet)
```

**Explicitly not touched, and why:**

- `src/utils/cabinetGeometry.ts`, `cabinetAnimation.ts`, `cabinetBreakpoints.ts`, `useCabinetBoxHeight.ts` — the shared mechanism is reused exactly as 11.1.1 shipped it; nothing about the projection math, timing, or breakpoint tiers changes for this phase.
- `CabinetBox.css` — no new class, no new rule. The 32×32px override lives entirely in `Toggle.css`, scoped to `.sc-toggle__root`, so `CabinetBox.css` stays a shared, consumer-agnostic stylesheet exactly as it is today.
- `Button.tsx`/`.css`/`.test.tsx` — unaffected; `CabinetBox`'s 2 new props are both optional and `Button`'s call site passes neither.
- `src/types/controls.ts` — `ToggleSchema`/`ControlSchema` are unchanged (confirmed intent; no field added).
- `StepperWithToggle.tsx` — composes `Toggle` internally and inherits this change for free with no code of its own to touch; it has no live consumer today (`docs/COMPONENT_LIBRARY.md`), so nothing here is manually re-verified against it beyond its own existing test suite continuing to pass.
- Any domain config (`robotOptionsConfig.ts`, `audioRigConfig.ts`, `companyConfig.ts`, `sectorSettingsConfig.ts`) or drawer component — `Toggle`'s props contract is unchanged, so no call site (e.g. `PingControlsDrawer.tsx`'s Click Track Active toggle) needs to change.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — no new global custom property; `--cabinet-toggle-box-size` is `Toggle.tsx`-local (applied as an inline style on `Switch.Root`), not a global token.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`Switch.Root` keeps 100% of the actual interaction.** `CabinetBox`'s SVG walls carry `pointer-events: none` already (11.1.1, unchanged); nothing in this phase adds a second hit-testable element. Do not give the walls SVG or the front-face `<div>` their own `onCheckedChange`/click handling.
* **No timer-based animation.** This phase adds no new timing logic at all — it reuses `cabinetAnimation.ts`/`CabinetBox.tsx`'s existing GSAP timeline unmodified. Do not introduce `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's files.
* **GSAP never calls `AudioEngine`.** Unchanged from 11.1.1 — `onChange` continues to fire straight from Radix's `onCheckedChange`, entirely independent of the GSAP timeline `CabinetBox` owns.
* **Every GSAP timeline is registered in `timelineMap`**, keyed uniquely per instance (`` `cabinet-toggle-${schema.id}` `` — distinct from Button's own `` `cabinet-button-${schema.id}` `` prefix, so the same `schema.id` reused across a `Button` and a `Toggle` elsewhere in the app can never collide) — this is `CabinetBox`'s own existing behavior, unmodified.
* **`popped` is computed as `value`, in `Toggle.tsx`, not inside `CabinetBox`.** Unconditional — no `!disabled` guard (§1.4). `CabinetBox` itself remains opinion-free about *why* it's popped, exactly as 11.1.1 established.
* **No distinct partial-pop state, and no new hover/focus trigger.** `popped` is binary and keyed only to `value` — confirmed intent explicitly rules out any hover/focus response beyond the existing native focus-visible outline.
* **`CabinetBox`'s 2 new props (`boxHeight`, `children`) are both optional and purely additive.** Do not change `Button.tsx`'s call site or any existing `CabinetBox` test's expectations as a side effect of adding them.
* **No new `ControlSchema` variant, no schema field addition.** `Toggle`'s `{ schema, value, onChange, disabled }` props contract is byte-for-byte unchanged.
* **The old pill/thumb CSS (`.sc-toggle__root`'s background/border-radius/`[data-state]` color rule, `.sc-toggle__thumb`, the component-local `prefers-reduced-motion` block) is deleted, not retained as dead/unused CSS.**
* **Out of scope, per the intent doc:** every slider (11.1.3–11.1.5), `Stepper`/`StepperWithToggle` (dropped from Cabinetry entirely, per 11.1.1), any new hover/partial-pop mechanism, repositioning `DualLabel`, breakpoint-based sizing for this box, and 11.2's accessibility/performance verification pass.

---

## 4. Code Style & Architecture Conventions

**`src/components/ui/controls/CabinetBox.tsx`** (modified — only the props interface and the `boxHeight`/`children` handling change; everything else is byte-for-byte identical to the 11.1.1-shipped file):

```tsx
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import gsap from 'gsap';

import { getCabinetPopDuration } from './cabinetAnimation';
import { useCabinetBoxHeight } from './useCabinetBoxHeight';
import { computeCabinetGeometry, CABINET_POP_DISTANCE } from '@/utils/cabinetGeometry';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import './CabinetBox.css';

interface CabinetBoxProps {
  /** Whether the box should be fully popped (true) or flat (false). The
   *  caller decides *why* — hover/focus/press for Button, `value` (checked)
   *  for Toggle — CabinetBox only renders the resulting boolean. */
  popped: boolean;
  /** Unique timelineMap key for this instance, e.g. `cabinet-button-${schema.id}`
   *  or `cabinet-toggle-${schema.id}`. */
  timelineKey: string;
  /** Optional fixed box height, overriding the breakpoint-driven 32/40/48px
   *  default from useCabinetBoxHeight(). Toggle (roadmap Phase 11.1.2) passes
   *  a fixed 32 regardless of viewport. See
   *  docs/specs/OBLIQUE_CABINETRY_TOGGLE.md §1.2. */
  boxHeight?: number;
  /** Optional — Button nests its own DualLabel here; Toggle renders a bare,
   *  textless box and omits this entirely. See
   *  docs/specs/OBLIQUE_CABINETRY_TOGGLE.md §1.3. */
  children?: ReactNode;
}

export function CabinetBox({ popped, timelineKey, boxHeight: boxHeightOverride, children }: CabinetBoxProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const topFaceRef = useRef<SVGPolygonElement>(null);
  const leftFaceRef = useRef<SVGPolygonElement>(null);
  const [width, setWidth] = useState(0);
  // Always called (Rules of Hooks), even when boxHeightOverride is supplied —
  // its result is simply unused in that case.
  const responsiveBoxHeight = useCabinetBoxHeight();
  const boxHeight = boxHeightOverride ?? responsiveBoxHeight;
  const prevPoppedRef = useRef<boolean | null>(null);

  useEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const borderBoxWidth = entry.borderBoxSize?.[0]?.inlineSize;
      setWidth(borderBoxWidth ?? entry.contentRect.width);
    });
    observer.observe(el, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => killTimeline(timelineKey);
  }, [timelineKey]);

  useEffect(() => {
    if (!frontRef.current || !topFaceRef.current || !leftFaceRef.current || !wrapperRef.current || width === 0) return;
    killTimeline(timelineKey);

    const isTransition = prevPoppedRef.current === null || prevPoppedRef.current !== popped;
    prevPoppedRef.current = popped;

    const target = computeCabinetGeometry(width, boxHeight, popped ? 1 : 0);

    if (!isTransition) {
      gsap.set(topFaceRef.current, { attr: { points: target.topFacePoints } });
      gsap.set(leftFaceRef.current, { attr: { points: target.leftFacePoints } });
      gsap.set(frontRef.current, { x: target.frontFaceOffsetX, y: target.frontFaceOffsetY });
      gsap.set(wrapperRef.current, { '--cabinet-glow': popped ? 1 : 0 });
      return;
    }

    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = getCabinetPopDuration(prefersReducedMotion);
    const from = computeCabinetGeometry(width, boxHeight, popped ? 0 : 1);
    const to = target;

    const tl = gsap.timeline();
    tl.fromTo(topFaceRef.current,
      { attr: { points: from.topFacePoints } },
      { attr: { points: to.topFacePoints }, duration, ease: 'power2.out' }, 0)
      .fromTo(leftFaceRef.current,
        { attr: { points: from.leftFacePoints } },
        { attr: { points: to.leftFacePoints }, duration, ease: 'power2.out' }, 0)
      .fromTo(frontRef.current,
        { x: from.frontFaceOffsetX, y: from.frontFaceOffsetY },
        { x: to.frontFaceOffsetX, y: to.frontFaceOffsetY, duration, ease: 'power2.out' }, 0)
      .fromTo(wrapperRef.current,
        { '--cabinet-glow': popped ? 0 : 1 },
        { '--cabinet-glow': popped ? 1 : 0, duration, ease: 'power2.out' }, 0);
    setTimeline(timelineKey, tl);
  }, [popped, width, boxHeight, timelineKey]);

  const cabinetTokens = {
    '--cabinet-box-height': `${boxHeight}px`,
    '--cabinet-pop-distance': `${CABINET_POP_DISTANCE}px`,
  } as CSSProperties;

  return (
    <div ref={wrapperRef} className="sc-cabinet-box" style={cabinetTokens}>
      <svg className="sc-cabinet-box__walls" aria-hidden="true" focusable="false">
        <polygon ref={topFaceRef} className="sc-cabinet-box__top-face" />
        <polygon ref={leftFaceRef} className="sc-cabinet-box__left-face" />
      </svg>
      <div ref={frontRef} className="sc-cabinet-box__front">
        {children}
      </div>
    </div>
  );
}
```

**`src/components/ui/controls/Toggle.tsx`** (full replacement):

```tsx
import * as Switch from '@radix-ui/react-switch';
import type { CSSProperties } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import { withActiveClass } from './activeClass';
import type { ToggleSchema } from '@/types/controls';
import './Toggle.css';

interface ToggleProps {
  schema: ToggleSchema;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Fixed cabinet-box size for Toggle (roadmap Phase 11.1.2) — deliberately
 * NOT the breakpoint-driven 32/40/48px tiers Button's own content-sized box
 * uses (roadmap 11.1.1). Toggle sits inline next to its own DualLabel row
 * rather than filling a hub tile, so there's no content to accommodate at a
 * larger size on wider viewports. See docs/specs/OBLIQUE_CABINETRY_TOGGLE.md §1.2.
 */
export const CABINET_TOGGLE_BOX_SIZE = 32;

const cabinetTokens = {
  '--cabinet-toggle-box-size': `${CABINET_TOGGLE_BOX_SIZE}px`,
} as CSSProperties;

/**
 * Binary ON/OFF control wrapping @radix-ui/react-switch. Controlled — never
 * manages its own selection state. Renders through CabinetBox (roadmap
 * Phase 11.1.2) as a bare, textless box in place of the previous pill track
 * + sliding thumb — popped-out is the resting "on" state, flat is "off",
 * keyed directly off `value` (never hover/focus/press, unlike Button).
 * `popped` mirrors `value` even when `disabled` — a disabled-but-checked
 * toggle still visually reads as on, just non-interactive; see
 * docs/specs/OBLIQUE_CABINETRY_TOGGLE.md §1.4. The root also carries a plain
 * `isActive` class (alongside Radix's own `data-state` on the switch itself)
 * so a consumer can write `.sc-toggle.isActive { ... }` instead of a
 * `:has()` attribute selector.
 */
export function Toggle({ schema, value, onChange, disabled }: ToggleProps) {
  return (
    <div className={withActiveClass('sc-toggle', value)}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <Switch.Root
        className="sc-toggle__root"
        style={cabinetTokens}
        checked={value}
        aria-label={resolveAccessibleName(schema)}
        onCheckedChange={(checked) => onChange(checked)}
        disabled={disabled}
      >
        <CabinetBox
          popped={value}
          boxHeight={CABINET_TOGGLE_BOX_SIZE}
          timelineKey={`cabinet-toggle-${schema.id}`}
        />
      </Switch.Root>
    </div>
  );
}
```

**`src/components/ui/controls/Toggle.css`** (full replacement):

```css
.sc-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sc-toggle__root {
  display: inline-flex;
  /* Pins the hit area to CabinetBox's own footprint, same reasoning as
     Button.css's own .sc-button rule (roadmap 11.1.1) — a flex/grid parent's
     default stretch behavior would otherwise size the real switch element
     past the box's own visible content. */
  width: fit-content;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.sc-toggle__root:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Overrides CabinetBox's own content-driven front-face sizing to the fixed
   32×32px size Toggle.tsx computes into --cabinet-toggle-box-size — scoped
   to .sc-toggle__root specifically so Button's own content-sized front face
   (CabinetBox.css's own .sc-cabinet-box__front rule) is untouched. See
   docs/specs/OBLIQUE_CABINETRY_TOGGLE.md §1.2. */
.sc-toggle__root .sc-cabinet-box__front {
  width: var(--cabinet-toggle-box-size);
  height: var(--cabinet-toggle-box-size);
  padding: 0;
}
```

* **Naming conventions:** `CABINET_TOGGLE_BOX_SIZE` (SCREAMING_SNAKE_CASE constant, mirroring `CABINET_POP_DISTANCE`/`CABINET_POP_DURATION`'s own naming), `--cabinet-toggle-box-size` (component-scoped custom property, distinct from `CabinetBox`'s own shared `--cabinet-box-height`/`--cabinet-pop-distance` tokens so the two never collide), `` `cabinet-toggle-${schema.id}` `` (timelineMap key, mirroring `` `cabinet-button-${schema.id}` ``).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`CabinetBox.test.tsx` (modified, 2 new cases)** — every existing test in the file (11.1.1's full suite) stays unchanged and passing, since both new props are optional and every existing test passes `children` and never `boxHeight`:
  1. **"renders no content in the front face when `children` is omitted"** — `render(<CabinetBox popped={false} timelineKey="test-box" />)` (no `children` prop at all); assert the `.sc-cabinet-box__front` element renders with no error and empty `textContent`.
  2. **"applies a `boxHeight` override instead of the resolved breakpoint value, when provided"** — with the file's existing `stubMatchMedia(false)` (desktop tier, resolves 48 by default): `render(<CabinetBox popped={false} timelineKey="test-box" boxHeight={32}>x</CabinetBox>)`; assert the wrapper's `--cabinet-box-height` inline style is `'32px'`, not `'48px'` — proves the override wins over the hook's own resolved value, not just that a prop was accepted.
* **`Toggle.test.tsx` (modified)** — every existing test (10 cases: `aria-checked` for both values, controlled-no-internal-state, `onChange(!value)` on click, `DualLabel` rendering, `isActive` class present/absent, accessible-name fallback, not-disabled-by-default, disabled attribute, no `onChange` when disabled while clicked) stays unchanged and passing — none of them assert against `.sc-toggle__thumb` or any pill-specific markup, so none need editing. New coverage, following `Button.test.tsx`'s own precedent of mocking `CabinetBox` directly (`vi.mock('./CabinetBox', () => ({ CabinetBox: (props) => <div data-testid="cabinet-box" data-popped={String(props.popped)} data-box-height={props.boxHeight} data-timeline-key={props.timelineKey} /> }))`):
  1. Renders a `CabinetBox` with `popped="true"` when `value` is `true`.
  2. Renders a `CabinetBox` with `popped="false"` when `value` is `false`.
  3. Passes `boxHeight={CABINET_TOGGLE_BOX_SIZE}` (32) to `CabinetBox`, regardless of any `matchMedia` stubbing — proving the fixed size isn't accidentally breakpoint-derived.
  4. Passes a `timelineKey` of `` `cabinet-toggle-${schema.id}` `` — distinct from Button's own `cabinet-button-` prefix.
  5. **`popped` stays `"true"` when `value` is `true` and `disabled` is also `true`** — directly exercises §1.4's resolved (not directly interviewed) decision, so a future change to that behavior fails a named test rather than going unnoticed.
  6. **No `.sc-toggle__thumb` element exists in the rendered output** — guards against silently reintroducing the deleted pill/thumb markup (§1.5) in a future edit.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including `StepperWithToggle.test.tsx` (unmodified, composes `Toggle` internally — confirms the change doesn't break its existing coverage even though it has no live consumer).
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** load the app, open Robot Options' Ping Controls drawer (`PingControlsDrawer.tsx`'s "Click Track Active" toggle — the one real `Toggle` consumer in the current app) and confirm: the switch renders as a flat 32×32px box at rest (off) and pops fully out (same protrusion distance as any `Button` on screen, plus the same glow) when switched on; clicking anywhere on the box toggles it via keyboard (`Tab` to focus, `Space`/`Enter` to flip) exactly as before; the focus ring renders clearly on top of both the flat and popped states; the pop/flat transition snaps instantly with "reduce motion" enabled instead of animating; if a disabled `Toggle` instance is reachable (or temporarily forced via devtools), a checked-and-disabled toggle still renders popped, not flat.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** a short note under `Toggle`'s row (mirroring `Button`'s own note added by 11.1.1) — its internal rendering changed (cabinet SVG/GSAP box instead of a pill track + sliding thumb) while its `ControlSchema`/props contract stayed byte-for-byte identical.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/cabinetry-toggle` (already checked out per this repo's current git status) for both this spec's own docs commit and the implementation that follows — unlike 11.1.1, which split docs (`docs/cabinets-rework`) from implementation onto separate branches, this phase's smaller surface area doesn't need that split.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `CabinetBox.tsx`/`.test.tsx` (the 2 additive prop changes, no consumer wired to them yet); (2) `Toggle.tsx`/`.css`/`.test.tsx` (the real consumer); (3) `docs/COMPONENT_LIBRARY.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and this codebase's own 11.1.1 precedent, not left open):

- ~~Does the pill+thumb visual survive alongside the cabinet box, or is it replaced entirely?~~ **Resolved: replaced entirely** (§1.1, confirmed intent) — `Switch.Thumb` is deleted, `CabinetBox` is the switch's only visual child.
- ~~What size does a textless box use, given it has no breakpoint-scaling content to accommodate?~~ **Resolved: fixed 32×32px, via a new optional `boxHeight` prop on `CabinetBox`** (§1.2, confirmed intent) — not the breakpoint-driven tiers Button's content-sized box uses.
- ~~Does `DualLabel` move inside the box, matching Button?~~ **Resolved: no — it stays external, unchanged** (§1.3, confirmed intent). `CabinetBox`'s `children` prop becomes optional to support this.
- ~~Does hover/focus produce any visual response on a flat toggle?~~ **Resolved: no — completely inert beyond the existing `:focus-visible` outline** (§1.5, confirmed intent). The old pill/thumb CSS (including its own component-local reduced-motion rule) is deleted, not layered under the new box.

Resolved by direct reasoning during Specify — flagged explicitly since the interview didn't ask this one directly, not silently assumed:

1. **What should `popped` do when a toggle is both `checked` and `disabled`?** **Resolved: `popped = value`, unconditionally — `disabled` never overrides it** (§1.4). Reasoning: `Button`'s `!disabled` guard exists because its `popped` is *derived from interaction* (hover/focus/press) that disabling correctly suppresses; `Toggle`'s `popped` instead mirrors a real, already-committed state value that exists independently of whether the control can currently be changed. Given a named regression test (§5, item 5) rather than left as an implicit consequence of the code, so a reviewer or a future change can see this was a deliberate call, not an oversight — surface it explicitly to Crawford during review in case the intended behavior is actually "disabled toggles always render flat," matching Button's own rule literally rather than by analogy.

No risks carried forward from 11.1.1 apply here in a new way — this phase reuses `cabinetGeometry.ts`/`cabinetAnimation.ts`/`useCabinetBoxHeight.ts`/`CabinetBox.tsx`'s core mechanism (projection math, timing, the resize-flicker fix, the JS/CSS duplication collapse) entirely unmodified, so none of 11.1.1's own now-resolved risks (§7 there) reopen here.

**Forward note for 11.1.3–11.1.5 (the sliders):** unlike this phase and 11.1.1, the sliders build a genuinely different rendering shape (the voxel-track system) rather than reusing `CabinetBox` as a single box — the `boxHeight`/optional-`children` additions made here are Toggle-specific conveniences on the *existing* single-box primitive, not necessarily meaningful to the voxel-track system 11.1.3 builds. Read 11.1.3's own spec for how (or whether) it reuses any of this phase's additions rather than assuming they carry forward automatically.
