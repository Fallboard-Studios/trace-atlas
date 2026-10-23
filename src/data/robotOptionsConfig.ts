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
import { ROBOT_SENDS, type RobotSendField } from './robotSends';
import type {
  ControlSchema,
  DirectionalPanelSchema,
  RadioButtonSchema,
  SliderCenteredZeroSchema,
  SliderLinearSchema,
  SliderLogSchema,
  ToggleSchema,
} from '@/types/controls';
import type { RobotLfoTargetId } from '@/types/lfo';
import { labels, options, type ContentKey } from '@/content';
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
  PERFORMANCE_MIN,
  PERFORMANCE_MAX,
  PAN_DISPLAY_SCALE,
  PAN_MIN,
  PAN_MAX,
  SEND_MIN,
  SEND_MAX,
  SEND_DISPLAY_SCALE,
  SEND_STEP_PERCENT,
  ENVELOPE_TIME_MAX_SECONDS,
  PORTAMENTO_MIN,
  PORTAMENTO_MAX,
  ROBOT_BUS_FILTER_FREQ_RANGE,
  ROBOT_BUS_FILTER_Q_RANGE,
} from '@/constants';

// ========================================
// ROBOT DISPLAY (not collapsible — always-visible header content)
// ========================================

/** Confirmed during /interview-me: all 4 audioMode values, not the grid prose's stale 3 — a
 *  radio group that can turn Mute/Solo/Highlight on but never back off would be unusable. */
export const AUDIO_SETTING_SCHEMA: RadioButtonSchema = {
  id: 'robotOptions.audioSetting',
  type: 'radio',
  ...labels('probe.monitorMode'),
  options: options('probe.monitorMode'),
};

/**
 * Display-only 0-100% in 1% steps; the stored value is 0..1 (Robot.masterVolume). Same
 * display-vs-storage split as Sustain (PING_CONTOUR's SUSTAIN_SCHEMA) — the component consuming
 * this one must convert pct/100 on write and value*100 on read.
 */
export const VOLUME_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.volume',
  type: 'sliderLinear',
  ...labels('probe.volume'),
  min: 0,
  max: 100,
  step: 1,
  orientation: 'horizontal',
};

/**
 * Wraps VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA (below) — fixed 'column' at every tier (Audio
 * Setting, then Volume). The Volume LFO display that used to sit below the column is gone (the
 * `volume` LFO target was removed — docs/specs/LFO_LOAD_FIX.md assumption 9); the two-panel
 * nesting is kept so the section renders identically in its slot. Previously 'responsive' (desktop split into 2 side-by-side columns,
 * Audio Setting's own Auto/Mute/Solo/Highlight radio squeezed into the narrower half) — Crawford's
 * own correction, to bring this one layout in line with the others. Unlabeled — pure layout,
 * top-level inside AudioSettingSection's own root (no accordion wrapper — removed docs/tasks/
 * NAV_LAYOUT_REWRITE.md Task 18).
 */
export const VOLUME_ROW_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.volumeRow',
  type: 'directionalPanel',
  orientation: 'column',
};

/**
 * Audio Setting + Volume, always stacked — nested inside VOLUME_ROW_PANEL_SCHEMA's own (now also
 * always-column) stack, ahead of the Lfo display. Fixed 'column' regardless of tier — kept as its
 * own schema/panel (rather than merging into VOLUME_ROW_PANEL_SCHEMA directly) since Audio Setting
 * + Volume is still a meaningful sub-grouping on its own, independent of the outer panel's own
 * orientation.
 */
export const VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.volumeSettingsColumn',
  type: 'directionalPanel',
  orientation: 'column',
};

/**
 * Display-only -100..100 in steps of 1, no unit and no L/R letters (docs/specs/ROBOT_PAN.md assumption
 * 1); the stored value is -1..1 (Robot.pan). Same display-vs-storage split as Volume — the bounds
 * come from the stored range times PAN_DISPLAY_SCALE so the two cannot drift. The component
 * consuming this one renders it readOnly while Auto is on.
 */
export const PAN_SCHEMA: SliderCenteredZeroSchema = {
  id: 'robotOptions.pan',
  type: 'sliderCenteredZero',
  ...labels('probe.pan'),
  min: PAN_MIN * PAN_DISPLAY_SCALE,
  max: PAN_MAX * PAN_DISPLAY_SCALE,
  step: 1,
  orientation: 'horizontal',
};

