import { memo, useId, useState } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import type { ButtonSchema } from '@/types/controls';
import './Button.css';

interface ButtonProps {
  schema: ButtonSchema;
  onClick: () => void;
  disabled?: boolean;
  /** 'single' draws the human label alone on one line, the lore left to the control's label row, as
   *  RadioButton's options do (docs/tasks/LAYOUT_REWORK.md Task 17 follow-up: Save & Share only, for
   *  now). 'dual' (the default) is lore over human. */
  face?: 'dual' | 'single';
  /** Names the button apart from its face — a list row's "Load" named "Load Dusk Run". The schema's
   *  label otherwise (resolveAccessibleName). */
  accessibleName?: string;
  /** A disclosure button (IntroPanel's More / Less): whether the region it controls is open, carried
   *  as aria-expanded. Absent on an ordinary button. */
  expanded?: boolean;
  /** The id of the region it discloses (aria-controls). */
  controls?: string;
}

/**
 * Schema-driven button — renders through CabinetBox (roadmap Phase 11.1.1).
 * `engaged` combines hover, focus, and press (pointerdown/pointerup, not
 * `click` — click fires only on release, which would leave touch users with
 * no feedback until the tap is already over) into one boolean; a disabled
 * button is never engaged regardless of these events. Resting (not engaged)
 * pops to CABINET_REST_POP — a shallow, permanent 1px protrusion giving the
 * box a hint of its accent color even before interaction (Crawford's own
 * request, 2026-09-13) — engaged pops the rest of the way to the original,
 * unchanged full pop. No distinct click bounce or intermediate engaged state
 * — see docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1.5.
 *
 * `timelineKey` includes `useId()`, not just `schema.id` — `timelineMap` is a
 * shared, module-level `Map`, so two simultaneously-mounted `Button`s
 * rendering the same schema object would otherwise compute identical keys
 * and stomp each other's `setTimeline`/`killTimeline` calls (the exact bug
 * found live in `RadioButton`'s own timelineKey, fixed the same way — see
 * that file's own comment). Not yet exercised by any real `Button` consumer,
 * but the vulnerability is identical, so the fix is applied preemptively
 * rather than waiting for a live collision.
 */
function ButtonInner({ schema, onClick, disabled, face = 'dual', accessibleName: nameOverride, expanded, controls }: ButtonProps) {
  const schemaName = resolveAccessibleName(schema);
  const accessibleName = nameOverride ?? schemaName;
  const instanceId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const engaged = !disabled && (hovered || focused || pressed);
  const popped = engaged ? true : CABINET_REST_POP;

  return (
    <button
      type="button"
      className="sc-button"
      aria-label={accessibleName}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <CabinetBox popped={popped} timelineKey={`cabinet-button-${schema.id}-${instanceId}`}>
        {face === 'single' ? (
          <span className="sc-button__label">{schema.humanLabel ?? schema.loreLabel}</span>
        ) : (
          <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
        )}
      </CabinetBox>
    </button>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 6) — schema is always a stable,
// module-level config object; onClick/disabled are the only props a caller must keep stable to
// benefit (an implicit performance contract, not a type-level one — see
// docs/COMPONENT_LIBRARY.md).
export const Button = memo(ButtonInner);
