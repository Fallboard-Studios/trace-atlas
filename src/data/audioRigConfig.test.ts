// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

// Namespace import (not named) so the cleanup assertion below can check for the removed
// accordion exports without importing something that no longer exists.
import * as audioRigConfigModule from './audioRigConfig';
import {
  AUDIO_RIG_CONFIG,
  DECAY_MODE_SCHEMA,
  LFO_BANK_LANE_SCHEMAS,
  PING_VARIANCE_AUTOMATION_SCHEMA,
  SWELL_FREQUENCY_SCHEMA,
  SWELL_FREQUENCY_STEPS,
  SWELL_DURATION_SCHEMA,
  BPM_SCHEMA,
  HUMANIZE_SCHEMA,
  AUDIO_LOAD_PRESET_SCHEMA,
  AUDIO_ROBOT_LOAD_SCHEMA,
  AUDIO_EFFECTS_LOAD_SCHEMA,
  AUDIO_LOAD_PANEL_SCHEMA,
} from './audioRigConfig';
import { AUDIO_LOAD_PRESETS, HUMANIZE_MIN_MS, HUMANIZE_MAX_MS } from '../constants';
import { GLOBAL_LFO_TARGET_IDS } from '../types/lfo';
import { LFO_LANE_IDS, LFO_RATE_MIN, LFO_RATE_MAX } from '../types/lfo';
import { GLOBAL_AUDIO_SEED_RANGES, type GlobalAudioSeedFieldKey } from './globalAudioSeedRanges';
import { PEDAL_RATE_RANGE_HZ, PEDAL_RATE_STEP_HZ } from '../types/globalAudio';
import { CONTENT, labels, options } from '@/content';
import type { ControlSchema } from '@/types/controls';

// ========================================
// TESTS
// ========================================

// Effect key order matches the new V2 chain order (docs/reference/GLOBAL_CHAIN_GRID.md).
const EFFECT_KEYS = ['eq3', 'filterLPF', 'filterHPF', 'distortion', 'chebyshev', 'bitCrusher', 'autoWah', 'phaser', 'chorus', 'tremolo', 'vibrato', 'frequencyShifter', 'delay', 'reverb', 'compressor', 'stereoWidener', 'limiter'] as const;

function findBlock(key: (typeof EFFECT_KEYS)[number]) {
  const block = AUDIO_RIG_CONFIG.find((b) => b.key === key);
  if (!block) throw new Error(`no AUDIO_RIG_CONFIG block for "${key}"`);
  return block;
}

function findParam(key: (typeof EFFECT_KEYS)[number], field: string) {
  const param = findBlock(key).params.find((p) => p.field === field);
  if (!param) throw new Error(`no param "${field}" on block "${key}"`);
  return param;
}

