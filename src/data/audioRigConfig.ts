/**
 * ControlSchema data for the Audio Rig drawer's 7 global effect blocks,
 * resolving docs/tasks/AUDIO_RIG.md Task 1 (V1) and docs/tasks/AUDIO_RIG_V2.md
 * Task 10 (V2 — Chorus removed, Limiter added, chain reordered). Every
 * label/unit/range/default traces field-for-field to
 * docs/reference/GLOBAL_CHAIN_GRID.md — no invented copy. Field paths
 * (`${key}.${field}`) match GlobalAudioSettings' own field names
 * (src/types/globalAudio.ts); the 7 params the grid flags `LFO?: X`
 * additionally carry a `lfoTarget` in GlobalLfoTargetId's short form
 * (src/types/lfo.ts). Neither Limiter nor Delay's delayTime carries one —
 * Limiter was never a GlobalLfoTargetId member (no LFO on the Limiter, by
 * design); delayTime's was removed after shipping (LFO judged unwanted on
 * Delay's own time param). Per docs/tasks/LFO_BANK.md Task 14, each `lfoTarget`
 * field renders an inline LfoLink in its effect panel — this file no longer
 * carries a per-param accordion schema of its own.
 */
import type { ControlSchema, DirectionalPanelSchema, PanelOrientation, RadioButtonSchema, SliderCenteredZeroSchema, SliderLinearSchema, SliderLogSchema } from '@/types/controls';
import type { GlobalLfoTargetId, LfoLaneId } from '@/types/lfo';
import { LFO_LANE_IDS, LFO_RATE_MIN, LFO_RATE_MAX, LFO_RATE_STEP } from '@/types/lfo';
import { DELAY_TIME_RANGE_SECONDS, DELAY_TIME_STEP_SECONDS } from '@/types/globalAudio';
import { formatDisplayValue } from '@/components/ui/controls/formatDisplayValue';
import { CONTENT, labels, options, fill, type ContentKey } from '@/content';

// ========================================
// TYPES
// ========================================

export type AudioRigEffectKey =
  | 'eq3' | 'filterLPF' | 'filterHPF' | 'delay' | 'reverb' | 'compressor' | 'limiter';

export interface AudioRigParamSchema {
  /** Matches the field path on GlobalAudioSettings[block.key], e.g. 'threshold', 'low', 'frequency'. */
  field: string;
  schema: ControlSchema;
  /** Present only for the 7 rows GLOBAL_CHAIN_GRID.md flags LFO?: X. Short form, matching GlobalLfoTargetId directly. */
  lfoTarget?: GlobalLfoTargetId;
}

export interface AudioRigEffectBlock {
  /** Matches GlobalAudioSettings' own key. */
  key: AudioRigEffectKey;
  /** DirectionalPanel wiring (docs/tasks/DIRECTIONAL_PANEL_WIRING.md) — supersedes this block's
   *  old `accordion:` field (its own accordion-typed schema, removed Task 2); every block's own
   *  top-level accordion wrapper was later removed too (docs/tasks/NAV_LAYOUT_REWRITE.md Task 14). */
  panel: DirectionalPanelSchema;
  params: AudioRigParamSchema[];
}

// ========================================
// HELPERS
// ========================================

/** DirectionalPanel counterpart to the old accordionSchema() helper (removed
 *  docs/tasks/NAV_LAYOUT_REWRITE.md Task 21) — same id/loreLabel/humanLabel
 *  shape, plus the orientation every DirectionalPanel needs. */
function panelSchema(key: AudioRigEffectKey, content: ContentKey, orientation: PanelOrientation): DirectionalPanelSchema {
  return { id: `audioRig.${key}`, type: 'directionalPanel', ...labels(content, { surface: 'heading' }), orientation };
}

// ========================================
// CONFIG
// ========================================

