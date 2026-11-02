// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

import { killTimeline, setTimeline } from './timelineMap';
import { useUIStore, type SceneWash } from '../stores/uiStore';
import { attachSceneWash } from '../systems/worldChange';
import { getRef } from '../utils/refs';
import { waterColumnColors } from '../utils/waterColumnColors';

// ========================================
// CONSTANTS
// ========================================

/** WorldView's wash element, registered on mount (utils/refs), read by startSceneWash. */
export const WORLD_WASH_REF_KEY = 'world-wash';
/** The wash's timelineMap id: one at a time, the cover or the uncover. */
export const SCENE_WASH_TIMELINE = 'scene-wash';
/** Each fade, in and out: Crawford's, 2026-10-31. */
export const SCENE_WASH_SECONDS = 0.5;

// ========================================
// FUNCTIONS
// ========================================

/** The sea at the hour a cover starts: the water column's own two stops (waterColumnColors), top to bottom. */
function seaGradient(): string {
  const { top, bottom } = waterColumnColors(useUIStore.getState().activeLocaleLocalTime ?? 12);
  return `linear-gradient(${top}, ${bottom})`;
}

/** One fade of the wash to `opacity` over SCENE_WASH_SECONDS, which sets `then` when it lands - semantic state, nothing
 *  else. Registered in timelineMap as `'ui'`, so it runs over a paused world; registering it kills whatever fade was
 *  running, so a new state always starts from where the wash is. */
function fade(wash: Element, opacity: number, then: Extract<SceneWash, 'covered' | 'clear'>): void {
  const tl = gsap.timeline({ onComplete: () => useUIStore.getState().setSceneWash(then) });
  tl.to(wash, { opacity, duration: SCENE_WASH_SECONDS, ease: 'power1.inOut' });
  setTimeline(SCENE_WASH_TIMELINE, tl, 'ui');
}

/**
 * The scene wash (docs/tasks/OFF_SCREEN_REVISIONS.md Task 13; Crawford's note 7, his answer 4): a smooth cut between
 * worlds. WorldView registers its wash element - over the scene, under MetaBox, taking no clicks - and starts this on
 * mount; it attaches to the request module (systems/worldChange.ts), so a user-gesture world change waits for it, and
 * follows uiStore.sceneWash: 'covering' paints the wash in the sea's colours at this hour - from clear only; a re-cover
 * while uncovering keeps the colours it shows - and fades it in over 0.5 s,
 * setting 'covered' when opaque - which runs the change; 'uncovering' fades it out over 0.5 s and sets 'clear'; a 'clear'
 * set from outside (a reduced-motion request, the request module letting go) snaps it transparent. From the cover's start
 * to 'clear' the wash has a compositor layer of its own (`will-change: opacity`), so neither fade re-rasters it. Each state is acted
 * on once, however the store's listeners nest. The timelines only set semantic state (CLAUDE.md, Strict Separation):
 * nothing here touches the audio. Returns the stop - unsubscribe, kill the fade, detach - which WorldView calls on
 * unmount; with no element registered there is nothing to start and the stop does nothing.
 *
 * The fade-out starts on the first tick after the one the change ran in. The change - a whole world rebuilt - runs just
 * after the cover's completion, which GSAP calls from its root timeline mid-tick: the request module hands it to a
 * resolved promise, so it runs once GSAP's frame callback has returned (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R12),
 * and can hold the main thread for a few hundred milliseconds. A tween made then is still stamped at that tick's start,
 * and the next tick, after the rebuild, would find most of its 0.5 s gone (measured headless on a Roll: about 75 ms of
 * the fade-out showed). A listener on GSAP's own ticker that skips the frame it was added in starts the fade once the
 * root has caught up - the root updates first on every tick - so all of it is seen.
 */
export function startSceneWash(): () => void {
  const wash = getRef(WORLD_WASH_REF_KEY);
  if (!wash) return () => undefined;
  const detach = attachSceneWash();
  let shown: SceneWash = useUIStore.getState().sceneWash;
  let waiting: gsap.TickerCallback | null = null;
  const stopWaiting = () => {
    if (waiting) gsap.ticker.remove(waiting);
    waiting = null;
  };
  const afterThisFrame = (run: () => void) => {
    const addedIn = gsap.ticker.frame;
    waiting = (_time, _delta, frame) => {
      if (frame <= addedIn) return;
      stopWaiting();
      run();
    };
    gsap.ticker.add(waiting);
  };
  const unsubscribe = useUIStore.subscribe(({ sceneWash }) => {
    if (sceneWash === shown) return;
    const was = shown;
    shown = sceneWash;
    stopWaiting();
    if (sceneWash === 'covering') {
      // Painted only from clear: a re-cover while uncovering keeps the colours it already shows, rather than swap the
      // old hour's sea for the new world's under a half-opaque wash (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R21).
      // From clear it also takes a compositor layer of its own until 'clear', so both fades are the compositor's: without
      // it the whole wash re-rastered in every frame of each fade (R26, item 5: about 0.9 of a screen a frame on a desk).
      if (was === 'clear') gsap.set(wash, { backgroundImage: seaGradient(), willChange: 'opacity' });
      fade(wash, 1, 'covered');
    } else if (sceneWash === 'uncovering') {
      afterThisFrame(() => fade(wash, 0, 'clear'));
    } else if (sceneWash === 'clear') {
      killTimeline(SCENE_WASH_TIMELINE);
      gsap.set(wash, { opacity: 0, willChange: 'auto' });
    }
  });
  return () => {
    unsubscribe();
    stopWaiting();
    killTimeline(SCENE_WASH_TIMELINE);
    detach();
  };
}
