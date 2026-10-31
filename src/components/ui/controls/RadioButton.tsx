import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { Fragment, memo, useId, useState, type CSSProperties, type ReactNode } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import { useCabinetBoxHeight, useVoxelTrackGap } from './useCabinetBoxHeight';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import { getRobotColorStyle } from '@/utils/traitColors';
import type { RadioButtonSchema } from '@/types/controls';
import './RadioButton.css';

interface RadioButtonBaseProps {
  schema: RadioButtonSchema;
  disabled?: boolean;
  /** Optional — called on a deselect-to-empty event (Radix's single-mode
   *  ToggleGroup emitting '' when the active item is clicked again), the
   *  event onChange itself never sees (guarded below, unchanged). Every
   *  existing consumer omits this and keeps today's swallow-and-ignore
   *  behavior; Header's nav group (docs/specs/archive/HEADER_HUB_CONSOLIDATION.md
   *  §1.4) is the first to need it, to tell "re-click the active option"
   *  apart from "no interaction at all". Single-value only: the multiple
   *  variant has no such event — clearing its last option is onChange([]). */
  onDeselect?: () => void;
  /** Optional fixed square size for every option's CabinetBox, overriding
   *  the responsive useCabinetBoxHeight() tier RadioButton otherwise
   *  inherits by omitting boxHeight/frontWidth/frontHeight entirely. Every
   *  existing consumer (Audio Setting, Decay Mode, per-layer Type,
   *  CompanyButtonRow, ...) omits this and is unaffected.
   *  docs/specs/archive/HEADER_HUB_CONSOLIDATION.md §1.4. */
  boxSize?: number;
  /** The `list` appearance's trailing slot (docs/tasks/OFF_SCREEN_REVISIONS.md Task 3): called once per option with
   *  its value, and a node it returns is drawn at the end of that option's row — a sibling of the option's radio,
   *  never inside it, since the radio is a button and a button may not hold one, so a click on the node never
   *  changes the value. A result of null, undefined, a boolean or '' draws no slot. The other appearances never call
   *  it. Like any callback prop, an inline arrow defeats the memo below: hold it in a `useCallback`. */
  trailing?: (value: string) => ReactNode;
}

/** A trailing result worth a slot: anything React would draw. */
const isDrawn = (node: ReactNode) => node !== null && node !== undefined && typeof node !== 'boolean' && node !== '';

/** The list appearance's grid lines (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R8): per option the line its row takes,
 *  a divider before it taking the line above, and how many lines the rows and dividers fill. An option's trailing slot
 *  takes its row's line. */
function listLines(options: RadioButtonSchema['options']): { rows: number[]; count: number } {
  const rows: number[] = [];
  let line = 0;
  for (const option of options) {
    if (option.dividerBefore) line++;
    rows.push(++line);
  }
  return { rows, count: line };
}

/** One option's value for the single control, or the selected values under `schema.multiple`. */
type RadioButtonValue = string | readonly string[];

/** Generic over the value's shape so an inline `onChange={(v) => …}` still infers `v` from `value`:
 *  a `string` value pairs with `onChange(string)` (every consumer before Task 29), a `string[]`
 *  value with `onChange(string[])` (the multiple variant). A union of two props shapes would have
 *  left such an arrow's parameter implicitly `any`. */
interface RadioButtonProps<V extends RadioButtonValue = string> extends RadioButtonBaseProps {
  value: V;
  onChange: (value: V extends readonly string[] ? string[] : string) => void;
}

