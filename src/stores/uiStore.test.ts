import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore, DEFAULT_FLEET_PARAMS_SECTION } from './uiStore';

const INITIAL_STATE = useUIStore.getState();

describe('uiStore — activeHubTile', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null (grid view), not a pre-selected tile', () => {
    expect(useUIStore.getState().activeHubTile).toBeNull();
  });

  it('setActiveHubTile sets one of the three surviving hub tiles', () => {
    useUIStore.getState().setActiveHubTile('robots');
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });

  it('setActiveHubTile(null) returns to the grid', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    useUIStore.getState().setActiveHubTile(null);
    expect(useUIStore.getState().activeHubTile).toBeNull();
  });
});

describe('uiStore — activeLocaleTemperature (docs/specs/HEADER_HUB_CONSOLIDATION.md)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — no temperature reading before the first tick', () => {
    expect(useUIStore.getState().activeLocaleTemperature).toBeNull();
  });

  it('setActiveLocaleTemperature sets the value', () => {
    useUIStore.getState().setActiveLocaleTemperature(-45);
    expect(useUIStore.getState().activeLocaleTemperature).toBe(-45);
  });

  it('setActiveLocaleTemperature(null) clears it back to no reading', () => {
    useUIStore.getState().setActiveLocaleTemperature(-45);
    useUIStore.getState().setActiveLocaleTemperature(null);
    expect(useUIStore.getState().activeLocaleTemperature).toBeNull();
  });

  it('setting temperature never touches activeLocaleLocalTime, or vice versa — independent fields', () => {
    useUIStore.getState().setActiveLocaleLocalTime(9.5);
    useUIStore.getState().setActiveLocaleTemperature(-45);
    expect(useUIStore.getState().activeLocaleLocalTime).toBe(9.5);
    expect(useUIStore.getState().activeLocaleTemperature).toBe(-45);

    useUIStore.getState().setActiveLocaleTemperature(-90);
    expect(useUIStore.getState().activeLocaleLocalTime).toBe(9.5);
  });
});

describe('uiStore — selectedCompanyId (Roadmap Phase 10)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — "All" (allRobotsSelected) is the default selection, not a pre-selected company', () => {
    expect(useUIStore.getState().selectedCompanyId).toBeNull();
  });

  it('selectCompany sets selectedCompanyId', () => {
    useUIStore.getState().selectCompany('company-0-abc');
    expect(useUIStore.getState().selectedCompanyId).toBe('company-0-abc');
  });

  it('is independent of selectedRobotId — selecting a company never touches robot selection', () => {
    useUIStore.getState().selectRobot('robot-0-xyz');
    useUIStore.getState().selectCompany('company-0-abc');
    expect(useUIStore.getState().selectedRobotId).toBe('robot-0-xyz');
  });

  it('is independent of selectedRobotId — selecting a robot never touches company selection', () => {
    useUIStore.getState().selectCompany('company-0-abc');
    useUIStore.getState().selectRobot('robot-0-xyz');
    expect(useUIStore.getState().selectedCompanyId).toBe('company-0-abc');
  });
});

describe('uiStore — clearSelectedCompany (docs/tasks/NAV_LAYOUT_REWRITE.md Task 20 — the bare "Companies" tree node)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('clears selectedCompanyId back to null', () => {
    useUIStore.getState().selectCompany('company-0-abc');
    useUIStore.getState().clearSelectedCompany();
    expect(useUIStore.getState().selectedCompanyId).toBeNull();
  });

  it('never touches allRobotsSelected — distinct from selectAllRobots, a different concern (the Companies tree vs. the Robots tab\'s own company filter)', () => {
    useUIStore.getState().selectCompany('company-0-abc'); // clears allRobotsSelected to false
    useUIStore.getState().clearSelectedCompany();
    expect(useUIStore.getState().allRobotsSelected).toBe(false);
  });

  it('is a no-op on selectedRobotId', () => {
    useUIStore.getState().selectRobot('robot-0-xyz');
    useUIStore.getState().selectCompany('company-0-abc');
    useUIStore.getState().clearSelectedCompany();
    expect(useUIStore.getState().selectedRobotId).toBe('robot-0-xyz');
  });
});