export const AUDIO_RIG_CONFIG: AudioRigEffectBlock[] = [
  {
    key: 'eq3',
    panel: panelSchema('eq3', 'fleet.eq', 'row'),
    params: [
      {
        field: 'low',
        schema: { id: 'eq3.low', type: 'sliderCenteredZero', ...labels('fleet.eq.bass'), min: -12, max: 12, step: 0.5, orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'eq3.low',
      },
      {
        field: 'mid',
        schema: { id: 'eq3.mid', type: 'sliderCenteredZero', ...labels('fleet.eq.mid'), min: -12, max: 12, step: 0.5, orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'eq3.mid',
      },
      {
        field: 'high',
        schema: { id: 'eq3.high', type: 'sliderCenteredZero', ...labels('fleet.eq.treble'), min: -12, max: 12, step: 0.5, orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'eq3.high',
      },
    ],
  },
  {
    key: 'filterLPF',
    panel: panelSchema('filterLPF', 'fleet.lpf', 'row'),
    params: [
      {
        field: 'frequency',
        schema: { id: 'filterLPF.frequency', type: 'sliderLog', ...labels('fleet.lpf.cutoff'), min: 20, max: 20000, orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'lpf.frequency',
      },
      {
        field: 'Q',
        schema: { id: 'filterLPF.Q', type: 'sliderLog', ...labels('fleet.lpf.resonance'), min: 0.1, max: 20, orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'lpf.Q',
      },
    ],
  },
  {
    key: 'filterHPF',
    panel: panelSchema('filterHPF', 'fleet.hpf', 'row'),
    params: [
      {
        field: 'frequency',
        schema: { id: 'filterHPF.frequency', type: 'sliderLog', ...labels('fleet.hpf.cutoff'), min: 20, max: 20000, orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'hpf.frequency',
      },
      {
        field: 'Q',
        schema: { id: 'filterHPF.Q', type: 'sliderLog', ...labels('fleet.hpf.resonance'), min: 0.1, max: 20, orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'hpf.Q',
      },
    ],
  },
  {
    key: 'delay',
    panel: panelSchema('delay', 'fleet.delay', 'column'),
    params: [
      // No lfoTarget/lfoAccordion — LFO removed from delayTime; the effect
      // still seeds/edits its value normally (GlobalAudioSeedFieldKey is a
      // separate, unrelated type from GlobalLfoTargetId).
      { field: 'delayTime', schema: { id: 'delay.delayTime', type: 'sliderLinear', ...labels('fleet.delay.time'), min: DELAY_TIME_RANGE_SECONDS.min, max: DELAY_TIME_RANGE_SECONDS.max, step: DELAY_TIME_STEP_SECONDS, orientation: 'horizontal' } },
      { field: 'feedback', schema: { id: 'delay.feedback', type: 'sliderLinear', ...labels('fleet.delay.repeats'), min: 0, max: 0.95, step: 0.01, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'delay.wet', type: 'sliderLinear', ...labels('fleet.delay.amount'), min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
    ],
  },
  {
    key: 'reverb',
    panel: panelSchema('reverb', 'fleet.reverb', 'column'),
    params: [
      { field: 'decay', schema: { id: 'reverb.decay', type: 'sliderLog', ...labels('fleet.reverb.length'), min: 0.1, max: 10, orientation: 'horizontal' } },
      { field: 'preDelay', schema: { id: 'reverb.preDelay', type: 'sliderLinear', ...labels('fleet.reverb.preDelay'), min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
      // dampening removed (V2) — Tone.Reverb has no such property; the slider
      // controlled a dead cast in globalFx.ts since Phase 0.
      { field: 'wet', schema: { id: 'reverb.wet', type: 'sliderLinear', ...labels('fleet.reverb.amount'), min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
    ],
  },
  {
    key: 'compressor',
    panel: panelSchema('compressor', 'fleet.compressor', 'column'),
    params: [
      { field: 'threshold', schema: { id: 'compressor.threshold', type: 'sliderLinear', ...labels('fleet.compressor.threshold'), min: -60, max: 0, orientation: 'horizontal' } },
      { field: 'ratio', schema: { id: 'compressor.ratio', type: 'sliderLinear', ...labels('fleet.compressor.ratio'), min: 1, max: 20, step: 1, orientation: 'horizontal' } },
      { field: 'attack', schema: { id: 'compressor.attack', type: 'sliderLog', ...labels('fleet.compressor.attack'), min: 0.001, max: 0.2, orientation: 'horizontal' } },
      { field: 'release', schema: { id: 'compressor.release', type: 'sliderLog', ...labels('fleet.compressor.release'), min: 0.01, max: 1, orientation: 'horizontal' } },
      { field: 'knee', schema: { id: 'compressor.knee', type: 'sliderLinear', ...labels('fleet.compressor.knee'), min: 0, max: 40, orientation: 'horizontal' } },
    ],
  },
  {
    key: 'limiter',
    panel: panelSchema('limiter', 'fleet.limiter', 'column'),
    params: [
      // No lfoTarget/lfoAccordion — Limiter never gets an LFO (spec: not a
      // GlobalLfoTargetId member, consistent with Compressor/Reverb having none).
      { field: 'threshold', schema: { id: 'limiter.threshold', type: 'sliderLinear', ...labels('fleet.limiter.ceiling'), min: -20, max: 0, orientation: 'horizontal' } },
    ],
  },
];

// ========================================
// GLOBAL CHAIN-LEVEL RADIO (not nested inside any one effect block)
// ========================================

/**
 * A two-option radio, not a toggle — 'natural' leaves Compressor after
 * Delay+Reverb (their tails ring out uncompressed, the default); 'controlled'
 * moves Compressor before both, tightening them. The drawer converts to/from
 * globalAudio.compressorBeforeDelay's boolean at the wiring point; the radio
 * schema itself only ever deals in these two string values.
 */
export const DECAY_MODE_SCHEMA: RadioButtonSchema = {
  id: 'audioRig.compressorBeforeDelay',
  type: 'radio',
  ...labels('fleet.output.decayMode'),
  options: options('fleet.output.decayMode'),
};

// ========================================
// LFO BANK LANE SCHEMAS (docs/specs/LFO_BANK.md Task 15) — the LFO Bank accordion's own 4 lane
// panels, replacing the old 2-group (globalFx/robots) Drift accordion entirely. Each lane owns its
// own Shape + Rate (the lane's own primary oscillator — the same controls Lfo.tsx's
// RadioButton/SliderLinear pair used per-target, now one shared instance per lane) plus a Rate
// Drift/Depth Drift pair, restated per lane instead of per drift-group — LfoBankLanePanel.tsx is
// the sole consumer. Drift sliders are UI-facing percent (-100..100); the drawer wiring point
// converts to/from audioStore.lfoBank's internal -1..1 fraction.
// ========================================

export interface LfoBankLaneSchema {
  panel: DirectionalPanelSchema;
  shape: RadioButtonSchema;
  rate: SliderLinearSchema;
  rateDrift: SliderCenteredZeroSchema;
  depthDrift: SliderCenteredZeroSchema;
}

/** fleet.lfoBank.laneA-D restate ui.lfoLane's own a-d names verbatim (kept in sync by hand, not by
 *  reference — see fleet.ts's own comment on these keys). */
const LFO_BANK_LANE_CONTENT: Record<LfoLaneId, ContentKey> = {
  a: 'fleet.lfoBank.laneA',
  b: 'fleet.lfoBank.laneB',
  c: 'fleet.lfoBank.laneC',
  d: 'fleet.lfoBank.laneD',
};

function lfoBankLaneSchema(lane: LfoLaneId): LfoBankLaneSchema {
  return {
    panel: { id: `audioRig.lfoBank.${lane}`, type: 'directionalPanel', ...labels(LFO_BANK_LANE_CONTENT[lane]), orientation: 'column' },
    shape: { id: `audioRig.lfoBank.${lane}.shape`, type: 'radio', ...labels('ui.lfo.shape'), options: options('ui.lfo.shape') },
    rate: {
      id: `audioRig.lfoBank.${lane}.rate`,
      type: 'sliderLinear',
      ...labels('ui.lfo.rate'),
      min: LFO_RATE_MIN,
      max: LFO_RATE_MAX,
      step: LFO_RATE_STEP,
      orientation: 'horizontal',
    },
    rateDrift: {
      id: `audioRig.lfoBank.${lane}.rateDrift`,
      type: 'sliderCenteredZero',
      ...labels('fleet.lfoBank.rateDrift'),
      min: -100,
      max: 100,
      orientation: 'horizontal',
    },
    depthDrift: {
      id: `audioRig.lfoBank.${lane}.depthDrift`,
      type: 'sliderCenteredZero',
      ...labels('fleet.lfoBank.depthDrift'),
      min: -100,
      max: 100,
      orientation: 'horizontal',
    },
  };
}

export const LFO_BANK_LANE_SCHEMAS: Record<LfoLaneId, LfoBankLaneSchema> = Object.fromEntries(
  LFO_LANE_IDS.map((lane) => [lane, lfoBankLaneSchema(lane)]),
) as Record<LfoLaneId, LfoBankLaneSchema>;

/**
 * "Ping Variance Automation" — the Audio Swells master control
 * (docs/specs/PING-VARIANCE-AUTOMATION.md), replacing the former
 * audioSwellsEnabled boolean. A bare, Rig-wide meta-setting like
 * DECAY_MODE_SCHEMA above — not a per-effect param, so it never joins
 * AUDIO_RIG_CONFIG's own array. Displays 0-100%; the store's own
 * pingVarianceAutomation field is a [0, 1] fraction — the drawer wiring
 * point converts via the same *100/÷100 pattern LFO_BANK_LANE_SCHEMAS' own
 * rateDrift/depthDrift sliders already use for their -1..1-fraction-to-percent conversion.
 */
export const PING_VARIANCE_AUTOMATION_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.pingVarianceAutomation',
  type: 'sliderLinear',
  ...labels('fleet.pacing.automationRange'),
  min: 1, // was 0 — docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2: Intensity no longer doubles as an on/off gate (Frequency took over that role), so it can never reach 0
  max: 100,
  step: 1,
  orientation: 'horizontal',
};

/**
 * "x times per measure when above 1, every x measures (calculated) when
 * below 1" (docs/intent/automation-frequency-duration-split.md). 0 reads as
 * "Off" (Frequency's on/off role, docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md
 * §1.3), not "0.0/measure" or "every Infinity measures". Below 1, "every x
 * measures" uses 1/value, rounded via the same formatDisplayValue every other
 * slider's readout already uses.
 */
function formatSwellFrequency(value: number): string {
  if (value === 0) return CONTENT['fleet.pacing.automationRate'].options.off.human;
  if (value >= 1) return fill('fleet.pacing.automationRate.perMeasure', { n: String(formatDisplayValue(value)) });
  return fill('fleet.pacing.automationRate.everyMeasures', { n: String(formatDisplayValue(1 / value)) });
}

/**
 * The exact allowed Automation Rate values (Crawford's own request) — 0 (off) plus 13 real
 * frequencies from "once every 16 measures" up to "16 times a measure", evenly spaced by index on
 * the slider (sliderLogMath's stepsValueToT/stepsTToValue) rather than a continuous log curve.
 * Exported so globalAudioSeed.ts's generateSwellFrequency can snap a freshly-seeded value onto
 * this same grid instead of the two drifting independently.
 */
export const SWELL_FREQUENCY_STEPS: readonly number[] = [
  0,
  1 / 16, 1 / 12, 1 / 8, 1 / 4, 1 / 3, 1 / 2,
  1, 2, 3, 4, 8, 12, 16,
];

/**
 * "Frequency" — takes over Ping Variance Automation's former on/off role (0
 * = off) and replaces the fixed per-measure trigger chance with a real rate
 * (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3). A fixed set of allowed values
 * (SWELL_FREQUENCY_STEPS above), not a continuous sliderLog range — min/max are just that list's
 * own first/last entries. A bare Rig-wide meta-setting, like PING_VARIANCE_AUTOMATION_SCHEMA
 * above — not a per-effect param.
 */
export const SWELL_FREQUENCY_SCHEMA: SliderLogSchema = {
  id: 'audioRig.swellFrequency',
  type: 'sliderLog',
  ...labels('fleet.pacing.automationRate'),
  min: SWELL_FREQUENCY_STEPS[0],
  max: SWELL_FREQUENCY_STEPS[SWELL_FREQUENCY_STEPS.length - 1],
  steps: SWELL_FREQUENCY_STEPS,
  orientation: 'horizontal',
  formatValue: formatSwellFrequency,
};

/**
 * "Duration" — total swell length in measures (rising + falling together),
 * replacing the former per-swell-randomized independent phase-length picks
 * (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.4). A bare Rig-wide
 * meta-setting, like PING_VARIANCE_AUTOMATION_SCHEMA above.
 */
export const SWELL_DURATION_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.swellDuration',
  type: 'sliderLinear',
  ...labels('fleet.pacing.automationLength'),
  min: 1,
  max: 24,
  step: 1,
  orientation: 'horizontal',
};

/**
 * "Tempo" — the Audio Rig's live BPM override (docs/specs/BPM_CONTROL.md),
 * a bare Rig-wide meta-setting like PING_VARIANCE_AUTOMATION_SCHEMA above —
 * not a per-effect param, so it never joins AUDIO_RIG_CONFIG's own array.
 * No unit conversion at the drawer wiring point: audioStore.bpm is already
 * stored in the same BPM units this slider displays (unlike
 * pingVarianceAutomation's fraction-to-percent split). [20, 200] is
 * deliberately wider than the locale seed range ([40, 100],
 * LOCALE_BPM_SEED_RANGE) on both ends — freely draggable beyond anything a
 * locale would ever seed, same "seed narrow, drag wide" convention
 * PING_VARIANCE_AUTOMATION_SCHEMA already established.
 */
export const BPM_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.bpm',
  type: 'sliderLinear',
  ...labels('fleet.pacing.tempo'),
  min: 20,
  max: 200,
  step: 1,
  orientation: 'horizontal',
};

// ========================================
// AUDIO LOAD (docs/specs/AUDIO_LOAD_BUDGET.md §4.5, shipped as two independent sliders 2026-09-22)
// ========================================
// Bare Rig-wide meta-settings, like BPM_SCHEMA/DECAY_MODE_SCHEMA: they never join AUDIO_RIG_CONFIG's
// array. The radio and the two sliders are three views of two stored numbers (audioStore.robotLoad,
// audioStore.effectsLoad): choosing a preset sets both sliders to it; dragging either slider away from
// the other leaves the radio unselected (presetForLoads requires both to agree).
// Lore labels are first-pass invented copy, to be confirmed in the manual check.

/** Light / Standard / Full — values are the preset names audioBudget.ts parses for `?load=`. */
export const AUDIO_LOAD_PRESET_SCHEMA: RadioButtonSchema = {
  id: 'audioRig.audioLoadPreset',
  type: 'radio',
  ...labels('settings.quality.preset'),
  options: options('settings.quality.preset'),
};

/** The Robot Load fine dial (audible robots, polyphony, boot-time latency), 0–100 % — 100 % (Full) is today's behavior exactly. */
export const AUDIO_ROBOT_LOAD_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.robotLoad',
  type: 'sliderLinear',
  ...labels('settings.quality.robotLoad'),
  min: 0,
  max: 100,
  step: 1,
  orientation: 'horizontal',
};

/** The Effects Load fine dial (drift, filter LFOs, robot-LFO count), 0–100 % — 100 % (Full) is today's behavior exactly. */
export const AUDIO_EFFECTS_LOAD_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.effectsLoad',
  type: 'sliderLinear',
  ...labels('settings.quality.effectsLoad'),
  min: 0,
  max: 100,
  step: 1,
  orientation: 'horizontal',
};

/** Wraps AudioLoadPanel.tsx's own 2 nested rows (preset+readout, Robot Load+Effects Load) — fixed
 *  'column' so those 2 rows always stack as 2 separate rows, on every tier (Crawford's own
 *  correction: this was 'responsive' too, which on desktop made the OUTER panel itself a row,
 *  putting the 2 nested row-panels side-by-side as columns instead of stacked — each nested row's
 *  own 'responsive' orientation already handles splitting its own 2 items on desktop). */
export const AUDIO_LOAD_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'audioRig.audioLoadPanel',
  type: 'directionalPanel',
  ...labels('settings.quality.audioLoad'),
  orientation: 'column',
};

// EQ & Filters, Time & Space, and Output no longer share one DirectionalPanel
// per group (EQ_FILTERS_ROW_PANEL_SCHEMA / TIME_SPACE_COLUMN_PANEL_SCHEMA /
// OUTPUT_COLUMN_PANEL_SCHEMA, removed) — a shared DirectionalPanel nests its
// children, so eq3/filterLPF/filterHPF (and Delay/Reverb, and Compressor/
// Limiter) all painted onto one continuous Cabinetry facade with no visible
// boundary between them; a flex gap inside that one shared surface read as
// padding, not a gap between distinct boxes (Crawford, live in the browser:
// "the gap is on .sc-directional-panel__content" despite the CSS correctly
// matching). AudioRigDrawer.tsx now wraps each group in a plain PanelGroup
// (orientation 'responsive' for EQ & Filters / Time & Space, 'column' for
// Output) instead — PanelGroup provides row/column + gap layout only, no
// Cabinetry facade of its own, so each block's own DirectionalPanel
// (block.panel, above) stays top-level and keeps its own independent facade.
// See docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md's "Separate facades"
// amendment.
