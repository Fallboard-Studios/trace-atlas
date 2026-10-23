import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEffect, useRef } from 'react';

import { useStageFit } from './useStageFit';

// docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.1 (roadmap Phase 53, Task 7). The scene box is
// observed once; every resize writes the stage's three CSS custom properties from `sceneFit`. One
// write per resize, never per frame, and never a timer: the stage's CSS reads the properties.

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
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }

  /** One report per entry, as a real observer delivers the observed box. */
  fire(...boxes: Array<[width: number, height: number]>) {
    this.callback(
      boxes.map(([width, height]) => ({ contentRect: { width, height } }) as ResizeObserverEntry),
      this as unknown as ResizeObserver
    );
  }
}

let originalResizeObserver: typeof ResizeObserver;
let scene: HTMLElement;

beforeEach(() => {
  MockResizeObserver.instances = [];
  originalResizeObserver = globalThis.ResizeObserver;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  scene = document.createElement('div');
});

afterEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
});

function mountHook() {
  return renderHook(() => {
    const ref = useRef<HTMLElement>(scene);
    useStageFit(ref);
  });
}

const prop = (name: string) => scene.style.getPropertyValue(name);

describe('useStageFit', () => {
  it('observes the element behind the ref, and writes nothing until the observer reports', () => {
    mountHook();
    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0].observedTargets).toEqual([scene]);
    expect(prop('--stage-scale')).toBe('');
    expect(prop('--stage-x')).toBe('');
    expect(prop('--stage-y')).toBe('');
  });

  it('a 2560 x 1080 report writes the wider-than-16:9 fit: scale 4/3, no x, the top 360 cropped', () => {
    mountHook();
    MockResizeObserver.instances[0].fire([2560, 1080]);
    expect(parseFloat(prop('--stage-scale'))).toBeCloseTo(4 / 3, 5);
    expect(prop('--stage-x')).toBe('0px');
    expect(prop('--stage-y')).toBe('-360px');
  });

  it('a 1920 x 1080 report writes the identity fit', () => {
    mountHook();
    MockResizeObserver.instances[0].fire([1920, 1080]);
    expect(prop('--stage-scale')).toBe('1');
    expect(prop('--stage-x')).toBe('0px');
    expect(prop('--stage-y')).toBe('0px');
  });

  it('a portrait phone box writes a height-driven scale with a negative centring offset', () => {
    mountHook();
    MockResizeObserver.instances[0].fire([390, 400]);
    expect(parseFloat(prop('--stage-scale'))).toBeCloseTo(400 / 1080, 5);
    expect(parseFloat(prop('--stage-x'))).toBeCloseTo((390 - 1920 * (400 / 1080)) / 2, 2);
    expect(prop('--stage-x')).toMatch(/px$/);
    expect(prop('--stage-y')).toBe('0px');
  });

  it('writes clean numbers: scale unitless to six places, offsets in px to three, no float noise', () => {
    // Width-driven boxes leave float noise in y; a height-driven (portrait) box leaves it in x.
    const boxes: Array<[number, number]> = [
      [2560, 1080],
      [1366, 768],
      [390, 400],
      [1001, 563],
    ];
    for (const [width, height] of boxes) {
      const { unmount } = mountHook();
      MockResizeObserver.instances[MockResizeObserver.instances.length - 1].fire([width, height]);
      expect(prop('--stage-scale'), `${width}x${height} scale`).toMatch(/^\d+(\.\d{1,6})?$/);
      expect(prop('--stage-x'), `${width}x${height} x`).toMatch(/^-?\d+(\.\d{1,3})?px$/);
      expect(prop('--stage-y'), `${width}x${height} y`).toMatch(/^-?\d+(\.\d{1,3})?px$/);
      unmount();
    }
  });

  it('writes the three custom properties and nothing else', () => {
    mountHook();
    MockResizeObserver.instances[0].fire([2560, 1080]);
    expect(scene.style.length).toBe(3);
    expect(scene.getAttribute('style')).not.toMatch(/transform/);
  });

  it('a later report of a new size replaces the earlier fit', () => {
    mountHook();
    const observer = MockResizeObserver.instances[0];
    observer.fire([2560, 1080]);
    observer.fire([1920, 1080]);
    expect(prop('--stage-scale')).toBe('1');
    expect(prop('--stage-y')).toBe('0px');
  });

  it('a 0 x 0 report leaves the three properties untouched', () => {
    mountHook();
    MockResizeObserver.instances[0].fire([0, 0]);
    expect(prop('--stage-scale')).toBe('');
    expect(prop('--stage-x')).toBe('');
    expect(prop('--stage-y')).toBe('');
  });

  it('a box with only one zero side is also skipped, and never overwrites an earlier real fit', () => {
    mountHook();
    const observer = MockResizeObserver.instances[0];
    observer.fire([2560, 1080]);
    const scale = prop('--stage-scale');
    observer.fire([0, 720]);
    observer.fire([1280, 0]);
    expect(prop('--stage-scale')).toBe(scale);
    expect(prop('--stage-y')).toBe('-360px');
  });

  it('a real report after a zero one writes the fit', () => {
    mountHook();
    const observer = MockResizeObserver.instances[0];
    observer.fire([0, 0]);
    observer.fire([1920, 1080]);
    expect(prop('--stage-scale')).toBe('1');
    expect(prop('--stage-x')).toBe('0px');
    expect(prop('--stage-y')).toBe('0px');
  });

  it('with several entries in one callback the last real one wins', () => {
    mountHook();
    MockResizeObserver.instances[0].fire([1920, 1080], [2560, 1080]);
    expect(prop('--stage-y')).toBe('-360px');
  });

  // The first painted frame must already be fitted: a passive effect runs after paint, so a hook
  // that observes there lets one frame show the unscaled world (and a camera that measures the
  // scroller at registration see an unfitted stage). A layout effect observes in the commit, so the
  // observer's first delivery lands in the same frame, before paint. The component's own passive
  // effect is declared first, so only a layout-time observe can come ahead of it.
  it('observes in the commit, ahead of every passive effect, so the first paint is already fitted', () => {
    const order: string[] = [];
    class RecordingObserver extends MockResizeObserver {
      observe(target: Element) {
        order.push('observe');
        super.observe(target);
      }
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RecordingObserver;
    renderHook(() => {
      useEffect(() => {
        order.push('passive effect');
      }, []);
      const ref = useRef<HTMLElement>(scene);
      useStageFit(ref);
    });
    expect(order).toEqual(['observe', 'passive effect']);
  });

  it('keeps the one observer across re-renders', () => {
    const { rerender } = mountHook();
    rerender();
    rerender();
    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0].disconnected).toBe(false);
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = mountHook();
    expect(MockResizeObserver.instances[0].disconnected).toBe(false);
    unmount();
    expect(MockResizeObserver.instances[0].disconnected).toBe(true);
  });

  it('does nothing, and does not throw, when the ref holds no element', () => {
    expect(() =>
      renderHook(() => {
        const ref = useRef<HTMLElement>(null);
        useStageFit(ref);
      })
    ).not.toThrow();
    expect(MockResizeObserver.instances).toHaveLength(0);
  });
});
