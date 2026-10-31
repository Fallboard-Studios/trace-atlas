// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';

import { ASPECT_FAMILY_IDS, THEME_PICK, canonicalPicks, type AspectFamilyId, type AspectId } from './aspects';
import type { LoadingIdentity } from './loadingIdentity';
import { getUniformSeededVal } from '../../utils/getSeededVal';
import type { Company } from '../../types/Company';
import type { Robot } from '../../types/Robot';

// ========================================
// TYPES
// ========================================

/** What the deal gave one robot: at most one aspect per family; a family absent means as theme. */
export type RobotAspects = Partial<Record<AspectFamilyId, AspectId>>;

// ========================================
// FUNCTIONS
// ========================================

/**
 * The fleet's seeded groups, in deal order (docs/specs/OFF_SCREEN.md assumption 21): each company's members, the
 * companies in their spawn order, then every Freelance robot on its own in roster order. A robot a company lists is
 * never a freelancer too. Membership is read from the companies, not from the robots, so the same groups come out of
 * the live roster and of the regenerated baseline (whose robots carry no companyId).
 */
export function dealGroups(companies: readonly Pick<Company, 'robotIds'>[], roster: readonly Pick<Robot, 'id'>[]): string[][] {
  const inCompany = new Set(companies.flatMap((company) => company.robotIds));
  return [
    ...companies.map((company) => [...company.robotIds]),
    ...roster.filter((robot) => !inCompany.has(robot.id)).map((robot) => [robot.id]),
  ];
}

/**
 * The world's picks dealt round-robin over the fleet's groups (assumption 21): per family with a non-empty list, the
 * canonical list is rotated by a seeded offset - one uniform draw at `aspects.<family>.deal`, uniform because a plain
 * getSeededVal at offset 0 takes only a few values across worlds - and group i is dealt pick (i + rotation) mod n, so
 * every group has one; one pick is the whole fleet, two alternate across the companies then the freelancers, and the
 * as-theme member deals nothing (its groups get no entry), which is how a mixed fleet keeps plain robots. An empty
 * list, or no family, deals nothing. Pure: a given identity and noise map always deal the same way, so a link
 * reproduces the deal; adding or removing a pick may reshuffle, and is a retransmit anyway. The deal pass (Task 27)
 * re-derives each dealt robot's family keys from this map; nothing here reads a store or a band.
 */
export function dealAspects(
  identity: Pick<LoadingIdentity, 'aspects'>,
  companies: readonly Pick<Company, 'robotIds'>[],
  roster: readonly Pick<Robot, 'id'>[],
  noiseMap: NoiseFunction2D,
): Map<string, RobotAspects> {
  const dealt = new Map<string, RobotAspects>();
  const groups = dealGroups(companies, roster);
  for (const family of ASPECT_FAMILY_IDS) {
    const picks = canonicalPicks(family, identity.aspects[family] ?? []);
    if (picks.length === 0) continue;
    const rotation = Math.floor(getUniformSeededVal(noiseMap, `aspects.${family}.deal`, 0) * picks.length);
    groups.forEach((robotIds, i) => {
      const pick = picks[(i + rotation) % picks.length];
      if (pick === THEME_PICK) return;
      for (const robotId of robotIds) dealt.set(robotId, { ...dealt.get(robotId), [family]: pick });
    });
  }
  return dealt;
}
