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
/** The power-off fade-in's timelineMap id (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F6). */
export const OFF_SCREEN_FADE_IN_TIMELINE = 'off-screen-fade-in';

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

/** How a power-on fade ends: run to the end, or killed by restoreOffScreen with the screen back (F13). */
export type OffScreenFadeResult = 'done' | 'cancelled';

/** The power-on fade in flight, which a second press joins (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F13); null when none
 *  is. Its timeline is kept so a fade killed elsewhere (the screen unmounting) is never joined. */
let pendingFade: { timeline: gsap.core.Timeline; promise: Promise<OffScreenFadeResult>; settle: (result: OffScreenFadeResult) => void } | null =
  null;

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

/**
 * The power-off fade-in (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F6, Crawford's answer 2a), the reverse of
 * fadeOffScreen: the screen mounts over a world just paused, so it fades in rather than replaying the first-load
 * flicker. The theatre's dark layer is hidden at once; the other parts (the veil and the column) tween from
 * transparent to opaque over the fade's 0.4 s — the parts, never the root, so the veil's blur fades in with it (R26
 * item 2). A `'ui'` timeline in timelineMap, so it runs over the paused world, and fadeOffScreen kills it on a power-on
 * mid-fade. Under `prefers-reduced-motion: reduce` the parts are shown at once. Returns the stop: it kills the timeline
 * and reverts the media match; the screen calls it on unmount.
 */
export function fadeInOffScreen(root: Element): () => void {
  const parts = Array.from(root.children);
  const dark = parts.find((part) => part.classList.contains('off-screen__dark'));
  if (dark) gsap.set(dark, { opacity: 0, visibility: 'hidden' });
  const tl = gsap.timeline();
  tl.fromTo(
    parts.filter((part) => part !== dark),
    { opacity: 0 },
    { opacity: 1, duration: FADE_SECONDS, ease: 'power1.out' },
  );
  setTimeline(OFF_SCREEN_FADE_IN_TIMELINE, tl);

  const mm = gsap.matchMedia();
  mm.add(REDUCED_MOTION, () => {
    tl.progress(1);
  });

  return () => {
    mm.revert();
    killTimeline(OFF_SCREEN_FADE_IN_TIMELINE);
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
 * during the boot theatre or the power-off fade-in just goes: that timeline is killed first, and the parts fade from
 * where they stand. Resolves at once when the screen is not mounted
 * (no ref) — a power-on with nothing to fade. Semantic only: the timeline resolves a promise and the controller does
 * the rest; nothing here touches the audio.
 *
 * One fade at a time (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F13): a call while a fade is in flight returns that fade's
 * promise, so a second press joins the first rather than killing its timeline and leaving its promise unsettled. The
 * promise resolves `'done'` once the fade has run, or `'cancelled'` when restoreOffScreen kills it.
 */
export function fadeOffScreen(): Promise<OffScreenFadeResult> {
  const screen = getRef(OFF_SCREEN_REF_KEY);
  if (!screen) return Promise.resolve('done');
  if (pendingFade && getTimeline(OFF_SCREEN_FADE_TIMELINE) === pendingFade.timeline) return pendingFade.promise;
  killTimeline(OFF_SCREEN_BOOT_TIMELINE);
  killTimeline(OFF_SCREEN_FADE_IN_TIMELINE);
  // From the fade's first frame the screen takes no input, through the transparent wait of a slow first start too:
  // nothing the eye has lost can still be clicked (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R19).
  screen.setAttribute('inert', '');
  let settle!: (result: OffScreenFadeResult) => void;
  const promise = new Promise<OffScreenFadeResult>((resolve) => {
    settle = resolve;
  });
  const tl = gsap.timeline({ onComplete: () => settlePendingFade(tl, 'done') });
  // The parts fade - the veil, the theatre's dark layer, the column - never the root: an ancestor below opacity 1 is a
  // backdrop root, which left the veil's backdrop-filter nothing to blur, so the world showed sharp on the fade's first
  // frame (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R26, item 2). The veil's own opacity fades its blur with it.
  tl.to(Array.from(screen.children), { opacity: 0, duration: FADE_SECONDS, ease: 'power1.out' });
  pendingFade = { timeline: tl, promise, settle };
  setTimeline(OFF_SCREEN_FADE_TIMELINE, tl);
  return promise;
}

/** Settle the pending fade, if `timeline` is still it (null: whichever is pending), and let it go. */
function settlePendingFade(timeline: gsap.core.Timeline | null, result: OffScreenFadeResult): void {
  if (!pendingFade || (timeline && pendingFade.timeline !== timeline)) return;
  const { settle } = pendingFade;
  pendingFade = null;
  settle(result);
}

/**
 * The fade undone (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R19): the fade killed, the screen's parts opaque again and
 * the screen taking input. The theatre's dark layer is left hidden, as a finished theatre leaves it, since the fade may
 * have cut the theatre short. powerController calls it when the start after the fade fails, so a failed power-on leaves
 * the off screen ready rather than invisible and still mounted over the glass. A no-op with no screen mounted. A fade
 * it kills settles as `'cancelled'`, so a press waiting on it returns rather than waiting for good (F13).
 */
export function restoreOffScreen(): void {
  const screen = getRef(OFF_SCREEN_REF_KEY);
  if (!screen) return;
  killTimeline(OFF_SCREEN_FADE_TIMELINE);
  settlePendingFade(null, 'cancelled');
  const parts = Array.from(screen.children);
  const dark = parts.find((part) => part.classList.contains('off-screen__dark'));
  gsap.set(parts.filter((part) => part !== dark), { opacity: 1 });
  if (dark) gsap.set(dark, { opacity: 0, visibility: 'hidden' });
  screen.removeAttribute('inert');
}
