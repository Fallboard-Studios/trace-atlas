import { useCallback, useState } from 'react';
import { AudioLoadPanel } from '../../console/AudioLoadPanel';
import { SectorSettingsDrawer } from '../../console/SectorSettingsDrawer';
import { SessionsPanel } from '../../console/SessionsPanel';
import { useSectionObserver } from '../useSectionObserver';
import { useAccordionOpenState } from '../useAccordionOpenState';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { getTraitColorStyle } from '@/utils/traitColors';
import { hasPendingNavTargetFor } from '@/utils/accordionSync';
import { setViewFadeRoot } from '@/utils/viewFade';
import { useUIStore, type SettingsLeaf, type SettingsSubsection } from '@/stores/uiStore';
import type { AccordionSchema } from '@/types/controls';
import './SettingsContent.css';

/** Tree order — matches navTreeConfig.ts's own `settings` children. First-leaf-on-parent-select
 *  (spec §1.6) reads this array's [0] via useNavTree.ts's own SETTINGS_LEAVES[0]; kept identical
 *  here as the stacking order, so "first in tree order" and "first stacked" never drift apart.
 *  Volume was removed (Header already carries its own always-visible volume slider) and Tempo
 *  moved to Fleet Params -> Pacing (FleetParamsContent.tsx). Labels match navTreeConfig.ts's own
 *  settings.quality/settings.sectorSettings humanLabels ("Audio Profile"/"Audio Seeds",
 *  docs/reference/layout-updates.md) — renamed from "Performance"/"Presets" to catch up with the
 *  nav tree's own already-renamed labels. `sessions` (Roadmap Phase 20, Session Storage Task 10)
 *  is deliberately last — it's unrelated to either audio-tuning section above it, so it's tacked
 *  on as a separate concern rather than inserted between them. `SETTINGS_LEAVES` is independently
 *  re-declared in useNavTree.ts too (kept in sync by hand for this addition — see
 *  docs/DUPLICATE_VALUE_AUDIT.md item 6, opened alongside this change, not fixed here). */
const SETTINGS_LEAVES: readonly SettingsLeaf[] = ['quality', 'sectorSettings', 'sessions'];

// humanLabels below match navTreeConfig.ts's own settings.quality/sectorSettings/sessions
// humanLabels exactly (docs/reference/text-content-tables.md) — this is a separate,
// hand-duplicated table (same known duplication as FleetParamsContent.tsx's own
// FLEET_PARAMS_GROUPS vs. navTreeConfig.ts), kept in sync by hand.
const SETTINGS_ACCORDION_SCHEMAS: Record<SettingsLeaf, AccordionSchema> = {
  quality: { id: 'settings.quality', type: 'accordion', humanLabel: 'Audio Quality' },
  sectorSettings: { id: 'settings.sectorSettings', type: 'accordion', humanLabel: 'Seeds' },
  sessions: { id: 'settings.sessions', type: 'accordion', humanLabel: 'Save & Share' },
};

interface IntroContent {
  loreLabel: string;
  loreDescription: string;
  humanDescription: string;
}

const SETTINGS_SECTION_INTRO: IntroContent = {
  loreLabel: 'Settings — configure your Trace Atlas terminal.',
  loreDescription: 'Adjust how much of the mesh your terminal can track at once, and where in the world you’re listening.',
  humanDescription: 'These are terminal-level settings, not fleet controls — how much your device can handle, which sector of the world you’re viewing, and where your saved sessions live.',
};

