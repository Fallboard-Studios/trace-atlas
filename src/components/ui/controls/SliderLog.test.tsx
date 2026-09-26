import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 2 correction — found via Task 12's own end-to-end debugging: this
// component's own React.memo wrap was missed originally, only the internal
// states useMemo was added) can tell whether SliderLog's render body
// actually re-executed — resolveAccessibleName(schema) is called
// unconditionally on the Slider.Thumb's aria-label.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

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

import { SliderLog } from './SliderLog';
import { resolveAccessibleName } from './accessibleName';
import { LOG_EPSILON, sliderLogTToValue, sliderLogValueToT } from './sliderLogMath';
import {
  computeFittedBoxCount,
  computeVoxelTrackLength,
  computeVoxelTrackTrailingReserve,
  computeVoxelBoxStates,
  VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT,
} from '@/utils/voxelTrackMath';
// Separate namespace import so computeVoxelBoxStates can be spied on as a real
// cross-module call from SliderLog.tsx's own perspective (docs/tasks/
// OBLIQUE_CABINETRY_MEMOIZATION.md Task 2) — distinct from the named import
// above, which existing tests already use directly to compute expected
// values, unspied.
import * as voxelTrackMath from '@/utils/voxelTrackMath';
import type { SliderLogSchema } from '@/types/controls';

// Attack/Decay/Release bounds (docs/reference/ROBOT_DATA_GRID.md), the min = 0 fixture.
const schema: SliderLogSchema = { id: 'attack', type: 'sliderLog', min: 0, max: 10, humanLabel: 'Attack', unit: 's', orientation: 'horizontal' };

// Desktop-tier box geometry (no window.matchMedia in this jsdom environment
// -> useCabinetBoxHeight()/useVoxelTrackGap() both fall back to 'desktop',
// same assumption SliderLinear.test.tsx already makes).
const BOX_SIZE = 48;
const GAP = 12;

