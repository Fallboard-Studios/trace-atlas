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
 * Delay's own time param). Per docs/specs/LFO_CONSOLIDATED_DISPLAY.md,
 * AudioRigDrawer renders one shared LfoTargetGroup display per LFO-bearing
 * block instead of a nested accordion per param — this file no longer
 * carries a per-param accordion schema of its own.
 */
import type { ControlSchema, AccordionSchema, DirectionalPanelSchema, PanelOrientation, RadioButtonSchema, SliderCenteredZeroSchema, SliderLinearSchema } from '@/types/controls';
import type { GlobalLfoTargetId, DriftGroupId } from '@/types/lfo';

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
   *  old `accordion: AccordionSchema` field (removed, Task 2): every block now renders as a
   *  DirectionalPanel nested inside one of AUDIO_RIG_ACCORDION_GROUPS'/
   *  TRANSPORT_COMPOSITION_ACCORDION_SCHEMA's top-level accordions instead of owning its own. */
  panel: DirectionalPanelSchema;
  params: AudioRigParamSchema[];
}

// ========================================
// HELPERS
// ========================================

/** `id` was `key: AudioRigEffectKey`-typed until docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 1 —
 *  loosened to `string` so it can also build the 4 top-level accordions in
 *  AUDIO_RIG_ACCORDION_GROUPS/TRANSPORT_COMPOSITION_ACCORDION_SCHEMA below, none of which are
 *  AudioRigEffectKeys. */
function accordionSchema(id: string, loreLabel: string, humanLabel: string): AccordionSchema {
  return { id: `audioRig.${id}`, type: 'accordion', loreLabel, humanLabel };
}

/** DirectionalPanel counterpart to accordionSchema() above — same id/loreLabel/humanLabel
 *  shape, plus the orientation every DirectionalPanel needs. */
function panelSchema(key: AudioRigEffectKey, loreLabel: string, humanLabel: string, orientation: PanelOrientation): DirectionalPanelSchema {
  return { id: `audioRig.${key}`, type: 'directionalPanel', loreLabel, humanLabel, orientation };
}

// ========================================
// CONFIG
// ========================================

