import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { LfoLink, LFO_LINK_DEPTH_BOXES } from './LfoLink';
import { LFO_DEPTH_MIN, LFO_DEPTH_MAX } from '@/types/lfo';
import { CABINET_BOX_HEIGHT, CABINET_BREAKPOINT_MOBILE_MAX, CABINET_BREAKPOINT_TABLET_MAX, CABINET_VOXEL_GAP, type CabinetTier } from '@/utils/cabinetBreakpoints';
import { computeVoxelTrackLength, computeVoxelTrackTrailingReserve } from '@/utils/voxelTrackMath';
import type { LfoLinkSchema, LfoLinkValue } from '@/types/controls';

// The lane names follow the shell (docs/specs/LAYOUT_REWORK.md §1.4, Task 14). jsdom has no matchMedia, so
// useShell is mocked: desk by default (the full names), flipped to phone where a test says so.
const shell = vi.hoisted(() => ({ current: 'desk' as 'desk' | 'phone' }));
vi.mock('@/components/panels/screen/useShell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/panels/screen/useShell')>()),
  useShell: () => shell.current,
}));

const schema: LfoLinkSchema = { id: 'layer0.gain', type: 'lfoLink', humanLabel: 'Gain' };
const value: LfoLinkValue = { lane: null, depth: 30 };

/** SliderLinear's own box-fitting needs a ResizeObserver even while forced 'horizontal' —
 *  same controllable mock Lfo.test.tsx uses for its sibling SliderLinears. */
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
let originalResizeObserver: typeof ResizeObserver;

