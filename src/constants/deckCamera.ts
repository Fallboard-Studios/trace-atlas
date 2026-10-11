/** How long the deck scroller must see no user input before a semantic
 *  cut is allowed (spec assumption 8). */
export const DECK_CAMERA_IDLE_MS = 8000;

/** Pan/cut tween duration in seconds, full motion (spec assumption 9 sets
 *  this to 0 under prefers-reduced-motion, not here). */
export const DECK_CAMERA_PAN_S = 0.8;

/** timelineMap id for the deck camera's tween (spec §1.2). */
export const DECK_CAMERA_TIMELINE_ID = 'deck-camera';
