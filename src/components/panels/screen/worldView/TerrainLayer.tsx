import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getLocaleNoiseMap } from '@/utils/noiseMaps';
import { getTerrainProfile } from '@/systems/terrainProfile';
import { getLighting, DAY_CYCLE_MEASURES } from '@/utils/lightingUtils';
import { applyColorShift } from '@/utils/colorUtils';
import colorTheme from '@/constants/colorTheme.json';

// ========================================
// TYPES
// ========================================

interface TerrainLayerProps {
  localeId: string;
  /** Which stepped profile to draw — mounted twice in `OceanScene` (docs/specs/
   *  WORLD_VIEW_DISTRICTS.md §1.3): `ridge` before the background factory group,
   *  `ground` after the mid/front gradient. */
  part: 'ridge' | 'ground';
  width: number;
  height: number;
}

// ========================================
// CONSTANTS
// ========================================

const NO_SHIFT = { hueShift: 0, satShift: 0 };

// ========================================
// COMPONENT
// ========================================

/**
 * One of the seabed terrain's two stepped polygons (`getTerrainProfile`), closed to the bottom
 * edge of the scene. Re-fills on the lighting tick only (`activeLocaleLocalTime`, same cadence
 * as `Factory.tsx`) — a pure function of the hour, so it never needs its own timer or a CSS
 * transition (docs/ANIMATION_SYSTEM.md's scene-layer rule).
 *
 * Fill (§1.3): `m` is the mean of the east/west lighting multipliers at the current hour.
 * Ridge: `shadowDepth` lightened by `1 + m × 1.2`. Ground: `body.shadow` lightened by `m × 0.9`.
 */
export function TerrainLayer({ localeId, part, width, height }: TerrainLayerProps) {
  const locale = useLocaleStore((s) => s.locales[localeId]);
  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);

  if (!locale) return null;

  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const profile = getTerrainProfile(localeId, noiseMap);
  const steps = part === 'ridge' ? profile.ridge : profile.ground;

  // Same lightMeasure derivation as Factory.tsx: activeLocaleLocalTime (0..24) mapped into the
  // 0..DAY_CYCLE_MEASURES cycle getLighting expects.
  const lightMeasure = (localTime / 24) * DAY_CYCLE_MEASURES;
  const cycleMeasure = lightMeasure % DAY_CYCLE_MEASURES;
  const { eastL, westL } = getLighting(cycleMeasure);
  const m = (eastL + westL) / 2;

  const fill = part === 'ridge'
    ? applyColorShift(colorTheme.shadowDepth, NO_SHIFT, 1 + m * 1.2)
    : applyColorShift(colorTheme.body.shadow, NO_SHIFT, m * 0.9);

  const points = [
    `${steps[0].x0},${steps[0].y0}`,
    ...steps.map((s) => `${s.x1},${s.y1}`),
    `${width},${height}`,
    `0,${height}`,
  ].join(' ');

  return <polygon data-terrain={part} points={points} fill={fill} />;
}
