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
    identityColor: '#428d95',
    greebles: [{ kind: 0, slot: 0 }, { kind: 2, slot: 3 }],
    ...overrides,
  } as Robot;
}

// RobotSleek's base-hull path is the one element whose fill comes straight from `colors.primary`
// (every other fill in that component is a static hex) — the most direct signal for "did the
// day/night lightness multiplier change the rendered color."
function primaryFill(container: HTMLElement): string | null {
  return container.querySelector('path')?.getAttribute('fill') ?? null;
}

// The Window group is `<g className="window" opacity={dimOpacity}>` (battery-driven, independent
// of day/night).
function windowGroupOpacity(container: HTMLElement): string | null {
  return container.querySelector('g.window')?.getAttribute('opacity') ?? null;
}

function windowFill(container: HTMLElement): string | null {
  return container.querySelector('g.window')?.firstElementChild?.getAttribute('fill') ?? null;
}

function lampOpacity(container: HTMLElement): string | null {
  return container.querySelector('g.lamp')?.getAttribute('opacity') ?? null;
}

function greebleParts(container: HTMLElement): { cls: string; transform: string | null }[] {
  return Array.from(container.querySelectorAll('.greeble')).map((el) => ({
    cls: el.getAttribute('class') ?? '',
    transform: el.getAttribute('transform'),
  }));
}

function socketOpacities(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('.socket')).map((el) => el.querySelector('[opacity]')?.getAttribute('opacity') ?? null);
}

