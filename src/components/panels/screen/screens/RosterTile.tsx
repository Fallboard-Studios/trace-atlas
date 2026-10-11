import { memo, useId, useMemo, type CSSProperties } from 'react';
import { selectEntity } from '../nav/navActions';
import { useRobotMeta } from './useRobotMeta';
import { RobotBody } from '@/components/robot/RobotBody';
import { getRobotGem, gemViewBox } from '@/components/robot/gem/polygon';
import { VoxelTrack } from '@/components/ui/controls/VoxelTrack';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getRobotColorStyle } from '@/utils/traitColors';
import { computeVoxelBoxStates, computeVoxelTrackLength, computeVoxelTrackTrailingReserve } from '@/utils/voxelTrackMath';
import { fill } from '@/content';
import type { Robot } from '@/types/Robot';
import './RosterTile.css';

/** The battery strip: a fixed, thin row of boxes (spec §1.5's "thin battery VoxelTrack"), read-only. */
export const ROSTER_BATTERY_BOX_COUNT = 10;
export const ROSTER_BATTERY_BOX_SIZE = 8;
export const ROSTER_BATTERY_BOX_GAP = 2;
/** VoxelTrack is an absolutely-positioned overlay (it lies over a slider's track), so the strip gets a box
 *  of its own at the track's size, the way SliderLinear sizes Slider.Root — plus the trailing reserve the
 *  last box's pop bleeds into. */
const BATTERY_BOX_STYLE: CSSProperties = {
  width: computeVoxelTrackLength(ROSTER_BATTERY_BOX_COUNT, ROSTER_BATTERY_BOX_SIZE, ROSTER_BATTERY_BOX_GAP) + computeVoxelTrackTrailingReserve('horizontal'),
  height: ROSTER_BATTERY_BOX_SIZE,
};

interface RosterTileProps {
  robotId: string;
}

/**
 * One robot on the roster board (docs/specs/LAYOUT_REWORK.md §1.5; docs/tasks/LAYOUT_REWORK.md Task 21):
 * the gem in the card render context, the name, one status line and a thin battery strip, on a native
 * button that opens the robot through navActions. The button is the whole face; the Move chip (Task 22)
 * will sit beside it in the `<li>`, never inside it.
 *
 * Takes the id and looks its own robot up, memo'd, as RobotSelectionCard did (backlog item 27): the board
 * re-renders only on membership, and a tile only on its own robot's writes.
 */
export const RosterTile = memo(function RosterTile({ robotId }: RosterTileProps) {
  const localeId = getActiveLocaleId();
  const robot = useLocaleStore((s) => s.locales[localeId]?.robots?.find((r) => r.id === robotId));
  if (!robot) return null;
  return <RosterTileFace robot={robot} localeId={localeId} />;
});

function RosterTileFace({ robot, localeId }: { robot: Robot; localeId: string }) {
  const meta = useRobotMeta(robot, localeId);
  const instanceId = useId();
  const accent = useMemo(() => getRobotColorStyle(robot.identityColor), [robot.identityColor]);
  const battery = Math.round(robot.batteryLevel);
  const batteryStates = useMemo(() => computeVoxelBoxStates(battery, 0, 100, ROSTER_BATTERY_BOX_COUNT), [battery]);
  const name = robot.name || robot.id;

  return (
    <li className="roster-tile" style={accent}>
      <button type="button" className="roster-tile__face" aria-label={name} onClick={() => selectEntity({ robotId: robot.id })}>
        <svg className="roster-tile__gem" viewBox={gemViewBox(getRobotGem(robot.gemSeed))} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <RobotBody robot={robot} ignoreDaylight ignoreScale />
        </svg>
        <span className="roster-tile__text">
          <span className="roster-tile__name">{name}</span>
          <span className="roster-tile__status">{fill('probe.roster.statusLine', meta)}</span>
          <span className="roster-tile__battery" style={BATTERY_BOX_STYLE}>
            <VoxelTrack
              states={batteryStates}
              boxSize={ROSTER_BATTERY_BOX_SIZE}
              gap={ROSTER_BATTERY_BOX_GAP}
              axis="horizontal"
              timelineKeyPrefix={`cabinet-voxel-roster-${robot.id}-${instanceId}`}
            />
          </span>
        </span>
      </button>
    </li>
  );
}

export default RosterTile;
