/**
 * ControlSchema data for Robot Options' 4 sections (Roadmap Phase 9), following
 * audioRigConfig.ts's structural pattern — typed block/param arrays, not one flat schema list.
 * Field-for-field from docs/reference/ROBOT_DATA_GRID.md, with the numeric-range/behavior
 * corrections confirmed via /interview-me and recorded in docs/specs/ROBOT_OPTIONS.md §7:
 * Density uses RHYTHMIC_DENSITY_MIN/MAX (0-100, not the grid's stale 1-16), Audio Setting
 * includes a 4th "Off" option, Signature Array has no 'noise' Type option, and Detune is ±50
 * cents (the grid's number — the removed per-layer editor's ±100 was the stale one).
 *
 * Robot Display's Name/Job/Battery/Docking rows reuse robotSelectionConfig.ts's
 * ROBOT_SELECTION_ROW_SCHEMAS/label maps directly (Phase 8) rather than duplicating them — see
 * RobotDisplaySection.tsx.
 */
import type {
  ButtonSchema,
  ControlSchema,
  DirectionalPanelSchema,
  RadioButtonSchema,
  SliderCenteredZeroSchema,
  SliderLinearSchema,
  SliderLogSchema,
  ToggleSchema,
} from '@/types/controls';
import type { RobotLfoTargetId } from '@/types/lfo';
import {
  RHYTHMIC_DENSITY_MIN,
  RHYTHMIC_DENSITY_MAX,
  RHYTHMIC_MOTIF_LENGTH_MIN,
  RHYTHMIC_MOTIF_LENGTH_MAX,
  NOTE_VARIANCE_MIN,
  NOTE_VARIANCE_MAX,
  OCTAVE_RANGE_MIN,
  OCTAVE_RANGE_MAX,
  PITCH_REPEAT_MIN,
  PITCH_REPEAT_MAX,
} from '@/constants';

// ========================================
// ROBOT DISPLAY (not collapsible — always-visible header content)
// ========================================

/** Confirmed during /interview-me: all 4 audioMode values, not the grid prose's stale 3 — a
 *  radio group that can turn Mute/Solo/Highlight on but never back off would be unusable. */
export const AUDIO_SETTING_SCHEMA: RadioButtonSchema = {
  id: 'robotOptions.audioSetting',
  type: 'radio',
  loreLabel: 'PROBE DIAGNOSTICS',
  humanLabel: 'Monitor Mode',
  options: [
    { value: 'none', label: 'Auto' },
    { value: 'mute', label: 'Mute' },
    { value: 'solo', label: 'Solo' },
    { value: 'highlight', label: 'Highlight' },
  ],
};

/**
 * Display-only 0-100% in 1% steps; the stored value is 0..1 (Robot.masterVolume). Same
 * display-vs-storage split as Sustain (PING_CONTOUR's SUSTAIN_SCHEMA) — the component consuming
 * this one must convert pct/100 on write and value*100 on read.
 */
export const VOLUME_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.volume',
  type: 'sliderLinear',
  loreLabel: 'TRANSDUCER PRESSURE INDEX',
  humanLabel: 'Volume',
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
  orientation: 'horizontal',
};

/** LFO-modulatable per src/types/lfo.ts's RobotLfoTargetId — editable, per /interview-me
 *  correcting the roadmap's earlier "read-only" framing. Rendered through a shared
 *  LfoTargetGroup (docs/specs/LFO_CONSOLIDATED_DISPLAY.md), not its own nested accordion —
 *  VOLUME_LFO_ACCORDION_SCHEMA is gone; AudioSettingSection builds the group's field label
 *  from VOLUME_SCHEMA.humanLabel instead. */
export const VOLUME_LFO_TARGET: RobotLfoTargetId = 'volume';

/**
 * Wraps VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA (below) beside the Volume LFO display — 'responsive'
 * so mobile/tablet stacks everything into one column (Audio Setting, Volume, LFO, in that order)
 * and desktop splits into 2 side-by-side columns. Unlabeled — pure layout, top-level inside
 * AudioSettingSection's own root (no accordion wrapper — removed docs/tasks/
 * NAV_LAYOUT_REWRITE.md Task 18).
 */
export const VOLUME_ROW_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.volumeRow',
  type: 'directionalPanel',
  orientation: 'responsive',
};

/**
 * Audio Setting + Volume, always stacked — the left column of VOLUME_ROW_PANEL_SCHEMA's desktop
 * row (and, on mobile/tablet, simply the first 2 items in that panel's single stacked column).
 * Fixed 'column' regardless of tier — unlike VOLUME_ROW_PANEL_SCHEMA, this one never becomes a row.
 */
