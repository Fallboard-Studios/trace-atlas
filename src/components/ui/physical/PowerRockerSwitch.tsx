// ========================================
// IMPORTS
// ========================================
import { useState, useEffect, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import * as Dialog from '@radix-ui/react-dialog';
import gsap from 'gsap';

import { useUIStore } from '@/stores/uiStore';

import { powerController } from '@/systems/powerController';
import { setTimeline, killTimeline } from '@/animation/timelineMap';

import { getScreenViewportDomNode } from '@/utils/helpers';
import { getStatusLightColor } from '@/utils/statusLightColors';
import { CONTENT } from '@/content';
import './PowerRockerSwitch.css';

// ========================================
// GEOMETRY — single source of truth for the
// rocker's 8 SVG faces, rest vs. pressed.
// ========================================

/** One rocker face's rest/pressed point sets. Previously each face's geometry
 *  was hand-copied 3x (initial gsap.set, animateRockerPress's press target,
 *  returnRocker's hardcoded FROM) — collapsed here into one table all three
 *  call sites read from, which also removes the drift that had crept into
 *  the loose copies (the power-glyph's pressed scaleY was 0.76 in one copy,
 *  0.74 in another — see POWER_SVG_PRESSED below; both describe the same
 *  "pressed" state and must agree). */
interface RockerFace {
  className: string;
  rest: string;
  pressed: string;
}

const ROCKER_FACES: RockerFace[] = [
  { className: 'rocker-top-edge', rest: '0,5   100,5   94,15  6,15', pressed: '0,5   100,5   100,5  0,5' },
  { className: 'rocker-top', rest: '6,15  94,15   97,44  3,44', pressed: '3,5   97,5    97,44  3,44' },
  { className: 'rocker-top-left', rest: '0,5   6,15    3,44   0,44', pressed: '0,5   3,5     3,44   0,44' },
  { className: 'rocker-top-right', rest: '94,15 100,5   100,44 97,44', pressed: '97,5  100,5   100,44 97,44' },
  { className: 'rocker-bottom-edge', rest: '0,85  100,85  100,85 0,85', pressed: '0,85  100,85  94,75  6,75' },
  { className: 'rocker-bottom', rest: '3,44  97,44   97,85  3,85', pressed: '3,44  97,44   94,75  6,75' },
  { className: 'rocker-bottom-left', rest: '0,44  3,44    3,85   0,85', pressed: '0,44  3,44    6,75   0,85' },
  { className: 'rocker-bottom-right', rest: '97,44 100,44  100,85 97,85', pressed: '97,44 100,44  100,85 94,75' },
];

/** The power-glyph nested SVG's own rest/pressed attr pair — same rest-vs-
 *  pressed shape as ROCKER_FACES, kept separate since it's one element with
 *  a different attr set (y + scaleY, not points). */
const POWER_SVG_REST = { y: 54, scaleY: 1 };
const POWER_SVG_PRESSED = { y: 50, scaleY: 0.76 };

/** Indicator-light colors for the 3 fixed states — statusLightColors.ts
 *  resolves a static per-name/alpha value from colorTheme.json, so these
 *  never change across the component's lifetime. Computed once at module
 *  load rather than re-derived (2 HSL formats each) on every render. */
const LIGHT_ON = getStatusLightColor('green', 0.7);
const LIGHT_OFF = getStatusLightColor('red', 0.55);
const LIGHT_TRANSITIONING = getStatusLightColor('amber', 0.5);

// ========================================
// COMPONENT
// ========================================

export function PowerRockerSwitch() {
  const isPoweredOn = useUIStore((s) => s.isPoweredOn);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const rockerRef = useRef<SVGSVGElement>(null);
  // Cache of each rocker face's own DOM node, populated once on mount by the
  // useGSAP effect below — animateRockerPress/returnRocker read from this
  // instead of re-running gsap.utils.selector (and its querySelector call
  // per face) on every press/return cycle.
  const elsRef = useRef<Record<string, Element>>({});
  const dialogContainer = getScreenViewportDomNode();

  // Set initial SVG attribute state via GSAP so it fully owns these attrs —
  // React has no points/y values in JSX to reconcile back on re-renders.
  // contextSafe wraps every animation created outside this callback (the event-handler-driven
  // ones below) so GSAP's own context — scoped to rockerRef — tracks them too, not just the
  // mount-time gsap.set calls here.
  const { contextSafe } = useGSAP(() => {
    if (!rockerRef.current) return;
    const sel = gsap.utils.selector(rockerRef.current);
    for (const face of ROCKER_FACES) {
      const el = sel(`.${face.className}`)[0] as Element;
      elsRef.current[face.className] = el;
      gsap.set(el, { attr: { points: face.rest } });
    }
    const powerSvgEl = sel('.rocker-power-svg')[0] as Element;
    elsRef.current['rocker-power-svg'] = powerSvgEl;
    gsap.set(powerSvgEl, { attr: { y: POWER_SVG_REST.y }, scaleY: POWER_SVG_REST.scaleY });
  }, { scope: rockerRef, dependencies: [] });

  // Kill every timeline key this component can create on unmount to prevent leaks — the two
  // press/return timelines plus the two delay sequences from handleRockerClick below. A pending
  // sequence's onComplete (setShowConfirm/handlePowerOn/returnRocker) must never fire post-unmount.
  useEffect(() => {
    return () => {
      killTimeline('power-rocker');
      killTimeline('power-rocker-return');
      killTimeline('power-rocker-confirm-delay');
      killTimeline('power-rocker-sequence');
    };
  }, []);

  // ----------------------------------------
  // Rocker rock animation — fires on every
  // click as physical feedback, independent
  // of the modal outcome.
  // ----------------------------------------
  // contextSafe wraps and returns a new function without invoking it; the ref is only ever read
  // once that wrapper is later called from a real event handler (handleRockerClick), never
  // during this render.
  // eslint-disable-next-line react-hooks/refs -- see comment above
  const animateRockerPress = contextSafe(() => {
    if (!rockerRef.current) return;
    killTimeline('power-rocker-return');
    killTimeline('power-rocker');
    const tl = gsap.timeline();
    const THUNK = 0.06;
    const HOLD = 0.12;

    // ── Thunk: all 8 faces + the power glyph slam to their pressed geometry
    //    together (every tween start-synced via '<' to the first). ──────────
    ROCKER_FACES.forEach((face, i) => {
      tl.to(elsRef.current[face.className], { attr: { points: face.pressed }, duration: THUNK, ease: 'power4.in' }, ...(i === 0 ? [] : ['<'] as const));
    });
    tl.to(elsRef.current['rocker-power-svg'], { attr: { y: POWER_SVG_PRESSED.y }, scaleY: POWER_SVG_PRESSED.scaleY, transformOrigin: '50% 50%', duration: THUNK, ease: 'power4.in' }, '<')
      // ── Hold (button stays depressed until dialog resolves) ────────────────
      .to({}, { duration: HOLD });
    setTimeline('power-rocker', tl);
  });

  // eslint-disable-next-line react-hooks/refs -- see animateRockerPress above; contextSafe defers.
  const returnRocker = contextSafe(() => {
    if (!rockerRef.current) return;
    killTimeline('power-rocker');
    killTimeline('power-rocker-return');
    const tl = gsap.timeline();
    const MOTOR = 1.0;

    // Use fromTo with hardcoded pressed-state FROM values (ROCKER_FACES'
    // own `pressed` points — the same table animateRockerPress reads from)
    // so this tween is immune to React reconciliation writing resting-state
    // JSX attrs back to the DOM mid-animation (which would cause GSAP to
    // read resting as FROM and produce an instant snap).
    ROCKER_FACES.forEach((face, i) => {
      tl.fromTo(elsRef.current[face.className],
        { attr: { points: face.pressed } },
        { attr: { points: face.rest }, duration: MOTOR, ease: 'none' },
        ...(i === 0 ? [] : ['<'] as const));
    });
    tl.fromTo(elsRef.current['rocker-power-svg'],
      { attr: { y: POWER_SVG_PRESSED.y }, scaleY: POWER_SVG_PRESSED.scaleY },
      { attr: { y: POWER_SVG_REST.y }, scaleY: POWER_SVG_REST.scaleY, transformOrigin: '50% 50%', duration: MOTOR, ease: 'none' }, '<')
      .call(() => setIsTransitioning(false));
    setTimeline('power-rocker-return', tl);
  });

  // ----------------------------------------
  // Power On
  // ----------------------------------------
  async function handlePowerOn() {
    // Centralized power startup — powerController handles audio/system init,
    // then flips isPoweredOn (which mounts Header/WorldView/Console).
    await powerController.powerOnSequence();
  }

  // ----------------------------------------
  // Power Off confirm
  // ----------------------------------------
  async function handlePowerOffConfirm() {
    setShowConfirm(false);
    // Return rocker immediately for UI feedback
    returnRocker();
    // Delegate orchestrated shutdown (plays sleeve drain, stops systems,
    // and runs the tablet power-off UI animation).
    await powerController.shutdownWithAnimation();
  }

  // ----------------------------------------
  // Rocker click — animation fires immediately,
  // then branch on power state.
  // ----------------------------------------
  const handleRockerClick = contextSafe(() => {
    setIsTransitioning(true);
    animateRockerPress();
    if (isPoweredOn) {
      // Show modal once the button is fully depressed (THUNK + HOLD)
      const confirmTl = gsap.timeline({ onComplete: () => setShowConfirm(true) });
      // short delay matching the previous timing (≈180ms)
      confirmTl.to({}, { duration: 0.18 });
      setTimeline('power-rocker-confirm-delay', confirmTl);
    } else {
      // Orchestrate the power-on and return sequence with a timeline so timings
      // are centralized and cancelable instead of using setTimeout.
      const seq = gsap.timeline();
      // hold phase (~180ms)
      seq.to({}, { duration: 0.18, onComplete: () => { void handlePowerOn(); } });
      // extra delay before returnRocker (previously 500ms after hold)
      seq.to({}, { duration: 0.5, onComplete: () => returnRocker() });
      setTimeline('power-rocker-sequence', seq);
    }
  });

  const powerState = isPoweredOn ? 'on' : 'off';
  // Color is JS-owned (getStatusLightColor, the single statusLightColors source), motion stays
  // CSS-owned (the pulse animation in PowerRockerSwitch.css) — transitioning (amber) takes
  // precedence over the steady-state power color while true, matching the CSS cascade order
  // this replaces (`[data-transitioning="true"]` came after the power-state rules). Glow alpha
  // and box-shadow geometry (below) preserve the original hand-tuned per-state values — "on" is
  // deliberately the brightest/biggest glow, not just a different hue from "off"/"transitioning".
  const lightColor = isTransitioning ? LIGHT_TRANSITIONING : isPoweredOn ? LIGHT_ON : LIGHT_OFF;
  const lightGlowSpread = isPoweredOn && !isTransitioning ? '8px 3px' : '6px 2px';

  return (
    <>
      <div className="rocker-panel" aria-label={CONTENT['ui.power.controls'].human}>
        {/* Indicator light — rectangular lens in a recessed housing */}
        <div className="rocker-light-housing">
          <div
            className="rocker-light"
            role="status"
            aria-label={isPoweredOn ? CONTENT['ui.power.on'].human : CONTENT['ui.power.off'].human}
            data-power-state={powerState}
            data-transitioning={isTransitioning ? 'true' : undefined}
            style={{ color: lightColor.color, boxShadow: `0 0 ${lightGlowSpread} ${lightColor.glow}` }}
          />
        </div>

        {/* Rocker in its molded bezel */}
        <div className="rocker-bezel">
          <button
            className="rocker-el"
            aria-label={isPoweredOn ? CONTENT['ui.power.off'].human : CONTENT['ui.power.on'].human}
            onClick={handleRockerClick}
          >
            {/*
              viewBox 0 0 100 90, ridge at y=44.
              Resting: top is a wide-at-top trapezoid (0,5 → 100,5 → 93,44 → 7,44).
              The diverging sides ARE the visual "bend" — they show the surface
              angled toward the viewer. GSAP attr-tweens the points on click.
            */}
            <svg
              ref={rockerRef}
              className="rocker-svg"
              viewBox="0 0 100 90"
              preserveAspectRatio="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                {/* Body fill — gradientUnits userSpaceOnUse so shading
                    tracks absolute y regardless of polygon bounds */}
                <linearGradient id="rockerGrad" x1="0" y1="0" x2="0" y2="90" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#525252" />
                  <stop offset="44%" stopColor="#3a3a3a" />
                  <stop offset="56%" stopColor="#2b2b2b" />
                  <stop offset="100%" stopColor="#444444" />
                </linearGradient>
                {/* Ridge fill — fades to transparent at both ends */}
                <linearGradient id="rockerRidgeGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                  <stop offset="6%" stopColor="rgba(0,0,0,0.65)" />
                  <stop offset="94%" stopColor="rgba(0,0,0,0.65)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </linearGradient>
              </defs>

              {/*
                Geometry overview (viewBox 0 0 100 90, ridge y=44):

                Resting — top protrudes:
                  top-edge  : lip strip at top, visible from above (10 units tall)
                  top face  : main face, below the lip strip
                  top side L/R: "a little bit" visible (~6 units at free end, ~12 at ridge)
                  bottom-edge : COLLAPSED (zero-height, flush — nothing sticks out)
                  bottom face : nearly full-width (3px inset only)
                  bottom side L/R: "barely" visible (3 units wide)
              */}

              {/* ─ Top half ─ */}
              {/* Points set via gsap.set in useGSAP — GSAP owns these attrs */}
              <polygon className="rocker-top-edge" />
              <polygon className="rocker-top" />
              <polygon className="rocker-top-left" />
              <polygon className="rocker-top-right" />

              {/* ─ Bottom half ─ */}
              <polygon className="rocker-bottom-edge" />
              <polygon className="rocker-bottom" />
              <polygon className="rocker-bottom-left" />
              <polygon className="rocker-bottom-right" />

              {/*
                Power symbol — nested SVG so it has its own coordinate system
                with preserveAspectRatio="xMidYMid meet". Renders undistorted
                despite the outer SVG using preserveAspectRatio="none".
                51×23 outer units → 27×27 screen px (square).
                preserveAspectRatio="none" + pre-compensated h ensures each
                inner-viewBox unit maps equally in both axes (≈0.27px/unit).
                GSAP attr-tweens `y`: 54 at rest, 50 when pressed. Bugfix, found live
                (docs/todo/backlog.md #20): y also needs a real JSX default (POWER_SVG_REST.y)
                — left GSAP-only, this SVG-length attribute had no valid value on the very
                first paint, before useGSAP's mount effect runs, which Chrome logged as
                `<svg> attribute y: ... Expected length, ""`.
                Sits before rocker-ridge so the ridge shadow paints over it.
              */}
              <svg
                className="rocker-power-svg"
                x="25"
                y={POWER_SVG_REST.y}
                width="51"
                height="23"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <g fill="none" stroke="rgba(185,185,185,0.45)" strokeWidth="12" strokeLinecap="round">
                  {/* Circle arc: 300°, gap at top (±30° from 12 o'clock) */}
                  <path d="M 68,20 A 35,35 0 1,1 32,20" />
                  {/* Vertical line through gap, from above arc top down */}
                  <line x1="50" y1="4" x2="50" y2="30" />
                </g>
              </svg>

              {/* Center ridge — paints over icon so shadow falls on the surface */}
              <rect className="rocker-ridge" x="0" y="43" width="100" height="2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Power-off confirmation modal */}
      <Dialog.Root
        open={showConfirm}
        onOpenChange={(open) => {
          setShowConfirm(open);
          // Always return the rocker when the dialog closes, regardless of
          // how it was dismissed. returnRocker kills any in-flight timeline
          // first so calling it more than once is safe.
          if (!open) returnRocker();
        }}
      >
        <Dialog.Portal container={dialogContainer ?? undefined}>
          <Dialog.Overlay className="power-confirm__overlay" />
          <Dialog.Content className="power-confirm__content">
            <Dialog.Title className="power-confirm__title">{CONTENT['ui.power.confirmTitle'].human}</Dialog.Title>
            <Dialog.Description className="power-confirm__description">
              {CONTENT['ui.power.confirmBody'].human}
            </Dialog.Description>
            <div className="power-confirm__actions">
              <button
                className="power-confirm__btn power-confirm__btn--confirm"
                onClick={handlePowerOffConfirm}
              >
                Confirm
              </button>
              <Dialog.Close asChild>
                <button className="power-confirm__btn">
                  Cancel
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
