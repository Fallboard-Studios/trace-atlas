import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { memo, useId, useState, type CSSProperties } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import { useVoxelTrackGap } from './useCabinetBoxHeight';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import { getRobotColorStyle } from '@/utils/traitColors';
import type { RadioButtonSchema } from '@/types/controls';
import './RadioButton.css';

interface RadioButtonProps {
  schema: RadioButtonSchema;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Optional — called on a deselect-to-empty event (Radix's single-mode
   *  ToggleGroup emitting '' when the active item is clicked again), the
   *  event onChange itself never sees (guarded below, unchanged). Every
   *  existing consumer omits this and keeps today's swallow-and-ignore
   *  behavior; Header's nav group (docs/specs/HEADER_HUB_CONSOLIDATION.md
   *  §1.4) is the first to need it, to tell "re-click the active option"
   *  apart from "no interaction at all". */
  onDeselect?: () => void;
  /** Optional fixed square size for every option's CabinetBox, overriding
   *  the responsive useCabinetBoxHeight() tier RadioButton otherwise
   *  inherits by omitting boxHeight/frontWidth/frontHeight entirely. Every
   *  existing consumer (Audio Setting, Decay Mode, per-layer Type,
   *  CompanyButtonRow, ...) omits this and is unaffected.
   *  docs/specs/HEADER_HUB_CONSOLIDATION.md §1.4. */
  boxSize?: number;
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
 *  --color-surface default. See docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md
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
 *  Optional per-option `color` (docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.3) scopes
 *  getRobotColorStyle's 4 accent custom properties to that one option's own ToggleGroup.Item —
 *  no new CSS needed, since CabinetBox.css's rest-state hint and RadioButton.css's
 *  [data-state='on'] front-face tint both already read those properties ambiently. An option
 *  that omits `color` renders with no inline style at all, identical to every consumer that
 *  predates this (Audio Setting, Decay Mode, per-layer Type, Header's nav group, …). */
function RadioButtonInner({ schema, value, onChange, disabled, onDeselect, boxSize }: RadioButtonProps) {
  // Reuses the same breakpoint-tier gap VoxelTrack (11.1.3) uses between its
  // own boxes — not renamed to something RadioButton-neutral; see
  // docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md §1.5 for why.
  const gap = useVoxelTrackGap();
  const rowTokens = { '--cabinet-radio-gap': `${gap}px` } as CSSProperties;
  const instanceId = useId();
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);

  // See the bugfix note above — clears a stale hover left behind by a
  // selection change that didn't route through a real mouseleave on the
  // previously-hovered option. Adjusts state during render (React's own
  // recommended pattern for "reset when a prop changes") rather than a
  // useEffect, which would commit the stale-hover frame to the DOM first.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setHoveredValue(null);
  }

  return (
    <div className="sc-radio-button">
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <ToggleGroup.Root
        type="single"
        className="sc-radio-button__root"
        style={rowTokens}
        value={value}
        onValueChange={(next) => { if (next) onChange(next); else onDeselect?.(); }}
        aria-label={resolveAccessibleName(schema)}
        disabled={disabled}
      >
        {schema.options.map((option) => (
          <ToggleGroup.Item
            key={option.value}
            className="sc-radio-button__item"
            value={option.value}
            aria-label={option.label}
            style={option.color ? getRobotColorStyle(option.color) : undefined}
            onMouseEnter={() => setHoveredValue(option.value)}
            onMouseLeave={() => setHoveredValue((current) => (current === option.value ? null : current))}
          >
            <CabinetBox
              popped={
                option.value === value || (!disabled && option.value === hoveredValue) ? true : CABINET_REST_POP
              }
              timelineKey={`cabinet-radio-${schema.id}-${instanceId}-${option.value}`}
              {...(boxSize !== undefined ? { boxHeight: boxSize, frontWidth: boxSize, frontHeight: boxSize } : {})}
            >
              <DualLabel loreLabel={option.loreLabel} humanLabel={option.label} />
            </CabinetBox>
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 9) — every prop is a primitive,
// a callback, or a stable schema object (schema.options included — a static config array, per
// every real consumer). `onDeselect` is optional and, when a caller passes it inline, defeats
// this memo the same way any unstabilized callback does elsewhere (docs/COMPONENT_LIBRARY.md).
export const RadioButton = memo(RadioButtonInner);
