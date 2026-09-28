import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// BubbleStream drives its bubble-burst timing off GSAP timelines (real GSAP is
// mocked globally in vitest.setup.ts, but useGSAP's own internals are not —
// see BubbleStream.test.tsx, which avoids rendering it for the same reason).
// Stubbing it here isolates what this file actually verifies: whether Factory
// renders BubbleStream at all for a given purpose, and what totalBuildings
// value it forwards — not how BubbleStream itself animates.
vi.mock('./BubbleStream', () => ({
  __esModule: true,
  default: (props: { totalBuildings: number }) => (
    <div data-testid="bubble-stream-stub" data-total-buildings={props.totalBuildings} />
  ),
}));

import { Factory } from './Factory';
import { useAttenuationStyleStore } from '../../stores/attenuationStyleStore';
import { useLocaleStore } from '../../stores/localeStore';
import { ActorType } from '../../types/Actor';
import type { Actor } from '../../types/Actor';
import type { AttenuationStyle } from '../../types/attenuationStyle';
import type { Locale } from '../../types/locale';
import type { FactoryPurpose } from './factoryVariants';

function makeActor(purpose?: FactoryPurpose): Actor {
  return {
    id: 'factory-under-test',
    type: ActorType.FACTORY,
    position: { x: 100, y: 900 },
    isActive: true,
    cooldownRemaining: 0,
    config: purpose ? { purpose } : {},
  };
}

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

function setStoreFixtures() {
  useAttenuationStyleStore.setState({ attenuationStyles: [TEST_ATTENUATION_STYLE], currentAttenuationStyleId: TEST_ATTENUATION_STYLE.id });
  useLocaleStore.setState({ locales: { [TEST_LOCALE.id]: TEST_LOCALE } });
}

describe('Factory — BubbleStream eligibility', () => {
  beforeEach(() => {
    setStoreFixtures();
  });

  it('renders BubbleStream for an industrial purpose (heavyIndustry)', () => {
    render(<Factory actor={makeActor('heavyIndustry')} />);
    expect(screen.queryByTestId('bubble-stream-stub')).not.toBeNull();
  });

  it('does not render BubbleStream for a non-industrial purpose (observationComms)', () => {
    render(<Factory actor={makeActor('observationComms')} />);
    expect(screen.queryByTestId('bubble-stream-stub')).toBeNull();
  });

  it('defaults to an eligible purpose when config.purpose is unset', () => {
    render(<Factory actor={makeActor(undefined)} />);
    expect(screen.queryByTestId('bubble-stream-stub')).not.toBeNull();
  });
});

describe('Factory — totalBubbleBuildings wiring', () => {
  beforeEach(() => {
    setStoreFixtures();
  });

  it('defaults to 1 when totalBubbleBuildings is not passed', () => {
    render(<Factory actor={makeActor('heavyIndustry')} />);
    expect(screen.getByTestId('bubble-stream-stub').getAttribute('data-total-buildings')).toBe('1');
  });

  it('forwards a passed totalBubbleBuildings count to BubbleStream', () => {
    render(<Factory actor={makeActor('heavyIndustry')} totalBubbleBuildings={37} />);
    expect(screen.getByTestId('bubble-stream-stub').getAttribute('data-total-buildings')).toBe('37');
  });
});
