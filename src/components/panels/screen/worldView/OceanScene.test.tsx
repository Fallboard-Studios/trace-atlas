// ========================================
// MOCKS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ReactElement } from 'react';

// A plain vi.fn(), not React.memo-wrapped — deliberately, so its own call count is a reliable
// proxy for "did OceanScene's render body reconstruct the robot layer again" (docs/todo/
// backlog.md #27 follow-up, 2026-09-15), the same "unmemoized mock as a render-count marker"
// technique RobotOptionsTab.test.tsx/CompanyOptionsSection.test.tsx already use. It draws a marker
// per robot id, so the robot-layer tests can read which row each robot landed in.
vi.mock('@/components/robot/Robot', () => ({
  Robot: vi.fn((props: { robotId: string }) => <g data-robot-mock={props.robotId} />),
}));
// Render an identifying marker (actor id + row) rather than null, so the scenery-interleave
// tests below can assert document order without needing the real Factory/Scenery visuals.
vi.mock('@/components/actors/Factory', () => ({
  Factory: (props: { actor: Actor }) => <g data-factory-mock={props.actor.id} data-row={props.actor.config?.row} />,
  default: (props: { actor: Actor }) => <g data-factory-mock={props.actor.id} data-row={props.actor.config?.row} />,
}));
vi.mock('@/components/actors/scenery/Scenery', () => ({
  Scenery: (props: { actor: Actor }) => <g data-scenery-mock={props.actor.id} data-row={props.actor.config?.row} />,
  default: (props: { actor: Actor }) => <g data-scenery-mock={props.actor.id} data-row={props.actor.config?.row} />,
}));
// A marker per station fragment, so the interleave tests read document order without the gem.
vi.mock('@/components/stations/ChargingStation', () => ({
  ChargingStation: (props: { station: { id: string }; fragment: string }) => (
    <g data-station-mock={props.station.id} data-fragment={props.fragment} />
  ),
}));
// Records what the scene hands its bubble layer (which actors, what total) without running
// BubbleStream's GSAP timelines.
const bubbleLayerMock = vi.fn((_props: { actors: { id: string }[]; totalBuildings: number }): ReactElement | null => null);
vi.mock('@/components/actors/BubbleLayer', () => ({
  BubbleLayer: (props: { actors: { id: string }[]; totalBuildings: number }) => bubbleLayerMock(props),
}));

const initializeLocaleMock = vi.fn();
vi.mock('@/systems/worldTransition', () => ({
  initializeLocale: (localeId: string) => initializeLocaleMock(localeId),
}));

const stopRobotLifecycleMock = vi.fn();
vi.mock('@/systems/robotSystems', () => ({
  stopRobotLifecycle: () => stopRobotLifecycleMock(),
}));

// vi.hoisted required here (unlike initializeLocaleMock/stopRobotLifecycleMock above): those two
// are only ever called from inside a React effect callback, well after module load, but
// getSessionSharePayload is called at attenuationStyleStore.ts's/localeStore.ts's own MODULE-LOAD
// time (Tasks 4/5) -- which happens while this file's import graph is still resolving, before a
// plain `const x = vi.fn()` below it would have run yet.
const { getSessionSharePayloadMock, consumeSessionSharePayloadMock, applySessionPayloadMock } = vi.hoisted(() => ({
  getSessionSharePayloadMock: vi.fn(),
  consumeSessionSharePayloadMock: vi.fn(),
  applySessionPayloadMock: vi.fn(),
}));
vi.mock('@/utils/sessionShareUtils', () => ({
  getSessionSharePayload: () => getSessionSharePayloadMock(),
  consumeSessionSharePayload: () => consumeSessionSharePayloadMock(),
}));
vi.mock('@/utils/sessionDiff', () => ({
  applySessionPayload: (payload: unknown, options: unknown) => applySessionPayloadMock(payload, options),
}));

// ========================================
// IMPORTS
// ========================================
import { OceanScene } from './OceanScene';
import { Robot } from '@/components/robot/Robot';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '@/stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { RECIPES } from '@/systems/districtRecipes';
import { getStations } from '@/systems/stations';
import { ActorType } from '@/types/Actor';
import type { Actor } from '@/types/Actor';
import type { Robot as RobotType } from '@/types/Robot';
import colorTheme from '@/constants/colorTheme.json';
import { hslToString } from '@/utils/colorUtils';
import { getRef } from '@/utils/refs';

function makeRobot(overrides: Partial<RobotType> = {}): RobotType {
  return {
    id: 'r1',
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' },
    octaveRange: [3, 4],
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 80,
    ...overrides,
  } as RobotType;
}

// ========================================
// TESTS
// ========================================

