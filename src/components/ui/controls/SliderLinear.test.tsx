import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 1 correction — found via Task 12's own end-to-end debugging: this
// component's own React.memo wrap was missed originally, only the internal
// states useMemo was added) can tell whether SliderLinear's render body
// actually re-executed — resolveAccessibleName(schema) is called
// unconditionally on the Slider.Thumb's aria-label.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

// Local gsap mock (overriding vitest.setup.ts's own shared one, whose quickTo mock defers
// onComplete to a microtask — unusable for the synchronous assertions below) — mirrors
// useEasedControlValue.test.ts's own mock: the retarget function quickTo returns mutates the
// target synchronously and fires onUpdate/onComplete immediately, so a value-changing rerender's
// ease is already fully settled by the time rerender() itself returns. No separate flush step
// needed (unlike the app-level tests elsewhere that go through the shared async mock).
let lastTweenVars: { duration?: number; ease?: string } | undefined;
vi.mock('gsap', () => ({
  default: {
    quickTo: vi.fn((target: Record<string, number>, prop: string, vars?: { duration?: number; ease?: string; onUpdate?: () => void; onComplete?: () => void }) => {
      lastTweenVars = vars;
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
import { SliderLinear } from './SliderLinear';
import { resolveAccessibleName } from './accessibleName';
import {
  computeFittedBoxCount,
  computeVoxelTrackLength,
  computeVoxelBoxStates,
  computeVoxelTrackTrailingReserve,
  VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT,
} from '@/utils/voxelTrackMath';
// Separate namespace import so computeVoxelBoxStates can be spied on as a real
// cross-module call from SliderLinear.tsx's own perspective (docs/tasks/
// OBLIQUE_CABINETRY_MEMOIZATION.md Task 1) — distinct from the named import
// above, which existing tests already use directly to compute expected
// values, unspied.
import * as voxelTrackMath from '@/utils/voxelTrackMath';
import type { SliderLinearSchema } from '@/types/controls';

const schema: SliderLinearSchema = { id: 'lfoRate', type: 'sliderLinear', min: 0.1, max: 10, humanLabel: 'Oscillation Rate', unit: 'Hz', orientation: 'horizontal' };

// Desktop-tier box geometry (no window.matchMedia in this jsdom environment
// -> useCabinetBoxHeight()/useVoxelTrackGap() both fall back to 'desktop',
// same assumption CabinetBox.test.tsx's own stubMatchMedia(false) makes).
const BOX_SIZE = 48;
const GAP = 12;

/**
 * Controllable ResizeObserver mock, mirroring useAutoSliderOrientation.test.ts/
 * useVoxelTrackBoxCount.test.ts's own convention — captures the callback so a
 * test can fire it manually with a fake contentRect, and records how many
 * observers got constructed.
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
  (gsap.killTweensOf as ReturnType<typeof vi.fn>).mockClear();
  lastTweenVars = undefined;
});

afterEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
});

describe('SliderLinear', () => {
  it('renders a slider reflecting min/max/value from schema', () => {
    render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('aria-valuemin')).toBe('0.1');
    expect(thumb.getAttribute('aria-valuemax')).toBe('10');
    expect(thumb.getAttribute('aria-valuenow')).toBe('2');
  });

  it('renders {value}{unit} when schema.unit is present', () => {
    render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
    expect(screen.getByText('2Hz')).toBeTruthy();
  });

  it('still renders the bare value when schema.unit is absent — a unitless param like Resonance/Q must not be left blank', () => {
    const noUnitSchema: SliderLinearSchema = { id: 'x', type: 'sliderLinear', min: 0, max: 1, orientation: 'horizontal' };
    render(<SliderLinear schema={noUnitSchema} value={0.5} onChange={() => {}} />);
    expect(screen.getByText('0.5')).toBeTruthy();
  });

  it('caps the displayed value at 3 decimal places, hiding floating-point noise — but leaves aria-valuenow at full precision', () => {
    render(<SliderLinear schema={schema} value={4.999999999999999} onChange={() => {}} />);
    expect(screen.getByText('5Hz')).toBeTruthy();
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('4.999999999999999');
  });

  // docs/specs/FREE_SYNC_TOGGLE.md §1.4 — mirrors SliderLogSchema.formatValue. The Sync-mode Rate/Delay
  // slider is this primitive with value = an index into a note list, and the readout is the note's name.
  describe('formatValue (docs/specs/FREE_SYNC_TOGGLE.md §1.4, Task 8)', () => {
    const noteNames = ['1 bar', '1/2', '1/4', '1/8'];
    const formatValue = (v: number) => noteNames[Math.round(v)];
    const indexSchema: SliderLinearSchema = { id: 'noteIdx', type: 'sliderLinear', min: 0, max: 3, step: 1, orientation: 'horizontal', formatValue };

    it('uses formatValue for the readout when present — the index renders as its name', () => {
      render(<SliderLinear schema={indexSchema} value={2} onChange={() => {}} />);
      expect(screen.getByText('1/4')).toBeTruthy();
      expect(screen.queryByText('2')).toBeNull();
    });

    it('appends no unit even when the schema also carries one — formatValue owns the whole readout', () => {
      const withUnit: SliderLinearSchema = { ...indexSchema, unit: 'Hz' };
      render(<SliderLinear schema={withUnit} value={2} onChange={() => {}} />);
      expect(screen.getByText('1/4')).toBeTruthy();
      expect(screen.queryByText('1/4Hz')).toBeNull();
    });

    it('applies in the readOnly branch too — the one valueLabel is shared', () => {
      render(<SliderLinear schema={indexSchema} value={3} onChange={() => {}} readOnly />);
      expect(screen.getByText('1/8')).toBeTruthy();
    });

    it('is unchanged when formatValue is absent — {value}{unit} exactly as before (regression guard)', () => {
      render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      expect(screen.getByText('2Hz')).toBeTruthy();
    });

    it('is unchanged when formatValue is absent and so is unit — the bare value (regression guard)', () => {
      const bare: SliderLinearSchema = { id: 'x', type: 'sliderLinear', min: 0, max: 1, orientation: 'horizontal' };
      render(<SliderLinear schema={bare} value={0.5} onChange={() => {}} />);
      expect(screen.getByText('0.5')).toBeTruthy();
    });

    it('passes formatValue the unrounded value, not the 3-decimal display string — rounding is the formatter\'s job', () => {
      const spy = vi.fn((v: number) => `raw:${v}`);
      render(<SliderLinear schema={{ ...indexSchema, formatValue: spy }} value={1.0004999} onChange={() => {}} />);
      expect(spy).toHaveBeenCalledWith(1.0004999);
      expect(screen.getByText('raw:1.0004999')).toBeTruthy();
    });

    it('follows a prop-driven value change — the readout re-renders to the new index\'s name once the ease settles', () => {
      const { rerender } = render(<SliderLinear schema={indexSchema} value={0} onChange={() => {}} />);
      expect(screen.getByText('1 bar')).toBeTruthy();

      rerender(<SliderLinear schema={indexSchema} value={3} onChange={() => {}} />);
      expect(screen.getByText('1/8')).toBeTruthy();
      expect(screen.queryByText('1 bar')).toBeNull();
    });

    it('follows a live keyboard step — ArrowRight moves the readout to the next name and calls onChange with the index', () => {
      const onChange = vi.fn();
      render(<SliderLinear schema={indexSchema} value={1} onChange={onChange} />);
      const thumb = screen.getByRole('slider');
      thumb.focus();
      fireEvent.keyDown(thumb, { key: 'ArrowRight' });

      expect(onChange).toHaveBeenCalledWith(2); // the index, never the formatted text
      expect(screen.getByText('1/4')).toBeTruthy();
    });

    it('leaves the thumb\'s numeric aria values alone — formatValue is display text only', () => {
      render(<SliderLinear schema={indexSchema} value={2} onChange={() => {}} />);
      const thumb = screen.getByRole('slider');
      expect(thumb.getAttribute('aria-valuenow')).toBe('2');
      expect(thumb.getAttribute('aria-valuemin')).toBe('0');
      expect(thumb.getAttribute('aria-valuemax')).toBe('3');
    });

    it('an empty-string return renders an empty readout — no unit, no fallback to the number', () => {
      const { container } = render(<SliderLinear schema={{ ...indexSchema, unit: 'Hz', formatValue: () => '' }} value={2} onChange={() => {}} />);
      expect(container.querySelector('.sc-slider-linear__value')?.textContent).toBe('');
    });

    it('keeps the readout in the same slot with the same class — after the track horizontally, before it vertically', () => {
      const horizontal = render(<SliderLinear schema={indexSchema} value={2} onChange={() => {}} />);
      const hKids = Array.from(horizontal.container.querySelector('.sc-slider-linear')!.children);
      expect(hKids.findIndex((c) => c.classList.contains('sc-slider-linear__root'))).toBeLessThan(
        hKids.findIndex((c) => c.classList.contains('sc-slider-linear__value')),
      );
      horizontal.unmount();

      const vertical = render(<SliderLinear schema={{ ...indexSchema, orientation: 'vertical' }} value={2} onChange={() => {}} />);
      const vKids = Array.from(vertical.container.querySelector('.sc-slider-linear')!.children);
      expect(vKids.findIndex((c) => c.classList.contains('sc-slider-linear__value'))).toBeLessThan(
        vKids.findIndex((c) => c.classList.contains('sc-slider-linear__root')),
      );
    });

    it('does not break the memo contract — a re-render with an identical schema (same formatValue reference) does not re-execute the render body', () => {
      const onChange = () => {};
      const { rerender } = render(<SliderLinear schema={indexSchema} value={2} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<SliderLinear schema={indexSchema} value={2} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    // docs/tasks/FREE_SYNC_TOGGLE.md Task 10 (folded in from Task 8's a11y gap): Radix exposes only
    // the numeric index through aria-valuenow, so a screen reader would announce "2" for "1/4".
    // aria-valuetext is the ARIA attribute that gives a value its human-readable form.
    describe('aria-valuetext — the thumb announces what the readout shows', () => {
      it('puts formatValue\'s return on the thumb, so the index is announced as its name', () => {
        render(<SliderLinear schema={indexSchema} value={2} onChange={() => {}} />);
        expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('1/4');
      });

      it('equals the visible readout exactly — one source for what is seen and what is heard', () => {
        const { container } = render(<SliderLinear schema={indexSchema} value={3} onChange={() => {}} />);
        expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe(container.querySelector('.sc-slider-linear__value')?.textContent);
      });

      it('carries no unit even when the schema also has one — formatValue owns the whole text', () => {
        render(<SliderLinear schema={{ ...indexSchema, unit: 'Hz' }} value={2} onChange={() => {}} />);
        expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('1/4');
      });

      it('is built from the same unrounded value the readout gets', () => {
        const spy = vi.fn((v: number) => `raw:${v}`);
        render(<SliderLinear schema={{ ...indexSchema, formatValue: spy }} value={1.0004999} onChange={() => {}} />);
        expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('raw:1.0004999');
      });

      it('follows a live keyboard step — ArrowRight moves the announced name along with the readout', () => {
        render(<SliderLinear schema={indexSchema} value={1} onChange={() => {}} />);
        const thumb = screen.getByRole('slider');
        expect(thumb.getAttribute('aria-valuetext')).toBe('1/2');
        thumb.focus();
        fireEvent.keyDown(thumb, { key: 'ArrowRight' });
        expect(thumb.getAttribute('aria-valuetext')).toBe('1/4');
      });

      it('follows a prop-driven value change once the ease settles', () => {
        const { rerender } = render(<SliderLinear schema={indexSchema} value={0} onChange={() => {}} />);
        expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('1 bar');
        rerender(<SliderLinear schema={indexSchema} value={3} onChange={() => {}} />);
        expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('1/8');
      });

      it('leaves aria-valuenow numeric and untouched alongside it', () => {
        render(<SliderLinear schema={indexSchema} value={2} onChange={() => {}} />);
        expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('2');
      });

      it('is present on a vertical slider too', () => {
        render(<SliderLinear schema={{ ...indexSchema, orientation: 'vertical' }} value={2} onChange={() => {}} />);
        expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('1/4');
      });

      it('is still present when the slider is disabled — a disabled control is still read', () => {
        render(<SliderLinear schema={indexSchema} value={2} onChange={() => {}} disabled />);
        expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('1/4');
      });

      it('does not appear at all when the schema has no formatValue — existing sliders\' markup is unchanged', () => {
        render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
        expect(screen.getByRole('slider').hasAttribute('aria-valuetext')).toBe(false);
      });

      it('does not appear when there is no formatValue and no unit either', () => {
        const bare: SliderLinearSchema = { id: 'x', type: 'sliderLinear', min: 0, max: 1, orientation: 'horizontal' };
        render(<SliderLinear schema={bare} value={0.5} onChange={() => {}} />);
        expect(screen.getByRole('slider').hasAttribute('aria-valuetext')).toBe(false);
      });

      it('does not leak into the readOnly branch, which has no thumb to carry it', () => {
        const { container } = render(<SliderLinear schema={indexSchema} value={2} onChange={() => {}} readOnly />);
        expect(container.querySelector('[aria-valuetext]')).toBeNull();
      });

      it('calls formatValue once per render, not once for the readout and again for the thumb', () => {
        const spy = vi.fn((v: number) => `n${Math.round(v)}`);
        render(<SliderLinear schema={{ ...indexSchema, formatValue: spy }} value={2} onChange={() => {}} />);
        expect(spy).toHaveBeenCalledTimes(1);
      });
    });
  });

  it('renders its own schema labels via an internally-composed DualLabel', () => {
    render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
    expect(screen.getByText('Oscillation Rate')).toBeTruthy();
  });

  it('falls back to schema.id for the accessible name when neither label is present, never leaving it unlabeled', () => {
    const bareSchema: SliderLinearSchema = { id: 'lfoRate', type: 'sliderLinear', min: 0.1, max: 10, orientation: 'horizontal' };
    render(<SliderLinear schema={bareSchema} value={2} onChange={() => {}} />);
    expect(screen.getByRole('slider', { name: 'lfoRate' })).toBeTruthy();
  });

  it('is not disabled by default — no existing behavior changes', () => {
    render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('data-disabled')).toBeNull();
    expect(thumb.getAttribute('tabindex')).toBe('0');
  });

  it('marks the thumb data-disabled and removes it from tab order when disabled is true', () => {
    render(<SliderLinear schema={schema} value={2} onChange={() => {}} disabled />);
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('data-disabled')).toBe('');
    expect(thumb.getAttribute('tabindex')).toBeNull();
  });

  it('does not call onChange on a disabled slider when a keyboard step is attempted', () => {
    const onChange = vi.fn();
    render(<SliderLinear schema={schema} value={2} onChange={onChange} disabled />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  describe('250ms ease on a non-drag value change (Crawford\'s own request)', () => {
    it('a live drag/keyboard step applies instantly — aria-valuenow updates synchronously, never eased', () => {
      const onChange = vi.fn();
      render(<SliderLinear schema={schema} value={2} onChange={onChange} />);
      const thumb = screen.getByRole('slider');
      thumb.focus();
      fireEvent.keyDown(thumb, { key: 'ArrowRight' });

      expect(thumb.getAttribute('aria-valuenow')).toBe('3');
      expect(onChange).toHaveBeenCalledWith(3); // the exact raw value, never an eased intermediate
    });

    it('does not create/retarget an ease for a live drag/keyboard step', () => {
      render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      const thumb = screen.getByRole('slider');
      thumb.focus();
      fireEvent.keyDown(thumb, { key: 'ArrowRight' });

      expect(gsap.quickTo).not.toHaveBeenCalled();
    });

    it('a value change from a prop update (not a drag) eases to the new value, settling on it (this mock resolves synchronously; see useEasedControlValue.test.ts for the quickTo-retarget-not-recreate behavior itself)', () => {
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      rerender(<SliderLinear schema={schema} value={5} onChange={() => {}} />);

      expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('5');
      expect(screen.getByText('5Hz')).toBeTruthy();
    });

    it('creates a 250ms, power2.out ease for a prop-driven value change', () => {
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      rerender(<SliderLinear schema={schema} value={5} onChange={() => {}} />);

      expect(gsap.quickTo).toHaveBeenCalledTimes(1);
      expect(lastTweenVars?.duration).toBe(0.25);
      expect(lastTweenVars?.ease).toBe('power2.out');
    });

    it('a SECOND prop-driven change retargets the SAME quickTo tween rather than creating a new one — no per-change timeline churn (the code-review finding this hook exists to fix)', () => {
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      rerender(<SliderLinear schema={schema} value={5} onChange={() => {}} />);
      rerender(<SliderLinear schema={schema} value={8} onChange={() => {}} />);

      expect(gsap.quickTo).toHaveBeenCalledTimes(1);
    });

    it('uses a 0 duration when the user prefers reduced motion, still settling on the exact target value', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        })),
      });
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      rerender(<SliderLinear schema={schema} value={5} onChange={() => {}} />);

      expect(lastTweenVars?.duration).toBe(0);
      expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('5');

      Reflect.deleteProperty(window, 'matchMedia');
    });

    it('re-rendering with the SAME value creates no ease (a genuine no-op)', () => {
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      rerender(<SliderLinear schema={schema} value={2} onChange={() => {}} />);

      expect(gsap.quickTo).not.toHaveBeenCalled();
    });

    it('a drag/keyboard step interrupts (kills) any in-flight ease', () => {
      render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      const thumb = screen.getByRole('slider');
      thumb.focus();
      fireEvent.keyDown(thumb, { key: 'ArrowRight' });

      expect(gsap.killTweensOf).toHaveBeenCalledTimes(1);
    });
  });

  it("resolves to exactly one role='slider' element — the voxel boxes introduce no accessibility-tree ambiguity", () => {
    render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
  });

  it('renders VoxelTrack with states matching computeVoxelBoxStates for the currently-fitted box count', () => {
    const valueSchema: SliderLinearSchema = { ...schema, min: 0, max: 100 };
    render(<SliderLinear schema={valueSchema} value={37} onChange={() => {}} />);
    const observer = MockResizeObserver.instances[0];
    act(() => observer.fire(240, 0));

    const voxelTrack = screen.getByTestId('voxel-track');
    // Horizontal fitting reserves trailing room for the last box's own
    // pop-out bleed (computeVoxelTrackTrailingReserve) before flooring a box
    // count — not the raw measured length.
    const reserve = computeVoxelTrackTrailingReserve('horizontal');
    const boxCount = computeFittedBoxCount(240 - reserve, BOX_SIZE, GAP);
    const expectedStates = computeVoxelBoxStates(37, 0, 100, boxCount);
    expect(JSON.parse(voxelTrack.getAttribute('data-states')!)).toEqual(expectedStates);
    expect(voxelTrack.getAttribute('data-box-size')).toBe(String(BOX_SIZE));
    expect(voxelTrack.getAttribute('data-gap')).toBe(String(GAP));
  });

  it("'horizontal': never renders Slider.Root flush to a container width that happens to be an exact multiple of (boxSize + gap) — real trailing slack for the last box's own pop-out bleed always exists, not just when the container's width happens to leave some by chance (found live in the running app: Limiter/Tempo/Automatic Effects overflowed at value 100% because their containers landed on exactly this case)", () => {
    // 4 boxes of 48px with 3 gaps of 12px is exactly 228px — zero natural
    // slack for computeFittedBoxCount to leave behind.
    const exactFitWidth = 4 * BOX_SIZE + 3 * GAP;
    render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
    const observer = MockResizeObserver.instances[0];
    act(() => observer.fire(exactFitWidth, 0));

    const voxelTrack = screen.getByTestId('voxel-track');
    const reserve = computeVoxelTrackTrailingReserve('horizontal');
    const boxCount = Number(voxelTrack.getAttribute('data-states') && JSON.parse(voxelTrack.getAttribute('data-states')!).length);
    const tightRowLength = computeVoxelTrackLength(boxCount, BOX_SIZE, GAP);
    expect(tightRowLength + reserve).toBeLessThanOrEqual(exactFitWidth);
    expect(reserve).toBeGreaterThan(0);
  });

  describe('orientation', () => {
    const verticalSchema: SliderLinearSchema = { ...schema, orientation: 'vertical' };
    const autoSchema: SliderLinearSchema = { ...schema, orientation: 'auto' };

    it("'vertical': passes orientation=\"vertical\" through to the underlying Radix root", () => {
      const { container } = render(<SliderLinear schema={verticalSchema} value={2} onChange={() => {}} />);
      const root = container.querySelector('.sc-slider-linear__root');
      expect(root?.getAttribute('data-orientation')).toBe('vertical');
    });

    it("'vertical': the outer wrapper carries data-orientation=\"vertical\" — CSS keys off this to go inline-flex and center its column", () => {
      const { container } = render(<SliderLinear schema={verticalSchema} value={2} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-linear');
      expect(wrapper?.getAttribute('data-orientation')).toBe('vertical');
    });

    it("'horizontal' (default): the outer wrapper carries data-orientation=\"horizontal\", not left unset", () => {
      const { container } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-linear');
      expect(wrapper?.getAttribute('data-orientation')).toBe('horizontal');
    });

    it("'vertical': renders the value readout before the track in DOM order — a dragging thumb must never cover it", () => {
      const { container } = render(<SliderLinear schema={verticalSchema} value={2} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-linear')!;
      const children = Array.from(wrapper.children);
      const valueIndex = children.findIndex((c) => c.classList.contains('sc-slider-linear__value'));
      const rootIndex = children.findIndex((c) => c.classList.contains('sc-slider-linear__root'));
      expect(valueIndex).toBeGreaterThanOrEqual(0);
      expect(rootIndex).toBeGreaterThanOrEqual(0);
      expect(valueIndex).toBeLessThan(rootIndex);
    });

    it("'horizontal' (default): renders the value readout after the track, unchanged from before orientation existed", () => {
      const { container } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      const wrapper = container.querySelector('.sc-slider-linear')!;
      const children = Array.from(wrapper.children);
      const valueIndex = children.findIndex((c) => c.classList.contains('sc-slider-linear__value'));
      const rootIndex = children.findIndex((c) => c.classList.contains('sc-slider-linear__root'));
      expect(rootIndex).toBeLessThan(valueIndex);
    });

    it("'vertical': omitting verticalHeight fits synchronously against a fixed default budget (VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT, matching --slider-vertical-height's own 256px) rather than live-measuring the parent — the correct height is present on the very first render, with no ResizeObserver callback needed to reach it. The live measurement this replaces was genuinely circular for a shrink-wrapped parent: its own height depended on this slider's rendered height, which depended on measuring that same parent — an infinite resize loop found live in the running app for every vertical-resolving slider with no explicitly-sized container.", () => {
      const { container } = render(<SliderLinear schema={verticalSchema} value={2} onChange={() => {}} />);

      const root = container.querySelector<HTMLElement>('.sc-slider-linear__root');
      const boxCount = computeFittedBoxCount(VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT, BOX_SIZE, GAP);
      const expectedLength = computeVoxelTrackLength(boxCount, BOX_SIZE, GAP);
      expect(root?.style.height).toBe(`${expectedLength}px`);
    });

    it("'vertical': verticalHeight is a fitting BUDGET, not a literal applied value — the rendered height is the box-quantized length, even for a verticalHeight that isn't an exact multiple of (boxSize + gap)", () => {
      // 310 is deliberately not a multiple of (48 + 12) = 60.
      const { container } = render(
        <SliderLinear schema={verticalSchema} value={2} onChange={() => {}} verticalHeight={310} />,
      );
      const root = container.querySelector<HTMLElement>('.sc-slider-linear__root');
      const boxCount = computeFittedBoxCount(310, BOX_SIZE, GAP);
      const expectedLength = computeVoxelTrackLength(boxCount, BOX_SIZE, GAP);
      expect(root?.style.height).toBe(`${expectedLength}px`);
      expect(root?.style.height).not.toBe('310px');
    });

    it("'horizontal': ignores a verticalHeight prop entirely for sizing, sets an inline width from the fitted box count plus its own trailing pop-out reserve (main axis) and an inline height equal to the box's own cross-axis size (not the old stale CSS default)", () => {
      const { container } = render(
        <SliderLinear schema={schema} value={2} onChange={() => {}} verticalHeight={300} />,
      );
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(500, 0));

      const root = container.querySelector<HTMLElement>('.sc-slider-linear__root');
      const reserve = computeVoxelTrackTrailingReserve('horizontal');
      const boxCount = computeFittedBoxCount(500 - reserve, BOX_SIZE, GAP);
      const expectedLength = computeVoxelTrackLength(boxCount, BOX_SIZE, GAP) + reserve;
      expect(root?.style.width).toBe(`${expectedLength}px`);
      // Cross-axis: the boxes are BOX_SIZE tall, so Root must be too — no
      // longer the stale 20px CSS default the old thin-line track used.
      expect(root?.style.height).toBe(`${BOX_SIZE}px`);
    });

    it("'vertical': sets an inline width equal to the box's own cross-axis size, on top of the main-axis inline height — the boxes are BOX_SIZE wide, not the old stale 20px CSS default", () => {
      const { container } = render(<SliderLinear schema={verticalSchema} value={2} onChange={() => {}} />);
      const root = container.querySelector<HTMLElement>('.sc-slider-linear__root');
      expect(root?.style.width).toBe(`${BOX_SIZE}px`);
    });

    it("'auto': renders without throwing, resolving to horizontal-looking output before any ResizeObserver measurement fires", () => {
      const { container } = render(<SliderLinear schema={autoSchema} value={2} onChange={() => {}} />);
      const root = container.querySelector('.sc-slider-linear__root');
      expect(root?.getAttribute('data-orientation')).toBe('horizontal');
    });

    it("'auto' resolving to vertical: the box count still fits against the fixed default budget, not a live measurement of the same parent useAutoSliderOrientation itself observes — this is the exact scenario that looped live in the running app (a container with no explicit height, orientation resolving to vertical, box-count fitting then trying to measure that same not-yet-sized parent)", () => {
      const { container } = render(<SliderLinear schema={autoSchema} value={2} onChange={() => {}} />);
      const orientationObserver = MockResizeObserver.instances[0];
      act(() => orientationObserver.fire(50, 300)); // height > width -> resolves to vertical

      const root = container.querySelector<HTMLElement>('.sc-slider-linear__root');
      expect(root?.getAttribute('data-orientation')).toBe('vertical');
      const boxCount = computeFittedBoxCount(VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT, BOX_SIZE, GAP);
      const expectedLength = computeVoxelTrackLength(boxCount, BOX_SIZE, GAP);
      expect(root?.style.height).toBe(`${expectedLength}px`);
    });
  });

  describe('readOnly', () => {
    it('renders role="status" and data-readonly="true" on the outer wrapper', () => {
      const { container } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} readOnly />);
      const wrapper = container.querySelector('.sc-slider-linear');
      expect(wrapper?.getAttribute('role')).toBe('status');
      expect(wrapper?.getAttribute('data-readonly')).toBe('true');
    });

    it('renders no role="slider" element at all — no Radix Slider.Root/Track/Thumb leaks into this branch', () => {
      render(<SliderLinear schema={schema} value={2} onChange={() => {}} readOnly />);
      expect(screen.queryByRole('slider')).toBeNull();
    });

    it('shows {value}{unit} as visible text, same as the interactive branch', () => {
      render(<SliderLinear schema={schema} value={2} onChange={() => {}} readOnly />);
      expect(screen.getByText('2Hz')).toBeTruthy();
    });

    it('still shows the bare value when schema.unit is absent, same as the interactive branch', () => {
      const noUnitSchema: SliderLinearSchema = { id: 'x', type: 'sliderLinear', min: 0, max: 1, orientation: 'horizontal' };
      render(<SliderLinear schema={noUnitSchema} value={0.5} onChange={() => {}} readOnly />);
      expect(screen.getByText('0.5')).toBeTruthy();
    });

    it('renders its own schema labels via DualLabel, same as the interactive branch', () => {
      render(<SliderLinear schema={schema} value={2} onChange={() => {}} readOnly />);
      expect(screen.getByText('Oscillation Rate')).toBeTruthy();
    });

    it('renders VoxelTrack with states matching computeVoxelBoxStates for the currently-fitted box count — identical fill logic to the interactive branch', () => {
      const valueSchema: SliderLinearSchema = { ...schema, min: 0, max: 100 };
      render(<SliderLinear schema={valueSchema} value={37} onChange={() => {}} readOnly />);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(240, 0));

      const voxelTrack = screen.getByTestId('voxel-track');
      const reserve = computeVoxelTrackTrailingReserve('horizontal');
      const boxCount = computeFittedBoxCount(240 - reserve, BOX_SIZE, GAP);
      const expectedStates = computeVoxelBoxStates(37, 0, 100, boxCount);
      expect(JSON.parse(voxelTrack.getAttribute('data-states')!)).toEqual(expectedStates);
      expect(voxelTrack.getAttribute('data-box-size')).toBe(String(BOX_SIZE));
      expect(voxelTrack.getAttribute('data-gap')).toBe(String(GAP));
    });

    it('onChange is never called — nothing in this branch can fire it', () => {
      const onChange = vi.fn();
      render(<SliderLinear schema={schema} value={2} onChange={onChange} readOnly />);
      expect(onChange).not.toHaveBeenCalled();
    });

    describe('orientation parity with the interactive branch', () => {
      it("'vertical': the outer wrapper and root both carry data-orientation=\"vertical\"", () => {
        const verticalSchema: SliderLinearSchema = { ...schema, orientation: 'vertical' };
        const { container } = render(<SliderLinear schema={verticalSchema} value={2} onChange={() => {}} readOnly />);
        const wrapper = container.querySelector('.sc-slider-linear');
        const root = container.querySelector('.sc-slider-linear__root');
        expect(wrapper?.getAttribute('data-orientation')).toBe('vertical');
        expect(root?.getAttribute('data-orientation')).toBe('vertical');
      });

      it("'horizontal' (default): the outer wrapper carries data-orientation=\"horizontal\"", () => {
        const { container } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} readOnly />);
        const wrapper = container.querySelector('.sc-slider-linear');
        expect(wrapper?.getAttribute('data-orientation')).toBe('horizontal');
      });

      it("'vertical': renders the value readout before the track in DOM order, same ordering rule as the interactive branch", () => {
        const verticalSchema: SliderLinearSchema = { ...schema, orientation: 'vertical' };
        const { container } = render(<SliderLinear schema={verticalSchema} value={2} onChange={() => {}} readOnly />);
        const wrapper = container.querySelector('.sc-slider-linear')!;
        const children = Array.from(wrapper.children);
        const valueIndex = children.findIndex((c) => c.classList.contains('sc-slider-linear__value'));
        const rootIndex = children.findIndex((c) => c.classList.contains('sc-slider-linear__root'));
        expect(valueIndex).toBeGreaterThanOrEqual(0);
        expect(rootIndex).toBeGreaterThanOrEqual(0);
        expect(valueIndex).toBeLessThan(rootIndex);
      });

      it("'horizontal' (default): renders the value readout after the track, same ordering rule as the interactive branch", () => {
        const { container } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} readOnly />);
        const wrapper = container.querySelector('.sc-slider-linear')!;
        const children = Array.from(wrapper.children);
        const valueIndex = children.findIndex((c) => c.classList.contains('sc-slider-linear__value'));
        const rootIndex = children.findIndex((c) => c.classList.contains('sc-slider-linear__root'));
        expect(rootIndex).toBeLessThan(valueIndex);
      });

      it("'auto': resolves to horizontal-looking output before any ResizeObserver measurement fires, same as the interactive branch", () => {
        const autoSchema: SliderLinearSchema = { ...schema, orientation: 'auto' };
        const { container } = render(<SliderLinear schema={autoSchema} value={2} onChange={() => {}} readOnly />);
        const root = container.querySelector('.sc-slider-linear__root');
        expect(root?.getAttribute('data-orientation')).toBe('horizontal');
      });
    });

    it('disabled has no effect when readOnly is also true — output is identical to readOnly alone', () => {
      const { container } = render(
        <SliderLinear schema={schema} value={2} onChange={() => {}} readOnly disabled />,
      );
      expect(screen.queryByRole('slider')).toBeNull();
      expect(container.querySelector('[data-disabled]')).toBeNull();
      const wrapper = container.querySelector('.sc-slider-linear');
      expect(wrapper?.getAttribute('data-readonly')).toBe('true');
    });
  });

  describe('computeVoxelBoxStates memoization (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 1)', () => {
    it('does not recompute states across re-renders with unchanged value/schema.min/schema.max/boxCount', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStates');
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;
      expect(callsAfterMount).toBeGreaterThan(0);

      rerender(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      rerender(<SliderLinear schema={schema} value={2} onChange={() => {}} />);

      expect(spy.mock.calls.length).toBe(callsAfterMount);
    });

    it('recomputes states when value changes (once the 250ms ease settles — a prop-driven value change is no longer instant, Crawford\'s own request)', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStates');
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;

      rerender(<SliderLinear schema={schema} value={5} onChange={() => {}} />);

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('recomputes states when schema.min/schema.max change, even with value/boxCount unchanged', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStates');
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;

      const widerSchema: SliderLinearSchema = { ...schema, max: 20 };
      rerender(<SliderLinear schema={widerSchema} value={2} onChange={() => {}} />);

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('recomputes states when the fitted boxCount changes (a ResizeObserver measurement), even with value/schema unchanged', () => {
      const spy = vi.spyOn(voxelTrackMath, 'computeVoxelBoxStates');
      render(<SliderLinear schema={schema} value={2} onChange={() => {}} />);
      const callsAfterMount = spy.mock.calls.length;

      // 500px is wide enough to fit more than the default (unmeasured) 3-box
      // minimum — 240px (used elsewhere in this file) happens to still fit
      // only 3 boxes after the trailing-reserve subtraction, which would make
      // this assertion a false negative.
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(500, 0));

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 1 correction — SliderLinear itself, not just its internal states useMemo)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((SliderLinear as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with identical props', () => {
      const onChange = () => {};
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<SliderLinear schema={schema} value={2} onChange={onChange} />);
      rerender(<SliderLinear schema={schema} value={2} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(<SliderLinear schema={schema} value={2} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<SliderLinear schema={schema} value={5} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