export const VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.volumeSettingsColumn',
  type: 'directionalPanel',
  orientation: 'column',
};

// ========================================
// PING CONTROLS
// ========================================

/**
 * Density, Motif Length, Pitch Repeat, plus the dev-only Click Track toggle and Reset Melody
 * button — a new label, not inherited from the old flat "Ping Controls" accordion (that whole
 * accordion is split into 2 differently-labeled panels, not moved as one unit).
 */
export const PHRASING_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.phrasing',
  type: 'directionalPanel',
  loreLabel: 'RHYTHMIC PHRASING MATRIX',
  humanLabel: 'Phrasing',
  orientation: 'column',
};

// 'responsive', not fixed 'row' — Density/Motif Length/Pitch Repeat each get their own row on
// mobile/tablet, share one row on desktop. docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.4.
export const RHYTHM_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.rhythm',
  type: 'directionalPanel',
  loreLabel: 'RHYTHMIC PHRASING MATRIX',
  humanLabel: 'Rhythm',
  orientation: 'responsive',
};

/** Octave Min, Octave Max, Note Variance — the other half of the old Ping Controls accordion.
 *  'responsive', not fixed 'row' — same treatment as RHYTHM_PANEL_SCHEMA above. */
export const FREQUENCY_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.frequency',
  type: 'directionalPanel',
  loreLabel: 'PITCH FREQUENCY MATRIX',
  humanLabel: 'Pitches',
  orientation: 'responsive',
};

/**
 * Testing-only toggle (see PingControlsDrawer.tsx's clickTrackActive value field and
 * robotOptionsActions.ts's applyClickTrackActive) — overrides the robot's real melody with a
 * fixed 4-quarter-note downbeat pattern so tempo/BPM changes are easy to track by ear. Available
 * in both robot mode (RobotOptionsTab) and company/All broadcast mode (CompanyOptionsSection) —
 * broadcasting it puts every member's playback into click-track mode at once. Rendered first,
 * above Density, so it reads as a mode switch for the rest of the accordion rather than one
 * control among many. PingControlsDrawer.tsx only renders it behind `DEV_TUNING`, so it never
 * reaches a production build.
 *
 * `humanLabel` feeds the toggle's accessible name (resolveAccessibleName) but is no longer shown
 * as external label text — PingControlsDrawer.tsx now passes "Click Track" directly as the
 * Toggle's own facade content instead, which suppresses Toggle's external DualLabel entirely,
 * `loreLabel` included. `loreLabel: 'CALIBRATION PULSE'` is kept for continuity/documentation but
 * no longer renders anywhere.
 */
export const CLICK_TRACK_SCHEMA: ToggleSchema = {
  id: 'robotOptions.clickTrack',
  type: 'toggle',
  loreLabel: 'CALIBRATION PULSE',
  humanLabel: 'Click Track',
};

/**
 * A SliderLinear, not a Stepper — the grid originally called for a Stepper, but clicking through
 * a 0-100 range one increment at a time was too slow to be usable; a drag/keyboard slider covers
 * the same range in one gesture.
 */
export const DENSITY_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.density',
  type: 'sliderLinear',
  loreLabel: 'PING DENSITY',
  humanLabel: 'Density',
  min: RHYTHMIC_DENSITY_MIN,
  max: RHYTHMIC_DENSITY_MAX,
  unit: '%',
  orientation: 'horizontal',
};

export const MOTIF_LENGTH_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.motifLength',
  type: 'sliderLinear',
  loreLabel: 'PING LENGTH',
  humanLabel: 'Motif Length',
  min: RHYTHMIC_MOTIF_LENGTH_MIN,
  max: RHYTHMIC_MOTIF_LENGTH_MAX,
  step: 1,
  orientation: 'horizontal',
};

/**
 * Increasingly locks a tiled motif's repeated cells to the base cell's pitches (0-100, same
 * SliderLinear shape as Density — a plain percentage, no toggle of its own). Placed immediately
 * after Motif Length, before Octave Range (Architecture Decision §7.5 in
 * docs/tasks/PITCH_REPEAT.md) — adjacent to the field it's gated by
 * (`rhythmicMotifLength.active`), so the dependency reads naturally without a label explaining
 * it. See docs/specs/PITCH_REPEAT.md.
 */
