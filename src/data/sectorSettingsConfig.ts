// ========================================
// IMPORTS
// ========================================
import type { TextInputSchema, CoordsInputSchema, ButtonSchema, DualLabelSchema } from '../types/controls';
import { labels } from '@/content';

// ========================================
// TYPES
// ========================================

/** One preset entry — a human-facing label paired with the value clicking it
 *  fills into the relevant field(s). Clicking a preset ONLY populates its
 *  field(s); it never calls retransmitWorld itself — the user still has to
 *  press Retransmit separately. */
export interface SectorPreset<T> {
  /** The preset's own name — a value the button fills in, not copy (docs/specs/CONTENT_LAYER.md §1.4). */
  name: string;
  value: T;
}

// ========================================
// SCHEMAS
// ========================================

export const ATTENUATION_STYLE_SCHEMA: TextInputSchema = {
  id: 'sectorSettings.planetName',
  type: 'textInput',
  ...labels('sector.attenuationStyle'),
  // Otherwise unbounded end-to-end — stored in state, hashed into a seed
  // (deriveAttenuationStyleSeed), and rendered in the status line. 128 is generous for
  // a lore-flavored name while ruling out pathological input.
  maxLength: 128,
};

export const COORDS_SCHEMA: CoordsInputSchema = {
  id: 'sectorSettings.coordinates',
  type: 'coordsInput',
  ...labels('sector.coords'),
};

export const RETRANSMIT_SCHEMA: ButtonSchema = {
  id: 'sectorSettings.retransmit',
  type: 'button',
  ...labels('sector.retransmit'),
};

export const STATUS_HEADER_SCHEMA: DualLabelSchema = {
  id: 'sectorSettings.status',
  type: 'dualLabel',
  ...labels('sector.status'),
};

// ========================================
// PRESETS
// ========================================

/** Hand-curated, lore-flavored Attenuation Style name presets — static data, not
 *  user-saved favorites. */
export const ATTENUATION_STYLE_PRESETS: SectorPreset<string>[] = [
  { name: 'Kryndara', value: 'Kryndara' },
  { name: 'Vessport Null', value: 'Vessport Null' },
  { name: 'Halcyon Drift', value: 'Halcyon Drift' },
  { name: 'The Rusting', value: 'The Rusting' },
];

/** Hand-curated, interesting coordinate-pair presets. 'Null Basin' — (0, 0) —
 *  is included deliberately: the single worst-case coordinate from the
 *  pre-decoupling dead-zone bug, now safe to offer as an ordinary preset. */
export const COORDINATE_PRESETS: SectorPreset<{ x: number; y: number }>[] = [
  { name: 'The Trench', value: { x: -42, y: 108 } },
  { name: 'Shallow Reach', value: { x: 7, y: 3 } },
  { name: 'Far Shoal', value: { x: 219, y: -64 } },
  { name: 'Null Basin', value: { x: 0, y: 0 } },
];
