import React, { useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { setTimeline, killTimeline, timelineMap } from '../../animation/timelineMap';
import { prefersReducedMotion } from '../../utils/reducedMotion';

// ----------------------------------------
// TYPES
// ----------------------------------------

export interface BubbleStreamProps {
  /** ID of the parent actor; used to key the GSAP timeline. */
  actorId: string;
  /** SVG x position of the vent (scene pixels). */
  ventX: number;
  /** SVG y position of the vent top (scene pixels). */
  ventY: number;
  /** Deterministic seed for sizing and timing variation. */
  seed: number;
  /** When false the animation is rewound to its hidden start state and paused. */
  isActive: boolean;
  /**
   * Total number of bubble-eligible buildings in the current locale. This
   * building's own burst interval is `TARGET_GLOBAL_BURST_INTERVAL_SECONDS *
   * totalBuildings`, so the *aggregate* burst rate across every building
   * stays roughly constant as buildings are added or removed — see this
   * component's docblock.
   */
  totalBuildings: number;
  /**
   * Hue (0–360) of the parent building's body colour. A small fraction of
   * this is mixed into the bubble fill so each factory has subtly tinted
   * bubbles while still looking aquatic.
   */
  bodyHue: number;
  /**
   * Depth scale factor derived from the factory's row layer.
   * foreground = 1 (default), midground = 0.5, background = 1/3.
   * Applied to bubble radius, wobble amplitude and minimum rise height.
   */
  depthScale?: number;
}

// ----------------------------------------
// CONSTANTS
// ----------------------------------------

/**
 * Target average gap, in wall-clock seconds, between bubble bursts happening
 * *anywhere* in the world — not per building. Purely decorative timing, so
 * it runs on plain elapsed time with no relationship to the transport BPM.
 * A single building's own repeat interval is this value multiplied by the
 * total number of bubble-eligible buildings (`totalBuildings`), so adding
 * more buildings spreads the same world-wide rate thinner instead of
 * multiplying the total amount of bubbling — every ~4s a different building
 * bursts, rather than every building bursting every ~4s.
 */
const TARGET_GLOBAL_BURST_INTERVAL_SECONDS = 4;

/** Minimum pixels each bubble rises before popping. */
const MIN_RISE_PX = 100;

/** Maximum pixels each bubble rises before popping (can go off-screen). */
const MAX_RISE_PX = 500;

/** Fraction of the rise covered during the float phase before the pop. */
const RISE_FRACTION = 0.85;

/** Rise speed range in px/s; used to derive duration from distance. */
const MIN_RISE_SPEED = 40; // px/s
const MAX_RISE_SPEED = 70; // px/s

/** How much a bubble grows (as a scale factor) while it pops. */
const POP_SCALE = 2.5;

/** Peak opacity of a fully risen bubble. */
const PEAK_OPACITY = 0.6;

// ----------------------------------------
// HELPERS
// ----------------------------------------

/**
 * Simple LCG pseudo-random number generator.
 * Returns a function yielding deterministic floats in [0, 1).
 * Constants from Numerical Recipes.
 */
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ----------------------------------------
// COMPONENT
// ----------------------------------------

/**
 * Renders a periodic burst of animated bubbles rising from a factory vent.
 *
 * Only one building bursts at a time, roughly — see `totalBuildings` and
 * `TARGET_GLOBAL_BURST_INTERVAL_SECONDS`. Each burst releases 5–10 bubbles
 * that each rise 100–500 px before popping (some will travel off-screen).
 * Rise duration scales with distance so all bubbles move at a consistent speed.
 * On mount every factory gets a random initial phase offset within its own
 * interval so bursts are staggered rather than synchronized.
 *
 * Motion is transform-only (`x`/`y`/`scale`/`opacity`, per
 * docs/ANIMATION_SYSTEM.md): each `<circle>` is placed once at the vent via
 * its `cx`/`cy`/`r` attributes and never has its geometry re-tweened, so a
 * frame costs a transform write rather than an SVG geometry recompute.
 */
const BubbleStreamInner: React.FC<BubbleStreamProps> = ({
  actorId,
  ventX,
  ventY,
  seed,
  isActive,
  totalBuildings,
  bodyHue,
  depthScale = 1,
}) => {
  const config = React.useMemo(() => {
    const rand = makeLcg(seed);
    const radius = (8 + rand() * 2) * depthScale; // 8–10 px scaled by depth
    const burstStagger = 0.2 + rand() * 0.2; // 0.20–0.40 s between bubbles (1–4 s total spread)
    const count = 5 + Math.floor(rand() * 6); // 5–10 bubbles per burst
    const burstInterval = TARGET_GLOBAL_BURST_INTERVAL_SECONDS * Math.max(1, totalBuildings);
    // Scatter initial burst so factories don't all fire at the same time.
    const initialDelay = rand() * burstInterval;
    return { radius, burstStagger, count, burstInterval, initialDelay };
  }, [seed, depthScale, totalBuildings]);

  const circleRefs = React.useMemo(
    () => Array.from({ length: config.count }, () => React.createRef<SVGCircleElement>()),
    // count is derived from seed and won't change after mount
    [config.count],
  );

  const timelineKey = `bubble-${actorId}`;

  useGSAP(() => {
    if (prefersReducedMotion()) return;

    const { burstStagger, count, burstInterval, initialDelay } = config;

    // Per-bubble RNG: different seed space so values don't correlate with config.
    const bubbleRand = makeLcg(seed ^ 0xb0bb1e5);
    const bubbleParams = Array.from({ length: count }, () => {
      const scaledMinRise = MIN_RISE_PX * depthScale;
      const risePx = scaledMinRise + bubbleRand() * (MAX_RISE_PX - scaledMinRise);
      const riseSpeed = MIN_RISE_SPEED + bubbleRand() * (MAX_RISE_SPEED - MIN_RISE_SPEED);
      const wobbleAmp = (8 + bubbleRand() * 12) * depthScale; // 8–20 px side-to-side, scaled by depth
      const wobblePeriod = 0.4 + bubbleRand() * 0.4; // 0.4–0.8 s per half-oscillation
      const wobbleDir = bubbleRand() > 0.5 ? 1 : -1; // random initial direction
      return { risePx, riseDuration: risePx / riseSpeed, wobbleAmp, wobblePeriod, wobbleDir };
    });

    const maxDuration = Math.max(...bubbleParams.map((p) => p.riseDuration));
    const totalBurstDuration = (count - 1) * burstStagger + maxDuration;
    const repeatDelay = Math.max(0, burstInterval - totalBurstDuration);

    const tl = gsap.timeline({ repeat: -1, repeatDelay, delay: initialDelay });

    circleRefs.forEach((ref, i) => {
      const { risePx, riseDuration, wobbleAmp, wobblePeriod, wobbleDir } = bubbleParams[i];
      const bubbleTl = gsap.timeline();

      // Rewind to the vent at the start of every burst. transformOrigin keeps the pop's scale
      // centred on the circle rather than on the SVG origin.
      bubbleTl.set(ref.current, { x: 0, y: 0, scale: 1, opacity: 0, transformOrigin: '50% 50%' });

      // Wobble: oscillate x for the rise. `repeat: n` plays n + 1 times, so subtract one to
      // cover the rise without overshooting it by more than one period — otherwise the
      // wobble keeps tweening an already-popped, invisible bubble.
      const wobbleRepeats = Math.max(0, Math.ceil(riseDuration / wobblePeriod) - 1);
      bubbleTl.to(
        ref.current,
        {
          x: wobbleDir * wobbleAmp,
          duration: wobblePeriod,
          repeat: wobbleRepeats,
          yoyo: true,
          ease: 'sine.inOut',
        },
        0,
      );

      // Continuous rise: runs for the full duration so the bubble never
      // stops moving upward, even during the pop phase (concurrent at t=0).
      bubbleTl.to(ref.current, { y: -risePx, duration: riseDuration, ease: 'power1.in' }, 0);

      // Fade in during the float phase (concurrent at t=0).
      bubbleTl.to(
        ref.current,
        { opacity: PEAK_OPACITY, duration: riseDuration * RISE_FRACTION, ease: 'none' },
        0,
      );

      // Pop phase: grows and fades while still rising.
      bubbleTl.to(
        ref.current,
        {
          scale: POP_SCALE,
          opacity: 0,
          duration: riseDuration * (1 - RISE_FRACTION),
          ease: 'power2.in',
        },
        riseDuration * RISE_FRACTION,
      );

      tl.add(bubbleTl, i * burstStagger);
    });

    setTimeline(timelineKey, tl);
    return () => killTimeline(timelineKey);
    // The vent position lives on the circles' cx/cy attributes, not in the timeline, so
    // ventX/ventY aren't dependencies here — `config` already covers seed/depth/count.
  }, { dependencies: [config, timelineKey], revertOnUpdate: true });

  useEffect(() => {
    const tl = timelineMap.get(timelineKey);
    if (!tl) return;
    if (isActive) {
      tl.play();
    } else {
      // Rewind to time 0 so the timeline's own `.set()` hides every bubble. A bare pause would
      // freeze bubbles mid-air: GSAP drives opacity through inline style, which always wins
      // over any `opacity` attribute written by hand.
      tl.pause(0);
    }
  }, [timelineKey, isActive]);

  const bubbleFill = `hsl(${bodyHue}, 30%, 70%)`;

  return (
    <>
      {circleRefs.map((ref, idx) => (
        <circle
          key={idx}
          ref={ref}
          cx={ventX}
          cy={ventY}
          r={config.radius}
          fill={bubbleFill}
          opacity={0}
        />
      ))}
    </>
  );
};

/**
 * Wrapped in `React.memo` (backlog item 23, docs/todo/backlog.md) — `FactoryInner` still
 * re-renders once/sec for the day/night tick (item 21's own fix reduced what work that
 * render does, not the render itself), and without this, every bubble-eligible factory's
 * `BubbleStream` re-ran its own render body on every one of those ticks for no reason. Every
 * prop here is a primitive (`BubbleStreamProps`), so the default shallow compare is already
 * correct — no custom comparator needed. Matches the same `XxxInner`/`React.memo(XxxInner)`
 * pattern `Factory.tsx` and the Robot shape components already use.
 */
export const BubbleStream = React.memo(BubbleStreamInner);

export default BubbleStream;
