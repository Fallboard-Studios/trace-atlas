import { memo, useMemo, useRef, type KeyboardEvent } from 'react';
import * as Slider from '@radix-ui/react-slider';

import { DualLabel } from './DualLabel';
import { VoxelTrack } from './VoxelTrack';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import { sliderLogKeyStep, sliderLogTToValue, sliderLogValueToT, stepsTToValue, stepsValueToT } from './sliderLogMath';
import { useAutoSliderOrientation } from './useAutoSliderOrientation';
import { useVoxelTrackSlider } from './useVoxelTrackSlider';
import { useEasedControlValue } from './useEasedControlValue';
import { computeVoxelBoxStates } from '@/utils/voxelTrackMath';
import type { SliderLogSchema } from '@/types/controls';
import './SliderLog.css';

/** The continuous track's Radix step, for pointer drags: a thousandth of the track. */
const LOG_TRACK_STEP = 0.001;
const LOG_FORWARD_KEYS = ['ArrowRight', 'ArrowUp', 'PageUp'];
const LOG_BACK_KEYS = ['ArrowLeft', 'ArrowDown', 'PageDown'];

interface SliderLogProps {
  schema: SliderLogSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** On a vertical slider, the box-count-fitting BUDGET (not a literal
   *  applied length — see docs/specs/archive/OBLIQUE_CABINETRY_SLIDER_LOG.md §1.4)
   *  box count fits within, instead of a live ResizeObserver measurement of
   *  the parent. Omit to fit against the fixed VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT
   *  budget. */
  verticalHeight?: number;
  /** True while an Audio Swell is actively riding this exact control (audioSwells.ts's
   *  isGlobalTargetSwelling/isRobotAttributeSwelling) — forwarded straight to
   *  useEasedControlValue so its visual ease steps aside for a swell's own already-smooth ramp
   *  instead of stacking a second, independent one on top. See useEasedControlValue.ts. */
  swelling?: boolean;
}

/**
 * Logarithmic-scale slider (Attack/Decay/Release: 0s-10s "Logarithmic
 * scaling"), rendering through the shared voxel-track system (roadmap
 * 11.1.3/11.1.4) — a row of uniform CabinetBox facades in place of the
 * traditional track+handle, self-fitting its own box count live to
 * whatever space its container gives it, same as SliderLinear. Box
 * placement uses this component's own normalized t (the same value already
 * fed to Radix's own Slider.Root), not the raw log-scaled value — see
 * docs/specs/archive/OBLIQUE_CABINETRY_SLIDER_LOG.md §1.3. sliderLogMath's actual
 * curve is unchanged. `schema.steps`, when present, swaps that continuous curve for a fixed set
 * of allowed values evenly spaced by index (sliderLogMath's stepsValueToT/stepsTToValue) — e.g.
 * Automation Rate's specific frequencies — everything else (VoxelTrack rendering, Radix wiring,
 * formatValue) is unaffected either way.
 *
 * Renders its own `displayValue` (a locally-eased copy of `value`), never `value` directly —
 * see useEasedControlValue.ts for the full derivation (shared by all 3 slider primitives). `t` is
 * derived from `displayValue`, so the thumb/VoxelTrack ease smoothly too, not just the label text.
 */
function SliderLogInner({ schema, value, onChange, disabled, verticalHeight, swelling }: SliderLogProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
  const isVertical = orientation === 'vertical';
  const { boxSize, gap, boxCount, rootStyle } = useVoxelTrackSlider(wrapperRef, orientation, verticalHeight);

  const { displayValue, handleValueChange } = useEasedControlValue(value, swelling);

  const t = schema.steps ? stepsValueToT(displayValue, schema.steps) : sliderLogValueToT(displayValue, schema.min, schema.max);
  // Memoized so VoxelTrack's own React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 5)
  // can bail on an unchanged states reference — computeVoxelBoxStates is a pure function that
  // otherwise returns a fresh array every render.
  const states = useMemo(() => computeVoxelBoxStates(t, 0, 1, boxCount), [t, boxCount]);

  // Keyboard. Radix moves one `step` per arrow and ten per page key or Shift+arrow. A `steps` list makes one stop the
  // step, so Radix's own handling walks the stops. The continuous track's step is the pointer's resolution, a
  // thousandth of the track and 1,000 arrow presses end to end, so the arrow and page keys are stepped here instead: a
  // hundredth of the track, a tenth for a page key or Shift+arrow (Radix skips its own handler once this one prevents
  // the default). Home and End stay Radix's: the track ends are the bounds. As SliderCenteredZero's signed-log track.
  const stopCount = schema.steps?.length ?? 0;
  const trackStep = stopCount > 1 ? 1 / (stopCount - 1) : LOG_TRACK_STEP;
  const handleLogKeyDown = schema.steps
    ? undefined
    : (event: KeyboardEvent) => {
        const direction = LOG_FORWARD_KEYS.includes(event.key) ? 1 : LOG_BACK_KEYS.includes(event.key) ? -1 : 0;
        if (direction === 0 || disabled) return;
        event.preventDefault();
        const page = event.key === 'PageUp' || event.key === 'PageDown' || event.shiftKey;
        handleValueChange(sliderLogKeyStep(value, direction, page, schema.min, schema.max), onChange);
      };

  // Computed once and shared: the visible readout and the thumb's aria-valuetext must never disagree.
  const formattedValue = schema.formatValue?.(displayValue);
  const valueLabel = (
    <span className="sc-slider-log__value">
      {schema.formatValue ? formattedValue : `${formatDisplayValue(displayValue)}${schema.unit ?? ''}`}
    </span>
  );

  return (
    <div ref={wrapperRef} className="sc-slider-log" data-orientation={orientation}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} help={schema.help} />
      {isVertical && valueLabel}
      <Slider.Root
        className="sc-slider-log__root"
        orientation={orientation}
        min={0}
        max={1}
        step={trackStep}
        value={[t]}
        onValueChange={(values) => {
          const next = schema.steps ? stepsTToValue(values[0], schema.steps) : sliderLogTToValue(values[0], schema.min, schema.max);
          handleValueChange(next, onChange);
        }}
        onKeyDown={handleLogKeyDown}
        disabled={disabled}
        style={rootStyle}
      >
        <Slider.Track className="sc-slider-log__track">
          <Slider.Range className="sc-slider-log__range" />
          <VoxelTrack
            states={states}
            boxSize={boxSize}
            gap={gap}
            axis={orientation}
            timelineKeyPrefix={`cabinet-voxel-${schema.id}`}
          />
        </Slider.Track>
        {/* aria-valuetext only when the schema formats its value: aria-valuenow is the track position
            t (0..1), so without it a screen reader would announce a fraction, not the readout. */}
        <Slider.Thumb className="sc-slider-log__thumb" aria-label={resolveAccessibleName(schema)} aria-valuetext={formattedValue} />
      </Slider.Root>
      {!isVertical && valueLabel}
    </div>
  );
}

// React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 2 correction) — every prop is a
// primitive, a stable schema object, or the onChange callback a caller must keep stable to
// benefit.
export const SliderLog = memo(SliderLogInner);