export const PITCH_REPEAT_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.pitchRepeat',
  type: 'sliderLinear',
  loreLabel: 'PING REPETITION ALLOWANCE',
  humanLabel: 'Pitch Repeat',
  min: PITCH_REPEAT_MIN,
  max: PITCH_REPEAT_MAX,
  unit: '%',
  orientation: 'horizontal',
};

export const OCTAVE_RANGE_MIN_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.octaveRangeMin',
  type: 'sliderLinear',
  loreLabel: 'PING FREQUENCY RANGES (MIN)',
  humanLabel: 'Octave Range Min',
  min: OCTAVE_RANGE_MIN,
  max: OCTAVE_RANGE_MAX,
  step: 1,
  orientation: 'horizontal',
};

export const OCTAVE_RANGE_MAX_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.octaveRangeMax',
  type: 'sliderLinear',
  loreLabel: 'PING FREQUENCY RANGES (MAX)',
  humanLabel: 'Octave Range Max',
  min: OCTAVE_RANGE_MIN,
  max: OCTAVE_RANGE_MAX,
  step: 1,
  orientation: 'horizontal',
};

export const NOTE_VARIANCE_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.noteVariance',
  type: 'sliderLinear',
  loreLabel: 'PING FREQUENCY VARIANCE',
  humanLabel: 'Note Variance',
  min: NOTE_VARIANCE_MIN,
  max: NOTE_VARIANCE_MAX,
  step: 1,
  orientation: 'horizontal',
};

/** Plain one-click Button — no confirmation dialog, confirmed during /interview-me for
 *  consistency with every other Button in the app (see docs/specs/ROBOT_OPTIONS.md §7). */
export const RESET_MELODY_SCHEMA: ButtonSchema = {
  id: 'robotOptions.resetMelody',
  type: 'button',
  loreLabel: 'CALIBRATE PING',
  humanLabel: 'Reset Melody',
};

// ========================================
// PING CONTOUR — the robot's one shared ADSR envelope
// ========================================

/**
 * DirectionalPanel wiring (docs/tasks/DIRECTIONAL_PANEL_WIRING.md) — supersedes the old flat
 * "Ping Contour" accordion-typed schema (removed, Task 9; its own successor accordion, Envelope,
 * was itself removed docs/tasks/NAV_LAYOUT_REWRITE.md Task 16). Fixed 'column' (was 'row') as of
 * docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.4 — wraps 2 responsive sub-rows
 * (Attack+Decay, Sustain+Release — inline in PingContourDrawer.tsx, matching Compressor's own
 * topRow/bottomRow precedent in audioRigConfig.ts) instead of holding all 4 sliders directly.
 */
export const PING_CONTOUR_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.pingContour',
  type: 'directionalPanel',
  loreLabel: 'PING CONTOUR',
  humanLabel: 'Contour',
  orientation: 'column',
};

export const ATTACK_SCHEMA: SliderLogSchema = {
  id: 'robotOptions.attack',
  type: 'sliderLog',
  loreLabel: 'COMPRESSION RATE',
  humanLabel: 'Attack',
  min: 0,
  max: 10,
  unit: 's',
  orientation: 'horizontal',
};

export const DECAY_SCHEMA: SliderLogSchema = {
  id: 'robotOptions.decay',
  type: 'sliderLog',
  loreLabel: 'STABILIZATION DELAY',
  humanLabel: 'Decay',
  min: 0,
  max: 10,
  unit: 's',
  orientation: 'horizontal',
};

/**
 * Display-only 0-100%; the stored value is 0..1 (Robot.ts's ADSREnvelope.sustain). Unlike every
 * other schema in this file, the component consuming this one must convert pct/100 on write and
 * value*100 on read — see PingContourDrawer.tsx.
 */
export const SUSTAIN_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.sustain',
  type: 'sliderLinear',
  loreLabel: 'PROPAGATION AMPLITUDE',
  humanLabel: 'Sustain',
  min: 0,
  max: 100,
  unit: '%',
  orientation: 'horizontal',
};

export const RELEASE_SCHEMA: SliderLogSchema = {
  id: 'robotOptions.release',
  type: 'sliderLog',
  loreLabel: 'RAREFACTION RATE',
  humanLabel: 'Release',
  min: 0,
  max: 10,
  unit: 's',
  orientation: 'horizontal',
};

// ========================================
// SIGNATURE ARRAY — 3 fixed layers (Baseline/Coaxial/Harmonic)
// ========================================

export type SignatureArrayLayerKey = 'layer0' | 'layer1' | 'layer2';

