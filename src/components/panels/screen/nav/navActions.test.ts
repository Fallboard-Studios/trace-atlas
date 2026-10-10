import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectBranch,
  selectEntity,
  goHome,
  breadcrumbPath,
  breadcrumbTrail,
  pressBranchBox,
  branchOfTile,
  expandsInPlace,
  branchContent,
  FLEET_PARAMS_SUBSECTIONS,
  activeFleetParamsSubsection,
  type NavBranch,
  type BreadcrumbState,
  type NavRoster,
} from './navActions';
import { useUIStore, DEFAULT_FLEET_PARAMS_SECTION, type UIStore, type FleetParamsGroup } from '@/stores/uiStore';
import { AUDIO_RIG_CONFIG, type AudioRigEffectKey } from '@/data/audioRigConfig';
import { LFO_BANK_LANE_CONTENT } from '@/data/lfoConfig';
import { CONTENT, labels } from '@/content';

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
    fleetParamsSection: 'output',
    fleetParamsSubsection: 'limiter',
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
    // Fleet Params' tab is a section field too: every pick lands on its default (Task 15).
    fleetParamsSection: DEFAULT_FLEET_PARAMS_SECTION,
    fleetParamsSubsection: null,
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

  // The phone sheet flag is no longer left alone: a pick closes the sheet (Task 5, below).
  it('leaves power alone', () => {
    useUIStore.setState({ isPoweredOn: true });
    selectBranch('settings');
    expect(ui().isPoweredOn).toBe(true);
  });
});

