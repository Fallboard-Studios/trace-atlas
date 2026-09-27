# Phase Spec: Oblique Cabinetry — Foundation & Button (Roadmap Phase 11.1.1)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/oblique-cabinetry-foundation.md](../intent/oblique-cabinetry-foundation.md) (confirmed via `/interview-me`, 2026-09-07). Source of scope: [docs/todo/roadmap.md § 11.1.1](../todo/roadmap.md#1111-oblique-cabinetry-foundation--button) (the first of the 11.1.1–11.1.5 series, split out of the original single "Oblique Cabinetry UI" item — too much surface area for one phase). Prior art this spec follows directly: `AccordionContainer`/`accordionAnimation.ts` (`src/components/ui/controls/`) — the `timelineMap`-registered GSAP timeline + `getAccordionDuration(prefersReducedMotion)` pattern this phase's own `cabinetAnimation.ts` mirrors exactly; `PowerRockerSwitch.tsx`/`.css` — the `useGSAP`-initialized SVG-polygon-attribute-tweening technique (GSAP owns `points`, not JSX) and the "transparent click target, SVG child provides all visuals" structural split this phase's `<button>`/`CabinetBox` split reuses; `useAutoSliderOrientation.ts` — the `ResizeObserver`-via-`useEffect` pattern this phase's own width measurement follows, including its test-suite's `MockResizeObserver` convention; `docs/specs/CONSOLE_THEMING.md § 1.3` — the `color-mix()` technique this phase reuses for face-shading instead of the intent doc's illustrative `cabinetShading.ts` JS module (resolved below, §1.4). This phase touches presentation only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; `ButtonSchema`/`ControlSchema` are unchanged.

---

## 1. Overview & Claude Explanation

The intent doc leaves the exact implementation shape open in three places: how the label "rides" the popping front face (`foreignObject` vs. a CSS-transformed DOM layer), the SVG geometry math itself, and the face-shading mechanism. All three are resolved below with real code, not left to Tasks.

### 1.1 Why the front face is HTML, not SVG — no `foreignObject`

The button's real, visible content (via `DualLabel`) never needs to be inside the SVG at all. Only the two walls that need genuine non-rectangular polygon geometry — Top Face and Left Face, the parallelogram surfaces bridging the gap as the box slides — are SVG. The **front face is a plain HTML `<div>`**, holding `DualLabel`'s real DOM output, styled and positioned exactly like today's flat `.sc-button` content, and slid via a GSAP `x`/`y` transform (a CSS `transform: translate()` under the hood, same mechanism `x`/`y` already is everywhere else GSAP is used in this codebase). This directly satisfies the confirmed intent ("the button's label rides the popping front face since it's the button's own nested content") with no `foreignObject` — a technique this codebase doesn't use anywhere today (confirmed: no `foreignObject` in `src/`), and one with known text-selection/hit-testing quirks across browsers that a plain DOM layer avoids entirely.

### 1.2 The oblique projection, in real coordinates

"2px right for every 1px down" is a standard oblique/cabinet-projection depth vector: the front face is drawn flush with its resting footprint at rest, and *slides* along that fixed vector as it "extrudes toward the viewer." Given box footprint width `W` (content-driven) and height `H` (breakpoint-driven, §1.3), and pop progress `t ∈ [0, 1]`:

```
frontFaceOffset = (2·H·t, H·t)

topFacePoints  = (0,0) (W,0) (W+2Ht,Ht) (2Ht,Ht)
leftFacePoints = (0,0) (0,H) (2Ht,H+Ht) (2Ht,Ht)
```

> **Post-implementation correction (same day, after a real visual pass):** scaling the offset by box
> height `H` read as far too much protrusion once actually seen rendered — +96px/+48px at the 48px
> desktop tier. Replaced with a **fixed** pop distance, `CABINET_POP_DISTANCE = 16` (`src/utils/
> cabinetGeometry.ts`), decoupled entirely from `H`: `frontFaceOffset = (32t, 16t)` for every
> breakpoint, `H` only sizing the box's own flat-state footprint from here on. `topFacePoints`/
> `leftFacePoints` above still hold with `2Ht`/`Ht` read as `2·CABINET_POP_DISTANCE·t`/
> `CABINET_POP_DISTANCE·t` instead of height-scaled. `CabinetBox.css`'s reserved hit-area padding
> (§4, `.sc-cabinet-box`) was updated to match this fixed distance — it had inherited the same
> height-scaling bug, which would have silently reopened the hit-area-size fix below once this
> constant decoupled from `H`.
>
> **Retuned further since, more than once — `16` above is a historical value, not the current one.**
> `CABINET_POP_DISTANCE` is being tuned by feel after each real visual pass; this doc doesn't chase
> the exact number on every tweak. `src/utils/cabinetGeometry.ts` is the only source of truth for
> what it's actually set to right now — check there, not here.

Both are parallelograms connecting the *stationary* footprint edge (top edge for Top Face, left edge for Left Face) to the *current* position of the front face's corresponding edge. At `t = 0` both collapse to zero-height/zero-width lines — invisible, matching "side walls collapsed" at rest. At `t = 1` they're the fully-open walls of a box whose front face has slid `(2·CABINET_POP_DISTANCE, CABINET_POP_DISTANCE)` toward the viewer. This is computed once by a pure function (`cabinetGeometry.ts`, §4) at the `t=0` and `t=1` endpoints only; GSAP tweens the `points` attribute string between those two endpoint strings directly — the exact technique `PowerRockerSwitch.tsx` already uses for its own polygon morphs, not a per-frame recompute.

> **Post-implementation correction, 2026-09-09 — the walls are no longer SVG `<polygon>`s at all.** The oblique-projection *derivation* above (the fixed `(2·CABINET_POP_DISTANCE, CABINET_POP_DISTANCE)` vector, the parallelogram geometry) is still exactly accurate — nothing here is superseded on that front. What changed is *how it's rendered*: SVG `points`-attribute tweening turned out to be main-thread/paint-bound, visibly lagging behind the front face's own compositor-driven `transform` tween under a `VoxelTrack` row's worth of simultaneous animation (found live, not theoretical). Both wall parallelograms are algebraically just a rectangle at a fixed skew angle (independent of `t`) scaled by `t` itself — the walls are now two plain `<div>`s, skewed once via `gsap.set()` on mount and never re-animated, with only `scaleY`/`scaleX` tweening thereafter. `computeCabinetGeometry` (§4 below) is renamed to `computeCabinetFrontFaceOffset` and no longer computes `topFacePoints`/`leftFacePoints` at all — only the front-face offset, which never depended on box width/height in the first place. Full derivation, the two new fixed skew-angle constants, and an empirical verification against GSAP's own transform-composition order: [docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md](OBLIQUE_CABINETRY_WALL_RENDERING.md).