describe('AUDIO_RIG_CONFIG', () => {
  it('has exactly one block per effect, in GLOBAL_CHAIN_GRID.md row order', () => {
    expect(AUDIO_RIG_CONFIG.map((b) => b.key)).toEqual([...EFFECT_KEYS]);
  });

  it('every block has its own panel schema — no separate accordion field (removed, DirectionalPanel wiring Task 2) or enabled toggle schema (removed; a slider-only off state)', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      expect(block.panel).toMatchObject({ id: `audioRig.${block.key}`, type: 'directionalPanel' });
      expect('accordion' in block).toBe(false);
      expect('enabledSchema' in block).toBe(false);
    }
  });

  it('every param schema id matches GlobalAudioSettings\' own field path — never the GlobalLfoTargetId short form', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      for (const param of block.params) {
        expect(param.schema.id).toBe(`${block.key}.${param.field}`);
      }
    }
  });

  describe('Compressor', () => {
    it('has all 5 params, matching GLOBAL_CHAIN_GRID.md exactly', () => {
      expect(findBlock('compressor').params.map((p) => p.field)).toEqual([
        'threshold', 'ratio', 'attack', 'release', 'knee',
      ]);
    });

    it('threshold is a linear slider, dB, -60 to 0', () => {
      expect(findParam('compressor', 'threshold').schema).toMatchObject({
        type: 'sliderLinear', loreLabel: 'Bundle Threshold', min: -60, max: 0, unit: 'dB',
      });
    });

    it('ratio is a sliderLinear, step 1, 1 to 20 (STEPPER_TO_SLIDER Task 8)', () => {
      expect(findParam('compressor', 'ratio').schema).toMatchObject({
        type: 'sliderLinear', loreLabel: 'Bundle Ratio', min: 1, max: 20, step: 1,
      });
    });

    it('attack is a log slider, seconds, 0.001 to 0.2', () => {
      expect(findParam('compressor', 'attack').schema).toMatchObject({
        type: 'sliderLog', loreLabel: 'Bundle Onset', min: 0.001, max: 0.2, unit: 's',
      });
    });

    it('release is a log slider, seconds, 0.01 to 1', () => {
      expect(findParam('compressor', 'release').schema).toMatchObject({
        type: 'sliderLog', loreLabel: 'Bundle Recovery', min: 0.01, max: 1, unit: 's',
      });
    });

    it('knee is a linear slider, dB, 0 to 40', () => {
      expect(findParam('compressor', 'knee').schema).toMatchObject({
        type: 'sliderLinear', loreLabel: 'Bundle Curve', min: 0, max: 40, unit: 'dB',
      });
    });

    it('has no LFO-flagged params — GLOBAL_CHAIN_GRID.md marks every compressor row "–"', () => {
      for (const param of findBlock('compressor').params) {
        expect(param.lfoTarget).toBeUndefined();
      }
    });
  });

  describe('3-Band EQ', () => {
    it('has all 3 bands as center-zero sliders, dB, -12 to 12, step 0.5', () => {
      for (const field of ['low', 'mid', 'high']) {
        expect(findParam('eq3', field).schema).toMatchObject({
          type: 'sliderCenteredZero', min: -12, max: 12, step: 0.5, unit: 'dB',
        });
      }
    });

    it('has the band lore labels, trimmed from the grid\'s own copy ("DENSITY" dropped)', () => {
      // GLOBAL_CHAIN_GRID.md still literally reads "SUB-BAND DENSITY" etc. — deliberately
      // shortened here during the DirectionalPanel layout pass, not a drift from the grid.
      expect(findParam('eq3', 'low').schema.loreLabel).toBe(CONTENT['fleet.eq.bass'].lore);
      expect(findParam('eq3', 'mid').schema.loreLabel).toBe(CONTENT['fleet.eq.mid'].lore);
      expect(findParam('eq3', 'high').schema.loreLabel).toBe(CONTENT['fleet.eq.treble'].lore);
    });

    it('all 3 bands are LFO-flagged, mapping to their eq3.* GlobalLfoTargetId', () => {
      expect(findParam('eq3', 'low').lfoTarget).toBe('eq3.low');
      expect(findParam('eq3', 'mid').lfoTarget).toBe('eq3.mid');
      expect(findParam('eq3', 'high').lfoTarget).toBe('eq3.high');
    });
  });

  describe('Low-Pass Filter', () => {
    it('frequency is a log slider, Hz, 20 to 20000, LFO-flagged as lpf.frequency', () => {
      const param = findParam('filterLPF', 'frequency');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: CONTENT['fleet.lpf.cutoff'].lore, min: 20, max: 20000, unit: 'Hz' });
      expect(param.lfoTarget).toBe('lpf.frequency');
    });

    it('Q is a log slider, 0.1 to 20, LFO-flagged as lpf.Q', () => {
      const param = findParam('filterLPF', 'Q');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: CONTENT['fleet.lpf.resonance'].lore, min: 0.1, max: 20 });
      expect(param.lfoTarget).toBe('lpf.Q');
    });
  });

  describe('High-Pass Filter', () => {
    it('frequency is a log slider, Hz, 20 to 20000, LFO-flagged as hpf.frequency', () => {
      const param = findParam('filterHPF', 'frequency');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: CONTENT['fleet.hpf.cutoff'].lore, min: 20, max: 20000, unit: 'Hz' });
      expect(param.lfoTarget).toBe('hpf.frequency');
    });

    it('Q is a log slider, 0.1 to 20, LFO-flagged as hpf.Q', () => {
      const param = findParam('filterHPF', 'Q');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: CONTENT['fleet.hpf.resonance'].lore, min: 0.1, max: 20 });
      expect(param.lfoTarget).toBe('hpf.Q');
    });
  });

  describe('Delay', () => {
    it('has all 3 params, matching GLOBAL_CHAIN_GRID.md exactly', () => {
      expect(findBlock('delay').params.map((p) => p.field)).toEqual(['delayTime', 'feedback', 'wet']);
    });

    it('every sliderLinear param carries an explicit fine-grained step — bug repro: a full range <= 1 with no explicit step defaults to step=1 in SliderLinear, collapsing the whole slider into just min/max (reported: "acting as a toggle")', () => {
      for (const field of ['delayTime', 'feedback', 'wet']) {
        const schema = findParam('delay', field).schema as { step?: number; min: number; max: number };
        expect(schema.step, `delay.${field}.step`).toBeDefined();
        expect(schema.step!, `delay.${field}.step should be well under its own range`).toBeLessThan(schema.max - schema.min);
      }
    });

    it('delayTime is a linear slider, seconds, 0 to 10, step 0.001, not LFO-flagged — LFO removed from Delay\'s delayTime', () => {
      const param = findParam('delay', 'delayTime');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: CONTENT['fleet.delay.time'].lore, min: 0, max: 10, step: 0.001, unit: 's' });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('feedback is a linear slider, 0 to 0.95, not LFO-flagged', () => {
      const param = findParam('delay', 'feedback');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: CONTENT['fleet.delay.repeats'].lore, min: 0, max: 0.95 });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('wet is a linear slider, 0 to 1, not LFO-flagged', () => {
      const param = findParam('delay', 'wet');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: CONTENT['fleet.delay.amount'].lore, min: 0, max: 1 });
      expect(param.lfoTarget).toBeUndefined();
    });
  });

  describe('Reverb', () => {
    it('has all 3 params, matching GLOBAL_CHAIN_GRID.md exactly — no dampening (dead, Tone.Reverb has no such property)', () => {
      expect(findBlock('reverb').params.map((p) => p.field)).toEqual(['decay', 'preDelay', 'wet']);
    });

    it('decay is a log slider, seconds, 0.1 to 10, not LFO-flagged', () => {
      const param = findParam('reverb', 'decay');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: CONTENT['fleet.reverb.length'].lore, min: 0.1, max: 10, unit: 's' });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('preDelay is a linear slider, seconds, 0 to 0.25 (Classic Band Retune row 14), not LFO-flagged', () => {
      const param = findParam('reverb', 'preDelay');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: CONTENT['fleet.reverb.preDelay'].lore, min: 0, max: 0.25, unit: 's' });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('wet is a linear slider, 0 to 1, not LFO-flagged', () => {
      const param = findParam('reverb', 'wet');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: CONTENT['fleet.reverb.amount'].lore, min: 0, max: 1 });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('preDelay and wet (both sliderLinear, full range <= 1) carry an explicit fine-grained step — same toggle-collapse bug as Delay\'s params', () => {
      for (const field of ['preDelay', 'wet']) {
        const schema = findParam('reverb', field).schema as { step?: number; min: number; max: number };
        expect(schema.step, `reverb.${field}.step`).toBeDefined();
        expect(schema.step!, `reverb.${field}.step should be well under its own range`).toBeLessThan(schema.max - schema.min);
      }
    });
  });

  // Global Colour (docs/specs/GLOBAL_COLOUR.md §1.4, docs/tasks/GLOBAL_COLOUR.md Task 8): three effect
  // blocks on the dry chain, two sliders each. None is LFO-able or swellable (spec Non-goals).
  describe('Colour blocks (Distortion, Chebyshev, Bit Crusher)', () => {
    const COLOUR_BLOCKS = [
      { key: 'distortion', fields: ['amount', 'wet'], heading: 'fleet.distortion' },
      { key: 'chebyshev', fields: ['order', 'wet'], heading: 'fleet.chebyshev' },
      { key: 'bitCrusher', fields: ['bits', 'wet'], heading: 'fleet.bitCrusher' },
    ] as const;

    it.each(COLOUR_BLOCKS)('$key has exactly two params, in order: $fields', ({ key, fields }) => {
      expect(findBlock(key).params.map((p) => p.field)).toEqual([...fields]);
    });

    it.each(COLOUR_BLOCKS)('$key panel reads its heading from $heading', ({ key, heading }) => {
      expect(findBlock(key).panel.loreLabel).toBe(CONTENT[heading].heading);
      expect(findBlock(key).panel.humanLabel).toBe(CONTENT[heading].human);
    });

    it('Drive is a linear slider, 0 to 1, step 0.01, with no unit', () => {
      const schema = findParam('distortion', 'amount').schema;
      expect(schema).toMatchObject({ type: 'sliderLinear', min: 0, max: 1, step: 0.01, loreLabel: CONTENT['fleet.distortion.drive'].lore });
      expect(schema.humanLabel).toBe(CONTENT['fleet.distortion.drive'].human);
      expect((schema as { unit?: string }).unit).toBeUndefined();
    });

    it('Harmonics is a whole-number linear slider, 1 to 8, step 1', () => {
      expect(findParam('chebyshev', 'order').schema).toMatchObject({ type: 'sliderLinear', min: 1, max: 8, step: 1, loreLabel: CONTENT['fleet.chebyshev.harmonics'].lore });
    });

    it('Bit Depth is a whole-number linear slider, 1 to 16, step 1, in bits', () => {
      expect(findParam('bitCrusher', 'bits').schema).toMatchObject({ type: 'sliderLinear', min: 1, max: 16, step: 1, unit: CONTENT['fleet.bitCrusher.bits'].unit, loreLabel: CONTENT['fleet.bitCrusher.bits'].lore });
    });

    it.each(['distortion', 'chebyshev', 'bitCrusher'] as const)('%s Mix is a linear slider, 0 to 1, step 0.01, read from its own content entry', (key) => {
      expect(findParam(key, 'wet').schema).toMatchObject({ type: 'sliderLinear', min: 0, max: 1, step: 0.01, loreLabel: CONTENT[`fleet.${key}.mix`].lore });
    });

    it('every colour slider is horizontal and carries an explicit step well under its range (the toggle-collapse regression the Delay params guard)', () => {
      for (const { key } of COLOUR_BLOCKS) {
        for (const param of findBlock(key).params) {
          const schema = param.schema as { step?: number; min: number; max: number; orientation?: string };
          expect(schema.orientation, `${key}.${param.field}`).toBe('horizontal');
          expect(schema.step, `${key}.${param.field}.step`).toBeDefined();
          expect(schema.step!, `${key}.${param.field}.step`).toBeLessThan(schema.max - schema.min);
        }
      }
    });

    it('no colour param is LFO-flagged — colour is not a GlobalLfoTargetId', () => {
      for (const { key } of COLOUR_BLOCKS) {
        for (const param of findBlock(key).params) expect(param.lfoTarget, `${key}.${param.field}`).toBeUndefined();
      }
    });

    it('every colour slider spans exactly its field\'s full seed range, so the UI can never reach a value the engine clamps away', () => {
      for (const { key } of COLOUR_BLOCKS) {
        for (const param of findBlock(key).params) {
          const range = GLOBAL_AUDIO_SEED_RANGES[`${key}.${param.field}` as GlobalAudioSeedFieldKey];
          const schema = param.schema as { min: number; max: number; step?: number };
          expect(schema, `${key}.${param.field}`).toMatchObject({ min: range.min, max: range.max, step: range.step });
        }
      }
    });
  });

  // Global Modulation (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.6, assumption 5; docs/tasks/GLOBAL_MODULATION_COLOUR.md
  // Task 9): two dry-chain pedals between Bit Crusher and the rooms. Every parameter of each Tone node is a
  // slider; none is LFO-able or swellable.
  describe('Modulation blocks (AutoWah, Phaser)', () => {
    const MODULATION_BLOCKS = [
      { key: 'autoWah', fields: ['baseFrequency', 'octaves', 'sensitivity', 'Q', 'gain', 'follower', 'wet'], heading: 'fleet.autoWah' },
      { key: 'phaser', fields: ['rate', 'octaves', 'baseFrequency', 'stages', 'Q', 'wet'], heading: 'fleet.phaser' },
    ] as const;

    /** The content key a field reads: the field name with `Q` lower-cased and `wet` called Mix. */
    const contentKeyOf = (block: 'autoWah' | 'phaser', field: string): `fleet.${string}` =>
      `fleet.${block}.${field === 'wet' ? 'mix' : field === 'Q' ? 'q' : field}`;

    it('there are seventeen blocks, and AutoWah then Phaser sit straight after Bit Crusher, ahead of the four Global Pedals and Delay', () => {
      const keys = AUDIO_RIG_CONFIG.map((b) => b.key as string);
      expect(keys).toHaveLength(17);
      expect(keys.slice(keys.indexOf('bitCrusher'), keys.indexOf('delay'))).toEqual(
        ['bitCrusher', 'autoWah', 'phaser', 'chorus', 'tremolo', 'vibrato', 'frequencyShifter'],
      );
    });

    it.each(MODULATION_BLOCKS)('$key has its params in order: $fields', ({ key, fields }) => {
      expect(findBlock(key).params.map((p) => p.field)).toEqual([...fields]);
    });

    it('the two pedals carry thirteen params between them', () => {
      expect(findBlock('autoWah').params.length + findBlock('phaser').params.length).toBe(13);
    });

    it.each(MODULATION_BLOCKS)('$key panel reads its heading from $heading', ({ key, heading }) => {
      expect(findBlock(key).panel.loreLabel).toBe(CONTENT[heading].heading);
      expect(findBlock(key).panel.humanLabel).toBe(CONTENT[heading].human);
    });

    it('every pedal slider spans exactly its field\'s full seed range, as the kind the range says (log fields log, the rest linear with the seed step)', () => {
      for (const { key } of MODULATION_BLOCKS) {
        for (const param of findBlock(key).params) {
          const range = GLOBAL_AUDIO_SEED_RANGES[`${key}.${param.field}` as GlobalAudioSeedFieldKey];
          const schema = param.schema as { type: string; min: number; max: number; step?: number };
          const where = `${key}.${param.field}`;
          expect(schema.type, where).toBe(range.scale === 'log' ? 'sliderLog' : 'sliderLinear');
          expect(schema.min, where).toBe(range.min);
          expect(schema.max, where).toBe(range.max);
          if (range.scale === 'linear') expect(schema.step, where).toBe(range.step);
        }
      }
    });

    it('every pedal param reads its label, lore and unit from its own content entry', () => {
      for (const { key, fields } of MODULATION_BLOCKS) {
        for (const field of fields) {
          const contentKey = contentKeyOf(key, field) as Parameters<typeof labels>[0];
          const schema = findParam(key, field).schema as { humanLabel: string; loreLabel?: string; unit?: string };
          const expected = labels(contentKey);
          expect(schema.humanLabel, `${key}.${field}`).toBe(expected.humanLabel);
          expect(schema.loreLabel, `${key}.${field}`).toBe(expected.loreLabel);
          expect(schema.unit, `${key}.${field}`).toBe(expected.unit);
        }
      }
    });

    it('the Phaser Rate is a linear slider over PEDAL_RATE_RANGE_HZ at PEDAL_RATE_STEP_HZ, the shape TempoSyncSlider takes', () => {
      expect(findParam('phaser', 'rate').schema).toMatchObject({
        type: 'sliderLinear', min: PEDAL_RATE_RANGE_HZ.min, max: PEDAL_RATE_RANGE_HZ.max, step: PEDAL_RATE_STEP_HZ,
      });
    });

    it('Stages is a whole-number slider from 1 to 12', () => {
      expect(findParam('phaser', 'stages').schema).toMatchObject({ type: 'sliderLinear', min: 1, max: 12, step: 1 });
    });

    it('the logarithmic sliders are Base Frequency, Q and Follow, and nothing else', () => {
      const logs = MODULATION_BLOCKS.flatMap(({ key }) =>
        findBlock(key).params.filter((p) => p.schema.type === 'sliderLog').map((p) => `${key}.${p.field}`));
      expect(logs.sort()).toEqual(['autoWah.Q', 'autoWah.baseFrequency', 'autoWah.follower', 'phaser.Q', 'phaser.baseFrequency']);
    });

    it('every pedal slider is horizontal, and every linear one carries a step well under its range (the toggle-collapse regression the Delay params guard)', () => {
      for (const { key } of MODULATION_BLOCKS) {
        for (const param of findBlock(key).params) {
          const schema = param.schema as { type: string; step?: number; min: number; max: number; orientation?: string };
          expect(schema.orientation, `${key}.${param.field}`).toBe('horizontal');
          if (schema.type === 'sliderLinear') {
            expect(schema.step, `${key}.${param.field}.step`).toBeDefined();
            expect(schema.step!, `${key}.${param.field}.step`).toBeLessThan(schema.max - schema.min);
          }
        }
      }
    });

    it('no pedal param is LFO-flagged — neither pedal is a GlobalLfoTargetId', () => {
      for (const { key } of MODULATION_BLOCKS) {
        for (const param of findBlock(key).params) expect(param.lfoTarget, `${key}.${param.field}`).toBeUndefined();
      }
    });

    it('every schema id in the rig config is unique, the thirteen new ones included', () => {
      const ids = AUDIO_RIG_CONFIG.flatMap((b) => [b.panel.id, ...b.params.map((p) => p.schema.id)]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain('autoWah.baseFrequency');
      expect(ids).toContain('phaser.stages');
    });
  });

  describe('Limiter', () => {
    it('has exactly one param, threshold', () => {
      expect(findBlock('limiter').params.map((p) => p.field)).toEqual(['threshold']);
    });

    it('threshold is a linear slider, dB, -20 to 0, not LFO-flagged — Limiter never gets an LFO', () => {
      const param = findParam('limiter', 'threshold');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: CONTENT['fleet.limiter.ceiling'].lore, min: -20, max: 0, unit: 'dB' });
      expect(param.lfoTarget).toBeUndefined();
    });
  });

  // Global Pedals (docs/specs/GLOBAL_PEDALS.md §1.6, assumption 5; docs/tasks/GLOBAL_PEDALS.md Task 10): four
  // motion pedals after the Phaser and the Width stage between the Compressor and the Limiter. V2 removed a
  // Chorus block ("not correct for this music"); this one is a dry-chain pedal at Mix 0 by default, not V2's.
  describe('Global Pedals blocks (Chorus, Tremolo, Vibrato, Shifter, Width)', () => {
    const PEDAL_BLOCKS = [
      { key: 'chorus', fields: ['rate', 'delayTime', 'depth', 'spread', 'feedback', 'wet'], heading: 'fleet.chorus' },
      { key: 'tremolo', fields: ['rate', 'depth', 'spread', 'wet'], heading: 'fleet.tremolo' },
      { key: 'vibrato', fields: ['rate', 'depth', 'wet'], heading: 'fleet.vibrato' },
      { key: 'frequencyShifter', fields: ['shift', 'wet'], heading: 'fleet.frequencyShifter' },
      { key: 'stereoWidener', fields: ['width'], heading: 'fleet.stereoWidener' },
    ] as const;
    type PedalKey = (typeof PEDAL_BLOCKS)[number]['key'];

    /** The content key a field reads: `wet` is Mix and the Chorus's `delayTime` is its Delay. */
    const contentKeyOf = (block: PedalKey, field: string) =>
      `fleet.${block}.${field === 'wet' ? 'mix' : field === 'delayTime' ? 'delay' : field}` as Parameters<typeof labels>[0];

    const pedalParams = () => PEDAL_BLOCKS.flatMap(({ key }) => findBlock(key).params.map((param) => ({ key, param })));

    it('the four motion pedals follow the Phaser in chain order, and Width sits between the Compressor and the Limiter', () => {
      const keys = AUDIO_RIG_CONFIG.map((b) => b.key as string);
      expect(keys.slice(keys.indexOf('phaser'), keys.indexOf('delay') + 1)).toEqual(
        ['phaser', 'chorus', 'tremolo', 'vibrato', 'frequencyShifter', 'delay'],
      );
      expect(keys.slice(keys.indexOf('compressor'))).toEqual(['compressor', 'stereoWidener', 'limiter']);
    });

    it.each(PEDAL_BLOCKS)('$key has its params in order: $fields', ({ key, fields }) => {
      expect(findBlock(key).params.map((p) => p.field)).toEqual([...fields]);
    });

    it('the five blocks carry sixteen params between them, twenty-nine with the AutoWah and Phaser', () => {
      expect(pedalParams()).toHaveLength(16);
      const withModulation = pedalParams().length + findBlock('autoWah').params.length + findBlock('phaser').params.length;
      expect(withModulation).toBe(29);
    });

    it.each(PEDAL_BLOCKS)('$key panel reads its heading from $heading, in a column', ({ key, heading }) => {
      expect(findBlock(key).panel).toMatchObject({
        id: `audioRig.${key}`, type: 'directionalPanel', orientation: 'column',
        loreLabel: CONTENT[heading].heading, humanLabel: CONTENT[heading].human,
      });
    });

    it('every pedal slider spans exactly its field\'s full seed range at the seed step', () => {
      for (const { key, param } of pedalParams()) {
        const range = GLOBAL_AUDIO_SEED_RANGES[`${key}.${param.field}` as GlobalAudioSeedFieldKey];
        const where = `${key}.${param.field}`;
        expect(range, where).toBeDefined();
        const schema = param.schema as { min: number; max: number; step?: number };
        expect(schema.min, where).toBe(range.min);
        expect(schema.max, where).toBe(range.max);
        expect(schema.step, where).toBe(range.step);
      }
    });

    it('Shift is the only centred-zero slider, symmetric about 0; every other pedal slider is linear (none is log)', () => {
      for (const { key, param } of pedalParams()) {
        const where = `${key}.${param.field}`;
        expect(param.schema.type, where).toBe(where === 'frequencyShifter.shift' ? 'sliderCenteredZero' : 'sliderLinear');
      }
      const shift = findParam('frequencyShifter', 'shift').schema as { min: number; max: number };
      expect(shift.min).toBe(-shift.max);
      expect(shift.max).toBeGreaterThan(0);
    });

    // Branch review item 7: the seeded +-2-20 Hz band was under 2 % of a linear +-1000 Hz track.
    it('Shift runs on a signed-log track with its knee at 1 Hz, and no other pedal slider does', () => {
      for (const { key, param } of pedalParams()) {
        const knee = (param.schema as { logKnee?: number }).logKnee;
        expect(knee, `${key}.${param.field}`).toBe(`${key}.${param.field}` === 'frequencyShifter.shift' ? 1 : undefined);
      }
    });

    it.each(['chorus', 'tremolo', 'vibrato'] as const)(
      'the %s Rate is a linear slider over PEDAL_RATE_RANGE_HZ at PEDAL_RATE_STEP_HZ, the shape TempoSyncSlider takes',
      (key) => {
        expect(findParam(key, 'rate').schema).toMatchObject({
          type: 'sliderLinear', min: PEDAL_RATE_RANGE_HZ.min, max: PEDAL_RATE_RANGE_HZ.max, step: PEDAL_RATE_STEP_HZ,
        });
      },
    );

    it('every pedal param reads its label, lore and unit from its own content entry', () => {
      for (const { key, fields } of PEDAL_BLOCKS) {
        for (const field of fields) {
          const schema = findParam(key, field).schema as { humanLabel: string; loreLabel?: string; unit?: string };
          const expected = labels(contentKeyOf(key, field));
          expect(schema.humanLabel, `${key}.${field}`).toBe(expected.humanLabel);
          expect(schema.loreLabel, `${key}.${field}`).toBe(expected.loreLabel);
          expect(schema.unit, `${key}.${field}`).toBe(expected.unit);
        }
      }
    });

    it('every pedal slider is horizontal, and every one carries a step well under its range (the toggle-collapse regression the Delay params guard)', () => {
      for (const { key, param } of pedalParams()) {
        const schema = param.schema as { step?: number; min: number; max: number; orientation?: string };
        expect(schema.orientation, `${key}.${param.field}`).toBe('horizontal');
        expect(schema.step, `${key}.${param.field}.step`).toBeDefined();
        expect(schema.step!, `${key}.${param.field}.step`).toBeLessThan((schema.max - schema.min) / 10);
      }
    });

    it('no pedal param is LFO-flagged — none of the five is a GlobalLfoTargetId', () => {
      for (const { key, param } of pedalParams()) expect(param.lfoTarget, `${key}.${param.field}`).toBeUndefined();
    });

    it('every schema id in the rig config is still unique, the sixteen new ones included', () => {
      const ids = AUDIO_RIG_CONFIG.flatMap((b) => [b.panel.id, ...b.params.map((p) => p.schema.id)]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const { key, param } of pedalParams()) expect(ids).toContain(`${key}.${param.field}`);
    });
  });

  it('flags exactly the 7 GlobalLfoTargetId params — no more, no fewer', () => {
    const lfoTargets = AUDIO_RIG_CONFIG.flatMap((b) => b.params.map((p) => p.lfoTarget).filter(Boolean));
    expect([...lfoTargets].sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(AUDIO_RIG_CONFIG)).not.toThrow();
  });
});

