import type { ContentEntry } from '../types';

/**
 * Sector Settings / seeds — the controls, not the preset *names* (those are data,
 * docs/specs/CONTENT_LAYER.md §1.4). Transcribed on 2026-09-30 (Task 5) from
 * sectorSettingsConfig.ts, SectorSettingsDrawer.tsx, CoordsInput.tsx and navTreeConfig.ts. Where
 * the nav row and the control disagree (Attenuation Style vs Atmosphere, Coordinates vs Location)
 * the entry takes the 2026-09-29 copy pass's value — the nav's — and the control's old text is a
 * conflict row in the inventory. `[c]` strings are verbatim placeholders for the review gate.
 */
export const sector = {
  'sector.attenuationStyle': { human: 'Atmosphere', lore: 'Attenuation Style', placeholder: 'Enter a new attenuation style…' },
  'sector.coords': { human: 'Location', lore: 'Atlas Vector' },
  'sector.coords.x': { human: 'X', lore: 'LATERAL VECTOR [c]' },
  'sector.coords.y': { human: 'Y', lore: 'VERTICAL VECTOR [c]' },
  'sector.retransmit': { human: 'Retransmit', lore: 'RETRANSMIT' },
  'sector.status': { human: 'Current Sector', lore: 'ACTIVE TRANSMISSION' },
  'sector.random.attenuationStyle': { human: 'Random', lore: 'STOCHASTIC SEED [c]' },
  'sector.random.coords': { human: 'Random', lore: 'STOCHASTIC VECTOR [c]' },
  /** A preset button's visible label is the preset's own name (data, filled via `template`);
   *  only the lore caption is copy. `human` is never rendered. */
  'sector.preset.attenuationStyle': { human: 'Preset', lore: 'ATTENUATION PRESET [c]', template: '{name}' },
  'sector.preset.coords': { human: 'Preset', lore: 'PLOT PRESET [c]', template: '{name}' },
} as const satisfies Record<string, ContentEntry>;
