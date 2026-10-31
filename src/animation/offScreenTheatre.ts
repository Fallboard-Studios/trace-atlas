// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

import { getTimeline, killTimeline, setTimeline } from './timelineMap';
import { getRef } from '../utils/refs';

// ========================================
// CONSTANTS
// ========================================

/** The off screen's root, registered by OffScreen on mount (utils/refs), read by fadeOffScreen. */
export const OFF_SCREEN_REF_KEY = 'off-screen';
/** The boot theatre's timelineMap id. */
export const OFF_SCREEN_BOOT_TIMELINE = 'off-screen-boot';
/** The power-on fade's timelineMap id. */
export const OFF_SCREEN_FADE_TIMELINE = 'off-screen-fade';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The theatre's clock (docs/sketches/off-screen.html, frame A): dark, then a flicker to ready. */
const DARK_SECONDS = 0.5;
/** The flicker's steps, in order — each an opacity for the dark layer and a duration; they sum to 1 s. */
const FLICKER: readonly { opacity: number; duration: number }[] = [
  { opacity: 0.35, duration: 0.12 },
  { opacity: 0.85, duration: 0.08 },
  { opacity: 0.15, duration: 0.15 },
  { opacity: 0.6, duration: 0.1 },
  { opacity: 0, duration: 0.55 },
];
const FADE_SECONDS = 0.4;

// ========================================
// EXPORTS
// ========================================

/**
 * The boot theatre (docs/specs/OFF_SCREEN.md assumption 18): on mount the screen is dark for half a second — the
 * strips and the power corner are lit, the world is already built beneath — then flickers on over the next second
 * and is ready. `dark` is the screen's opaque black layer over its content (OffScreen.css); the timeline fades it
 * through the flicker and hides it at the end. Registered in timelineMap as `'ui'`, so it runs while the world it
 * covers is paused. Under `prefers-reduced-motion: reduce` it jumps to ready at once (gsap.matchMedia, which also
 * fires if the preference changes under it). The rocker sits outside the screen and works from t = 0 — a flip
 * during the theatre just goes (fadeOffScreen kills this). Returns the stop: it kills the timeline and reverts the
 * media match; the screen calls it on unmount.
 */
export function startOffScreenBoot(dark: Element): () => void {
  const tl = gsap.timeline();
  tl.to({}, { duration: DARK_SECONDS });
  for (const step of FLICKER) tl.to(dark, { opacity: step.opacity, duration: step.duration, ease: 'none' });
  tl.set(dark, { visibility: 'hidden' });
  setTimeline(OFF_SCREEN_BOOT_TIMELINE, tl);

  const mm = gsap.matchMedia();
  mm.add(REDUCED_MOTION, () => {
    tl.progress(1);
  });

  return () => {
    mm.revert();
    killTimeline(OFF_SCREEN_BOOT_TIMELINE);
  };
}

/** Any tap on the screen skips to ready (assumption 18). A no-op once the theatre is over or gone. */
export function skipOffScreenBoot(): void {
  getTimeline(OFF_SCREEN_BOOT_TIMELINE)?.progress(1);
}

/**
 * The power-on fade (assumption 18): the screen — its veil is its own child, so the veil with it — tweens to
 * transparent over 0.4 s, as a `'ui'` timeline in timelineMap, and the promise resolves when it is done.
 * powerController.powerOnSequence awaits it before anything wakes and before the power flag flips, so the veil is
 * gone before ScreenViewport unmounts the screen and nothing of the world shows unveiled under the chrome. A flip
 * during the boot theatre just goes: the theatre is killed first. Resolves at once when the screen is not mounted
 * (no ref) — a power-on with nothing to fade. Semantic only: the timeline resolves a promise and the controller does
 * the rest; nothing here touches the audio.
 */
export function fadeOffScreen(): Promise<void> {
  const screen = getRef(OFF_SCREEN_REF_KEY);
  if (!screen) return Promise.resolve();
  killTimeline(OFF_SCREEN_BOOT_TIMELINE);
  return new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: () => resolve() });
    tl.to(screen, { opacity: 0, duration: FADE_SECONDS, ease: 'power1.out' });
    setTimeline(OFF_SCREEN_FADE_TIMELINE, tl);
  });
}
