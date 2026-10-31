// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  ATTENUATION_STYLE_SCHEMA,
  COORDS_SCHEMA,
  RETRANSMIT_SCHEMA,
  STATUS_HEADER_SCHEMA,
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

    it('ATTENUATION_STYLE_SCHEMA uses Attenuation Style copy, per docs/specs/archive/ATTENUATION_STYLE.md §4', () => {
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

    it('no longer exports AUDIO_SWELLS_ENABLED_SCHEMA — replaced by audioRigConfig.ts\'s PING_VARIANCE_AUTOMATION_SCHEMA (docs/tasks/archive/PING-VARIANCE-AUTOMATION.md Task 7)', () => {
      expect('AUDIO_SWELLS_ENABLED_SCHEMA' in sectorSettingsConfigModule).toBe(false);
    });

    // docs/tasks/OFF_SCREEN.md Task 12 (spec assumption 13): the curated shortcut rows went with presets-as-links.
    it('no longer exports ATTENUATION_STYLE_PRESETS or COORDINATE_PRESETS — a curated world is a Transmission preset now', () => {
      expect('ATTENUATION_STYLE_PRESETS' in sectorSettingsConfigModule).toBe(false);
      expect('COORDINATE_PRESETS' in sectorSettingsConfigModule).toBe(false);
    });
  });
});

describe('sectorSettingsConfig reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 8)', () => {
  it('labels equal CONTENT (the nav-row text where nav and control used to disagree)', async () => {
    const { CONTENT } = await import('@/content');
    expect(ATTENUATION_STYLE_SCHEMA.humanLabel).toBe(CONTENT['sector.attenuationStyle'].human);
    expect(ATTENUATION_STYLE_SCHEMA.placeholder).toBe(CONTENT['sector.attenuationStyle'].placeholder);
    expect(COORDS_SCHEMA.humanLabel).toBe(CONTENT['sector.coords'].human);
    expect(STATUS_HEADER_SCHEMA.loreLabel).toBe(CONTENT['sector.status'].lore);
  });
});
