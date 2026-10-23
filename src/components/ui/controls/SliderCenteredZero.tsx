import { memo, useMemo, useRef, type KeyboardEvent } from 'react';
import * as Slider from '@radix-ui/react-slider';

import { DualLabel } from './DualLabel';
import { VoxelTrack } from './VoxelTrack';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import { signedLogKeyStep, signedLogTrackValue, signedLogValueToT } from './sliderLogMath';
import { useAutoSliderOrientation } from './useAutoSliderOrientation';
import { useVoxelTrackSlider } from './useVoxelTrackSlider';
import { useEasedControlValue } from './useEasedControlValue';
import { computeVoxelBoxStatesCenteredZero } from '@/utils/voxelTrackMath';
import type { SliderCenteredZeroSchema } from '@/types/controls';
import './SliderCenteredZero.css';

/** A signed-log track's Radix step, for pointer drags: fine enough that every `step` of value is reachable. */
const LOG_TRACK_STEP = 0.001;
const LOG_FORWARD_KEYS = ['ArrowRight', 'ArrowUp', 'PageUp'];
const LOG_BACK_KEYS = ['ArrowLeft', 'ArrowDown', 'PageDown'];

interface SliderCenteredZeroProps {
  schema: SliderCenteredZeroSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** On a vertical slider, the box-count-fitting BUDGET (not a literal
   *  applied length — see useVoxelTrackSlider's forceEven option, which
   *  additionally rounds the fitted count to always be even) the box count
   *  fits within. Omit to fit against the fixed VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT
   *  budget. */
  verticalHeight?: number;
  /** True while an Audio Swell is actively riding this exact control (audioSwells.ts's
   *  isGlobalTargetSwelling/isRobotAttributeSwelling) — forwarded straight to
   *  useEasedControlValue so its visual ease steps aside for a swell's own already-smooth ramp
   *  instead of stacking a second, independent one on top. See useEasedControlValue.ts. */
  swelling?: boolean;
  /** Render a non-interactive readout — role="status", the same VoxelTrack fill, no Radix root, thumb or
   *  tab stop; `onChange` is never called. For a value the system drives and the user may only watch
   *  (the Pan slider while Auto is on, docs/specs/ROBOT_PAN.md). Unlike SliderLinear's readOnly branch it
   *  keeps the help "?" — a readout still wants its explanation. Wins over `disabled`. */
  readOnly?: boolean;
}

/**
 * Zero-anchored slider (Detune, EQ3 bands, LFO Rate/Depth Drift), rendering
 * through the shared voxel-track system (roadmap 11.1.3-11.1.5) — a row of
 * uniform CabinetBox facades split into two independent halves at a fixed
 * dead-center seam (never the schema's own proportional zero point), each
 * filling outward from the seam toward its own physical end. See
 * docs/specs/archive/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md for the full
 * derivation. Unlike SliderLog, there's no t-curve here — Slider.Root keeps
 * using the schema's literal min/max/value, exactly as before this item.
 *
 * Renders its own `displayValue` (a locally-eased copy of `value`), never `value` directly —
 * see useEasedControlValue.ts for the full derivation (shared by all 3 slider primitives).
 */
