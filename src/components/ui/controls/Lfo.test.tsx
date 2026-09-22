import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 10) can tell whether Lfo's render body actually re-executed. Lfo has
// no hook/utility call of its own, but it unconditionally composes a
// RadioButton and two SliderLinears (each calling resolveAccessibleName
// internally) — if Lfo bails via memo, its body never constructs any of
// those elements, so none of their own calls fire either — same "bailed
// subtree root stops everything beneath it" reasoning as StepperWithToggle/
// CoordsInput's own Task 8/9 tests.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { Lfo } from './Lfo';
import { resolveAccessibleName } from './accessibleName';
import { LFO_RATE_MIN, LFO_RATE_MAX, LFO_DEPTH_MIN, LFO_DEPTH_MAX } from '@/types/lfo';
import type { LfoSchema, LfoValue } from '@/types/controls';

const schema: LfoSchema = { id: 'volumeLfo', type: 'lfo', humanLabel: 'Volume LFO' };
const value: LfoValue = { shape: 'sine', rate: 2, depth: 40 };

/** Controllable ResizeObserver mock, same shape as useAutoSliderOrientation.test.ts's own —
 *  used here to prove Rate/Depth stay 'horizontal' even when every ResizeObserver in the
 *  tree fires a tall ("would-be-vertical") rect. If either slider were still 'auto'
 *  (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3), its own orientation-driving observer
 *  would flip it to 'vertical' on exactly this callback. */
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire(width: number, height: number) {
    this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}
let originalResizeObserver: typeof ResizeObserver;

