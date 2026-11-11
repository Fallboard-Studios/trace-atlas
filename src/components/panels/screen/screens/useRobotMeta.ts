import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { isRobotEmitting, isRobotSounding } from '@/utils/robotAudibility';
import { JOB_TYPE_LABELS, UNASSIGNED_JOB_LABEL, DOCKING_STATE_LABELS, ACTIVITY_LABELS, MODE_LABELS } from '@/data/robotSelectionConfig';
import type { Robot } from '@/types/Robot';

/** The four read-only meta fields, in the order the robot screen's wells and a roster tile's status line
 *  read them. */
export type RobotMetaField = 'job' | 'dockingState' | 'activity' | 'status';

/** A robot's read-only meta (monitor mode spec §4): the four display words, which a status-line template's `fill`
 *  takes as they are, and what the mode light needs. */
export interface RobotMeta {
  words: Record<RobotMetaField, string>;
  /** The robot's own audioMode, for the light's colour (§1.5); unset reads as `'none'`. */
  mode: NonNullable<Robot['audioMode']>;
  /** Lit when the robot is sounding right now; dim for any silence (its Mute, the dock, a Solo, standing by). */
  lit: boolean;
}

/**
 * A robot's read-only meta: the display words for job, docking, phase and its own Monitor Mode
 * (docs/specs/MONITOR_MODE_TRUSTWORTHY.md §1.5: the word never changes with the reason it is silent; `lit` says
 * whether it is heard). Shared by the robot screen (docs/tasks/LAYOUT_REWORK.md Task 16) and the roster tile
 * (Task 21). Booleans from the stores, so another robot's tick re-renders nothing.
 */
export function useRobotMeta(robot: Robot, localeId: string): RobotMeta {
  const anySolo = useLocaleStore((s) => (s.locales[localeId]?.robots ?? []).some((r) => r.audioMode === 'solo'));
  const isSounding = useAudioStore((s) => isRobotSounding(s.soundingRobotIds, robot.id));
  const mode = robot.audioMode ?? 'none';
  return {
    words: {
      job: (robot.job ? JOB_TYPE_LABELS[robot.job] : UNASSIGNED_JOB_LABEL).humanLabel,
      dockingState: DOCKING_STATE_LABELS[robot.docking].humanLabel,
      activity: ACTIVITY_LABELS[robot.activity].humanLabel,
      status: MODE_LABELS[mode].humanLabel,
    },
    mode,
    lit: isRobotEmitting(robot.audioMode, anySolo, robot.docking, isSounding),
  };
}
