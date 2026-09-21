import { describe, it, expect } from 'vitest';

import {
  ROBOT_SELECTION_ROW_SCHEMAS,
  JOB_TYPE_LABELS,
  UNASSIGNED_JOB_LABEL,
  DOCKING_STATE_LABELS,
  AUDIO_MODE_LABELS,
  AUDIO_STATUS_COLOR_MAP,
  AUDIBILITY_LABELS,
} from './robotSelectionConfig';
import { JobType, DockingState } from '@/types/Robot';

// Every Robot['audioMode'] value per its own type comment (Robot.ts) — no const-object export
// exists for this union today, unlike JobType/DockingState, so the literal list is spelled out
// here rather than derived.
const AUDIO_MODES = ['none', 'mute', 'solo', 'highlight'] as const;

describe('robotSelectionConfig', () => {
  describe('ROBOT_SELECTION_ROW_SCHEMAS', () => {
    it('matches ROBOT_DATA_GRID.md\'s exact lore/human pairs for its three remaining card rows', () => {
      expect(ROBOT_SELECTION_ROW_SCHEMAS.name).toMatchObject({ loreLabel: 'ROBOT IDENTIFIER', humanLabel: 'Robot Name' });
      expect(ROBOT_SELECTION_ROW_SCHEMAS.job).toMatchObject({ loreLabel: 'ASSIGNED PROTOCOL', humanLabel: 'Job Data' });
      expect(ROBOT_SELECTION_ROW_SCHEMAS.docking).toMatchObject({ loreLabel: 'DOCKING STATE', humanLabel: 'Docked Status' });
    });

    // Roadmap 15.2 (docs/specs/ROBOT_CARDS_REDESIGN.md §1.5 item 1): .battery moved to
    // BATTERY_READOUT_SCHEMA (Roadmap 15.1) and .audio had no consumer at all — both dropped
    // as genuinely dead once RobotSelectionCard stopped referencing them.
    it('no longer has .battery or .audio entries', () => {
      expect((ROBOT_SELECTION_ROW_SCHEMAS as Record<string, unknown>).battery).toBeUndefined();
      expect((ROBOT_SELECTION_ROW_SCHEMAS as Record<string, unknown>).audio).toBeUndefined();
    });

    // Roadmap 15.3 (docs/specs/ROBOT_DETAIL_TOP_CARD_REDESIGN.md §1.3) — the first field-level
    // DualLabel for Status; RobotSelectionCard's own Status (15.2) renders bare, with no field-level
    // label of its own, so this is new rather than a rename of an existing entry.
    it('has a .status entry with a non-empty loreLabel and humanLabel of "Status"', () => {
      expect(ROBOT_SELECTION_ROW_SCHEMAS.status.loreLabel).toBeTruthy();
      expect(ROBOT_SELECTION_ROW_SCHEMAS.status.humanLabel).toBe('Status');
    });

    it('every row schema is a dualLabel-typed ControlSchema with a unique id', () => {
      const rows = Object.values(ROBOT_SELECTION_ROW_SCHEMAS);
      for (const row of rows) {
        expect(row.type).toBe('dualLabel');
        expect(row.id).toBeTruthy();
      }
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    });
  });

  describe('AUDIBILITY_LABELS', () => {
    it('covers both emitting and disabled with a loreLabel and humanLabel', () => {
      expect(AUDIBILITY_LABELS.emitting.loreLabel).toBeTruthy();
      expect(AUDIBILITY_LABELS.emitting.humanLabel).toBeTruthy();
      expect(AUDIBILITY_LABELS.disabled.loreLabel).toBeTruthy();
      expect(AUDIBILITY_LABELS.disabled.humanLabel).toBeTruthy();
    });

    it("labels read 'Emitting'/'Disabled', per the confirmed intent", () => {
      expect(AUDIBILITY_LABELS.emitting.humanLabel).toBe('Emitting');
      expect(AUDIBILITY_LABELS.disabled.humanLabel).toBe('Disabled');
    });

    it("has a third state, 'Standing by', for a robot the Audio Load budget is holding back", () => {
      expect(AUDIBILITY_LABELS.limited.humanLabel).toBe('Standing by');
      expect(AUDIBILITY_LABELS.limited.loreLabel).toBeTruthy();
    });

    it('covers exactly the three audibility states, each with distinct labels', () => {
      expect(Object.keys(AUDIBILITY_LABELS).sort()).toEqual(['disabled', 'emitting', 'limited']);
      const human = Object.values(AUDIBILITY_LABELS).map((l) => l.humanLabel);
      const lore = Object.values(AUDIBILITY_LABELS).map((l) => l.loreLabel);
      expect(new Set(human).size).toBe(3);
      expect(new Set(lore).size).toBe(3);
    });
  });

  describe('JOB_TYPE_LABELS', () => {
    it('covers every JobType member with a loreLabel and humanLabel', () => {
      for (const type of Object.values(JobType)) {
        expect(JOB_TYPE_LABELS[type]).toBeDefined();
        expect(JOB_TYPE_LABELS[type].loreLabel).toBeTruthy();
        expect(JOB_TYPE_LABELS[type].humanLabel).toBeTruthy();
      }
    });
  });

  describe('UNASSIGNED_JOB_LABEL', () => {
    it('provides a loreLabel and humanLabel for a robot with no job', () => {
      expect(UNASSIGNED_JOB_LABEL.loreLabel).toBeTruthy();
      expect(UNASSIGNED_JOB_LABEL.humanLabel).toBeTruthy();
    });
  });

  describe('DOCKING_STATE_LABELS', () => {
    it('covers every DockingState member with a loreLabel and humanLabel', () => {
      for (const state of Object.values(DockingState)) {
        expect(DOCKING_STATE_LABELS[state]).toBeDefined();
        expect(DOCKING_STATE_LABELS[state].loreLabel).toBeTruthy();
        expect(DOCKING_STATE_LABELS[state].humanLabel).toBeTruthy();
      }
    });
  });

  describe('AUDIO_MODE_LABELS', () => {
    it('covers every audioMode value with a loreLabel and humanLabel', () => {
      for (const mode of AUDIO_MODES) {
        expect(AUDIO_MODE_LABELS[mode]).toBeDefined();
        expect(AUDIO_MODE_LABELS[mode].loreLabel).toBeTruthy();
        expect(AUDIO_MODE_LABELS[mode].humanLabel).toBeTruthy();
      }
    });

    it("labels 'none' as 'Auto', not 'Off' — matches AUDIO_SETTING_SCHEMA's own relabel (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.3), so the Robot Selection card list reads consistently with Robot Options' own Audio Setting control", () => {
      expect(AUDIO_MODE_LABELS.none.humanLabel).toBe('Auto');
    });
  });

  describe('AUDIO_STATUS_COLOR_MAP', () => {
    it('maps none/mute/solo/highlight to purple/red/green/amber, per confirmed intake', () => {
      expect(AUDIO_STATUS_COLOR_MAP.none).toBe('purple');
      expect(AUDIO_STATUS_COLOR_MAP.mute).toBe('red');
      expect(AUDIO_STATUS_COLOR_MAP.solo).toBe('green');
      expect(AUDIO_STATUS_COLOR_MAP.highlight).toBe('amber');
    });

    it('covers every audioMode value', () => {
      for (const mode of AUDIO_MODES) {
        expect(AUDIO_STATUS_COLOR_MAP[mode]).toBeDefined();
      }
    });
  });
});
