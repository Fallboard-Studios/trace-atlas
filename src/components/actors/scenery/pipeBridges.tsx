import React from 'react';
import Alea from 'alea';

import colorTheme from '../../../constants/colorTheme.json';
import { hslToString } from '../../../utils/colorUtils';
import { selectVariantFromSeed, VARIANT_CONF } from '../factoryVariants';
import { calcSilhouetteSize } from '../silhouetteUtils';
import { getRecipeRow, DEFAULT_FACTORY_ROW } from '../../../systems/factoryPlacementSystem';
import type { Actor } from '../../../types/Actor';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 "Pipe bridges")
// ========================================

const MIN_GAP = 60;
const MAX_GAP = 260;
const BAR_H = 10;
/** "spanning the gap (+10 each side)". */
const BAR_EDGE_INSET = 10;
/** "`max(roofA, roofB) + 40 + seed × 60`" against the HIGHER (taller, smaller-y) of the two
 *  roofs — see the reading note below. */
const BAR_OFFSET_MIN = 40;
const BAR_OFFSET_RANGE = 60;
const POST_W = 8;

/** This family's one fixed colour — no lighting tick, no stored shift (§1.8, structural). */
const BAR_FILL = hslToString(colorTheme.shell.shadow);

interface FactoryGeometry {
  left: number;
  right: number;
  roofY: number;
  baseY: number;
}

/** Same silhouette derivation `factoryWidthAt` uses, plus the height it doesn't return. */
function geometryOf(actor: Actor): FactoryGeometry {
  const district = actor.config?.district ?? 'dense';
  const row = actor.config?.row ?? DEFAULT_FACTORY_ROW;
  const available = getRecipeRow(district, row)?.variants;
  const { variant, noiseValue } = selectVariantFromSeed(actor.id, actor.position.x, row, available);
  const { width, height } = calcSilhouetteSize(noiseValue, VARIANT_CONF[variant].sizeRange);
  const scaleX = actor.scaleX ?? 1;
  const scaleY = actor.scaleY ?? 1;
  return {
    left: actor.position.x,
    right: actor.position.x + width * scaleX,
    roofY: actor.position.y - height * scaleY,
    baseY: actor.position.y,
  };
}

interface PipeBridgesProps {
  /** One depth group's factory actors (not scenery) — `OceanScene` passes each depth's own list. */
  factories: Actor[];
}

/**
 * Derived pipe bridges (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9, roadmap Phase 42 Task 15): for
 * each pair of x-adjacent factories in the same recipe row whose facade gap is 60–260, a bar
 * spanning the gap (+10 each side) and a post down to the lower of the two bases. No actor is
 * created — this is a pure render-time derivation from the factories already placed.
 *
 * Reading note on "`max(roofA, roofB) + 40 + seed × 60`" (spec §1.9): the acceptance criteria
 * (docs/tasks/WORLD_VIEW_DISTRICTS.md Task 15) call this "+40..+100 of the HIGHER roof" — the
 * taller building, whose `roofY` is the SMALLER pixel value in this y-down scene. Taking the
 * spec's "`max`" literally over raw `roofY`s would instead pick the shorter building's roof.
 * This implementation follows the acceptance criteria (the testable source of truth): `barY` is
 * `Math.min(roofA, roofB) + 40 + seed × 60`, i.e. just below the taller roof, bridging across to
 * the shorter one. The post then runs from the bar down to `Math.max(baseA, baseB)` — the
 * physically lower base (ground-lock means bases can differ slightly even within one depth).
 */
export const PipeBridges: React.FC<PipeBridgesProps> = ({ factories }) => {
  const byRow = new Map<number, Actor[]>();
  for (const actor of factories) {
    const row = actor.config?.row ?? DEFAULT_FACTORY_ROW;
    const bucket = byRow.get(row);
    if (bucket) bucket.push(actor);
    else byRow.set(row, [actor]);
  }

  const bridges: React.ReactElement[] = [];
  for (const [row, rowFactories] of byRow) {
    const sorted = [...rowFactories].sort((a, b) => a.position.x - b.position.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const geomA = geometryOf(a);
      const geomB = geometryOf(b);
      const gap = geomB.left - geomA.right;
      if (gap < MIN_GAP || gap > MAX_GAP) continue;

      const seed = Alea(`${a.id}:${b.id}`)();
      const higherRoofY = Math.min(geomA.roofY, geomB.roofY);
      const barY = higherRoofY + BAR_OFFSET_MIN + seed * BAR_OFFSET_RANGE;
      const barX = geomA.right - BAR_EDGE_INSET;
      const barWidth = gap + BAR_EDGE_INSET * 2;
      const postX = barX + barWidth / 2 - POST_W / 2;
      const lowerBaseY = Math.max(geomA.baseY, geomB.baseY);
      const postHeight = Math.max(0, lowerBaseY - (barY + BAR_H));

      bridges.push(
        <g key={`${row}-${a.id}-${b.id}`} data-pipe-bridge="">
          <rect data-pipe-bridge-part="bar" x={barX} y={barY} width={barWidth} height={BAR_H} fill={BAR_FILL} />
          <rect data-pipe-bridge-part="post" x={postX} y={barY + BAR_H} width={POST_W} height={postHeight} fill={BAR_FILL} />
        </g>,
      );
    }
  }

  return <g data-scenery="pipe-bridges">{bridges}</g>;
};
