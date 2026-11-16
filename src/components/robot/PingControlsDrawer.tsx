import { memo } from 'react';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { Toggle } from '@/components/ui/controls/Toggle';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import {
  CLICK_TRACK_SCHEMA,
  DENSITY_SCHEMA,
  MOTIF_LENGTH_SCHEMA,
  PITCH_REPEAT_SCHEMA,
  OCTAVE_RANGE_MIN_SCHEMA,
  OCTAVE_RANGE_MAX_SCHEMA,
  NOTE_VARIANCE_SCHEMA,
  RESTS_SCHEMA,
  ACCENTS_SCHEMA,
} from '@/data/robotOptionsConfig';
import { DEV_TUNING } from '@/constants';
import type { DirectionalPanelSchema } from '@/types/controls';

import { CONTENT } from '@/content';

export interface PingControlsValue {
  rhythmicDensity: number;
  /**
   * 0-8, min extended down to 0 (docs/specs/archive/STEPPER_TO_SLIDER.md) — 0 is the off state
   * (equivalent to the old rhythmicMotifLength.active === false), reproduced exactly in
   * melodyGenerator.ts. The slider itself is never disabled purely because its value is 0 —
   * there's no separate toggle left to turn it back on, so dragging it back above 0 is the
   * only way. {active, value} reconstruction happens only in robotOptionsActions.ts.
   */
  rhythmicMotifLength: number;
  /** Same off-via-0 shape as rhythmicMotifLength above. */
  noteVariance: number;
  /**
   * 0-100. Increasingly locks a tiled motif's repeated cells to the base cell's pitches. Only
   * meaningful while `rhythmicMotifLength` is nonzero — the slider is disabled whenever it's 0,
   * in addition to the usual `generationDisabled` gate.
   */
  pitchRepeat: number;
  /** 0-100. Chance per event of a rest, and how deep it cuts (docs/specs/ROBOT_PERFORMANCE.md). Baked into the melody. */
  rests: number;
  /** 0-100. Chance per event of an articulation mark, and how many kinds are in play. Baked into the melody. */
  accents: number;
  octaveRange: [number, number];
  /**
   * Testing-only: whether the robot's (or, in company mode, every broadcast member's) real
   * melody is currently overridden by the fixed click-track pattern (see
   * src/engine/clickTrack.ts). This one *is* company-scoped — broadcasting
   * it turns the click track on/off for every member at once, e.g. to check tempo consistency
   * across a whole company. The toggle itself only renders behind `DEV_TUNING` (see below) — a
   * production build can never set this true.
   */
  clickTrackActive: boolean;
}

// ========================================
// COMPOSITION (docs/specs/CONTENT_LAYOUT.md §1.3): two one-box halves, Rhythm & Melody and Details
// ========================================
// Panel schemas hoisted to module scope, same "schema is always a stable reference" convention
// PingContourDrawer.tsx's own TOP_ROW_SCHEMA/BOTTOM_ROW_SCHEMA already establish. A top-level panel is the box; its
// 'responsive' rows sit side by side on desktop and stack below it.
const RHYTHM_MELODY_P1_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.rhythmMelody.p1', type: 'directionalPanel', orientation: 'column' };
const RHYTHM_MELODY_P1_R1_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.rhythmMelody.p1.r1', type: 'directionalPanel', orientation: 'responsive' };
const RHYTHM_MELODY_P1_R2_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.rhythmMelody.p1.r2', type: 'directionalPanel', orientation: 'responsive' };
const DETAILS_P1_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.details.p1', type: 'directionalPanel', orientation: 'column' };
const DETAILS_P1_R1_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.details.p1.r1', type: 'directionalPanel', orientation: 'responsive' };
const DETAILS_P1_R2_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.details.p1.r2', type: 'directionalPanel', orientation: 'responsive' };

type RhythmMelodyProps = Pick<
  CompositionProps,
  'onClickTrackActiveChange' | 'onDensityChange' | 'onMotifLengthChange' | 'onPitchRepeatChange' | 'onNoteVarianceChange' | 'disabled'
> & { value: Pick<PingControlsValue, 'rhythmicDensity' | 'rhythmicMotifLength' | 'pitchRepeat' | 'noteVariance' | 'clickTrackActive'> };

/**
 * Composition > Rhythm & Melody (docs/specs/CONTENT_LAYOUT.md §1.3): one box, Note Density beside Phrase Length, then
 * Pitch Repeat Chance beside Note Variance, then the dev-only Click Track as its last row when the caller passes
 * `onClickTrackActiveChange` (the robot, company and All Probes screens; docs/tasks/ONE_MUSIC_CLOCK.md Tasks 10a and 10b,
 * so the downbeat can be heard). The sliders stay live while it plays: the engine registers the click pattern in place
 * of any melody while the flag is on (`AudioEngine.registerRobotMelody`), so an edit changes the stored melody heard
 * once it is off.
 */