describe('Lfo', () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    originalResizeObserver = globalThis.ResizeObserver;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
  });

  it('renders both the Rate and Depth sliders with a fixed horizontal orientation, immune to a tall-parent resize', () => {
    const { container, rerender } = render(<Lfo schema={schema} value={value} onChange={() => {}} />);
    let sliders = container.querySelectorAll('.sc-slider-linear');
    expect(sliders).toHaveLength(2);
    sliders.forEach((slider) => {
      expect(slider.getAttribute('data-orientation')).toBe('horizontal');
    });

    // Fire every ResizeObserver in the tree with a tall rect. If either slider were
    // still 'auto', its own orientation observer would flip it to 'vertical' here.
    act(() => {
      MockResizeObserver.instances.forEach((observer) => observer.fire(100, 1000));
    });
    rerender(<Lfo schema={schema} value={value} onChange={() => {}} />);

    sliders = container.querySelectorAll('.sc-slider-linear');
    sliders.forEach((slider) => {
      expect(slider.getAttribute('data-orientation')).toBe('horizontal');
    });
  });

  it('renders an actual RadioButton (4 shape options) and two SliderLinears — no separate active toggle', () => {
    render(<Lfo schema={schema} value={value} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'TRIANGLE' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'SINE' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'SQUARE' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'SAWTOOTH' })).toBeTruthy();
    expect(screen.getAllByRole('slider')).toHaveLength(2);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it("the rate slider's own draggable minimum is LFO_RATE_MIN (0Hz) — rate=0 is now a real, reachable value, not something to stay off of", () => {
    render(<Lfo schema={schema} value={value} onChange={() => {}} />);
    const [rateSlider] = screen.getAllByRole('slider');
    expect(rateSlider.getAttribute('aria-valuemin')).toBe(String(LFO_RATE_MIN));
    expect(rateSlider.getAttribute('aria-valuemax')).toBe(String(LFO_RATE_MAX));
  });

  it('steps the rate slider by clean 0.05 increments per arrow-key press, not the default step of 1', () => {
    const onChange = vi.fn();
    render(<Lfo schema={schema} value={value} onChange={onChange} />);
    const [rateSlider] = screen.getAllByRole('slider');
    rateSlider.focus();
    fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });
    // Radix's step grid anchors to min (0) — 0, 0.05, 0.1, ..., 2.0, 2.05,
    // 2.1... — landing exactly on 2.05 from a starting value of 2, not the
    // old default step of 1 (which would land on 3).
    expect(onChange).toHaveBeenCalledWith({ shape: 'sine', rate: 2.05, depth: 40 });
  });

  it("the depth slider's bounds match LFO_DEPTH_MIN/MAX from src/types/lfo.ts", () => {
    render(<Lfo schema={schema} value={value} onChange={() => {}} />);
    const [, depthSlider] = screen.getAllByRole('slider');
    expect(depthSlider.getAttribute('aria-valuemin')).toBe(String(LFO_DEPTH_MIN));
    expect(depthSlider.getAttribute('aria-valuemax')).toBe(String(LFO_DEPTH_MAX));
  });

  it('calls onChange with the complete LfoValue when the shape changes', () => {
    const onChange = vi.fn();
    render(<Lfo schema={schema} value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'SQUARE' }));
    expect(onChange).toHaveBeenCalledWith({ shape: 'square', rate: 2, depth: 40 });
  });

  it('calls onChange with the complete LfoValue when the rate slider changes to 0', () => {
    const onChange = vi.fn();
    render(<Lfo schema={schema} value={{ shape: 'sine', rate: 0.05, depth: 40 }} onChange={onChange} />);
    const [rateSlider] = screen.getAllByRole('slider');
    rateSlider.focus();
    fireEvent.keyDown(rateSlider, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith({ shape: 'sine', rate: 0, depth: 40 });
  });

  it('adds an isActive class to the component root when rate > 0', () => {
    const { container } = render(<Lfo schema={schema} value={value} onChange={() => {}} />);
    expect(container.querySelector('.sc-lfo.isActive')).toBeTruthy();
  });

  it('omits the isActive class from the component root when rate is 0', () => {
    const { container } = render(<Lfo schema={schema} value={{ ...value, rate: 0 }} onChange={() => {}} />);
    expect(container.querySelector('.sc-lfo.isActive')).toBeNull();
    expect(container.querySelector('.sc-lfo')).toBeTruthy();
  });

  it('is not disabled by default', () => {
    render(<Lfo schema={schema} value={value} onChange={() => {}} />);
    expect(screen.getAllByRole('slider')[0].getAttribute('data-disabled')).toBeNull();
  });

  it('disables every internal control (shape radio, both sliders) when disabled is true', () => {
    render(<Lfo schema={schema} value={value} onChange={() => {}} disabled />);
    expect(screen.getByRole('radio', { name: 'SINE' }).getAttribute('data-disabled')).toBe('');
    screen.getAllByRole('slider').forEach((slider) => {
      expect(slider.getAttribute('data-disabled')).toBe('');
    });
  });

  describe('heldOff (Audio Load Budget)', () => {
    it('shows Rate and Depth as 0 and Shape deselected, regardless of the real stored value', () => {
      render(<Lfo schema={schema} value={value} onChange={() => {}} disabled heldOff />);
      const [rateSlider, depthSlider] = screen.getAllByRole('slider');
      expect(rateSlider.getAttribute('aria-valuenow')).toBe('0');
      expect(depthSlider.getAttribute('aria-valuenow')).toBe('0');
      for (const name of ['TRIANGLE', 'SINE', 'SQUARE', 'SAWTOOTH']) {
        expect(screen.getByRole('radio', { name }).getAttribute('aria-checked')).toBe('false');
      }
    });

    it('shows the real stored value when heldOff is false, even while otherwise disabled', () => {
      render(<Lfo schema={schema} value={value} onChange={() => {}} disabled heldOff={false} />);
      const [rateSlider, depthSlider] = screen.getAllByRole('slider');
      expect(rateSlider.getAttribute('aria-valuenow')).toBe('2');
      expect(depthSlider.getAttribute('aria-valuenow')).toBe('40');
      expect(screen.getByRole('radio', { name: 'SINE' }).getAttribute('aria-checked')).toBe('true');
    });

    it('omits the isActive class when heldOff is true, even though the real rate is > 0', () => {
      const { container } = render(<Lfo schema={schema} value={value} onChange={() => {}} disabled heldOff />);
      expect(container.querySelector('.sc-lfo.isActive')).toBeNull();
    });

    it('adds the sc-held-off class to the component root when heldOff is true, and omits it otherwise', () => {
      const { container, rerender } = render(<Lfo schema={schema} value={value} onChange={() => {}} disabled heldOff />);
      expect(container.querySelector('.sc-lfo.sc-held-off')).toBeTruthy();

      rerender(<Lfo schema={schema} value={value} onChange={() => {}} />);
      expect(container.querySelector('.sc-lfo.sc-held-off')).toBeNull();
    });

    it('never mutates the value it hands to onChange — the real stored value is what a later reconnect would use', () => {
      // heldOff always ships with disabled=true from every real caller, so this can't fire from a
      // user interaction, but the contract still matters: nothing here should replace `value`
      // itself, only what child controls are shown.
      const onChange = vi.fn();
      render(<Lfo schema={schema} value={value} onChange={onChange} heldOff />);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 10)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((Lfo as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body (or its composed RadioButton/SliderLinears) on a re-render with identical props', () => {
      const onChange = () => {};
      const { rerender } = render(<Lfo schema={schema} value={value} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<Lfo schema={schema} value={value} onChange={onChange} />);
      rerender(<Lfo schema={schema} value={value} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(<Lfo schema={schema} value={value} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<Lfo schema={schema} value={{ ...value, rate: 5 }} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    // Live-verified regression follow-up (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md's
    // AudioRigLfoGroup fix, same session): even once Lfo's OWN memo bails correctly at the
    // AudioRigLfoGroup level, its 3 internal children (shape RadioButton, rate/depth
    // SliderLinears) used to rebuild fresh schema objects AND fresh onChange closures on every
    // render of Lfo itself — so whenever Lfo legitimately re-rendered because ONE field changed
    // (e.g. dragging Rate), the other two sibling controls re-rendered too, even though their own
    // value/schema/onChange were all unchanged. Each internal schema.id (`${schema.id}.shape`
    // etc.) lets resolveAccessibleName's own call-argument schema.id distinguish which specific
    // child re-executed, the same filtering technique AudioRigDrawer.test.tsx's own cascade tests
    // use.
    describe('field-level isolation among its own 3 internal children (shape/rate/depth)', () => {
      function callsFor(schemaId: string): number {
        return (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([s]) => s.id === schemaId,
        ).length;
      }

      it('changing only rate does not re-execute the shape RadioButton or depth SliderLinear', () => {
        const onChange = () => {};
        const { rerender } = render(<Lfo schema={schema} value={value} onChange={onChange} />);
        const rateCallsBefore = callsFor('volumeLfo.rate');
        const shapeCallsBefore = callsFor('volumeLfo.shape');
        const depthCallsBefore = callsFor('volumeLfo.depth');
        expect(rateCallsBefore).toBeGreaterThan(0);
        expect(shapeCallsBefore).toBeGreaterThan(0);
        expect(depthCallsBefore).toBeGreaterThan(0);

        rerender(<Lfo schema={schema} value={{ ...value, rate: 5 }} onChange={onChange} />);

        expect(callsFor('volumeLfo.rate')).toBeGreaterThan(rateCallsBefore);
        expect(callsFor('volumeLfo.shape')).toBe(shapeCallsBefore);
        expect(callsFor('volumeLfo.depth')).toBe(depthCallsBefore);
      });

      it('changing only shape does not re-execute the rate or depth SliderLinears', () => {
        const onChange = () => {};
        const { rerender } = render(<Lfo schema={schema} value={value} onChange={onChange} />);
        const rateCallsBefore = callsFor('volumeLfo.rate');
        const depthCallsBefore = callsFor('volumeLfo.depth');

        rerender(<Lfo schema={schema} value={{ ...value, shape: 'square' }} onChange={onChange} />);

        expect(callsFor('volumeLfo.rate')).toBe(rateCallsBefore);
        expect(callsFor('volumeLfo.depth')).toBe(depthCallsBefore);
      });
    });
  });
});
