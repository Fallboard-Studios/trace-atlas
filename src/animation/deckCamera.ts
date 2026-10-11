// ========================================
// DECK CAMERA — scroller registry, idle gate, target (docs/specs/MOBILE_DECK_CAMERA.md §1.2)
// ========================================
// A runtime module in the pattern of timelineMap.ts / refs.ts: module-level state, no React, no
// store (CLAUDE.md: runtime-only objects like DOM elements stay out of Zustand). The pan/cut
// tweens land in Task 7; this task is the scroller registry, the idle clock and the pure target
// math that both will share.

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

import { DECK_CAMERA_IDLE_MS } from '@/constants/deckCamera';
import { WORLD_BOUNDS } from '@/constants/sceneDepth';
import { getRef } from '@/utils/refs';

// ========================================
// MODULE STATE
// ========================================
let scroller: HTMLElement | null = null;
let lastUserInputAt = -Infinity;
let cameraScrolling = false;

/** The scroller's own input listener: a camera tween's own scroll events don't count as the
 *  user asking for something (spec assumption 8); `cameraScrolling` excludes them. */
function handleScrollerInput(): void {
  if (!cameraScrolling) noteDeckUserInput();
}

// ========================================
// EXPORTS
// ========================================

/** Stamps the idle clock. Exported for tests and for the scroller's own input listeners. */
export function noteDeckUserInput(): void {
  lastUserInputAt = performance.now();
}

/** No user scroll/touch/wheel has reached the scroller for `DECK_CAMERA_IDLE_MS` (spec
 *  assumption 8). True before any input has ever been seen. */
export function isDeckCameraIdle(now = performance.now()): boolean {
  return now - lastUserInputAt >= DECK_CAMERA_IDLE_MS;
}

/**
 * Remembers (or forgets) the deck's scroll container and attaches/detaches the four user-input
 * listeners that keep the idle clock honest (spec §1.1, §1.2).
 */
export function registerDeckScroller(el: HTMLElement | null): void {
  if (scroller) {
    scroller.removeEventListener('pointerdown', handleScrollerInput);
    scroller.removeEventListener('touchstart', handleScrollerInput);
    scroller.removeEventListener('wheel', handleScrollerInput);
    scroller.removeEventListener('scroll', handleScrollerInput);
  }
  scroller = el;
  if (scroller) {
    scroller.addEventListener('pointerdown', handleScrollerInput);
    scroller.addEventListener('touchstart', handleScrollerInput);
    scroller.addEventListener('wheel', handleScrollerInput);
    scroller.addEventListener('scroll', handleScrollerInput);
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

/** `targetFor`, exported for tests; `panDeckCameraTo`/`cutDeckCameraTo` (Task 7) are its only
 *  real callers. */
export const deckCameraTargetFor = targetFor;

// ========================================
// TEST-ONLY
// ========================================

/** Drives the `cameraScrolling` flag directly. Task 7's tween `onStart`/`onComplete`/
 *  `onInterrupt` callbacks are the real driver; this stays as a direct lever for tests. */
export function __setDeckCameraScrolling(value: boolean): void {
  cameraScrolling = value;
}

/** Resets the module to its just-imported state: no input yet, camera not mid-tween. */
export function __resetDeckCameraForTest(): void {
  lastUserInputAt = -Infinity;
  cameraScrolling = false;
}
