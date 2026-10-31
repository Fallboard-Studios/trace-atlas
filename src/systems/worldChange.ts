// ========================================
// IMPORTS
// ========================================
import { useUIStore } from '../stores/uiStore';

// ========================================
// MODULE STATE
// ========================================

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The change waiting for the cover. A closure, so runtime-only and never in a store (CLAUDE.md); the last request wins. */
let pending: (() => void) | null = null;
/** How many washes are mounted to cover a change: animation/sceneWash.ts attaches while WorldView's wash element is. */
let washes = 0;

// ========================================
// FUNCTIONS
// ========================================

/** The theatre's test (animation/offScreenTheatre.ts reads the same query through gsap.matchMedia; nothing here is GSAP). */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;
}

/** The cover has landed: run the pending change - and any change it asks for in turn - then uncover, whatever happens,
 *  so a throwing change never leaves the wash standing over the world. */
function runPending(): void {
  try {
    while (pending) {
      const change = pending;
      pending = null;
      change();
    }
  } finally {
    useUIStore.getState().setSceneWash('uncovering');
  }
}

useUIStore.subscribe((state, prev) => {
  if (state.sceneWash === 'covered' && prev.sceneWash !== 'covered') runPending();
});

/**
 * Ask for a world change that a user gesture made (docs/tasks/OFF_SCREEN_REVISIONS.md Task 12; Crawford's note 7, and
 * his answer 4: the change waits for the cover, 0.5 s each way). `change` is the caller's whole synchronous body - the
 * retransmit or the apply, then its own follow-ups - and is kept here, not in a store, until the scene wash
 * (animation/sceneWash.ts) is opaque: the request sets uiStore.sceneWash to 'covering'; the wash's timeline sets
 * 'covered' when it lands, which runs the change once and sets 'uncovering'; the wash fades and sets 'clear'. A request
 * while 'covering' replaces the pending change (the last pick wins; the first never runs); one while 'uncovering' covers
 * again. Under prefers-reduced-motion, or with no wash mounted - nothing would ever cover the change - it runs at once
 * and the state is left 'clear', dropping anything pending (the newer request wins). Semantic state only: nothing here
 * touches GSAP or the audio, and the boot paths (bootWorld, the link boot, applySessionPayload's own retransmit) never
 * come through here.
 */
export function requestWorldChange(change: () => void): void {
  const store = useUIStore.getState();
  if (washes === 0 || prefersReducedMotion()) {
    pending = null;
    if (store.sceneWash !== 'clear') store.setSceneWash('clear');
    change();
    return;
  }
  pending = change;
  if (store.sceneWash === 'clear' || store.sceneWash === 'uncovering') store.setSceneWash('covering');
}

/**
 * Drop the change waiting for the cover (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R3: the off screen's Current, picked
 * while a pick waits). The cover is already on its way, so it still lands and lifts, running nothing; with nothing
 * pending this does nothing.
 */
export function cancelWorldChange(): void {
  pending = null;
}

/**
 * The wash attaches while its element is mounted (animation/sceneWash.ts's startSceneWash) and the returned detach runs
 * when it unmounts. With no wash left, a change still waiting would never be covered, so detaching runs it at once and
 * clears the state. A second call of the same detach does nothing.
 */
export function attachSceneWash(): () => void {
  washes++;
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    washes--;
    if (washes > 0) return;
    const change = pending;
    pending = null;
    if (useUIStore.getState().sceneWash !== 'clear') useUIStore.getState().setSceneWash('clear');
    change?.();
  };
}
