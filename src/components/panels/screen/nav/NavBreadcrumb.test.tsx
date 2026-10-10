import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Profiler } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { NavBreadcrumb } from './NavBreadcrumb';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore, type UIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
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

  it('reads a robot by its name, with its section', () => {
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'melody' });
    render(<NavBreadcrumb />);
    expect(crumb().textContent).toBe(`${ROOT} / ${PROBES} / Tidal Wisp / ${COMPOSITION}`);
  });

  it('reads a company by its name', () => {
    setNav({ activeHubTile: 'companies', selectedCompanyId: 'c1' });
    render(<NavBreadcrumb />);
    expect(crumb().textContent).toBe(`${ROOT} / ${COMPANIES} / Rust Syndicate`);
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

  it('inBar it renders on the phone shell, as the bar variant with the same buttons', () => {
    stubShell(false);
    setNav({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    render(<NavBreadcrumb inBar />);
    expect(crumb().classList.contains('nav-breadcrumb--bar')).toBe(true);
    expect(crumb().textContent).toBe(`${ROOT} / ${PROBES} / Tidal Wisp / ${SOURCE}`);
    fireEvent.click(screen.getByRole('button', { name: ROOT }));
    expect(useUIStore.getState().activeHubTile).toBeNull();
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

describe('NavBreadcrumb.css — a well at the content surface’s bottom-left corner', () => {
  const css = readFileSync(resolve(__dirname, 'NavBreadcrumb.css'), 'utf8');
  const paneCss = readFileSync(resolve(__dirname, '../console/ContentPane.css'), 'utf8');
  const declaration = (body: string | null, property: string) => body?.match(new RegExp(`(?:^|\\s)${property}:\\s*([^;]+);`))?.[1].trim();

  it('sits on the surface’s own left and bottom edges (the same expressions ContentPane.css uses)', () => {
    const crumbBody = getCssRuleBody(css, '.nav-breadcrumb');
    const paneBody = getCssRuleBody(paneCss, '.content-pane');
    expect(declaration(crumbBody, 'left')).toBeDefined();
    expect(declaration(crumbBody, 'left')).toBe(declaration(paneBody, 'left'));
    expect(declaration(crumbBody, 'bottom')).toBe(declaration(paneBody, 'bottom'));
  });

  it('is one line of the band height the surface keeps free for it, so no content sits under it', () => {
    const crumbBody = getCssRuleBody(css, '.nav-breadcrumb');
    expect(declaration(crumbBody, 'height')).toBe('var(--nav-breadcrumb-height)');
    expect(declaration(getCssRuleBody(css, '#screen-viewport'), '--nav-breadcrumb-height')).toBeDefined();
    expect(declaration(getCssRuleBody(paneCss, '.content-pane'), 'padding-bottom')).toBe('var(--nav-breadcrumb-height)');
    expect(declaration(getCssRuleBody(paneCss, "#screen-viewport[data-shell='phone'] .content-pane"), 'padding-bottom')).toBe('0');
    for (const d of ['white-space: nowrap;', 'overflow: hidden;', 'text-overflow: ellipsis;']) expect(crumbBody).toContain(d);
  });

  it('is a well: the shared well tokens, in the accent', () => {
    const crumbBody = getCssRuleBody(css, '.nav-breadcrumb');
    expect(crumbBody).toContain('background: var(--well-background);');
    expect(crumbBody).toContain('box-shadow: var(--well-inset), inset 0 0 8px var(--color-accent);');
    expect(crumbBody).toContain('border: 1px solid var(--color-accent);');
  });

  it('the bar variant drops the well and its place: it is inline text inside the bar’s own well', () => {
    const bar = getCssRuleBody(css, '.nav-breadcrumb--bar');
    for (const d of ['position: static;', 'display: inline;', 'border: 0;', 'box-shadow: none;', 'background: none;', 'padding: 0;']) expect(bar).toContain(d);
  });

  it('keeps the plain parts click-through and the buttons clickable', () => {
    expect(getCssRuleBody(css, '.nav-breadcrumb')).toContain('pointer-events: none;');
    expect(getCssRuleBody(css, '.nav-breadcrumb__segment--link')).toContain('pointer-events: auto;');
  });
});

describe('NavBreadcrumb reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 15)', () => {
  it('carries no copy literal of its own', () => {
    const source = readFileSync(resolve(__dirname, 'NavBreadcrumb.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/>\s*(Cancel|Link copied|Unable to copy)\s*</);
    expect(source).not.toMatch(/`(Saved|Collapse|Expand) $\{|failed to save\.|'CORRUPT NAME'|'NO TEMP'|Probes active\.|Viewing \{/);
  });
});
