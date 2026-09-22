import { useMemo, useRef } from 'react';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore, type RobotSection, type FleetParamsGroup } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { NAV_TREE_SCHEMA, type NavTreeNodeSchema } from '@/data/navTreeConfig';

/**
 * Resolves the Navigation & Layout Rewrite's tree (docs/specs/NAV_LAYOUT_REWRITE.md §1.5/§3) —
 * merges NAV_TREE_SCHEMA's static nodes with per-robot (`probes.<robotId>.*`) and per-company
 * (`companies.<companyId>.*`) subtrees generated live from localeStore, and translates between
 * a node's generic id and the typed uiStore fields it maps to. Node ids are namespaced
 * `<branch>[.<entityId>[.<section>]]` and are only ever parsed here, to decide which typed
 * field to write — nothing downstream (ContentPane, NavTreeNode) parses an id itself; they
 * read this hook's typed isSelected/isExpanded/select/toggleExpand instead (spec §1.5).
 */

const ROBOT_SECTIONS: readonly RobotSection[] = ['volume', 'melody', 'envelope', 'source'];
function asRobotSection(value: string | undefined): RobotSection | null {
  return value && (ROBOT_SECTIONS as readonly string[]).includes(value) ? (value as RobotSection) : null;
}

const FLEET_PARAMS_GROUPS: readonly FleetParamsGroup[] = ['eqFilters', 'timeSpace', 'output'];
function asFleetParamsGroup(value: string | undefined): FleetParamsGroup | null {
  return value && (FLEET_PARAMS_GROUPS as readonly string[]).includes(value) ? (value as FleetParamsGroup) : null;
}

const SECTION_CHILDREN: Omit<NavTreeNodeSchema, 'id'>[] = [
  { humanLabel: 'Volume' },
  { humanLabel: 'Melody' },
  { humanLabel: 'Envelope' },
  { humanLabel: 'Source' },
];

function sectionChildNodes(entityBranchPrefix: string): NavTreeNodeSchema[] {
  return ROBOT_SECTIONS.map((section, i) => ({
    id: `${entityBranchPrefix}.${section}`,
    humanLabel: SECTION_CHILDREN[i].humanLabel,
  }));
}

interface IdentityEntry {
  id: string;
  name?: string;
}

function identityRosterEqual(a: IdentityEntry[], b: IdentityEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].name !== b[i].name) return false;
  }
  return true;
}

/** Same custom-equality technique RobotsTab.tsx's useRobotRoster uses — robots' own array
 *  reference is replaced on every audio-swell tick even when identity/name are unchanged, so a
 *  plain selector here would rebuild the tree continuously. Only id/name matter for tree nodes. */
function useIdentityRoster(localeId: string, key: 'robots' | 'companies'): IdentityEntry[] {
  const prevRef = useRef<IdentityEntry[]>([]);
  return useLocaleStore((s) => {
    const next = (s.locales[localeId]?.[key] ?? []).map((entry) => ({ id: entry.id, name: entry.name }));
    if (identityRosterEqual(prevRef.current, next)) return prevRef.current;
    prevRef.current = next;
    return next;
  });
}

function buildProbesSubtree(schema: NavTreeNodeSchema, robots: IdentityEntry[]): NavTreeNodeSchema {
  const allProbesNode = schema.children?.find((c) => c.id === 'probes.all');
  const perRobotNodes: NavTreeNodeSchema[] = robots.map((r) => ({
    id: `probes.${r.id}`,
    humanLabel: r.name ?? r.id,
    children: sectionChildNodes(`probes.${r.id}`),
  }));
  return { ...schema, children: allProbesNode ? [allProbesNode, ...perRobotNodes] : perRobotNodes };
}

function buildCompaniesSubtree(schema: NavTreeNodeSchema, companies: IdentityEntry[]): NavTreeNodeSchema {
  const perCompanyNodes: NavTreeNodeSchema[] = companies.map((c) => ({
    id: `companies.${c.id}`,
    humanLabel: c.name ?? c.id,
    children: sectionChildNodes(`companies.${c.id}`),
  }));
  return { ...schema, children: perCompanyNodes };
}

export interface UseNavTreeResult {
  /** The full tree — NAV_TREE_SCHEMA's static branches with Probes'/Companies' dynamic
   *  per-entity subtrees spliced in. */
  nodes: NavTreeNodeSchema[];
  isExpanded: (id: string) => boolean;
  isSelected: (id: string) => boolean;
  select: (id: string) => void;
  toggleExpand: (id: string) => void;
}

