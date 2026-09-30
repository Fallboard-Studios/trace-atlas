import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so this end-to-end test can tell whether any individual
// CabinetBox's render body actually re-executed — useCabinetBoxHeight() is
// called unconditionally, synchronously, in CabinetBox's own render body (see
// CabinetBox.test.tsx's own Task 4 test for the same technique).
//
// One wrinkle unique to this end-to-end file: useVoxelTrackSlider (used
// directly inside SliderLinear's own render body, one level above VoxelTrack)
// ALSO calls useCabinetBoxHeight, once per SliderLinear render. SliderLinear
// itself is not memoized — it's the root passed to rerender() below, so it
// always re-executes regardless of memoization further down — so every
// rerender() contributes exactly +1 to the spy's count from SliderLinear
// alone, on top of however many CabinetBox instances also re-rendered. Every
// assertion below accounts for that fixed +1 baseline explicitly, rather than
// asserting a flat total (which would be a false negative caused by this
// baseline, not evidence CabinetBox failed to bail).
//
// Deliberately NO mocks for VoxelTrack or CabinetBox themselves — unlike
// SliderLinear.test.tsx/VoxelTrack.test.tsx, which each mock their own direct
// child away to test in isolation, this file exists specifically to exercise
// the real SliderLinear -> VoxelTrack -> CabinetBox chain end-to-end. gsap and
// @/animation/timelineMap use vitest.setup.ts's own global no-op mocks — no
// local override needed, since this file never inspects GSAP call args.
vi.mock('./useCabinetBoxHeight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useCabinetBoxHeight')>();
  return { ...actual, useCabinetBoxHeight: vi.fn(actual.useCabinetBoxHeight) };
});

import { SliderLinear } from './SliderLinear';
import { useCabinetBoxHeight } from './useCabinetBoxHeight';
import type { SliderLinearSchema } from '@/types/controls';

/**
 * Controllable ResizeObserver mock, mirroring SliderLinear.test.tsx's own
 * convention — every hook in this real chain (useAutoSliderOrientation,
 * useVoxelTrackBoxCount, CabinetBox's own front-width measurement) needs one
 * to exist in jsdom, even if this file never fires it.
 */
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let originalResizeObserver: typeof ResizeObserver;

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
});

afterEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
});

const schema: SliderLinearSchema = { id: 'cascadeTest', type: 'sliderLinear', min: 0, max: 100, orientation: 'horizontal' };

describe('Oblique Cabinetry re-render cascade regression (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 5 — the end-to-end proof the whole plan exists for)', () => {
  it('a SliderLinear re-render with unchanged value/schema re-executes ZERO of its own CabinetBox render bodies — only SliderLinear\'s own fixed +1 baseline (via useVoxelTrackSlider) accounts for the count moving at all', () => {
    const spy = useCabinetBoxHeight as ReturnType<typeof vi.fn>;
    const { rerender } = render(<SliderLinear schema={schema} value={37} onChange={() => {}} />);
    const callsAfterMount = spy.mock.calls.length;
    // Sanity: more than 1 call at mount means at least one real CabinetBox
    // rendered (1 call is SliderLinear's own baseline alone) — a flat delta
    // below isn't vacuously true.
    expect(callsAfterMount).toBeGreaterThan(1);

    rerender(<SliderLinear schema={schema} value={37} onChange={() => {}} />);
    const callsAfterRerender1 = spy.mock.calls.length;
    rerender(<SliderLinear schema={schema} value={37} onChange={() => {}} />);
    const callsAfterRerender2 = spy.mock.calls.length;

    expect(callsAfterRerender1 - callsAfterMount).toBe(1); // SliderLinear's own baseline only
    expect(callsAfterRerender2 - callsAfterRerender1).toBe(1);
  });

  it('sanity check: the marker genuinely detects CabinetBox re-renders when value changes — the flat +1-per-rerender delta above is a real bail-out, not a broken spy', async () => {
    const spy = useCabinetBoxHeight as ReturnType<typeof vi.fn>;
    const { rerender } = render(<SliderLinear schema={schema} value={37} onChange={() => {}} />);
    const callsAfterMount = spy.mock.calls.length;

    rerender(<SliderLinear schema={schema} value={80} onChange={() => {}} />);
    // SliderLinear now eases a non-drag value change over 250ms (Crawford's own request) — the
    // shared gsap mock (vitest.setup.ts) settles the tween's onComplete on the next microtask.
    await act(async () => { await Promise.resolve(); });

    // A genuine value change rebuilds every VoxelTrack child fresh (a new
    // `states` array reference from Tasks 1-3's own useMemo), which rebuilds
    // every CabinetBox's `children` div fresh too — defeating every box's own
    // memo bail-out, not just the box(es) whose visual state actually
    // differs. The delta must exceed the always-present +1 SliderLinear
    // baseline by a wide margin (more than just +1).
    expect(spy.mock.calls.length - callsAfterMount).toBeGreaterThan(1);
  });
});
