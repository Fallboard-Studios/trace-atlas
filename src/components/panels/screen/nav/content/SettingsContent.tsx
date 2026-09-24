import { AudioLoadPanel } from '../../console/AudioLoadPanel';
import { SectorSettingsDrawer } from '../../console/SectorSettingsDrawer';
import { useSectionObserver } from '../useSectionObserver';
import { useAccordionOpenState } from '../useAccordionOpenState';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { BPM_SCHEMA } from '@/data/audioRigConfig';
import { useUIStore, type SettingsLeaf } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import type { AccordionSchema, SliderLinearSchema } from '@/types/controls';

/** Relocated from Header.tsx verbatim (docs/tasks/NAV_LAYOUT_REWRITE.md Task 11) — same id/
 *  range/step, same audioStore.volume binding. Header keeps only Mute now. */
const VOLUME_SCHEMA: SliderLinearSchema = {
  id: 'headerVolume',
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
  orientation: 'horizontal',
  type: 'sliderLinear',
};

/** Tree order — matches navTreeConfig.ts's own `settings` children. First-leaf-on-parent-select
 *  (spec §1.6) reads this array's [0] via useNavTree.ts's own SETTINGS_LEAVES[0]; kept identical
 *  here as the stacking order, so "first in tree order" and "first stacked" never drift apart. */
const SETTINGS_LEAVES: readonly SettingsLeaf[] = ['volume', 'quality', 'tempo', 'sectorSettings'];

const SETTINGS_ACCORDION_SCHEMAS: Record<SettingsLeaf, AccordionSchema> = {
  volume: { id: 'settings.volume', type: 'accordion', humanLabel: 'Volume' },
  quality: { id: 'settings.quality', type: 'accordion', humanLabel: 'Quality' },
  tempo: { id: 'settings.tempo', type: 'accordion', humanLabel: 'Tempo' },
  sectorSettings: { id: 'settings.sectorSettings', type: 'accordion', humanLabel: 'Sector Settings' },
};

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
 * view stacking all 4 leaves, each wrapped in an accordion. Each accordion's open/closed state is
 * manual and independent (`useAccordionOpenState`) — a nav click only scrolls to a section, and
 * scrollspy only updates `selectedSettingsLeaf` for tree highlighting; neither opens or closes an
 * accordion (Crawford's own follow-up call, 2026-09-24, reversing this pass's original derived-
 * single-open-accordion design). Volume opens by default on mount. Each section's real content
 * only mounts once its anchor has been scrolled near (useSectionObserver's lazy-mount gate, §7 Q5).
 */
export function SettingsContent() {
  const setSelectedSettingsLeaf = useUIStore((s) => s.setSelectedSettingsLeaf);
  const isPoweredOn = useUIStore((s) => s.isPoweredOn);
  const volume = useAudioStore((s) => s.volume);
  const bpm = useAudioStore((s) => s.bpm);

  const sectionIds = SETTINGS_LEAVES.map((leaf) => SETTINGS_ACCORDION_SCHEMAS[leaf].id);
  const { hasApproached } = useSectionObserver(sectionIds, (id) => {
    const leaf = SETTINGS_LEAVES.find((l) => SETTINGS_ACCORDION_SCHEMAS[l].id === id);
    if (leaf) setSelectedSettingsLeaf(leaf);
  });

  const { isOpen, setOpen } = useAccordionOpenState(SETTINGS_ACCORDION_SCHEMAS[SETTINGS_LEAVES[0]].id);

  function renderLeafContent(leaf: SettingsLeaf) {
    if (leaf === 'volume') {
      return (
        <SliderLinear
          schema={VOLUME_SCHEMA}
          value={volume * 100}
          onChange={(pct) => {
            if (!isPoweredOn) return;
            useAudioStore.getState().setVolume(pct / 100);
          }}
          disabled={!isPoweredOn}
        />
      );
    }
    if (leaf === 'tempo') {
      // Relocated from AudioRigDrawer.tsx verbatim (Task 12) — bpm is stored and displayed in the
      // same BPM units, no scaling, matching BPM_SCHEMA's own doc comment.
      return <SliderLinear schema={BPM_SCHEMA} value={bpm} onChange={(v) => useAudioStore.getState().setBPM(v)} />;
    }
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
