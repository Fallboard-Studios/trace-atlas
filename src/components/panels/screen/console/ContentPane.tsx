import { useState } from 'react';
import { ConsolePanel } from './ConsolePanel';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { useUIStore } from '@/stores/uiStore';
import { introProps, labels } from '@/content';
import type { AccordionSchema } from '@/types/controls';
import './ContentPane.css';

// The blank/landing state's own content — IntroPanel's shape (headline, lore blurb, human
// explanation), unchanged since the Textbox-era HOME_HTML this replaced (docs/reference/
// copy-tone-guide.md). Wrapped in a collapsible AccordionContainer (below) so the card can shrink
// out of the way on phones, where it used to occupy the whole screen with no way to collapse it.
const HOME_INTRO = introProps('home.root');
const HOME_ACCORDION_SCHEMA: AccordionSchema = { id: 'home.welcome', type: 'accordion', ...labels('home.root') };

/**
 * Repurposed from Console.tsx (spec §7 Q6, docs/specs/NAV_LAYOUT_REWRITE.md Task 8) — the single
 * content area the new nav tree opens into. activeHubTile === null is the blank/landing state
 * (nothing selected in the tree yet): a small "Welcome" AccordionContainer wrapping an IntroPanel,
 * deliberately NOT a full-bleed overlay like the active-tile case below — Robot.tsx's own click
 * handler relies on nothing blocking WorldView at this state (its own comment: "this click
 * reaches WorldView for free, no pointer-events special-casing needed"), so covering the whole
 * screen here would break clicking a robot directly in the world to select it. See
 * ContentPane.css's own .content-pane__home rule for the sized-to-content positioning that
 * preserves that click-through. Open by default (`welcomeOpen` below) so first load looks the
 * same as before; collapsing it is what lets a phone user see/select robots underneath without
 * the card eating the whole viewport — this swap (temporary — Crawford's own call, 2026-10-06 —
 * while other phases are worked on) otherwise reuses only existing components: AccordionContainer
 * + IntroPanel, same as every other drawer section. Once a tile is active, still renders through
 * the existing, unmigrated ConsolePanel/TILE_CONTENT dispatch — no content component changes
 * here. The close control that used to live here now lives in NavPanel as "Home" (relocated, same
 * reset behavior — see NavPanel.tsx's handleHome).
 */
export function ContentPane() {
  const activeHubTile = useUIStore((s) => s.activeHubTile);
  const [welcomeOpen, setWelcomeOpen] = useState(true);

  if (activeHubTile === null) {
    return (
      <div className="content-pane__home">
        <AccordionContainer schema={HOME_ACCORDION_SCHEMA} open={welcomeOpen} onOpenChange={setWelcomeOpen}>
          <IntroPanel {...HOME_INTRO} />
        </AccordionContainer>
      </div>
    );
  }

  return (
    <div className="content-pane">
      <ConsolePanel />
    </div>
  );
}

export default ContentPane;