describe('DECAY_MODE_SCHEMA', () => {
  it('is a radio schema bound to compressorBeforeDelay', () => {
    expect(DECAY_MODE_SCHEMA.id).toBe('audioRig.compressorBeforeDelay');
    expect(DECAY_MODE_SCHEMA.type).toBe('radio');
  });

  it('has exactly two options — Natural Decay and Controlled Decay, in that order, each with its own lore label', () => {
    expect(DECAY_MODE_SCHEMA.options).toEqual([
      { value: 'natural', humanLabel: 'Natural Decay', loreLabel: 'Dissipation' },
      { value: 'controlled', humanLabel: 'Controlled Decay', loreLabel: 'Clamped' },
    ]);
  });
});

describe('LFO_BANK_LANE_SCHEMAS (docs/specs/LFO_BANK.md Task 15)', () => {
  it('has exactly one entry per LfoLaneId', () => {
    expect(Object.keys(LFO_BANK_LANE_SCHEMAS).sort()).toEqual([...LFO_LANE_IDS].sort());
  });

  it("every lane's panel is a directionalPanel with a unique id, labeled from its own fleet.lfoBank.lane<X> content entry", () => {
    const laneContent = { a: 'fleet.lfoBank.laneA', b: 'fleet.lfoBank.laneB', c: 'fleet.lfoBank.laneC', d: 'fleet.lfoBank.laneD' } as const;
    for (const lane of LFO_LANE_IDS) {
      const schema = LFO_BANK_LANE_SCHEMAS[lane];
      expect(schema.panel, lane).toMatchObject({ type: 'directionalPanel' });
      expect(schema.panel.humanLabel, lane).toBe(CONTENT[laneContent[lane]].human);
      expect(schema.panel.loreLabel, lane).toBe(CONTENT[laneContent[lane]].lore);
    }
  });

  it("every lane's shape control is a radio bound to ui.lfo.shape's 4 options", () => {
    for (const lane of LFO_LANE_IDS) {
      const schema = LFO_BANK_LANE_SCHEMAS[lane];
      expect(schema.shape.type, lane).toBe('radio');
      expect(schema.shape.humanLabel, lane).toBe(CONTENT['ui.lfo.shape'].human);
      expect(schema.shape.options, lane).toEqual(options('ui.lfo.shape'));
    }
  });

  it("every lane's rate control is a linear slider spanning LFO_RATE_MIN..LFO_RATE_MAX, step 0.05, labeled from ui.lfo.rate", () => {
    for (const lane of LFO_LANE_IDS) {
      const schema = LFO_BANK_LANE_SCHEMAS[lane];
      expect(schema.rate, lane).toMatchObject({
        type: 'sliderLinear', min: LFO_RATE_MIN, max: LFO_RATE_MAX, step: 0.05, orientation: 'horizontal',
      });
      expect(schema.rate.humanLabel, lane).toBe(CONTENT['ui.lfo.rate'].human);
      expect(schema.rate.unit, lane).toBe(CONTENT['ui.lfo.rate'].unit);
    }
  });

  it("every lane's rateDrift/depthDrift are centered-zero sliders, -100 to 100, percent, labeled from fleet.lfoBank.rateDrift/.depthDrift", () => {
    for (const lane of LFO_LANE_IDS) {
      const schema = LFO_BANK_LANE_SCHEMAS[lane];
      expect(schema.rateDrift, lane).toMatchObject({ type: 'sliderCenteredZero', min: -100, max: 100, unit: '%', orientation: 'horizontal' });
      expect(schema.depthDrift, lane).toMatchObject({ type: 'sliderCenteredZero', min: -100, max: 100, unit: '%', orientation: 'horizontal' });
      expect(schema.rateDrift.humanLabel, lane).toBe(CONTENT['fleet.lfoBank.rateDrift'].human);
      expect(schema.depthDrift.humanLabel, lane).toBe(CONTENT['fleet.lfoBank.depthDrift'].human);
    }
  });

  // docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.1: Shape | Rate (over its Tempo Sync toggle) share a
  // top row, Rate Drift | Depth Drift share a drift row — each a nested 'responsive' panel (side by side
  // on desktop, stacked below), unlabeled, so the lane panel's own label is the only heading.
  it("every lane's topRow and driftRow are unlabeled 'responsive' directionalPanels under the lane's own id", () => {
    for (const lane of LFO_LANE_IDS) {
      const schema = LFO_BANK_LANE_SCHEMAS[lane];
      expect(schema.topRow, `${lane}.topRow`).toEqual({ id: `audioRig.lfoBank.${lane}.topRow`, type: 'directionalPanel', orientation: 'responsive' });
      expect(schema.driftRow, `${lane}.driftRow`).toEqual({ id: `audioRig.lfoBank.${lane}.driftRow`, type: 'directionalPanel', orientation: 'responsive' });
      expect('humanLabel' in schema.topRow, `${lane}.topRow label`).toBe(false);
      expect('loreLabel' in schema.driftRow, `${lane}.driftRow label`).toBe(false);
    }
  });

  it("the row panels are never 'auto' (per-parent measuring) or a fixed 'row' — only the shared viewport tier decides", () => {
    for (const lane of LFO_LANE_IDS) {
      const schema = LFO_BANK_LANE_SCHEMAS[lane];
      expect(['auto', 'row', 'column']).not.toContain(schema.topRow.orientation);
      expect(['auto', 'row', 'column']).not.toContain(schema.driftRow.orientation);
    }
  });

  it('every id across all 4 lanes (7 schemas each: panel, shape, rate, rateDrift, depthDrift, topRow, driftRow) is unique', () => {
    const allIds = LFO_LANE_IDS.flatMap((lane) => {
      const schema = LFO_BANK_LANE_SCHEMAS[lane];
      return [schema.panel.id, schema.shape.id, schema.rate.id, schema.rateDrift.id, schema.depthDrift.id, schema.topRow.id, schema.driftRow.id];
    });
    expect(allIds).toHaveLength(28);
    expect(new Set(allIds).size).toBe(28);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(LFO_BANK_LANE_SCHEMAS)).not.toThrow();
  });
});

