import React, { useMemo } from 'react';

import type { Actor } from '../../types/Actor';
import BubbleStream from './BubbleStream';
import { getActorBubbleProps } from './factoryBubbleProps';
import type { FactoryBubbleProps } from './factoryBubbleProps';

interface BubbleLayerProps {
  /** Every actor in the locale, factories and scenery alike, all rows — the layer filters to the
   *  bubble-eligible ones (factories, per `isBubbleEligible`, and `vent` scenery, §1.11). */
  actors: Actor[];
  /** Locale-wide bubble-eligible building count (see BubbleStream's `totalBuildings`). */
  totalBuildings: number;
}

/**
 * Every building's bubble stream, each a strip mover of its own (roadmap 17.2.5; Phase 53 Task 18).
 *
 * A bare fragment of `BubbleStream`s, rendered by OceanScene as children of its stage: each stream
 * is a small `div.mover.mover--bubbles` in the `bubbles` slot, a compositor layer separate from the
 * static factory skyline, so a rising bubble's transform writes repaint only its own strip. Bubbles
 * from every row share the one slot: they rise behind the robots and below the foreground
 * factories, where the old per-row placement put foreground-row bubbles in front of the robots. Vents
 * (roadmap Phase 42 Task 17, §1.11) bubble the same way — `getActorBubbleProps` filters every
 * other scenery kind out via its own `null` return.
 */
const BubbleLayerInner: React.FC<BubbleLayerProps> = ({ actors, totalBuildings }) => {
  const streams = useMemo(
    () => actors.map(getActorBubbleProps).filter((p): p is FactoryBubbleProps => p !== null),
    [actors],
  );

  return (
    <>
      {streams.map((p) => (
        <BubbleStream
          key={p.actorId}
          actorId={p.actorId}
          ventX={p.ventX}
          ventY={p.ventY}
          seed={p.seed}
          isActive={p.isActive}
          bodyHue={p.bodyHue}
          depthScale={p.depthScale}
          totalBuildings={totalBuildings}
        />
      ))}
    </>
  );
};

/** Memoized: its inputs only change when a factory is added/removed or goes offline/online. */
export const BubbleLayer = React.memo(BubbleLayerInner);
export default BubbleLayer;
