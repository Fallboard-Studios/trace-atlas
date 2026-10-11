import { useState } from 'react';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Robot } from '@/types/Robot';

/** Which kind of thing a line is about. */
export type SelectionKind = 'robot' | 'company';

/** The two selections the store holds. They are independent: a robot picked from the world with a tile
 *  open leaves the company as it was. */
export interface SelectionIds {
  robotId: string | null;
  companyId: string | null;
}

/** One line to show: its kind and the id it is about. */
export interface SelectionLineRef {
  kind: SelectionKind;
  id: string;
}

const isSelected = (kind: SelectionKind, ids: SelectionIds) => (kind === 'robot' ? ids.robotId : ids.companyId) !== null;
const idOf = (kind: SelectionKind, ids: SelectionIds) => (kind === 'robot' ? ids.robotId : ids.companyId);

/**
 * The selected kinds, latest first (docs/specs/LAYOUT_REWORK.md §1.7). The store holds the two ids and not
 * which was picked last, so it is derived from how they change: a kind whose id changed to something is
 * newly picked and goes on top; a kind that is no longer selected drops out; the rest keep their order.
 * Two picked at once (a screen mounting with both set) put the robot on top.
 */
export function nextSelectionOrder(prev: readonly SelectionKind[], before: SelectionIds, after: SelectionIds): SelectionKind[] {
  const kinds: SelectionKind[] = ['robot', 'company'];
  const picked = kinds.filter((kind) => isSelected(kind, after) && idOf(kind, after) !== idOf(kind, before));
  const kept = prev.filter((kind) => isSelected(kind, after) && !picked.includes(kind));
  return [...picked, ...kept];
}

const NO_ROBOTS: readonly Robot[] = [];

/**
 * The lines that exist, latest selection first: a selected id that names nothing (a stale selection) is
 * left out. Subscribes to the two ids and to whether each still exists, never to the robots themselves,
 * so a battery tick re-renders nothing here.
 */
export function useSelectionLines(): SelectionLineRef[] {
  const localeId = getActiveLocaleId();
  const robotId = useUIStore((s) => s.selectedRobotId);
  const companyId = useUIStore((s) => s.selectedCompanyId);
  const robotExists = useLocaleStore((s) => robotId !== null && (s.locales[localeId]?.robots ?? NO_ROBOTS).some((r) => r.id === robotId));
  const companyExists = useLocaleStore((s) => companyId !== null && (s.locales[localeId]?.companies ?? []).some((c) => c.id === companyId));

  // React's "adjust state while rendering": the order follows the ids, so no frame shows the old one.
  const [seen, setSeen] = useState(() => ({
    robotId,
    companyId,
    order: nextSelectionOrder([], { robotId: null, companyId: null }, { robotId, companyId }),
  }));
  let order = seen.order;
  if (seen.robotId !== robotId || seen.companyId !== companyId) {
    order = nextSelectionOrder(seen.order, seen, { robotId, companyId });
    setSeen({ robotId, companyId, order });
  }

  const lines: SelectionLineRef[] = [];
  for (const kind of order) {
    if (kind === 'robot' && robotExists && robotId !== null) lines.push({ kind, id: robotId });
    if (kind === 'company' && companyExists && companyId !== null) lines.push({ kind, id: companyId });
  }
  return lines;
}
