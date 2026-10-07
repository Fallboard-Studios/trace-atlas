import { describe, it, expect } from 'vitest';

import { type Actor, ActorType } from '../../types/Actor';
import { calcSilhouetteSize, pickSilhouetteFill, bottomAnchorTransform } from './silhouetteUtils';

const DUMMY_ACTOR: Actor = { id: 'a', type: ActorType.FACTORY, position: { x: 100, y: 900 }, isActive: true };

describe('silhouette utils', () => {
  it('calcSilhouetteSize maps noise value into provided sizeRange', () => {
    const range = { minWidth: 100, maxWidth: 200, minHeight: 50, maxHeight: 150 };

    // noiseValue = 0 → min values
    expect(calcSilhouetteSize(0, range)).toEqual({ width: 100, height: 50 });
    // noiseValue = 1 → max values
    expect(calcSilhouetteSize(1, range)).toEqual({ width: 200, height: 150 });
    // midpoint should be average
    expect(calcSilhouetteSize(0.5, range)).toEqual({ width: 150, height: 100 });
  });

  it('pickSilhouetteFill uses thresholds correctly', () => {
    const colors = { light: 'L', base: 'B', dark: 'D' };
    expect(pickSilhouetteFill(0.39, colors)).toBe('L');
    expect(pickSilhouetteFill(0.4, colors)).toBe('B');
    expect(pickSilhouetteFill(0.7, colors)).toBe('B');
    expect(pickSilhouetteFill(0.71, colors)).toBe('D');
  });

  it('bottomAnchorTransform anchors bottom correctly without scale', () => {
    const t = bottomAnchorTransform(DUMMY_ACTOR, 360);
    expect(t).toBe('translate(100, 540)'); // 900 - 360 = 540
  });

  it('bottomAnchorTransform honours scaleY', () => {
    const scaled: Actor = { ...DUMMY_ACTOR, scaleY: 0.5 };
    const t = bottomAnchorTransform(scaled, 360);
    // height reduced by half: 360 * 0.5 = 180
    expect(t).toBe('translate(100, 720)'); // 900 - 180
  });
});