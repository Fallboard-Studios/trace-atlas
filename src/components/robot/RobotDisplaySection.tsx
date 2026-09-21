import { memo, useCallback, useMemo } from 'react';
import { RobotBody } from '@/components/robot/RobotBody';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getAudibilityState, isRobotSounding } from '@/utils/robotAudibility';
import {
  ROBOT_SELECTION_ROW_SCHEMAS,
  BATTERY_READOUT_SCHEMA,
  JOB_TYPE_LABELS,
  UNASSIGNED_JOB_LABEL,
  DOCKING_STATE_LABELS,
  AUDIBILITY_LABELS,
} from '@/data/robotSelectionConfig';
import { FREELANCE_VALUE, buildCompanyAssignmentSchema } from '@/data/companyConfig';
import type { Robot } from '@/types/Robot';

import './RobotDisplaySection.css';

interface RobotDisplaySectionProps {
  robot: Robot;
}

/**
 * Robot Options' always-visible header block (not an AccordionContainer — see
 * docs/specs/ROBOT_OPTIONS.md §1). Redesigned Roadmap 15.3: a centered, day/night-invariant avatar
 * (RobotBody, ignoreDaylight) inside a 3-column/2-row grid — Name/Job in row 1, Docking/Status in
 * row 2, all four keeping their DualLabel lore/human captions (unlike sibling Phase 15.2's
 * unlabeled RobotSelectionCard — a deliberate divergence, confirmed via /interview-me). Status is
 * true audibility (isRobotAudible, shared with 15.2), not just this robot's own audioMode. Battery
 * (read-only SliderLinear, Roadmap 15.1) and Company (RadioButton, Roadmap 10.5) sit below the
 * grid, unchanged from before this phase — both already compose their own internal DualLabel from
 * their schema's loreLabel/humanLabel, so neither needed new wrapping markup (see
 * docs/specs/ROBOT_DETAIL_TOP_CARD_REDESIGN.md's own Scope correction). No job reassignment, no
 * docking-state override — both stay fully system-driven. Audio Setting/Volume were rendered here
 * through Roadmap Phase 10, then extracted to RobotOptionsTab/CompanyOptionsSection as their own
 * top-level Output panel (docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 5) — this component is pure
 * read-only meta-data display plus the company RadioButton, nothing editable beyond that.
 */
function RobotDisplaySectionInner({ robot }: RobotDisplaySectionProps) {
  const localeId = getActiveLocaleId();
  const jobLabel = robot.job ? JOB_TYPE_LABELS[robot.job.type] : UNASSIGNED_JOB_LABEL;
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
  // Boolean selector, not the whole robots array — same re-render-avoidance shape
  // RobotSelectionCard.tsx already uses for the identical isRobotAudible call.
  const anySolo = useLocaleStore((s) => (s.locales[localeId]?.robots ?? []).some((r) => r.audioMode === 'solo'));
  const companyAssignmentSchema = useMemo(() => buildCompanyAssignmentSchema(companies), [companies]);
  const isSounding = useAudioStore((s) => isRobotSounding(s.soundingRobotIds, robot.id)); // per-robot boolean, not the whole list
  const statusLabel = AUDIBILITY_LABELS[getAudibilityState(robot.audioMode, anySolo, isSounding)];

  const handleCompanyChange = useCallback((value: string) => {
    useLocaleStore.getState().assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value);
  }, [localeId, robot.id]);

  return (
    <div className="robot-display-section">
      <div className="robot-display-section__grid">
        <div className="robot-display-section__field robot-display-section__field--name">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.name} />
          <span className="robot-display-section__value">{robot.name || robot.id}</span>
        </div>
        <div className="robot-display-section__field robot-display-section__field--job">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.job} />
          <span className="robot-display-section__value">{jobLabel.humanLabel}</span>
        </div>

        <svg className="robot-display-section__avatar" viewBox="-80 -80 160 160" aria-hidden="true">
          <RobotBody robot={robot} ignoreDaylight />
        </svg>

        <div className="robot-display-section__field robot-display-section__field--docking">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.docking} />
          <span className="robot-display-section__value">{DOCKING_STATE_LABELS[robot.docking].humanLabel}</span>
        </div>
        <div className="robot-display-section__field robot-display-section__field--status">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.status} />
          <span className="robot-display-section__value">{statusLabel.humanLabel}</span>
        </div>
      </div>

      <SliderLinear schema={BATTERY_READOUT_SCHEMA} value={Math.round(robot.batteryLevel)} onChange={() => {}} readOnly />

      <RadioButton
        schema={companyAssignmentSchema}
        value={robot.companyId ?? FREELANCE_VALUE}
        onChange={handleCompanyChange}
      />
    </div>
  );
}

// React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 5) — safe and correctly bails when
// given the identical `robot` reference, but does NOT stop this component re-rendering on every
// real robot edit in practice: `robot` is this component's sole prop, and RobotOptionsTab only
// ever re-renders because that same `robot` reference just changed (see spec §1.2.3). Memoized
// anyway (no regression) and the 2 internal instabilities above are still fixed on their own
// hygiene merits.
export const RobotDisplaySection = memo(RobotDisplaySectionInner);

export default RobotDisplaySection;
