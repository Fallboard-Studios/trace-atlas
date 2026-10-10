import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectBranch,
  selectEntity,
  goHome,
  breadcrumbPath,
  branchOfTile,
  expandsInPlace,
  branchContent,
  type NavBranch,
  type BreadcrumbState,
  type NavRoster,
} from './navActions';
import { useUIStore, type UIStore } from '@/stores/uiStore';
import { CONTENT } from '@/content';

const ui = () => useUIStore.getState();

/** A store with every nav field set to something non-default, so a test can see each one cleared. */
function dirtyStore(overrides: Partial<UIStore> = {}) {
  useUIStore.setState({
    activeHubTile: 'robots',
    expandedTopLevelBranch: 'probes',
    selectedRobotId: 'r1',
    selectedCompanyId: null,
    allRobotsSelected: true,
    allProbesSelected: false,
    selectedSection: 'source',
    selectedSubsection: 'coaxialOscillator',
    selectedFleetParamsEffect: 'delay',
    selectedSettingsLeaf: 'sessions',
    selectedSettingsSubsection: 'coordinates',
    ...overrides,
  });
}

/** The "no company" state is always allRobotsSelected (uiStore: "the selection is always either All
 *  or one company") — clearSelectedCompany alone would break it, so no action may leave it broken. */
function expectCompanyInvariant() {
  expect(ui().allRobotsSelected).toBe(ui().selectedCompanyId === null);
}

function expectNoEntityAndNoSection() {
  expect(ui()).toMatchObject({
    selectedRobotId: null,
    selectedCompanyId: null,
    allProbesSelected: false,
    selectedSection: null,
    selectedSubsection: null,
    selectedFleetParamsEffect: null,
    selectedSettingsLeaf: null,
    selectedSettingsSubsection: null,
  });
  expectCompanyInvariant();
}

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
});