export function useNavTree(): UseNavTreeResult {
  const localeId = getActiveLocaleId();
  const robots = useIdentityRoster(localeId, 'robots');
  const companies = useIdentityRoster(localeId, 'companies');

  const activeHubTile = useUIStore((s) => s.activeHubTile);
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const selectedSection = useUIStore((s) => s.selectedSection);
  const expandedProbeId = useUIStore((s) => s.expandedProbeId);
  const expandedCompanyId = useUIStore((s) => s.expandedCompanyId);
  const expandedFleetParamsGroup = useUIStore((s) => s.expandedFleetParamsGroup);

  const setActiveHubTile = useUIStore((s) => s.setActiveHubTile);
  const selectRobot = useUIStore((s) => s.selectRobot);
  const selectCompany = useUIStore((s) => s.selectCompany);
  const selectAllRobots = useUIStore((s) => s.selectAllRobots);
  const setSelectedSection = useUIStore((s) => s.setSelectedSection);
  const setExpandedProbeId = useUIStore((s) => s.setExpandedProbeId);
  const setExpandedCompanyId = useUIStore((s) => s.setExpandedCompanyId);
  const setExpandedFleetParamsGroup = useUIStore((s) => s.setExpandedFleetParamsGroup);

  const nodes = useMemo(
    () =>
      NAV_TREE_SCHEMA.map((branch) => {
        if (branch.id === 'probes') return buildProbesSubtree(branch, robots);
        if (branch.id === 'companies') return buildCompaniesSubtree(branch, companies);
        return branch;
      }),
    [robots, companies]
  );

  function select(id: string): void {
    const [branch, entityId, section] = id.split('.');

    if (branch === 'settings') {
      setActiveHubTile('settings');
      setSelectedSection(null);
      return;
    }
    if (branch === 'fleetParams') {
      setActiveHubTile('audioRig');
      setSelectedSection(null);
      return;
    }
    if (branch === 'probes') {
      setActiveHubTile('robots');
      if (!entityId) {
        selectRobot(null);
        setSelectedSection(null);
        return;
      }
      if (entityId === 'all') {
        selectAllRobots();
        selectRobot(null);
      } else {
        selectRobot(entityId);
      }
      setSelectedSection(asRobotSection(section));
      return;
    }
    if (branch === 'companies') {
      setActiveHubTile('companies');
      if (!entityId) {
        setSelectedSection(null);
        return;
      }
      selectCompany(entityId);
      setSelectedSection(asRobotSection(section));
    }
  }

  function toggleExpand(id: string): void {
    const [branch, entityId] = id.split('.');
    if (branch === 'probes' && entityId) {
      setExpandedProbeId(expandedProbeId === entityId ? null : entityId);
      return;
    }
    if (branch === 'companies' && entityId) {
      setExpandedCompanyId(expandedCompanyId === entityId ? null : entityId);
      return;
    }
    const group = branch === 'fleetParams' ? asFleetParamsGroup(entityId) : null;
    if (group) {
      setExpandedFleetParamsGroup(expandedFleetParamsGroup === group ? null : group);
    }
    // Top-level branch roots and static leaves with no dedicated accordion-of-one
    // field (settings.*) have nothing to toggle in Phase 1 — no-op.
  }

  function isExpanded(id: string): boolean {
    const [branch, entityId] = id.split('.');
    if (branch === 'probes' && entityId) return expandedProbeId === entityId;
    if (branch === 'companies' && entityId) return expandedCompanyId === entityId;
    if (branch === 'fleetParams' && entityId) return expandedFleetParamsGroup === entityId;
    return false;
  }

  function isSelected(id: string): boolean {
    const [branch, entityId, section] = id.split('.');
    const wantedSection = asRobotSection(section);

    if (branch === 'settings') return !entityId && activeHubTile === 'settings';
    if (branch === 'fleetParams') return !entityId && activeHubTile === 'audioRig';
    if (branch === 'probes') {
      if (!entityId) return activeHubTile === 'robots' && selectedRobotId === null;
      // 'probes.all' vs the bare 'probes' browse view currently read identical
      // underlying state when nothing else distinguishes them (both need
      // selectedRobotId === null) — Task 19 is specifically scoped to give
      // "All Probes" its own real selection signal.
      if (entityId === 'all') {
        return activeHubTile === 'robots' && selectedRobotId === null && selectedSection === wantedSection;
      }
      return activeHubTile === 'robots' && selectedRobotId === entityId && selectedSection === wantedSection;
    }
    if (branch === 'companies') {
      if (!entityId) return activeHubTile === 'companies' && selectedCompanyId === null;
      return activeHubTile === 'companies' && selectedCompanyId === entityId && selectedSection === wantedSection;
    }
    return false;
  }

  return { nodes, isExpanded, isSelected, select, toggleExpand };
}
