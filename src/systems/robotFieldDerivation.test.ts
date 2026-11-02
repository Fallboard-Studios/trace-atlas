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
import { composeSends, deriveEnvelopeFields, deriveMelodyFields, deriveSendFields, deriveVoiceFields, seedToggleValue } from './robotFieldDerivation';

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
