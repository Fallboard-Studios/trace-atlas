import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

import Header from './Header';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { getTimeline } from '@/animation/timelineMap';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import { labels } from '@/content';
import { CABINET_BOX_HEIGHT, CABINET_VOXEL_GAP, type CabinetTier } from '@/utils/cabinetBreakpoints';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import {
  computeFittedBoxCount,
  computeVoxelTrackLength,
  computeVoxelTrackTrailingReserve,
  VOXEL_TRACK_MIN_BOX_COUNT,
} from '@/utils/voxelTrackMath';

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

/** Stubs window.matchMedia: useShell's desk query (768px) answers `desk`; the 400px / 640px queries the
 *  removed nav-clearance slide used to read answer `wide`, so a test can sit in the band where it fired. */
function stubShell(desk: boolean, wide = desk) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('768px') ? desk : query.includes('reduced-motion') ? false : wide,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

const realMatchMedia = window.matchMedia;
const VOLUME_NAME = labels('header.volume').humanLabel;

// CabinetBox stubbed to expose how far each box is popped (NavPanel.test.tsx's stub): the phone's volume
// box pops while its pop-out is open, and with gsap mocked the real box shows that nowhere in the DOM.
vi.mock('@/components/ui/controls/CabinetBox', () => ({
  CabinetBox: ({ popped, timelineKey, children }: { popped: boolean | number; timelineKey: string; children?: React.ReactNode }) => (
    <div className="sc-cabinet-box" data-popped={String(popped)} data-timeline-key={timelineKey}>
      {children}
    </div>
  ),
}));

