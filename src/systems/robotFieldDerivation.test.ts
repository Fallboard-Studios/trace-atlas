// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import { ENVELOPE_CURVE_NAMES } from '../types/Robot';
import { CLASSIC } from '../data/bands/classic';
import { getCentredSeededVal, getSeededVal, getUniformSeededVal } from '../utils/getSeededVal';
import { quantizeToStep } from '../utils/math';
import { ROBOT_BUS_FILTER_Q } from '../constants';
import { correlation, outerTenths } from '../testUtils/spread';
import {
  composeSends,
  deriveEnvelopeFields,
  deriveMelodyFields,
  deriveMotionFields,
  deriveOctaveRange,
  deriveSendFields,
  deriveVoiceFields,
  seedToggleValue,
} from './robotFieldDerivation';

// ========================================
// THE SAMPLE
// ========================================
// Even Seeded Draws (docs/specs/EVEN_SEEDED_DRAWS.md §5.1): the real generators over seeded locale maps, about 400
// worlds x 12 robots, as the measuring harness runs them. A share is held to +/-2 points, a correlation to |r| < 0.1.
const WORLD_COUNT = 400;
const ROBOTS_PER_WORLD = 12;
const WORLDS = Array.from({ length: WORLD_COUNT }, (_, i) => createNoise2D(alea(`${i * 37 - 7000}:${i * 91 - 18000}`)));
const ROBOT_SLOTS = WORLDS.flatMap((noiseMap) => Array.from({ length: ROBOTS_PER_WORLD }, (_, offset) => ({ noiseMap, offset })));

// ========================================
// TESTS
// ========================================