/** Pan's Auto toggle (Robot.panAuto): on follows the robot across the field, off holds `pan`. */
export const PAN_AUTO_SCHEMA: ToggleSchema = {
  id: 'robotOptions.panAuto',
  type: 'toggle',
  ...labels('probe.pan.auto'),
};

/**
 * The five send sliders (docs/specs/ROBOT_SEND_TABLE.md §1.4), one per ROBOT_SENDS row and keyed by its field, so a send
 * is named once (in the table) and a screen reads its row's schema by field. Display-only 0-100 % in 1 % steps; the
 * stored value is 0..1 (Robot.reverbSend and the four beside it). Same display-vs-storage split as Volume - the bounds
 * come from the stored range times SEND_DISPLAY_SCALE so the two cannot drift (docs/specs/ROBOT_SENDS.md §1.6). The
 * component consuming these converts pct/100 on write and value*100 on read. Ids and words are unchanged from the five
 * named schemas this replaces; the words come from each row's literal content key (spec assumption 1).
 */
export const ROBOT_SEND_SCHEMAS: Readonly<Record<RobotSendField, SliderLinearSchema>> = Object.fromEntries(
  ROBOT_SENDS.map((spec) => [
    spec.field,
    {
      id: `robotOptions.${spec.field}`,
      type: 'sliderLinear',
      ...labels(spec.contentKey),
      min: SEND_MIN * SEND_DISPLAY_SCALE,
      max: SEND_MAX * SEND_DISPLAY_SCALE,
      step: SEND_STEP_PERCENT,
      orientation: 'horizontal',
    } satisfies SliderLinearSchema,
  ]),
) as Record<RobotSendField, SliderLinearSchema>;

/**
 * Robot Performance (docs/specs/ROBOT_PERFORMANCE.md §1.6): how much this robot's note velocities swing.
 * Stored and displayed alike, 0-100 (Robot.dynamics, no conversion at the component boundary); the bounds
 * come from the same constants the store clamps with. The sixth row of the Levels section, after Delay.
 */
export const DYNAMICS_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.dynamics',
  type: 'sliderLinear',
  ...labels('probe.levels.dynamics'),
  min: PERFORMANCE_MIN,
  max: PERFORMANCE_MAX,
  step: 1,
  orientation: 'horizontal',
};

/** The Pan slider and its Auto toggle side by side, unlabeled — pure layout, the third row of
 *  VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA. */
export const PAN_ROW_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.panRow',
  type: 'directionalPanel',
  orientation: 'row',
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
  ...labels('probe.composition.phrasing', { surface: 'heading' }),
  orientation: 'column',
};

// 'responsive', not fixed 'row' — Density/Motif Length/Pitch Repeat each get their own row on
// mobile/tablet, share one row on desktop. docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.4.
export const RHYTHM_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.rhythm',
  type: 'directionalPanel',
  ...labels('probe.composition.rhythm', { surface: 'heading' }),
  orientation: 'responsive',
};

/** Rests and Accents (docs/specs/ROBOT_PERFORMANCE.md §1.6) — a row inside PHRASING_PANEL_SCHEMA, after
 *  the Rhythm row. 'responsive' like the Rhythm and Pitches panels: one row each on mobile, side by side on desktop. */
export const ARTICULATION_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.articulation',
  type: 'directionalPanel',
  ...labels('probe.composition.articulation', { surface: 'heading' }),
  orientation: 'responsive',
};

/** Octave Min, Octave Max, Note Variance — the other half of the old Ping Controls accordion.
 *  'responsive', not fixed 'row' — same treatment as RHYTHM_PANEL_SCHEMA above. */
export const FREQUENCY_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.frequency',
  type: 'directionalPanel',
  ...labels('probe.composition.pitches', { surface: 'heading' }),
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
 * lore caption included. Its CALIBRATION PULSE lore (now in content) is kept for continuity/documentation but
 * no longer renders anywhere.
 */
export const CLICK_TRACK_SCHEMA: ToggleSchema = {
  id: 'robotOptions.clickTrack',
  type: 'toggle',
  ...labels('probe.composition.clickTrack'),
};

/**
 * A SliderLinear, not a Stepper — the grid originally called for a Stepper, but clicking through
 * a 0-100 range one increment at a time was too slow to be usable; a drag/keyboard slider covers
 * the same range in one gesture.
 */