/** Single-select control wrapping @radix-ui/react-toggle-group (type="single")
 *  — already installed elsewhere in the codebase (e.g. RobotAudioTab.tsx's
 *  Audio Mode row, pre-Phase-9), so this avoids adding a redundant
 *  @radix-ui/react-radio-group dependency for the same job. A deselect-to-empty
 *  event (Radix's single-mode ToggleGroup emits '' when the active item is
 *  clicked again) is guarded and does not call onChange. `disabled` disables
 *  the whole group at once (Radix's own `ToggleGroup.Root` prop) — there's no
 *  per-item disabled here, matching every other control primitive's single
 *  `disabled` flag.
 *
 *  Renders through CabinetBox (roadmap Phase 11.1.6) — one box per option,
 *  popped for the option matching `value`, resting at CABINET_REST_POP's
 *  shallow 1px protrusion for every other (Crawford's own request,
 *  2026-09-13 — a hint of the option's own accent color before it's ever
 *  selected/hovered, in place of a dedicated border rule). Reuses
 *  Toggle's (11.1.2) value-keyed pop precedent generalized to N boxes, and
 *  Button's (11.1.1) content-sized/breakpoint-scaled box sizing — never
 *  Toggle's own fixed-32px/textless shape. Only the selected option's front
 *  face is accent-tinted (RadioButton.css, keyed off Radix's own
 *  data-state='on'); every other option stays on CabinetBox.css's
 *  --color-surface default. See docs/specs/archive/OBLIQUE_CABINETRY_RADIO_BUTTON.md
 *  §1 for the full derivation, including why this is the first consumer with
 *  more than one CabinetBox per control.
 *
 *  `timelineKey` (below) includes `useId()`, not just `schema.id` +
 *  `option.value` — `timelineMap` is a shared, module-level `Map`, so two
 *  simultaneously-mounted `RadioButton`s rendering the *same* schema object
 *  (Header's nav group, rendered twice — `.primary`/`.secondary`, swapped by
 *  CSS breakpoint but both actually mounted at once) would otherwise compute
 *  identical keys and stomp each other's `setTimeline`/`killTimeline` calls,
 *  killing one instance's in-flight pop/flatten tween mid-animation from the
 *  other's own effect re-run — found live as walls freezing mid-transition
 *  after a tile switch, only resolving on the next real hover (which snaps
 *  to the stale `prevPoppedRef` value CabinetBox already committed to,
 *  visibly "un-popping" before animating back in). `useId()` guarantees
 *  every mounted instance gets its own namespace regardless of how many
 *  share a schema.
 *
 *  Each option also pops on mouseEnter/mouseLeave, matching Button's own
 *  hover-pop feedback (Button.tsx) — added after 11.1.6 shipped, reversing
 *  that phase's original "no hover/partial-pop on unselected options"
 *  exclusion. `hoveredValue` tracks at most one hovered option at a time (not
 *  a per-option boolean set), since only one option can be under the pointer;
 *  a disabled group never pops on hover, mirroring Button's own
 *  `!disabled && ...` guard. Hover only ever *adds* pop on top of the
 *  selected-state pop — it never un-pops the selected option on
 *  mouseLeave.
 *
 *  Bugfix: `hoveredValue` also resets to `null` whenever `value` changes
 *  (below, the React-docs-endorsed "adjust state during render" pattern —
 *  https://react.dev/learn/you-might-not-need-an-effect — not a `useEffect`,
 *  which `react-hooks/set-state-in-effect` correctly flags as an extra,
 *  avoidable render pass for a plain prop-driven reset like this one) —
 *  found live in Header's nav group, where switching between tiles left the
 *  *previously* active option visibly popped (walls extruded, no accent
 *  tint since it was no longer selected) until it was hovered for real
 *  again. The option's own front face translates on pop (CabinetBox's GSAP
 *  offset), so clicking it — mouse held stationary — can move that
 *  translated hit-region out from under the cursor without the browser ever
 *  re-running hit-testing (that only happens on real subsequent pointer
 *  input), so no `mouseleave` fires to clear the stale hover. Resetting on
 *  every selection change sidesteps that class of missed-event entirely,
 *  rather than chasing the exact pointer-event sequence that drops it.
 *
 *  Optional per-option `color` (docs/specs/archive/COMPANY_SECTION_ENHANCEMENTS.md §1.3) scopes
 *  getRobotColorStyle's 4 accent custom properties to that one option's own ToggleGroup.Item —
 *  no new CSS needed, since CabinetBox.css's rest-state hint and RadioButton.css's
 *  [data-state='on'] front-face tint both already read those properties ambiently. An option
 *  that omits `color` renders with no inline style at all, identical to every consumer that
 *  predates this (Audio Setting, Decay Mode, per-layer Type, Header's nav group, …).
 *
 *  The option face (docs/specs/LAYOUT_REWORK.md §1.4): an option with a `loreLabel` shows it small
 *  above its `humanLabel`, inside the same fixed-height box; one without is one line of its
 *  `humanLabel` (Task 13 dropped the lore; Crawford brought it back, 2026-10-10). Drawn here, not with
 *  DualLabel: the face is two small spans so each line can stop at the control's width with its own
 *  one-line ellipsis cap (RadioButton.css), which DualLabel's wrapping lines cannot. The accessible name
 *  is the human label alone.
 *
 *  `schema.appearance === 'muted'` (docs/tasks/LAYOUT_REWORK.md Task 27) swaps each CabinetBox for a
 *  flat `.sc-radio-button__flat` face of the same height: no walls, no pop timeline, no hover pop, no
 *  glow, the selected one a monochrome fill (RadioButton.css). It is the powered-off screen's theme row,
 *  flat while that screen's aspect rows pop (docs/tasks/OFF_SCREEN_REVISIONS.md Task 9).
 *
 *  `schema.multiple` (docs/specs/OFF_SCREEN.md assumption 23; docs/tasks/OFF_SCREEN.md Task 29) is the
 *  set variant: `value` is a `string[]`, the Root is Radix's `type="multiple"` (a `group` of
 *  `aria-pressed` buttons — Radix only gives items the `radio` role in single mode), and every option
 *  is on or off on its own. The selected-state rendering is shared with the single control — the pop
 *  and the muted fill both key off Radix's `data-state='on'`, which is per item in either mode — so a
 *  multiple group with two options on shows two popped boxes. `onChange` receives the selected values
 *  **in schema option order**, restricted to values the schema has, so one set is always one list and
 *  the value prop round-trips; clearing the last option is `onChange([])` (there is no
 *  deselect-to-empty event to swallow, and `onDeselect` is never called). The stale-hover reset above
 *  compares the selection by content, not array identity, so a parent re-render handing a fresh array
 *  of the same values does not drop a live hover. The off screen's aspect family rows are the consumers,
 *  in `cabinet` (docs/tasks/OFF_SCREEN_REVISIONS.md Task 9; the Melody row was the first, in `muted`).
 *
 *  `schema.appearance === 'list'` (docs/tasks/OFF_SCREEN_REVISIONS.md Task 3; Crawford's notes 1 and 2 of
 *  2026-10-31) is the off screen's Transmission list: every option is a full-width row
 *  (`.sc-radio-button__row`) holding the option's item (`.sc-radio-button__list-item` — a dot, the face, and the
 *  option's `meta` in small type, wired as the item's accessible description) and, beside it, whatever
 *  `trailing(value)` returns (`.sc-radio-button__trailing`). The rows stack; `dividerBefore` is a full-width rule.
 *  The row mirrors its item's `data-state`, so the selected row's dot and quiet fill key off it (RadioButton.css);
 *  every row renders the same parts selected or not, so a pick never reflows the list. It is muted's family: no
 *  CabinetBox, no pop timeline, no hover pop. Single-value and `multiple` both work; the single-value list is the
 *  consumer.
 *
 *  The trailing slots render after the Radix root, outside it (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R8): the root
 *  is a roving-focus group, and a Shift+Tab leaving any descendant that is not one of its items lands on the root,
 *  which hands focus back to the selected item, so a slot inside it looped Shift+Tab between itself and that row. A
 *  `.sc-radio-button__list` grid holds both: the root spans it and passes its lines down (subgrid), every row and
 *  divider takes a line of its own (listLines), and a slot takes its row's line in the second column, over the row's
 *  own fill, where it always sat. */
