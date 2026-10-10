import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

import { NavPanel } from './NavPanel';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { SCREEN_VIEWPORT_ID } from '@/utils/helpers';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import { labels, type ContentKey } from '@/content';
import type { HubTile } from '@/types/hub';
import type { Robot } from '@/types/Robot';
import type { Company } from '@/types/Company';
import type { Locale } from '@/types/locale';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 4 (spec §1.2): one panel of five parent boxes that expands in place
 * for Probes and Companies. CabinetBox is stubbed to expose `popped`; gsap is stubbed to record each
 * call and apply custom properties to their target at once, so the expand factor the width timeline
 * writes on #screen-viewport is readable from the DOM.
 */

vi.mock('@/components/ui/controls/CabinetBox', () => ({
  CabinetBox: ({ popped, timelineKey, children }: { popped: boolean | number; timelineKey: string; children?: React.ReactNode }) => (
    <div data-testid="cabinet-box" data-popped={String(popped)} data-timeline-key={timelineKey}>
      {children}
    </div>
  ),
}));
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

const gsapLog = vi.hoisted(() => ({ calls: [] as { kind: 'set' | 'to'; vars: Record<string, unknown> }[] }));
vi.mock('gsap', () => {
  const applyCustomProperties = (target: unknown, vars: Record<string, unknown>) => {
    if (!(target instanceof HTMLElement)) return;
    for (const [key, value] of Object.entries(vars)) {
      if (key.startsWith('--')) target.style.setProperty(key, String(value));
    }
  };
  const timeline = () => {
    const tl = {
      to: (target: unknown, vars: Record<string, unknown>) => {
        gsapLog.calls.push({ kind: 'to', vars });
        applyCustomProperties(target, vars);
        return tl;
      },
      kill: () => {},
    };
    return tl;
  };
  return {
    default: {
      timeline: vi.fn(timeline),
      set: vi.fn((target: unknown, vars: Record<string, unknown>) => {
        gsapLog.calls.push({ kind: 'set', vars });
        applyCustomProperties(target, vars);
      }),
    },
  };
});

/** useShell's desk query (min-width) and prefers-reduced-motion, each controllable. */
function stubMatchMedia({ desk, reducedMotion = false }: { desk: boolean; reducedMotion?: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduced-motion') ? reducedMotion : desk,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

const realMatchMedia = window.matchMedia;
const localeId = getActiveLocaleId();
const human = (key: ContentKey) => labels(key).humanLabel;
const BOX_ORDER: ContentKey[] = ['nav.home', 'fleet.root', 'probe.root', 'company.root', 'settings.root'];

function seedRoster() {
  useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
  useLocaleStore.getState().addRobot(localeId, { id: 'r1', name: 'Tidal Wisp', identityColor: '#ae5378' } as unknown as Robot);
  useLocaleStore.getState().addRobot(localeId, { id: 'r2', name: 'Glass Drifter', identityColor: '#e8e4d8' } as unknown as Robot);
  useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Rust Syndicate', color: '#ae5378', robotIds: [] } as Company);
}

function renderPanel() {
  return render(
    <main id={SCREEN_VIEWPORT_ID}>
      <NavPanel />
    </main>,
  );
}

const nav = () => screen.getByRole('navigation', { name: human('nav.toggle') });
const box = (key: ContentKey) => within(nav()).getByRole('button', { name: human(key) });
const poppedOf = (button: HTMLElement) => within(button).getByTestId('cabinet-box').getAttribute('data-popped');
const expandFactor = () => document.getElementById(SCREEN_VIEWPORT_ID)!.style.getPropertyValue('--nav-panel-expand');
const entityList = () => nav().querySelector('.nav-entity-list');

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  seedRoster();
  gsapLog.calls.length = 0;
  vi.clearAllMocks();
  stubMatchMedia({ desk: true });
});
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
});

