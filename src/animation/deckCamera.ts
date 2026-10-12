// ========================================
// DECK CAMERA (docs/specs/DECK_CAMERA_FOLLOW.md §1.2, §1.4, Phase 46)
// ========================================
// A runtime module in the pattern of timelineMap.ts / refs.ts: module-level state, no React, no
// store (CLAUDE.md: runtime-only objects like DOM elements stay out of Zustand). This task holds
// the touch/release input model: a finger (or pointer) on the deck scroller freezes the camera and
// kills any float in flight; letting go starts the cooldown clock; a wheel does both at once. The
// pick algorithm and the follow ticker build on it in later tasks. Nothing here reads audio state
// or calls AudioEngine (CLAUDE.md "Strict Separation").

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

import { DECK_CAMERA_PAN_S, DECK_CAMERA_TIMELINE_ID } from '@/constants/deckCamera';
import { WORLD_BOUNDS } from '@/constants/sceneDepth';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import { getRef } from '@/utils/refs';
import { prefersReducedMotion } from '@/utils/reducedMotion';

gsap.registerPlugin(ScrollToPlugin);

// ========================================
// MODULE STATE
// ========================================
let scroller: HTMLElement | null = null;
/** A finger or pointer is down on the scroller: the camera does nothing until it lifts. */
let held = false;
/** When the user last let go (or wheeled), or the last follow ended. `-Infinity` at boot, so the
 *  first pick has no wait. */
let cooldownStartedAt = -Infinity;

/** Touch or pointer down: freeze the camera where it is. */
function handleHold(): void {
  held = true;
  killTimeline(DECK_CAMERA_TIMELINE_ID);
}

/** Touch or pointer up: the cooldown starts from the release. */
function handleRelease(): void {
  held = false;
  cooldownStartedAt = performance.now();
}

/** A wheel has no "down" phase worth holding for, so it freezes and releases in the same breath
 *  (spec §1.4). */
function handleWheel(): void {
  killTimeline(DECK_CAMERA_TIMELINE_ID);
  handleRelease();
}

const LISTENERS: ReadonlyArray<readonly [string, () => void]> = [
  ['pointerdown', handleHold],
  ['touchstart', handleHold],
  ['wheel', handleWheel],
  ['pointerup', handleRelease],
  ['touchend', handleRelease],
];

// ========================================
// EXPORTS
// ========================================

/**
 * Remembers (or forgets) the deck's scroll container and attaches/detaches the five user-input
 * listeners. There is no `scroll` listener: with touch and release as the only "the user did
 * something" signals, the camera's own `scrollLeft` writes can never be mistaken for one. Changing
 * or dropping the scroller lets go of any hold, since its `pointerup` would never arrive.
 */
export function registerDeckScroller(el: HTMLElement | null): void {
  if (scroller) {
    for (const [type, handler] of LISTENERS) scroller.removeEventListener(type, handler);
  }
  scroller = el;
  held = false;
  if (scroller) {
    for (const [type, handler] of LISTENERS) scroller.addEventListener(type, handler);
  } else {
    killTimeline(DECK_CAMERA_TIMELINE_ID);
  }
}

/**
 * A robot's camera target: its live scene x (spec assumption 5), scaled to the stage's actual
 * pixel width and centred in the viewport, clamped to the scroller's own scroll range. `null`
 * when the robot has no ref yet or there is no scroller.
 */
function targetFor(robotId: string): number | null {
  if (!scroller) return null;
  const el = getRef(`robot-${robotId}`);
  if (!el) return null;
  const x = Number(gsap.getProperty(el, 'x'));
  const scale = scroller.scrollWidth / WORLD_BOUNDS.width;
  const max = scroller.scrollWidth - scroller.clientWidth;
  return Math.min(max, Math.max(0, x * scale - scroller.clientWidth / 2));
}

/** `targetFor`, exported for tests. */
export const deckCameraTargetFor = targetFor;

/** Builds, registers and plays the `deck-camera` tween to `x` (spec §1.2, assumptions 4, 8, 9).
 *  `setTimeline` kills any tween already registered under `DECK_CAMERA_TIMELINE_ID`. */
function createCameraTween(x: number): void {
  if (!scroller) return;
  const duration = prefersReducedMotion() ? 0 : DECK_CAMERA_PAN_S;
  const tl = gsap.timeline({ paused: true });
  tl.to(scroller, {
    scrollTo: { x, autoKill: true },
    duration,
    // power1.inOut, not power2 (too sharp at the spec's 0.8s, read as a snap) or sine (too flat
    // in the middle, still read as abrupt — Crawford, manual check): a stronger, longer slow-in
    // and slow-out than sine, short of power2's sharper curve.
    ease: 'power1.inOut',
  });
  setTimeline(DECK_CAMERA_TIMELINE_ID, tl);
  tl.play();
}

/** Floats the camera to a robot if its target resolves. Returns whether it did. Exported until
 *  Task 7 wires it to the pick algorithm and the follow ticker. */
export function moveCameraTo(robotId: string): boolean {
  const x = targetFor(robotId);
  if (x === null) return false;
  createCameraTween(x);
  return true;
}

// ========================================
// TEST-ONLY
// ========================================

/** The input model's state, for assertions. */
export function __deckCameraStateForTest(): { held: boolean; cooldownStartedAt: number } {
  return { held, cooldownStartedAt };
}

/** Resets the module to its just-imported state: not held, boot cooldown sentinel. */
export function __resetDeckCameraForTest(): void {
  held = false;
  cooldownStartedAt = -Infinity;
}
