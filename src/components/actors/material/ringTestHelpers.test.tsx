/**
 * `worldGemTraces` is what the switch-off tests (`*.bevel0.test.tsx`) assert on now that their
 * pre-change snapshots are gone, so it has to flag every way the material can show up in markup —
 * and nothing else. Real components, no mocks: the detector is only worth anything if it sees what
 * the renderers really emit.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { GemRing } from './GemRing';
import { hairline, ringFacets, worldLightVector } from './worldGemMaterial';
import { worldGemTraces, withSwitch } from './ringTestHelpers';
import { pylon } from '../scenery/renderers/pylon';
import { ActorType, type Actor } from '../../../types/Actor';
import type { SceneryContext } from '../scenery/sceneryTypes';

const RING = ringFacets(
  [[0, 0], [40, 0], [40, 30], [0, 30]],
  4,
  worldLightVector(1, 0.5),
  () => 1,
  { h: 200, s: 20, l: 40 },
);

const markupOf = (ui: React.ReactElement): string => render(<svg>{ui}</svg>).container.innerHTML;

function pylonContext(): SceneryContext {
  const actor: Actor = {
    id: 'pylon-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'pylon', district: 'dense', row: 3, hueShift: 10, satShift: -5 },
  };
  return { actor, params: { pylon: { w: 70, h: 320 } }, cap: 1, eastL: 0.9, westL: 0.5, nightDepth: 0.4, accent: { primary: 210, secondary: 30 }, gems: true };
}

describe('worldGemTraces', () => {
  it('finds nothing in empty markup or in plain shapes', () => {
    expect(worldGemTraces('')).toEqual([]);
    expect(worldGemTraces(markupOf(<rect x="0" y="0" width="10" height="10" fill="red" />))).toEqual([]);
  });

  it('flags a ring', () => {
    expect(worldGemTraces(markupOf(<GemRing facets={RING} />))).toEqual(['ring']);
  });

  it('flags a hairline', () => {
    expect(worldGemTraces(markupOf(<rect x="0" y="0" width="10" height="10" {...hairline()} />))).toEqual(['hairline']);
  });

  it('flags both when both are present', () => {
    const html = markupOf(
      <>
        <GemRing facets={RING} />
        <rect x="0" y="0" width="10" height="10" {...hairline()} />
      </>,
    );
    expect(worldGemTraces(html)).toEqual(['ring', 'hairline']);
  });

  it('does not mistake the scenery gem\'s own 2 px outline for a hairline', () => {
    expect(worldGemTraces(markupOf(<polygon points="0,0 10,0 10,10" stroke="#333" strokeWidth={2} />))).toEqual([]);
  });

  it('does not flag an empty ring: GemRing with no facets renders nothing at all', () => {
    expect(worldGemTraces(markupOf(<GemRing facets={[]} />))).toEqual([]);
  });

  it('sees a real renderer: a pylon is hairlined while `members` is on, bare when it is off', () => {
    const on = markupOf(pylon(pylonContext()));
    expect(worldGemTraces(on)).toEqual(['hairline']);

    let off = '';
    withSwitch('members', false, () => {
      off = markupOf(pylon(pylonContext()));
    });
    expect(worldGemTraces(off)).toEqual([]);
  });
});