describe('PING_VARIANCE_AUTOMATION_SCHEMA', () => {
  it('is a linear slider, 1-100%, id audioRig.pingVarianceAutomation (min raised from 0 — docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2, Intensity no longer doubles as an on/off gate)', () => {
    expect(PING_VARIANCE_AUTOMATION_SCHEMA).toMatchObject({
      id: 'audioRig.pingVarianceAutomation',
      type: 'sliderLinear',
      min: 1,
      max: 100,
      unit: '%',
    });
  });

  it('carries the confirmed lore label and human label', () => {
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.loreLabel).toBe(CONTENT['fleet.pacing.automationRange'].lore);
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.humanLabel).toBe(CONTENT['fleet.pacing.automationRange'].human);
  });

  it('carries an explicit fine-grained step, same regression guard as every other sliderLinear schema in this file', () => {
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.step).toBeDefined();
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.step!).toBeLessThan(PING_VARIANCE_AUTOMATION_SCHEMA.max - PING_VARIANCE_AUTOMATION_SCHEMA.min);
  });

  it('is not part of AUDIO_RIG_CONFIG\'s per-effect array — it is a bare, Rig-wide meta-setting, not an effect param', () => {
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [
      b.panel.id,
      ...b.params.map((p) => p.schema.id),
    ]);
    expect(allConfigSchemaIds).not.toContain(PING_VARIANCE_AUTOMATION_SCHEMA.id);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(PING_VARIANCE_AUTOMATION_SCHEMA)).not.toThrow();
  });
});