DOM stacking order (walls SVG first, front-face `<div>` second, both children of one `position: relative` wrapper) means the front face naturally paints over the portion of the walls that sits behind it at any point in the tween — no explicit `z-index` needed, same as how oblique box art is conventionally layered.

### 1.3 The breakpoint system — one JS source, applied to CSS via inline custom properties

Confirmed intent: mobile ≤640px / tablet 641–1024px / desktop >1024px, no `ResizeObserver`/JS runtime detection for the app's *layout* concern (a plain viewport-width tier lookup is enough). The wall geometry (§1.2) needs the real numeric `H` in JavaScript regardless — polygon point arithmetic can't be expressed in CSS — via `src/utils/cabinetBreakpoints.ts` (`CABINET_BREAKPOINT_MOBILE_MAX`, `CABINET_BREAKPOINT_TABLET_MAX`, `CABINET_BOX_HEIGHT`) read by `useCabinetBoxHeight()` (`window.matchMedia`, mirroring `AccordionContainer`'s own `matchMedia('(prefers-reduced-motion: reduce)')` check).

> **Post-implementation correction: originally shipped with a second, CSS-only expression of these
> same numbers (a `:root` block + two `@media (max-width: ...)` overrides for `--cabinet-box-height`),
> since removed.** That duplication was deliberate at the time — CSS can't import a JS constants file
> — but it, plus an analogous hand-matched-literal duplication for `CABINET_POP_DISTANCE`'s hit-area
> padding (§1.6), had already gone stale in prose three times as both values were retuned by feel,
> flagged as a real recurring signal during code review, not a one-off. **Resolved by collapsing to one
> source**, not by guarding the duplication more carefully: `CabinetBox.tsx` now applies both
> `useCabinetBoxHeight()`'s resolved value and `CABINET_POP_DISTANCE` as inline `--cabinet-box-height`/
> `--cabinet-pop-distance` custom properties on its own wrapper element, and `CabinetBox.css` reads them
> via `var()` instead of re-deriving either independently. Same "JS-owned value applied as an inline
> style" pattern `App.tsx`'s own `realWorldGradient` already uses elsewhere in this codebase — not a new
> pattern introduced for this. A plain `:root` fallback remains in `CabinetBox.css` purely as a
> same-paint safety net for the moment before React's first commit applies the real values (this is an
> all-client-rendered app, so that gap is negligible in practice) — it does **not** need to track the JS
> constants precisely, unlike the removed `@media` duplication it replaces.

### 1.4 Face-shading: `color-mix()`, not a JS module

The intent doc's Forward Note left the `cabinetShading.ts` file the original roadmap draft sketched as illustrative, not binding. Resolved here: face-shading is **pure CSS**, using the exact `color-mix()` technique `docs/specs/CONSOLE_THEMING.md § 1.3` already established in this codebase for "derive a lighter/darker variant of a token, at render time, with zero JS":

```css
.sc-cabinet-box__top-face  { fill: color-mix(in srgb, var(--color-accent) 100%, white 20%); }
.sc-cabinet-box__left-face { fill: color-mix(in srgb, var(--color-accent) 100%, black 25%); }
```

`fill` is a presentation property settable via CSS class selectors on `<polygon>`, exactly the technique `PowerRockerSwitch.css` already uses for its own side/edge faces (`.rocker-top-left { fill: #1a1a1a; }`, etc.) — no new pattern invented, and no `src/utils/cabinetShading.ts` file needed at all. Top Face lighter (simulates overhead light), Left Face darker (shadowed side) — same convention `PowerRockerSwitch.css`'s own comment documents for its rocker faces. The front face's own background stays `--color-surface`, unchanged from today's `Button.css` — only the walls (visible exclusively while popped) carry the accent-tinted "active" cue, layering on top of the existing `:hover { border-color: var(--color-accent) }` affordance's intent rather than replacing it outright (that specific rule is superseded, see §4).

> **Post-implementation correction, 2026-09-09:** `--color-surface` is now `CabinetBox.css`'s own front-face *default* only, for a consumer whose front face carries no text (`Toggle`'s bare box, every `VoxelTrack` box). `Button.css` overrides its own front face to `--color-accent` specifically, since it carries real text (`DualLabel`) and is meant to read as the "live" surface — scoped to `.sc-button .sc-cabinet-box__front`, not a base `CabinetBox` change, so it doesn't reach any other consumer. Confirmed, 2026-09-09: "any front facade with text on it," not every front facade — the inactive/textless boxes in the voxel-track sliders deliberately keep the `--color-surface` default. Worth a contrast check against `--color-text-primary` (near-white on `--color-accent`'s light cyan) as part of 11.2's own accessibility pass — not verified against WCAG here, only confirmed as the intended visual direction.

### 1.5 `popped` state: hover, focus, and pointer both, because touch has no hover

Confirmed intent: hover, focus, and press all trigger one full-pop state, no distinct click bounce. Concretely, this needs **`pointerdown`/`pointerup`, not `click`** as the third trigger alongside `hover`/`focus`: `click` fires only after release, which would leave touch users (no hover capability at all) with zero visual feedback until the tap is already complete. Using `onPointerDown`/`onPointerUp`/`onPointerCancel`/`onPointerLeave` alongside `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` means the physical-switch metaphor holds correctly on every input method without special-casing any of them: mouse users get a hover-sustained pop, keyboard users get a focus-sustained pop, and touch users get a press-and-hold pop that flattens the instant they lift their finger (there's no hover state to keep it popped afterward, which is exactly the correct physical behavior — a touched switch doesn't stay depressed once you let go). No branching on pointer type is needed; standard event semantics produce the right behavior for each input method for free.

### 1.6 Layout: how the wrapper reserves room for the pop without the front face leaving flow

The front face must stay in normal document flow (an absolutely-positioned front face would remove itself from flow and collapse its own parent's intrinsic size to zero, since GSAP's `x`/`y` is a transform and transforms never affect layout). So: `CabinetBox`'s wrapper (`.sc-cabinet-box`, `display: inline-flex`) sizes itself naturally from the front face's own content-driven width and `--cabinet-box-height`, then reserves the popped-state's extra footprint explicitly via `padding-right: calc(2 * var(--cabinet-pop-distance))` / `padding-bottom: var(--cabinet-pop-distance)` — `--cabinet-pop-distance` an inline custom property `CabinetBox.tsx` applies directly from `cabinetGeometry.ts`'s `CABINET_POP_DISTANCE` (§1.3), so the padding always matches that constant automatically rather than needing a hand-matched literal — the confirmed "CSS padding" option from the intent doc's two alternatives (padding vs. an invisible `::before`). `Button`'s own hit area additionally needs `width: fit-content` on `.sc-button` itself (§4) so a flex/grid parent's default stretch behavior can't widen the real `<button>` past this reserved footprint — a second post-implementation correction, caught the same way. Only the walls SVG is `position: absolute; inset: 0` (decorative-only, contributes no size); the front face slides into that reserved padding region via its transform without ever needing to. Because `Button`'s own `<button>` wraps `CabinetBox` with `padding: 0`, the button's own hit area equals `CabinetBox`'s full reserved footprint — satisfying "the hit area extends to cover the full popped-out footprint" without a separate pseudo-element.

