/**
 * ControlSchema data for the Audio Rig drawer's 7 global effect blocks,
 * resolving docs/tasks/archive/AUDIO_RIG.md Task 1 (V1) and docs/tasks/archive/AUDIO_RIG_V2.md
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
import { LFO_BANK_LANE_CONTENT } from './lfoConfig';
import type { ControlSchema, DirectionalPanelSchema, RadioButtonSchema, SliderCenteredZeroSchema, SliderLinearSchema, SliderLogSchema } from '@/types/controls';
import type { GlobalLfoTargetId, LfoLaneId } from '@/types/lfo';
import { LFO_LANE_IDS, LFO_RATE_MIN, LFO_RATE_MAX, LFO_RATE_STEP } from '@/types/lfo';
import { DELAY_TIME_RANGE_SECONDS, DELAY_TIME_STEP_SECONDS, PEDAL_RATE_RANGE_HZ, PEDAL_RATE_STEP_HZ, type GlobalAudioSettings } from '@/types/globalAudio';
import { formatDisplayValue } from '@/components/ui/controls/formatDisplayValue';
import { fixedReadout } from '@/components/ui/controls/formatReadout';
import { CONTENT, labels, options, fill, type ContentKey } from '@/content';
import { HUMANIZE_MIN_MS, HUMANIZE_MAX_MS } from '@/constants';

// ========================================
// TYPES
// ========================================

export type AudioRigEffectKey =
  | 'eq3' | 'filterLPF' | 'filterHPF' | 'distortion' | 'chebyshev' | 'bitCrusher' | 'autoWah' | 'phaser'
  | 'chorus' | 'tremolo' | 'vibrato' | 'frequencyShifter' | 'delay' | 'reverb' | 'compressor' | 'stereoWidener' | 'limiter';

export interface AudioRigParamSchema {
  /** Matches the field path on GlobalAudioSettings[block.key], e.g. 'threshold', 'low', 'frequency'. */
  field: string;
  schema: ControlSchema;
  /** Present only for the 7 rows GLOBAL_CHAIN_GRID.md flags LFO?: X. Short form, matching GlobalLfoTargetId directly. */
  lfoTarget?: GlobalLfoTargetId;
}

/** A field of effect K's own settings (GlobalAudioSettings[K]); distributive, so the default K is every effect's fields. */
type AudioRigField<K extends AudioRigEffectKey> = K extends AudioRigEffectKey ? Extract<keyof GlobalAudioSettings[K], string> : never;

/** One cell token in effect K's `layout`: a param's `field`, `'<field>.link'` for that param's LfoLink (a cell of
 *  its own, so the slider's cell can be featured without wrapping the link), or `'decayMode'` for the Compressor's
 *  Decay radio (docs/specs/CONTENT_LAYOUT.md §1.2). Typed per effect, so a misspelt field fails to compile; resolveCell
 *  still checks at load that the field is one of the block's params and that a linked one has an LFO target. */
export type AudioRigCellToken<K extends AudioRigEffectKey = AudioRigEffectKey> =
  | AudioRigField<K>
  | `${AudioRigField<K>}.link`
  | 'decayMode';

const LINK_SUFFIX = '.link';

/** Panels > rows > cell tokens, read like the effect's row in docs/specs/CONTENT_LAYOUT.md §1.2. Each panel is one
 *  cabinetry box; a row of two or more cells is a nested 'responsive' panel, a row of one is the cell alone. */
export type AudioRigLayout<K extends AudioRigEffectKey = AudioRigEffectKey> = readonly (readonly (readonly AudioRigCellToken<K>[])[])[];

/** A param that carries an LFO target, so it can have a link cell. */
export type AudioRigLinkedParamSchema = AudioRigParamSchema & { lfoTarget: GlobalLfoTargetId };

/** A layout token resolved at module load: the block's own param object, that param's LfoLink, or the Decay radio. */
export type AudioRigCell =
  | { kind: 'param'; param: AudioRigParamSchema }
  | { kind: 'link'; param: AudioRigLinkedParamSchema }
  | { kind: 'decayMode' };

