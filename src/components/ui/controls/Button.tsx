import { memo, useId, useState, type CSSProperties } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import { useCabinetBoxHeight } from './useCabinetBoxHeight';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import type { ButtonSchema } from '@/types/controls';
import './Button.css';

interface ButtonProps {
  schema: ButtonSchema;
  onClick: () => void;
  disabled?: boolean;
  /** 'single' draws the human label alone on one line, the lore left to the control's label row, as
   *  RadioButton's options do (docs/tasks/LAYOUT_REWORK.md Task 17 follow-up). Used where the control's
   *  label row already carries the lore: Save & Share, the session list's rows and IntroPanel's More /
   *  Less. 'dual' (the default) is lore over human. */
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
 * — see docs/specs/archive/OBLIQUE_CABINETRY_FOUNDATION.md §1.5.
 *
 * `timelineKey` includes `useId()`, not just `schema.id` — `timelineMap` is a
 * shared, module-level `Map`, so two simultaneously-mounted `Button`s
 * rendering the same schema object would otherwise compute identical keys
 * and stomp each other's `setTimeline`/`killTimeline` calls (the exact bug
 * found live in `RadioButton`'s own timelineKey, fixed the same way — see
 * that file's own comment). Not yet exercised by any real `Button` consumer,
 * but the vulnerability is identical, so the fix is applied preemptively
 * rather than waiting for a live collision.
 *
 * `schema.appearance === 'muted'` (docs/tasks/OFF_SCREEN.md Task 13) swaps the CabinetBox for a flat
 * `.sc-button__flat` face of the same height — RadioButton's muted, for a button: no walls, no pop timeline,
 * no hover pop, no glow; the engaged state is a border the stylesheet draws. It is the powered-off screen's
 * Roll and Keep, which stay flat there while only the aspect rows pop (docs/specs/OFF_SCREEN.md §3, as amended by
 * docs/tasks/OFF_SCREEN_REVISIONS.md Task 9).
 */
function ButtonInner({ schema, onClick, disabled, face = 'dual', accessibleName: nameOverride, expanded, controls }: ButtonProps) {
  const schemaName = resolveAccessibleName(schema);
  const accessibleName = nameOverride ?? schemaName;
  const instanceId = useId();
  const tierBoxHeight = useCabinetBoxHeight();
  const muted = schema.appearance === 'muted';
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const engaged = !disabled && (hovered || focused || pressed);
  const popped = engaged ? true : CABINET_REST_POP;

  const faceEl =
    face === 'single' ? (
      <span className="sc-button__label">{schema.humanLabel ?? schema.loreLabel}</span>
    ) : (
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
    );

  return (
    <button
      type="button"
      className={muted ? 'sc-button sc-button--muted' : 'sc-button'}
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
      {muted ? (
        <span className="sc-button__flat" style={{ '--cabinet-box-height': `${tierBoxHeight}px` } as CSSProperties}>
          {faceEl}
        </span>
      ) : (
        <CabinetBox popped={popped} timelineKey={`cabinet-button-${schema.id}-${instanceId}`}>
          {faceEl}
        </CabinetBox>
      )}
    </button>
  );
}

// React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 6) — schema is always a stable,
// module-level config object; onClick/disabled are the only props a caller must keep stable to
// benefit (an implicit performance contract, not a type-level one — see
// docs/COMPONENT_LIBRARY.md).
export const Button = memo(ButtonInner);
