import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));
vi.mock('@/utils/cabinetGeometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/cabinetGeometry')>();
  return { ...actual, computeCabinetFrontFaceOffset: vi.fn(actual.computeCabinetFrontFaceOffset) };
});
// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 4) can tell whether CabinetBoxInner's render body actually re-executed —
// useCabinetBoxHeight() is called unconditionally on every render (even when
// boxHeightOverride makes its result unused, per CabinetBox.tsx's own comment),
// so its call count is a reliable per-render marker, unlike
// computeCabinetFrontFaceOffset above (only called from inside an effect, not
// synchronously during render).
vi.mock('./useCabinetBoxHeight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useCabinetBoxHeight')>();
  return { ...actual, useCabinetBoxHeight: vi.fn(actual.useCabinetBoxHeight) };
});

// Local gsap mock (overriding vitest.setup.ts's global noop for this file
// only), capturing every .fromTo() and .set() call so the --cabinet-glow/
// wall-scale tweens and the instant-reposition path can all be asserted on
// directly — the global mock doesn't expose call args. Mirrors
// useLfoTargetGroup.test.ts's own local-gsap-mock precedent.
const { fromToMock, setMock } = vi.hoisted(() => ({ fromToMock: vi.fn(), setMock: vi.fn() }));
vi.mock('gsap', () => {
  const chainable = {
    fromTo: (...args: unknown[]) => {
      fromToMock(...args);
      return chainable;
    },
  };
  return { default: { timeline: vi.fn(() => chainable), set: setMock } };
});

import { CabinetBox } from './CabinetBox';
import { CABINET_POP_DURATION, CABINET_POP_DURATION_OUT } from './cabinetAnimation';
import { useCabinetBoxHeight } from './useCabinetBoxHeight';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import {
  computeCabinetFrontFaceOffset,
  CABINET_POP_DISTANCE,
  CABINET_TOP_FACE_SKEW_DEG,
  CABINET_LEFT_FACE_SKEW_DEG,
} from '@/utils/cabinetGeometry';