export interface AudioRigRow {
  /** The nested 'responsive' panel of a shared row (`audioRig.<key>.p<n>.r<m>`); absent on a row of one. */
  schema?: DirectionalPanelSchema;
  cells: readonly AudioRigCell[];
}

export interface AudioRigBox {
  /** A top-level 'column' panel, `audioRig.<key>.p<n>`; the effect's heading rides on the first box alone. */
  schema: DirectionalPanelSchema;
  rows: readonly AudioRigRow[];
}

export interface AudioRigEffectBlock {
  /** Matches GlobalAudioSettings' own key. */
  key: AudioRigEffectKey;
  /** The effect's heading, worn by its first box. */
  heading: ContentKey;
  params: AudioRigParamSchema[];
  layout: AudioRigLayout;
  /** Built once from `layout` at module load, so every schema the panel renders is a stable reference. */
  boxes: readonly AudioRigBox[];
}

// ========================================
// HELPERS
// ========================================

/** An effect as written in AUDIO_RIG_CONFIG: its layout typed against its own key's fields (`key` alone fixes K). */
interface AudioRigEffectDef<K extends AudioRigEffectKey> extends Omit<AudioRigEffectBlock, 'key' | 'layout' | 'boxes'> {
  key: K;
  layout: AudioRigLayout<NoInfer<K>>;
}

function resolveCell(def: Pick<AudioRigEffectBlock, 'key' | 'params'>, token: AudioRigCellToken): AudioRigCell {
  if (token === 'decayMode') return { kind: 'decayMode' };
  const isLink = token.endsWith(LINK_SUFFIX);
  const field = isLink ? token.slice(0, -LINK_SUFFIX.length) : token;
  const param = def.params.find((p) => p.field === field);
  if (!param) throw new Error(`audioRig.${def.key}: layout names "${token}", which is not one of its params`);
  if (!isLink) return { kind: 'param', param };
  if (!isLinkedParam(param)) throw new Error(`audioRig.${def.key}: layout links "${field}", which has no LFO target`);
  return { kind: 'link', param };
}

function isLinkedParam(param: AudioRigParamSchema): param is AudioRigLinkedParamSchema {
  return param.lfoTarget !== undefined;
}

/** Builds an effect block's box and row schemas from its `layout` (docs/specs/CONTENT_LAYOUT.md §1.2, §4): box
 *  `audioRig.<key>.p<n>`, shared row `audioRig.<key>.p<n>.r<m>`, the heading on P1 alone. */
function effect<K extends AudioRigEffectKey>(def: AudioRigEffectDef<K>): AudioRigEffectBlock {
  const boxes = def.layout.map((panel, p): AudioRigBox => {
    const id = `audioRig.${def.key}.p${p + 1}`;
    const heading = p === 0 ? labels(def.heading, { surface: 'heading' }) : {};
    return {
      schema: { id, type: 'directionalPanel', ...heading, orientation: 'column' },
      rows: panel.map((row, r): AudioRigRow => ({
        ...(row.length > 1 ? { schema: { id: `${id}.r${r + 1}`, type: 'directionalPanel', orientation: 'responsive' } } : {}),
        cells: row.map((token) => resolveCell(def, token)),
      })),
    };
  });
  return { ...def, boxes };
}

/** A log slider's labels plus its fixed-width readout (fixedReadout), the unit read from the same
 *  content entry: `decimals` places, the value times `scale` first. See docs/specs/LOG_SLIDER_READOUTS.md. */
function logReadout(key: ContentKey, decimals: number, scale = 1) {
  const l = labels(key);
  return { ...l, formatValue: fixedReadout(decimals, l.unit, scale) };
}

// ========================================
// CONFIG
// ========================================

