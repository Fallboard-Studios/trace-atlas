import { useMemo, useRef } from 'react';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore, type RobotSection, type RobotSubsection, type FleetParamsGroup, type SettingsLeaf, type SelectedFleetParamsEffect, type TopLevelBranch } from '@/stores/uiStore';
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

const ROBOT_SUBSECTIONS: readonly RobotSubsection[] = [
  'audioSettings',
  'rhythm',
  'frequency',
  'pingContour',
  'baselineOscillator',
  'coaxialOscillator',
  'harmonicOscillator',
  'probeDrift',
];
function asRobotSubsection(value: string | undefined): RobotSubsection | null {
  return value && (ROBOT_SUBSECTIONS as readonly string[]).includes(value) ? (value as RobotSubsection) : null;
}

const FLEET_PARAMS_GROUPS: readonly FleetParamsGroup[] = ['eqFilters', 'timeSpace', 'output'];
function asFleetParamsGroup(value: string | undefined): FleetParamsGroup | null {
  return value && (FLEET_PARAMS_GROUPS as readonly string[]).includes(value) ? (value as FleetParamsGroup) : null;
}

const SETTINGS_LEAVES: readonly SettingsLeaf[] = ['volume', 'quality', 'tempo', 'sectorSettings'];
function asSettingsLeaf(value: string | undefined): SettingsLeaf | null {
  return value && (SETTINGS_LEAVES as readonly string[]).includes(value) ? (value as SettingsLeaf) : null;
}

/** Maps a Fleet Params leaf's own node-id segment (navTreeConfig.ts's own naming, e.g. 'eq',
 *  'hpf') to its matching AudioRigEffectKey ('eq3', 'filterHPF') — the two don't share the same
 *  spelling, so this is a real translation, not just a type-narrowing filter like the others. */
const FLEET_PARAMS_LEAF_TO_EFFECT_KEY: Record<string, SelectedFleetParamsEffect> = {
  eq: 'eq3',
  hpf: 'filterHPF',
  lpf: 'filterLPF',
  reverb: 'reverb',
  delay: 'delay',
  compression: 'compressor',
  limiter: 'limiter',
};
function asFleetParamsEffectKey(value: string | undefined): SelectedFleetParamsEffect | null {
  return value ? (FLEET_PARAMS_LEAF_TO_EFFECT_KEY[value] ?? null) : null;
}

const TOP_LEVEL_BRANCHES: readonly TopLevelBranch[] = ['settings', 'fleetParams', 'probes', 'companies'];
function asTopLevelBranch(value: string): TopLevelBranch | null {
  return (TOP_LEVEL_BRANCHES as readonly string[]).includes(value) ? (value as TopLevelBranch) : null;
}

// trait per section (experimental, Crawford's own request) — matches AudioSettingSection/
// PingControlsDrawer/PingContourDrawer/SignatureArrayDrawer's own per-section
// getTraitColorStyle calls (output/composition/timeSpace/spectral respectively), so a
// probes.<id>.<section> or companies.<id>.<section> row colors itself the same as the actual
// section content it opens into.
// 'Volume' renders as 'Output' (label-only rename, docs/intent/nav-panel-views-and-content.md
// §New 4th tree level) — the id segment stays 'volume', matching RobotSection's own value.
const SECTION_CHILDREN: Omit<NavTreeNodeSchema, 'id'>[] = [
  { humanLabel: 'Output', trait: 'output' },
  { humanLabel: 'Melody', trait: 'composition' },
  { humanLabel: 'Envelope', trait: 'timeSpace' },
  { humanLabel: 'Source', trait: 'spectral' },
];

