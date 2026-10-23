import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { PhoneMenu, PhoneWell } from './PhoneBar';
import { useUIStore } from '@/stores/uiStore';
import { facadeCurrentText, facadeStates } from '@/testUtils/toggleFacade';
import { CONTENT, labels } from '@/content';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 5 (spec §1.1, §1.2): the phone shell's menu that opens the nav sheet, and
 * the well that reads the world line or the breadcrumb. They began as a 56 px bottom bar; they now sit in the
 * header's band (Header.tsx, left of the power corner), so each is tested on its own here and their place in
 * the row, and the well's CSS, are Header.test.tsx's. The sheet itself is NavPanel's (NavPanel.test.tsx).
 */

const MENU_NAME = labels('nav.toggle').humanLabel;
const MENU_OPEN_HINT = labels('ui.phoneBar.menuOpen').humanLabel;

const menu = () => screen.getByRole('switch', { name: MENU_NAME });
const well = () => document.querySelector<HTMLElement>('.header__well')!;

/** The two pieces as Header lays them out, with no row around them. */
const renderPieces = () =>
  render(
    <>
      <PhoneMenu />
      <PhoneWell />
    </>,
  );

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
});

describe('PhoneMenu — opens and closes the nav sheet', () => {
  it('a press opens the sheet (isNavPanelOpen), a second press closes it', () => {
    renderPieces();
    expect(menu().getAttribute('aria-checked')).toBe('false');

    fireEvent.click(menu());
    expect(useUIStore.getState().isNavPanelOpen).toBe(true);
    expect(menu().getAttribute('aria-checked')).toBe('true');

    fireEvent.click(menu());
    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
    expect(menu().getAttribute('aria-checked')).toBe('false');
  });

  it('follows the flag when something else closes the sheet (a pick, Escape, the scrim)', () => {
    useUIStore.setState({ isNavPanelOpen: true });
    renderPieces();
    expect(menu().getAttribute('aria-checked')).toBe('true');

    act(() => useUIStore.getState().setNavPanelOpen(false));

    expect(menu().getAttribute('aria-checked')).toBe('false');
    expect(facadeCurrentText(menu())).toBe('☰');
  });

  // A control whose content changes holds the size of its largest content (Crawford, 2026-10-03).
  it.each([
    ['closed', false, '☰'],
    ['open', true, '✕'],
  ])('when %s, shows %s and keeps both glyphs in the facade so the box never resizes', (_state, open, glyph) => {
    useUIStore.setState({ isNavPanelOpen: open });
    renderPieces();
    expect(facadeCurrentText(menu())).toBe(glyph);
    expect(facadeStates(menu()).map((s) => s.textContent)).toEqual(['☰', '✕']);
  });
});

describe('PhoneWell', () => {
  it('reads the menu-open hint while the sheet is open', () => {
    useUIStore.setState({ isNavPanelOpen: true });
    renderPieces();
    expect(well().textContent).toBe(MENU_OPEN_HINT);
  });

  it('drops the hint once the sheet closes, and shows it again on the next open', () => {
    useUIStore.setState({ isNavPanelOpen: true });
    renderPieces();

    act(() => useUIStore.getState().setNavPanelOpen(false));
    expect(well().textContent).not.toContain(MENU_OPEN_HINT);

    fireEvent.click(menu());
    expect(well().textContent).toBe(MENU_OPEN_HINT);
  });

  // Task 8 (spec §1.1, §1.7): shut, the well is the phone's meta box on the Deck and its breadcrumb
  // everywhere else.
  const crumb = () => well().querySelector('[role="navigation"]');

  it('on the Deck reads the world line (the meta box’s telemetry), and no breadcrumb', () => {
    renderPieces();
    expect(well().querySelector('.world-line')).not.toBeNull();
    expect(well().querySelectorAll('.world-line__field')).toHaveLength(3);
    expect(crumb()).toBeNull();
  });

  it('on a branch reads the breadcrumb, whose ancestors work from the well', () => {
    useUIStore.setState({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneB' });
    renderPieces();
    expect(well().querySelector('.world-line')).toBeNull();
    // No Root on the phone (Crawford, 2026-10-10): the menu's Deck box is the way home there.
    expect(crumb()?.textContent).toBe(`${CONTENT['fleet.root'].human} / ${CONTENT['fleet.lfoBank'].human} / ${CONTENT['fleet.lfoBank.laneB'].human}`);
    expect(screen.queryByRole('button', { name: CONTENT['nav.root'].human })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: CONTENT['fleet.root'].human }));
    expect(useUIStore.getState().activeHubTile).toBe('audioRig');
    expect(useUIStore.getState().fleetParamsSubsection).toBeNull();
  });

  it('the open sheet’s hint wins over both', () => {
    useUIStore.setState({ activeHubTile: 'settings', isNavPanelOpen: true });
    renderPieces();
    expect(well().textContent).toBe(MENU_OPEN_HINT);
    expect(crumb()).toBeNull();
  });
});
