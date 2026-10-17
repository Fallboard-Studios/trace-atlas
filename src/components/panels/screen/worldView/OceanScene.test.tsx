// ========================================
// MOCKS
// ========================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';

// A plain vi.fn(), not React.memo-wrapped — deliberately, so its own call count is a reliable
// proxy for "did OceanScene's render body reconstruct the robot layer again" (docs/todo/
// backlog.md #27 follow-up, 2026-09-15), the same "unmemoized mock as a render-count marker"
// technique RobotOptionsTab.test.tsx/CompanyOptionsSection.test.tsx already use. It draws a mover
// marker per robot id, in the slot its row names (Robot.tsx's own contract, tested in Robot.test.tsx:
// slotForLayer), so the robot tests can read which row each robot landed in. Like the real one it
// subscribes to its own slot only, as a string: a write that leaves the slot alone re-renders nothing,
// and a layer write moves the slot on the SAME mounted element (robotMountMock counts real mounts).
vi.mock('@/components/robot/Robot', () => ({
  Robot: vi.fn((props: { robotId: string }) => {
    const slot = useLocaleStore((s) =>
      slotForLayer(s.locales[DEFAULT_LOCALE_ID]?.robots.find((r) => r.id === props.robotId)?.layer));
    useEffect(() => {
      robotMountMock(props.robotId);
    }, [props.robotId]);
    return <div className="mover mover--robot" data-robot-mock={props.robotId} data-scene-slot={slot} />;
  }),
}));
const robotMountMock = vi.fn();
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
// The Deck camera's followed-robot marker, as a stub that records the locale it was handed.
vi.mock('./FollowedRobotMarker', () => ({
  FollowedRobotMarker: (props: { localeId: string }) => <g id="followed-robot-marker" data-followed-marker-mock={props.localeId} />,
}));
// Records what the scene hands its bubble layer (which actors, what total) without running
// BubbleStream's GSAP timelines.
const bubbleLayerMock = vi.fn((_props: { actors: { id: string }[]; totalBuildings: number }): ReactElement | null => null);
/** A bubble layer that renders `n` strip movers, as the real one does (BubbleStream.tsx). */
const bubbleStrips = (n: number) => () => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="mover mover--bubbles" data-scene-slot="bubbles" data-strip-stub={i} />
    ))}
  </>
);
vi.mock('@/components/actors/BubbleLayer', () => ({
  BubbleLayer: (props: { actors: { id: string }[]; totalBuildings: number }) => bubbleLayerMock(props),
}));

