import { describe, it, expect } from 'vitest';

import { getFactoryBubbleProps, hashActorId } from './factoryBubbleProps';
import { selectVariantFromSeed, VARIANT_CONF } from './factoryVariants';
import { calcSilhouetteSize } from './silhouetteUtils';
import { getRecipeRow } from '../../systems/factoryPlacementSystem';
import { RECIPES } from '../../systems/districtRecipes';
import { shiftHSL } from '../../utils/colorUtils';
import { computeAccentLean } from '../../utils/accentLean';
import { ActorType } from '../../types/Actor';
import type { Actor } from '../../types/Actor';

// Roadmap 17.2.5: BubbleStream moved out of Factory.tsx into its own scene layer (BubbleLayer),
// so the vent position / seed / hue / depth a building's bubbles need are derived here, from the
// actor alone, instead of inside Factory's render. These tests re-derive each value through the
// same public helpers Factory uses for its silhouette, so the two can't drift apart silently.

// Every actor below uses the 'dense' district (getFactoryBubbleProps' own fallback), so a row
// index alone resolves the same depth label the real implementation would see.
const rowIndexFor = (label: 'background' | 'midground' | 'foreground'): number =>
  RECIPES.dense.findIndex((r) => r.depth === label);

function makeActor(overrides: Partial<Actor> & { config?: Actor['config'] } = {}): Actor {
  return {
    id: 'factory-3-bubbles',
    type: ActorType.FACTORY,
    position: { x: 400, y: 1000 },
    isActive: true,
    cooldownRemaining: 0,
    ...overrides,
    config: { row: rowIndexFor('midground'), district: 'dense', purpose: 'heavyIndustry', hueShift: 10, satShift: -5, ...(overrides.config ?? {}) },
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
    const config = selectVariantFromSeed(actor.id, actor.position.x, row, getRecipeRow('dense', row)?.variants);
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
    const config = selectVariantFromSeed(actor.id, actor.position.x, row, getRecipeRow('dense', row)?.variants);
    const expectedHue = shiftHSL(VARIANT_CONF[config.variant].colors.body, { hueShift: 10, satShift: -5 }).h;
    expect(getFactoryBubbleProps(actor)!.bodyHue).toBe(expectedHue);
  });

  it('follows a Phase 35 accent-leaned shift with no rule of its own — the lean reaches the bubbles through the stored hueShift/satShift', () => {
    // docs/specs/WORLD_PALETTE_PULL.md §1.3 / docs/tasks/WORLD_PALETTE_PULL.md Task 6 (test-only):
    // placement folds the lean into config.hueShift/satShift; this helper reads exactly those, so
    // the bubble tint moves with the building without any bubble-side code.
    const base = { hueShift: 10, satShift: -5 };
    const row = rowIndexFor('midground');
    const probe = makeActor({ config: { row } });
    const variant = selectVariantFromSeed(probe.id, probe.position.x, row, getRecipeRow('dense', row)?.variants).variant;
    const body = VARIANT_CONF[variant].colors.body;
    const lean = computeAccentLean(shiftHSL(body, base), 172); // ≈ teal
    expect(lean.hueShift).not.toBe(0); // a trivial lean would prove nothing
    const leaned = { hueShift: base.hueShift + lean.hueShift, satShift: base.satShift + lean.satShift };

    const actor = makeActor({ config: { row, ...leaned } });
    expect(getFactoryBubbleProps(actor)!.bodyHue).toBe(shiftHSL(body, leaned).h);
    expect(getFactoryBubbleProps(actor)!.bodyHue).not.toBe(shiftHSL(body, base).h);
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
