import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentPropsWithRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { selectEntity } from '../nav/navActions';
import { useShell } from '../useShell';
import { useRobotMeta } from './useRobotMeta';
import { RobotBody } from '@/components/robot/RobotBody';
import { getRobotGem, gemViewBox } from '@/components/robot/gem/polygon';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { VoxelTrack } from '@/components/ui/controls/VoxelTrack';
import { FREELANCE_VALUE, buildCompanyAssignmentSchema } from '@/data/companyConfig';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getScreenViewportDomNode } from '@/utils/helpers';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getRobotColorStyle } from '@/utils/traitColors';
import { computeVoxelBoxStates, computeVoxelTrackLength, computeVoxelTrackTrailingReserve } from '@/utils/voxelTrackMath';
import { CONTENT, fill } from '@/content';
import type { Company } from '@/types/Company';
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

/** The Move chip's height (spec §4's --move-chip-height, the sketch's 22 px). CabinetBox draws its walls
 *  from a number, so this is the one value; the tile hands it to the CSS as --move-chip-height. */
export const MOVE_CHIP_HEIGHT = 22;
/** The phone's tap-hold on a tile that opens the Move sheet (spec §1.5). */
export const MOVE_LONG_PRESS_MS = 500;

const MOVE_CHIP = CONTENT['probe.roster.move'];
const NO_COMPANIES: Company[] = [];

/** Where a picked company goes: the board records the tiles for its glide, then writes the store. */
export type RosterMoveHandler = (robotId: string, companyId: string | null) => void;

interface RosterTileProps {
  robotId: string;
  onMove: RosterMoveHandler;
}

/**
 * One robot on the roster board (docs/specs/LAYOUT_REWORK.md §1.5; docs/tasks/LAYOUT_REWORK.md Tasks 21–22):
 * the gem in the card render context, the name, one status line and a thin battery strip, on a native
 * button that opens the robot through navActions. The button is the whole face; the Move chip sits beside
 * it in the `<li>`, never inside it, so the two presses never nest.
 *
 * Takes the id and looks its own robot up, memo'd, as RobotSelectionCard did (backlog item 27): the board
 * re-renders only on membership, and a tile only on its own robot's writes or its own panel opening.
 */
export const RosterTile = memo(function RosterTile({ robotId, onMove }: RosterTileProps) {
  const localeId = getActiveLocaleId();
  const robot = useLocaleStore((s) => s.locales[localeId]?.robots?.find((r) => r.id === robotId));
  if (!robot) return null;
  return <RosterTileFace robot={robot} localeId={localeId} onMove={onMove} />;
});

function RosterTileFace({ robot, localeId, onMove }: { robot: Robot; localeId: string; onMove: RosterMoveHandler }) {
  const shell = useShell();
  const meta = useRobotMeta(robot, localeId);
  const instanceId = useId();
  // A boolean per tile, so another tile's panel opening re-renders only that tile.
  const moveOpen = useUIStore((s) => s.movePanelRobotId === robot.id);
  const style = useMemo<CSSProperties>(
    () => ({ ...getRobotColorStyle(robot.identityColor), '--move-chip-height': `${MOVE_CHIP_HEIGHT}px` } as CSSProperties),
    [robot.identityColor],
  );
  const battery = Math.round(robot.batteryLevel);
  const batteryStates = useMemo(() => computeVoxelBoxStates(battery, 0, 100, ROSTER_BATTERY_BOX_COUNT), [battery]);
  const name = robot.name || robot.id;
  const longPress = useLongPress(shell === 'phone', robot.id);

  const setMoveOpen = useCallback(
    (open: boolean) => (open ? useUIStore.getState().openMovePanel(robot.id) : useUIStore.getState().closeMovePanel()),
    [robot.id],
  );
  // Stable, so the open panel's pick handler is not rebuilt on every render of the tile.
  const closeMove = useCallback(() => setMoveOpen(false), [setMoveOpen]);
  const statusId = `${instanceId}-status`;

  const faceButton = (
    <button
      type="button"
      className="roster-tile__face"
      aria-label={name}
      aria-describedby={statusId}
      onClick={() => {
        if (longPress.consumeClick()) return;
        selectEntity({ robotId: robot.id });
      }}
      {...longPress.handlers}
    >
      <svg className="roster-tile__gem" viewBox={gemViewBox(getRobotGem(robot.gemSeed))} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <RobotBody robot={robot} ignoreDaylight ignoreScale />
      </svg>
      <span className="roster-tile__text">
        <span className="roster-tile__name">{name}</span>
        <span className="roster-tile__status" id={statusId}>{fill('probe.roster.statusLine', meta)}</span>
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
  );

  const chipLabel = shell === 'phone' ? MOVE_CHIP.short : MOVE_CHIP.human;
  const chipButton = <MoveChipButton label={chipLabel} name={fill('probe.roster.move', { name })} timelineKey={`cabinet-roster-move-${robot.id}-${instanceId}`} />;
  const body = moveOpen ? <MovePanelBody robot={robot} name={name} onMove={onMove} close={closeMove} /> : null;
  const tileClass = `roster-tile roster-tile--${shell}`;

  if (shell === 'phone') {
    return (
      <li className={tileClass} style={style} data-flip-id={robot.id}>
        {faceButton}
        <Dialog.Root open={moveOpen} onOpenChange={setMoveOpen}>
          <Dialog.Trigger asChild>{chipButton}</Dialog.Trigger>
          <ScreenPortal kind="dialog">
            <Dialog.Overlay className="roster-move__scrim" />
            <Dialog.Content className="roster-move__panel roster-move__sheet" style={style} aria-describedby={undefined}>
              {/* The radio's own label row shows the title; the dialog needs it as its name too. */}
              <VisuallyHidden asChild>
                <Dialog.Title>{fill('company.assign', { name })}</Dialog.Title>
              </VisuallyHidden>
              {body}
            </Dialog.Content>
          </ScreenPortal>
        </Dialog.Root>
      </li>
    );
  }

  // The desk panel hangs under the whole tile (the sketch's .movepop), so the tile is its anchor; the
  // chip is only its trigger. The screen is its collision boundary: left to the window, the rightmost
  // tile's panel ran 8 px past the screen into the sleeve at 800 px (measured in Chrome).
  return (
    <Popover.Root modal open={moveOpen} onOpenChange={setMoveOpen}>
      <Popover.Anchor asChild>
        <li className={tileClass} style={style} data-flip-id={robot.id}>
          {faceButton}
          <Popover.Trigger asChild>{chipButton}</Popover.Trigger>
          <ScreenPortal kind="popover">
            <Popover.Content
              className="roster-move__panel"
              style={style}
              side="bottom"
              align="start"
              sideOffset={8}
              collisionPadding={8}
              collisionBoundary={getScreenViewportDomNode()}
              aria-label={fill('company.assign', { name })}
            >
              {body}
            </Popover.Content>
          </ScreenPortal>
        </li>
      </Popover.Anchor>
    </Popover.Root>
  );
}

