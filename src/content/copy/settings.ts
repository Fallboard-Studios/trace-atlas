import type { ContentEntry } from '../types';

/**
 * Settings branch. Transcribed on 2026-09-30 (Task 5) from navTreeConfig.ts, SettingsContent.tsx
 * and audioRigConfig.ts's Audio Load schemas. Where the nav row and the control disagree today
 * (Robot Load vs Voice Limit, Effects Load vs Effects Limit) the entry takes the 2026-09-29 copy
 * pass's value — the nav's — and the control's old text is a conflict row in the inventory.
 */
export const settings = {
  'settings.root': {
    human: 'Settings',
    lore: 'Navigation',
    intro: {
      lore: 'Settings — configure your Trace Atlas terminal.',
      loreDescription: 'Adjust how much of the mesh your terminal can track at once, and where in the world you’re listening.',
      humanDescription: 'These are terminal-level settings, not fleet controls — how much your device can handle, which sector of the world you’re viewing, and where your saved sessions live.',
    },
  },
  'settings.quality': {
    human: 'Audio Quality',
    lore: 'Trace Capacity',
    intro: {
      lore: 'Audio Quality — tune your terminal’s processing load.',
      loreDescription: 'Meridia Power Group’s Perpetualish Battery Packs keep probes running, but your terminal has its own limits on how much it can process at once.',
      humanDescription: 'Robot Load limits how many probes can play sound at the same time. Effects Load limits how many effects — like LFOs — can run at once. Lower these if the app stutters or sounds glitchy on your device.',
    },
  },
  'settings.quality.audioLoad': { human: 'Audio Load', lore: 'ACOUSTIC LOAD MANAGEMENT' },
  'settings.quality.preset': {
    human: 'Preset',
    lore: 'ACOUSTIC LOAD PROTOCOL',
    options: {
      light: { human: 'Light' },
      standard: { human: 'Standard' },
      full: { human: 'Full' },
    },
  },
  'settings.quality.robotLoad': { human: 'Voice Limit', lore: 'Fleet Size', unit: '%' },
  'settings.quality.effectsLoad': { human: 'Effects Limit', lore: 'Trace Budget', unit: '%' },
  'settings.seeds': {
    human: 'Seeds',
    lore: 'Foundry',
    intro: {
      lore: 'Seeds — choose which sector you’re tracking.',
      loreDescription: 'Every sector of the world has its own resource signature — Attenuation Style sets the terrain, Coordinates set the location.',
      humanDescription: 'Attenuation Style changes how sound fades and colors with distance in this world — it’s a starting seed, not a live audio effect, so changing it reshapes the whole locale. Coordinates set which specific spot on that terrain you’re viewing. Together they determine which probes, companies, and melodies you’ll see.',
    },
  },
  'settings.sessions': {
    human: 'Save & Share',
    lore: 'Comms',
    intro: {
      lore: 'Save & Share — keep a record, send it along.',
      loreDescription: 'Archive a mesh configuration to Meridia’s own storage, or transmit it directly to another terminal.',
      humanDescription: 'Save your current setup — every probe, company, and Fleet Params setting — under a name you choose, and load it again later. Share generates a link that hands your exact setup to anyone who opens it, no saving required on their end.',
    },
  },
} as const satisfies Record<string, ContentEntry>;
