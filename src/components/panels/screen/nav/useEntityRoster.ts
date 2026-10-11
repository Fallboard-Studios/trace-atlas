import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { useStableSelector } from '@/utils/useStableSelector';

/** What the nav shows of an entity: a robot's identityColor or a company's color as `color`. */
export interface RosterEntry {
  id: string;
  name?: string;
  color: string;
}

function rosterEqual(a: readonly RosterEntry[], b: readonly RosterEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => entry.id === b[i].id && entry.name === b[i].name && entry.color === b[i].color);
}

/**
 * The narrow roster slice the nav draws (spec §4's memo boundary): `updateRobot` replaces the robots
 * array on every battery tick and swell, so a plain selector would re-render its readers on each one.
 * The previous array is returned while id / name / colour are unchanged (useStableSelector). NavEntityList
 * draws the boxes from it (Task 4) and NavBreadcrumb its names (Task 8); it is a NavRoster's list as it
 * stands.
 */
export function useEntityRoster(key: 'robots' | 'companies'): RosterEntry[] {
  const localeId = getActiveLocaleId();
  return useStableSelector(
    useLocaleStore,
    (s): RosterEntry[] => {
      const locale = s.locales[localeId];
      return key === 'robots'
        ? (locale?.robots ?? []).map((robot) => ({ id: robot.id, name: robot.name, color: robot.identityColor }))
        : (locale?.companies ?? []).map((company) => ({ id: company.id, name: company.name, color: company.color }));
    },
    rosterEqual,
  );
}