/**
 * The Move panel's portal: into ScreenViewport, never document.body (the UI Shell guardrail) and never
 * in place — the tile is positioned and every panel facade is its own stacking context, so in place the
 * sheet would be laid out against the tile and the popover painted over by the next row (HelpPopover's
 * finding). With no ScreenViewport on the page (a component test) it renders in place.
 */
function ScreenPortal({ kind, children }: { kind: 'popover' | 'dialog'; children: ReactNode }) {
  const screen = getScreenViewportDomNode();
  if (!screen) return <>{children}</>;
  return kind === 'popover'
    ? <Popover.Portal container={screen}>{children}</Popover.Portal>
    : <Dialog.Portal container={screen}>{children}</Dialog.Portal>;
}

interface MoveChipButtonProps extends ComponentPropsWithRef<'button'> {
  label: string;
  name: string;
  timelineKey: string;
}

/**
 * The "⇄ Move" chip: a frame-style CabinetBox (flat at rest) that pops while engaged, as every act
 * control does. It is a Radix trigger's child (asChild), so it forwards the trigger's props and ref, and
 * it stops the press there: the tile's own click never fires for it (spec §1.5).
 */
function MoveChipButton({ label, name, timelineKey, onClick, ...trigger }: MoveChipButtonProps) {
  const [engaged, setEngaged] = useState(false);
  return (
    <button
      type="button"
      {...trigger}
      className="roster-tile__move"
      aria-label={name}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={() => setEngaged(false)}
    >
      <CabinetBox popped={engaged} timelineKey={timelineKey} boxHeight={MOVE_CHIP_HEIGHT} enforceMinTouchHeight={false}>
        <span className="roster-tile__move-label">{label}</span>
      </CabinetBox>
    </button>
  );
}

/**
 * The open panel's content: the company radio from buildCompanyAssignmentSchema, retitled "Move <name>
 * to" (company.assign's template), without its help "?" — the robot screen's company radio carries it,
 * and a modal popover inside this modal one is one too many. Mounted only while open, so only the open
 * tile subscribes to the company list.
 */
function MovePanelBody({ robot, name, onMove, close }: { robot: Robot; name: string; onMove: RosterMoveHandler; close: () => void }) {
  const localeId = getActiveLocaleId();
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? NO_COMPANIES);
  const schema = useMemo(() => {
    const { help: _help, ...base } = buildCompanyAssignmentSchema(companies);
    return { ...base, humanLabel: fill('company.assign', { name }) };
  }, [companies, name]);
  const handleChange = useCallback((value: string) => {
    onMove(robot.id, value === FREELANCE_VALUE ? null : value);
    close();
  }, [onMove, robot.id, close]);

  // Re-picking the current company (Radix's deselect) is a pick too: it closes, and nothing moves.
  return <RadioButton schema={schema} value={robot.companyId ?? FREELANCE_VALUE} onChange={handleChange} onDeselect={close} />;
}

/**
 * The phone's tap-hold (spec §1.5): a press held MOVE_LONG_PRESS_MS on the tile opens its Move sheet, and
 * the click that ends that press is swallowed so the robot does not open as well. A release, a cancel (a
 * scroll taking the touch) or the finger leaving the tile before then is an ordinary tap. A UI gesture
 * timer, not musical timing. Off on the desk: there the chip shows on hover.
 */
function useLongPress(enabled: boolean, robotId: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    /** True once, for the click that ends a long press. */
    consumeClick() {
      const fired = firedRef.current;
      firedRef.current = false;
      return fired;
    },
    handlers: enabled
      ? {
          onPointerDown: () => {
            cancel();
            firedRef.current = false;
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              firedRef.current = true;
              useUIStore.getState().openMovePanel(robotId);
            }, MOVE_LONG_PRESS_MS);
          },
          onPointerUp: cancel,
          onPointerCancel: cancel,
          onPointerLeave: cancel,
          // The hold is ours: no browser touch menu over it.
          onContextMenu: (event: MouseEvent) => event.preventDefault(),
        }
      : {},
  };
}

export default RosterTile;
