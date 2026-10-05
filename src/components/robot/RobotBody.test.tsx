import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';

import { RobotBody } from './RobotBody';
import * as robotVisualHelpers from './robotVisualHelpers';
import * as orbiterDialsModule from './gem/orbiterDials';
import { getRobotGem } from './gem/polygon';
import { gemPalette } from './gem/gemPalette';
import { GEM_FACET_CONTRAST } from './gem/gemShading';
import { orbiterPlan } from './gem/orbiterMotion';
import { useUIStore } from '@/stores/uiStore';
import type { Robot } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';

const ORBITER_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

// Phase 39 (docs/specs/GEM_POLYGON_ROBOTS.md §1.5): RobotBody composes RobotGem. The audio memo
// holds only scale, lamp intensity and the two Mid lit levels; identity, battery, daylight and the
// seed-derived geometry are read outside it.

const ADSR = { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.3 };

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    state: 'idle',
    position: { x: 0, y: 0 },
    destination: null,
    direction: 'right',
    melody: [],
    audioAttributes: { adsr: ADSR, filterFreq: 0, waveform: 'sine' },
    octaveRange: [3, 4],
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 100,
    identityColor: '#428d95',
    gemSeed: 20261004,
    ...overrides,
  } as Robot;
}

function withLayers(gains: [number, number, number], extra: Partial<Robot> = {}): Robot {
  const layers: OscillatorLayer[] = gains.map((gain) => ({ type: 'sine', gain, detune: 0, phase: 0 }));
  return makeRobot({ audioAttributes: { adsr: ADSR, filterFreq: 0, waveform: 'sine', layers }, ...extra });
}

function draw(robot: Robot, ignoreDaylight = false) {
  return render(<svg><RobotBody robot={robot} ignoreDaylight={ignoreDaylight} /></svg>);
}

const fill = (c: HTMLElement, sel: string) => c.querySelector(sel)?.getAttribute('fill') ?? null;
const topFace = (c: HTMLElement) => fill(c, '.gem__top .gem__face');
const midFace = (c: HTMLElement, side: 'left' | 'right') => fill(c, `.gem__mid--${side} .gem__face`);
const lightOpacity = (c: HTMLElement) => Number(c.querySelector('.gem__light')?.getAttribute('opacity'));
const rootTransform = (c: HTMLElement) => c.querySelector('g.gem')?.getAttribute('transform') ?? null;
// Facets are merged into one path per tone (Task 9a); compare the sorted facet quads — pure geometry,
// independent of which facets happen to share a tone for a given colour.
const facetQuads = (c: HTMLElement, scope = '') => [...c.querySelectorAll(`${scope} .gem__facets`)].flatMap((p) => p.getAttribute('d')!.split('Z').filter(Boolean)).sort();
const facetPoints = (c: HTMLElement) => facetQuads(c);
const lightness = (css: string | null) => Number(/, ([\d.]+)%\)$/.exec(css ?? '')?.[1]);

