// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

// ========================================
// TYPES
// ========================================
// Use the actual return type of `gsap.timeline()` so we avoid deprecated
// `TimelineLite` and stay aligned with the GSAP public API.
type Timeline = ReturnType<typeof gsap.timeline>;

/**
 * Who a timeline belongs to (docs/specs/OFF_SCREEN.md assumption 3). `'world'` is everything that moves in the world —
 * swims, job moves, station arcs, halo waves, orbiters, bubbles, the deck camera — and pauses as one set when the
 * power rocker pauses the world; `'ui'` (the default) is the tablet's own chrome — the rocker, the nav, cabinet
 * pops — which keeps running while the world is paused.
 */
export type TimelineScope = 'world' | 'ui';

// ========================================
// MODULE STATE
// ========================================
export const timelineMap = new Map<string, Timeline>();
const scopes = new Map<string, TimelineScope>();
/** True between pauseWorldTimelines() and resumeWorldTimelines(): a world timeline registered meanwhile is paused on
 *  arrival, so a robot that re-renders while the tablet is off does not start swimming. */
let worldPaused = false;
/** The world timelines pauseWorldTimelines() (or a paused-span registration) paused — the only ones resume plays again,
 *  so a timeline its owner had paused on purpose stays paused across a power cycle. */
const pausedByWorld = new Set<string>();

// ========================================
// EXPORTS
// ========================================

/**
 * Store a timeline in the map under a scope (default `'ui'`). If a timeline with the same ID exists, it is killed first
 * to prevent memory leaks. A `'world'` timeline registered while the world is paused is paused at once (assumption 3).
 */
export function setTimeline(id: string, timeline: Timeline, scope: TimelineScope = 'ui'): void {
  const existing = timelineMap.get(id);
  if (existing) {
    existing.kill();
  }
  pausedByWorld.delete(id);

  timelineMap.set(id, timeline);
  scopes.set(id, scope);
  if (scope === 'world' && worldPaused && !timeline.paused()) {
    timeline.pause();
    pausedByWorld.add(id);
  }
}

/** The scope a registered id carries, or undefined for an unknown id. */
export function getTimelineScope(id: string): TimelineScope | undefined {
  return scopes.get(id);
}

/**
 * Pause every `'world'` timeline that is playing, and remember which, so resumeWorldTimelines() plays exactly those.
 * Idempotent. The UI's timelines are untouched (the rocker's own press animation runs through this).
 */
export function pauseWorldTimelines(): void {
  worldPaused = true;
  timelineMap.forEach((timeline, id) => {
    if (scopes.get(id) !== 'world' || timeline.paused()) return;
    timeline.pause();
    pausedByWorld.add(id);
  });
}

/** Play again every world timeline pauseWorldTimelines() paused (and none it did not), and end the paused span. */
export function resumeWorldTimelines(): void {
  worldPaused = false;
  pausedByWorld.forEach((id) => {
    timelineMap.get(id)?.play();
  });
  pausedByWorld.clear();
}

/**
 * Retrieve a timeline from the map.
 * Returns undefined if not found.
 */
export function getTimeline(id: string): Timeline | undefined {
  return timelineMap.get(id);
}

/**
 * Kill a timeline and remove it from the map.
 * Safe to call even if timeline doesn't exist.
 */
export function killTimeline(id: string): void {
  const timeline = timelineMap.get(id);
  if (timeline) {
    timeline.kill();
    timelineMap.delete(id);
  }
  scopes.delete(id);
  pausedByWorld.delete(id);
}

/**
 * Kill all timelines and clear the map, the scopes and the world pause.
 * Useful for cleanup on app shutdown or reset.
 */
export function killAllTimelines(): void {
  timelineMap.forEach((timeline) => {
    timeline.kill();
  });
  timelineMap.clear();
  scopes.clear();
  pausedByWorld.clear();
  worldPaused = false;
}
