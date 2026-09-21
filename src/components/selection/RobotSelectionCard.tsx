import { memo, type KeyboardEvent } from 'react';
import { RobotBody } from '@/components/robot/RobotBody';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getAudibilityState, isRobotSounding } from '@/utils/robotAudibility';
import {
  BATTERY_READOUT_SCHEMA,
  JOB_TYPE_LABELS,
  UNASSIGNED_JOB_LABEL,
  DOCKING_STATE_LABELS,
  AUDIBILITY_LABELS,
} from '@/data/robotSelectionConfig';
import { FREELANCE_VALUE, buildCompanyAssignmentSchema } from '@/data/companyConfig';
import { getRobotColorStyle } from '@/utils/traitColors';
import './RobotSelectionCard.css';

interface RobotSelectionCardProps {
  robotId: string;
}

/**
 * One robot's card in the Robot Selection hub tile (Roadmap Phase 8, redesigned Phase 15.2) —
 * two sibling regions inside the outer `<li>` (which itself carries only the robot-color scoping
 * style, no role/handlers of its own): `.robot-selection-card__top`, a native clickable element
 * (not the `Button` primitive — it has no children-slot to hold a card's worth of content) that
 * now holds the activation contract (role="button"/tabIndex/onKeyDown) the `<li>` used to carry,
 * and `.robot-selection-card__bottom`, a plain sibling holding only the company-assignment
 * `RadioButton`. Because the company section is a sibling of the clickable region rather than a
 * descendant of it, there's no nested-interactive-element bubbling concern left to guard against
 * — no `stopBubble` (see docs/specs/ROBOT_CARDS_REDESIGN.md §1.1 for the full before/after).
 *
 * Wrapped in memo() (bugfix, found live — see isRobotAudible.ts's own comment on the `anySolo`
 * change this pairs with): `updateRobot` (localeStore.ts) hands back a new object only for the
 * one robot actually written, preserving every other robot's own reference in the new `robots`
 * array — so a card whose OWN robot object is untouched now correctly skips re-rendering when a
 * SIBLING robot's audio attributes change (audioSwells.ts's 16n ticks included), instead of the
 * whole 12-card list re-rendering in lockstep on every such write. Only effective paired with the
 * `anySolo` boolean-selector fix above — memo() alone can't stop a re-render this component's own
 * (previously array-typed) hook subscription was causing regardless of props.
 *
 * Takes `robotId`, not the whole `Robot` object (docs/todo/backlog.md #27 follow-up, 2026-09-15)
 * — looks its own robot up directly via `useLocaleStore` (`.find()` returns the existing array
 * element, same reference across renders unless THIS robot specifically changed). Before this,
 * `RobotsTab` handed each card its `Robot` object directly from a `.map()` over the whole locale's
 * `robots` array — correct per-card memo behavior once RobotsTab itself re-rendered, but
 * RobotsTab's own re-render was gated by the WHOLE array's reference, which changes on *any*
 * robot's own update anywhere in the locale (battery ticks, audio swells, field edits), forcing
 * RobotsTab (and everything statically composed beneath it) to re-execute constantly even though
 * most individual cards then correctly bailed. Looking up by id here instead means this card's own
 * data no longer depends on RobotsTab's own re-render cadence at all — paired with RobotsTab.tsx's
 * own narrower `{ id, companyId }` roster selector, which now only changes when a robot is
 * actually added/removed/reassigned, not on every field tick.
 */
