import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { PhoneBar } from './PhoneBar';
import { useUIStore } from '@/stores/uiStore';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import { facadeCurrentText, facadeStates } from '@/testUtils/toggleFacade';
import { CONTENT, labels } from '@/content';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 5 (spec §1.1, §1.2): the phone shell's 56 px bottom bar — the menu
 * that opens the nav sheet, and the well beside it. The sheet itself is NavPanel's (NavPanel.test.tsx).
 */

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

const realMatchMedia = window.matchMedia;
const MENU_NAME = labels('nav.toggle').humanLabel;
const MENU_OPEN_HINT = labels('ui.phoneBar.menuOpen').humanLabel;

const menu = () => screen.getByRole('switch', { name: MENU_NAME });
const well = () => document.querySelector<HTMLElement>('.phone-bar__well')!;

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  stubShell(false);
});
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
});

describe('PhoneBar — the phone shell only', () => {
  it('renders nothing on the desk shell, open flag or not', () => {
    stubShell(true);
    useUIStore.setState({ isNavPanelOpen: true });
    const { container } = render(<PhoneBar />);
    expect(container.firstChild).toBeNull();
  });

  it('on the phone shell renders the bar with its menu, named from the content layer, and its well', () => {
    render(<PhoneBar />);
    expect(menu().closest('.phone-bar')).not.toBeNull();
    expect(well()).not.toBeNull();
  });

  it("keeps the bar's static popped facade (permanently out, no mount animation) around the menu and the well", () => {
    render(<PhoneBar />);
    const facade = document.querySelector('.phone-bar > .sc-cabinet-box');
    expect(facade).not.toBeNull();
    expect(facade!.contains(menu())).toBe(true);
    expect(facade!.contains(well())).toBe(true);
  });
});

describe('PhoneBar — the menu opens and closes the nav sheet', () => {
  it('a press opens the sheet (isNavPanelOpen), a second press closes it', () => {
    render(<PhoneBar />);
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
    render(<PhoneBar />);
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
    render(<PhoneBar />);
    expect(facadeCurrentText(menu())).toBe(glyph);
    expect(facadeStates(menu()).map((s) => s.textContent)).toEqual(['☰', '✕']);
  });
});