export interface SignatureArrayParamSchema {
  field: 'type' | 'gain' | 'detune' | 'phase' | 'pulseWidth';
  schema: ControlSchema;
  /** Absent only for `type`, which isn't LFO-modulatable. */
  lfoTarget?: RobotLfoTargetId;
}

export interface SignatureArrayLayerBlock {
  key: SignatureArrayLayerKey;
  humanLabel: 'Baseline' | 'Coaxial' | 'Harmonic';
  loreLabel: string;
  /** DirectionalPanel wiring (docs/tasks/DIRECTIONAL_PANEL_WIRING.md) — this layer's own panel.
   *  Reuses this block's own humanLabel/loreLabel verbatim (Baseline/Coaxial/Harmonic already had
   *  exactly the right per-layer label; no new copy). */
  panel: DirectionalPanelSchema;
  params: SignatureArrayParamSchema[];
}

/** The 5 real WaveformType values only — 'noise' is dropped entirely (Roadmap Phase 9, see
 *  docs/specs/ROBOT_OPTIONS.md §7). Value/label pairs match ROBOT_DATA_GRID.md's Layer Type row. */
const LAYER_TYPE_OPTIONS = [
  { value: 'sine', label: 'SWEEP' },
  { value: 'triangle', label: 'GRADIENT' },
  { value: 'sawtooth', label: 'KINETIC' },
  { value: 'square', label: 'BINARY' },
  { value: 'pulse', label: 'BURST' },
];

function makeLayerBlock(
  key: SignatureArrayLayerKey,
  humanLabel: 'Baseline' | 'Coaxial' | 'Harmonic',
  loreLabel: string,
): SignatureArrayLayerBlock {
  const gainTarget = `${key}.gain` as RobotLfoTargetId;
  const detuneTarget = `${key}.detune` as RobotLfoTargetId;
  const phaseTarget = `${key}.phase` as RobotLfoTargetId;
  const pulseWidthTarget = `${key}.pulseWidth` as RobotLfoTargetId;

  return {
    key,
    humanLabel,
    loreLabel,
    panel: { id: `robotOptions.${key}.panel`, type: 'directionalPanel', loreLabel, humanLabel, orientation: 'row' },
    params: [
      {
        field: 'type',
        schema: {
          id: `robotOptions.${key}.type`, type: 'radio',
          loreLabel: `${loreLabel} GEOMETRY`, humanLabel: `${humanLabel} Type`,
          options: LAYER_TYPE_OPTIONS,
        } satisfies RadioButtonSchema,
      },
      {
        field: 'gain',
        schema: {
          id: `robotOptions.${key}.gain`, type: 'sliderLinear',
          loreLabel: `${loreLabel} SATURATION`, humanLabel: `${humanLabel} Gain`,
          min: 0, max: 2, step: 0.01, orientation: 'vertical', verticalHeight: 256,
        } satisfies SliderLinearSchema,
        lfoTarget: gainTarget,
      },
      {
        field: 'detune',
        schema: {
          id: `robotOptions.${key}.detune`, type: 'sliderCenteredZero',
          loreLabel: `${loreLabel} DRIFT`, humanLabel: `${humanLabel} Detune`,
          min: -50, max: 50, unit: 'cents', orientation: 'vertical', verticalHeight: 256,
        } satisfies SliderCenteredZeroSchema,
        lfoTarget: detuneTarget,
      },
      {
        field: 'phase',
        schema: {
          id: `robotOptions.${key}.phase`, type: 'sliderLinear',
          loreLabel: `${loreLabel} ALIGNMENT`, humanLabel: `${humanLabel} Phase`,
          min: 0, max: 360, orientation: 'vertical', verticalHeight: 256,
        } satisfies SliderLinearSchema,
        lfoTarget: phaseTarget,
      },
      {
        field: 'pulseWidth',
        schema: {
          id: `robotOptions.${key}.pulseWidth`, type: 'sliderLinear',
          loreLabel: `${loreLabel} PULSE WIDTH`, humanLabel: `${humanLabel} Interval`,
          min: 0, max: 1, step: 0.01, orientation: 'vertical', verticalHeight: 256,
        } satisfies SliderLinearSchema,
        lfoTarget: pulseWidthTarget,
      },
    ],
  };
}

export const SIGNATURE_ARRAY_CONFIG: SignatureArrayLayerBlock[] = [
  makeLayerBlock('layer0', 'Baseline', 'BASELINE'),
  makeLayerBlock('layer1', 'Coaxial', 'COAXIAL'),
  makeLayerBlock('layer2', 'Harmonic', 'HARMONIC'),
];
