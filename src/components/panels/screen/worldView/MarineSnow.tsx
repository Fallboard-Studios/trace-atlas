import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getLocaleNoiseMap } from '@/utils/noiseMaps';
import { getSeededVal } from '@/utils/getSeededVal';
import { getLighting, getNightDepth, DAY_CYCLE_MEASURES } from '@/utils/lightingUtils';
import { hslToString } from '@/utils/colorUtils';
import { lerp } from '@/utils/math';
import { WORLD_BOUNDS } from '@/constants/sceneDepth';
import colorTheme from '@/constants/colorTheme.json';

// ========================================
// TYPES
// ========================================

interface MarineSnowProps {
  localeId: string;
}

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.12)
// ========================================

// "140 circles r 1.2-3 at seeded positions ... opacity (0.08-0.3)".
export const SNOW_COUNT = 140;
const RADIUS_MIN = 1.2;
const RADIUS_MAX = 3;
const OPACITY_MIN = 0.08;
const OPACITY_MAX = 0.3;

// "lerp(0.6, 1, 1 - nd)" — night floor and day ceiling of the opacity scale.
const NIGHT_OPACITY_SCALE = 0.6;
const DAY_OPACITY_SCALE = 1;

// ========================================
// COMPONENT
// ========================================

/**
 * Marine snow (docs/specs/WORLD_VIEW_DISTRICTS.md §1.12): 140 small circles drifting-dust reads,
 * seeded per locale, in the front static layer after the foreground row. Static on the lighting
 * tick, same cadence as `LightShafts`/`WaterColumn` — no timer, no CSS transition; "drifting it is
 * out of scope" per spec.
 */
export function MarineSnow({ localeId }: MarineSnowProps) {
  const locale = useLocaleStore((s) => s.locales[localeId]);
  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);

  if (!locale) return null;

  const lightMeasure = (localTime / 24) * DAY_CYCLE_MEASURES;
  const cycleMeasure = lightMeasure % DAY_CYCLE_MEASURES;
  const { eastL, westL } = getLighting(cycleMeasure);
  const nightDepth = getNightDepth(eastL, westL);
  const opacityScale = lerp(NIGHT_OPACITY_SCALE, DAY_OPACITY_SCALE, 1 - nightDepth);

  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const highlight = hslToString(colorTheme.shell.highlight);

  return (
    <g data-atmos="snow">
      {Array.from({ length: SNOW_COUNT }, (_, i) => {
        const x = getSeededVal(noiseMap, 'atmos.snow.x', i, 0, WORLD_BOUNDS.width);
        const y = getSeededVal(noiseMap, 'atmos.snow.y', i, 0, WORLD_BOUNDS.height);
        const r = getSeededVal(noiseMap, 'atmos.snow.r', i, RADIUS_MIN, RADIUS_MAX);
        const baseOpacity = getSeededVal(noiseMap, 'atmos.snow.a', i, OPACITY_MIN, OPACITY_MAX);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill={highlight}
            opacity={baseOpacity * opacityScale}
          />
        );
      })}
    </g>
  );
}
