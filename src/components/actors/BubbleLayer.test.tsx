import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// BubbleStream's own timing/GSAP internals are irrelevant here (BubbleStream.test.tsx covers them);
// this file verifies which streams BubbleLayer mounts and what it forwards to each.
vi.mock('./BubbleStream', () => ({
  __esModule: true,
  default: (props: { actorId: string; totalBuildings: number; depthScale?: number; isActive: boolean }) => (
    <g
      data-testid="bubble-stream-stub"
      data-actor-id={props.actorId}
      data-total-buildings={props.totalBuildings}
      data-depth-scale={props.depthScale}
      data-active={String(props.isActive)}
    />
  ),
}));

import { BubbleLayer } from './BubbleLayer';
import { RECIPES } from '../../systems/districtRecipes';
import { ActorType } from '../../types/Actor';
import type { Actor } from '../../types/Actor';
import type { FactoryPurpose } from './factoryVariants';

// Actors here use the 'dense' district (factoryBubbleProps.ts's own fallback) by default, so a
// row index alone resolves the same depth label getFactoryBubbleProps/Factory.tsx would see.
const rowIndexFor = (label: 'background' | 'midground' | 'foreground'): number =>
  RECIPES.dense.findIndex((r) => r.depth === label);

function makeActor(id: string, purpose: FactoryPurpose | undefined, row = rowIndexFor('foreground'), extra: Actor['config'] = {}): Actor {
  return {
    id,
    type: ActorType.FACTORY,
    position: { x: 100, y: 900 },
    isActive: true,
    cooldownRemaining: 0,
    config: { purpose, row, district: 'dense', ...extra },
  };
}

function stubs(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid="bubble-stream-stub"]'));
}

describe('BubbleLayer (roadmap 17.2.5 — bubbles in their own scene layer)', () => {
  it('mounts one BubbleStream per bubble-eligible factory and none for a vent-less purpose', () => {
    const factories = [
      makeActor('f-heavy', 'heavyIndustry'),
      makeActor('f-obs', 'observationComms'),
      makeActor('f-unset', undefined),
      makeActor('f-pipes', 'pipeWorks'),
    ];
    const { container } = render(<svg><BubbleLayer actors={factories} totalBuildings={3} /></svg>);
    expect(stubs(container).map((el) => el.getAttribute('data-actor-id'))).toEqual(['f-heavy', 'f-unset', 'f-pipes']);
  });

  it('forwards totalBuildings to every stream unchanged', () => {
    const factories = [makeActor('a', 'heavyIndustry'), makeActor('b', 'chemicalProcessing')];
    const { container } = render(<svg><BubbleLayer actors={factories} totalBuildings={37} /></svg>);
    expect(stubs(container).map((el) => el.getAttribute('data-total-buildings'))).toEqual(['37', '37']);
  });

  it('forwards each building\'s own row depth and offline state', () => {
    const factories = [
      makeActor('bg', 'heavyIndustry', rowIndexFor('background')),
      makeActor('mid', 'heavyIndustry', rowIndexFor('midground'), { isOffline: true }),
      makeActor('fg', 'heavyIndustry', rowIndexFor('foreground')),
    ];
    const { container } = render(<svg><BubbleLayer actors={factories} totalBuildings={3} /></svg>);
    const byId = Object.fromEntries(stubs(container).map((el) => [el.getAttribute('data-actor-id'), el]));
    expect(Number(byId.bg.getAttribute('data-depth-scale'))).toBeCloseTo(1 / 3, 9);
    expect(byId.mid.getAttribute('data-depth-scale')).toBe('0.5');
    expect(byId.fg.getAttribute('data-depth-scale')).toBe('1');
    expect(byId.mid.getAttribute('data-active')).toBe('false');
    expect(byId.fg.getAttribute('data-active')).toBe('true');
  });

  it('renders nothing for an empty locale', () => {
    const { container } = render(<svg><BubbleLayer actors={[]} totalBuildings={0} /></svg>);
    expect(stubs(container)).toHaveLength(0);
  });

  it('is React.memo-wrapped — the once/sec lighting tick must not re-run it', () => {
    expect((BubbleLayer as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  // Roadmap Phase 42 Task 17 (§1.11): vents vent bubbles too, through the same getActorBubbleProps
  // path a factory goes through — BubbleLayer itself doesn't know "vent" from "factory".
  it('mounts a BubbleStream for a vent scenery actor alongside factories', () => {
    const ventRow = RECIPES.ventfield.findIndex((r) => r.kind === 'vent' && r.depth === 'background');
    const ventActor: Actor = {
      id: 'vent-1',
      type: ActorType.SCENERY,
      position: { x: 200, y: 1000 },
      isActive: false,
      cooldownRemaining: 0,
      config: { kind: 'vent', row: ventRow, district: 'ventfield' },
    };
    const actors = [makeActor('f-heavy', 'heavyIndustry'), ventActor];
    const { container } = render(<svg><BubbleLayer actors={actors} totalBuildings={2} /></svg>);
    expect(stubs(container).map((el) => el.getAttribute('data-actor-id')).sort()).toEqual(['f-heavy', 'vent-1']);
  });

  it('skips a non-vent scenery actor (e.g. a wall has no vent)', () => {
    const wallActor: Actor = {
      id: 'wall-1',
      type: ActorType.SCENERY,
      position: { x: 200, y: 1000 },
      isActive: false,
      cooldownRemaining: 0,
      config: { kind: 'wall', row: 0, district: 'outskirts' },
    };
    const { container } = render(<svg><BubbleLayer actors={[wallActor]} totalBuildings={0} /></svg>);
    expect(stubs(container)).toHaveLength(0);
  });
});
