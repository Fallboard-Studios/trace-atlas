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
