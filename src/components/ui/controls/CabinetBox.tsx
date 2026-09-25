import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { getCabinetPopDuration, getCabinetPopEase } from './cabinetAnimation';
import { useCabinetBoxHeight } from './useCabinetBoxHeight';
import {
  computeCabinetFrontFaceOffset,
  CABINET_POP_DISTANCE,
  CABINET_TOP_FACE_SKEW_DEG,
  CABINET_LEFT_FACE_SKEW_DEG,
} from '@/utils/cabinetGeometry';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import './CabinetBox.css';

interface CabinetBoxProps {
  /** Whether/how far the box should be popped. `true`/`1` is fully popped,
   *  `false`/`0` is flat. VoxelTrack (roadmap 11.1.3) was the first consumer
   *  needing a genuine fractional value, for extrusion-falloff's per-box
   *  step-down; Button/RadioButton/Toggle (Crawford's own request,
   *  2026-09-13) now also pass a fraction (CABINET_REST_POP,
   *  cabinetGeometry.ts) at rest — a shallow, permanent 1px protrusion
   *  instead of true flatness, hinting at the box's own accent color before
   *  it's ever interacted with. Normalized to a 0-1 number immediately on
   *  entry — everything downstream uses that normalized value only. See
   *  docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.1. */
  popped: boolean | number;
  /** Unique timelineMap key for this instance, e.g. `cabinet-button-${schema.id}`
   *  or `cabinet-toggle-${schema.id}`. */
  timelineKey: string;
  /** Optional fixed box height, overriding the breakpoint-driven 32/40/48px
   *  default from useCabinetBoxHeight(). Toggle (roadmap Phase 11.1.2) passes
   *  a fixed 32 regardless of viewport — it sits inline next to its own
   *  DualLabel row rather than filling a hub tile, so there's no content to
   *  accommodate at a larger size on wider breakpoints. See
   *  docs/specs/OBLIQUE_CABINETRY_TOGGLE.md §1.2. */
  boxHeight?: number;
  /** Optional, overriding CABINET_POP_DISTANCE (cabinetGeometry.ts) — how
   *  far the front face slides at full pop. Button/Toggle omit this (their
   *  own single-box-in-isolation context reads right at the smaller
   *  default); VoxelTrack (roadmap 11.1.3) passes VOXEL_TRACK_POP_DISTANCE,
   *  since a row of many boxes read together benefits from a deeper,
   *  more visible protrusion than one isolated box does. */
  popDistance?: number;
  /** Optional per-instance front-face size overrides, applied as inline
   *  styles that win over any CSS-forced sizing (e.g. VoxelTrack.css's
   *  uniform --voxel-box-size square). Omit either/both to let CSS/content
   *  decide, as every existing consumer already relies on. The front
   *  face's own ResizeObserver measurement (below) picks up whatever the
   *  real rendered width ends up being either way — no separate geometry
   *  plumbing needed for these. VoxelTrack's own straddling box (roadmap
   *  11.1.3) is the only consumer that needs these, to physically shrink
   *  along the value axis instead of showing an internal fill gradient.
   *  `frontHeight`, specifically, also sizes the left-face wall directly
   *  (below) — unlike `frontWidth`/the top-face wall, no measurement step:
   *  see the leftFaceHeight comment further down for why. */
  frontWidth?: number;
  frontHeight?: number;
  /** Optional inline z-index override for the wrapper (.sc-cabinet-box).
   *  Button/Toggle (single box, no siblings to compete with) omit this and
   *  keep CSS's own default (DOM order). VoxelTrack (roadmap 11.1.3) needs
   *  it: every box's walls extend along the fixed down-right 2:1 oblique
   *  vector regardless of position, so a box whose walls bleed into a
   *  neighbor's space must paint OVER that neighbor — not guaranteed by
   *  DOM order alone once pop distance varies per box. See
   *  voxelTrackMath.ts's computeVoxelBoxZIndex. */
  zIndex?: number;
  /** Optional — skips the animated pop-in/pop-out tween on this instance's
   *  very first render, positioning directly at the target geometry via
   *  gsap.set() instead (same instant path the dependency-only-rerun branch
   *  below already uses). Button/Toggle omit this: a genuinely new element
   *  appearing for the first time deserves the pop-in flourish. VoxelTrack
   *  passes it on every box it renders, because a "first mount" there is
   *  frequently NOT a box appearing for the first time — React remounts a
   *  box at the ordinary/straddling role boundary (element type changes at
   *  the same key: a plain CabinetBox vs. the straddling slot's two-piece
   *  wrapper) every time the straddling index moves, even though the box
   *  was already visible a frame earlier. Without this flag, that remount's
   *  reset prevPoppedRef (null) made every such boundary box replay a full
   *  flat↔popped tween from the numeric opposite — a spurious animation
   *  flash with no real transition behind it. A later REAL popped change on
   *  the same (still-mounted) instance is unaffected and animates normally
   *  regardless of this flag — see the effect below. */
  skipMountAnimation?: boolean;
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
  /** Optional per-instance color override — a single already-resolved CSS color string (a
   *  color-mix() expression, hex, or var() reference; NOT a Trait or 2-tone pair — no new color
   *  derivation happens here). When provided, overrides --color-accent/--color-surface for THIS
   *  instance's backing, both walls, AND front face (unlike Button's accent-only-on-front
   *  precedent, which only makes sense when the front carries real text distinguishing it as
   *  "live"). Omitted, every rule falls back to the existing global --color-accent/--color-surface
   *  exactly as before this prop existed — every current consumer (Button/Toggle/RadioButton/
   *  VoxelTrack/AccordionContainer) omits it and is unaffected. First consumer: NavCabinetRow
   *  (nav panel polish), which needs a full box tinted in a resolved trait/robot color rather than
   *  the single ambient accent. See docs/specs/NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §1.2/§4.1. */
  color?: string;
  /** Optional — false skips the 44px minimum-touch-target floor this component otherwise always
   *  applies to --cabinet-box-height (added `ffec8fd` for Header's own touch-sized controls; see
   *  this file's own "floors ... at 44px" test coverage). Defaults to true — every existing
   *  consumer keeps today's floor unconditionally, zero behavior change. Only correct to pass
   *  false when THIS box is not itself the touch/click target — e.g. NavCabinetRow, where the real
   *  interactive element is the row's own wrapping <button>, and the CabinetBox nested inside it
   *  is purely decorative, the same "real interactive element stays in charge, decorative child
   *  renders the visuals" split Button.tsx's own .sc-button/CabinetBox split already established.
   *  Do not pass false for any box that IS itself the real touch target. See
   *  docs/specs/NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §1.3. */
  enforceMinTouchHeight?: boolean;
  /** Optional — Button nests its own DualLabel here; Toggle renders a bare,
   *  textless box and omits this entirely. See
   *  docs/specs/OBLIQUE_CABINETRY_TOGGLE.md §1.3. */
  children?: ReactNode;
}

