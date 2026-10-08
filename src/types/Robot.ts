import type { Vec2 } from './Vec2';
import type { OscillatorLayer } from './layeredAudio';
import type { RobotLfoTargetId, LfoLink } from './lfo';

/**
 * Note duration values for Tone.js scheduling
 * Standard musical note lengths: 32nd, 16th, 8th, quarter, half
 */
export type NoteDuration = '32n' | '16n' | '8n' | '4n' | '2n' | '1n' | '2m' | '4m';

/**
 * Docking state machine — orthogonal to `activity` (the work loop's). Purely battery-driven
 * (see src/systems/robotSystems.ts): Docked/Active are the two "settled"
 * states; Undocking/Recalled are held for up to one measure as a transition
 * buffer before landing on Active/Docked respectively.
 */
export const DockingState = {
  Docked: 'docked',
  Undocking: 'undocking',
  Active: 'active',
  Recalled: 'recalled',
} as const;
export type DockingState = (typeof DockingState)[keyof typeof DockingState];

/**
 * The six jobs a robot can hold (Phase 43). Live visual state, never replayed or persisted. The
 * work loop picks them from the sites that host them (siteChoice.ts's chooseNextSite).
 */
export const JobType = {
  VentExtraction: 'ventExtraction',
  AcousticSurvey: 'acousticSurvey',
  StructuralInspection: 'structuralInspection',
  FluidMonitoring: 'fluidMonitoring',
  Salvage: 'salvage',
  Maintenance: 'maintenance',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

/**
 * The work loop's live visual state (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.2). Never replayed;
 * nothing audio-side reads it. Stored on `Robot.activity`.
 */
export type RobotActivity = 'charging' | 'exiting' | 'transit' | 'working' | 'waiting' | 'returning' | 'entering';

/**
 * Oscillator waveform shapes for timbral variety
 */
export type WaveformType = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pulse';

/**
 * ADSR envelope parameters for synth
 */
export interface ADSREnvelope {
  attack: number;      // seconds
  decay: number;       // seconds
  sustain: number;     // 0-1
  release: number;     // seconds
}

/**
 * Audio attributes determine both sound synthesis and visual appearance
 * Visual appearance is derived from these at render time, not stored separately
 */
export interface AudioAttributes {
  adsr: ADSREnvelope;
  /** Seeded octave register [min, max] — populated at spawn time via generateAudioAttributes */
  octaveRange?: [number, number];
  filterFreq: number;  // Hz (cutoff frequency, 0 = no filter)
  /** Canonical ordered list of oscillator layers (index 0 is base) */
  layers?: OscillatorLayer[];
  waveform: WaveformType; // Oscillator shape applied once at voice reservation time
  /** Phase in degrees (0..360) applied to oscillator at reservation time */
  phase?: number; // degrees (0..360)
  /** Detune in cents (e.g. -100..100) applied to synth at reservation time */
  detune?: number; // cents (e.g. -100..100)
  /** Deprecated: pulseWidth moved to per-layer `layers[].pulseWidth`. */
}

/**
 * Single melody event within a robot's one-measure, 16-sixteenth-note loop
 */
export interface MelodyEvent {
  id: string;                           // Unique identifier (UUID)
  startStep: number;                    // 1-16 (16th-note grid position)
  length: NoteDuration;                 // Note duration
  noteIndex: number;                    // 0-7 (index into available harmony palette)
  octave: number;                       // Concrete octave assigned at spawn time
  /**
   * Pitch Repeat (docs/specs/PITCH_REPEAT.md): true only on a locked non-base-cell repeat whose
   * noteIndex was copied verbatim from the base cell, bypassing Note Variance. Never set on
   * base-cell (repeat 0) events or on any event when Pitch Repeat locking didn't apply — those
   * stay `undefined`, not `false`.
   */
  pitchLocked?: boolean;
}

/**
 * Main Robot entity
 * All fields are serializable (JSON-compatible) for Zustand state management
 * Visual appearance is derived from audioAttributes at render time
 */
export interface Robot {
  id: string;
  /** Seed for deterministic melody generation (Roadmap Phase 31) — drawn once at spawn from the
   *  noise map, own dataId, exactly like `id`. Never user-edited, never inherited on the
   *  spawn-time copy path (always fresh, same treatment as `id`/`name`/`melody`). Feeds
   *  melodyGenerator.ts's buildSeededComposition alongside a robot's current rhythmic
   *  attributes, both at spawn and on every later Robot Options edit. */
  compositionSeed: number;
  /** Human-readable display name (generated at spawn) */
  name?: string;
  /**
   * Deterministic per-robot identity color (one of the 18 `ROBOT_IDENTITY_COLOR_NAMES` hues,
   * seeded at spawn) — UI chrome (RobotSelectionCard/RobotDisplaySection) **and** the colour of
   * the robot's whole gem-polygon body: the Top polygon and orbiters take it directly, the Mids a
   * darker tone of it lit by their layer's gain (gem/gemPalette.ts). Identity and seed, not audio:
   * the body's geometry is `getRobotGem(gemSeed)`; audio and composition settings reach it only
   * through the dials in docs/ROBOT_DESIGN.md (the Visual Mapping guardrail). See
   * docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.4, docs/specs/GEM_POLYGON_ROBOTS.md §1.4 and
   * docs/specs/ORBITING_POLYGONS.md (the orbiter dials).
   */
  identityColor: string;
  /**
   * Seed for the robot's gem-polygon body (docs/specs/GEM_POLYGON_ROBOTS.md §1.1). The geometry
   * is derived — `getRobotGem(gemSeed)` in components/robot/gem/polygon.ts, cached per seed — and
   * never stored here. Drawn once at spawn ('robot.gem.seed'), never user-edited, never inherited
   * on the copy path, never diffed into a session — regenerated identically from the world seed.
   */
  gemSeed: number;
  /** The gem canvas's top-left in the scene. Written by the work loop on every leg's arrival. */
  position: Vec2;
  melody: MelodyEvent[];
  audioAttributes: AudioAttributes;
  /** Octave range [min, max] this robot plays within. Melody events store concrete octaves within this range. */
  octaveRange: [number, number];
  layer?: 'background' | 'foreground'; // SVG rendering layer (default: foreground)
  createdAt: number;            // timestamp used for removal ordering
  /** Transport measure at which this robot last interacted (for cooldown tracking). */
  lastInteractionMeasure?: number;
  /**
   * Overall robot loudness (0–1), edited live via Robot Options' Volume slider. Roadmap Phase 9:
   * drives the robot's own live per-robot bus gain (AudioEngine.reserveVoice's masterVolume
   * parameter / updateRobotMasterVolume) — a continuously-live AudioParam, not baked into any
   * note's own trigger velocity, so a live edit affects an already-sounding note's tail too, not
   * just the next note this robot plays. Per-note velocity has its own small random variance,
   * independent of this field (see AudioEngine.ts's computeNoteVelocitySeeded).
   */
  masterVolume: number;
  /** Docking state — see DockingState. Every robot has one from creation. */
  docking: DockingState;
  /**
   * Measure at which an Undocking/Recalled hold ends and the robot lands on
   * Active/Docked. Undefined when docking is Docked or Active (no hold in
   * progress). Set by robotSystems.ts on threshold crossing.
   */
  dockingHoldUntilMeasure?: number;
  /** 0-100. Drains while Active, recharges while Docked. Seeded at spawn. */
  batteryLevel: number;
  /** Taken with a site by the work loop (chooseNextSite) and kept across sites until none ready
   *  hosts it. Undefined until the first site. Not cleared on the way home — stale while charging,
   *  and heldJobs ignores it there. */
  job?: JobType;
  /** The work loop's visual state (spec §1.2). Set at spawn from `docking` (Docked → 'charging',
   *  Active → 'exiting'), the work loop's from then on. Live only — never replayed, nothing
   *  audio-side reads it. */
  activity: RobotActivity;
  /** The station the robot is in, heading to, or last left (spec §1.6). Assigned at locale load. */
  stationId?: string;
  /** The actor id of the work site the robot holds — heading to or working at (spec §1.7). */
  siteId?: string;
  /**
   * Solo/mute/highlight mode set by the Robot Audio editor.
   * Runtime semantics (enforced by AudioEngine):
   * - `none` (Off): no special routing.
   * - `mute` (Mute): scheduled notes for this robot are suppressed.
   * - `solo` (Solo): other robots in the same locale are suppressed.
   * - `highlight` (Highlight): other robots are attenuated by ~50% at mix/scheduling time.
   * Default: 'none'
   */
  audioMode?: 'none' | 'solo' | 'mute' | 'highlight';
  /**
   * Number of melody events (4–12). Maps to `onsetCount` in generateMelodyForRobot().
   * Default: derived from initial melody length at spawn.
   */
  rhythmicDensity?: number;
  /**
   * Motif length in 16th-note subdivisions, with an on/off toggle. `value` is 0-8.
   * `active` is a derived, enforced consequence of `value > 0` — never independently
   * settable. When `active` is false (`value === 0`), onsets scatter freely across the
   * measure and `value` is inert; when true, a `value`-length cell tiles across the
   * measure and truncates at measure end. Default: { active: true, value: 8 }.
   */
  rhythmicMotifLength?: { active: boolean; value: number };
  /**
   * Weighted note-selection toggle, with a 0-8 slice-size `value`. `active` is a
   * derived, enforced consequence of `value > 0` — never independently settable. When
   * `active` is false (`value === 0`), notes are picked unweighted from all 8 indices
   * and `value` is inert; when true, selection is a weighted slice of `value` notes
   * from the pitch array. Default: { active: false, value: 0 }.
   */
  noteVariance?: { active: boolean; value: number };
  /**
   * 0-100. Increasingly locks a tiled motif's repeated cells to the base cell's pitches as it
   * rises (100 = full verbatim repetition). Inert whenever `rhythmicMotifLength.active` is false
   * — no cell concept exists to lock pitches within when tiling is off. Same plain-number shape
   * as `rhythmicDensity` (no `{active, value}` toggle of its own). Default: 0 (today's behavior,
   * unlocked). See docs/specs/PITCH_REPEAT.md.
   */
  pitchRepeat?: number;
  /**
   * Seeded lane links for all 6 RobotLfoTargetId modulation targets (docs/specs/LFO_BANK.md),
   * generated once at spawn time (src/systems/spawnSystem.ts's generateRobotLfoLinks). `lane: null`
   * means the target isn't linked into the bank at all.
   */
  lfoLinks?: Record<RobotLfoTargetId, LfoLink>;
  /**
   * The Company (Roadmap Phase 10) this robot belongs to, if any. Undefined means Freelance —
   * the implicit default, not a distinct flag. Seeded at spawn (spawnSystem.ts's
   * spawnInitialCompanies) and reassignable afterward via the company Select control in
   * RobotSelectionCard/RobotDisplaySection (localeStore.assignRobotToCompany).
   */
  companyId?: string;
  /**
   * Testing-only override, toggled from the top of Ping Controls: when true, AudioEngine plays
   * a fixed 4-quarter-note downbeat pattern (see src/engine/clickTrack.ts) instead of this
   * robot's real melody, to make tempo/BPM changes easy to track by ear. `melody` itself is left
   * untouched — turning this back off restores exact playback of the real, generated melody.
   * Default: false/undefined.
   */
  clickTrackActive?: boolean;
}
