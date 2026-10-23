import { Profiler } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { NavBreadcrumb } from './NavBreadcrumb';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore, type UIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { CONTENT } from '@/content';
import type { Robot } from '@/types/Robot';
import type { Company } from '@/types/Company';
import type { Locale } from '@/types/locale';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 8 (spec §1.2): the breadcrumb reads navActions.breadcrumbTrail — the
 * one place the path is derived — and renders as a well. Every ancestor is a button that calls navActions;
 * the last segment is the current view, plain text. Desk: a well at the content surface's bottom-left
 * corner. Phone: inside PhoneBar's well (`inBar`), never on its own.
 */

const localeId = getActiveLocaleId();
const realMatchMedia = window.matchMedia;

const ROOT = CONTENT['nav.root'].human;
const PROBES = CONTENT['probe.root'].human;
const COMPANIES = CONTENT['company.root'].human;
const FLEET = CONTENT['fleet.root'].human;
const LFO_BANK = CONTENT['fleet.lfoBank'].human;
const LANE_B = CONTENT['fleet.lfoBank.laneB'].human;
const COMPOSITION = CONTENT['probe.composition'].human;
const SOURCE = CONTENT['probe.source'].human;

/** useShell's one min-width query: `desk` decides whether it matches. */
function stubShell(desk: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduced-motion') ? false : desk,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function makeRobot(id: string, name?: string): Robot {
  return { id, name, batteryLevel: 100, audioMode: 'none' } as unknown as Robot;
}

function setRoster(robots: Robot[], companies: Partial<Company>[] = []) {
  useLocaleStore.getState().setLocaleData(localeId, { robots, companies } as unknown as Partial<Locale>);
}

function setNav(state: Partial<UIStore>) {
  useUIStore.setState(state);
}

const crumb = () => screen.getByRole('navigation', { name: CONTENT['nav.breadcrumb'].human });

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  setRoster([makeRobot('r1', 'Tidal Wisp'), makeRobot('r2')], [{ id: 'c1', name: 'Rust Syndicate' }]);
  stubShell(true);
});
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
});

describe('NavBreadcrumb — the path, from navActions', () => {
  it('renders nothing on the Deck', () => {
    const { container } = render(<NavBreadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it('reads Root / Fleet Params / LFO Bank / <lane> with a lane selected', () => {
    setNav({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneB' });
    render(<NavBreadcrumb />);
    expect(crumb().textContent).toBe(`${ROOT} / ${FLEET} / ${LFO_BANK} / ${LANE_B}`);
  });

  it('follows the Fleet Params tabs as they change', () => {
    setNav({ activeHubTile: 'audioRig' });
    render(<NavBreadcrumb />);
    act(() => useUIStore.getState().setFleetParamsSection('timeSpace'));
    expect(crumb().textContent).toBe(`${ROOT} / ${FLEET} / ${CONTENT['fleet.timeSpace'].human} / ${CONTENT['fleet.reverb'].human}`);
    act(() => useUIStore.getState().setFleetParamsSubsection('delay'));
    expect(crumb().textContent).toBe(`${ROOT} / ${FLEET} / ${CONTENT['fleet.timeSpace'].human} / ${CONTENT['fleet.delay'].human}`);
  });

  it('reads Colour and its effects: Colour opens on Distortion, then follows the sub-tab', () => {
    setNav({ activeHubTile: 'audioRig' });
    render(<NavBreadcrumb />);
    act(() => useUIStore.getState().setFleetParamsSection('colour'));
    expect(crumb().textContent).toBe(`${ROOT} / ${FLEET} / ${CONTENT['fleet.colour'].human} / ${CONTENT['fleet.distortion'].human}`);
    act(() => useUIStore.getState().setFleetParamsSubsection('bitCrusher'));
    expect(crumb().textContent).toBe(`${ROOT} / ${FLEET} / ${CONTENT['fleet.colour'].human} / ${CONTENT['fleet.bitCrusher'].human}`);
  });

  it('reads Modulation and its pedals: Modulation opens on Auto Wah, then follows the sub-tab', () => {
    setNav({ activeHubTile: 'audioRig' });
    render(<NavBreadcrumb />);
    act(() => useUIStore.getState().setFleetParamsSection('modulation'));
    expect(crumb().textContent).toBe(`${ROOT} / ${FLEET} / ${CONTENT['fleet.modulation'].human} / ${CONTENT['fleet.autoWah'].human}`);
    act(() => useUIStore.getState().setFleetParamsSubsection('phaser'));
    expect(crumb().textContent).toBe(`${ROOT} / ${FLEET} / ${CONTENT['fleet.modulation'].human} / ${CONTENT['fleet.phaser'].human}`);
  });

  it('reads a robot by its name, with its section', () => {
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    render(<NavBreadcrumb />);
    expect(crumb().textContent).toBe(`${ROOT} / ${PROBES} / Tidal Wisp / ${COMPOSITION}`);
  });

  it('reads a company by its name', () => {
    setNav({ activeHubTile: 'companies', selectedCompanyId: 'c1' });
    render(<NavBreadcrumb />);
    expect(crumb().textContent).toBe(`${ROOT} / ${COMPANIES} / Rust Syndicate / ${SOURCE}`);
  });

  it('follows the store: a rename shows at once, and going home empties it', () => {
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    const { container } = render(<NavBreadcrumb />);
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { name: 'Brine Moth' }));
    expect(crumb().textContent).toBe(`${ROOT} / ${PROBES} / Brine Moth / ${SOURCE}`);
    act(() => useUIStore.getState().setActiveHubTile(null));
    expect(container.firstChild).toBeNull();
  });

  // updateRobot replaces the robots array on every battery tick and swell; the breadcrumb only shows names.
  it('does not re-render on a robot change it does not show (a battery tick)', () => {
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    let renders = 0;
    render(
      <Profiler id="crumb" onRender={() => renders++}>
        <NavBreadcrumb />
      </Profiler>,
    );
    const before = renders;
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { batteryLevel: 40 }));
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { batteryLevel: 30 }));
    expect(renders).toBe(before);
  });
});