export const AUDIO_RIG_CONFIG: AudioRigEffectBlock[] = [
  {
    key: 'eq3',
    panel: panelSchema('eq3', 'SPECTRAL FREQUENCY EQUALIZER', '3-Band EQ', 'row'),
    params: [
      {
        field: 'low',
        schema: { id: 'eq3.low', type: 'sliderCenteredZero', loreLabel: 'SUB-BAND', humanLabel: 'Low', min: -12, max: 12, step: 0.5, unit: 'dB', orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'eq3.low',
      },
      {
        field: 'mid',
        schema: { id: 'eq3.mid', type: 'sliderCenteredZero', loreLabel: 'MEDIAL-BAND', humanLabel: 'Mid', min: -12, max: 12, step: 0.5, unit: 'dB', orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'eq3.mid',
      },
      {
        field: 'high',
        schema: { id: 'eq3.high', type: 'sliderCenteredZero', loreLabel: 'APICAL-BAND', humanLabel: 'High', min: -12, max: 12, step: 0.5, unit: 'dB', orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'eq3.high',
      },
    ],
  },
  {
    key: 'filterLPF',
    panel: panelSchema('filterLPF', 'HIGH-FREQUENCY MASK', 'Low-Pass Filter', 'row'),
    params: [
      {
        field: 'frequency',
        schema: { id: 'filterLPF.frequency', type: 'sliderLog', loreLabel: 'CUTOFF FREQUENCY', humanLabel: 'Frequency', min: 20, max: 20000, unit: 'Hz', orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'lpf.frequency',
      },
      {
        field: 'Q',
        schema: { id: 'filterLPF.Q', type: 'sliderLog', loreLabel: 'BOUNDARY RESONANCE', humanLabel: 'Resonance', min: 0.1, max: 20, orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'lpf.Q',
      },
    ],
  },
  {
    key: 'filterHPF',
    panel: panelSchema('filterHPF', 'LOW-FREQUENCY MASK', 'High-Pass Filter', 'row'),
    params: [
      {
        field: 'frequency',
        schema: { id: 'filterHPF.frequency', type: 'sliderLog', loreLabel: 'CUTOFF FREQUENCY', humanLabel: 'Frequency', min: 20, max: 20000, unit: 'Hz', orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'hpf.frequency',
      },
      {
        field: 'Q',
        schema: { id: 'filterHPF.Q', type: 'sliderLog', loreLabel: 'BOUNDARY RESONANCE', humanLabel: 'Resonance', min: 0.1, max: 20, orientation: 'vertical', verticalHeight: 256 },
        lfoTarget: 'hpf.Q',
      },
    ],
  },
  {
    key: 'delay',
    panel: panelSchema('delay', 'TEMPORAL REFLECTION MATRIX', 'Delay', 'column'),
    params: [
      // No lfoTarget/lfoAccordion — LFO removed from delayTime; the effect
      // still seeds/edits its value normally (GlobalAudioSeedFieldKey is a
      // separate, unrelated type from GlobalLfoTargetId).
      { field: 'delayTime', schema: { id: 'delay.delayTime', type: 'sliderLinear', loreLabel: 'PROPAGATION LAG', humanLabel: 'Time', min: 0, max: 10, step: 0.001, unit: 's', orientation: 'horizontal' } },
      { field: 'feedback', schema: { id: 'delay.feedback', type: 'sliderLinear', loreLabel: 'RECIRCULATION RATE', humanLabel: 'Feedback', min: 0, max: 0.95, step: 0.01, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'delay.wet', type: 'sliderLinear', loreLabel: 'REFLECTED SIGNAL BALANCE', humanLabel: 'Mix', min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
    ],
  },
  {
    key: 'reverb',
    panel: panelSchema('reverb', 'SPATIAL DIFFUSION MATRIX', 'Reverb', 'column'),
    params: [
      { field: 'decay', schema: { id: 'reverb.decay', type: 'sliderLog', loreLabel: 'DISSIPATION DURATION', humanLabel: 'Decay', min: 0.1, max: 10, unit: 's', orientation: 'horizontal' } },
      { field: 'preDelay', schema: { id: 'reverb.preDelay', type: 'sliderLinear', loreLabel: 'INITIAL LAG', humanLabel: 'Pre-Delay', min: 0, max: 1, step: 0.01, unit: 's', orientation: 'horizontal' } },
      // dampening removed (V2) — Tone.Reverb has no such property; the slider
      // controlled a dead cast in globalFx.ts since Phase 0.
      { field: 'wet', schema: { id: 'reverb.wet', type: 'sliderLinear', loreLabel: 'DIFFUSED SIGNAL BALANCE', humanLabel: 'Mix', min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
    ],
  },
  {
    key: 'compressor',
    panel: panelSchema('compressor', 'DYNAMIC RANGE CONDENSER', 'Compressor', 'column'),
    params: [
      { field: 'threshold', schema: { id: 'compressor.threshold', type: 'sliderLinear', loreLabel: 'ATTENUATION THRESHOLD', humanLabel: 'Threshold', min: -60, max: 0, unit: 'dB', orientation: 'horizontal' } },
      { field: 'ratio', schema: { id: 'compressor.ratio', type: 'sliderLinear', loreLabel: 'COMPRESSION RATIO', humanLabel: 'Ratio', min: 1, max: 20, step: 1, orientation: 'horizontal' } },
      { field: 'attack', schema: { id: 'compressor.attack', type: 'sliderLog', loreLabel: 'COMPRESSION RATE', humanLabel: 'Attack', min: 0.001, max: 0.2, unit: 's', orientation: 'horizontal' } },
      { field: 'release', schema: { id: 'compressor.release', type: 'sliderLog', loreLabel: 'RAREFACTION RATE', humanLabel: 'Release', min: 0.01, max: 1, unit: 's', orientation: 'horizontal' } },
      { field: 'knee', schema: { id: 'compressor.knee', type: 'sliderLinear', loreLabel: 'CURVATURE DAMPING', humanLabel: 'Knee', min: 0, max: 40, unit: 'dB', orientation: 'horizontal' } },
    ],
  },
  {
    key: 'limiter',
    panel: panelSchema('limiter', 'TERMINAL CEILING GATE', 'Limiter', 'column'),
    params: [
      // No lfoTarget/lfoAccordion — Limiter never gets an LFO (spec: not a
      // GlobalLfoTargetId member, consistent with Compressor/Reverb having none).
      { field: 'threshold', schema: { id: 'limiter.threshold', type: 'sliderLinear', loreLabel: 'OUTPUT CEILING', humanLabel: 'Threshold', min: -20, max: 0, unit: 'dB', orientation: 'horizontal' } },
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
  loreLabel: 'DECAY PROTOCOL [c]',
  humanLabel: 'Decay Mode',
  options: [
    { value: 'natural', label: 'Natural Decay' },
    { value: 'controlled', label: 'Controlled Decay' },
  ],
};

/**
 * Global LFO drift (docs/specs/LFO_DRIFT_GROUPS.md) — 4 independent groups
 * (docs/types/lfo.ts's DriftGroupId), each its own accordion with its own
 * two bipolar sliders, standalone like DECAY_MODE_SCHEMA above: `lfoDrift`
 * is a top-level GlobalAudioSettings flag, not a per-effect object, so none
 * of these ever match an AudioRigEffectBlock key or get added to
 * AUDIO_RIG_CONFIG's own array. Sliders are UI-facing percent (-100..100);
 * the drawer wiring point converts to/from lfoEngine's internal -1..1
 * fraction, matching how Depth's own 0-100% UI already maps to lfoEngine's
 * 0-1 internal amplitude domain elsewhere in this file's consumers.
 *
 * Replaces the single flat LFO_DRIFT_ACCORDION/LFO_RATE_DRIFT_SCHEMA/
 * LFO_DEPTH_DRIFT_SCHEMA trio docs/specs/LFO_DRIFT.md originally shipped.
 */
export interface LfoDriftGroupSchema {
  group: DriftGroupId;
  /** DirectionalPanel wiring (docs/tasks/DIRECTIONAL_PANEL_WIRING.md) — supersedes this entry's
   *  old `accordion: AccordionSchema` field (removed, Task 2). Only the 'robots' entry's `.panel`
   *  is actually read post-wiring (AudioRigDrawer.tsx nests it inside Transport & Composition);
   *  the eq3/filterLPF/filterHPF entries keep it for schema-shape consistency across this array,
   *  same as their `.accordion` field was unused by the drawer before this restructure. */
  panel: DirectionalPanelSchema;
  rateSchema: SliderCenteredZeroSchema;
  depthSchema: SliderCenteredZeroSchema;
}

function driftGroupSchema(group: DriftGroupId, loreLabel: string, humanLabel: string): LfoDriftGroupSchema {
  return {
    group,
    panel: { id: `audioRig.lfoDrift.${group}`, type: 'directionalPanel', loreLabel, humanLabel, orientation: 'column' },
    rateSchema: {
      id: `audioRig.lfoDrift.${group}.rateDrift`,
      type: 'sliderCenteredZero',
      loreLabel: 'CADENCE INSTABILITY',
      humanLabel: 'Rate Drift',
      min: -100,
      max: 100,
      unit: '%',
      orientation: 'horizontal',
    },
    depthSchema: {
      id: `audioRig.lfoDrift.${group}.depthDrift`,
      type: 'sliderCenteredZero',
      loreLabel: 'AMPLITUDE INSTABILITY',
      humanLabel: 'Depth Drift',
      min: -100,
      max: 100,
      unit: '%',
      orientation: 'horizontal',
    },
  };
}

// First-pass copy — no reference grid exists for this feature (10.2's own
// spec already flagged this gap; still true here). Confirm the 4 labels
// read as clearly distinct groups during the feature's manual check.
export const LFO_DRIFT_GROUPS: LfoDriftGroupSchema[] = [
  driftGroupSchema('eq3', 'SPECTRAL FLUX', 'EQ Drift'),
  driftGroupSchema('filterLPF', 'HIGH-MASK FLUX', 'Low-Pass Drift'),
  driftGroupSchema('filterHPF', 'LOW-MASK FLUX', 'High-Pass Drift'),
  driftGroupSchema('robots', 'AGENT FLUX', 'Robot Drift'),
];

/**
 * "Ping Variance Automation" — the Audio Swells master control
 * (docs/specs/PING-VARIANCE-AUTOMATION.md), replacing the former
 * audioSwellsEnabled boolean. A bare, Rig-wide meta-setting like
 * DECAY_MODE_SCHEMA above — not a per-effect param, so it never joins
 * AUDIO_RIG_CONFIG's own array. Displays 0-100%; the store's own
 * pingVarianceAutomation field is a [0, 1] fraction — the drawer wiring
 * point converts via the same *100/÷100 pattern LFO_DRIFT_GROUPS' sliders
 * already use for their own -1..1-fraction-to-percent conversion.
 */
export const PING_VARIANCE_AUTOMATION_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.pingVarianceAutomation',
  type: 'sliderLinear',
  loreLabel: 'PING VARIANCE AUTOMATION',
  humanLabel: 'Automatic Effects',
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
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
  loreLabel: 'RESONANCE CADENCE',
  humanLabel: 'Tempo',
  min: 20,
  max: 200,
  step: 1,
  unit: 'BPM',
  orientation: 'horizontal',
};

// ========================================
// DIRECTIONAL PANEL WIRING — new top-level accordions
// (docs/specs/DIRECTIONAL_PANEL_WIRING.md §4.1)
// ========================================

/**
 * The 4th top-level accordion — not keyed to any AudioRigEffectBlock, wraps
 * SPEED_AUTOMATION_PANEL_SCHEMA (Automatic Effects + Tempo) and the 'robots' LFO_DRIFT_GROUPS
 * entry's own panel. Built via the same accordionSchema() helper every other top-level accordion
 * uses (loosened to take a plain `id: string` above).
 */
export const TRANSPORT_COMPOSITION_ACCORDION_SCHEMA: AccordionSchema =
  accordionSchema('transportComposition', 'CHRONOMETRIC CONTROL ARRAY', 'Transport & Composition');

/**
 * Wraps PING_VARIANCE_AUTOMATION_SCHEMA + BPM_SCHEMA — today's two bare
 * `audio-rig-drawer__master-row` sliders, given a panel of their own inside Transport &
 * Composition. No prior accordion to inherit copy from (intent doc) — first-pass invented lore,
 * same "confirm during manual check" treatment as LFO_DRIFT_GROUPS' own labels.
 */
export const SPEED_AUTOMATION_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'audioRig.speedAutomation',
  type: 'directionalPanel',
  loreLabel: 'CHRONOMETRIC CONTROL ARRAY',
  humanLabel: 'Speed & Automation',
  // 'responsive', not fixed 'row' — 2 stacked rows (Tempo, Automatic Effects) on
  // mobile/tablet, 1 shared row on desktop. docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.9.
  orientation: 'responsive',
};

// ========================================
// AUDIO LOAD (docs/specs/AUDIO_LOAD_BUDGET.md §4.5)
// ========================================
// Bare Rig-wide meta-settings, like BPM_SCHEMA/DECAY_MODE_SCHEMA: they never join AUDIO_RIG_CONFIG's
// array. The radio and the slider are two views of one stored number (audioStore.audioLoad):
// choosing a preset sets the slider; dragging the slider off a preset leaves the radio unselected.
// Lore labels are first-pass invented copy, to be confirmed in the manual check.

/** Light / Standard / Full — values are the preset names audioBudget.ts parses for `?load=`. */
export const AUDIO_LOAD_PRESET_SCHEMA: RadioButtonSchema = {
  id: 'audioRig.audioLoadPreset',
  type: 'radio',
  loreLabel: 'ACOUSTIC LOAD PROTOCOL',
  humanLabel: 'Preset',
  options: [
    { value: 'light', label: 'Light' },
    { value: 'standard', label: 'Standard' },
    { value: 'full', label: 'Full' },
  ],
};

/** The fine dial, 0–100 % — 100 % (Full) is today's behavior exactly. */
export const AUDIO_LOAD_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.audioLoad',
  type: 'sliderLinear',
  loreLabel: 'ACOUSTIC LOAD CEILING',
  humanLabel: 'Audio Load',
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
  orientation: 'horizontal',
};

/** Wraps the preset radio, the slider and the readout, next to Tempo in Transport & Composition. */
export const AUDIO_LOAD_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'audioRig.audioLoadPanel',
  type: 'directionalPanel',
  loreLabel: 'ACOUSTIC LOAD MANAGEMENT',
  humanLabel: 'Audio Load',
  orientation: 'responsive',
};

/**
 * The 3 remaining top-level accordions, each grouping a fixed set of AUDIO_RIG_CONFIG block keys
 * (looked up by key at render time — AudioRigDrawer.tsx no longer maps AUDIO_RIG_CONFIG directly).
 * Order matches docs/intent/directional-panel-wiring.md's Outcome table: EQ & Filters, Time &
 * Space, Output.
 */
export type AudioRigAccordionGroupKey = 'eqFilters' | 'timeSpace' | 'output';

export const AUDIO_RIG_ACCORDION_GROUPS: { key: AudioRigAccordionGroupKey; accordion: AccordionSchema; blockKeys: AudioRigEffectKey[] }[] = [
  { key: 'eqFilters', accordion: accordionSchema('eqFilters', 'SPECTRAL CONDITIONING SUITE', 'EQ & Filters'), blockKeys: ['eq3', 'filterLPF', 'filterHPF'] },
  { key: 'timeSpace', accordion: accordionSchema('timeSpace', 'TEMPORAL-SPATIAL PROCESSING SUITE', 'Time & Space'), blockKeys: ['delay', 'reverb'] },
  { key: 'output', accordion: accordionSchema('output', 'TERMINAL SIGNAL CONDITIONING', 'Output'), blockKeys: ['compressor', 'limiter'] },
];

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
