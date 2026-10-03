// ========================================
// MOCKS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ReactElement } from 'react';

// A plain vi.fn(), not React.memo-wrapped — deliberately, so its own call count is a reliable
// proxy for "did OceanScene's render body reconstruct the robot layer again" (docs/todo/
// backlog.md #27 follow-up, 2026-09-15), the same "unmemoized mock as a render-count marker"
// technique RobotOptionsTab.test.tsx/CompanyOptionsSection.test.tsx already use.
vi.mock('@/components/robot/Robot', () => ({ Robot: vi.fn(() => null) }));
vi.mock('@/components/actors/Factory', () => ({ Factory: () => null, default: () => null }));
// Records what the scene hands its bubble layer (which factories, what total) without running
// BubbleStream's GSAP timelines.
const bubbleLayerMock = vi.fn((_props: { factories: { id: string }[]; totalBuildings: number }): ReactElement | null => null);
vi.mock('@/components/actors/BubbleLayer', () => ({
  BubbleLayer: (props: { factories: { id: string }[]; totalBuildings: number }) => bubbleLayerMock(props),
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
import { getAllRowConfigs } from '@/systems/factoryPlacementSystem';
import { ActorType } from '@/types/Actor';
import type { Actor } from '@/types/Actor';
import type { Robot as RobotType } from '@/types/Robot';

function makeRobot(overrides: Partial<RobotType> = {}): RobotType {
  return {
    id: 'r1',
    state: 'idle',
    position: { x: 0, y: 0 },
    destination: null,
    direction: 'right',
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
    const rowIndexFor = (label: 'background' | 'midground' | 'foreground'): number =>
      getAllRowConfigs().findIndex((r) => r.row === label);
    const makeFactory = (id: string, row: number, purpose: 'heavyIndustry' | 'observationComms' = 'heavyIndustry'): Actor => ({
      id, type: ActorType.FACTORY, position: { x: 100, y: 900 }, isActive: true, cooldownRemaining: 0, config: { row, purpose },
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

    it('renders four svg layers in back → bubbles → robots → front order, all inside the scene box', () => {
      const { container } = render(<OceanScene />);
      const scene = container.querySelector('.ocean-scene');
      expect(scene?.tagName.toLowerCase()).toBe('div');
      const layers = Array.from(scene!.querySelectorAll(':scope > svg.ocean-scene__layer'));
      expect(layers.map((l) => l.getAttribute('data-scene-layer'))).toEqual(['back', 'bubbles', 'robots', 'front']);
    });

    it('every layer shares the viewBox and the cover (slice) fit of the old single svg', () => {
      const { container } = render(<OceanScene />);
      for (const layer of container.querySelectorAll('svg.ocean-scene__layer')) {
        expect(layer.getAttribute('viewBox')).toBe('0 0 1920 1080');
        expect(layer.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
      }
    });

    it('marks the robots and bubbles layers as moving, and the back and front layers as not', () => {
      const { container } = render(<OceanScene />);
      const byName = (name: string) => container.querySelector(`svg[data-scene-layer="${name}"]`)!;
      expect(byName('robots').classList.contains('ocean-scene__layer--moving')).toBe(true);
      expect(byName('robots').classList.contains('ocean-scene__layer--robots')).toBe(true);
      expect(byName('bubbles').classList.contains('ocean-scene__layer--moving')).toBe(true);
      expect(byName('back').classList.contains('ocean-scene__layer--moving')).toBe(false);
      expect(byName('front').classList.contains('ocean-scene__layer--moving')).toBe(false);
    });

    it('keeps the factory rows and the robot layer in their layers: background + midground (with the depth gradients) in back, robots in robots, foreground in front', () => {
      const { container } = render(<OceanScene />);
      const back = container.querySelector('svg[data-scene-layer="back"]')!;
      expect(back.querySelector('#factory-background-layer')).not.toBeNull();
      expect(back.querySelector('#gradient-back-mid')).not.toBeNull();
      expect(back.querySelector('#factory-midground-layer')).not.toBeNull();
      expect(back.querySelector('#gradient-mid-front')).not.toBeNull();
      expect(back.querySelector('#factory-foreground-layer')).toBeNull();
      expect(container.querySelector('svg[data-scene-layer="robots"] #robot-layer')).not.toBeNull();
      expect(container.querySelector('svg[data-scene-layer="front"] #factory-foreground-layer')).not.toBeNull();
      expect(container.querySelector('svg[data-scene-layer="front"] #robot-layer')).toBeNull();
    });

    it('hands the bubble layer every factory (all rows) and the locale-wide bubble-eligible count', () => {
      render(<OceanScene />);
      expect(bubbleLayerMock).toHaveBeenCalled();
      const props = bubbleLayerMock.mock.calls.at(-1)![0];
      expect(props.factories.map((f) => f.id).sort()).toEqual(['bg-1', 'fg-1', 'mid-1']);
      expect(props.totalBuildings).toBe(2); // mid-1 is observationComms — no vent
    });

    it('keeps the bubble layer inside the bubbles svg', () => {
      bubbleLayerMock.mockImplementation(() => <g data-testid="bubble-layer-stub" />);
      const { container } = render(<OceanScene />);
      expect(container.querySelector('svg[data-scene-layer="bubbles"] [data-testid="bubble-layer-stub"]')).not.toBeNull();
      bubbleLayerMock.mockImplementation(() => null);
    });
  });
});