describe('SWELL_FREQUENCY_SCHEMA (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3, §1.6)', () => {
  it('is a sliderLog, id audioRig.swellFrequency, with a fixed 0-16 step grid (Crawford\'s own request) rather than a continuous range', () => {
    expect(SWELL_FREQUENCY_SCHEMA).toMatchObject({
      id: 'audioRig.swellFrequency',
      type: 'sliderLog',
      min: 0,
      max: 16,
    });
    expect(SWELL_FREQUENCY_SCHEMA.steps).toEqual(SWELL_FREQUENCY_STEPS);
    expect(SWELL_FREQUENCY_SCHEMA.steps![0]).toBe(SWELL_FREQUENCY_SCHEMA.min);
    expect(SWELL_FREQUENCY_SCHEMA.steps![SWELL_FREQUENCY_SCHEMA.steps!.length - 1]).toBe(SWELL_FREQUENCY_SCHEMA.max);
  });

  it('SWELL_FREQUENCY_STEPS has exactly the 14 values Crawford specified, in ascending order', () => {
    expect(SWELL_FREQUENCY_STEPS).toEqual([
      0,
      1 / 16, 1 / 12, 1 / 8, 1 / 4, 1 / 3, 1 / 2,
      1, 2, 3, 4, 8, 12, 16,
    ]);
    expect([...SWELL_FREQUENCY_STEPS].sort((a, b) => a - b)).toEqual(SWELL_FREQUENCY_STEPS);
  });

  it('is not part of AUDIO_RIG_CONFIG\'s per-effect array — a bare, Rig-wide meta-setting', () => {
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [
      b.panel.id,
      ...b.params.map((p) => p.schema.id),
    ]);
    expect(allConfigSchemaIds).not.toContain(SWELL_FREQUENCY_SCHEMA.id);
  });

  it('supplies a formatValue function (the only sliderLog schema in this file that does)', () => {
    expect(typeof SWELL_FREQUENCY_SCHEMA.formatValue).toBe('function');
  });

  describe('formatValue (formatSwellFrequency)', () => {
    it('reads "Off" at exactly 0 — Frequency\'s on/off value', () => {
      expect(SWELL_FREQUENCY_SCHEMA.formatValue!(0)).toBe('Off');
    });

    it('reads as "N/measure" at or above 1', () => {
      expect(SWELL_FREQUENCY_SCHEMA.formatValue!(4)).toBe('4/measure');
    });

    it('reads as "N/measure" exactly at the 1 boundary', () => {
      expect(SWELL_FREQUENCY_SCHEMA.formatValue!(1)).toBe('1/measure');
    });

    it('reads as "every N measures" below 1, using the reciprocal', () => {
      expect(SWELL_FREQUENCY_SCHEMA.formatValue!(0.25)).toBe('every 4 measures');
    });

    it('caps the reciprocal at 3 decimal places, same as every other displayed value in this app', () => {
      expect(SWELL_FREQUENCY_SCHEMA.formatValue!(0.3)).toBe('every 3.333 measures');
    });
  });
});

