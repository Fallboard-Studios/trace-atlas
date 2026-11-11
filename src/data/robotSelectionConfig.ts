/**
 * Robot Selection card content, resolving docs/tasks/archive/ROBOT_SELECTION.md Task 6 (Roadmap
 * Phase 8). ROBOT_SELECTION_ROW_SCHEMAS's five entries use the exact lore/human pairs already
 * confirmed in docs/reference/ROBOT_DATA_GRID.md (Robot Name/Job Data/Battery Data/Docked
 * Status/Audio Setting). The per-value label maps below (JOB_TYPE_LABELS/
 * DOCKING_STATE_LABELS) are best-guess drafts — the grid only defines
 * category-level pairs, not per-value ones — appended to ROBOT_DATA_GRID.md as drafts pending
 * review (see docs/tasks/archive/ROBOT_SELECTION.md Task 12).
 */
import type { DualLabelSchema, SliderLinearSchema } from '@/types/controls';
import type { JobType, DockingState, Robot, RobotActivity } from '@/types/Robot';
import { labels, optionsRecord } from '@/content';

// ========================================
// ROW SCHEMAS
// ========================================

export const ROBOT_SELECTION_ROW_SCHEMAS = {
  name: { id: 'robotSelection.name', type: 'dualLabel', ...labels('probe.name') },
  job: { id: 'robotSelection.job', type: 'dualLabel', ...labels('probe.job') },
  docking: { id: 'robotSelection.docking', type: 'dualLabel', ...labels('probe.status.docking') },
  // activity: RobotDisplaySection's row after Docked Status (Phase 43 spec §1.11).
  activity: { id: 'robotSelection.activity', type: 'dualLabel', ...labels('probe.status.activity') },
  // status: the field-level DualLabel (Roadmap 15.3); its VALUE words are the robot's own Monitor Mode
  // (MODE_LABELS, below; docs/specs/MONITOR_MODE_TRUSTWORTHY.md §1.5).
  status: { id: 'robotSelection.status', type: 'dualLabel', ...labels('probe.status') },
  // .battery and .audio removed (Roadmap 15.2, docs/specs/archive/ROBOT_CARDS_REDESIGN.md §1.5 item 1) —
  // genuinely dead once RobotSelectionCard stopped referencing them: Battery moved to
  // BATTERY_READOUT_SCHEMA (Roadmap 15.1) via RobotDisplaySection first, then RobotSelectionCard
  // itself; Audio Setting's card-level dot (AudioStatusBadge) was replaced by the combined
  // Docking/Status text, which never used a DualLabel row of its own.
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
  ...labels('probe.battery'),
  min: 0,
  max: 100,
  orientation: 'horizontal',
};

/**
 * Fixed voxel box size for the battery readout, overriding SliderLinear's usual live,
 * breakpoint-tier box size (32/40/48px — CABINET_BOX_HEIGHT) at every tier. Read-only and
 * purely informational, so it doesn't need the same touch-target footprint an interactive
 * slider does; Crawford called the tier-based size too large for what it is.
 */
export const BATTERY_READOUT_BOX_SIZE = 24;
export const BATTERY_READOUT_GAP_SIZE = 8;

// ========================================
// VALUE LABELS (draft — pending review, see ROBOT_DATA_GRID.md)
// ========================================

interface ValueLabel {
  loreLabel?: string;
  humanLabel: string;
}

export const JOB_TYPE_LABELS: Record<JobType, ValueLabel> = optionsRecord('probe.job');

/** Shown in the Job Data row for a robot with no `job` yet (Docked/Undocking/Recalled). */
export const UNASSIGNED_JOB_LABEL: ValueLabel = labels('probe.job.unassigned');

export const DOCKING_STATE_LABELS: Record<DockingState, ValueLabel> = optionsRecord('probe.status.docking');

/** The work loop's seven activities (Phase 43 spec §1.11), keyed by `Robot.activity`. */
export const ACTIVITY_LABELS: Record<RobotActivity, ValueLabel> = optionsRecord('probe.status.activity');

/**
 * The Status field's words (docs/specs/MONITOR_MODE_TRUSTWORTHY.md §1.5): the robot's own Monitor Mode, keyed by
 * `audioMode`, from the same `probe.monitorMode` options the editor's radio reads (one entry per concept).
 */
export const MODE_LABELS: Record<NonNullable<Robot['audioMode']>, ValueLabel> = optionsRecord('probe.monitorMode');