describe('selectBranch', () => {
  it.each([
    ['probes', 'robots', 'probes'],
    ['companies', 'companies', 'companies'],
    ['fleetParams', 'audioRig', null],
    ['settings', 'settings', null],
  ] as const)('%s opens the %s tile and expands %s in place', (branch, tile, expanded) => {
    selectBranch(branch);
    expect(ui().activeHubTile).toBe(tile);
    expect(ui().expandedTopLevelBranch).toBe(expanded);
  });

  it('a leaf (Fleet Params, Settings) collapses whichever branch was expanded', () => {
    dirtyStore({ expandedTopLevelBranch: 'companies' });
    selectBranch('settings');
    expect(ui().expandedTopLevelBranch).toBeNull();
  });

  // Crawford, 2026-10-09: picking a parent opens that branch's own page — the robot / company / All
  // and every section are cleared, so the Probes box and the breadcrumb's "Probes" segment return to
  // the list rather than reopening the last robot.
  it.each(['probes', 'companies', 'fleetParams', 'settings', 'deck'] as const)(
    '%s clears the entity and every section, from a robot with sections open',
    (branch: NavBranch) => {
      dirtyStore();
      selectBranch(branch);
      expectNoEntityAndNoSection();
    },
  );

  it('picking Probes while already on that robot still returns to the list', () => {
    dirtyStore({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes', selectedRobotId: 'r1' });
    selectBranch('probes');
    expect(ui().selectedRobotId).toBeNull();
    expect(ui().activeHubTile).toBe('robots');
  });

  it('clears a selected company and All Probes too', () => {
    dirtyStore({ selectedRobotId: null, selectedCompanyId: 'c1', allRobotsSelected: false });
    selectBranch('companies');
    expect(ui().selectedCompanyId).toBeNull();
    expectCompanyInvariant();

    dirtyStore({ selectedRobotId: null, allProbesSelected: true });
    selectBranch('probes');
    expect(ui().allProbesSelected).toBe(false);
  });

  it("'deck' is goHome: no tile, nothing expanded", () => {
    dirtyStore();
    selectBranch('deck');
    expect(ui().activeHubTile).toBeNull();
    expect(ui().expandedTopLevelBranch).toBeNull();
  });

  it('leaves the phone sheet flag and power alone', () => {
    useUIStore.setState({ isNavPanelOpen: true, isPoweredOn: true });
    selectBranch('settings');
    expect(ui().isNavPanelOpen).toBe(true);
    expect(ui().isPoweredOn).toBe(true);
  });
});

describe('selectEntity', () => {
  it('a robot: opens Probes on it, clearing the company, All Probes and any section', () => {
    dirtyStore({ activeHubTile: 'companies', expandedTopLevelBranch: 'companies', selectedRobotId: null, selectedCompanyId: 'c1', allRobotsSelected: false, allProbesSelected: true });
    selectEntity({ robotId: 'r2' });
    expect(ui()).toMatchObject({
      activeHubTile: 'robots',
      expandedTopLevelBranch: 'probes',
      selectedRobotId: 'r2',
      selectedCompanyId: null,
      allProbesSelected: false,
      selectedSection: null,
      selectedSubsection: null,
    });
    expectCompanyInvariant();
  });

  it("'all': opens Probes on All Probes, clearing both ids", () => {
    dirtyStore({ selectedRobotId: 'r1', selectedCompanyId: 'c1', allRobotsSelected: false });
    selectEntity('all');
    expect(ui()).toMatchObject({
      activeHubTile: 'robots',
      expandedTopLevelBranch: 'probes',
      allProbesSelected: true,
      selectedRobotId: null,
      selectedCompanyId: null,
      selectedSection: null,
    });
    expectCompanyInvariant();
  });

  it('a company: opens Companies on it, clearing the robot and All Probes', () => {
    dirtyStore({ allProbesSelected: true });
    selectEntity({ companyId: 'c1' });
    expect(ui()).toMatchObject({
      activeHubTile: 'companies',
      expandedTopLevelBranch: 'companies',
      selectedCompanyId: 'c1',
      selectedRobotId: null,
      allProbesSelected: false,
      selectedSection: null,
      selectedSubsection: null,
    });
    expectCompanyInvariant();
  });

  it('switching robot to robot resets the section (the next robot opens at its default)', () => {
    selectEntity({ robotId: 'r1' });
    useUIStore.setState({ selectedSection: 'envelope', selectedSubsection: 'pingContour' });
    selectEntity({ robotId: 'r2' });
    expect(ui().selectedSection).toBeNull();
    expect(ui().selectedSubsection).toBeNull();
  });
});

describe('goHome', () => {
  it('returns to the Deck with no entity, no section and nothing expanded', () => {
    dirtyStore({ selectedCompanyId: 'c1', allRobotsSelected: false, allProbesSelected: true });
    goHome();
    expect(ui().activeHubTile).toBeNull();
    expect(ui().expandedTopLevelBranch).toBeNull();
    expectNoEntityAndNoSection();
  });
});

// Task 4: the panel reads which box is popped, whether it widens and each box's label from here, so
// the branch / tile / content tables exist once.
describe('the parent-box tables the panel reads', () => {
  it.each([
    [null, 'deck'],
    ['robots', 'probes'],
    ['companies', 'companies'],
    ['audioRig', 'fleetParams'],
    ['settings', 'settings'],
  ] as const)('branchOfTile(%s) is %s', (tile, branch) => {
    expect(branchOfTile(tile)).toBe(branch);
  });

  it('branchOfTile inverts what selectBranch opens, for every branch', () => {
    for (const branch of ['deck', 'probes', 'companies', 'fleetParams', 'settings'] as const) {
      selectBranch(branch);
      expect(branchOfTile(ui().activeHubTile)).toBe(branch);
    }
  });

  it('only Probes and Companies expand in place, the same branches selectBranch expands', () => {
    for (const branch of ['deck', 'probes', 'companies', 'fleetParams', 'settings'] as const) {
      selectBranch(branch);
      expect(expandsInPlace(branch)).toBe(ui().expandedTopLevelBranch === branch);
    }
    expect(expandsInPlace('probes')).toBe(true);
    expect(expandsInPlace('companies')).toBe(true);
  });

  it.each([
    ['deck', 'nav.home'],
    ['fleetParams', 'fleet.root'],
    ['probes', 'probe.root'],
    ['companies', 'company.root'],
    ['settings', 'settings.root'],
  ] as const)('branchContent(%s) is %s, the same name the breadcrumb shows for the branch', (branch, key) => {
    expect(branchContent(branch)).toBe(key);
    if (branch !== 'deck') {
      selectBranch(branch);
      expect(breadcrumbPath(ui(), { robots: [], companies: [] })[1]).toBe(CONTENT[key].human);
    }
  });
});

describe('breadcrumbPath', () => {
  const ROOT = CONTENT['nav.root'].human;
  const PROBES = CONTENT['probe.root'].human;
  const COMPANIES = CONTENT['company.root'].human;
  const FLEET = CONTENT['fleet.root'].human;
  const SETTINGS = CONTENT['settings.root'].human;

  const roster: NavRoster = {
    robots: [{ id: 'r1', name: 'Tidal Wisp' }, { id: 'r2' }],
    companies: [{ id: 'c1', name: 'Rust Syndicate' }],
  };

  const blank: BreadcrumbState = {
    activeHubTile: null,
    selectedRobotId: null,
    selectedCompanyId: null,
    allProbesSelected: false,
    selectedSection: null,
    selectedFleetParamsEffect: null,
    selectedSettingsLeaf: null,
  };
  const path = (s: Partial<BreadcrumbState>) => breadcrumbPath({ ...blank, ...s }, roster);

  it('is empty on the Deck, even with a stale entity and sections in the store', () => {
    expect(path({})).toEqual([]);
    expect(path({ selectedRobotId: 'r1', selectedSection: 'source', selectedFleetParamsEffect: 'laneA', selectedSettingsLeaf: 'quality' })).toEqual([]);
  });

  it('reads Root / Fleet Params / LFO Bank with a lane selected', () => {
    expect(path({ activeHubTile: 'audioRig', selectedFleetParamsEffect: 'laneB' })).toEqual([ROOT, FLEET, CONTENT['fleet.lfoBank'].human]);
  });

  it('names the branch alone when no section is selected', () => {
    expect(path({ activeHubTile: 'audioRig' })).toEqual([ROOT, FLEET]);
    expect(path({ activeHubTile: 'settings' })).toEqual([ROOT, SETTINGS]);
    expect(path({ activeHubTile: 'robots' })).toEqual([ROOT, PROBES]);
    expect(path({ activeHubTile: 'companies' })).toEqual([ROOT, COMPANIES]);
  });

  it.each([
    ['tempo', 'fleet.pacing'],
    ['swellDuration', 'fleet.pacing'],
    ['laneD', 'fleet.lfoBank'],
    ['filterHPF', 'fleet.eqFilters'],
    ['delay', 'fleet.timeSpace'],
    ['limiter', 'fleet.output'],
  ] as const)('a Fleet Params leaf %s names its group (%s)', (effect, group) => {
    expect(path({ activeHubTile: 'audioRig', selectedFleetParamsEffect: effect })).toEqual([ROOT, FLEET, CONTENT[group].human]);
  });

  it('a Settings leaf names its own concept (sectorSettings reads settings.seeds)', () => {
    expect(path({ activeHubTile: 'settings', selectedSettingsLeaf: 'sectorSettings' })).toEqual([ROOT, SETTINGS, CONTENT['settings.seeds'].human]);
    expect(path({ activeHubTile: 'settings', selectedSettingsLeaf: 'quality' })).toEqual([ROOT, SETTINGS, CONTENT['settings.quality'].human]);
  });

  it('reads Root / Probes / <robot name> for a robot with no section', () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r1' })).toEqual([ROOT, PROBES, 'Tidal Wisp']);
  });

  it("adds the robot's section", () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' })).toEqual([ROOT, PROBES, 'Tidal Wisp', CONTENT['probe.composition'].human]);
  });

  it("falls back to the robot's id when it has no name (as the tree did)", () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r2' })).toEqual([ROOT, PROBES, 'r2']);
  });

  it('drops the entity and its section when the id is not in the roster (a stale or deleted id)', () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'gone', selectedSection: 'source' })).toEqual([ROOT, PROBES]);
    expect(path({ activeHubTile: 'companies', selectedCompanyId: 'gone', selectedSection: 'source' })).toEqual([ROOT, COMPANIES]);
  });

  it('ignores a section with no entity', () => {
    expect(path({ activeHubTile: 'robots', selectedSection: 'source' })).toEqual([ROOT, PROBES]);
  });

  it('reads All Probes from probe.all, with its section', () => {
    expect(path({ activeHubTile: 'robots', allProbesSelected: true, selectedSection: 'volume' })).toEqual([ROOT, PROBES, CONTENT['probe.all'].human, CONTENT['probe.dynamics'].human]);
  });

  it('a specific robot wins over All Probes when both are set (ProbesContent routes the same way)', () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r1', allProbesSelected: true })).toEqual([ROOT, PROBES, 'Tidal Wisp']);
  });

  it('reads Root / Companies / <company name> / <section>', () => {
    expect(path({ activeHubTile: 'companies', selectedCompanyId: 'c1' })).toEqual([ROOT, COMPANIES, 'Rust Syndicate']);
    expect(path({ activeHubTile: 'companies', selectedCompanyId: 'c1', selectedSection: 'envelope' })).toEqual([ROOT, COMPANIES, 'Rust Syndicate', CONTENT['probe.envelope'].human]);
  });

  it("only the open branch's entity counts: a world-selected robot does not appear under Companies", () => {
    expect(path({ activeHubTile: 'companies', selectedRobotId: 'r1' })).toEqual([ROOT, COMPANIES]);
    expect(path({ activeHubTile: 'robots', selectedCompanyId: 'c1' })).toEqual([ROOT, PROBES]);
  });
});
