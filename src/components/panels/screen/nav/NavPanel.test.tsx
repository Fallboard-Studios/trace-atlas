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

  it('the list and the width follow expandedTopLevelBranch: the Probes tile with its list collapsed lists nothing, at rest', () => {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: null });
    renderPanel();
    expect(entityList()).toBeNull();
    expect(expandFactor()).toBe('0');
    expect(poppedOf(box('probe.root'))).toBe('true');
  });

  it('a stale expanded field for another branch lists nothing', () => {
    useUIStore.setState({ activeHubTile: 'audioRig', expandedTopLevelBranch: 'probes' });
    renderPanel();
    expect(entityList()).toBeNull();
    expect(expandFactor()).toBe('0');
  });

  // Crawford, 2026-10-09: "back, then collapse".
  it.each(['probe.root', 'company.root'] as ContentKey[])(
    'clicking the open %s box on its own page collapses the list to rest, and again reopens it',
    (key) => {
      renderPanel();
      fireEvent.click(box(key));
      expect(expandFactor()).toBe('1');

      fireEvent.click(box(key));
      expect(entityList()).toBeNull();
      expect(expandFactor()).toBe('0');
      expect(poppedOf(box(key))).toBe('true');
      expect(setTimeline).toHaveBeenLastCalledWith('nav-panel-width', expect.anything());

      fireEvent.click(box(key));
      expect(box(key).closest('li')!.querySelector('.nav-entity-list')).not.toBeNull();
      expect(expandFactor()).toBe('1');
    },
  );

  it('on a robot, clicking Probes goes back to the Probes page with the list still open; the next click collapses', () => {
    renderPanel();
    fireEvent.click(box('probe.root'));
    fireEvent.click(within(entityList() as HTMLElement).getByRole('button', { name: 'Tidal Wisp' }));
    expect(useUIStore.getState().selectedRobotId).toBe('r1');

    fireEvent.click(box('probe.root'));
    expect(useUIStore.getState().selectedRobotId).toBeNull();
    expect(entityList()).not.toBeNull();
    expect(expandFactor()).toBe('1');

    fireEvent.click(box('probe.root'));
    expect(entityList()).toBeNull();
    expect(expandFactor()).toBe('0');
  });

  it('marks the open Probes / Companies box aria-expanded, and only that box', () => {
    renderPanel();
    expect(box('probe.root').getAttribute('aria-expanded')).toBe('false');
    expect(box('company.root').getAttribute('aria-expanded')).toBe('false');
    expect(box('fleet.root').getAttribute('aria-expanded')).toBeNull();
    expect(box('nav.home').getAttribute('aria-expanded')).toBeNull();

    fireEvent.click(box('probe.root'));
    expect(box('probe.root').getAttribute('aria-expanded')).toBe('true');
    expect(box('company.root').getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(box('probe.root'));
    expect(box('probe.root').getAttribute('aria-expanded')).toBe('false');
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

describe('NavPanel — the phone sheet (Task 5)', () => {
  const sheet = () => screen.getByRole('dialog', { name: human('nav.toggle') });
  const scrim = () => document.querySelector<HTMLElement>('.nav-sheet__scrim');
  /** Radix arms its outside-press listener a tick after the sheet opens. */
  const afterOpenTick = () => act(() => new Promise((r) => setTimeout(r, 0)));

  function openSheet(state: Partial<ReturnType<typeof useUIStore.getState>> = {}) {
    stubMatchMedia({ desk: false });
    useUIStore.setState({ isNavPanelOpen: true, ...state });
    return renderPanel();
  }

  it('on the phone shell the panel is not in the DOM until the sheet opens, then the same five boxes sit in a dialog', () => {
    stubMatchMedia({ desk: false });
    renderPanel();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(scrim()).toBeNull();

    act(() => useUIStore.getState().setNavPanelOpen(true));

    expect(sheet().contains(nav())).toBe(true);
    expect(within(nav()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(BOX_ORDER.map(human));
    expect(scrim()).not.toBeNull();
  });

  // Radix marks a modal by hiding everything else from assistive tech, not with aria-modal.
  it('is modal: while it is open everything outside it is hidden from assistive tech, and comes back on close', () => {
    stubMatchMedia({ desk: false });
    const outside = document.body.appendChild(document.createElement('div'));
    renderPanel();

    act(() => useUIStore.getState().setNavPanelOpen(true));
    expect(outside.getAttribute('aria-hidden')).toBe('true');
    expect(sheet().closest('[aria-hidden="true"]')).toBeNull();

    act(() => useUIStore.getState().setNavPanelOpen(false));
    expect(outside.getAttribute('aria-hidden')).toBeNull();
    outside.remove();
  });

  // UI Shell guardrail (CLAUDE.md): interactive UI lives inside ScreenViewport only — no portal to <body>.
  it('renders the sheet and its scrim inside the screen viewport', () => {
    openSheet();
    const viewport = document.getElementById(SCREEN_VIEWPORT_ID)!;
    expect(viewport.contains(sheet())).toBe(true);
    expect(viewport.contains(scrim())).toBe(true);
  });

  it('opens with the open branch expanded in place, as the desk panel shows it', () => {
    openSheet({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes' });
    expect(within(sheet()).getByRole('button', { name: 'Tidal Wisp' })).toBeTruthy();
  });

  it.each([
    ['nav.home', null],
    ['fleet.root', 'audioRig'],
    ['probe.root', 'robots'],
    ['company.root', 'companies'],
    ['settings.root', 'settings'],
  ] as [ContentKey, HubTile | null][])('picking %s opens it and closes the sheet', (key, tile) => {
    openSheet({ activeHubTile: key === 'nav.home' ? 'settings' : null });
    fireEvent.click(box(key));
    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
    expect(useUIStore.getState().activeHubTile).toBe(tile);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(scrim()).toBeNull();
  });

  it.each([
    ['Tidal Wisp', { selectedRobotId: 'r1' }, 'robots', 'probes'],
    [human('probe.all'), { allProbesSelected: true }, 'robots', 'probes'],
    ['Rust Syndicate', { selectedCompanyId: 'c1' }, 'companies', 'companies'],
  ] as const)('picking the entity %s selects it and closes the sheet', (name, selected, tile, branch) => {
    openSheet({ activeHubTile: tile, expandedTopLevelBranch: branch });
    fireEvent.click(within(sheet()).getByRole('button', { name }));
    expect(useUIStore.getState()).toMatchObject({ ...selected, isNavPanelOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('collapsing the open list in place is not a pick: the sheet stays open', () => {
    openSheet({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes' });
    fireEvent.click(box('probe.root'));
    expect(useUIStore.getState().expandedTopLevelBranch).toBeNull();
    expect(useUIStore.getState().isNavPanelOpen).toBe(true);
    expect(entityList()).toBeNull();
  });

  it('+ New Company opens its form in the sheet and is not a pick', () => {
    openSheet({ activeHubTile: 'companies', expandedTopLevelBranch: 'companies' });
    const newCompany = within(sheet()).getByRole('button', { name: human('nav.entity.newCompany') });
    fireEvent.click(newCompany);
    expect(newCompany.getAttribute('aria-expanded')).toBe('true');
    expect(useUIStore.getState().isNavPanelOpen).toBe(true);
  });

  it('moves focus into the sheet on open', () => {
    openSheet();
    expect(sheet().contains(document.activeElement)).toBe(true);
  });

  it('traps focus: Tab from the last box wraps to the first, Shift+Tab from the first to the last', () => {
    openSheet();
    const buttons = within(sheet()).getAllByRole('button');
    const [first, last] = [buttons[0], buttons.at(-1)!];

    act(() => last.focus());
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  // The menu that opens the sheet is PhoneBar's, not a Dialog.Trigger, and a modal Radix Dialog only
  // hands focus back to its own Trigger — so NavPanel returns it to whatever had it. Radix moves focus a
  // tick after the sheet unmounts.
  describe('focus goes back to what opened the sheet', () => {
    function openFrom(opener: HTMLElement) {
      stubMatchMedia({ desk: false });
      opener.focus();
      renderPanel();
      act(() => useUIStore.getState().setNavPanelOpen(true));
      expect(sheet().contains(document.activeElement)).toBe(true);
    }

    it('on Escape', async () => {
      const opener = document.body.appendChild(document.createElement('button'));
      openFrom(opener);

      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      await afterOpenTick();

      expect(useUIStore.getState().isNavPanelOpen).toBe(false);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(opener);
      opener.remove();
    });

    it('after a pick, whose box leaves with the sheet', async () => {
      const opener = document.body.appendChild(document.createElement('button'));
      openFrom(opener);

      fireEvent.click(box('settings.root'));
      await afterOpenTick();

      expect(document.activeElement).toBe(opener);
      opener.remove();
    });

    it('not when the opener has left the document meanwhile (no focus on a detached node, no throw)', async () => {
      const opener = document.body.appendChild(document.createElement('button'));
      openFrom(opener);
      opener.remove();

      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      await afterOpenTick();

      expect(useUIStore.getState().isNavPanelOpen).toBe(false);
      expect(document.activeElement).not.toBe(opener);
    });
  });

  it('closes on a press on the scrim, and only outside the sheet', async () => {
    openSheet();
    await afterOpenTick();

    fireEvent.pointerDown(box('settings.root'));
    expect(useUIStore.getState().isNavPanelOpen).toBe(true);

    fireEvent.pointerDown(scrim()!);
    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the desk shell renders no sheet and no scrim, whatever isNavPanelOpen says', () => {
    useUIStore.setState({ isNavPanelOpen: true });
    renderPanel();
    expect(nav()).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(scrim()).toBeNull();
  });
});

describe('NavPanel.css — the phone sheet', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'NavPanel.css'), 'utf-8');

  it('the sheet is 300 px on the left edge, between the top bar and the bottom bar, never under either', () => {
    const body = getCssRuleBody(css, '.nav-sheet');
    expect(body).not.toBeNull();
    for (const declaration of ['position: absolute;', 'left: 0;', 'bottom: var(--phone-bar-clearance);', 'width: min(var(--nav-sheet-width), 100%);']) {
      expect(body).toContain(declaration);
    }
    expect(getCssRuleBody(css, '#screen-viewport')).toContain('--nav-sheet-width: 300px;');
  });

  it('the scrim spans the same band, full width', () => {
    const body = getCssRuleBody(css, '.nav-sheet__scrim');
    expect(body).not.toBeNull();
    for (const declaration of ['position: absolute;', 'left: 0;', 'right: 0;', 'bottom: var(--phone-bar-clearance);']) {
      expect(body).toContain(declaration);
    }
  });

  it('the sheet and the scrim share one top edge: the top bar', () => {
    const top = (selector: string) => getCssRuleBody(css, selector)?.match(/(^|\s)top: ([^;]+);/)?.[2];
    expect(top('.nav-sheet')).toBeTruthy();
    expect(top('.nav-sheet')).toBe(top('.nav-sheet__scrim'));
  });

  it('inside the sheet the panel fills it instead of sizing itself from --nav-panel-width', () => {
    const body = getCssRuleBody(css, '.nav-sheet > .nav-panel');
    expect(body).toContain('position: static;');
    expect(body).toContain('width: 100%;');
    expect(body).toContain('height: 100%;');
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
