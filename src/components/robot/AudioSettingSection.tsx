import type { CSSProperties } from 'react';
import { memo, useCallback, useMemo } from 'react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { HeldOffNote } from '@/components/ui/controls/HeldOffNote';
import { Lfo } from '@/components/ui/controls/Lfo';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { useLfoTargetGroup } from '@/components/ui/controls/useLfoTargetGroup';
import { withActiveClass } from '@/components/ui/controls/activeClass';
import {
  AUDIO_SETTING_SCHEMA,
  VOLUME_SCHEMA,
  VOLUME_ACCORDION_SCHEMA,
  VOLUME_ROW_PANEL_SCHEMA,
  VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA,
} from '@/data/robotOptionsConfig';
import type { Robot } from '@/types/Robot';
import type { LfoSchema, LfoValue } from '@/types/controls';

import './AudioSettingSection.css';

export interface AudioSettingValue {
  audioMode: NonNullable<Robot['audioMode']>;
  /** 0..1, matching Robot.masterVolume's own domain — this component converts to/from the
   *  0-100% the Volume slider displays; onVolumeChange still emits the 0-100 percent, matching
   *  robotOptionsActions.applyVolume's own (robot, localeId, pct) signature. */
  masterVolume: number;
  volumeLfo: LfoValue;
}

interface AudioSettingSectionProps {
  value: AudioSettingValue;
  onAudioModeChange: (mode: Robot['audioMode']) => void;
  onVolumeChange: (pct: number) => void;
  onVolumeLfoChange: (value: LfoValue) => void;
  disabled?: boolean;
  /** Audio Load Budget: this robot's Volume LFO is held off by the dial — its LFO frame greys out (values kept) with a label.
   *  A plain prop, not a store read: this component stays presentational, and the company panel simply omits it. */
  volumeLfoHeldOff?: boolean;
  /** Optional inline style forwarded to this section's own AccordionContainer — trait-color
   *  scoping (getTraitColorStyle('output'), Roadmap Phase 14), applied identically at both the
   *  RobotOptionsTab and CompanyOptionsSection call sites — this section always renders in
   *  Output, whether it's editing one robot or a company's bulk baseline. See
   *  docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5. */
  style?: CSSProperties;
}

/**
 * Robot Options' editable Audio Setting + Volume (+ its LFO display) block — extracted out of
 * RobotDisplaySection (Roadmap Phase 10) into its own presentational component so both the
 * single-robot screen and the company-broadcast panel can render the exact same controls, bound
 * to different value/onChange sources. No `robot` prop, no store access — a pure value/onChange
 * component, same contract every other refactored Robot Options section uses.
 *
 * Wrapped in its own Volume accordion (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.2) — the
 * one Robot Options section that didn't have an accordion before this phase. Volume renders
 * through `useLfoTargetGroup` called directly (the hook, not the shared `<LfoTargetGroup>`
 * wrapper component) so this component can hand-compose a layout `LfoTargetGroup` has no way to
 * produce on its own: Audio Setting + Volume stacked in one column, beside (desktop) or above
 * (mobile/tablet) the shared Lfo display — the same escape hatch `AudioRigLfoGroup`
 * (`AudioRigDrawer.tsx`) already uses for its own custom composition needs. There's only one
 * field to target ('volume'), so `selected`/`isTargeted` are effectively constant, but the same
 * click/focus-to-select wiring is kept for consistency with every other LFO-tied control group.
 */
function AudioSettingSectionInner({ value, onAudioModeChange, onVolumeChange, onVolumeLfoChange, disabled, volumeLfoHeldOff, style }: AudioSettingSectionProps) {
  const { transitioning, select, isTargeted, displayValue, displayLabel } = useLfoTargetGroup({
    groupId: 'robotOptions.volume',
    fields: [{ field: 'volume', label: VOLUME_SCHEMA.humanLabel!, lfoValue: value.volumeLfo }],
  });

  // Memoized (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1) — this used to be constructed
  // fresh, inline, on every render, unlike every other primitive's schema in this codebase, which
  // is always a stable reference. Keyed on displayLabel alone, matching Lfo.tsx's own
  // schema.id-keying precedent for its 3 internal schemas — 'id'/'type' are literal constants.
  // loreLabel: OSCILLATION — docs/reference/ROBOT_DATA_GRID.md's "LFO MODULE" row, same fixed
  // group-level term LfoTargetGroup.tsx's own lfoSchema now uses.
  const lfoSchema: LfoSchema = useMemo(
    () => ({ id: 'robotOptions.volume.lfo', type: 'lfo', loreLabel: 'OSCILLATION', humanLabel: displayLabel }),
    [displayLabel],
  );

  // Bugfix, found live (docs/todo/backlog.md #27 follow-up, 2026-09-15): this used to be a fresh
  // inline closure built every render — so editing Volume (or VolumeLfo) changed `value`'s own
  // reference, re-executing this component, which then handed the already-memoized RadioButton a
  // new `onChange` regardless of whether audioMode itself changed, defeating its memo.
  const handleAudioModeChange = useCallback(
    (v: string) => onAudioModeChange(v as Robot['audioMode']),
    [onAudioModeChange],
  );

  return (
    <AccordionContainer schema={VOLUME_ACCORDION_SCHEMA} style={style}>
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
              text width instead of the row's real available width. */}
          <div
            className={withActiveClass('sc-lfo-target-group__row', isTargeted('volume'))}
            onClick={() => select('volume')}
            onFocus={() => select('volume')}
          >
            <SliderLinear schema={VOLUME_SCHEMA} value={value.masterVolume * 100} onChange={onVolumeChange} disabled={disabled} />
          </div>
        </DirectionalPanel>
        <div className={withActiveClass('sc-lfo-target-group__display', transitioning)}>
          <Lfo
            schema={lfoSchema}
            value={displayValue}
            onChange={onVolumeLfoChange}
            disabled={disabled || transitioning || volumeLfoHeldOff}
          />
          {volumeLfoHeldOff && <HeldOffNote />}
        </div>
      </DirectionalPanel>
    </AccordionContainer>
  );
}

// React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1)
export const AudioSettingSection = memo(AudioSettingSectionInner);

export default AudioSettingSection;
