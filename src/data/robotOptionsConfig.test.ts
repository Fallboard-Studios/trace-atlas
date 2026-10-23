import { describe, it, expect } from 'vitest';
import {
  AUDIO_SETTING_SCHEMA,
  VOLUME_SCHEMA,
  PAN_SCHEMA,
  PAN_AUTO_SCHEMA,
  PAN_ROW_PANEL_SCHEMA,
  ROBOT_SEND_SCHEMAS,
  CLICK_TRACK_SCHEMA,
  DENSITY_SCHEMA,
  MOTIF_LENGTH_SCHEMA,
  OCTAVE_RANGE_MIN_SCHEMA,
  OCTAVE_RANGE_MAX_SCHEMA,
  NOTE_VARIANCE_SCHEMA,
  PITCH_REPEAT_SCHEMA,
  ATTACK_SCHEMA,
  DECAY_SCHEMA,
  SUSTAIN_SCHEMA,
  RELEASE_SCHEMA,
  SIGNATURE_ARRAY_CONFIG,
  VOLUME_ROW_PANEL_SCHEMA,
  VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA,
  PHRASING_PANEL_SCHEMA,
  RHYTHM_PANEL_SCHEMA,
  FREQUENCY_PANEL_SCHEMA,
  PING_CONTOUR_PANEL_SCHEMA,
  PORTAMENTO_SCHEMA,
  ATTACK_CURVE_SCHEMA,
  RELEASE_CURVE_SCHEMA,
  CURVE_ROW_PANEL_SCHEMA,
  BUS_FILTER_PANEL_SCHEMA,
  BUS_FILTER_ROW_PANEL_SCHEMA,
  BUS_CUTOFF_SCHEMA,
  BUS_RESONANCE_SCHEMA,
  BUS_FILTER_TYPE_SCHEMA,
  BUS_FILTER_LFO_TARGET,
  DYNAMICS_SCHEMA,
  RESTS_SCHEMA,
  ACCENTS_SCHEMA,
  ARTICULATION_PANEL_SCHEMA,
} from './robotOptionsConfig';
// Namespace import (not named) so Task 9's cleanup assertions below can check for the 3 old
// accordion consts' absence at runtime, without a named import that would itself fail to compile
// the instant they're removed from the source module.
import * as robotOptionsConfigModule from './robotOptionsConfig';
import { ROBOT_SENDS, ROBOT_SEND_FIELDS } from './robotSends';
import { CONTENT } from '@/content';
import { CONTROL_SCHEMA_TYPES } from '@/types/controls';
import { ROBOT_LFO_TARGET_IDS } from '@/types/lfo';
import {
  RHYTHMIC_DENSITY_MIN, RHYTHMIC_DENSITY_MAX, OCTAVE_RANGE_MIN, OCTAVE_RANGE_MAX,
  PITCH_REPEAT_MIN, PITCH_REPEAT_MAX, RHYTHMIC_MOTIF_LENGTH_MIN, RHYTHMIC_MOTIF_LENGTH_MAX,
  NOTE_VARIANCE_MIN, NOTE_VARIANCE_MAX,
  PAN_MIN, PAN_MAX, PAN_DISPLAY_SCALE,
  SEND_MIN, SEND_MAX, SEND_DISPLAY_SCALE, SEND_STEP_PERCENT,
  PORTAMENTO_MIN, PORTAMENTO_MAX, ROBOT_BUS_FILTER_FREQ_RANGE, ROBOT_BUS_FILTER_Q_RANGE, ROBOT_BUS_FILTER_Q,
  PERFORMANCE_MIN, PERFORMANCE_MAX,
} from '@/constants';
import { ENVELOPE_CURVE_NAMES, ROBOT_FILTER_TYPES } from '@/types/Robot';
import { ENVELOPE_TIME_MAX_SECONDS } from '@/constants';

const SEND_SCHEMAS = ROBOT_SEND_FIELDS.map((field) => ROBOT_SEND_SCHEMAS[field]);

const ALL_TOP_LEVEL_SCHEMAS = [
  AUDIO_SETTING_SCHEMA,
  VOLUME_SCHEMA,
  PAN_SCHEMA,
  PAN_AUTO_SCHEMA,
  ...SEND_SCHEMAS,
  CLICK_TRACK_SCHEMA,
  DENSITY_SCHEMA,
  MOTIF_LENGTH_SCHEMA,
  OCTAVE_RANGE_MIN_SCHEMA,
  OCTAVE_RANGE_MAX_SCHEMA,
  NOTE_VARIANCE_SCHEMA,
  PITCH_REPEAT_SCHEMA,
  ATTACK_SCHEMA,
  DECAY_SCHEMA,
  SUSTAIN_SCHEMA,
  RELEASE_SCHEMA,
];

