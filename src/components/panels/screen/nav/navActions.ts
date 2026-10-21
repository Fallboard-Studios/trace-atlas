import {
  useUIStore,
  DEFAULT_FLEET_PARAMS_SECTION,
  type UIStore,
  type TopLevelBranch,
  type FleetParamsGroup,
  type SelectedFleetParamsEffect,
  type SettingsLeaf,
} from '@/stores/uiStore';
import type { HubTile } from '@/types/hub';
import { ROBOT_SECTIONS_CONFIG, activeRobotSection, sectionTabContent } from '@/data/robotSubsectionConfig';
import { LFO_BANK_LANE_CONTENT } from '@/data/lfoConfig';
import { labels, type ContentKey } from '@/content';

/**
 * Nav selection, in one place (docs/specs/LAYOUT_REWORK.md §1.2; docs/tasks/LAYOUT_REWORK.md Task 3):
 * the panel, its entity list, the breadcrumb, the roster and the company column all call these, and
 * no component derives a path itself. It replaced the old nav tree's select / goHome / selectedPath.
 *
 * Every action starts from a clean slate — no entity, no section on any branch (Fleet Params back on its
 * default tab, Task 15), the phone nav sheet shut (a pick closes it, Task 5) — then sets only what it
 * opens. Picking a parent opens that branch's
 * own page (Crawford, 2026-10-09): the Probes box and the breadcrumb's "Probes" segment return to the
 * list, never to the last robot. The store setters run through getState() so these are callable
 * outside a component, as goHome always was.
 */

export type NavBranch = TopLevelBranch | 'deck';
export type NavEntity = { robotId: string } | { companyId: string } | 'all';

const BRANCH_TILE: Record<TopLevelBranch, HubTile> = {
  probes: 'robots',
  companies: 'companies',
  fleetParams: 'audioRig',
  settings: 'settings',
};

/** Branches whose entities list in place under their box; Fleet Params and Settings are leaves. */
export type ExpandingBranch = 'probes' | 'companies';
const EXPANDS_IN_PLACE: ReadonlySet<NavBranch> = new Set<ExpandingBranch>(['probes', 'companies']);

const TILE_CONTENT: Record<HubTile, ContentKey> = {
  robots: 'probe.root',
  companies: 'company.root',
  audioRig: 'fleet.root',
  settings: 'settings.root',
};

/** The parent box a tile belongs to (the one the panel pops) — the Deck when no tile is open. */
export function branchOfTile(tile: HubTile | null): NavBranch {
  if (tile === null) return 'deck';
  return (Object.keys(BRANCH_TILE) as TopLevelBranch[]).find((branch) => BRANCH_TILE[branch] === tile)!;
}

/** Whether a branch lists its entities in place under its box — the panel widens for these. */
export function expandsInPlace(branch: NavBranch): branch is ExpandingBranch {
  return EXPANDS_IN_PLACE.has(branch);
}

/** A parent box's label: the Deck's own entry, else its tile's root concept (the breadcrumb's name). */
export function branchContent(branch: NavBranch): ContentKey {
  return branch === 'deck' ? 'nav.home' : TILE_CONTENT[BRANCH_TILE[branch]];
}

/** One Fleet Params sub-tab: the leaf it opens and the entry it is named from (its panel's own). */
export interface FleetParamsSubTab {
  id: SelectedFleetParamsEffect;
  content: ContentKey;
}

/** Each Fleet Params section's sub-tabs, in the sketch's order (Task 15). Pacing has none: its four
 *  leaves are one panel of two rows. The screen and the breadcrumb both read this, so they name the
 *  same tab. */