// Local gsap mock (overrides vitest.setup.ts's shared one) — records every .to() call, so the test that
// the nav-clearance slide is gone can see that nothing tweens the header's box, while still supporting
// CabinetBox's own timeline().fromTo() chain and top-level gsap.set() (the header facade, Mute's box,
// the volume trigger's box on the phone and the slider's voxel-track boxes all render real CabinetBoxes).
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
  return {
    default: {
      timeline: vi.fn(() => chainable),
      set: vi.fn(),
      // The Volume slider's own 250ms ease (useEasedControlValue.ts) — a no-op retarget is
      // sufficient here, since no test in this file asserts on the slider settling at a new
      // value after a non-drag change; only real drag/keyboard interaction is exercised below,
      // which never calls quickTo at all (see useEasedControlValue.test.ts for that coverage).
      quickTo: vi.fn(() => vi.fn()),
      killTweensOf: vi.fn(),
    },
  };
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

  /** A content-box width report: the free band left of the power corner, as the ruler reports it. */
  fireContentWidth(width: number) {
    this.callback([{ contentRect: { width, height: 0 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  /** A width report as a real observer's: the border box's inline size (the row's padding counts). */
  fireWidth(width: number) {
    this.callback([{ contentRect: { width: width - 100 }, borderBoxSize: [{ inlineSize: width, blockSize: 0 }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
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
    // The behaviour tests below predate the shells and read the slider inline, as the desk shows it
    // (docs/tasks/LAYOUT_REWORK.md Task 6: they pass unmodified). The phone's pop-out has its own block.
    stubShell(true);
    lastToVars = undefined;
  });

  afterEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
    document.documentElement.style.removeProperty('--header-height');
    document.documentElement.style.removeProperty('--header-width');
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
  });

  it('renders a master volume slider bound to audioStore.volume, always visible alongside Mute (moved back after Task 11 per Crawford\'s follow-up call)', () => {
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

  // Time/temp status readout moved to NavStatusBlock as part of a232a48 "header now interacts with
  // nav panel", then to the meta box (worldView/MetaBox.tsx, layout rework Task 8) — Header no
  // longer renders it at all. See MetaBox.test.tsx for the equivalent coverage (HH:MM, °C, NO TEMP fallback).

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

  it('renders no nav RadioButton — navigation lives entirely in NavPanel (docs/specs/LAYOUT_REWORK.md §1.2)', () => {
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

  // Crawford, 2026-10-10: the meta box sits at the top, level with the header, and must stop short of it. The
  // header's width is as content-sized as its height (the volume slider's width plus the power corner's
  // reserve), so it is measured, not typed in twice: the row's border-box width, written to the root the same
  // way --header-height is, for MetaBox.css to subtract.
  describe('--header-width measurement', () => {
    const rowObserver = (container: HTMLElement) => {
      const row = container.querySelector('.header__row')!;
      const found = MockResizeObserver.instances.find((o) => o.observedTargets.includes(row));
      if (!found) throw new Error('No MockResizeObserver observed .header__row');
      return found;
    };

    it('writes the border-box width of the row to document.documentElement as --header-width', () => {
      const { container } = render(<Header />);
      act(() => rowObserver(container).fireWidth(372));
      expect(document.documentElement.style.getPropertyValue('--header-width')).toBe('372px');
    });

    it('updates it when the row resizes, not just once on mount', () => {
      const { container } = render(<Header />);
      const observer = rowObserver(container);
      act(() => observer.fireWidth(372));
      act(() => observer.fireWidth(296));
      expect(document.documentElement.style.getPropertyValue('--header-width')).toBe('296px');
    });

    it('measures the row separately from the header root, so --header-height stays the height of the header', () => {
      const { container } = render(<Header />);
      const root = findHeaderHeightObserver(container.querySelector('header')!);
      expect(root.observedTargets).not.toContain(container.querySelector('.header__row'));
      act(() => root.fire(140));
      expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('140px');
      expect(document.documentElement.style.getPropertyValue('--header-width')).toBe('');
    });

    it('disconnects the width observer on unmount', () => {
      const { container, unmount } = render(<Header />);
      const observer = rowObserver(container);
      expect(observer.disconnected).toBe(false);
      unmount();
      expect(observer.disconnected).toBe(true);
    });

    // Crawford, 2026-10-12: resizing from the phone up to the desk left the meta box running into the volume
    // bar. The phone wraps the panel in a stack the desk does not have, so crossing the breakpoint remounts
    // the row; an observer that stays on the old row measures nothing for the new one.
    it('follows the row across the phone-to-desk breakpoint: the new row is observed, the old one let go', () => {
      let desk = false;
      const listeners = new Set<() => void>();
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query: string) => ({
          get matches() {
            return query.includes('768px') ? desk : false;
          },
          media: query,
          addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
          removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        }),
      });
      const { container } = render(<Header />);
      const phoneRow = container.querySelector('.header__row')!;
      const phoneObserver = rowObserver(container);

      act(() => {
        desk = true;
        listeners.forEach((listener) => listener());
      });

      const deskRow = container.querySelector('.header__row')!;
      expect(deskRow).not.toBe(phoneRow);
      expect(phoneObserver.disconnected).toBe(true);
      const live = MockResizeObserver.instances.find((o) => !o.disconnected && o.observedTargets.includes(deskRow));
      expect(live).toBeTruthy();
      act(() => live!.fireWidth(354));
      expect(document.documentElement.style.getPropertyValue('--header-width')).toBe('354px');
    });

    it('does not leave a stale width behind when the header unmounts (powered off)', () => {
      const { container, unmount } = render(<Header />);
      act(() => rowObserver(container).fireWidth(372));
      unmount();
      expect(document.documentElement.style.getPropertyValue('--header-width')).toBe('');
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

  // docs/tasks/LAYOUT_REWORK.md Task 6: the nav-clearance slide is gone. The phone's nav is a sheet below
  // the top bar (Task 5) and the desk panel never reaches the header, so nothing moves on isNavPanelOpen.
  describe('no nav-clearance slide', () => {
    it.each([
      ['phone, in the 400-767 px band where it used to fire', false, true],
      ['phone, below 400 px', false, false],
      ['desk', true, true],
    ])('%s: opening and closing the nav tweens nothing and registers no header-cabinet-nav-clearance timeline', (_band, desk, wide) => {
      stubShell(desk, wide);
      render(<Header />);

      act(() => useUIStore.getState().setNavPanelOpen(true));
      expect(getTimeline('header-cabinet-nav-clearance')).toBeUndefined();
      act(() => useUIStore.getState().setNavPanelOpen(false));

      expect(lastToVars).toBeUndefined();
      expect(getTimeline('header-cabinet-nav-clearance')).toBeUndefined();
    });
  });

  describe('desk shell: mute and the slider in one row', () => {
    it('renders mute then the volume slider in the header row, and no volume pop-out box', () => {
      const { container } = render(<Header />);
      const row = container.querySelector<HTMLElement>('.header__row')!;
      const mute = within(row).getByRole('switch', { name: /mute/i });
      const slider = within(row).getByRole('slider', { name: /volume/i });
      expect(mute.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.queryByRole('button', { name: VOLUME_NAME })).toBeNull();
      expect(container.querySelector('.header__volume-popover')).toBeNull();
    });

    it('carries no nav menu and no well: the desk has the nav panel, the meta box and the breadcrumb', () => {
      const { container } = render(<Header />);
      expect(screen.queryByRole('switch', { name: labels('nav.toggle').humanLabel })).toBeNull();
      expect(container.querySelector('.header__well')).toBeNull();
      expect(container.querySelector('.header__row--phone')).toBeNull();
    });
  });

  // Crawford, 2026-10-11: on the phone the well runs along the top of the app, outside the panel; under it,
  // pinned to the left, is the panel holding the menu, mute and the volume box (or the slider).
  describe('phone shell: the well along the top, the controls panel under it', () => {
    beforeEach(() => stubShell(false));

    const row = (container: HTMLElement) => container.querySelector<HTMLElement>('.header__row')!;
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('puts the well first, outside the panel, then the panel with the menu, mute and the volume box in order', () => {
      const { container } = render(<Header />);
      const menu = within(row(container)).getByRole('switch', { name: labels('nav.toggle').humanLabel });
      const mute = within(row(container)).getByRole('switch', { name: /mute/i });
      const volume = within(row(container)).getByRole('button', { name: VOLUME_NAME });
      const well = container.querySelector('.header__well')!;
      expect(well).not.toBeNull();
      expect(row(container).contains(well)).toBe(false);
      expect(container.querySelector('.sc-cabinet-box')!.contains(well)).toBe(false);
      expect(follows(well, menu)).toBe(true);
      expect(follows(menu, mute)).toBe(true);
      expect(follows(mute, volume)).toBe(true);
      expect(row(container).classList.contains('header__row--phone')).toBe(true);
    });

    // Crawford, 2026-10-11: the well and the panel share one width and one inset from the tablet's edge, so
    // they live in one stack and the stack sets both.
    it('holds the well and the panel in one stack, well first', () => {
      const { container } = render(<Header />);
      const stack = container.querySelector('.header__stack')!;
      expect(stack).not.toBeNull();
      expect(Array.from(stack.children).map((c) => (c.classList.contains('header__well') ? 'well' : c.classList.contains('sc-cabinet-box') ? 'panel' : '?'))).toEqual(['well', 'panel']);
    });

    // Crawford, 2026-10-11: "at least a 12px gap between the menu/mute/etc buttons".
    it('keeps at least 12 px between the controls', () => {
      const { container } = render(<Header />);
      const gap = parseFloat(container.querySelector<HTMLElement>('header')!.style.getPropertyValue('--header-row-gap'));
      expect(gap).toBeGreaterThanOrEqual(12);
    });

    it('keeps the menu and mute reachable: both are 44 px touch targets in the controls row', () => {
      const { container } = render(<Header />);
      for (const sw of within(row(container)).getAllByRole('switch')) {
        expect(sw.style.getPropertyValue('--cabinet-toggle-box-size')).toBe('44px');
      }
    });

    it('the menu opens the nav sheet, and the well reads the world line on the Deck', () => {
      const { container } = render(<Header />);
      fireEvent.click(within(row(container)).getByRole('switch', { name: labels('nav.toggle').humanLabel }));
      expect(useUIStore.getState().isNavPanelOpen).toBe(true);
      useUIStore.setState({ isNavPanelOpen: false });
    });

    // Crawford, 2026-10-11: once the band has room for the volume slider at its shortest track (three boxes), the
    // ▾ box goes and the slider shows on screen in the same row. The room is the free band left of the power
    // corner, which the ruler (an empty box mirroring it) reports; the need is the three boxes of the row.
    describe('the volume slider replaces the ▾ box once it fits', () => {
      const rulerObserver = (container: HTMLElement) => {
        const ruler = container.querySelector('.header__ruler');
        const found = MockResizeObserver.instances.find((o) => ruler && o.observedTargets.includes(ruler));
        if (!found) throw new Error('No MockResizeObserver observed .header__ruler');
        return found;
      };
      const need = (container: HTMLElement) => {
        const style = container.querySelector<HTMLElement>('header')!.style;
        return 2 * 44 + 2 * parseFloat(style.getPropertyValue('--header-row-gap')) + parseFloat(style.getPropertyValue('--header-volume-width'));
      };

      it('shows the ▾ box until the band has been measured', () => {
        render(<Header />);
        expect(screen.getByRole('button', { name: VOLUME_NAME })).toBeTruthy();
        expect(screen.queryByRole('slider')).toBeNull();
      });

      it('is short of room one pixel under the need: the ▾ box stays, no slider on screen', () => {
        const { container } = render(<Header />);
        act(() => rulerObserver(container).fireContentWidth(need(container) - 1));
        expect(screen.getByRole('button', { name: VOLUME_NAME })).toBeTruthy();
        expect(screen.queryByRole('slider')).toBeNull();
      });

      it('has room at exactly the need: the ▾ box is gone and the slider sits after mute in the controls row', () => {
        const { container } = render(<Header />);
        act(() => rulerObserver(container).fireContentWidth(need(container)));
        expect(screen.queryByRole('button', { name: VOLUME_NAME })).toBeNull();
        const controls = container.querySelector<HTMLElement>('.header__controls')!;
        const menu = within(controls).getByRole('switch', { name: labels('nav.toggle').humanLabel });
        const mute = within(controls).getByRole('switch', { name: /mute/i });
        const slider = within(controls).getByRole('slider', { name: /volume/i });
        expect(follows(menu, mute)).toBe(true);
        expect(follows(mute, slider)).toBe(true);
        expect(slider.getAttribute('aria-valuenow')).toBe('60');
        expect(container.querySelector('.header__volume-popover')).toBeNull();
      });

      it('swaps back to the ▾ box when the band narrows again', () => {
        const { container } = render(<Header />);
        act(() => rulerObserver(container).fireContentWidth(need(container) + 40));
        expect(screen.queryByRole('button', { name: VOLUME_NAME })).toBeNull();
        act(() => rulerObserver(container).fireContentWidth(need(container) - 40));
        expect(screen.getByRole('button', { name: VOLUME_NAME })).toBeTruthy();
        expect(screen.queryByRole('slider')).toBeNull();
      });

      it('closes an open pop-out when the room arrives, and never mounts two sliders at once', () => {
        const { container } = render(<Header />);
        fireEvent.click(screen.getByRole('button', { name: VOLUME_NAME }));
        expect(screen.getAllByRole('slider')).toHaveLength(1);
        act(() => rulerObserver(container).fireContentWidth(need(container)));
        expect(container.querySelector('.header__volume-popover')).toBeNull();
        expect(screen.getAllByRole('slider')).toHaveLength(1);
      });

      it('the desk shell has no ruler: it always shows the slider', () => {
        stubShell(true);
        const { container } = render(<Header />);
        expect(container.querySelector('.header__ruler')).toBeNull();
      });
    });

    it('the world line shows in the well on the Deck; a branch shows the breadcrumb there', () => {
      const { container } = render(<Header />);
      expect(container.querySelector('.header__well .world-line')).not.toBeNull();
      act(() => useUIStore.setState({ activeHubTile: 'settings' }));
      expect(container.querySelector('.header__well .world-line')).toBeNull();
      expect(container.querySelector('.header__well [role="navigation"]')).not.toBeNull();
    });
  });

  // Crawford, 2026-10-09: "Volume box beside mute" — mute stays one press, and a ▾ box beside it opens
  // the volume pop-out (a Radix Popover holding the slider).
  describe('phone shell: mute, and the volume pop-out from the box beside it', () => {
    beforeEach(() => stubShell(false));

    const volumeBox = () => screen.getByRole('button', { name: VOLUME_NAME });
    const popover = () => document.querySelector<HTMLElement>('.header__volume-popover');
    const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

    it('renders mute and the volume box, and no slider until the box opens the pop-out', () => {
      render(<Header />);
      expect(screen.getByRole('switch', { name: /mute/i })).toBeTruthy();
      expect(volumeBox().getAttribute('aria-expanded')).toBe('false');
      expect(volumeBox().getAttribute('aria-haspopup')).toBe('dialog');
      expect(screen.queryByRole('slider')).toBeNull();
      expect(popover()).toBeNull();
    });

    it('the volume box sits right after mute in the one header row, its glyph hidden from assistive tech', () => {
      const { container } = render(<Header />);
      const row = container.querySelector<HTMLElement>('.header__row')!;
      const mute = within(row).getByRole('switch', { name: /mute/i });
      const box = within(row).getByRole('button', { name: VOLUME_NAME });
      expect(mute.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(box).getByText('▾').getAttribute('aria-hidden')).toBe('true');
    });

    // Toggle's fixed-square face (the --bare root at an explicit boxSize), the ▾ box's size: two
    // matching 44 px touch targets (spec §3: touch targets stay >= --touch-target-size on the phone).
    it('mute is the same fixed 44 px square as the volume box', () => {
      render(<Header />);
      const mute = screen.getByRole('switch', { name: /mute/i });
      expect(mute.classList.contains('sc-toggle__root--bare')).toBe(true);
      expect(mute.style.getPropertyValue('--cabinet-toggle-box-size')).toBe('44px');
    });

    it('the volume box pops while the pop-out is open and rests when it is shut, as a Toggle does while on', () => {
      render(<Header />);
      const popped = () => volumeBox().querySelector('.sc-cabinet-box')!.getAttribute('data-popped');
      expect(volumeBox().getAttribute('data-state')).toBe('closed');
      expect(popped()).toBe(String(CABINET_REST_POP));

      fireEvent.click(volumeBox());
      expect(volumeBox().getAttribute('data-state')).toBe('open');
      expect(popped()).toBe('true');

      fireEvent.click(volumeBox());
      expect(popped()).toBe(String(CABINET_REST_POP));
    });

    it('mute still flips audioStore.isMuted in one press and leaves the volume alone', () => {
      useAudioStore.setState({ volume: 0.8, isMuted: false });
      render(<Header />);
      fireEvent.click(screen.getByRole('switch', { name: /mute/i }));
      expect(useAudioStore.getState().isMuted).toBe(true);
      expect(useAudioStore.getState().volume).toBe(0.8);
      expect(popover()).toBeNull();
    });

    it('pressing the volume box opens the pop-out with the slider bound to audioStore.volume', () => {
      render(<Header />);
      fireEvent.click(volumeBox());
      expect(volumeBox().getAttribute('aria-expanded')).toBe('true');
      const slider = within(popover()!).getByRole('slider', { name: /volume/i });
      expect(slider.getAttribute('aria-valuenow')).toBe('60');
    });

    it('the pop-out slider drives the store as the desk one does', () => {
      render(<Header />);
      fireEvent.click(volumeBox());
      const slider = within(popover()!).getByRole('slider', { name: /volume/i });
      act(() => slider.focus());
      fireEvent.keyDown(slider, { key: 'ArrowRight' });
      expect(useAudioStore.getState().volume).toBeGreaterThan(0.6);
    });

    it('Escape closes the pop-out and hands focus back to the volume box', async () => {
      render(<Header />);
      act(() => volumeBox().focus());
      fireEvent.click(volumeBox());
      expect(popover()).not.toBeNull();

      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      await tick();

      expect(popover()).toBeNull();
      expect(screen.queryByRole('slider')).toBeNull();
      expect(volumeBox().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(volumeBox());
    });

    it('a second press on the volume box closes it', () => {
      render(<Header />);
      fireEvent.click(volumeBox());
      fireEvent.click(volumeBox());
      expect(popover()).toBeNull();
    });

    it('a press outside closes it', async () => {
      render(<Header />);
      fireEvent.click(volumeBox());
      await tick();
      fireEvent.pointerDown(document.body);
      expect(popover()).toBeNull();
    });

    // UI Shell guardrail (CLAUDE.md): interactive UI lives inside ScreenViewport only — no portal to <body>.
    it('renders the pop-out inside the header', () => {
      const { container } = render(<Header />);
      fireEvent.click(volumeBox());
      expect(container.querySelector('header')!.contains(popover())).toBe(true);
    });

    it('disables the volume box when powered off, so the pop-out cannot open', () => {
      useUIStore.setState({ isPoweredOn: false });
      render(<Header />);
      expect((volumeBox() as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(volumeBox());
      expect(popover()).toBeNull();
    });

    it('widening to the desk shell with the pop-out open puts the slider back in the row; narrowing again finds the pop-out shut', () => {
      let desk = false;
      const listeners = new Set<() => void>();
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query: string) => ({
          get matches() {
            return query.includes('768px') ? desk : false;
          },
          media: query,
          addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
          removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        }),
      });
      const setShell = (next: boolean) =>
        act(() => {
          desk = next;
          listeners.forEach((listener) => listener());
        });

      const { container } = render(<Header />);
      fireEvent.click(volumeBox());
      expect(popover()).not.toBeNull();

      setShell(true);
      expect(popover()).toBeNull();
      expect(within(container.querySelector<HTMLElement>('.header__row')!).getByRole('slider', { name: /volume/i })).toBeTruthy();

      setShell(false);
      expect(popover()).toBeNull();
      expect(volumeBox().getAttribute('aria-expanded')).toBe('false');
    });
  });
});

describe('Header reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 14)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'Header.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/\[c\]/);
  });
});

// Found in Chrome: a 176 px slider overflowed the desk header by 8 px — the voxel boxes follow the
// cabinet tier (48 px on the desktop tier) and a track never draws fewer than three, so its shortest
// track is 184 px there. The width is that track, from the tier tables, so no tier overflows it.
describe('the volume slider width holds the shortest track at every cabinet tier', () => {
  it.each(Object.keys(CABINET_BOX_HEIGHT) as CabinetTier[])('%s tier', (tier) => {
    stubShell(true);
    const { container } = render(<Header />);
    const width = parseFloat(container.querySelector<HTMLElement>('header')!.style.getPropertyValue('--header-volume-width'));
    expect(width).toBeGreaterThan(0);

    const reserve = computeVoxelTrackTrailingReserve('horizontal');
    const boxes = computeFittedBoxCount(width - reserve, CABINET_BOX_HEIGHT[tier], CABINET_VOXEL_GAP[tier]);
    expect(boxes).toBeGreaterThanOrEqual(VOXEL_TRACK_MIN_BOX_COUNT);
    expect(computeVoxelTrackLength(boxes, CABINET_BOX_HEIGHT[tier], CABINET_VOXEL_GAP[tier]) + reserve).toBeLessThanOrEqual(width);
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
  });
});

describe('Header.tsx — the slide and its constants are gone (Task 6)', () => {
  it('reads no nav-panel flag and no media query of its own: the shell comes from useShell', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'Header.tsx'), 'utf8');
    expect(source).not.toMatch(/HEADER_NAV_CLEARANCE|isNavPanelOpen|matchMedia|nav-clearance/);
    expect(source).toMatch(/useShell\(\)/);
  });
});

describe('Header.css — one row beside the power corner', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'Header.css'), 'utf-8');

  it('has no media query: what differs by shell comes from useShell (spec Assumption 1), not the stylesheet', () => {
    expect(css).not.toMatch(/@media/);
  });

  // Crawford, 2026-10-12: the header, the meta box and the nav panel's plate share one top margin, the nav's:
  // its padding-top, --spacing-xl, so the three plates start level.
  it("sits at --header-top, the one offset the top bar is measured from, the nav plate's own top margin", () => {
    expect(getCssRuleBody(css, '#screen-viewport')).toContain('--header-top: var(--spacing-xl);');
    const navCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'nav/NavPanel.css'), 'utf-8');
    expect(getCssRuleBody(navCss, '.nav-panel')).toMatch(/padding:\s*var\(--spacing-xl\)/);
    expect(getCssRuleBody(css, '.header')).toContain('top: var(--header-top);');
  });

  // Measured in Chrome: the power corner (126 px on the phone, 160 on the desk) reaches lower than the
  // header, and the nav sheet ran 9 px under it at 320 px. The top bar ends where the lower of the two does.
  it('declares the top bar\'s lower edge as the header or the power corner beside it, whichever reaches lower', () => {
    expect(getCssRuleBody(css, '#screen-viewport')).toContain(
      '--top-bar-bottom: max(calc(var(--header-top) + var(--header-height, 0px)), var(--power-corner-height));',
    );
  });

  it('the row never wraps and keeps the power corner clear on its right', () => {
    const body = getCssRuleBody(css, '.header__row');
    expect(body).not.toBeNull();
    expect(body).toContain('flex-wrap: nowrap;');
    expect(body).toContain('calc(var(--power-corner-width) + var(--spacing-md))');
  });

  // The 320 px fit: on the phone the row is mute and the volume box, two fixed touch targets and a gap,
  // beside the power corner's reserve — nothing in it grows with content or holds a min-width.
  it('the volume box is a fixed touch target that never grows or shrinks', () => {
    const body = getCssRuleBody(css, '.header__volume-trigger');
    expect(body).not.toBeNull();
    expect(body).toContain('flex: 0 0 auto;');
    expect(getCssRuleBody(css, '.header__volume-trigger .sc-cabinet-box__front')).toContain('width: var(--touch-target-size);');
  });

  it('the slider, desk row or pop-out, has one width and no min-width of its own', () => {
    const row = getCssRuleBody(css, '.header__controls .sc-slider-linear');
    expect(row).toContain('width: var(--header-volume-width);');
    expect(row).not.toMatch(/min-width/);
    expect(getCssRuleBody(css, '.header__volume-popover .sc-slider-linear')).toContain('width: var(--header-volume-width);');
  });

  it('the volume box reads as on while open: the accent fill a checked Toggle gets', () => {
    expect(getCssRuleBody(css, ".header__volume-trigger[data-state='open'] .sc-cabinet-box__front")).toContain(
      'background: var(--color-accent-gradient);',
    );
  });

  // Crawford, 2026-10-11: the well and the panel under it take one width and sit one inset from the tablet's
  // edge. The stack is as wide as the wider of the two (the well's text is its content), up to the free band
  // left of the power corner; both stretch to it, and a longer well scrolls.
  it('the phone stack is content-wide, capped at the free band, inset from the left edge', () => {
    expect(getCssRuleBody(css, '.header--phone')).toContain('flex-direction: column;');
    const stack = getCssRuleBody(css, '.header__stack');
    for (const declaration of [
      'display: flex;',
      'flex-direction: column;',
      'width: fit-content;',
      'max-width: calc(100% - var(--power-corner-width) - 2 * var(--spacing-md));',
      'margin-left: var(--spacing-md);',
      'gap: var(--header-row-gap);',
    ]) {
      expect(stack).toContain(declaration);
    }
    expect(getCssRuleBody(css, '.header__stack > .sc-cabinet-box')).toContain('align-self: stretch;');
    // The desk's plate rule (.header > .sc-cabinet-box > .sc-cabinet-box__front) misses the stack's, so the
    // stack's front restates it: a block, no padding of its own, as wide as the stack (measured in Chrome:
    // without it the plate overran the well by 15 px and the controls sat 14 px in from the panel's edge).
    const front = getCssRuleBody(css, '.header__stack > .sc-cabinet-box > .sc-cabinet-box__front');
    for (const declaration of ['display: block;', 'width: 100%;', 'height: auto;', 'padding: 0;', 'box-sizing: border-box;']) {
      expect(front).toContain(declaration);
    }
    expect(getCssRuleBody(css, '.header--phone .header__row')).toContain('padding: var(--spacing-sm) var(--spacing-md);');
    expect(getCssRuleBody(css, '.header__controls')).toContain('display: flex;');
  });

  // The well holds all the info and scrolls sideways when it is longer than the stack.
  it('the well scrolls sideways and never truncates, and stretches to the stack', () => {
    const body = getCssRuleBody(css, '.header__well');
    expect(body).not.toBeNull();
    for (const declaration of ['align-self: stretch;', 'overflow-x: auto;', 'white-space: nowrap;', 'min-width: 0;', 'pointer-events: auto;']) {
      expect(body).toContain(declaration);
    }
    expect(body).not.toContain('text-overflow');
    expect(body).not.toContain('margin');
  });

  // The ruler mirrors the room the controls line has: the stack's inset and the panel's padding on the left,
  // the corner's reserve and the same two on the right.
  it('the ruler is an empty, invisible box spanning the free band left of the power corner', () => {
    const body = getCssRuleBody(css, '.header__ruler');
    expect(body).not.toBeNull();
    for (const declaration of ['position: absolute;', 'height: 0;', 'visibility: hidden;', 'pointer-events: none;', 'left: calc(2 * var(--spacing-md));', 'right: calc(var(--power-corner-width) + 2 * var(--spacing-md));']) {
      expect(body).toContain(declaration);
    }
  });

  it('the well wears the shared well tokens (index.css), as the meta box and the breadcrumb do', () => {
    const body = getCssRuleBody(css, '.header__well');
    expect(body).toContain('background: var(--well-background);');
    expect(body).toContain('box-shadow: var(--well-inset), inset 0 0 8px var(--color-accent);');
  });

  // Toggle.css makes .sc-toggle width: 100% and an inline-size container; the existing .header__controls > .sc-toggle
  // override already sizes the menu to its 44 px box, so the menu needs no rule of its own.
  it('the menu is sized by the same controls rule as mute', () => {
    expect(getCssRuleBody(css, '.header__controls > .sc-toggle')).toContain('width: auto;');
  });

  it('the phone band leaves the bottom alone: no bar, no bottom clearance variable', () => {
    expect(css).not.toMatch(/phone-bar-/);
  });

  it('the pop-out takes pointer events back from the header, which lets presses through to the world', () => {
    expect(getCssRuleBody(css, '.header')).toContain('pointer-events: none;');
    expect(getCssRuleBody(css, '.header__volume-popover')).toContain('pointer-events: auto;');
  });
});
