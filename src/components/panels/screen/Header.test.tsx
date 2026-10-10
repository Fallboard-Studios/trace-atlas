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
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
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

  it('sits at --header-top, the one offset the top bar is measured from', () => {
    expect(getCssRuleBody(css, '#screen-viewport')).toContain('--header-top: 20px;');
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
    const row = getCssRuleBody(css, '.header__row .sc-slider-linear');
    expect(row).toContain('width: var(--header-volume-width);');
    expect(row).not.toMatch(/min-width/);
    expect(getCssRuleBody(css, '.header__volume-popover .sc-slider-linear')).toContain('width: var(--header-volume-width);');
  });

  it('the volume box reads as on while open: the accent fill a checked Toggle gets', () => {
    expect(getCssRuleBody(css, ".header__volume-trigger[data-state='open'] .sc-cabinet-box__front")).toContain(
      'background: var(--color-accent-gradient);',
    );
  });

  it('the pop-out takes pointer events back from the header, which lets presses through to the world', () => {
    expect(getCssRuleBody(css, '.header')).toContain('pointer-events: none;');
    expect(getCssRuleBody(css, '.header__volume-popover')).toContain('pointer-events: auto;');
  });
});