/**
 * Controllable ResizeObserver mock, mirroring useAutoSliderOrientation.test.ts's
 * own local class exactly — captures its callback so tests can fire it
 * manually with a fake contentRect/borderBoxSize pair (the front face's own
 * padding makes these differ — border-box is what CabinetBox must measure).
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

  /** `borderBoxWidth` defaults to `width` (no padding difference) unless a
   *  test explicitly supplies a distinct value. */
  fire(width: number, height: number, borderBoxWidth: number = width) {
    this.callback(
      [{
        contentRect: { width, height },
        borderBoxSize: [{ inlineSize: borderBoxWidth, blockSize: height }],
      } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  /** Simulates an environment/mock with no borderBoxSize at all. */
  fireContentRectOnly(width: number, height: number) {
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

/** Stubs window.matchMedia for both prefers-reduced-motion and the
 *  cabinet breakpoint queries useCabinetBoxHeight reads internally —
 *  defaults every query to non-matching (desktop tier, motion allowed). */
function stubMatchMedia(prefersReducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') && prefersReducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

let originalResizeObserver: typeof ResizeObserver;

beforeEach(() => {
  MockResizeObserver.instances = [];
  originalResizeObserver = globalThis.ResizeObserver;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  stubMatchMedia(false);
});

afterEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
  cleanup();
  vi.clearAllMocks();
});

describe('CabinetBox', () => {
  it('renders children inside the front face', () => {
    render(<CabinetBox popped={false} timelineKey="test-box">Reset Melody</CabinetBox>);
    expect(screen.getByText('Reset Melody')).toBeTruthy();
  });

  it('renders exactly one top-face and one left-face div, both inside an aria-hidden walls div (not an SVG)', () => {
    const { container } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
    expect(container.querySelectorAll('.sc-cabinet-box__top-face')).toHaveLength(1);
    expect(container.querySelectorAll('.sc-cabinet-box__left-face')).toHaveLength(1);
    const walls = container.querySelector('.sc-cabinet-box__walls');
    expect(walls?.tagName.toLowerCase()).toBe('div');
    expect(walls?.getAttribute('aria-hidden')).toBe('true');
  });

  it('registers a GSAP timeline immediately on mount — does not wait for a ResizeObserver measurement, since the geometry effect has not needed width since the wall-rendering rewrite (2026-09-09)', () => {
    render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
    expect(setTimeline).toHaveBeenCalledWith('test-box', expect.anything());
  });

  it('sets both wall scales (and skipMountAnimation\'s instant positioning) synchronously with mount, before any ResizeObserver callback — closes the real flicker window found live, 2026-09-09: a fresh CabinetBox instance used to sit for a frame with NO scale set on either wall (skew already applied by the always-immediate skew effect, but no matching scale yet) until the async ResizeObserver callback finally unblocked the geometry effect, most noticeable on VoxelTrack\'s constant straddle-boundary remounts while dragging a slider', () => {
    const { container } = render(
      <CabinetBox popped={0.4} timelineKey="test-box" skipMountAnimation>x</CabinetBox>,
    );
    // Deliberately NO `observer.fire(...)` here — MockResizeObserver.observe()
    // is a no-op that never calls back on its own, so if the geometry effect
    // still needed a real measurement to run, none of the assertions below
    // could possibly pass at this point.
    const topFace = container.querySelector('.sc-cabinet-box__top-face');
    const leftFaceInner = container.querySelector('.sc-cabinet-box__left-face-inner');
    expect(setMock).toHaveBeenCalledWith(topFace, { scaleY: 0.4 });
    expect(setMock).toHaveBeenCalledWith(leftFaceInner, { scaleX: 0.4 });
  });

  it('calls killTimeline on unmount', () => {
    const { unmount } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
    unmount();
    expect(killTimeline).toHaveBeenCalledWith('test-box');
  });

  it('still registers a timeline under prefers-reduced-motion — snapped, not skipped', () => {
    stubMatchMedia(true);
    render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
    const observer = MockResizeObserver.instances[0];
    act(() => observer.fire(100, 48));
    expect(setTimeline).toHaveBeenCalled();
  });

  it('re-registers a timeline when popped flips after the initial measurement', () => {
    const { rerender } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
    const observer = MockResizeObserver.instances[0];
    act(() => observer.fire(100, 48));
    const callsAfterMeasure = (setTimeline as ReturnType<typeof vi.fn>).mock.calls.length;

    rerender(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
    expect((setTimeline as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMeasure);
  });

  it('tweens --cabinet-glow from 0 to 1 on the wrapper element (not the front face) when popping in', () => {
    const { container } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
    const observer = MockResizeObserver.instances[0];
    act(() => observer.fire(100, 48));

    const wrapper = container.querySelector('.sc-cabinet-box');
    const front = container.querySelector('.sc-cabinet-box__front');
    const glowCalls = fromToMock.mock.calls.filter(([target]) => target === wrapper);
    expect(glowCalls).toHaveLength(1);
    const [, fromVars, toVars] = glowCalls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(fromVars['--cabinet-glow']).toBe(0);
    expect(toVars['--cabinet-glow']).toBe(1);

    // Never on the front face itself — the glow belongs to the "back".
    const frontCalls = fromToMock.mock.calls.filter(([target]) => target === front);
    expect(frontCalls.every(([, vars]) => !('--cabinet-glow' in (vars as object)))).toBe(true);
  });

  it('tweens --cabinet-glow from 1 to 0 when popping back out', () => {
    const { container, rerender } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
    const observer = MockResizeObserver.instances[0];
    act(() => observer.fire(100, 48));
    fromToMock.mockClear();

    rerender(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
    const wrapper = container.querySelector('.sc-cabinet-box');
    const glowCalls = fromToMock.mock.calls.filter(([target]) => target === wrapper);
    expect(glowCalls).toHaveLength(1);
    const [, fromVars, toVars] = glowCalls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(fromVars['--cabinet-glow']).toBe(1);
    expect(toVars['--cabinet-glow']).toBe(0);
  });

  it('applies --cabinet-box-height and --cabinet-pop-distance as inline custom properties on the wrapper, computed from JS — CSS no longer duplicates either', () => {
    const { container } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
    const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
    // stubMatchMedia(false) (beforeEach) never matches a breakpoint query,
    // so useCabinetBoxHeight resolves desktop (48) — same assumption every
    // other test in this file already makes (fire(100, 48), etc.).
    expect(wrapper.style.getPropertyValue('--cabinet-box-height')).toBe('48px');
    expect(wrapper.style.getPropertyValue('--cabinet-pop-distance')).toBe(`${CABINET_POP_DISTANCE}px`);
  });

  it('does not replay the pop/flat animation when only the measured width changes while popped stays the same — repositions instantly instead', () => {
    render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
    const observer = MockResizeObserver.instances[0];
    act(() => observer.fire(100, 48)); // initial measurement — a real popped transition, animates
    expect(fromToMock).toHaveBeenCalled();

    fromToMock.mockClear();
    setMock.mockClear();
    (setTimeline as ReturnType<typeof vi.fn>).mockClear();

    // A breakpoint-crossing resize (or any width change) while `popped`
    // hasn't changed — must NOT re-run the flat↔full tween (that would
    // visibly flatten and re-pop an already-popped box for no reason).
    act(() => observer.fire(120, 48));

    expect(fromToMock).not.toHaveBeenCalled();
    expect(setTimeline).not.toHaveBeenCalled();
    expect(setMock).toHaveBeenCalled();
  });

  it('still animates a real transition normally after a width-only reposition has occurred', () => {
    const { rerender } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
    const observer = MockResizeObserver.instances[0];
    act(() => observer.fire(100, 48));
    act(() => observer.fire(120, 48)); // width-only reposition, no tween
    fromToMock.mockClear();
    (setTimeline as ReturnType<typeof vi.fn>).mockClear();

    rerender(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);

    expect(fromToMock).toHaveBeenCalled();
    expect(setTimeline).toHaveBeenCalled();
  });

  it('renders no content in the front face when children is omitted', () => {
    const { container } = render(<CabinetBox popped={false} timelineKey="test-box" />);
    const front = container.querySelector('.sc-cabinet-box__front');
    expect(front).toBeTruthy();
    expect(front?.textContent).toBe('');
  });

  it('applies a boxHeight override instead of the resolved breakpoint value, when provided', () => {
    // stubMatchMedia(false) (beforeEach) never matches a breakpoint query,
    // so useCabinetBoxHeight would otherwise resolve desktop (48) — the
    // override must win over that resolved value, not merely be accepted.
    // Picked above the 44px floor (see next test) so this value survives
    // Math.max unchanged and still unambiguously differs from 48.
    const { container } = render(
      <CabinetBox popped={false} timelineKey="test-box" boxHeight={56}>x</CabinetBox>,
    );
    const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
    expect(wrapper.style.getPropertyValue('--cabinet-box-height')).toBe('56px');
  });

  it('floors --cabinet-box-height at 44px, even when a smaller boxHeight override is given', () => {
    const { container } = render(
      <CabinetBox popped={false} timelineKey="test-box" boxHeight={32}>x</CabinetBox>,
    );
    const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
    expect(wrapper.style.getPropertyValue('--cabinet-box-height')).toBe('44px');
  });

  describe('color override (docs/specs/NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §1.2/§5.1)', () => {
    it('applies no --cabinet-box-color inline style when color is omitted', () => {
      const { container } = render(<CabinetBox popped={false} timelineKey="test-box" />);
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      expect(wrapper.style.getPropertyValue('--cabinet-box-color')).toBe('');
    });

    it('applies the color prop as a --cabinet-box-color inline custom property', () => {
      const { container } = render(<CabinetBox popped={false} timelineKey="test-box" color="#ff0000" />);
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      expect(wrapper.style.getPropertyValue('--cabinet-box-color')).toBe('#ff0000');
    });

    it("CabinetBox.css's backing/top-face/left-face-inner/front rules all read var(--cabinet-box-color, <default>) — source-scan, since jsdom doesn't resolve color-mix()/cascaded custom properties (this file's own existing caveat)", async () => {
      const { readFileSync } = await import('node:fs');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const thisFile = fileURLToPath(import.meta.url);
      const source = readFileSync(join(dirname(thisFile), 'CabinetBox.css'), 'utf-8');
      expect(source).toMatch(/\.sc-cabinet-box__backing\s*{[^}]*var\(--cabinet-box-color,\s*var\(--color-accent-gradient\)\)/);
      expect(source).toMatch(/\.sc-cabinet-box__top-face\s*{[^}]*var\(--cabinet-box-color,\s*var\(--color-accent\)\)/);
      expect(source).toMatch(/\.sc-cabinet-box__left-face-inner\s*{[^}]*var\(--cabinet-box-color,\s*var\(--color-accent\)\)/);
      expect(source).toMatch(/\.sc-cabinet-box__front\s*{[^}]*var\(--cabinet-box-color,\s*var\(--color-surface\)\)/);
    });
  });

  describe('enforceMinTouchHeight (docs/specs/NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §1.3/§5.1)', () => {
    it('enforceMinTouchHeight={false} lets --cabinet-box-height go below the 44px floor', () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" boxHeight={4} enforceMinTouchHeight={false}>x</CabinetBox>,
      );
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      expect(wrapper.style.getPropertyValue('--cabinet-box-height')).toBe('4px');
    });

    it('enforceMinTouchHeight={false} has no effect when boxHeight is already above 44px', () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" boxHeight={60} enforceMinTouchHeight={false}>x</CabinetBox>,
      );
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      expect(wrapper.style.getPropertyValue('--cabinet-box-height')).toBe('60px');
    });

    it('defaults to true (the floor applies) when omitted, independent of the color prop', () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" boxHeight={4} color="#00ff00">x</CabinetBox>,
      );
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      expect(wrapper.style.getPropertyValue('--cabinet-box-height')).toBe('44px');
      expect(wrapper.style.getPropertyValue('--cabinet-box-color')).toBe('#00ff00');
    });
  });

  describe('wall rendering (roadmap 11.1.1 follow-up — two fixed-skew, scale-tweened divs, replacing SVG polygons; docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md)', () => {
    it('the top-face and left-face elements are plain <div>s, not SVG polygons', () => {
      const { container } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
      const topFace = container.querySelector('.sc-cabinet-box__top-face');
      const leftFace = container.querySelector('.sc-cabinet-box__left-face');
      expect(topFace?.tagName.toLowerCase()).toBe('div');
      expect(leftFace?.tagName.toLowerCase()).toBe('div');
    });

    it("sizes the top-face div's width to the measured border-box front-face width, and height to resolvedPopDistance", () => {
      const { container } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      // content-box (no padding) = 100; border-box (padding included) = 128 —
      // the same real gap the front face's own `padding: 0 14px` produces.
      act(() => observer.fire(100, 48, 128));

      const topFace = container.querySelector('.sc-cabinet-box__top-face') as HTMLElement;
      expect(topFace.style.width).toBe('128px');
      expect(topFace.style.height).toBe(`${CABINET_POP_DISTANCE}px`);
    });

    it("falls back to contentRect.width for the top-face div's width when borderBoxSize is unavailable", () => {
      const { container } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fireContentRectOnly(100, 48));

      const topFace = container.querySelector('.sc-cabinet-box__top-face') as HTMLElement;
      expect(topFace.style.width).toBe('100px');
    });

    // Bugfix, reported live: a CabinetBox-heavy panel's own scrollbar continuously flickering,
    // even idle, no interaction. Root cause — a self-sustaining ResizeObserver retrigger loop:
    // the measured border-box width can jitter by a sub-pixel amount between consecutive
    // observations (real browser sub-pixel layout rounding, not a real size change), which
    // updates `width` state, which reruns the geometry effect (width is in its dependency array)
    // and rewrites the top-face wall's own `width` inline style — a genuine, if tiny, DOM mutation
    // every time, with nothing to ever stop it recurring. Rounding the measured width to a whole
    // pixel before setState makes two sub-pixel-different measurements of the same real size
    // resolve to an identical number, so React's own `Object.is` bail-out on an unchanged state
    // value stops the loop at its source — no rerun, no repeated DOM write.
    it('rounds the measured width so sub-pixel jitter across consecutive measurements is a no-op — breaks the self-sustaining ResizeObserver retrigger loop', () => {
      const { container } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(235.6, 48)); // initial measurement — a real transition, animates
      setMock.mockClear();
      (setTimeline as ReturnType<typeof vi.fn>).mockClear();

      const topFace = container.querySelector('.sc-cabinet-box__top-face') as HTMLElement;
      const widthAfterFirstMeasurement = topFace.style.width;

      // Sub-pixel-different measurement that rounds to the identical integer (236) — must be a
      // genuine no-op: no new gsap.set() calls, no style change.
      act(() => observer.fire(236.4, 48));

      expect(setMock).not.toHaveBeenCalled();
      expect(topFace.style.width).toBe(widthAfterFirstMeasurement);
    });

    it("sizes the left-face div's width to 2×resolvedPopDistance and height to boxHeight, when no frontHeight override is given — independent of the measured front-face width", () => {
      const { container } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      const leftFace = container.querySelector('.sc-cabinet-box__left-face') as HTMLElement;
      expect(leftFace.style.width).toBe(`${2 * CABINET_POP_DISTANCE}px`);
      expect(leftFace.style.height).toBe('48px');
    });

    it("initializes the top-face div's width from boxHeight synchronously on mount, before any ResizeObserver callback — a same-paint best guess (exact for a square front, e.g. every VoxelTrack/Toggle box) instead of the old hardcoded 0. Closes a residual flicker the width-gate fix above didn't: that fix made the wall SCALE/POSITION instant on a fresh mount, but the top-face's own WIDTH still rendered 0px (collapsed to nothing) until the observer's first callback — most visible on VoxelTrack's constant straddle-boundary remounts while dragging a slider. Found live, reported directly by Crawford.", () => {
      const { container } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      // Deliberately NO observer.fire(...) — this must hold on the very
      // first paint, before any measurement.
      const topFace = container.querySelector('.sc-cabinet-box__top-face') as HTMLElement;
      expect(topFace.style.width).toBe('48px'); // stubMatchMedia(false) -> desktop boxHeight
    });

    it("initializes the top-face div's width from an explicit frontWidth override instead, when given — exact for a VoxelTrack straddle-piece box, whose real width is already known from the prop and never actually needed to wait for measurement in the first place", () => {
      const { container } = render(
        <CabinetBox popped={true} timelineKey="test-box" frontWidth={20}>x</CabinetBox>,
      );
      const topFace = container.querySelector('.sc-cabinet-box__top-face') as HTMLElement;
      expect(topFace.style.width).toBe('20px');
    });

    it("a frontWidth override changes the top-face div's own width (reflecting the real measured width it drives) — the left-face div's fixed width is unaffected", () => {
      const { container } = render(
        <CabinetBox popped={true} timelineKey="test-box" frontWidth={20}>x</CabinetBox>,
      );
      const observer = MockResizeObserver.instances[0];
      // Simulates the real browser reporting the narrower, overridden width.
      act(() => observer.fire(20, 48));

      const topFace = container.querySelector('.sc-cabinet-box__top-face') as HTMLElement;
      const leftFace = container.querySelector('.sc-cabinet-box__left-face') as HTMLElement;
      expect(topFace.style.width).toBe('20px');
      expect(leftFace.style.width).toBe(`${2 * CABINET_POP_DISTANCE}px`);
    });

    describe("the fixed skew — set once via gsap.set() on mount, never re-set, never part of the animated tween", () => {
      it('sets skewX on the top-face div and skewY on the left-face div, via gsap.set(), on mount', () => {
        const { container } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
        const topFace = container.querySelector('.sc-cabinet-box__top-face');
        const leftFace = container.querySelector('.sc-cabinet-box__left-face');
        expect(setMock).toHaveBeenCalledWith(topFace, { skewX: CABINET_TOP_FACE_SKEW_DEG });
        expect(setMock).toHaveBeenCalledWith(leftFace, { skewY: CABINET_LEFT_FACE_SKEW_DEG });
      });

      it('does not re-set skewX/skewY when popped changes after mount — the skew is a one-time, fixed property of the projection', () => {
        const { rerender } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
        const observer = MockResizeObserver.instances[0];
        act(() => observer.fire(100, 48));
        setMock.mockClear();

        rerender(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);

        const skewCalls = setMock.mock.calls.filter(
          ([, vars]) => vars && ('skewX' in (vars as object) || 'skewY' in (vars as object)),
        );
        expect(skewCalls).toHaveLength(0);
      });
    });

    describe('wall scale tweening — scaleY (top face) / scaleX (left face), equal to poppedT/fromPopped directly, no per-frame computation', () => {
      it('tweens the top face scaleY and left face scaleX from 0 to 1 when popping in', () => {
        const { container } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
        const observer = MockResizeObserver.instances[0];
        act(() => observer.fire(100, 48));

        const topFace = container.querySelector('.sc-cabinet-box__top-face');
        const [, topFrom, topTo] = fromToMock.mock.calls.find(([target]) => target === topFace) as [
          unknown, Record<string, unknown>, Record<string, unknown>,
        ];
        expect(topFrom.scaleY).toBe(0);
        expect(topTo.scaleY).toBe(1);

        const leftFaceInner = container.querySelector('.sc-cabinet-box__left-face-inner');
        const [, leftFrom, leftTo] = fromToMock.mock.calls.find(([target]) => target === leftFaceInner) as [
          unknown, Record<string, unknown>, Record<string, unknown>,
        ];
        expect(leftFrom.scaleX).toBe(0);
        expect(leftTo.scaleX).toBe(1);
      });

      it('tweens both wall scales from 1 to 0 when popping back out', () => {
        const { container, rerender } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
        const observer = MockResizeObserver.instances[0];
        act(() => observer.fire(100, 48));
        fromToMock.mockClear();

        rerender(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);

        const topFace = container.querySelector('.sc-cabinet-box__top-face');
        const [, topFrom, topTo] = fromToMock.mock.calls.find(([target]) => target === topFace) as [
          unknown, Record<string, unknown>, Record<string, unknown>,
        ];
        expect(topFrom.scaleY).toBe(1);
        expect(topTo.scaleY).toBe(0);
      });

      it('a fractional popped (0.4) tweens the wall scales to exactly 0.4, not 0 or 1', () => {
        const { container } = render(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);
        const observer = MockResizeObserver.instances[0];
        act(() => observer.fire(100, 48));

        const topFace = container.querySelector('.sc-cabinet-box__top-face');
        const [, , topTo] = fromToMock.mock.calls.find(([target]) => target === topFace) as [
          unknown, Record<string, unknown>, Record<string, unknown>,
        ];
        expect(topTo.scaleY).toBe(0.4);
      });

      it('on the very first render at a fractional popped value, animates the wall scales in from the numeric opposite (1 - poppedT)', () => {
        const { container } = render(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);
        const observer = MockResizeObserver.instances[0];
        act(() => observer.fire(100, 48));

        const topFace = container.querySelector('.sc-cabinet-box__top-face');
        const [, topFrom] = fromToMock.mock.calls.find(([target]) => target === topFace) as [
          unknown, Record<string, unknown>, Record<string, unknown>,
        ];
        expect(topFrom.scaleY).toBe(0.6);
      });

      it('a transition between two fractional values (0.4 → 0.7, no boundary crossing) animates the wall scales from the real previous value, not the numeric opposite', () => {
        const { container, rerender } = render(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);
        const observer = MockResizeObserver.instances[0];
        act(() => observer.fire(100, 48));
        fromToMock.mockClear();

        rerender(<CabinetBox popped={0.7} timelineKey="test-box">x</CabinetBox>);

        const topFace = container.querySelector('.sc-cabinet-box__top-face');
        const [, topFrom, topTo] = fromToMock.mock.calls.find(([target]) => target === topFace) as [
          unknown, Record<string, unknown>, Record<string, unknown>,
        ];
        expect(topFrom.scaleY).toBe(0.4);
        expect(topTo.scaleY).toBe(0.7);
      });

      it('the dependency-only reposition branch (width changes, popped unchanged) sets both wall scales instantly via gsap.set(), not an animated tween', () => {
        render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
        const observer = MockResizeObserver.instances[0];
        act(() => observer.fire(100, 48));
        fromToMock.mockClear();
        setMock.mockClear();

        act(() => observer.fire(120, 48));

        const scaleSetCalls = setMock.mock.calls.filter(
          ([, vars]) => vars && ('scaleY' in (vars as object) || 'scaleX' in (vars as object)),
        );
        expect(scaleSetCalls.length).toBeGreaterThan(0);
        expect(fromToMock).not.toHaveBeenCalled();
      });

      it('skipMountAnimation sets both wall scales directly via gsap.set() to poppedT on first mount, not an animated tween', () => {
        const { container } = render(
          <CabinetBox popped={0.4} timelineKey="test-box" skipMountAnimation>x</CabinetBox>,
        );
        const observer = MockResizeObserver.instances[0];
        act(() => observer.fire(100, 48));

        const topFace = container.querySelector('.sc-cabinet-box__top-face');
        const leftFaceInner = container.querySelector('.sc-cabinet-box__left-face-inner');
        expect(setMock).toHaveBeenCalledWith(topFace, { scaleY: 0.4 });
        expect(setMock).toHaveBeenCalledWith(leftFaceInner, { scaleX: 0.4 });
        expect(fromToMock).not.toHaveBeenCalled();
      });
    });
  });

  describe('frontWidth/frontHeight overrides (roadmap 11.1.3 — VoxelTrack straddling-box resize)', () => {
    it('applies frontWidth as an inline width on the front face, overriding any CSS-forced sizing', () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" frontWidth={20}>x</CabinetBox>,
      );
      const front = container.querySelector('.sc-cabinet-box__front') as HTMLElement;
      expect(front.style.width).toBe('20px');
    });

    it('applies frontHeight as an inline height on the front face, overriding any CSS-forced sizing', () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" frontHeight={20}>x</CabinetBox>,
      );
      const front = container.querySelector('.sc-cabinet-box__front') as HTMLElement;
      expect(front.style.height).toBe('20px');
    });

    it('leaves both inline width and height unset when neither override is provided — CSS/content decides, as every existing consumer already relies on', () => {
      const { container } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
      const front = container.querySelector('.sc-cabinet-box__front') as HTMLElement;
      expect(front.style.width).toBe('');
      expect(front.style.height).toBe('');
    });

    it("sizes the left-face wall's height to frontHeight instead of boxHeight, when given — bugfix found via /interview-me, 2026-09-09: a vertical VoxelTrack straddle piece's wall used to stay a fixed full-boxHeight rectangle regardless of its own (shrunk) frontHeight, overflowing past its own wrapper and appearing to slide rather than shrink as the slider value changed", () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" boxHeight={48} frontHeight={20}>x</CabinetBox>,
      );
      const leftFace = container.querySelector('.sc-cabinet-box__left-face') as HTMLElement;
      expect(leftFace.style.height).toBe('20px');
    });

    it("falls back to boxHeight for the left-face wall's height when frontHeight is omitted — no behavior change for Button/Toggle/horizontal straddle pieces", () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" boxHeight={48}>x</CabinetBox>,
      );
      const leftFace = container.querySelector('.sc-cabinet-box__left-face') as HTMLElement;
      expect(leftFace.style.height).toBe('48px');
    });

    it("a frontHeight override changes the left-face wall's height (mirroring the front face's own real height) — the left-face div's fixed width is unaffected, and the top-face wall (unrelated to the shrinking axis here) is unaffected too", () => {
      const { container } = render(
        <CabinetBox popped={true} timelineKey="test-box" boxHeight={48} frontHeight={20}>x</CabinetBox>,
      );
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(48, 20));

      const topFace = container.querySelector('.sc-cabinet-box__top-face') as HTMLElement;
      const leftFace = container.querySelector('.sc-cabinet-box__left-face') as HTMLElement;
      expect(leftFace.style.width).toBe(`${2 * CABINET_POP_DISTANCE}px`);
      expect(leftFace.style.height).toBe('20px');
      expect(topFace.style.height).toBe(`${CABINET_POP_DISTANCE}px`);
    });
  });

  describe('autoHeight prop (Oblique Cabinetry — DirectionalPanel)', () => {
    it("sizes the left-face wall's height to 100% (CSS) instead of a pixel value, when autoHeight is true", () => {
      const { container } = render(
        <CabinetBox popped={true} timelineKey="test-box" autoHeight>x</CabinetBox>,
      );
      const leftFace = container.querySelector('.sc-cabinet-box__left-face') as HTMLElement;
      expect(leftFace.style.height).toBe('100%');
    });

    it("falls back to a pixel value (frontHeight ?? boxHeight) for the left-face wall's height when autoHeight is omitted — no behavior change for any existing consumer", () => {
      const { container } = render(
        <CabinetBox popped={true} timelineKey="test-box" boxHeight={48}>x</CabinetBox>,
      );
      const leftFace = container.querySelector('.sc-cabinet-box__left-face') as HTMLElement;
      expect(leftFace.style.height).toBe('48px');
    });

    it('does not add a new ResizeObserver instance for autoHeight — sized entirely via CSS, no new measurement', () => {
      render(<CabinetBox popped={true} timelineKey="test-box" autoHeight>x</CabinetBox>);
      // Exactly 1: the existing front-width observer, unchanged. A second
      // (height) observer would mean this test file's own
      // MockResizeObserver.instances grew — it must not.
      expect(MockResizeObserver.instances).toHaveLength(1);
    });
  });

  describe('zIndex override (roadmap 11.1.3 — VoxelTrack cross-box stacking)', () => {
    it('applies zIndex as an inline z-index on the wrapper', () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" zIndex={5}>x</CabinetBox>,
      );
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      expect(wrapper.style.zIndex).toBe('5');
    });

    it('applies a zIndex of exactly 0, not treating it as falsy/omitted', () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" zIndex={0}>x</CabinetBox>,
      );
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      expect(wrapper.style.zIndex).toBe('0');
    });

    it('leaves the inline z-index unset when omitted — CSS default (DOM order), as every Button/Toggle usage already relies on', () => {
      const { container } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      expect(wrapper.style.zIndex).toBe('');
    });
  });

  describe('static backing (roadmap 11.1.3 follow-up — always-visible footprint behind the popped facade)', () => {
    it('always renders exactly one .sc-cabinet-box__backing element, regardless of popped state', () => {
      const { container: flatContainer } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
      expect(flatContainer.querySelectorAll('.sc-cabinet-box__backing')).toHaveLength(1);
      cleanup();

      const { container: poppedContainer } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      expect(poppedContainer.querySelectorAll('.sc-cabinet-box__backing')).toHaveLength(1);
    });

    it('renders the backing as the first child of the wrapper — behind both the walls and the front face in DOM/paint order', () => {
      const { container } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      const children = Array.from(wrapper.children);
      expect(children[0].className).toContain('sc-cabinet-box__backing');
      expect(children[1].tagName.toLowerCase()).toBe('div'); // .sc-cabinet-box__walls
      expect(children[1].className).toContain('sc-cabinet-box__walls');
      expect(children[2].className).toContain('sc-cabinet-box__front');
    });

    it('marks the backing aria-hidden — purely decorative, never exposed to assistive tech', () => {
      const { container } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
      const backing = container.querySelector('.sc-cabinet-box__backing') as HTMLElement;
      expect(backing.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('fractional popped (roadmap 11.1.3 — VoxelTrack extrusion-falloff)', () => {
    it('computes the front-face offset at t=0.4 exactly for a fractional popped value', () => {
      render(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(0.4, CABINET_POP_DISTANCE);
    });

    it('tweens --cabinet-glow to exactly 0.4 (not 0 or 1) for popped={0.4}', () => {
      const { container } = render(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      const wrapper = container.querySelector('.sc-cabinet-box');
      const [, , toVars] = fromToMock.mock.calls.find(([target]) => target === wrapper) as [
        unknown,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(toVars['--cabinet-glow']).toBe(0.4);
    });

    it('on the very first render at a fractional popped value, animates the front-face offset in from the numeric opposite (1 - poppedT)', () => {
      const { container } = render(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      // The offset "from" call — no prior real popped value exists yet.
      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(0.6, CABINET_POP_DISTANCE);

      const wrapper = container.querySelector('.sc-cabinet-box');
      const [, fromVars] = fromToMock.mock.calls.find(([target]) => target === wrapper) as [
        unknown,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(fromVars['--cabinet-glow']).toBe(0.6);
    });

    it('a transition between two fractional values (0.4 → 0.7, no boundary crossing) animates from the real previous value, not the numeric opposite', () => {
      const { container, rerender } = render(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));
      (computeCabinetFrontFaceOffset as ReturnType<typeof vi.fn>).mockClear();
      fromToMock.mockClear();

      rerender(<CabinetBox popped={0.7} timelineKey="test-box">x</CabinetBox>);

      // "from" uses the real previous value (0.4), never the numeric
      // opposite of the new value (1 - 0.7 = 0.3).
      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(0.4, CABINET_POP_DISTANCE);
      expect(computeCabinetFrontFaceOffset).not.toHaveBeenCalledWith(0.3, CABINET_POP_DISTANCE);
      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(0.7, CABINET_POP_DISTANCE);

      const wrapper = container.querySelector('.sc-cabinet-box');
      const [, fromVars, toVars] = fromToMock.mock.calls.find(([target]) => target === wrapper) as [
        unknown,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(fromVars['--cabinet-glow']).toBe(0.4);
      expect(toVars['--cabinet-glow']).toBe(0.7);
    });
  });

  describe('popDistance prop (roadmap 11.1.3 — VoxelTrack pops deeper than Button/Toggle)', () => {
    it('defaults to CABINET_POP_DISTANCE when popDistance is omitted', () => {
      render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(1, CABINET_POP_DISTANCE);
    });

    it('passes a custom popDistance through to computeCabinetFrontFaceOffset instead of the default', () => {
      render(<CabinetBox popped={true} timelineKey="test-box" popDistance={20}>x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(1, 20);
      expect(computeCabinetFrontFaceOffset).not.toHaveBeenCalledWith(1, CABINET_POP_DISTANCE);
    });

    it('applies the resolved popDistance (not always CABINET_POP_DISTANCE) as the --cabinet-pop-distance inline custom property', () => {
      const { container } = render(
        <CabinetBox popped={false} timelineKey="test-box" popDistance={20}>x</CabinetBox>,
      );
      const wrapper = container.querySelector('.sc-cabinet-box') as HTMLElement;
      expect(wrapper.style.getPropertyValue('--cabinet-pop-distance')).toBe('20px');
    });

    it("uses the custom popDistance for the 'from' offset too, not just the target", () => {
      const { rerender } = render(
        <CabinetBox popped={0.4} timelineKey="test-box" popDistance={20}>x</CabinetBox>,
      );
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));
      (computeCabinetFrontFaceOffset as ReturnType<typeof vi.fn>).mockClear();

      rerender(<CabinetBox popped={0.7} timelineKey="test-box" popDistance={20}>x</CabinetBox>);

      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(0.4, 20); // from
      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(0.7, 20); // target
    });
  });

  describe('skipMountAnimation prop (roadmap 11.1.3 follow-up — VoxelTrack straddle-boundary remount fix)', () => {
    it('positions directly at the target offset via gsap.set(), not an animated tween, on first mount', () => {
      const { container } = render(
        <CabinetBox popped={true} timelineKey="test-box" skipMountAnimation>x</CabinetBox>,
      );
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(1, CABINET_POP_DISTANCE);
      const topFace = container.querySelector('.sc-cabinet-box__top-face');
      const setCalls = setMock.mock.calls.map(([target]) => target);
      expect(setCalls).toContain(topFace);
      expect(fromToMock).not.toHaveBeenCalled();
    });

    it('does not register a GSAP timeline for the skipped first mount — there is no tween to track', () => {
      render(<CabinetBox popped={true} timelineKey="test-box" skipMountAnimation>x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      expect(setTimeline).not.toHaveBeenCalled();
    });

    it('sets --cabinet-glow directly to the target poppedT via gsap.set(), not tweened from the numeric opposite', () => {
      const { container } = render(
        <CabinetBox popped={0.4} timelineKey="test-box" skipMountAnimation>x</CabinetBox>,
      );
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      const wrapper = container.querySelector('.sc-cabinet-box');
      const glowSetCall = setMock.mock.calls.find(
        ([target, vars]) => target === wrapper && vars && '--cabinet-glow' in (vars as object),
      );
      expect(glowSetCall?.[1]).toEqual({ '--cabinet-glow': 0.4 });
    });

    it('a real popped transition after a skip-mount render still animates normally — the skip only applies to the very first mount', () => {
      const { rerender } = render(
        <CabinetBox popped={false} timelineKey="test-box" skipMountAnimation>x</CabinetBox>,
      );
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));
      expect(fromToMock).not.toHaveBeenCalled(); // the skipped first mount

      rerender(<CabinetBox popped={true} timelineKey="test-box" skipMountAnimation>x</CabinetBox>);

      expect(fromToMock).toHaveBeenCalled();
      expect(setTimeline).toHaveBeenCalled();
      // Animates from the box's own real prior state (flat, false → 0), not
      // the numeric opposite of the new target — the skipped mount already
      // established 0 as the real starting point.
      expect(computeCabinetFrontFaceOffset).toHaveBeenCalledWith(0, CABINET_POP_DISTANCE);
    });

    it('a width-only reposition after a skip-mount render still uses the instant gsap.set() path, unaffected by the flag', () => {
      render(<CabinetBox popped={true} timelineKey="test-box" skipMountAnimation>x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));
      setMock.mockClear();

      act(() => observer.fire(120, 48));

      expect(fromToMock).not.toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
    });

    it('defaults to the animated pop-in on first mount when skipMountAnimation is omitted — Button/Toggle behavior is unchanged', () => {
      render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      expect(fromToMock).toHaveBeenCalled();
      expect(setTimeline).toHaveBeenCalled();
    });
  });

  describe('direction-dependent duration (roadmap 11.1.1 follow-up — popping out uses a shorter duration than popping in, so a flattening box doesn\'t linger; ease is power2.out both ways, see cabinetAnimation.ts)', () => {
    it('popping in (flat → popped) uses power2.out and CABINET_POP_DURATION on every tweened property', () => {
      const { container, rerender } = render(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));
      fromToMock.mockClear();

      rerender(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);

      const topFace = container.querySelector('.sc-cabinet-box__top-face');
      const [, , toVars] = fromToMock.mock.calls.find(([target]) => target === topFace) as [
        unknown, Record<string, unknown>, Record<string, unknown>,
      ];
      expect(toVars.ease).toBe('power2.out');
      expect(toVars.duration).toBe(CABINET_POP_DURATION);
    });

    it('popping out (popped → flat) uses power2.out (same ease as popping in) but the shorter CABINET_POP_DURATION_OUT, on every tweened property', () => {
      const { container, rerender } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));
      fromToMock.mockClear();

      rerender(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);

      const topFace = container.querySelector('.sc-cabinet-box__top-face');
      const leftFaceInner = container.querySelector('.sc-cabinet-box__left-face-inner');
      const front = container.querySelector('.sc-cabinet-box__front');
      const wrapper = container.querySelector('.sc-cabinet-box');

      for (const target of [topFace, leftFaceInner, front, wrapper]) {
        const [, , toVars] = fromToMock.mock.calls.find(([callTarget]) => callTarget === target) as [
          unknown, Record<string, unknown>, Record<string, unknown>,
        ];
        expect(toVars.ease).toBe('power2.out');
        expect(toVars.duration).toBe(CABINET_POP_DURATION_OUT);
      }
    });

    it('a fractional transition that decreases (0.7 → 0.4) is still treated as "popping out" — shorter duration, same power2.out ease', () => {
      const { container, rerender } = render(<CabinetBox popped={0.7} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));
      fromToMock.mockClear();

      rerender(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);

      const topFace = container.querySelector('.sc-cabinet-box__top-face');
      const [, , toVars] = fromToMock.mock.calls.find(([target]) => target === topFace) as [
        unknown, Record<string, unknown>, Record<string, unknown>,
      ];
      expect(toVars.ease).toBe('power2.out');
      expect(toVars.duration).toBe(CABINET_POP_DURATION_OUT);
    });

    it('a fractional transition that increases (0.4 → 0.7) is still treated as "popping in"', () => {
      const { container, rerender } = render(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));
      fromToMock.mockClear();

      rerender(<CabinetBox popped={0.7} timelineKey="test-box">x</CabinetBox>);

      const topFace = container.querySelector('.sc-cabinet-box__top-face');
      const [, , toVars] = fromToMock.mock.calls.find(([target]) => target === topFace) as [
        unknown, Record<string, unknown>, Record<string, unknown>,
      ];
      expect(toVars.ease).toBe('power2.out');
      expect(toVars.duration).toBe(CABINET_POP_DURATION);
    });

    it('the very first mount (no prior real value) at a partial popped value is treated as "popping in" — matches the existing numeric-opposite mount behavior', () => {
      const { container } = render(<CabinetBox popped={0.4} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));

      const topFace = container.querySelector('.sc-cabinet-box__top-face');
      const [, , toVars] = fromToMock.mock.calls.find(([target]) => target === topFace) as [
        unknown, Record<string, unknown>, Record<string, unknown>,
      ];
      expect(toVars.ease).toBe('power2.out');
      expect(toVars.duration).toBe(CABINET_POP_DURATION);
    });

    it('still returns duration 0 under prefers-reduced-motion when popping out, not CABINET_POP_DURATION_OUT', () => {
      stubMatchMedia(true);
      const { rerender } = render(<CabinetBox popped={true} timelineKey="test-box">x</CabinetBox>);
      const observer = MockResizeObserver.instances[0];
      act(() => observer.fire(100, 48));
      (setTimeline as ReturnType<typeof vi.fn>).mockClear();

      rerender(<CabinetBox popped={false} timelineKey="test-box">x</CabinetBox>);

      expect(setTimeline).toHaveBeenCalled();
    });
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 4)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((CabinetBox as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with identical props', () => {
      const { rerender } = render(
        <CabinetBox popped={false} timelineKey="test-box" boxHeight={48}>x</CabinetBox>,
      );
      const callsAfterMount = (useCabinetBoxHeight as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<CabinetBox popped={false} timelineKey="test-box" boxHeight={48}>x</CabinetBox>);
      rerender(<CabinetBox popped={false} timelineKey="test-box" boxHeight={48}>x</CabinetBox>);

      expect((useCabinetBoxHeight as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (popped)', () => {
      const { rerender } = render(
        <CabinetBox popped={false} timelineKey="test-box" boxHeight={48}>x</CabinetBox>,
      );
      const callsAfterMount = (useCabinetBoxHeight as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<CabinetBox popped={true} timelineKey="test-box" boxHeight={48}>x</CabinetBox>);

      expect((useCabinetBoxHeight as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