function socketGlassFills(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('.socket')).map((el) => el.querySelector('[opacity]')?.firstElementChild?.getAttribute('fill') ?? null);
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

  describe('window glass carries the identity colour (Phase 36 Task 10)', () => {
    it('changing only identityColor changes the window fill and nothing else in the body', () => {
      const blue = makeRobot({ identityColor: '#428d95' });
      const orange = makeRobot({ identityColor: '#d97b29' });

      const { container: blueContainer, unmount } = render(<svg><RobotBody robot={blue} /></svg>);
      const blueFill = windowFill(blueContainer);
      const blueTransform = rootTransform(blueContainer);
      const bluePrimary = primaryFill(blueContainer);
      unmount();

      const { container: orangeContainer } = render(<svg><RobotBody robot={orange} /></svg>);
      const orangeFill = windowFill(orangeContainer);
      const orangeTransform = rootTransform(orangeContainer);
      const orangePrimary = primaryFill(orangeContainer);

      expect(blueFill).not.toBeNull();
      expect(orangeFill).not.toBeNull();
      expect(blueFill).not.toBe(orangeFill);
      expect(blueFill).toBe('#428d95');
      expect(orangeFill).toBe('#d97b29');
      // Nothing else in the body changes.
      expect(orangeTransform).toBe(blueTransform);
      expect(orangePrimary).toBe(bluePrimary);
    });
  });

  describe('lamp lit by live audible-layer gain (Phase 36 Task 11)', () => {
    function layers(coaxialGain: number) {
      return [
        { type: 'sine' as const, gain: 1, detune: 0, phase: 0 },
        { type: 'sine' as const, gain: coaxialGain, detune: 0, phase: 0 },
        { type: 'sine' as const, gain: 1, detune: 0, phase: 0 },
      ];
    }

    it('differing only in layers[1].gain (0 vs 0.2) changes the lamp opacity', () => {
      // 0.2, not 1: muting excludes the layer from the average rather than counting it as zero
      // (Task 3's own rule), so a muted-vs-full-gain pair with equal-gain neighbors would average
      // to the same value either way. 0.2 actually shifts the mean once it's counted in.
      const muted = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: layers(0) } });
      const audible = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: layers(0.2) } });

      const { container: mutedContainer, unmount } = render(<svg><RobotBody robot={muted} /></svg>);
      const mutedOpacity = lampOpacity(mutedContainer);
      unmount();

      const { container: audibleContainer } = render(<svg><RobotBody robot={audible} /></svg>);
      const audibleOpacity = lampOpacity(audibleContainer);

      expect(mutedOpacity).not.toBeNull();
      expect(audibleOpacity).not.toBeNull();
      expect(mutedOpacity).not.toBe(audibleOpacity);
    });

    it('full battery, every layer muted, still clears LAMP_MIN (times full dimOpacity)', () => {
      const robot = makeRobot({ batteryLevel: 100, audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: layers(0) } });
      // Baseline (layers[0]) is also muted here to hit the true all-muted fallback.
      robot.audioAttributes.layers![0].gain = 0;
      robot.audioAttributes.layers![2].gain = 0;

      const { container } = render(<svg><RobotBody robot={robot} /></svg>);
      const opacity = Number(lampOpacity(container));

      expect(opacity).toBeGreaterThanOrEqual(robotVisualHelpers.LAMP_MIN);
    });

    it('critical battery dims the lamp to 0.1x the full-battery value, same audio', () => {
      const full = makeRobot({ batteryLevel: 100, audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: layers(1) } });
      const critical = makeRobot({ batteryLevel: 5, audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: layers(1) } });

      const { container: fullContainer, unmount } = render(<svg><RobotBody robot={full} /></svg>);
      const fullOpacity = Number(lampOpacity(fullContainer));
      unmount();

      const { container: criticalContainer } = render(<svg><RobotBody robot={critical} /></svg>);
      const criticalOpacity = Number(lampOpacity(criticalContainer));

      expect(criticalOpacity).toBeCloseTo(fullOpacity * 0.1, 6);
    });
  });

  describe('greebles wired via RobotGreebles (Phase 37 Task 6)', () => {
    it('.greebles is present by default and absent with hideGreebles', () => {
      const robot = makeRobot();
      const { container: shown } = render(<svg><RobotBody robot={robot} /></svg>);
      expect(shown.querySelector('.greebles')).not.toBeNull();
      expect(shown.querySelectorAll('.greeble')).toHaveLength(2);

      const { container: hidden } = render(<svg><RobotBody robot={robot} hideGreebles /></svg>);
      expect(hidden.querySelector('.greebles')).toBeNull();
    });

    it('changing only adsr.attack leaves the .greeble count and classes unchanged (parts never pop)', () => {
      const fast = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' } });
      const slow = makeRobot({ audioAttributes: { adsr: { attack: 4, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' } });

      const { container: fastContainer, unmount } = render(<svg><RobotBody robot={fast} /></svg>);
      const fastParts = greebleParts(fastContainer);
      unmount();

      const { container: slowContainer } = render(<svg><RobotBody robot={slow} /></svg>);
      const slowParts = greebleParts(slowContainer);

      expect(slowParts).toEqual(fastParts);
    });

    it('a muted layer leaves the .greeble count and classes unchanged', () => {
      const audible = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }] } });
      const muted = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: [{ type: 'sine', gain: 0, detune: 0, phase: 0 }] } });

      const { container: audibleContainer, unmount } = render(<svg><RobotBody robot={audible} /></svg>);
      const audibleParts = greebleParts(audibleContainer);
      unmount();

      const { container: mutedContainer } = render(<svg><RobotBody robot={muted} /></svg>);
      const mutedParts = greebleParts(mutedContainer);

      expect(mutedParts).toEqual(audibleParts);
    });

    it('changing the Baseline waveform keeps the same greeble--{kind} classes but moves them (re-slot)', () => {
      const sine = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' } });
      const square = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'square' } });

      const { container: sineContainer, unmount } = render(<svg><RobotBody robot={sine} /></svg>);
      const sineParts = greebleParts(sineContainer);
      unmount();

      const { container: squareContainer } = render(<svg><RobotBody robot={square} /></svg>);
      const squareParts = greebleParts(squareContainer);

      expect(squareParts.map((p) => p.cls)).toEqual(sineParts.map((p) => p.cls));
      expect(squareParts.map((p) => p.transform)).not.toEqual(sineParts.map((p) => p.transform));
    });

    it('robot.greebles is not in the audio memo\'s dependency array — a greebles-only change does not recompute shapeParamsFromAudio', () => {
      const spy = vi.spyOn(robotVisualHelpers, 'shapeParamsFromAudio');
      const robot = makeRobot();
      const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
      const callsAfterMount = spy.mock.calls.length;
      expect(callsAfterMount).toBeGreaterThan(0);

      const sameAudioDifferentGreebles = { ...robot, greebles: [{ kind: 4, slot: 5 }] };
      rerender(<svg><RobotBody robot={sameAudioDifferentGreebles} /></svg>);

      expect(spy.mock.calls.length).toBe(callsAfterMount);
      spy.mockRestore();
    });
  });

  describe('layer sockets (Phase 38 Task 5)', () => {
    function layers(coaxialGain: number, harmonicGain = 1) {
      return [
        { type: 'sine' as const, gain: 1, detune: 0, phase: 0 },
        { type: 'sine' as const, gain: coaxialGain, detune: 0, phase: 0 },
        { type: 'sine' as const, gain: harmonicGain, detune: 0, phase: 0 },
      ];
    }

    it('renders exactly two .socket, both at SOCKET_DARK, when layers is undefined', () => {
      const robot = makeRobot({ batteryLevel: 100 }); // full battery isolates dimOpacity=1; default audioAttributes carries no `layers`
      const { container } = render(<svg><RobotBody robot={robot} /></svg>);

      const sockets = container.querySelectorAll('.socket');
      expect(sockets).toHaveLength(2);
      const opacities = socketOpacities(container).map(Number);
      expect(opacities[0]).toBeCloseTo(robotVisualHelpers.SOCKET_DARK);
      expect(opacities[1]).toBeCloseTo(robotVisualHelpers.SOCKET_DARK);
    });

    it('layers[1].gain 0 vs 1 changes only the coaxial socket\'s opacity, not the harmonic one', () => {
      const muted = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: layers(0) } });
      const lit = makeRobot({ audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: layers(1) } });

      const { container: mutedContainer, unmount } = render(<svg><RobotBody robot={muted} /></svg>);
      const mutedOpacities = socketOpacities(mutedContainer);
      unmount();

      const { container: litContainer } = render(<svg><RobotBody robot={lit} /></svg>);
      const litOpacities = socketOpacities(litContainer);

      expect(litOpacities[0]).not.toBe(mutedOpacities[0]);
      expect(litOpacities[1]).toBe(mutedOpacities[1]);
    });

    it('critical battery multiplies both socket opacities by 0.1, same audio', () => {
      const full = makeRobot({ batteryLevel: 100, audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: layers(1, 1) } });
      const critical = makeRobot({ batteryLevel: 5, audioAttributes: { adsr: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine', layers: layers(1, 1) } });

      const { container: fullContainer, unmount } = render(<svg><RobotBody robot={full} /></svg>);
      const fullOpacities = socketOpacities(fullContainer).map(Number);
      unmount();

      const { container: criticalContainer } = render(<svg><RobotBody robot={critical} /></svg>);
      const criticalOpacities = socketOpacities(criticalContainer).map(Number);

      expect(criticalOpacities[0]).toBeCloseTo(fullOpacities[0] * 0.1, 6);
      expect(criticalOpacities[1]).toBeCloseTo(fullOpacities[1] * 0.1, 6);
    });

    it('changing only identityColor changes the socket glass fill and nothing else in the body', () => {
      const blue = makeRobot({ identityColor: '#428d95' });
      const orange = makeRobot({ identityColor: '#d97b29' });

      const { container: blueContainer, unmount } = render(<svg><RobotBody robot={blue} /></svg>);
      const blueGlass = socketGlassFills(blueContainer);
      const blueTransform = rootTransform(blueContainer);
      const bluePrimary = primaryFill(blueContainer);
      unmount();

      const { container: orangeContainer } = render(<svg><RobotBody robot={orange} /></svg>);
      const orangeGlass = socketGlassFills(orangeContainer);
      const orangeTransform = rootTransform(orangeContainer);
      const orangePrimary = primaryFill(orangeContainer);

      expect(blueGlass).toEqual(['#428d95', '#428d95']);
      expect(orangeGlass).toEqual(['#d97b29', '#d97b29']);
      expect(orangeTransform).toBe(blueTransform);
      expect(orangePrimary).toBe(bluePrimary);
    });

    it('robot.batteryLevel is not in the audio memo\'s dependency array — a battery-only change does not recompute shapeParamsFromAudio', () => {
      const spy = vi.spyOn(robotVisualHelpers, 'shapeParamsFromAudio');
      const robot = makeRobot();
      const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
      const callsAfterMount = spy.mock.calls.length;
      expect(callsAfterMount).toBeGreaterThan(0);

      const sameAudioDifferentBattery = { ...robot, batteryLevel: 5 };
      rerender(<svg><RobotBody robot={sameAudioDifferentBattery} /></svg>);

      expect(spy.mock.calls.length).toBe(callsAfterMount);
      spy.mockRestore();
    });
  });
});