describe('SWELL_DURATION_SCHEMA (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.4)', () => {
  it('is a linear slider, 1-24 measures, id audioRig.swellDuration', () => {
    expect(SWELL_DURATION_SCHEMA).toMatchObject({
      id: 'audioRig.swellDuration',
      type: 'sliderLinear',
      min: 1,
      max: 24,
      step: 1,
    });
  });

  it('is not part of AUDIO_RIG_CONFIG\'s per-effect array — a bare, Rig-wide meta-setting', () => {
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [
      b.panel.id,
      ...b.params.map((p) => p.schema.id),
    ]);
    expect(allConfigSchemaIds).not.toContain(SWELL_DURATION_SCHEMA.id);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(SWELL_DURATION_SCHEMA)).not.toThrow();
  });
});

describe('BPM_SCHEMA (docs/specs/BPM_CONTROL.md §1.4-§1.5)', () => {
  it('is a linear slider, 20-200 BPM, id audioRig.bpm', () => {
    expect(BPM_SCHEMA).toMatchObject({
      id: 'audioRig.bpm',
      type: 'sliderLinear',
      min: 20,
      max: 200,
      step: 1,
      unit: 'BPM',
    });
  });

  it('carries the confirmed lore label and human label', () => {
    expect(BPM_SCHEMA.loreLabel).toBe(CONTENT['fleet.pacing.tempo'].lore);
    expect(BPM_SCHEMA.humanLabel).toBe(CONTENT['fleet.pacing.tempo'].human);
  });

  it('is wider than the [40, 100] locale seed range on both ends — freely draggable beyond anything a locale would seed', () => {
    expect(BPM_SCHEMA.min).toBeLessThan(40);
    expect(BPM_SCHEMA.max).toBeGreaterThan(100);
  });

  it('is not part of AUDIO_RIG_CONFIG\'s per-effect array — it is a bare, Rig-wide meta-setting, not an effect param', () => {
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [
      b.panel.id,
      ...b.params.map((p) => p.schema.id),
    ]);
    expect(allConfigSchemaIds).not.toContain(BPM_SCHEMA.id);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(BPM_SCHEMA)).not.toThrow();
  });
});

// param.schema is typed as ControlSchema (the full 14-variant union) — orientation only exists
// on the 3 slider variants, so every lookup below narrows through this helper rather than
// asserting directly on the union type.
function orientationOf(schema: ControlSchema): string | undefined {
  return (schema as { orientation?: string }).orientation;
}

describe('slider orientation classification (docs/specs/VERTICAL_SLIDERS.md §1.1; EQ/filters horizontal since docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.2)', () => {
  it('3-Band EQ (Low/Mid/High) is horizontal — one stacked band row each, the slider over its Lane | Depth row', () => {
    for (const field of ['low', 'mid', 'high']) {
      expect(orientationOf(findParam('eq3', field).schema), field).toBe('horizontal');
    }
  });

  it('Low-Pass/High-Pass Filter (Frequency/Resonance) is horizontal — Cutoff and Resonance each a stacked row (reverses AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3\'s vertical classification)', () => {
    for (const key of ['filterLPF', 'filterHPF'] as const) {
      for (const field of ['frequency', 'Q']) {
        expect(orientationOf(findParam(key, field).schema), `${key}.${field}`).toBe('horizontal');
      }
    }
  });

  it('Delay (Time/Feedback/Mix) is horizontal', () => {
    for (const field of ['delayTime', 'feedback', 'wet']) {
      expect(orientationOf(findParam('delay', field).schema), field).toBe('horizontal');
    }
  });

  it('Reverb (Decay/Pre-Delay/Mix) is horizontal', () => {
    for (const field of ['decay', 'preDelay', 'wet']) {
      expect(orientationOf(findParam('reverb', field).schema), field).toBe('horizontal');
    }
  });

  it('Compressor (Threshold/Ratio/Attack/Release/Knee) is horizontal (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3)', () => {
    for (const field of ['threshold', 'ratio', 'attack', 'release', 'knee']) {
      expect(orientationOf(findParam('compressor', field).schema), field).toBe('horizontal');
    }
  });

  it('Limiter (Threshold) is horizontal (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3)', () => {
    expect(orientationOf(findParam('limiter', 'threshold').schema)).toBe('horizontal');
  });

  it('every lane\'s Rate Drift/Depth Drift (LFO_BANK_LANE_SCHEMAS) is horizontal (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3)', () => {
    for (const lane of LFO_LANE_IDS) {
      const schema = LFO_BANK_LANE_SCHEMAS[lane];
      expect(schema.rateDrift.orientation, `${lane}.rateDrift`).toBe('horizontal');
      expect(schema.depthDrift.orientation, `${lane}.depthDrift`).toBe('horizontal');
    }
  });

  it('Automatic Effects (PING_VARIANCE_AUTOMATION_SCHEMA) and Tempo (BPM_SCHEMA) are horizontal', () => {
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.orientation).toBe('horizontal');
    expect(BPM_SCHEMA.orientation).toBe('horizontal');
  });
});

// param.schema is typed as ControlSchema — verticalHeight only exists on the 3 slider variants,
// same narrowing reasoning orientationOf() above already uses.
function verticalHeightOf(schema: ControlSchema): number | undefined {
  return (schema as { verticalHeight?: number }).verticalHeight;
}