> **Post-implementation correction, 2026-09-09 (confirmed via `/interview-me`):** the padding-right/padding-bottom hit-area reservation described above was removed entirely from `.sc-cabinet-box`, for every consumer. The wrapper's own box — and therefore `Button`/`Toggle`'s real hit area, since each wraps `CabinetBox` with its own `padding: 0` — now equals only the box's flat, resting footprint; it no longer extends to cover the popped-out area. In its place, a new always-present, always fully opaque `.sc-cabinet-box__backing` layer (sized to exactly the wrapper's own, now-unreserved, 100% box; DOM order backing → walls → front) sits behind the walls and front face. As `--cabinet-glow` tweens `0 → 1`, the walls' own opacity now also fades from fully opaque toward 50% on the same tween (the front face stays fully opaque throughout, so its real content/label stays legible) — so the accent-tinted backing visibly shows through the walls as they pop and glow, instead of the wrapper reserving layout room to contain the popped extent. This is confirmed intentional, not a regression: `Button`/`Toggle`'s hit target genuinely no longer covers the fully-popped visual extent as of this change. `docs/CONSOLE_THEMING.md`'s own projection-vector paragraph and `docs/todo/roadmap.md`'s 11.1.1/11.1.2 Create bullets, both of which stated the old hit-area behavior as current, are corrected in the same pass as this note.

### 1.7 The focus ring survives the pop for free

`:focus-visible`'s `outline` stays declared on the real `<button>` element (not moved onto the front face) — CSS outlines always paint after an element's own content/children, on top, regardless of any transform or stacking a descendant applies to itself. Because the popped `CabinetBox` is a descendant of the `<button>`, the outline necessarily renders over it without any extra `z-index` work. This is a direct, load-bearing consequence of keeping the interactive element as the actual `<button>` (§1.2's stationary-hit-box rule) — worth stating explicitly since 11.2's own verification pass names exactly this as something to confirm; this phase's structure already makes it true by construction, not by accident.

### 1.8 The pop-proportional glow, and why sharp corners — added after visual review, now the shipped design

Two refinements added after the primitives above were already implemented and confirmed against the real running app, not part of the original spec draft — recorded here as first-class decisions, not an afterthought, since **`CabinetBox` as it stands with both of these is the reference example for every later 11.1.x item** (`Toggle`, and the 3 sliders), not just the geometry/face-shading fundamentals from §1.1–§1.7.

**The glow.** The walls (`.sc-cabinet-box__walls`) glow via `filter: drop-shadow(0 0 calc(var(--cabinet-glow, 0) * 20px) var(--color-accent))`, and the glow's intensity is driven by `--cabinet-glow`, a CSS custom property tweened `0 → 1` by the *same* GSAP timeline (same `duration`/`ease`) that already drives the pop offset — so the glow visibly tracks exactly how far the box has popped at every point in the animation, not a separately-eased effect that merely happens to look similar. Two implementation details this required, both load-bearing:

- **The tween targets the shared wrapper `<div>`, not the front face.** The walls are the front face's *sibling* in the DOM (both children of `.sc-cabinet-box`), not its descendant — a CSS custom property set via `element.style.setProperty()` only cascades to descendants, so setting it on the front face would never reach the walls at all. `CabinetBox.tsx` gained a `wrapperRef` specifically for this.
- **`drop-shadow`, not `box-shadow`.** The walls are SVG polygons (parallelograms), not a rectangular box — `box-shadow` would draw a glow around the walls SVG's own rectangular bounding box (including empty corners the polygons don't actually occupy), while `drop-shadow` follows the rendered shapes' actual alpha silhouette. This is the same reasoning that makes `drop-shadow` the correct primitive for shadowing arbitrary SVG content generally, not a Cabinetry-specific insight.

The glow lives on the walls deliberately, not the front face — confirmed explicitly during design review as "the back," reading as light spilling from the cavity behind the box as it opens, rather than the moving front panel itself emitting light.

**Sharp corners.** `.sc-cabinet-box__front`'s `border-radius: 4px` (present in every earlier draft, including this spec's own original §4 code block) was removed entirely. A rounded front panel sitting on straight-edged parallelogram walls read as visually inconsistent once actually seen popping — sharp corners on the front face match the walls' own geometry instead. A separate approach was tried and explicitly rejected first: rounding the *walls'* corners via a `blur()`/`contrast()` "goo" filter (a common CSS trick for approximating rounded corners on arbitrary SVG shapes without rewriting them as `<path>` + arc commands, which would have broken the simple `points`-string GSAP tweening this whole primitive relies on). At this box's small scale, the goo filter read as soft/melty rather than cleanly rounded and was reverted before shipping — worth recording so a future attempt at rounding doesn't rediscover the same result from scratch. True per-vertex rounding (an actual `<path>`-based rewrite) remains a real option if revisited later, at the cost of the tweening-approach change §1.2 already flags.

### 1.9 A resize while already popped must not replay the pop animation — found by code review, not the manual visual pass

The geometry effect (§4, `CabinetBox.tsx`) re-runs whenever `popped`, `width`, or `boxHeight` change — not only when `popped` itself flips. The original implementation computed `from`/`to` purely from the *current* `popped` boolean, silently assuming every effect run was a `popped` transition starting from the geometrically opposite state. That assumption breaks when `width` or `boxHeight` change **while `popped` stays the same** — concretely, a user focuses a `Button` (popping it), then resizes the browser window across the 640px/1024px breakpoint boundary while it's still focused. `boxHeight` changes, the effect re-runs, `popped` is still `true`, so the old code still computed `from = flat`, `to = full` — and GSAP's `.fromTo` immediately snapped the already-popped box back to flat before animating it back out over `duration`, a visible flicker with no interaction that should have caused it.

**This class of bug — a caller-visible flicker with no corresponding user action — is exactly the kind of thing a manual pop-in/pop-out check doesn't surface**, since it only manifests on a *dependency* change during an *unrelated* interaction (resize while hovering, not resize itself). It was caught by code review reasoning through the effect's dependency array, not by the manual visual pass that closed out the original task plan — worth noting since `Toggle`/the sliders will copy this same effect shape and should carry the fix forward, not rediscover the bug.

