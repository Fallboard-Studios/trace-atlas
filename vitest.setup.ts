import { vi } from 'vitest';

// randomCoordinate() (src/utils/seedUtils.ts) drives useLocaleStore's default
// locale coordinates (localeStore.ts) so a real page load lands somewhere
// different each time, rather than always the same fixed plot. The whole
// suite predates that change and widely assumes the default locale sits at a
// fixed, reproducible coordinate pair — spawnSystem/factoryPlacementSystem/
// audioSwells etc. all derive seeded (noise-map) generation from it and
// assert determinism across repeated calls. Rather than pin coordinates in
// every one of those test files individually, mock randomCoordinate() back
// to a fixed (12, 68)-equivalent sequence (alternating on each call) for the
// whole suite — restoring the exact pre-randomization default. Individual
// test files that want to verify the *real* random behavior (seedUtils.test.ts)
// call vi.unmock('@/utils/seedUtils') to opt back out of this.
vi.mock('@/utils/seedUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./src/utils/seedUtils')>();
  let call = 0;
  return {
    ...actual,
    randomCoordinate: () => (call++ % 2 === 0 ? 12 : 68),
  };
});

// Minimal GSAP mock for unit tests to avoid DOM queries and timing issues.
vi.mock('gsap', () => {
  type TimelineConfig = { onComplete?: () => void } | undefined;
  interface TimelineObj {
    set(target?: unknown, vars?: unknown): TimelineObj;
    to(target?: unknown, config?: TimelineConfig): TimelineObj;
    fromTo(a?: unknown, b?: unknown, config?: TimelineConfig): TimelineObj;
    call(fn?: () => void): TimelineObj;
    eventCallback(): TimelineObj;
    kill(): void;
    play(): TimelineObj;
  }

  const noop = (): TimelineObj => {
    const obj = {
      // No onComplete on tl.set() (real GSAP's .set() vars don't take one
      // either) — it's an immediate, synchronous step, unlike .to()/.fromTo()
      // below. Missing until 2026-09-10, same class of gap as .kill() below:
      // masked because no prior consumer called tl.set() until
      // AccordionContainer's overflow-visibility fix needed a same-timeline
      // step that runs before the height tween rather than a separate
      // pre-timeline style mutation.
      set: (_target?: unknown, _vars?: unknown) => obj as TimelineObj,
      to: (_target?: unknown, config?: TimelineConfig) => {
        if (config && typeof config.onComplete === 'function') {
          Promise.resolve().then(() => config.onComplete && config.onComplete());
        }
        return obj as TimelineObj;
      },
      fromTo: (_a?: unknown, _b?: unknown, config?: TimelineConfig) => {
        if (config && typeof config.onComplete === 'function') {
          Promise.resolve().then(() => config.onComplete && config.onComplete());
        }
        return obj as TimelineObj;
      },
      call: (fn?: () => void) => {
        if (typeof fn === 'function') Promise.resolve().then(() => fn());
        return obj as TimelineObj;
      },
      eventCallback: () => obj as TimelineObj,
      // Every real consumer stores a gsap.timeline() result via
      // timelineMap.ts's setTimeline() and later calls .kill() on it via
      // killTimeline() (on unmount, or at the top of any re-run of the
      // effect that created it) — this mock's own timeline object needs a
      // matching no-op, same as delayedCall's below already has. Missing
      // until 2026-09-09: masked for a long time because most consumers'
      // own tests either supply a local gsap mock with its own .kill(), or
      // (CabinetBox specifically, before its width-gate fix) never
      // actually got far enough to register a real timeline in tests that
      // don't drive a ResizeObserver — found live once that gate was
      // removed and CabinetBox's timeline started registering (and later
      // getting killed) unconditionally on mount, in every test file that
      // renders a Button/Toggle without a local gsap mock of its own.
      kill: () => { },
      // swimAnimation.ts's createSwimTimeline() builds its timeline `paused:
      // true` (so it can register the timeline via setTimeline() before
      // anything plays) and calls tl.play() itself right before returning —
      // missing until 2026-09-27, same masking pattern as .kill()'s own gap
      // above: no consumer's test exercised this call path until
      // swimAnimation.test.ts (docs/tasks/TEST_COVERAGE_CORE_MODULES.md
      // Task 8) became the first test to invoke createSwimTimeline for real
      // rather than mocking swimAnimation.ts itself.
      play: () => obj as TimelineObj,
    };
    return obj as TimelineObj;
  };
  const mocked = {
    // timeline accepts an optional config; if onComplete provided, call it synchronously
    timeline: (config?: TimelineConfig) => {
      if (config && typeof config.onComplete === 'function') {
        // call on next microtask to emulate async completion
        Promise.resolve().then(() => config.onComplete && config.onComplete());
      }
      return noop();
    },
    set: () => { },
    to: () => { },
    fromTo: () => { },
    // Minimal delayedCall mock — does NOT auto-fire fn (unlike .timeline's
    // onComplete above): idleSystem.ts uses delayedCall to throttle repeated
    // self-scheduling (handleRobotIdle -> handleRobotArrival -> delayedCall ->
    // handleRobotIdle again), and firing it eagerly on a microtask would
    // recurse without the real timer's delay ever elapsing. Returns an object
    // with a no-op kill(), since callers store the result and may cancel it.
    delayedCall: (_delay?: number, _fn?: () => void) => ({ kill: () => { } }),
    // quickTo mock (useEasedControlValue.ts's own retargetable-tween ease, added alongside the
    // slider-ease feature) — returns a callable that emulates real quickTo's own "retarget
    // toward a new value" call shape: mutates the target's own property (so onComplete's
    // `proxyRef.current.v` read isn't stale — a real bug found live, this mock originally fired
    // onComplete without ever writing the value it reads back), then fires vars.onComplete on a
    // microtask, same timing convention as .timeline's own onComplete above. Never calls
    // onUpdate (like every other mock in this file) — useEasedControlValue relies on onComplete
    // alone to reach the exact target in a test environment, documented on its own module.
    quickTo: (target: Record<string, number>, prop: string, vars?: { onComplete?: () => void }) => {
      return (value: number) => {
        target[prop] = value;
        if (vars && typeof vars.onComplete === 'function') {
          Promise.resolve().then(() => vars.onComplete && vars.onComplete());
        }
      };
    },
    // No-op — killTweensOf targets a real Tween's internal registry this mock never populates.
    killTweensOf: () => { },
    utils: { selector: () => () => [] },
  };
  return { default: mocked, ...mocked };
});

// Polyfill ResizeObserver for test environment (Radix use-size expects it).
if ((globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver === undefined) {
  // Minimal no-op ResizeObserver mock sufficient for tests
  class MockResizeObserver {
    observe(_target: Element) {}
    unobserve(_target: Element) {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;
}
