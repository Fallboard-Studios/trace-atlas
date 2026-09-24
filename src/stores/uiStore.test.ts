import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

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

describe('uiStore — expandedProbeId (accordion-of-one within the Probes branch)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — nothing expanded', () => {
    expect(useUIStore.getState().expandedProbeId).toBeNull();
  });

  it('setExpandedProbeId sets the expanded probe, replacing any other', () => {
    useUIStore.getState().setExpandedProbeId('robot-0-xyz');
    expect(useUIStore.getState().expandedProbeId).toBe('robot-0-xyz');
    useUIStore.getState().setExpandedProbeId('robot-1-abc');
    expect(useUIStore.getState().expandedProbeId).toBe('robot-1-abc');
  });

  it('setExpandedProbeId(null) collapses back to nothing expanded', () => {
    useUIStore.getState().setExpandedProbeId('robot-0-xyz');
    useUIStore.getState().setExpandedProbeId(null);
    expect(useUIStore.getState().expandedProbeId).toBeNull();
  });

  it('is independent of expandedCompanyId and expandedFleetParamsGroup', () => {
    useUIStore.getState().setExpandedProbeId('robot-0-xyz');
    useUIStore.getState().setExpandedCompanyId('company-0-abc');
    useUIStore.getState().setExpandedFleetParamsGroup('eqFilters');
    expect(useUIStore.getState().expandedProbeId).toBe('robot-0-xyz');
  });
});

describe('uiStore — expandedCompanyId (accordion-of-one within the Companies branch)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — nothing expanded', () => {
    expect(useUIStore.getState().expandedCompanyId).toBeNull();
  });

  it('setExpandedCompanyId sets the expanded company, replacing any other', () => {
    useUIStore.getState().setExpandedCompanyId('company-0-abc');
    expect(useUIStore.getState().expandedCompanyId).toBe('company-0-abc');
    useUIStore.getState().setExpandedCompanyId('company-1-def');
    expect(useUIStore.getState().expandedCompanyId).toBe('company-1-def');
  });

  it('setExpandedCompanyId(null) collapses back to nothing expanded', () => {
    useUIStore.getState().setExpandedCompanyId('company-0-abc');
    useUIStore.getState().setExpandedCompanyId(null);
    expect(useUIStore.getState().expandedCompanyId).toBeNull();
  });

  it('is independent of expandedProbeId — expanding a probe never collapses an expanded company', () => {
    useUIStore.getState().setExpandedCompanyId('company-0-abc');
    useUIStore.getState().setExpandedProbeId('robot-0-xyz');
    expect(useUIStore.getState().expandedCompanyId).toBe('company-0-abc');
  });
});

describe('uiStore — expandedFleetParamsGroup (accordion-of-one within Fleet Params)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — nothing expanded', () => {
    expect(useUIStore.getState().expandedFleetParamsGroup).toBeNull();
  });

  it('setExpandedFleetParamsGroup sets one of the 3 groups, replacing any other', () => {
    useUIStore.getState().setExpandedFleetParamsGroup('eqFilters');
    expect(useUIStore.getState().expandedFleetParamsGroup).toBe('eqFilters');
    useUIStore.getState().setExpandedFleetParamsGroup('timeSpace');
    expect(useUIStore.getState().expandedFleetParamsGroup).toBe('timeSpace');
  });

  it('setExpandedFleetParamsGroup(null) collapses back to nothing expanded', () => {
    useUIStore.getState().setExpandedFleetParamsGroup('output');
    useUIStore.getState().setExpandedFleetParamsGroup(null);
    expect(useUIStore.getState().expandedFleetParamsGroup).toBeNull();
  });

  it('is independent of expandedProbeId and expandedCompanyId — its own level, own accordion-of-one', () => {
    useUIStore.getState().setExpandedProbeId('robot-0-xyz');
    useUIStore.getState().setExpandedCompanyId('company-0-abc');
    useUIStore.getState().setExpandedFleetParamsGroup('timeSpace');
    expect(useUIStore.getState().expandedProbeId).toBe('robot-0-xyz');
    expect(useUIStore.getState().expandedCompanyId).toBe('company-0-abc');
    expect(useUIStore.getState().expandedFleetParamsGroup).toBe('timeSpace');
  });
});

describe('uiStore — selectedSettingsLeaf (which Settings child is open, docs/tasks/NAV_LAYOUT_REWRITE.md Task 11)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — no Settings leaf chosen until one is selected', () => {
    expect(useUIStore.getState().selectedSettingsLeaf).toBeNull();
  });

  it('setSelectedSettingsLeaf sets one of the 4 Settings leaves', () => {
    useUIStore.getState().setSelectedSettingsLeaf('volume');
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('volume');
  });

  it('setSelectedSettingsLeaf(null) clears back to no leaf chosen', () => {
    useUIStore.getState().setSelectedSettingsLeaf('tempo');
    useUIStore.getState().setSelectedSettingsLeaf(null);
    expect(useUIStore.getState().selectedSettingsLeaf).toBeNull();
  });

  it('is independent of selectedSection — Settings is not an entity with robot/company sections', () => {
    useUIStore.getState().setSelectedSection('melody');
    useUIStore.getState().setSelectedSettingsLeaf('quality');
    expect(useUIStore.getState().selectedSection).toBe('melody');
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('quality');
  });
});

