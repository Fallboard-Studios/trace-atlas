import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 3 correction — found via Task 12's own end-to-end debugging: this
// component's own React.memo wrap was missed originally, only the internal
// states useMemo was added) can tell whether SliderCenteredZero's render body
// actually re-executed — resolveAccessibleName(schema) is called
// unconditionally on the Slider.Thumb's aria-label.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

// Local gsap mock (overriding vitest.setup.ts's own shared one, whose quickTo mock defers
// onComplete to a microtask — unusable for the synchronous assertions below) — same technique
// SliderLinear.test.tsx/useEasedControlValue.test.ts already use: the retarget function quickTo
// returns mutates the target and fires onUpdate/onComplete synchronously, so a value-changing
// rerender's ease is already fully settled by the time rerender() itself returns.
vi.mock('gsap', () => ({
  default: {
    quickTo: vi.fn((target: Record<string, number>, prop: string, vars?: { onUpdate?: () => void; onComplete?: () => void }) => {
      return vi.fn((value: number) => {
        target[prop] = value;
        vars?.onUpdate?.();
        vars?.onComplete?.();
      });
    }),
    killTweensOf: vi.fn(),
  },
}));

vi.mock('./VoxelTrack', () => ({
  VoxelTrack: ({
    states,
    boxSize,
    gap,
    axis,
    timelineKeyPrefix,
  }: {
    states: unknown[];
    boxSize: number;
    gap: number;
    axis: string;
    timelineKeyPrefix: string;
  }) => (
    <div
      data-testid="voxel-track"
      data-states={JSON.stringify(states)}
      data-box-size={boxSize}
      data-gap={gap}
      data-axis={axis}
      data-timeline-key-prefix={timelineKeyPrefix}
    />
  ),
}));

import gsap from 'gsap';
import { SliderCenteredZero } from './SliderCenteredZero';
import { resolveAccessibleName } from './accessibleName';
import {
  computeFittedBoxCount,
  computeVoxelTrackLength,
  computeVoxelTrackTrailingReserve,
  computeVoxelBoxStatesCenteredZero,
  VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT,
  VOXEL_TRACK_MIN_BOX_COUNT_EVEN,
} from '@/utils/voxelTrackMath';
// Separate namespace import so computeVoxelBoxStatesCenteredZero can be spied
// on as a real cross-module call from SliderCenteredZero.tsx's own
// perspective (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 3) — distinct
// from the named import above, which existing tests already use directly to
// compute expected values, unspied.
import * as voxelTrackMath from '@/utils/voxelTrackMath';
import type { SliderCenteredZeroSchema } from '@/types/controls';

const detuneSchema: SliderCenteredZeroSchema = { id: 'detune', type: 'sliderCenteredZero', min: -50, max: 50, humanLabel: 'Detune', unit: 'ct', orientation: 'horizontal' };

// Desktop-tier box geometry (no window.matchMedia in this jsdom environment
// -> useCabinetBoxHeight()/useVoxelTrackGap() both fall back to 'desktop',
// same assumption SliderLinear.test.tsx/SliderLog.test.tsx already make).
const BOX_SIZE = 48;
const GAP = 12;

/**
 * Controllable ResizeObserver mock, mirroring SliderLog.test.tsx's own
 * convention exactly.
 */
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
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

let originalResizeObserver: typeof ResizeObserver;

