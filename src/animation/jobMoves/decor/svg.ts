// ========================================
// svg (docs/specs/JOB_DECORATION.md §4)
// ========================================
// The one way a decoration makes a node: `createElementNS` with its attributes, so each builder
// reads as a list of shapes. The nodes are made once per run and only have attributes written
// afterwards. No SVG filter elements anywhere in a decoration (spec Assumption 6).

// ========================================
// CONSTANTS
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';

// ========================================
// EXPORTS
// ========================================
/** A new SVG element with `attrs` set, not yet in the document. */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  return el;
}
