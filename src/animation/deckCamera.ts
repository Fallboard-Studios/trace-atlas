// ========================================
// DECK CAMERA (docs/specs/DECK_CAMERA_FOLLOW.md §1.2, §1.4, Phase 46)
// ========================================
// A runtime module in the pattern of timelineMap.ts / refs.ts: module-level state, no React, no
// store state of its own (CLAUDE.md: runtime-only objects like DOM elements stay out of Zustand);
// it only reads robots from the locale store. It holds the touch/release input model: a finger (or
// pointer) on the deck scroller freezes the camera and kills any float in flight; letting go starts
// the cooldown clock; a wheel does both at once. It also holds the pick algorithm (which robot to
// follow) and the one gsap.ticker handler that runs the loop: float to the pick, follow it up to
// DECK_CAMERA_FOLLOW_MS or until it docks, rest DECK_CAMERA_COOLDOWN_MS, pick again. Nothing here
// reads audio state or calls AudioEngine (CLAUDE.md "Strict Separation").

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

import {
  DECK_CAMERA_COOLDOWN_MS,
  DECK_CAMERA_FOLLOW_MS,
  DECK_CAMERA_MIN_BATTERY_PCT,
  DECK_CAMERA_PAN_S,
  DECK_CAMERA_TIMELINE_ID,
} from '@/constants/deckCamera';
import { WORLD_BOUNDS } from '@/constants/sceneDepth';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { DockingState, type Robot } from '@/types/Robot';
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
/** The robot the camera is tracking each frame; null while floating, resting or held. */
let subjectId: string | null = null;
/** When the float to the subject landed, which is when its follow time begins. */
let followStartedAt = 0;
/** Identifies the float in flight, so a stale tween callback (one cancelled or replaced since)
 *  can tell it is no longer current. Null when no float is in flight. A finished tween stays
 *  registered in timelineMap, so that map cannot answer this. */
let currentFloat: number | null = null;
let floatCount = 0;

/** Drops whatever the camera was doing on its own: the float in flight and the followed robot. */
function cancelAutomaticMotion(): void {
  currentFloat = null;
  subjectId = null;
}

