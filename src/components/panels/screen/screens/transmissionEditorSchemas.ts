import { labels } from '@/content';
import type { CoordsInputSchema, TextInputSchema } from '@/types/controls';

// The New Transmission editor's two inputs (docs/tasks/OFF_SCREEN_CONSOLE.md Task 4), moved from Foundry's config.
// Their own module beside the editor, so the component file exports components alone (fast refresh).

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