describe('OceanScene', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    initializeLocaleMock.mockClear();
    stopRobotLifecycleMock.mockClear();
    getSessionSharePayloadMock.mockReset().mockReturnValue(null);
    consumeSessionSharePayloadMock.mockReset().mockReturnValue(null);
    applySessionPayloadMock.mockClear();
  });

  describe('boot-time shareable-link apply (roadmap Phase 21)', () => {
    it('does not call applySessionPayload when no share payload is present (the common case)', () => {
      consumeSessionSharePayloadMock.mockReturnValue(null);
      render(<OceanScene />);
      expect(applySessionPayloadMock).not.toHaveBeenCalled();
      cleanup();
    });

    it('calls applySessionPayload with the share payload and { skipLocaleRebuild: true }, after initializeLocale, when one is present', () => {
      const payload = { attenuationStyleName: 'x' };
      consumeSessionSharePayloadMock.mockReturnValueOnce(payload);
      const callOrder: string[] = [];
      initializeLocaleMock.mockImplementation(() => callOrder.push('initializeLocale'));
      applySessionPayloadMock.mockImplementation(() => callOrder.push('applySessionPayload'));

      render(<OceanScene />);

      expect(applySessionPayloadMock).toHaveBeenCalledTimes(1);
      expect(applySessionPayloadMock).toHaveBeenCalledWith(payload, { skipLocaleRebuild: true });
      expect(callOrder).toEqual(['initializeLocale', 'applySessionPayload']);
      cleanup();
    });

    it('uses consumeSessionSharePayload, not getSessionSharePayload -- a power cycle (unmount, then remount, e.g. the power switch) must not re-apply the share payload', () => {
      // Real consumeSessionSharePayload returns the payload once, then null forever -- simulate
      // that one-time-consumption contract directly in the mock, rather than re-testing the real
      // implementation here (that's sessionShareUtils.test.ts's job). This is a regression guard
      // for the OceanScene call site specifically: it must call consumeSessionSharePayload (whose
      // contract handles the power-cycle case), not the plain getSessionSharePayload getter
      // (which would keep returning the same payload forever, re-applying on every power-on).
      const payload = { attenuationStyleName: 'x' };
      consumeSessionSharePayloadMock.mockReturnValueOnce(payload).mockReturnValue(null);

      const { unmount } = render(<OceanScene />);
      unmount();
      render(<OceanScene />);

      expect(applySessionPayloadMock).toHaveBeenCalledTimes(1);
      expect(getSessionSharePayloadMock).not.toHaveBeenCalled();
      cleanup();
    });
  });

  it('calls initializeLocale with the active locale id on mount, exactly once', () => {
    render(<OceanScene />);
    expect(initializeLocaleMock).toHaveBeenCalledTimes(1);
    expect(initializeLocaleMock).toHaveBeenCalledWith(DEFAULT_LOCALE_ID);
    cleanup();
  });

  it('calls stopRobotLifecycle on unmount', () => {
    const { unmount } = render(<OceanScene />);
    expect(stopRobotLifecycleMock).not.toHaveBeenCalled();
    unmount();
    expect(stopRobotLifecycleMock).toHaveBeenCalledTimes(1);
  });

  it('does not call initializeLocale again on re-render (mount-only effect)', () => {
    const { rerender } = render(<OceanScene width={1920} />);
    rerender(<OceanScene width={1000} />);
    expect(initializeLocaleMock).toHaveBeenCalledTimes(1);
    cleanup();
  });

  describe('re-render cascade regression (docs/todo/backlog.md #27 follow-up, 2026-09-15)', () => {
    // The end-to-end proof this whole fix exists for: `updateRobot` (localeStore.ts) hands back a
    // new top-level `robots` array reference on every write to ANY robot in the locale (battery
    // ticks, audio swells, field edits) even though it preserves each untouched robot's own object
    // reference. Before this fix, OceanScene subscribed to that whole array directly, so it (and
    // every <Robot> beneath it, none of which were memoized or looked up their own data) fully
    // re-rendered on every single one of those writes — even though robot movement itself is
    // fully GSAP/ref-driven and invisible to React, so none of that churn was ever legitimate
    // animation. `useShallow` on a plain id-array selector should make OceanScene's own body bail
    // unless the SET of robot ids actually changed.
    it("does not re-render the robot layer when an untouched robot's battery/audio field changes", () => {
      useLocaleStore.setState({
        locales: {
          [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'r1' }), makeRobot({ id: 'r2' })], actors: [] },
        },
      });
      render(<OceanScene />);
      const callsAfterMount = (Robot as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

      act(() => {
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r2', { batteryLevel: 55 });
      });

      expect((Robot as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('DOES re-render the robot layer when a robot is added — the roster genuinely changed', () => {
      useLocaleStore.setState({
        locales: {
          [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'r1' })], actors: [] },
        },
      });
      render(<OceanScene />);
      const callsAfterMount = (Robot as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

      act(() => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot({ id: 'r2' }));
      });

      expect((Robot as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });

  describe('scene layers (roadmap 17.2.5 — idle paint)', () => {
    // The idle paint localizer (scripts/perf/idle-paint.mjs) found one <svg> holding sixty static
    // factories AND every moving robot and bubble, so every GSAP transform write repainted the whole
    // scene at full viewport size on every frame. The scene is now four stacked <svg> layers:
    // static back (background + midground factories and the depth gradients), moving bubbles, moving
    // robots, static front (foreground factories). Z-order within the old single svg is preserved
    // except that every building's bubbles now rise behind the robots (Crawford's call, 2026-10-02:
    // foreground-row bubbles used to pass in front of them) and below the foreground row.
    // 'dense' is OceanScene's own fallback district (getRecipeRow(a.config?.district ?? 'dense', ...)),
    // so a row index alone resolves the same depth label the real implementation would see.
    const rowIndexFor = (label: 'background' | 'midground' | 'foreground'): number =>
      RECIPES.dense.findIndex((r) => r.depth === label);
    const makeFactory = (id: string, row: number, purpose: 'heavyIndustry' | 'observationComms' = 'heavyIndustry'): Actor => ({
      id, type: ActorType.FACTORY, position: { x: 100, y: 900 }, isActive: true, config: { row, district: 'dense', purpose },
    });

    beforeEach(() => {
      bubbleLayerMock.mockClear();
      useLocaleStore.setState({
        locales: {
          [DEFAULT_LOCALE_ID]: {
            ...DEFAULT_LOCALE,
            robots: [makeRobot({ id: 'r1' })],
            actors: [
              makeFactory('bg-1', rowIndexFor('background')),
              makeFactory('mid-1', rowIndexFor('midground'), 'observationComms'),
              makeFactory('fg-1', rowIndexFor('foreground')),
            ],
          },
        },
      });
    });

    // Phase 43 J4 (spec §1.10): the back robot row and the midground split out of `back`.
    it('renders six svg layers in back → robots-back → mid → bubbles → robots → front order, all inside the scene box', () => {
      const { container } = render(<OceanScene />);
      const scene = container.querySelector('.ocean-scene');
      expect(scene?.tagName.toLowerCase()).toBe('div');
      const layers = Array.from(scene!.querySelectorAll(':scope > svg.ocean-scene__layer'));
      expect(layers.map((l) => l.getAttribute('data-scene-layer'))).toEqual(
        ['back', 'robots-back', 'mid', 'bubbles', 'robots', 'front'],
      );
    });

    it('every layer shares the viewBox and the cover (slice) fit of the old single svg', () => {
      const { container } = render(<OceanScene />);
      for (const layer of container.querySelectorAll('svg.ocean-scene__layer')) {
        expect(layer.getAttribute('viewBox')).toBe('0 0 1920 1080');
        expect(layer.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
      }
    });

    it('marks both robot layers and the bubbles layer as moving, and the back, mid and front layers as not', () => {
      const { container } = render(<OceanScene />);
      const byName = (name: string) => container.querySelector(`svg[data-scene-layer="${name}"]`)!;
      for (const name of ['robots-back', 'bubbles', 'robots']) {
        expect(byName(name).classList.contains('ocean-scene__layer--moving')).toBe(true);
      }
      for (const name of ['back', 'mid', 'front']) {
        expect(byName(name).classList.contains('ocean-scene__layer--moving')).toBe(false);
      }
    });

    it('gives no layer a click-taking modifier — clicks are .robot\'s alone (spec §1.10)', () => {
      const { container } = render(<OceanScene />);
      for (const layer of container.querySelectorAll('svg.ocean-scene__layer')) {
        expect(layer.classList.contains('ocean-scene__layer--robots')).toBe(false);
      }
    });

    it('keeps each row in its layer: background in back, midground in mid, the robot rows in robots-back and robots, foreground in front', () => {
      const { container } = render(<OceanScene />);
      const layerOf = (selector: string) =>
        container.querySelector(selector)?.closest('svg.ocean-scene__layer')?.getAttribute('data-scene-layer');
      expect(layerOf('#factory-background-layer')).toBe('back');
      expect(layerOf('#robot-back-layer')).toBe('robots-back');
      expect(layerOf('#factory-midground-layer')).toBe('mid');
      expect(layerOf('#robot-layer')).toBe('robots');
      expect(layerOf('#factory-foreground-layer')).toBe('front');
      expect(container.querySelectorAll('#factory-background-layer, #factory-midground-layer, #factory-foreground-layer'))
        .toHaveLength(3);
    });

    it('drops the old two depth gradients for the four tints', () => {
      const { container } = render(<OceanScene />);
      for (const id of ['gradient-back-mid', 'gradient-mid-front', 'gradient-0-1', 'gradient-1-2']) {
        expect(container.querySelector(`#${id}`)).toBeNull();
      }
      expect(container.querySelectorAll('rect[data-depth-tint]')).toHaveLength(4);
    });

    // The four depth tints (spec §1.10's table, the depth-tint sketch gate, Crawford 2026-10-08).
    describe('depth tints (Phase 43 Task 33)', () => {
      const NAVY = '#0c1c4f';
      const VENT_SHADOW = hslToString(colorTheme.vent.shadow);

      /** The tint rect for a slot, and the two stops of the gradient its fill points at. */
      function tint(container: HTMLElement, slot: 'A' | 'B' | 'C' | 'D') {
        const rect = container.querySelector(`rect[data-depth-tint="${slot}"]`);
        expect(rect).not.toBeNull();
        const fill = rect!.getAttribute('fill') ?? '';
        const gradientId = /^url\(#(.+)\)$/.exec(fill)?.[1];
        expect(gradientId).toBeDefined();
        const gradient = container.querySelector(`linearGradient[id="${gradientId}"]`);
        expect(gradient).not.toBeNull();
        const stops = Array.from(gradient!.querySelectorAll('stop')).map((s) => ({
          color: s.getAttribute('stop-color'),
          opacity: Number(s.getAttribute('stop-opacity')),
        }));
        expect(stops).toHaveLength(2);
        return { rect: rect!, gradient: gradient!, stops };
      }

      const layerOf = (el: Element) => el.closest('svg.ocean-scene__layer')!.getAttribute('data-scene-layer');
      /** The layer's drawn children (its <defs> aside), in document order. */
      const drawn = (container: HTMLElement, layer: string) =>
        Array.from(container.querySelector(`svg[data-scene-layer="${layer}"]`)!.children)
          .filter((el) => el.tagName.toLowerCase() !== 'defs');

      it('each tint covers the whole scene and takes no clicks', () => {
        const { container } = render(<OceanScene />);
        for (const slot of ['A', 'B', 'C', 'D'] as const) {
          const { rect } = tint(container, slot);
          expect(rect.getAttribute('x')).toBe('0');
          expect(rect.getAttribute('y')).toBe('0');
          expect(rect.getAttribute('width')).toBe('1920');
          expect(rect.getAttribute('height')).toBe('1080');
          expect(rect.getAttribute('pointer-events')).toBe('none');
        }
      });

      it.each([
        ['A', NAVY, 0.06],
        ['B', NAVY, 0.25],
        ['C', VENT_SHADOW, 0.2],
        ['D', VENT_SHADOW, 0.1],
      ] as const)('tint %s runs %s → vent.shadow at opacity %d, top to bottom', (slot, topColor, alpha) => {
        const { container } = render(<OceanScene />);
        const { gradient, stops } = tint(container, slot);
        expect(gradient.getAttribute('x1')).toBe('0%');
        expect(gradient.getAttribute('y1')).toBe('0%');
        expect(gradient.getAttribute('x2')).toBe('0%');
        expect(gradient.getAttribute('y2')).toBe('100%');
        expect(stops).toEqual([
          { color: topColor, opacity: alpha },
          { color: VENT_SHADOW, opacity: alpha },
        ]);
      });

      it('each tint\'s gradient lives in the layer that draws it', () => {
        const { container } = render(<OceanScene />);
        for (const slot of ['A', 'B', 'C', 'D'] as const) {
          const { rect, gradient } = tint(container, slot);
          expect(layerOf(gradient)).toBe(layerOf(rect));
        }
      });

      it('A is the top of back, over the background buildings and their pipe bridges', () => {
        const { container } = render(<OceanScene />);
        const children = drawn(container, 'back');
        expect(children.at(-1)!.getAttribute('data-depth-tint')).toBe('A');
        expect(children.findIndex((el) => el.id === 'factory-background-layer')).toBeLessThan(children.length - 1);
      });

      it('B is the bottom of mid; C sits over the midground and its pipe bridges, under the ground line', () => {
        const { container } = render(<OceanScene />);
        const children = drawn(container, 'mid');
        expect(children[0].getAttribute('data-depth-tint')).toBe('B');
        const midground = children.findIndex((el) => el.id === 'factory-midground-layer');
        const c = children.findIndex((el) => el.getAttribute('data-depth-tint') === 'C');
        const ground = children.findIndex((el) => el.getAttribute('data-terrain') === 'ground');
        expect(midground).toBeGreaterThan(0);
        expect(c).toBeGreaterThan(midground);
        expect(ground).toBe(children.length - 1);
        expect(c).toBe(ground - 1);
      });

      it('D is the bottom of front, under the foreground buildings', () => {
        const { container } = render(<OceanScene />);
        const children = drawn(container, 'front');
        expect(children[0].getAttribute('data-depth-tint')).toBe('D');
        expect(children.findIndex((el) => el.id === 'factory-foreground-layer')).toBeGreaterThan(0);
      });

      // One readout of the haze each row sits under, read off the rendered DOM: the layers stack in
      // document order, so a row is hazed by every tint that follows it. The sketch's own readout
      // (docs/sketches/robot-depth-tint.html) left D out of the two building rows and printed 44 %
      // and 20 %; its rendered scene, like this one, puts D over them too, so the honest figures are
      // 1 − .94·.75·.8·.9 ≈ 49 % and 1 − .8·.9 = 28 %. The robot rows and the pop are as signed off.
      it('coverage 1 − Π(1 − α) per row: background 49 %, back-row robots 46 %, midground 28 %, front-row robots 10 %, foreground 0 %, pop 40 %', () => {
        const { container } = render(<OceanScene />);
        const tints = (['A', 'B', 'C', 'D'] as const).map((slot) => {
          const { rect, stops } = tint(container, slot);
          return { rect, alpha: stops[0].opacity };
        });
        const isAfter = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        const coverage = (pred: (rect: Element) => boolean) =>
          1 - tints.filter((t) => pred(t.rect)).reduce((acc, t) => acc * (1 - t.alpha), 1);
        const over = (selector: string) => {
          const row = container.querySelector(selector)!;
          return coverage((rect) => isAfter(row, rect));
        };

        expect(over('#factory-background-layer')).toBeCloseTo(1 - 0.94 * 0.75 * 0.8 * 0.9, 10);
        expect(over('#robot-back-layer')).toBeCloseTo(1 - 0.75 * 0.8 * 0.9, 10);
        expect(over('#factory-midground-layer')).toBeCloseTo(1 - 0.8 * 0.9, 10);
        expect(over('#robot-layer')).toBeCloseTo(0.1, 10);
        expect(over('#factory-foreground-layer')).toBe(0);
        // Rounded, as the sketch prints them.
        expect(Math.round(over('#factory-background-layer') * 100)).toBe(49);
        expect(Math.round(over('#robot-back-layer') * 100)).toBe(46);
        expect(Math.round(over('#factory-midground-layer') * 100)).toBe(28);
        // The pop at a row switch: the tints between the two robot rows.
        const back = container.querySelector('#robot-back-layer')!;
        const front = container.querySelector('#robot-layer')!;
        expect(coverage((rect) => isAfter(back, rect) && isAfter(rect, front))).toBeCloseTo(0.4, 10);
      });
    });

    // Spec §1.10 "Which layer": each robot renders in its `Robot.layer`'s list; unset = foreground.
    describe('robot rows (Phase 43 Task 33)', () => {
      const idsIn = (container: HTMLElement, groupId: string) =>
        Array.from(container.querySelectorAll(`#${groupId} > [data-robot-mock]`)).map((el) => el.getAttribute('data-robot-mock'));

      it("renders a robot with layer 'background' in robots-back, and 'foreground' or unset in robots", () => {
        useLocaleStore.setState({
          locales: {
            [DEFAULT_LOCALE_ID]: {
              ...DEFAULT_LOCALE,
              robots: [
                makeRobot({ id: 'r1' }),
                makeRobot({ id: 'r2', layer: 'background' }),
                makeRobot({ id: 'r3', layer: 'foreground' }),
                makeRobot({ id: 'r4', layer: 'background' }),
              ],
              actors: [],
            },
          },
        });
        const { container } = render(<OceanScene />);
        expect(idsIn(container, 'robot-back-layer')).toEqual(['r2', 'r4']);
        expect(idsIn(container, 'robot-layer')).toEqual(['r1', 'r3']);
        // Each robot drawn exactly once.
        expect(container.querySelectorAll('[data-robot-mock]')).toHaveLength(4);
      });

      it('an empty back row still renders its group (the perf harness and Task 34 key on it)', () => {
        const { container } = render(<OceanScene />);
        expect(container.querySelector('svg[data-scene-layer="robots-back"] > #robot-back-layer')).not.toBeNull();
        expect(idsIn(container, 'robot-back-layer')).toEqual([]);
        expect(idsIn(container, 'robot-layer')).toEqual(['r1']);
      });

      it('moves a robot between the rows when its layer changes, both ways', () => {
        const { container } = render(<OceanScene />);
        act(() => {
          useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { layer: 'background' });
        });
        expect(idsIn(container, 'robot-back-layer')).toEqual(['r1']);
        expect(idsIn(container, 'robot-layer')).toEqual([]);
        act(() => {
          useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { layer: 'foreground' });
        });
        expect(idsIn(container, 'robot-back-layer')).toEqual([]);
        expect(idsIn(container, 'robot-layer')).toEqual(['r1']);
      });

      it("still doesn't re-render either row for a write that leaves every robot's layer alone", () => {
        useLocaleStore.setState({
          locales: {
            [DEFAULT_LOCALE_ID]: {
              ...DEFAULT_LOCALE,
              robots: [makeRobot({ id: 'r1' }), makeRobot({ id: 'r2', layer: 'background' })],
              actors: [],
            },
          },
        });
        render(<OceanScene />);
        const calls = () => (Robot as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
        const callsAfterMount = calls();
        act(() => {
          useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r2', { batteryLevel: 40, position: { x: 5, y: 6 } });
          useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { layer: 'foreground' });
        });
        expect(calls()).toBe(callsAfterMount);
      });
    });

    it('hands the bubble layer every actor (all rows) and the locale-wide bubble-eligible count', () => {
      render(<OceanScene />);
      expect(bubbleLayerMock).toHaveBeenCalled();
      const props = bubbleLayerMock.mock.calls.at(-1)![0];
      expect(props.actors.map((f) => f.id).sort()).toEqual(['bg-1', 'fg-1', 'mid-1']);
      expect(props.totalBuildings).toBe(2); // mid-1 is observationComms — no vent
    });

    // Roadmap Phase 42 Task 17 (§1.11): vents vent bubbles too, so bubbleBuildingCount must
    // count them alongside bubble-eligible factories, and BubbleLayer must receive the vent
    // actor itself (via the shared `actors` prop, not a factories-only one).
    it('counts vent scenery actors toward the bubble-eligible total and hands them to the bubble layer', () => {
      const ventRow = RECIPES.ventfield.findIndex((r) => r.kind === 'vent' && r.depth === 'background');
      useLocaleStore.setState({
        locales: {
          [DEFAULT_LOCALE_ID]: {
            ...DEFAULT_LOCALE,
            robots: [makeRobot({ id: 'r1' })],
            actors: [
              makeFactory('bg-1', rowIndexFor('background')),
              makeFactory('mid-1', rowIndexFor('midground'), 'observationComms'),
              makeFactory('fg-1', rowIndexFor('foreground')),
              {
                id: 'vent-1',
                type: ActorType.SCENERY,
                position: { x: 50, y: 900 },
                isActive: false,
                config: { kind: 'vent', row: ventRow, district: 'ventfield' },
              },
            ],
          },
        },
      });
      render(<OceanScene />);
      const props = bubbleLayerMock.mock.calls.at(-1)![0];
      expect(props.actors.map((f) => f.id).sort()).toEqual(['bg-1', 'fg-1', 'mid-1', 'vent-1']);
      expect(props.totalBuildings).toBe(3); // 2 bubble-eligible factories + 1 vent
    });

    it('keeps the bubble layer inside the bubbles svg', () => {
      bubbleLayerMock.mockImplementation(() => <g data-testid="bubble-layer-stub" />);
      const { container } = render(<OceanScene />);
      expect(container.querySelector('svg[data-scene-layer="bubbles"] [data-testid="bubble-layer-stub"]')).not.toBeNull();
      bubbleLayerMock.mockImplementation(() => null);
    });

    // Terrain (docs/specs/WORLD_VIEW_DISTRICTS.md §1.3, roadmap Phase 42 Task 7): the ridge
    // must stand behind every factory, and the ground must bury under midground bases, so
    // their document-order position relative to the existing groups is load-bearing, not
    // cosmetic.
    // Phase 43 Task 33: the ground line is a midground silhouette (Task 32), so it moved to `mid`,
    // still after the over-midground tint (C, today's gradient-1-2's slot) so bases bury under it.
    it('renders the ridge before the background factory group in back, and the ground after the midground and tint C in mid', () => {
      const { container } = render(<OceanScene />);
      const back = Array.from(container.querySelector('svg[data-scene-layer="back"]')!.children);
      const mid = Array.from(container.querySelector('svg[data-scene-layer="mid"]')!.children);

      const ridgeIndex = back.findIndex((el) => el.getAttribute('data-terrain') === 'ridge');
      const backgroundIndex = back.findIndex((el) => el.id === 'factory-background-layer');
      const midgroundIndex = mid.findIndex((el) => el.id === 'factory-midground-layer');
      const tintCIndex = mid.findIndex((el) => el.getAttribute('data-depth-tint') === 'C');
      const groundIndex = mid.findIndex((el) => el.getAttribute('data-terrain') === 'ground');

      expect(ridgeIndex).toBeGreaterThanOrEqual(0);
      expect(ridgeIndex).toBeLessThan(backgroundIndex);
      expect(midgroundIndex).toBeGreaterThanOrEqual(0);
      expect(groundIndex).toBeGreaterThan(tintCIndex);
      expect(tintCIndex).toBeGreaterThan(midgroundIndex);
      expect(container.querySelectorAll('[data-terrain="ground"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-terrain="ridge"]')).toHaveLength(1);
    });

    // Water column (docs/specs/WORLD_VIEW_DISTRICTS.md §1.5, roadmap Phase 42 Task 8): replaces
    // the old flat backgroundColor rect, so it must stand behind the ridge (and everything else)
    // in the back layer, and OceanScene must no longer accept the removed prop.
    it('renders the water column before the ridge in the back layer', () => {
      const { container } = render(<OceanScene />);
      const back = container.querySelector('svg[data-scene-layer="back"]')!;
      const children = Array.from(back.children);

      const waterIndex = children.findIndex((el) => el.hasAttribute('data-water'));
      const ridgeIndex = children.findIndex((el) => el.getAttribute('data-terrain') === 'ridge');

      expect(waterIndex).toBeGreaterThanOrEqual(0);
      expect(waterIndex).toBeLessThan(ridgeIndex);
    });

    // Light shafts (docs/specs/WORLD_VIEW_DISTRICTS.md §1.12, roadmap Phase 42 Task 20): read as
    // light falling through the water onto the terrain, so they must stand after the water
    // column and before the ridge in document order.
    it('renders light shafts after the water column and before the ridge in the back layer', () => {
      const { container } = render(<OceanScene />);
      const back = container.querySelector('svg[data-scene-layer="back"]')!;
      const children = Array.from(back.children);

      const waterIndex = children.findIndex((el) => el.hasAttribute('data-water'));
      const shaftsIndex = children.findIndex((el) => el.getAttribute('data-atmos') === 'shafts');
      const ridgeIndex = children.findIndex((el) => el.getAttribute('data-terrain') === 'ridge');

      expect(shaftsIndex).toBeGreaterThanOrEqual(0);
      expect(waterIndex).toBeLessThan(shaftsIndex);
      expect(shaftsIndex).toBeLessThan(ridgeIndex);
    });

    it('no longer accepts a backgroundColor prop (type-checked by npm run build:types)', () => {
      // @ts-expect-error backgroundColor was removed (§1.5) — this line only compiles if the prop
      // still exists, so `npm run build:types` catches a regression even though vitest itself
      // doesn't type-check.
      render(<OceanScene backgroundColor="#000000" />);
    });
  });

  // Charging stations (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.6, Phase 43 Task 20): three
  // fragments per station interleaved with the robots, back to front L4 · (exiting robots) · L3 ·
  // robots · L2 + halo + L1. Exits use the slot between L4 and L3 until J4's back row lands.
  describe('charging stations (Phase 43 Task 20)', () => {
    // Phase 43 Task 34b (spec §1.6): back to front, L4 · exiting robots · L3 · entering robots · L2 ·
    // halo + ripple · L1. L4 and the exiting robots are in the back robot row; L3 and the front
    // fragment stay in the front row around the front robots.
    it("renders every station's fragments around the robot rows: L4 under the back row, L3 and the front around the front row", () => {
      useLocaleStore.setState({
        locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'r1' })], actors: [] } },
      });
      const stations = getStations(DEFAULT_LOCALE_ID);
      expect(stations.length).toBeGreaterThanOrEqual(2);
      const { container } = render(<OceanScene />);
      const layer = (name: string) => container.querySelector(`svg[data-scene-layer="${name}"]`)!;
      const groupsOf = (name: string) => Array.from(layer(name).querySelectorAll(':scope > g')).map((g) => g.id);
      expect(groupsOf('robots-back')).toEqual(['station-l4-layer', 'robot-back-layer']);
      expect(groupsOf('robots')).toEqual(['station-l3-layer', 'robot-layer', 'robot-dissolve-layer', 'station-front-layer']);
      for (const [name, id, fragment] of [
        ['robots-back', 'station-l4-layer', 'l4'],
        ['robots', 'station-l3-layer', 'l3'],
        ['robots', 'station-front-layer', 'front'],
      ] as const) {
        const markers = Array.from(layer(name).querySelectorAll(`#${id} > g[data-station-mock]`));
        expect(markers.map((m) => m.getAttribute('data-station-mock'))).toEqual(stations.map((s) => s.id));
        for (const m of markers) expect(m.getAttribute('data-fragment')).toBe(fragment);
      }
      expect(container.querySelectorAll('#station-l4-layer')).toHaveLength(1);
    });

    it('a back-row robot draws over L4 and under L3', () => {
      useLocaleStore.setState({
        locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'r1', layer: 'background' })], actors: [] } },
      });
      const { container } = render(<OceanScene />);
      const robotEl = container.querySelector('[data-robot-mock="r1"]')!;
      const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      expect(follows(container.querySelector('#station-l4-layer')!, robotEl)).toBe(true);
      expect(follows(robotEl, container.querySelector('#station-l3-layer')!)).toBe(true);
    });

    // Phase 43 Task 34 (spec §1.10): the layer-switch dissolve's `<use>` copies go here — in the
    // front robot row, over the front robots and under the station's front fragment. The work loop
    // fills it imperatively, so React renders it empty and registers it for getRef.
    it('renders an empty #robot-dissolve-layer after the robots and registers it as robot-dissolve-layer', () => {
      const { container, unmount } = render(<OceanScene />);
      const layer = container.querySelector('svg[data-scene-layer="robots"] > #robot-dissolve-layer');
      expect(layer).not.toBeNull();
      expect(layer!.children).toHaveLength(0);
      expect(getRef('robot-dissolve-layer')).toBe(layer);
      unmount();
      expect(getRef('robot-dissolve-layer')).toBeUndefined();
    });

    it('a copy the loop appends survives a scene re-render', () => {
      const { container } = render(<OceanScene />);
      const layer = getRef('robot-dissolve-layer')!;
      const use = layer.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'use'));
      act(() => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot({ id: 'r9' }));
      });
      expect(container.querySelector('#robot-dissolve-layer')!.firstChild).toBe(use);
    });

    it('draws no station in any other layer, and only L4 in the back row', () => {
      const { container } = render(<OceanScene />);
      for (const name of ['back', 'mid', 'bubbles', 'front']) {
        expect(container.querySelector(`svg[data-scene-layer="${name}"] g[data-station-mock]`)).toBeNull();
      }
      const back = Array.from(container.querySelectorAll('svg[data-scene-layer="robots-back"] g[data-station-mock]'));
      expect(back.length).toBeGreaterThan(0);
      for (const m of back) expect(m.getAttribute('data-fragment')).toBe('l4');
      expect(container.querySelector('svg[data-scene-layer="robots"] g[data-fragment="l4"]')).toBeNull();
    });
  });

  // Scenery actors (docs/specs/WORLD_VIEW_DISTRICTS.md §1.8, roadmap Phase 42 Task 11): rendered
  // in the same depth group as factories, interleaved in the recipe's own row order.
  describe('scenery interleave (roadmap Phase 42 Task 11)', () => {
    it("renders a lower-row scenery actor before a higher-row factory within the same depth group — sensitive to the row-order sort (removing it would concatenate factories-then-scenery and put this factory first instead)", () => {
      const district = 'outskirts';
      const wallRow = RECIPES.outskirts.findIndex((r) => r.kind === 'wall');
      const factoryRow = RECIPES.outskirts.findIndex((r) => r.depth === 'foreground' && r.kind === 'factory');
      expect(wallRow).toBeGreaterThanOrEqual(0);
      expect(factoryRow).toBeGreaterThanOrEqual(0);
      expect(wallRow).toBeLessThan(factoryRow); // the real recipe's own ordering this test relies on

      useLocaleStore.setState({
        locales: {
          [DEFAULT_LOCALE_ID]: {
            ...DEFAULT_LOCALE,
            robots: [],
            actors: [
              { id: 'wall-1', type: ActorType.SCENERY, position: { x: 0, y: 0 }, isActive: false, config: { kind: 'wall', district, row: wallRow } },
              { id: 'fg-factory-1', type: ActorType.FACTORY, position: { x: 0, y: 0 }, isActive: true, config: { district, row: factoryRow, purpose: 'heavyIndustry' } },
            ],
          },
        },
      });

      const { container } = render(<OceanScene />);
      const front = container.querySelector('svg[data-scene-layer="front"] #factory-foreground-layer')!;
      const children = Array.from(front.children);
      const wallIdx = children.findIndex((el) => el.getAttribute('data-scenery-mock') === 'wall-1');
      const factoryIdx = children.findIndex((el) => el.getAttribute('data-factory-mock') === 'fg-factory-1');

      expect(wallIdx).toBeGreaterThanOrEqual(0);
      expect(factoryIdx).toBeGreaterThanOrEqual(0);
      expect(wallIdx).toBeLessThan(factoryIdx);
    });
  });
});