**Fix:** the effect now tracks the `popped` value it last actually ran for, in a ref (`prevPoppedRef`, initialized to `null` — "hasn't run yet"). A real transition (`prevPoppedRef.current === null || prevPoppedRef.current !== popped`) still runs the full animated `fromTo` exactly as before, including the glow. Anything else — `width`/`boxHeight` changing with `popped` unchanged — instead calls `gsap.set()` on all four targets (both wall polygons, the front face offset, and `--cabinet-glow`) to reposition instantly at the *same* `popped` state's geometry, with no animated replay and no `setTimeline` registration (there's no ongoing tween to track). The very first effect run is always treated as a transition regardless of `popped`'s starting value, matching pre-fix behavior exactly — this fix changes what happens on *subsequent* dependency-only changes, not on mount.

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── cabinetBreakpoints.ts        # NEW — mobile/tablet/desktop viewport-width tiers + the 3 box
│   │                                 #   heights (32/40/48px). JS-side source of truth (§1.3).
│   ├── cabinetBreakpoints.test.ts   # NEW
│   ├── cabinetGeometry.ts           # NEW — computeCabinetGeometry(width, height, t) → wall polygon
│   │                                 #   point strings + front-face offset (§1.2)
│   └── cabinetGeometry.test.ts      # NEW
└── components/ui/controls/
    ├── cabinetAnimation.ts          # NEW — CABINET_POP_DURATION + getCabinetPopDuration(), mirrors
    │                                 #   accordionAnimation.ts exactly
    ├── cabinetAnimation.test.ts     # NEW
    ├── useCabinetBoxHeight.ts       # NEW — matchMedia-driven hook resolving the live numeric box
    │                                 #   height (§1.3), for the geometry math only
    ├── useCabinetBoxHeight.test.ts  # NEW
    ├── CabinetBox.tsx                # NEW — the shared cabinet-box rendering primitive (§1, §4)
    ├── CabinetBox.css                # NEW — walls/front-face styling, color-mix() shading (§1.4),
    │                                 #   the --cabinet-box-height custom property + its 2 @media
    │                                 #   overrides (§1.3)
    ├── CabinetBox.test.tsx           # NEW
    ├── Button.tsx                    # MODIFIED — owns hover/focus/pressed state, renders through
    │                                 #   CabinetBox
    ├── Button.css                    # MODIFIED — visual styling moves from .sc-button to
    │                                 #   .sc-cabinet-box__front; .sc-button becomes a transparent
    │                                 #   click target (PowerRockerSwitch.tsx's own precedent)
    └── Button.test.tsx               # MODIFIED — new coverage for popped-state event wiring

docs/
├── CONSOLE_THEMING.md      # MODIFIED — gains the cabinet geometry/projection-vector/color-mix()
│                            #   face-shading notes (roadmap 11.1.1's own Docs bullet)
└── COMPONENT_LIBRARY.md    # MODIFIED — note that Button's internal rendering changed (cabinet
                             #   SVG/GSAP instead of flat markup) while its ControlSchema/props
                             #   contract stayed identical
```

**Explicitly not touched, and why:**

- `src/types/controls.ts` — `ButtonSchema`/`ControlSchema` are unchanged (confirmed intent; `ButtonSchema` already carries no fields beyond the base today, and none are added).
- `Toggle.tsx`/`.css`, `SliderLinear.tsx`, `SliderLog.tsx`, `SliderCenteredZero.tsx`, `Stepper.tsx`, `StepperWithToggle.tsx` — 11.1.2–11.1.5's job, or (Stepper/StepperWithToggle) dropped from Cabinetry scope entirely per the intent doc.
- Any domain config (`audioRigConfig.ts`, `robotOptionsConfig.ts`, `sectorSettingsConfig.ts`, `companyConfig.ts`) or drawer component — `Button`'s props contract is unchanged, so no call site needs to change.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — the new `--cabinet-box-height` custom property and its breakpoints live in `CabinetBox.css` (§1.3), not the global token block; nothing here touches `--color-bg`/`--color-surface`/`--color-accent`/`--color-border`'s own definitions.

No new dependency (`gsap`/`@gsap/react` are already present). No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **The real `<button>` element keeps 100% of the actual interaction.** `CabinetBox`'s SVG walls carry `pointer-events: none`; nothing in this phase adds a second hit-testable element. Do not give the walls SVG or the front-face `<div>` their own `onClick`.
* **No timer-based animation.** `ResizeObserver` and `window.matchMedia`'s `change` listener are not timers — both are event-driven, not polling — consistent with CLAUDE.md's forbidden-pattern list. Do not introduce `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's files.
* **GSAP never calls `AudioEngine`.** `CabinetBox`'s timeline drives only the cosmetic pop/wall-morph — per CLAUDE.md's Strict Separation guardrail. `onClick` continues to fire straight from the native `<button>`'s own handler, entirely independent of the GSAP timeline.
* **Every GSAP timeline is registered in `timelineMap`** (`setTimeline`/`killTimeline`), keyed uniquely per `CabinetBox` instance (`` `cabinet-button-${schema.id}` `` from `Button.tsx`), and killed on unmount — following `AccordionContainer`'s exact pattern, including still calling `setTimeline` under `prefers-reduced-motion` (at `duration: 0`) rather than skipping the timeline outright.
* **`popped` is computed as `!disabled && (hovered || focused || pressed)`, in `Button.tsx`, not inside `CabinetBox`.** `CabinetBox` itself takes `popped: boolean` as a prop and has no opinion on *why* it's popped — this is what makes it reusable by `Toggle` (11.1.2), which will compute `popped` from its own `active` value instead of hover/focus/press.
* **No distinct "click" bounce or partial-pop state.** `popped` is binary; the confirmed intent explicitly rules out a three-state (flat/partial/full) extrusion model.
* **Disabled buttons never pop.** The `!disabled` guard in the `popped` computation is explicit and defensive, not left to relying solely on the platform's own disabled-button event suppression (which isn't perfectly consistent across browsers for hover events specifically).
* **`--cabinet-box-height`'s breakpoint values are intentionally duplicated between `cabinetBreakpoints.ts` and `CabinetBox.css`** (§1.3) — this is a confirmed, accepted risk (§7), not something to "fix" by trying to read the CSS custom property back into JS or vice versa. Do not add a build-time code-generation step for this in this phase; that's a larger tooling decision out of scope here.
* **No `foreignObject`.** The front face is a plain HTML `<div>` (§1.1). Do not move `DualLabel`'s rendering into the SVG.
* **No new `ControlSchema` variant, no schema field addition.** `Button`'s `{ schema, onClick, disabled }` props contract is byte-for-byte unchanged.
* **Out of scope, per the intent doc:** `Toggle` and all 3 sliders (11.1.2–11.1.5), `Stepper`/`StepperWithToggle` (dropped from Cabinetry entirely), every other primitive's externally-composed `DualLabel` row, the per-row/layout box-count question, WorldView/robot-visual/Sleeve exclusions, and 11.2's accessibility/performance verification pass.

