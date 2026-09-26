import { useMemo, useRef } from 'react';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore, type RobotSection, type RobotSubsection, type FleetParamsGroup, type SettingsLeaf, type SettingsSubsection, type SelectedFleetParamsEffect, type TopLevelBranch } from '@/stores/uiStore';
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

const FLEET_PARAMS_GROUPS: readonly FleetParamsGroup[] = ['pacing', 'eqFilters', 'timeSpace', 'output'];
function asFleetParamsGroup(value: string | undefined): FleetParamsGroup | null {
  return value && (FLEET_PARAMS_GROUPS as readonly string[]).includes(value) ? (value as FleetParamsGroup) : null;
}

/** Each group's own first child, in tree order — docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.6's
 *  first-leaf-on-parent-select, one entry per FleetParamsGroup so a group click opens its own
 *  first leaf rather than always the same one. */
const FLEET_PARAMS_GROUP_FIRST_LEAF: Record<FleetParamsGroup, SelectedFleetParamsEffect> = {
  pacing: 'tempo',
  eqFilters: 'eq3',
  timeSpace: 'reverb',
  output: 'compressor',
};

const SETTINGS_LEAVES: readonly SettingsLeaf[] = ['quality', 'sectorSettings'];
function asSettingsLeaf(value: string | undefined): SettingsLeaf | null {
  return value && (SETTINGS_LEAVES as readonly string[]).includes(value) ? (value as SettingsLeaf) : null;
}

const SETTINGS_SUBSECTIONS: readonly SettingsSubsection[] = ['robotLoad', 'effectsLoad', 'attenuationStyle', 'coordinates'];
function asSettingsSubsection(value: string | undefined): SettingsSubsection | null {
  return value && (SETTINGS_SUBSECTIONS as readonly string[]).includes(value) ? (value as SettingsSubsection) : null;
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
  tempo: 'tempo',
  automaticEffects: 'automaticEffects',
};
function asFleetParamsEffectKey(value: string | undefined): SelectedFleetParamsEffect | null {
  return value ? (FLEET_PARAMS_LEAF_TO_EFFECT_KEY[value] ?? null) : null;
}

const TOP_LEVEL_BRANCHES: readonly TopLevelBranch[] = ['settings', 'fleetParams', 'probes', 'companies'];
function asTopLevelBranch(value: string): TopLevelBranch | null {
  return (TOP_LEVEL_BRANCHES as readonly string[]).includes(value) ? (value as TopLevelBranch) : null;
}

/** True for exactly the 2 tree levels docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md gives
 *  auto-expand + UnderlineLink chrome to: a Settings/Fleet Params mid-level node (2 segments,
 *  entityId is a valid SettingsLeaf/FleetParamsGroup) and its own leaf children (3 segments, same
 *  branch); a Probes/Companies section-level node (3 segments, `section` is a valid RobotSection)
 *  and its own subsection children (4 segments, same branch+section). A plain function of the id
 *  string alone — no store state needed — reusing the existing asSettingsLeaf/asFleetParamsGroup/
 *  asRobotSection guards rather than inventing new id vocabulary. Exported standalone (not part of
 *  UseNavTreeResult) so NavTreeNode/NavTree can use it without an extra useNavTree() call. */
export function isDeepestTwoLevels(id: string): boolean {
  const [branch, entityId, section] = id.split('.');
  if (branch === 'settings' && entityId && asSettingsLeaf(entityId)) return true;
  if (branch === 'fleetParams' && entityId && asFleetParamsGroup(entityId)) return true;
  if ((branch === 'probes' || branch === 'companies') && section && asRobotSection(section)) return true;
  return false;
}

/** True for exactly the "auto-expand" tier — the UPPER of the 2 levels isDeepestTwoLevels covers
 *  (a mid-level Settings/Fleet Params node, or a Probes/Companies section node): always rendered
 *  expanded once its own ancestor (branch, or entity) is expanded, no independent collapse. A
 *  strict subset of isDeepestTwoLevels — a node with children of its own (no further `section`
 *  segment for Settings/Fleet Params, exactly one `section` segment for Probes/Companies) as
 *  opposed to isDeepestTwoLevels' leaf shapes, which have no children. */