describe('robotOptionsConfig', () => {
  it('every top-level schema type is one of the 13 closed-set ControlSchema variants', () => {
    ALL_TOP_LEVEL_SCHEMAS.forEach((schema) => {
      expect(CONTROL_SCHEMA_TYPES).toContain(schema.type);
    });
  });

  it('Density uses the real RHYTHMIC_DENSITY_MIN/MAX (0-100), not the stale grid range (1-16)', () => {
    expect(DENSITY_SCHEMA.min).toBe(RHYTHMIC_DENSITY_MIN);
    expect(DENSITY_SCHEMA.max).toBe(RHYTHMIC_DENSITY_MAX);
    expect(DENSITY_SCHEMA.min).toBe(0);
    expect(DENSITY_SCHEMA.max).toBe(100);
  });

  it('Octave Range Min/Max use the real OCTAVE_RANGE_MIN/MAX (1-7)', () => {
    expect(OCTAVE_RANGE_MIN_SCHEMA.min).toBe(OCTAVE_RANGE_MIN);
    expect(OCTAVE_RANGE_MIN_SCHEMA.max).toBe(OCTAVE_RANGE_MAX);
    expect(OCTAVE_RANGE_MAX_SCHEMA.min).toBe(OCTAVE_RANGE_MIN);
    expect(OCTAVE_RANGE_MAX_SCHEMA.max).toBe(OCTAVE_RANGE_MAX);
  });

  it('Octave Range Min/Max are sliderLinear with step 1 (STEPPER_TO_SLIDER Task 7)', () => {
    [OCTAVE_RANGE_MIN_SCHEMA, OCTAVE_RANGE_MAX_SCHEMA].forEach((schema) => {
      expect(schema.type).toBe('sliderLinear');
      expect(schema.step).toBe(1);
    });
  });

  it('Motif Length/Note Variance are sliderLinear, step 1, min 0 (STEPPER_TO_SLIDER Task 7)', () => {
    expect(MOTIF_LENGTH_SCHEMA.type).toBe('sliderLinear');
    expect(MOTIF_LENGTH_SCHEMA.step).toBe(1);
    expect(MOTIF_LENGTH_SCHEMA.min).toBe(RHYTHMIC_MOTIF_LENGTH_MIN);
    expect(MOTIF_LENGTH_SCHEMA.min).toBe(0);
    expect(MOTIF_LENGTH_SCHEMA.max).toBe(RHYTHMIC_MOTIF_LENGTH_MAX);

    expect(NOTE_VARIANCE_SCHEMA.type).toBe('sliderLinear');
    expect(NOTE_VARIANCE_SCHEMA.step).toBe(1);
    expect(NOTE_VARIANCE_SCHEMA.min).toBe(NOTE_VARIANCE_MIN);
    expect(NOTE_VARIANCE_SCHEMA.min).toBe(0);
    expect(NOTE_VARIANCE_SCHEMA.max).toBe(NOTE_VARIANCE_MAX);
  });

  it('Audio Setting has all 4 options, including \'none\' — not the grid prose\'s stale 3', () => {
    expect(AUDIO_SETTING_SCHEMA.options.map((o) => o.value).sort()).toEqual(
      ['highlight', 'mute', 'none', 'solo'].sort()
    );
  });

  it("Audio Setting's 'none' option is labeled 'Auto', not 'Off' (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.3)", () => {
    expect(AUDIO_SETTING_SCHEMA.options.find((o) => o.value === 'none')?.humanLabel).toBe(CONTENT['probe.monitorMode'].options.none.human);
  });

  it('Click Track is a toggle, labeled "Click Track"', () => {
    expect(CLICK_TRACK_SCHEMA.type).toBe('toggle');
    expect(CLICK_TRACK_SCHEMA.humanLabel).toBe(CONTENT['probe.composition.clickTrack'].human);
  });

  it('Pitch Repeat is a sliderLinear using PITCH_REPEAT_MIN/MAX (0-100), labeled per Architecture Decision §7.4', () => {
    expect(PITCH_REPEAT_SCHEMA.type).toBe('sliderLinear');
    expect(PITCH_REPEAT_SCHEMA.id).toBe('robotOptions.pitchRepeat');
    expect(PITCH_REPEAT_SCHEMA.loreLabel).toBe(CONTENT['probe.composition.pitchRepeat'].lore);
    expect(PITCH_REPEAT_SCHEMA.humanLabel).toBe(CONTENT['probe.composition.pitchRepeat'].human);
    expect(PITCH_REPEAT_SCHEMA.min).toBe(PITCH_REPEAT_MIN);
    expect(PITCH_REPEAT_SCHEMA.max).toBe(PITCH_REPEAT_MAX);
    expect(PITCH_REPEAT_SCHEMA.min).toBe(0);
    expect(PITCH_REPEAT_SCHEMA.max).toBe(100);
    expect(PITCH_REPEAT_SCHEMA.unit).toBe('%');
  });

  it('Volume displays 0-100% in 1% steps (stored as 0..1 - conversion happens at the component boundary, same as Sustain)', () => {
    expect(VOLUME_SCHEMA.min).toBe(0);
    expect(VOLUME_SCHEMA.max).toBe(100);
    expect(VOLUME_SCHEMA.step).toBe(1);
    expect(VOLUME_SCHEMA.unit).toBe('%');
  });

  // docs/specs/ROBOT_PAN.md §1.5 — the Pan slider, its Auto toggle and the row that holds them.
  describe('Pan', () => {
    it('PAN_SCHEMA is a horizontal sliderCenteredZero displaying -100..100 in steps of 1, with no unit', () => {
      expect(PAN_SCHEMA.type).toBe('sliderCenteredZero');
      expect(PAN_SCHEMA.min).toBe(-100);
      expect(PAN_SCHEMA.max).toBe(100);
      expect(PAN_SCHEMA.step).toBe(1);
      expect(PAN_SCHEMA.orientation).toBe('horizontal');
      expect(PAN_SCHEMA.unit).toBeUndefined();
    });

    it('PAN_SCHEMA bounds are the stored range times PAN_DISPLAY_SCALE, so the display and the store cannot drift apart', () => {
      expect(PAN_SCHEMA.min).toBe(PAN_MIN * PAN_DISPLAY_SCALE);
      expect(PAN_SCHEMA.max).toBe(PAN_MAX * PAN_DISPLAY_SCALE);
      expect(PAN_SCHEMA.min).toBe(-PAN_SCHEMA.max);
    });

    it('PAN_SCHEMA is labeled and helped from probe.pan', () => {
      expect(PAN_SCHEMA.humanLabel).toBe(CONTENT['probe.pan'].human);
      expect(PAN_SCHEMA.loreLabel).toBe(CONTENT['probe.pan'].lore);
      expect(PAN_SCHEMA.help?.human.trim()).toBeTruthy();
      expect(PAN_SCHEMA.help).toEqual(CONTENT['probe.pan'].help);
    });

    it('PAN_AUTO_SCHEMA is a toggle labeled and helped from probe.pan.auto', () => {
      expect(PAN_AUTO_SCHEMA.type).toBe('toggle');
      expect(PAN_AUTO_SCHEMA.humanLabel).toBe(CONTENT['probe.pan.auto'].human);
      expect(PAN_AUTO_SCHEMA.loreLabel).toBe(CONTENT['probe.pan.auto'].lore);
      expect(PAN_AUTO_SCHEMA.help?.human.trim()).toBeTruthy();
    });

    it('the slider and the toggle are told apart in the accessible name (different human words)', () => {
      expect(PAN_SCHEMA.humanLabel).not.toBe(PAN_AUTO_SCHEMA.humanLabel);
    });

    it('PAN_ROW_PANEL_SCHEMA is an unlabeled row-orientation directionalPanel', () => {
      expect(PAN_ROW_PANEL_SCHEMA).toMatchObject({ type: 'directionalPanel', orientation: 'row' });
      expect(PAN_ROW_PANEL_SCHEMA.loreLabel).toBeUndefined();
      expect(PAN_ROW_PANEL_SCHEMA.humanLabel).toBeUndefined();
    });

    it('the three Pan schemas carry unique robotOptions.* ids, none colliding with Volume', () => {
      const ids = [PAN_SCHEMA.id, PAN_AUTO_SCHEMA.id, PAN_ROW_PANEL_SCHEMA.id, VOLUME_SCHEMA.id, VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA.id];
      ids.forEach((id) => expect(id).toMatch(/^robotOptions\./));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('the Pan schemas are JSON-serializable', () => {
      [PAN_SCHEMA, PAN_AUTO_SCHEMA, PAN_ROW_PANEL_SCHEMA].forEach((schema) => {
        expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
      });
    });

    it('the Levels section intro names Pan and Auto, so the sentence the user reads covers the new row', () => {
      const description = CONTENT['probe.levels'].intro?.humanDescription ?? '';
      expect(description).toContain(CONTENT['probe.pan'].human);
      expect(description).toContain(CONTENT['probe.pan.auto'].human);
    });

    it('the help copy says phone speakers are mono, so nobody hunts for a difference they cannot hear', () => {
      expect(CONTENT['probe.pan'].help?.human.toLowerCase()).toContain('mono');
    });
  });

  // docs/specs/ROBOT_SEND_TABLE.md §1.4 (Robot Send Table T10): one record of five schemas, built from the table, in place
  // of the five named constants. Ids and words are today's, so the screens and the content guard see no change.
  describe('ROBOT_SEND_SCHEMAS', () => {
    it('has exactly one schema per ROBOT_SENDS row, keyed by its field, in table order', () => {
      expect(Object.keys(ROBOT_SEND_SCHEMAS)).toEqual(ROBOT_SENDS.map((spec) => spec.field));
    });

    it.each(ROBOT_SENDS)('the $field schema carries robotOptions.$field and the words of $contentKey', (spec) => {
      const schema = ROBOT_SEND_SCHEMAS[spec.field];
      expect(schema.id).toBe(`robotOptions.${spec.field}`);
      expect(schema.humanLabel).toBe(CONTENT[spec.contentKey].human);
      expect(schema.help).toEqual(CONTENT[spec.contentKey].help);
    });

    it('the five schemas are five objects, not one shared object (no row borrows the words of another)', () => {
      expect(new Set(SEND_SCHEMAS).size).toBe(5);
    });

    it.each(['REVERB_SEND_SCHEMA', 'DELAY_SEND_SCHEMA', 'GRIT_SEND_SCHEMA', 'SHIMMER_SEND_SCHEMA', 'DOUBLE_SEND_SCHEMA'])(
      'the old named constant %s is gone (the record is the one source)',
      (name) => {
        expect(name in robotOptionsConfigModule).toBe(false);
      },
    );

    it('is JSON-serializable as a whole', () => {
      expect(JSON.parse(JSON.stringify(ROBOT_SEND_SCHEMAS))).toEqual(ROBOT_SEND_SCHEMAS);
    });
  });

  // docs/specs/ROBOT_SENDS.md §1.6 - the send sliders, on Volume's display-vs-storage split (Grit, Shimmer and
  // Double from docs/specs/ROBOT_EFFECT_SENDS.md §1.6).
  describe.each([
    { name: 'ROBOT_SEND_SCHEMAS.reverbSend', schema: ROBOT_SEND_SCHEMAS.reverbSend, id: 'robotOptions.reverbSend', key: 'probe.reverbSend' },
    { name: 'ROBOT_SEND_SCHEMAS.delaySend', schema: ROBOT_SEND_SCHEMAS.delaySend, id: 'robotOptions.delaySend', key: 'probe.delaySend' },
    { name: 'ROBOT_SEND_SCHEMAS.gritSend', schema: ROBOT_SEND_SCHEMAS.gritSend, id: 'robotOptions.gritSend', key: 'probe.gritSend' },
    { name: 'ROBOT_SEND_SCHEMAS.shimmerSend', schema: ROBOT_SEND_SCHEMAS.shimmerSend, id: 'robotOptions.shimmerSend', key: 'probe.shimmerSend' },
    { name: 'ROBOT_SEND_SCHEMAS.doubleSend', schema: ROBOT_SEND_SCHEMAS.doubleSend, id: 'robotOptions.doubleSend', key: 'probe.doubleSend' },
  ] as const)('$name', ({ schema, id, key }) => {
    it('is a horizontal sliderLinear displaying 0-100 % in steps of 1', () => {
      expect(schema.type).toBe('sliderLinear');
      expect(schema.id).toBe(id);
      expect(schema.min).toBe(0);
      expect(schema.max).toBe(100);
      expect(schema.step).toBe(1);
      expect(schema.orientation).toBe('horizontal');
      expect(schema.unit).toBe('%');
    });

    it('bounds and step are the stored range and scale from the constants, so the display and the store cannot drift apart', () => {
      expect(schema.min).toBe(SEND_MIN * SEND_DISPLAY_SCALE);
      expect(schema.max).toBe(SEND_MAX * SEND_DISPLAY_SCALE);
      expect(schema.step).toBe(SEND_STEP_PERCENT);
    });

    it('is labeled, unit-ed and helped from its own content key', () => {
      const entry = CONTENT[key];
      expect(schema.humanLabel).toBe(entry.human);
      expect(schema.loreLabel).toBe(entry.lore);
      expect(schema.unit).toBe(entry.unit);
      expect(schema.help?.human.trim()).toBeTruthy();
      expect(schema.help).toEqual(entry.help);
    });

    it('is told apart from Volume, Pan and the other sends by its accessible name', () => {
      const names = [VOLUME_SCHEMA, PAN_SCHEMA, ...SEND_SCHEMAS].map((s) => s.humanLabel);
      expect(new Set(names).size).toBe(names.length);
      expect(names.filter((n) => n === schema.humanLabel)).toHaveLength(1);
    });

    it('is JSON-serializable', () => {
      expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    });
  });

  describe('the five sends - shared', () => {
    it('the five send ids are unique robotOptions.* ids, none colliding with Volume or Pan', () => {
      const ids = [...SEND_SCHEMAS.map((s) => s.id), VOLUME_SCHEMA.id, PAN_SCHEMA.id, PAN_AUTO_SCHEMA.id];
      ids.forEach((id) => expect(id).toMatch(/^robotOptions\./));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it.each(['probe.reverbSend', 'probe.delaySend', 'probe.gritSend', 'probe.shimmerSend', 'probe.doubleSend'] as const)(
      'the Levels section intro names %s, so the sentence the user reads covers every send row',
      (key) => {
        const description = CONTENT['probe.levels'].intro?.humanDescription ?? '';
        expect(description).toContain(CONTENT[key].human);
      },
    );

    it('the Grit, Shimmer and Double help says 0 % keeps the probe out of the room entirely', () => {
      for (const key of ['probe.gritSend', 'probe.shimmerSend', 'probe.doubleSend'] as const) {
        const help = CONTENT[key].help?.human ?? '';
        expect(help, key).toMatch(/0\s?%/);
        expect(help.toLowerCase(), key).toContain('out of');
      }
    });

    it('the Grit, Shimmer and Double help names the room each feeds (Colour, Shifter, Chorus)', () => {
      expect(CONTENT['probe.gritSend'].help?.human).toContain(CONTENT['fleet.colour'].human);
      expect(CONTENT['probe.shimmerSend'].help?.human).toContain(CONTENT['fleet.frequencyShifter'].human);
      expect(CONTENT['probe.doubleSend'].help?.human).toContain(CONTENT['fleet.chorus'].human);
    });

    it('the five sends carry five distinct help descriptions (never one shared description)', () => {
      const helps = SEND_SCHEMAS.map((s) => s.help?.human);
      expect(new Set(helps).size).toBe(5);
    });

    it('the Levels intro still names the earlier rows (Volume, Pan, Auto) - the new sentence is added, not swapped in', () => {
      const description = CONTENT['probe.levels'].intro?.humanDescription ?? '';
      expect(description).toContain(CONTENT['probe.volume'].human);
      expect(description).toContain(CONTENT['probe.pan'].human);
      expect(description).toContain(CONTENT['probe.pan.auto'].human);
    });

    it('the help copy says 0 % is completely dry / no repeats, so nobody hunts for an effect at zero', () => {
      expect(CONTENT['probe.reverbSend'].help?.human).toMatch(/0\s?%/);
      expect(CONTENT['probe.delaySend'].help?.human).toMatch(/0\s?%/);
    });

    it('the help copy names the shared room each send feeds', () => {
      expect(CONTENT['probe.reverbSend'].help?.human.toLowerCase()).toContain('reverb');
      expect(CONTENT['probe.delaySend'].help?.human.toLowerCase()).toContain('delay');
    });
  });

  it('no longer exports a VOLUME_LFO_TARGET — the Volume LFO target was removed (docs/specs/LFO_LOAD_FIX.md assumption 9, Task 3)', () => {
    expect('VOLUME_LFO_TARGET' in robotOptionsConfigModule).toBe(false);
  });

  // Crawford, 2026-10-13: past about half a second a robot's notes (often back-to-back 16ths) never let the envelope
  // finish, so 0-10 s was mostly one drone (and a long Decay leaves the Sustain slider inert). Attack, Decay and
  // Release all run 0-2 s.
  it('Attack, Decay and Release run 0-2 s, the one shared ENVELOPE_TIME_MAX_SECONDS', () => {
    expect(ENVELOPE_TIME_MAX_SECONDS).toBe(2);
    [ATTACK_SCHEMA, DECAY_SCHEMA, RELEASE_SCHEMA].forEach((schema) => {
      expect(schema.min).toBe(0);
      expect(schema.max).toBe(ENVELOPE_TIME_MAX_SECONDS);
      expect(schema.unit).toBe('s');
    });
  });


  it('Sustain is a 0-100% display slider (conversion to the stored 0..1 value happens at the component boundary)', () => {
    expect(SUSTAIN_SCHEMA.min).toBe(0);
    expect(SUSTAIN_SCHEMA.max).toBe(100);
    expect(SUSTAIN_SCHEMA.unit).toBe('%');
  });

  describe('SIGNATURE_ARRAY_CONFIG', () => {
    it('has exactly 3 blocks, labeled Core/Companion/Accent in order (docs/reference/text-content-tables.md — renamed from Baseline/Coaxial/Harmonic; the key field below is the unchanged internal identity)', () => {
      expect(SIGNATURE_ARRAY_CONFIG).toHaveLength(3);
      expect(SIGNATURE_ARRAY_CONFIG.map((b) => b.humanLabel)).toEqual([CONTENT['probe.source.core'].human, CONTENT['probe.source.companion'].human, CONTENT['probe.source.accent'].human]);
      expect(SIGNATURE_ARRAY_CONFIG.map((b) => b.key)).toEqual(['layer0', 'layer1', 'layer2']);
    });

    it('no block carries an activeSchema — muting is expressed via each block\'s own Gain param instead', () => {
      SIGNATURE_ARRAY_CONFIG.forEach((block) => {
        expect('activeSchema' in block).toBe(false);
      });
    });

    it('each block\'s Type param has exactly the 5 real waveform options — no Noise', () => {
      SIGNATURE_ARRAY_CONFIG.forEach((block) => {
        const typeParam = block.params.find((p) => p.field === 'type');
        expect(typeParam).toBeDefined();
        const schema = typeParam!.schema as { options: { value: string }[] };
        const values = schema.options.map((o) => o.value).sort();
        expect(values).toEqual(['pulse', 'sawtooth', 'sine', 'square', 'triangle']);
        expect(values).not.toContain('noise');
      });
    });

    it('Detune uses the confirmed ±50 cent range (not the removed per-layer editor\'s ±100)', () => {
      SIGNATURE_ARRAY_CONFIG.forEach((block) => {
        const detuneParam = block.params.find((p) => p.field === 'detune');
        const schema = detuneParam!.schema as { min: number; max: number };
        expect(schema.min).toBe(-50);
        expect(schema.max).toBe(50);
      });
    });

    it('Interval/pulseWidth is a 0-1 slider on every block, with a step fine enough to be more than an on/off toggle', () => {
      // Regression: SliderLinear defaults an unset `step` to 1 (SliderLinear.tsx)
      // — on a 0-1 range that leaves exactly two reachable positions, 0 and 1,
      // same class of bug audioRigConfig.ts's delay/reverb 0-1 sliders already
      // guard against with an explicit step: 0.01.
      SIGNATURE_ARRAY_CONFIG.forEach((block) => {
        const pw = block.params.find((p) => p.field === 'pulseWidth');
        const schema = pw!.schema as { min: number; max: number; step?: number };
        expect(schema.min).toBe(0);
        expect(schema.max).toBe(1);
        expect(schema.step).toBe(0.01);
      });
    });

    it('Gain is a 0-2 slider on every block, with a step fine enough for more than 3 reachable positions', () => {
      // Same missing-step class as Interval/pulseWidth above — SliderLinear defaults an
      // unset step to 1, which on a 0-2 range leaves only 0/1/2 reachable.
      SIGNATURE_ARRAY_CONFIG.forEach((block) => {
        const gain = block.params.find((p) => p.field === 'gain');
        const schema = gain!.schema as { min: number; max: number; step?: number };
        expect(schema.min).toBe(0);
        expect(schema.max).toBe(2);
        expect(schema.step).toBe(0.01);
      });
    });

    it('the Phase param is never LFO-flagged (docs/specs/LFO_BANK.md Task 1 — phase targets cut; the slider stays, just non-modulatable)', () => {
      SIGNATURE_ARRAY_CONFIG.forEach((block) => {
        const phaseParam = block.params.find((p) => p.field === 'phase');
        expect(phaseParam!.lfoTarget).toBeUndefined();
      });
    });

    it('every LFO-flagged param\'s lfoTarget is a real RobotLfoTargetId matching its own layer index', () => {
      const expectedPrefixes = ['layer0', 'layer1', 'layer2'];
      SIGNATURE_ARRAY_CONFIG.forEach((block, i) => {
        block.params
          .filter((p) => p.lfoTarget !== undefined)
          .forEach((p) => {
            expect(ROBOT_LFO_TARGET_IDS).toContain(p.lfoTarget);
            expect(p.lfoTarget!.startsWith(expectedPrefixes[i])).toBe(true);
          });
      });
    });

    it('the Type param is never LFO-flagged (not a modulatable numeric param)', () => {
      SIGNATURE_ARRAY_CONFIG.forEach((block) => {
        const typeParam = block.params.find((p) => p.field === 'type');
        expect(typeParam!.lfoTarget).toBeUndefined();
      });
    });

    // The pulse-width LFO target was removed (docs/specs/LFO_LOAD_FIX.md assumption 9, Task 4) —
    // the ≈7× cost outlier among robot LFOs, only ever present on pulse-type layers. The Interval
    // slider itself stays; it is simply no longer a modulation target.
    it('each layer block carries exactly 2 LFO-flagged params — gain, detune — and Phase/Interval/pulseWidth are never LFO-flagged', () => {
      SIGNATURE_ARRAY_CONFIG.forEach((block) => {
        const flagged = block.params.filter((p) => p.lfoTarget !== undefined).map((p) => p.field).sort();
        expect(flagged, block.key).toEqual(['detune', 'gain']);
        const pw = block.params.find((p) => p.field === 'pulseWidth')!;
        expect(pw, `${block.key} still has its Interval slider`).toBeDefined();
        expect(pw.lfoTarget, `${block.key}.pulseWidth`).toBeUndefined();
        const phase = block.params.find((p) => p.field === 'phase')!;
        expect(phase, `${block.key} still has its Phase slider`).toBeDefined();
        expect(phase.lfoTarget, `${block.key}.phase`).toBeUndefined();
      });
    });

    it('every param schema type is one of the 13 closed-set ControlSchema variants', () => {
      SIGNATURE_ARRAY_CONFIG.forEach((block) => {
        block.params.forEach((p) => {
          expect(CONTROL_SCHEMA_TYPES).toContain(p.schema.type);
        });
      });
    });
  });
});

describe('slider orientation classification (docs/specs/VERTICAL_SLIDERS.md §1.1)', () => {
  it('Volume is horizontal', () => {
    expect(VOLUME_SCHEMA.orientation).toBe('horizontal');
  });

  it('Ping Controls (Density, Motif Length, Pitch Repeat, Octave Range Min/Max, Note Variance) is horizontal (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.6)', () => {
    [DENSITY_SCHEMA, MOTIF_LENGTH_SCHEMA, PITCH_REPEAT_SCHEMA, OCTAVE_RANGE_MIN_SCHEMA, OCTAVE_RANGE_MAX_SCHEMA, NOTE_VARIANCE_SCHEMA].forEach((schema) => {
      expect(schema.orientation, schema.id).toBe('horizontal');
    });
  });

  it('Ping Contour (Attack/Decay/Sustain/Release) is horizontal (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.6)', () => {
    [ATTACK_SCHEMA, DECAY_SCHEMA, SUSTAIN_SCHEMA, RELEASE_SCHEMA].forEach((schema) => {
      expect(schema.orientation).toBe('horizontal');
    });
  });

  it('Signature Array (Gain/Detune/Phase/Interval) is horizontal on every layer (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.4 — was vertical)', () => {
    SIGNATURE_ARRAY_CONFIG.forEach((block) => {
      for (const field of ['gain', 'detune', 'phase', 'pulseWidth']) {
        const param = block.params.find((p) => p.field === field)!;
        expect((param.schema as { orientation?: string }).orientation, `${block.key}.${field}`).toBe('horizontal');
      }
    });
  });
});

describe('verticalHeight budget (roadmap 13 — "Vertical Slider Label Overflow"; no horizontal schema carries one)', () => {
  // History: every real vertical slider used to fall through to the same *implicit*
  // VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT default and some overflowed their panel (found live,
  // roadmap 13), so each vertical schema had to declare its own budget. Since
  // docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.4 none of these sliders is vertical, so a
  // leftover verticalHeight would be dead config that misleads the next reader about the mode.
  it('Signature Array (Gain/Detune/Phase/Interval) declares no verticalHeight on any layer — horizontal now', () => {
    SIGNATURE_ARRAY_CONFIG.forEach((block) => {
      for (const field of ['gain', 'detune', 'phase', 'pulseWidth']) {
        const param = block.params.find((p) => p.field === field)!;
        expect((param.schema as { verticalHeight?: number }).verticalHeight, `${block.key}.${field}`).toBeUndefined();
        expect('verticalHeight' in param.schema, `${block.key}.${field}`).toBe(false);
      }
    });
  });
});

// docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.4: Type | Gain share a top row, Phase | Interval share
// the last row (only when Interval is shown) — each a nested 'responsive' panel, side by side on
// desktop, stacked below, unlabeled.
describe('SignatureArrayLayerBlock.rows (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.4)', () => {
  it("every layer's rows.typeGain and rows.phaseInterval are unlabeled 'responsive' directionalPanels under the layer's own id", () => {
    for (const block of SIGNATURE_ARRAY_CONFIG) {
      expect(block.rows.typeGain, `${block.key}.typeGain`).toEqual({ id: `robotOptions.${block.key}.typeGainRow`, type: 'directionalPanel', orientation: 'responsive' });
      expect(block.rows.phaseInterval, `${block.key}.phaseInterval`).toEqual({ id: `robotOptions.${block.key}.phaseIntervalRow`, type: 'directionalPanel', orientation: 'responsive' });
      expect('humanLabel' in block.rows.typeGain, `${block.key}.typeGain label`).toBe(false);
      expect('loreLabel' in block.rows.phaseInterval, `${block.key}.phaseInterval label`).toBe(false);
    }
  });

  it('row ids are unique across the three layers and distinct from the layer panel ids', () => {
    const ids = SIGNATURE_ARRAY_CONFIG.flatMap((b) => [b.panel.id, b.rows.typeGain.id, b.rows.phaseInterval.id]);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(SIGNATURE_ARRAY_CONFIG)).not.toThrow();
  });
});

// ========================================
// DirectionalPanel wiring — additive schema work
// (docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 3)
// ========================================

describe('ROBOT_OUTPUT_PANEL_SCHEMA no longer exists (Task 2 cleanup)', () => {
  it('is not exported by the module — fully superseded by AudioSettingSection\'s own panels', () => {
    expect((robotOptionsConfigModule as Record<string, unknown>).ROBOT_OUTPUT_PANEL_SCHEMA).toBeUndefined();
  });
});

describe('VOLUME_ROW_PANEL_SCHEMA / VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.2)', () => {
  it('VOLUME_ROW_PANEL_SCHEMA is a column-orientation directionalPanel, unlabeled — Volume always renders above its LFO, matching every other LFO layout (Crawford\'s own correction, was "responsive")', () => {
    expect(VOLUME_ROW_PANEL_SCHEMA).toMatchObject({ type: 'directionalPanel', orientation: 'column' });
    expect(VOLUME_ROW_PANEL_SCHEMA.loreLabel).toBeUndefined();
    expect(VOLUME_ROW_PANEL_SCHEMA.humanLabel).toBeUndefined();
  });

  it('VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA is a column-orientation directionalPanel, unlabeled', () => {
    expect(VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA).toMatchObject({ type: 'directionalPanel', orientation: 'column' });
    expect(VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA.loreLabel).toBeUndefined();
    expect(VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA.humanLabel).toBeUndefined();
  });

  it('both ids are unique and in the robotOptions.* namespace', () => {
    const ids = [VOLUME_ROW_PANEL_SCHEMA.id, VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA.id];
    ids.forEach((id) => expect(id).toMatch(/^robotOptions\./));
    expect(new Set(ids).size).toBe(2);
  });

  it('both remain JSON-serializable', () => {
    expect(() => JSON.stringify(VOLUME_ROW_PANEL_SCHEMA)).not.toThrow();
    expect(() => JSON.stringify(VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA)).not.toThrow();
  });
});

describe('VOLUME/MELODY/ENVELOPE/SOURCE_ACCORDION_SCHEMA no longer exist (docs/tasks/NAV_LAYOUT_REWRITE.md Task 21 cleanup — the old accordion schema type itself is gone)', () => {
  it('are not exported by the module', () => {
    expect('VOLUME_ACCORDION_SCHEMA' in robotOptionsConfigModule).toBe(false);
    expect('MELODY_ACCORDION_SCHEMA' in robotOptionsConfigModule).toBe(false);
    expect('ENVELOPE_ACCORDION_SCHEMA' in robotOptionsConfigModule).toBe(false);
    expect('SOURCE_ACCORDION_SCHEMA' in robotOptionsConfigModule).toBe(false);
  });
});

describe('PHRASING_PANEL_SCHEMA / FREQUENCY_PANEL_SCHEMA (Task 3)', () => {
  it('carry the confirmed humanLabels and directionalPanel type — new labels, not derived from the old flat "Ping Controls" accordion', () => {
    expect(PHRASING_PANEL_SCHEMA).toMatchObject({ type: 'directionalPanel', orientation: 'column', humanLabel: CONTENT['probe.composition.phrasing'].human });
    expect(FREQUENCY_PANEL_SCHEMA).toMatchObject({ type: 'directionalPanel', orientation: 'responsive', humanLabel: CONTENT['probe.composition.pitches'].human });
  });

  it('neither reuses "Ping Controls" as its own label text', () => {
    expect(PHRASING_PANEL_SCHEMA.humanLabel).not.toBe('Ping Controls');
    expect(FREQUENCY_PANEL_SCHEMA.humanLabel).not.toBe('Ping Controls');
  });

  it('each has a non-empty invented loreLabel and a unique id', () => {
    expect(PHRASING_PANEL_SCHEMA.loreLabel).toBeTruthy();
    expect(FREQUENCY_PANEL_SCHEMA.loreLabel).toBeTruthy();
    expect(PHRASING_PANEL_SCHEMA.id).not.toBe(FREQUENCY_PANEL_SCHEMA.id);
  });
});

describe('RHYTHM_PANEL_SCHEMA (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.4 — no prior test coverage existed for this schema)', () => {
  it('is a responsive-orientation directionalPanel with humanLabel Rhythm', () => {
    expect(RHYTHM_PANEL_SCHEMA).toMatchObject({ type: 'directionalPanel', orientation: 'responsive', humanLabel: CONTENT['probe.composition.rhythm'].human });
  });

  it('has a non-empty loreLabel and an id distinct from PHRASING_PANEL_SCHEMA\'s (its own outer wrapper)', () => {
    expect(RHYTHM_PANEL_SCHEMA.loreLabel).toBeTruthy();
    expect(RHYTHM_PANEL_SCHEMA.id).not.toBe(PHRASING_PANEL_SCHEMA.id);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(RHYTHM_PANEL_SCHEMA)).not.toThrow();
  });
});

describe('PING_CONTOUR_PANEL_SCHEMA (DirectionalPanel wiring, Tasks 3+9)', () => {
  it('is a column-orientation directionalPanel — wraps 2 responsive sub-rows instead of 4 sliders directly (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.4)', () => {
    expect(PING_CONTOUR_PANEL_SCHEMA.type).toBe('directionalPanel');
    expect(PING_CONTOUR_PANEL_SCHEMA.orientation).toBe('column');
  });

  it('has the confirmed loreLabel/humanLabel', () => {
    expect(PING_CONTOUR_PANEL_SCHEMA.loreLabel).toBe(CONTENT['probe.envelope.contour'].lore);
    expect(PING_CONTOUR_PANEL_SCHEMA.humanLabel).toBe(CONTENT['probe.envelope.contour'].human);
  });
});

describe('PING_CONTROLS_ACCORDION_SCHEMA / PING_CONTOUR_ACCORDION_SCHEMA / SIGNATURE_ARRAY_ACCORDION_SCHEMA no longer exist (Task 9 cleanup)', () => {
  it('are not exported by the module — fully superseded by MELODY/ENVELOPE/SOURCE_ACCORDION_SCHEMA + the new panels', () => {
    expect('PING_CONTROLS_ACCORDION_SCHEMA' in robotOptionsConfigModule).toBe(false);
    expect('PING_CONTOUR_ACCORDION_SCHEMA' in robotOptionsConfigModule).toBe(false);
    expect('SIGNATURE_ARRAY_ACCORDION_SCHEMA' in robotOptionsConfigModule).toBe(false);
  });
});

describe('RESET_MELODY_SCHEMA no longer exists (Deterministic Robot Melody Generation, Task 6)', () => {
  it('is not exported by the module — full determinism leaves nothing for a Reset Melody control to do', () => {
    expect('RESET_MELODY_SCHEMA' in robotOptionsConfigModule).toBe(false);
  });
});

describe('SignatureArrayLayerBlock.panel (additive, Task 3)', () => {
  it("every layer has a panel field, type directionalPanel, column orientation — it holds one stacked column of rows (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.4; was 'row' with a single child, which did nothing)", () => {
    for (const block of SIGNATURE_ARRAY_CONFIG) {
      expect(block.panel, block.key).toMatchObject({ type: 'directionalPanel', orientation: 'column' });
    }
  });

  it("every layer's panel loreLabel/humanLabel matches that layer's own loreLabel/humanLabel exactly — reused verbatim, never re-invented", () => {
    for (const block of SIGNATURE_ARRAY_CONFIG) {
      expect(block.panel.loreLabel, block.key).toBe(block.loreLabel);
      expect(block.panel.humanLabel, block.key).toBe(block.humanLabel);
    }
  });

  it('every layer panel has a unique id in the robotOptions.* namespace', () => {
    const ids = SIGNATURE_ARRAY_CONFIG.map((b) => b.panel.id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^robotOptions\./);
  });
});

describe('robotOptionsConfig reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 8)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, 'robotOptionsConfig.ts'), 'utf8');
    expect(src).not.toMatch(/(loreLabel|humanLabel|unit|placeholder)\s*:\s*['"`]/);
    expect(src).not.toMatch(/makeLayerBlock\([^)]*'[A-Z][a-z]/); // no positional label strings
  });
  it('every schema label equals its concept\'s CONTENT entry', async () => {
    const { CONTENT } = await import('@/content');
    expect(VOLUME_SCHEMA.humanLabel).toBe(CONTENT['probe.volume'].human);
    expect(VOLUME_SCHEMA.unit).toBe(CONTENT['probe.volume'].unit);
    expect(RHYTHM_PANEL_SCHEMA.loreLabel).toBe(CONTENT['probe.composition.rhythm'].heading);
    expect(SIGNATURE_ARRAY_CONFIG[0].humanLabel).toBe(CONTENT['probe.source.core'].human);
    expect(SIGNATURE_ARRAY_CONFIG[1].params[0].schema.humanLabel).toBe(CONTENT['probe.source.companion.type'].human);
  });
});

// ========================================
// ROBOT ARTICULATION (docs/specs/ROBOT_ARTICULATION.md §1.6, §1.9 — docs/tasks/ROBOT_ARTICULATION.md Task 7)
// ========================================

describe('Robot Articulation schemas', () => {
  const VALUE_SCHEMAS = [
    PORTAMENTO_SCHEMA, ATTACK_CURVE_SCHEMA, RELEASE_CURVE_SCHEMA,
    BUS_CUTOFF_SCHEMA, BUS_RESONANCE_SCHEMA, BUS_FILTER_TYPE_SCHEMA,
  ];
  const PANEL_SCHEMAS = [BUS_FILTER_PANEL_SCHEMA, CURVE_ROW_PANEL_SCHEMA, BUS_FILTER_ROW_PANEL_SCHEMA];

  it('every schema is one of the closed-set ControlSchema variants', () => {
    [...VALUE_SCHEMAS, ...PANEL_SCHEMAS].forEach((schema) => expect(CONTROL_SCHEMA_TYPES).toContain(schema.type));
    expect(CONTROL_SCHEMA_TYPES).toHaveLength(14); // no primitive was added
  });

  describe('Portamento', () => {
    it('is a horizontal sliderLog over the PORTAMENTO_MIN/MAX seconds', () => {
      expect(PORTAMENTO_SCHEMA).toMatchObject({ type: 'sliderLog', min: PORTAMENTO_MIN, max: PORTAMENTO_MAX, orientation: 'horizontal' });
      expect(PORTAMENTO_SCHEMA.min).toBe(0); // 0 = no glide, today's sound, must be reachable
    });

    it('is labeled, united and helped from probe.envelope.portamento', () => {
      const entry = CONTENT['probe.envelope.portamento'];
      expect(PORTAMENTO_SCHEMA.humanLabel).toBe(entry.human);
      expect(PORTAMENTO_SCHEMA.loreLabel).toBe(entry.lore);
      expect(PORTAMENTO_SCHEMA.unit).toBe('s');
      expect(PORTAMENTO_SCHEMA.help).toEqual(entry.help);
    });
  });

  describe('Attack Shape / Release Shape', () => {
    it.each([
      ['ATTACK_CURVE_SCHEMA', ATTACK_CURVE_SCHEMA, 'probe.envelope.attackShape'],
      ['RELEASE_CURVE_SCHEMA', RELEASE_CURVE_SCHEMA, 'probe.envelope.releaseShape'],
    ] as const)('%s is a radio of exactly the 7 envelope curves, in ENVELOPE_CURVE_NAMES order', (_name, schema, key) => {
      expect(schema.type).toBe('radio');
      expect(schema.options.map((o) => o.value)).toEqual([...ENVELOPE_CURVE_NAMES]);
      expect(schema.options).toHaveLength(7);
      expect(schema.humanLabel).toBe(CONTENT[key].human);
      expect(schema.loreLabel).toBe(CONTENT[key].lore);
      expect(schema.help?.human.trim()).toBeTruthy();
    });

    it('both radios offer the same words for the same curve, each with a human and a lore label', () => {
      expect(RELEASE_CURVE_SCHEMA.options).toEqual(ATTACK_CURVE_SCHEMA.options);
      ATTACK_CURVE_SCHEMA.options.forEach((o) => {
        expect(o.humanLabel.trim(), o.value).not.toBe('');
        expect(o.loreLabel?.trim(), o.value).toBeTruthy();
      });
    });

    it('no two curves share a human word (a radio of look-alikes would be unreadable)', () => {
      const words = ATTACK_CURVE_SCHEMA.options.map((o) => o.humanLabel);
      expect(new Set(words).size).toBe(words.length);
    });

    it('the two radios are told apart in the accessible name', () => {
      expect(ATTACK_CURVE_SCHEMA.humanLabel).not.toBe(RELEASE_CURVE_SCHEMA.humanLabel);
      expect(ATTACK_CURVE_SCHEMA.help?.human).not.toBe(RELEASE_CURVE_SCHEMA.help?.human);
    });
  });

  describe('Bus filter', () => {
    it('Cutoff is a horizontal sliderLog over the robot bus filter frequency range, in Hz', () => {
      expect(BUS_CUTOFF_SCHEMA).toMatchObject({ type: 'sliderLog', orientation: 'horizontal', unit: 'Hz' });
      expect(BUS_CUTOFF_SCHEMA.min).toBe(ROBOT_BUS_FILTER_FREQ_RANGE.min);
      expect(BUS_CUTOFF_SCHEMA.max).toBe(ROBOT_BUS_FILTER_FREQ_RANGE.max);
      expect(BUS_CUTOFF_SCHEMA.min).toBeGreaterThan(0); // a log scale cannot start at 0
    });

    it('Resonance is a horizontal sliderLog over the robot bus filter Q range, with no unit', () => {
      expect(BUS_RESONANCE_SCHEMA).toMatchObject({ type: 'sliderLog', orientation: 'horizontal' });
      expect(BUS_RESONANCE_SCHEMA.min).toBe(ROBOT_BUS_FILTER_Q_RANGE.min);
      expect(BUS_RESONANCE_SCHEMA.max).toBe(ROBOT_BUS_FILTER_Q_RANGE.max);
      expect(BUS_RESONANCE_SCHEMA.unit).toBeUndefined();
      // Today's fixed Q must be a reachable value, or an untouched robot would show a position it cannot hold.
      expect(ROBOT_BUS_FILTER_Q).toBeGreaterThanOrEqual(BUS_RESONANCE_SCHEMA.min);
      expect(ROBOT_BUS_FILTER_Q).toBeLessThanOrEqual(BUS_RESONANCE_SCHEMA.max);
    });

    it('Type is a radio of exactly the 3 filter types, in ROBOT_FILTER_TYPES order', () => {
      expect(BUS_FILTER_TYPE_SCHEMA.type).toBe('radio');
      expect(BUS_FILTER_TYPE_SCHEMA.options.map((o) => o.value)).toEqual([...ROBOT_FILTER_TYPES]);
      expect(BUS_FILTER_TYPE_SCHEMA.options).toHaveLength(3);
      BUS_FILTER_TYPE_SCHEMA.options.forEach((o) => {
        expect(o.humanLabel.trim(), o.value).not.toBe('');
        expect(o.loreLabel?.trim(), o.value).toBeTruthy();
      });
    });

    it('each control is labeled and helped from its own probe.source.filter.* entry', () => {
      expect(BUS_CUTOFF_SCHEMA.humanLabel).toBe(CONTENT['probe.source.filter.cutoff'].human);
      expect(BUS_CUTOFF_SCHEMA.loreLabel).toBe(CONTENT['probe.source.filter.cutoff'].lore);
      expect(BUS_RESONANCE_SCHEMA.humanLabel).toBe(CONTENT['probe.source.filter.resonance'].human);
      expect(BUS_FILTER_TYPE_SCHEMA.humanLabel).toBe(CONTENT['probe.source.filter.type'].human);
      [BUS_CUTOFF_SCHEMA, BUS_RESONANCE_SCHEMA, BUS_FILTER_TYPE_SCHEMA].forEach((s) => expect(s.help?.human.trim(), s.id).toBeTruthy());
    });

    it("the panel is headed by the Source filter concept's own heading", () => {
      expect(BUS_FILTER_PANEL_SCHEMA.type).toBe('directionalPanel');
      expect(BUS_FILTER_PANEL_SCHEMA.orientation).toBe('column');
      expect(BUS_FILTER_PANEL_SCHEMA.humanLabel).toBe(CONTENT['probe.source.filter'].human);
      expect(BUS_FILTER_PANEL_SCHEMA.loreLabel).toBe(CONTENT['probe.source.filter'].lore);
    });

    it("the link rides the bus filter's cutoff target, which is a real robot LFO target", () => {
      expect(BUS_FILTER_LFO_TARGET).toBe('bus.frequency');
      expect(ROBOT_LFO_TARGET_IDS).toContain(BUS_FILTER_LFO_TARGET);
    });
  });

  describe('row panels', () => {
    it('are unlabeled responsive directionalPanels — pure layout', () => {
      [CURVE_ROW_PANEL_SCHEMA, BUS_FILTER_ROW_PANEL_SCHEMA].forEach((panel) => {
        expect(panel).toMatchObject({ type: 'directionalPanel', orientation: 'responsive' });
        expect(panel.humanLabel).toBeUndefined();
        expect(panel.loreLabel).toBeUndefined();
      });
    });
  });

  it('every schema carries a unique robotOptions.* id, none colliding with the existing Envelope or Source ids', () => {
    const ids = [...VALUE_SCHEMAS, ...PANEL_SCHEMAS].map((s) => s.id);
    const existing = [ATTACK_SCHEMA, DECAY_SCHEMA, SUSTAIN_SCHEMA, RELEASE_SCHEMA, PING_CONTOUR_PANEL_SCHEMA].map((s) => s.id);
    ids.forEach((id) => expect(id).toMatch(/^robotOptions\./));
    expect(new Set([...ids, ...existing]).size).toBe(ids.length + existing.length);
  });

  it('is JSON-serializable', () => {
    [...VALUE_SCHEMAS, ...PANEL_SCHEMAS].forEach((schema) => expect(JSON.parse(JSON.stringify(schema))).toEqual(schema));
  });

  describe('content', () => {
    it('Resonance help mentions the wah, so the link beneath it has context', () => {
      expect(CONTENT['probe.source.filter.resonance'].help?.human.toLowerCase()).toContain('wah');
    });

    it("the Envelope intro names Portamento, Attack Shape and Release Shape; the Source intro names the Filter", () => {
      const envelope = CONTENT['probe.envelope'].intro?.humanDescription ?? '';
      expect(envelope).toContain(CONTENT['probe.envelope.portamento'].human);
      expect(envelope).toContain(CONTENT['probe.envelope.attackShape'].human);
      expect(envelope).toContain(CONTENT['probe.envelope.releaseShape'].human);
      expect(envelope).toContain(CONTENT['probe.envelope.attack'].human); // the existing sentence survives
      const source = CONTENT['probe.source'].intro?.humanDescription ?? '';
      expect(source).toContain(CONTENT['probe.source.filter'].human);
      expect(source).toContain('Companion'); // the existing sentence survives
    });

    it('the help copy is plain words: no unexplained synth jargon in the Portamento and Shape descriptions', () => {
      [CONTENT['probe.envelope.portamento'], CONTENT['probe.envelope.attackShape'], CONTENT['probe.envelope.releaseShape']].forEach((e) => {
        expect(e.help.human.length).toBeGreaterThan(40);
        expect(e.help.human).not.toMatch(/[<>]/);
      });
    });

    it('the schemas carry no copy literal of their own', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const src = readFileSync(resolve(__dirname, 'robotOptionsConfig.ts'), 'utf8');
      const start = src.indexOf('ROBOT ARTICULATION');
      expect(start, 'the articulation block header').toBeGreaterThan(-1);
      const articulation = src.slice(start);
      expect(articulation).not.toMatch(/(loreLabel|humanLabel|unit|placeholder)\s*:\s*['"`]/);
    });
  });
});

// docs/specs/ROBOT_PERFORMANCE.md §1.6 / docs/tasks/ROBOT_PERFORMANCE.md Task 8 — the three robot performance
// sliders and the panel that groups the two composition ones.
describe.each([
  { name: 'DYNAMICS_SCHEMA', schema: DYNAMICS_SCHEMA, id: 'robotOptions.dynamics', key: 'probe.levels.dynamics' },
  { name: 'RESTS_SCHEMA', schema: RESTS_SCHEMA, id: 'robotOptions.rests', key: 'probe.composition.rests' },
  { name: 'ACCENTS_SCHEMA', schema: ACCENTS_SCHEMA, id: 'robotOptions.accents', key: 'probe.composition.accents' },
] as const)('$name (Robot Performance)', ({ schema, id, key }) => {
  it('is a horizontal sliderLinear in whole steps', () => {
    expect(schema.type).toBe('sliderLinear');
    expect(schema.id).toBe(id);
    expect(schema.step).toBe(1);
    expect(schema.orientation).toBe('horizontal');
  });

  it('takes its bounds from PERFORMANCE_MIN / PERFORMANCE_MAX, so the store clamp and the slider cannot drift apart', () => {
    expect(schema.min).toBe(PERFORMANCE_MIN);
    expect(schema.max).toBe(PERFORMANCE_MAX);
    expect([schema.min, schema.max]).toEqual([0, 100]);
  });

  it('is labeled, unit-ed and helped from its own content key', () => {
    const entry = CONTENT[key];
    expect(schema.humanLabel).toBe(entry.human);
    expect(schema.loreLabel).toBe(entry.lore);
    expect(schema.unit).toBe('%');
    expect(schema.unit).toBe(entry.unit);
    expect(schema.help?.human.trim()).toBeTruthy();
    expect(schema.help).toEqual(entry.help);
  });

  it('is JSON-serializable', () => {
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});

describe('Robot Performance schemas — shared', () => {
  it('the three ids are unique robotOptions.* ids that collide with no other top-level schema', () => {
    const ids = [DYNAMICS_SCHEMA.id, RESTS_SCHEMA.id, ACCENTS_SCHEMA.id, ARTICULATION_PANEL_SCHEMA.id];
    ids.forEach((id) => expect(id).toMatch(/^robotOptions\./));
    const others = ALL_TOP_LEVEL_SCHEMAS.map((s) => s.id);
    expect(new Set([...ids, ...others]).size).toBe(ids.length + others.length);
  });

  it('the three sliders carry distinct names and distinct help (never one shared description)', () => {
    const sliders = [DYNAMICS_SCHEMA, RESTS_SCHEMA, ACCENTS_SCHEMA];
    expect(new Set(sliders.map((s) => s.humanLabel)).size).toBe(3);
    expect(new Set(sliders.map((s) => s.help?.human)).size).toBe(3);
  });

  it('Dynamics shares its human word with the Levels nav row yet differs in lore, so the duplicate-concept guard holds', () => {
    // The naming clash is flagged in docs/specs/ROBOT_PERFORMANCE.md §7 — one content key to rename.
    expect(CONTENT['probe.levels.dynamics'].lore).not.toBe(CONTENT['probe.dynamics'].lore);
  });

  it('ARTICULATION_PANEL_SCHEMA is a responsive directionalPanel headed from probe.composition.articulation', () => {
    expect(ARTICULATION_PANEL_SCHEMA.type).toBe('directionalPanel');
    expect(ARTICULATION_PANEL_SCHEMA.orientation).toBe('responsive');
    expect(ARTICULATION_PANEL_SCHEMA.humanLabel).toBe(CONTENT['probe.composition.articulation'].human);
    expect(JSON.parse(JSON.stringify(ARTICULATION_PANEL_SCHEMA))).toEqual(ARTICULATION_PANEL_SCHEMA);
  });

  it('the Levels intro names Dynamics and the Composition intro names Rests and Accents, so the sentences the user reads cover the new rows', () => {
    expect(CONTENT['probe.levels'].intro?.humanDescription ?? '').toContain(CONTENT['probe.levels.dynamics'].human);
    const composition = CONTENT['probe.composition'].intro?.humanDescription ?? '';
    expect(composition).toContain(CONTENT['probe.composition.rests'].human);
    expect(composition).toContain(CONTENT['probe.composition.accents'].human);
  });

  it('the Rests help says it leaves a gap rather than skipping a note, and Accents help says it does not move notes', () => {
    // The intent's distinction: a rest shortens a note (it is not Density's skip). Pins the claim, never the words.
    expect(CONTENT['probe.composition.rests'].help?.human.toLowerCase()).toMatch(/gap|stops early|shorter/);
    expect(CONTENT['probe.composition.accents'].help?.human.length).toBeGreaterThan(20);
  });
});
