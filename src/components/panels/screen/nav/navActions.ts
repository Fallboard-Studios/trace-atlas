import {
  useUIStore,
  DEFAULT_FLEET_PARAMS_SECTION,
  type UIStore,
  type TopLevelBranch,
  type FleetParamsGroup,
  type SelectedFleetParamsEffect,
  type NavStop,
} from '@/stores/uiStore';
import type { HubTile } from '@/types/hub';
import { ROBOT_SECTIONS_CONFIG, activeRobotSection } from '@/data/robotSubsectionConfig';
import { LFO_BANK_LANE_CONTENT } from '@/data/lfoConfig';
import { labels, type ContentKey } from '@/content';

/**
 * Nav selection, in one place (docs/specs/LAYOUT_REWORK.md §1.2; docs/tasks/LAYOUT_REWORK.md Task 3):
 * the panel, the breadcrumb, the roster and the company column all call these, and
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
  fleetParams: 'audioRig',
};

const TILE_CONTENT: Record<HubTile, ContentKey> = {
  robots: 'probe.root',
  audioRig: 'fleet.root',
};

/** The parent box a tile belongs to (the one the panel pops) — the Deck when no tile is open. */
export function branchOfTile(tile: HubTile | null): NavBranch {
  if (tile === null) return 'deck';
  return (Object.keys(BRANCH_TILE) as TopLevelBranch[]).find((branch) => BRANCH_TILE[branch] === tile)!;
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

/** Each Fleet Params section's sub-tabs, in the sketch's order (Task 15). Every section has a sub-tab row:
 *  World's are Pacing and Settings (docs/specs/CONTENT_LAYOUT.md §1.2), each named from its panel's own
 *  entry. The screen and the breadcrumb both read this, so they name the same tab. */
export const FLEET_PARAMS_SUBSECTIONS: Record<FleetParamsGroup, readonly FleetParamsSubTab[]> = {
  world: [
    { id: 'pacing', content: 'fleet.pacing' },
    { id: 'quality', content: 'fleet.quality' },
  ],
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
 *  (null, or one left from another section — SectionTabs' own stale-value rule). Null only for a
 *  section with no sub-tabs, which none is today. */
export function activeFleetParamsSubsection(
  section: FleetParamsGroup,
  stored: SelectedFleetParamsEffect | null,
): SelectedFleetParamsEffect | null {
  const subs = FLEET_PARAMS_SUBSECTIONS[section];
  return subs.find((sub) => sub.id === stored)?.id ?? subs[0]?.id ?? null;
}

export const FLEET_PARAMS_GROUP_CONTENT: Record<FleetParamsGroup, ContentKey> = {
  world: 'fleet.world',
  lfoBank: 'fleet.lfoBank',
  eqFilters: 'fleet.eqFilters',
  timeSpace: 'fleet.timeSpace',
  colour: 'fleet.colour',
  modulation: 'fleet.modulation',
  output: 'fleet.output',
};

// ========================================
// THE TRAIL (docs/specs/NAVIGATION_CLOSE_AND_BACK.md §1.2)
// ========================================

/** The most stops the trail holds; a step past it drops the oldest (spec §7.1 A3). */
export const NAV_TRAIL_MAX = 50;

/** A screen's identity, one string: `deck`, `probes`, `robot:<id>`, `company:<id>`, `all` or `fleetParams`.
 *  Under Probes a robot wins over a company and a company over All Probes, as ProbesBranch routes. Fleet Params
 *  ignores the entity fields: a robot clicked in the world there only moves the halo. Tabs are not identity. */
function stopKey(stop: Pick<NavStop, 'tile' | 'robotId' | 'companyId' | 'allProbes'>): string {
  if (stop.tile === null) return 'deck';
  if (stop.tile === 'audioRig') return 'fleetParams';
  if (stop.robotId !== null) return `robot:${stop.robotId}`;
  if (stop.companyId !== null) return `company:${stop.companyId}`;
  return stop.allProbes ? 'all' : 'probes';
}

/** The screen showing now, as stopKey names it. */
function screenKey(s: UIStore): string {
  return stopKey({ tile: s.activeHubTile, robotId: s.selectedRobotId, companyId: s.selectedCompanyId, allProbes: s.allProbesSelected });
}

/** The screen showing now, with its four tab fields, as a stop. */
function currentStop(s: UIStore): NavStop {
  return {
    tile: s.activeHubTile,
    robotId: s.selectedRobotId,
    companyId: s.selectedCompanyId,
    allProbes: s.allProbesSelected,
    section: s.selectedSection,
    subsection: s.selectedSubsection,
    fleetSection: s.fleetParamsSection,
    fleetSubsection: s.fleetParamsSubsection,
  };
}

/** A step (spec §1.2): appends the screen being left, unless `destination` (a screenKey) is the screen showing.
 *  Called first by selectBranch, selectEntity and goHome, before they change anything; never by Back. */
function recordStep(destination: string): void {
  const s = useUIStore.getState();
  if (screenKey(s) === destination) return;
  appendStop(currentStop(s));
}

/** Appends a stop to the trail, dropping the oldest past NAV_TRAIL_MAX. The one place the cap lives. */
function appendStop(stop: NavStop): void {
  const s = useUIStore.getState();
  const trail = [...s.navTrail, stop];
  s.setNavTrail(trail.length > NAV_TRAIL_MAX ? trail.slice(trail.length - NAV_TRAIL_MAX) : trail);
}

/** The screenKey an entity pick opens. */
function entityKey(entity: NavEntity): string {
  if (entity === 'all') return 'all';
  return 'robotId' in entity ? `robot:${entity.robotId}` : `company:${entity.companyId}`;
}

/** A help jump's request that Fleet Params focus its open sub-tab (docs/specs/HELP_POPOVER_LINKS.md §1.5, A3): a
 *  module-level one-shot, not a store field, so it re-renders nothing and needs no clearing write. Set by
 *  openFleetParamsAt after it changes the tabs; cleared by every other action's clean slate, so a request never taken
 *  cannot fire on a later, unrelated Fleet Params render. */
let arrivalFocus = false;

/** Fleet Params' sub-tab row asks this after the commit that mounts the open sub-tab: true once per help jump. */
export function takeArrivalFocus(): boolean {
  const requested = arrivalFocus;
  arrivalFocus = false;
  return requested;
}

function cleanSlate(): void {
  arrivalFocus = false;
  const s = useUIStore.getState();
  s.setNavPanelOpen(false); // the phone sheet's open flag; the desk panel ignores it
  s.selectRobot(null); // also clears selectedSection / selectedSubsection
  s.selectAllRobots(); // the "no company" state: selectedCompanyId null, allRobotsSelected true
  s.setAllProbesSelected(false);
  s.setFleetParamsSection(DEFAULT_FLEET_PARAMS_SECTION); // also clears the sub-tab
}

/** Opens a branch's tile. */
function open(branch: TopLevelBranch): void {
  useUIStore.getState().setActiveHubTile(BRANCH_TILE[branch]);
}

/** A parent box: that branch's own page. On that page already it changes nothing. `'deck'` is goHome. */
export function selectBranch(branch: NavBranch): void {
  if (branch === 'deck') {
    goHome();
    return;
  }
  recordStep(branch);
  cleanSlate();
  open(branch);
}

/** An entity under Probes (a robot, All Probes or a company): opens Probes on it, at no section. */
export function selectEntity(entity: NavEntity): void {
  recordStep(entityKey(entity));
  cleanSlate();
  const s = useUIStore.getState();
  if (entity === 'all') s.setAllProbesSelected(true);
  else if ('robotId' in entity) s.selectRobot(entity.robotId);
  // A company opens under Probes (docs/tasks/OFF_SCREEN_CONSOLE.md Task 17, Crawford, 2026-11-09).
  else s.selectCompany(entity.companyId);
  open('probes');
}

/** A help link's jump (docs/specs/HELP_POPOVER_LINKS.md §1.3): Fleet Params on this tab and sub-tab, recorded as a
 *  step even from Fleet Params itself (the one step inside it), so Back returns to the tab the link was pressed on.
 *  Showing that tab and sub-tab already, it changes nothing. */
export function openFleetParamsAt(section: FleetParamsGroup, subsection: SelectedFleetParamsEffect): void {
  const s = useUIStore.getState();
  const here =
    s.activeHubTile === 'audioRig' &&
    s.fleetParamsSection === section &&
    activeFleetParamsSubsection(section, s.fleetParamsSubsection) === subsection;
  if (here) return;
  appendStop(currentStop(s)); // recordStep's append and cap, without its same-screen skip
  cleanSlate();
  open('fleetParams');
  const next = useUIStore.getState();
  next.setFleetParamsSection(section); // also clears the sub-tab, so the section comes first
  next.setFleetParamsSubsection(subsection);
  arrivalFocus = true;
}

/** The Deck: no tile, no entity. Close on the screen row (spec §1.3): a step like any other, so a
 *  Back after it returns to the screen closed. */
export function goHome(): void {
  recordStep('deck');
  cleanSlate();
  showDeck();
}

function showDeck(): void {
  useUIStore.getState().setActiveHubTile(null);
}

/** Shows a stop after the clean slate. The order matters: selectRobot clears the robot tabs and
 *  setFleetParamsSection clears its sub-tab, so the entity comes before its tabs and each section before its
 *  sub-tab. */
function restore(stop: NavStop): void {
  const s = useUIStore.getState();
  s.setActiveHubTile(stop.tile);
  if (stop.robotId !== null) s.selectRobot(stop.robotId);
  if (stop.companyId !== null) s.selectCompany(stop.companyId);
  s.setAllProbesSelected(stop.allProbes);
  s.setSelectedSection(stop.section);
  s.setSelectedSubsection(stop.subsection);
  s.setFleetParamsSection(stop.fleetSection);
  s.setFleetParamsSubsection(stop.fleetSubsection);
}

/** A deleted company leaves the trail (spec §1.3, §7.1 A5), so Back never lands on a screen with nothing to show.
 *  Every stop naming the company goes; two stops left side by side for one screen become the later one; a last stop
 *  that is the Probes list goes too, since that is the screen this shows. Then the Probes list, with no step
 *  recorded: the company's screen is gone, not left. The delete path calls this in place of selectBranch('probes'). */
export function closeDeletedCompany(companyId: string): void {
  const s = useUIStore.getState();
  const kept: NavStop[] = [];
  for (const stop of s.navTrail) {
    if (stop.companyId === companyId) continue;
    const last = kept.at(-1);
    if (last && stopKey(last) === stopKey(stop)) kept[kept.length - 1] = stop;
    else kept.push(stop);
  }
  while (kept.length > 0 && stopKey(kept[kept.length - 1]) === 'probes') kept.pop();
  s.setNavTrail(kept);
  cleanSlate();
  open('probes');
}

/** Back (spec §1.3): the last stop on the trail, on the tabs it showed, taken off the trail; the deck when the trail
 *  is empty. Never a step itself. The screen row's Back and the browser's Back both call this. */
export function back(): void {
  const s = useUIStore.getState();
  const stop = s.navTrail.at(-1);
  if (stop) s.setNavTrail(s.navTrail.slice(0, -1));
  cleanSlate();
  if (stop) restore(stop);
  else showDeck();
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

/** Probes' entity: a specific robot wins over a company, and a company over All Probes, as ProbesBranch
 *  routes. With its name, the entity selectEntity takes to go back to it. */
function openEntity(state: BreadcrumbState, roster: NavRoster): { label: string; entity: NavEntity } | null {
  if (state.selectedRobotId !== null) {
    const id = state.selectedRobotId;
    const label = nameOf(roster.robots, id);
    return label !== null ? { label, entity: { robotId: id } } : null;
  }
  if (state.selectedCompanyId !== null) {
    const id = state.selectedCompanyId;
    const label = nameOf(roster.companies, id);
    return label !== null ? { label, entity: { companyId: id } } : null;
  }
  return state.allProbesSelected ? { label: name('probe.all'), entity: 'all' } : null;
}

/** One breadcrumb segment: its name and, for Root, the branch, the entity and a Fleet Params section
 *  with a sub-tab after it, the call that goes there (Tasks 8, 15). A robot section or a Fleet Params
 *  sub-tab has none: it is only ever the current view. */
export interface BreadcrumbSegment {
  label: string;
  go?: () => void;
}

/** Root / branch / entity / section — `[]` on the Deck. A section shows only under a Probes entity
 *  (a robot, a company, All Probes), or as Fleet Params' open tab and sub-tab (Root / Fleet Params /
 *  <section> / <sub-tab>). The branch goes back with selectBranch, as the panel's box does. */
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
    // sub-tab follows it (every section has one today); a section with none would be the current view.
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

  const open = openEntity(state, roster);
  if (open === null) return trail;
  trail.push({ label: open.label, go: () => selectEntity(open.entity) });
  // A robot's screen is tabs (Task 16), and so are a company's and All Probes' (Task 23: the same
  // SectionTabs), so one is always open: Source when none is stored.
  const section = ROBOT_SECTIONS_CONFIG.find((s) => s.id === activeRobotSection(state.selectedSection));
  if (section) trail.push({ label: name(section.content) });
  return trail;
}
