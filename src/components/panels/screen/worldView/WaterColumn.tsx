import { useUIStore } from '@/stores/uiStore';
import { getLighting, getNightDepth, DAY_CYCLE_MEASURES } from '@/utils/lightingUtils';
import { lerp } from '@/utils/math';

// ========================================
// TYPES
// ========================================

interface WaterColumnProps {
  localeId: string;
  width: number;
  height: number;
}

// ========================================
// CONSTANTS
// ========================================

// §1.5: the surface glow is omitted once the scene is dark enough that it would barely show —
// cheaper than rendering a near-zero-opacity ellipse every tick.
const GLOW_OMIT_THRESHOLD = 0.2;

// ========================================
// COMPONENT
// ========================================

/**
 * The scene's background water column (docs/specs/WORLD_VIEW_DISTRICTS.md §1.5): a vertical
 * gradient rect plus a surface glow ellipse, replacing the old flat `backgroundColor` rect.
 * Re-fills on the lighting tick only, same cadence and rounding as `TerrainLayer`.
 *
 * `d = 1 - nightDepth` (0 at deepest night, 1 at noon). Gradient stops and glow opacity are
 * rounded to whole percent so they step once every ~2 s like the facades, instead of churning on
 * every sub-percent change in the continuous lighting curve.
 */
export function WaterColumn({ localeId, width, height }: WaterColumnProps) {
  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);

  const lightMeasure = (localTime / 24) * DAY_CYCLE_MEASURES;
  const cycleMeasure = lightMeasure % DAY_CYCLE_MEASURES;
  const { eastL, westL } = getLighting(cycleMeasure);
  const d = 1 - getNightDepth(eastL, westL);

  const topL = Math.round(lerp(8, 30, d));
  const bottomL = Math.round(lerp(4, 12, d));
  const glowOpacity = Math.round(0.08 * d * 100) / 100;
  const glowCx = lerp(300, 1620, localTime / 24);

  const gradientId = `water-${localeId}`;

  return (
    <g data-water={localeId}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={`hsl(200, 45%, ${topL}%)`} />
          <stop offset="100%" stopColor={`hsl(230, 45%, ${bottomL}%)`} />
        </linearGradient>
      </defs>
      <rect fill={`url(#${gradientId})`} width={width} height={height} />
      {d > GLOW_OMIT_THRESHOLD && (
        <ellipse cx={glowCx} cy={60} rx={360} ry={70} fill="hsl(192, 50%, 70%)" opacity={glowOpacity} />
      )}
    </g>
  );
}