/**
 * The shared Oblique Cabinetry rendering primitive (roadmap Phase 11.1.1) —
 * a static backing rectangle, two wall divs (pointer-events: none, a fixed
 * CSS skew set once on mount plus an animated scaleY/scaleX — see the
 * one-time skew effect and the geometry effect below), and an HTML front
 * face holding `children`, sliding along the fixed 2:1 oblique projection
 * vector as `popped` flips. The front face stays in normal document flow
 * (its GSAP x/y transform never affects layout); the wrapper carries the
 * --cabinet-glow custom property both the walls' drop-shadow and the walls'
 * own opacity read (CabinetBox.css) — the box glows more AND fades toward
 * 50% opaque, the further it's popped, so the backing (always fully opaque,
 * always exactly the box's own resting footprint, never transformed) shows
 * through behind the popped facade. Confirmed via /interview-me, 2026-09-09.
 * See docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1 for the original
 * oblique-projection derivation, and
 * docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md for why the walls are two
 * CSS-transformed divs rather than SVG polygons tweening a `points`
 * attribute (the latter is main-thread/paint-bound and visibly lagged the
 * front face's own compositor-driven transform under load).
 */
function CabinetBoxInner({ popped, timelineKey, boxHeight: boxHeightOverride, popDistance, frontWidth, frontHeight, zIndex, skipMountAnimation, autoHeight, color, enforceMinTouchHeight = true, children }: CabinetBoxProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  // Both walls are plain <div>s (not SVG <polygon>s) — see
  // docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md. A fixed CSS skew
  // (set once, below) plus an animated scale reproduces the same oblique
  // parallelogram the old points-attribute tweening did, entirely on the
  // compositor.
  const topFaceRef = useRef<HTMLDivElement>(null);
  // Split into two nested elements — bugfix, 2026-09-17 (found live: the
  // left wall's own transform stopped matching the top wall/front face at
  // higher pop distances, worse the deeper the pop). Root cause: GSAP
  // cannot round-trip a pure skewY through its own transform cache. The
  // first time anything ELSE touches this element's transform again (our
  // own scaleX tween), GSAP re-derives its internal state from the
  // rendered matrix and re-expresses skewY as an equivalent
  // rotate+skewX+non-uniform-scale combination — mathematically equal to
  // the ORIGINAL skewY+scaleX(1) only at the exact instant that happened,
  // never again for any other scaleX value, because that decomposition
  // bakes in a fixed scaleY (cos of the skew angle) and rotation that a
  // later, different scaleX no longer combines with correctly. It
  // shrinks the wall's effective width to ~67% of intended and steepens
  // its slope, by an amount that scales with popDistance — invisible at
  // Button/Toggle's tiny 2px default, glaring at VoxelTrack's 8px. Pure
  // skewX (the top-face wall, below) has no such issue — its own
  // decomposition is an exact fixed point (scaleX/scaleY/rotation all
  // round-trip to their original values), which is why only the left
  // face needed this split. `leftFaceOuterRef` carries the static skew
  // (GSAP touches it exactly once, ever — see the one-time skew effect
  // below) and never anything else; `leftFaceInnerRef` carries ONLY the
  // animated scaleX plus the visible background color, so GSAP's own
  // cache for each of these two nodes only ever holds one transform
  // property, never both entangled on the same element. CSS transform
  // composition across nested elements (child's own transform applied
  // first, then the parent's) reproduces the exact same visual math as
  // the original single-element scale-then-skew intent.
  const leftFaceOuterRef = useRef<HTMLDivElement>(null);
  const leftFaceInnerRef = useRef<HTMLDivElement>(null);
  // Always called (Rules of Hooks), even when boxHeightOverride is supplied —
  // its result is simply unused in that case.
  const responsiveBoxHeight = useCabinetBoxHeight();
  const boxHeight = boxHeightOverride ?? responsiveBoxHeight;
  // Post-implementation correction, 2026-09-09: initialized from a real,
  // same-paint value instead of a hardcoded 0. The front face's real
  // rendered width is only known asynchronously (the ResizeObserver below),
  // but frontWidth (when given — every VoxelTrack box) IS that real width
  // already, and boxHeight is an exact match too whenever the front is
  // square (every VoxelTrack/Toggle box; a reasonable non-zero guess even
  // for Button, corrected moments later by the observer regardless). This
  // ONLY feeds the top-face div's own width style below — the geometry
  // effect stopped depending on width entirely in the wall-rendering
  // rewrite, so this doesn't change when either wall's pop animates.
  // Starting from a real value instead of 0 closes a flicker the earlier
  // width-gate fix (see the geometry effect's own comment below) didn't:
  // that fix made the WALL SCALE/POSITION instant on a fresh mount, but the
  // top-face's own WIDTH still rendered 0px until the observer's first
  // callback — a collapsed-to-nothing top wall for a frame, most visible on
  // VoxelTrack's constant straddle-boundary remounts (skipMountAnimation)
  // while dragging a slider. Found live, reported directly by Crawford.
  const [width, setWidth] = useState(frontWidth ?? boxHeight);
  const resolvedPopDistance = popDistance ?? CABINET_POP_DISTANCE;
  // Normalized once on entry — everything downstream (the geometry calls,
  // the isTransition comparison, the dependency array) uses this 0-1 number
  // only, never the raw boolean | number prop. See CabinetBoxProps.popped.
  const poppedT = typeof popped === 'number' ? popped : (popped ? 1 : 0);
  // Tracks the `poppedT` value the geometry effect last actually ran for —
  // null means "hasn't run yet". Lets the effect tell a real popped
  // transition apart from a width/boxHeight-only re-run (e.g. a
  // breakpoint-crossing resize while already popped), which must reposition
  // instantly rather than replay the pop/flat animation from the opposite
  // state — see the effect below.
  const prevPoppedRef = useRef<number | null>(null);

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
      // Rounded to a whole pixel — real browser sub-pixel layout rounding can report a
      // fractionally different border-box width across consecutive observations of the exact same
      // rendered size (no real resize happened). Without rounding, that jitter changes `width`
      // state on every callback, reruns the geometry effect below (width is in its dependency
      // array) and rewrites the top-face wall's own inline style every time — a self-sustaining
      // ResizeObserver retrigger loop with nothing to ever stop it. Rounding makes two
      // sub-pixel-different measurements of the same real size resolve to an identical number, so
      // React's own `Object.is` bail-out on an unchanged state value stops the loop at its source.
      // Found live: a CabinetBox-heavy panel's own scrollbar continuously flickering, even idle.
      setWidth(Math.round(borderBoxWidth ?? entry.contentRect.width));
    });
    observer.observe(el, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);

  // `width` now feeds ONLY the top-face div's own inline style (below) —
  // sizing it to match the front face's real rendered width. It is
  // deliberately NOT a dependency of the geometry effect below: since the
  // wall-rendering rewrite (docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md),
  // nothing that effect computes (the wall scales, the front-face offset)
  // depends on width at all — only the old SVG-polygon math did. See that
  // effect's own comment for the bug this caused before being fixed,
  // 2026-09-09.

  // GSAP's own context.revert() (from the useGSAP calls below) only kills the underlying GSAP
  // tween it tracked — it has no knowledge of our separate timelineMap registry, so this manual
  // cleanup is still required to keep that registry itself tidy on unmount.
  useEffect(() => {
    return () => killTimeline(timelineKey);
  }, [timelineKey]);

  // The wall skew is a fixed property of the 2:1 oblique projection —
  // independent of t, popDistance, or width/height — so it's set exactly
  // once, on mount, and never touched again. GSAP must own the whole
  // `transform` on these elements (it fully replaces the inline style on
  // every write); never author `transform`/`skewX`/`skewY` as a CSS rule
  // on .sc-cabinet-box__top-face/__left-face, or it will be silently
  // dropped the first time the geometry effect below sets scaleY/scaleX.
  // See docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md §1.4. leftFaceOuterRef
  // specifically must NEVER receive any other gsap.set/tween call, ever —
  // see leftFaceOuterRef/leftFaceInnerRef's own comment above for why.
  useGSAP(() => {
    if (!topFaceRef.current || !leftFaceOuterRef.current) return;
    gsap.set(topFaceRef.current, { skewX: CABINET_TOP_FACE_SKEW_DEG });
    gsap.set(leftFaceOuterRef.current, { skewY: CABINET_LEFT_FACE_SKEW_DEG });
  }, { scope: wrapperRef, dependencies: [] });

  // Post-implementation correction, 2026-09-09: this effect's guard used to
  // also bail on `width === 0`, requiring the ResizeObserver above to have
  // fired at least once before running at all. That made sense under the
  // old SVG-polygon geometry (computeCabinetGeometry needed a real width to
  // compute wall points), but nothing this effect computes has depended on
  // width since the wall-rendering rewrite — the wall scales are poppedT
  // directly, and the front-face offset is width-independent. Gating on an
  // async measurement it no longer needed meant every fresh mount (e.g. a
  // VoxelTrack box remounting at the straddle-boundary) sat with NO scale
  // set on either wall for a real, if brief, window between paint and the
  // ResizeObserver's first callback — visible live as a flash/flicker
  // (found by Crawford: boxes briefly showing an incorrect intermediate
  // state while sliding past). Removing the width gate closes that window
  // entirely — the effect now runs synchronously with mount.
  useGSAP(() => {
    if (!frontRef.current || !topFaceRef.current || !leftFaceInnerRef.current || !wrapperRef.current) return;
    killTimeline(timelineKey);

    // A real transition only when `poppedT` itself changed since the last
    // time this effect ran — never on the very first run (prevPoppedRef
    // still null), which always transitions in from the opposite state,
    // same as before this distinction existed.
    const previousPopped = prevPoppedRef.current; // captured before being overwritten below
    const isFirstRun = previousPopped === null;
    const isTransition = isFirstRun || previousPopped !== poppedT;
    prevPoppedRef.current = poppedT;

    // The wall scale IS poppedT directly (§1.2's derivation) — no function
    // call needed for the walls. computeCabinetFrontFaceOffset is only
    // needed for the front face's own translate offset, which never
    // depended on width/height.
    const target = computeCabinetFrontFaceOffset(poppedT, resolvedPopDistance);

    if (!isTransition) {
      // width/boxHeight changed while `poppedT` stayed the same (e.g. a
      // breakpoint-crossing resize while hovered/focused) — reposition
      // instantly to the same target state. Replaying the pop/flat tween
      // here would incorrectly assume the box is coming from the *opposite*
      // state and visibly flatten-then-re-pop an already-popped box.
      gsap.set(topFaceRef.current, { scaleY: poppedT });
      gsap.set(leftFaceInnerRef.current, { scaleX: poppedT });
      gsap.set(frontRef.current, { x: target.frontFaceOffsetX, y: target.frontFaceOffsetY });
      gsap.set(wrapperRef.current, { '--cabinet-glow': poppedT });
      return;
    }

    if (isFirstRun && skipMountAnimation) {
      // This instance's very first render, and the caller has told us not
      // to animate in — position directly at the target state instead of
      // tweening from the numeric opposite. No timeline to register: there
      // is no tween. See CabinetBoxProps.skipMountAnimation for why this
      // exists (VoxelTrack's straddle-boundary remounts).
      gsap.set(topFaceRef.current, { scaleY: poppedT });
      gsap.set(leftFaceInnerRef.current, { scaleX: poppedT });
      gsap.set(frontRef.current, { x: target.frontFaceOffsetX, y: target.frontFaceOffsetY });
      gsap.set(wrapperRef.current, { '--cabinet-glow': poppedT });
      return;
    }

    // On the very first run (previousPopped === null), animate in from the
    // numeric opposite — reproduces today's Button/Toggle "opposite of the
    // binary state" behavior exactly when poppedT is 0 or 1 (1-0=1, 1-1=0,
    // matching the old ternary bit-for-bit), and generalizes sensibly for a
    // fractional starting value. Once a real prior value exists, animate
    // from that instead — never the numeric opposite of the new value.
    const fromPopped = previousPopped ?? (1 - poppedT);
    const from = computeCabinetFrontFaceOffset(fromPopped, resolvedPopDistance);
    const to = target;

    // Direction-dependent duration/ease: popping OUT (flattening) uses a
    // shorter duration and an accelerating ease, so the walls don't linger
    // at a small-but-visible size the way power2.out's own slow-approach
    // tail otherwise produces — see cabinetAnimation.ts's own comment.
    // Compared against `previousPopped`, never `fromPopped` — on the very
    // first mount, `fromPopped` is a fabricated numeric opposite (1 -
    // poppedT), not a real prior state the box is exiting from, and
    // whether that happens to be numerically larger or smaller than
    // poppedT is arbitrary (purely a function of which side of 0.5 the
    // starting value falls on). A genuine first appearance is always
    // "popping in," regardless of its starting poppedT.
    const direction = previousPopped !== null && poppedT < previousPopped ? 'out' : 'in';
    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = getCabinetPopDuration(prefersReducedMotion, direction);
    const ease = getCabinetPopEase(direction);

    const tl = gsap.timeline();
    tl.fromTo(topFaceRef.current, { scaleY: fromPopped }, { scaleY: poppedT, duration, ease }, 0)
      .fromTo(leftFaceInnerRef.current, { scaleX: fromPopped }, { scaleX: poppedT, duration, ease }, 0)
      .fromTo(frontRef.current,
        { x: from.frontFaceOffsetX, y: from.frontFaceOffsetY },
        { x: to.frontFaceOffsetX, y: to.frontFaceOffsetY, duration, ease }, 0)
      // --cabinet-glow tweens alongside the offset, set on the shared
      // wrapper (not the front face) so the walls — a sibling of the front
      // face, not its descendant — can also inherit it via CSS custom
      // property inheritance. Drives CabinetBox.css's drop-shadow on the
      // walls (the "back" of the box, not the moving front), tracking the
      // exact same t as the pop distance rather than a separately-eased
      // transition.
      .fromTo(wrapperRef.current,
        { '--cabinet-glow': fromPopped },
        { '--cabinet-glow': poppedT, duration, ease }, 0);
    setTimeline(timelineKey, tl);
  }, { scope: wrapperRef, dependencies: [poppedT, width, boxHeight, timelineKey, resolvedPopDistance, skipMountAnimation] });

  // Both custom properties are computed here, in the one place that already
  // resolves the breakpoint tier for the geometry math (useCabinetBoxHeight)
  // and already imports CABINET_POP_DISTANCE — CSS reads them via var()
  // instead of independently re-deriving the same two numbers through its
  // own @media rules, collapsing what used to be two duplicated,
  // hand-synced sources down to this one. Same "JS-owned value applied as
  // an inline style" pattern App.tsx's own realWorldGradient already uses.
  const cabinetTokens = {
    '--cabinet-box-height': `${Math.max(boxHeight, enforceMinTouchHeight ? 44 : 0)}px`,
    '--cabinet-pop-distance': `${resolvedPopDistance}px`,
    ...(color !== undefined ? { '--cabinet-box-color': color } : {}),
    ...(zIndex !== undefined ? { zIndex } : {}),
  } as CSSProperties;

  const frontStyle: CSSProperties = {};
  if (frontWidth !== undefined) frontStyle.width = `${frontWidth}px`;
  if (frontHeight !== undefined) frontStyle.height = `${frontHeight}px`;

  // Bugfix, 2026-09-09 (found via /interview-me on a vertical SliderLinear):
  // the left-face wall's height used to be hardcoded to `boxHeight` — the
  // full, fixed square size — regardless of `frontHeight`. That's correct
  // for Button/Toggle and for VoxelTrack's horizontal straddle pieces (their
  // front face's real height never shrinks; only frontWidth does, and the
  // top-face div above already tracks that via live measurement). But
  // VoxelTrack's VERTICAL straddle pieces (roadmap 11.1.5.1-.3) shrink via
  // frontHeight instead, and the wrapper they sit in (`.sc-voxel-track__straddle`,
  // flex column-reverse, packed with no gap) already auto-sizes to exactly
  // that height — so a left-face fixed at the full boxHeight always
  // overflowed past its own wrapper's real (smaller) box. Because the
  // wrapper's position is what the flex packing correctly anchors (glow's
  // wrapper flush against the track's fixed min/bottom edge, flat's flush
  // against the fixed max/top edge), that overflow didn't just look wrong in
  // isolation — as frontHeight changed with the dragged value, the
  // wrapper's own top edge moved, and the wall (same fixed height throughout)
  // rode along with it: it read as the wall sliding up/down rather than
  // shrinking in place. Unlike the top-face/frontWidth case, no live
  // measurement is needed here — frontHeight, when VoxelTrack supplies it, is
  // already the caller's own known synchronous value (glowSize/flatSize),
  // the same value already applied to the front face's own inline height
  // above. Using it directly here makes the left-face wall exactly match its
  // own wrapper's real box (top:0-anchored, no overflow), which — combined
  // with the flex packing already being correct — is what makes it read as
  // anchored-and-shrinking instead of sliding. Omitted (Button/Toggle/every
  // non-straddle voxel-track box), this is identical to the old hardcoded
  // value — no behavior change for any existing horizontal-shrink consumer.
  const leftFaceHeight = frontHeight ?? boxHeight;

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
          ref={leftFaceOuterRef}
          className="sc-cabinet-box__left-face"
          style={{ width: `${2 * resolvedPopDistance}px`, height: autoHeight ? '100%' : `${leftFaceHeight}px` }}
        >
          <div ref={leftFaceInnerRef} className="sc-cabinet-box__left-face-inner" />
        </div>
      </div>
      <div ref={frontRef} className="sc-cabinet-box__front" style={frontStyle}>
        {children}
      </div>
    </div>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 4) — every real prop here is a
// primitive or ReactNode `children`, so the default shallow compare is correct; no custom
// comparator. A caller that keeps constructing `children`/callbacks inline gets no benefit from
// this alone (an implicit performance contract, not a type-level one — see
// docs/COMPONENT_LIBRARY.md).
export const CabinetBox = memo(CabinetBoxInner);
