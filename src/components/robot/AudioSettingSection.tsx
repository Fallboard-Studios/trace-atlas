import type { CSSProperties } from 'react';
import { memo, useCallback } from 'react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { Toggle } from '@/components/ui/controls/Toggle';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import {
  AUDIO_SETTING_SCHEMA,
  VOLUME_SCHEMA,
  VOLUME_ROW_PANEL_SCHEMA,
  VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA,
  PAN_SCHEMA,
  PAN_AUTO_SCHEMA,
  PAN_ROW_PANEL_SCHEMA,
  ROBOT_SEND_SCHEMAS,
  DYNAMICS_SCHEMA,
} from '@/data/robotOptionsConfig';
import { ROBOT_SENDS, type RobotSendField, type RobotSendSpec } from '@/data/robotSends';
import { PAN_DISPLAY_SCALE, SEND_DISPLAY_SCALE } from '@/constants';
import { roundToDecimals } from '@/utils/math';
import type { Robot } from '@/types/Robot';

import './AudioSettingSection.css';

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

interface AudioSettingSectionProps {
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
  /** Optional inline style forwarded to this section's own root — trait-color scoping
   *  (getTraitColorStyle('output'), Roadmap Phase 14), applied identically at both the
   *  RobotOptionsTab and CompanyOptionsSection call sites — this section always renders in
   *  Output, whether it's editing one robot or a company's bulk baseline. See
   *  docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5. */
  style?: CSSProperties;
}

/** A stored 0..1 send as the slider's 0-100 number. Rounded to two places so the x100 leaves no float noise (0.29 would
 *  otherwise reach the slider, and a screen reader, as 28.999999999999996) while a swell's fractional percent survives. */
const toSendDisplay = (send: number) => roundToDecimals(send * SEND_DISPLAY_SCALE, 2);

interface SendRowProps {
  spec: RobotSendSpec;
  /** 0..1, the row's stored send. */
  value: number;
  onSendChange: (field: RobotSendField, pct: number) => void;
  swelling?: boolean;
  disabled?: boolean;
}

/**
 * One send row (docs/specs/ROBOT_SEND_TABLE.md §1.4): a plain block wrapper named by the engine key (useVoxelTrackSlider
 * measures its own wrapper and needs a block box, the Volume row's reason; the class has no CSS rule of its own - a stable
 * hook only) around the row's slider. A memo'd child, so editing one send re-renders that row alone, as the five
 * hand-written rows did; the memo is what keeps the row's onChange closure stable (it is rebuilt only when a prop of this
 * row changes, when the slider re-renders anyway), so no useCallback. Exported for its memo test only.
 */
export const SendRow = memo(function SendRow({ spec, value, onSendChange, swelling, disabled }: SendRowProps) {
  return (
    <div className={`audio-setting-section__${spec.engineKey}-row`}>
      <SliderLinear
        schema={ROBOT_SEND_SCHEMAS[spec.field]}
        value={toSendDisplay(value)}
        onChange={(pct) => onSendChange(spec.field, pct)}
        disabled={disabled}
        swelling={swelling}
      />
    </div>
  );
});

/**
 * Robot Options' editable Audio Setting + Volume block — extracted out of RobotDisplaySection
 * (Roadmap Phase 10) into its own presentational component so both the single-robot screen and
 * the company-broadcast panel can render the exact same controls, bound to different
 * value/onChange sources. No `robot` prop, no store access — a pure value/onChange component,
 * same contract every other refactored Robot Options section uses.
 *
 * The Volume LFO display that used to sit below this column is gone — the `volume` LFO target
 * was removed outright (docs/specs/LFO_LOAD_FIX.md assumption 9 / §1.4, Crawford 2026-09-30:
 * "not as impactful as I had hoped"), along with the `volumeLfo`/`onVolumeLfoChange`/
 * `volumeLfoHeldOff` props, the `useLfoTargetGroup` targeting wiring (nothing left to target),
 * and the held-off note. The two-panel column layout is kept as-is so the section renders
 * identically in its own slot and nothing around it reflows.
 *
 * No accordion wrapper as of Task 18's own follow-up (docs/tasks/NAV_LAYOUT_REWRITE.md —
 * this section is a probe's/company's own "Volume" tree leaf per spec §2's mapping table).
 */