export const DENSITY_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.density',
  type: 'sliderLinear',
  ...labels('probe.composition.noteDensity'),
  min: RHYTHMIC_DENSITY_MIN,
  max: RHYTHMIC_DENSITY_MAX,
  orientation: 'horizontal',
};

export const MOTIF_LENGTH_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.motifLength',
  type: 'sliderLinear',
  ...labels('probe.composition.phraseLength'),
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
  ...labels('probe.composition.pitchRepeat'),
  min: PITCH_REPEAT_MIN,
  max: PITCH_REPEAT_MAX,
  orientation: 'horizontal',
};

/**
 * Chance per event of a rest, and how deep it cuts (Robot.rests, 0-100). Baked into the melody by the
 * post-pass, so it regenerates like Density does; it never moves a note (docs/specs/ROBOT_PERFORMANCE.md §1.2).
 */
export const RESTS_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.rests',
  type: 'sliderLinear',
  ...labels('probe.composition.rests'),
  min: PERFORMANCE_MIN,
  max: PERFORMANCE_MAX,
  step: 1,
  orientation: 'horizontal',
};

/** Chance per event of an articulation mark, and how many kinds are in play (Robot.accents, 0-100). Rests' twin. */
export const ACCENTS_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.accents',
  type: 'sliderLinear',
  ...labels('probe.composition.accents'),
  min: PERFORMANCE_MIN,
  max: PERFORMANCE_MAX,
  step: 1,
  orientation: 'horizontal',
};

export const OCTAVE_RANGE_MIN_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.octaveRangeMin',
  type: 'sliderLinear',
  ...labels('probe.composition.lowestOctave'),
  min: OCTAVE_RANGE_MIN,
  max: OCTAVE_RANGE_MAX,
  step: 1,
  orientation: 'horizontal',
};

export const OCTAVE_RANGE_MAX_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.octaveRangeMax',
  type: 'sliderLinear',
  ...labels('probe.composition.highestOctave'),
  min: OCTAVE_RANGE_MIN,
  max: OCTAVE_RANGE_MAX,
  step: 1,
  orientation: 'horizontal',
};

export const NOTE_VARIANCE_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.noteVariance',
  type: 'sliderLinear',
  ...labels('probe.composition.noteVariance'),
  min: NOTE_VARIANCE_MIN,
  max: NOTE_VARIANCE_MAX,
  step: 1,
  orientation: 'horizontal',
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
  ...labels('probe.envelope.contour'),
  orientation: 'column',
};

export const ATTACK_SCHEMA: SliderLogSchema = {
  id: 'robotOptions.attack',
  type: 'sliderLog',
  ...labels('probe.envelope.attack'),
  min: 0,
  max: ENVELOPE_TIME_MAX_SECONDS,
  orientation: 'horizontal',
};

export const DECAY_SCHEMA: SliderLogSchema = {
  id: 'robotOptions.decay',
  type: 'sliderLog',
  ...labels('probe.envelope.decay'),
  min: 0,
  max: ENVELOPE_TIME_MAX_SECONDS,
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
  ...labels('probe.envelope.sustain'),
  min: 0,
  max: 100,
  orientation: 'horizontal',
};

export const RELEASE_SCHEMA: SliderLogSchema = {
  id: 'robotOptions.release',
  type: 'sliderLog',
  ...labels('probe.envelope.release'),
  min: 0,
  max: ENVELOPE_TIME_MAX_SECONDS,
  orientation: 'horizontal',
};

// ========================================
// ROBOT ARTICULATION — portamento, envelope curves, bus filter (docs/specs/ROBOT_ARTICULATION.md §1.6)
// ========================================

/** Seconds of glide between notes; 0 (the left end) is no glide, today's sound. The stored value is the
 *  displayed one — no conversion at the component boundary. */
export const PORTAMENTO_SCHEMA: SliderLogSchema = {
  id: 'robotOptions.portamento',
  type: 'sliderLog',
  ...labels('probe.envelope.portamento'),
  min: PORTAMENTO_MIN,
  max: PORTAMENTO_MAX,
  orientation: 'horizontal',
};

/** The envelope's rise curve (ADSREnvelope.attackCurve). Radio values are the EnvelopeCurveName strings. */
export const ATTACK_CURVE_SCHEMA: RadioButtonSchema = {
  id: 'robotOptions.attackCurve',
  type: 'radio',
  ...labels('probe.envelope.attackShape'),
  options: options('probe.envelope.attackShape'),
};