describe('verticalHeight budget (roadmap 13 — "Vertical Slider Label Overflow"; no horizontal schema carries one)', () => {
  // History: every real vertical slider used to fall through to the same *implicit*
  // VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT default and some overflowed their panel (found live,
  // roadmap 13), so each vertical schema had to declare its own budget. Since
  // docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.2 none of these sliders is vertical, so a
  // leftover verticalHeight would be dead config that misleads the next reader about the mode.
  it('3-Band EQ (Low/Mid/High) declares no verticalHeight — it is horizontal now', () => {
    for (const field of ['low', 'mid', 'high']) {
      expect(verticalHeightOf(findParam('eq3', field).schema), field).toBeUndefined();
      expect('verticalHeight' in findParam('eq3', field).schema, field).toBe(false);
    }
  });

  it('Low-Pass/High-Pass Filter (Frequency/Resonance) declares no verticalHeight — horizontal now', () => {
    for (const key of ['filterLPF', 'filterHPF'] as const) {
      for (const field of ['frequency', 'Q']) {
        expect(verticalHeightOf(findParam(key, field).schema), `${key}.${field}`).toBeUndefined();
        expect('verticalHeight' in findParam(key, field).schema, `${key}.${field}`).toBe(false);
      }
    }
  });

  it('no param schema in AUDIO_RIG_CONFIG is vertical or carries a verticalHeight', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      for (const param of block.params) {
        expect(orientationOf(param.schema), `${block.key}.${param.field}`).not.toBe('vertical');
        expect(verticalHeightOf(param.schema), `${block.key}.${param.field}`).toBeUndefined();
      }
    }
  });
});

// ========================================
// DirectionalPanel wiring — additive schema work
// (docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 1)
// ========================================

// The exact loreLabel/humanLabel text every AudioRigEffectBlock's now-removed `accordion` field
// used to carry, before the type swap to `panel` (docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 2)
// — verbatim preservation is guarded by comparing `panel`'s text against these literals directly,
// since there's no more sibling `accordion` field left to compare against at runtime.
const EXPECTED_BLOCK_LABELS: Record<(typeof EFFECT_KEYS)[number], { loreLabel?: string; humanLabel: string }> = {
  eq3: labels('fleet.eq', { surface: 'heading' }),
  filterLPF: labels('fleet.lpf', { surface: 'heading' }),
  filterHPF: labels('fleet.hpf', { surface: 'heading' }),
  distortion: labels('fleet.distortion', { surface: 'heading' }),
  chebyshev: labels('fleet.chebyshev', { surface: 'heading' }),
  bitCrusher: labels('fleet.bitCrusher', { surface: 'heading' }),
  autoWah: labels('fleet.autoWah', { surface: 'heading' }),
  phaser: labels('fleet.phaser', { surface: 'heading' }),
  chorus: labels('fleet.chorus', { surface: 'heading' }),
  tremolo: labels('fleet.tremolo', { surface: 'heading' }),
  vibrato: labels('fleet.vibrato', { surface: 'heading' }),
  frequencyShifter: labels('fleet.frequencyShifter', { surface: 'heading' }),
  delay: labels('fleet.delay', { surface: 'heading' }),
  reverb: labels('fleet.reverb', { surface: 'heading' }),
  compressor: labels('fleet.compressor', { surface: 'heading' }),
  stereoWidener: labels('fleet.stereoWidener', { surface: 'heading' }),
  limiter: labels('fleet.limiter', { surface: 'heading' }),
};

describe('AudioRigEffectBlock.panel (DirectionalPanel wiring, Tasks 1-2)', () => {
  it('every block has a panel field, type directionalPanel, id audioRig.<key>', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      expect(block.panel, block.key).toMatchObject({ id: `audioRig.${block.key}`, type: 'directionalPanel' });
    }
  });

  it("every panel's loreLabel/humanLabel is byte-identical to its pre-Task-2 accordion's text — verbatim preservation across the type swap", () => {
    for (const block of AUDIO_RIG_CONFIG) {
      expect(block.panel.loreLabel, block.key).toBe(EXPECTED_BLOCK_LABELS[block.key].loreLabel);
      expect(block.panel.humanLabel, block.key).toBe(EXPECTED_BLOCK_LABELS[block.key].humanLabel);
    }
  });

  it('every block panel is column-orientation — eq3/filterLPF/filterHPF stack their bands/params since docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.2 (they were the only row panels)', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      expect(block.panel.orientation, block.key).toBe('column');
    }
  });

  it('no longer has an accordion field — superseded by panel (Task 2 cleanup)', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      expect('accordion' in block, block.key).toBe(false);
    }
  });
});

describe('AUDIO_RIG_ACCORDION_GROUPS / TRANSPORT_COMPOSITION_ACCORDION_SCHEMA no longer exist (docs/tasks/NAV_LAYOUT_REWRITE.md Task 21 cleanup — the old accordion schema type itself is gone)', () => {
  it('are not exported by the module', () => {
    expect('AUDIO_RIG_ACCORDION_GROUPS' in audioRigConfigModule).toBe(false);
    expect('TRANSPORT_COMPOSITION_ACCORDION_SCHEMA' in audioRigConfigModule).toBe(false);
  });
});

describe('SPEED_AUTOMATION_PANEL_SCHEMA no longer exists (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §2.1 — Intensity no longer self-wraps in its own panel, now that it shares FleetParamsContent\'s own Pacing row with Frequency/Duration)', () => {
  it('is not exported by the module', () => {
    expect('SPEED_AUTOMATION_PANEL_SCHEMA' in audioRigConfigModule).toBe(false);
  });
});

// EQ_FILTERS_ROW_PANEL_SCHEMA / TIME_SPACE_COLUMN_PANEL_SCHEMA /
// OUTPUT_COLUMN_PANEL_SCHEMA were removed — those 3 groupings are no longer
// DirectionalPanelSchema objects at all; AudioRigDrawer.tsx wraps them in a
// plain PanelGroup (orientation prop, no schema/id/facade) instead, so each
// block keeps its own independent Cabinetry facade. See PanelGroup.test.tsx
// for that component's own coverage, and AudioRigDrawer.test.tsx for the
// "each block gets its own facade" structural assertions.

// ========================================
// AUDIO LOAD (docs/specs/AUDIO_LOAD_BUDGET.md §4.5)
// ========================================

describe('AUDIO_LOAD_PRESET_SCHEMA', () => {
  it('is a radio in the audioRig.* namespace offering exactly Light, Standard and Full', () => {
    expect(AUDIO_LOAD_PRESET_SCHEMA).toMatchObject({ type: 'radio', id: 'audioRig.audioLoadPreset' });
    expect(AUDIO_LOAD_PRESET_SCHEMA.options.map((o) => o.humanLabel)).toEqual(Object.values(CONTENT['settings.quality.preset'].options).map((o) => o.human));
  });

  it('uses the preset names audioBudget.ts parses (?load=light|standard|full) as its option values', () => {
    expect(AUDIO_LOAD_PRESET_SCHEMA.options.map((o) => o.value)).toEqual(['light', 'standard', 'full']);
    expect(Object.keys(AUDIO_LOAD_PRESETS)).toEqual(AUDIO_LOAD_PRESET_SCHEMA.options.map((o) => o.value));
  });

  it('has a non-empty invented loreLabel and a humanLabel', () => {
    expect(AUDIO_LOAD_PRESET_SCHEMA.loreLabel).toBeTruthy();
    expect(AUDIO_LOAD_PRESET_SCHEMA.humanLabel).toBeTruthy();
  });
});

