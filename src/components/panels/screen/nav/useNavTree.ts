import { useMemo, useRef } from 'react';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore, type RobotSection, type RobotSubsection, type FleetParamsGroup, type SettingsLeaf, type SettingsSubsection, type SelectedFleetParamsEffect, type TopLevelBranch } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { NAV_TREE_SCHEMA, type NavTreeNodeSchema } from '@/data/navTreeConfig';
import { ROBOT_SECTIONS_CONFIG } from '@/data/robotSubsectionConfig';

/**
 * Resolves the Navigation & Layout Rewrite's tree (docs/specs/NAV_LAYOUT_REWRITE.md §1.5/§3) —
 * merges NAV_TREE_SCHEMA's static nodes with per-robot (`probes.<robotId>.*`) and per-company
 * (`companies.<companyId>.*`) subtrees generated live from localeStore, and translates between
 * a node's generic id and the typed uiStore fields it maps to. Node ids are namespaced
 * `<branch>[.<entityId>[.<section>]]` and are only ever parsed here, to decide which typed
 * field to write — nothing downstream (ContentPane, NavTreeNode) parses an id itself; they
 * read this hook's typed isSelected/isExpanded/select/toggleExpand instead (spec §1.5).
 */

// Derived from ROBOT_SECTIONS_CONFIG (docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md), not a
// second hand-typed list — asRobotSection below is a pure id-parsing type guard, independent of
// sectionChildNodes' own use of the config further down.
const ROBOT_SECTIONS: readonly RobotSection[] = ROBOT_SECTIONS_CONFIG.map((s) => s.id);
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
];
function asRobotSubsection(value: string | undefined): RobotSubsection | null {
  return value && (ROBOT_SUBSECTIONS as readonly string[]).includes(value) ? (value as RobotSubsection) : null;
}

const FLEET_PARAMS_GROUPS: readonly FleetParamsGroup[] = ['pacing', 'eqFilters', 'fleetDrift', 'timeSpace', 'output'];
function asFleetParamsGroup(value: string | undefined): FleetParamsGroup | null {
  return value && (FLEET_PARAMS_GROUPS as readonly string[]).includes(value) ? (value as FleetParamsGroup) : null;
}

/** Each group's own first child, in tree order — docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.6's
 *  first-leaf-on-parent-select, one entry per FleetParamsGroup so a group click opens its own
 *  first leaf rather than always the same one. */
const FLEET_PARAMS_GROUP_FIRST_LEAF: Record<FleetParamsGroup, SelectedFleetParamsEffect> = {
  pacing: 'tempo',
  eqFilters: 'eq3',
  fleetDrift: 'globalDrift',
  timeSpace: 'reverb',
  output: 'compressor',
};

// Kept in sync by hand with SettingsContent.tsx's own SETTINGS_LEAVES — see
// docs/DUPLICATE_VALUE_AUDIT.md item 6 (opened alongside the 'sessions' addition, not fixed here).
const SETTINGS_LEAVES: readonly SettingsLeaf[] = ['quality', 'sectorSettings', 'sessions'];
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
  // Bugfix: Pacing's own 'frequency'/'duration' leaves (navTreeConfig.ts) were missing here,
  // unlike every other Fleet Params leaf — asFleetParamsEffectKey fell back to null for both, so
  // select('fleetParams.pacing.frequency') set selectedFleetParamsEffect to null instead of
  // 'swellFrequency' (same for duration/'swellDuration'), and isSelected(...) could never read
  // true for the real selection, only for the unrelated null-effect gap state its own comment
  // documents. Found via useNavTree.test.ts's new selectedPath coverage, not assumed.
  frequency: 'swellFrequency',
  duration: 'swellDuration',
  automaticEffects: 'automaticEffects',
  // LFO Drift's own 2 leaves (docs/specs/FLEET_DRIFT_CONSOLIDATION.md, follow-up) — match
  // navTreeConfig.ts's 'fleetParams.fleetDrift.drift'/'.robots' leaf segments. 'robots' is Robot
  // Drift, moved here from Probes/Companies entirely (no longer duplicated there).
  drift: 'globalDrift',
  robots: 'robotDrift',
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

/** Ancestor auto-expand (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 14, spec §1.6) — expands
 *  every ancestor row needed to reveal `id` in the tree, the same as if the user had clicked each
 *  +/- along the way. Only the entity level (expandedProbeId/expandedCompanyId) and the branch
 *  level (expandedTopLevelBranch) ever need a write — the tier directly beneath them is always
 *  expanded once its own ancestor is, per isAutoExpandTier above.
 *
 *  Extracted out of select()'s own body (docs/specs/NAV_ACCORDION_SYNC.md §7 open question 2) so
 *  useAccordionOpenState.ts can reuse the exact same logic when an accordion opens from any
 *  source, not just a nav click — without duplicating this id-parsing a second time. Implemented
 *  via useUIStore.getState() rather than hook-bound setters so it's callable outside a component. */
export function expandNavAncestorsForId(id: string): void {
  const [branch, entityId] = id.split('.');
  const { setExpandedTopLevelBranch, setExpandedProbeId, setExpandedCompanyId } = useUIStore.getState();

  const topLevel = asTopLevelBranch(branch);
  if (topLevel) setExpandedTopLevelBranch(topLevel);
  if ((branch === 'probes' || branch === 'companies') && entityId) {
    if (branch === 'probes') setExpandedProbeId(entityId);
    else setExpandedCompanyId(entityId);
  }
}