export const FLEET_PARAMS_SUBSECTIONS: Record<FleetParamsGroup, readonly FleetParamsSubTab[]> = {
  pacing: [],
  lfoBank: [
    { id: 'laneA', content: LFO_BANK_LANE_CONTENT.a },
    { id: 'laneB', content: LFO_BANK_LANE_CONTENT.b },
    { id: 'laneC', content: LFO_BANK_LANE_CONTENT.c },
    { id: 'laneD', content: LFO_BANK_LANE_CONTENT.d },
  ],
  eqFilters: [
    { id: 'eq3', content: 'fleet.eq' },
    { id: 'filterHPF', content: 'fleet.hpf' },
    { id: 'filterLPF', content: 'fleet.lpf' },
  ],
  timeSpace: [
    { id: 'reverb', content: 'fleet.reverb' },
    { id: 'delay', content: 'fleet.delay' },
  ],
  // Chain order (docs/specs/GLOBAL_COLOUR.md assumption 10): the three dry-chain colour effects.
  colour: [
    { id: 'distortion', content: 'fleet.distortion' },
    { id: 'chebyshev', content: 'fleet.chebyshev' },
    { id: 'bitCrusher', content: 'fleet.bitCrusher' },
  ],
  // Chain order (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 3, wah first; docs/specs/GLOBAL_PEDALS.md
  // assumption 11, the four motion pedals after the Phaser): the six modulation pedals.
  modulation: [
    { id: 'autoWah', content: 'fleet.autoWah' },
    { id: 'phaser', content: 'fleet.phaser' },
    { id: 'chorus', content: 'fleet.chorus' },
    { id: 'tremolo', content: 'fleet.tremolo' },
    { id: 'vibrato', content: 'fleet.vibrato' },
    { id: 'frequencyShifter', content: 'fleet.frequencyShifter' },
  ],
  // Chain order: Width sits between the Compressor and the Limiter (docs/specs/GLOBAL_PEDALS.md assumption 11).
  output: [
    { id: 'compressor', content: 'fleet.compressor' },
    { id: 'stereoWidener', content: 'fleet.stereoWidener' },
    { id: 'limiter', content: 'fleet.limiter' },
  ],
};

/** The sub-tab a section shows: the stored one when it is this section's, else the section's first
 *  (null, or one left from another section — SectionTabs' own stale-value rule), and none on Pacing. */
export function activeFleetParamsSubsection(
  section: FleetParamsGroup,
  stored: SelectedFleetParamsEffect | null,
): SelectedFleetParamsEffect | null {
  const subs = FLEET_PARAMS_SUBSECTIONS[section];
  return subs.find((sub) => sub.id === stored)?.id ?? subs[0]?.id ?? null;
}

export const FLEET_PARAMS_GROUP_CONTENT: Record<FleetParamsGroup, ContentKey> = {
  pacing: 'fleet.pacing',
  lfoBank: 'fleet.lfoBank',
  eqFilters: 'fleet.eqFilters',
  timeSpace: 'fleet.timeSpace',
  colour: 'fleet.colour',
  modulation: 'fleet.modulation',
  output: 'fleet.output',
};

/** Settings' three tabs in the sketch's order (Task 17). The screen and the breadcrumb both read this
 *  and the names below, so they name the same tab; it is the one order there is. */
export const SETTINGS_LEAVES: readonly SettingsLeaf[] = ['quality', 'sectorSettings', 'sessions'];

/** Each Settings tab's concept: its title on the tab and in the breadcrumb. */
export const SETTINGS_LEAF_CONTENT: Record<SettingsLeaf, ContentKey> = {
  quality: 'settings.quality',
  sectorSettings: 'settings.seeds',
  sessions: 'settings.sessions',
};

/** The tab Settings opens on, and every nav pick returns to (cleanSlate stores null). */
export const DEFAULT_SETTINGS_LEAF: SettingsLeaf = SETTINGS_LEAVES[0];

/** The open Settings tab: the stored one when it is a tab, else Audio Quality — the tab SectionTabs
 *  falls back to, so the breadcrumb never names a tab the screen is not showing. */