describe('PhoneBar — the well', () => {
  it('reads the menu-open hint while the sheet is open', () => {
    useUIStore.setState({ isNavPanelOpen: true });
    render(<PhoneBar />);
    expect(well().textContent).toBe(MENU_OPEN_HINT);
  });

  it('drops the hint once the sheet closes, and shows it again on the next open', () => {
    useUIStore.setState({ isNavPanelOpen: true });
    render(<PhoneBar />);

    act(() => useUIStore.getState().setNavPanelOpen(false));
    expect(well().textContent).not.toContain(MENU_OPEN_HINT);

    fireEvent.click(menu());
    expect(well().textContent).toBe(MENU_OPEN_HINT);
  });

  // Task 8 (spec §1.1, §1.7): shut, the well is the phone's meta box on the Deck and its breadcrumb
  // everywhere else.
  const crumb = () => well().querySelector('[role="navigation"]');

  it('on the Deck reads the world line (the meta box’s telemetry), and no breadcrumb', () => {
    render(<PhoneBar />);
    expect(well().querySelector('.world-line')).not.toBeNull();
    expect(well().querySelectorAll('.world-line__field')).toHaveLength(3);
    expect(crumb()).toBeNull();
  });

  it('on a branch reads the breadcrumb, whose ancestors work from the bar', () => {
    useUIStore.setState({ activeHubTile: 'audioRig', fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneB' });
    render(<PhoneBar />);
    expect(well().querySelector('.world-line')).toBeNull();
    expect(crumb()?.textContent).toBe(`${CONTENT['nav.root'].human} / ${CONTENT['fleet.root'].human} / ${CONTENT['fleet.lfoBank'].human} / ${CONTENT['fleet.lfoBank.laneB'].human}`);
    fireEvent.click(screen.getByRole('button', { name: CONTENT['nav.root'].human }));
    expect(useUIStore.getState().activeHubTile).toBeNull();
    expect(well().querySelector('.world-line')).not.toBeNull();
  });

  it('the open sheet’s hint wins over both', () => {
    useUIStore.setState({ activeHubTile: 'settings', isNavPanelOpen: true });
    render(<PhoneBar />);
    expect(well().textContent).toBe(MENU_OPEN_HINT);
    expect(crumb()).toBeNull();
  });
});

describe('PhoneBar.css — the band and the 320 px fit', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'PhoneBar.css'), 'utf-8');

  it('the well wears the shared well tokens (index.css), as the meta box and the breadcrumb do', () => {
    const body = getCssRuleBody(css, '.phone-bar__well');
    expect(body).toContain('background: var(--well-background);');
    expect(body).toContain('box-shadow: var(--well-inset), inset 0 0 8px var(--color-accent);');
    const index = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../index.css'), 'utf-8');
    const root = getCssRuleBody(index, ':root');
    expect(root).toMatch(/--well-background:\s*rgba\(12, 16, 20, 0\.55\);/);
    expect(root).toMatch(/--well-inset:\s*inset 1px 1px 0 rgba\(0, 0, 0, 0\.9\);/);
  });

  it('declares the band once, on the screen viewport, where the sheet and the content read it', () => {
    const body = getCssRuleBody(css, '#screen-viewport');
    expect(body).toContain('--phone-bar-height: 56px;');
    expect(body).toContain('--phone-bar-clearance: calc(var(--phone-bar-bottom) + var(--phone-bar-height));');
  });

  // Found in Chrome: the tablet's bottom sleeve strip (SleeveContainer.css, height: var(--spacing-2xl))
  // covers the screen's last 32 px at every width, so a bar at bottom: 0 sat half under it. The sketch
  // stands the bar on the strip (.phone .bot { bottom: var(--sb) }), as NavBreadcrumb.css's phone row does.
  it('stands on the bottom sleeve strip rather than under it', () => {
    expect(getCssRuleBody(css, '#screen-viewport')).toContain('--phone-bar-bottom: var(--spacing-2xl);');
    expect(getCssRuleBody(css, '.phone-bar')).toContain('bottom: var(--phone-bar-bottom);');
  });

  it('spans the screen at the band height, padding included', () => {
    const body = getCssRuleBody(css, '.phone-bar');
    expect(body).not.toBeNull();
    for (const declaration of ['position: absolute;', 'left: 0;', 'right: 0;', 'height: var(--phone-bar-height);', 'box-sizing: border-box;']) {
      expect(body).toContain(declaration);
    }
    // No width of its own (min / max included): the band is the screen's width, whatever that is.
    expect(body).not.toMatch(/width\s*:/);
  });

  // Found in Chrome at 320 px: CabinetBox's root is inline-flex, so unstretched the facade hugged the
  // menu and the row came out 86 px wide with an 18 px well (DirectionalPanel.css stretches its own).
  it('the facade and its plate fill the bar, so the row has the whole width to share', () => {
    expect(getCssRuleBody(css, '.phone-bar > .sc-cabinet-box')).toContain('width: 100%;');
    expect(getCssRuleBody(css, '.phone-bar > .sc-cabinet-box > .sc-cabinet-box__front')).toContain('width: 100%;');
  });

  // Toggle.css makes .sc-toggle width: 100% and an inline-size container: in a flex row that claims the
  // whole row, and a shrink-to-fit item under inline-size containment collapses to 0 (TempoSyncToggle.css).
  it('the menu keeps its box: never grown or shrunk by the row, the toggle sized to its facade', () => {
    expect(getCssRuleBody(css, '.phone-bar__menu')).toContain('flex: 0 0 auto;');
    const toggle = getCssRuleBody(css, '.phone-bar__menu > .sc-toggle');
    expect(toggle).toContain('width: auto;');
    expect(toggle).toContain('container-type: normal;');
  });

  it('the well takes what is left and can shrink to nothing, cutting its one line short with an ellipsis', () => {
    const body = getCssRuleBody(css, '.phone-bar__well');
    expect(body).not.toBeNull();
    for (const declaration of ['flex: 1 1 auto;', 'min-width: 0;', 'overflow: hidden;', 'text-overflow: ellipsis;', 'white-space: nowrap;']) {
      expect(body).toContain(declaration);
    }
  });
});

describe('PhoneBar reads its copy from src/content (docs/CONTENT_LAYER.md)', () => {
  it('carries no copy literal of its own', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'PhoneBar.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/>\s*[A-Z][a-z]+( [A-Za-z]+)*\s*</);
  });
});
