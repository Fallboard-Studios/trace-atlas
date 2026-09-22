/**
 * Robot Selection card content, resolving docs/tasks/ROBOT_SELECTION.md Task 6 (Roadmap
 * Phase 8). ROBOT_SELECTION_ROW_SCHEMAS's five entries use the exact lore/human pairs already
 * confirmed in docs/reference/ROBOT_DATA_GRID.md (Robot Name/Job Data/Battery Data/Docked
 * Status/Audio Setting). The per-value label maps below (JOB_TYPE_LABELS/
 * DOCKING_STATE_LABELS/AUDIO_MODE_LABELS) are best-guess drafts — the grid only defines
 * category-level pairs, not per-value ones — appended to ROBOT_DATA_GRID.md as drafts pending
 * review (see docs/tasks/ROBOT_SELECTION.md Task 12).
 */
import type { DualLabelSchema, SliderLinearSchema } from '@/types/controls';
import type { JobType, DockingState, Robot } from '@/types/Robot';
import type { AudibilityState } from '@/utils/robotAudibility';
import type { StatusLightState } from '@/utils/statusLightColors';

// ========================================
// ROW SCHEMAS
// ========================================

export const ROBOT_SELECTION_ROW_SCHEMAS = {
  name: { id: 'robotSelection.name', type: 'dualLabel', loreLabel: 'ROBOT IDENTIFIER', humanLabel: 'Robot Name' },
  job: { id: 'robotSelection.job', type: 'dualLabel', loreLabel: 'ASSIGNED PROTOCOL', humanLabel: 'Job Data' },
  docking: { id: 'robotSelection.docking', type: 'dualLabel', loreLabel: 'DOCKING STATE', humanLabel: 'Docked Status' },
  // status: new field-level DualLabel (Roadmap 15.3) — the Status VALUE labels (AUDIBILITY_LABELS,
  // below) already existed from Roadmap 15.2, but that card never wrapped Status in a DualLabel of
  // its own (it renders bare, combined with Docking into one line) — this is the first FIELD-level
  // lore/human pair for Status. Best-guess draft, pending review, same as AUDIBILITY_LABELS itself.
  status: { id: 'robotSelection.status', type: 'dualLabel', loreLabel: 'ACOUSTIC EMISSION STATE', humanLabel: 'Status' },
  // .battery and .audio removed (Roadmap 15.2, docs/specs/ROBOT_CARDS_REDESIGN.md §1.5 item 1) —
  // genuinely dead once RobotSelectionCard stopped referencing them: Battery moved to
  // BATTERY_READOUT_SCHEMA (Roadmap 15.1) via RobotDisplaySection first, then RobotSelectionCard
  // itself; Audio Setting's card-level dot (AudioStatusBadge) was replaced by the combined
  // Docking/Status text (AUDIBILITY_LABELS, below), which never used a DualLabel row of its own.
} satisfies Record<string, DualLabelSchema>;

/**
 * Battery Data, rendered as a read-only SliderLinear — first added for RobotDisplaySection
 * (Roadmap 15.1), then adopted by RobotSelectionCard too (Roadmap 15.2), replacing that card's own
 * former DualLabel + plain-text-percent pair (the now-removed ROBOT_SELECTION_ROW_SCHEMAS.battery).
 * Same lore/human labels that entry used to carry — SliderLinear composes its own internal
 * DualLabel from them, so no external one is needed for this row in either consumer.
 */
export const BATTERY_READOUT_SCHEMA: SliderLinearSchema = {
  id: 'robotSelection.batteryReadout',
  type: 'sliderLinear',
  loreLabel: 'POWER CELL STATUS',
  humanLabel: 'Battery Data',
  min: 0,
  max: 100,
  unit: '%',
  orientation: 'horizontal',
};

// ========================================
// VALUE LABELS (draft — pending review, see ROBOT_DATA_GRID.md)
// ========================================

interface ValueLabel {
  loreLabel: string;
  humanLabel: string;
}

export const JOB_TYPE_LABELS: Record<JobType, ValueLabel> = {
  ventExtraction: { loreLabel: 'VOLATILE VENT EXTRACTION', humanLabel: 'Vent Extraction' },
  acousticSurvey: { loreLabel: 'HIGH-ALTITUDE ACOUSTIC SURVEY', humanLabel: 'Acoustic Survey' },
  structuralInspection: { loreLabel: 'STRUCTURAL INTEGRITY INSPECTION', humanLabel: 'Structural Inspection' },
  fluidMonitoring: { loreLabel: 'SUBSTATION FLUID MONITORING', humanLabel: 'Fluid Monitoring' },
};

/** Shown in the Job Data row for a robot with no `job` yet (Docked/Docking/Departing). */
export const UNASSIGNED_JOB_LABEL: ValueLabel = { loreLabel: 'NO PROTOCOL ASSIGNED', humanLabel: 'Unassigned' };

export const DOCKING_STATE_LABELS: Record<DockingState, ValueLabel> = {
  docked: { loreLabel: 'DOCKED', humanLabel: 'Docked' },
  docking: { loreLabel: 'DOCKING', humanLabel: 'Docking' },
  departing: { loreLabel: 'DEPARTING', humanLabel: 'Departing' },
  active: { loreLabel: 'ACTIVE', humanLabel: 'Active' },
};

type AudioMode = NonNullable<Robot['audioMode']>;

export const AUDIO_MODE_LABELS: Record<AudioMode, ValueLabel> = {
  none: { loreLabel: 'OFFLINE', humanLabel: 'Auto' },
  mute: { loreLabel: 'SILENCED', humanLabel: 'Mute' },
  solo: { loreLabel: 'ISOLATED', humanLabel: 'Solo' },
  highlight: { loreLabel: 'PRIORITIZED', humanLabel: 'Highlight' },
};

/** off=purple, mute=red, solo=green, highlight=amber — confirmed during intake. */
export const AUDIO_STATUS_COLOR_MAP: Record<AudioMode, StatusLightState> = {
  none: 'purple',
  mute: 'red',
  solo: 'green',
  highlight: 'amber',
};

/**
 * Roadmap 15.2 (docs/specs/ROBOT_CARDS_REDESIGN.md §1.3) — Status, half of RobotSelectionCard's
 * combined "Docking · Status" line. Reflects true audibility (isRobotAudible, src/utils/
 * robotAudibility.ts), not just this robot's own audioMode. Same loreLabel/humanLabel shape as
 * every other value-label map in this file for consistency, even though only humanLabel is ever
 * rendered — best-guess drafts, pending review (see docs/reference/ROBOT_DATA_GRID.md).
 */
export const AUDIBILITY_LABELS: Record<AudibilityState, ValueLabel> = {
  emitting: { loreLabel: 'ACOUSTIC EMISSION ACTIVE', humanLabel: 'Emitting' },
  // Audio Load budget (docs/specs/AUDIO_LOAD_BUDGET.md): eligible to sound but held back — first-pass invented lore copy, to be confirmed in the manual check.
  limited: { loreLabel: 'ACOUSTIC EMISSION HELD IN RESERVE', humanLabel: 'Standing by' },
  disabled: { loreLabel: 'ACOUSTIC EMISSION SUPPRESSED', humanLabel: 'Disabled' },
};