---

## 4. Code Style & Architecture Conventions

**`src/utils/cabinetBreakpoints.ts`** (new, full file):

```typescript
/**
 * Oblique Cabinetry's viewport-width breakpoint tiers — the JS-side source
 * of truth for the numeric box height the wall geometry math (cabinetGeometry.ts)
 * needs. CabinetBox.css independently expresses the SAME 3 breakpoint numbers
 * via plain CSS @media rules for layout purposes (padding, front-face height)
 * — CSS cannot import this file, so the two are manually kept in sync. See
 * docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1.3/§7.
 */
export const CABINET_BREAKPOINT_MOBILE_MAX = 640;
export const CABINET_BREAKPOINT_TABLET_MAX = 1024;

export const CABINET_BOX_HEIGHT = {
  mobile: 32,
  tablet: 40,
  desktop: 48,
} as const;

export type CabinetTier = keyof typeof CABINET_BOX_HEIGHT;
```

**`src/utils/cabinetGeometry.ts`** (full file, post-correction — see §1.2's note; supersedes this section's original draft, which scaled the offset by `height` directly):

```typescript
/**
 * Pure oblique-projection math for a single cabinet box — no DOM, no GSAP.
 * Given a footprint width/height and a pop progress t (0 = flat, 1 = fully
 * popped), computes the Top/Left Face wall polygons and the front face's own
 * translate offset. GSAP tweens the `points` attribute directly between the
 * t=0 and t=1 outputs of this function (same technique PowerRockerSwitch.tsx
 * already uses for its own polygon morphs) — this is never called per-frame.
 * See docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1.2 for the derivation.
 */

/**
 * How far the front face slides at full pop — fixed, deliberately NOT scaled
 * by box height. Tuned by feel after each real visual pass (changed more
 * than once already) — this file is the source of truth for the current
 * number, not this spec or any other doc; none of them restate it.
 * CabinetBox.css's reserved hit-area padding must match this exactly
 * (2×CABINET_POP_DISTANCE / CABINET_POP_DISTANCE, in px), not
 * var(--cabinet-box-height) — see that file's own comment.
 */
export const CABINET_POP_DISTANCE = 2; // current value as of this spec's last edit — read the source, don't trust this comment to stay in sync

export interface CabinetGeometry {
  topFacePoints: string;
  leftFacePoints: string;
  frontFaceOffsetX: number;
  frontFaceOffsetY: number;
}

export function computeCabinetGeometry(width: number, height: number, t: number): CabinetGeometry {
  const dx = 2 * CABINET_POP_DISTANCE * t;
  const dy = CABINET_POP_DISTANCE * t;
  return {
    topFacePoints: `0,0 ${width},0 ${width + dx},${dy} ${dx},${dy}`,
    leftFacePoints: `0,0 0,${height} ${dx},${height + dy} ${dx},${dy}`,
    frontFaceOffsetX: dx,
    frontFaceOffsetY: dy,
  };
}
```

**`src/components/ui/controls/cabinetAnimation.ts`** (new, full file — mirrors `accordionAnimation.ts` exactly):

```typescript
/**
 * Pop/flat transition timing for CabinetBox. Respects prefers-reduced-motion
 * the same way accordionAnimation.ts (AccordionContainer) and
 * PowerRockerSwitch.css do — the box still pops/flattens, but the transition
 * snaps instead of animating.
 */
export const CABINET_POP_DURATION = 0.25;

export function getCabinetPopDuration(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : CABINET_POP_DURATION;
}
```

**`src/components/ui/controls/useCabinetBoxHeight.ts`** (new, full file):

```typescript
import { useEffect, useState } from 'react';
import {
  CABINET_BOX_HEIGHT,
  CABINET_BREAKPOINT_MOBILE_MAX,
  CABINET_BREAKPOINT_TABLET_MAX,
} from '@/utils/cabinetBreakpoints';

function resolveHeight(): number {
  if (typeof window.matchMedia !== 'function') return CABINET_BOX_HEIGHT.desktop;
  if (window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_MOBILE_MAX}px)`).matches) return CABINET_BOX_HEIGHT.mobile;
  if (window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_TABLET_MAX}px)`).matches) return CABINET_BOX_HEIGHT.tablet;
  return CABINET_BOX_HEIGHT.desktop;
}

/**
 * Live numeric cabinet box height for the current viewport tier — for the
 * wall-geometry math only (cabinetGeometry.ts). CabinetBox.css independently
 * drives the same 3 tiers for layout via --cabinet-box-height; see
 * docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1.3.
 */
export function useCabinetBoxHeight(): number {
  const [height, setHeight] = useState(resolveHeight);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mobileQuery = window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_MOBILE_MAX}px)`);
    const tabletQuery = window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_TABLET_MAX}px)`);
    const update = () => setHeight(resolveHeight());
    mobileQuery.addEventListener('change', update);
    tabletQuery.addEventListener('change', update);
    return () => {
      mobileQuery.removeEventListener('change', update);
      tabletQuery.removeEventListener('change', update);
    };
  }, []);

  return height;
}
```

**`src/components/ui/controls/CabinetBox.tsx`** (full file, as actually shipped — supersedes this section's original draft, which predates the border-box measurement fix, the glow, the resize-flicker fix (§1.9), and the duplication collapse (§1.3)):

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
   *  caller decides *why* — hover/focus/press for Button, `active` for a
   *  future Toggle — CabinetBox only renders the resulting boolean. */
  popped: boolean;
  /** Unique timelineMap key for this instance, e.g. `cabinet-button-${schema.id}`. */
  timelineKey: string;
  children: ReactNode;
}

/**
 * The shared Oblique Cabinetry rendering primitive (roadmap Phase 11.1.1) —
 * an SVG wall overlay (pointer-events: none) plus an HTML front face holding
 * `children`, sliding along the fixed 2:1 oblique projection vector as
 * `popped` flips. The front face stays in normal document flow (its GSAP
 * x/y transform never affects layout); the wrapper reserves the popped
 * footprint via CSS padding, and carries the --cabinet-glow custom property
 * the walls' drop-shadow reads (CabinetBox.css) — the box glows more, the
 * further it's popped. See docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1
 * for the full derivation.
 */
