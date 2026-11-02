// ========================================
// IMPORTS
// ========================================
import type { TextInputSchema, CoordsInputSchema, ButtonSchema, DualLabelSchema } from '../types/controls';
import { labels } from '@/content';

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

/** Copies the live world's short link (docs/specs/SHORT_WORLD_LINK.md assumption 9). */
export const COPY_LINK_SCHEMA: ButtonSchema = {
  id: 'sectorSettings.copyLink',
  type: 'button',
  ...labels('sector.copyLink'),
};

export const STATUS_HEADER_SCHEMA: DualLabelSchema = {
  id: 'sectorSettings.status',
  type: 'dualLabel',
  ...labels('sector.status'),
};

// The hand-curated Attenuation Style and coordinate shortcut rows that used to follow here were deleted with the
// off screen's presets-as-links (docs/specs/OFF_SCREEN.md assumption 13): a curated world is a Transmission preset
// now, not a field-filler on the Seeds tab.