export const AUDIO_RIG_CONFIG: AudioRigEffectBlock[] = [
  effect({
  // EQ and both filters: horizontal sliders, one box per band or param, the slider on row 1 and its Lane | Depth
  // LfoLink on row 2 (docs/specs/CONTENT_LAYOUT.md §1.2), the bands and the Cutoffs featured (§1.4). They were
  // 'row' panels of vertical sliders (AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3/§1.4), then one box of stacked rows
  // (POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.2); no verticalHeight, since nothing here is vertical.
    key: 'eq3',
    heading: 'fleet.eq',
    layout: [
      [['low'], ['low.link']],
      [['mid'], ['mid.link']],
      [['high'], ['high.link']],
    ],
    params: [
      {
        field: 'low',
        schema: { id: 'eq3.low', type: 'sliderCenteredZero', ...labels('fleet.eq.bass'), min: -12, max: 12, step: 0.5, orientation: 'horizontal', featured: true },
        lfoTarget: 'eq3.low',
      },
      {
        field: 'mid',
        schema: { id: 'eq3.mid', type: 'sliderCenteredZero', ...labels('fleet.eq.mid'), min: -12, max: 12, step: 0.5, orientation: 'horizontal', featured: true },
        lfoTarget: 'eq3.mid',
      },
      {
        field: 'high',
        schema: { id: 'eq3.high', type: 'sliderCenteredZero', ...labels('fleet.eq.treble'), min: -12, max: 12, step: 0.5, orientation: 'horizontal', featured: true },
        lfoTarget: 'eq3.high',
      },
    ],
  }),
  effect({
    key: 'filterLPF',
    heading: 'fleet.lpf',
    layout: [
      [['frequency'], ['frequency.link']],
      [['Q'], ['Q.link']],
    ],
    params: [
      {
        field: 'frequency',
        schema: { id: 'filterLPF.frequency', type: 'sliderLog', ...logReadout('fleet.lpf.cutoff', 0), min: 20, max: 20000, orientation: 'horizontal', featured: true },
        lfoTarget: 'lpf.frequency',
      },
      {
        field: 'Q',
        schema: { id: 'filterLPF.Q', type: 'sliderLog', ...logReadout('fleet.lpf.resonance', 2), min: 0.1, max: 20, orientation: 'horizontal' },
        lfoTarget: 'lpf.Q',
      },
    ],
  }),
  effect({
    key: 'filterHPF',
    heading: 'fleet.hpf',
    layout: [
      [['frequency'], ['frequency.link']],
      [['Q'], ['Q.link']],
    ],
    params: [
      {
        field: 'frequency',
        schema: { id: 'filterHPF.frequency', type: 'sliderLog', ...logReadout('fleet.hpf.cutoff', 0), min: 20, max: 20000, orientation: 'horizontal', featured: true },
        lfoTarget: 'hpf.frequency',
      },
      {
        field: 'Q',
        schema: { id: 'filterHPF.Q', type: 'sliderLog', ...logReadout('fleet.hpf.resonance', 2), min: 0.1, max: 20, orientation: 'horizontal' },
        lfoTarget: 'hpf.Q',
      },
    ],
  }),
  // Global Colour (docs/specs/GLOBAL_COLOUR.md §1.4): three dry-chain effects between the filters and the
  // rooms, two sliders each. Ranges are the full seed ranges (globalAudioSeedRanges.ts; a test pins the
  // match). No lfoTarget on any of them — colour is neither LFO-able nor swellable.
  effect({
    key: 'distortion',
    heading: 'fleet.distortion',
    layout: [[['wet'], ['amount']]],
    params: [
      { field: 'amount', schema: { id: 'distortion.amount', type: 'sliderLinear', ...labels('fleet.distortion.drive'), min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'distortion.wet', type: 'sliderLinear', ...labels('fleet.distortion.mix'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'chebyshev',
    heading: 'fleet.chebyshev',
    layout: [[['wet'], ['order']]],
    params: [
      { field: 'order', schema: { id: 'chebyshev.order', type: 'sliderLinear', ...labels('fleet.chebyshev.harmonics'), min: 1, max: 8, step: 1, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'chebyshev.wet', type: 'sliderLinear', ...labels('fleet.chebyshev.mix'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'bitCrusher',
    heading: 'fleet.bitCrusher',
    layout: [[['wet'], ['bits']]],
    params: [
      { field: 'bits', schema: { id: 'bitCrusher.bits', type: 'sliderLinear', ...labels('fleet.bitCrusher.bits'), min: 1, max: 16, step: 1, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'bitCrusher.wet', type: 'sliderLinear', ...labels('fleet.bitCrusher.mix'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  // Global Modulation (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.6): two dry-chain pedals after Colour, every
  // parameter of the Tone node a slider. Ranges are the full seed ranges (globalAudioSeedRanges.ts; a test pins
  // the match). No lfoTarget on any of them — the pedals are neither LFO-able nor swellable. The Phaser's Rate
  // is a sliderLinear because TempoSyncSlider takes a linear schema; the drawer swaps in the Free | Sync row.
  effect({
    key: 'autoWah',
    heading: 'fleet.autoWah',
    layout: [
      [['wet'], ['baseFrequency', 'octaves']],
      [['sensitivity', 'Q'], ['gain', 'follower']],
    ],
    params: [
      { field: 'baseFrequency', schema: { id: 'autoWah.baseFrequency', type: 'sliderLog', ...logReadout('fleet.autoWah.baseFrequency', 0), min: 50, max: 1000, orientation: 'horizontal' } },
      { field: 'octaves', schema: { id: 'autoWah.octaves', type: 'sliderLinear', ...labels('fleet.autoWah.octaves'), min: 1, max: 8, step: 0.5, orientation: 'horizontal' } },
      { field: 'sensitivity', schema: { id: 'autoWah.sensitivity', type: 'sliderLinear', ...labels('fleet.autoWah.sensitivity'), min: -40, max: 0, step: 1, orientation: 'horizontal' } },
      { field: 'Q', schema: { id: 'autoWah.Q', type: 'sliderLog', ...logReadout('fleet.autoWah.q', 2), min: 0.5, max: 10, orientation: 'horizontal' } },
      { field: 'gain', schema: { id: 'autoWah.gain', type: 'sliderLinear', ...labels('fleet.autoWah.gain'), min: 0, max: 20, step: 0.5, orientation: 'horizontal' } },
      { field: 'follower', schema: { id: 'autoWah.follower', type: 'sliderLog', ...logReadout('fleet.autoWah.follower', 2), min: 0.01, max: 1, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'autoWah.wet', type: 'sliderLinear', ...labels('fleet.autoWah.mix'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'phaser',
    heading: 'fleet.phaser',
    layout: [
      [['wet'], ['baseFrequency', 'rate'], ['octaves']],
      [['stages', 'Q']],
    ],
    params: [
      { field: 'rate', schema: { id: 'phaser.rate', type: 'sliderLinear', ...labels('fleet.phaser.rate'), min: PEDAL_RATE_RANGE_HZ.min, max: PEDAL_RATE_RANGE_HZ.max, step: PEDAL_RATE_STEP_HZ, orientation: 'horizontal' } },
      { field: 'octaves', schema: { id: 'phaser.octaves', type: 'sliderLinear', ...labels('fleet.phaser.octaves'), min: 0.5, max: 6, step: 0.5, orientation: 'horizontal' } },
      { field: 'baseFrequency', schema: { id: 'phaser.baseFrequency', type: 'sliderLog', ...logReadout('fleet.phaser.baseFrequency', 0), min: 50, max: 2000, orientation: 'horizontal' } },
      { field: 'stages', schema: { id: 'phaser.stages', type: 'sliderLinear', ...labels('fleet.phaser.stages'), min: 1, max: 12, step: 1, orientation: 'horizontal' } },
      { field: 'Q', schema: { id: 'phaser.Q', type: 'sliderLog', ...logReadout('fleet.phaser.q', 2), min: 0.5, max: 20, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'phaser.wet', type: 'sliderLinear', ...labels('fleet.phaser.mix'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  // Global Pedals (docs/specs/GLOBAL_PEDALS.md §1.6, assumption 5): four motion pedals after the Phaser, in chain
  // order, every field a horizontal slider over its full seed range (globalAudioSeedRanges.ts; a test pins the
  // match). No lfoTarget. The three LFO pedals' Rate rows share PEDAL_RATE_RANGE_HZ and are sliderLinear because
  // TempoSyncSlider takes a linear schema; Shift is signed, so it is a centred-zero slider.
  effect({
    key: 'chorus',
    heading: 'fleet.chorus',
    layout: [
      [['wet'], ['rate', 'depth']],
      [['delayTime', 'spread'], ['feedback']],
    ],
    params: [
      { field: 'rate', schema: { id: 'chorus.rate', type: 'sliderLinear', ...labels('fleet.chorus.rate'), min: PEDAL_RATE_RANGE_HZ.min, max: PEDAL_RATE_RANGE_HZ.max, step: PEDAL_RATE_STEP_HZ, orientation: 'horizontal' } },
      { field: 'delayTime', schema: { id: 'chorus.delayTime', type: 'sliderLinear', ...labels('fleet.chorus.delay'), min: 1, max: 20, step: 0.5, orientation: 'horizontal' } },
      { field: 'depth', schema: { id: 'chorus.depth', type: 'sliderLinear', ...labels('fleet.chorus.depth'), min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
      { field: 'spread', schema: { id: 'chorus.spread', type: 'sliderLinear', ...labels('fleet.chorus.spread'), min: 0, max: 180, step: 5, orientation: 'horizontal' } },
      { field: 'feedback', schema: { id: 'chorus.feedback', type: 'sliderLinear', ...labels('fleet.chorus.feedback'), min: 0, max: 0.9, step: 0.01, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'chorus.wet', type: 'sliderLinear', ...labels('fleet.chorus.mix'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'tremolo',
    heading: 'fleet.tremolo',
    layout: [[['wet'], ['rate', 'depth'], ['spread']]],
    params: [
      { field: 'rate', schema: { id: 'tremolo.rate', type: 'sliderLinear', ...labels('fleet.tremolo.rate'), min: PEDAL_RATE_RANGE_HZ.min, max: PEDAL_RATE_RANGE_HZ.max, step: PEDAL_RATE_STEP_HZ, orientation: 'horizontal' } },
      { field: 'depth', schema: { id: 'tremolo.depth', type: 'sliderLinear', ...labels('fleet.tremolo.depth'), min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
      { field: 'spread', schema: { id: 'tremolo.spread', type: 'sliderLinear', ...labels('fleet.tremolo.spread'), min: 0, max: 180, step: 5, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'tremolo.wet', type: 'sliderLinear', ...labels('fleet.tremolo.mix'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'vibrato',
    heading: 'fleet.vibrato',
    layout: [[['wet'], ['rate', 'depth']]],
    params: [
      { field: 'rate', schema: { id: 'vibrato.rate', type: 'sliderLinear', ...labels('fleet.vibrato.rate'), min: PEDAL_RATE_RANGE_HZ.min, max: PEDAL_RATE_RANGE_HZ.max, step: PEDAL_RATE_STEP_HZ, orientation: 'horizontal' } },
      { field: 'depth', schema: { id: 'vibrato.depth', type: 'sliderLinear', ...labels('fleet.vibrato.depth'), min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'vibrato.wet', type: 'sliderLinear', ...labels('fleet.vibrato.mix'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'frequencyShifter',
    heading: 'fleet.frequencyShifter',
    layout: [[['wet'], ['shift']]],
    params: [
      { field: 'shift', schema: { id: 'frequencyShifter.shift', type: 'sliderCenteredZero', ...labels('fleet.frequencyShifter.shift'), min: -1000, max: 1000, step: 1, logKnee: 1, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'frequencyShifter.wet', type: 'sliderLinear', ...labels('fleet.frequencyShifter.mix'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'delay',
    heading: 'fleet.delay',
    layout: [[['wet'], ['delayTime', 'feedback']]],
    params: [
      // No lfoTarget/lfoAccordion — LFO removed from delayTime; the effect
      // still seeds/edits its value normally (GlobalAudioSeedFieldKey is a
      // separate, unrelated type from GlobalLfoTargetId).
      { field: 'delayTime', schema: { id: 'delay.delayTime', type: 'sliderLinear', ...labels('fleet.delay.time'), min: DELAY_TIME_RANGE_SECONDS.min, max: DELAY_TIME_RANGE_SECONDS.max, step: DELAY_TIME_STEP_SECONDS, orientation: 'horizontal' } },
      { field: 'feedback', schema: { id: 'delay.feedback', type: 'sliderLinear', ...labels('fleet.delay.repeats'), min: 0, max: 0.95, step: 0.01, orientation: 'horizontal' } },
      { field: 'wet', schema: { id: 'delay.wet', type: 'sliderLinear', ...labels('fleet.delay.amount'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'reverb',
    heading: 'fleet.reverb',
    layout: [[['wet'], ['decay', 'preDelay']]],
    params: [
      { field: 'decay', schema: { id: 'reverb.decay', type: 'sliderLog', ...logReadout('fleet.reverb.length', 2), min: 0.1, max: 10, orientation: 'horizontal' } },
      { field: 'preDelay', schema: { id: 'reverb.preDelay', type: 'sliderLinear', ...labels('fleet.reverb.preDelay'), min: 0, max: 0.25, step: 0.01, orientation: 'horizontal' } },
      // dampening removed (V2) — Tone.Reverb has no such property; the slider
      // controlled a dead cast in globalFx.ts since Phase 0.
      { field: 'wet', schema: { id: 'reverb.wet', type: 'sliderLinear', ...labels('fleet.reverb.amount'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'compressor',
    heading: 'fleet.compressor',
    layout: [
      [['threshold', 'ratio'], ['knee']],
      [['attack', 'release'], ['decayMode']],
    ],
    params: [
      { field: 'threshold', schema: { id: 'compressor.threshold', type: 'sliderLinear', ...labels('fleet.compressor.threshold'), min: -60, max: 0, orientation: 'horizontal' } },
      { field: 'ratio', schema: { id: 'compressor.ratio', type: 'sliderLinear', ...labels('fleet.compressor.ratio'), min: 1, max: 20, step: 1, orientation: 'horizontal' } },
      { field: 'attack', schema: { id: 'compressor.attack', type: 'sliderLog', ...logReadout('fleet.compressor.attack', 0, 1000), min: 0.001, max: 0.2, orientation: 'horizontal' } },
      { field: 'release', schema: { id: 'compressor.release', type: 'sliderLog', ...logReadout('fleet.compressor.release', 0, 1000), min: 0.01, max: 1, orientation: 'horizontal' } },
      { field: 'knee', schema: { id: 'compressor.knee', type: 'sliderLinear', ...labels('fleet.compressor.knee'), min: 0, max: 40, orientation: 'horizontal' } },
    ],
  }),
  // Width (docs/specs/GLOBAL_PEDALS.md §1.6): the one-slider stage between the Compressor and the Limiter. 0.5 is
  // the sound as recorded, 0 mono, 1 all side; no Mix (the node is held fully wet) and no lfoTarget.
  effect({
    key: 'stereoWidener',
    heading: 'fleet.stereoWidener',
    layout: [[['width']]],
    params: [
      { field: 'width', schema: { id: 'stereoWidener.width', type: 'sliderLinear', ...labels('fleet.stereoWidener.width'), min: 0, max: 1, step: 0.01, orientation: 'horizontal', featured: true } },
    ],
  }),
  effect({
    key: 'limiter',
    heading: 'fleet.limiter',
    layout: [[['threshold']]],
    params: [
      // No lfoTarget/lfoAccordion — Limiter never gets an LFO (spec: not a
      // GlobalLfoTargetId member, consistent with Compressor/Reverb having none).
      { field: 'threshold', schema: { id: 'limiter.threshold', type: 'sliderLinear', ...labels('fleet.limiter.ceiling'), min: -20, max: 0, orientation: 'horizontal', featured: true } },
    ],
  }),
];

// ========================================
// GLOBAL CHAIN-LEVEL RADIO (not nested inside any one effect block)
// ========================================

/**
 * A two-option radio, not a toggle — 'natural' rejoins the Reverb and Delay
 * returns at the Compressor's input (their echoes are compressed with the dry
 * sound, the default); 'controlled' rejoins them at the Limiter's input (their
 * echoes skip the Compressor). The drawer converts to/from
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
  /** The lane's first box, `audioRig.lfoBank.<lane>.p1`, wearing the lane's heading (docs/specs/CONTENT_LAYOUT.md
   *  §1.2, assumption 2): Shape | Rate. */
  p1: DirectionalPanelSchema;
  /** The second box, `.p2`, unlabeled: Rate Drift | Depth Drift, and the drift held-off note. */
  p2: DirectionalPanelSchema;
  /** Shape | Rate (over its Tempo Sync toggle), P1's row 1 — a nested 'responsive' row, side by side on desktop,
   *  stacked below (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.1). Unlabeled: the lane's heading is the only one. */
  topRow: DirectionalPanelSchema;
  /** Rate Drift | Depth Drift, P2's row 1 — the same nested 'responsive' row shape (§1.1). */
  driftRow: DirectionalPanelSchema;
  shape: RadioButtonSchema;
  rate: SliderLinearSchema;
  rateDrift: SliderCenteredZeroSchema;
  depthDrift: SliderCenteredZeroSchema;
}

function lfoBankLaneSchema(lane: LfoLaneId): LfoBankLaneSchema {
  return {
    p1: { id: `audioRig.lfoBank.${lane}.p1`, type: 'directionalPanel', ...labels(LFO_BANK_LANE_CONTENT[lane]), orientation: 'column' },
    p2: { id: `audioRig.lfoBank.${lane}.p2`, type: 'directionalPanel', orientation: 'column' },
    topRow: { id: `audioRig.lfoBank.${lane}.p1.r1`, type: 'directionalPanel', orientation: 'responsive' },
    driftRow: { id: `audioRig.lfoBank.${lane}.p2.r1`, type: 'directionalPanel', orientation: 'responsive' },
    shape: { id: `audioRig.lfoBank.${lane}.shape`, type: 'radio', ...labels('ui.lfo.shape'), options: options('ui.lfo.shape') },
    rate: {
      id: `audioRig.lfoBank.${lane}.rate`,
      type: 'sliderLinear',
      ...labels('ui.lfo.rate'),
      min: LFO_RATE_MIN,
      max: LFO_RATE_MAX,
      step: LFO_RATE_STEP,
      orientation: 'horizontal',
      featured: true, // docs/specs/CONTENT_LAYOUT.md §1.4
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
 * (docs/specs/archive/PING-VARIANCE-AUTOMATION.md), replacing the former
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
  min: 1, // was 0 — docs/specs/archive/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2: Intensity no longer doubles as an on/off gate (Frequency took over that role), so it can never reach 0
  max: 100,
  step: 1,
  orientation: 'horizontal',
};

/**
 * "x times per measure when above 1, every x measures (calculated) when
 * below 1" (docs/intent/archive/automation-frequency-duration-split.md). 0 reads as
 * "Off" (Frequency's on/off role, docs/specs/archive/AUTOMATION_FREQUENCY_DURATION_SPLIT.md
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
 * (docs/specs/archive/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3). A fixed set of allowed values
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
  featured: true, // docs/specs/CONTENT_LAYOUT.md §1.4
};

/**
 * "Duration" — total swell length in measures (rising + falling together),
 * replacing the former per-swell-randomized independent phase-length picks
 * (docs/specs/archive/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.4). A bare Rig-wide
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
 * "Tempo" — the Audio Rig's live BPM override (docs/specs/archive/BPM_CONTROL.md),
 * a bare Rig-wide meta-setting like PING_VARIANCE_AUTOMATION_SCHEMA above —
 * not a per-effect param, so it never joins AUDIO_RIG_CONFIG's own array.
 * No unit conversion at the drawer wiring point: audioStore.bpm is already
 * stored in the same BPM units this slider displays (unlike
 * pingVarianceAutomation's fraction-to-percent split). [20, 200] is
 * deliberately wider than the Attenuation Style seed range ([40, 100],
 * Classic's `bpm` row, src/data/bands/classic.ts) on both ends — freely draggable beyond anything an
 * Attenuation Style would ever seed, same "seed narrow, drag wide" convention
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
  featured: true, // docs/specs/CONTENT_LAYOUT.md §1.4
};

/**
 * "Humanize" — how far, in milliseconds, the fleet's notes may land off the grid
 * (docs/specs/ROBOT_PERFORMANCE.md §1.6). A bare Pacing meta-setting like BPM_SCHEMA above, never in
 * AUDIO_RIG_CONFIG's array. Stored in the display unit (audioStore.humanize is ms, no conversion); the bounds
 * come from the constants the store clamps with, and HUMANIZE_MAX_MS keeps MIN_LEAD − max offset at 80 ms.
 */
export const HUMANIZE_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.humanize',
  type: 'sliderLinear',
  ...labels('fleet.pacing.humanize'),
  min: HUMANIZE_MIN_MS,
  max: HUMANIZE_MAX_MS,
  step: 1,
  orientation: 'horizontal',
};

// ========================================
// AUDIO LOAD (docs/specs/archive/AUDIO_LOAD_BUDGET.md §4.5, shipped as two independent sliders 2026-09-22)
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
  ...labels('fleet.quality.preset'),
  options: options('fleet.quality.preset'),
};

/** The Robot Load fine dial (audible robots, polyphony, boot-time latency), 0–100 % — 100 % (Full) is today's behavior exactly. */
export const AUDIO_ROBOT_LOAD_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.robotLoad',
  type: 'sliderLinear',
  ...labels('fleet.quality.robotLoad'),
  min: 0,
  max: 100,
  step: 1,
  orientation: 'horizontal',
};

/** The Effects Load fine dial (drift, filter LFOs, robot-LFO count), 0–100 % — 100 % (Full) is today's behavior exactly. */
export const AUDIO_EFFECTS_LOAD_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.effectsLoad',
  type: 'sliderLinear',
  ...labels('fleet.quality.effectsLoad'),
  min: 0,
  max: 100,
  step: 1,
  orientation: 'horizontal',
};

/** Wraps AudioLoadPanel.tsx's own 2 nested rows (preset+readout, Robot Load+Effects Load) — fixed
 *  'column' so those 2 rows always stack as 2 separate rows, on every tier (Crawford's own
 *  correction: this was 'responsive' too, which on desktop made the OUTER panel itself a row,
 *  putting the 2 nested row-panels side-by-side as columns instead of stacked — each nested row's
 *  own 'responsive' orientation already handles splitting its own 2 items on desktop). The id is Settings' box on
 *  the sheet scheme (docs/specs/CONTENT_LAYOUT.md §1.2), `fleetParams.settings.p1`. */
export const AUDIO_LOAD_PANEL_SCHEMA: DirectionalPanelSchema = {
  id: 'fleetParams.settings.p1',
  type: 'directionalPanel',
  ...labels('fleet.quality.audioLoad'),
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
// See docs/specs/archive/AUDIO_RIG_RESPONSIVE_LAYOUT.md's "Separate facades"
// amendment.
