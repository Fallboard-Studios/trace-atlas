import * as Switch from '@radix-ui/react-switch';
import { memo, useId, type CSSProperties, type ReactNode } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import { withActiveClass } from './activeClass';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import type { ToggleSchema } from '@/types/controls';
import './Toggle.css';

interface ToggleProps {
  schema: ToggleSchema;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Optional fixed box size overriding CABINET_TOGGLE_BOX_SIZE (32px).
   *  Header's Mute instance passes touch-target-size (44) so the header's
   *  row-fit math can assume an exact, literal 44px per button, even though
   *  it also has facade content (children, below) — an explicit boxSize
   *  always wins over content-sizing. Omitted (and no children), behavior
   *  is identical to before this prop existed.
   *  docs/specs/archive/HEADER_HUB_CONSOLIDATION.md §1.4. */
  boxSize?: number;
  /** Optional facade content — an icon (Header's Mute, 🔇/🔊) or short text
   *  (PingControlsDrawer's Click Track) rendered on CabinetBox's own front
   *  face, replacing the bare/textless box every other consumer still gets.
   *  When provided, the external DualLabel row is suppressed (the facade
   *  itself now carries the label — same "label lives on the facade, not
   *  external" precedent Button already established), though schema.humanLabel
   *  still feeds the accessible name via resolveAccessibleName regardless of
   *  whether it's ever visibly rendered. When provided without an explicit
   *  boxSize, the box sizes naturally to its content ("as wide as it needs
   *  to be") via CabinetBox.css's own base front-face rule — the same
   *  content-sized behavior Button's own box already uses — rather than
   *  Toggle's usual fixed-square override. */
  children?: ReactNode;
}

/**
 * Fixed cabinet-box size for Toggle (roadmap Phase 11.1.2) — deliberately
 * NOT the breakpoint-driven 32/40/48px tiers Button's own content-sized box
 * uses (roadmap 11.1.1). Toggle sits inline next to its own DualLabel row
 * rather than filling a hub tile, so there's no content to accommodate at a
 * larger size on wider viewports. See docs/specs/archive/OBLIQUE_CABINETRY_TOGGLE.md §1.2.
 * Applies only to the bare (no facade content) case — see `children` above.
 */
export const CABINET_TOGGLE_BOX_SIZE = 44;

/**
 * Binary ON/OFF control wrapping @radix-ui/react-switch. Controlled — never
 * manages its own selection state. Renders through CabinetBox (roadmap
 * Phase 11.1.2) — bare and textless by default, or with facade content via
 * `children` (Header's Mute/PingControlsDrawer's Click Track) — fully popped
 * is "on", CABINET_REST_POP's shallow 1px protrusion is "off" (a hint of its
 * accent color even at rest, in place of a dedicated border rule —
 * Crawford's own request, 2026-09-13; replaces true flatness, which "off"
 * used before), keyed directly off `value` (never hover/focus/press, unlike
 * Button). `popped` mirrors `value` even when `disabled` — a disabled-but-
 * checked toggle still visually reads as on, just non-interactive; see
 * docs/specs/archive/OBLIQUE_CABINETRY_TOGGLE.md §1.4.
 * The root also carries a plain `isActive` class (alongside Radix's own
 * `data-state` on the switch itself) so a consumer can write
 * `.sc-toggle.isActive { ... }` instead of a `:has()` attribute selector.
 *
 * `timelineKey` includes `useId()`, not just `schema.id` — `timelineMap` is a
 * shared, module-level `Map`, so two simultaneously-mounted `Toggle`s
 * rendering the same schema object would otherwise compute identical keys
 * and stomp each other's `setTimeline`/`killTimeline` calls (the exact bug
 * found live in `RadioButton`'s own timelineKey, fixed the same way — see
 * that file's own comment). Not yet exercised by any real `Toggle` consumer,
 * but the vulnerability is identical, so the fix is applied preemptively
 * rather than waiting for a live collision.
 */
function ToggleInner({ schema, value, onChange, disabled, boxSize, children }: ToggleProps) {
  // An explicit boxSize always forces the fixed-square path, even with
  // facade content (Header's Mute needs an exact 44px regardless of its
  // icon). Only "children with no boxSize" gets natural content-sizing.
  const contentSized = children !== undefined && boxSize === undefined;
  const instanceId = useId();

  // Recomputed per-instance (was a module-level constant) so an overridden
  // boxSize reaches Toggle.css's own front-face size override, not just
  // CabinetBox's boxHeight prop below — both must agree, or the front face
  // stays visually stuck at 32px while the wall geometry pops at a
  // different size. docs/specs/archive/HEADER_HUB_CONSOLIDATION.md §1.4. Unused
  // (and not applied — see the --bare modifier class below) when
  // contentSized, since the fixed-square rule it feeds doesn't apply then.
  const cabinetTokens = {
    '--cabinet-toggle-box-size': `${boxSize ?? CABINET_TOGGLE_BOX_SIZE}px`,
  } as CSSProperties;

  return (
    <div className={withActiveClass('sc-toggle', value)}>
      {!children && <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} help={schema.help} />}
      <Switch.Root
        className={`sc-toggle__root${contentSized ? '' : ' sc-toggle__root--bare'}`}
        style={cabinetTokens}
        checked={value}
        aria-label={resolveAccessibleName(schema)}
        onCheckedChange={(checked) => onChange(checked)}
        disabled={disabled}
      >
        <CabinetBox
          popped={value ? true : CABINET_REST_POP}
          {...(contentSized ? {} : { boxHeight: boxSize ?? CABINET_TOGGLE_BOX_SIZE })}
          timelineKey={`cabinet-toggle-${schema.id}-${instanceId}`}
        >
          {children}
        </CabinetBox>
      </Switch.Root>
    </div>
  );
}

// React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 7) — the bare (no `children`) call
// shape every existing consumer but Header's Mute uses gets a guaranteed bail-out; a caller
// passing `children` inline (a fresh element reference every render) defeats it regardless of
// memoization here — see docs/COMPONENT_LIBRARY.md.
export const Toggle = memo(ToggleInner);
