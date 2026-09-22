import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { DualLabel } from './DualLabel';
import { RadioButton } from './RadioButton';
import { SliderLinear } from './SliderLinear';
import { withActiveClass } from './activeClass';
import { LFO_SHAPES, LFO_RATE_MIN, LFO_RATE_MAX, LFO_DEPTH_MIN, LFO_DEPTH_MAX } from '@/types/lfo';
import type { LfoSchema, LfoValue, RadioButtonSchema, SliderLinearSchema } from '@/types/controls';
import './Lfo.css';

interface LfoProps {
  schema: LfoSchema;
  value: LfoValue;
  onChange: (value: LfoValue) => void;
  disabled?: boolean;
  /**
   * Audio Load Budget: true when the dial (not any other reason a caller might pass `disabled`)
   * is why this LFO is inert. Every real caller already passes `disabled` too whenever this is
   * true, so this never changes interactivity on its own — it only changes what's DISPLAYED: Rate
   * and Depth both read 0 and Shape shows no selection, instead of the real stored value, so a
   * held-off control reads as visually "off" rather than showing a value that isn't actually
   * running. Also adds the `sc-held-off` class (LfoTargetGroup.css / HeldOffNote.css), which
   * overrides the trait-accent custom properties to a flat white/black look. Never mutates
   * `value` itself — `onChange` still ever fires with the real object, so raising the dial and
   * reconnecting needs no separate restore step. Omitted/false: shows the real value, unchanged.
   */
  heldOff?: boolean;
}

const SHAPE_OPTIONS = LFO_SHAPES.map((shape) => ({ value: shape, label: shape.toUpperCase() }));

/**
 * The Rate slider's own draggable step. Radix's step grid always anchors to
 * `min` (min + n*step) — anchoring at LFO_RATE_MIN (0) gives a clean
 * 0/0.25/0.5/0.75/1.0... grid, the same sequence this always produced, now
 * with an extra rung at the bottom: 0 itself is a real, meaningful value —
 * the LFO's "off" state, replacing the removed OSCILLATION STATE toggle
 * (see lfoEngine.ts's connect/disconnect callers).
 */
const RATE_STEP = 0.05;

/**
 * Composes RadioButton (shape) + two SliderLinears (rate, depth) per the
 * grid's OSCILLATION rows. `LfoValue` is a type-only reuse of the real Phase
 * 0 engine type (src/types/lfo.ts) — no import of src/engine/lfoEngine.ts or
 * any Tone object, so this stays presentation-only. The root also carries a
 * plain `isActive` class, now driven by `rate > 0` rather than a separate
 * flag, so a consumer can still write `.sc-lfo.isActive { ... }`.
 */
function LfoInner({ schema, value, onChange, disabled, heldOff }: LfoProps) {
  // Memoized (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md follow-up, found live via React
  // DevTools "highlight updates"): these 3 schema objects used to be constructed fresh, inline,
  // on every render of Lfo — unlike every other primitive's schema in this codebase, which is
  // always a stable reference. Keyed on schema.id alone; every other input (SHAPE_OPTIONS,
  // LFO_RATE_MIN/MAX, RATE_STEP, LFO_DEPTH_MIN/MAX) is already a module-level constant.
  // loreLabel added on all 3 (docs/reference/ROBOT_DATA_GRID.md's own "LFO MODULE" rows already
  // named these — OSCILLATION SHAPE/RATE/DEPTH — but the † footnote there flagged that copy as
  // never actually wired into this component; now it is, verbatim, no invented text).
  const shapeSchema: RadioButtonSchema = useMemo(
    () => ({ id: `${schema.id}.shape`, type: 'radio', loreLabel: 'OSCILLATION SHAPE', humanLabel: 'Shape', options: SHAPE_OPTIONS }),
    [schema.id],
  );
  // Fixed 'horizontal', never 'auto' — docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3:
  // every LFO slider (this Rate/Depth pair, and Rate Drift/Depth Drift alongside it)
  // is always horizontal, each its own row, at every breakpoint.
  const rateSchema: SliderLinearSchema = useMemo(
    () => ({ id: `${schema.id}.rate`, type: 'sliderLinear', loreLabel: 'OSCILLATION RATE', humanLabel: 'Rate', min: LFO_RATE_MIN, max: LFO_RATE_MAX, step: RATE_STEP, unit: 'Hz', orientation: 'horizontal' }),
    [schema.id],
  );
  const depthSchema: SliderLinearSchema = useMemo(
    () => ({ id: `${schema.id}.depth`, type: 'sliderLinear', loreLabel: 'OSCILLATION DEPTH', humanLabel: 'Depth', min: LFO_DEPTH_MIN, max: LFO_DEPTH_MAX, unit: '%', orientation: 'horizontal' }),
    [schema.id],
  );

  // Stable per-field onChange handlers, reading the latest value/onChange via ref rather than
  // closing over them directly (empty deps — these never change identity for the life of this
  // component instance). Without this, dragging Rate would rebuild a fresh onChange for Shape
  // and Depth too (both close over the same `value`/`onChange`), defeating their own memo for
  // fields that didn't actually change — the same "sibling field forces a re-render" cascade
  // Task 12 fixed at the AudioRigDrawer level, one layer deeper inside Lfo itself.
  const latest = useRef({ value, onChange });
  // Written in an effect, not directly during render — mutating a ref mid-render is disallowed
  // (react-hooks/refs; React Compiler assumes render is pure). Effects run synchronously after
  // commit, before the browser paints and long before any user interaction could invoke one of
  // the event handlers below, so this is never observably stale.
  useEffect(() => {
    latest.current = { value, onChange };
  });

  const handleShapeChange = useCallback((shape: string) => {
    latest.current.onChange({ ...latest.current.value, shape: shape as LfoValue['shape'] });
  }, []);
  const handleRateChange = useCallback((rate: number) => {
    latest.current.onChange({ ...latest.current.value, rate });
  }, []);
  const handleDepthChange = useCallback((depth: number) => {
    latest.current.onChange({ ...latest.current.value, depth });
  }, []);

  // Only the DISPLAYED value is overridden — `value` itself (and the onChange handlers above,
  // which all close over it via `latest`) is untouched, so a later reconnect uses the real
  // stored setting with no restore step of its own.
  const shapeDisplay = heldOff ? '' : value.shape;
  const rateDisplay = heldOff ? 0 : value.rate;
  const depthDisplay = heldOff ? 0 : value.depth;

  return (
    <div className={withActiveClass(heldOff ? 'sc-lfo sc-held-off' : 'sc-lfo', !heldOff && value.rate > 0)}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <RadioButton
        schema={shapeSchema}
        value={shapeDisplay}
        onChange={handleShapeChange}
        disabled={disabled}
      />
      <SliderLinear
        schema={rateSchema}
        value={rateDisplay}
        onChange={handleRateChange}
        disabled={disabled}
      />
      <SliderLinear
        schema={depthSchema}
        value={depthDisplay}
        onChange={handleDepthChange}
        disabled={disabled}
      />
    </div>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 10) — every prop is a primitive,
// a stable schema object, or the LfoValue object (compared shallowly — a caller replacing it
// wholesale on any real change is the expected usage, matching every other primitive here).
export const Lfo = memo(LfoInner);
