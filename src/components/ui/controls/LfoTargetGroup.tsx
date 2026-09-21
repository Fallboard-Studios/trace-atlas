import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { HeldOffNote } from './HeldOffNote';
import { Lfo } from './Lfo';
import { DirectionalPanel } from './DirectionalPanel';
import { withActiveClass } from './activeClass';
import { useLfoTargetGroup, type LfoTargetGroupField } from './useLfoTargetGroup';
import type { DirectionalPanelSchema, LfoSchema, LfoValue, PanelOrientation } from '@/types/controls';
import './LfoTargetGroup.css';

export type { LfoTargetGroupField } from './useLfoTargetGroup';

export interface LfoTargetGroupProps<F extends string = string> {
  /** Unique per group unit — becomes the timelineMap key and the shared Lfo's own schema.id
   *  namespace. E.g. 'audioRig.eq3', 'robotOptions.layer1', 'robotOptions.volume'. */
  groupId: string;
  fields: LfoTargetGroupField<F>[];
  onLfoChange: (field: F, value: LfoValue) => void;
  /** Caller renders its own slider for `field`. The row wrapper below already selects this
   *  field on click or focus ("click around the row"); `select` is handed to the caller too,
   *  for any additional wiring it wants. Keeps every existing per-schema-type slider dispatch
   *  exactly where it already lives. */
  renderField: (field: F, targeted: boolean, select: () => void) => ReactNode;
  disabled?: boolean;
  /** Rendered directly beneath the shared Lfo display, inside the same wrapper — only passed
   *  for eq3/filterLPF/filterHPF, the only groups with a per-group drift control today. */
  driftContent?: ReactNode;
  /** Orientation for the DirectionalPanel wrapping just the field rows — "taken from slider
   *  children": the caller owns each field's own ControlSchema (LfoTargetGroup only ever sees
   *  opaque `renderField` output), so it computes and passes this explicitly, same rule
   *  VERTICAL_SLIDERS.md's classification already uses elsewhere (vertical -> row, else
   *  column). Defaults to 'column'; SignatureArrayDrawer passes 'row' for its own Gain/Detune/
   *  Phase/Interval fields, which are schema-'vertical'. */
  sliderPanelOrientation?: PanelOrientation;
  /** Audio Load Budget: per field, whether that field's LFO is held off by the dial. The shared display greys out (disabled,
   *  values kept) with a label while the TARGETED field is held off. Plain data — this component stays store-free — so the
   *  caller must pass a referentially stable object (this component is memoized). Omitted = nothing held off. */
  heldOff?: Readonly<Record<string, boolean>>;
}

/**
 * Shared composition component (docs/specs/LFO_CONSOLIDATED_DISPLAY.md §1.2) — one shared LFO
 * display per group of LFO-tied sliders, replacing the old per-slider nested "Modulation"
 * accordion. Renders bare rows (each wired to select its field on click or focus — "click
 * around the row", not just the slider itself) inside their own DirectionalPanel, one shared
 * `Lfo` display driven by whichever field is currently targeted, and optional `driftContent`
 * below it — column[sliders-panel, Lfo, driftContent], a follow-up fix to
 * docs/tasks/DIRECTIONAL_PANEL_WIRING.md so the shared display and drift sliders never get
 * squeezed into a row-oriented sliders group. Not schema-driven like the 14 ControlSchema
 * primitives — it composes caller-rendered sliders + one `Lfo`.
 */
function LfoTargetGroupInner<F extends string = string>({
  groupId,
  fields,
  onLfoChange,
  renderField,
  disabled,
  driftContent,
  sliderPanelOrientation = 'column',
  heldOff,
}: LfoTargetGroupProps<F>) {
  const { selected, transitioning, select, isTargeted, displayValue, displayLabel } = useLfoTargetGroup({
    groupId,
    fields,
  });
  const targetHeldOff = heldOff?.[selected] === true;

  // Memoized (docs/todo/backlog.md #27 follow-up, 2026-09-15) — these 2 used to be constructed
  // fresh, inline, on every render, unlike every other primitive's schema in this codebase, which
  // is always a stable reference. Without this, SignatureArrayDrawer's own memoized-per-layer fix
  // would have no effect: even a caller that hands this component perfectly stable `fields`/
  // `onLfoChange`/`renderField` still couldn't let it bail, since it would keep rebuilding these
  // 2 schemas — and the child `Lfo`'s own `onChange` below — every render regardless.
  const slidersPanelSchema: DirectionalPanelSchema = useMemo(
    () => ({ id: `${groupId}.sliders`, type: 'directionalPanel', orientation: sliderPanelOrientation }),
    [groupId, sliderPanelOrientation],
  );
  // loreLabel is the fixed group-level term (docs/reference/ROBOT_DATA_GRID.md's "LFO MODULE"
  // row names it OSCILLATION, previously never wired in per that row's own † footnote) — unlike
  // humanLabel, it never swaps with the targeted field, since it names the module itself, not
  // whichever field it's currently modulating.
  const lfoSchema: LfoSchema = useMemo(
    () => ({ id: `${groupId}.lfo`, type: 'lfo', loreLabel: 'OSCILLATION', humanLabel: displayLabel }),
    [groupId, displayLabel],
  );
  const handleLfoChange = useCallback((v: LfoValue) => onLfoChange(selected, v), [selected, onLfoChange]);

  return (
    <div className="sc-lfo-target-group">
      <DirectionalPanel schema={slidersPanelSchema}>
        {fields.map((f) => (
          <div
            key={f.field}
            className={withActiveClass('sc-lfo-target-group__row', isTargeted(f.field))}
            onClick={() => select(f.field)}
            onFocus={() => select(f.field)}
          >
            {renderField(f.field, isTargeted(f.field), () => select(f.field))}
          </div>
        ))}
      </DirectionalPanel>
      <div className={withActiveClass('sc-lfo-target-group__display', transitioning)}>
        <Lfo
          schema={lfoSchema}
          value={displayValue}
          onChange={handleLfoChange}
          disabled={disabled || transitioning || targetHeldOff}
        />
        {targetHeldOff && <HeldOffNote />}
      </div>
      {driftContent}
    </div>
  );
}

// React.memo (docs/todo/backlog.md #27 follow-up, 2026-09-15) — a generic function component
// can't be passed directly to `memo()` without losing its type parameter, so the exported name
// is cast back to the same generic call signature; the underlying runtime behavior (and every
// existing prop) is unchanged.
export const LfoTargetGroup = memo(LfoTargetGroupInner) as typeof LfoTargetGroupInner;

export default LfoTargetGroup;