describe('deriveEnvelopeFields — even draws (Even Seeded Draws T4)', () => {
  const ENVELOPES = ROBOT_SLOTS.map(({ noiseMap, offset }) => deriveEnvelopeFields(noiseMap, offset, CLASSIC));
  const NON_LINEAR = ENVELOPE_CURVE_NAMES.filter((name) => name !== 'linear');

  it('a linear robot fills each stage band: 8-12 % of robots in each outer tenth of attack, decay, sustain and release', () => {
    const stages = {
      attack: { values: ENVELOPES.filter((e) => e.attackCurve === 'linear').map((e) => e.attack), band: CLASSIC['robot.attack'] },
      decay: { values: ENVELOPES.map((e) => e.decay), band: CLASSIC['robot.decay'] },
      sustain: { values: ENVELOPES.map((e) => e.sustain), band: CLASSIC['robot.sustain'] },
      release: { values: ENVELOPES.filter((e) => e.releaseCurve === 'linear').map((e) => e.release), band: CLASSIC['robot.release'] },
    };
    for (const [stage, { values, band }] of Object.entries(stages)) {
      const { bottom, top } = outerTenths(values, band);
      expect(bottom, `${stage} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${stage} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${stage} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${stage} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  it('decay and sustain correlate under 0.1 with each other and with attack and release', () => {
    const series = {
      attack: ENVELOPES.map((e) => e.attack),
      decay: ENVELOPES.map((e) => e.decay),
      sustain: ENVELOPES.map((e) => e.sustain),
      release: ENVELOPES.map((e) => e.release),
    };
    const pairs = [['decay', 'sustain'], ['decay', 'attack'], ['decay', 'release'], ['sustain', 'attack'], ['sustain', 'release']] as const;
    for (const [a, b] of pairs) {
      expect(Math.abs(correlation(series[a], series[b])), `${a} vs ${b}`).toBeLessThan(0.1);
    }
  });

  it('every non-linear curve is drawn by at least 15 % of the robots that shape that stage', () => {
    // Six curves split about 730 shaped robots per stage in the main sample: one curve's share then varies by about 1.4
    // points around its even 16.7 %, so this case draws 24,000 robots (about 3,700 shaped, 0.6 points).
    const wide = Array.from({ length: 2000 }, (_, i) => createNoise2D(alea(`curves:${i}`))).flatMap((noiseMap) =>
      Array.from({ length: ROBOTS_PER_WORLD }, (_, offset) => deriveEnvelopeFields(noiseMap, offset, CLASSIC)),
    );
    for (const stage of ['attackCurve', 'releaseCurve'] as const) {
      const shaped = wide.filter((e) => e[stage] !== 'linear');
      for (const curve of NON_LINEAR) {
        const share = shaped.filter((e) => e[stage] === curve).length / shaped.length;
        expect(share, `${stage} ${curve}`).toBeGreaterThanOrEqual(0.15);
      }
    }
  });

  it('guard: 15.5 % of robots shape their attack and 15 % their release (+/-2 points), the shares as heard', () => {
    const shapedAttack = ENVELOPES.filter((e) => e.attackCurve !== 'linear').length / ENVELOPES.length;
    const shapedRelease = ENVELOPES.filter((e) => e.releaseCurve !== 'linear').length / ENVELOPES.length;
    expect(shapedAttack).toBeGreaterThanOrEqual(0.135);
    expect(shapedAttack).toBeLessThanOrEqual(0.175);
    expect(shapedRelease).toBeGreaterThanOrEqual(0.13);
    expect(shapedRelease).toBeLessThanOrEqual(0.17);
  });

  it('each stage and each curve roll is the even draw at its own dataId and the robot\'s offset', () => {
    const shapedAttack = CLASSIC['robot.shapedAttack'];
    const shapedRelease = CLASSIC['robot.shapedRelease'];
    for (const { noiseMap, offset } of ROBOT_SLOTS.slice(0, 120)) {
      const e = deriveEnvelopeFields(noiseMap, offset, CLASSIC);
      const even = (dataId: string, band: { min: number; max: number }, at = offset) => getUniformSeededVal(noiseMap, dataId, at, band.min, band.max);
      const unit = { min: 0, max: 1 };
      expect(e.attackCurve === 'linear').toBe(even('robot.audio.attackCurve.shaped', unit) >= shapedAttack.lit);
      expect(e.releaseCurve === 'linear').toBe(even('robot.audio.releaseCurve.shaped', unit) >= shapedRelease.lit);
      if (e.attackCurve !== 'linear') {
        expect(e.attackCurve).toBe(NON_LINEAR[Math.floor(even('robot.audio.attackCurve.which', { min: 0, max: NON_LINEAR.length }, offset * 10 + 1))]);
      }
      if (e.releaseCurve !== 'linear') {
        expect(e.releaseCurve).toBe(NON_LINEAR[Math.floor(even('robot.audio.releaseCurve.which', { min: 0, max: NON_LINEAR.length }, offset * 10 + 1))]);
      }
      expect(e.attack).toBe(even('robot.audio.attack', e.attackCurve === 'linear' ? CLASSIC['robot.attack'] : shapedAttack));
      expect(e.decay).toBe(even('robot.audio.decay', CLASSIC['robot.decay']));
      expect(e.sustain).toBe(even('robot.audio.sustain', CLASSIC['robot.sustain']));
      expect(e.release).toBe(even('robot.audio.release', e.releaseCurve === 'linear' ? CLASSIC['robot.release'] : shapedRelease));
    }
  });
});

describe('deriveMelodyFields — even draws (Even Seeded Draws T5)', () => {
  const MELODY = ROBOT_SLOTS.map(({ noiseMap, offset }) => deriveMelodyFields(noiseMap, offset, CLASSIC));
  const TOGGLES = ['rhythmicMotifLength', 'noteVariance'] as const;

  it('density and pitch repeat fill their bands: 8-12 % of robots in each outer tenth', () => {
    const fields = {
      rhythmicDensity: CLASSIC['robot.rhythmicDensity'],
      pitchRepeat: CLASSIC['robot.pitchRepeat'],
    } as const;
    for (const [field, band] of Object.entries(fields) as [keyof typeof fields, (typeof fields)[keyof typeof fields]][]) {
      const { bottom, top } = outerTenths(MELODY.map((m) => m[field]), band);
      expect(bottom, `${field} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${field} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${field} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${field} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  it('Motif Length and Note Variance are each off for 15 % of robots (+/-2 points), the written offShare', () => {
    for (const toggle of TOGGLES) {
      const off = MELODY.filter((m) => !m[toggle].active).length / MELODY.length;
      expect(off, toggle).toBeGreaterThanOrEqual(0.13);
      expect(off, toggle).toBeLessThanOrEqual(0.17);
    }
  });

  it('an on toggle spreads across 1-8: each value is 9-16 % of the robots with it on', () => {
    for (const toggle of TOGGLES) {
      const on = MELODY.filter((m) => m[toggle].active);
      for (let value = 1; value <= 8; value++) {
        const share = on.filter((m) => m[toggle].value === value).length / on.length;
        expect(share, `${toggle} ${value}`).toBeGreaterThanOrEqual(0.09);
        expect(share, `${toggle} ${value}`).toBeLessThanOrEqual(0.16);
      }
    }
  });

  it('density correlates under 0.1 with sustain and with the glider roll', () => {
    const density = MELODY.map((m) => m.rhythmicDensity);
    const sustain = ROBOT_SLOTS.map(({ noiseMap, offset }) => deriveEnvelopeFields(noiseMap, offset, CLASSIC).sustain);
    const gliderRoll = ROBOT_SLOTS.map(({ noiseMap, offset }) => getSeededVal(noiseMap, 'robot.audio.portamento.glider', offset, 0, 1));
    expect(Math.abs(correlation(density, sustain)), 'density vs sustain').toBeLessThan(0.1);
    expect(Math.abs(correlation(density, gliderRoll)), 'density vs glider roll').toBeLessThan(0.1);
  });

  it('each melody field is the even draw at its own dataId and the robot\'s offset', () => {
    for (const { noiseMap, offset } of ROBOT_SLOTS.slice(0, 120)) {
      const m = deriveMelodyFields(noiseMap, offset, CLASSIC);
      const density = CLASSIC['robot.rhythmicDensity'];
      const repeat = CLASSIC['robot.pitchRepeat'];
      expect(m.rhythmicDensity).toBe(Math.round(getUniformSeededVal(noiseMap, 'robot.rhythmicDensity', offset, density.min, density.max)));
      expect(m.pitchRepeat).toBe(Math.round(getUniformSeededVal(noiseMap, 'robot.pitchRepeat', offset, repeat.min, repeat.max)));
      expect(m.rhythmicMotifLength).toEqual(
        seedToggleValue(getUniformSeededVal(noiseMap, 'robot.rhythmicMotifLength.active', offset), CLASSIC['robot.rhythmicMotifLength']),
      );
      expect(m.noteVariance).toEqual(seedToggleValue(getUniformSeededVal(noiseMap, 'robot.noteVariance.active', offset), CLASSIC['robot.noteVariance']));
    }
  });
});

describe('deriveVoiceFields — even draws, the layer detune centred (Even Seeded Draws T6)', () => {
  // About a fifth of robots carry the accent filter, so the accent cases need more robots than the shared sample: at
  // 12,000 (1,000 worlds) every tolerance below is at least 3 standard deviations of its share.
  const VOICE_SLOTS = Array.from({ length: 1000 }, (_, i) => createNoise2D(alea(`voice:${i}`))).flatMap((noiseMap) =>
    Array.from({ length: ROBOTS_PER_WORLD }, (_, offset) => ({ noiseMap, offset })),
  );
  const VOICES = VOICE_SLOTS.map(({ noiseMap, offset }) => deriveVoiceFields(noiseMap, offset, CLASSIC));
  const isAccent = (v: (typeof VOICES)[number]) => v.filterQ !== ROBOT_BUS_FILTER_Q;
  const WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth', 'pulse'] as const;

  it('each waveform is the base waveform of 20 % of robots (+/-2 points) under Classic\'s equal weights', () => {
    for (const wave of WAVEFORMS) {
      const share = VOICES.filter((v) => v.waveform === wave).length / VOICES.length;
      expect(share, wave).toBeGreaterThanOrEqual(0.18);
      expect(share, wave).toBeLessThanOrEqual(0.22);
    }
  });

  it('both cutoffs fill their bands: 8-12 % of common robots, and of accent robots, in each outer tenth of their band', () => {
    const tiers = {
      common: { values: VOICES.filter((v) => !isAccent(v)).map((v) => v.filterFreq), band: CLASSIC['robot.filterFreq'] },
      accent: { values: VOICES.filter(isAccent).map((v) => v.filterFreq), band: CLASSIC['robot.accentFilterFreq'] },
    };
    for (const [tier, { values, band }] of Object.entries(tiers)) {
      const { bottom, top } = outerTenths(values, band);
      expect(bottom, `${tier} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${tier} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${tier} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${tier} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  it('the layer detune is centred on 0 cents: median 0, 1-3.5 % of layers at each end of +/-2, every whole cent from -2 to 2', () => {
    const detunes = VOICES.flatMap((v) => (v.layers ?? []).map((l) => l.detune)).sort((a, b) => a - b);
    expect(detunes[Math.floor(detunes.length / 2)]).toBe(0);
    for (const end of [-2, 2]) {
      const share = detunes.filter((d) => d === end).length / detunes.length;
      expect(share, `detune ${end}`).toBeGreaterThanOrEqual(0.01);
      expect(share, `detune ${end}`).toBeLessThanOrEqual(0.035);
    }
    expect(new Set(detunes)).toEqual(new Set([-2, -1, 0, 1, 2]));
  });

  it('guards: 20 % of robots carry the accent filter (+/-2), 40 % of those are bandpass (+/-3), layers 1 and 2 each quiet for 50 % (+/-3)', () => {
    const accents = VOICES.filter(isAccent);
    const accentShare = accents.length / VOICES.length;
    expect(accentShare).toBeGreaterThanOrEqual(0.18);
    expect(accentShare).toBeLessThanOrEqual(0.22);
    const bandpass = accents.filter((v) => v.filterType === 'bandpass').length / accents.length;
    expect(bandpass).toBeGreaterThanOrEqual(0.37);
    expect(bandpass).toBeLessThanOrEqual(0.43);
    for (const layer of [1, 2]) {
      const quiet = VOICES.filter((v) => v.layers?.[layer].gain === 0).length / VOICES.length;
      expect(quiet, `layer ${layer}`).toBeGreaterThanOrEqual(0.47);
      expect(quiet, `layer ${layer}`).toBeLessThanOrEqual(0.53);
    }
  });

  it('each voice field is the even draw at its own dataId and offset, and the layer detune the centred draw', () => {
    const accentBand = CLASSIC['robot.accentFilterFreq'];
    const layerGain = CLASSIC['robot.layerGain'];
    const even = (noiseMap: (typeof VOICE_SLOTS)[number]['noiseMap'], dataId: string, offset: number, min = 0, max = 1) =>
      getUniformSeededVal(noiseMap, dataId, offset, min, max);
    for (const { noiseMap, offset } of VOICE_SLOTS.slice(0, 120)) {
      const v = deriveVoiceFields(noiseMap, offset, CLASSIC);
      const accent = even(noiseMap, 'robot.audio.filter.accent', offset) < accentBand.lit;
      const range = accent ? accentBand : CLASSIC['robot.filterFreq'];
      expect(isAccent(v)).toBe(accent);
      expect(v.filterFreq).toBe(even(noiseMap, 'robot.audio.filterFreq', offset, range.min, range.max));
      if (accent) {
        const q = CLASSIC['robot.accentFilterQ'];
        expect(v.filterQ).toBe(quantizeToStep(even(noiseMap, 'robot.audio.filterQ', offset, q.min, q.max), 0, 0.1));
        expect(v.filterType === 'bandpass').toBe(even(noiseMap, 'robot.audio.filter.type', offset) < 0.4);
      }
      expect(v.waveform).toBe(WAVEFORMS[Math.floor(even(noiseMap, 'robot.audio.waveform', offset, 0, 5))]);
      (v.layers ?? []).forEach((layer, i) => {
        const layerOffset = offset * 10 + i;
        const quiet = i !== 0 && even(noiseMap, 'robot.audio.layer.quiet', layerOffset) < 1 - layerGain.lit;
        expect(layer.type).toBe(WAVEFORMS[Math.floor(even(noiseMap, 'robot.audio.layer.waveform', layerOffset, 0, 5))]);
        expect(layer.gain).toBe(quiet ? 0 : quantizeToStep(even(noiseMap, 'robot.audio.layer.gain', layerOffset, layerGain.min, layerGain.max), 0, 0.01));
        expect(layer.detune).toBe(quantizeToStep(getCentredSeededVal(noiseMap, 'robot.audio.layer.detune', layerOffset, -2, 2), 0, 1));
        expect(layer.phase).toBe(Math.floor(even(noiseMap, 'robot.audio.layer.phase', layerOffset, 0, 361)) || 0);
      });
    }
  });
});

describe('deriveSendFields — the Reverb and Delay sends draw even (Even Seeded Draws T9a)', () => {
  // 1,000 worlds x 12 robots: about 9,000 carry a delay, so each share below sits at least 3 standard deviations inside
  // its bounds.
  const SEND_SLOTS = Array.from({ length: 1000 }, (_, i) => createNoise2D(alea(`sends:${i}`))).flatMap((noiseMap) =>
    Array.from({ length: ROBOTS_PER_WORLD }, (_, offset) => ({ noiseMap, offset })),
  );
  const SENDS = SEND_SLOTS.map(({ noiseMap, offset }) => deriveSendFields(noiseMap, offset, CLASSIC));

  it('the Delay is off for 25 % of robots (+/-2 points), the written quiet share; the Reverb never is under Classic', () => {
    const noDelay = SENDS.filter((s) => s.delaySend === 0).length / SENDS.length;
    expect(noDelay).toBeGreaterThanOrEqual(0.23);
    expect(noDelay).toBeLessThanOrEqual(0.27);
    expect(SENDS.every((s) => s.reverbSend > 0)).toBe(true);
  });

  it('each depth reaches every 1 % step of its band, and its bottom and top fifths each hold 15-25 % of the robots carrying it', () => {
    // The sends sit on a 1 % grid, so an even draw puts 19 / 21 % of Reverb depths and 18.3 / 21.7 % of Delay depths in
    // the two fifths, not exactly 20 %.
    const depths = {
      reverb: { values: SENDS.map((s) => s.reverbSend), band: CLASSIC.reverbSend },
      delay: { values: SENDS.map((s) => s.delaySend).filter((d) => d > 0), band: CLASSIC.delaySend },
    };
    for (const [send, { values, band }] of Object.entries(depths)) {
      const steps = Math.round((band.max - band.min) * 100);
      const seen = new Set(values.map((v) => Math.round(v * 100)));
      // The Delay's 0 % step is also "no delay"; a quiet robot is not counted as a carrier.
      for (let k = send === 'delay' ? 1 : 0; k <= steps; k++) expect(seen.has(Math.round(band.min * 100) + k), `${send} ${band.min * 100 + k} %`).toBe(true);
      const fifth = (band.max - band.min) / 5;
      const bottom = values.filter((v) => v < band.min + fifth - 1e-9).length / values.length;
      const top = values.filter((v) => v >= band.max - fifth - 1e-9).length / values.length;
      for (const [end, share] of [['bottom', bottom], ['top', top]] as const) {
        expect(share, `${send} ${end} fifth`).toBeGreaterThanOrEqual(0.15);
        expect(share, `${send} ${end} fifth`).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it('the two depths, the Delay roll and the envelope\'s decay correlate under 0.1', () => {
    const reverb = SENDS.map((s) => s.reverbSend);
    const delayOn = SENDS.map((s) => (s.delaySend > 0 ? 1 : 0));
    const decay = SEND_SLOTS.map(({ noiseMap, offset }) => deriveEnvelopeFields(noiseMap, offset, CLASSIC).decay);
    const carriers = SENDS.map((s, i) => ({ s, i })).filter(({ s }) => s.delaySend > 0);
    const pairs: [string, number[], number[]][] = [
      ['reverb vs delay on', reverb, delayOn],
      ['reverb vs decay', reverb, decay],
      ['delay on vs decay', delayOn, decay],
      ['reverb vs delay depth', carriers.map(({ s }) => s.reverbSend), carriers.map(({ s }) => s.delaySend)],
      ['delay depth vs decay', carriers.map(({ s }) => s.delaySend), carriers.map(({ i }) => decay[i])],
    ];
    for (const [name, a, b] of pairs) expect(Math.abs(correlation(a, b)), name).toBeLessThan(0.1);
  });

  it('each send is composeSends of the four even draws at their own dataIds and the robot\'s offset', () => {
    // Classic's Reverb lit of 1 never rolls quiet, so its quiet roll is also checked under a Reverb row lit at 0.5.
    const halfLitReverb = { ...CLASSIC, reverbSend: { ...CLASSIC.reverbSend, lit: 0.5 } };
    for (const bands of [CLASSIC, halfLitReverb]) {
      for (const { noiseMap, offset } of SEND_SLOTS.slice(0, 120)) {
        const even = (dataId: string, min = 0, max = 1) => getUniformSeededVal(noiseMap, dataId, offset, min, max);
        const { reverbSend, delaySend } = bands;
        const expected = composeSends(
          even('robot.send.reverb', reverbSend.min, reverbSend.max),
          even('robot.send.delay', delaySend.min, delaySend.max),
          even('robot.send.reverb.quiet'),
          even('robot.send.delay.quiet'),
          bands,
        );
        const sends = deriveSendFields(noiseMap, offset, bands);
        expect({ reverbSend: sends.reverbSend, delaySend: sends.delaySend }).toEqual(expected);
      }
    }
  });
});

// docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6: two robot keys new at the cut, each Classic's band its draw as it stood.
describe('the two new robot keys: robot.detune and robot.octaveRegister (themes-58 T6)', () => {
  /** The old draws, typed in from main at 3c188fec, not read from the code under test. */
  const OLD_REGISTERS = [[1, 3], [2, 4], [3, 5], [4, 6], [5, 7]] as const;
  const oldRegister = (noiseMap: (x: number, y: number) => number, offset: number) =>
    OLD_REGISTERS[Math.min(4, Math.floor(getUniformSeededVal(noiseMap, 'robot.audio.register', offset, 0, 5)))];
  const oldLayerDetune = (noiseMap: (x: number, y: number) => number, layerOffset: number) =>
    quantizeToStep(getCentredSeededVal(noiseMap, 'robot.audio.layer.detune', layerOffset, -2, 2), 0, 1);

  it('under Classic the register is the old even pick, robot for robot', () => {
    for (const { noiseMap, offset } of ROBOT_SLOTS) {
      expect(deriveOctaveRange(noiseMap, offset, CLASSIC['robot.octaveRegister'])).toEqual([...oldRegister(noiseMap, offset)]);
    }
  });

  it('under Classic every layer detune is the old centred draw, layer for layer', () => {
    for (const { noiseMap, offset } of ROBOT_SLOTS) {
      const layers = deriveVoiceFields(noiseMap, offset, CLASSIC).layers!;
      layers.forEach((layer, i) => expect(layer.detune).toBe(oldLayerDetune(noiseMap, offset * 10 + i)));
    }
  });

  it('a register pick weighing one register alone lands every robot on it; a zero weight is never drawn', () => {
    const lowOnly = { weights: { bass: 0, low: 1, mid: 0, high: 0, treble: 0 } };
    for (const { noiseMap, offset } of ROBOT_SLOTS.slice(0, 600)) {
      expect(deriveOctaveRange(noiseMap, offset, lowOnly)).toEqual([2, 4]);
    }
    const noTreble = { weights: { bass: 1, low: 1, mid: 1, high: 1, treble: 0 } };
    const ranges = ROBOT_SLOTS.map(({ noiseMap, offset }) => deriveOctaveRange(noiseMap, offset, noTreble));
    expect(ranges.some((r) => r[0] === 5)).toBe(false);
    expect(ranges.some((r) => r[0] === 4)).toBe(true);
  });

  it('a register pick leaning low weights its share: bass 3 of 4 lands near three quarters of the robots in the bass', () => {
    const lean = { weights: { bass: 3, low: 1, mid: 0, high: 0, treble: 0 } };
    const ranges = ROBOT_SLOTS.map(({ noiseMap, offset }) => deriveOctaveRange(noiseMap, offset, lean));
    const bass = ranges.filter((r) => r[0] === 1).length / ranges.length;
    expect(bass).toBeGreaterThan(0.73);
    expect(bass).toBeLessThan(0.77);
    expect(ranges.every((r) => r[0] === 1 || r[0] === 2)).toBe(true);
  });

  it('a detune band moves every layer inside it: none at all, or wide apart', () => {
    for (const { noiseMap, offset } of ROBOT_SLOTS.slice(0, 600)) {
      const none = deriveVoiceFields(noiseMap, offset, { ...CLASSIC, 'robot.detune': { min: 0, max: 0 } }).layers!;
      expect(none.map((layer) => layer.detune)).toEqual([0, 0, 0]);
      const wide = deriveVoiceFields(noiseMap, offset, { ...CLASSIC, 'robot.detune': { min: -20, max: 20 } }).layers!;
      for (const layer of wide) {
        expect(layer.detune).toBeGreaterThanOrEqual(-20);
        expect(layer.detune).toBeLessThanOrEqual(20);
      }
    }
    const spread = ROBOT_SLOTS.slice(0, 600).flatMap(({ noiseMap, offset }) =>
      deriveVoiceFields(noiseMap, offset, { ...CLASSIC, 'robot.detune': { min: -20, max: 20 } }).layers!.map((l) => Math.abs(l.detune)),
    );
    expect(Math.max(...spread)).toBeGreaterThan(10);
  });
});

// docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7a (Motion): the glide and the LFO links, lifted out of spawnSystem.ts into
// the family's one derivation at their dataIds and offsets.
describe('deriveMotionFields — the Motion family (themes-58 T7a)', () => {
  // Classic parity: the fresh robots of generateRobotRosterBaseline(createNoise2D(alea('motion-parity-a')), 8) as the
  // generators drew them before the lift (HEAD b35a8558, captured 2026-11-03 and typed in, not read back), each with the
  // lane tally of the robots before it. Two gliders, and lit gain, detune and bus links among them.
  const PARITY = [
    { offset: 0, prior: { a: 0, b: 0, c: 0, d: 0 }, portamento: 0,
      lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: null, depth: 0 }, 'layer1.detune': { lane: 'c', depth: 3 }, 'layer2.gain': { lane: 'a', depth: 26 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: null, depth: 0 } } },
    { offset: 1, prior: { a: 1, b: 0, c: 1, d: 0 }, portamento: 0,
      lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: 'b', depth: 1 }, 'layer1.gain': { lane: 'b', depth: 34 }, 'layer1.detune': { lane: 'd', depth: 3 }, 'layer2.gain': { lane: null, depth: 0 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: null, depth: 0 } } },
    { offset: 2, prior: { a: 1, b: 2, c: 1, d: 1 }, portamento: 0.14,
      lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: null, depth: 0 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: 'd', depth: 53 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: 'a', depth: 6 } } },
    { offset: 3, prior: { a: 2, b: 2, c: 1, d: 2 }, portamento: 0,
      lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: null, depth: 0 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: null, depth: 0 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: 'd', depth: 12 } } },
    { offset: 4, prior: { a: 2, b: 2, c: 1, d: 3 }, portamento: 0,
      lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: 'c', depth: 47 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: 'b', depth: 46 }, 'layer2.detune': { lane: 'a', depth: 7 }, 'bus.frequency': { lane: null, depth: 0 } } },
    { offset: 5, prior: { a: 3, b: 3, c: 2, d: 3 }, portamento: 0.07,
      lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: null, depth: 0 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: null, depth: 0 }, 'layer2.detune': { lane: 'a', depth: 3 }, 'bus.frequency': { lane: 'c', depth: 10 } } },
    { offset: 7, prior: { a: 4, b: 3, c: 3, d: 4 }, portamento: 0,
      lfoLinks: { 'layer0.gain': { lane: 'a', depth: 19 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: null, depth: 0 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: null, depth: 0 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: null, depth: 0 } } },
  ];
  const PARITY_MAP = createNoise2D(alea('motion-parity-a'));

  it('under Classic returns, robot for robot, the glide and the links the generators drew before the lift', () => {
    for (const { offset, prior, portamento, lfoLinks } of PARITY) {
      expect(deriveMotionFields(PARITY_MAP, offset, CLASSIC, prior), `robot ${offset}`).toEqual({ portamento, lfoLinks });
    }
  });

  it('leaves the lane tally it is handed alone', () => {
    const prior = { a: 1, b: 2, c: 3, d: 4 };
    deriveMotionFields(PARITY_MAP, 0, CLASSIC, prior);
    expect(prior).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  describe('under an injected option column, over 500 robots (spec §1.5: a band is heard as written)', () => {
    const NONE = { a: 0, b: 0, c: 0, d: 0 };
    const BANDS = {
      ...CLASSIC,
      'robot.portamento': { min: 0.5, max: 0.8, lit: 0.6 },
      'robot.lfoGainDepth': { min: 20, max: 30, lit: 0.5 },
      'robot.lfoDetuneDepth': { min: 3, max: 6, lit: 0.4 },
      'robot.lfoBusDepth': { min: 10, max: 15, lit: 0.3 },
    };
    const SLOTS = ROBOT_SLOTS.slice(0, 500);
    const DRAWN = SLOTS.map(({ noiseMap, offset }) => deriveMotionFields(noiseMap, offset, BANDS, NONE));
    const share = (hits: number, of: number) => hits / of;

    it('the glide: a glider share within 3 points of the band\'s lit, every glide inside the band, every other robot 0', () => {
      const gliders = DRAWN.filter((m) => m.portamento > 0);
      expect(Math.abs(share(gliders.length, DRAWN.length) - 0.6)).toBeLessThan(0.03);
      for (const { portamento } of gliders) {
        expect(portamento).toBeGreaterThanOrEqual(0.5);
        expect(portamento).toBeLessThanOrEqual(0.8);
      }
    });

    it.each([
      ['gain', (t: string) => t.endsWith('.gain'), 0.5, 20, 30],
      ['detune', (t: string) => t.endsWith('.detune'), 0.4, 3, 6],
      ['bus', (t: string) => t === 'bus.frequency', 0.3, 10, 15],
    ] as const)('the %s links: a lit share within 3 points of the band\'s lit, every lit depth inside the band', (_, isTarget, lit, min, max) => {
      const links = DRAWN.flatMap((m) => Object.entries(m.lfoLinks).filter(([t]) => isTarget(t)).map(([, link]) => link));
      const lit_ = links.filter((link) => link.lane !== null);
      expect(Math.abs(share(lit_.length, links.length) - lit)).toBeLessThan(0.03);
      for (const { depth } of lit_) {
        expect(depth).toBeGreaterThanOrEqual(min);
        expect(depth).toBeLessThanOrEqual(max);
      }
      for (const link of links.filter((l) => l.lane === null)) expect(link.depth).toBe(0);
    });
  });
});
