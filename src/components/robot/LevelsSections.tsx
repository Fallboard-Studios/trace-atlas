import { memo, useCallback } from 'react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { Toggle } from '@/components/ui/controls/Toggle';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { HeldOffNote } from '@/components/ui/controls/HeldOffNote';
import { withFeaturedClass, withHeldOffClass } from '@/components/ui/controls/activeClass';
import {
  AUDIO_SETTING_SCHEMA,
  VOLUME_SCHEMA,
  MIX_P1_PANEL_SCHEMA,
  MIX_P1_R2_PANEL_SCHEMA,
  MIX_P2_PANEL_SCHEMA,
  MIX_P2_R1_PANEL_SCHEMA,
  SENDS_P1_PANEL_SCHEMA,
  SENDS_LAYOUT,
  SENDS_ROW_PANEL_SCHEMAS,
  PAN_SCHEMA,
  PAN_AUTO_SCHEMA,
  ROBOT_SEND_SCHEMAS,
  DYNAMICS_SCHEMA,
} from '@/data/robotOptionsConfig';
import { ROBOT_SEND_BY_FIELD, ROBOT_SEND_FIELDS, type RobotSendField, type RobotSendSpec } from '@/data/robotSends';
import { PAN_DISPLAY_SCALE, SEND_DISPLAY_SCALE } from '@/constants';
import { roundToDecimals } from '@/utils/math';
import type { Robot } from '@/types/Robot';

import './LevelsSections.css';

export interface AudioSettingValue {
  audioMode: NonNullable<Robot['audioMode']>;
  /** 0..1, matching Robot.masterVolume's own domain — this component converts to/from the
   *  0-100% the Volume slider displays; onVolumeChange still emits the 0-100 percent, matching
   *  robotOptionsActions.applyVolume's own (robot, localeId, pct) signature. */
  masterVolume: number;
  /** -1..1, matching Robot.pan's own domain — this component converts to the -100..100 the Pan slider
   *  displays; onPanChange emits the -100..100 display number (the same contract as onVolumeChange).
   *  Under Auto this is the stored value, not the live readout — see `livePan`. */
  pan: number;
  /** Robot.panAuto: true follows the robot across the field (the slider is a read-only readout),
   *  false holds `pan` (the slider is interactive). */
  panAuto: boolean;
  /** 0..1, matching Robot.reverbSend's own domain - how much of this robot's sound goes into the shared Reverb. This
   *  component converts to the 0-100% the Reverb slider displays (x SEND_DISPLAY_SCALE); onSendChange emits the
   *  0-100 display number (the same contract as onVolumeChange). docs/specs/ROBOT_SENDS.md §1.6. */
  reverbSend: number;
  /** 0..1, Robot.delaySend's own domain - the Delay twin of `reverbSend`. */
  delaySend: number;
  /** 0..1, Robot.gritSend / shimmerSend / doubleSend - the sends into the Colour, Shifter and Chorus rooms, on
   *  `reverbSend`'s display contract (docs/specs/ROBOT_EFFECT_SENDS.md §1.6). */
  gritSend: number;
  shimmerSend: number;
  doubleSend: number;
  /** 0..100 as stored (Robot.dynamics): how much this robot's note velocities swing. No conversion - the slider shows it as is.
   *  docs/specs/ROBOT_PERFORMANCE.md §1.6. */
  dynamics: number;
}

/** Every Levels prop, both halves' together; each half picks its own (docs/specs/CONTENT_LAYOUT.md §1.3). */
interface LevelsProps {
  value: AudioSettingValue;
  onAudioModeChange: (mode: Robot['audioMode']) => void;
  onVolumeChange: (pct: number) => void;
  /** -100..100, the same display-domain contract as onVolumeChange. Only fires with Auto off. */
  onPanChange: (display: number) => void;
  onPanAutoChange: (auto: boolean) => void;
  /** 0..100, the display-domain contract of onVolumeChange, for whichever send row moved: one handler for the five rows
   *  (docs/specs/ROBOT_SEND_TABLE.md §1.4). */
  onSendChange: (field: RobotSendField, pct: number) => void;
  /** 0..100, emitted as the whole number the slider shows (Robot.dynamics stores it unconverted). */
  onDynamicsChange: (value: number) => void;
  /** The engine's live Auto value (-0.5..0.5) for the robot screen; undefined on the company screen and
   *  whenever Auto is off. Kept out of `value` so the readout's few-times-a-second updates re-render only
   *  this section (docs/specs/ROBOT_PAN.md §1.4). */
  livePan?: number;
  disabled?: boolean;
  /** True while an Audio Swell is actively riding this robot's (or company's) volume — forwarded
   *  straight to the Volume slider's own `swelling` prop. See useEasedControlValue.ts and
   *  audioSwells.ts's isRobotAttributeSwelling. */
  volumeSwelling?: boolean;
  /** Per send, true while an Audio Swell rides it (isRobotAttributeSwelling(id, field)), forwarded to that row's own
   *  `swelling` so a swell tick is not eased a second time (docs/tasks/ROBOT_SENDS.md Task 13,
   *  docs/specs/ROBOT_SEND_TABLE.md §1.4). Absent means no row is swelling. */
  sendSwelling?: Readonly<Record<RobotSendField, boolean>>;
  /** Per send, true while the Audio Load dial holds the send's room dark, so the row does nothing: it is dimmed, its value
   *  kept, with one HeldOffNote under the send rows (useHeldOffSends; docs/specs/LIGHT_TIER_STANDING_COST.md §1.4).
   *  Absent means every send is live. */
  heldOffSends?: Readonly<Record<RobotSendField, boolean>>;
}