/** The envelope's fade curve (ADSREnvelope.releaseCurve). */
export const RELEASE_CURVE_SCHEMA: RadioButtonSchema = {
  id: 'robotOptions.releaseCurve',
  type: 'radio',
  ...labels('probe.envelope.releaseShape'),
  options: options('probe.envelope.releaseShape'),
};

/** Attack Shape beside Release Shape, unlabeled — pure layout, the Envelope drawer's fourth row. */
export const CURVE_ROW_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.curveRow',
  type: 'directionalPanel',
  orientation: 'responsive',
};

/** The Source filter panel: Cutoff, its LFO link, then Resonance beside Type. */
export const BUS_FILTER_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.busFilter',
  type: 'directionalPanel',
  ...labels('probe.source.filter'),
  orientation: 'column',
};

/** Resonance beside Type, unlabeled — pure layout. */
export const BUS_FILTER_ROW_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'robotOptions.busFilterRow',
  type: 'directionalPanel',
  orientation: 'responsive',
};

/** The bus filter's cutoff, Hz, on a log scale (AudioAttributes.filterFreq). */
export const BUS_CUTOFF_SCHEMA: SliderLogSchema = {
  id: 'robotOptions.busFilter.cutoff',
  type: 'sliderLog',
  ...labels('probe.source.filter.cutoff'),
  min: ROBOT_BUS_FILTER_FREQ_RANGE.min,
  max: ROBOT_BUS_FILTER_FREQ_RANGE.max,
  orientation: 'horizontal',
};

/** The bus filter's Q (AudioAttributes.filterQ). */
export const BUS_RESONANCE_SCHEMA: SliderLogSchema = {
  id: 'robotOptions.busFilter.resonance',
  type: 'sliderLog',
  ...labels('probe.source.filter.resonance'),
  min: ROBOT_BUS_FILTER_Q_RANGE.min,
  max: ROBOT_BUS_FILTER_Q_RANGE.max,
  orientation: 'horizontal',
};

/** The bus filter's type (AudioAttributes.filterType). Radio values are the RobotFilterType strings. */
export const BUS_FILTER_TYPE_SCHEMA: RadioButtonSchema = {
  id: 'robotOptions.busFilter.type',
  type: 'radio',
  ...labels('probe.source.filter.type'),
  options: options('probe.source.filter.type'),
};

/**
 * The robot LFO target the Cutoff's link modulates. The link's schema itself is built inside the drawer
 * from `robotOptions.busFilter.link`, as each Source layer builds its own (an LfoLinkSchema has no target
 * field, and a link carries no label or help of its own — LfoLink names its lane and depth rows itself).
 */
export const BUS_FILTER_LFO_TARGET: RobotLfoTargetId = 'bus.frequency';

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
  // Display text only — 'layer0'/'layer1'/'layer2' (the `key` field above) is this block's real
  // internal identity everywhere else (RobotLfoTargetId construction, etc.); this union never
  // doubles as one, so it's safe to rename its display values without any other consumer's logic
  // breaking (docs/reference/text-content-tables.md: Baseline/Coaxial/Harmonic -> Core/Companion/
  // Accent).
  /** The layer's own name — content's probe.source.<layer> human/lore (Core Oscillator, …). */
  humanLabel: string;
  loreLabel?: string;
  /** DirectionalPanel wiring (docs/tasks/DIRECTIONAL_PANEL_WIRING.md) — this layer's own panel.
   *  Reuses this block's own humanLabel/loreLabel verbatim (Baseline/Coaxial/Harmonic already had
   *  exactly the right per-layer label; no new copy). */
  panel: DirectionalPanelSchema;
  /** The layer's two paired rows (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.4): Type | Gain
   *  on top, Phase | Interval last (rendered only while Interval is shown). Nested 'responsive'
   *  panels — side by side on desktop, stacked below — unlabeled: the layer panel's own label is
   *  the only heading. */
  rows: { typeGain: DirectionalPanelSchema; phaseInterval: DirectionalPanelSchema };
  params: SignatureArrayParamSchema[];
}

/** The 5 real WaveformType values only — 'noise' is dropped entirely (Roadmap Phase 9, see
 *  docs/specs/ROBOT_OPTIONS.md §7). Lore/human pairs per docs/reference/text-content-tables.md's
 *  Waveform Names table — corrects a previous mismatch where 'sine' carried "Sweep" (now
 *  Triangle's word) and 'triangle' carried the now-retired "Gradient". `label` is now the human
 *  name (each option previously showed the lore word alone, with no human counterpart). */
