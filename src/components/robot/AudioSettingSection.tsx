import type { CSSProperties } from 'react';
import { memo, useCallback } from 'react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import {
  AUDIO_SETTING_SCHEMA,
  VOLUME_SCHEMA,
  VOLUME_ROW_PANEL_SCHEMA,
  VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA,
} from '@/data/robotOptionsConfig';
import type { Robot } from '@/types/Robot';

import './AudioSettingSection.css';

export interface AudioSettingValue {
  audioMode: NonNullable<Robot['audioMode']>;
  /** 0..1, matching Robot.masterVolume's own domain — this component converts to/from the
   *  0-100% the Volume slider displays; onVolumeChange still emits the 0-100 percent, matching
   *  robotOptionsActions.applyVolume's own (robot, localeId, pct) signature. */
  masterVolume: number;
}

interface AudioSettingSectionProps {
  value: AudioSettingValue;
  onAudioModeChange: (mode: Robot['audioMode']) => void;
  onVolumeChange: (pct: number) => void;
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
function AudioSettingSectionInner({ value, onAudioModeChange, onVolumeChange, disabled, volumeSwelling, style }: AudioSettingSectionProps) {
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
        </DirectionalPanel>
      </DirectionalPanel>
    </div>
  );
}

// React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1)
export const AudioSettingSection = memo(AudioSettingSectionInner);

export default AudioSettingSection;
