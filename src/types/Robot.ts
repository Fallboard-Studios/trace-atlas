import type { Vec2 } from './Vec2';
import type { VisualAudioMap, OscillatorLayer } from './layeredAudio';
import type { RobotLfoTargetId, LfoSettings, LfoLink } from './lfo';

/**
 * Note duration values for Tone.js scheduling
 * Standard musical note lengths: 32nd, 16th, 8th, quarter, half
 */
export type NoteDuration = '32n' | '16n' | '8n' | '4n' | '2n' | '1n' | '2m' | '4m';

/**
 * Robot state machine states
 */
export const RobotState = {
  Idle: 'idle',
  Moving: 'moving',
  Selected: 'selected',
  Interacting: 'interacting',
  Leaving: 'leaving',
} as const;
export type RobotState = (typeof RobotState)[keyof typeof RobotState];

/**
 * Docking state machine — orthogonal to RobotState. Purely battery-driven
 * (see src/systems/robotSystems.ts): Docked/Active are the two "settled"
 * states; Docking/Departing are held for up to one measure as a transition
 * buffer before landing on Active/Docked respectively.
 */
export const DockingState = {
  Docked: 'docked',
  Docking: 'docking',
  Departing: 'departing',
  Active: 'active',
} as const;
export type DockingState = (typeof DockingState)[keyof typeof DockingState];

/**
 * The four job profiles a robot can be assigned once it lands on Active.
 * Pure data/scoring — see robotSystems.ts's scoreJobAffinities/assignJob.
 */
export const JobType = {
  VentExtraction: 'ventExtraction',
  AcousticSurvey: 'acousticSurvey',
  StructuralInspection: 'structuralInspection',
  FluidMonitoring: 'fluidMonitoring',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

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
  /** Optional compact visual/audio mapping produced at spawn time and stored on the robot */
  visualAudioMap?: VisualAudioMap;
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
   * Deterministic per-robot identity color (one of ACCENT_COLORS' 13 hues, seeded at spawn) — UI
   * chrome only (RobotSelectionCard/RobotDisplaySection), never the SVG body's own ADSR/waveform-
   * derived HSL fill (docs/ROBOT_DESIGN.md, unaffected). See
   * docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.4.
   */
  identityColor: string;
  state: RobotState;
  position: Vec2;
  destination: Vec2 | null;
  direction: 'left' | 'right';     // Facing direction (horizontal orientation)
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
   * Measure at which a Docking/Departing hold ends and the robot lands on
   * Active/Docked. Undefined when docking is Docked or Active (no hold in
   * progress). Set by robotSystems.ts on threshold crossing.
   */
  dockingHoldUntilMeasure?: number;
  /** 0-100. Drains while Active, recharges while Docked. Seeded at spawn. */
  batteryLevel: number;
  /** Assigned automatically when a robot lands on Active. Not cleared when a robot lands on Docked —
   *  it persists, stale, until the robot next lands on Active and is assigned a fresh one. */
  job?: { type: JobType; assignedAtMeasure: number };
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
   * Seeded LFO settings for all 9 RobotLfoTargetId modulation targets,
   * generated once at spawn time (src/systems/spawnSystem.ts) the same way
   * as the rest of audioAttributes, mirroring audioStore.ts's `globalLfo`
   * shape. Each target is independently seeded on or off (Roadmap Phase 9) —
   * `rate: 0` means the target isn't currently connected (see
   * src/engine/lfoEngine.ts), not that it never will be.
   */
  lfoSettings?: Record<RobotLfoTargetId, LfoSettings>;
  /**
   * Seeded lane links for all 6 RobotLfoTargetId modulation targets (docs/specs/LFO_BANK.md) —
   * replaces lfoSettings' per-target shape/rate with a shared-lane link, generated once at spawn
   * time the same way (src/systems/spawnSystem.ts's generateRobotLfoLinks). `lane: null` means the
   * target isn't linked into the bank at all. lfoSettings stays alongside this during the Task
   * 7-15 strangler period (docs/tasks/LFO_BANK.md) and is deleted in Task 17.
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