/** Each layer's content keys — literal (not templated) so the key-usage guard (content.test.ts)
 *  can see every one of them. The three Type radios share the same waveform options. */
const LAYER_CONTENT = {
  layer0: { root: 'probe.source.core', type: 'probe.source.core.type', gain: 'probe.source.core.gain', detune: 'probe.source.core.detune', phase: 'probe.source.core.phase', interval: 'probe.source.core.interval' },
  layer1: { root: 'probe.source.companion', type: 'probe.source.companion.type', gain: 'probe.source.companion.gain', detune: 'probe.source.companion.detune', phase: 'probe.source.companion.phase', interval: 'probe.source.companion.interval' },
  layer2: { root: 'probe.source.accent', type: 'probe.source.accent.type', gain: 'probe.source.accent.gain', detune: 'probe.source.accent.detune', phase: 'probe.source.accent.phase', interval: 'probe.source.accent.interval' },
} as const satisfies Record<SignatureArrayLayerKey, Record<'root' | 'type' | 'gain' | 'detune' | 'phase' | 'interval', ContentKey>>;

function makeLayerBlock(key: SignatureArrayLayerKey): SignatureArrayLayerBlock {
  const c = LAYER_CONTENT[key];
  const { humanLabel, loreLabel } = labels(c.root);
  const gainTarget = `${key}.gain` as RobotLfoTargetId;
  const detuneTarget = `${key}.detune` as RobotLfoTargetId;

  return {
    key,
    humanLabel,
    loreLabel,
    // 'column': the panel holds one stacked column of rows (it was 'row' with a single child, which
    // did nothing). Sliders are horizontal since docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.4
    // (they were vertical at 256px); no verticalHeight, since nothing here is vertical.
    panel: { id: `robotOptions.${key}.panel`, type: 'directionalPanel', ...labels(c.root), orientation: 'column' },
    rows: {
      typeGain: { id: `robotOptions.${key}.typeGainRow`, type: 'directionalPanel', orientation: 'responsive' },
      phaseInterval: { id: `robotOptions.${key}.phaseIntervalRow`, type: 'directionalPanel', orientation: 'responsive' },
    },
    params: [
      {
        field: 'type',
        schema: {
          id: `robotOptions.${key}.type`, type: 'radio',
          ...labels(c.type),
          options: options(c.type),
        } satisfies RadioButtonSchema,
      },
      {
        field: 'gain',
        schema: {
          id: `robotOptions.${key}.gain`, type: 'sliderLinear',
          ...labels(c.gain),
          min: 0, max: 2, step: 0.01, orientation: 'horizontal',
        } satisfies SliderLinearSchema,
        lfoTarget: gainTarget,
      },
      {
        field: 'detune',
        schema: {
          id: `robotOptions.${key}.detune`, type: 'sliderCenteredZero',
          ...labels(c.detune),
          min: -50, max: 50, orientation: 'horizontal',
        } satisfies SliderCenteredZeroSchema,
        lfoTarget: detuneTarget,
      },
      {
        // No lfoTarget — the phase LFO target was cut (docs/specs/LFO_BANK.md Task 1: Phase
        // never had a live Signal to modulate, the one of the 9 original robot targets that ran
        // a control-rate polling fallback instead of an audio-rate connection). The slider itself
        // stays, with no inline LfoLink row, same as Interval/pulseWidth below.
        field: 'phase',
        schema: {
          id: `robotOptions.${key}.phase`, type: 'sliderLinear',
          ...labels(c.phase),
          min: 0, max: 360, orientation: 'horizontal',
        } satisfies SliderLinearSchema,
      },
      {
        // No lfoTarget — the pulseWidth LFO target was removed (docs/specs/LFO_LOAD_FIX.md
        // assumption 9: the ≈7× cost outlier among robot LFOs, only ever live on pulse-type
        // layers). The slider itself stays, with no inline LfoLink row.
        field: 'pulseWidth',
        schema: {
          id: `robotOptions.${key}.pulseWidth`, type: 'sliderLinear',
          ...labels(c.interval),
          min: 0, max: 1, step: 0.01, orientation: 'horizontal',
        } satisfies SliderLinearSchema,
      },
    ],
  };
}

export const SIGNATURE_ARRAY_CONFIG: SignatureArrayLayerBlock[] = [
  makeLayerBlock('layer0'),
  makeLayerBlock('layer1'),
  makeLayerBlock('layer2'),
];