function AudioSettingSectionInner({
  value, onAudioModeChange, onVolumeChange, onPanChange, onPanAutoChange, onSendChange, onDynamicsChange, livePan, disabled,
  volumeSwelling, sendSwelling, style,
}: AudioSettingSectionProps) {
  // Bugfix, found live (docs/todo/backlog.md #27 follow-up, 2026-09-15): this used to be a fresh
  // inline closure built every render — so editing Volume changed `value`'s own reference,
  // re-executing this component, which then handed the already-memoized RadioButton a new
  // `onChange` regardless of whether audioMode itself changed, defeating its memo.
  const handleAudioModeChange = useCallback(
    (v: string) => onAudioModeChange(v as Robot['audioMode']),
    [onAudioModeChange],
  );

  return (
    <div className="audio-setting-section" style={style}>
      <DirectionalPanel schema={VOLUME_ROW_PANEL_SCHEMA}>
        <DirectionalPanel schema={VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA}>
          <div className="audio-setting-section__row">
            <RadioButton
              schema={AUDIO_SETTING_SCHEMA}
              value={value.audioMode}
              onChange={handleAudioModeChange}
              disabled={disabled}
            />
          </div>
          {/* No 'audio-setting-section__row' here, deliberately — that class is display:flex,
              which shrinks a lone flex item (the slider) to its own content width instead of the
              row's full width, breaking useVoxelTrackBoxCount's self-observation (the hook
              assumes its own wrapper is "externally determined," i.e. a plain block box). Matches
              audio-rig-drawer__param-row / signature-array-drawer__param elsewhere in the app,
              both of which carry no display rule at all for the exact same reason. Found live by
              Crawford: the slider's own box-count-fitting was locking onto its DualLabel's natural
              text width instead of the row's real available width. The wrapper class below has no
              CSS rule of its own — it exists only as a stable hook for tests and future styling. */}
          <div className="audio-setting-section__volume-row">
            <SliderLinear schema={VOLUME_SCHEMA} value={value.masterVolume * 100} onChange={onVolumeChange} disabled={disabled} swelling={volumeSwelling} />
          </div>
          {/* Pan: a row panel supplies the flex (slider grows, the toggle holds its own 44px box), so the
              slider wrapper carries no display rule — same reason as the Volume row above. The slider is a
              live readout while Auto is on (livePan, else the stored pan) and interactive while it is off.
              No `swelling`: the readout arrives a few times a second and useEasedControlValue's 250ms
              ease is the right smoothing for that cadence (docs/specs/ROBOT_PAN.md §1.5). */}
          <DirectionalPanel schema={PAN_ROW_PANEL_SCHEMA}>
            <div className="audio-setting-section__pan-slider">
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
          {/* The five sends (docs/specs/ROBOT_SENDS.md §1.6, ROBOT_EFFECT_SENDS.md §1.6), after Pan, one SendRow per
              ROBOT_SENDS entry in table order (docs/specs/ROBOT_SEND_TABLE.md §1.4, assumption 2). */}
          {ROBOT_SENDS.map((spec) => (
            <SendRow
              key={spec.field}
              spec={spec}
              value={value[spec.field]}
              onSendChange={onSendChange}
              swelling={sendSwelling?.[spec.field]}
              disabled={disabled}
            />
          ))}
          {/* Dynamics (docs/specs/ROBOT_PERFORMANCE.md §1.6): the last row, after the sends, in a wrapper with no display rule for
              the Volume row's reason. No `swelling`: Dynamics is not a swell attribute. */}
          <div className="audio-setting-section__dynamics-row">
            <SliderLinear schema={DYNAMICS_SCHEMA} value={value.dynamics} onChange={onDynamicsChange} disabled={disabled} />
          </div>
        </DirectionalPanel>
      </DirectionalPanel>
    </div>
  );
}

// React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1)
export const AudioSettingSection = memo(AudioSettingSectionInner);

export default AudioSettingSection;