export function activeSettingsLeaf(stored: SettingsLeaf | null): SettingsLeaf {
  return SETTINGS_LEAVES.find((leaf) => leaf === stored) ?? DEFAULT_SETTINGS_LEAF;
}

function cleanSlate(): void {
  const s = useUIStore.getState();
  s.setNavPanelOpen(false); // the phone sheet's open flag; the desk panel ignores it
  s.selectRobot(null); // also clears selectedSection / selectedSubsection
  s.selectAllRobots(); // the "no company" state: selectedCompanyId null, allRobotsSelected true
  s.setAllProbesSelected(false);
  s.setFleetParamsSection(DEFAULT_FLEET_PARAMS_SECTION); // also clears the sub-tab
  s.setSelectedSettingsLeaf(null); // Settings back on its first tab (Task 17)
}

/** Opens a branch's tile with its entity list expanded in place (Probes / Companies) or collapsed. */
function open(branch: TopLevelBranch, expand = expandsInPlace(branch)): void {
  const s = useUIStore.getState();
  s.setActiveHubTile(BRANCH_TILE[branch]);
  s.setExpandedTopLevelBranch(expand ? branch : null);
}

/** A parent box: that branch's own page, Probes / Companies expanded in place, a leaf collapsing
 *  whatever was. `'deck'` is goHome. */
export function selectBranch(branch: NavBranch): void {
  if (branch === 'deck') {
    goHome();
    return;
  }
  cleanSlate();
  open(branch);
}

/** An entity under Probes or Companies: opens its branch on it, at no section, with the list collapsed
 *  (Crawford, 2026-10-10: "collapse the nav when a probe or company is selected"), so the entity's
 *  screen gets the panel's rest width. The parent box brings the list back (pressBranchBox). */
export function selectEntity(entity: NavEntity): void {
  cleanSlate();
  const s = useUIStore.getState();
  if (entity === 'all') {
    s.setAllProbesSelected(true);
    open('probes', false);
  } else if ('robotId' in entity) {
    s.selectRobot(entity.robotId);
    open('probes', false);
  } else {
    s.selectCompany(entity.companyId);
    open('companies', false);
  }
}

/** Only the open branch's own entity counts, as the breadcrumb reads it: a robot picked in the world
 *  is not a Companies entity. */
function branchHasEntity(s: UIStore, branch: ExpandingBranch): boolean {
  return branch === 'probes' ? s.selectedRobotId !== null || s.allProbesSelected : s.selectedCompanyId !== null;
}

/** A parent box pressed in the panel (Crawford, 2026-10-09: "back, then collapse"). Anywhere but its
 *  own page it is selectBranch, so on an entity it goes back to the branch's page with the list open.
 *  On Probes' or Companies' own page it toggles the list in place and changes nothing else. Other
 *  callers use selectBranch, which never toggles. */
export function pressBranchBox(branch: NavBranch): void {
  const s = useUIStore.getState();
  if (expandsInPlace(branch) && branchOfTile(s.activeHubTile) === branch && !branchHasEntity(s, branch)) {
    s.setExpandedTopLevelBranch(s.expandedTopLevelBranch === branch ? null : branch);
    return;
  }
  selectBranch(branch);
}

/** The Deck: no tile, nothing expanded, no entity. */
export function goHome(): void {
  cleanSlate();
  const s = useUIStore.getState();
  s.setActiveHubTile(null);
  s.setExpandedTopLevelBranch(null);
}

// ========================================
// BREADCRUMB
// ========================================

export type BreadcrumbState = Pick<
  UIStore,
  | 'activeHubTile'
  | 'selectedRobotId'
  | 'selectedCompanyId'
  | 'allProbesSelected'
  | 'selectedSection'
  | 'fleetParamsSection'
  | 'fleetParamsSubsection'
  | 'selectedSettingsLeaf'
>;

interface NamedEntity {
  id: string;
  name?: string;
}