export function isAutoExpandTier(id: string): boolean {
  const [branch, entityId, section, subsection] = id.split('.');
  if (branch === 'settings' && entityId && !section) return asSettingsLeaf(entityId) !== null;
  if (branch === 'fleetParams' && entityId && !section) return asFleetParamsGroup(entityId) !== null;
  // A 4th (subsection) segment means this id is a leaf CHILD of the section node, not the
  // section node itself — must be excluded, or e.g. 'probes.r1.melody.rhythm' would be
  // misidentified as its own parent 'probes.r1.melody' (found via a failing test, not assumed).
  if ((branch === 'probes' || branch === 'companies') && entityId && section && !subsection) return asRobotSection(section) !== null;
  return false;
}

/** The negation of isAutoExpandTier — whether a node's own +/- toggle should render at all.
 *  Branch ids, entity ids, and leaf/subsection ids (which never have children in the first place)
 *  are all collapsible/no-op-collapsible as before this feature; only the auto-expand tier itself
 *  loses its independent toggle. */
export function isCollapsible(id: string): boolean {
  return !isAutoExpandTier(id);
}

// trait per section (experimental, Crawford's own request) — matches AudioSettingSection/
// PingControlsDrawer/PingContourDrawer/SignatureArrayDrawer's own per-section
// getTraitColorStyle calls (output/composition/timeSpace/spectral respectively), so a
// probes.<id>.<section> or companies.<id>.<section> row colors itself the same as the actual
// section content it opens into.
// 'Volume' renders as 'Output' (label-only rename, docs/intent/nav-panel-views-and-content.md
// §New 4th tree level) — the id segment stays 'volume', matching RobotSection's own value.
const SECTION_CHILDREN: Omit<NavTreeNodeSchema, 'id'>[] = [
  { humanLabel: 'Levels', trait: 'output' },
  { humanLabel: 'Composition', trait: 'composition' },
  { humanLabel: 'Envelope', trait: 'timeSpace' },
  { humanLabel: 'Source', trait: 'spectral' },
];

