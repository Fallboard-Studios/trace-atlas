import { ConsolePanel } from './ConsolePanel';
import { Textbox } from '@/components/ui/controls/Textbox';
import { useUIStore } from '@/stores/uiStore';
import './ContentPane.css';

// First-party, trusted copy (Textbox.tsx sanitizes it anyway, defense-in-depth) — the blank/
// landing state's own content, filling the "no tile active" gap Textbox has had since it shipped
// with no real consumer (docs/COMPONENT_LIBRARY.md's Textbox entry).
const HOME_HTML = `
  <h2>Trace Atlas</h2>
  <p>Remote link established to the Pelagos Ocean floor. A dozen autonomous probes are down
  there right now, each running a procedurally generated melody shaped by the factory that
  built it.</p>
  <p>Open the panel on the left to inspect a Probe's melody and synth, tune the Fleet's shared
  effects, or manage the Companies coordinating them.</p>
`;

/**
 * Repurposed from Console.tsx (spec §7 Q6, docs/specs/NAV_LAYOUT_REWRITE.md Task 8) — the single
 * content area the new nav tree opens into. activeHubTile === null is the blank/landing state
 * (nothing selected in the tree yet): a small Textbox card with welcome copy, deliberately NOT a
 * full-bleed overlay like the active-tile case below — Robot.tsx's own click handler relies on
 * nothing blocking WorldView at this state (its own comment: "this click reaches WorldView for
 * free, no pointer-events special-casing needed"), so covering the whole screen here would break
 * clicking a robot directly in the world to select it. See ContentPane.css's own
 * .content-pane__home rule for the sized-to-content positioning that preserves that click-through.
 * Once a tile is active, still renders through the existing, unmigrated ConsolePanel/TILE_CONTENT
 * dispatch — no content component changes here. The close control that used to live here now
 * lives in NavPanel as "Home" (relocated, same reset behavior — see NavPanel.tsx's handleHome).
 */
export function ContentPane() {
  const activeHubTile = useUIStore((s) => s.activeHubTile);

  if (activeHubTile === null) {
    return (
      <div className="content-pane__home">
        <Textbox html={HOME_HTML} cabinetry />
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
