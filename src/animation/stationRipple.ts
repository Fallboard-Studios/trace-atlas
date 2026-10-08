// ========================================
// stationRipple (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.6, Phase 43 Task 23)
// ========================================
// The charging station's ripple: Phase 41's ring on the station halo, one whole cycle per arc,
// outward while a robot exits (`'spawn'`) and inward while one enters (`'despawn'`), in the moving
// robot's identity colour. A ripple already running wins and the new one is skipped, so twelve
// robots exiting at world open play one. Ported from docs/sketches/robot-charging-station.html's
// startRipple/rippleStops.
//
// ChargingStation's front fragment draws the circle and its gradient (all clear) and registers the
// fragment as `station-front-${id}`; this module is the only thing that animates them. The work
// loop calls it beside a station arc — never from inside a GSAP callback that touches audio.

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

import { getTimeline, killTimeline, setTimeline } from './timelineMap';
import { RIPPLE_OPACITY, rippleEnvelope, type RippleKind } from '../components/robot/gem/haloRipple';
import type { HaloStop } from '../components/robot/gem/haloDials';
import { getRef } from '../utils/refs';

// ========================================
// CONSTANTS
// ========================================
/** Ring half-width as a fraction of the halo radius (the station sketch's ring width). */
export const STATION_RIPPLE_WIDTH = 0.2;

/** The clear middle of the station halo, as a fraction of its radius (ChargingStation's halo hole). */
export const STATION_RIPPLE_HOLE = 0.18;

// ========================================
// HELPERS
// ========================================
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pct = (offset: number) => `${(offset * 100).toFixed(2)}%`;

// ========================================
// EXPORTS
// ========================================
/** The timeline key of a station's ripple. Starts with `station-`, so stopWorkLoop kills it. */
export const stationRippleKey = (stationId: string) => `station-ripple-${stationId}`;

/** The five gradient stops at arc progress `u` (0..1): one cycle, hole → edge or edge → hole. */
export function stationRippleStops(kind: RippleKind, u: number): HaloStop[] {
  const f = u % 1;
  const position = kind === 'spawn' ? lerp(STATION_RIPPLE_HOLE, 1, f) : lerp(1, STATION_RIPPLE_HOLE, f);
  return [
    { offset: 0, opacity: 0 },
    { offset: Math.max(STATION_RIPPLE_HOLE, position - STATION_RIPPLE_WIDTH), opacity: 0 },
    { offset: position, opacity: RIPPLE_OPACITY * rippleEnvelope(u) },
    { offset: Math.min(1, position + STATION_RIPPLE_WIDTH), opacity: 0 },
    { offset: 1, opacity: 0 },
  ];
}

/**
 * Play a station's ripple over `duration` in `color`, keyed `station-ripple-${id}`. Returns null —
 * and plays nothing — when one is already running there or the station's front isn't mounted.
 */
export function playStationRipple(stationId: string, kind: RippleKind, color: string, duration: number): gsap.core.Timeline | null {
  const key = stationRippleKey(stationId);
  if (getTimeline(key)) return null;
  const front = getRef(`station-front-${stationId}`);
  const circle = front?.querySelector<SVGCircleElement>('.station__ripple');
  const stops = front ? [...front.querySelectorAll<SVGStopElement>(`[id="${key}"] stop`)] : [];
  if (!circle || stops.length === 0) return null;

  const proxy = { u: 0 };
  // Plain attribute writes: a gsap.set made inside a render is lazy (flushed on the next tick).
  const paint = () => {
    stationRippleStops(kind, proxy.u).forEach((s, i) => {
      stops[i]?.setAttribute('offset', pct(s.offset));
      stops[i]?.setAttribute('stop-opacity', String(s.opacity));
    });
  };
  const tl = gsap.timeline({ paused: true, onComplete: () => killTimeline(key) });
  tl.set(stops, { attr: { 'stop-color': color } }, 0)
    .set(circle, { opacity: 1 }, 0)
    .to(proxy, { u: 1, duration, ease: 'none', onUpdate: paint }, 0)
    .set(circle, { opacity: 0 }, duration);
  setTimeline(key, tl);
  tl.play();
  return tl;
}
