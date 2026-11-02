// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';

import { dealAspects, dealGroups } from './dealAspects';
import type { AspectIdOf } from './aspects';

// ========================================
// MOCKS
// ========================================

// The rotation is one uniform draw; wrapped so a test can pin it at 0 and read the plain deal order, while the
// seeded-rotation tests keep the real draw.
vi.mock('../../utils/getSeededVal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/getSeededVal')>();
  return { ...actual, getUniformSeededVal: vi.fn(actual.getUniformSeededVal) };
});

import { getUniformSeededVal } from '../../utils/getSeededVal';

// ========================================
// FIXTURES
// ========================================

const noise = (seed: string) => createNoise2D(alea(seed));

/** Twelve robots in roster order: two companies of three and four (spawn order), then five freelancers. */
const ROSTER = Array.from({ length: 12 }, (_, i) => ({ id: `robot-${i}` }));
const COMPANIES = [
  { robotIds: ['robot-4', 'robot-1', 'robot-9'] },
  { robotIds: ['robot-0', 'robot-7', 'robot-2', 'robot-11'] },
];
const FREELANCERS = ['robot-3', 'robot-5', 'robot-6', 'robot-8', 'robot-10'];

/** Every list here is Melody's, the family these cases deal (a pick is typed by its family, review R15). */
type MelodyId = AspectIdOf<'melody'>;
const identity = (melody: MelodyId[]) => ({ aspects: { melody } });

/** The pick each group was dealt, in deal order, 'none' for a group with no entry. */
function dealtByGroup(dealt: Map<string, { melody?: string }>, groups: string[][]): string[] {
  return groups.map((group) => dealt.get(group[0])?.melody ?? 'none');
}

async function pinRotationAtZero() {
  vi.mocked(getUniformSeededVal).mockReturnValue(0);
}

afterEach(async () => {
  const { getUniformSeededVal: real } = await vi.importActual<typeof import('../../utils/getSeededVal')>('../../utils/getSeededVal');
  vi.mocked(getUniformSeededVal).mockImplementation(real);
});

// ========================================
// TESTS
// ========================================

describe('dealGroups (docs/specs/OFF_SCREEN.md assumption 21)', () => {
  it('is the companies in spawn order, each as its member list, then every freelancer alone in roster order', () => {
    expect(dealGroups(COMPANIES, ROSTER)).toEqual([
      ['robot-4', 'robot-1', 'robot-9'],
      ['robot-0', 'robot-7', 'robot-2', 'robot-11'],
      ...FREELANCERS.map((id) => [id]),
    ]);
  });

  it('with no companies every robot is its own group, in roster order', () => {
    expect(dealGroups([], ROSTER)).toEqual(ROSTER.map((r) => [r.id]));
  });

  it('a robot in a company is never a freelancer too, whatever its roster position', () => {
    const groups = dealGroups([{ robotIds: ['robot-11'] }], ROSTER);
    expect(groups[0]).toEqual(['robot-11']);
    expect(groups.flat().filter((id) => id === 'robot-11')).toHaveLength(1);
    expect(groups).toHaveLength(12);
  });
});