function SliderCenteredZeroInner({ schema, value, onChange, disabled, verticalHeight, swelling, readOnly }: SliderCenteredZeroProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
  const isVertical = orientation === 'vertical';
  const { boxSize, gap, boxCount, rootStyle } = useVoxelTrackSlider(wrapperRef, orientation, verticalHeight, {
    forceEven: true,
  });

  const { displayValue, handleValueChange } = useEasedControlValue(value, swelling);

  // A signed-log schema (logKnee) runs the thumb and the fill on the track position t (-1..1) instead of the value.
  const { min, max, logKnee } = schema;
  const step = schema.step ?? 1;
  const trackValue = logKnee === undefined ? displayValue : signedLogValueToT(displayValue, min, max, logKnee);
  const [trackMin, trackMax] = logKnee === undefined ? [min, max] : [-1, 1];

  // Memoized so VoxelTrack's own React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 5)
  // can bail on an unchanged states reference — computeVoxelBoxStatesCenteredZero is a pure
  // function that otherwise returns a fresh array every render.
  const states = useMemo(
    () => computeVoxelBoxStatesCenteredZero(trackValue, trackMin, trackMax, boxCount),
    [trackValue, trackMin, trackMax, boxCount],
  );

  const valueText = `${formatDisplayValue(displayValue)}${schema.unit ?? ''}`;
  const valueLabel = <span className="sc-slider-centered-zero__value">{valueText}</span>;

  // On a signed-log track Radix's own step is a sliver of track, which near zero rounds back to the value it left, so
  // the arrow and page keys are stepped here instead (Radix skips its own handler once this one prevents the default).
  // Home and End stay Radix's: the track ends are the bounds.
  const handleLogKeyDown =
    logKnee === undefined
      ? undefined
      : (event: KeyboardEvent) => {
          const direction = LOG_FORWARD_KEYS.includes(event.key) ? 1 : LOG_BACK_KEYS.includes(event.key) ? -1 : 0;
          if (direction === 0 || disabled) return;
          event.preventDefault();
          const page = event.key === 'PageUp' || event.key === 'PageDown' || event.shiftKey;
          handleValueChange(signedLogKeyStep(value, direction, page, min, max, logKnee, step), onChange);
        };

  // Every hook above runs in both branches, so toggling readOnly never changes the hook order and the
  // eased displayValue carries across. Mirrors SliderLinear.tsx's readOnly branch (roadmap 15.1).
  if (readOnly) {
    return (
      <div ref={wrapperRef} className="sc-slider-centered-zero" data-orientation={orientation} data-readonly="true" role="status">
        <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} help={schema.help} />
        {isVertical && valueLabel}
        <div className="sc-slider-centered-zero__root" data-orientation={orientation} style={rootStyle}>
          <div className="sc-slider-centered-zero__track" data-orientation={orientation}>
            <VoxelTrack
              states={states}
              boxSize={boxSize}
              gap={gap}
              axis={orientation}
              timelineKeyPrefix={`cabinet-voxel-${schema.id}`}
            />
          </div>
        </div>
        {!isVertical && valueLabel}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="sc-slider-centered-zero" data-orientation={orientation}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} help={schema.help} />
      {isVertical && valueLabel}
      <Slider.Root
        className="sc-slider-centered-zero__root"
        orientation={orientation}
        min={trackMin}
        max={trackMax}
        step={logKnee === undefined ? step : LOG_TRACK_STEP}
        value={[trackValue]}
        onValueChange={(values) =>
          handleValueChange(
            logKnee === undefined ? values[0] : signedLogTrackValue(values[0], min, max, logKnee, step),
            onChange,
          )
        }
        onKeyDown={handleLogKeyDown}
        disabled={disabled}
        style={rootStyle}
      >
        <Slider.Track className="sc-slider-centered-zero__track">
          <Slider.Range className="sc-slider-centered-zero__range" />
          <VoxelTrack
            states={states}
            boxSize={boxSize}
            gap={gap}
            axis={orientation}
            timelineKeyPrefix={`cabinet-voxel-${schema.id}`}
          />
        </Slider.Track>
        {/* aria-valuetext only on a signed-log track, where aria-valuenow is the track position, not the value. */}
        <Slider.Thumb
          className="sc-slider-centered-zero__thumb"
          aria-label={resolveAccessibleName(schema)}
          aria-valuetext={logKnee === undefined ? undefined : valueText}
        />
      </Slider.Root>
      {!isVertical && valueLabel}
    </div>
  );
}

// React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 3 correction) — every prop is a
// primitive, a stable schema object, or the onChange callback a caller must keep stable to
// benefit.
export const SliderCenteredZero = memo(SliderCenteredZeroInner);
