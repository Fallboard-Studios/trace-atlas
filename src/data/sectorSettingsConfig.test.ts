// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  ATTENUATION_STYLE_SCHEMA,
  COORDS_SCHEMA,
  RETRANSMIT_SCHEMA,
  STATUS_HEADER_SCHEMA,
  ATTENUATION_STYLE_PRESETS,
  COORDINATE_PRESETS,
} from './sectorSettingsConfig';
import * as sectorSettingsConfigModule from './sectorSettingsConfig';
import { CONTENT } from '@/content';

// ========================================
// TESTS
// ========================================

describe('sectorSettingsConfig', () => {
  describe('schemas', () => {
    it('ATTENUATION_STYLE_SCHEMA is a textInput with both label fields populated', () => {
      expect(ATTENUATION_STYLE_SCHEMA.type).toBe('textInput');
      expect(ATTENUATION_STYLE_SCHEMA.loreLabel).toBeTruthy();
      expect(ATTENUATION_STYLE_SCHEMA.humanLabel).toBeTruthy();
    });

    it('ATTENUATION_STYLE_SCHEMA caps entry length — unbounded end-to-end otherwise (stored in state, hashed into a seed, rendered in the status line)', () => {
      expect(ATTENUATION_STYLE_SCHEMA.maxLength).toBe(128);
    });

    it('ATTENUATION_STYLE_SCHEMA uses Attenuation Style copy, per docs/specs/ATTENUATION_STYLE.md §4', () => {
      expect(ATTENUATION_STYLE_SCHEMA.loreLabel).toBe(CONTENT['sector.attenuationStyle'].lore);
      expect(ATTENUATION_STYLE_SCHEMA.humanLabel).toBe(CONTENT['sector.attenuationStyle'].human);
      expect(ATTENUATION_STYLE_SCHEMA.placeholder).toBe(CONTENT['sector.attenuationStyle'].placeholder);
    });

    it('COORDS_SCHEMA is a coordsInput with both label fields populated', () => {
      expect(COORDS_SCHEMA.type).toBe('coordsInput');
      expect(COORDS_SCHEMA.loreLabel).toBeTruthy();
      expect(COORDS_SCHEMA.humanLabel).toBeTruthy();
    });

    it('RETRANSMIT_SCHEMA is a button with both label fields populated', () => {
      expect(RETRANSMIT_SCHEMA.type).toBe('button');
      expect(RETRANSMIT_SCHEMA.loreLabel).toBeTruthy();
      expect(RETRANSMIT_SCHEMA.humanLabel).toBeTruthy();
    });

    it('STATUS_HEADER_SCHEMA is a dualLabel with both label fields populated', () => {
      expect(STATUS_HEADER_SCHEMA.type).toBe('dualLabel');
      expect(STATUS_HEADER_SCHEMA.loreLabel).toBeTruthy();
      expect(STATUS_HEADER_SCHEMA.humanLabel).toBeTruthy();
    });

    it('every schema has a distinct, non-empty id', () => {
      const ids = [ATTENUATION_STYLE_SCHEMA, COORDS_SCHEMA, RETRANSMIT_SCHEMA, STATUS_HEADER_SCHEMA].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toBeTruthy();
    });

    it('no longer exports AUDIO_SWELLS_ENABLED_SCHEMA — replaced by audioRigConfig.ts\'s PING_VARIANCE_AUTOMATION_SCHEMA (docs/tasks/PING-VARIANCE-AUTOMATION.md Task 7)', () => {
      expect('AUDIO_SWELLS_ENABLED_SCHEMA' in sectorSettingsConfigModule).toBe(false);
    });
  });

  describe('ATTENUATION_STYLE_PRESETS', () => {
    it('has exactly 4 entries', () => {
      expect(ATTENUATION_STYLE_PRESETS).toHaveLength(4);
    });

    it('every entry has a non-empty label and a non-empty string value', () => {
      for (const preset of ATTENUATION_STYLE_PRESETS) {
        expect(preset.name).toBeTruthy();
        expect(typeof preset.value).toBe('string');
        expect(preset.value.length).toBeGreaterThan(0);
      }
    });
  });

  describe('COORDINATE_PRESETS', () => {
    it('has exactly 4 entries', () => {
      expect(COORDINATE_PRESETS).toHaveLength(4);
    });

    it('every entry has a non-empty label and integer x/y values', () => {
      for (const preset of COORDINATE_PRESETS) {
        expect(preset.name).toBeTruthy();
        expect(Number.isInteger(preset.value.x)).toBe(true);
        expect(Number.isInteger(preset.value.y)).toBe(true);
      }
    });

    it('includes the (0, 0) "Null Basin" preset — the pre-decoupling dead-zone worst case, now safe', () => {
      const nullBasin = COORDINATE_PRESETS.find((p) => p.value.x === 0 && p.value.y === 0);
      expect(nullBasin).toBeDefined();
      expect(nullBasin?.name).toBe('Null Basin');
    });
  });
});

describe('sectorSettingsConfig reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 8)', () => {
  it('carries no copy literal of its own; preset names are data under `name`', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, 'sectorSettingsConfig.ts'), 'utf8');
    expect(src).not.toMatch(/(loreLabel|humanLabel|unit|placeholder)\s*:\s*['"`]/);
    expect(src).not.toMatch(/\blabel\s*:/);
    expect(ATTENUATION_STYLE_PRESETS[0]).toHaveProperty('name');
  });
  it('labels equal CONTENT (the nav-row text where nav and control used to disagree)', async () => {
    const { CONTENT } = await import('@/content');
    expect(ATTENUATION_STYLE_SCHEMA.humanLabel).toBe(CONTENT['sector.attenuationStyle'].human);
    expect(ATTENUATION_STYLE_SCHEMA.placeholder).toBe(CONTENT['sector.attenuationStyle'].placeholder);
    expect(COORDS_SCHEMA.humanLabel).toBe(CONTENT['sector.coords'].human);
    expect(STATUS_HEADER_SCHEMA.loreLabel).toBe(CONTENT['sector.status'].lore);
  });
});