// The 4th tree level (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §5.1) — shared by Probes and
// Companies, same as SECTION_CHILDREN itself. 'Robot Drift' renders as 'Probe Drift' — this is a
// brand-new node, not a rename of an existing tree label; RobotDriftPanel's own identifier is
// unaffected.
const SUBSECTION_CHILDREN: Record<RobotSection, { id: RobotSubsection; humanLabel: string }[]> = {
  volume: [{ id: 'audioSettings', humanLabel: 'Audio Settings' }],
  melody: [
    { id: 'rhythm', humanLabel: 'Rhythm' },
    { id: 'frequency', humanLabel: 'Frequency' },
  ],
  envelope: [{ id: 'pingContour', humanLabel: 'Ping Contour' }],
  source: [
    { id: 'baselineOscillator', humanLabel: 'Baseline Oscillator' },
    { id: 'coaxialOscillator', humanLabel: 'Coaxial Oscillator' },
    { id: 'harmonicOscillator', humanLabel: 'Harmonic Oscillator' },
    { id: 'probeDrift', humanLabel: 'Probe Drift' },
  ],
};

function sectionChildNodes(entityBranchPrefix: string): NavTreeNodeSchema[] {
  return ROBOT_SECTIONS.map((section, i) => ({
    id: `${entityBranchPrefix}.${section}`,
    ...SECTION_CHILDREN[i],
    children: SUBSECTION_CHILDREN[section].map((leaf) => ({
      id: `${entityBranchPrefix}.${section}.${leaf.id}`,
      humanLabel: leaf.humanLabel,
    })),
  }));
}

interface IdentityEntry {
  id: string;
  name?: string;
  /** A robot's own Robot.identityColor, or a company's own Company.color — both are a single
   *  literal per-entity tint (Task 20's original company tree-row tint, extended to robots per
   *  Crawford's own follow-up request). Read generically here so buildProbesSubtree/
   *  buildCompaniesSubtree don't need to know which underlying field name their own entity type
   *  uses. */
  color?: string;
}

function identityRosterEqual(a: IdentityEntry[], b: IdentityEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].name !== b[i].name || a[i].color !== b[i].color) return false;
  }
  return true;
}

/** Same custom-equality technique RobotsTab.tsx's useRobotRoster uses — robots' own array
 *  reference is replaced on every audio-swell tick even when identity/name are unchanged, so a
 *  plain selector here would rebuild the tree continuously. Only id/name/color matter for tree
 *  nodes. */
function useIdentityRoster(localeId: string, key: 'robots' | 'companies'): IdentityEntry[] {
  const prevRef = useRef<IdentityEntry[]>([]);
  return useLocaleStore((s) => {
    const next = (s.locales[localeId]?.[key] ?? []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      // Company.color (Task 20) or Robot.identityColor (Crawford's own follow-up request) —
      // whichever this entry's own type actually has. Never both: 'color' in entry narrows to
      // Company, 'identityColor' in entry narrows to Robot.
      color: 'color' in entry ? entry.color : 'identityColor' in entry ? entry.identityColor : undefined,
    }));
    if (identityRosterEqual(prevRef.current, next)) return prevRef.current;
    prevRef.current = next;
    return next;
  });
}

function buildProbesSubtree(schema: NavTreeNodeSchema, robots: IdentityEntry[]): NavTreeNodeSchema {
  const allProbesStatic = schema.children?.find((c) => c.id === 'probes.all');
  // "All Probes" is a bulk-edit entity like any robot — its section children need the same
  // sectionChildNodes()-generated 4th level, not the static (now-stale) shape NAV_TREE_SCHEMA
  // used to hardcode for it.
  const allProbesNode: NavTreeNodeSchema | undefined = allProbesStatic
    ? { ...allProbesStatic, children: sectionChildNodes('probes.all') }
    : undefined;
  const perRobotNodes: NavTreeNodeSchema[] = robots.map((r) => ({
    id: `probes.${r.id}`,
    humanLabel: r.name ?? r.id,
    color: r.color,
    children: sectionChildNodes(`probes.${r.id}`),
  }));
  return { ...schema, children: allProbesNode ? [allProbesNode, ...perRobotNodes] : perRobotNodes };
}

