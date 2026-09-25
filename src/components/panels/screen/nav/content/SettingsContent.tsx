import { AudioLoadPanel } from '../../console/AudioLoadPanel';
import { SectorSettingsDrawer } from '../../console/SectorSettingsDrawer';
import { useSectionObserver } from '../useSectionObserver';
import { useAccordionOpenState } from '../useAccordionOpenState';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { useUIStore, type SettingsLeaf, type SettingsSubsection } from '@/stores/uiStore';
import type { AccordionSchema } from '@/types/controls';

/** Tree order — matches navTreeConfig.ts's own `settings` children. First-leaf-on-parent-select
 *  (spec §1.6) reads this array's [0] via useNavTree.ts's own SETTINGS_LEAVES[0]; kept identical
 *  here as the stacking order, so "first in tree order" and "first stacked" never drift apart.
 *  Volume was removed (Header already carries its own always-visible volume slider) and Tempo
 *  moved to Fleet Params -> Pacing (FleetParamsContent.tsx). */
const SETTINGS_LEAVES: readonly SettingsLeaf[] = ['quality', 'sectorSettings'];

const SETTINGS_ACCORDION_SCHEMAS: Record<SettingsLeaf, AccordionSchema> = {
  quality: { id: 'settings.quality', type: 'accordion', humanLabel: 'Performance' },
  sectorSettings: { id: 'settings.sectorSettings', type: 'accordion', humanLabel: 'Presets' },
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

  const { isOpen, setOpen } = useAccordionOpenState(SETTINGS_ACCORDION_SCHEMAS[SETTINGS_LEAVES[0]].id);

  function renderLeafContent(leaf: SettingsLeaf) {
    if (leaf === 'quality') {
      // Relocated from AudioRigDrawer.tsx unchanged (Task 13) — AudioLoadPanel is a fully
      // self-contained, prop-less component; only where it's rendered from changed.
      return <AudioLoadPanel />;
    }
    return <SectorSettingsDrawer />;
  }

  return (
    <div ref={sectionAnchorRef('settings')}>
      {SETTINGS_LEAVES.map((leaf) => {
        const id = SETTINGS_ACCORDION_SCHEMAS[leaf].id;
        return (
          <div key={id} ref={sectionAnchorRef(id)}>
            <AccordionContainer
              schema={SETTINGS_ACCORDION_SCHEMAS[leaf]}
              open={isOpen(id)}
              onOpenChange={(open) => setOpen(id, open)}
            >
              {hasApproached(id) ? renderLeafContent(leaf) : null}
            </AccordionContainer>
          </div>
        );
      })}
    </div>
  );
}

export default SettingsContent;
