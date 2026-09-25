import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import Header from './Header';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { ACCENT_COLORS } from '@/constants/accentColors';

function setStoreFixtures() {
  useAudioStore.setState({ isMuted: false, volume: 0.6 });
  useUIStore.setState({
    isPoweredOn: true,
    activeLocaleLocalTime: 14.5, // 14:30
    activeLocaleTemperature: -45,
    activeHubTile: null,
    selectedRobotId: null,
    isNavPanelOpen: false,
  });
}

/** Stubs window.matchMedia for the three min-width queries Header's own nav-clearance shift reads
 *  (HEADER_NAV_CLEARANCE_MIN_WIDTH = 400px, HEADER_NAV_CLEARANCE_WIDE_MIN_WIDTH = 640px,
 *  NAV_PANEL_DOCK_MIN_WIDTH = 768px — see useNavPanelSlideAway.ts/NavPanel.test.tsx's own stub
 *  convention for the last one). atLeast640 defaults false (narrow tier) when omitted. */
function stubMatchMedia({ atLeast400, atLeast640 = false, docked }: { atLeast400: boolean; atLeast640?: boolean; docked: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('768px') ? docked : query.includes('640px') ? atLeast640 : query.includes('400px') ? atLeast400 : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

// Local gsap mock (overrides vitest.setup.ts's shared one, same pattern NavPanel.test.tsx's own
// nav-panel-slide tween test uses) — captures the nav-clearance effect's own .to() call so the
// tests below can assert its exact xPercent/x, while still supporting CabinetBox's own
// timeline().fromTo() chain and top-level gsap.set() (3 real CabinetBox instances render inside
// Header: the header facade, Mute's own box, and the volume slider's voxel-track boxes).
let lastToVars: Record<string, unknown> | undefined;
vi.mock('gsap', () => {
  const chainable = {
    set: (_target?: unknown, _vars?: unknown) => chainable,
    to: (_target: unknown, vars: Record<string, unknown>) => {
      lastToVars = vars;
      return chainable;
    },
    fromTo: (_a?: unknown, _b?: unknown, _config?: unknown) => chainable,
    kill: () => { },
  };
  return { default: { timeline: vi.fn(() => chainable), set: vi.fn() } };
});

// Controllable ResizeObserver mock — exercises the --header-height
// measurement effect (docs/specs/HEADER_HUB_CONSOLIDATION.md §1.6, Task 9).
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observedTargets: Element[] = [];
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.observedTargets.push(target);
  }

  unobserve() { }
  disconnect() {
    this.disconnected = true;
  }

  fire(height: number) {
    this.callback([{ contentRect: { height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

/** CabinetBox (Toggle's mute box + RadioButton's 3 option boxes — 4 real
 *  instances render here) also constructs its own ResizeObserver, which
 *  would otherwise be indistinguishable from the height-measurement
 *  effect's own instance under the same mocked global. Find the one
 *  observing the <header> root specifically. */
function findHeaderHeightObserver(headerEl: Element): MockResizeObserver {
  const found = MockResizeObserver.instances.find((o) => o.observedTargets.includes(headerEl));
  if (!found) throw new Error('No MockResizeObserver observed the <header> root element');
  return found;
}

let originalResizeObserver: typeof ResizeObserver;

describe('Header', () => {
  beforeEach(() => {
    setStoreFixtures();
    MockResizeObserver.instances = [];
    originalResizeObserver = globalThis.ResizeObserver;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
    document.documentElement.style.removeProperty('--header-height');
  });

  it('renders a master volume slider bound to audioStore.volume, always visible alongside Mute (moved back after Task 11 per Crawford\'s follow-up call — still also present at Settings -> Volume, see SettingsContent.test.tsx)', () => {
    render(<Header />);
    const slider = screen.getByRole('slider', { name: /volume/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('60');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
  });

  it('stepping the volume slider with the keyboard calls setVolume, observable as a real store update', () => {
    render(<Header />);
    const slider = screen.getByRole('slider', { name: /volume/i });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(useAudioStore.getState().volume).toBeGreaterThan(0.6);
  });

  it('disables the volume slider when powered off', () => {
    useUIStore.setState({ isPoweredOn: false });
    render(<Header />);
    const slider = screen.getByRole('slider', { name: /volume/i });
    expect(slider.getAttribute('data-disabled')).toBe('');
  });

  it('renders the local time as HH:MM', () => {
    render(<Header />);
    expect(screen.getByText(/14:30/)).toBeTruthy();
  });

  it('renders temperature as an integer °C reading', () => {
    render(<Header />);
    expect(screen.getByText(/-45°C/)).toBeTruthy();
  });

  it('falls back to a placeholder when temperature has not been set yet (null)', () => {
    useUIStore.setState({ activeLocaleTemperature: null });
    render(<Header />);
    expect(screen.queryByText(/°C/)).toBeNull();
    expect(screen.getByText('NO TEMP')).toBeTruthy();
  });

  it('renders mute as a switch reflecting audioStore.isMuted', () => {
    render(<Header />);
    const muteSwitch = screen.getByRole('switch', { name: /mute/i });
    expect(muteSwitch.getAttribute('aria-checked')).toBe('false');
  });

  it('renders the unmuted speaker icon when not muted, and no separate "Mute" text', () => {
    useAudioStore.setState({ isMuted: false });
    render(<Header />);
    expect(screen.getByText('🔊')).toBeTruthy();
    expect(screen.queryByText('🔇')).toBeNull();
    expect(screen.queryByText('Mute')).toBeNull();
  });

  it('renders the muted speaker icon when muted', () => {
    useAudioStore.setState({ isMuted: true });
    render(<Header />);
    expect(screen.getByText('🔇')).toBeTruthy();
    expect(screen.queryByText('🔊')).toBeNull();
  });

  it('marks the mute icon aria-hidden, since the switch\'s own aria-label already carries the accessible name', () => {
    render(<Header />);
    expect(screen.getByText('🔊').getAttribute('aria-hidden')).toBe('true');
  });

  it('clicking mute flips audioStore.isMuted, independent of volume', () => {
    useAudioStore.setState({ volume: 0.8, isMuted: false });
    render(<Header />);
    fireEvent.click(screen.getByRole('switch', { name: /mute/i }));
    expect(useAudioStore.getState().isMuted).toBe(true);
    expect(useAudioStore.getState().volume).toBe(0.8);
  });

  it('disables the mute switch when powered off', () => {
    useUIStore.setState({ isPoweredOn: false });
    render(<Header />);
    expect((screen.getByRole('switch', { name: /mute/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders no nav RadioButton — navigation now lives entirely in NavTree (docs/tasks/NAV_LAYOUT_REWRITE.md Task 10)', () => {
    render(<Header />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('renders no restart, pause/play, or BPM readouts', () => {
    render(<Header />);
    expect(screen.queryByRole('button', { name: /restart/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /pause/i })).toBeNull();
    expect(screen.queryByText(/BPM/)).toBeNull();
  });

  // docs/specs/HEADER_HUB_CONSOLIDATION.md §1.6 (Task 9) — Console.css's
  // vertical deadzone clearance reads --header-height off document.documentElement,
  // since Header is a sibling of Console, not an ancestor.
  describe('--header-height measurement (§1.6)', () => {
    it('writes its own measured height to document.documentElement as --header-height', () => {
      const { container } = render(<Header />);
      const observer = findHeaderHeightObserver(container.querySelector('header')!);

      act(() => observer.fire(140));
      expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('140px');
    });

    it('updates --header-height again when the header resizes, not just once on mount', () => {
      const { container } = render(<Header />);
      const observer = findHeaderHeightObserver(container.querySelector('header')!);

      act(() => observer.fire(140));
      expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('140px');

      act(() => observer.fire(96));
      expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('96px');
    });

    it('disconnects the height observer on unmount', () => {
      const { container, unmount } = render(<Header />);
      const observer = findHeaderHeightObserver(container.querySelector('header')!);
      expect(observer.disconnected).toBe(false);
      unmount();
      expect(observer.disconnected).toBe(true);
    });
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 15) — the Header
  // trait's own colors (teal/green, rebalanced from emerald/indigo — see traitColors.ts's own
  // comment) on the header root.
  it("scopes its root to the Header trait's colors (teal/green)", () => {
    const { container } = render(<Header />);
    const root = container.querySelector('header') as HTMLElement;
    expect(root.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.teal);
    expect(root.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.green);
  });

  // NavPanel's own slide-off overlaps Header's volume slider between HEADER_NAV_CLEARANCE_MIN_WIDTH
  // (400px) and NavPanel's own dock breakpoint (NAV_PANEL_DOCK_MIN_WIDTH, 768px — see
  // useNavPanelSlideAway.ts). Header.tsx shifts its own cabinet box right in that range so Mute
  // stays reachable while NavPanel is open.
  describe('.header>.sc-cabinet-box nav-clearance shift', () => {
    beforeEach(() => {
      lastToVars = undefined;
    });

    it('shifts right (xPercent: 100, x: -154) in the narrow clearance tier (400-639px) when NavPanel opens', () => {
      stubMatchMedia({ atLeast400: true, atLeast640: false, docked: false });
      setStoreFixtures();
      render(<Header />);

      act(() => {
        useUIStore.getState().setNavPanelOpen(true);
      });

      expect(lastToVars?.xPercent).toBe(100);
      expect(lastToVars?.x).toBe(-154);
    });

    it('shifts right (xPercent: 100, x: -188) in the wide clearance tier (>=640px) when NavPanel opens', () => {
      stubMatchMedia({ atLeast400: true, atLeast640: true, docked: false });
      setStoreFixtures();
      render(<Header />);

      act(() => {
        useUIStore.getState().setNavPanelOpen(true);
      });

      expect(lastToVars?.xPercent).toBe(100);
      expect(lastToVars?.x).toBe(-188);
    });

    it('shifts back (xPercent: 0, x: 0) when NavPanel closes again within the clearance range', () => {
      stubMatchMedia({ atLeast400: true, docked: false });
      setStoreFixtures();
      useUIStore.setState({ isNavPanelOpen: true });
      render(<Header />);

      act(() => {
        useUIStore.getState().setNavPanelOpen(false);
      });

      expect(lastToVars?.xPercent).toBe(0);
      expect(lastToVars?.x).toBe(0);
    });

    it('never shifts below the clearance range (<400px wide), even with NavPanel open', () => {
      stubMatchMedia({ atLeast400: false, docked: false });
      setStoreFixtures();
      useUIStore.setState({ isNavPanelOpen: true });
      render(<Header />);

      expect(lastToVars?.xPercent).toBe(0);
      expect(lastToVars?.x).toBe(0);
    });

    it('never shifts once NavPanel is permanently docked (>=768px wide), even with isNavPanelOpen true', () => {
      stubMatchMedia({ atLeast400: true, docked: true });
      setStoreFixtures();
      useUIStore.setState({ isNavPanelOpen: true });
      render(<Header />);

      expect(lastToVars?.xPercent).toBe(0);
      expect(lastToVars?.x).toBe(0);
    });
  });
});