describe('NavPanel — five parent boxes (desk)', () => {
  it('is a navigation landmark holding the five boxes in the sketch order, named from the content layer', () => {
    renderPanel();
    const names = within(nav()).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(BOX_ORDER.map(human));
  });

  it("shows each box's lore label with its human label", () => {
    renderPanel();
    for (const key of BOX_ORDER) {
      const { loreLabel, humanLabel } = labels(key);
      expect(loreLabel).toBeTruthy();
      expect(box(key).textContent).toContain(loreLabel);
      expect(box(key).textContent).toContain(humanLabel);
    }
  });

  it("keeps the panel's static popped facade around the boxes", () => {
    renderPanel();
    const facade = within(nav())
      .getAllByTestId('cabinet-box')
      .find((el) => el.getAttribute('data-timeline-key') === 'cabinet-nav-panel-facade');
    expect(facade?.getAttribute('data-popped')).toBe('true');
    expect(within(facade!).getAllByRole('button')).toHaveLength(BOX_ORDER.length);
  });

  it.each([
    [null, 'nav.home'],
    ['audioRig', 'fleet.root'],
    ['robots', 'probe.root'],
    ['companies', 'company.root'],
    ['settings', 'settings.root'],
  ] as [HubTile | null, ContentKey][])('with tile %s open, only the %s box is popped and marked current', (tile, activeKey) => {
    useUIStore.setState({ activeHubTile: tile });
    renderPanel();
    for (const key of BOX_ORDER) {
      const isActive = key === activeKey;
      expect(poppedOf(box(key)) === 'true').toBe(isActive);
      expect(box(key).getAttribute('aria-current')).toBe(isActive ? 'true' : null);
    }
  });

  it.each([
    ['fleet.root', 'audioRig'],
    ['probe.root', 'robots'],
    ['company.root', 'companies'],
    ['settings.root', 'settings'],
  ] as [ContentKey, HubTile][])('clicking %s opens the %s tile and pops its box', (key, tile) => {
    renderPanel();
    fireEvent.click(box(key));
    expect(useUIStore.getState().activeHubTile).toBe(tile);
    expect(poppedOf(box(key))).toBe('true');
    expect(poppedOf(box('nav.home'))).not.toBe('true');
  });

  it('clicking Deck goes home: no tile, nothing expanded, no entity', () => {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes', selectedRobotId: 'r1' });
    renderPanel();
    fireEvent.click(box('nav.home'));
    expect(useUIStore.getState()).toMatchObject({ activeHubTile: null, expandedTopLevelBranch: null, selectedRobotId: null });
  });

  it('picking a parent clears the entity, Probes included (navActions, Crawford 2026-10-09)', () => {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes', selectedRobotId: 'r1' });
    renderPanel();
    fireEvent.click(box('probe.root'));
    expect(useUIStore.getState().selectedRobotId).toBeNull();
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });

  it('a resting box pops while hovered, focused or pressed, and returns to rest after; the active box stays popped', () => {
    renderPanel();
    const settings = box('settings.root');
    const rest = poppedOf(settings);
    expect(rest).not.toBe('true');

    fireEvent.mouseEnter(settings);
    expect(poppedOf(settings)).toBe('true');
    fireEvent.mouseLeave(settings);
    expect(poppedOf(settings)).toBe(rest);

    fireEvent.focus(settings);
    expect(poppedOf(settings)).toBe('true');
    fireEvent.blur(settings);
    expect(poppedOf(settings)).toBe(rest);

    fireEvent.pointerDown(settings);
    expect(poppedOf(settings)).toBe('true');
    fireEvent.pointerUp(settings);
    expect(poppedOf(settings)).toBe(rest);

    const deck = box('nav.home');
    fireEvent.mouseEnter(deck);
    fireEvent.mouseLeave(deck);
    expect(poppedOf(deck)).toBe('true');
  });
});