describe('uiStore — allRobotsSelected ("All" button in the company row)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to true — "All" is the default selection; there is no separate "nothing selected" state', () => {
    expect(useUIStore.getState().allRobotsSelected).toBe(true);
  });

  it('selectAllRobots sets allRobotsSelected and clears any selected company — mutually exclusive with a company', () => {
    useUIStore.getState().selectCompany('company-0-abc');
    useUIStore.getState().selectAllRobots();
    expect(useUIStore.getState().allRobotsSelected).toBe(true);
    expect(useUIStore.getState().selectedCompanyId).toBeNull();
  });

  it('selectCompany(id) clears allRobotsSelected — mutually exclusive the other direction too', () => {
    useUIStore.getState().selectAllRobots();
    useUIStore.getState().selectCompany('company-0-abc');
    expect(useUIStore.getState().allRobotsSelected).toBe(false);
    expect(useUIStore.getState().selectedCompanyId).toBe('company-0-abc');
  });

  it('is independent of selectedRobotId', () => {
    useUIStore.getState().selectRobot('robot-0-xyz');
    useUIStore.getState().selectAllRobots();
    expect(useUIStore.getState().selectedRobotId).toBe('robot-0-xyz');
  });
});

describe('uiStore — selectedSection (docs/specs/NAV_LAYOUT_REWRITE.md §1.3)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — no section chosen until a leaf is selected', () => {
    expect(useUIStore.getState().selectedSection).toBeNull();
  });

  it('setSelectedSection sets one of the 4 leaf sections', () => {
    useUIStore.getState().setSelectedSection('melody');
    expect(useUIStore.getState().selectedSection).toBe('melody');
  });

  it('setSelectedSection(null) clears back to no section chosen', () => {
    useUIStore.getState().setSelectedSection('envelope');
    useUIStore.getState().setSelectedSection(null);
    expect(useUIStore.getState().selectedSection).toBeNull();
  });

  it('is independent of selectedRobotId and selectedCompanyId', () => {
    useUIStore.getState().selectRobot('robot-0-xyz');
    useUIStore.getState().selectCompany('company-0-abc');
    useUIStore.getState().setSelectedSection('source');
    expect(useUIStore.getState().selectedRobotId).toBe('robot-0-xyz');
    expect(useUIStore.getState().selectedCompanyId).toBe('company-0-abc');
    expect(useUIStore.getState().selectedSection).toBe('source');
  });

  // Bugfix, found in code review (docs/tasks/NAV_LAYOUT_REWRITE.md work) — selectRobot is called
  // directly, outside useNavTree's own select() (which always follows it with a fresh
  // setSelectedSection call), from two real, non-tree sites: RobotSelectionCard's browse-list
  // click and ConsolePanel's inline Back button. Without this reset, a section left open on a
  // previously-viewed robot (e.g. Volume) leaked onto the next robot picked from the browse list,
  // showing its AudioSettingSection instead of RobotDisplaySection on first click. Fixed at the
  // store level, not at each call site, so no future non-tree caller can reintroduce the same gap
  // — useNavTree.select() itself calls setSelectedSection right after selectRobot, which still
  // wins (last write), so tree-driven selection is unaffected.
  it('selectRobot(id) resets selectedSection to null — switching which robot is selected always drops a previously-open leaf', () => {
    useUIStore.getState().setSelectedSection('volume');
    useUIStore.getState().selectRobot('robot-1-def');
    expect(useUIStore.getState().selectedSection).toBeNull();
  });

  it('selectRobot(null) (the Back button case) also resets selectedSection', () => {
    useUIStore.getState().selectRobot('robot-0-xyz');
    useUIStore.getState().setSelectedSection('envelope');
    useUIStore.getState().selectRobot(null);
    expect(useUIStore.getState().selectedSection).toBeNull();
  });
});

describe('uiStore — isNavPanelOpen (mobile-only nav slide state, docs/specs/NAV_LAYOUT_REWRITE.md §1.3)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to false — closed until the mobile hamburger opens it', () => {
    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
  });

  it('setNavPanelOpen(true) opens it', () => {
    useUIStore.getState().setNavPanelOpen(true);
    expect(useUIStore.getState().isNavPanelOpen).toBe(true);
  });

  it('setNavPanelOpen(false) closes it again', () => {
    useUIStore.getState().setNavPanelOpen(true);
    useUIStore.getState().setNavPanelOpen(false);
    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
  });
});