describe('AUDIO_ROBOT_LOAD_SCHEMA', () => {
  it('is a horizontal linear slider, 0-100 %, whole steps, in the audioRig.* namespace', () => {
    expect(AUDIO_ROBOT_LOAD_SCHEMA).toMatchObject({
      type: 'sliderLinear',
      id: 'audioRig.robotLoad',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      orientation: 'horizontal',
    });
  });

  it('spans the whole dial: every preset lands on a whole slider step inside its range', () => {
    for (const value of Object.values(AUDIO_LOAD_PRESETS)) {
      const percent = value * 100;
      expect(percent).toBeGreaterThanOrEqual(AUDIO_ROBOT_LOAD_SCHEMA.min);
      expect(percent).toBeLessThanOrEqual(AUDIO_ROBOT_LOAD_SCHEMA.max);
      expect(Number.isInteger(percent)).toBe(true);
    }
  });

  it('has a non-empty invented loreLabel and the humanLabel from content (settings.quality.robotLoad)', () => {
    expect(AUDIO_ROBOT_LOAD_SCHEMA.loreLabel).toBeTruthy();
    expect(AUDIO_ROBOT_LOAD_SCHEMA.humanLabel).toBe(CONTENT['settings.quality.robotLoad'].human);
  });
});

describe('AUDIO_EFFECTS_LOAD_SCHEMA', () => {
  it('is a horizontal linear slider, 0-100 %, whole steps, in the audioRig.* namespace', () => {
    expect(AUDIO_EFFECTS_LOAD_SCHEMA).toMatchObject({
      type: 'sliderLinear',
      id: 'audioRig.effectsLoad',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      orientation: 'horizontal',
    });
  });

  it('spans the whole dial: every preset lands on a whole slider step inside its range', () => {
    for (const value of Object.values(AUDIO_LOAD_PRESETS)) {
      const percent = value * 100;
      expect(percent).toBeGreaterThanOrEqual(AUDIO_EFFECTS_LOAD_SCHEMA.min);
      expect(percent).toBeLessThanOrEqual(AUDIO_EFFECTS_LOAD_SCHEMA.max);
      expect(Number.isInteger(percent)).toBe(true);
    }
  });

  it('has a non-empty invented loreLabel and the humanLabel from content (settings.quality.effectsLoad)', () => {
    expect(AUDIO_EFFECTS_LOAD_SCHEMA.loreLabel).toBeTruthy();
    expect(AUDIO_EFFECTS_LOAD_SCHEMA.humanLabel).toBe(CONTENT['settings.quality.effectsLoad'].human);
  });

  it('has a distinct id and loreLabel from AUDIO_ROBOT_LOAD_SCHEMA', () => {
    expect(AUDIO_EFFECTS_LOAD_SCHEMA.id).not.toBe(AUDIO_ROBOT_LOAD_SCHEMA.id);
    expect(AUDIO_EFFECTS_LOAD_SCHEMA.loreLabel).not.toBe(AUDIO_ROBOT_LOAD_SCHEMA.loreLabel);
  });
});

describe('AUDIO_LOAD_PANEL_SCHEMA', () => {
  it('is a column directionalPanel named Audio Load in the audioRig.* namespace — its own 2 nested rows always stack, on every tier (Crawford\'s own correction, was "responsive")', () => {
    expect(AUDIO_LOAD_PANEL_SCHEMA).toMatchObject({
      type: 'directionalPanel',
      orientation: 'column',
      humanLabel: CONTENT['settings.quality.audioLoad'].human,
    });
    expect(AUDIO_LOAD_PANEL_SCHEMA.id).toMatch(/^audioRig\./);
    expect(AUDIO_LOAD_PANEL_SCHEMA.loreLabel).toBeTruthy();
  });

  it('gives all four schemas distinct ids, none of which is part of AUDIO_RIG_CONFIG (bare Rig-wide meta-settings, like Tempo)', () => {
    const ids = [AUDIO_LOAD_PRESET_SCHEMA.id, AUDIO_ROBOT_LOAD_SCHEMA.id, AUDIO_EFFECTS_LOAD_SCHEMA.id, AUDIO_LOAD_PANEL_SCHEMA.id];
    expect(new Set(ids).size).toBe(4);
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [b.panel.id, ...b.params.map((p) => p.schema.id)]);
    for (const id of ids) expect(allConfigSchemaIds).not.toContain(id);
  });

  it('keeps all four JSON-serializable', () => {
    for (const schema of [AUDIO_LOAD_PRESET_SCHEMA, AUDIO_ROBOT_LOAD_SCHEMA, AUDIO_EFFECTS_LOAD_SCHEMA, AUDIO_LOAD_PANEL_SCHEMA]) {
      expect(() => JSON.stringify(schema)).not.toThrow();
    }
  });
});


describe('audioRigConfig reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 7)', () => {
  it('every schema label equals its concept\'s CONTENT entry', async () => {
    const { CONTENT } = await import('@/content');
    expect(BPM_SCHEMA.humanLabel).toBe(CONTENT['fleet.pacing.tempo'].human);
    expect(BPM_SCHEMA.unit).toBe(CONTENT['fleet.pacing.tempo'].unit);
    expect(AUDIO_ROBOT_LOAD_SCHEMA.humanLabel).toBe(CONTENT['settings.quality.robotLoad'].human);
    const lpf = AUDIO_RIG_CONFIG.find((b) => b.key === 'filterLPF')!;
    expect(lpf.panel.loreLabel).toBe(CONTENT['fleet.lpf'].heading);
    expect(lpf.params[0].schema.loreLabel).toBe(CONTENT['fleet.lpf.cutoff'].lore);
    expect((lpf.params[0].schema as { unit?: string }).unit).toBe(CONTENT['fleet.lpf.cutoff'].unit);
  });
});

// docs/specs/ROBOT_PERFORMANCE.md §1.6 / docs/tasks/ROBOT_PERFORMANCE.md Task 8 — Humanize, the Pacing scalar.
describe('HUMANIZE_SCHEMA (Robot Performance)', () => {
  it('is a horizontal linear slider, 0-20 ms in whole steps, id audioRig.humanize', () => {
    expect(HUMANIZE_SCHEMA).toMatchObject({
      id: 'audioRig.humanize',
      type: 'sliderLinear',
      min: 0,
      max: 20,
      step: 1,
      unit: ' ms',
      orientation: 'horizontal',
    });
  });

  it('takes its bounds from HUMANIZE_MIN_MS / HUMANIZE_MAX_MS', () => {
    expect(HUMANIZE_SCHEMA.min).toBe(HUMANIZE_MIN_MS);
    expect(HUMANIZE_SCHEMA.max).toBe(HUMANIZE_MAX_MS);
  });

  it('is labeled and helped from fleet.pacing.humanize', () => {
    expect(HUMANIZE_SCHEMA.humanLabel).toBe(CONTENT['fleet.pacing.humanize'].human);
    expect(HUMANIZE_SCHEMA.loreLabel).toBe(CONTENT['fleet.pacing.humanize'].lore);
    expect(HUMANIZE_SCHEMA.unit).toBe(CONTENT['fleet.pacing.humanize'].unit);
    expect(HUMANIZE_SCHEMA.help?.human.trim()).toBeTruthy();
  });

  it('is a bare Pacing meta-setting: it never joins AUDIO_RIG_CONFIG\'s per-effect array', () => {
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [b.panel.id, ...b.params.map((p) => p.schema.id)]);
    expect(allConfigSchemaIds).not.toContain(HUMANIZE_SCHEMA.id);
  });

  it('the Pacing intro lists Humanize beside Tempo', () => {
    expect(CONTENT['fleet.pacing'].intro?.humanDescription ?? '').toContain(CONTENT['fleet.pacing.humanize'].human);
  });

  it('remains JSON-serializable', () => {
    expect(JSON.parse(JSON.stringify(HUMANIZE_SCHEMA))).toEqual(HUMANIZE_SCHEMA);
  });
});