describe('selectEntity', () => {
  // Crawford, 2026-10-10: an entity pick collapses the list, so the screen gets the panel's rest width.
  it('a robot: opens Probes on it with the list collapsed, clearing the company, All Probes and any section', () => {
    dirtyStore({ activeHubTile: 'companies', expandedTopLevelBranch: 'companies', selectedRobotId: null, selectedCompanyId: 'c1', allRobotsSelected: false, allProbesSelected: true });
    selectEntity({ robotId: 'r2' });
    expect(ui()).toMatchObject({
      activeHubTile: 'robots',
      expandedTopLevelBranch: null,
      selectedRobotId: 'r2',
      selectedCompanyId: null,
      allProbesSelected: false,
      selectedSection: null,
      selectedSubsection: null,
    });
    expectCompanyInvariant();
  });

  it("'all': opens Probes on All Probes with the list collapsed, clearing both ids", () => {
    dirtyStore({ selectedRobotId: 'r1', selectedCompanyId: 'c1', allRobotsSelected: false });
    selectEntity('all');
    expect(ui()).toMatchObject({
      activeHubTile: 'robots',
      expandedTopLevelBranch: null,
      allProbesSelected: true,
      selectedRobotId: null,
      selectedCompanyId: null,
      selectedSection: null,
    });
    expectCompanyInvariant();
  });

  it('a company: opens Companies on it with the list collapsed, clearing the robot and All Probes', () => {
    dirtyStore({ allProbesSelected: true });
    selectEntity({ companyId: 'c1' });
    expect(ui()).toMatchObject({
      activeHubTile: 'companies',
      expandedTopLevelBranch: null,
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

// Crawford, 2026-10-09 ("back, then collapse"): the panel's parent box. On an entity it is
// selectBranch — back to the branch's page, list open; on that page already, Probes and Companies
// toggle their list in place. selectBranch itself never toggles.
describe('pressBranchBox', () => {
  /** On the Probes page with the list open and nothing selected. */
  function onProbesPage(overrides: Partial<UIStore> = {}) {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes', ...overrides });
  }

  it.each(['probes', 'companies', 'fleetParams', 'settings', 'deck'] as const)(
    'from another branch, %s does what selectBranch does',
    (branch: NavBranch) => {
      dirtyStore({ activeHubTile: branch === 'settings' ? 'audioRig' : 'settings', expandedTopLevelBranch: null });
      pressBranchBox(branch);
      const pressed = { ...ui() };
      dirtyStore({ activeHubTile: branch === 'settings' ? 'audioRig' : 'settings', expandedTopLevelBranch: null });
      selectBranch(branch);
      expect(pressed).toEqual({ ...ui() });
    },
  );

  it('on a robot, goes back to the Probes page with the list still open', () => {
    dirtyStore();
    pressBranchBox('probes');
    expect(ui().activeHubTile).toBe('robots');
    expect(ui().expandedTopLevelBranch).toBe('probes');
    expectNoEntityAndNoSection();
  });

  it('on All Probes, goes back to the Probes page with the list still open', () => {
    onProbesPage({ allProbesSelected: true, selectedSection: 'volume' });
    pressBranchBox('probes');
    expect(ui().expandedTopLevelBranch).toBe('probes');
    expectNoEntityAndNoSection();
  });

  it('on the Probes page, collapses the list and changes nothing else', () => {
    onProbesPage({ isNavPanelOpen: true });
    const before = { ...ui() };
    pressBranchBox('probes');
    expect({ ...ui() }).toEqual({ ...before, expandedTopLevelBranch: null });
  });

  it('on the Probes page with the list collapsed, opens it again', () => {
    onProbesPage({ expandedTopLevelBranch: null });
    pressBranchBox('probes');
    expect(ui().expandedTopLevelBranch).toBe('probes');
    expect(ui().activeHubTile).toBe('robots');
  });

  it('robot -> back -> collapse -> open, one press each', () => {
    dirtyStore();
    const trail: (string | null)[][] = [];
    for (let i = 0; i < 3; i++) {
      pressBranchBox('probes');
      trail.push([ui().selectedRobotId, ui().expandedTopLevelBranch]);
    }
    expect(trail).toEqual([
      [null, 'probes'],
      [null, null],
      [null, 'probes'],
    ]);
  });

  // Crawford, 2026-10-10: a pick from the list collapses it; the parent box brings it back.
  it.each<[string, Parameters<typeof selectEntity>[0], 'probes' | 'companies']>([
    ['a robot', { robotId: 'r2' }, 'probes'],
    ['All Probes', 'all', 'probes'],
    ['a company', { companyId: 'c1' }, 'companies'],
  ])('list page -> pick %s (list collapses) -> its box goes back to the page with the list open', (_case, entity, branch) => {
    useUIStore.setState({ activeHubTile: branch === 'probes' ? 'robots' : 'companies', expandedTopLevelBranch: branch });
    selectEntity(entity);
    expect(ui().expandedTopLevelBranch).toBeNull();
    pressBranchBox(branch);
    expect(ui().expandedTopLevelBranch).toBe(branch);
    expectNoEntityAndNoSection();
  });

  it('with the list collapsed and a robot picked in the world, goes back and opens the list', () => {
    onProbesPage({ expandedTopLevelBranch: null, selectedRobotId: 'r2' });
    pressBranchBox('probes');
    expect(ui().selectedRobotId).toBeNull();
    expect(ui().expandedTopLevelBranch).toBe('probes');
  });

  it('Companies: on a company, back to the Companies page; then collapse; then open', () => {
    useUIStore.setState({ activeHubTile: 'companies', expandedTopLevelBranch: 'companies' });
    useUIStore.getState().selectCompany('c1');

    pressBranchBox('companies');
    expect(ui().selectedCompanyId).toBeNull();
    expect(ui().expandedTopLevelBranch).toBe('companies');
    expectCompanyInvariant();

    pressBranchBox('companies');
    expect(ui().expandedTopLevelBranch).toBeNull();
    expect(ui().activeHubTile).toBe('companies');

    pressBranchBox('companies');
    expect(ui().expandedTopLevelBranch).toBe('companies');
  });

  it("only the open branch's entity counts: a world-selected robot on the Companies page does not stop the collapse", () => {
    useUIStore.setState({ activeHubTile: 'companies', expandedTopLevelBranch: 'companies', selectedRobotId: 'r1' });
    pressBranchBox('companies');
    expect(ui().expandedTopLevelBranch).toBeNull();
    expect(ui().selectedRobotId).toBe('r1');
  });

  it.each([
    ['fleetParams', 'audioRig'],
    ['settings', 'settings'],
  ] as const)('a leaf (%s) never toggles: pressing it again is selectBranch', (branch, tile) => {
    dirtyStore({ activeHubTile: tile, expandedTopLevelBranch: null, selectedRobotId: null });
    pressBranchBox(branch);
    expect(ui().activeHubTile).toBe(tile);
    expect(ui().expandedTopLevelBranch).toBeNull();
    expectNoEntityAndNoSection();
  });

  it('the Deck pressed on the Deck stays home', () => {
    pressBranchBox('deck');
    expect(ui().activeHubTile).toBeNull();
    expect(ui().expandedTopLevelBranch).toBeNull();
  });

  it('selectBranch does not toggle: on the Probes page it keeps the list open', () => {
    onProbesPage();
    selectBranch('probes');
    expect(ui().expandedTopLevelBranch).toBe('probes');
  });
});

// Task 5 (spec §1.2): on the phone the panel is a sheet whose open flag is isNavPanelOpen, and picking
// closes it. A pick is anything that moves the selection; a collapse in place is not one (pressBranchBox's
// "changes nothing else" test above holds the flag open).
describe('a pick closes the phone nav sheet', () => {
  it.each(['probes', 'companies', 'fleetParams', 'settings', 'deck'] as const)('selectBranch(%s)', (branch: NavBranch) => {
    dirtyStore({ isNavPanelOpen: true });
    selectBranch(branch);
    expect(ui().isNavPanelOpen).toBe(false);
  });

  it.each([{ robotId: 'r2' }, { companyId: 'c1' }, 'all'] as const)('selectEntity(%o)', (entity) => {
    dirtyStore({ isNavPanelOpen: true });
    selectEntity(entity);
    expect(ui().isNavPanelOpen).toBe(false);
  });

  it('goHome', () => {
    dirtyStore({ isNavPanelOpen: true });
    goHome();
    expect(ui().isNavPanelOpen).toBe(false);
  });

  it('pressBranchBox from another branch, or back from an entity', () => {
    dirtyStore({ isNavPanelOpen: true, activeHubTile: 'settings', expandedTopLevelBranch: null });
    pressBranchBox('probes');
    expect(ui().isNavPanelOpen).toBe(false);

    dirtyStore({ isNavPanelOpen: true });
    pressBranchBox('probes');
    expect(ui().isNavPanelOpen).toBe(false);
  });

  it('a pick never opens the sheet', () => {
    selectEntity({ robotId: 'r1' });
    selectBranch('companies');
    goHome();
    expect(ui().isNavPanelOpen).toBe(false);
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
    fleetParamsSection: DEFAULT_FLEET_PARAMS_SECTION,
    fleetParamsSubsection: null,
    selectedSettingsLeaf: null,
  };
  const path = (s: Partial<BreadcrumbState>) => breadcrumbPath({ ...blank, ...s }, roster);

  it('is empty on the Deck, even with a stale entity and sections in the store', () => {
    expect(path({})).toEqual([]);
    expect(path({ selectedRobotId: 'r1', selectedSection: 'source', fleetParamsSection: 'output', fleetParamsSubsection: 'limiter', selectedSettingsLeaf: 'quality' })).toEqual([]);
  });

  // Task 15: Fleet Params is tabs, so one tab is always open — the default is LFO Bank at lane A.
  it('reads Root / Fleet Params / LFO Bank / Core LFO on the default tab', () => {
    expect(path({ activeHubTile: 'audioRig' })).toEqual([ROOT, FLEET, CONTENT['fleet.lfoBank'].human, CONTENT['fleet.lfoBank.laneA'].human]);
  });

  it('reads Root / Fleet Params / <group> / <lane> with a lane picked', () => {
    expect(path({ activeHubTile: 'audioRig', fleetParamsSubsection: 'laneB' })).toEqual([ROOT, FLEET, CONTENT['fleet.lfoBank'].human, CONTENT['fleet.lfoBank.laneB'].human]);
  });

  it('names the branch alone when no section is selected', () => {
    expect(path({ activeHubTile: 'settings' })).toEqual([ROOT, SETTINGS]);
    expect(path({ activeHubTile: 'robots' })).toEqual([ROOT, PROBES]);
    expect(path({ activeHubTile: 'companies' })).toEqual([ROOT, COMPANIES]);
  });

  it.each<[FleetParamsGroup, BreadcrumbState['fleetParamsSubsection'], string[]]>([
    ['pacing', null, [CONTENT['fleet.pacing'].human]],
    // Pacing's four leaves are one panel, not sub-tabs, so none of them names a fourth segment.
    ['pacing', 'tempo', [CONTENT['fleet.pacing'].human]],
    ['lfoBank', 'laneD', [CONTENT['fleet.lfoBank'].human, CONTENT['fleet.lfoBank.laneD'].human]],
    ['eqFilters', null, [CONTENT['fleet.eqFilters'].human, CONTENT['fleet.eq'].human]],
    ['eqFilters', 'filterHPF', [CONTENT['fleet.eqFilters'].human, CONTENT['fleet.hpf'].human]],
    ['timeSpace', 'delay', [CONTENT['fleet.timeSpace'].human, CONTENT['fleet.delay'].human]],
    ['output', 'limiter', [CONTENT['fleet.output'].human, CONTENT['fleet.limiter'].human]],
    // A sub-tab left over from another group reads as the group's first, which is what the screen shows.
    ['output', 'laneC', [CONTENT['fleet.output'].human, CONTENT['fleet.compressor'].human]],
  ])('Fleet Params on %s / %s names %j', (section, subsection, tail) => {
    expect(path({ activeHubTile: 'audioRig', fleetParamsSection: section, fleetParamsSubsection: subsection })).toEqual([ROOT, FLEET, ...tail]);
  });

  it('a Settings leaf names its own concept (sectorSettings reads settings.seeds)', () => {
    expect(path({ activeHubTile: 'settings', selectedSettingsLeaf: 'sectorSettings' })).toEqual([ROOT, SETTINGS, CONTENT['settings.seeds'].human]);
    expect(path({ activeHubTile: 'settings', selectedSettingsLeaf: 'quality' })).toEqual([ROOT, SETTINGS, CONTENT['settings.quality'].human]);
  });

  // Task 16: the robot screen is tabs, so a robot always has one open — Source when none is stored.
  it('reads Root / Probes / <robot name> / Source for a robot with no section stored', () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r1' })).toEqual([ROOT, PROBES, 'Tidal Wisp', CONTENT['probe.source'].human]);
  });

  it("adds the robot's section", () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' })).toEqual([ROOT, PROBES, 'Tidal Wisp', CONTENT['probe.composition'].human]);
  });

  it("names a section by its tab: Levels, not the tree's old Dynamics row", () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'volume' })).toEqual([ROOT, PROBES, 'Tidal Wisp', CONTENT['probe.levels'].human]);
  });

  it('names no sub-tab: a robot trail ends at its section (spec §1.2)', () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'source', selectedSubsection: 'coaxialOscillator' } as Partial<BreadcrumbState>)).toEqual([ROOT, PROBES, 'Tidal Wisp', CONTENT['probe.source'].human]);
  });

  it("falls back to the robot's id when it has no name (as the tree did)", () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r2' })).toEqual([ROOT, PROBES, 'r2', CONTENT['probe.source'].human]);
  });

  it('All Probes and a company name only a stored section: their stacked screens have no tabs until Task 23', () => {
    expect(path({ activeHubTile: 'robots', allProbesSelected: true })).toEqual([ROOT, PROBES, CONTENT['probe.all'].human]);
    expect(path({ activeHubTile: 'companies', selectedCompanyId: 'c1' })).toEqual([ROOT, COMPANIES, 'Rust Syndicate']);
  });

  it('drops the entity and its section when the id is not in the roster (a stale or deleted id)', () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'gone', selectedSection: 'source' })).toEqual([ROOT, PROBES]);
    expect(path({ activeHubTile: 'companies', selectedCompanyId: 'gone', selectedSection: 'source' })).toEqual([ROOT, COMPANIES]);
  });

  it('ignores a section with no entity', () => {
    expect(path({ activeHubTile: 'robots', selectedSection: 'source' })).toEqual([ROOT, PROBES]);
  });

  it('reads All Probes from probe.all, with its section (named by its tab, Levels)', () => {
    expect(path({ activeHubTile: 'robots', allProbesSelected: true, selectedSection: 'volume' })).toEqual([ROOT, PROBES, CONTENT['probe.all'].human, CONTENT['probe.levels'].human]);
  });

  it('a specific robot wins over All Probes when both are set (ProbesContent routes the same way)', () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r1', allProbesSelected: true })).toEqual([ROOT, PROBES, 'Tidal Wisp', CONTENT['probe.source'].human]);
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

// docs/tasks/LAYOUT_REWORK.md Task 8: the breadcrumb's ancestors are buttons that call navActions, so
// the trail carries, with each name, where that segment goes — the path is still derived here only.
describe('breadcrumbTrail — each segment and the navActions call it goes to', () => {
  const roster: NavRoster = {
    robots: [{ id: 'r1', name: 'Tidal Wisp' }],
    companies: [{ id: 'c1', name: 'Rust Syndicate' }],
  };
  const trail = () => breadcrumbTrail(ui(), roster);
  const go = (index: number) => {
    const segment = trail()[index];
    expect(segment?.go, `segment ${index} has somewhere to go`).toBeTypeOf('function');
    segment!.go!();
  };

  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('is empty on the Deck', () => {
    expect(trail()).toEqual([]);
  });

  it.each<[string, Partial<UIStore>]>([
    ['Fleet Params with a lane', { activeHubTile: 'audioRig', fleetParamsSubsection: 'laneB' }],
    ['Fleet Params on Pacing', { activeHubTile: 'audioRig', fleetParamsSection: 'pacing' }],
    ['Settings with a leaf', { activeHubTile: 'settings', selectedSettingsLeaf: 'sessions' }],
    ['a robot with a section', { activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' }],
    ['All Probes with a section', { activeHubTile: 'robots', allProbesSelected: true, selectedSection: 'volume' }],
    ['a company with a section', { activeHubTile: 'companies', selectedCompanyId: 'c1', selectedSection: 'envelope' }],
    ['a stale robot id', { activeHubTile: 'robots', selectedRobotId: 'gone', selectedSection: 'source' }],
  ])('names the same segments breadcrumbPath reads (%s)', (_case, state) => {
    useUIStore.setState(state);
    expect(trail().map((segment) => segment.label)).toEqual(breadcrumbPath(ui(), roster));
  });

  it('Root goes home: no tile, nothing expanded, no entity', () => {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes', selectedRobotId: 'r1', selectedSection: 'melody' });
    go(0);
    expect(ui().activeHubTile).toBeNull();
    expect(ui().expandedTopLevelBranch).toBeNull();
    expect(ui().selectedRobotId).toBeNull();
  });

  it("the branch goes to the branch's own page: entity and section cleared, Probes' list open", () => {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: null, selectedRobotId: 'r1', selectedSection: 'melody' });
    go(1);
    expect(ui().activeHubTile).toBe('robots');
    expect(ui().selectedRobotId).toBeNull();
    expect(ui().selectedSection).toBeNull();
    expect(ui().expandedTopLevelBranch).toBe('probes');
  });

  it('the Fleet Params branch goes back to its default tab, staying on Fleet Params', () => {
    useUIStore.setState({ activeHubTile: 'audioRig', fleetParamsSection: 'timeSpace', fleetParamsSubsection: 'delay' });
    go(1);
    expect(ui().activeHubTile).toBe('audioRig');
    expect(ui().fleetParamsSection).toBe(DEFAULT_FLEET_PARAMS_SECTION);
    expect(ui().fleetParamsSubsection).toBeNull();
  });

  it("the Fleet Params group goes to the group's first sub-tab, changing nothing else", () => {
    useUIStore.setState({ activeHubTile: 'audioRig', fleetParamsSection: 'eqFilters', fleetParamsSubsection: 'filterLPF', isNavPanelOpen: true });
    go(2);
    expect(ui()).toMatchObject({ activeHubTile: 'audioRig', fleetParamsSection: 'eqFilters', fleetParamsSubsection: null, isNavPanelOpen: true });
  });

  it('a robot with no section stored: the robot is an ancestor going back to itself, the Source tab the current view', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    expect(trail().map((segment) => segment.label)).toEqual([CONTENT['nav.root'].human, CONTENT['probe.root'].human, 'Tidal Wisp', CONTENT['probe.source'].human]);
    expect(trail()[3]?.go).toBeUndefined();
    go(2);
    expect(ui().selectedRobotId).toBe('r1');
    expect(ui().selectedSection).toBeNull();
  });

  it('a robot goes back to the robot at no section', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    go(2);
    expect(ui().selectedRobotId).toBe('r1');
    expect(ui().selectedSection).toBeNull();
    expect(ui().activeHubTile).toBe('robots');
  });

  it('All Probes goes back to All Probes at no section', () => {
    useUIStore.setState({ activeHubTile: 'robots', allProbesSelected: true, selectedSection: 'volume' });
    go(2);
    expect(ui().allProbesSelected).toBe(true);
    expect(ui().selectedRobotId).toBeNull();
    expect(ui().selectedSection).toBeNull();
  });

  it('a company goes back to the company at no section', () => {
    useUIStore.setState({ activeHubTile: 'companies', selectedCompanyId: 'c1', selectedSection: 'envelope' });
    go(2);
    expect(ui().selectedCompanyId).toBe('c1');
    expect(ui().selectedSection).toBeNull();
    expect(ui().activeHubTile).toBe('companies');
  });

  it('a section, a Fleet Params sub-tab, Pacing or a Settings leaf goes nowhere: it is only ever the current view', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    expect(trail()[3]?.go).toBeUndefined();
    useUIStore.setState({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneB' });
    expect(trail()).toHaveLength(4);
    expect(trail()[3]?.go).toBeUndefined();
    useUIStore.setState({ activeHubTile: 'audioRig', fleetParamsSection: 'pacing', fleetParamsSubsection: null });
    expect(trail()).toHaveLength(3);
    expect(trail()[2]?.go).toBeUndefined();
    useUIStore.setState({ activeHubTile: 'settings', selectedSettingsLeaf: 'sessions' });
    expect(trail()[2]?.go).toBeUndefined();
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 15: the Fleet Params screen's sub-tabs, read by the screen and the
// breadcrumb alike, so the two always name the same tab.
describe('FLEET_PARAMS_SUBSECTIONS and activeFleetParamsSubsection', () => {
  const ids = (group: FleetParamsGroup) => FLEET_PARAMS_SUBSECTIONS[group].map((sub) => sub.id);

  it('lists each group\'s sub-tabs in the sketch\'s order; Pacing has none (its four leaves are one panel)', () => {
    expect(ids('pacing')).toEqual([]);
    expect(ids('lfoBank')).toEqual(['laneA', 'laneB', 'laneC', 'laneD']);
    expect(ids('eqFilters')).toEqual(['eq3', 'filterHPF', 'filterLPF']);
    expect(ids('timeSpace')).toEqual(['reverb', 'delay']);
    expect(ids('output')).toEqual(['compressor', 'limiter']);
  });

  it('names each sub-tab with the concept its panel is built from', () => {
    const lanes = FLEET_PARAMS_SUBSECTIONS.lfoBank.map((sub) => sub.content);
    expect(lanes).toEqual([LFO_BANK_LANE_CONTENT.a, LFO_BANK_LANE_CONTENT.b, LFO_BANK_LANE_CONTENT.c, LFO_BANK_LANE_CONTENT.d]);
    // The effect panels' headings come from the same entries (audioRigConfig's panelSchema).
    for (const group of ['eqFilters', 'timeSpace', 'output'] as const) {
      for (const sub of FLEET_PARAMS_SUBSECTIONS[group]) {
        const block = AUDIO_RIG_CONFIG.find((b) => b.key === (sub.id as AudioRigEffectKey));
        expect(block, sub.id).toBeDefined();
        const { loreLabel, humanLabel } = labels(sub.content, { surface: 'heading' });
        expect({ loreLabel: block!.panel.loreLabel, humanLabel: block!.panel.humanLabel }, sub.id).toEqual({ loreLabel, humanLabel });
      }
    }
  });

  it('covers every effect block once, in exactly one group', () => {
    const all = (Object.keys(FLEET_PARAMS_SUBSECTIONS) as FleetParamsGroup[]).flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
    for (const block of AUDIO_RIG_CONFIG) expect(all, block.key).toContain(block.key);
  });

  it.each<[FleetParamsGroup, BreadcrumbState['fleetParamsSubsection'], BreadcrumbState['fleetParamsSubsection']]>([
    ['lfoBank', null, 'laneA'],
    ['lfoBank', 'laneC', 'laneC'],
    ['eqFilters', null, 'eq3'],
    ['eqFilters', 'filterLPF', 'filterLPF'],
    ['timeSpace', 'delay', 'delay'],
    ['output', 'limiter', 'limiter'],
    // Not this group's: its first, as SectionTabs falls back for a stale value.
    ['output', 'laneC', 'compressor'],
    ['lfoBank', 'reverb', 'laneA'],
    ['eqFilters', 'tempo', 'eq3'],
    // Pacing has no sub-tab, whatever is stored.
    ['pacing', null, null],
    ['pacing', 'tempo', null],
    ['pacing', 'laneB', null],
  ])('on %s with %s stored, the open sub-tab is %s', (section, stored, expected) => {
    expect(activeFleetParamsSubsection(section, stored)).toBe(expected);
  });
});
