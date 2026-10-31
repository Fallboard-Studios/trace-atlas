// ========================================
// IMPORTS
// ========================================
import type { WorldIdentity } from './seedBaseline';

// ========================================
// FUNCTIONS
// ========================================

/**
 * One name for a world (docs/specs/OFF_SCREEN.md assumption 8): `AS · (x, y)` for a world that is nothing but its
 * seed, or `<label> · AS (x, y)` when a save or preset name fronts it. The off screen's Current row, its readout
 * and Foundry's status line all read this, so the three agree byte-for-byte. Pure — names and numbers are data,
 * the punctuation is the only text here. The theme and aspects tail joins in the band-table module (Task 28).
 */
export function describeWorld(identity: Pick<WorldIdentity, 'attenuationStyleName' | 'coordinates'>, label?: string): string {
  const { attenuationStyleName, coordinates } = identity;
  // `${-0}` is "0": a negative zero never shows a sign.
  const plot = `(${coordinates.x}, ${coordinates.y})`;
  return label ? `${label} · ${attenuationStyleName} ${plot}` : `${attenuationStyleName} · ${plot}`;
}
