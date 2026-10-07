import { describe, it, expect } from 'vitest';
import {
  ROBOT_SELECTION_ROW_SCHEMAS,
  BATTERY_READOUT_SCHEMA,
  JOB_TYPE_LABELS,
  UNASSIGNED_JOB_LABEL,
  DOCKING_STATE_LABELS,
  AUDIO_MODE_LABELS,
  AUDIO_STATUS_COLOR_MAP,
  AUDIBILITY_LABELS,
} from './robotSelectionConfig';
import { CONTENT } from '@/content';

import { JobType, DockingState } from '@/types/Robot';

// Every Robot['audioMode'] value per its own type comment (Robot.ts) — no const-object export
// exists for this union today, unlike JobType/DockingState, so the literal list is spelled out
// here rather than derived.
const AUDIO_MODES = ['none', 'mute', 'solo', 'highlight'] as const;

describe('robotSelectionConfig', () => {
  describe('ROBOT_SELECTION_ROW_SCHEMAS', () => {
    it('matches ROBOT_DATA_GRID.md\'s exact lore/human pairs for its three remaining card rows', () => {
      expect(ROBOT_SELECTION_ROW_SCHEMAS.name).toMatchObject({ loreLabel: CONTENT['probe.name'].lore, humanLabel: CONTENT['probe.name'].human });
      expect(ROBOT_SELECTION_ROW_SCHEMAS.job).toMatchObject({ loreLabel: CONTENT['probe.job'].lore, humanLabel: CONTENT['probe.job'].human });
      expect(ROBOT_SELECTION_ROW_SCHEMAS.docking).toMatchObject({ loreLabel: CONTENT['probe.status.docking'].lore, humanLabel: CONTENT['probe.status.docking'].human });
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
      expect(ROBOT_SELECTION_ROW_SCHEMAS.status.humanLabel).toBe(CONTENT['probe.status'].human);
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
      expect(AUDIBILITY_LABELS.emitting.humanLabel).toBe(CONTENT['probe.status'].options.emitting.human);
      expect(AUDIBILITY_LABELS.disabled.humanLabel).toBe(CONTENT['probe.status'].options.disabled.human);
    });

    it("has a third state, 'Standing by', for a robot the Audio Load budget is holding back", () => {
      expect(AUDIBILITY_LABELS.limited.humanLabel).toBe(CONTENT['probe.status'].options.limited.human);
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

    it('has six entries, Salvage and Maintenance among them (Phase 43 Task 4)', () => {
      expect(Object.keys(JOB_TYPE_LABELS)).toHaveLength(6);
      expect(JOB_TYPE_LABELS.salvage.humanLabel).toBe('Salvage');
      expect(JOB_TYPE_LABELS.maintenance.humanLabel).toBe('Maintenance');
      expect(JOB_TYPE_LABELS.salvage.loreLabel).toBeTruthy();
      expect(JOB_TYPE_LABELS.maintenance.loreLabel).toBeTruthy();
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

    it('labels exactly the four renamed states — Docked / Undocking / Active / Recalled, no stale Docking/Departing entry (Phase 43 §1.1)', () => {
      expect(Object.keys(DOCKING_STATE_LABELS).sort()).toEqual([...Object.values(DockingState)].sort());
      expect(DOCKING_STATE_LABELS[DockingState.Docked].humanLabel).toBe('Docked');
      expect(DOCKING_STATE_LABELS[DockingState.Undocking].humanLabel).toBe('Undocking');
      expect(DOCKING_STATE_LABELS[DockingState.Active].humanLabel).toBe('Active');
      expect(DOCKING_STATE_LABELS[DockingState.Recalled].humanLabel).toBe('Recalled');
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
      expect(AUDIO_MODE_LABELS.none.humanLabel).toBe(CONTENT['probe.status.monitorMode'].options.none.human);
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

describe('robotSelectionConfig reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 9)', () => {
  it('carries no copy literal of its own — the value-label maps are optionsRecord() wrappers', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, 'robotSelectionConfig.ts'), 'utf8');
    expect(src).not.toMatch(/(loreLabel|humanLabel|unit|placeholder)\s*:\s*['"`]/);
    expect(src).toMatch(/optionsRecord\('probe\.job'\)/);
  });
  it('wrappers expose exactly the same keys and text as CONTENT', async () => {
    const { CONTENT } = await import('@/content');
    expect(Object.keys(JOB_TYPE_LABELS)).toEqual(Object.keys(CONTENT['probe.job'].options));
    expect(JOB_TYPE_LABELS.ventExtraction.humanLabel).toBe(CONTENT['probe.job'].options.ventExtraction.human);
    expect(DOCKING_STATE_LABELS.docked.loreLabel).toBe(CONTENT['probe.status.docking'].options.docked.lore);
    expect(AUDIBILITY_LABELS.limited.humanLabel).toBe(CONTENT['probe.status'].options.limited.human);
    expect(AUDIO_MODE_LABELS.none.loreLabel).toBe(CONTENT['probe.status.monitorMode'].options.none.lore);
    expect(UNASSIGNED_JOB_LABEL.humanLabel).toBe(CONTENT['probe.job.unassigned'].human);
    expect(ROBOT_SELECTION_ROW_SCHEMAS.name.humanLabel).toBe(CONTENT['probe.name'].human);
    expect(BATTERY_READOUT_SCHEMA.unit).toBe(CONTENT['probe.battery'].unit);
  });
});