function RadioButtonInner<V extends RadioButtonValue>(props: RadioButtonProps<V>) {
  const { schema, disabled, onDeselect, boxSize, trailing } = props;
  // The conditional parameter type is opaque inside the generic body, so the two call sites below
  // name the shape they hand over; the runtime switch is the schema's own `multiple` flag.
  const onChangeSingle = props.onChange as (value: string) => void;
  const onChangeMultiple = props.onChange as (value: string[]) => void;
  const rawValue: RadioButtonValue = props.value;
  // Reuses the same breakpoint-tier gap VoxelTrack (11.1.3) uses between its
  // own boxes — not renamed to something RadioButton-neutral; see
  // docs/specs/archive/OBLIQUE_CABINETRY_RADIO_BUTTON.md §1.5 for why.
  const gap = useVoxelTrackGap();
  const rowTokens = { '--cabinet-radio-gap': `${gap}px` } as CSSProperties;
  const instanceId = useId();
  const tierBoxHeight = useCabinetBoxHeight();
  const muted = schema.appearance === 'muted';
  const list = schema.appearance === 'list';
  const multiple = schema.multiple === true;
  // The selected values in either mode — one or none for the single control, any number for the
  // multiple variant. A single-mode value of '' selects nothing, as it always has.
  const selected: readonly string[] = typeof rawValue === 'string' ? [rawValue] : rawValue;
  const isSelected = (optionValue: string) => selected.includes(optionValue);
  // The list's lines and its trailing results, once per option; the other appearances never call `trailing`.
  const lines = list ? listLines(schema.options) : null;
  const trailingNodes = list ? schema.options.map((option) => trailing?.(option.value)) : [];
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);

  // See the bugfix note above — clears a stale hover left behind by a
  // selection change that didn't route through a real mouseleave on the
  // previously-hovered option. Adjusts state during render (React's own
  // recommended pattern for "reset when a prop changes") rather than a
  // useEffect, which would commit the stale-hover frame to the DOM first.
  // Keyed by content (the joined list) so the multiple variant's arrays
  // compare by value: a new array of the same picks is not a change.
  const selectionKey = selected.join('\u0000');
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (selectionKey !== prevSelectionKey) {
    setPrevSelectionKey(selectionKey);
    setHoveredValue(null);
  }

  const className = [
    'sc-radio-button',
    muted ? 'sc-radio-button--muted' : null,
    list ? 'sc-radio-button--list' : null,
    multiple ? 'sc-radio-button--multiple' : null,
  ].filter(Boolean).join(' ');

  const items = schema.options.map((option, index) => {
    const face = (
      <span className="sc-radio-button__face">
        {option.loreLabel && <span className="sc-radio-button__lore">{option.loreLabel}</span>}
        <span className="sc-radio-button__label">{option.humanLabel}</span>
      </span>
    );
    if (lines) {
      // The index, not the value, names the meta: a value may hold spaces (a save's name), an id may not.
      const metaId = option.meta ? `${instanceId}-meta-${index}` : undefined;
      const line = lines.rows[index];
      const rowClass = isDrawn(trailingNodes[index]) ? 'sc-radio-button__row sc-radio-button__row--trailing' : 'sc-radio-button__row';
      return (
        <Fragment key={option.value}>
          {option.dividerBefore && <span className="sc-radio-button__divider" aria-hidden="true" style={{ gridRow: line - 1 }} />}
          <div className={rowClass} data-state={isSelected(option.value) ? 'on' : 'off'} style={{ gridRow: line }}>
            <ToggleGroup.Item
              className="sc-radio-button__item sc-radio-button__list-item"
              value={option.value}
              aria-label={option.humanLabel}
              aria-describedby={metaId}
              style={option.color ? getRobotColorStyle(option.color) : undefined}
            >
              <span className="sc-radio-button__dot" aria-hidden="true" />
              {face}
              {option.meta && (
                <span className="sc-radio-button__meta" id={metaId}>
                  {option.meta}
                </span>
              )}
            </ToggleGroup.Item>
          </div>
        </Fragment>
      );
    }
    return (
      <Fragment key={option.value}>
        {option.dividerBefore && <span className="sc-radio-button__divider" aria-hidden="true" />}
        <ToggleGroup.Item
          className="sc-radio-button__item"
          value={option.value}
          aria-label={option.humanLabel}
          style={option.color ? getRobotColorStyle(option.color) : undefined}
          onMouseEnter={muted ? undefined : () => setHoveredValue(option.value)}
          onMouseLeave={muted ? undefined : () => setHoveredValue((current) => (current === option.value ? null : current))}
        >
          {muted ? (
            <span className="sc-radio-button__flat" style={{ '--cabinet-box-height': `${boxSize ?? tierBoxHeight}px` } as CSSProperties}>
              {face}
            </span>
          ) : (
            <CabinetBox
              popped={
                isSelected(option.value) || (!disabled && option.value === hoveredValue) ? true : CABINET_REST_POP
              }
              timelineKey={`cabinet-radio-${schema.id}-${instanceId}-${option.value}`}
              {...(boxSize !== undefined ? { boxHeight: boxSize, frontWidth: boxSize, frontHeight: boxSize } : {})}
            >
              {face}
            </CabinetBox>
          )}
        </ToggleGroup.Item>
      </Fragment>
    );
  });

  // Radix's multiple-mode list is in toggle order (an activated item is appended); the contract
  // here is schema option order, with any value the schema does not know dropped.
  const emitMultiple = (next: string[]) => {
    const chosen = new Set(next);
    onChangeMultiple(schema.options.filter((option) => chosen.has(option.value)).map((option) => option.value));
  };

  const rootStyle = lines ? { ...rowTokens, gridRow: `1 / span ${lines.count}` } : rowTokens;
  const root = multiple ? (
    <ToggleGroup.Root
      type="multiple"
      className="sc-radio-button__root"
      style={rootStyle}
      value={selected as string[]}
      onValueChange={emitMultiple}
      aria-label={resolveAccessibleName(schema)}
      disabled={disabled}
    >
      {items}
    </ToggleGroup.Root>
  ) : (
    <ToggleGroup.Root
      type="single"
      className="sc-radio-button__root"
      style={rootStyle}
      value={selected[0]}
      onValueChange={(next) => { if (next) onChangeSingle(next); else onDeselect?.(); }}
      aria-label={resolveAccessibleName(schema)}
      disabled={disabled}
    >
      {items}
    </ToggleGroup.Root>
  );

  return (
    <div className={className}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} help={schema.help} />
      {lines ? (
        <div className="sc-radio-button__list">
          {root}
          {schema.options.map((option, index) =>
            isDrawn(trailingNodes[index]) ? (
              <span key={option.value} className="sc-radio-button__trailing" style={{ gridRow: lines.rows[index] }}>
                {trailingNodes[index]}
              </span>
            ) : null,
          )}
        </div>
      ) : (
        root
      )}
    </div>
  );
}

// React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 9) — every prop is a primitive,
// a callback, or a stable schema object (schema.options included — a static config array, per
// every real consumer). `onDeselect` is optional and, when a caller passes it inline, defeats
// this memo the same way any unstabilized callback does elsewhere (docs/COMPONENT_LIBRARY.md). The
// multiple variant's `value` is an array: a consumer that builds it per render defeats the memo the
// same way, so hold it in state or a `useMemo`. The cast keeps the generic signature `memo` would
// otherwise collapse (the usual pattern for a memoized generic component); the runtime object is
// still React's memo wrapper.
export const RadioButton = memo(RadioButtonInner) as typeof RadioButtonInner;