function buildCompaniesSubtree(schema: NavTreeNodeSchema, companies: IdentityEntry[]): NavTreeNodeSchema {
  const perCompanyNodes: NavTreeNodeSchema[] = companies.map((c) => ({
    id: `companies.${c.id}`,
    humanLabel: c.name ?? c.id,
    color: c.color,
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
  const selectedSubsection = useUIStore((s) => s.selectedSubsection);
  const selectedSettingsLeaf = useUIStore((s) => s.selectedSettingsLeaf);
  const selectedFleetParamsEffect = useUIStore((s) => s.selectedFleetParamsEffect);
  const expandedProbeId = useUIStore((s) => s.expandedProbeId);
  const expandedCompanyId = useUIStore((s) => s.expandedCompanyId);
  const expandedFleetParamsGroup = useUIStore((s) => s.expandedFleetParamsGroup);
  const expandedProbeSection = useUIStore((s) => s.expandedProbeSection);
  const expandedCompanySection = useUIStore((s) => s.expandedCompanySection);
  const expandedTopLevelBranch = useUIStore((s) => s.expandedTopLevelBranch);
  const allProbesSelected = useUIStore((s) => s.allProbesSelected);

  const setActiveHubTile = useUIStore((s) => s.setActiveHubTile);
  const selectRobot = useUIStore((s) => s.selectRobot);
  const selectCompany = useUIStore((s) => s.selectCompany);
  const clearSelectedCompany = useUIStore((s) => s.clearSelectedCompany);
  const selectAllRobots = useUIStore((s) => s.selectAllRobots);
  const setSelectedSection = useUIStore((s) => s.setSelectedSection);
  const setSelectedSubsection = useUIStore((s) => s.setSelectedSubsection);
  const setSelectedSettingsLeaf = useUIStore((s) => s.setSelectedSettingsLeaf);
  const setSelectedFleetParamsEffect = useUIStore((s) => s.setSelectedFleetParamsEffect);
  const setExpandedProbeId = useUIStore((s) => s.setExpandedProbeId);
  const setExpandedCompanyId = useUIStore((s) => s.setExpandedCompanyId);
  const setExpandedFleetParamsGroup = useUIStore((s) => s.setExpandedFleetParamsGroup);
  const setExpandedProbeSection = useUIStore((s) => s.setExpandedProbeSection);
  const setExpandedCompanySection = useUIStore((s) => s.setExpandedCompanySection);
  const setExpandedTopLevelBranch = useUIStore((s) => s.setExpandedTopLevelBranch);
  const setAllProbesSelected = useUIStore((s) => s.setAllProbesSelected);

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
    const [branch, entityId, section, subsection] = id.split('.');

    if (branch === 'settings') {
      setActiveHubTile('settings');
      setSelectedSection(null);
      // First-leaf-on-parent-select (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.6) — selecting
      // the bare branch itself opens its first leaf (Volume) rather than leaving nothing open;
      // the view/accordion model always has exactly one section open, never "nothing selected."
      setSelectedSettingsLeaf(entityId ? asSettingsLeaf(entityId) : SETTINGS_LEAVES[0]);
      return;
    }
    if (branch === 'fleetParams') {
      setActiveHubTile('audioRig');
      setSelectedSection(null);
      setSelectedFleetParamsEffect(asFleetParamsEffectKey(section));
      return;
    }
    if (branch === 'probes') {
      setActiveHubTile('robots');
      if (!entityId) {
        setAllProbesSelected(false);
        selectRobot(null);
        setSelectedSection(null);
        setSelectedSubsection(null);
        return;
      }
      if (entityId === 'all') {
        setAllProbesSelected(true);
        selectAllRobots();
        selectRobot(null);
      } else {
        setAllProbesSelected(false);
        selectRobot(entityId);
      }
      setSelectedSection(asRobotSection(section));
      setSelectedSubsection(asRobotSubsection(subsection));
      return;
    }
    if (branch === 'companies') {
      setActiveHubTile('companies');
      if (!entityId) {
        clearSelectedCompany();
        setSelectedSection(null);
        setSelectedSubsection(null);
        return;
      }
      selectCompany(entityId);
      setSelectedSection(asRobotSection(section));
      setSelectedSubsection(asRobotSubsection(subsection));
    }
  }

  function toggleExpand(id: string): void {
    const [branch, entityId, section] = id.split('.');
    if (!entityId) {
      // Bare single-segment id — one of the 4 top-level branch roots (settings/fleetParams/
      // probes/companies). Bugfix: this case was missing entirely, so every top-level node's own
      // +/- button was a silent no-op and its children could never render.
      const topLevel = asTopLevelBranch(branch);
      if (topLevel) setExpandedTopLevelBranch(expandedTopLevelBranch === topLevel ? null : topLevel);
      return;
    }
    if (branch === 'probes' && entityId && !section) {
      setExpandedProbeId(expandedProbeId === entityId ? null : entityId);
      return;
    }
    if (branch === 'companies' && entityId && !section) {
      setExpandedCompanyId(expandedCompanyId === entityId ? null : entityId);
      return;
    }
    // A 3-segment id (probes.<id>.<section> / companies.<id>.<section>) — the accordion-of-one
    // one level deeper than expandedProbeId/expandedCompanyId, docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.3.
    if (branch === 'probes' && entityId && section) {
      const sec = asRobotSection(section);
      if (sec) setExpandedProbeSection(expandedProbeSection === sec ? null : sec);
      return;
    }
    if (branch === 'companies' && entityId && section) {
      const sec = asRobotSection(section);
      if (sec) setExpandedCompanySection(expandedCompanySection === sec ? null : sec);
      return;
    }
    const group = branch === 'fleetParams' ? asFleetParamsGroup(entityId) : null;
    if (group) {
      setExpandedFleetParamsGroup(expandedFleetParamsGroup === group ? null : group);
    }
    // Static leaves with no dedicated accordion-of-one field (settings.*) have nothing to
    // toggle — no-op.
  }

  function isExpanded(id: string): boolean {
    const [branch, entityId, section] = id.split('.');
    if (!entityId) {
      const topLevel = asTopLevelBranch(branch);
      return topLevel ? expandedTopLevelBranch === topLevel : false;
    }
    if (branch === 'probes' && entityId && !section) return expandedProbeId === entityId;
    if (branch === 'companies' && entityId && !section) return expandedCompanyId === entityId;
    if (branch === 'probes' && entityId && section) return expandedProbeSection === asRobotSection(section);
    if (branch === 'companies' && entityId && section) return expandedCompanySection === asRobotSection(section);
    if (branch === 'fleetParams' && entityId) return expandedFleetParamsGroup === entityId;
    return false;
  }

  function isSelected(id: string): boolean {
    const [branch, entityId, section, subsection] = id.split('.');
    const wantedSection = asRobotSection(section);
    const wantedSubsection = asRobotSubsection(subsection);

    if (branch === 'settings') {
      if (!entityId) return activeHubTile === 'settings' && selectedSettingsLeaf === null;
      return activeHubTile === 'settings' && selectedSettingsLeaf === asSettingsLeaf(entityId);
    }
    if (branch === 'fleetParams') {
      // Bare 'fleetParams' and a group category node (e.g. 'fleetParams.eqFilters') currently
      // read identical state (both need selectedFleetParamsEffect === null) — same ambiguity
      // isSelected('probes')/isSelected('probes.all') already documents above.
      if (!section) return activeHubTile === 'audioRig' && selectedFleetParamsEffect === null;
      return activeHubTile === 'audioRig' && selectedFleetParamsEffect === asFleetParamsEffectKey(section);
    }
    if (branch === 'probes') {
      if (!entityId) return activeHubTile === 'robots' && selectedRobotId === null && !allProbesSelected;
      if (entityId === 'all') {
        return (
          activeHubTile === 'robots' &&
          allProbesSelected &&
          selectedSection === wantedSection &&
          selectedSubsection === wantedSubsection
        );
      }
      return (
        activeHubTile === 'robots' &&
        selectedRobotId === entityId &&
        selectedSection === wantedSection &&
        selectedSubsection === wantedSubsection
      );
    }
    if (branch === 'companies') {
      if (!entityId) return activeHubTile === 'companies' && selectedCompanyId === null;
      return (
        activeHubTile === 'companies' &&
        selectedCompanyId === entityId &&
        selectedSection === wantedSection &&
        selectedSubsection === wantedSubsection
      );
    }
    return false;
  }

  return { nodes, isExpanded, isSelected, select, toggleExpand };
}