describe('dealAspects (docs/specs/OFF_SCREEN.md assumption 21, plan Task 26)', () => {
  it('one pick reaches every robot in the fleet', () => {
    const dealt = dealAspects(identity(['hypnotic']), COMPANIES, ROSTER, noise('one-pick'));
    expect(dealt.size).toBe(12);
    for (const robot of ROSTER) expect(dealt.get(robot.id)).toEqual({ melody: 'hypnotic' });
  });

  it('two picks alternate over the groups in deal order - companies in spawn order, then freelancers in roster order - and a company\'s members all share its pick', async () => {
    await pinRotationAtZero();
    const dealt = dealAspects(identity(['hypnotic', 'mechanical']), COMPANIES, ROSTER, noise('two-picks'));
    const groups = dealGroups(COMPANIES, ROSTER);
    expect(dealtByGroup(dealt, groups)).toEqual(['hypnotic', 'mechanical', 'hypnotic', 'mechanical', 'hypnotic', 'mechanical', 'hypnotic']);
    for (const group of groups) {
      const picks = new Set(group.map((id) => dealt.get(id)?.melody));
      expect(picks.size).toBe(1);
    }
    expect(dealt.size).toBe(12);
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 6 (Crawford's note 4): there is no as-theme pick. Every group is dealt one of
  // the picks; only an empty list leaves robots plain.
  it('two picks over three groups seat both, and every group has one', () => {
    const roster = ROSTER.slice(0, 5);
    const companies = [{ robotIds: ['robot-0', 'robot-1'] }, { robotIds: ['robot-2', 'robot-3'] }];
    for (const seed of ['three-a', 'three-b', 'three-c', 'three-d']) {
      const dealt = dealAspects(identity(['hypnotic', 'wandering']), companies, roster, noise(seed));
      expect(dealt.size).toBe(5);
      expect(new Set(dealGroups(companies, roster).map((group) => dealt.get(group[0])?.melody))).toEqual(
        new Set(['hypnotic', 'wandering']),
      );
    }
  });

  it('a stale theme pick is dropped as any unknown id is: theme,hypnotic deals Hypnotic to every robot', async () => {
    await pinRotationAtZero();
    const dealt = dealAspects(identity(['theme' as MelodyId, 'hypnotic']), COMPANIES, ROSTER, noise('as-theme'));
    expect(dealt.size).toBe(12);
    for (const robot of ROSTER) expect(dealt.get(robot.id)).toEqual({ melody: 'hypnotic' });
  });

  it('the picks are read in canonical order whatever order they arrive in, deduped', async () => {
    await pinRotationAtZero();
    const a = dealAspects(identity(['mechanical', 'hypnotic', 'hypnotic']), COMPANIES, ROSTER, noise('order'));
    const b = dealAspects(identity(['hypnotic', 'mechanical']), COMPANIES, ROSTER, noise('order'));
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it('the rotation is seeded: one noise map deals the same way twice, and different maps rotate the list differently', () => {
    const groups = dealGroups(COMPANIES, ROSTER);
    const picks: MelodyId[] = ['hypnotic', 'mechanical', 'wandering'];
    const seeds = ['deal-a', 'deal-b', 'deal-c', 'deal-d', 'deal-e', 'deal-f', 'deal-g', 'deal-h'];
    const sequences = seeds.map((seed) => dealtByGroup(dealAspects(identity(picks), COMPANIES, ROSTER, noise(seed)), groups).join(','));
    expect(new Set(sequences).size).toBeGreaterThan(1);
    for (const seed of seeds) {
      const again = dealtByGroup(dealAspects(identity(picks), COMPANIES, ROSTER, noise(seed)), groups).join(',');
      expect(again).toBe(sequences[seeds.indexOf(seed)]);
    }
    // Every sequence is a rotation of the canonical list over the groups: consecutive groups step through the list.
    for (const sequence of sequences) {
      const dealtPicks = sequence.split(',');
      for (let i = 1; i < dealtPicks.length; i++) {
        expect(picks.indexOf(dealtPicks[i] as MelodyId)).toBe((picks.indexOf(dealtPicks[i - 1] as MelodyId) + 1) % 3);
      }
    }
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R27: two families at once, and how far the rotation reaches.
  it('deals two families at once: every robot carries both, a company shares both, and each family turns on its own draw', () => {
    vi.mocked(getUniformSeededVal).mockClear();
    const map = noise('two-families');
    const melody: MelodyId[] = ['hypnotic', 'mechanical'];
    const envelope: AspectIdOf<'envelope'>[] = ['plucked', 'swelling', 'held'];
    const dealt = dealAspects({ aspects: { melody, envelope } }, COMPANIES, ROSTER, map);
    const groups = dealGroups(COMPANIES, ROSTER);

    expect(dealt.size).toBe(12);
    for (const group of groups) {
      const first = dealt.get(group[0])!;
      expect(Object.keys(first).sort()).toEqual(['envelope', 'melody']);
      for (const id of group) expect(dealt.get(id)).toEqual(first);
    }
    // Each family steps through its own canonical list over the groups, from its own rotation.
    const byGroup = groups.map((group) => dealt.get(group[0])!);
    for (let i = 1; i < byGroup.length; i++) {
      expect(melody.indexOf(byGroup[i].melody as MelodyId)).toBe((melody.indexOf(byGroup[i - 1].melody as MelodyId) + 1) % melody.length);
      expect(envelope.indexOf(byGroup[i].envelope!)).toBe((envelope.indexOf(byGroup[i - 1].envelope!) + 1) % envelope.length);
    }
    expect(vi.mocked(getUniformSeededVal).mock.calls).toEqual([
      [map, 'aspects.melody.deal', 0],
      [map, 'aspects.envelope.deal', 0],
    ]);
  });

  it('over thirty worlds a three-pick list starts on each of its picks: every rotation occurs', () => {
    const groups = dealGroups(COMPANIES, ROSTER);
    const picks: MelodyId[] = ['hypnotic', 'mechanical', 'wandering'];
    const firstPicks = new Set<string | undefined>();
    for (let i = 0; i < 30; i++) {
      firstPicks.add(dealAspects(identity(picks), COMPANIES, ROSTER, noise(`spread-${i}`)).get(groups[0][0])?.melody);
    }
    expect(firstPicks).toEqual(new Set(picks));
  });

  it('three companies with no freelancers seat all three picks, one per company', () => {
    const threeCompanies = [
      { robotIds: ['robot-0', 'robot-1', 'robot-2', 'robot-3'] },
      { robotIds: ['robot-4', 'robot-5', 'robot-6', 'robot-7'] },
      { robotIds: ['robot-8', 'robot-9', 'robot-10', 'robot-11'] },
    ];
    const dealt = dealAspects(identity(['hypnotic', 'mechanical', 'wandering']), threeCompanies, ROSTER, noise('three'));
    const perCompany = threeCompanies.map((c) => dealt.get(c.robotIds[0])?.melody);
    expect(new Set(perCompany)).toEqual(new Set(['hypnotic', 'mechanical', 'wandering']));
    expect(dealt.size).toBe(12);
  });

  it('an empty pick list, no family at all, or a list of only a stale theme pick deals nothing: an empty map', () => {
    expect(dealAspects(identity([]), COMPANIES, ROSTER, noise('empty')).size).toBe(0);
    expect(dealAspects({ aspects: {} }, COMPANIES, ROSTER, noise('empty')).size).toBe(0);
    expect(dealAspects(identity(['theme' as MelodyId]), COMPANIES, ROSTER, noise('empty')).size).toBe(0);
  });

  it('an unknown pick is dropped before the deal', async () => {
    await pinRotationAtZero();
    const dealt = dealAspects(identity(['hypnotic', 'zzz' as MelodyId]), COMPANIES, ROSTER, noise('unknown'));
    for (const robot of ROSTER) expect(dealt.get(robot.id)).toEqual({ melody: 'hypnotic' });
  });

  it('draws the rotation once per family, at the family\'s own dataId and offset 0', () => {
    vi.mocked(getUniformSeededVal).mockClear();
    const map = noise('draw');
    dealAspects(identity(['hypnotic', 'mechanical']), COMPANIES, ROSTER, map);
    expect(vi.mocked(getUniformSeededVal).mock.calls).toEqual([[map, 'aspects.melody.deal', 0]]);
  });

  it('is pure: the inputs are untouched and a second call gives an equal, separate map', () => {
    const companies = COMPANIES.map((c) => ({ robotIds: [...c.robotIds] }));
    const roster = ROSTER.map((r) => ({ ...r }));
    const first = dealAspects(identity(['hypnotic', 'wandering']), companies, roster, noise('pure'));
    const second = dealAspects(identity(['hypnotic', 'wandering']), companies, roster, noise('pure'));
    expect(companies).toEqual(COMPANIES);
    expect(roster).toEqual(ROSTER);
    expect([...second.entries()]).toEqual([...first.entries()]);
    expect(second).not.toBe(first);
  });
});
