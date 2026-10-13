import { terrainRingOutline, terrainRingSkipEdge } from './terrainRingOutline';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getLocaleNoiseMap } from '@/utils/noiseMaps';
import { getTerrainProfile } from '@/systems/terrainProfile';
import { getLighting } from '@/utils/lightingUtils';
import { applyColorShift } from '@/utils/colorUtils';
import colorTheme from '@/constants/colorTheme.json';
import { GemRing } from '@/components/actors/material/GemRing';
import { WORLD_BEVEL_PX, WORLD_GEM, ringFacets, worldLightVector } from '@/components/actors/material/worldGemMaterial';

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

  // activeLocaleLocalTime (0..24) is the hour getLighting takes, as in Factory.tsx.
  const { eastL, westL } = getLighting(localTime);
  const m = (eastL + westL) / 2;

  const base = part === 'ridge' ? colorTheme.shadowDepth : colorTheme.body.shadow;
  const lightness = part === 'ridge' ? 1 + m * 1.2 : m * 0.9;
  const fill = applyColorShift(base, NO_SHIFT, lightness);

  // The world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.7): each 45 degree step and flat run of
  // the profile takes the hour's sun like a facet, in the polygon's own material. It is built on an
  // extended, simplified outline (the polygon as drawn cannot hold an 8 px bevel on real worlds, see
  // terrainRingOutline.ts) and carries no facet on the frame. The polygon and its points are untouched.
  const ring = ringFacets(
    terrainRingOutline(steps, width, height),
    WORLD_GEM.terrain ? WORLD_BEVEL_PX : 0,
    worldLightVector(eastL, westL),
    () => lightness,
    base,
    { skipEdge: terrainRingSkipEdge(width, height) },
  );

  const points = [
    `${steps[0].x0},${steps[0].y0}`,
    ...steps.map((s) => `${s.x1},${s.y1}`),
    `${width},${height}`,
    `0,${height}`,
  ].join(' ');

  return (
    <>
      <polygon data-terrain={part} points={points} fill={fill} />
      <GemRing facets={ring} />
    </>
  );
}