/** Touch or pointer down: freeze the camera where it is. */
function handleHold(): void {
  held = true;
  cancelAutomaticMotion();
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
  cancelAutomaticMotion();
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
 * or dropping the scroller lets go of any hold, since its `pointerup` would never arrive, and
 * drops any float or follow, which belonged to the old scroller. While a scroller is registered a
 * single `gsap.ticker` handler (`tick`) does the per-frame work.
 */
export function registerDeckScroller(el: HTMLElement | null): void {
  if (scroller) {
    for (const [type, handler] of LISTENERS) scroller.removeEventListener(type, handler);
  }
  gsap.ticker.remove(tick);
  scroller = el;
  held = false;
  cancelAutomaticMotion();
  killTimeline(DECK_CAMERA_TIMELINE_ID);
  if (scroller) {
    for (const [type, handler] of LISTENERS) scroller.addEventListener(type, handler);
    gsap.ticker.add(tick);
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

/** The active locale's robots, found the way OceanScene finds its locale. */
function currentRobots(): Robot[] {
  const localeId = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.currentLocaleId;
  return (localeId && useLocaleStore.getState().getLocaleById(localeId)?.robots) || [];
}

/** The ids of the current locale's robots that are out and about (`Active` or `Recalled`), the
 *  pool the camera picks from (spec §1.3). Reads the locale the way OceanScene does. */
export function undockedRobotIds(): string[] {
  return currentRobots()
    .filter((r) => r.docking === DockingState.Active || r.docking === DockingState.Recalled)
    .map((r) => r.id);
}

/**
 * Chooses which of `candidateIds` to follow (spec §1.3): the lowest battery among those above
 * `DECK_CAMERA_MIN_BATTERY_PCT`, else the lowest overall; a tie goes to the robot whose target is
 * nearest the scroller's current position, i.e. whose centre is nearest the viewport centre. Ids
 * not in the current locale are skipped. Returns `null` for an empty pool and restarts the
 * cooldown, so the next attempt is a full `DECK_CAMERA_COOLDOWN_MS` away. Starts no motion.
 */
export function pick(candidateIds: string[]): string | null {
  const pool = currentRobots().filter((r) => candidateIds.includes(r.id));
  if (pool.length === 0) {
    cooldownStartedAt = performance.now();
    return null;
  }
  const preferred = pool.filter((r) => r.batteryLevel > DECK_CAMERA_MIN_BATTERY_PCT);
  const ranked = preferred.length > 0 ? preferred : pool;
  const lowest = Math.min(...ranked.map((r) => r.batteryLevel));
  const tied = ranked.filter((r) => r.batteryLevel === lowest);
  const from = scroller?.scrollLeft ?? 0;
  const distance = (id: string) => {
    const target = targetFor(id);
    return target === null ? Infinity : Math.abs(target - from);
  };
  return tied.reduce((best, r) => (distance(r.id) < distance(best.id) ? r : best)).id;
}

/** Builds, registers and plays the `deck-camera` tween to `x` (spec §1.2, assumptions 4, 8, 9).
 *  `setTimeline` kills any tween already registered under `DECK_CAMERA_TIMELINE_ID`. */
function createCameraTween(x: number, robotId: string): void {
  if (!scroller) return;
  const duration = prefersReducedMotion() ? 0 : DECK_CAMERA_PAN_S;
  const float = ++floatCount;
  currentFloat = float;
  const tl = gsap.timeline({ paused: true });
  tl.to(scroller, {
    scrollTo: { x, autoKill: true },
    duration,
    // Landing starts the follow; being killed (a scroll auto-kills the tween) starts a rest. Either
    // is ignored if the float was cancelled or replaced meanwhile.
    onComplete: () => {
      if (currentFloat !== float) return;
      currentFloat = null;
      subjectId = robotId;
      followStartedAt = performance.now();
    },
    onInterrupt: () => {
      if (currentFloat !== float) return;
      currentFloat = null;
      cooldownStartedAt = performance.now();
    },
    // power1.inOut, not power2 (too sharp at the spec's 0.8s, read as a snap) or sine (too flat
    // in the middle, still read as abrupt — Crawford, manual check): a stronger, longer slow-in
    // and slow-out than sine, short of power2's sharper curve.
    ease: 'power1.inOut',
  });
  setTimeline(DECK_CAMERA_TIMELINE_ID, tl);
  tl.play();
}

/** Floats the camera to a robot if its target resolves, and follows it once it lands. Returns
 *  whether the float started. */
export function moveCameraTo(robotId: string): boolean {
  const x = targetFor(robotId);
  if (x === null) return false;
  createCameraTween(x, robotId);
  return true;
}

/** Lets go of the followed robot and starts the rest before the next pick. */
function endFollow(now: number): void {
  killTimeline(DECK_CAMERA_TIMELINE_ID);
  subjectId = null;
  cooldownStartedAt = now;
}

/** While following: tracks the subject's live position, until it docks, leaves the locale or its
 *  follow time is up. */
function followSubject(el: HTMLElement, id: string, now: number): void {
  const robot = currentRobots().find((r) => r.id === id);
  if (!robot || robot.docking === DockingState.Docked || now - followStartedAt >= DECK_CAMERA_FOLLOW_MS) {
    endFollow(now);
    return;
  }
  const target = targetFor(id);
  if (target !== null) el.scrollLeft = target;
}

/** The one per-frame handler (spec §1.2): tracks the subject, or once the cooldown has passed
 *  picks the next robot. Does nothing while the user holds the scroller or a float is in flight. */
function tick(): void {
  if (!scroller || held) return;
  const now = performance.now();
  if (subjectId !== null) {
    followSubject(scroller, subjectId, now);
    return;
  }
  if (currentFloat !== null || now - cooldownStartedAt < DECK_CAMERA_COOLDOWN_MS) return;
  const id = pick(undockedRobotIds());
  // A winner whose ref has not mounted cannot be floated to: rest rather than retry every frame.
  if (id !== null && !moveCameraTo(id)) cooldownStartedAt = now;
}

// ========================================
// TEST-ONLY
// ========================================

/** The input model's state, for assertions. */
export function __deckCameraStateForTest(): { held: boolean; cooldownStartedAt: number } {
  return { held, cooldownStartedAt };
}

/** Resets the module to its just-imported state: not held, no float or follow, boot cooldown
 *  sentinel. */
export function __resetDeckCameraForTest(): void {
  held = false;
  cooldownStartedAt = -Infinity;
  cancelAutomaticMotion();
}
