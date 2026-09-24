import { memo, useId } from 'react';
import DOMPurify from 'dompurify';

import { CabinetBox } from './CabinetBox';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { Trait } from '@/types/traits';
import './Textbox.css';

interface TextboxProps {
  /** Pre-authored HTML, sanitized via DOMPurify immediately before rendering. Always first-party
   *  data (docs/intent/textbox-component.md) — sanitized anyway as defense-in-depth, never
   *  skipped. */
  html: string;
  /** Wraps the content in a permanently-popped, non-animating CabinetBox facade (matching
   *  TextInput's/DirectionalPanel's own top-level facade — docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md
   *  §1.1) when true. Default false: no CabinetBox, no pop styling, no `hasCabinetry` class. */
  cabinetry?: boolean;
  /** Already-resolved trait id, matching every other trait-aware component (NavTreeNode,
   *  AudioSettingSection, ...) — never derived from `html` or any item id here. Omitted falls back
   *  to getTraitColorStyle('header'), the same pair index.css's own ambient default and Header.tsx
   *  use. See docs/specs/TEXTBOX_COMPONENT.md §1.1 for why this isn't a resolved-by-content lookup. */
  trait?: Trait;
}

/**
 * Renders trusted, first-party HTML content (lore/description copy) with color theming that
 * tracks whichever item it's about. The first primitive in this directory with no ControlSchema,
 * no id, and no value/onChange — see docs/specs/TEXTBOX_COMPONENT.md §1.1.
 *
 * `cabinetry={true}` wraps the content in the same permanently-popped, non-animating CabinetBox
 * facade TextInput/DirectionalPanel's own top-level instances already use — popped/
 * skipMountAnimation/autoHeight are all literals, never derived from state, so this never
 * animates. `cabinetry={false}` (the default) renders no CabinetBox at all.
 *
 * The resolved trait accent style is applied on Textbox's own root (`.sc-textbox`), so both the
 * cabinetry facade (if present) and any other descendant reading `--color-accent-*` inherit it via
 * plain CSS cascade — no separate color wiring inside CabinetBox itself.
 */
function TextboxInner({ html, cabinetry = false, trait }: TextboxProps) {
  // Unconditional per Rules of Hooks; its result is only read when cabinetry is true (§1.2).
  const instanceId = useId();
  const accentStyle = getTraitColorStyle(trait ?? 'header');
  const sanitizedHtml = DOMPurify.sanitize(html);

  const content = (
    <div className="sc-textbox__content" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
  );

  return (
    <div className={cabinetry ? 'sc-textbox hasCabinetry' : 'sc-textbox'} style={accentStyle}>
      {cabinetry ? (
        <CabinetBox popped skipMountAnimation autoHeight timelineKey={`cabinet-textbox-${instanceId}`}>
          {content}
        </CabinetBox>
      ) : (
        content
      )}
    </div>
  );
}

// React.memo (docs/COMPONENT_LIBRARY.md's React.memo boundary) — every prop here is a primitive;
// the default shallow compare is correct, no custom comparator.
export const Textbox = memo(TextboxInner);
