// ========================================
// DECK CAMERA (docs/specs/MOBILE_DECK_CAMERA.md §1.2, Phase 46)
// ========================================
// A runtime module in the pattern of timelineMap.ts / refs.ts: module-level state, no React, no
// store (CLAUDE.md: runtime-only objects like DOM elements stay out of Zustand). Pans the deck
// scroller to a robot on tap (panDeckCameraTo) and cuts to one that goes active while the user
// is idle (cutDeckCameraTo). Nothing here reads audio state or calls AudioEngine (CLAUDE.md
// "Strict Separation").

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

import { DECK_CAMERA_IDLE_MS, DECK_CAMERA_PAN_S, DECK_CAMERA_TIMELINE_ID } from '@/constants/deckCamera';
import { WORLD_BOUNDS } from '@/constants/sceneDepth';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import { getRef } from '@/utils/refs';
import { prefersReducedMotion } from '@/utils/reducedMotion';

gsap.registerPlugin(ScrollToPlugin);

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

/** `targetFor`, exported for tests; `panDeckCameraTo`/`cutDeckCameraTo` are its only real
 *  callers. */
export const deckCameraTargetFor = targetFor;

/** Whether a robot's centre is already inside the middle 80 % of the viewport (spec §1.2, §7
 *  Q5) — a cut to a robot already on screen does nothing. False (not on screen) when there is
 *  no scroller or the robot has no ref. */
function isRobotOnScreen(robotId: string): boolean {
  if (!scroller) return false;
  const el = getRef(`robot-${robotId}`);
  if (!el) return false;
  const scale = scroller.scrollWidth / WORLD_BOUNDS.width;
  const x = Number(gsap.getProperty(el, 'x'));
  const viewportX = x * scale - scroller.scrollLeft;
  const margin = scroller.clientWidth * 0.1;
  return viewportX >= margin && viewportX <= scroller.clientWidth - margin;
}

/** Builds, registers and plays the `deck-camera` tween to `x` (spec §1.2, assumptions 4, 8, 9).
 *  `setTimeline` kills any tween already registered under `DECK_CAMERA_TIMELINE_ID`. */
function createCameraTween(x: number): void {
  if (!scroller) return;
  const duration = prefersReducedMotion() ? 0 : DECK_CAMERA_PAN_S;
  const tl = gsap.timeline({ paused: true });
  tl.to(scroller, {
    scrollTo: { x, autoKill: true },
    duration,
    ease: 'power2.inOut',
    onStart: () => {
      cameraScrolling = true;
    },
    onComplete: () => {
      cameraScrolling = false;
    },
    onInterrupt: () => {
      cameraScrolling = false;
    },
  });
  setTimeline(DECK_CAMERA_TIMELINE_ID, tl);
  tl.play();
}

function moveCameraTo(robotId: string): void {
  const x = targetFor(robotId);
  if (x === null) return;
  createCameraTween(x);
}

/** The user's pan (spec §1.2): never idle-gated — a tap is always the user asking. */
export function panDeckCameraTo(robotId: string): void {
  moveCameraTo(robotId);
}

/** The semantic cut (spec §1.2, assumptions 7, 8): does nothing while the user is not idle, or
 *  when the robot is already on screen (no cut to where we already are). */
export function cutDeckCameraTo(robotId: string): void {
  if (!isDeckCameraIdle()) return;
  if (isRobotOnScreen(robotId)) return;
  moveCameraTo(robotId);
}

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
