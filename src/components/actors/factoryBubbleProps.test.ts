import { describe, it, expect } from 'vitest';

import { getFactoryBubbleProps, hashActorId } from './factoryBubbleProps';
import { selectVariantFromSeed, VARIANT_CONF } from './factoryVariants';
import { calcSilhouetteSize } from './silhouetteUtils';
import { getRowConfig, getAllRowConfigs } from '../../systems/factoryPlacementSystem';
import { shiftHSL } from '../../utils/colorUtils';
import { ActorType } from '../../types/Actor';
import type { Actor } from '../../types/Actor';

// Roadmap 17.2.5: BubbleStream moved out of Factory.tsx into its own scene layer (BubbleLayer),
// so the vent position / seed / hue / depth a building's bubbles need are derived here, from the
// actor alone, instead of inside Factory's render. These tests re-derive each value through the
// same public helpers Factory uses for its silhouette, so the two can't drift apart silently.

const rowIndexFor = (label: 'background' | 'midground' | 'foreground'): number =>
  getAllRowConfigs().findIndex((r) => r.row === label);

function makeActor(overrides: Partial<Actor> & { config?: Actor['config'] } = {}): Actor {
  return {
    id: 'factory-3-bubbles',
    type: ActorType.FACTORY,
    position: { x: 400, y: 1000 },
    isActive: true,
    cooldownRemaining: 0,
    ...overrides,
    config: { row: rowIndexFor('midground'), purpose: 'heavyIndustry', hueShift: 10, satShift: -5, ...(overrides.config ?? {}) },
  };
}

describe('hashActorId', () => {
  it('hashes the whole id, so two real factory ids sharing the `factory-{index}-` prefix differ', () => {
    expect(hashActorId('factory-0-aaaaaaaa')).not.toBe(hashActorId('factory-1-aaaaaaaa'));
  });

  it('is deterministic', () => {
    expect(hashActorId('factory-7-x')).toBe(hashActorId('factory-7-x'));
  });
});

describe('getFactoryBubbleProps', () => {
  it('returns null for a purpose with no vent (observationComms)', () => {
    expect(getFactoryBubbleProps(makeActor({ config: { purpose: 'observationComms' } }))).toBeNull();
  });

  it('treats an unset purpose as eligible (the heavyIndustry fallback)', () => {
    expect(getFactoryBubbleProps(makeActor({ config: { purpose: undefined } }))).not.toBeNull();
  });

  it('keys the stream to the actor and seeds it from the full-id hash', () => {
    const actor = makeActor();
    const props = getFactoryBubbleProps(actor)!;
    expect(props.actorId).toBe(actor.id);
    expect(props.seed).toBe(hashActorId(actor.id));
  });

  it('is active unless the building is offline', () => {
    expect(getFactoryBubbleProps(makeActor())!.isActive).toBe(true);
    expect(getFactoryBubbleProps(makeActor({ config: { isOffline: true } }))!.isActive).toBe(false);
  });

  it('puts the vent on the roofline, 20–80 % across the facade, in scene coordinates', () => {
    const actor = makeActor({ scaleX: 1.1, scaleY: 0.9 });
    const row = actor.config!.row!;
    const config = selectVariantFromSeed(actor.id, actor.position.x, row, getRowConfig(row)?.availableFactoryTypes);
    const { width, height } = calcSilhouetteSize(config.noiseValue, VARIANT_CONF[config.variant].sizeRange);
    const actualWidth = width * 1.1;
    const actualHeight = height * 0.9;

    const props = getFactoryBubbleProps(actor)!;
    expect(props.ventY).toBeCloseTo(actor.position.y - actualHeight, 6);
    expect(props.ventX).toBeCloseTo(actor.position.x + (((hashActorId(actor.id) % 60) + 20) / 100) * actualWidth, 6);
    expect(props.ventX).toBeGreaterThanOrEqual(actor.position.x + 0.2 * actualWidth);
    expect(props.ventX).toBeLessThanOrEqual(actor.position.x + 0.8 * actualWidth);
  });

  it('tints the bubbles with the building\'s shifted body hue', () => {
    const actor = makeActor();
    const row = actor.config!.row!;
    const config = selectVariantFromSeed(actor.id, actor.position.x, row, getRowConfig(row)?.availableFactoryTypes);
    const expectedHue = shiftHSL(VARIANT_CONF[config.variant].colors.body, { hueShift: 10, satShift: -5 }).h;
    expect(getFactoryBubbleProps(actor)!.bodyHue).toBe(expectedHue);
  });

  it.each([
    ['background', 1 / 3],
    ['midground', 0.5],
    ['foreground', 1],
  ] as const)('scales bubbles by row depth: %s → %s', (label, depthScale) => {
    expect(getFactoryBubbleProps(makeActor({ config: { row: rowIndexFor(label) } }))!.depthScale).toBeCloseTo(depthScale, 9);
  });

  it('falls back to full-size bubbles when the row is unknown', () => {
    expect(getFactoryBubbleProps(makeActor({ config: { row: 99 } }))!.depthScale).toBe(1);
  });
});