// Section/subsection id, nav-row label, and trait now come from ROBOT_SECTIONS_CONFIG
// (docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md) — previously two locally-hand-typed tables
// here (SECTION_CHILDREN/SUBSECTION_CHILDREN) that independently restated the same ids/labels
// RobotOptionsTab.tsx/CompanyOptionsSection.tsx also hand-typed for their own accordions. trait
// per section (experimental, Crawford's own request) matches AudioSettingSection/
// PingControlsDrawer/PingContourDrawer/SignatureArrayDrawer's own per-section getTraitColorStyle
// calls (output/composition/timeSpace/spectral respectively), so a probes.<id>.<section> or
// companies.<id>.<section> row colors itself the same as the actual section content it opens
// into. Each subsection's *nav-row* label (navLabel) is used here — never accordionLabel, which
// is the content view's own accordion-trigger text and may legitimately differ (e.g. 'rhythm'
// reads 'Rhythm' in the tree, 'Composition' as its accordion trigger).
function sectionChildNodes(entityBranchPrefix: string): NavTreeNodeSchema[] {
  return ROBOT_SECTIONS_CONFIG.map((section) => ({
    id: `${entityBranchPrefix}.${section.id}`,
    loreLabel: section.loreLabel,
    humanLabel: section.navLabel,
    trait: section.trait,
    children: section.subsections.map((sub) => ({
      id: `${entityBranchPrefix}.${section.id}.${sub.id}`,
      loreLabel: sub.loreLabel,
      humanLabel: sub.navLabel,
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

/**
 * Depth-first search for whichever single node's own id currently satisfies `isSelected` — the
 * root-to-node ancestor chain leading to it, for anything that wants a "where am I" readout
 * (NavBreadcrumb) without re-parsing ids itself, matching the "id-parsing stays centralized here"
 * boundary the rest of this file already documents. `isSelected` is an exact match per id, not a
 * hierarchical one (a leaf's own isSelected() doesn't imply its parent's — see that function's own
 * comments), so at most one id is expected to match at a time; this walk defensively keeps the
 * DEEPEST match if more than one ever does, rather than an arbitrary/shorter one — isSelected's own
 * comment documents one known case where a bare branch and a bare category node can briefly both
 * read true (selectedFleetParamsEffect === null), currently harmless only because select() never
 * leaves it that way, but a breadcrumb reading the same state a different way (a scroll-driven
 * update, not a click) shouldn't have to assume that stays true forever.
 */
function findSelectedPath(
  nodes: NavTreeNodeSchema[],
  isSelected: (id: string) => boolean,
  ancestors: NavTreeNodeSchema[] = [],
): NavTreeNodeSchema[] | null {
  let best: NavTreeNodeSchema[] | null = null;
  for (const node of nodes) {
    const path = [...ancestors, node];
    if (isSelected(node.id) && (!best || path.length > best.length)) {
      best = path;
    }
    if (node.children) {
      const childBest = findSelectedPath(node.children, isSelected, path);
      if (childBest && (!best || childBest.length > best.length)) {
        best = childBest;
      }
    }
  }
  return best;
}

/**
 * Drops a trailing leaf (a node with no children of its own) from the end of findSelectedPath's
 * result, so NavBreadcrumb reads as "the lowest-level PARENT the user is under" rather than the
 * exact selected field itself (Crawford's own call — e.g. Fleet Params' "Reverb" or a robot's
 * "Rhythm" subsection is one level too specific; the group/section that HOUSES it — "Time & Space",
 * "Composition" — is the meaningful stopping point, matching where the accordion boundary actually
 * sits). A node that itself has children (a bare branch, a robot/company entity, a section with its
 * own subsections, a Fleet Params/Settings category) is never dropped — there's nothing to trim to.
 * A loop, not a single pop, for correctness rather than assuming a leaf's own parent always has
 * children — though in this tree's actual shape it only ever runs once.
 */
function trimToLowestParent(path: NavTreeNodeSchema[]): NavTreeNodeSchema[] {
  const trimmed = [...path];
  while (trimmed.length > 1 && !(trimmed[trimmed.length - 1].children?.length)) {
    trimmed.pop();
  }
  return trimmed;
}

export interface UseNavTreeResult {
  /** The full tree — NAV_TREE_SCHEMA's static branches with Probes'/Companies' dynamic
   *  per-entity subtrees spliced in. */
  nodes: NavTreeNodeSchema[];
  isExpanded: (id: string) => boolean;
  isSelected: (id: string) => boolean;
  select: (id: string) => void;
  toggleExpand: (id: string) => void;
  /** Root-to-node ancestor chain of whichever node isSelected() currently matches (see
   *  findSelectedPath above), trimmed of a trailing childless leaf (trimToLowestParent) — [] when
   *  nothing in the tree is selected, which includes the true blank/landing state
   *  (activeHubTile === null) and is also what a caller should treat as "no breadcrumb to show." */
  selectedPath: NavTreeNodeSchema[];
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

    // Ancestor auto-expand — extracted to expandNavAncestorsForId (docs/specs/
    // NAV_ACCORDION_SYNC.md §7 open question 2) so useAccordionOpenState.ts can reuse the exact
    // same logic when an accordion opens from any source, not just a nav click.
    expandNavAncestorsForId(id);

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

  const selectedPath = trimToLowestParent(findSelectedPath(nodes, isSelected) ?? []);

  return { nodes, isExpanded, isSelected, select, toggleExpand, selectedPath };
}
