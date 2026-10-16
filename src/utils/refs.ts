// ========================================
// TYPES
// ========================================
/**
 * Any element a ref can name: an SVG group (a station fragment, the body of a robot before its
 * mover) or an HTML wrapper (a robot's mover, the dissolve slot) — docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.4.
 */
export type RefElement = SVGElement | HTMLElement;

type RefMap = Map<string, RefElement>;

// ========================================
// STATE
// ========================================
const refs: RefMap = new Map();

// ========================================
// EXPORTS
// ========================================

/**
 * Store a reference to an SVG or HTML element for GSAP animations
 * Key format: 'robot-{id}', 'swim-{id}', etc.
 */
export function setRef(key: string, element: RefElement): void {
  refs.set(key, element);
}

/**
 * Get a stored reference to an SVG or HTML element
 * Returns undefined if not found
 */
export function getRef(key: string): RefElement | undefined {
  return refs.get(key);
}

/**
 * Remove a reference (for cleanup)
 */
export function deleteRef(key: string): void {
  refs.delete(key);
}

/**
 * Clear all references (for testing/reset)
 */
export function clearRefs(): void {
  refs.clear();
}
