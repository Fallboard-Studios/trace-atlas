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

  it('renders nothing for a kind with no registered renderer', () => {
    const { container } = render(<Scenery actor={makeActor({ kind: 'dome' as never, district: 'towers', row: 5 })} />);
    expect(container.innerHTML).toBe('');
  });

  it('SCENERY_RENDERERS only has entries for shipped kinds (wall, pylon, beacon, boulder, tank — D2 Tasks 11-13)', () => {
    expect(Object.keys(SCENERY_RENDERERS)).toEqual(['wall', 'pylon', 'beacon', 'boulder', 'tank']);
  });

  it('dispatches the Task 12/13 kinds (pylon, beacon, boulder, tank) to their renderers', () => {
    const pylonCtx = render(<Scenery actor={makeActor({ kind: 'pylon', district: 'dense', row: 3 })} />);
    expect(pylonCtx.container.querySelector('[data-scenery="pylon"]')).not.toBeNull();

    const beaconCtx = render(<Scenery actor={makeActor({ kind: 'beacon', district: 'outskirts', row: 9 })} />);
    expect(beaconCtx.container.querySelector('[data-scenery="beacon"]')).not.toBeNull();

    const boulderCtx = render(<Scenery actor={makeActor({ kind: 'boulder', district: 'outskirts', row: 2 })} />);
    expect(boulderCtx.container.querySelector('[data-scenery="boulder"]')).not.toBeNull();

    const tankCtx = render(<Scenery actor={makeActor({ kind: 'tank', district: 'outskirts', row: 5 })} />);
    expect(tankCtx.container.querySelector('[data-scenery="tank"]')).not.toBeNull();
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
