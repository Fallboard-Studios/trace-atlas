/** How long the camera stays on a followed robot before letting go, unless the robot docks first
 *  (docs/specs/DECK_CAMERA_FOLLOW.md §1.6). */
export const DECK_CAMERA_FOLLOW_MS = 20000;

/** The rest after a follow ends, or after the user lets go of the scroller, before the camera picks
 *  its next robot (spec §1.6). The first pick after boot has no wait. */
export const DECK_CAMERA_COOLDOWN_MS = 8000;

/** A robot must have MORE than this battery percentage to be preferred when picking; if none
 *  qualifies the lowest battery overall wins (spec §1.3, §1.6). */
export const DECK_CAMERA_MIN_BATTERY_PCT = 50;

/** Float tween duration in seconds, full motion (spec assumption 9 sets
 *  this to 0 under prefers-reduced-motion, not here). Raised from the spec's 0.8 (Crawford,
 *  manual check: too fast/abrupt for the stage's width) to read as a pan, not a snap. */
export const DECK_CAMERA_PAN_S = 1.4;

/** timelineMap id for the deck camera's tween (spec §1.2). */
export const DECK_CAMERA_TIMELINE_ID = 'deck-camera';