export function CabinetBox({ popped, timelineKey, children }: CabinetBoxProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const topFaceRef = useRef<SVGPolygonElement>(null);
  const leftFaceRef = useRef<SVGPolygonElement>(null);
  const [width, setWidth] = useState(0);
  const boxHeight = useCabinetBoxHeight();
  // Tracks the `popped` value the geometry effect last actually ran for —
  // null means "hasn't run yet". Lets the effect tell a real popped
  // transition apart from a width/boxHeight-only re-run (e.g. a
  // breakpoint-crossing resize while already popped), which must reposition
  // instantly rather than replay the pop/flat animation from the opposite
  // state — see the effect below, and §1.9.
  const prevPoppedRef = useRef<boolean | null>(null);

  useEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      // The front face has its own horizontal padding (CabinetBox.css's
      // .sc-cabinet-box__front), so its real rendered width is the
      // border-box size, not the content box — `contentRect` always
      // reports content-box regardless of the `box` option below, so the
      // wall geometry must read `borderBoxSize` instead. Falls back to
      // contentRect.width only when borderBoxSize genuinely isn't
      // available (e.g. an older environment/mock).
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

    // A real transition only when `popped` itself changed since the last
    // time this effect ran — never on the very first run (prevPoppedRef
    // still null), which always transitions in from the opposite state,
    // same as before this distinction existed. See §1.9.
    const isTransition = prevPoppedRef.current === null || prevPoppedRef.current !== popped;
    prevPoppedRef.current = popped;

    const target = computeCabinetGeometry(width, boxHeight, popped ? 1 : 0);

    if (!isTransition) {
      // width/boxHeight changed while `popped` stayed the same (e.g. a
      // breakpoint-crossing resize while hovered/focused) — reposition
      // instantly to the same target state. Replaying the pop/flat tween
      // here would incorrectly assume the box is coming from the *opposite*
      // state and visibly flatten-then-re-pop an already-popped box.
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
      // --cabinet-glow tweens 0→1 alongside the offset, set on the shared
      // wrapper (not the front face) so the walls — a sibling of the front
      // face, not its descendant — can also inherit it via CSS custom
      // property inheritance. Drives CabinetBox.css's drop-shadow on the
      // walls (the "back" of the box, not the moving front), tracking the
      // exact same t as the pop distance rather than a separately-eased
      // transition.
      .fromTo(wrapperRef.current,
        { '--cabinet-glow': popped ? 0 : 1 },
        { '--cabinet-glow': popped ? 1 : 0, duration, ease: 'power2.out' }, 0);
    setTimeline(timelineKey, tl);
  }, [popped, width, boxHeight, timelineKey]);

  // Both custom properties are computed here, in the one place that already
  // resolves the breakpoint tier for the geometry math (useCabinetBoxHeight)
  // and already imports CABINET_POP_DISTANCE — CSS reads them via var()
  // instead of independently re-deriving the same two numbers through its
  // own @media rules, collapsing what used to be two duplicated, hand-synced
  // sources down to this one. See §1.3.
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

**`src/components/ui/controls/CabinetBox.css`** (full file, as actually shipped):

```css
/* --cabinet-box-height and --cabinet-pop-distance are supplied as inline
   custom properties by CabinetBox.tsx (computed from useCabinetBoxHeight()
   and the CABINET_POP_DISTANCE constant — see that file's own comment) —
   not redeclared here. This used to be two independently hand-synced
   copies (this file's own @media rules mirroring cabinetBreakpoints.ts, and
   a literal padding value mirroring cabinetGeometry.ts's constant); both
   had already gone stale in prose more than once as those values were
   tuned by feel. Collapsed to the one JS source instead of guarded against
   drifting — see §1.3. The :root defaults below exist only as a same-paint
   fallback for the moment before React's first commit applies the real
   inline values in this all-client-rendered app — not a maintained
   duplicate, so they don't need to track the JS constants precisely. */
:root {
  --cabinet-box-height: 48px;
  --cabinet-pop-distance: 2px;
}

.sc-cabinet-box {
  position: relative;
  display: inline-flex;
  /* Reserves room for the fully-popped footprint so the wrapper's own hit
     area never needs to grow/move when the content pops — the "stationary
     hit box" rule. The 2:1 oblique vector, expressed here via calc()
     against the one JS-supplied --cabinet-pop-distance value above, rather
     than as separately hand-tuned pixel literals. */
  padding-right: calc(2 * var(--cabinet-pop-distance));
  padding-bottom: var(--cabinet-pop-distance);
}

.sc-cabinet-box__walls {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  /* Glows more, the further the box has popped — --cabinet-glow is tweened
     0→1 on the shared wrapper by the same GSAP timeline that drives the pop
     offset (CabinetBox.tsx), so the glow grows in lockstep with the actual
     protrusion, not on its own separately-eased transition. drop-shadow,
     not box-shadow, since this glow follows the actual wall polygon
     silhouette — the "back" of the box, not the moving front — rather than
     a rectangular bounding box. Confirmed against the real running app,
     2026-09-07 — this is the shipped design, not a draft. */
  filter: drop-shadow(0 0 calc(var(--cabinet-glow, 0) * 20px) var(--color-accent));
}

.sc-cabinet-box__top-face {
  fill: color-mix(in srgb, var(--color-accent) 100%, white 20%);
}

.sc-cabinet-box__left-face {
  fill: color-mix(in srgb, var(--color-accent) 100%, black 25%);
}

.sc-cabinet-box__front {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--cabinet-box-height);
  padding: 0 14px;
  /* No border-radius, deliberately — sharp corners read as a cleaner match
     for the walls' own straight-edged geometry than the original 4px
     radius did; confirmed against the real running app, 2026-09-07. */
  background-color: var(--color-surface);
  color: var(--color-text-primary);
}
```

**`src/components/ui/controls/Button.tsx`** (full replacement):

```tsx
import { useState } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import type { ButtonSchema } from '@/types/controls';
import './Button.css';

interface ButtonProps {
  schema: ButtonSchema;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Schema-driven button — renders through CabinetBox (roadmap Phase 11.1.1).
 * `popped` combines hover, focus, and press (pointerdown/pointerup, not
 * `click` — click fires only on release, which would leave touch users with
 * no feedback until the tap is already over) into one boolean; a disabled
 * button never pops regardless of these events. No distinct click bounce or
 * partial-pop state — see docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1.5.
 */
export function Button({ schema, onClick, disabled }: ButtonProps) {
  const accessibleName = resolveAccessibleName(schema);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const popped = !disabled && (hovered || focused || pressed);

  return (
    <button
      type="button"
      className="sc-button"
      aria-label={accessibleName}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <CabinetBox popped={popped} timelineKey={`cabinet-button-${schema.id}`}>
        <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      </CabinetBox>
    </button>
  );
}
```