describe('NavPanel — Probes and Companies expand in place (desk)', () => {
  it.each([
    ['probe.root', 'probe.all'],
    ['company.root', 'nav.entity.newCompany'],
  ] as [ContentKey, ContentKey][])('selecting %s lists its entities under its own box, %s first, and sets the wide value', (key, firstEntity) => {
    renderPanel();
    expect(expandFactor()).toBe('0');

    fireEvent.click(box(key));

    const list = box(key).closest('li')!.querySelector<HTMLElement>('.nav-entity-list');
    expect(list).not.toBeNull();
    expect(within(list!).getAllByRole('button')[0].getAttribute('aria-label')).toBe(human(firstEntity));
    expect(expandFactor()).toBe('1');
  });

  it.each(['nav.home', 'fleet.root', 'settings.root'] as ContentKey[])('selecting %s lists nothing and returns to the rest value', (key) => {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes' });
    renderPanel();
    expect(expandFactor()).toBe('1');

    fireEvent.click(box(key));

    expect(entityList()).toBeNull();
    expect(expandFactor()).toBe('0');
  });

  it('switching straight from Probes to Companies swaps the list and stays wide', () => {
    renderPanel();
    fireEvent.click(box('probe.root'));
    fireEvent.click(box('company.root'));
    expect(nav().querySelectorAll('.nav-entity-list')).toHaveLength(1);
    expect(box('company.root').closest('li')!.querySelector('.nav-entity-list')).not.toBeNull();
    expect(expandFactor()).toBe('1');
  });

  it('a robot picked in the world (the tile opened without the expanded-branch field) still widens and lists', () => {
    renderPanel();
    act(() => {
      useUIStore.getState().selectRobot('r1');
      useUIStore.getState().setActiveHubTile('robots');
    });
    expect(useUIStore.getState().expandedTopLevelBranch).toBeNull();
    expect(box('probe.root').closest('li')!.querySelector('.nav-entity-list')).not.toBeNull();
    expect(expandFactor()).toBe('1');
  });

  it('mounting with a branch already open sets the wide value at once, without a tween', () => {
    useUIStore.setState({ activeHubTile: 'companies', expandedTopLevelBranch: 'companies' });
    renderPanel();
    expect(expandFactor()).toBe('1');
    expect(gsapLog.calls.map((c) => c.kind)).toEqual(['set']);
    expect(setTimeline).not.toHaveBeenCalled();
  });

  it('widening and narrowing each run the nav-panel-width timeline with a nonzero duration', () => {
    renderPanel();
    gsapLog.calls.length = 0;

    fireEvent.click(box('probe.root'));
    expect(setTimeline).toHaveBeenLastCalledWith('nav-panel-width', expect.anything());
    expect(gsapLog.calls.at(-1)).toMatchObject({ kind: 'to', vars: { '--nav-panel-expand': 1 } });
    expect(gsapLog.calls.at(-1)!.vars.duration).toBeGreaterThan(0);

    fireEvent.click(box('settings.root'));
    expect(setTimeline).toHaveBeenCalledTimes(2);
    expect(gsapLog.calls.at(-1)).toMatchObject({ kind: 'to', vars: { '--nav-panel-expand': 0 } });
    expect(gsapLog.calls.at(-1)!.vars.duration).toBeGreaterThan(0);
  });

  it('kills the previous width timeline before starting the next', () => {
    renderPanel();
    fireEvent.click(box('probe.root'));
    vi.mocked(killTimeline).mockClear();
    fireEvent.click(box('settings.root'));
    expect(killTimeline).toHaveBeenCalledWith('nav-panel-width');
    expect(vi.mocked(killTimeline).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(setTimeline).mock.invocationCallOrder.at(-1)!);
  });

  it('moving between two leaves (no width change) starts no timeline', () => {
    useUIStore.setState({ activeHubTile: 'audioRig' });
    renderPanel();
    fireEvent.click(box('settings.root'));
    expect(setTimeline).not.toHaveBeenCalled();
  });

  it('under reduced motion the width changes at once and no timeline runs', () => {
    stubMatchMedia({ desk: true, reducedMotion: true });
    renderPanel();
    fireEvent.click(box('probe.root'));
    expect(expandFactor()).toBe('1');
    expect(setTimeline).not.toHaveBeenCalled();
    expect(gsapLog.calls.every((c) => c.kind === 'set')).toBe(true);
  });

  it('unmounting kills the width timeline and takes the expand factor off the viewport', () => {
    const viewport = document.body.appendChild(Object.assign(document.createElement('main'), { id: SCREEN_VIEWPORT_ID }));
    const { unmount } = render(<NavPanel />, { container: viewport });
    fireEvent.click(box('probe.root'));
    expect(viewport.style.getPropertyValue('--nav-panel-expand')).toBe('1');
    vi.mocked(killTimeline).mockClear();

    unmount();

    expect(killTimeline).toHaveBeenCalledWith('nav-panel-width');
    expect(viewport.style.getPropertyValue('--nav-panel-expand')).toBe('');
    viewport.remove();
  });

  it('renders and switches branches with no screen viewport in the document, writing nothing', () => {
    render(<NavPanel />);
    fireEvent.click(box('probe.root'));
    expect(entityList()).not.toBeNull();
    expect(gsapLog.calls).toHaveLength(0);
    expect(setTimeline).not.toHaveBeenCalled();
  });
});

describe('NavPanel — keyboard', () => {
  it('every box and entity is a native button in reading order, none taken out of the tab sequence', () => {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes' });
    renderPanel();
    const buttons = within(nav()).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      human('nav.home'),
      human('fleet.root'),
      human('probe.root'),
      human('probe.all'),
      'Tidal Wisp',
      'Glass Drifter',
      human('company.root'),
      human('settings.root'),
    ]);
    for (const b of buttons) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('tabindex')).toBeNull();
      expect((b as HTMLButtonElement).disabled).toBe(false);
    }
  });
});

describe('NavPanel — phone shell (interim until the sheet, Task 5)', () => {
  it('renders nothing while the nav is closed, and the same five boxes once it is open', () => {
    stubMatchMedia({ desk: false });
    renderPanel();
    expect(screen.queryByRole('navigation')).toBeNull();

    act(() => useUIStore.getState().setNavPanelOpen(true));

    expect(within(nav()).getAllByRole('button')).toHaveLength(BOX_ORDER.length);
  });

  it('the desk shell ignores isNavPanelOpen', () => {
    useUIStore.setState({ isNavPanelOpen: false });
    renderPanel();
    expect(nav()).toBeTruthy();
  });
});

describe('NavPanel.css — the width contract', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'NavPanel.css'), 'utf-8');

  it('derives --nav-panel-width on the screen viewport from the rest and wide sizes and the expand factor', () => {
    const body = getCssRuleBody(css, '#screen-viewport');
    expect(body).not.toBeNull();
    expect(body).toContain('--nav-panel-rest: 96px;');
    expect(body).toContain('--nav-panel-wide: 260px;');
    expect(body).toContain('--nav-panel-expand: 0;');
    expect(body).toContain(
      '--nav-panel-width: calc(var(--nav-panel-rest) + (var(--nav-panel-wide) - var(--nav-panel-rest)) * var(--nav-panel-expand));',
    );
  });

  it('sizes the panel from --nav-panel-width', () => {
    expect(getCssRuleBody(css, '.nav-panel')).toContain('width: var(--nav-panel-width);');
  });
});

describe('NavPanel reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 15)', () => {
  it('carries no copy literal of its own', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'NavPanel.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/>\s*[A-Z][a-z]+( [A-Za-z]+)*\s*</);
  });
});