/**
 * Controllable ResizeObserver mock, mirroring SliderLinear.test.tsx's own
 * convention — captures the callback so a test can fire it manually with a
 * fake contentRect, and records how many observers got constructed.
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
});

afterEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
});

describe('sliderLogTToValue / sliderLogValueToT (exact math, min = 0)', () => {
  it('maps t = 0 to exactly schema.min, including the min = 0 case', () => {
    expect(sliderLogTToValue(0, 0, 10)).toBe(0);
  });

  it('maps t = 1 to exactly schema.max', () => {
    expect(sliderLogTToValue(1, 0, 10)).toBeCloseTo(10, 10);
  });

  it('the midpoint (t = 0.5) is not the arithmetic mean of min/max — proves genuine log spacing', () => {
    const midpoint = sliderLogTToValue(0.5, 0, 10);
    expect(midpoint).not.toBeCloseTo(5, 5);
    // Exact value per the resolved epsilon-floor formula: floor * (max/floor)^0.5, floor = LOG_EPSILON.
    expect(midpoint).toBeCloseTo(Math.sqrt(LOG_EPSILON * 10), 10);
  });

  it('round-trips value -> t -> value accurately across the full range', () => {
    for (const value of [0, 0.01, 0.1, 1, 5, 10]) {
      const t = sliderLogValueToT(value, 0, 10);
      const roundTripped = sliderLogTToValue(t, 0, 10);
      expect(roundTripped).toBeCloseTo(value, 5);
    }
  });

  it('value <= min maps to exactly t = 0', () => {
    expect(sliderLogValueToT(0, 0, 10)).toBe(0);
  });
});

describe('SliderLog (min > 0 fixture)', () => {
  it('round-trips accurately when min > LOG_EPSILON', () => {
    const t = sliderLogValueToT(1000, 20, 20000);
    const roundTripped = sliderLogTToValue(t, 20, 20000);
    expect(roundTripped).toBeCloseTo(1000, 5);
  });
});

describe('SliderLog component', () => {
  it('renders its own schema labels via an internally-composed DualLabel', () => {
    render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
    expect(screen.getByText('Attack')).toBeTruthy();
  });

  it('renders {value}{unit} from the display value, not the internal t', () => {
    render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
    expect(screen.getByText('2s')).toBeTruthy();
  });

  it('still renders the bare value when schema.unit is absent — a unitless param like Resonance/Q must not be left blank', () => {
    const noUnitSchema: SliderLogSchema = { id: 'q', type: 'sliderLog', min: 0.1, max: 20, humanLabel: 'Resonance', orientation: 'horizontal' };
    render(<SliderLog schema={noUnitSchema} value={5} onChange={() => {}} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('caps the displayed value at 3 decimal places, hiding floating-point noise', () => {
    render(<SliderLog schema={schema} value={4.999999999999999} onChange={() => {}} />);
    expect(screen.getByText('5s')).toBeTruthy();
  });

  describe('formatValue (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.6)', () => {
    it('uses formatValue for the displayed label when present, ignoring unit entirely', () => {
      const formatValue = (v: number) => `custom:${v}`;
      const formattedSchema: SliderLogSchema = { ...schema, formatValue };
      render(<SliderLog schema={formattedSchema} value={2} onChange={() => {}} />);
      expect(screen.getByText('custom:2')).toBeTruthy();
      expect(screen.queryByText('2s')).toBeNull();
    });

    it('falls back to formatDisplayValue(value) + unit when formatValue is absent — regression guard', () => {
      render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
      expect(screen.getByText('2s')).toBeTruthy();
    });

    it('passes the raw (unrounded) value to formatValue, not the pre-rounded display value', () => {
      const formatValue = vi.fn((v: number) => `raw:${v}`);
      const formattedSchema: SliderLogSchema = { ...schema, formatValue };
      render(<SliderLog schema={formattedSchema} value={4.999999999999999} onChange={() => {}} />);
      expect(formatValue).toHaveBeenCalledWith(4.999999999999999);
    });
  });

  it('onChange receives the mapped display value, never the raw internal t', () => {
    const onChange = vi.fn();
    render(<SliderLog schema={schema} value={0} onChange={onChange} />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    // Starting at value 0 (t = 0), one ArrowRight step advances the internal
    // t by the Slider.Root `step` (0.001) — the mapped display value at that
    // t is a genuine log-curve point, not the raw 0.001 t-delta itself.
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const received = onChange.mock.calls[0][0];
    const rawTDelta = 0.001;
    expect(received).not.toBe(rawTDelta);
    expect(received).toBeCloseTo(sliderLogTToValue(rawTDelta, schema.min, schema.max), 10);
  });

  it('falls back to schema.id for the accessible name when neither label is present, never leaving it unlabeled', () => {
    const bareSchema: SliderLogSchema = { id: 'attack', type: 'sliderLog', min: 0, max: 10, orientation: 'horizontal' };
    render(<SliderLog schema={bareSchema} value={2} onChange={() => {}} />);
    expect(screen.getByRole('slider', { name: 'attack' })).toBeTruthy();
  });

  it('is not disabled by default — no existing behavior changes', () => {
    render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('data-disabled')).toBeNull();
    expect(thumb.getAttribute('tabindex')).toBe('0');
  });

  it('marks the thumb data-disabled and removes it from tab order when disabled is true', () => {
    render(<SliderLog schema={schema} value={2} onChange={() => {}} disabled />);
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('data-disabled')).toBe('');
    expect(thumb.getAttribute('tabindex')).toBeNull();
  });

  it('does not call onChange on a disabled slider when a keyboard step is attempted', () => {
    const onChange = vi.fn();
    render(<SliderLog schema={schema} value={2} onChange={onChange} disabled />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("resolves to exactly one role='slider' element — the voxel boxes introduce no accessibility-tree ambiguity", () => {
    render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
  });

  it('renders VoxelTrack with states matching computeVoxelBoxStates(t, 0, 1, boxCount) — using the same normalized t already fed to Radix, not the raw value against schema.min/max', () => {
    render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
    const observer = MockResizeObserver.instances[0];
    act(() => observer.fire(500, 0));

    const voxelTrack = screen.getByTestId('voxel-track');
    const reserve = computeVoxelTrackTrailingReserve('horizontal');
    const boxCount = computeFittedBoxCount(500 - reserve, BOX_SIZE, GAP);
    const t = sliderLogValueToT(2, schema.min, schema.max);
    const expectedStates = computeVoxelBoxStates(t, 0, 1, boxCount);
    expect(JSON.parse(voxelTrack.getAttribute('data-states')!)).toEqual(expectedStates);
    expect(voxelTrack.getAttribute('data-box-size')).toBe(String(BOX_SIZE));
    expect(voxelTrack.getAttribute('data-gap')).toBe(String(GAP));
  });

  describe('orientation', () => {
    const verticalSchema: SliderLogSchema = { ...schema, orientation: 'vertical' };
    const autoSchema: SliderLogSchema = { ...schema, orientation: 'auto' };

    it("'vertical': passes orientation=\"vertical\" through to the underlying Radix root", () => {
      const { container } = render(<SliderLog schema={verticalSchema} value={2} onChange={() => {}} />);
      const root = container.querySelector('.sc-slider-log__root');
      expect(root?.getAttribute('data-orientation')).toBe('vertical');
    });

    it("'vertical': the outer wrapper carries data-orientation=\"vertical\" — CSS keys off this to go inline-flex and center its column", () => {
      const { container } = render(<SliderLog schema={verticalSchema} value={2} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-log');
      expect(wrapper?.getAttribute('data-orientation')).toBe('vertical');
    });

    it("'horizontal' (default): the outer wrapper carries data-orientation=\"horizontal\", not left unset", () => {
      const { container } = render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-log');
      expect(wrapper?.getAttribute('data-orientation')).toBe('horizontal');
    });

    it("'vertical': renders the value readout before the track in DOM order — a dragging thumb must never cover it", () => {
      const { container } = render(<SliderLog schema={verticalSchema} value={2} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-log')!;
      const children = Array.from(wrapper.children);
      const valueIndex = children.findIndex((c) => c.classList.contains('sc-slider-log__value'));
      const rootIndex = children.findIndex((c) => c.classList.contains('sc-slider-log__root'));
      expect(valueIndex).toBeGreaterThanOrEqual(0);
      expect(rootIndex).toBeGreaterThanOrEqual(0);
      expect(valueIndex).toBeLessThan(rootIndex);
    });

    it("'horizontal' (default): renders the value readout after the track, unchanged from before orientation existed", () => {
      const { container } = render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-log')!;
      const children = Array.from(wrapper.children);
      const valueIndex = children.findIndex((c) => c.classList.contains('sc-slider-log__value'));
      const rootIndex = children.findIndex((c) => c.classList.contains('sc-slider-log__root'));
      expect(rootIndex).toBeLessThan(valueIndex);
    });

    it("'vertical': omitting verticalHeight fits synchronously against a fixed default budget (VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT, matching --slider-vertical-height's own 256px) rather than live-measuring the parent — the correct height is present on the very first render, with no ResizeObserver callback needed to reach it", () => {
      const { container } = render(<SliderLog schema={verticalSchema} value={2} onChange={() => {}} />);

      const root = container.querySelector<HTMLElement>('.sc-slider-log__root');
      const boxCount = computeFittedBoxCount(VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT, BOX_SIZE, GAP);
      const expectedLength = computeVoxelTrackLength(boxCount, BOX_SIZE, GAP);
      expect(root?.style.height).toBe(`${expectedLength}px`);
    });

    it("'vertical': verticalHeight is a fitting BUDGET, not a literal applied value — the rendered height is the box-quantized length, even for a verticalHeight that isn't an exact multiple of (boxSize + gap)", () => {
      // 310 is deliberately not a multiple of (48 + 12) = 60.
      const { container } = render(
        <SliderLog schema={verticalSchema} value={2} onChange={() => {}} verticalHeight={310} />,
      );
      const root = container.querySelector<HTMLElement>('.sc-slider-log__root');
      const boxCount = computeFittedBoxCount(310, BOX_SIZE, GAP);
      const expectedLength = computeVoxelTrackLength(boxCount, BOX_SIZE, GAP);
      expect(root?.style.height).toBe(`${expectedLength}px`);
      expect(root?.style.height).not.toBe('310px');
    });

    it("'horizontal': ignores a verticalHeight prop entirely for sizing, sets an inline width from the fitted box count plus its own trailing pop-out reserve (main axis) and an inline height equal to the box's own cross-axis size (not the old stale CSS default)", () => {
      const { container } = render(
        <SliderLog schema={schema} value={2} onChange={() => {}} verticalHeight={300} />,
      );
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(500, 0));

      const root = container.querySelector<HTMLElement>('.sc-slider-log__root');
      const reserve = computeVoxelTrackTrailingReserve('horizontal');
      const boxCount = computeFittedBoxCount(500 - reserve, BOX_SIZE, GAP);
      const expectedLength = computeVoxelTrackLength(boxCount, BOX_SIZE, GAP) + reserve;
      expect(root?.style.width).toBe(`${expectedLength}px`);
      // Cross-axis: the boxes are BOX_SIZE tall, so Root must be too — no
      // longer the stale 20px CSS default the old thin-line track used.
      expect(root?.style.height).toBe(`${BOX_SIZE}px`);
    });

    it("'auto': renders without throwing, resolving to horizontal-looking output before any ResizeObserver measurement fires", () => {
      const { container } = render(<SliderLog schema={autoSchema} value={2} onChange={() => {}} />);
      const root = container.querySelector('.sc-slider-log__root');
      expect(root?.getAttribute('data-orientation')).toBe('horizontal');
    });

    it("orientation has no effect on the log-curve mapping — onChange still receives the mapped display value", () => {
      const onChange = vi.fn();
      render(<SliderLog schema={verticalSchema} value={0} onChange={onChange} />);
      const thumb = screen.getByRole('slider');
      thumb.focus();
      fireEvent.keyDown(thumb, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledTimes(1);
      const received = onChange.mock.calls[0][0];
      expect(received).toBeCloseTo(sliderLogTToValue(0.001, schema.min, schema.max), 10);
    });
  });

  describe('computeVoxelBoxStates memoization (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 2)', () => {
    it('does not recompute states across re-renders with unchanged value/schema.min/schema.max/boxCount', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStates');
      const { rerender } = render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;
      expect(callsAfterMount).toBeGreaterThan(0);

      rerender(<SliderLog schema={schema} value={2} onChange={() => {}} />);
      rerender(<SliderLog schema={schema} value={2} onChange={() => {}} />);

      expect(spy.mock.calls.length).toBe(callsAfterMount);
    });

    it('recomputes states when value changes (t itself changes)', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStates');
      const { rerender } = render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;

      rerender(<SliderLog schema={schema} value={5} onChange={() => {}} />);

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('recomputes states when schema.min/schema.max change, even with the raw value unchanged — t is derived from schema too', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStates');
      const { rerender } = render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;

      const widerSchema: SliderLogSchema = { ...schema, max: 20 };
      rerender(<SliderLog schema={widerSchema} value={2} onChange={() => {}} />);

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('recomputes states when the fitted boxCount changes (a ResizeObserver measurement), even with value/schema unchanged', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStates');
      render(<SliderLog schema={schema} value={2} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;

      // 500px is wide enough to fit more than the default (unmeasured) 3-box
      // minimum — see SliderLinear.test.tsx's own equivalent test for why
      // 240px would be a false negative here.
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(500, 0));

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 2 correction — SliderLog itself, not just its internal states useMemo)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((SliderLog as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with identical props', () => {
      const onChange = () => {};
      const { rerender } = render(<SliderLog schema={schema} value={2} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<SliderLog schema={schema} value={2} onChange={onChange} />);
      rerender(<SliderLog schema={schema} value={2} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(<SliderLog schema={schema} value={2} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<SliderLog schema={schema} value={5} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