**`src/components/ui/controls/Button.css`** (full replacement — `.sc-button` becomes a transparent click target, same structural split `PowerRockerSwitch.css`'s `.rocker-el` already uses; `CabinetBox.css` now owns the visible surface):

```css
/* Cross-module dependency (flagged in code review): Console.css's `.console--grid .sc-button`
   rule re-enables pointer-events specifically on this class name, so world-view robots stay
   clickable while HubNav's own tiles remain clickable too. Renaming `sc-button` here would
   silently break that rule — nothing in the type system or test suite would catch it, since
   Console.test.tsx mocks ConsolePanel and never renders a real Button through this path. If this
   class name changes, update Console.css's selector in the same change. */
.sc-button {
  display: inline-flex;
  /* Post-implementation correction: a flex/grid parent's default stretch
     behavior (e.g. HubNav.css's grid tiles) otherwise sizes the real
     hit-testable <button> to fill the whole cell while CabinetBox's visible
     content stays shrink-wrapped inside it — an invisible clickable/
     hoverable dead zone. Pins the button to its own content's intrinsic
     size in any container type. */
  width: fit-content;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.sc-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

* **Naming conventions:** `CabinetBox` (PascalCase component), `sc-cabinet-box`/`sc-cabinet-box__walls`/`sc-cabinet-box__top-face`/`sc-cabinet-box__left-face`/`sc-cabinet-box__front` (`sc-` prefix + BEM-style element suffix, matching every other primitive), `cabinetGeometry.ts`/`cabinetAnimation.ts`/`cabinetBreakpoints.ts`/`useCabinetBoxHeight.ts` (flat-function modules, mirroring `sliderLogMath.ts`/`accordionAnimation.ts`/`useAutoSliderOrientation.ts`'s own naming precedent).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`cabinetBreakpoints.test.ts` (new):** sanity-checks the exported constants (`CABINET_BOX_HEIGHT.mobile < .tablet < .desktop`; `CABINET_BREAKPOINT_MOBILE_MAX < CABINET_BREAKPOINT_TABLET_MAX`) — guards against a future edit silently breaking the ordering these values assume.
* **`cabinetGeometry.test.ts` (new):**
  1. `t = 0` collapses both wall polygons to zero-area (every point's `x`/`y` matches the flat footprint edge, front face offset is `(0, 0)`).
  2. `t = 1` produces the fully-popped offset `(2·height, height)` and both wall polygons' 3rd/4th points match that offset.
  3. Intermediate `t` (e.g. `0.5`) is a linear interpolation of `t=0`/`t=1` — asserted directly against the formula, not just "doesn't throw."
  4. Output is a pure function of its 3 inputs — calling twice with identical arguments returns identical strings.
* **`cabinetAnimation.test.ts` (new):** mirrors `accordionAnimation.test.ts`'s own two cases — `getCabinetPopDuration(true)` is `0`; `getCabinetPopDuration(false)` equals `CABINET_POP_DURATION` and is `> 0`.
* **`useCabinetBoxHeight.test.ts` (new):** using a `stubMatchMedia`-style helper (mirroring `AccordionContainer.test.tsx`'s own, generalized to answer both the mobile and tablet queries independently): resolves `48` when neither query matches, `40` when only the tablet query matches, `32` when the mobile query matches (regardless of the tablet query's own state, since mobile is checked first) — and re-resolves when a stubbed query's `change` listener fires.
* **`CabinetBox.test.tsx` (new, then extended post-ship for the glow)**, following `AccordionContainer.test.tsx`'s exact conventions (`vi.mock('@/animation/timelineMap', ...)`, the `stubMatchMedia` helper, `MockResizeObserver` from `useAutoSliderOrientation.test.ts`):
  1. Renders `children` inside the front face.
  2. Registers a GSAP timeline via `setTimeline` when `popped` changes (simulate a `ResizeObserver` callback reporting a non-zero width first, since the effect bails at `width === 0`).
  3. Calls `killTimeline` on unmount.
  4. Still calls `setTimeline` under `prefers-reduced-motion` (stubbed true) — the timeline still registers, just at `duration: 0` (asserted via the mock's call arguments, same shape `AccordionContainer.test.tsx` uses).
  5. Renders exactly one `.sc-cabinet-box__top-face` and one `.sc-cabinet-box__left-face` polygon, both `aria-hidden` via the parent `<svg>`.
  6. Measures the front face using its border-box size (padding included), not content-box — asserted by locally mocking `@/utils/cabinetGeometry` (wrapping the real `computeCabinetGeometry` in a spy via `importOriginal`) and inspecting which width value it was actually called with, across a `ResizeObserver` entry whose `contentRect.width` and `borderBoxSize[0].inlineSize` deliberately differ; falls back to `contentRect.width` when `borderBoxSize` is absent (a second, explicit test).
  7. **`--cabinet-glow` tweens on the wrapper, never the front face, in both pop directions (`0→1` popping in, `1→0` popping out).** This needed a *local* `vi.mock('gsap', ...)` overriding `vitest.setup.ts`'s global noop for this file only (mirroring `useLfoTargetGroup.test.ts`'s own precedent) — the global mock doesn't expose `.fromTo()`'s call arguments for inspection, and asserting the glow tween's target/values requires exactly that. Both new tests were confirmed non-tautological by temporarily mistargeting the tween onto the front face in `CabinetBox.tsx`, watching both fail, then reverting — not just written and trusted.
  8. **Applies `--cabinet-box-height`/`--cabinet-pop-distance` as inline custom properties on the wrapper**, matching `useCabinetBoxHeight()`'s resolved value and the imported `CABINET_POP_DISTANCE` constant directly (§1.3) — added alongside the duplication collapse.
  9. **A width-only re-run (`popped` unchanged) does not replay the pop/flat tween — it repositions instantly via `gsap.set()` instead** (§1.9, found by code review). The local `gsap` mock (item 7) needed a `set: vi.fn()` alongside its `timeline`/`fromTo` mocking to assert this branch specifically; a companion test confirms a *real* `popped` transition still animates normally afterward, so the fix doesn't accidentally suppress legitimate tweens too.
* **`Button.test.tsx` (modified)** — every existing test (§ current file) stays unchanged and passing; new coverage:
  1. `fireEvent.mouseEnter`/`mouseLeave` on the button toggles `popped` (asserted indirectly via `CabinetBox`'s `setTimeline` mock being called, same technique as #4 above, or via a lower-level unit assertion on the computed `popped` boolean if `CabinetBox` is shallow-mocked for this file — implementation detail for Tasks to pick, either is acceptable).
  2. `fireEvent.focus`/`blur` toggles `popped` independently of hover.
  3. `fireEvent.pointerDown`/`pointerUp` toggles `popped` independently of hover/focus.
  4. A disabled button does not pop on `mouseEnter`/`focus`/`pointerDown` (the `!disabled` guard, directly tested — not just inferred from the platform's own disabled-element event suppression).
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** load the app, open any drawer with a real `Button` (e.g. Robot Options' "Reset Melody"), confirm it renders flat at rest and pops fully on hover/focus/press at each of the 3 breakpoints (resize the viewport or use devtools device emulation past/under 640px and 1024px); confirm keyboard `Tab` focus shows the outline ring clearly on top of the popped box; confirm a disabled button (if any real disabled instance exists in the current app — otherwise temporarily pass `disabled` in devtools) never pops; confirm the pop snaps instantly with "reduce motion" enabled (OS-level setting or devtools emulation) instead of animating.

---

## 6. Documentation & Git/Workflow Context

* **`docs/CONSOLE_THEMING.md` update:** add the cabinet geometry/projection-vector notes (§1.2) and the `color-mix()` face-shading approach (§1.4) — per roadmap 11.1.1's own Docs bullet.
* **`docs/COMPONENT_LIBRARY.md` update:** a short note under `Button`'s row (or a new subsection, mirroring "Slider orientation") — its internal rendering changed (cabinet SVG/GSAP instead of flat markup) while its `ControlSchema`/props contract stayed byte-for-byte identical.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `docs/cabinets-rework` (already checked out) for this spec's own docs commit; implementation should move to a dedicated feature branch before Tasks begin (not this docs branch), per this repo's usual doc/implementation separation.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `cabinetBreakpoints.ts`/`cabinetGeometry.ts`/`cabinetAnimation.ts` + their tests (pure, dependency-free math/constants); (2) `useCabinetBoxHeight.ts` + test; (3) `CabinetBox.tsx`/`.css`/`.test.tsx` (the shared primitive, no consumer wired yet); (4) `Button.tsx`/`.css`/`.test.tsx` (the first real consumer); (5) `docs/CONSOLE_THEMING.md` + `docs/COMPONENT_LIBRARY.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and this codebase's own precedents, not left open):

- ~~Does the label live in SVG (`foreignObject`) or stay HTML?~~ **Resolved: plain HTML `<div>`, no `foreignObject`** (§1.1) — this codebase uses `foreignObject` nowhere today, and it carries known cross-browser quirks a DOM layer avoids.
- ~~What's the exact wall geometry?~~ **Resolved: §1.2**, a pure function tweened at its `t=0`/`t=1` endpoints, the same technique `PowerRockerSwitch.tsx` already uses for its own polygon morphs.
- ~~Is face-shading a JS module (`cabinetShading.ts`) or CSS?~~ **Resolved: pure CSS `color-mix()`** (§1.4), reusing `docs/specs/CONSOLE_THEMING.md § 1.3`'s exact technique — no JS module, superseding the original roadmap draft's illustrative filename.
- ~~Does the hit area extend via padding or a pseudo-element?~~ **Resolved: CSS padding on the wrapper** (§1.6), the confirmed intent's first of two named options.
- ~~Does "click" need separate handling from hover/focus?~~ **Resolved: no distinct click bounce — but `pointerdown`/`pointerup`, not `click`, is the third trigger**, since `click` alone would leave touch users without feedback until release (§1.5).
- ~~Does the focus ring need extra z-index work to stay visible over a popped box?~~ **Resolved: no — it's true by construction** (§1.7), since `:focus-visible`'s outline is declared on the real `<button>`, which is always the popped `CabinetBox`'s ancestor.

Still open — flag for Plan/Tasks, not blocking this spec:

1. ~~The breakpoint numbers (640px/1024px, 32/40/48px) are duplicated between `cabinetBreakpoints.ts` and `CabinetBox.css`, by necessity (§1.3).~~ **Resolved — collapsed to one source, not just guarded (§1.3).** Flagged during a code review as a real recurring signal (`CABINET_POP_DISTANCE` alone had gone stale in prose three times), not a one-off worth only documenting more carefully. `CabinetBox.tsx` now applies both `--cabinet-box-height` and `--cabinet-pop-distance` as inline custom properties computed directly from the JS constants; `CabinetBox.css` no longer redeclares either independently.
2. **`Button.test.tsx`'s new hover/focus/press coverage (§5) may assert against `CabinetBox`'s mocked `setTimeline` calls or against a lower-level exposed `popped` value — left as a Tasks-time implementation choice**, not fully pinned down here, since either satisfies the same acceptance criterion (the event correctly toggles the pop state) without changing this spec's public contracts. **Resolved during implementation:** `CabinetBox` is mocked directly in `Button.test.tsx` (renders `data-popped={popped}`), keeping Button's own event-to-state logic tested in isolation from `CabinetBox`'s internals.
3. **Real disabled `Button` consumers already exist** (confirmed by grep, not assumed): `CompanyCrudControls.tsx`'s Create/Delete Company buttons (`disabled={atCap || nameIsBlank}` / `disabled={!hasSelectedCompany}`) and `PingControlsDrawer.tsx`'s Reset Melody button (`disabled={generationDisabled}`) — so the manual check's disabled-state verification (§5) has real, reachable call sites to exercise (toggle a company name field blank, or hit the company cap) rather than needing a devtools override.

Found by a `code-review-and-quality` pass (2026-09-07), after the visual-review round above — not caught by either the original spec or the manual check:

- ~~A resize (or any `width`/`boxHeight` change) while a box is already popped replayed the whole pop animation from flat, visible as a flicker.~~ **Resolved: §1.9** — the geometry effect now distinguishes a real `popped` transition from a dependency-only re-run and repositions instantly (`gsap.set()`) in the latter case, no animated replay. This is the kind of bug a manual pop-in/pop-out check structurally can't surface, since it only manifests on a *dependency* change during an *unrelated* interaction — worth remembering when `Toggle`/the sliders copy this effect shape, since a manual check on those won't catch it either; the fix needs to be carried forward, not re-discovered.

Resolved after a real visual pass against the running app (2026-09-07), superseding this spec's original draft — not left open:

- ~~The exact `color-mix()` lighten/darken percentages (20% white / 25% black, §1.4) were a first-pass aesthetic guess.~~ **Resolved: confirmed as-is** — the wall fill shading wasn't changed during the review that added the glow (§1.8) and removed the front face's `border-radius`; only those two were revised.
- ~~`CABINET_POP_DISTANCE`'s initial value (16px).~~ **Resolved, then re-resolved twice more: currently `2`** (§1.2's note) — read `cabinetGeometry.ts` directly rather than trusting any doc's restated number; it was tuned by feel each time, purely by looking at the rendered result.
- ~~Does the box need any effect beyond geometry/shading?~~ **Resolved: yes — the pop-proportional glow (§1.8), added and confirmed after the primitives above already existed.** Not anticipated by this spec's original scope; recorded as a first-class decision once shipped, not folded silently into §1.4's face-shading section it's adjacent to but distinct from.

**Forward note for 11.1.2 (`Toggle`) and 11.1.3–11.1.5 (the sliders):** `CabinetBox` as it stands after §1.8 — walls, face-shading, glow, and sharp front-face corners together — is the reference example those items' own cabinet boxes should match, not just the geometry/face-shading fundamentals from §1.1–§1.7. Confirmed explicitly by the user ("the box as it is now is the example going forward"), not an inference.
