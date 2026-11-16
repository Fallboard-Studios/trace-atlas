import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

import { NavPanel } from './NavPanel';
import { goHome, selectBranch, selectEntity } from './navActions';
import { ContentPane } from '../console/ContentPane';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { SCREEN_VIEWPORT_ID } from '@/utils/helpers';
import { setTimeline } from '@/animation/timelineMap';
import { labels, type ContentKey } from '@/content';
import type { HubTile } from '@/types/hub';
import type { Robot } from '@/types/Robot';
import type { Company } from '@/types/Company';
import type { Locale } from '@/types/locale';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 4 (spec §1.2): one panel of three parent boxes (docs/tasks/OFF_SCREEN_CONSOLE.md Task 14 took Settings
 * out, Task 18 Companies), at one width with no entity list (docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 13). CabinetBox is stubbed
 * to expose `popped`; gsap is stubbed to record each call and apply custom properties to their target at once, so a width written
 * on #screen-viewport would be readable from the DOM.
 */

vi.mock('@/components/ui/controls/CabinetBox', () => ({
  CabinetBox: ({ popped, timelineKey, children }: { popped: boolean | number; timelineKey: string; children?: React.ReactNode }) => (
    <div data-testid="cabinet-box" data-popped={String(popped)} data-timeline-key={timelineKey}>
      {children}
    </div>
  ),
}));
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));
// The plate's screen is not this file's concern; the Back / Close row above it is (backlog 75 Task 9).
vi.mock('../console/ConsolePanel', () => ({ ConsolePanel: () => <div className="console-panel" /> }));

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
const BOX_ORDER: ContentKey[] = ['nav.home', 'fleet.root', 'probe.root'];

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

describe('NavPanel — three parent boxes (desk)', () => {
  it('is a navigation landmark holding the three boxes in the sketch order, named from the content layer: Deck, Fleet Params, Probes, and no Settings or Companies', () => {
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
  ] as [ContentKey, HubTile][])('clicking %s opens the %s tile and pops its box', (key, tile) => {
    renderPanel();
    fireEvent.click(box(key));
    expect(useUIStore.getState().activeHubTile).toBe(tile);
    expect(poppedOf(box(key))).toBe('true');
    expect(poppedOf(box('nav.home'))).not.toBe('true');
  });

  it('clicking Deck goes home: no tile, no entity', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    renderPanel();
    fireEvent.click(box('nav.home'));
    expect(useUIStore.getState()).toMatchObject({ activeHubTile: null, selectedRobotId: null });
  });

  it('picking a parent clears the entity, Probes included (navActions, Crawford 2026-10-09)', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    renderPanel();
    fireEvent.click(box('probe.root'));
    expect(useUIStore.getState().selectedRobotId).toBeNull();
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });

  // docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 13 (spec §1.7): the rail has one width and no list, so every box
  // is selectBranch, and the Probes box on the Probes list has nothing left to toggle.
  it('pressing Probes on the Probes list changes nothing, the trail included', () => {
    selectBranch('fleetParams');
    selectBranch('probes');
    renderPanel();
    const before = useUIStore.getState();
    expect(before.navTrail).toHaveLength(2);

    fireEvent.click(box('probe.root'));
    expect(useUIStore.getState()).toEqual(before);
    fireEvent.click(box('probe.root'));
    expect(useUIStore.getState()).toEqual(before);
  });

  it('pressing Probes from a robot screen shows the Probes list, one step on the trail', () => {
    selectBranch('probes');
    selectEntity({ robotId: 'r1' });
    renderPanel();
    const trailBefore = useUIStore.getState().navTrail.length;

    fireEvent.click(box('probe.root'));

    expect(useUIStore.getState()).toMatchObject({ activeHubTile: 'robots', selectedRobotId: null, selectedCompanyId: null, allProbesSelected: false });
    expect(useUIStore.getState().navTrail).toHaveLength(trailBefore + 1);
  });

  it.each([
    [null, 'nav.home'],
    ['audioRig', 'fleet.root'],
    ['robots', 'probe.root'],
  ] as [HubTile | null, ContentKey][])('on tile %s the rail lists only the three boxes, none of them a disclosure', (tile, key) => {
    renderPanel();
    if (tile !== null) fireEvent.click(box(key));
    const buttons = within(nav()).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(BOX_ORDER.map(human));
    for (const b of buttons) expect(b.hasAttribute('aria-expanded')).toBe(false);
  });

  it('no press, on any box and in any order, registers a timeline or writes a width on the viewport', () => {
    renderPanel();
    for (const key of ['probe.root', 'probe.root', 'fleet.root', 'probe.root', 'nav.home'] as ContentKey[]) fireEvent.click(box(key));
    act(() => selectEntity({ robotId: 'r1' }));
    act(() => goHome());
    expect(setTimeline).not.toHaveBeenCalled();
    expect(gsapLog.calls).toHaveLength(0);
    expect(document.getElementById(SCREEN_VIEWPORT_ID)!.getAttribute('style')).toBeNull();
  });

  it('a resting box pops while hovered, focused or pressed, and returns to rest after; the active box stays popped', () => {
    renderPanel();
    const resting = box('fleet.root');
    const rest = poppedOf(resting);
    expect(rest).not.toBe('true');

    fireEvent.mouseEnter(resting);
    expect(poppedOf(resting)).toBe('true');
    fireEvent.mouseLeave(resting);
    expect(poppedOf(resting)).toBe(rest);

    fireEvent.focus(resting);
    expect(poppedOf(resting)).toBe('true');
    fireEvent.blur(resting);
    expect(poppedOf(resting)).toBe(rest);

    fireEvent.pointerDown(resting);
    expect(poppedOf(resting)).toBe('true');
    fireEvent.pointerUp(resting);
    expect(poppedOf(resting)).toBe(rest);

    const deck = box('nav.home');
    fireEvent.mouseEnter(deck);
    fireEvent.mouseLeave(deck);
    expect(poppedOf(deck)).toBe('true');
  });
});

