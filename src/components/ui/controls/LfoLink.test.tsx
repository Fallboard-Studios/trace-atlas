import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { LfoLink } from './LfoLink';
import { LFO_DEPTH_MIN, LFO_DEPTH_MAX } from '@/types/lfo';
import type { LfoLinkSchema, LfoLinkValue } from '@/types/controls';

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
    originalResizeObserver = globalThis.ResizeObserver;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
  });

  it('renders the 5 lane options (Off, a-d) and one Depth slider', () => {
    render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Off' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Core LFO' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Companion LFO' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Accent LFO' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Overtone LFO' })).toBeTruthy();
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
    expect(screen.getByRole('radio', { name: 'Companion LFO' }).getAttribute('aria-checked')).toBe('true');
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
    fireEvent.click(screen.getByRole('radio', { name: 'Core LFO' }));
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
      expect(screen.getByRole('radio', { name: 'Companion LFO' }).getAttribute('aria-checked')).toBe('true');
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

  // docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.5: Lane left, Depth right on desktop; stacked
  // below it — the same viewport tier every 'responsive' DirectionalPanel reads. jsdom computes no
  // layout, so the orientation is pinned through the data attribute the CSS keys off (LfoLink.css,
  // pinned by LfoLink.css.test.ts) and the DOM order of the two controls.
  describe('layout: Lane | Depth share a row on desktop (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.5)', () => {
    /** Mobile (max-width: 639px) and tablet (max-width: 1023px) queries controlled independently,
     *  with their 'change' listeners triggerable — the useResponsivePanelOrientation.test.ts shape. */
    function stubMatchMedia(initial: { mobile: boolean; tablet: boolean }) {
      const state = { ...initial };
      const listeners = new Map<string, Set<(e: { matches: boolean }) => void>>();
      const queryKind = (query: string): 'mobile' | 'tablet' => (query.includes('639px') ? 'mobile' : 'tablet');
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => {
          const kind = queryKind(query);
          if (!listeners.has(query)) listeners.set(query, new Set());
          return {
            get matches() { return state[kind]; },
            media: query,
            addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners.get(query)!.add(cb); },
            removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners.get(query)!.delete(cb); },
          };
        }),
      });
      return {
        fireChange(kind: 'mobile' | 'tablet', matches: boolean) {
          state[kind] = matches;
          for (const [query, cbs] of listeners) if (queryKind(query) === kind) cbs.forEach((cb) => cb({ matches }));
        },
      };
    }

    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    afterEach(() => {
      if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
      else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    });

    const root = (container: HTMLElement) => container.querySelector('.sc-lfo-link')!;

    it("is a row on desktop (neither the mobile nor the tablet query matches)", () => {
      stubMatchMedia({ mobile: false, tablet: false });
      const { container } = render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
      expect(root(container).getAttribute('data-orientation')).toBe('row');
    });

    it('is a column on tablet', () => {
      stubMatchMedia({ mobile: false, tablet: true });
      const { container } = render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
      expect(root(container).getAttribute('data-orientation')).toBe('column');
    });

    it('is a column on mobile', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      const { container } = render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
      expect(root(container).getAttribute('data-orientation')).toBe('column');
    });

    it('is a row when matchMedia does not exist at all (the tier hook defaults to desktop)', () => {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      const { container } = render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
      expect(root(container).getAttribute('data-orientation')).toBe('row');
    });

    it('keeps the Lane radio group before the Depth slider in DOM order, in both orientations', () => {
      for (const tier of [{ mobile: false, tablet: false }, { mobile: false, tablet: true }]) {
        stubMatchMedia(tier);
        const { unmount } = render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
        const lane = screen.getByRole('radio', { name: 'Off' });
        const depth = screen.getByRole('slider');
        expect(lane.compareDocumentPosition(depth) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        unmount();
      }
    });

    it('follows a live tier change without a remount — desktop to tablet flips row to column', () => {
      const media = stubMatchMedia({ mobile: false, tablet: false });
      const { container } = render(<LfoLink schema={schema} value={value} onChange={() => {}} />);
      expect(root(container).getAttribute('data-orientation')).toBe('row');
      act(() => media.fireChange('tablet', true));
      expect(root(container).getAttribute('data-orientation')).toBe('column');
    });

    it('the row orientation changes nothing about heldOff: Off and depth 0 are still what is shown', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      const { container } = render(<LfoLink schema={schema} value={{ lane: 'b', depth: 40 }} onChange={() => {}} disabled heldOff />);
      expect(root(container).getAttribute('data-orientation')).toBe('row');
      expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
      expect(container.querySelector('.sc-lfo-link.isActive')).toBeNull();
    });
  });
});

describe('LfoLink reads its copy from src/content (docs/specs/CONTENT_LAYER.md)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'LfoLink.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]|>Off<|Core LFO|Companion LFO|Accent LFO|Overtone LFO/);
  });
});
