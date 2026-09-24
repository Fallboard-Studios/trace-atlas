import { createContext, memo, useContext, useRef, type ReactNode } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { useAutoPanelOrientation } from './useAutoPanelOrientation';
import { useResponsivePanelOrientation } from './useResponsivePanelOrientation';
import type { DirectionalPanelSchema } from '@/types/controls';
import './DirectionalPanel.css';

interface DirectionalPanelProps {
  schema: DirectionalPanelSchema;
  children: ReactNode;
}

// `data-panel-id`, not `id` — schema ids commonly contain dots
// (e.g. 'audioRig.eqFiltersRow'), which are safe as an attribute VALUE but
// would need escaping as a literal HTML `id`/CSS `#id` selector. Lets a
// consumer target one specific panel instance via a plain CSS attribute
// selector (`[data-panel-id="..."]`) without this component ever accepting
// a className/style prop — it deliberately has none, per its own
// `{ schema, children }`-only contract.

// Internal only — not exported. Defaults to false ("not yet inside a
// DirectionalPanel"); every instance re-provides `true` to its own children
// regardless of whether it renders its own facade, so a panel nested several
// levels deep still correctly reads as nested. See
// docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1.2.
const DirectionalPanelNestingContext = createContext(false);

/**
 * A pure layout container — groups already-rendered controls into a row or
 * column flex box. No value/onChange, no state of its own beyond 'auto'
 * orientation's own measured resolution. 'row' is the default orientation when
 * schema.orientation is omitted, and 'row' never wraps (docs/specs/
 * DIRECTIONAL_PANEL.md §1.4) — an overflowing row is solved with a nested
 * DirectionalPanel, not a wrap prop on this one. 'auto' resolves via
 * useAutoPanelOrientation, measuring this panel's own parent element and
 * going 'row' once there's enough room, 'column' otherwise
 * (docs/tasks/DIRECTIONAL_PANEL_WIRING.md follow-up fix). 'responsive'
 * resolves via useResponsivePanelOrientation instead — the same fixed
 * viewport tier every 'responsive' panel reads, never a per-parent
 * measurement (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.2). Both hooks
 * are called unconditionally (Rules of Hooks — the same "always call,
 * sometimes ignore the result" shape CabinetBox.tsx already uses for
 * useCabinetBoxHeight() when boxHeight is overridden); useAutoPanelOrientation
 * receives 'row' instead of the real 'responsive' value so it short-circuits
 * to its own cheap literal-passthrough branch rather than constructing an
 * unused ResizeObserver.
 *
 * Renders through a permanently-popped, non-animating CabinetBox facade
 * ("Oblique Cabinetry — DirectionalPanel") whenever this instance is
 * top-level — not itself nested inside another DirectionalPanel's own
 * children, detected via DirectionalPanelNestingContext rather than a prop,
 * since the same call site can be top-level in one caller and nested in
 * another (AudioRigDrawer's renderBlock(), see the intent doc's own Scope
 * section). A nested instance renders exactly as before, unframed. See
 * docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1 for the full
 * derivation, including why this needed one small additive change to
 * CabinetBox itself (autoHeight, §1.1).
 */
function DirectionalPanelInner({ schema, children }: DirectionalPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const autoInput = schema.orientation === 'responsive' ? 'row' : (schema.orientation ?? 'row');
  const autoResolved = useAutoPanelOrientation(ref, autoInput);
  const responsiveResolved = useResponsivePanelOrientation();
  const orientation = schema.orientation === 'responsive' ? responsiveResolved : autoResolved;
  const isNested = useContext(DirectionalPanelNestingContext);

  const panel = (
    <div className="sc-directional-panel" data-panel-id={schema.id} ref={ref}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <div className="sc-directional-panel__content" data-orientation={orientation}>
        {children}
      </div>
    </div>
  );

  const content = isNested ? panel : (
    <div className="sc-directional-panel-facade">
      <CabinetBox
        popped
        skipMountAnimation
        autoHeight
        timelineKey={`cabinet-directional-panel-facade-${schema.id}`}
      >
        {panel}
      </CabinetBox>
    </div>
  );

  return (
    <DirectionalPanelNestingContext.Provider value={true}>
      {content}
    </DirectionalPanelNestingContext.Provider>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 11) — takes caller-supplied
// `children`; every real call site in this codebase constructs it inline (e.g.
// AudioRigDrawer.tsx's own <DirectionalPanel schema={...}>{...inline JSX...}</DirectionalPanel>),
// so this memo is correct to add (never harmful) but does not itself produce a measurable win
// until/unless a caller's own children construction becomes referentially stable — the
// conditional-benefit case spec §1.3 describes, same shape Toggle's own facade `children`
// already documents.
export const DirectionalPanel = memo(DirectionalPanelInner);