/** A stored 0..1 send as the slider's 0-100 number. Rounded to two places so the x100 leaves no float noise (0.29 would
 *  otherwise reach the slider, and a screen reader, as 28.999999999999996) while a swell's fractional percent survives. */
const toSendDisplay = (send: number) => roundToDecimals(send * SEND_DISPLAY_SCALE, 2);

interface SendRowProps {
  spec: RobotSendSpec;
  /** The 0-100 % the row's slider shows (toSendDisplay of the stored send), so the row's memo compares what is shown and
   *  a stored change below two decimals of a percent re-renders nothing, as the hand-written rows' did. */
  display: number;
  onSendChange: (field: RobotSendField, pct: number) => void;
  swelling?: boolean;
  disabled?: boolean;
  /** The row's room is held dark by the Audio Load dial: dimmed and disabled, its value kept. */
  heldOff?: boolean;
}

/**
 * One send row (docs/specs/ROBOT_SEND_TABLE.md §1.4): a plain block wrapper named by the engine key (useVoxelTrackSlider
 * measures its own wrapper and needs a block box, the Volume row's reason; the class has no CSS rule of its own - a stable
 * hook only) around the row's slider. A memo'd child, so editing one send re-renders that row alone, as the five
 * hand-written rows did; the memo is what keeps the row's onChange closure stable (it is rebuilt only when a prop of this
 * row changes, when the slider re-renders anyway), so no useCallback. Exported for its memo test only.
 */
export const SendRow = memo(function SendRow({ spec, display, onSendChange, swelling, disabled, heldOff = false }: SendRowProps) {
  return (
    <div className={withHeldOffClass(`levels-sections__${spec.engineKey}-row`, heldOff)}>
      <SliderLinear
        schema={ROBOT_SEND_SCHEMAS[spec.field]}
        value={display}
        onChange={(pct) => onSendChange(spec.field, pct)}
        disabled={disabled || heldOff}
        swelling={swelling}
      />
    </div>
  );
});

/** Volume's cell: the wrapper plus `sc-featured` (docs/specs/CONTENT_LAYOUT.md §1.4). */
const VOLUME_CELL = withFeaturedClass('levels-sections__volume-row', VOLUME_SCHEMA);

type LevelsMixProps = Pick<
  LevelsProps,
  'onAudioModeChange' | 'onVolumeChange' | 'onPanChange' | 'onPanAutoChange' | 'onDynamicsChange' | 'livePan' | 'disabled' | 'volumeSwelling'
> & { value: Pick<AudioSettingValue, 'audioMode' | 'masterVolume' | 'pan' | 'panAuto' | 'dynamics'> };

/**
 * Levels > Mix (docs/specs/CONTENT_LAYOUT.md §1.3): two boxes. P1 is Volume, then Monitor Mode beside Dynamics (a
 * 'responsive' row); P2 is Pan beside its Auto toggle (a fixed row). A pure value/onChange component, shared by the
 * robot screen and the company broadcast, like every Robot Options section.
 *
 * Every slider sits in a wrapper with no display rule: useVoxelTrackBoxCount measures its own wrapper and needs a plain
 * block box (a display:flex wrapper, 'levels-sections__row', shrinks a lone slider to its label's width; found
 * live by Crawford). The radio's wrapper is that flex row.
 */