describe('NavBreadcrumb — every ancestor is a button that calls navActions; the current view is text', () => {
  const buttons = () => Array.from(crumb().querySelectorAll('button')).map((b) => b.textContent);

  it('Fleet Params / LFO Bank / <lane>: Root, Fleet Params and LFO Bank are buttons, the lane is text', () => {
    setNav({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneB' });
    render(<NavBreadcrumb />);
    expect(buttons()).toEqual([ROOT, FLEET, LFO_BANK]);
    expect(screen.getByText(LANE_B).tagName).toBe('SPAN');
  });

  it('Fleet Params / Pacing: Pacing has no sub-tab, so it is the current view, as text', () => {
    setNav({ activeHubTile: 'audioRig', fleetParamsSection: 'pacing' });
    render(<NavBreadcrumb />);
    expect(buttons()).toEqual([ROOT, FLEET]);
    expect(screen.getByText(CONTENT['fleet.pacing'].human).tagName).toBe('SPAN');
  });

  it("the group goes to the group's first sub-tab", () => {
    setNav({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneB' });
    render(<NavBreadcrumb />);
    fireEvent.click(screen.getByRole('button', { name: LFO_BANK }));
    expect(useUIStore.getState().fleetParamsSection).toBe('lfoBank');
    expect(useUIStore.getState().fleetParamsSubsection).toBeNull();
    expect(crumb().textContent).toBe(`${ROOT} / ${FLEET} / ${LFO_BANK} / ${CONTENT['fleet.lfoBank.laneA'].human}`);
  });

  it('a bare branch: Root is the only button', () => {
    setNav({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes' });
    render(<NavBreadcrumb />);
    expect(buttons()).toEqual([ROOT]);
  });

  it('Root goes home', () => {
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    render(<NavBreadcrumb />);
    fireEvent.click(screen.getByRole('button', { name: ROOT }));
    expect(useUIStore.getState().activeHubTile).toBeNull();
    expect(useUIStore.getState().selectedRobotId).toBeNull();
  });

  it('the branch goes to its own page, Probes with its list open', () => {
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    render(<NavBreadcrumb />);
    fireEvent.click(screen.getByRole('button', { name: PROBES }));
    expect(useUIStore.getState().activeHubTile).toBe('robots');
    expect(useUIStore.getState().selectedRobotId).toBeNull();
    expect(useUIStore.getState().expandedTopLevelBranch).toBe('probes');
  });

  it('Fleet Params goes back to its default tab', () => {
    setNav({ activeHubTile: 'audioRig', fleetParamsSection: 'timeSpace', fleetParamsSubsection: 'delay' });
    render(<NavBreadcrumb />);
    fireEvent.click(screen.getByRole('button', { name: FLEET }));
    expect(useUIStore.getState().activeHubTile).toBe('audioRig');
    expect(useUIStore.getState().fleetParamsSection).toBe('lfoBank');
    expect(useUIStore.getState().fleetParamsSubsection).toBeNull();
    expect(crumb().textContent).toBe(`${ROOT} / ${FLEET} / ${LFO_BANK} / ${CONTENT['fleet.lfoBank.laneA'].human}`);
  });

  // Task 16: the robot screen always has a tab open (Source when none is stored), so going back to the
  // robot lands on that tab, and the robot stays a button.
  it('a robot under a section goes back to the robot, on its default tab', () => {
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    render(<NavBreadcrumb />);
    fireEvent.click(screen.getByRole('button', { name: 'Tidal Wisp' }));
    expect(useUIStore.getState().selectedRobotId).toBe('r1');
    expect(useUIStore.getState().selectedSection).toBeNull();
    expect(crumb().textContent).toBe(`${ROOT} / ${PROBES} / Tidal Wisp / ${SOURCE}`);
    expect(buttons()).toEqual([ROOT, PROBES, 'Tidal Wisp']);
    expect(screen.getByText(SOURCE).getAttribute('aria-current')).toBe('page');
  });

  it('a company under a section goes back to the company', () => {
    setNav({ activeHubTile: 'companies', selectedCompanyId: 'c1', selectedSection: 'envelope' });
    render(<NavBreadcrumb />);
    fireEvent.click(screen.getByRole('button', { name: 'Rust Syndicate' }));
    expect(useUIStore.getState().selectedCompanyId).toBe('c1');
    expect(useUIStore.getState().selectedSection).toBeNull();
  });

  it('the current view is marked as the current location', () => {
    setNav({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneB' });
    render(<NavBreadcrumb />);
    expect(screen.getByText(LANE_B).getAttribute('aria-current')).toBe('page');
  });
});

describe('NavBreadcrumb — where it renders, by shell', () => {
  it('on the phone shell it renders nothing on its own: the bar carries it', () => {
    stubShell(false);
    setNav({ activeHubTile: 'audioRig' });
    const { container } = render(<NavBreadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  // Crawford, 2026-10-10: the bar's well is narrow, so the phone crumb drops Root (the menu's Deck box
  // is the way home there); if a long trail still overflows, the ellipsis is accepted.
  it('inBar it renders on the phone shell, as the bar variant, without Root', () => {
    stubShell(false);
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    render(<NavBreadcrumb inBar />);
    expect(crumb().classList.contains('nav-breadcrumb--bar')).toBe(true);
    expect(crumb().textContent).toBe(`${PROBES} / Tidal Wisp / ${SOURCE}`);
    expect(screen.queryByRole('button', { name: ROOT })).toBeNull();
  });

  it('inBar the remaining ancestors are still buttons, and the first segment has no separator before it', () => {
    stubShell(false);
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    render(<NavBreadcrumb inBar />);
    expect(crumb().firstElementChild!.querySelector('.nav-breadcrumb__sep')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: PROBES }));
    expect(useUIStore.getState().selectedRobotId).toBeNull();
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });

  it('inBar on a bare branch it is the branch alone, as the current page, with no buttons', () => {
    stubShell(false);
    setNav({ activeHubTile: 'robots' });
    render(<NavBreadcrumb inBar />);
    expect(crumb().textContent).toBe(PROBES);
    expect(crumb().querySelector('[aria-current="page"]')!.textContent).toBe(PROBES);
    expect(crumb().querySelectorAll('button')).toHaveLength(0);
  });

  it('the desk well keeps Root', () => {
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    render(<NavBreadcrumb />);
    expect(crumb().textContent).toBe(`${ROOT} / ${PROBES} / Tidal Wisp / ${SOURCE}`);
  });

  it('inBar still renders nothing on the Deck', () => {
    stubShell(false);
    const { container } = render(<NavBreadcrumb inBar />);
    expect(container.firstChild).toBeNull();
  });

  it('on the desk shell it is the positioned well, not the bar variant', () => {
    setNav({ activeHubTile: 'settings' });
    render(<NavBreadcrumb />);
    expect(crumb().classList.contains('nav-breadcrumb--bar')).toBe(false);
  });
});
