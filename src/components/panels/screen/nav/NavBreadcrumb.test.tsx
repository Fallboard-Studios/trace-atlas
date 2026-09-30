import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, renderHook, act, fireEvent } from '@testing-library/react';
import { NavBreadcrumb } from './NavBreadcrumb';
import { useNavTree } from './useNavTree';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';

const localeId = getActiveLocaleId();
const UI_INITIAL_STATE = useUIStore.getState();

function makeRobot(id: string, name?: string): Robot {
  return { id, name } as unknown as Robot;
}

function resetStores() {
  useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
  useUIStore.setState(UI_INITIAL_STATE, true);
}

/** Drives a real selection the same way a nav click would, without rendering NavTree itself —
 *  renderHook(useNavTree) + act(select) is the same technique useNavTree.test.ts already uses. */
function select(id: string) {
  let hookResult: ReturnType<typeof useNavTree> | undefined;
  const { unmount } = renderHook(() => {
    hookResult = useNavTree();
  });
  act(() => hookResult!.select(id));
  unmount();
}

// Matches window.matchMedia for useIsNavPanelSlideAway (NAV_PANEL_DOCK_MIN_WIDTH, 768px) — real
// jsdom has no matchMedia by default in this project's test env otherwise.
function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: !mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function breadcrumbText() {
  return screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent;
}

describe('NavBreadcrumb — a "where am I" readout outside the nav tree, partly interactive', () => {
  beforeEach(() => {
    resetStores();
    stubMatchMedia(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing at the true blank/landing state (nothing selected)', () => {
    const { container } = render(<NavBreadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it('always leads with Root, even for a bare top-level branch', () => {
    select('probes');
    render(<NavBreadcrumb />);
    expect(breadcrumbText()).toBe('Root / Probes');
  });

  it('caps a deep All Probes selection at branch + entity — the section (Composition) is not shown', () => {
    select('probes.all.melody');
    render(<NavBreadcrumb />);
    expect(breadcrumbText()).toBe('Root / Probes / All Probes');
  });

  it('shows a specific robot by its own name, not its id', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    select('probes.r1');
    render(<NavBreadcrumb />);
    expect(breadcrumbText()).toBe('Root / Probes / Unit One');
  });

  it('caps a Fleet Params leaf 3 levels deep at the bare branch alone — no group, no leaf', () => {
    select('fleetParams.timeSpace.reverb');
    render(<NavBreadcrumb />);
    expect(breadcrumbText()).toBe('Root / Fleet Params');
  });

  it('shows the bare Companies node (the create-form state)', () => {
    select('companies');
    render(<NavBreadcrumb />);
    expect(breadcrumbText()).toBe('Root / Companies');
  });

  it('shows Settings (its own humanLabel) alone for any Settings selection, however deep', () => {
    select('settings.sectorSettings.coordinates');
    render(<NavBreadcrumb />);
    expect(breadcrumbText()).toBe('Root / Settings');
  });

  it('goes back to rendering nothing once cleared back to the blank state', () => {
    select('fleetParams.timeSpace.reverb');
    useUIStore.getState().setActiveHubTile(null);
    const { container } = render(<NavBreadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it('applies the mobile modifier class below NavPanel\'s own dock breakpoint', () => {
    stubMatchMedia(true);
    select('probes');
    const { container } = render(<NavBreadcrumb />);
    expect(container.querySelector('.nav-breadcrumb--mobile')).toBeTruthy();
    expect(container.querySelector('.nav-breadcrumb--desktop')).toBeNull();
  });

  it('applies the desktop modifier class at or above NavPanel\'s own dock breakpoint', () => {
    stubMatchMedia(false);
    select('probes');
    const { container } = render(<NavBreadcrumb />);
    expect(container.querySelector('.nav-breadcrumb--desktop')).toBeTruthy();
    expect(container.querySelector('.nav-breadcrumb--mobile')).toBeNull();
  });

  describe('clickable segments', () => {
    it('Root is always a button, and clicking it clears back to the blank/landing state', () => {
      useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
      select('probes.r1');
      render(<NavBreadcrumb />);

      fireEvent.click(screen.getByRole('button', { name: 'Root' }));

      expect(useUIStore.getState().activeHubTile).toBeNull();
      expect(useUIStore.getState().selectedRobotId).toBeNull();
    });

    it('the Probes branch segment is a button that navigates to the bare Probes list, even from a specific robot', () => {
      useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
      select('probes.r1');
      render(<NavBreadcrumb />);

      fireEvent.click(screen.getByRole('button', { name: 'Probes' }));

      expect(useUIStore.getState().activeHubTile).toBe('robots');
      expect(useUIStore.getState().selectedRobotId).toBeNull();
    });

    it('the Companies branch segment is a button that navigates to the bare Companies node', () => {
      useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
      select('companies');
      render(<NavBreadcrumb />);

      fireEvent.click(screen.getByRole('button', { name: 'Companies' }));

      expect(useUIStore.getState().activeHubTile).toBe('companies');
    });

    it('the Fleet Params branch segment is plain text, not a button — it is already the one view it names', () => {
      select('fleetParams.timeSpace.reverb');
      render(<NavBreadcrumb />);

      expect(screen.queryByRole('button', { name: 'Fleet Params' })).toBeNull();
      expect(screen.getByText('Fleet Params').tagName).toBe('SPAN');
    });

    it('the Settings branch segment is plain text, not a button', () => {
      select('settings.sectorSettings');
      render(<NavBreadcrumb />);

      expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
      expect(screen.getByText('Settings').tagName).toBe('SPAN');
    });

    it('a probe\'s own entity segment is plain text, not a button — it is the current view, nothing to navigate to', () => {
      useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
      select('probes.r1');
      render(<NavBreadcrumb />);

      expect(screen.queryByRole('button', { name: 'Unit One' })).toBeNull();
      expect(screen.getByText('Unit One').tagName).toBe('SPAN');
    });
  });
});