export const CompositionRhythmMelodySection = memo(function CompositionRhythmMelodySection({
  value, onClickTrackActiveChange, onDensityChange, onMotifLengthChange, onPitchRepeatChange, onNoteVarianceChange, disabled,
}: RhythmMelodyProps) {
  // Pitch Repeat still needs a tiled motif to lock cells within — no cell concept exists when
  // Motif Length is off (docs/specs/archive/PITCH_REPEAT.md) — unrelated to the removed Click Track gate.
  const pitchRepeatDisabled = disabled || value.rhythmicMotifLength === 0;
  return (
    <DirectionalPanel schema={RHYTHM_MELODY_P1_SCHEMA}>
      <DirectionalPanel schema={RHYTHM_MELODY_P1_R1_SCHEMA}>
        <SliderLinear schema={DENSITY_SCHEMA} value={value.rhythmicDensity} onChange={onDensityChange} disabled={disabled} />
        <SliderLinear schema={MOTIF_LENGTH_SCHEMA} value={value.rhythmicMotifLength} onChange={onMotifLengthChange} disabled={disabled} />
      </DirectionalPanel>
      <DirectionalPanel schema={RHYTHM_MELODY_P1_R2_SCHEMA}>
        <SliderLinear schema={PITCH_REPEAT_SCHEMA} value={value.pitchRepeat} onChange={onPitchRepeatChange} disabled={pitchRepeatDisabled} />
        {/* The wrapper held the retired "Pitches" scroll anchor (docs/tasks/LAYOUT_REWORK.md Task 18);
            kept so the row lays out exactly as it did. */}
        <div>
          <SliderLinear schema={NOTE_VARIANCE_SCHEMA} value={value.noteVariance} onChange={onNoteVarianceChange} disabled={disabled} />
        </div>
      </DirectionalPanel>
      {DEV_TUNING && onClickTrackActiveChange && (
        <Toggle schema={CLICK_TRACK_SCHEMA} value={value.clickTrackActive} onChange={onClickTrackActiveChange} disabled={disabled}>
          {CONTENT['probe.composition.clickTrack'].human}
        </Toggle>
      )}
    </DirectionalPanel>
  );
});

type DetailsProps = Pick<
  CompositionProps,
  'onRestsChange' | 'onAccentsChange' | 'onOctaveMinChange' | 'onOctaveMaxChange' | 'disabled'
> & { value: Pick<PingControlsValue, 'rests' | 'accents' | 'octaveRange'> };

/**
 * Composition > Details (docs/specs/CONTENT_LAYOUT.md §1.3): one box, Rests beside Accents (docs/specs/ROBOT_PERFORMANCE.md
 * §1.6; a plain row now, the Articulation panel and its heading gone), then Octave Min beside Octave Max. Neither Rests
 * nor Accents needs a tiled motif, so unlike Pitch Repeat they are gated by `disabled` alone.
 */
export const CompositionDetailsSection = memo(function CompositionDetailsSection({
  value, onRestsChange, onAccentsChange, onOctaveMinChange, onOctaveMaxChange, disabled,
}: DetailsProps) {
  const [octMin, octMax] = value.octaveRange;
  return (
    <DirectionalPanel schema={DETAILS_P1_SCHEMA}>
      <DirectionalPanel schema={DETAILS_P1_R1_SCHEMA}>
        <SliderLinear schema={RESTS_SCHEMA} value={value.rests} onChange={onRestsChange} disabled={disabled} />
        <SliderLinear schema={ACCENTS_SCHEMA} value={value.accents} onChange={onAccentsChange} disabled={disabled} />
      </DirectionalPanel>
      <DirectionalPanel schema={DETAILS_P1_R2_SCHEMA}>
        <SliderLinear schema={OCTAVE_RANGE_MIN_SCHEMA} value={octMin} onChange={onOctaveMinChange} disabled={disabled} />
        <SliderLinear schema={OCTAVE_RANGE_MAX_SCHEMA} value={octMax} onChange={onOctaveMaxChange} disabled={disabled} />
      </DirectionalPanel>
    </DirectionalPanel>
  );
});

/** Every Composition prop, both halves' together; each half picks its own (docs/specs/CONTENT_LAYOUT.md §1.3). */
interface CompositionProps {
  value: Pick<PingControlsValue, 'rhythmicDensity' | 'rhythmicMotifLength' | 'pitchRepeat' | 'noteVariance' | 'octaveRange' | 'rests' | 'accents' | 'clickTrackActive'>;
  /** The dev-only Click Track toggle renders only when this is given (the robot screen, and the company and All
   *  Probes screens' broadcast, docs/tasks/ONE_MUSIC_CLOCK.md Task 10b) and DEV_TUNING is on. */
  onClickTrackActiveChange?: (active: boolean) => void;
  onDensityChange: (value: number) => void;
  onMotifLengthChange: (value: number) => void;
  onPitchRepeatChange: (value: number) => void;
  onOctaveMinChange: (value: number) => void;
  onOctaveMaxChange: (value: number) => void;
  onNoteVarianceChange: (value: number) => void;
  onRestsChange: (value: number) => void;
  onAccentsChange: (value: number) => void;
  disabled?: boolean;
}
