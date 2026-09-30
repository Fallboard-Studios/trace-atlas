import { memo, useMemo, useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';

import { DualLabel } from './DualLabel';
import { VoxelTrack } from './VoxelTrack';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import { sliderLogTToValue, sliderLogValueToT, stepsTToValue, stepsValueToT } from './sliderLogMath';
import { useAutoSliderOrientation } from './useAutoSliderOrientation';
import { useVoxelTrackSlider } from './useVoxelTrackSlider';
import { useEasedControlValue } from './useEasedControlValue';
import { computeVoxelBoxStates } from '@/utils/voxelTrackMath';
import type { SliderLogSchema } from '@/types/controls';
import './SliderLog.css';

interface SliderLogProps {
  schema: SliderLogSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** On a vertical slider, the box-count-fitting BUDGET (not a literal
   *  applied length — see docs/specs/OBLIQUE_CABINETRY_SLIDER_LOG.md §1.4)
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
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_LOG.md §1.3. sliderLogMath's actual
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
  // Memoized so VoxelTrack's own React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 5)
  // can bail on an unchanged states reference — computeVoxelBoxStates is a pure function that
  // otherwise returns a fresh array every render.
  const states = useMemo(() => computeVoxelBoxStates(t, 0, 1, boxCount), [t, boxCount]);

  const valueLabel = (
    <span className="sc-slider-log__value">
      {schema.formatValue ? schema.formatValue(displayValue) : `${formatDisplayValue(displayValue)}${schema.unit ?? ''}`}
    </span>
  );

  return (
    <div ref={wrapperRef} className="sc-slider-log" data-orientation={orientation}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      {isVertical && valueLabel}
      <Slider.Root
        className="sc-slider-log__root"
        orientation={orientation}
        min={0}
        max={1}
        step={0.001}
        value={[t]}
        onValueChange={(values) => {
          const next = schema.steps ? stepsTToValue(values[0], schema.steps) : sliderLogTToValue(values[0], schema.min, schema.max);
          handleValueChange(next, onChange);
        }}
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
        <Slider.Thumb className="sc-slider-log__thumb" aria-label={resolveAccessibleName(schema)} />
      </Slider.Root>
      {!isVertical && valueLabel}
    </div>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 2 correction) — every prop is a
// primitive, a stable schema object, or the onChange callback a caller must keep stable to
// benefit.
export const SliderLog = memo(SliderLogInner);
