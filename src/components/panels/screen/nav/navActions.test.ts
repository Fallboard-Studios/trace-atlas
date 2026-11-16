import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectBranch,
  selectEntity,
  goHome,
  breadcrumbTrail,
  branchOfTile,
  branchContent,
  FLEET_PARAMS_SUBSECTIONS,
  FLEET_PARAMS_GROUP_CONTENT,
  activeFleetParamsSubsection,
  NAV_TRAIL_MAX,
  back,
  closeDeletedCompany,
  openFleetParamsAt,
  type NavBranch,
  type BreadcrumbState,
  type NavRoster,
} from './navActions';
import { useUIStore, DEFAULT_FLEET_PARAMS_SECTION, type UIStore, type FleetParamsGroup, type SelectedFleetParamsEffect, type NavStop } from '@/stores/uiStore';
import { AUDIO_RIG_CONFIG, type AudioRigEffectKey } from '@/data/audioRigConfig';
import { LFO_BANK_LANE_CONTENT } from '@/data/lfoConfig';
import { CONTENT, labels } from '@/content';

const ui = () => useUIStore.getState();

/** The trail's names alone. */
const breadcrumbPath = (state: BreadcrumbState, roster: NavRoster) => breadcrumbTrail(state, roster).map((segment) => segment.label);

/** A store with every nav field set to something non-default, so a test can see each one cleared. */
function dirtyStore(overrides: Partial<UIStore> = {}) {
  useUIStore.setState({
    activeHubTile: 'robots',
    selectedRobotId: 'r1',
    selectedCompanyId: null,
    allRobotsSelected: true,
    allProbesSelected: false,
    selectedSection: 'source',
    selectedSubsection: 'coaxialOscillator',
    fleetParamsSection: 'output',
    fleetParamsSubsection: 'limiter',
    // An empty trail, so a case that dirties the store twice compares like with like (the trail is Task 3's).
    navTrail: [],
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
    // Fleet Params' tab is a section field too: every pick lands on its default (Task 15).
    fleetParamsSection: DEFAULT_FLEET_PARAMS_SECTION,
    fleetParamsSubsection: null,
  });
  expectCompanyInvariant();
}

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
});

