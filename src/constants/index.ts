import type { JobType } from '../types/Robot';

/** Fixed roster size — every locale spawns exactly this many robots once, at load. */
export const MAX_ROBOTS = 12;

/**
 * World dimensions (SVG viewBox)
 */
export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1080;

/**
 * Development tuning flag for verbose logging
 * Logs spawn events, melody registration, and other debug info
 */
export const DEV_TUNING = import.meta.env.DEV;

/**
 * Default scheduling lookahead applied when scheduling notes (seconds).
 * Typical values: 0.05–0.1 (50–100ms). AudioEngine defaults to 0.1s.
 */
export const MIN_LEAD = 0.1;

/**
 * Global cap on simultaneously triggered notes, enforced by AudioEngine's
 * triggerWithCap(). See docs/POLYPHONY_GUIDE.md. Not a per-robot limit — each
 * robot's reserved composite voice is separate from this cap; only the act of
 * triggering a note counts against it.
 */
export const MAX_POLYPHONY = 16;

// ========================================
// AUDIO LOAD BUDGET (docs/specs/AUDIO_LOAD_BUDGET.md §4.2)
// ========================================
// One 0–1 dial ("Audio Load") lowers audio cost. At 1 (Full) every limit equals today's behavior:
// MAX_ROBOTS audible robots, MAX_POLYPHONY notes, drift and every LFO on, unlimited robot LFOs.
// Counts interpolate linearly between the floor and Full; the booleans switch at the thresholds below.

/** Audible robots allowed at audioLoad = 0 (rises linearly to MAX_ROBOTS at 1). */
export const LOAD_AUDIBLE_ROBOTS_MIN = 2;
/** Simultaneous notes allowed at audioLoad = 0 (rises linearly to MAX_POLYPHONY at 1). */
export const LOAD_POLYPHONY_MIN = 6;
/** The three named dial positions. */
export const AUDIO_LOAD_PRESETS = { light: 0.2, standard: 0.6, full: 1 } as const;
/** Drift ("stacked" LFOs) is on at/above this dial position — measured as the cheapest big win, so it goes first. */
export const LOAD_DRIFT_MIN = 0.8;
/** Global filter-frequency/Q LFOs are on at/above this dial position (EQ-gain LFOs are nearly free and always on). */
export const LOAD_FILTER_LFOS_MIN = 0.4;
/** Below this dial position (Light's zone) the AudioContext latency hint is "playback"; at/above it, "interactive". */
export const LOAD_PLAYBACK_BELOW = 0.4;
/**
 * Audio-rate robot LFOs that may be connected at once at Light and Standard. Measured, not guessed
 * (docs/PERFORMANCE.md "Robot-LFO cost by target type"): each costs ≈ +0.012 render capacity with drift off.
 */
export const ROBOT_LFO_CAP_LIGHT = 4;
export const ROBOT_LFO_CAP_STANDARD = 12;
/**
 * The most audio-rate robot LFOs that could ever connect (volume + 3 layers × gain/detune/pulseWidth,
 * per robot) — the finite value the cap climbs to just short of Full, where it becomes unlimited.
 */
export const ROBOT_LFO_CAP_CEILING = MAX_ROBOTS * 10;

/**
 * Fixed size of the harmony palette — every hour-equivalent's `TIME_PITCHES` entry
 * (harmonySystem.ts) is exactly 8 notes, structurally enforced by the `EighthNotes`
 * tuple type. This constant is for the bare-literal bounds derived from that size
 * (note-index clamping, unweighted random pick) elsewhere in melodyGenerator.ts —
 * not a substitute for the tuple type itself. Distinct from NOTE_VARIANCE_MAX below,
 * which is a different concept (max tuning-knob value) that happens to equal 8 too.
 */
export const NOTE_PALETTE_SIZE = 8;

/**
 * CLAUDE.md guardrail: "96 measures = 1 day cycle." Single source of truth for
 * both real day-cycle consumers — beatClock.ts's measure-wrap math and
 * lightingUtils.ts's building-lighting phase (Factory.tsx). Previously
 * declared independently in each (docs/DUPLICATE_VALUE_AUDIT.md item 2);
 * centralized here so the two can't silently diverge. beatClock.ts's own
 * getCurrentHour() has no production callers today (harmonySystem.ts derives
 * its palette index from getCurrentMeasure() instead, per
 * docs/specs/HARMONY_PALETTE_SEQUENCING.md) but still shares this constant.
 */
export const DAY_CYCLE_MEASURES = 96;

/**
 * Fixed real-world milliseconds per full in-world day (6 minutes), and the
 * pure function that derives a locale's current hour from its own
 * dayStartTimestamp. See docs/specs/ATTENUATION_STYLE.md §1.1.
 */
export { DAY_DURATION_MS, computeLocaleHour } from './time';

