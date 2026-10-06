// ========================================
// useStripFlicker (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.4, Task 12)
// ========================================
// GSAP-owned flicker for a robot's lit strips: when the attribute a line's strip is tied to
// changes, that line's strips blink a few times over the next two seconds, on their own seeded
// pattern (stripFlicker.ts, Task 4) — "the flicker reads as a reaction, not a fault." Four lines,
// each watching its own trigger tuple; a line is never touched by another line's edit. This hook
// never reads Zustand or calls AudioEngine; `gemSeed` and the trigger tuples are handed in as
// plain props by `RobotBody`.

// ========================================
// IMPORTS
// ========================================
import { useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import alea from 'alea';

import { setTimeline, killTimeline } from '../../../animation/timelineMap';
import { prefersReducedMotion } from '../../../utils/reducedMotion';
import { flickerPattern, FLICKER_LOW } from './stripFlicker';

// ========================================
// TYPES
// ========================================
/** `data-line` on a `.gem__strip` — matches `RobotGem`'s own `StripLine` type (not exported from
 *  there, so re-declared here; the string values are the real contract). */
export type StripLine = 'top' | 'midLeft' | 'midRight' | 'orbiters';

/** One line's trigger tuple — whatever `RobotBody` decides should restart that line's flicker
 *  (spec §1.4): `top` -> [depth, lane], `midLeft`/`midRight` -> [depth, lane, gain],
 *  `orbiters` -> [noteVariance, pitchRepeat]. Only the tuple's *identity-of-values* matters here;
 *  this hook never reads what they mean. */
export type FlickerTrigger = readonly unknown[];

export interface UseStripFlickerOptions {
  /** `g.gem` — the GSAP scope this hook queries `.gem__strip[data-line]` beneath. */
  root: RefObject<SVGGElement | null>;
  robotId: string;
  context: 'world' | 'avatar';
  gemSeed: number;
  triggers: Record<StripLine, FlickerTrigger>;
  /** Cards (`motion: false`) never call this hook. */
  enabled: boolean;
}

// ========================================
// HELPERS
// ========================================
function queryStripsForLine(root: SVGGElement, line: StripLine): SVGPathElement[] {
  return [...root.querySelectorAll<SVGPathElement>(`.gem__strip[data-line="${line}"]`)];
}

// ========================================
// ONE LINE
// ========================================
/** One line's own effect: skips its first run (mount never flickers), then on every later change
 *  draws a fresh pattern from a per-line run counter (so two successive edits of the same line
 *  never repeat one), kills the line's previous timeline, and builds one new timeline keyed
 *  `flicker-${context}-${robotId}-${line}` — never stacking. */
function useFlickerLine({
  root,
  key,
  line,
  gemSeed,
  enabled,
  reducedMotion,
  trigger,
}: {
  root: RefObject<SVGGElement | null>;
  key: string;
  line: StripLine;
  gemSeed: number;
  enabled: boolean;
  reducedMotion: boolean;
  trigger: FlickerTrigger;
}) {
  const mountedRef = useRef(false);
  const runRef = useRef(0);

  useGSAP(
    () => {
      if (!enabled || reducedMotion || !root.current) {
        mountedRef.current = false;
        return;
      }
      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }

      runRef.current += 1;
      const targets = queryStripsForLine(root.current, line);
      if (!targets.length) return;

      const pattern = flickerPattern(alea(`${gemSeed}:flicker:${line}:${runRef.current}`));
      const tl = gsap.timeline({
        onComplete: () => {
          targets.forEach((el) => gsap.set(el, { opacity: Number(el.getAttribute('data-base')) }));
        },
      });
      targets.forEach((el) => {
        const base = Number(el.getAttribute('data-base'));
        pattern.forEach((blink) => {
          tl.set(el, { opacity: FLICKER_LOW }, blink.at);
          tl.set(el, { opacity: base }, blink.at + blink.len);
        });
      });
      setTimeline(key, tl);
      return () => killTimeline(key);
    },
    { scope: root, dependencies: [...trigger, enabled, reducedMotion], revertOnUpdate: true },
  );
}

// ========================================
// HOOK
// ========================================
export function useStripFlicker({ root, robotId, context, gemSeed, triggers, enabled }: UseStripFlickerOptions): void {
  const reducedMotion = prefersReducedMotion();
  const keyFor = (line: StripLine) => `flicker-${context}-${robotId}-${line}`;

  // Four fixed calls, same order every render — not a loop over a runtime-length collection, so
  // this doesn't trip the rules of hooks despite looking repetitive.
  useFlickerLine({ root, key: keyFor('top'), line: 'top', gemSeed, enabled, reducedMotion, trigger: triggers.top });
  useFlickerLine({ root, key: keyFor('midLeft'), line: 'midLeft', gemSeed, enabled, reducedMotion, trigger: triggers.midLeft });
  useFlickerLine({ root, key: keyFor('midRight'), line: 'midRight', gemSeed, enabled, reducedMotion, trigger: triggers.midRight });
  useFlickerLine({ root, key: keyFor('orbiters'), line: 'orbiters', gemSeed, enabled, reducedMotion, trigger: triggers.orbiters });
}
