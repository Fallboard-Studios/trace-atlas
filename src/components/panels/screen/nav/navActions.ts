import {
  useUIStore,
  type UIStore,
  type TopLevelBranch,
  type FleetParamsGroup,
  type SelectedFleetParamsEffect,
  type SettingsLeaf,
} from '@/stores/uiStore';
import type { HubTile } from '@/types/hub';
import { ROBOT_SECTIONS_CONFIG } from '@/data/robotSubsectionConfig';
import { labels, type ContentKey } from '@/content';

/**
 * Nav selection, in one place (docs/specs/LAYOUT_REWORK.md §1.2; docs/tasks/LAYOUT_REWORK.md Task 3):
 * the panel, its entity list, the breadcrumb, the roster and the company column all call these, and
 * no component derives a path itself. Replaces useNavTree's select / goHome / selectedPath, which go
 * with the tree in Task 9.
 *
 * Every action starts from a clean slate — no entity, no section on any branch — then sets only what
 * it opens. Picking a parent opens that branch's own page (Crawford, 2026-10-09): the Probes box and
 * the breadcrumb's "Probes" segment return to the list, never to the last robot. The store setters
 * run through getState() so these are callable outside a component, as goHome always was.
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
const EXPANDS_IN_PLACE: ReadonlySet<TopLevelBranch> = new Set(['probes', 'companies']);

const TILE_CONTENT: Record<HubTile, ContentKey> = {
  robots: 'probe.root',
  companies: 'company.root',
  audioRig: 'fleet.root',
  settings: 'settings.root',
};

/** The group each Fleet Params leaf sits in. A Record over the whole union, so a new leaf does not
 *  compile without one. */
export const FLEET_PARAMS_EFFECT_GROUP: Record<SelectedFleetParamsEffect, FleetParamsGroup> = {
  tempo: 'pacing',
  swellFrequency: 'pacing',
  swellDuration: 'pacing',
  automaticEffects: 'pacing',
  laneA: 'lfoBank',
  laneB: 'lfoBank',
  laneC: 'lfoBank',
  laneD: 'lfoBank',
  eq3: 'eqFilters',
  filterHPF: 'eqFilters',
  filterLPF: 'eqFilters',
  reverb: 'timeSpace',
  delay: 'timeSpace',
  compressor: 'output',
  limiter: 'output',
};

export const FLEET_PARAMS_GROUP_CONTENT: Record<FleetParamsGroup, ContentKey> = {
  pacing: 'fleet.pacing',
  lfoBank: 'fleet.lfoBank',
  eqFilters: 'fleet.eqFilters',
  timeSpace: 'fleet.timeSpace',
  output: 'fleet.output',
};

/** The same keys SettingsContent.tsx's own table carries until Task 17 replaces that screen. */
export const SETTINGS_LEAF_CONTENT: Record<SettingsLeaf, ContentKey> = {
  quality: 'settings.quality',
  sectorSettings: 'settings.seeds',
  sessions: 'settings.sessions',
};

function clearEntityAndSections(): void {
  const s = useUIStore.getState();
  s.selectRobot(null); // also clears selectedSection / selectedSubsection
  s.selectAllRobots(); // the "no company" state: selectedCompanyId null, allRobotsSelected true
  s.setAllProbesSelected(false);
  s.setSelectedFleetParamsEffect(null);
  s.setSelectedSettingsLeaf(null);
  s.setSelectedSettingsSubsection(null);
}

function open(branch: TopLevelBranch): void {
  const s = useUIStore.getState();
  s.setActiveHubTile(BRANCH_TILE[branch]);
  s.setExpandedTopLevelBranch(EXPANDS_IN_PLACE.has(branch) ? branch : null);
}

/** A parent box: that branch's own page, Probes / Companies expanded in place, a leaf collapsing
 *  whatever was. `'deck'` is goHome. */
export function selectBranch(branch: NavBranch): void {
  if (branch === 'deck') {
    goHome();
    return;
  }
  clearEntityAndSections();
  open(branch);
}

/** An entity under Probes or Companies: opens its branch on it, at no section. */
export function selectEntity(entity: NavEntity): void {
  clearEntityAndSections();
  const s = useUIStore.getState();
  if (entity === 'all') {
    s.setAllProbesSelected(true);
    open('probes');
  } else if ('robotId' in entity) {
    s.selectRobot(entity.robotId);
    open('probes');
  } else {
    s.selectCompany(entity.companyId);
    open('companies');
  }
}

/** The Deck: no tile, nothing expanded, no entity. */
export function goHome(): void {
  clearEntityAndSections();
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
  | 'selectedFleetParamsEffect'
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

/** Only the open branch's entity counts; a specific robot wins over All Probes, as ProbesContent routes. */
function entityName(state: BreadcrumbState, roster: NavRoster, tile: 'robots' | 'companies'): string | null {
  if (tile === 'companies') return state.selectedCompanyId !== null ? nameOf(roster.companies, state.selectedCompanyId) : null;
  if (state.selectedRobotId !== null) return nameOf(roster.robots, state.selectedRobotId);
  return state.allProbesSelected ? name('probe.all') : null;
}

/** Root / branch / entity / section — `[]` on the Deck. A section shows only under an entity (Probes,
 *  Companies) or as the branch's own group or leaf (Fleet Params, Settings). */
export function breadcrumbPath(state: BreadcrumbState, roster: NavRoster): string[] {
  const tile = state.activeHubTile;
  if (tile === null) return [];
  const path = [name('nav.root'), name(TILE_CONTENT[tile])];

  if (tile === 'audioRig') {
    const effect = state.selectedFleetParamsEffect;
    if (effect !== null) path.push(name(FLEET_PARAMS_GROUP_CONTENT[FLEET_PARAMS_EFFECT_GROUP[effect]]));
    return path;
  }
  if (tile === 'settings') {
    if (state.selectedSettingsLeaf !== null) path.push(name(SETTINGS_LEAF_CONTENT[state.selectedSettingsLeaf]));
    return path;
  }

  const entity = entityName(state, roster, tile);
  if (entity === null) return path;
  path.push(entity);
  const section = ROBOT_SECTIONS_CONFIG.find((s) => s.id === state.selectedSection);
  if (section) path.push(name(section.content));
  return path;
}
