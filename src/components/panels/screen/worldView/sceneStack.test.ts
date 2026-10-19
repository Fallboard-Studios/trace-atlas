import { describe, expect, expectTypeOf, it } from 'vitest';

import { SCENE_SLOTS, slotForLayer, type SceneSlot } from './sceneStack';

// docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.2 (roadmap Phase 53, Task 6). The scene's stacking
// order is one table, back to front: the `data-scene-slot` value of every stage child, which
// OceanScene.css gives a z-index in the same order. A robot's slot follows its row.

describe('SCENE_SLOTS', () => {
  it('is the nine slots in the spec order, back to front', () => {
    expect([...SCENE_SLOTS]).toEqual([
      'back',
      'robots-back',
      'mid',
      'bubbles',
      'stations',
      'robots',
      'dissolve',
      'front',
      'marker',
    ]);
  });

  it('has no duplicate slot', () => {
    expect(new Set(SCENE_SLOTS).size).toBe(SCENE_SLOTS.length);
  });

  it('is a readonly tuple, and SceneSlot is exactly its members', () => {
    expectTypeOf(SCENE_SLOTS).toEqualTypeOf<
      readonly [
        'back',
        'robots-back',
        'mid',
        'bubbles',
        'stations',
        'robots',
        'dissolve',
        'front',
        'marker',
      ]
    >();
    expectTypeOf<SceneSlot>().toEqualTypeOf<(typeof SCENE_SLOTS)[number]>();
  });

  it('puts the back row under the midground and the front row over the bubbles and the stations', () => {
    const at = (slot: SceneSlot) => SCENE_SLOTS.indexOf(slot);
    expect(at('robots-back')).toBeLessThan(at('mid'));
    expect(at('robots')).toBeGreaterThan(at('bubbles'));
    expect(at('robots')).toBeGreaterThan(at('stations'));
  });

  it('draws the layer-switch copies above the front robots and under the front sheet, the marker on top', () => {
    const at = (slot: SceneSlot) => SCENE_SLOTS.indexOf(slot);
    expect(at('dissolve')).toBeGreaterThan(at('robots'));
    expect(at('dissolve')).toBeLessThan(at('front'));
    expect(at('marker')).toBe(SCENE_SLOTS.length - 1);
  });
});

describe('slotForLayer', () => {
  it('maps the background row to the robots-back slot', () => {
    expect(slotForLayer('background')).toBe('robots-back');
  });

  it('maps the foreground row to the robots slot', () => {
    expect(slotForLayer('foreground')).toBe('robots');
  });

  it('treats a robot with no layer as foreground, the default', () => {
    expect(slotForLayer(undefined)).toBe('robots');
    expect(slotForLayer()).toBe('robots');
  });

  it('only ever returns a slot that is in SCENE_SLOTS', () => {
    for (const layer of ['background', 'foreground', undefined] as const) {
      expect(SCENE_SLOTS).toContain(slotForLayer(layer));
    }
  });
});
