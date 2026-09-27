import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
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

describe('NavBreadcrumb — a read-only "where am I" readout outside the nav tree', () => {
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

  it('shows the branch label alone for a bare top-level branch', () => {
    select('probes');
    render(<NavBreadcrumb />);
    expect(screen.getByRole('status').textContent).toBe('Probes');
  });

  it('shows the full path for a deep All Probes selection', () => {
    select('probes.all.melody');
    render(<NavBreadcrumb />);
    expect(screen.getByRole('status').textContent).toBe('Probes / All Probes / Composition');
  });

  it('shows a specific robot by its own name, not its id', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    select('probes.r1');
    render(<NavBreadcrumb />);
    expect(screen.getByRole('status').textContent).toBe('Probes / Unit One');
  });

  it('stops at the group for a Fleet Params leaf 3 levels deep — the leaf itself (Reverb) is trimmed', () => {
    select('fleetParams.timeSpace.reverb');
    render(<NavBreadcrumb />);
    expect(screen.getByRole('status').textContent).toBe('Fleet Params / Time & Space');
  });

  it('shows the bare Companies node (the create-form state)', () => {
    select('companies');
    render(<NavBreadcrumb />);
    expect(screen.getByRole('status').textContent).toBe('Companies');
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
});