// The 4th tree level (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §5.1) — shared by Probes and
// Companies, same as SECTION_CHILDREN itself. 'Robot Drift' renders as 'Probe Drift' — this is a
// brand-new node, not a rename of an existing tree label; RobotDriftPanel's own identifier is
// unaffected.
const SUBSECTION_CHILDREN: Record<RobotSection, { id: RobotSubsection; humanLabel: string }[]> = {
  volume: [{ id: 'audioSettings', humanLabel: 'Dynamics' }],
  melody: [
    { id: 'rhythm', humanLabel: 'Rhythm' },
    { id: 'frequency', humanLabel: 'Pitches' },
  ],
  envelope: [{ id: 'pingContour', humanLabel: 'Contour' }],
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
  const selectedSettingsSubsection = useUIStore((s) => s.selectedSettingsSubsection);
  const selectedFleetParamsEffect = useUIStore((s) => s.selectedFleetParamsEffect);
  const expandedProbeId = useUIStore((s) => s.expandedProbeId);
  const expandedCompanyId = useUIStore((s) => s.expandedCompanyId);
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
  const setSelectedSettingsSubsection = useUIStore((s) => s.setSelectedSettingsSubsection);
  const setSelectedFleetParamsEffect = useUIStore((s) => s.setSelectedFleetParamsEffect);
  const setExpandedProbeId = useUIStore((s) => s.setExpandedProbeId);
  const setExpandedCompanyId = useUIStore((s) => s.setExpandedCompanyId);
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

    // Ancestor auto-expand (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 14, spec §1.6) —
    // selecting any node reveals it in the tree, expanding every ancestor row needed to show it,
    // the same as if the user had clicked each +/- along the way. Only the entity level
    // (expandedProbeId/expandedCompanyId) and the branch level (expandedTopLevelBranch) need a
    // write here — the tier directly beneath them (Settings'/Fleet Params' own mid-level
    // children, Probes'/Companies' own section-level children) is always expanded once its
    // ancestor is, per isAutoExpandTier above; there is nothing left to set for it (docs/specs/
    // NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §1.3).
    const topLevel = asTopLevelBranch(branch);
    if (topLevel) setExpandedTopLevelBranch(topLevel);
    if ((branch === 'probes' || branch === 'companies') && entityId) {
      if (branch === 'probes') setExpandedProbeId(entityId);
      else setExpandedCompanyId(entityId);
    }

    if (branch === 'settings') {
      setActiveHubTile('settings');
      setSelectedSection(null);
      // Bugfix, Task 14 (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md) — selectedSubsection wasn't
      // being cleared alongside selectedSection here, so a Probes/Companies subsection selected
      // before navigating to Settings/Fleet Params stayed stale in the store (found via the
      // cross-branch integration test; harmless today since ContentPane only renders one branch's
      // content at a time, but stale state waiting to bite the next feature that reads it).
      setSelectedSubsection(null);
      // First-leaf-on-parent-select (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.6) — selecting
      // the bare branch itself opens its first leaf (Performance) rather than leaving nothing
      // open; the view/accordion model always has exactly one section open, never "nothing
      // selected."
      if (!entityId) {
        setSelectedSettingsLeaf(SETTINGS_LEAVES[0]);
        setSelectedSettingsSubsection(null);
        return;
      }
      setSelectedSettingsLeaf(asSettingsLeaf(entityId));
      setSelectedSettingsSubsection(section ? asSettingsSubsection(section) : null);
      return;
    }
    if (branch === 'fleetParams') {
      setActiveHubTile('audioRig');
      setSelectedSection(null);
      setSelectedSubsection(null); // Bugfix, Task 14 — same stale-selectedSubsection gap as settings above.
      // First-leaf-on-parent-select (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.6) — the bare
      // branch opens the overall first leaf; a category group (no `section` segment) opens ITS OWN
      // first child, not always the same one; a real leaf resolves as before.
      if (!entityId) {
        setSelectedFleetParamsEffect(FLEET_PARAMS_GROUP_FIRST_LEAF.eqFilters);
        return;
      }
      const group = asFleetParamsGroup(entityId);
      if (!section) {
        setSelectedFleetParamsEffect(group ? FLEET_PARAMS_GROUP_FIRST_LEAF[group] : null);
        return;
      }
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
    if (isAutoExpandTier(id)) return; // always expanded once visible — not independently collapsible, §1.3
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
    }
  }

  function isExpanded(id: string): boolean {
    if (isAutoExpandTier(id)) return true; // §1.3 — no ancestor state needs setting first
    const [branch, entityId, section] = id.split('.');
    if (!entityId) {
      const topLevel = asTopLevelBranch(branch);
      return topLevel ? expandedTopLevelBranch === topLevel : false;
    }
    if (branch === 'probes' && entityId && !section) return expandedProbeId === entityId;
    if (branch === 'companies' && entityId && !section) return expandedCompanyId === entityId;
    return false;
  }

  function isSelected(id: string): boolean {
    const [branch, entityId, section, subsection] = id.split('.');
    const wantedSection = asRobotSection(section);
    const wantedSubsection = asRobotSubsection(subsection);

    if (branch === 'settings') {
      if (!entityId) return activeHubTile === 'settings' && selectedSettingsLeaf === null;
      const leafMatches = activeHubTile === 'settings' && selectedSettingsLeaf === asSettingsLeaf(entityId);
      if (!section) return leafMatches && selectedSettingsSubsection === null;
      return leafMatches && selectedSettingsSubsection === asSettingsSubsection(section);
    }
    if (branch === 'fleetParams') {
      // Bare 'fleetParams' and any bare category node (e.g. 'fleetParams.pacing',
      // 'fleetParams.eqFilters') currently read identical (both need selectedFleetParamsEffect
      // === null) — same ambiguity isSelected('probes')/isSelected('probes.all') already
      // documents above. Harmless in practice: select() always resolves a category click to a
      // real first-leaf effect value (FLEET_PARAMS_GROUP_FIRST_LEAF), never leaves this null edge
      // state behind.
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