describe('NavPanel — keyboard', () => {
  it('every box is a native button in reading order, none taken out of the tab sequence', () => {
    selectBranch('probes');
    renderPanel();
    const buttons = within(nav()).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(BOX_ORDER.map(human));
    for (const b of buttons) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('tabindex')).toBeNull();
      expect((b as HTMLButtonElement).disabled).toBe(false);
    }
  });
});

// Code review 2026-10-11: a pick can unmount the very button that had focus; the browser then drops focus on
// <body> and a keyboard user restarts from the top of the page. Since the rail lost its entity list
// (docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 13) the Back / Close row in the plate (Task 9, spec §1.5) is the only
// focused control a pick takes away: it leaves with the last open screen.
describe('NavPanel — focus survives the focused control leaving (desk)', () => {
  const renderWithPlate = () =>
    render(
      <main id={SCREEN_VIEWPORT_ID}>
        <NavPanel />
        <ContentPane />
      </main>,
    );
  const rowButton = (key: ContentKey) => screen.getByRole('button', { name: human(key) });
  const press = (button: HTMLElement) => {
    act(() => button.focus());
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
  };

  it('going home (a breadcrumb Root press) while the Back button has focus lands on the Deck box', () => {
    selectEntity({ robotId: 'r1' });
    renderWithPlate();
    act(() => rowButton('nav.back').focus());

    act(() => goHome());

    expect(screen.queryByRole('button', { name: human('nav.back') })).toBeNull();
    expect(document.activeElement).toBe(box('nav.home'));
  });

  it('leaves focus alone while the focused box is still there', () => {
    selectBranch('probes');
    renderWithPlate();
    act(() => box('probe.root').focus());

    fireEvent.click(box('probe.root'));

    expect(document.activeElement).toBe(box('probe.root'));
  });

  it('leaves focus alone when it was never in the panel or the row', () => {
    selectEntity({ robotId: 'r1' });
    renderWithPlate();
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    act(() => outside.focus());

    act(() => goHome());

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('Close with focus on it lands focus on the Deck box', () => {
    selectBranch('probes');
    selectEntity({ robotId: 'r1' });
    renderWithPlate();
    press(rowButton('nav.close'));
    expect(useUIStore.getState().activeHubTile).toBeNull();
    expect(document.activeElement).toBe(box('nav.home'));
  });

  it('a Back that lands on the deck lands focus on the Deck box', () => {
    selectEntity({ robotId: 'r1' });
    renderWithPlate();
    press(rowButton('nav.back'));
    expect(useUIStore.getState().activeHubTile).toBeNull();
    expect(document.activeElement).toBe(box('nav.home'));
  });

  it('a Back to another open screen leaves focus on the Back button', () => {
    selectBranch('fleetParams');
    selectBranch('probes');
    renderWithPlate();
    const backButton = rowButton('nav.back');
    press(backButton);
    expect(useUIStore.getState().activeHubTile).toBe('audioRig');
    expect(document.activeElement).toBe(backButton);
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

  it('on the phone shell the panel is not in the DOM until the sheet opens, then the same three boxes sit in a dialog', () => {
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

  it.each([
    ['nav.home', null],
    ['fleet.root', 'audioRig'],
    ['probe.root', 'robots'],
  ] as [ContentKey, HubTile | null][])('picking %s opens it and closes the sheet', (key, tile) => {
    openSheet({ activeHubTile: key === 'nav.home' ? 'audioRig' : null });
    fireEvent.click(box(key));
    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
    expect(useUIStore.getState().activeHubTile).toBe(tile);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(scrim()).toBeNull();
  });

  // Task 13: the sheet holds the same three boxes and no list. Probes on the Probes list is a pick like any
  // other box, so it shuts the sheet, and it moves nothing else.
  it('pressing Probes on the Probes list shuts the sheet and changes nothing else', () => {
    selectBranch('fleetParams');
    selectBranch('probes');
    openSheet();
    const before = useUIStore.getState();
    expect(within(nav()).getAllByRole('button')).toHaveLength(BOX_ORDER.length);

    fireEvent.click(box('probe.root'));

    expect(useUIStore.getState()).toEqual({ ...before, isNavPanelOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
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

      fireEvent.click(box('fleet.root'));
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

    fireEvent.pointerDown(box('fleet.root'));
    expect(useUIStore.getState().isNavPanelOpen).toBe(true);

    fireEvent.pointerDown(scrim()!);
    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Code review 2026-10-11: the flag outlived a rotation to the desk shell and reopened the modal sheet
  // when the phone came back.
  it('clears the sheet flag when the shell becomes desk, so rotating back does not reopen it', () => {
    const listeners = new Set<() => void>();
    let desk = false;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('reduced-motion') ? false : desk,
        media: query,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      }),
    });
    useUIStore.setState({ isNavPanelOpen: true });
    renderPanel();
    expect(sheet()).toBeTruthy();

    desk = true;
    act(() => listeners.forEach((listener) => listener()));

    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
  });

  it('the desk shell renders no sheet and no scrim, whatever isNavPanelOpen says', () => {
    useUIStore.setState({ isNavPanelOpen: true });
    renderPanel();
    expect(nav()).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(scrim()).toBeNull();
  });
});