/**
 * Valid ranges for robot melody-generation parameters. Shared source of truth
 * for melodyGenerator.ts's clamping, localeStore.ts's updateRobot validation,
 * and the Robot Audio editor's sliders — keep these in sync across all three.
 *
 * `rhythmicDensity` is a 0-100% fill rate (not an onset count). `rhythmicMotifLength`
 * and `noteVariance` are both `{ active: boolean; value: number }` — MIN/MAX below
 * bound the nested `value`, 0-8 for both (docs/specs/STEPPER_TO_SLIDER.md). `value === 0`
 * is now itself the "off" state for each; `active` is a derived, enforced consequence of
 * `value > 0` everywhere a payload for these two fields is written, never independently
 * settable. (Prior to that phase, `value`'s floor was 1 and `active: false` was the sole
 * off state — this reverses that.)
 */
export const RHYTHMIC_DENSITY_MIN = 0;
export const RHYTHMIC_DENSITY_MAX = 100;
export const RHYTHMIC_MOTIF_LENGTH_MIN = 0;
export const RHYTHMIC_MOTIF_LENGTH_MAX = 8;
export const NOTE_VARIANCE_MIN = 0;
export const NOTE_VARIANCE_MAX = 8;
export const OCTAVE_RANGE_MIN = 1;
export const OCTAVE_RANGE_MAX = 7;

/**
 * `pitchRepeat` is a 0-100% lock strength (not a toggle) — same shape as `rhythmicDensity`. See
 * docs/specs/PITCH_REPEAT.md.
 */
export const PITCH_REPEAT_MIN = 0;
export const PITCH_REPEAT_MAX = 100;

/**
 * Robot Systems Engine (Roadmap Phase 7) — Battery/Docking/Job lifecycle constants.
 * See docs/specs/ROBOT_SYSTEMS_ENGINE.md and src/systems/robotSystems.ts.
 */

/** Seeded count of robots that start Active (rest start Docked) when a locale's roster is created. */
export const INITIAL_ACTIVE_ROBOTS_MIN = 2;
export const INITIAL_ACTIVE_ROBOTS_MAX = 4;

/** Battery drain, percent per measure, while a robot is Active — before any job surcharge. */
export const BATTERY_DRAIN_BASE = 2;

/** Additional percent-per-measure drain while Active, on top of BATTERY_DRAIN_BASE, by job type. */
export const JOB_BATTERY_DRAIN_SURCHARGE: Record<JobType, number> = {
  ventExtraction: 1,
  acousticSurvey: 3,
  structuralInspection: 5,
  fluidMonitoring: 7,
};

/** Battery recharge, percent per measure, while a robot is Docked — flat, same for every robot. */
export const BATTERY_RECHARGE_RATE = 5;

/** Active robot at or below this battery level begins Departing (recall to dock). */
export const BATTERY_CRITICAL_THRESHOLD = 10;
/** Docked robot at or above this battery level begins Docking (redeploy-eligible). */
export const BATTERY_FULL_THRESHOLD = 100;

/** Fraction of a robot's melody events whose pitch (noteIndex only) re-rolls each time it lands on Docked. */
export const DOCKED_PITCH_DRIFT_RATIO = 0.25;

/** Roster-balancing cap: at most this many robots may hold the same job type at once. */
export const JOB_MAX_ROBOTS_PER_TYPE = 3;

/**
 * Battery-level thresholds (percent) at which a robot's window/viewport and
 * status-light SVG elements progressively dim (robotVisualHelpers.ts's
 * computeBatteryDimOpacity). A step function, most-severe tier wins — crossing
 * a lower threshold implies the higher ones too, dims don't stack additively.
 */
export const BATTERY_DIM_THRESHOLD_LOW = 50;      // <= this: 25% dim (opacity 0.75)
export const BATTERY_DIM_THRESHOLD_MID = 25;      // <  this: 50% dim (opacity 0.50)
export const BATTERY_DIM_THRESHOLD_CRITICAL = 12; // <= this: 90% dim (opacity 0.10)

/**
 * Below this battery level, an Active robot's idle wandering is confined to
 * the lower third of the world view (idleSystem.ts's pickDestination) — it
 * stays near its south-only exit/dock spot as it runs down, rather than
 * wandering the full map right up until it departs.
 */
export const BATTERY_LOWER_THIRD_THRESHOLD = 15;

/**
 * Companies (Roadmap Phase 10) — seeded groups of robots that let every editable Robot Options
 * field be broadcast across a group at once. See docs/specs/COMPANIES.md.
 *
 * MAX_COMPANIES is a CRUD ceiling only — CompanyCrudControls' Create button is disabled at this
 * count. It is a separate concept from spawn generation below and is deliberately higher than
 * INITIAL_COMPANIES_MAX, leaving room for a player to create more by hand after spawn.
 * localeStore.addCompany itself does not enforce this cap (mirrors how MAX_ROBOTS is never
 * store-enforced either — the roster is simply never asked to exceed it).
 */
export const MAX_COMPANIES = 6;

/** Seeded count of companies spawnInitialCompanies creates for a fresh locale. */
export const INITIAL_COMPANIES_MIN = 2;
export const INITIAL_COMPANIES_MAX = 3;

/** Seeded member count per company at spawn — drawn disjointly from the roster, so any robot
 *  not claimed by a company (a meaningful chunk of the 12-robot roster, by design) is Freelance. */
export const COMPANY_SIZE_MIN = 3;
export const COMPANY_SIZE_MAX = 4;