const SETTINGS_LEAF_INTRO: Record<SettingsLeaf, IntroContent> = {
  quality: {
    loreLabel: 'Audio Quality — tune your terminal’s processing load.',
    loreDescription: 'Meridia Power Group’s Perpetualish Battery Packs keep probes running, but your terminal has its own limits on how much it can process at once.',
    humanDescription: 'Robot Load limits how many probes can play sound at the same time. Effects Load limits how many effects — like LFOs — can run at once. Lower these if the app stutters or sounds glitchy on your device.',
  },
  sectorSettings: {
    loreLabel: 'Seeds — choose which sector you’re tracking.',
    loreDescription: 'Every sector of the world has its own resource signature — Attenuation Style sets the terrain, Coordinates set the location.',
    humanDescription: 'Attenuation Style changes how sound fades and colors with distance in this world — it’s a starting seed, not a live audio effect, so changing it reshapes the whole locale. Coordinates set which specific spot on that terrain you’re viewing. Together they determine which probes, companies, and melodies you’ll see.',
  },
  sessions: {
    loreLabel: 'Save & Share — keep a record, send it along.',
    loreDescription: 'Archive a mesh configuration to Meridia’s own storage, or transmit it directly to another terminal.',
    humanDescription: 'Save your current setup — every probe, company, and Fleet Params setting — under a name you choose, and load it again later. Share generates a link that hands your exact setup to anyone who opens it, no saving required on their end.',
  },
};

/** Matches navTreeConfig.ts's own settings.quality/settings.sectorSettings children (ids/labels)
 *  — AudioLoadPanel/SectorSettingsDrawer already render Robot Load/Effects Load and Attenuation
 *  Style/Coordinates as their own labeled rows (each with its own sectionAnchorRef, wired inside
 *  those components themselves); these are pure scroll/highlight targets around already-existing
 *  UI, not new content. */
const SETTINGS_SUBSECTIONS: readonly { id: string; leaf: SettingsLeaf; subsection: SettingsSubsection }[] = [
  { id: 'settings.quality.robotLoad', leaf: 'quality', subsection: 'robotLoad' },
  { id: 'settings.quality.effectsLoad', leaf: 'quality', subsection: 'effectsLoad' },
  { id: 'settings.sectorSettings.attenuationStyle', leaf: 'sectorSettings', subsection: 'attenuationStyle' },
  { id: 'settings.sectorSettings.coordinates', leaf: 'sectorSettings', subsection: 'coordinates' },
];

/** Ref callback registering/clearing a section's scroll anchor (src/utils/sectionRefs.ts) — a
 *  wrapper div per section, since AccordionContainer itself takes no ref prop. */
function sectionAnchorRef(id: string) {
  return (el: HTMLDivElement | null) => {
    if (el) setSectionRef(id, el);
    else clearSectionRef(id);
  };
}

/**
 * Settings branch content (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2) — replaces the old
 * content-swap model (one leaf rendered, gated on selectedSettingsLeaf) with a single scrollable
 * view stacking both leaves, each wrapped in an accordion. Each accordion's open/closed state is
 * manual and independent (`useAccordionOpenState`) — a nav click only scrolls to a section, and
 * scrollspy only updates `selectedSettingsLeaf` for tree highlighting; neither opens or closes an
 * accordion (Crawford's own follow-up call, 2026-09-24, reversing this pass's original derived-
 * single-open-accordion design). Performance opens by default on mount. Each section's real
 * content only mounts once its anchor has been scrolled near (useSectionObserver's lazy-mount
 * gate, §7 Q5).
 */