describe('uiStore — selectedSettingsLeaf (which Settings child is open, docs/tasks/NAV_LAYOUT_REWRITE.md Task 11)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — no Settings leaf chosen until one is selected', () => {
    expect(useUIStore.getState().selectedSettingsLeaf).toBeNull();
  });

  it('setSelectedSettingsLeaf sets one of the 2 Settings leaves', () => {
    useUIStore.getState().setSelectedSettingsLeaf('quality');
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('quality');
  });

  it('setSelectedSettingsLeaf(null) clears back to no leaf chosen', () => {
    useUIStore.getState().setSelectedSettingsLeaf('sectorSettings');
    useUIStore.getState().setSelectedSettingsLeaf(null);
    expect(useUIStore.getState().selectedSettingsLeaf).toBeNull();
  });

  it('is independent of selectedSection — Settings is not an entity with robot/company sections', () => {
    useUIStore.getState().setSelectedSection('melody');
    useUIStore.getState().setSelectedSettingsLeaf('quality');
    expect(useUIStore.getState().selectedSection).toBe('melody');
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('quality');
  });

  it('accepts the third leaf, Save & Share', () => {
    useUIStore.getState().setSelectedSettingsLeaf('sessions');
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('sessions');
  });

  // docs/tasks/LAYOUT_REWORK.md Task 17 (spec §1.10): the leaf is the Settings tab; the subsection below
  // it was the tree's third level, read by nothing once the stacked screen's scrollspy is gone.
  it('has no Settings subsection: the field and its setter are retired', () => {
    const state = useUIStore.getState() as unknown as Record<string, unknown>;
    expect('selectedSettingsSubsection' in state).toBe(false);
    expect('setSelectedSettingsSubsection' in state).toBe(false);
    expect('selectedSettingsSubsection' in useUIStore.getInitialState()).toBe(false);
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 18 (spec §1.10): the tree's accordion-of-one fields and the
// stacked Fleet Params screen's effect leaf retired with the stacked scroll.
describe('uiStore — the stacked scroll\'s fields are retired', () => {
  it.each([
    ['expandedProbeId', 'setExpandedProbeId'],
    ['expandedCompanyId', 'setExpandedCompanyId'],
    ['selectedFleetParamsEffect', 'setSelectedFleetParamsEffect'],
  ])('has no %s and no %s', (field, setter) => {
    const state = useUIStore.getState() as unknown as Record<string, unknown>;
    expect(field in state).toBe(false);
    expect(setter in state).toBe(false);
    expect(field in useUIStore.getInitialState()).toBe(false);
  });
});

describe('uiStore — the initial state is spec §1.10\'s table', () => {
  // §1.10's kept and new fields. movePanelRobotId, the table's third row, arrives with its first
  // consumer (Task 20), and joins this list there.
  const NAV_FIELDS = [
    'activeHubTile', 'selectedRobotId', 'selectedCompanyId', 'allRobotsSelected', 'allProbesSelected',
    'expandedTopLevelBranch', 'selectedSection', 'selectedSubsection', 'selectedSettingsLeaf',
    'isPoweredOn', 'isNavPanelOpen',
    'fleetParamsSection', 'fleetParamsSubsection',
  ];
  // Not navigation, so §1.10 does not list them; the layout rework leaves them as they are.
  const OTHER_FIELDS = ['activeView', 'theme', 'language', 'isFullscreen', 'activeLocaleLocalTime', 'activeLocaleTemperature'];

  const initial = useUIStore.getInitialState() as unknown as Record<string, unknown>;
  const fields = Object.keys(initial).filter((key) => typeof initial[key] !== 'function');

  it('holds exactly those fields', () => {
    expect([...fields].sort()).toEqual([...NAV_FIELDS, ...OTHER_FIELDS].sort());
  });

  it('is JSON-serialisable: every field survives a round trip unchanged', () => {
    const data = Object.fromEntries(fields.map((key) => [key, initial[key]]));
    expect(JSON.parse(JSON.stringify(data))).toStrictEqual(data);
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 15 (spec §1.10): the Fleet Params screen's tab and sub-tab.
describe('uiStore — fleetParamsSection / fleetParamsSubsection (the Fleet Params tab and sub-tab)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to LFO Bank at no sub-tab — the screen reads null as the group\'s first, lane A', () => {
    expect(DEFAULT_FLEET_PARAMS_SECTION).toBe('lfoBank');
    expect(useUIStore.getState().fleetParamsSection).toBe(DEFAULT_FLEET_PARAMS_SECTION);
    expect(useUIStore.getState().fleetParamsSubsection).toBeNull();
  });

  it('setFleetParamsSubsection round-trips a sub-tab and leaves the section alone', () => {
    useUIStore.getState().setFleetParamsSubsection('laneC');
    expect(useUIStore.getState().fleetParamsSubsection).toBe('laneC');
    expect(useUIStore.getState().fleetParamsSection).toBe('lfoBank');
    useUIStore.getState().setFleetParamsSubsection(null);
    expect(useUIStore.getState().fleetParamsSubsection).toBeNull();
  });

  it('setFleetParamsSection round-trips a section and resets the sub-tab, which belonged to the old one', () => {
    useUIStore.getState().setFleetParamsSubsection('laneC');
    useUIStore.getState().setFleetParamsSection('timeSpace');
    expect(useUIStore.getState().fleetParamsSection).toBe('timeSpace');
    expect(useUIStore.getState().fleetParamsSubsection).toBeNull();
  });

  it('re-picking the same section also resets its sub-tab (the breadcrumb\'s group segment goes to the group)', () => {
    useUIStore.getState().setFleetParamsSection('eqFilters');
    useUIStore.getState().setFleetParamsSubsection('filterLPF');
    useUIStore.getState().setFleetParamsSection('eqFilters');
    expect(useUIStore.getState().fleetParamsSubsection).toBeNull();
  });

  it('touches no other nav field', () => {
    useUIStore.setState({ activeHubTile: 'audioRig', selectedSettingsLeaf: 'quality', selectedSection: 'source' });
    useUIStore.getState().setFleetParamsSection('output');
    useUIStore.getState().setFleetParamsSubsection('limiter');
    expect(useUIStore.getState()).toMatchObject({ activeHubTile: 'audioRig', selectedSettingsLeaf: 'quality', selectedSection: 'source' });
  });

  it('stays JSON-serialisable', () => {
    useUIStore.getState().setFleetParamsSection('output');
    useUIStore.getState().setFleetParamsSubsection('limiter');
    const { fleetParamsSection, fleetParamsSubsection } = useUIStore.getState();
    expect(JSON.parse(JSON.stringify({ fleetParamsSection, fleetParamsSubsection }))).toEqual({ fleetParamsSection: 'output', fleetParamsSubsection: 'limiter' });
  });
});

describe('uiStore — expandedTopLevelBranch (bugfix: the 4 top-level tree nodes had no expansion state at all, so their +/- never worked)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — nothing expanded', () => {
    expect(useUIStore.getState().expandedTopLevelBranch).toBeNull();
  });

  it('setExpandedTopLevelBranch sets one of the 4 top-level branches, replacing any other', () => {
    useUIStore.getState().setExpandedTopLevelBranch('settings');
    expect(useUIStore.getState().expandedTopLevelBranch).toBe('settings');
    useUIStore.getState().setExpandedTopLevelBranch('fleetParams');
    expect(useUIStore.getState().expandedTopLevelBranch).toBe('fleetParams');
  });

  it('setExpandedTopLevelBranch(null) collapses back to nothing expanded', () => {
    useUIStore.getState().setExpandedTopLevelBranch('probes');
    useUIStore.getState().setExpandedTopLevelBranch(null);
    expect(useUIStore.getState().expandedTopLevelBranch).toBeNull();
  });
});

describe('uiStore — selectedSubsection (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 1)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — no subsection chosen until a leaf is selected', () => {
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });

  it('setSelectedSubsection sets one of the 7 subsections', () => {
    useUIStore.getState().setSelectedSubsection('pingContour');
    expect(useUIStore.getState().selectedSubsection).toBe('pingContour');
  });

  it('setSelectedSubsection(null) clears back to no subsection chosen', () => {
    useUIStore.getState().setSelectedSubsection('rhythm');
    useUIStore.getState().setSelectedSubsection(null);
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });

  it('is independent of selectedSection', () => {
    useUIStore.getState().setSelectedSection('melody');
    useUIStore.getState().setSelectedSubsection('frequency');
    expect(useUIStore.getState().selectedSection).toBe('melody');
    expect(useUIStore.getState().selectedSubsection).toBe('frequency');
  });

  it('selectRobot(id) resets selectedSubsection to null — mirrors the existing selectedSection reset so a stale subsection never leaks onto the next robot', () => {
    useUIStore.getState().setSelectedSubsection('coaxialOscillator');
    useUIStore.getState().selectRobot('robot-1-def');
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });

  it('selectRobot(null) (the Back button case) also resets selectedSubsection', () => {
    useUIStore.getState().selectRobot('robot-0-xyz');
    useUIStore.getState().setSelectedSubsection('pingContour');
    useUIStore.getState().selectRobot(null);
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });
});

describe('uiStore — allProbesSelected (which Probes content view is active, docs/tasks/NAV_LAYOUT_REWRITE.md Task 19)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to false — bare "Probes" (the browse list) is the default, not the All Probes bulk-edit view', () => {
    expect(useUIStore.getState().allProbesSelected).toBe(false);
  });

  it('setAllProbesSelected(true) sets it', () => {
    useUIStore.getState().setAllProbesSelected(true);
    expect(useUIStore.getState().allProbesSelected).toBe(true);
  });

  it('setAllProbesSelected(false) clears it', () => {
    useUIStore.getState().setAllProbesSelected(true);
    useUIStore.getState().setAllProbesSelected(false);
    expect(useUIStore.getState().allProbesSelected).toBe(false);
  });

  it('is independent of allRobotsSelected — a different flag for a different concern (nav content routing vs. the RobotsTab company filter)', () => {
    useUIStore.getState().selectCompany('company-0-abc'); // clears allRobotsSelected
    useUIStore.getState().setAllProbesSelected(true);
    expect(useUIStore.getState().allRobotsSelected).toBe(false);
    expect(useUIStore.getState().allProbesSelected).toBe(true);
  });
});