beforeEach(() => {
  MockResizeObserver.instances = [];
  originalResizeObserver = globalThis.ResizeObserver;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  // gsap.quickTo is a shared module-level spy (mocked above) — clear it per test so one test's
  // ease doesn't pollute the next's call-count assertions.
  (gsap.quickTo as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
});

describe('SliderCenteredZero component', () => {
  it('renders its own schema labels via an internally-composed DualLabel', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
    expect(screen.getByText('Detune')).toBeTruthy();
  });

  it('renders {value}{unit} when schema.unit is present', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={-15} onChange={() => {}} />);
    expect(screen.getByText('-15ct')).toBeTruthy();
  });

  it('caps the displayed value at 3 decimal places, hiding floating-point noise', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={-14.999999999999998} onChange={() => {}} />);
    expect(screen.getByText('-15ct')).toBeTruthy();
  });

  it('still renders the bare value when schema.unit is absent', () => {
    const noUnitSchema: SliderCenteredZeroSchema = { id: 'x', type: 'sliderCenteredZero', min: -50, max: 50, orientation: 'horizontal' };
    render(<SliderCenteredZero schema={noUnitSchema} value={-15} onChange={() => {}} />);
    expect(screen.getByText('-15')).toBeTruthy();
  });

  it('reflects min/max/value on the underlying slider', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={10} onChange={() => {}} />);
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('aria-valuemin')).toBe('-50');
    expect(thumb.getAttribute('aria-valuemax')).toBe('50');
    expect(thumb.getAttribute('aria-valuenow')).toBe('10');
  });

  // The ease behavior itself (instant drag, retarget-not-recreate, reduced motion, etc.) is
  // fully covered by useEasedControlValue.test.ts — this just confirms SliderCenteredZero wires
  // the shared hook correctly.
  describe('250ms ease on a non-drag value change (shared with SliderLinear/SliderLog via useEasedControlValue)', () => {
    it('a live drag/keyboard step applies instantly, never eased', () => {
      const onChange = vi.fn();
      render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={onChange} />);
      const thumb = screen.getByRole('slider');
      thumb.focus();
      fireEvent.keyDown(thumb, { key: 'ArrowRight' });

      expect(onChange).toHaveBeenCalled();
      expect(gsap.quickTo).not.toHaveBeenCalled();
    });

    it('a prop-driven (non-drag) value change eases via quickTo, settling on the new value', () => {
      const { rerender } = render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
      rerender(<SliderCenteredZero schema={detuneSchema} value={25} onChange={() => {}} />);

      expect(gsap.quickTo).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('25');
    });
  });

  it('falls back to schema.id for the accessible name when neither label is present, never leaving it unlabeled', () => {
    const bareSchema: SliderCenteredZeroSchema = { id: 'detune', type: 'sliderCenteredZero', min: -50, max: 50, orientation: 'horizontal' };
    render(<SliderCenteredZero schema={bareSchema} value={0} onChange={() => {}} />);
    expect(screen.getByRole('slider', { name: 'detune' })).toBeTruthy();
  });

  it('is not disabled by default — no existing behavior changes', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('data-disabled')).toBeNull();
    expect(thumb.getAttribute('tabindex')).toBe('0');
  });

  it('marks the thumb data-disabled and removes it from tab order when disabled is true', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} disabled />);
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('data-disabled')).toBe('');
    expect(thumb.getAttribute('tabindex')).toBeNull();
  });

  it('does not call onChange on a disabled slider when a keyboard step is attempted', () => {
    const onChange = vi.fn();
    render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={onChange} disabled />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('defaults to a keyboard step of 1 when schema.step is unset', () => {
    const onChange = vi.fn();
    render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={onChange} />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('uses schema.step for the keyboard step when set', () => {
    const onChange = vi.fn();
    const steppedSchema: SliderCenteredZeroSchema = { ...detuneSchema, step: 5 };
    render(<SliderCenteredZero schema={steppedSchema} value={0} onChange={onChange} />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("resolves to exactly one role='slider' element — the voxel boxes introduce no accessibility-tree ambiguity", () => {
    render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
  });

  it('renders VoxelTrack with states matching computeVoxelBoxStatesCenteredZero(value, schema.min, schema.max, boxCount) for a positive value', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={25} onChange={() => {}} />);
    const voxelTrack = screen.getByTestId('voxel-track');
    // No ResizeObserver fired -> boxCount falls back to the forced-even floor.
    const expectedStates = computeVoxelBoxStatesCenteredZero(25, -50, 50, VOXEL_TRACK_MIN_BOX_COUNT_EVEN);
    expect(JSON.parse(voxelTrack.getAttribute('data-states')!)).toEqual(expectedStates);
    expect(voxelTrack.getAttribute('data-box-size')).toBe(String(BOX_SIZE));
    expect(voxelTrack.getAttribute('data-gap')).toBe(String(GAP));
  });

  it('renders VoxelTrack with states matching computeVoxelBoxStatesCenteredZero for a negative value', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={-25} onChange={() => {}} />);
    const voxelTrack = screen.getByTestId('voxel-track');
    const expectedStates = computeVoxelBoxStatesCenteredZero(-25, -50, 50, VOXEL_TRACK_MIN_BOX_COUNT_EVEN);
    expect(JSON.parse(voxelTrack.getAttribute('data-states')!)).toEqual(expectedStates);
  });

  it('renders VoxelTrack with every box flat at value === 0', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
    const voxelTrack = screen.getByTestId('voxel-track');
    const states = JSON.parse(voxelTrack.getAttribute('data-states')!);
    expect(states.every((s: { fillPercent: number; popT: number; isStraddling: boolean }) =>
      s.fillPercent === 0 && s.popT === 0 && !s.isStraddling,
    )).toBe(true);
  });

  it('the box count is always even — VoxelTrack never receives an odd-length states array', () => {
    render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
    const voxelTrack = screen.getByTestId('voxel-track');
    const states = JSON.parse(voxelTrack.getAttribute('data-states')!);
    expect(states.length % 2).toBe(0);
  });

  it('disabled does not change the states passed to VoxelTrack — the visual read is unaffected by disabled', () => {
    const { unmount } = render(<SliderCenteredZero schema={detuneSchema} value={25} onChange={() => {}} />);
    const enabledStates = screen.getByTestId('voxel-track').getAttribute('data-states');
    unmount();
    render(<SliderCenteredZero schema={detuneSchema} value={25} onChange={() => {}} disabled />);
    const disabledStates = screen.getByTestId('voxel-track').getAttribute('data-states');
    expect(disabledStates).toBe(enabledStates);
  });

  it("the seam is always dead-center (Math.floor(boxCount / 2)), not proportional to the schema's own zero fraction — asymmetric bounds (-20/+50)", () => {
    const asymmetricSchema: SliderCenteredZeroSchema = { id: 'asym', type: 'sliderCenteredZero', min: -20, max: 50, orientation: 'horizontal' };

    render(<SliderCenteredZero schema={asymmetricSchema} value={5} onChange={() => {}} />);
    const positiveVoxelTrack = screen.getByTestId('voxel-track');
    const positiveStates = JSON.parse(positiveVoxelTrack.getAttribute('data-states')!);
    // A 4-box row split dead-center puts exactly 2 boxes on each side —
    // the first 2 (negative side) stay entirely flat for a positive value,
    // regardless of how far zeroPointPercent(-20, 50) (~28.57%) sits from
    // the row's true center.
    expect(positiveStates.slice(0, 2).every((s: { fillPercent: number }) => s.fillPercent === 0)).toBe(true);
    expect(positiveStates.slice(2, 4).some((s: { fillPercent: number }) => s.fillPercent > 0)).toBe(true);
  });

  describe('orientation', () => {
    const verticalSchema: SliderCenteredZeroSchema = { ...detuneSchema, orientation: 'vertical' };
    const autoSchema: SliderCenteredZeroSchema = { ...detuneSchema, orientation: 'auto' };

    it("'vertical': passes orientation=\"vertical\" through to the underlying Radix root", () => {
      const { container } = render(<SliderCenteredZero schema={verticalSchema} value={0} onChange={() => {}} />);
      const root = container.querySelector('.sc-slider-centered-zero__root');
      expect(root?.getAttribute('data-orientation')).toBe('vertical');
    });

    it("'vertical': the outer wrapper carries data-orientation=\"vertical\" — CSS keys off this to go inline-flex and center its column", () => {
      const { container } = render(<SliderCenteredZero schema={verticalSchema} value={0} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-centered-zero');
      expect(wrapper?.getAttribute('data-orientation')).toBe('vertical');
    });

    it("'horizontal' (default): the outer wrapper carries data-orientation=\"horizontal\", not left unset", () => {
      const { container } = render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-centered-zero');
      expect(wrapper?.getAttribute('data-orientation')).toBe('horizontal');
    });

    it("'vertical': renders the value readout before the track in DOM order — a dragging thumb must never cover it", () => {
      const { container } = render(<SliderCenteredZero schema={verticalSchema} value={0} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-centered-zero')!;
      const children = Array.from(wrapper.children);
      const valueIndex = children.findIndex((c) => c.classList.contains('sc-slider-centered-zero__value'));
      const rootIndex = children.findIndex((c) => c.classList.contains('sc-slider-centered-zero__root'));
      expect(valueIndex).toBeGreaterThanOrEqual(0);
      expect(rootIndex).toBeGreaterThanOrEqual(0);
      expect(valueIndex).toBeLessThan(rootIndex);
    });

    it("'horizontal' (default): renders the value readout after the track, unchanged from before orientation existed", () => {
      const { container } = render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-centered-zero')!;
      const children = Array.from(wrapper.children);
      const valueIndex = children.findIndex((c) => c.classList.contains('sc-slider-centered-zero__value'));
      const rootIndex = children.findIndex((c) => c.classList.contains('sc-slider-centered-zero__root'));
      expect(rootIndex).toBeLessThan(valueIndex);
    });

    it("'vertical': omitting verticalHeight fits synchronously against the fixed VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT budget, then rounds down to the nearest even count — the correct height is present on the very first render, with no ResizeObserver callback needed", () => {
      const { container } = render(<SliderCenteredZero schema={verticalSchema} value={0} onChange={() => {}} />);
      const root = container.querySelector<HTMLElement>('.sc-slider-centered-zero__root');
      const rawBoxCount = computeFittedBoxCount(VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT, BOX_SIZE, GAP);
      expect(rawBoxCount % 2).toBe(0); // sanity-check this fixture doesn't accidentally exercise rounding
      const expectedLength = computeVoxelTrackLength(rawBoxCount, BOX_SIZE, GAP);
      expect(root?.style.height).toBe(`${expectedLength}px`);
    });

    it("'vertical': verticalHeight is a fitting BUDGET, forced to an even box count — the rendered height is the box-quantized, forced-even length, not verticalHeight verbatim and not the raw odd-count length either", () => {
      // 310 fits 5 boxes raw (odd) -> forced down to 4.
      const { container } = render(
        <SliderCenteredZero schema={verticalSchema} value={0} onChange={() => {}} verticalHeight={310} />,
      );
      const root = container.querySelector<HTMLElement>('.sc-slider-centered-zero__root');
      const rawBoxCount = computeFittedBoxCount(310, BOX_SIZE, GAP);
      expect(rawBoxCount % 2).toBe(1); // sanity-check the fixture's own premise (raw fit is odd)
      const rawLength = computeVoxelTrackLength(rawBoxCount, BOX_SIZE, GAP);
      const forcedEvenLength = computeVoxelTrackLength(rawBoxCount - 1, BOX_SIZE, GAP);
      expect(root?.style.height).toBe(`${forcedEvenLength}px`);
      expect(root?.style.height).not.toBe('310px');
      expect(root?.style.height).not.toBe(`${rawLength}px`);
    });

    it("'horizontal': ignores a verticalHeight prop entirely for sizing, sets an inline width from the fitted-then-forced-even box count plus its own trailing pop-out reserve, and an inline height equal to the box's own cross-axis size", () => {
      const { container } = render(
        <SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} verticalHeight={300} />,
      );
      const observer = MockResizeObserver.instances[0];
      // 288px fits exactly 5 boxes (odd) before the reserve is added back.
      const reserve = computeVoxelTrackTrailingReserve('horizontal');
      act(() => observer.fire(288 + reserve, 0));

      const root = container.querySelector<HTMLElement>('.sc-slider-centered-zero__root');
      const rawBoxCount = computeFittedBoxCount(288, BOX_SIZE, GAP);
      expect(rawBoxCount % 2).toBe(1); // sanity-check the fixture's own premise
      const expectedLength = computeVoxelTrackLength(rawBoxCount - 1, BOX_SIZE, GAP) + reserve;
      expect(root?.style.width).toBe(`${expectedLength}px`);
      expect(root?.style.height).toBe(`${BOX_SIZE}px`);
    });

    it("'auto': renders without throwing, resolving to horizontal-looking output before any ResizeObserver measurement fires", () => {
      const { container } = render(<SliderCenteredZero schema={autoSchema} value={0} onChange={() => {}} />);
      const root = container.querySelector('.sc-slider-centered-zero__root');
      expect(root?.getAttribute('data-orientation')).toBe('horizontal');
    });
  });

  describe('computeVoxelBoxStatesCenteredZero memoization (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 3)', () => {
    it('does not recompute states across re-renders with unchanged value/schema.min/schema.max/boxCount', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStatesCenteredZero');
      const { rerender } = render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;
      expect(callsAfterMount).toBeGreaterThan(0);

      rerender(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
      rerender(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);

      expect(spy.mock.calls.length).toBe(callsAfterMount);
    });

    it('recomputes states when value changes (once the 250ms ease settles — a prop-driven value change is no longer instant, Crawford\'s own request)', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStatesCenteredZero');
      const { rerender } = render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;

      rerender(<SliderCenteredZero schema={detuneSchema} value={25} onChange={() => {}} />);

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('recomputes states when schema.min/schema.max change, even with value unchanged', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStatesCenteredZero');
      const { rerender } = render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;

      const widerSchema: SliderCenteredZeroSchema = { ...detuneSchema, max: 100 };
      rerender(<SliderCenteredZero schema={widerSchema} value={0} onChange={() => {}} />);

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('recomputes states when the fitted (forced-even) boxCount changes (a ResizeObserver measurement), even with value/schema unchanged', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStatesCenteredZero');
      render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;

      // 500px resolves to a forced-even box count of 8 — clearly different
      // from the default (unmeasured) forced-even minimum of 4
      // (VOXEL_TRACK_MIN_BOX_COUNT_EVEN). 288px (used elsewhere in this
      // file) happens to resolve to the same forced-even count (4) as the
      // default, which would make this assertion a false negative.
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(500, 0));

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 3 correction — SliderCenteredZero itself, not just its internal states useMemo)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((SliderCenteredZero as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with identical props', () => {
      const onChange = () => {};
      const { rerender } = render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<SliderCenteredZero schema={detuneSchema} value={0} onChange={onChange} />);
      rerender(<SliderCenteredZero schema={detuneSchema} value={0} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(<SliderCenteredZero schema={detuneSchema} value={0} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<SliderCenteredZero schema={detuneSchema} value={25} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
