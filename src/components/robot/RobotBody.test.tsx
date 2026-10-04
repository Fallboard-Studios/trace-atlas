import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';

import { RobotBody } from './RobotBody';
import * as robotVisualHelpers from './robotVisualHelpers';
import { useUIStore } from '@/stores/uiStore';
import type { Robot } from '@/types/Robot';

// Scoped to the new `ignoreDaylight` prop only (RobotBody had no test file before this task) —
// not a retroactive full suite for its existing untested visual-mapping logic.

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    state: 'idle',
    position: { x: 0, y: 0 },
    destination: null,
    direction: 'right',
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
      filterFreq: 0,
      waveform: 'sine', // sine -> RobotSleek (ROBOT_DESIGN.md's waveform->shape mapping)
    },
    octaveRange: [3, 4],
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 50,
    ...overrides,
  } as Robot;
}

// RobotSleek's base-hull path is the one element whose fill comes straight from `colors.primary`
// (every other fill in that component is a static hex) — the most direct signal for "did the
// day/night lightness multiplier change the rendered color."
function primaryFill(container: HTMLElement): string | null {
  return container.querySelector('path')?.getAttribute('fill') ?? null;
}

// The Window group is wrapped in `<g opacity={dimOpacity}>` (battery-driven, independent of
// day/night) — selected via its known static ellipse fill rather than a class, since none exists.
function windowGroupOpacity(container: HTMLElement): string | null {
  return container.querySelector('ellipse[fill="#78cce2"]')?.closest('g')?.getAttribute('opacity') ?? null;
}

// The root body group is centre-scaled: translate(48,36) scale(s) translate(-48,-36) (Task 5).
function rootTransform(container: HTMLElement): string | null {
  return container.querySelector('g[transform^="translate(48,36)"]')?.getAttribute('transform') ?? null;
}

describe('RobotBody', () => {
  afterEach(() => {
    cleanup();
    useUIStore.getState().setActiveLocaleLocalTime(null);
  });

  it('regression guard: without ignoreDaylight, color still varies with activeLocaleLocalTime', () => {
    const robot = makeRobot();

    useUIStore.getState().setActiveLocaleLocalTime(12); // full daylight multiplier (=1)
    const { container: noon, unmount: unmountNoon } = render(<svg><RobotBody robot={robot} /></svg>);
    const noonFill = primaryFill(noon);
    unmountNoon();

    useUIStore.getState().setActiveLocaleLocalTime(0); // fully dark multiplier (=0)
    const { container: midnight } = render(<svg><RobotBody robot={robot} /></svg>);
    const midnightFill = primaryFill(midnight);

    expect(noonFill).not.toBeNull();
    expect(midnightFill).not.toBeNull();
    expect(midnightFill).not.toBe(noonFill);
  });

  it('with ignoreDaylight, color is identical regardless of activeLocaleLocalTime', () => {
    const robot = makeRobot();

    useUIStore.getState().setActiveLocaleLocalTime(12);
    const { container: noon, unmount: unmountNoon } = render(<svg><RobotBody robot={robot} ignoreDaylight /></svg>);
    const noonFill = primaryFill(noon);
    unmountNoon();

    useUIStore.getState().setActiveLocaleLocalTime(0);
    const { container: midnight } = render(<svg><RobotBody robot={robot} ignoreDaylight /></svg>);
    const midnightFill = primaryFill(midnight);

    expect(noonFill).not.toBeNull();
    expect(midnightFill).toBe(noonFill);
  });

  it('battery dim is unaffected by ignoreDaylight — a low-battery robot dims its window either way', () => {
    const lowBattery = makeRobot({ batteryLevel: 5 });
    const fullBattery = makeRobot({ batteryLevel: 100 });
    useUIStore.getState().setActiveLocaleLocalTime(12);

    const { container: lowNoDaylightBypass, unmount: u1 } = render(<svg><RobotBody robot={lowBattery} /></svg>);
    const lowOpacityNormal = windowGroupOpacity(lowNoDaylightBypass);
    u1();

    const { container: lowWithDaylightBypass, unmount: u2 } = render(<svg><RobotBody robot={lowBattery} ignoreDaylight /></svg>);
    const lowOpacityBypassed = windowGroupOpacity(lowWithDaylightBypass);
    u2();

    const { container: fullBatteryContainer } = render(<svg><RobotBody robot={fullBattery} ignoreDaylight /></svg>);
    const fullOpacity = windowGroupOpacity(fullBatteryContainer);

    expect(lowOpacityNormal).not.toBeNull();
    // ignoreDaylight (day/night bypass) does not change the battery-driven dim value.
    expect(lowOpacityBypassed).toBe(lowOpacityNormal);
    // A low-battery robot is dimmer than a full-battery robot regardless of ignoreDaylight.
    expect(Number(lowOpacityBypassed)).toBeLessThan(Number(fullOpacity));
  });

  // The regression test backlog item 22's fix is for (docs/specs/ROBOT_BODY_LIGHTING_RERENDER.md).
  // Spies on shapeParamsFromAudio (robotVisualHelpers.ts) rather than a same-module internal
  // reference — RobotBody.tsx imports it across a real module boundary, so vi.spyOn's
  // replacement is actually what RobotBody.tsx calls. Same lesson item 21's Task 4 learned the
  // hard way (a function a module calls on itself internally isn't observable this way under
  // this project's Vite/Vitest SSR transform).
  it('does not recompute shapeParamsFromAudio on every activeLocaleLocalTime tick — only on mount', () => {
    const spy = vi.spyOn(robotVisualHelpers, 'shapeParamsFromAudio');
    const robot = makeRobot();

    useUIStore.getState().setActiveLocaleLocalTime(12);
    render(<svg><RobotBody robot={robot} /></svg>);
    const callsAfterMount = spy.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    act(() => { useUIStore.getState().setActiveLocaleLocalTime(0); });
    act(() => { useUIStore.getState().setActiveLocaleLocalTime(18); });
    act(() => { useUIStore.getState().setActiveLocaleLocalTime(6); });

    expect(spy.mock.calls.length).toBe(callsAfterMount);
    spy.mockRestore();
  });

  describe('live body (Phase 36 Task 6 — edits reach the body, no spawn-time snapshot)', () => {
    it('a faster attack produces a different (larger) body scale than a slower one', () => {
      const fastAttack = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' } });
      const slowAttack = makeRobot({ audioAttributes: { adsr: { attack: 4, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' } });

      const { container: fast, unmount: u1 } = render(<svg><RobotBody robot={fastAttack} /></svg>);
      const fastTransform = rootTransform(fast);
      u1();

      const { container: slow } = render(<svg><RobotBody robot={slowAttack} /></svg>);
      const slowTransform = rootTransform(slow);

      expect(fastTransform).not.toBeNull();
      expect(slowTransform).not.toBeNull();
      expect(fastTransform).not.toBe(slowTransform);
    });

    it('release past the 2.5s midpoint of the 5s normaliser toggles the .details group live', () => {
      const shortRelease = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 1 }, filterFreq: 0, waveform: 'sine' } });
      const longRelease = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 4 }, filterFreq: 0, waveform: 'sine' } });

      const { container: short } = render(<svg><RobotBody robot={shortRelease} /></svg>);
      expect(short.querySelector('.details')).toBeNull();

      const { container: long } = render(<svg><RobotBody robot={longRelease} /></svg>);
      expect(long.querySelector('.details')).not.toBeNull();
    });
  });
});