export const RobotSelectionCard = memo(function RobotSelectionCard({ robotId }: RobotSelectionCardProps) {
  const selectRobot = useUIStore((s) => s.selectRobot);
  const localeId = getActiveLocaleId();
  const robot = useLocaleStore((s) => s.locales[localeId]?.robots?.find((r) => r.id === robotId));
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
  // A boolean, not the full robots array (bugfix, found live — see isRobotAudible's own comment):
  // this is the only thing isRobotAudible ever needed out of the locale's robot list. Selecting
  // just this primitive means Zustand's default equality bails out when it hasn't actually
  // flipped, instead of re-rendering every card on every robot-attribute write anywhere in the
  // locale (audioSwells.ts's 16n modulation ticks included, ~8-9x/sec) the way subscribing to the
  // whole array did.
  const anySolo = useLocaleStore((s) => (s.locales[localeId]?.robots ?? []).some((r) => r.audioMode === 'solo'));
  // Same discipline for the Audio Load budget: a boolean for THIS robot, never the whole soundingRobotIds
  // array, so another robot entering or leaving the set does not re-render this card.
  const isSounding = useAudioStore((s) => isRobotSounding(s.soundingRobotIds, robotId));

  // Defensive only — RobotsTab only ever renders a robotId that exists in the locale's roster
  // (fixed at 12, created once at locale load, never removed).
  if (!robot) return null;

  const companyAssignmentSchema = buildCompanyAssignmentSchema(companies);
  const displayName = robot.name || robot.id;
  const jobLabel = robot.job ? JOB_TYPE_LABELS[robot.job.type] : UNASSIGNED_JOB_LABEL;
  const dockingLabel = DOCKING_STATE_LABELS[robot.docking];
  const statusLabel = AUDIBILITY_LABELS[getAudibilityState(robot.audioMode, anySolo, isSounding)];
  // BATTERY_READOUT_SCHEMA is one shared, static object (robotSelectionConfig.ts) — reused as-is
  // by RobotDisplaySection, where only one robot is ever shown at a time. Here, every robot in the
  // list renders its own SliderLinear from it simultaneously, so `id` must be made unique per
  // instance: SliderLinear derives VoxelTrack's GSAP timelineKeyPrefix directly from `schema.id`,
  // and timelineMap (src/animation/timelineMap.ts) is a single module-global Map — an unmodified
  // shared id here meant every card's battery slider fought over the identical timeline keys,
  // each mount/update killing a sibling robot's still-live pop animation (found in code review).
  const batteryReadoutSchema = { ...BATTERY_READOUT_SCHEMA, id: `${BATTERY_READOUT_SCHEMA.id}.${robot.id}` };

  // Arrow function expressions, not function declarations — TypeScript's control-flow narrowing
  // from `if (!robot) return null` above doesn't extend into hoisted function declarations (they
  // could, in principle, be called before that check runs), only into const-bound closures.
  const handleActivate = () => {
    selectRobot(robot.id);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate();
    }
  };

  const handleCompanyChange = (value: string) => {
    useLocaleStore.getState().assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value);
  };

  return (
    <li className="robot-selection-card" style={getRobotColorStyle(robot.identityColor)}>
      <div
        className="robot-selection-card__top"
        role="button"
        tabIndex={0}
        aria-label={displayName}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
      >
        <div className="robot-selection-card__meta-row">
          <svg className="robot-selection-card__avatar" viewBox="-80 -80 160 160" aria-hidden="true">
            <RobotBody robot={robot} ignoreDaylight />
          </svg>

          <div className="robot-selection-card__meta-text">
            <span className="robot-selection-card__name">{displayName}</span>
            <span className="robot-selection-card__job">{jobLabel.humanLabel}</span>
            <span className="robot-selection-card__status-line">
              {dockingLabel.humanLabel} · {statusLabel.humanLabel}
            </span>
          </div>
        </div>

        <SliderLinear
          schema={batteryReadoutSchema}
          value={Math.round(robot.batteryLevel)}
          onChange={() => {}}
          readOnly
        />
      </div>

      <div className="robot-selection-card__bottom">
        <RadioButton
          schema={companyAssignmentSchema}
          value={robot.companyId ?? FREELANCE_VALUE}
          onChange={handleCompanyChange}
        />
      </div>
    </li>
  );
});

export default RobotSelectionCard;