const initializeLocaleMock = vi.fn();
vi.mock('@/systems/worldTransition', () => ({
  initializeLocale: (localeId: string, options?: { startSystems?: boolean }) => initializeLocaleMock(localeId, options),
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
import { SCENE_SLOTS, slotForLayer, type SceneSlot } from './sceneStack';
import { Robot } from '@/components/robot/Robot';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '@/stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
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
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 80,
    ...overrides,
  } as RobotType;
}

// The robot movers, by the slot the Robot mock puts them in (the real one: Robot.test.tsx).
const BACK_ROBOT = '[data-robot-mock][data-scene-slot="robots-back"]';
const FRONT_ROBOT = '[data-robot-mock][data-scene-slot="robots"]';

// A thing's place in the stack is its slot first (the stylesheet's z-index follows SCENE_SLOTS, checked
// in the CSS test) and its document order inside the slot second. A robot's mover can sit anywhere in
// the stage's markup — it is the slot that stacks it — so document order alone says nothing about it.
const slotRank = (el: Element) =>
  SCENE_SLOTS.indexOf(el.closest('[data-scene-slot]')!.getAttribute('data-scene-slot') as SceneSlot);
const under = (a: Element, b: Element) =>
  slotRank(a) < slotRank(b) ||
  (slotRank(a) === slotRank(b) && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);

// ========================================
// TESTS
// ========================================

describe('OceanScene', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    initializeLocaleMock.mockReset();
    useUIStore.setState({ isPoweredOn: false });
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
    expect(initializeLocaleMock).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, expect.anything());
    cleanup();
  });

  // Task 26 (docs/tasks/LAYOUT_REWORK.md): WorldView mounts in both power states, so the scene builds the
  // world on mount but only starts its systems when the tablet is already on; powerOnSequence starts them
  // for a world built while off.
  describe('the mount builds the world in either power state', () => {
    it('passes startSystems: false while powered off', () => {
      useUIStore.setState({ isPoweredOn: false });
      render(<OceanScene />);
      expect(initializeLocaleMock).toHaveBeenCalledTimes(1);
      expect(initializeLocaleMock).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, { startSystems: false });
      cleanup();
    });

    it('passes startSystems: true while powered on', () => {
      useUIStore.setState({ isPoweredOn: true });
      render(<OceanScene />);
      expect(initializeLocaleMock).toHaveBeenCalledTimes(1);
      expect(initializeLocaleMock).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, { startSystems: true });
      cleanup();
    });

    it('does not rebuild or restart when the power state flips after mount (powerOnSequence owns that)', () => {
      render(<OceanScene />);
      act(() => useUIStore.setState({ isPoweredOn: true }));
      act(() => useUIStore.setState({ isPoweredOn: false }));
      expect(initializeLocaleMock).toHaveBeenCalledTimes(1);
      expect(stopRobotLifecycleMock).not.toHaveBeenCalled();
      cleanup();
    });

    it('still applies a ?session= payload once on a powered-off mount, after the world is built', () => {
      const payload = { attenuationStyleName: 'x' };
      consumeSessionSharePayloadMock.mockReturnValueOnce(payload);
      const callOrder: string[] = [];
      initializeLocaleMock.mockImplementation(() => callOrder.push('initializeLocale'));
      applySessionPayloadMock.mockImplementation(() => callOrder.push('applySessionPayload'));
      render(<OceanScene />);
      expect(callOrder).toEqual(['initializeLocale', 'applySessionPayload']);
      expect(applySessionPayloadMock).toHaveBeenCalledWith(payload, { skipLocaleRebuild: true });
      cleanup();
    });
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
      bubbleLayerMock.mockImplementation(() => null); // a test that swaps in strips cannot leak them
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
    // Roadmap Phase 53 Task 9 (docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.1, §1.2): every sheet is
    // a child of one scaled stage, so the viewBox fit is one CSS scale and offset on that stage.
    it('renders one stage as the scene box\'s only child, a div', () => {
      const { container } = render(<OceanScene />);
      const scene = container.querySelector('.ocean-scene');
      expect(scene?.tagName.toLowerCase()).toBe('div');
      expect(scene!.children).toHaveLength(1);
      expect(scene!.firstElementChild!.tagName.toLowerCase()).toBe('div');
      expect(scene!.firstElementChild!.classList.contains('ocean-scene__stage')).toBe(true);
      expect(container.querySelectorAll('.ocean-scene__stage')).toHaveLength(1);
    });

    // Phase 53 Task 11 (spec §1.2, §1.8): the stations' L3 plates get a static sheet of their own
    // between the bubbles and the front robots. Task 13 (spec §1.4): the two robot sheets are gone —
    // every robot is a mover, a stage child of its own. Task 18 (spec §1.6): so is every bubble
    // stream, and the bubbles sheet goes with them — so the stage holds five sheets, the dissolve
    // div, and the movers (the marker's sheet follows in Task 19).
    it('renders five sheets and the dissolve div as the stage\'s children in back → mid → stations → dissolve → front → marker order, the movers among them', () => {
      const { container } = render(<OceanScene />);
      const stage = container.querySelector('.ocean-scene__stage')!;
      const sheets = Array.from(stage.querySelectorAll(':scope > svg.ocean-scene__sheet'));
      expect(sheets.map((l) => l.getAttribute('data-scene-slot'))).toEqual(['back', 'mid', 'stations', 'front', 'marker']);
      const notMovers = Array.from(stage.children).filter((c) => !c.classList.contains('mover'));
      expect(notMovers.map((l) => l.getAttribute('data-scene-slot'))).toEqual(
        ['back', 'mid', 'stations', 'dissolve', 'front', 'marker'],
      );
      expect(stage.querySelectorAll(':scope > .mover--robot')).toHaveLength(1); // the fixture's r1
    });

    // Roadmap 53 Task 18 (spec §1.6, §1.9): the bubbles sheet is deleted; BubbleLayer is a fragment
    // of strip movers, each a stage child in the `bubbles` slot.
    it('has no bubbles sheet any more', () => {
      bubbleLayerMock.mockImplementation(bubbleStrips(2));
      const { container } = render(<OceanScene />);
      expect(container.querySelector('svg[data-scene-slot="bubbles"]')).toBeNull();
      expect(container.querySelector('svg.ocean-scene__sheet[data-scene-slot="bubbles"]')).toBeNull();
      bubbleLayerMock.mockImplementation(() => null);
    });

    it('renders each bubble strip as a .mover--bubbles stage child in the bubbles slot', () => {
      bubbleLayerMock.mockImplementation(bubbleStrips(3));
      const { container } = render(<OceanScene />);
      const stage = container.querySelector('.ocean-scene__stage')!;
      const strips = stage.querySelectorAll(':scope > .mover--bubbles');
      expect(strips).toHaveLength(3);
      for (const strip of strips) expect(strip.getAttribute('data-scene-slot')).toBe('bubbles');
      expect(container.querySelectorAll('.mover--bubbles')).toHaveLength(3); // none nested anywhere else
      bubbleLayerMock.mockImplementation(() => null);
    });

    it('puts the bubble strips between the mid sheet and the stations sheet in the stage\'s document order', () => {
      bubbleLayerMock.mockImplementation(bubbleStrips(2));
      const { container } = render(<OceanScene />);
      const stage = container.querySelector('.ocean-scene__stage')!;
      const order = Array.from(stage.children)
        .map((c) => c.getAttribute('data-scene-slot'))
        .filter((s) => s !== 'robots' && s !== 'robots-back');
      expect(order.indexOf('mid')).toBeLessThan(order.indexOf('bubbles'));
      expect(order.lastIndexOf('bubbles')).toBeLessThan(order.indexOf('stations'));
      bubbleLayerMock.mockImplementation(() => null);
    });

    it('draws no bubble strip when the layer renders none (an empty locale)', () => {
      const { container } = render(<OceanScene />);
      expect(container.querySelectorAll('.mover--bubbles')).toHaveLength(0);
    });

    it('has no robots or robots-back sheet any more — a robot is a mover, not a group in a sheet', () => {
      const { container } = render(<OceanScene />);
      expect(container.querySelector('svg[data-scene-slot="robots"]')).toBeNull();
      expect(container.querySelector('svg[data-scene-slot="robots-back"]')).toBeNull();
      expect(container.querySelector('#robot-layer')).toBeNull();
      expect(container.querySelector('#robot-back-layer')).toBeNull();
    });

    // The stage is exactly as large as its sheets' viewBox, so a sheet that fills it needs no
    // preserveAspectRatio. The size is inline, not in the stylesheet (OceanScene.css.test.ts).
    it('sizes the stage to the sheets viewBox: 1920 x 1080 by default, and the width and height props otherwise', () => {
      const { container, rerender } = render(<OceanScene />);
      const stage = container.querySelector<HTMLElement>('.ocean-scene__stage')!;
      expect(stage.style.width).toBe('1920px');
      expect(stage.style.height).toBe('1080px');
      rerender(<OceanScene width={1000} height={500} />);
      expect(stage.style.width).toBe('1000px');
      expect(stage.style.height).toBe('500px');
      for (const sheet of container.querySelectorAll('svg.ocean-scene__sheet')) {
        expect(sheet.getAttribute('viewBox')).toBe('0 0 1000 500');
      }
    });

    it('names every sheet by a SCENE_SLOTS slot, in SCENE_SLOTS order', () => {
      const { container } = render(<OceanScene />);
      const slots = Array.from(container.querySelectorAll('.ocean-scene__stage > svg')).map(
        (el) => el.getAttribute('data-scene-slot') as SceneSlot,
      );
      for (const slot of slots) expect(SCENE_SLOTS).toContain(slot);
      const indexes = slots.map((slot) => SCENE_SLOTS.indexOf(slot));
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    });

    it('every sheet is the stage\'s own size: the world viewBox and no preserveAspectRatio (the stage does the fit)', () => {
      const { container } = render(<OceanScene />);
      const sheets = container.querySelectorAll('svg.ocean-scene__sheet');
      expect(sheets).toHaveLength(5);
      for (const sheet of sheets) {
        expect(sheet.getAttribute('viewBox')).toBe('0 0 1920 1080');
        expect(sheet.hasAttribute('preserveAspectRatio')).toBe(false);
      }
    });

    it('leaves nothing of the old layer markup in the rendered scene', () => {
      const { container } = render(<OceanScene />);
      expect(container.querySelector('[class*="ocean-scene__layer"]')).toBeNull();
      expect(container.querySelector('[data-scene-layer]')).toBeNull();
    });

    // useStageFit is wired to the scene box, not to the stage it scales: observing the stage would
    // read back its own fixed 1920 x 1080 and never refit.
    describe('stage fit wiring', () => {
      class MockResizeObserver {
        static instances: MockResizeObserver[] = [];
        callback: ResizeObserverCallback;
        observedTargets: Element[] = [];
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
          MockResizeObserver.instances.push(this);
        }
        observe(target: Element) {
          this.observedTargets.push(target);
        }
        unobserve() {}
        disconnect() {}
        fire(width: number, height: number) {
          this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
      }
      let original: typeof ResizeObserver;
      beforeEach(() => {
        MockResizeObserver.instances = [];
        original = globalThis.ResizeObserver;
        (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
      });
      afterEach(() => {
        (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = original;
      });

      it('observes the scene box and writes the stage fit onto it', () => {
        const { container } = render(<OceanScene />);
        const scene = container.querySelector<HTMLElement>('.ocean-scene')!;
        const observer = MockResizeObserver.instances.find((o) => o.observedTargets.includes(scene));
        expect(observer).toBeDefined();
        act(() => observer!.fire(2560, 1080));
        expect(scene.style.getPropertyValue('--stage-y')).toBe('-360px');
        expect(parseFloat(scene.style.getPropertyValue('--stage-scale'))).toBeCloseTo(4 / 3, 5);
      });

      it('never observes the stage itself', () => {
        const { container } = render(<OceanScene />);
        const stage = container.querySelector('.ocean-scene__stage')!;
        expect(MockResizeObserver.instances.some((o) => o.observedTargets.includes(stage))).toBe(false);
      });
    });

    it('marks only the marker layer as moving (the robots and the bubbles are movers now), and the back, mid, stations and front layers as not', () => {
      const { container } = render(<OceanScene />);
      const byName = (name: string) => container.querySelector(`svg[data-scene-slot="${name}"]`)!;
      expect(byName('marker').classList.contains('ocean-scene__sheet--moving')).toBe(true);
      expect(container.querySelectorAll('.ocean-scene__sheet--moving')).toHaveLength(1);
      for (const name of ['back', 'mid', 'stations', 'front']) {
        expect(byName(name).classList.contains('ocean-scene__sheet--moving')).toBe(false);
      }
    });

    it('gives no layer a click-taking modifier — clicks are .robot\'s alone (spec §1.10)', () => {
      const { container } = render(<OceanScene />);
      const sheets = container.querySelectorAll('svg.ocean-scene__sheet');
      expect(sheets).toHaveLength(5);
      for (const layer of sheets) {
        expect(layer.classList.contains('ocean-scene__sheet--robots')).toBe(false);
      }
    });

    it('keeps each row in its layer: background in back, midground in mid, foreground in front', () => {
      const { container } = render(<OceanScene />);
      const layerOf = (selector: string) =>
        container.querySelector(selector)?.closest('svg.ocean-scene__sheet')?.getAttribute('data-scene-slot');
      expect(layerOf('#factory-background-layer')).toBe('back');
      expect(layerOf('#factory-midground-layer')).toBe('mid');
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

      const layerOf = (el: Element) => el.closest('svg.ocean-scene__sheet')!.getAttribute('data-scene-slot');
      /** The layer's drawn children (its <defs> aside), in document order. */
      const drawn = (container: HTMLElement, layer: string) =>
        Array.from(container.querySelector(`svg[data-scene-slot="${layer}"]`)!.children)
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

      // Task 11: the stations' L4 plates close the back sheet, after tint A, so a plate is hazed by
      // the tints that follow it exactly as it was when it sat in the back robot row's sheet.
      it('A is the top of back but for the stations\' L4 plates, over the background buildings and their pipe bridges', () => {
        const { container } = render(<OceanScene />);
        const children = drawn(container, 'back');
        expect(children.at(-1)!.id).toBe('station-l4-layer');
        expect(children.at(-2)!.getAttribute('data-depth-tint')).toBe('A');
        expect(children.findIndex((el) => el.id === 'factory-background-layer')).toBeLessThan(children.length - 2);
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
        // The ground line is the last thing drawn: its polygon, then its own world gem ring (Phase 44)
        expect(children[ground + 1].getAttribute('data-gem')).toBe('ring');
        expect(ground).toBe(children.length - 2);
        expect(c).toBe(ground - 1);
      });

      // Task 11: the stations' front fragments open the front sheet, so tint D still lies over them
      // as it did when they sat at the end of the front robot row's sheet.
      it('D is under the foreground buildings and over the stations\' front fragment', () => {
        const { container } = render(<OceanScene />);
        const children = drawn(container, 'front');
        expect(children[0].id).toBe('station-front-layer');
        expect(children[1].getAttribute('data-depth-tint')).toBe('D');
        expect(children.findIndex((el) => el.id === 'factory-foreground-layer')).toBeGreaterThan(1);
      });

      // One readout of the haze each row sits under, read off the rendered DOM: the layers stack in
      // document order, so a row is hazed by every tint that follows it. The sketch's own readout
      // (docs/sketches/robot-depth-tint.html) left D out of the two building rows and printed 44 %
      // and 20 %; its rendered scene, like this one, puts D over them too, so the honest figures are
      // 1 − .94·.75·.8·.9 ≈ 49 % and 1 − .8·.9 = 28 %. The robot rows and the pop are as signed off.
      it('coverage 1 − Π(1 − α) per row: background 49 %, back-row robots 46 %, midground 28 %, front-row robots 10 %, foreground 0 %, pop 40 %', () => {
        useLocaleStore.setState({
          locales: {
            [DEFAULT_LOCALE_ID]: {
              ...useLocaleStore.getState().locales[DEFAULT_LOCALE_ID],
              robots: [makeRobot({ id: 'r1' }), makeRobot({ id: 'r2', layer: 'background' })],
            },
          },
        });
        const { container } = render(<OceanScene />);
        const tints = (['A', 'B', 'C', 'D'] as const).map((slot) => {
          const { rect, stops } = tint(container, slot);
          return { rect, alpha: stops[0].opacity };
        });
        const isAfter = under; // "followed by" in the stack, not in the markup (a mover stacks by slot)
        const coverage = (pred: (rect: Element) => boolean) =>
          1 - tints.filter((t) => pred(t.rect)).reduce((acc, t) => acc * (1 - t.alpha), 1);
        const over = (selector: string) => {
          const row = container.querySelector(selector)!;
          return coverage((rect) => isAfter(row, rect));
        };

        expect(over('#factory-background-layer')).toBeCloseTo(1 - 0.94 * 0.75 * 0.8 * 0.9, 10);
        expect(over(BACK_ROBOT)).toBeCloseTo(1 - 0.75 * 0.8 * 0.9, 10);
        expect(over('#factory-midground-layer')).toBeCloseTo(1 - 0.8 * 0.9, 10);
        expect(over(FRONT_ROBOT)).toBeCloseTo(0.1, 10);
        expect(over('#factory-foreground-layer')).toBe(0);
        // Rounded, as the sketch prints them.
        expect(Math.round(over('#factory-background-layer') * 100)).toBe(49);
        expect(Math.round(over(BACK_ROBOT) * 100)).toBe(46);
        expect(Math.round(over('#factory-midground-layer') * 100)).toBe(28);
        // The pop at a row switch: the tints between the two robot rows.
        const back = container.querySelector(BACK_ROBOT)!;
        const front = container.querySelector(FRONT_ROBOT)!;
        expect(coverage((rect) => isAfter(back, rect) && isAfter(rect, front))).toBeCloseTo(0.4, 10);
      });
    });

    // Spec §1.10 "Which layer": each robot renders in its `Robot.layer`'s list; unset = foreground.
    // Phase 53 Task 13 (spec §1.4): a robot is a mover and a stage child; the slot is the row.
    describe('robot rows (Phase 43 Task 33)', () => {
      const idsIn = (container: HTMLElement, slot: 'robots' | 'robots-back') =>
        Array.from(container.querySelectorAll(`.ocean-scene__stage > [data-robot-mock][data-scene-slot="${slot}"]`)).map((el) =>
          el.getAttribute('data-robot-mock'),
        );

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
        expect(idsIn(container, 'robots-back')).toEqual(['r2', 'r4']);
        expect(idsIn(container, 'robots')).toEqual(['r1', 'r3']);
        // Each robot drawn exactly once, and always as a stage child of its own — never inside a sheet.
        expect(container.querySelectorAll('[data-robot-mock]')).toHaveLength(4);
        expect(container.querySelectorAll('svg [data-robot-mock]')).toHaveLength(0);
      });

      it('an empty back row renders no mover at all', () => {
        const { container } = render(<OceanScene />);
        expect(idsIn(container, 'robots-back')).toEqual([]);
        expect(idsIn(container, 'robots')).toEqual(['r1']);
      });

      // Phase 53 Task 14 (spec §1.5, assumption 10): one list serves both rows, and a row switch is the
      // slot attribute changing on the same mounted element — never a re-mount.
      it('moves a robot between the rows by changing its slot: the same mover stays mounted, both ways', () => {
        const { container } = render(<OceanScene />);
        const mover = container.querySelector('[data-robot-mock="r1"]')!;
        robotMountMock.mockClear();
        act(() => {
          useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { layer: 'background' });
        });
        expect(idsIn(container, 'robots-back')).toEqual(['r1']);
        expect(idsIn(container, 'robots')).toEqual([]);
        expect(container.querySelector('[data-robot-mock="r1"]')).toBe(mover);
        act(() => {
          useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { layer: 'foreground' });
        });
        expect(idsIn(container, 'robots-back')).toEqual([]);
        expect(idsIn(container, 'robots')).toEqual(['r1']);
        expect(container.querySelector('[data-robot-mock="r1"]')).toBe(mover);
        expect(robotMountMock).not.toHaveBeenCalled(); // (a mount runs the mock's effect; a slot write does not)
      });

      it('a row change re-renders the scene\'s list not at all: its ids, in roster order, did not change', () => {
        useLocaleStore.setState({
          locales: {
            [DEFAULT_LOCALE_ID]: {
              ...DEFAULT_LOCALE,
              robots: [makeRobot({ id: 'r1' }), makeRobot({ id: 'r2' }), makeRobot({ id: 'r3' })],
              actors: [],
            },
          },
        });
        const { container } = render(<OceanScene />);
        const before = Array.from(container.querySelectorAll('.ocean-scene__stage > .mover--robot'));
        act(() => {
          useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r2', { layer: 'background' });
        });
        const after = Array.from(container.querySelectorAll('.ocean-scene__stage > .mover--robot'));
        expect(after).toEqual(before); // the same elements in the same order
        expect(after.map((el) => el.getAttribute('data-scene-slot'))).toEqual(['robots', 'robots-back', 'robots']);
      });

      it('renders one mover per robot in roster order, whatever the rows', () => {
        useLocaleStore.setState({
          locales: {
            [DEFAULT_LOCALE_ID]: {
              ...DEFAULT_LOCALE,
              robots: [
                makeRobot({ id: 'r1', layer: 'background' }),
                makeRobot({ id: 'r2' }),
                makeRobot({ id: 'r3', layer: 'background' }),
              ],
              actors: [],
            },
          },
        });
        const { container } = render(<OceanScene />);
        expect(
          Array.from(container.querySelectorAll('.ocean-scene__stage > .mover--robot')).map((el) =>
            el.getAttribute('data-robot-mock'),
          ),
        ).toEqual(['r1', 'r2', 'r3']);
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

    // Terrain (docs/specs/WORLD_VIEW_DISTRICTS.md §1.3, roadmap Phase 42 Task 7): the ridge
    // must stand behind every factory, and the ground must bury under midground bases, so
    // their document-order position relative to the existing groups is load-bearing, not
    // cosmetic.
    // Phase 43 Task 33: the ground line is a midground silhouette (Task 32), so it moved to `mid`,
    // still after the over-midground tint (C, today's gradient-1-2's slot) so bases bury under it.
    it('renders the ridge before the background factory group in back, and the ground after the midground and tint C in mid', () => {
      const { container } = render(<OceanScene />);
      const back = Array.from(container.querySelector('svg[data-scene-slot="back"]')!.children);
      const mid = Array.from(container.querySelector('svg[data-scene-slot="mid"]')!.children);

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
      const back = container.querySelector('svg[data-scene-slot="back"]')!;
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
      const back = container.querySelector('svg[data-scene-slot="back"]')!;
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
    // Phase 53 Task 11 (spec §1.2, §1.8): the three fragments are static content, so none of them
    // lives in a moving robot sheet any more. Back to front, L4 closes the back sheet (after tint A),
    // L3 has the stations sheet between the bubbles and the front robots, and the front fragment
    // opens the front sheet (before tint D). Only the station ripple, one second per arc, ever
    // animates one, and it repaints a static sheet for that second.
    it("renders every station's fragments in static sheets: L4 closing back, L3 in stations, the front fragment opening front", () => {
      useLocaleStore.setState({
        locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'r1' })], actors: [] } },
      });
      const stations = getStations(DEFAULT_LOCALE_ID);
      expect(stations.length).toBeGreaterThanOrEqual(2);
      const { container } = render(<OceanScene />);
      const layer = (name: string) => container.querySelector(`svg[data-scene-slot="${name}"]`)!;
      for (const [name, id, fragment] of [
        ['back', 'station-l4-layer', 'l4'],
        ['stations', 'station-l3-layer', 'l3'],
        ['front', 'station-front-layer', 'front'],
      ] as const) {
        const markers = Array.from(layer(name).querySelectorAll(`:scope > #${id} > g[data-station-mock]`));
        expect(markers.map((m) => m.getAttribute('data-station-mock')), `${fragment} in ${name}`).toEqual(
          stations.map((s) => s.id),
        );
        for (const m of markers) expect(m.getAttribute('data-fragment')).toBe(fragment);
        expect(container.querySelectorAll(`#${id}`), id).toHaveLength(1);
      }
    });

    it('opens the stations sheet with the L3 group alone, and the sheet draws nothing else', () => {
      const { container } = render(<OceanScene />);
      const sheet = container.querySelector('svg[data-scene-slot="stations"]')!;
      expect(Array.from(sheet.children).map((c) => c.id)).toEqual(['station-l3-layer']);
    });

    // Spec §1.8: "The z-order is today's exactly: L4 · back robots · midground · bubbles · L3 · front
    // robots · copies · front fragment · tint D · foreground." A thing's place in the stack is its
    // sheet's slot first (the stylesheet's z-index follows SCENE_SLOTS, checked in the CSS test) and
    // its document order inside the sheet second.
    describe('the stack, back to front', () => {
      // The chain opens on the background buildings and tint A: before this phase L4 sat in a sheet
      // above all of `back`, so a plate lay over tint A, not under it.
      it('is background, tint A, L4, back robots, midground, bubbles, L3, front robots, copies, front fragment, tint D, foreground', () => {
        bubbleLayerMock.mockImplementation(bubbleStrips(1));
        useLocaleStore.setState({
          locales: {
            [DEFAULT_LOCALE_ID]: {
              ...useLocaleStore.getState().locales[DEFAULT_LOCALE_ID],
              robots: [makeRobot({ id: 'r1' }), makeRobot({ id: 'r2', layer: 'background' })],
            },
          },
        });
        const { container } = render(<OceanScene />);
        const q = (selector: string) => container.querySelector(selector)!;
        const chain: Array<[string, Element]> = [
          ['background', q('#factory-background-layer')],
          ['tint A', q('rect[data-depth-tint="A"]')],
          ['L4', q('#station-l4-layer')],
          ['back robots', q(BACK_ROBOT)],
          ['midground', q('#factory-midground-layer')],
          ['bubbles', q('.mover--bubbles')],
          ['L3', q('#station-l3-layer')],
          ['front robots', q(FRONT_ROBOT)],
          ['copies', q('[data-scene-slot="dissolve"]')],
          ['front fragment', q('#station-front-layer')],
          ['tint D', q('rect[data-depth-tint="D"]')],
          ['foreground', q('#factory-foreground-layer')],
        ];
        for (const [, el] of chain) expect(el).not.toBeNull();
        for (let i = 1; i < chain.length; i++) {
          expect(under(chain[i - 1][1], chain[i][1]), `${chain[i - 1][0]} under ${chain[i][0]}`).toBe(true);
          expect(under(chain[i][1], chain[i - 1][1]), `${chain[i][0]} not under ${chain[i - 1][0]}`).toBe(false);
        }
      });
    });

    it('a back-row robot draws over L4 and under L3', () => {
      useLocaleStore.setState({
        locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'r1', layer: 'background' })], actors: [] } },
      });
      const { container } = render(<OceanScene />);
      const robotEl = container.querySelector('[data-robot-mock="r1"]')!;
      expect(under(container.querySelector('#station-l4-layer')!, robotEl)).toBe(true);
      expect(under(robotEl, container.querySelector('#station-l3-layer')!)).toBe(true);
    });

    // Phase 43 Task 34 (spec §1.10), reshaped by Phase 53 Task 12 (spec §1.2, §1.5): the layer-switch
    // dissolve's copies go in a div of their own in the `dissolve` slot — over the front robots and
    // under the station's front fragment. The work loop fills it imperatively, so React renders it
    // empty and registers it for getRef.
    it('renders an empty dissolve div between the robots and the front sheet and registers it as robot-dissolve-layer', () => {
      useLocaleStore.setState({
        locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'r1' })], actors: [] } },
      });
      const { container, unmount } = render(<OceanScene />);
      const stage = container.querySelector('.ocean-scene__stage')!;
      const layer = stage.querySelector(':scope > div.ocean-scene__dissolve[data-scene-slot="dissolve"]');
      expect(layer).not.toBeNull();
      expect(layer!.children).toHaveLength(0);
      expect(layer!.nextElementSibling).toBe(stage.querySelector('svg[data-scene-slot="front"]'));
      // Everything before it is the stack below: the stations sheet, then the front robot movers.
      const front = stage.querySelector(':scope > .mover--robot[data-scene-slot="robots"]');
      expect(front!.compareDocumentPosition(layer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(getRef('robot-dissolve-layer')).toBe(layer);
      unmount();
      expect(getRef('robot-dissolve-layer')).toBeUndefined();
    });

    it('draws no dissolve group inside any sheet any more', () => {
      const { container } = render(<OceanScene />);
      expect(container.querySelector('#robot-dissolve-layer')).toBeNull();
      expect(container.querySelectorAll('[data-scene-slot="dissolve"]')).toHaveLength(1);
    });

    // The Deck camera's followed-robot marker moves every frame, so it lives in a moving layer —
    // in a static one it would repaint the foreground factories each frame — and that layer is the
    // last one, so it draws over the foreground buildings too.
    it('renders the followed-robot marker alone in the top moving layer, handed the locale id', () => {
      const { container } = render(<OceanScene />);
      const layer = container.querySelector('svg[data-scene-slot="marker"]')!;
      const stage = container.querySelector('.ocean-scene__stage')!;

      expect(stage.lastElementChild).toBe(layer);
      expect(layer.children).toHaveLength(1);

      expect(layer.lastElementChild?.getAttribute('data-followed-marker-mock')).toBe(DEFAULT_LOCALE_ID);
      expect(container.querySelectorAll('[data-followed-marker-mock]')).toHaveLength(1);
    });

    it('a copy the loop appends survives a scene re-render', () => {
      const { container } = render(<OceanScene />);
      const layer = getRef('robot-dissolve-layer')!;
      const copy = layer.appendChild(document.createElement('div'));
      act(() => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot({ id: 'r9' }));
      });
      expect(container.querySelector('[data-scene-slot="dissolve"]')!.firstChild).toBe(copy);
    });

    it('draws each fragment in its own sheet only: l4 in back, l3 in stations, front in front, none in a moving sheet', () => {
      const { container } = render(<OceanScene />);
      const fragmentsIn = (name: string) =>
        Array.from(container.querySelectorAll(`svg[data-scene-slot="${name}"] g[data-station-mock]`)).map((m) =>
          m.getAttribute('data-fragment'),
        );
      expect(new Set(fragmentsIn('back'))).toEqual(new Set(['l4']));
      expect(new Set(fragmentsIn('stations'))).toEqual(new Set(['l3']));
      expect(new Set(fragmentsIn('front'))).toEqual(new Set(['front']));
      for (const name of ['robots-back', 'mid', 'robots', 'marker']) {
        expect(fragmentsIn(name), name).toEqual([]);
      }
      expect(container.querySelectorAll('.mover g[data-station-mock]')).toHaveLength(0);
      expect(fragmentsIn('back').length).toBeGreaterThan(0);
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
      const front = container.querySelector('svg[data-scene-slot="front"] #factory-foreground-layer')!;
      const children = Array.from(front.children);
      const wallIdx = children.findIndex((el) => el.getAttribute('data-scenery-mock') === 'wall-1');
      const factoryIdx = children.findIndex((el) => el.getAttribute('data-factory-mock') === 'fg-factory-1');

      expect(wallIdx).toBeGreaterThanOrEqual(0);
      expect(factoryIdx).toBeGreaterThanOrEqual(0);
      expect(wallIdx).toBeLessThan(factoryIdx);
    });
  });
});