/** Entity names are data, read by the caller from localeStore. */
export interface NavRoster {
  robots: readonly NamedEntity[];
  companies: readonly NamedEntity[];
}

const name = (key: ContentKey) => labels(key).humanLabel;

/** A robot's name falls back to its id, as the tree's rows did; an id not in the roster is null. */
function nameOf(list: readonly NamedEntity[], id: string): string | null {
  const entity = list.find((e) => e.id === id);
  return entity ? (entity.name ?? entity.id) : null;
}

/** Only the open branch's entity counts; a specific robot wins over All Probes, as ProbesContent routes.
 *  With its name, the entity selectEntity takes to go back to it. */
function openEntity(state: BreadcrumbState, roster: NavRoster, tile: 'robots' | 'companies'): { label: string; entity: NavEntity } | null {
  if (tile === 'companies') {
    const id = state.selectedCompanyId;
    const label = id !== null ? nameOf(roster.companies, id) : null;
    return id !== null && label !== null ? { label, entity: { companyId: id } } : null;
  }
  if (state.selectedRobotId !== null) {
    const id = state.selectedRobotId;
    const label = nameOf(roster.robots, id);
    return label !== null ? { label, entity: { robotId: id } } : null;
  }
  return state.allProbesSelected ? { label: name('probe.all'), entity: 'all' } : null;
}

/** One breadcrumb segment: its name and, for Root, the branch, the entity and a Fleet Params section
 *  with a sub-tab after it, the call that goes there (Tasks 8, 15). A robot section, a Fleet Params
 *  sub-tab, Pacing or a Settings leaf has none: it is only ever the current view. */
export interface BreadcrumbSegment {
  label: string;
  go?: () => void;
}

/** Root / branch / entity / section — `[]` on the Deck. A section shows only under an entity (Probes,
 *  Companies), as Settings' leaf, or as Fleet Params' open tab and sub-tab (Root / Fleet Params /
 *  <section> / <sub-tab>). The branch goes back with selectBranch, which never toggles (pressBranchBox
 *  is the panel's own). */
export function breadcrumbTrail(state: BreadcrumbState, roster: NavRoster): BreadcrumbSegment[] {
  const tile = state.activeHubTile;
  if (tile === null) return [];
  const branch = branchOfTile(tile);
  const trail: BreadcrumbSegment[] = [
    { label: name('nav.root'), go: goHome },
    { label: name(TILE_CONTENT[tile]), go: () => selectBranch(branch) },
  ];

  if (tile === 'audioRig') {
    // Always a tab open (Task 15). The section is an ancestor, going to its first sub-tab, only when a
    // sub-tab follows it; Pacing has none, so it is the current view.
    const section = state.fleetParamsSection;
    const sub = FLEET_PARAMS_SUBSECTIONS[section].find((s) => s.id === activeFleetParamsSubsection(section, state.fleetParamsSubsection));
    const label = name(FLEET_PARAMS_GROUP_CONTENT[section]);
    if (!sub) {
      trail.push({ label });
      return trail;
    }
    trail.push({ label, go: () => useUIStore.getState().setFleetParamsSection(section) });
    trail.push({ label: name(sub.content) });
    return trail;
  }
  if (tile === 'settings') {
    // Always a tab open (Task 17): Audio Quality when none is stored.
    trail.push({ label: name(SETTINGS_LEAF_CONTENT[activeSettingsLeaf(state.selectedSettingsLeaf)]) });
    return trail;
  }

  const open = openEntity(state, roster, tile);
  if (open === null) return trail;
  trail.push({ label: open.label, go: () => selectEntity(open.entity) });
  // A robot's screen is tabs (Task 16), and so are a company's and All Probes' (Task 23: the same
  // SectionTabs), so one is always open: Source when none is stored.
  const section = ROBOT_SECTIONS_CONFIG.find((s) => s.id === activeRobotSection(state.selectedSection));
  if (section) trail.push({ label: name(sectionTabContent(section)) });
  return trail;
}
