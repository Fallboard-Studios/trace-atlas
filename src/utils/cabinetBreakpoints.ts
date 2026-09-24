/**
 * Oblique Cabinetry's viewport-width breakpoint tiers — the sole source of
 * truth for box height, used both by the wall geometry math
 * (cabinetGeometry.ts, via useCabinetBoxHeight) and by CSS layout: the
 * resolved height is applied as an inline --cabinet-box-height custom
 * property on CabinetBox's wrapper (CabinetBox.tsx), not redeclared in CSS
 * via @media rules — that redundant copy was removed after going stale in
 * prose more than once as this value was tuned. See
 * docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1.3/§7.
 */
export const CABINET_BREAKPOINT_MOBILE_MAX = 639;
export const CABINET_BREAKPOINT_TABLET_MAX = 1023;

export const CABINET_BOX_HEIGHT = {
  mobile: 32,
  tablet: 40,
  desktop: 48,
} as const;

/**
 * Voxel-track box gap (roadmap Phase 11.1.3) — the same 3 breakpoint tiers
 * CABINET_BOX_HEIGHT already uses, resolved by the same shared tier
 * detection (useCabinetTier, useCabinetBoxHeight.ts) rather than a second,
 * independently hand-synced set of matchMedia listeners. See
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.4.
 */
export const CABINET_VOXEL_GAP = {
  mobile: 8,
  tablet: 10,
  desktop: 12,
} as const;

export type CabinetTier = keyof typeof CABINET_BOX_HEIGHT;
