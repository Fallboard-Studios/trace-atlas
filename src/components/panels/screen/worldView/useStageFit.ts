import { useLayoutEffect, type RefObject } from 'react';

import { sceneFit } from './sceneFit';

// ========================================
// STAGE FIT
// docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.1 (roadmap Phase 53, Task 7)
// ========================================

const roundTo = (value: number, places: number) => Number(value.toFixed(places));

/** The last scale written to `--stage-scale`; 1 until the first real resize. */
let stageScale = 1;

/**
 * The stage's current scale as a number, without a layout read: the value `useStageFit` last wrote
 * to `--stage-scale` (1 until the first resize). Read, not subscribed to: the note cloud reads it
 * when a note arrives for its 4-pixel floor (docs/specs/ROBOT_NOTE_CLOUD.md §1.6, note cloud Task 11).
 */
export function getStageScale(): number {
  return stageScale;
}

/**
 * Fits the stage into the scene box. A ResizeObserver on the scene writes `--stage-scale`,
 * `--stage-x` and `--stage-y` (from `sceneFit`) on it, and the stage's CSS reads them: one write per
 * resize, never per frame. A box with a zero side (jsdom, a `display: none` ancestor) is not laid
 * out, so it writes nothing and the CSS defaults stand. Values are rounded so the DOM carries no
 * float noise (scale to six places, offsets to a thousandth of a pixel).
 *
 * A layout effect, not a passive one: it observes in the commit, so the observer's first delivery lands
 * before the first paint and no frame shows the unscaled stage.
 */
export function useStageFit(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const scene = ref.current;
    if (!scene) return;

    const observer = new ResizeObserver((entries) => {
      for (const { contentRect } of entries) {
        if (contentRect.width <= 0 || contentRect.height <= 0) continue;
        const { scale, x, y } = sceneFit(contentRect);
        stageScale = roundTo(scale, 6);
        scene.style.setProperty('--stage-scale', String(stageScale));
        scene.style.setProperty('--stage-x', `${roundTo(x, 3)}px`);
        scene.style.setProperty('--stage-y', `${roundTo(y, 3)}px`);
      }
    });
    observer.observe(scene);
    return () => observer.disconnect();
  }, [ref]);
}