export function SettingsContent() {
  const setSelectedSettingsLeaf = useUIStore((s) => s.setSelectedSettingsLeaf);
  const setSelectedSettingsSubsection = useUIStore((s) => s.setSelectedSettingsSubsection);

  const sectionIds = SETTINGS_LEAVES.map((leaf) => SETTINGS_ACCORDION_SCHEMAS[leaf].id);
  const { hasApproached } = useSectionObserver(sectionIds, (id) => {
    const leaf = SETTINGS_LEAVES.find((l) => SETTINGS_ACCORDION_SCHEMAS[l].id === id);
    if (leaf) {
      setSelectedSettingsLeaf(leaf);
      setSelectedSettingsSubsection(null);
    }
  });

  // A leaf's own subsection anchors (registered inside AudioLoadPanel/SectorSettingsDrawer
  // themselves) only exist in the DOM once that leaf's content has mounted (the hasApproached
  // gate below) — included here only once available, so this observer's own effect (keyed on
  // this array's contents) re-runs and finds them right after they mount, instead of setting up
  // once at first render and never seeing them.
  const subsectionIds = SETTINGS_SUBSECTIONS.filter((s) => hasApproached(SETTINGS_ACCORDION_SCHEMAS[s.leaf].id)).map((s) => s.id);
  useSectionObserver(subsectionIds, (id) => {
    const sub = SETTINGS_SUBSECTIONS.find((s) => s.id === id);
    if (sub) {
      setSelectedSettingsLeaf(sub.leaf);
      setSelectedSettingsSubsection(sub.subsection);
    }
  });

  const { isOpen, setOpen } = useAccordionOpenState(sectionIds, SETTINGS_ACCORDION_SCHEMAS[SETTINGS_LEAVES[0]].id);

  // Starts hidden only when a nav click was already mid-flight targeting one of this view's own
  // accordions at the moment of this component's OWN first mount — i.e. arriving here from a
  // genuinely different view. Evaluated once (lazy useState initializer). NavTreeNode's own
  // onSettled callback (scroll, then fadeInView) is what reveals it again once the target
  // accordion has actually finished opening — see src/utils/viewFade.ts.
  const [startHidden] = useState(() => hasPendingNavTargetFor(sectionIds));

  // useCallback with an empty dependency array — a stable ref identity, unlike a plain inline
  // arrow function (which React re-invokes with null then the element again on every single
  // re-render, not just mount/unmount). Setting opacity via the JSX style prop instead would be
  // reapplied on every re-render too, fighting GSAP's own inline-style tween once fadeInView()
  // starts animating opacity back up and making the fade look instant (found live).
  const rootRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      setSectionRef('settings', el);
      if (startHidden) el.style.opacity = '0';
    } else {
      clearSectionRef('settings');
    }
    setViewFadeRoot(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startHidden never changes after mount
  }, []);

  function renderLeafContent(leaf: SettingsLeaf) {
    if (leaf === 'quality') {
      // Relocated from AudioRigDrawer.tsx unchanged (Task 13) — AudioLoadPanel is a fully
      // self-contained, prop-less component; only where it's rendered from changed.
      return <AudioLoadPanel />;
    }
    if (leaf === 'sessions') return <SessionsPanel />;
    return <SectorSettingsDrawer />;
  }

  return (
    <div ref={rootRef} className="settings-content" style={getTraitColorStyle('seed')}
    >
      <IntroPanel
        loreLabel={SETTINGS_SECTION_INTRO.loreLabel}
        loreDescription={SETTINGS_SECTION_INTRO.loreDescription}
        humanDescription={SETTINGS_SECTION_INTRO.humanDescription}
        trait="seed"
      />
      {SETTINGS_LEAVES.map((leaf) => {
        const id = SETTINGS_ACCORDION_SCHEMAS[leaf].id;
        return (
          <div key={id} ref={sectionAnchorRef(id)}>
            <AccordionContainer
              schema={SETTINGS_ACCORDION_SCHEMAS[leaf]}
              open={isOpen(id)}
              onOpenChange={(open) => setOpen(id, open)}
              style={getTraitColorStyle('seed')}
            >
              {hasApproached(id) ? (
                <>
                  <IntroPanel
                    loreLabel={SETTINGS_LEAF_INTRO[leaf].loreLabel}
                    loreDescription={SETTINGS_LEAF_INTRO[leaf].loreDescription}
                    humanDescription={SETTINGS_LEAF_INTRO[leaf].humanDescription}
                    trait="seed"
                  />
                  {renderLeafContent(leaf)}
                </>
              ) : null}
            </AccordionContainer>
          </div>
        );
      })}
    </div>
  );
}

export default SettingsContent;