describe('RobotBody — composes RobotGem (Phase 39, Task 7)', () => {
  afterEach(() => {
    cleanup();
    useUIStore.getState().setActiveLocaleLocalTime(null);
  });

  it('draws the robot\'s own seeded geometry and none of the old hand-drawn parts', () => {
    // rhythmicDensity 80 (Phase 40 Task 7's real dial, not the old fixed-4 placeholder) keeps all
    // four orbiters shown, so this still counts backing + 4 orbiters + 2 mids + top.
    const { container } = draw(makeRobot({ rhythmicDensity: 80 }));
    const gem = getRobotGem(20261004);
    expect(container.querySelectorAll('g.gem__part')).toHaveLength(8);
    expect(facetQuads(container, '.gem__top')).toHaveLength(gem.top.pts.length);
    expect(container.querySelector('.window, .lamp, .greeble, .greebles, .socket, .details')).toBeNull();
  });

  it('a different gemSeed draws a different robot', () => {
    const { container: a, unmount } = draw(makeRobot({ gemSeed: 1 }));
    const pointsA = facetPoints(a);
    unmount();
    const { container: b } = draw(makeRobot({ gemSeed: 2 }));
    expect(facetPoints(b)).not.toEqual(pointsA);
  });

  describe('daylight', () => {
    it('without ignoreDaylight, the body colour follows activeLocaleLocalTime', () => {
      useUIStore.getState().setActiveLocaleLocalTime(12);
      const { container: noon, unmount } = draw(makeRobot());
      const noonFill = topFace(noon);
      unmount();
      useUIStore.getState().setActiveLocaleLocalTime(0);
      const { container: midnight } = draw(makeRobot());
      expect(noonFill).not.toBeNull();
      expect(topFace(midnight)).not.toBe(noonFill);
    });

    it('with ignoreDaylight, the body colour is the same at noon and midnight', () => {
      useUIStore.getState().setActiveLocaleLocalTime(12);
      const { container: noon, unmount } = draw(makeRobot(), true);
      const noonFill = topFace(noon);
      unmount();
      useUIStore.getState().setActiveLocaleLocalTime(0);
      const { container: midnight } = draw(makeRobot(), true);
      expect(noonFill).not.toBeNull(); // null === null would pass vacuously
      expect(topFace(midnight)).toBe(noonFill);
    });

    it('the top face at neutral daylight is the identity colour', () => {
      const { container } = draw(makeRobot(), true);
      const palette = gemPalette(getRobotGem(20261004), '#428d95', 1, [0.15, 0.15], GEM_FACET_CONTRAST);
      expect(topFace(container)).toBe(palette.top.face);
    });
  });

  describe('battery (not audio — outside the memo)', () => {
    it('critical battery dims the lights to 0.1× the full-battery value, same audio', () => {
      const { container: full, unmount } = draw(withLayers([1, 1, 1], { batteryLevel: 100 }));
      const fullOpacity = lightOpacity(full);
      unmount();
      const { container: critical } = draw(withLayers([1, 1, 1], { batteryLevel: 5 }));
      expect(lightOpacity(critical)).toBeCloseTo(fullOpacity * 0.1, 6);
    });

    it('ignoreDaylight does not change the battery dim', () => {
      const { container: a, unmount } = draw(makeRobot({ batteryLevel: 5 }));
      const normal = lightOpacity(a);
      unmount();
      const { container: b } = draw(makeRobot({ batteryLevel: 5 }), true);
      expect(Number.isFinite(normal)).toBe(true); // NaN is Object.is-equal to NaN
      expect(lightOpacity(b)).toBe(normal);
    });

    it('a low battery flattens the facets (lower contrast), floored so the bevel never vanishes', () => {
      const spread = (c: HTMLElement) => {
        const ls = [...c.querySelectorAll('.gem__top .gem__facets')].map((f) => lightness(f.getAttribute('fill')));
        return Math.max(...ls) - Math.min(...ls);
      };
      const { container: full, unmount } = draw(makeRobot({ batteryLevel: 100 }), true);
      const fullSpread = spread(full);
      unmount();
      const { container: critical } = draw(makeRobot({ batteryLevel: 5 }), true);
      expect(spread(critical)).toBeLessThan(fullSpread);
      expect(spread(critical)).toBeGreaterThan(0);
    });
  });

  describe('audio → the three live dials', () => {
    it('lights: layers[1].gain 0 vs 0.2 changes the light opacity', () => {
      // 0.2, not 1: a muted layer is excluded from the average, so 0 vs 1 with gain-1 neighbours
      // would average the same (calculateLampIntensity's own rule).
      const { container: muted, unmount } = draw(withLayers([1, 0, 1]));
      const mutedOpacity = lightOpacity(muted);
      unmount();
      const { container: audible } = draw(withLayers([1, 0.2, 1]));
      expect(lightOpacity(audible)).not.toBe(mutedOpacity);
    });

    it('lights: every layer muted at full battery still clears LAMP_MIN', () => {
      const { container } = draw(withLayers([0, 0, 0]));
      expect(lightOpacity(container)).toBeGreaterThanOrEqual(robotVisualHelpers.LAMP_MIN);
    });

    it('Mids: layers[1].gain 0 → 1 changes only mid--left; mid--right and the top stay put', () => {
      const { container: muted, unmount } = draw(withLayers([1, 0, 1]), true);
      const before = { left: midFace(muted, 'left'), right: midFace(muted, 'right'), top: topFace(muted) };
      unmount();
      const { container: lit } = draw(withLayers([1, 1, 1]), true);
      expect(midFace(lit, 'left')).not.toBe(before.left);
      expect(midFace(lit, 'right')).toBe(before.right);
      expect(topFace(lit)).toBe(before.top);
    });

    it('Mids: no layers at all → both Mids at the dark level', () => {
      const { container } = draw(makeRobot(), true);
      const dark = gemPalette(getRobotGem(20261004), '#428d95', 1, [robotVisualHelpers.MID_DARK_LEVEL, robotVisualHelpers.MID_DARK_LEVEL], GEM_FACET_CONTRAST);
      expect(midFace(container, 'left')).toBe(dark.midLeft.face);
      expect(midFace(container, 'right')).toBe(dark.midRight.face);
    });

    it('scale: a faster attack scales the body differently from a slower one', () => {
      const { container: fast, unmount } = draw(makeRobot({ audioAttributes: { adsr: { ...ADSR, attack: 0.1 }, filterFreq: 0, waveform: 'sine' } }));
      const fastTransform = rootTransform(fast);
      unmount();
      const { container: slow } = draw(makeRobot({ audioAttributes: { adsr: { ...ADSR, attack: 4 }, filterFreq: 0, waveform: 'sine' } }));
      expect(fastTransform).not.toBeNull();
      expect(rootTransform(slow)).not.toBe(fastTransform);
    });

    it('ignoreScale (card/avatar, Task 8) draws at scale 1 so the robot fits its own canvas; in-world keeps the audio scale', () => {
      // bass register × instant attack = the maximum body scale (1.3 × 1.3 = 1.69)
      const big = makeRobot({ octaveRange: [1, 3], audioAttributes: { adsr: { ...ADSR, attack: 0 }, filterFreq: 0, waveform: 'sine' } });
      const { container: world, unmount } = draw(big);
      expect(rootTransform(world)).toContain('scale(1.69');
      unmount();
      const { container: thumb } = render(<svg><RobotBody robot={big} ignoreDaylight ignoreScale /></svg>);
      expect(rootTransform(thumb)).toContain('scale(1)');
    });

    it('a waveform change never alters the geometry — nothing pops (the shape is seeded, not audio)', () => {
      const { container: sine, unmount } = draw(makeRobot());
      const sinePoints = facetPoints(sine);
      unmount();
      const { container: square } = draw(makeRobot({ audioAttributes: { adsr: ADSR, filterFreq: 0, waveform: 'square' } }));
      expect(sinePoints.length).toBeGreaterThan(0); // two empty lists would pass vacuously
      expect(facetPoints(square)).toEqual(sinePoints);
    });
  });

  // Backlog item 22 (docs/specs/ROBOT_BODY_LIGHTING_RERENDER.md): the once/sec lighting tick, and
  // every non-audio input, must not recompute the audio memo. Spies on bodyShapeFromAdsr across a
  // real module boundary (robotVisualHelpers.ts) — called exactly once per memo computation.
  describe('the audio memo recomputes only for audio', () => {
    it('daylight ticks do not recompute it', () => {
      const spy = vi.spyOn(robotVisualHelpers, 'bodyShapeFromAdsr');
      useUIStore.getState().setActiveLocaleLocalTime(12);
      draw(makeRobot());
      const afterMount = spy.mock.calls.length;
      expect(afterMount).toBeGreaterThan(0);
      act(() => { useUIStore.getState().setActiveLocaleLocalTime(0); });
      act(() => { useUIStore.getState().setActiveLocaleLocalTime(18); });
      expect(spy.mock.calls.length).toBe(afterMount);
      spy.mockRestore();
    });

    it.each([
      ['batteryLevel', { batteryLevel: 5 }],
      ['identityColor', { identityColor: '#d97b29' }],
      ['gemSeed', { gemSeed: 7 }],
    ] as const)('a %s-only change does not recompute it', (_field, change) => {
      const spy = vi.spyOn(robotVisualHelpers, 'bodyShapeFromAdsr');
      const robot = makeRobot();
      const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
      const afterMount = spy.mock.calls.length;
      expect(afterMount).toBeGreaterThan(0);
      rerender(<svg><RobotBody robot={{ ...robot, ...change }} /></svg>);
      expect(spy.mock.calls.length).toBe(afterMount);
      spy.mockRestore();
    });

    it('an identity-only change recolours the body but leaves scale and geometry alone', () => {
      const { container: blue, unmount } = draw(makeRobot({ identityColor: '#428d95' }));
      const before = { face: topFace(blue), transform: rootTransform(blue), points: facetPoints(blue) };
      unmount();
      const { container: orange } = draw(makeRobot({ identityColor: '#d97b29' }));
      expect(before.points.length).toBeGreaterThan(0);
      expect(topFace(orange)).not.toBe(before.face);
      expect(rootTransform(orange)).toBe(before.transform);
      expect(facetPoints(orange)).toEqual(before.points);
    });
  });

  // Phase 40 (docs/specs/ORBITING_POLYGONS.md §1.5, Task 7): the composition memo maps the five
  // composition fields to the orbiter dials, separate from the audio memo above.
  describe('orbiter composition (Phase 40, Task 7)', () => {
    it('rhythmicDensity 80 shows 4 orbiters, 10 shows 1, in the seeded corner order', () => {
      const plan = orbiterPlan(20261004);
      const { container: low, unmount } = draw(makeRobot({ rhythmicDensity: 10 }));
      const lowWrappers = [...low.querySelectorAll('.gem__orbiter')];
      expect(lowWrappers).toHaveLength(1);
      expect(lowWrappers[0].getAttribute('class')).toBe(`gem__orbiter gem__orbiter--${ORBITER_CORNERS[plan.cornerOrder[0]]}`);
      unmount();
      const { container: high } = draw(makeRobot({ rhythmicDensity: 80 }));
      const highWrappers = [...high.querySelectorAll('.gem__orbiter')];
      expect(highWrappers).toHaveLength(4);
      expect(highWrappers.map((w) => w.getAttribute('class'))).toEqual(
        plan.cornerOrder.map((c) => `gem__orbiter gem__orbiter--${ORBITER_CORNERS[c]}`),
      );
    });

    it('rhythmicMotifLength.value 0 scales orbiters to 0.75', () => {
      const { container } = draw(makeRobot({ rhythmicMotifLength: { active: false, value: 0 } }));
      const local = container.querySelector('.gem__orbiter-local')!;
      expect(local.getAttribute('transform')).toBe('scale(0.75)');
    });

    it('noteVariance.value 8 sets the orbiter line width to 1.1', () => {
      const { container } = draw(makeRobot({ noteVariance: { active: true, value: 8 } }));
      const lines = container.querySelector('.gem__orbiter .gem__lines')!;
      expect(lines.getAttribute('stroke-width')).toBe('1.1');
    });

    it('pitchRepeat 100 sets the orbiter strip opacity to 1', () => {
      const { container } = draw(makeRobot({ pitchRepeat: 100 }));
      const strip = container.querySelector('.gem__orbiter .gem__strip')!;
      expect(strip.getAttribute('opacity')).toBe('1');
    });

    it('motion undefined renders the static path — no depth-copy wrapper, only the seeded count shown', () => {
      const { container } = draw(makeRobot());
      expect(container.querySelector('.gem__orbiter[data-depth="behind"]')).toBeNull();
      expect(container.querySelectorAll('.gem__orbiter')).toHaveLength(2); // DEFAULT_RHYTHMIC_DENSITY 50 -> count 2
    });

    it('motion="world" renders the motion: true path — all 12 depth copies', () => {
      const { container } = render(<svg><RobotBody robot={makeRobot()} motion="world" /></svg>);
      expect(container.querySelectorAll('.gem__orbiter')).toHaveLength(12);
      (['behind', 'rest', 'front'] as const).forEach((depth) => {
        expect(container.querySelectorAll(`.gem__orbiter[data-depth="${depth}"]`)).toHaveLength(4);
      });
    });
  });

  describe('the composition memo recomputes only for composition fields', () => {
    it('daylight ticks do not recompute it', () => {
      const spy = vi.spyOn(orbiterDialsModule, 'orbiterDials');
      useUIStore.getState().setActiveLocaleLocalTime(12);
      draw(makeRobot());
      const afterMount = spy.mock.calls.length;
      expect(afterMount).toBeGreaterThan(0);
      act(() => { useUIStore.getState().setActiveLocaleLocalTime(0); });
      act(() => { useUIStore.getState().setActiveLocaleLocalTime(18); });
      expect(spy.mock.calls.length).toBe(afterMount);
      spy.mockRestore();
    });

    it('an adsr-only change does not recompute it', () => {
      const spy = vi.spyOn(orbiterDialsModule, 'orbiterDials');
      const robot = makeRobot();
      const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
      const afterMount = spy.mock.calls.length;
      expect(afterMount).toBeGreaterThan(0);
      rerender(<svg><RobotBody robot={{ ...robot, audioAttributes: { ...robot.audioAttributes, adsr: { ...ADSR, attack: 4 } } }} /></svg>);
      expect(spy.mock.calls.length).toBe(afterMount);
      spy.mockRestore();
    });

    it('a density-only change recomputes the composition memo but not the audio memo', () => {
      const compositionSpy = vi.spyOn(orbiterDialsModule, 'orbiterDials');
      const audioSpy = vi.spyOn(robotVisualHelpers, 'bodyShapeFromAdsr');
      const robot = makeRobot({ rhythmicDensity: 10 });
      const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
      const compositionAfterMount = compositionSpy.mock.calls.length;
      const audioAfterMount = audioSpy.mock.calls.length;
      rerender(<svg><RobotBody robot={{ ...robot, rhythmicDensity: 80 }} /></svg>);
      expect(compositionSpy.mock.calls.length).toBeGreaterThan(compositionAfterMount);
      expect(audioSpy.mock.calls.length).toBe(audioAfterMount);
      compositionSpy.mockRestore();
      audioSpy.mockRestore();
    });
  });
});
