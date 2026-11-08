// ========================================
// IMPORTS
// ========================================
import type { ButtonSchema, DualLabelSchema } from '../types/controls';
import { labels } from '@/content';

// ========================================
// SCHEMAS
// ========================================

// The style name and coordinates inputs moved to the off screen's New Transmission editor
// (docs/tasks/OFF_SCREEN_CONSOLE.md Task 4); re-exported for Foundry until it and this file go (Task 15).
export { ATTENUATION_STYLE_SCHEMA, COORDS_SCHEMA } from '@/components/panels/screen/screens/transmissionEditorSchemas';

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