export const LevelsMixSection = memo(function LevelsMixSection({
  value, onAudioModeChange, onVolumeChange, onPanChange, onPanAutoChange, onDynamicsChange, livePan, disabled, volumeSwelling,
}: LevelsMixProps) {
  // Bugfix, found live (docs/todo/backlog.md #27 follow-up, 2026-09-15): this used to be a fresh
  // inline closure built every render — so editing Volume changed `value`'s own reference,
  // re-executing this component, which then handed the already-memoized RadioButton a new
  // `onChange` regardless of whether audioMode itself changed, defeating its memo.
  const handleAudioModeChange = useCallback(
    (v: string) => onAudioModeChange(v as Robot['audioMode']),
    [onAudioModeChange],
  );

  return (
    <div className="levels-sections__mix">
      <DirectionalPanel schema={MIX_P1_PANEL_SCHEMA}>
        <div className={VOLUME_CELL}>
          <SliderLinear schema={VOLUME_SCHEMA} value={value.masterVolume * 100} onChange={onVolumeChange} disabled={disabled} swelling={volumeSwelling} />
        </div>
        <DirectionalPanel schema={MIX_P1_R2_PANEL_SCHEMA}>
          <div className="levels-sections__row">
            <RadioButton
              schema={AUDIO_SETTING_SCHEMA}
              value={value.audioMode}
              onChange={handleAudioModeChange}
              disabled={disabled}
            />
          </div>
          {/* Dynamics (docs/specs/ROBOT_PERFORMANCE.md §1.6). No `swelling`: Dynamics is not a swell attribute. */}
          <div className="levels-sections__dynamics-row">
            <SliderLinear schema={DYNAMICS_SCHEMA} value={value.dynamics} onChange={onDynamicsChange} disabled={disabled} />
          </div>
        </DirectionalPanel>
      </DirectionalPanel>
      {/* Pan: the row panel supplies the flex (slider grows, the toggle holds its own 44px box). The slider is a live
          readout while Auto is on (livePan, else the stored pan) and interactive while it is off. No `swelling`: the
          readout arrives a few times a second and useEasedControlValue's 250ms ease is the right smoothing for that
          cadence (docs/specs/ROBOT_PAN.md §1.5). */}
      <DirectionalPanel schema={MIX_P2_PANEL_SCHEMA}>
        <DirectionalPanel schema={MIX_P2_R1_PANEL_SCHEMA}>
          <div className="levels-sections__pan-slider">
            <SliderCenteredZero
              schema={PAN_SCHEMA}
              value={(value.panAuto ? (livePan ?? value.pan) : value.pan) * PAN_DISPLAY_SCALE}
              onChange={onPanChange}
              readOnly={value.panAuto}
              disabled={disabled}
            />
          </div>
          <Toggle schema={PAN_AUTO_SCHEMA} value={value.panAuto} onChange={onPanAutoChange} disabled={disabled} />
        </DirectionalPanel>
      </DirectionalPanel>
    </div>
  );
});

type LevelsSendsProps = Pick<LevelsProps,'onSendChange' | 'disabled' | 'sendSwelling' | 'heldOffSends'> & {
  value: Pick<AudioSettingValue, RobotSendField>;
};

/**
 * Levels > Sends (docs/specs/CONTENT_LAYOUT.md §1.3): one box of the five sends (docs/specs/ROBOT_SENDS.md §1.6,
 * ROBOT_EFFECT_SENDS.md §1.6), laid out by SENDS_LAYOUT: Reverb beside Delay, Grit beside Shimmer, then Double. One
 * SendRow per send; the held-off note, when any send's room is held dark, at the foot of the box.
 */
export const LevelsSendsSection = memo(function LevelsSendsSection({
  value, onSendChange, disabled, sendSwelling, heldOffSends,
}: LevelsSendsProps) {
  const sendRow = (field: RobotSendField) => (
    <SendRow
      key={field}
      spec={ROBOT_SEND_BY_FIELD[field]}
      display={toSendDisplay(value[field])}
      onSendChange={onSendChange}
      swelling={sendSwelling?.[field]}
      disabled={disabled}
      heldOff={heldOffSends?.[field]}
    />
  );
  return (
    <DirectionalPanel schema={SENDS_P1_PANEL_SCHEMA}>
      {SENDS_LAYOUT.map((row, i) => {
        const rowSchema = SENDS_ROW_PANEL_SCHEMAS[i];
        return rowSchema
          ? <DirectionalPanel key={rowSchema.id} schema={rowSchema}>{row.map(sendRow)}</DirectionalPanel>
          : row.map(sendRow);
      })}
      {ROBOT_SEND_FIELDS.some((field) => heldOffSends?.[field]) && <HeldOffNote />}
    </DirectionalPanel>
  );
});

