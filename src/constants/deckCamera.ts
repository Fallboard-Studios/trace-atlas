/** How long the deck scroller must see no user input before a semantic
 *  cut is allowed (spec assumption 8). */
export const DECK_CAMERA_IDLE_MS = 8000;

/** Pan/cut tween duration in seconds, full motion (spec assumption 9 sets
 *  this to 0 under prefers-reduced-motion, not here). Raised from the spec's 0.8 (Crawford,
 *  manual check: too fast/abrupt for the stage's width) to read as a pan, not a snap. */
export const DECK_CAMERA_PAN_S = 1.4;

/** timelineMap id for the deck camera's tween (spec §1.2). */
export const DECK_CAMERA_TIMELINE_ID = 'deck-camera';

/** A lifecycle cut's chance of targeting the departing robot's station instead of a robot
 *  currently working a site, when at least one exists (Crawford, post-ship: the station-only cut
 *  read as uninteresting; prefer live work). Always the station when nothing is being worked. */
export const DECK_CAMERA_STATION_CHANCE = 0.15;

/** The minimum time between two automatic (lifecycle) cuts, and so the camera's minimum dwell
 *  time on whatever it last cut to. Raised from an initial 4000 (Crawford, second phone pass: with
 *  a job lasting only JOB_BASE_MIN/MAX_SECONDS (6-10s) and 12 robots cycling through one, the
 *  camera had a legitimate reason to cut again every few seconds almost continuously, which read
 *  as randomly jumping even with no whiplash bug left — this is restraint, not a bug fix). Never
 *  applies to a tap-to-pan — that is the user asking, same exemption as the idle gate. */
export const DECK_CAMERA_CUT_COOLDOWN_MS = 20000;