describe('selectBranch', () => {
  it.each([
    ['probes', 'robots'],
    ['fleetParams', 'audioRig'],
  ] as const)('%s opens the %s tile', (branch, tile) => {
    selectBranch(branch);
    expect(ui().activeHubTile).toBe(tile);
  });

  // Crawford, 2026-10-09: picking a parent opens that branch's own page — the robot / company / All
  // and every section are cleared, so the Probes box and the breadcrumb's "Probes" segment return to
  // the list rather than reopening the last robot.
  it.each(['probes', 'fleetParams', 'deck'] as const)(
    '%s clears the entity and every section, from a robot with sections open',
    (branch: NavBranch) => {
      dirtyStore();
      selectBranch(branch);
      expectNoEntityAndNoSection();
    },
  );

  it('picking Probes while already on that robot still returns to the list', () => {
    dirtyStore({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    selectBranch('probes');
    expect(ui().selectedRobotId).toBeNull();
    expect(ui().activeHubTile).toBe('robots');
  });

  it('clears a selected company and All Probes too', () => {
    dirtyStore({ selectedRobotId: null, selectedCompanyId: 'c1', allRobotsSelected: false });
    selectBranch('probes');
    expect(ui().selectedCompanyId).toBeNull();
    expectCompanyInvariant();

    dirtyStore({ selectedRobotId: null, allProbesSelected: true });
    selectBranch('probes');
    expect(ui().allProbesSelected).toBe(false);
  });

  it("'deck' is goHome: no tile", () => {
    dirtyStore();
    selectBranch('deck');
    expect(ui().activeHubTile).toBeNull();
  });

  // Backlog 75 Task 13: the panel's boxes call selectBranch, so a box pressed on its own page does nothing.
  it.each(['probes', 'fleetParams', 'deck'] as const)('%s on its own page changes nothing, the trail included', (branch: NavBranch) => {
    selectBranch(branch === 'deck' ? 'probes' : 'deck');
    selectBranch(branch);
    const before = { ...ui() };
    selectBranch(branch);
    expect({ ...ui() }).toEqual(before);
  });

  // The phone sheet flag is no longer left alone: a pick closes the sheet (Task 5, below).
  it('leaves power alone', () => {
    useUIStore.setState({ isPoweredOn: true });
    selectBranch('fleetParams');
    expect(ui().isPoweredOn).toBe(true);
  });
});

describe('selectEntity', () => {
  it('a robot: opens Probes on it, clearing the company, All Probes and any section', () => {
    dirtyStore({ activeHubTile: 'audioRig', selectedRobotId: null, selectedCompanyId: 'c1', allRobotsSelected: false, allProbesSelected: true });
    selectEntity({ robotId: 'r2' });
    expect(ui()).toMatchObject({
      activeHubTile: 'robots',
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
      allProbesSelected: true,
      selectedRobotId: null,
      selectedCompanyId: null,
      selectedSection: null,
    });
    expectCompanyInvariant();
  });

  // docs/tasks/OFF_SCREEN_CONSOLE.md Task 17 (Crawford, 2026-11-09): a company opens under Probes.
  it('a company: opens Probes on it, clearing the robot and All Probes', () => {
    dirtyStore({ allProbesSelected: true });
    selectEntity({ companyId: 'c1' });
    expect(ui()).toMatchObject({
      activeHubTile: 'robots',
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
    useUIStore.setState({ selectedSection: 'envelope', selectedSubsection: 'envelopeContour' });
    selectEntity({ robotId: 'r2' });
    expect(ui().selectedSection).toBeNull();
    expect(ui().selectedSubsection).toBeNull();
  });
});

describe('goHome', () => {
  it('returns to the Deck with no entity and no section', () => {
    dirtyStore({ selectedCompanyId: 'c1', allRobotsSelected: false, allProbesSelected: true });
    goHome();
    expect(ui().activeHubTile).toBeNull();
    expectNoEntityAndNoSection();
  });
});

// Task 5 (spec §1.2): on the phone the panel is a sheet whose open flag is isNavPanelOpen, and picking
// closes it.
describe('a pick closes the phone nav sheet', () => {
  it.each(['probes', 'fleetParams', 'deck'] as const)('selectBranch(%s)', (branch: NavBranch) => {
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

  it('a pick never opens the sheet', () => {
    selectEntity({ robotId: 'r1' });
    selectBranch('fleetParams');
    goHome();
    expect(ui().isNavPanelOpen).toBe(false);
  });
});

// docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 3 (docs/specs/NAVIGATION_CLOSE_AND_BACK.md §1.2): every navigation
// appends the screen being left, with its tabs; going to the screen already showing, or switching a tab, does not.
describe('the trail: every navigation is a step', () => {
  const trail = () => ui().navTrail;
  const DECK_STOP: NavStop = {
    tile: null, robotId: null, companyId: null, allProbes: false,
    section: null, subsection: null, fleetSection: DEFAULT_FLEET_PARAMS_SECTION, fleetSubsection: null,
  };
  /** A stop on the Probes tile, at the default tabs unless overridden. */
  const probesStop = (overrides: Partial<NavStop> = {}): NavStop => ({ ...DECK_STOP, tile: 'robots', ...overrides });

  it('deck -> robot: the trail is one deck stop', () => {
    selectEntity({ robotId: 'r1' });
    expect(trail()).toStrictEqual([DECK_STOP]);
  });

  it('a company on Envelope > Character -> a member robot: the last stop names the company with both tabs', () => {
    selectEntity({ companyId: 'c1' });
    useUIStore.setState({ selectedSection: 'envelope', selectedSubsection: 'envelopeCharacter' });
    selectEntity({ robotId: 'r1' });
    expect(trail().at(-1)).toStrictEqual(probesStop({ companyId: 'c1', section: 'envelope', subsection: 'envelopeCharacter' }));
  });

  it('Fleet Params on Modulation > Chorus -> Probes: the stop keeps both Fleet Params tabs', () => {
    selectBranch('fleetParams');
    ui().setFleetParamsSection('modulation');
    ui().setFleetParamsSubsection('chorus');
    selectBranch('probes');
    expect(trail().at(-1)).toStrictEqual({ ...DECK_STOP, tile: 'audioRig', fleetSection: 'modulation', fleetSubsection: 'chorus' });
  });

  it('a robot on Levels > Sends -> goHome: the stop names the robot with its tabs', () => {
    selectEntity({ robotId: 'r1' });
    useUIStore.setState({ selectedSection: 'volume', selectedSubsection: 'sends' });
    goHome();
    expect(trail().at(-1)).toStrictEqual(probesStop({ robotId: 'r1', section: 'volume', subsection: 'sends' }));
  });

  it('All Probes -> Fleet Params: the stop is All Probes', () => {
    selectEntity('all');
    selectBranch('fleetParams');
    expect(trail().at(-1)).toStrictEqual(probesStop({ allProbes: true }));
  });

  it('a walk of five screens leaves the four before the current one, oldest first', () => {
    selectBranch('probes');
    selectEntity({ companyId: 'c1' });
    selectEntity({ robotId: 'r1' });
    selectBranch('fleetParams');
    expect(trail()).toStrictEqual([DECK_STOP, probesStop(), probesStop({ companyId: 'c1' }), probesStop({ robotId: 'r1' })]);
  });

  it("selectBranch('deck') records one step, not two (it is goHome)", () => {
    selectEntity({ robotId: 'r1' });
    selectBranch('deck');
    expect(trail()).toStrictEqual([DECK_STOP, probesStop({ robotId: 'r1' })]);
  });

  it('a robot -> the Probes list is a step: same tile, another screen', () => {
    selectEntity({ robotId: 'r1' });
    selectBranch('probes');
    expect(trail().at(-1)).toStrictEqual(probesStop({ robotId: 'r1' }));
  });

  it('one robot -> another is a step', () => {
    selectEntity({ robotId: 'r1' });
    selectEntity({ robotId: 'r2' });
    expect(trail().at(-1)).toStrictEqual(probesStop({ robotId: 'r1' }));
  });

  describe('going to the screen already showing appends nothing', () => {
    it('Fleet Params pressed on Fleet Params: no step, and its tabs still reset as today', () => {
      selectBranch('fleetParams');
      ui().setFleetParamsSection('output');
      ui().setFleetParamsSubsection('limiter');
      const before = trail();
      selectBranch('fleetParams');
      expect(trail()).toBe(before);
      expect(ui().fleetParamsSection).toBe(DEFAULT_FLEET_PARAMS_SECTION);
      expect(ui().fleetParamsSubsection).toBeNull();
    });

    it('the same robot picked twice: no step, and its tabs still reset as today', () => {
      selectEntity({ robotId: 'r1' });
      useUIStore.setState({ selectedSection: 'envelope', selectedSubsection: 'envelopeContour' });
      const before = trail();
      selectEntity({ robotId: 'r1' });
      expect(trail()).toBe(before);
      expect(ui().selectedSection).toBeNull();
      expect(ui().selectedSubsection).toBeNull();
    });

    it.each<[string, () => void]>([
      ['the Probes list', () => selectBranch('probes')],
      ['a company', () => selectEntity({ companyId: 'c1' })],
      ['All Probes', () => selectEntity('all')],
    ])('%s picked on itself: no step', (_case, go) => {
      selectBranch('fleetParams');
      go();
      const before = trail();
      go();
      expect(trail()).toBe(before);
    });

    it('goHome on the deck, and the Deck box on the deck: no step', () => {
      goHome();
      selectBranch('deck');
      expect(trail()).toEqual([]);
    });

    it('Fleet Params ignores the entity fields: with a robot haloed there, Fleet Params pressed again is no step', () => {
      selectBranch('fleetParams');
      ui().selectRobot('r1'); // Robot.tsx on Fleet Params: the halo moves, not the screen
      const before = trail();
      selectBranch('fleetParams');
      expect(trail()).toBe(before);
    });
  });

  it('the four tab setters append nothing', () => {
    selectEntity({ robotId: 'r1' });
    const before = trail();
    ui().setSelectedSection('melody');
    ui().setSelectedSubsection('rhythmMelody');
    ui().setFleetParamsSection('colour');
    ui().setFleetParamsSubsection('bitCrusher');
    expect(trail()).toBe(before);
  });

  it(`holds at most ${NAV_TRAIL_MAX} stops: the 51st step drops the oldest`, () => {
    expect(NAV_TRAIL_MAX).toBe(50);
    // deck -> r0 -> r1 -> ... -> r50: 51 steps, the first leaving the deck.
    for (let i = 0; i <= NAV_TRAIL_MAX; i++) selectEntity({ robotId: `r${i}` });
    expect(trail()).toHaveLength(NAV_TRAIL_MAX);
    expect(trail()[0]).toStrictEqual(probesStop({ robotId: 'r0' }));
    expect(trail().at(-1)).toStrictEqual(probesStop({ robotId: `r${NAV_TRAIL_MAX - 1}` }));
  });

  it('a full trail stays full: one more step drops one stop, never more', () => {
    for (let i = 0; i <= NAV_TRAIL_MAX; i++) selectEntity({ robotId: `r${i}` });
    selectBranch('fleetParams');
    expect(trail()).toHaveLength(NAV_TRAIL_MAX);
    expect(trail()[0]).toStrictEqual(probesStop({ robotId: 'r1' }));
    expect(trail().at(-1)).toStrictEqual(probesStop({ robotId: `r${NAV_TRAIL_MAX}` }));
  });

  it('a stop is plain data: the trail survives a JSON round trip', () => {
    selectEntity({ companyId: 'c1' });
    useUIStore.setState({ selectedSection: 'source', selectedSubsection: 'busFilter' });
    selectBranch('fleetParams');
    expect(JSON.parse(JSON.stringify(trail()))).toStrictEqual(trail());
  });
});

// docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 4 (docs/specs/NAVIGATION_CLOSE_AND_BACK.md §1.3): Back shows the last
// stop on the tabs it had, takes it off the trail, and is never a step itself.
describe('back()', () => {
  const trail = () => ui().navTrail;
  /** The deck, as the store holds it: no tile, no entity, default tabs. */
  const DECK = {
    activeHubTile: null,
    selectedRobotId: null, selectedCompanyId: null, allRobotsSelected: true, allProbesSelected: false,
    selectedSection: null, selectedSubsection: null,
    fleetParamsSection: DEFAULT_FLEET_PARAMS_SECTION, fleetParamsSubsection: null,
  };

  it('a company on Envelope > Character -> a member robot -> back(): that company on Envelope > Character', () => {
    selectEntity({ companyId: 'c1' });
    useUIStore.setState({ selectedSection: 'envelope', selectedSubsection: 'envelopeCharacter' });
    selectEntity({ robotId: 'r1' });
    back();
    expect(ui()).toMatchObject({
      ...DECK, activeHubTile: 'robots',
      selectedCompanyId: 'c1', allRobotsSelected: false,
      selectedSection: 'envelope', selectedSubsection: 'envelopeCharacter',
    });
    expectCompanyInvariant();
  });

  it('deck -> robot -> back(): the deck, with an empty trail', () => {
    selectEntity({ robotId: 'r1' });
    back();
    expect(ui()).toMatchObject(DECK);
    expect(trail()).toEqual([]);
  });

  it('Fleet Params on Modulation > Chorus -> Probes -> back(): Fleet Params on both tabs', () => {
    selectBranch('fleetParams');
    ui().setFleetParamsSection('modulation');
    ui().setFleetParamsSubsection('chorus');
    selectBranch('probes');
    back();
    expect(ui()).toMatchObject({ ...DECK, activeHubTile: 'audioRig', fleetParamsSection: 'modulation', fleetParamsSubsection: 'chorus' });
  });

  it('a robot on Source > Coaxial -> goHome() -> back(): the robot on its tabs (a Back after Close undoes it)', () => {
    selectEntity({ robotId: 'r1' });
    useUIStore.setState({ selectedSection: 'source', selectedSubsection: 'coaxialOscillator' });
    goHome();
    back();
    expect(ui()).toMatchObject({ ...DECK, activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'source', selectedSubsection: 'coaxialOscillator' });
  });

  it('All Probes on Levels -> a robot -> back(): All Probes on Levels', () => {
    selectEntity('all');
    useUIStore.setState({ selectedSection: 'volume', selectedSubsection: 'mix' });
    selectEntity({ robotId: 'r1' });
    back();
    expect(ui()).toMatchObject({ ...DECK, activeHubTile: 'robots', allProbesSelected: true, selectedSection: 'volume', selectedSubsection: 'mix' });
  });

  it('the Probes list -> a robot -> back(): the list', () => {
    selectBranch('probes');
    selectEntity({ robotId: 'r1' });
    back();
    expect(ui()).toMatchObject({ ...DECK, activeHubTile: 'robots' });
  });

  it('a robot -> the Probes list -> back(): the robot', () => {
    selectBranch('probes');
    selectEntity({ robotId: 'r1' });
    selectBranch('probes');
    back();
    expect(ui()).toMatchObject({ activeHubTile: 'robots', selectedRobotId: 'r1' });
  });

  it('a Back clears what the screen it leaves had: no robot left over on the company it shows', () => {
    selectEntity({ companyId: 'c1' });
    selectEntity({ robotId: 'r1' });
    useUIStore.setState({ fleetParamsSection: 'output', fleetParamsSubsection: 'limiter' }); // stale, off-screen
    back();
    expect(ui()).toMatchObject({ ...DECK, activeHubTile: 'robots', selectedCompanyId: 'c1', allRobotsSelected: false });
  });

  it('appends nothing: each Back takes exactly one stop off', () => {
    selectBranch('probes');
    selectEntity({ companyId: 'c1' });
    selectEntity({ robotId: 'r1' });
    expect(trail()).toHaveLength(3);
    back();
    expect(trail()).toHaveLength(2);
    back();
    expect(trail()).toHaveLength(1);
  });

  it('a walk unwinds in reverse, one screen per Back, ending on the deck', () => {
    selectBranch('fleetParams');
    selectBranch('probes');
    selectEntity({ companyId: 'c1' });
    selectEntity({ robotId: 'r1' });
    const shown: string[] = [];
    for (let i = 0; i < 4; i++) {
      back();
      const s = ui();
      shown.push(`${s.activeHubTile}/${s.selectedRobotId ?? s.selectedCompanyId ?? '-'}`);
    }
    expect(shown).toEqual(['robots/c1', 'robots/-', 'audioRig/-', 'null/-']);
    expect(trail()).toEqual([]);
  });

  it('on an empty trail shows the deck, from any screen', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    back();
    expect(ui()).toMatchObject(DECK);
    expect(trail()).toEqual([]);
  });

  it('on an empty trail on the deck changes nothing', () => {
    back();
    expect(ui()).toMatchObject(DECK);
    expect(trail()).toEqual([]);
  });

  it('shuts the phone nav sheet, as every action does', () => {
    selectEntity({ robotId: 'r1' });
    ui().setNavPanelOpen(true);
    back();
    expect(ui().isNavPanelOpen).toBe(false);

    ui().setNavPanelOpen(true);
    back(); // the empty-trail fallback too
    expect(ui().isNavPanelOpen).toBe(false);
  });

  it('a Back then a new pick records the screen Back showed', () => {
    selectEntity({ companyId: 'c1' });
    selectEntity({ robotId: 'r1' });
    back();
    selectEntity({ robotId: 'r2' });
    expect(trail().map((stop) => stop.companyId ?? stop.robotId ?? stop.tile)).toEqual([null, 'c1']);
  });

  it('leaves power alone', () => {
    useUIStore.setState({ isPoweredOn: true });
    selectEntity({ robotId: 'r1' });
    back();
    expect(ui().isPoweredOn).toBe(true);
  });
});

// docs/tasks/HELP_POPOVER_LINKS.md Task 1 (docs/specs/HELP_POPOVER_LINKS.md §1.3): a help link's jump opens Fleet Params
// on a tab and sub-tab as a step, even from Fleet Params itself; showing that tab and sub-tab already, it does nothing.
describe('openFleetParamsAt', () => {
  const trail = () => ui().navTrail;
  /** A robot on Levels > Sends, with a trail of one deck stop. */
  function robotOnSends() {
    selectEntity({ robotId: 'r1' });
    ui().setSelectedSection('volume');
    ui().setSelectedSubsection('sends');
  }
  /** Fleet Params on Time & Space > Delay, with a trail of one deck stop. */
  function fleetOnDelay() {
    selectBranch('fleetParams');
    ui().setFleetParamsSection('timeSpace');
    ui().setFleetParamsSubsection('delay');
  }

  it('from a robot on Levels > Sends: Fleet Params on the tab and sub-tab, no entity left', () => {
    robotOnSends();
    openFleetParamsAt('modulation', 'chorus');
    expect(ui()).toMatchObject({
      activeHubTile: 'audioRig',
      fleetParamsSection: 'modulation',
      fleetParamsSubsection: 'chorus',
      selectedRobotId: null,
      selectedSection: null,
      selectedSubsection: null,
    });
    expectCompanyInvariant();
  });

  it('from a robot on Levels > Sends: the trail gains one stop, the robot on its tabs, and back() returns to it', () => {
    robotOnSends();
    const before = trail();
    openFleetParamsAt('modulation', 'chorus');
    expect(trail()).toHaveLength(before.length + 1);
    expect(trail().slice(0, -1)).toStrictEqual(before);
    expect(trail().at(-1)).toMatchObject({ tile: 'robots', robotId: 'r1', section: 'volume', subsection: 'sends' });
    back();
    expect(ui()).toMatchObject({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'volume', selectedSubsection: 'sends' });
    expect(trail()).toStrictEqual(before);
  });

  it('from a company and from All Probes: each is the stop recorded', () => {
    selectEntity({ companyId: 'c1' });
    openFleetParamsAt('timeSpace', 'reverb');
    expect(trail().at(-1)).toMatchObject({ tile: 'robots', companyId: 'c1', robotId: null });
    selectEntity('all');
    openFleetParamsAt('timeSpace', 'reverb');
    expect(trail().at(-1)).toMatchObject({ tile: 'robots', allProbes: true });
  });

  it('from Fleet Params on Time & Space > Delay to LFOs > Accent LFO: one stop, Fleet Params on Delay', () => {
    fleetOnDelay();
    const before = trail();
    openFleetParamsAt('lfoBank', 'laneC');
    expect(ui()).toMatchObject({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneC' });
    expect(trail()).toHaveLength(before.length + 1);
    expect(trail().at(-1)).toMatchObject({ tile: 'audioRig', fleetSection: 'timeSpace', fleetSubsection: 'delay' });
  });

  it('from Fleet Params on Delay, back() shows Delay', () => {
    fleetOnDelay();
    openFleetParamsAt('lfoBank', 'laneC');
    back();
    expect(ui()).toMatchObject({ activeHubTile: 'audioRig', fleetParamsSection: 'timeSpace', fleetParamsSubsection: 'delay' });
  });

  it('another sub-tab of the same tab is a step too', () => {
    fleetOnDelay();
    openFleetParamsAt('timeSpace', 'reverb');
    expect(ui().fleetParamsSubsection).toBe('reverb');
    expect(trail().at(-1)).toMatchObject({ tile: 'audioRig', fleetSection: 'timeSpace', fleetSubsection: 'delay' });
  });

  it('already on that tab and sub-tab: no stop, no state change', () => {
    fleetOnDelay();
    ui().setNavPanelOpen(true);
    const before = { ...ui() };
    openFleetParamsAt('timeSpace', 'delay');
    expect({ ...ui() }).toEqual(before);
  });

  it('already showing that sub-tab as the tab\'s first with none stored: no stop, no state change', () => {
    selectBranch('fleetParams');
    ui().setFleetParamsSection('lfoBank'); // the sub-tab shown is Core LFO, laneA
    const before = { ...ui() };
    openFleetParamsAt('lfoBank', 'laneA');
    expect({ ...ui() }).toEqual(before);
  });

  it('the same tab and sub-tab stored, but on another tile: a step to Fleet Params', () => {
    robotOnSends();
    useUIStore.setState({ fleetParamsSection: 'timeSpace', fleetParamsSubsection: 'delay' }); // stale, off-screen
    const before = trail().length;
    openFleetParamsAt('timeSpace', 'delay');
    expect(ui().activeHubTile).toBe('audioRig');
    expect(trail()).toHaveLength(before + 1);
  });

  it('shuts the phone nav sheet', () => {
    robotOnSends();
    ui().setNavPanelOpen(true);
    openFleetParamsAt('modulation', 'chorus');
    expect(ui().isNavPanelOpen).toBe(false);
  });

  it(`the trail cap holds: a step on a full trail keeps ${NAV_TRAIL_MAX} stops, dropping the oldest`, () => {
    for (let i = 0; i <= NAV_TRAIL_MAX; i++) selectEntity({ robotId: `r${i}` });
    expect(trail()).toHaveLength(NAV_TRAIL_MAX);
    const second = trail()[1];
    openFleetParamsAt('modulation', 'chorus');
    expect(trail()).toHaveLength(NAV_TRAIL_MAX);
    expect(trail()[0]).toStrictEqual(second);
    expect(trail().at(-1)).toMatchObject({ robotId: `r${NAV_TRAIL_MAX}` });
  });

  it('a stop recorded by it is plain data', () => {
    fleetOnDelay();
    openFleetParamsAt('lfoBank', 'laneC');
    expect(JSON.parse(JSON.stringify(trail()))).toStrictEqual(trail());
  });

  it('leaves power alone', () => {
    useUIStore.setState({ isPoweredOn: true });
    openFleetParamsAt('modulation', 'chorus');
    expect(ui().isPoweredOn).toBe(true);
  });
});

// docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 5 (docs/specs/NAVIGATION_CLOSE_AND_BACK.md §1.3, §7.1 A5): a deleted
// company leaves the trail, so Back never lands on a screen with nothing to show, nor shows one screen twice.
describe('closeDeletedCompany', () => {
  const trail = () => ui().navTrail;
  const keys = () => trail().map((stop) => stop.robotId ?? stop.companyId ?? (stop.tile === null ? 'deck' : stop.tile === 'audioRig' ? 'fleet' : 'probes'));

  it('Probes list -> company X, on X: shows the Probes list and leaves no stop naming X', () => {
    selectBranch('probes');
    selectEntity({ companyId: 'X' });
    closeDeletedCompany('X');
    expect(ui()).toMatchObject({ activeHubTile: 'robots', selectedCompanyId: null, selectedRobotId: null, allProbesSelected: false });
    expectCompanyInvariant();
    expect(trail().some((stop) => stop.companyId === 'X')).toBe(false);
  });

  it('records no step: the screen deleted is not added, and the trail never grows', () => {
    selectEntity({ robotId: 'r1' });
    selectEntity({ companyId: 'X' });
    const before = trail().length;
    closeDeletedCompany('X');
    expect(trail().length).toBeLessThanOrEqual(before);
    expect(keys()).toEqual(['deck', 'r1']);
  });

  it('removes every stop naming X, not only the last', () => {
    selectEntity({ companyId: 'X' });
    selectEntity({ robotId: 'r1' });
    selectEntity({ companyId: 'X' });
    closeDeletedCompany('X');
    expect(keys()).toEqual(['deck', 'r1']);
    back();
    expect(ui().selectedRobotId).toBe('r1');
    back();
    expect(ui().activeHubTile).toBeNull();
  });

  it('two stops for one screen left side by side become one, the later with its tabs', () => {
    selectEntity({ robotId: 'r1' });
    useUIStore.setState({ selectedSection: 'melody' });
    selectEntity({ companyId: 'X' });
    selectEntity({ robotId: 'r1' });
    useUIStore.setState({ selectedSection: 'envelope', selectedSubsection: 'envelopeContour' });
    selectEntity({ companyId: 'X' });
    closeDeletedCompany('X');
    expect(keys()).toEqual(['deck', 'r1']);
    expect(trail().at(-1)).toMatchObject({ section: 'envelope', subsection: 'envelopeContour' });
  });

  it('drops a last stop that is the Probes list, so the first Back does not show the list again', () => {
    selectBranch('fleetParams');
    selectBranch('probes');
    selectEntity({ companyId: 'X' });
    selectBranch('probes');
    selectEntity({ companyId: 'X' });
    closeDeletedCompany('X');
    expect(keys()).toEqual(['deck', 'fleet']);
    back();
    expect(ui().activeHubTile).toBe('audioRig');
  });

  it('a Probes list stop further back stays: only the last one repeats the screen showing', () => {
    selectBranch('probes');
    selectEntity({ robotId: 'r1' });
    selectEntity({ companyId: 'X' });
    closeDeletedCompany('X');
    expect(keys()).toEqual(['deck', 'probes', 'r1']);
  });

  it('keeps every other company, robot and Fleet Params stop', () => {
    selectEntity({ companyId: 'Y' });
    selectBranch('fleetParams');
    selectEntity({ robotId: 'r1' });
    selectEntity({ companyId: 'X' });
    closeDeletedCompany('X');
    expect(keys()).toEqual(['deck', 'Y', 'fleet', 'r1']);
  });

  it('with an empty trail, shows the Probes list and leaves the trail empty', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedCompanyId: 'X', allRobotsSelected: false });
    closeDeletedCompany('X');
    expect(ui()).toMatchObject({ activeHubTile: 'robots', selectedCompanyId: null });
    expect(trail()).toEqual([]);
  });

  it('shuts the phone nav sheet, as every action does', () => {
    selectEntity({ companyId: 'X' });
    ui().setNavPanelOpen(true);
    closeDeletedCompany('X');
    expect(ui().isNavPanelOpen).toBe(false);
  });
});

// Task 4: the panel reads which box is popped and each box's label from here, so the branch / tile /
// content tables exist once.
describe('the parent-box tables the panel reads', () => {
  it.each([
    [null, 'deck'],
    ['robots', 'probes'],
    ['audioRig', 'fleetParams'],
  ] as const)('branchOfTile(%s) is %s', (tile, branch) => {
    expect(branchOfTile(tile)).toBe(branch);
  });

  it('branchOfTile inverts what selectBranch opens, for every branch', () => {
    for (const branch of ['deck', 'probes', 'fleetParams'] as const) {
      selectBranch(branch);
      expect(branchOfTile(ui().activeHubTile)).toBe(branch);
    }
  });

  it.each([
    ['deck', 'nav.home'],
    ['fleetParams', 'fleet.root'],
    ['probes', 'probe.root'],
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
  const FLEET = CONTENT['fleet.root'].human;

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
  };
  const path = (s: Partial<BreadcrumbState>) => breadcrumbPath({ ...blank, ...s }, roster);

  it('is empty on the Deck, even with a stale entity and sections in the store', () => {
    expect(path({})).toEqual([]);
    expect(path({ selectedRobotId: 'r1', selectedSection: 'source', fleetParamsSection: 'output', fleetParamsSubsection: 'limiter' })).toEqual([]);
  });

  // Task 15: Fleet Params is tabs, so one tab is always open. The default is World at Pacing
  // (docs/specs/CONTENT_LAYOUT.md assumption 8; docs/tasks/CONTENT_LAYOUT.md Task 8).
  it('reads Root / Fleet Params / World / Pacing on the default tab with no sub-tab stored', () => {
    expect(path({ activeHubTile: 'audioRig' })).toEqual([ROOT, FLEET, CONTENT['fleet.world'].human, CONTENT['fleet.pacing'].human]);
  });

  it('reads Root / Fleet Params / <group> / <lane> with a lane picked', () => {
    expect(path({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneB' })).toEqual([ROOT, FLEET, CONTENT['fleet.lfoBank'].human, CONTENT['fleet.lfoBank.laneB'].human]);
  });

  it('names the branch alone when no entity is selected', () => {
    expect(path({ activeHubTile: 'robots' })).toEqual([ROOT, PROBES]);
  });

  it.each<[FleetParamsGroup, BreadcrumbState['fleetParamsSubsection'], string[]]>([
    // World's two sub-tabs, Pacing first (docs/tasks/CONTENT_LAYOUT.md Task 8).
    ['world', null, [CONTENT['fleet.world'].human, CONTENT['fleet.pacing'].human]],
    ['world', 'pacing', [CONTENT['fleet.world'].human, CONTENT['fleet.pacing'].human]],
    ['world', 'quality', [CONTENT['fleet.world'].human, CONTENT['fleet.quality'].human]],
    // A leaf of another group, or one of Pacing's old synthetic leaves, reads as World's first.
    ['world', 'laneB', [CONTENT['fleet.world'].human, CONTENT['fleet.pacing'].human]],
    ['world', 'tempo', [CONTENT['fleet.world'].human, CONTENT['fleet.pacing'].human]],
    ['lfoBank', 'laneD', [CONTENT['fleet.lfoBank'].human, CONTENT['fleet.lfoBank.laneD'].human]],
    ['eqFilters', null, [CONTENT['fleet.eqFilters'].human, CONTENT['fleet.eq'].human]],
    ['eqFilters', 'filterHPF', [CONTENT['fleet.eqFilters'].human, CONTENT['fleet.hpf'].human]],
    ['timeSpace', 'delay', [CONTENT['fleet.timeSpace'].human, CONTENT['fleet.delay'].human]],
    ['colour', null, [CONTENT['fleet.colour'].human, CONTENT['fleet.distortion'].human]],
    ['colour', 'bitCrusher', [CONTENT['fleet.colour'].human, CONTENT['fleet.bitCrusher'].human]],
    ['modulation', null, [CONTENT['fleet.modulation'].human, CONTENT['fleet.autoWah'].human]],
    ['modulation', 'phaser', [CONTENT['fleet.modulation'].human, CONTENT['fleet.phaser'].human]],
    ['modulation', 'chorus', [CONTENT['fleet.modulation'].human, CONTENT['fleet.chorus'].human]],
    ['modulation', 'frequencyShifter', [CONTENT['fleet.modulation'].human, CONTENT['fleet.frequencyShifter'].human]],
    ['output', 'limiter', [CONTENT['fleet.output'].human, CONTENT['fleet.limiter'].human]],
    ['output', 'stereoWidener', [CONTENT['fleet.output'].human, CONTENT['fleet.stereoWidener'].human]],
    // A Width left over on Modulation, or a pedal left over on Output, reads as the group's first.
    ['modulation', 'stereoWidener', [CONTENT['fleet.modulation'].human, CONTENT['fleet.autoWah'].human]],
    ['output', 'tremolo', [CONTENT['fleet.output'].human, CONTENT['fleet.compressor'].human]],
    // A colour sub-tab left over on another group reads as that group's first, and vice versa.
    ['eqFilters', 'chebyshev', [CONTENT['fleet.eqFilters'].human, CONTENT['fleet.eq'].human]],
    ['colour', 'delay', [CONTENT['fleet.colour'].human, CONTENT['fleet.distortion'].human]],
    ['modulation', 'bitCrusher', [CONTENT['fleet.modulation'].human, CONTENT['fleet.autoWah'].human]],
    ['colour', 'phaser', [CONTENT['fleet.colour'].human, CONTENT['fleet.distortion'].human]],
    // A sub-tab left over from another group reads as the group's first, which is what the screen shows.
    ['output', 'laneC', [CONTENT['fleet.output'].human, CONTENT['fleet.compressor'].human]],
    // World's sub-tabs left over on another group read as that group's first.
    ['lfoBank', 'quality', [CONTENT['fleet.lfoBank'].human, CONTENT['fleet.lfoBank.laneA'].human]],
    ['output', 'pacing', [CONTENT['fleet.output'].human, CONTENT['fleet.compressor'].human]],
  ])('Fleet Params on %s / %s names %j', (section, subsection, tail) => {
    expect(path({ activeHubTile: 'audioRig', fleetParamsSection: section, fleetParamsSubsection: subsection })).toEqual([ROOT, FLEET, ...tail]);
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

  // Task 23: the company screen is the robot screen's tabs, so All Probes and a company, like a robot,
  // always have a section open — Source when none is stored.
  it('All Probes and a company always name a section, Source when none is stored (their screen is tabs)', () => {
    expect(path({ activeHubTile: 'robots', allProbesSelected: true })).toEqual([ROOT, PROBES, CONTENT['probe.all'].human, CONTENT['probe.source'].human]);
    expect(path({ activeHubTile: 'robots', selectedCompanyId: 'c1' })).toEqual([ROOT, PROBES, 'Rust Syndicate', CONTENT['probe.source'].human]);
  });

  it("adds a company's stored section, named by its tab", () => {
    expect(path({ activeHubTile: 'robots', selectedCompanyId: 'c1', selectedSection: 'envelope' })).toEqual([ROOT, PROBES, 'Rust Syndicate', CONTENT['probe.envelope'].human]);
  });

  it('drops the entity and its section when the id is not in the roster (a stale or deleted id)', () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'gone', selectedSection: 'source' })).toEqual([ROOT, PROBES]);
    expect(path({ activeHubTile: 'robots', selectedCompanyId: 'gone', selectedSection: 'source' })).toEqual([ROOT, PROBES]);
  });

  it('a specific robot wins over a company, and a company over All Probes (ProbesBranch routes the same way)', () => {
    expect(path({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedCompanyId: 'c1' })).toEqual([ROOT, PROBES, 'Tidal Wisp', CONTENT['probe.source'].human]);
    expect(path({ activeHubTile: 'robots', selectedCompanyId: 'c1', allProbesSelected: true })).toEqual([ROOT, PROBES, 'Rust Syndicate', CONTENT['probe.source'].human]);
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

  it('Root goes home: no tile, no entity', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    go(0);
    expect(ui().activeHubTile).toBeNull();
    expect(ui().selectedRobotId).toBeNull();
  });

  it("the branch goes to the branch's own page: entity and section cleared", () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    go(1);
    expect(ui().activeHubTile).toBe('robots');
    expect(ui().selectedRobotId).toBeNull();
    expect(ui().selectedSection).toBeNull();
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
    useUIStore.setState({ activeHubTile: 'robots', selectedCompanyId: 'c1', selectedSection: 'envelope' });
    go(2);
    expect(ui().selectedCompanyId).toBe('c1');
    expect(ui().selectedSection).toBeNull();
    expect(ui().activeHubTile).toBe('robots');
  });

  it('a section or a Fleet Params sub-tab goes nowhere: it is only ever the current view', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    expect(trail()[3]?.go).toBeUndefined();
    useUIStore.setState({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneB' });
    expect(trail()).toHaveLength(4);
    expect(trail()[3]?.go).toBeUndefined();
    useUIStore.setState({ activeHubTile: 'audioRig', fleetParamsSection: 'world', fleetParamsSubsection: 'quality' });
    expect(trail()).toHaveLength(4);
    expect(trail()[3]?.go).toBeUndefined();
  });

  it("World is an ancestor now, going to World's first sub-tab, Pacing", () => {
    useUIStore.setState({ activeHubTile: 'audioRig', fleetParamsSection: 'world', fleetParamsSubsection: 'quality' });
    go(2);
    expect(ui()).toMatchObject({ activeHubTile: 'audioRig', fleetParamsSection: 'world', fleetParamsSubsection: null });
    expect(trail().map((segment) => segment.label)[3]).toBe(CONTENT['fleet.pacing'].human);
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 15: the Fleet Params screen's sub-tabs, read by the screen and the
// breadcrumb alike, so the two always name the same tab.
describe('FLEET_PARAMS_SUBSECTIONS and activeFleetParamsSubsection', () => {
  const ids = (group: FleetParamsGroup) => FLEET_PARAMS_SUBSECTIONS[group].map((sub) => sub.id);

  it('lists each group\'s sub-tabs in the sketch\'s order; World holds Pacing then Settings', () => {
    expect(ids('world')).toEqual(['pacing', 'quality']);
    expect(ids('lfoBank')).toEqual(['laneA', 'laneB', 'laneC', 'laneD']);
    expect(ids('eqFilters')).toEqual(['eq3', 'filterHPF', 'filterLPF']);
    expect(ids('timeSpace')).toEqual(['reverb', 'delay']);
    expect(ids('colour')).toEqual(['distortion', 'chebyshev', 'bitCrusher']);
    expect(ids('modulation')).toEqual(['autoWah', 'phaser', 'chorus', 'tremolo', 'vibrato', 'frequencyShifter']);
    expect(ids('output')).toEqual(['compressor', 'stereoWidener', 'limiter']);
  });

  // Spec amendment 2026-10-21 (plan T17.1): the Room sub-tab is gone. A 'colourRoom' still in the (unpersisted) UI store
  // from before the change reads as Colour's first tab, the stale-value rule.
  it('a leftover Room sub-tab opens Colour on Distortion', () => {
    const stale = 'colourRoom' as SelectedFleetParamsEffect;
    expect(activeFleetParamsSubsection('colour', stale)).toBe('distortion');
    expect(FLEET_PARAMS_SUBSECTIONS.colour.map((sub) => sub.id as string)).not.toContain('colourRoom');
  });

  it('puts the seven groups in the tab order: World, LFOs, EQ & Filters, Time & Space, Color, Modulation, Output', () => {
    const order = ['world', 'lfoBank', 'eqFilters', 'timeSpace', 'colour', 'modulation', 'output'];
    expect(Object.keys(FLEET_PARAMS_SUBSECTIONS)).toEqual(order);
    expect(Object.keys(FLEET_PARAMS_GROUP_CONTENT)).toEqual(order);
  });

  it('names the World group from fleet.world, and its sub-tabs from Pacing\'s and Settings\' own entries', () => {
    expect(FLEET_PARAMS_GROUP_CONTENT.world).toBe('fleet.world');
    expect(FLEET_PARAMS_SUBSECTIONS.world.map((sub) => sub.content)).toEqual(['fleet.pacing', 'fleet.quality']);
  });

  it('every group has a sub-tab row: none is a single panel', () => {
    for (const group of Object.keys(FLEET_PARAMS_SUBSECTIONS) as FleetParamsGroup[]) {
      expect(ids(group).length, group).toBeGreaterThan(0);
    }
  });

  it('names the Colour group from fleet.colour', () => {
    expect(FLEET_PARAMS_GROUP_CONTENT.colour).toBe('fleet.colour');
  });

  it('names the Modulation group from fleet.modulation', () => {
    expect(FLEET_PARAMS_GROUP_CONTENT.modulation).toBe('fleet.modulation');
  });

  it('names each sub-tab with the concept its panel is built from', () => {
    const lanes = FLEET_PARAMS_SUBSECTIONS.lfoBank.map((sub) => sub.content);
    expect(lanes).toEqual([LFO_BANK_LANE_CONTENT.a, LFO_BANK_LANE_CONTENT.b, LFO_BANK_LANE_CONTENT.c, LFO_BANK_LANE_CONTENT.d]);
    // The effect panels' headings come from the same entries (worn by each effect's first box).
    for (const group of ['eqFilters', 'timeSpace', 'colour', 'modulation', 'output'] as const) {
      for (const sub of FLEET_PARAMS_SUBSECTIONS[group]) {
        const block = AUDIO_RIG_CONFIG.find((b) => b.key === (sub.id as AudioRigEffectKey));
        expect(block, sub.id).toBeDefined();
        const { loreLabel, humanLabel } = labels(sub.content, { surface: 'heading' });
        const heading = block!.boxes[0].schema;
        expect({ loreLabel: heading.loreLabel, humanLabel: heading.humanLabel }, sub.id).toEqual({ loreLabel, humanLabel });
      }
    }
  });

  // Blocks a plan adds ahead of the group that shows them, each exempt only while no group lists it
  // (the content guard's AWAITING_CONSUMER shape). Empty between plans: Global Modulation T9 added the
  // AutoWah and Phaser blocks here and T10's Modulation group took them in.
  const AWAITING_GROUP: readonly string[] = [];

  it('covers every effect block once, in exactly one group', () => {
    const all = (Object.keys(FLEET_PARAMS_SUBSECTIONS) as FleetParamsGroup[]).flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
    for (const block of AUDIO_RIG_CONFIG) {
      if (AWAITING_GROUP.includes(block.key)) continue;
      expect(all, block.key).toContain(block.key);
    }
  });

  it('every block awaiting a group exists and is still in none (remove it once a group lists it)', () => {
    const all = (Object.keys(FLEET_PARAMS_SUBSECTIONS) as FleetParamsGroup[]).flatMap(ids);
    expect(AWAITING_GROUP.filter((key) => !AUDIO_RIG_CONFIG.some((b) => b.key === key)), 'missing from AUDIO_RIG_CONFIG').toEqual([]);
    expect(AWAITING_GROUP.filter((key) => (all as string[]).includes(key)), 'now in a group, remove from AWAITING_GROUP').toEqual([]);
  });

  it.each<[FleetParamsGroup, BreadcrumbState['fleetParamsSubsection'], BreadcrumbState['fleetParamsSubsection']]>([
    ['lfoBank', null, 'laneA'],
    ['lfoBank', 'laneC', 'laneC'],
    ['eqFilters', null, 'eq3'],
    ['eqFilters', 'filterLPF', 'filterLPF'],
    ['timeSpace', 'delay', 'delay'],
    ['colour', null, 'distortion'],
    ['colour', 'bitCrusher', 'bitCrusher'],
    ['colour', 'laneC', 'distortion'],
    ['modulation', null, 'autoWah'],
    ['modulation', 'phaser', 'phaser'],
    ['modulation', 'distortion', 'autoWah'],
    ['modulation', 'vibrato', 'vibrato'],
    ['modulation', 'frequencyShifter', 'frequencyShifter'],
    ['modulation', 'stereoWidener', 'autoWah'],
    ['output', 'limiter', 'limiter'],
    ['output', 'stereoWidener', 'stereoWidener'],
    ['output', 'chorus', 'compressor'],
    // Not this group's: its first, as SectionTabs falls back for a stale value.
    ['output', 'laneC', 'compressor'],
    ['lfoBank', 'reverb', 'laneA'],
    ['eqFilters', 'tempo', 'eq3'],
    // World: Pacing when nothing, or something not World's, is stored.
    ['world', null, 'pacing'],
    ['world', 'quality', 'quality'],
    ['world', 'pacing', 'pacing'],
    ['world', 'tempo', 'pacing'],
    ['world', 'laneB', 'pacing'],
    ['world', 'compressor', 'pacing'],
    ['lfoBank', 'quality', 'laneA'],
    ['output', 'pacing', 'compressor'],
  ])('on %s with %s stored, the open sub-tab is %s', (section, stored, expected) => {
    expect(activeFleetParamsSubsection(section, stored)).toBe(expected);
  });
});
