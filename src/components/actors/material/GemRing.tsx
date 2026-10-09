// ========================================
// GEM RING (docs/specs/WORLD_GEM_MATERIAL.md §1.2)
// ========================================
// Draw-only: renders the facet paths worldGemMaterial.ts's `ringFacets` computed. It never
// computes a tone, a point or a depth, so no renderer can drift from the material. Plain
// attributes only — no `style`, no transition (roadmap 17.2.5): a ring repaints on the lighting
// tick and moves with nothing.

// ========================================
// IMPORTS
// ========================================
import { RING_FACET_STROKE_PX, type RingFacet } from './worldGemMaterial';

// ========================================
// COMPONENT
// ========================================
export interface GemRingProps {
  facets: readonly RingFacet[];
  /** The item's own scale (a factory's 0.9-1.1); everything else is 1. */
  scale?: number;
}

/**
 * One `<g data-gem="ring">` of merged facet paths, or null when there are none — an empty group
 * would break the "bevel 0 renders byte-for-byte as today" promise. `data-gem="ring"` is the hook
 * the 90/45 test helper uses to skip the bisector edges of a ring (spec assumption 5).
 *
 * Keyed by index, not by fill: the fills change on every lighting tick, and an index key lets
 * React update the same path elements instead of replacing them.
 */
export function GemRing({ facets, scale = 1 }: GemRingProps) {
  if (facets.length === 0) return null;
  // Two decimals: a factory scale of 0.94 would otherwise write 0.5640000000000001.
  const strokeWidth = Number((RING_FACET_STROKE_PX * scale).toFixed(2));
  return (
    <g data-gem="ring">
      {facets.map(({ fill, stroke, d }, i) => (
        <path key={i} d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      ))}
    </g>
  );
}
