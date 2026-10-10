import { memo, useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';

import { DualLabel } from './DualLabel';
import { RadioButton } from './RadioButton';
import { SliderLinear } from './SliderLinear';
import { withActiveClass } from './activeClass';
import { useCabinetBoxHeight, useVoxelTrackGap } from './useCabinetBoxHeight';
import { useShell, type Shell } from '@/components/panels/screen/useShell';
import { computeVoxelTrackLength, computeVoxelTrackTrailingReserve } from '@/utils/voxelTrackMath';
import { LFO_DEPTH_MIN, LFO_DEPTH_MAX } from '@/types/lfo';
import type { LfoLinkSchema, LfoLinkValue, RadioButtonSchema, SliderLinearSchema } from '@/types/controls';
import { CONTENT, fill, labels } from '@/content';
import './LfoLink.css';

interface LfoLinkProps {
  schema: LfoLinkSchema;
  value: LfoLinkValue;
  onChange: (value: LfoLinkValue) => void;
  disabled?: boolean;
  /**
   * Audio Load Budget (docs/specs/LFO_BANK.md §1.5): true only for the LPF/HPF filter links while
   * the dial suspends them — the two consumers this primitive replaces (Lfo.tsx, LfoTargetGroup)
   * had a much wider robot-LFO-cap use of this flag; that whole mechanism is gone, so this is now
   * strictly narrower. Never mutates `value` — only what's DISPLAYED flips to Off/0, so a later
   * reconnect uses the real stored link with no restore step. Renders no note of its own; the
   * caller renders HeldOffNote beside it (the filter panels already do this for drift).
   */
  heldOff?: boolean;
}

/** The depth strip's fixed length (docs/specs/LAYOUT_REWORK.md §1.4): short, so the lane row and the strip
 *  can share a line where there is room; the strip wraps under the lane row where there is not. */
export const LFO_LINK_DEPTH_BOXES = 8;

/** The 5 lane options (Off + a-d) from content's ui.lfoLane, in LFO_LANE_IDS order, as one line each
 *  (spec §1.4): the lane's name followed by its letter on the desk shell (ui.lfoLane.linkName), the
 *  letter alone on the phone, Off on both. The text is also each option's accessible name. Built once
 *  per shell, so the schemas below stay stable. */
function laneOptions(shell: Shell): RadioButtonSchema['options'] {
  return Object.entries(CONTENT['ui.lfoLane'].options).map(([value, option]) => {
    if (!('short' in option)) return { value, humanLabel: option.human };
    return { value, humanLabel: shell === 'phone' ? option.short : fill('ui.lfoLane.linkName', { lane: option.human, short: option.short }) };
  });
}
const LANE_OPTIONS: Record<Shell, RadioButtonSchema['options']> = { desk: laneOptions('desk'), phone: laneOptions('phone') };

const OFF_VALUE = 'off';

/**
 * Composes RadioButton (lane) + one SliderLinear (depth) per the inline per-row control the LFO
 * Bank replaces the shared Lfo/LfoTargetGroup display with (docs/specs/LFO_BANK.md §1.5, assumption
 * 10) — a target no longer owns its own shape/rate, it links to one of four world lanes (or none)
 * at a given depth. `LfoLinkValue` is a type-only reuse of the real engine's `LfoLink` (Phase 0) —
 * no import of src/engine/lfoEngine.ts or any Tone object, so this stays presentation-only.
 */
function LfoLinkInner({ schema, value, onChange, disabled, heldOff }: LfoLinkProps) {
  const shell = useShell();
  // Memoized like every other primitive's internal schema (Lfo.tsx's own precedent) — keyed on
  // schema.id and the shell; every other input (LANE_OPTIONS, LFO_DEPTH_MIN/MAX) is a module-level constant.
  const laneSchema: RadioButtonSchema = useMemo(
    () => ({ id: `${schema.id}.lane`, type: 'radio', ...labels('ui.lfoLane'), options: LANE_OPTIONS[shell] }),
    [schema.id, shell],
  );
  const depthSchema: SliderLinearSchema = useMemo(
    () => ({ id: `${schema.id}.depth`, type: 'sliderLinear', ...labels('ui.lfo.depth'), min: LFO_DEPTH_MIN, max: LFO_DEPTH_MAX, orientation: 'horizontal' }),
    [schema.id],
  );

  // Stable per-field onChange handlers via the `latest` ref pattern (Lfo.tsx's own precedent) —
  // written in an effect, not during render (mutating a ref mid-render is disallowed).
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  const handleLaneChange = useCallback((next: string) => {
    const lane = next === OFF_VALUE ? null : (next as NonNullable<LfoLinkValue['lane']>);
    latest.current.onChange({ ...latest.current.value, lane });
  }, []);
  const handleDepthChange = useCallback((depth: number) => {
    latest.current.onChange({ ...latest.current.value, depth });
  }, []);

  // Only the DISPLAYED value is overridden while held off — `value` itself (and the onChange
  // handlers above, which close over it via `latest`) is untouched.
  const laneDisplay = heldOff ? OFF_VALUE : value.lane ?? OFF_VALUE;
  const depthDisplay = heldOff ? 0 : value.depth;

  // The compact row (docs/specs/LAYOUT_REWORK.md §1.4; Crawford, 2026-10-10): the lane row and the 8-box
  // depth strip, each under its own label row and "?", side by side where both fit and the strip wrapping
  // under the lanes where they do not. App sizes (the tier boxes, the 44 px touch floor); LfoLink.css owns
  // the wrap, which replaced the tier-driven row/column switch (POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.5).
  // The depth slider fits its boxes to its width, so the row offers it an 8-box track's length at the
  // tier's sizes (LfoLink.css: its flex-basis, never grown past, shrinkable on a narrower line).
  const depthLength = computeVoxelTrackLength(LFO_LINK_DEPTH_BOXES, useCabinetBoxHeight(), useVoxelTrackGap())
    + computeVoxelTrackTrailingReserve('horizontal');
  const rowTokens = { '--lfo-link-depth-length': `${depthLength}px` } as CSSProperties;

  return (
    <div className={withActiveClass(heldOff ? 'sc-lfo-link sc-held-off' : 'sc-lfo-link', !heldOff && value.lane !== null)}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} help={schema.help} />
      <div className="sc-lfo-link__row" style={rowTokens}>
        <RadioButton
          schema={laneSchema}
          value={laneDisplay}
          onChange={handleLaneChange}
          disabled={disabled}
        />
        <SliderLinear
          schema={depthSchema}
          value={depthDisplay}
          onChange={handleDepthChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// React.memo — every prop is a primitive, a stable schema object, or the LfoLinkValue object
// (compared shallowly, the same convention every other primitive here follows).
export const LfoLink = memo(LfoLinkInner);
