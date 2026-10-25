// ========================================
// worldLinkFixtures — test helper (Short World Link)
// ========================================
// The two payloads the seed-diff, codec and world-link tests share (docs/tasks/SHORT_WORLD_LINK.md Tasks 3, 4, 6).
// Both are built by hand from the regenerated baseline, never through fillWorldFromSeed, so they can check it.

import { generateWorldSeedBaseline } from '../utils/seedBaseline';
import type { SessionPayload } from '../types/session';
import type { Company } from '../types/Company';

export const FIXTURE_NAME = 'n40dh8p8';
export const FIXTURE_COORDINATES = { x: 29, y: -14 };

/** What buildSessionPayload produces for a world nobody touched: every world-level field is the seed's. */
export function untouchedWorld(
  name: string = FIXTURE_NAME,
  coordinates: { x: number; y: number } = FIXTURE_COORDINATES
): SessionPayload {
  const b = structuredClone(generateWorldSeedBaseline(name));
  return {
    version: 2,
    attenuationStyleName: name,
    coordinates: { ...coordinates },
    globalAudio: b.globalAudio,
    lfoBank: b.lfoBank,
    globalLfoLinks: b.globalLfoLinks,
    bpm: b.bpm,
    swellFrequency: b.swellFrequency,
    swellDuration: b.swellDuration,
    humanize: b.humanize,
    pingVarianceAutomation: b.pingVarianceAutomation,
    robotOverrides: {},
    companyDiffs: {},
    userCreatedCompanies: [],
  };
}

export const EDITED_USER_COMPANY: Company = {
  id: 'user-company-1',
  name: 'Ärger & Co — 7',
  color: '#3a7bd5',
  robotIds: ['robot-5'],
};

/**
 * Every world-level field off its seed, with a distinct non-default value in each (the parity-fixture rule): every
 * Audio Rig block nudged on its first numeric leaf and the Delay's seeded `sync` dropped as well, `compressorBeforeDelay`
 * on, each lane edited a different way (lane b loses its seeded `sync`, lane c gains one), two global links moved (one
 * lit, one silenced), each pacing scalar moved, twelve robots with two fields each, one company diff, one user company.
 * The lane and Delay edits assume a name whose lane b and Delay are seeded Sync and lane c Free, as `n40dh8p8` is;
 * the tests assert that precondition.
 */
export function fullyEditedWorld(
  name: string = FIXTURE_NAME,
  coordinates: { x: number; y: number } = FIXTURE_COORDINATES
): SessionPayload {
  const p = untouchedWorld(name, coordinates);
  const blocks = p.globalAudio as unknown as Record<string, unknown>;
  Object.keys(blocks).forEach((key, i) => {
    const block = blocks[key];
    if (typeof block === 'boolean') {
      blocks[key] = !block;
      return;
    }
    const record = block as Record<string, unknown>;
    const leaf = Object.keys(record).find((k) => typeof record[k] === 'number');
    if (leaf === undefined) throw new Error(`fixture: block ${key} has no numeric leaf to edit`);
    record[leaf] = (record[leaf] as number) + (i + 1) / 1000;
  });
  delete p.globalAudio.delay.sync;

  const bank = p.lfoBank!;
  bank.a = { ...bank.a, rate: bank.a.rate + 0.1 };
  const { sync: _laneBSync, ...laneBFree } = bank.b;
  bank.b = laneBFree;
  bank.c = { ...bank.c, sync: { division: '1/8', modifier: 'triplet' } };
  bank.d = { ...bank.d, depthDrift: bank.d.depthDrift === 0.5 ? 0.25 : 0.5 };

  const links = p.globalLfoLinks!;
  links['eq3.low'] = { lane: 'b', depth: 33 };
  links['hpf.Q'] = { lane: null, depth: 0 };

  p.bpm = p.bpm! + 7;
  p.swellFrequency = p.swellFrequency! + 1;
  p.swellDuration = p.swellDuration! + 1;
  p.humanize = p.humanize! + 1;
  p.pingVarianceAutomation = p.pingVarianceAutomation === 0.6 ? 0.2 : 0.6;

  for (let i = 0; i < 12; i++) {
    p.robotOverrides[`robot-${i}`] = { pan: (i - 6) / 10, reverbSend: i / 20 };
  }
  p.companyDiffs['company-0'] = { name: 'Night Shift', robotIds: ['robot-0', 'robot-3'] };
  p.userCreatedCompanies = [structuredClone(EDITED_USER_COMPANY)];
  return p;
}
