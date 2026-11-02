// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import { CLASSIC } from '../data/bands/classic';
import { ROBOT_LFO_TARGET_IDS, type LfoLaneId, type RobotLfoTargetId } from '../types/lfo';
import { getCentredSeededVal, getUniformSeededVal } from '../utils/getSeededVal';
import { pickLane } from '../utils/lfoLaneDraw';
import { quantizeToStep } from '../utils/math';
import { correlation, outerTenths } from '../testUtils/spread';
import { deriveEnvelopeFields } from './robotFieldDerivation';
import { generateRobotLfoLinks } from './spawnSystem';

// ========================================
// TESTS
// ========================================

// Even Seeded Draws (docs/specs/EVEN_SEEDED_DRAWS.md §5.1): generateRobotLfoLinks over seeded locale maps, mock-free
// (see spawnSystem.evenDraws.test.ts).
const ROBOTS_PER_WORLD = 12;

describe('generateRobotLfoLinks — even rolls and depths, the detune depth folded to the floor (Even Seeded Draws T8)', () => {
  // 5,000 worlds x 12 robots: only 13.5 % of robots carry a lit bus link, and at this size its depth tenths (about 9 %
  // each on the whole-percent grid) sit at least 3 standard deviations inside 8-12 %.
  const ZERO_COUNTS: Record<LfoLaneId, number> = { a: 0, b: 0, c: 0, d: 0 };
  const LINK_SLOTS = Array.from({ length: 5000 }, (_, i) => createNoise2D(alea(`links:${i}`))).flatMap((noiseMap) =>
    Array.from({ length: ROBOTS_PER_WORLD }, (_, offset) => ({ noiseMap, offset })),
  );
  const LINKS = LINK_SLOTS.map(({ noiseMap, offset }) => generateRobotLfoLinks(noiseMap, offset, ZERO_COUNTS));
  const litDepths = (targets: readonly RobotLfoTargetId[]) =>
    LINKS.flatMap((links) => targets.map((t) => links[t])).filter((l) => l.lane !== null).map((l) => l.depth);
  // The envelope stages of the first 12,000 robots, for the on-roll correlations: built here, not in the test, which
  // would outrun its timeout under a full parallel run.
  const ENVELOPES = LINK_SLOTS.slice(0, 12000).map(({ noiseMap, offset }) => deriveEnvelopeFields(noiseMap, offset, CLASSIC));
  const GAINS = ['layer0.gain', 'layer1.gain', 'layer2.gain'] as const;
  const DETUNES = ['layer0.detune', 'layer1.detune', 'layer2.detune'] as const;

  it('a lit gain or bus link\'s depth fills its window: 8-12 % of lit links in each outer tenth', () => {
    const windows = {
      gain: { depths: litDepths(GAINS), band: CLASSIC['robot.lfoGainDepth'] },
      bus: { depths: litDepths(['bus.frequency']), band: CLASSIC['robot.lfoBusDepth'] },
    };
    for (const [window, { depths, band }] of Object.entries(windows)) {
      const { bottom, top } = outerTenths(depths, band);
      expect(bottom, `${window} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${window} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${window} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${window} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  it('a lit detune link stays close to no detune: 1 % is the commonest depth (17-21 %), each percent rarer than the one below, median 3 %, at most 2.5 % at 10 %', () => {
    const depths = litDepths(DETUNES).sort((a, b) => a - b);
    const shares = Array.from({ length: 10 }, (_, k) => depths.filter((d) => d === k + 1).length / depths.length);
    expect(shares.every((share) => share > 0), 'every whole percent from 1 to 10 occurs').toBe(true);
    expect(shares[0], '1 %').toBeGreaterThanOrEqual(0.17);
    expect(shares[0], '1 %').toBeLessThanOrEqual(0.21);
    for (let k = 1; k < 10; k++) expect(shares[k], `${k + 1} % against ${k} %`).toBeLessThan(shares[k - 1]);
    expect(depths[Math.floor(depths.length / 2)]).toBe(3);
    expect(shares[9], '10 %').toBeLessThanOrEqual(0.025);
  });

  it('the seven on-rolls correlate under 0.1 with each other and with the four envelope stages', () => {
    const lit = Object.fromEntries(ROBOT_LFO_TARGET_IDS.map((t) => [t, LINKS.map((links) => (links[t].lane === null ? 0 : 1))]));
    for (let i = 0; i < ROBOT_LFO_TARGET_IDS.length; i++) {
      for (let j = i + 1; j < ROBOT_LFO_TARGET_IDS.length; j++) {
        const [a, b] = [ROBOT_LFO_TARGET_IDS[i], ROBOT_LFO_TARGET_IDS[j]];
        expect(Math.abs(correlation(lit[a], lit[b])), `${a} vs ${b}`).toBeLessThan(0.1);
      }
    }
    for (const stage of ['attack', 'decay', 'sustain', 'release'] as const) {
      const values = ENVELOPES.map((e) => e[stage]);
      for (const target of ROBOT_LFO_TARGET_IDS) {
        const onRolls = lit[target].slice(0, ENVELOPES.length);
        expect(Math.abs(correlation(values, onRolls)), `${stage} vs ${target} on-roll`).toBeLessThan(0.1);
      }
    }
  });

  it('guards: each layer target is lit for 25 % of robots (+/-2 points), the bus for 13.5 % (+/-2), the shares as fitted', () => {
    for (const target of ROBOT_LFO_TARGET_IDS) {
      const share = LINKS.filter((links) => links[target].lane !== null).length / LINKS.length;
      const want = target === 'bus.frequency' ? 0.135 : 0.25;
      expect(share, target).toBeGreaterThanOrEqual(want - 0.02);
      expect(share, target).toBeLessThanOrEqual(want + 0.02);
    }
  });

  it('each roll, lane and depth is the even draw at its own dataId and offset, a detune depth the folded centred one', () => {
    for (const { noiseMap, offset } of LINK_SLOTS.slice(0, 120)) {
      const links = generateRobotLfoLinks(noiseMap, offset, ZERO_COUNTS);
      const counts = { ...ZERO_COUNTS };
      for (const target of ROBOT_LFO_TARGET_IDS) {
        const band = target === 'bus.frequency' ? CLASSIC['robot.lfoBusDepth'] : target.endsWith('.gain') ? CLASSIC['robot.lfoGainDepth'] : CLASSIC['robot.lfoDetuneDepth'];
        const even = (part: string, min = 0, max = 1) => getUniformSeededVal(noiseMap, `robot.lfo.${target}.${part}`, offset, min, max);
        if (even('quiet') < 1 - band.lit) {
          expect(links[target], target).toEqual({ lane: null, depth: 0 });
          continue;
        }
        const lane = pickLane(even('lane'), counts);
        counts[lane]++;
        const depth = target.endsWith('.detune')
          ? band.min + Math.min(band.max - band.min, Math.floor(Math.abs(getCentredSeededVal(noiseMap, `robot.lfo.${target}.depth`, offset, -1, 1)) * (band.max - band.min + 1)))
          : quantizeToStep(even('depth', band.min, band.max), 0, 1);
        expect(links[target], target).toEqual({ lane, depth });
      }
    }
  });
});
