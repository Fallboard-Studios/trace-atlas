import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getLocaleNoiseMap } from '@/utils/noiseMaps';
import { getSeededVal } from '@/utils/getSeededVal';
import { getLighting, getNightDepth, DAY_CYCLE_MEASURES } from '@/utils/lightingUtils';
import { hslToString } from '@/utils/colorUtils';
import colorTheme from '@/constants/colorTheme.json';

// ========================================
// TYPES
// ========================================

interface LightShaftsProps {
  localeId: string;
}

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.12)
// ========================================

// "3-5 polygons" — one draw mapped into the 3 buckets 3/4/5, same clamp pattern as
// districts.ts's pickDistrict (`min(bucketCount - 1, floor(v * bucketCount))`).
const SHAFT_COUNT_MIN = 3;
const SHAFT_COUNT_BUCKETS = 3;

// "each x -200..1920, width 50-160, depth 420-760".
const SHAFT_X_MIN = -200;
const SHAFT_X_MAX = 1920;
const SHAFT_WIDTH_MIN = 50;
const SHAFT_WIDTH_MAX = 160;
const SHAFT_DEPTH_MIN = 420;
const SHAFT_DEPTH_MAX = 760;

// "opacity 0.11 x (1 - nd) ... omitted entirely when that opacity < 0.005".
const OPACITY_SCALE = 0.11;
const OPACITY_OMIT_THRESHOLD = 0.005;

// ========================================
// COMPONENT
// ========================================

/**
 * Surface light shafts (docs/specs/WORLD_VIEW_DISTRICTS.md §1.12): 3-5 polygons from the top
 * edge, one vertical edge and one 45-degree edge each (a shaft falling straight on one side and
 * raking outward on the other, in the shared direction seeded once per locale), filled by a
 * vertical gradient from `glass.base` fading to transparent. Static back-layer content on the
 * lighting tick, same cadence as `WaterColumn`/`TerrainLayer` — no timer, no CSS transition.
 *
 * Renders nothing once the gradient's own top-stop opacity would be too faint to read (< 0.005),
 * rather than paying for an invisible `<defs>`/`<polygon>` set every tick.
 */
export function LightShafts({ localeId }: LightShaftsProps) {
  const locale = useLocaleStore((s) => s.locales[localeId]);
  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);

  if (!locale) return null;

  const lightMeasure = (localTime / 24) * DAY_CYCLE_MEASURES;
  const cycleMeasure = lightMeasure % DAY_CYCLE_MEASURES;
  const { eastL, westL } = getLighting(cycleMeasure);
  const nightDepth = getNightDepth(eastL, westL);

  const topOpacity = OPACITY_SCALE * (1 - nightDepth);
  if (topOpacity < OPACITY_OMIT_THRESHOLD) return null;

  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);

  const countBucket = Math.min(
    SHAFT_COUNT_BUCKETS - 1,
    Math.floor(getSeededVal(noiseMap, 'atmos.shaft.count', 0, 0, 1) * SHAFT_COUNT_BUCKETS),
  );
  const count = SHAFT_COUNT_MIN + countBucket;
  const dir = getSeededVal(noiseMap, 'atmos.shaft.dir', 0, 0, 1) < 0.5 ? -1 : 1;

  const gradientId = `shaft-${localeId}`;
  const glassBase = hslToString(colorTheme.glass.base);

  return (
    <g data-atmos="shafts">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={glassBase} stopOpacity={topOpacity} />
          <stop offset="100%" stopColor={glassBase} stopOpacity={0} />
        </linearGradient>
      </defs>
      {Array.from({ length: count }, (_, i) => {
        const x = getSeededVal(noiseMap, 'atmos.shaft.x', i, SHAFT_X_MIN, SHAFT_X_MAX);
        const w = getSeededVal(noiseMap, 'atmos.shaft.w', i, SHAFT_WIDTH_MIN, SHAFT_WIDTH_MAX);
        const depth = getSeededVal(noiseMap, 'atmos.shaft.depth', i, SHAFT_DEPTH_MIN, SHAFT_DEPTH_MAX);
        const points = [
          `${x},0`,
          `${x + w},0`,
          `${x + w + dir * depth},${depth}`,
          `${x},${depth}`,
        ].join(' ');
        return <polygon key={i} points={points} fill={`url(#${gradientId})`} />;
      })}
    </g>
  );
}
