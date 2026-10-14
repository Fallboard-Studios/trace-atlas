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
  REVERB_SEND_SCHEMA,
  DELAY_SEND_SCHEMA,
} from '@/data/robotOptionsConfig';
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
   *  component converts to the 0-100% the Reverb slider displays (x SEND_DISPLAY_SCALE); onReverbSendChange emits the
   *  0-100 display number (the same contract as onVolumeChange). docs/specs/ROBOT_SENDS.md §1.6. */
  reverbSend: number;
  /** 0..1, Robot.delaySend's own domain - the Delay twin of `reverbSend`. */
  delaySend: number;
}

interface AudioSettingSectionProps {
  value: AudioSettingValue;
  onAudioModeChange: (mode: Robot['audioMode']) => void;
  onVolumeChange: (pct: number) => void;
  /** -100..100, the same display-domain contract as onVolumeChange. Only fires with Auto off. */
  onPanChange: (display: number) => void;
  onPanAutoChange: (auto: boolean) => void;
  /** 0..100, the same display-domain contract as onVolumeChange. */
  onReverbSendChange: (pct: number) => void;
  onDelaySendChange: (pct: number) => void;
  /** The engine's live Auto value (-0.5..0.5) for the robot screen; undefined on the company screen and
   *  whenever Auto is off. Kept out of `value` so the readout's few-times-a-second updates re-render only
   *  this section (docs/specs/ROBOT_PAN.md §1.4). */
  livePan?: number;
  disabled?: boolean;
  /** True while an Audio Swell is actively riding this robot's (or company's) volume — forwarded
   *  straight to the Volume slider's own `swelling` prop. See useEasedControlValue.ts and
   *  audioSwells.ts's isRobotAttributeSwelling. */
  volumeSwelling?: boolean;
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
function AudioSettingSectionInner({ value, onAudioModeChange, onVolumeChange, onPanChange, onPanAutoChange, onReverbSendChange, onDelaySendChange, livePan, disabled, volumeSwelling, style }: AudioSettingSectionProps) {
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
          {/* Reverb and Delay sends (docs/specs/ROBOT_SENDS.md §1.6): two plain slider rows after Pan, each in a
              wrapper with no display rule for the Volume row's reason (useVoxelTrackSlider measures its own wrapper
              and needs a plain block box). The wrapper classes have no CSS rule of their own - stable hooks only. */}
          <div className="audio-setting-section__reverb-row">
            <SliderLinear schema={REVERB_SEND_SCHEMA} value={toSendDisplay(value.reverbSend)} onChange={onReverbSendChange} disabled={disabled} />
          </div>
          <div className="audio-setting-section__delay-row">
            <SliderLinear schema={DELAY_SEND_SCHEMA} value={toSendDisplay(value.delaySend)} onChange={onDelaySendChange} disabled={disabled} />
          </div>
        </DirectionalPanel>
      </DirectionalPanel>
    </div>
  );
}

// React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1)
export const AudioSettingSection = memo(AudioSettingSectionInner);

export default AudioSettingSection;