describe('LfoLink', () => {
  beforeEach(() => {
    shell.current = 'desk';
    originalResizeObserver = globalThis.ResizeObserver;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
  });

  it('renders the 5 lane options (Off, a-d) and one Depth slider', () => {
    render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Off' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Core LFO (A)' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Companion LFO (B)' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Accent LFO (C)' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Overtone LFO (D)' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
  });

  it('shows Off selected and the stored depth when lane is null', () => {
    render(<LfoLink schema={schema} value={{ lane: null, depth: 30 }} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('30');
  });

  it('shows the stored lane selected when lane is set', () => {
    render(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Companion LFO (B)' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('false');
  });

  it('the depth slider bounds match LFO_DEPTH_MIN/MAX from src/types/lfo.ts', () => {
    render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuemin')).toBe(String(LFO_DEPTH_MIN));
    expect(slider.getAttribute('aria-valuemax')).toBe(String(LFO_DEPTH_MAX));
  });

  it('fires onChange with the lane changed and depth preserved when a lane option is chosen', () => {
    const onChange = vi.fn();
    render(<LfoLink schema={schema} value={{ lane: null, depth: 30 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Core LFO (A)' }));
    expect(onChange).toHaveBeenCalledWith({ lane: 'a', depth: 30 });
  });

  it('fires onChange with lane set to null when Off is chosen from a lit lane', () => {
    const onChange = vi.fn();
    render(<LfoLink schema={schema} value={{ lane: 'c', depth: 50 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(onChange).toHaveBeenCalledWith({ lane: null, depth: 50 });
  });

  it('fires onChange with the depth changed and lane preserved when the depth slider changes', () => {
    const onChange = vi.fn();
    render(<LfoLink schema={schema} value={{ lane: 'a', depth: 30 }} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith({ lane: 'a', depth: 31 });
  });

  it('adds an isActive class to the root when a lane is set, omits it when off', () => {
    const { container, rerender } = render(<LfoLink schema={schema} value={{ lane: 'a', depth: 30 }} onChange={() => {}} />);
    expect(container.querySelector('.sc-lfo-link.isActive')).toBeTruthy();

    rerender(<LfoLink schema={schema} value={{ lane: null, depth: 30 }} onChange={() => {}} />);
    expect(container.querySelector('.sc-lfo-link.isActive')).toBeNull();
  });

  it('disables the lane radio group and the depth slider when disabled is true', () => {
    render(<LfoLink schema={schema} value={value} onChange={() => {}} disabled />);
    expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider').getAttribute('data-disabled')).toBe('');
  });

  describe('heldOff (Audio Load Budget)', () => {
    it('shows Off selected and depth 0 regardless of the real stored value', () => {
      render(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={() => {}} disabled heldOff />);
      expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    });

    it('shows the real stored value when heldOff is false, even while otherwise disabled', () => {
      render(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={() => {}} disabled heldOff={false} />);
      expect(screen.getByRole('radio', { name: 'Companion LFO (B)' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('40');
    });

    it('omits the isActive class even though the real lane is set', () => {
      const { container } = render(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={() => {}} disabled heldOff />);
      expect(container.querySelector('.sc-lfo-link.isActive')).toBeNull();
    });

    it('renders no HeldOffNote of its own — the caller renders it', () => {
      render(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={() => {}} disabled heldOff />);
      expect(screen.queryByRole('note')).toBeNull();
    });

    it('never mutates the value or calls onChange on its own — a later reconnect uses the real stored value', () => {
      const onChange = vi.fn();
      render(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={onChange} heldOff />);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('React.memo', () => {
    it('is a React.memo-wrapped component', () => {
      expect((LfoLink as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  // docs/specs/LAYOUT_REWORK.md §1.4, Task 14: the lane row is single-line, full lane names with their letter
  // on the desk shell and the letters on the phone (the sketch's link row; laneTitle's "Core LFO (LFO A)" is
  // the LFO Bank's tab title, a different form). Each option's text is also its accessible name.
  describe('lane names by shell', () => {
    const DESK = ['Off', 'Core LFO (A)', 'Companion LFO (B)', 'Accent LFO (C)', 'Overtone LFO (D)'];
    const PHONE = ['Off', 'A', 'B', 'C', 'D'];

    it('desk: Off, then each lane\'s full name with its letter, as both the visible text and the accessible name', () => {
      render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
      const radios = screen.getAllByRole('radio');
      expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(DESK);
      expect(radios.map((r) => r.textContent)).toEqual(DESK);
    });

    it('phone: Off, then the letters', () => {
      shell.current = 'phone';
      render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
      const radios = screen.getAllByRole('radio');
      expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(PHONE);
      expect(radios.map((r) => r.textContent)).toEqual(PHONE);
    });

    it('a shell change relabels the options, keeps the selection, and never calls onChange', () => {
      const onChange = vi.fn();
      const { rerender } = render(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={onChange} />);
      expect(screen.getByRole('radio', { name: 'Companion LFO (B)' }).getAttribute('aria-checked')).toBe('true');

      shell.current = 'phone';
      rerender(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={onChange} />);
      expect(screen.getByRole('radio', { name: 'B' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.queryByRole('radio', { name: 'Companion LFO (B)' })).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('phone: picking a letter sets that lane and keeps the depth', () => {
      shell.current = 'phone';
      const onChange = vi.fn();
      render(<LfoLink schema={schema} value={{ lane: null, depth: 30 }} onChange={onChange} />);
      fireEvent.click(screen.getByRole('radio', { name: 'C' }));
      expect(onChange).toHaveBeenCalledWith({ lane: 'c', depth: 30 });
    });

    it('phone: heldOff still shows Off and depth 0', () => {
      shell.current = 'phone';
      render(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={() => {}} disabled heldOff />);
      expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    });
  });

  // Crawford, 2026-10-10: app sizes (tier boxes, the 44 px touch floor), the strip wrapping under the lane
  // row where both do not fit; and the Lane and Depth label rows kept, each with its own "?". jsdom computes
  // no layout, so the wrap itself is not checked; here, the structure and the strip.
  describe('the compact row', () => {
    /** The real link schemas carry no labels of their own (SignatureArrayDrawer, AudioRigDrawer). */
    const bare: LfoLinkSchema = { id: 'layer0.gain.link', type: 'lfoLink' };

    it('keeps two label rows, Lane then Depth, each with its own help "?" — an unlabeled link adds none', () => {
      const { container } = render(<LfoLink schema={bare} value={value} onChange={() => {}} />);
      const labelRows = [...container.querySelectorAll('.sc-dual-label')];
      expect(labelRows).toHaveLength(2);
      expect(labelRows[0].querySelector('.sc-dual-label__human')?.textContent).toBe('Lane');
      expect(labelRows[1].querySelector('.sc-dual-label__human')?.textContent).toBe('Depth');
      for (const row of labelRows) expect(row.querySelectorAll('.sc-help__trigger')).toHaveLength(1);
    });

    it('puts the lane radio group and the depth slider in one row, lane first', () => {
      const { container } = render(<LfoLink schema={bare} value={value} onChange={() => {}} />);
      const row = container.querySelector('.sc-lfo-link__row')!;
      const lane = screen.getByRole('group', { name: 'Lane' });
      const depth = screen.getByRole('slider');
      expect(row.contains(lane)).toBe(true);
      expect(row.contains(depth)).toBe(true);
      expect(lane.compareDocumentPosition(depth) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('no longer switches orientation by tier: the row wraps instead, so there is no data-orientation', () => {
      const { container } = render(<LfoLink schema={bare} value={value} onChange={() => {}} />);
      expect(container.querySelector('[data-orientation="row"], [data-orientation="column"]')).toBeNull();
    });

    /** A matchMedia that evaluates `(min|max-width: Npx)` against a simulated width; any other query does not match. */
    function stubViewport(width: number) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query: string) => {
          const m = /\((min|max)-width:\s*(\d+)px\)/.exec(query);
          const n = m ? Number(m[2]) : 0;
          return {
            matches: m ? (m[1] === 'min' ? width >= n : width <= n) : false,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          };
        },
      });
    }
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    afterEach(() => {
      if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
      else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    });

    const TIERS: [CabinetTier, number][] = [
      ['mobile', CABINET_BREAKPOINT_MOBILE_MAX],
      ['tablet', CABINET_BREAKPOINT_TABLET_MAX],
      ['desktop', CABINET_BREAKPOINT_TABLET_MAX + 1],
    ];

    /** The depth slider fits its box count to its own wrapper's measured width (useVoxelTrackBoxCount); this
     *  ResizeObserver lets a test hand that wrapper a width. */
    class FittingResizeObserver {
      static instances: FittingResizeObserver[] = [];
      targets: Element[] = [];
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        FittingResizeObserver.instances.push(this);
      }
      observe(target: Element) { this.targets.push(target); }
      unobserve() {}
      disconnect() {}
      fire(width: number) {
        this.callback([{ contentRect: { width, height: 0 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
    }
    beforeEach(() => {
      FittingResizeObserver.instances = [];
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FittingResizeObserver;
    });
    const fitDepth = (container: HTMLElement, width: number) => {
      const wrapper = container.querySelector('.sc-slider-linear')!;
      const observer = FittingResizeObserver.instances.find((o) => o.targets.includes(wrapper))!;
      act(() => observer.fire(width));
    };
    const eightBoxLength = (tier: CabinetTier) =>
      computeVoxelTrackLength(LFO_LINK_DEPTH_BOXES, CABINET_BOX_HEIGHT[tier], CABINET_VOXEL_GAP[tier]) + computeVoxelTrackTrailingReserve('horizontal');

    it.each(TIERS)('%s (viewport %ipx): the row offers the depth slider exactly an 8-box track at the tier\'s box size', (tier, width) => {
      stubViewport(width);
      const { container } = render(<LfoLink schema={bare} value={{ lane: 'a', depth: 55 }} onChange={() => {}} />);
      expect(LFO_LINK_DEPTH_BOXES).toBe(8);
      const row = container.querySelector<HTMLElement>('.sc-lfo-link__row')!;
      expect(row.style.getPropertyValue('--lfo-link-depth-length')).toBe(`${eightBoxLength(tier)}px`);
    });

    it.each(TIERS)('%s (viewport %ipx): given that length, the strip is 8 boxes, one cabinet box tall', (tier, width) => {
      stubViewport(width);
      const { container } = render(<LfoLink schema={bare} value={{ lane: 'a', depth: 55 }} onChange={() => {}} />);
      fitDepth(container, eightBoxLength(tier));
      expect(container.querySelector('.sc-voxel-track')?.children).toHaveLength(LFO_LINK_DEPTH_BOXES);
      expect(container.querySelector<HTMLElement>('.sc-slider-linear__root')?.style.height).toBe(`${CABINET_BOX_HEIGHT[tier]}px`);
    });

    // The phone's narrowest pane (288 px at a 320 px viewport, measured in Chrome) is narrower than the 8-box
    // strip (328 px at the mobile tier): the strip shrinks with its line and fits fewer boxes, never overflowing.
    it('on a line narrower than the 8-box length, the strip fits fewer boxes — 7 in the 288 px phone pane', () => {
      stubViewport(CABINET_BREAKPOINT_MOBILE_MAX);
      const { container } = render(<LfoLink schema={bare} value={{ lane: 'a', depth: 55 }} onChange={() => {}} />);
      fitDepth(container, 288);
      expect(container.querySelector('.sc-voxel-track')?.children).toHaveLength(7);
    });
  });
});
