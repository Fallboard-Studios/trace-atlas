import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { useLayoutEffect } from 'react';

import { RobotBody } from './RobotBody';
import * as robotVisualHelpers from './robotVisualHelpers';
import * as orbiterDialsModule from './gem/orbiterDials';
import * as haloDialsModule from './gem/haloDials';
import * as bodyLineDialsModule from './gem/bodyLineDials';
import * as gemPaletteModule from './gem/gemPalette';
import { getRobotGem } from './gem/polygon';
import { gemPalette } from './gem/gemPalette';
import { HALO_RADIUS_MIN, HALO_RADIUS_MAX } from './gem/haloDials';
import { BODY_STRIP_OPACITY } from './gem/bodyLineDials';
import { GEM_FACET_CONTRAST } from './gem/gemShading';
import { orbiterPlan } from './gem/orbiterMotion';
import type { ArcDecorator } from './gem/useHaloMotion';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Locale } from '@/types/locale';
import { useUIStore } from '@/stores/uiStore';
import { timelineMap, killAllTimelines } from '@/animation/timelineMap';
import { getArcDecorator, getOrbiterWork, clearRobotMotionRegistry } from '@/animation/robotMotionRegistry';
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
    position: { x: 0, y: 0 },
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

function draw(robot: Robot, ignoreDaylight = false, motion?: 'world' | 'avatar') {
  return render(<svg><RobotBody robot={robot} ignoreDaylight={ignoreDaylight} motion={motion} /></svg>);
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

    it('motion undefined renders the static path — only the seeded count shown', () => {
      const { container } = draw(makeRobot());
      expect(container.querySelectorAll('.gem__orbiter')).toHaveLength(2); // DEFAULT_RHYTHMIC_DENSITY 50 -> count 2
    });

    it('motion="world" renders the motion: true path — all 4 docked copies', () => {
      const { container } = render(<svg><RobotBody robot={makeRobot()} motion="world" /></svg>);
      expect(container.querySelectorAll('.gem__orbiter')).toHaveLength(4);
    });

    it('motion="world" registers orbiters-world-<id>; without motion, no key is registered (Phase 40 Task 12)', () => {
      killAllTimelines();
      render(<svg><RobotBody robot={makeRobot({ id: 'r-world' })} motion="world" /></svg>);
      expect(timelineMap.has('orbiters-world-r-world')).toBe(true);
      killAllTimelines();

      render(<svg><RobotBody robot={makeRobot({ id: 'r-static' })} /></svg>);
      expect(timelineMap.has('orbiters-world-r-static')).toBe(false);
      killAllTimelines();
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

  // Phase 41 (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.5, Task 7): the halo and body-line memos,
  // the company-colour selector, and the static wiring into RobotGem.
  describe('halo and body lines (Phase 41, Task 7)', () => {
    const localeId = getActiveLocaleId();
    const gem = getRobotGem(20261004);
    const COMPANY = { id: 'c1', name: 'Acme', color: '#ae5378', robotIds: [] as string[] };

    afterEach(() => {
      useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
    });

    const OFF = { lane: 'a' as const, depth: 0 };
    /** Every robot LFO target linked at depth 0, with overrides — the shape spawnSystem writes. */
    const links = (overrides: Partial<NonNullable<Robot['lfoLinks']>>) => ({
      'layer0.gain': OFF, 'layer0.detune': OFF, 'layer1.gain': OFF, 'layer1.detune': OFF, 'layer2.gain': OFF, 'layer2.detune': OFF,
      ...overrides,
    }) as Robot['lfoLinks'];

    const haloEl = (c: HTMLElement) => c.querySelector('ellipse.gem__halo')!;
    // The halo's own gradient, resolved via the ellipse's `fill` (not a combined selector through
    // <radialGradient> — a jsdom gotcha, see project memory: that descendant selector matches
    // nothing). Scoping this way also keeps these helpers correct now that a ripple gradient's
    // five stops sit alongside the halo's six (Task 13 wires `ripple`).
    const haloGradient = (c: HTMLElement) => {
      const el = c.querySelector('ellipse.gem__halo');
      const match = el && /url\(#(.+)\)/.exec(el.getAttribute('fill') ?? '');
      return match ? c.querySelector(`#${match[1]}`) : null;
    };
    const haloStopEls = (c: HTMLElement) => [...(haloGradient(c)?.querySelectorAll('stop') ?? [])];
    const stopColors = (c: HTMLElement) => haloStopEls(c).map((s) => s.getAttribute('stop-color'));
    const stopOffsets = (c: HTMLElement) => haloStopEls(c).map((s) => s.getAttribute('offset'));
    const stopOpacities = (c: HTMLElement) => haloStopEls(c).map((s) => Number(s.getAttribute('stop-opacity')));
    const lineWidth = (c: HTMLElement, sel: string) => c.querySelector(`${sel} .gem__lines`)!.getAttribute('stroke-width');

    describe('halo colour (company, else identity)', () => {
      it('a robot in a company with colour #ae5378 draws its halo in that colour', () => {
        useLocaleStore.getState().addCompany(localeId, COMPANY);
        const { container } = draw(makeRobot({ companyId: 'c1' }), false, 'world');
        expect(new Set(stopColors(container))).toEqual(new Set(['#ae5378']));
      });

      it('companyId undefined → identityColor (freelance glows in its own card colour)', () => {
        useLocaleStore.getState().addCompany(localeId, COMPANY);
        const { container } = draw(makeRobot({ identityColor: '#428d95' }), false, 'world');
        expect(new Set(stopColors(container))).toEqual(new Set(['#428d95']));
      });

      it('a companyId with no matching company → identityColor', () => {
        const { container } = draw(makeRobot({ companyId: 'ghost', identityColor: '#428d95' }), false, 'world');
        expect(new Set(stopColors(container))).toEqual(new Set(['#428d95']));
      });

      it('the halo memo recomputes on a company colour change (HaloLayer freezes its own DOM copy until Task 13 wires useHaloMotion, Phase 41 Task 9 — the memo itself is still live)', () => {
        useLocaleStore.getState().addCompany(localeId, COMPANY);
        const haloSpy = vi.spyOn(haloDialsModule, 'haloDials');
        draw(makeRobot({ companyId: 'c1' }), false, 'world');
        const afterMount = haloSpy.mock.calls.length;
        act(() => { useLocaleStore.getState().updateCompany(localeId, 'c1', { color: '#123456' }); });
        expect(haloSpy.mock.calls.length).toBeGreaterThan(afterMount);
        haloSpy.mockRestore();
      });

      it('a company colour already set at mount shows in the frozen halo', () => {
        useLocaleStore.getState().addCompany(localeId, COMPANY);
        const { container } = draw(makeRobot({ companyId: 'c1' }), false, 'world');
        expect(new Set(stopColors(container))).toEqual(new Set(['#ae5378']));
      });
    });

    describe('halo size and shape (world/avatar only — amendment: the halo never renders on cards)', () => {
      it('cards (no motion) render no halo at all', () => {
        const { container } = draw(makeRobot());
        expect(container.querySelector('ellipse.gem__halo')).toBeNull();
        expect(container.querySelector('radialGradient')).toBeNull();
      });

      it('volume 0 → ry 20, volume 1 → ry 40; rx = radius × the gem\'s width factor', () => {
        const quiet = draw(makeRobot({ masterVolume: 0 }), false, 'world').container;
        expect(haloEl(quiet).getAttribute('ry')).toBe(String(HALO_RADIUS_MIN));
        expect(haloEl(quiet).getAttribute('rx')).toBe(String(HALO_RADIUS_MIN * gem.widthFactor));
        cleanup();
        const loud = draw(makeRobot({ masterVolume: 1 }), false, 'world').container;
        expect(haloEl(loud).getAttribute('ry')).toBe(String(HALO_RADIUS_MAX));
        expect(haloEl(loud).getAttribute('rx')).toBe(String(HALO_RADIUS_MAX * gem.widthFactor));
      });

      it('six stops, the envelope laid out: a different ADSR at mount moves the stops (HaloLayer freezes its DOM copy after mount until Task 13 wires useHaloMotion — the dial itself, asserted at mount, still differs)', () => {
        const robot = makeRobot();
        const before = draw(robot, false, 'world').container;
        expect(stopOffsets(before)).toHaveLength(6);
        cleanup();
        const after = draw({ ...robot, audioAttributes: { ...robot.audioAttributes, adsr: { ...ADSR, attack: 4 } } }, false, 'world').container;
        expect(stopOffsets(after)).not.toEqual(stopOffsets(before));
      });

      it('the halo memo itself recomputes live on an ADSR edit of an already-mounted robot (frozen DOM, live memo — Task 13 wires the hook that closes this gap)', () => {
        const haloSpy = vi.spyOn(haloDialsModule, 'haloDials');
        const robot = makeRobot();
        const { rerender } = render(<svg><RobotBody robot={robot} motion="world" /></svg>);
        const afterMount = haloSpy.mock.calls.length;
        rerender(<svg><RobotBody robot={{ ...robot, audioAttributes: { ...robot.audioAttributes, adsr: { ...ADSR, attack: 4 } } }} motion="world" /></svg>);
        expect(haloSpy.mock.calls.length).toBeGreaterThan(afterMount);
        haloSpy.mockRestore();
      });

      it('sustain 0 → stops 3 and 4 transparent; sustain 1 → at the peak', () => {
        const low = draw(makeRobot({ audioAttributes: { adsr: { ...ADSR, sustain: 0 }, filterFreq: 0, waveform: 'sine' } }), false, 'world').container;
        expect(stopOpacities(low).slice(3, 5)).toEqual([0, 0]);
        cleanup();
        const high = draw(makeRobot({ audioAttributes: { adsr: { ...ADSR, sustain: 1 }, filterFreq: 0, waveform: 'sine' } }), false, 'world').container;
        expect(stopOpacities(high)[2]).toBeGreaterThan(0);
        expect(stopOpacities(high).slice(2, 5)).toEqual([stopOpacities(high)[2], stopOpacities(high)[2], stopOpacities(high)[2]]);
      });

      it('the halo ellipse opacity starts at 0 regardless of battery (amendment, 2026-10-06: no idle baseline — battery dim only ever shows during a spawn/despawn arc, useHaloMotion.test.tsx’s decorateArc suite)', () => {
        useUIStore.getState().setActiveLocaleLocalTime(0);
        const full = draw(makeRobot({ batteryLevel: 100 }), false, 'world').container;
        expect(haloEl(full).getAttribute('opacity')).toBe('0');
        cleanup();
        const critical = draw(makeRobot({ batteryLevel: 5 }), false, 'world').container;
        expect(haloEl(critical).getAttribute('opacity')).toBe('0');
      });

      it('no halo and no radialGradient without motion; halo-world-<id> / halo-avatar-<id> with it', () => {
        expect(draw(makeRobot({ id: 'r9' })).container.querySelector('radialGradient')).toBeNull();
        cleanup();
        const { container: world } = render(<svg><RobotBody robot={makeRobot({ id: 'r9' })} motion="world" /></svg>);
        expect(world.querySelector('radialGradient')!.getAttribute('id')).toBe('halo-world-r9');
        expect(haloEl(world).getAttribute('fill')).toBe('url(#halo-world-r9)');
        cleanup();
        const { container: avatar } = render(<svg><RobotBody robot={makeRobot({ id: 'r9' })} motion="avatar" /></svg>);
        expect(avatar.querySelector('radialGradient')!.getAttribute('id')).toBe('halo-avatar-r9');
      });

      it('motion undefined → no .gem__ripple and no halo timeline key (cards never render the halo)', () => {
        const { container } = draw(makeRobot({ id: 'r-static' }));
        expect(container.querySelector('.gem__ripple')).toBeNull();
        expect([...timelineMap.keys()].some((k) => k.startsWith('halo-'))).toBe(false);
      });
    });

    describe('body lines from lfoLinks', () => {
      it('layer1.gain depth 100 → mid--left lines 0.7, mid--right and top 0.3', () => {
        const { container } = draw(makeRobot({ lfoLinks: links({ 'layer1.gain': { lane: 'b', depth: 100 } }) }));
        expect(lineWidth(container, '.gem__mid--left')).toBe('0.7');
        expect(lineWidth(container, '.gem__mid--right')).toBe('0.3');
        expect(lineWidth(container, '.gem__top')).toBe('0.3');
      });

      it('no lfoLinks at all → every body line 0.3', () => {
        const { container } = draw(makeRobot());
        expect(lineWidth(container, '.gem__mid--left')).toBe('0.3');
        expect(lineWidth(container, '.gem__mid--right')).toBe('0.3');
        expect(lineWidth(container, '.gem__top')).toBe('0.3');
      });

      it('every body strip is at BODY_STRIP_OPACITY (0.6), fixed, regardless of gains or depth', () => {
        const { container } = draw(withLayers([1, 0, 1], { lfoLinks: links({ 'layer0.gain': { lane: 'a', depth: 100 } }) }));
        ['top', 'midLeft', 'midRight'].forEach((line) => {
          const strip = container.querySelector(`.gem__strip[data-line="${line}"]`)!;
          expect(strip.getAttribute('opacity')).toBe(String(BODY_STRIP_OPACITY));
          expect(strip.getAttribute('data-base')).toBe(String(BODY_STRIP_OPACITY));
        });
      });

      it('orbiter strips keep their own Pitch Repeat opacity, not the body constant', () => {
        const { container } = draw(makeRobot({ pitchRepeat: 100 }));
        expect(container.querySelector('.gem__strip[data-line="orbiters"]')!.getAttribute('opacity')).toBe('1');
      });
    });

    describe('motion wiring: useHaloMotion, decorateArc into useOrbiterMotion, useStripFlicker (Phase 41, Task 13)', () => {
      it('motion="world": a volume edit registers halo-world-<id>', () => {
        const robot = makeRobot({ id: 'r1', masterVolume: 0.5 });
        const { rerender } = render(<svg><RobotBody robot={robot} motion="world" /></svg>);
        expect(timelineMap.has('halo-world-r1')).toBe(false); // mount never tweens
        rerender(<svg><RobotBody robot={{ ...robot, masterVolume: 0.9 }} motion="world" /></svg>);
        expect(timelineMap.has('halo-world-r1')).toBe(true);
      });

      it('motion="world": an lfoLinks depth edit registers flicker-world-<id>-top, not any other line’s key', () => {
        const robot = makeRobot({ id: 'r1', lfoLinks: links({ 'layer0.gain': { lane: 'a', depth: 0 } }) });
        const { rerender } = render(<svg><RobotBody robot={robot} motion="world" /></svg>);
        rerender(<svg><RobotBody robot={{ ...robot, lfoLinks: links({ 'layer0.gain': { lane: 'a', depth: 80 } }) }} motion="world" /></svg>);
        expect(timelineMap.has('flicker-world-r1-top')).toBe(true);
        expect(timelineMap.has('flicker-world-r1-midLeft')).toBe(false);
        expect(timelineMap.has('flicker-world-r1-midRight')).toBe(false);
      });

      it('without motion: no halo or flicker keys, ever — cards stay fully static', () => {
        const robot = makeRobot({ id: 'r1', masterVolume: 0.5, lfoLinks: links({ 'layer0.gain': { lane: 'a', depth: 0 } }) });
        const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
        rerender(<svg><RobotBody robot={{ ...robot, masterVolume: 0.9, lfoLinks: links({ 'layer0.gain': { lane: 'a', depth: 80 } }) }} /></svg>);
        expect([...timelineMap.keys()].some((k) => k.startsWith('halo-') || k.startsWith('flicker-'))).toBe(false);
      });

      it('motion="world": RobotGem receives the ripple prop (gradientId ripple-world-<id>)', () => {
        const { container } = render(<svg><RobotBody robot={makeRobot({ id: 'r1' })} motion="world" /></svg>);
        const ripple = container.querySelector('.gem__ripple')!;
        expect(ripple).not.toBeNull();
        expect(ripple.getAttribute('fill')).toBe('url(#ripple-world-r1)');
      });

      describe('the motion registry (Phase 43 Task 17, spec §1.8)', () => {
        beforeEach(() => clearRobotMotionRegistry());

        it('motion="world" registers its decorateArc and the orbiter work lock under the robot id', () => {
          draw(makeRobot({ id: 'r-reg' }), false, 'world');
          expect(typeof getArcDecorator('r-reg')).toBe('function');
          expect(getOrbiterWork('r-reg')).toBeDefined();
        });

        it('the registered decorateArc is useHaloMotion’s own — it writes the ripple onto the arc timeline it is given', () => {
          draw(makeRobot({ id: 'r-reg' }), false, 'world');
          const arcTl = { to: vi.fn() };
          getArcDecorator('r-reg')!('spawn', 1, arcTl as unknown as Parameters<ArcDecorator>[2]);
          expect(arcTl.to).toHaveBeenCalledTimes(1);
        });

        it('motion="avatar" and cards (no motion) never register', () => {
          draw(makeRobot({ id: 'r-avatar' }), false, 'avatar');
          draw(makeRobot({ id: 'r-card' }));
          expect(getArcDecorator('r-avatar')).toBeUndefined();
          expect(getOrbiterWork('r-avatar')).toBeUndefined();
          expect(getArcDecorator('r-card')).toBeUndefined();
          expect(getOrbiterWork('r-card')).toBeUndefined();
        });

        it("both are registered by the time the parent Robot's mount (layout) effect runs (Phase 43 Task 23)", () => {
          // Robot.tsx's useGSAP mount calls onRobotMounted, which plays the exit arc at once and
          // reads the decorator then — a passive-effect registration would miss the first arc.
          const seen: unknown[] = [];
          function Parent({ children }: { children: React.ReactNode }) {
            useLayoutEffect(() => {
              seen.push(getArcDecorator('r-mount'), getOrbiterWork('r-mount'));
            }, []);
            return <g>{children}</g>;
          }
          render(<svg><Parent><RobotBody robot={makeRobot({ id: 'r-mount' })} motion="world" /></Parent></svg>);
          expect(typeof seen[0]).toBe('function');
          expect(seen[1]).toBeDefined();
        });

        it('unmount deregisters both', () => {
          const { unmount } = draw(makeRobot({ id: 'r-reg' }), false, 'world');
          unmount();
          expect(getArcDecorator('r-reg')).toBeUndefined();
          expect(getOrbiterWork('r-reg')).toBeUndefined();
        });

        it('unmounting the avatar of a robot leaves its world registration in place', () => {
          const robot = makeRobot({ id: 'r-both' });
          draw(robot, false, 'world');
          const decorate = getArcDecorator('r-both');
          const work = getOrbiterWork('r-both');
          draw(robot, false, 'avatar').unmount();
          expect(getArcDecorator('r-both')).toBe(decorate);
          expect(getOrbiterWork('r-both')).toBe(work);
        });

        it('an audio edit re-renders without re-registering — the same decorator and control stay', () => {
          const robot = makeRobot({ id: 'r-reg', masterVolume: 0.5 });
          const { rerender } = render(<svg><RobotBody robot={robot} motion="world" /></svg>);
          const decorate = getArcDecorator('r-reg');
          const work = getOrbiterWork('r-reg');
          rerender(<svg><RobotBody robot={{ ...robot, masterVolume: 0.9, rhythmicDensity: 80 }} motion="world" /></svg>);
          expect(getArcDecorator('r-reg')).toBe(decorate);
          expect(getOrbiterWork('r-reg')).toBe(work);
        });
      });

      it('motion="avatar" uses its own context throughout — halo-avatar-<id> / flicker-avatar-<id>-top / orbiters-avatar-<id>', () => {
        const robot = makeRobot({ id: 'r1', masterVolume: 0.5, lfoLinks: links({ 'layer0.gain': { lane: 'a', depth: 0 } }) });
        const { rerender } = render(<svg><RobotBody robot={robot} motion="avatar" /></svg>);
        expect(timelineMap.has('orbiters-avatar-r1')).toBe(true);
        rerender(<svg><RobotBody robot={{ ...robot, masterVolume: 0.9, lfoLinks: links({ 'layer0.gain': { lane: 'a', depth: 80 } }) }} motion="avatar" /></svg>);
        expect(timelineMap.has('halo-avatar-r1')).toBe(true);
        expect(timelineMap.has('flicker-avatar-r1-top')).toBe(true);
        expect(timelineMap.has('halo-world-r1')).toBe(false);
      });
    });

    describe('the halo and bodyLines memos recompute only for their own inputs', () => {
      it('an envelope edit recomputes the halo memo but not the composition memo', () => {
        const haloSpy = vi.spyOn(haloDialsModule, 'haloDials');
        const compositionSpy = vi.spyOn(orbiterDialsModule, 'orbiterDials');
        const robot = makeRobot();
        const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
        const haloAfterMount = haloSpy.mock.calls.length;
        const compositionAfterMount = compositionSpy.mock.calls.length;
        expect(haloAfterMount).toBeGreaterThan(0);
        rerender(<svg><RobotBody robot={{ ...robot, audioAttributes: { ...robot.audioAttributes, adsr: { ...ADSR, release: 2 } } }} /></svg>);
        expect(haloSpy.mock.calls.length).toBeGreaterThan(haloAfterMount);
        expect(compositionSpy.mock.calls.length).toBe(compositionAfterMount);
        haloSpy.mockRestore();
        compositionSpy.mockRestore();
      });

      it('a volume edit recomputes the halo memo', () => {
        const haloSpy = vi.spyOn(haloDialsModule, 'haloDials');
        const robot = makeRobot({ masterVolume: 0.2 });
        const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
        const afterMount = haloSpy.mock.calls.length;
        rerender(<svg><RobotBody robot={{ ...robot, masterVolume: 0.9 }} /></svg>);
        expect(haloSpy.mock.calls.length).toBeGreaterThan(afterMount);
        haloSpy.mockRestore();
      });

      it('a density edit recomputes neither the halo nor the bodyLines memo', () => {
        const haloSpy = vi.spyOn(haloDialsModule, 'haloDials');
        const linesSpy = vi.spyOn(bodyLineDialsModule, 'bodyLineDials');
        const robot = makeRobot({ rhythmicDensity: 10 });
        const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
        const haloAfterMount = haloSpy.mock.calls.length;
        const linesAfterMount = linesSpy.mock.calls.length;
        expect(linesAfterMount).toBeGreaterThan(0);
        rerender(<svg><RobotBody robot={{ ...robot, rhythmicDensity: 80 }} /></svg>);
        expect(haloSpy.mock.calls.length).toBe(haloAfterMount);
        expect(linesSpy.mock.calls.length).toBe(linesAfterMount);
        haloSpy.mockRestore();
        linesSpy.mockRestore();
      });

      it('an lfoLinks replacement recomputes the bodyLines memo; an ADSR edit does not', () => {
        const linesSpy = vi.spyOn(bodyLineDialsModule, 'bodyLineDials');
        const robot = makeRobot();
        const { rerender } = render(<svg><RobotBody robot={robot} /></svg>);
        const afterMount = linesSpy.mock.calls.length;
        rerender(<svg><RobotBody robot={{ ...robot, audioAttributes: { ...robot.audioAttributes, adsr: { ...ADSR, attack: 3 } } }} /></svg>);
        expect(linesSpy.mock.calls.length).toBe(afterMount);
        rerender(<svg><RobotBody robot={{ ...robot, lfoLinks: links({ 'layer0.gain': { lane: 'a', depth: 50 } }) }} /></svg>);
        expect(linesSpy.mock.calls.length).toBeGreaterThan(afterMount);
        linesSpy.mockRestore();
      });

      it('daylight ticks recompute neither memo (item-22 discipline extends to the new memos)', () => {
        const haloSpy = vi.spyOn(haloDialsModule, 'haloDials');
        const linesSpy = vi.spyOn(bodyLineDialsModule, 'bodyLineDials');
        useUIStore.getState().setActiveLocaleLocalTime(12);
        draw(makeRobot());
        const haloAfterMount = haloSpy.mock.calls.length;
        const linesAfterMount = linesSpy.mock.calls.length;
        act(() => { useUIStore.getState().setActiveLocaleLocalTime(0); });
        expect(haloSpy.mock.calls.length).toBe(haloAfterMount);
        expect(linesSpy.mock.calls.length).toBe(linesAfterMount);
        haloSpy.mockRestore();
        linesSpy.mockRestore();
      });
    });

    describe('the company selector (spec Assumption 2)', () => {
      it('a company rename does not re-render the body; a company colour change does', () => {
        useLocaleStore.getState().addCompany(localeId, COMPANY);
        const renderSpy = vi.spyOn(gemPaletteModule, 'gemPalette');
        draw(makeRobot({ companyId: 'c1' }));
        const afterMount = renderSpy.mock.calls.length;
        expect(afterMount).toBeGreaterThan(0);
        act(() => { useLocaleStore.getState().updateCompany(localeId, 'c1', { name: 'Renamed' }); });
        expect(renderSpy.mock.calls.length).toBe(afterMount);
        act(() => { useLocaleStore.getState().updateCompany(localeId, 'c1', { color: '#654321' }); });
        expect(renderSpy.mock.calls.length).toBeGreaterThan(afterMount);
        renderSpy.mockRestore();
      });

      it('another company\'s colour change does not re-render this robot\'s body', () => {
        useLocaleStore.getState().addCompany(localeId, COMPANY);
        useLocaleStore.getState().addCompany(localeId, { id: 'c2', name: 'Other', color: '#000000', robotIds: [] });
        const renderSpy = vi.spyOn(gemPaletteModule, 'gemPalette');
        draw(makeRobot({ companyId: 'c1' }));
        const afterMount = renderSpy.mock.calls.length;
        act(() => { useLocaleStore.getState().updateCompany(localeId, 'c2', { color: '#ffffff' }); });
        expect(renderSpy.mock.calls.length).toBe(afterMount);
        renderSpy.mockRestore();
      });
    });
  });
});
