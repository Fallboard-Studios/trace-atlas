import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

import { Scenery, SCENERY_RENDERERS } from './Scenery';
import { useAttenuationStyleStore } from '../../../stores/attenuationStyleStore';
import { useLocaleStore } from '../../../stores/localeStore';
import { useUIStore } from '../../../stores/uiStore';
import { ActorType, type Actor } from '../../../types/Actor';
import type { AttenuationStyle } from '../../../types/attenuationStyle';
import type { Locale } from '../../../types/locale';

const TEST_ATTENUATION_STYLE: AttenuationStyle = {
  id: 'test-attenuation-style',
  name: 'Glaxos',
  locales: ['test-locale'],
  currentLocaleId: 'test-locale',
};

const TEST_LOCALE: Locale = {
  id: 'test-locale',
  attenuationStyleId: 'test-attenuation-style',
  name: 'Test Locale',
  coordinates: { x: -17, y: 30 },
  dayStartTimestamp: 0,
  createdAtMeasure: 0,
  robots: [],
  actors: [],
  companies: [],
  currentMeasure: 0,
};

function makeActor(configOverrides: Actor['config'] = {}): Actor {
  return {
    id: 'scenery-fixture-wall',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'wall', district: 'outskirts', row: 7, ...configOverrides },
  };
}

beforeEach(() => {
  useAttenuationStyleStore.setState({ attenuationStyles: [TEST_ATTENUATION_STYLE], currentAttenuationStyleId: TEST_ATTENUATION_STYLE.id });
  useLocaleStore.setState({ locales: { [TEST_LOCALE.id]: TEST_LOCALE } });
});

afterEach(() => {
  act(() => {
    useUIStore.setState({ activeLocaleLocalTime: null });
  });
});

describe('Scenery dispatcher', () => {
  it('dispatches a shipped kind (wall) to its renderer', () => {
    const { container } = render(<Scenery actor={makeActor()} />);
    expect(container.querySelector('[data-scenery="wall"]')).not.toBeNull();
  });

  it('renders nothing for an actor with no kind', () => {
    // D2 (roadmap Phase 42 Tasks 11-17) ships all sixteen SceneryKinds, so there is no real
    // kind left to exercise the "no registered renderer" branch with — a kind-less actor
    // takes the same `renderer` undefined path (Scenery.tsx: `kind ? SCENERY_RENDERERS[kind] :
    // undefined`), so it still proves `if (!renderer) return null` works.
    const { container } = render(<Scenery actor={makeActor({ kind: undefined, district: 'ventfield', row: 2 })} />);
    expect(container.innerHTML).toBe('');
  });

  it('SCENERY_RENDERERS has entries for all sixteen SceneryKinds (D2 complete, roadmap Phase 42 Tasks 11-17)', () => {
    expect(Object.keys(SCENERY_RENDERERS)).toEqual([
      'wall', 'pylon', 'beacon', 'boulder', 'tank', 'dome', 'scaffold', 'containers',
      'crane', 'pipeline', 'turbine', 'tether', 'floodlight', 'dish', 'wreck', 'vent',
    ]);
  });

  it('dispatches the Task 15 kinds (crane, pipeline) to their renderers', () => {
    const craneCtx = render(<Scenery actor={makeActor({ kind: 'crane', district: 'yard', row: 5 })} />);
    expect(craneCtx.container.querySelector('[data-scenery="crane"]')).not.toBeNull();

    const pipelineCtx = render(<Scenery actor={makeActor({ kind: 'pipeline', district: 'dense', row: 6 })} />);
    expect(pipelineCtx.container.querySelector('[data-scenery="pipeline"]')).not.toBeNull();
  });

  it('dispatches the Task 16 kinds (turbine, tether, floodlight, dish) to their renderers', () => {
    const turbineCtx = render(<Scenery actor={makeActor({ kind: 'turbine', district: 'habitat', row: 2 })} />);
    expect(turbineCtx.container.querySelector('[data-scenery="turbine"]')).not.toBeNull();

    const tetherCtx = render(<Scenery actor={makeActor({ kind: 'tether', district: 'habitat', row: 9 })} />);
    expect(tetherCtx.container.querySelector('[data-scenery="tether"]')).not.toBeNull();

    const floodlightCtx = render(<Scenery actor={makeActor({ kind: 'floodlight', district: 'yard', row: 4 })} />);
    expect(floodlightCtx.container.querySelector('[data-scenery="floodlight"]')).not.toBeNull();

    const dishCtx = render(<Scenery actor={makeActor({ kind: 'dish', district: 'habitat', row: 5 })} />);
    expect(dishCtx.container.querySelector('[data-scenery="dish"]')).not.toBeNull();
  });

  it('dispatches the Task 12-14 kinds (pylon, beacon, boulder, tank, dome, scaffold, containers) to their renderers', () => {
    const pylonCtx = render(<Scenery actor={makeActor({ kind: 'pylon', district: 'dense', row: 3 })} />);
    expect(pylonCtx.container.querySelector('[data-scenery="pylon"]')).not.toBeNull();

    const beaconCtx = render(<Scenery actor={makeActor({ kind: 'beacon', district: 'outskirts', row: 9 })} />);
    expect(beaconCtx.container.querySelector('[data-scenery="beacon"]')).not.toBeNull();

    const boulderCtx = render(<Scenery actor={makeActor({ kind: 'boulder', district: 'outskirts', row: 2 })} />);
    expect(boulderCtx.container.querySelector('[data-scenery="boulder"]')).not.toBeNull();

    const tankCtx = render(<Scenery actor={makeActor({ kind: 'tank', district: 'outskirts', row: 5 })} />);
    expect(tankCtx.container.querySelector('[data-scenery="tank"]')).not.toBeNull();

    const domeCtx = render(<Scenery actor={makeActor({ kind: 'dome', district: 'habitat', row: 2 })} />);
    expect(domeCtx.container.querySelector('[data-scenery="dome"]')).not.toBeNull();

    const scaffoldCtx = render(<Scenery actor={makeActor({ kind: 'scaffold', district: 'derelict', row: 5 })} />);
    expect(scaffoldCtx.container.querySelector('[data-scenery="scaffold"]')).not.toBeNull();

    const containersCtx = render(<Scenery actor={makeActor({ kind: 'containers', district: 'yard', row: 3 })} />);
    expect(containersCtx.container.querySelector('[data-scenery="containers"]')).not.toBeNull();
  });

  it('dispatches the Task 17 kinds (wreck, vent) to their renderers', () => {
    const wreckCtx = render(<Scenery actor={makeActor({ kind: 'wreck', district: 'wreckfield', row: 3 })} />);
    expect(wreckCtx.container.querySelector('[data-scenery="wreck"]')).not.toBeNull();

    const ventCtx = render(<Scenery actor={makeActor({ kind: 'vent', district: 'ventfield', row: 0 })} />);
    expect(ventCtx.container.querySelector('[data-scenery="vent"]')).not.toBeNull();
  });

  it('does not throw across a range of hours (lighting tick)', () => {
    for (const hour of [0, 6, 9, 12, 15, 18, 23]) {
      act(() => {
        useUIStore.getState().setActiveLocaleLocalTime(hour);
      });
      expect(() => render(<Scenery actor={makeActor()} />)).not.toThrow();
    }
  });

  it('a derelict wall still renders (wall is not derelict-capable visually, but must not crash)', () => {
    expect(() => render(<Scenery actor={makeActor({ derelict: true })} />)).not.toThrow();
  });
});