describe('uiStore — selectedFleetParamsEffect (which effect leaf is open, docs/tasks/NAV_LAYOUT_REWRITE.md Task 14)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — no effect leaf chosen until one is selected', () => {
    expect(useUIStore.getState().selectedFleetParamsEffect).toBeNull();
  });

  it('setSelectedFleetParamsEffect sets one of the 7 AudioRigEffectKeys', () => {
    useUIStore.getState().setSelectedFleetParamsEffect('eq3');
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('eq3');
  });

  it('setSelectedFleetParamsEffect(null) clears back to no leaf chosen', () => {
    useUIStore.getState().setSelectedFleetParamsEffect('delay');
    useUIStore.getState().setSelectedFleetParamsEffect(null);
    expect(useUIStore.getState().selectedFleetParamsEffect).toBeNull();
  });

  it('is independent of selectedSettingsLeaf — Fleet Params and Settings are different branches', () => {
    useUIStore.getState().setSelectedSettingsLeaf('quality');
    useUIStore.getState().setSelectedFleetParamsEffect('compressor');
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('quality');
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('compressor');
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

  it('is independent of the per-branch expandedXxxId fields — its own level, own accordion-of-one', () => {
    useUIStore.getState().setExpandedTopLevelBranch('probes');
    useUIStore.getState().setExpandedProbeId('robot-0-xyz');
    useUIStore.getState().setExpandedCompanyId('company-0-abc');
    useUIStore.getState().setExpandedFleetParamsGroup('eqFilters');
    expect(useUIStore.getState().expandedTopLevelBranch).toBe('probes');
    expect(useUIStore.getState().expandedProbeId).toBe('robot-0-xyz');
    expect(useUIStore.getState().expandedCompanyId).toBe('company-0-abc');
    expect(useUIStore.getState().expandedFleetParamsGroup).toBe('eqFilters');
  });
});

describe('uiStore — selectedSubsection (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 1)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — no subsection chosen until a leaf is selected', () => {
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });

  it('setSelectedSubsection sets one of the 8 subsections', () => {
    useUIStore.getState().setSelectedSubsection('probeDrift');
    expect(useUIStore.getState().selectedSubsection).toBe('probeDrift');
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

describe('uiStore — expandedProbeSection (accordion-of-one within an expanded probe, docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 1)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — nothing expanded', () => {
    expect(useUIStore.getState().expandedProbeSection).toBeNull();
  });

  it('setExpandedProbeSection sets one of the 4 sections, replacing any other', () => {
    useUIStore.getState().setExpandedProbeSection('melody');
    expect(useUIStore.getState().expandedProbeSection).toBe('melody');
    useUIStore.getState().setExpandedProbeSection('source');
    expect(useUIStore.getState().expandedProbeSection).toBe('source');
  });

  it('setExpandedProbeSection(null) collapses back to nothing expanded', () => {
    useUIStore.getState().setExpandedProbeSection('envelope');
    useUIStore.getState().setExpandedProbeSection(null);
    expect(useUIStore.getState().expandedProbeSection).toBeNull();
  });

  it('is independent of expandedCompanySection — one level deeper than expandedProbeId/expandedCompanyId, matching their own split', () => {
    useUIStore.getState().setExpandedProbeSection('melody');
    useUIStore.getState().setExpandedCompanySection('source');
    expect(useUIStore.getState().expandedProbeSection).toBe('melody');
    expect(useUIStore.getState().expandedCompanySection).toBe('source');
  });

  it('is independent of expandedProbeId', () => {
    useUIStore.getState().setExpandedProbeId('robot-0-xyz');
    useUIStore.getState().setExpandedProbeSection('volume');
    expect(useUIStore.getState().expandedProbeId).toBe('robot-0-xyz');
    expect(useUIStore.getState().expandedProbeSection).toBe('volume');
  });
});

describe('uiStore — expandedCompanySection (accordion-of-one within an expanded company, docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 1)', () => {
  beforeEach(() => {
    useUIStore.setState(INITIAL_STATE, true);
  });

  it('defaults to null — nothing expanded', () => {
    expect(useUIStore.getState().expandedCompanySection).toBeNull();
  });

  it('setExpandedCompanySection sets one of the 4 sections, replacing any other', () => {
    useUIStore.getState().setExpandedCompanySection('envelope');
    expect(useUIStore.getState().expandedCompanySection).toBe('envelope');
    useUIStore.getState().setExpandedCompanySection('volume');
    expect(useUIStore.getState().expandedCompanySection).toBe('volume');
  });

  it('setExpandedCompanySection(null) collapses back to nothing expanded', () => {
    useUIStore.getState().setExpandedCompanySection('source');
    useUIStore.getState().setExpandedCompanySection(null);
    expect(useUIStore.getState().expandedCompanySection).toBeNull();
  });

  it('is independent of expandedCompanyId', () => {
    useUIStore.getState().setExpandedCompanyId('company-0-abc');
    useUIStore.getState().setExpandedCompanySection('melody');
    expect(useUIStore.getState().expandedCompanyId).toBe('company-0-abc');
    expect(useUIStore.getState().expandedCompanySection).toBe('melody');
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
