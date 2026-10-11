import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getAudibilityState, isRobotSounding } from '@/utils/robotAudibility';
import { JOB_TYPE_LABELS, UNASSIGNED_JOB_LABEL, DOCKING_STATE_LABELS, ACTIVITY_LABELS, AUDIBILITY_LABELS } from '@/data/robotSelectionConfig';
import type { Robot } from '@/types/Robot';

/** The four read-only meta fields, in the order the robot screen's wells and a roster tile's status line
 *  read them. */
export type RobotMetaField = 'job' | 'dockingState' | 'activity' | 'status';

/**
 * A robot's read-only meta as display words: job, docking, phase and emission (true audibility, the Audio
 * Load budget's standing-by included). Shared by the robot screen (docs/tasks/LAYOUT_REWORK.md Task 16)
 * and the roster tile (Task 21). Booleans from the stores, so another robot's tick re-renders nothing.
 */
export function useRobotMeta(robot: Robot, localeId: string): Record<RobotMetaField, string> {
  const anySolo = useLocaleStore((s) => (s.locales[localeId]?.robots ?? []).some((r) => r.audioMode === 'solo'));
  const isSounding = useAudioStore((s) => isRobotSounding(s.soundingRobotIds, robot.id));
  return {
    job: (robot.job ? JOB_TYPE_LABELS[robot.job] : UNASSIGNED_JOB_LABEL).humanLabel,
    dockingState: DOCKING_STATE_LABELS[robot.docking].humanLabel,
    activity: ACTIVITY_LABELS[robot.activity].humanLabel,
    status: AUDIBILITY_LABELS[getAudibilityState(robot.audioMode, anySolo, isSounding)].humanLabel,
  };
}
