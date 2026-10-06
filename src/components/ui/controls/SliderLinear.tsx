import { memo, useMemo, useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';

import { DualLabel } from './DualLabel';
import { VoxelTrack } from './VoxelTrack';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import { useAutoSliderOrientation } from './useAutoSliderOrientation';
import { useVoxelTrackSlider } from './useVoxelTrackSlider';
import { useEasedControlValue } from './useEasedControlValue';
import { computeVoxelBoxStates } from '@/utils/voxelTrackMath';
import type { SliderLinearSchema } from '@/types/controls';
import './SliderLinear.css';

interface SliderLinearProps {
  schema: SliderLinearSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** On a vertical slider, the box-count-fitting BUDGET (not a literal
   *  applied length — see docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md
   *  §1.7) box count fits within, instead of a live ResizeObserver
   *  measurement of the parent. Omit to fit against the fixed
   *  VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT budget instead — never a live
   *  parent measurement (roadmap 13: that path is circular for this
   *  element's own shrink-wrapped parent and is no longer reachable in
   *  production). Every real vertical consumer now passes this explicitly,
   *  sourced from its own schema's `verticalHeight` field. */
  verticalHeight?: number;
  /**
   * Roadmap 15.1: renders as a live, non-interactive value readout instead
   * of an interactive slider — role="status", no Slider.Root/Track/Thumb,
   * no drag/keyboard interaction, not a tab stop. Visually identical
   * VoxelTrack fill/colors to the interactive rendering (never desaturated
   * the way a functionally-disabled section is elsewhere in this app).
   * `onChange` is still required but is never called in this mode. Takes
   * precedence over `disabled` if both are somehow passed — see
   * docs/specs/SLIDER_LINEAR_READ_ONLY.md §1.5.
   */
  readOnly?: boolean;
  /** True while an Audio Swell is actively riding this exact control (audioSwells.ts's
   *  isGlobalTargetSwelling/isRobotAttributeSwelling) — forwarded straight to
   *  useEasedControlValue so its visual ease steps aside for a swell's own already-smooth ramp
   *  instead of stacking a second, independent one on top. See useEasedControlValue.ts. */
  swelling?: boolean;
  /** Overrides the live, breakpoint-tier voxel box size with a fixed value at every tier —
   *  for a read-only consumer that wants a smaller, constant footprint regardless of viewport
   *  (e.g. the battery readout). Omitted, box size tracks the current CabinetTier as usual. */
  boxSize?: number;
  gapSize?: number;
}

/**
 * Linear-scale slider, rendering through the shared voxel-track system
 * (roadmap Phase 11.1.3) — a row of uniform CabinetBox facades in place of
 * the traditional track+handle, self-fitting its own box count live to
 * whatever space its container gives it. All 3 SliderOrientation values.
 * See docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md for the full derivation.
 * `readOnly` (roadmap 15.1) renders a second, non-interactive branch below —
 * see docs/specs/SLIDER_LINEAR_READ_ONLY.md for the full derivation.
 *
 * Renders its own `displayValue` (a locally-eased copy of `value`), never `value` directly —
 * see useEasedControlValue.ts for the full derivation (shared by all 3 slider primitives).
 */
function SliderLinearInner({ schema, value, onChange, disabled, verticalHeight, readOnly, swelling, boxSize: boxSizeOverride, gapSize: gapSizeOverride }: SliderLinearProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
  const isVertical = orientation === 'vertical';
  const { boxSize, gap, boxCount, rootStyle } = useVoxelTrackSlider(wrapperRef, orientation, verticalHeight, { boxSizeOverride, gapSizeOverride });

  const { displayValue, handleValueChange } = useEasedControlValue(value, swelling);

  // Memoized so VoxelTrack's own React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 5)
  // can bail on an unchanged states reference — computeVoxelBoxStates is a pure function that
  // otherwise returns a fresh array every render.
  const states = useMemo(
    () => computeVoxelBoxStates(displayValue, schema.min, schema.max, boxCount),
    [displayValue, schema.min, schema.max, boxCount],
  );

  // Computed once and shared: the visible readout and the thumb's aria-valuetext must never disagree.
  const formattedValue = schema.formatValue?.(displayValue);

  const valueLabel = (
    <span className="sc-slider-linear__value">
      {schema.formatValue ? formattedValue : `${formatDisplayValue(displayValue)}${schema.unit ?? ''}`}
    </span>
  );

  if (readOnly) {
    return (
      <div ref={wrapperRef} className="sc-slider-linear" data-orientation={orientation} data-readonly="true" role="status">
        <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
        {isVertical && valueLabel}
        <div className="sc-slider-linear__root" data-orientation={orientation} style={rootStyle}>
          <div className="sc-slider-linear__track" data-orientation={orientation}>
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
    <div ref={wrapperRef} className="sc-slider-linear" data-orientation={orientation}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      {isVertical && valueLabel}
      <Slider.Root
        className="sc-slider-linear__root"
        orientation={orientation}
        min={schema.min}
        max={schema.max}
        step={schema.step ?? 1}
        value={[displayValue]}
        onValueChange={(values) => handleValueChange(values[0], onChange)}
        disabled={disabled}
        style={rootStyle}
      >
        <Slider.Track className="sc-slider-linear__track">
          <Slider.Range className="sc-slider-linear__range" />
          <VoxelTrack
            states={states}
            boxSize={boxSize}
            gap={gap}
            axis={orientation}
            timelineKeyPrefix={`cabinet-voxel-${schema.id}`}
          />
        </Slider.Track>
        {/* aria-valuetext only when the schema formats its value (Sync mode's note names): Radix exposes
            just the numeric index through aria-valuenow, which a screen reader would read as "5". Omitted
            otherwise, so every plain slider's markup is unchanged. */}
        <Slider.Thumb className="sc-slider-linear__thumb" aria-label={resolveAccessibleName(schema)} aria-valuetext={formattedValue} />
      </Slider.Root>
      {!isVertical && valueLabel}
    </div>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 1 correction) — every prop is a
// primitive, a stable schema object, or the onChange callback a caller must keep stable to
// benefit (an implicit performance contract, not a type-level one — see
// docs/COMPONENT_LIBRARY.md).
export const SliderLinear = memo(SliderLinearInner);
