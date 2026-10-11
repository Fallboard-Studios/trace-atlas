/** How long the camera stays on a followed robot before letting go, unless the robot docks first
 *  (docs/specs/DECK_CAMERA_FOLLOW.md §1.6). */
export const DECK_CAMERA_FOLLOW_MS = 20000;

/** The rest after a follow ends, or after the user lets go of the scroller, before the camera picks
 *  its next robot (spec §1.6). The first pick after boot has no wait. */
export const DECK_CAMERA_COOLDOWN_MS = 8000;

/** A robot must have MORE than this battery percentage to be preferred when picking; if none
 *  qualifies the lowest battery overall wins (spec §1.3, §1.6). */
export const DECK_CAMERA_MIN_BATTERY_PCT = 50;

/* DECK_CAMERA_IDLE_MS and DECK_CAMERA_CUT_COOLDOWN_MS belong to the superseded idle-cut model; they
   go when deckCamera.ts stops importing them (docs/tasks/DECK_CAMERA_FOLLOW.md Task 5). */

/** How long the deck scroller must see no user input before a semantic
 *  cut is allowed (spec assumption 8). */
export const DECK_CAMERA_IDLE_MS = 8000;

/** Pan/cut tween duration in seconds, full motion (spec assumption 9 sets
 *  this to 0 under prefers-reduced-motion, not here). Raised from the spec's 0.8 (Crawford,
 *  manual check: too fast/abrupt for the stage's width) to read as a pan, not a snap. */
export const DECK_CAMERA_PAN_S = 1.4;

/** timelineMap id for the deck camera's tween (spec §1.2). */
export const DECK_CAMERA_TIMELINE_ID = 'deck-camera';

/** The minimum time between two automatic (lifecycle) cuts, and so the camera's minimum dwell
 *  time on whatever it last cut to. Raised from an initial 4000 (Crawford, second phone pass: with
 *  a job lasting only JOB_BASE_MIN/MAX_SECONDS (6-10s) and 12 robots cycling through one, the
 *  camera had a legitimate reason to cut again every few seconds almost continuously, which read
 *  as randomly jumping even with no whiplash bug left — this is restraint, not a bug fix). Never
 *  applies to a tap-to-pan — that is the user asking, same exemption as the idle gate. */
export const DECK_CAMERA_CUT_COOLDOWN_MS = 20000;
