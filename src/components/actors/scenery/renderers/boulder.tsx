import colorTheme from '../../../../constants/colorTheme.json';
import { clamp } from '../../../../utils/colorUtils';
import { GemShape } from '../gemShape';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 boulder row)
// ========================================

/** Successive gems overlap: each advances by 0.75x the shared width. */
const GEM_SPACING_FRAC = 0.75;
/** Boulders are desaturated rock, not an accent colour: body.base with sat forced to 12 before
 *  the per-actor +-6 satShift. */
const BOULDER_BASE_SAT = 12;
/** Every gem's bottom edge sits 8 below the item's base y. */
const BOULDER_SUNK = 8;

/**
 * Boulder (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): 1-3 unlit gems in a neutral rock tone,
 * clustered and half-sunk into the seabed. Never lit — `GemShape` is always called with
 * `lit={false}`, so its glow tracks the depth cap, never nightDepth.
 */
export const boulder: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.boulder;
  if (!p) return <g data-scenery="boulder" />;
  const { w, hFrac, count, hueShift, satShift } = p;

  const h = w * hFrac;
  const base = {
    h: (colorTheme.body.base.h + hueShift + 360) % 360,
    s: clamp(BOULDER_BASE_SAT + satShift, 0, 100),
    l: colorTheme.body.base.l,
  };

  const spacing = w * GEM_SPACING_FRAC;
  const totalSpan = w + (count - 1) * spacing;
  const firstCx = x - totalSpan / 2 + w / 2;
  const cy = y + BOULDER_SUNK - h / 2;

  return (
    <g data-scenery="boulder">
      {Array.from({ length: count }, (_, i) => (
        <GemShape
          key={i}
          cx={firstCx + i * spacing}
          cy={cy}
          w={w}
          h={h}
          base={base}
          lit={false}
          eastL={eastL}
          westL={westL}
          nightDepth={nightDepth}
          cap={cap}
        />
      ))}
    </g>
  );
};
