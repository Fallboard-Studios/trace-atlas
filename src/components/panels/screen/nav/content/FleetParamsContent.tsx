import { AudioRigDrawer, AudioRigEffectPanel } from '../../console/AudioRigDrawer';
import { useSectionObserver } from '../useSectionObserver';
import { useAccordionOpenState } from '../useAccordionOpenState';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { BPM_SCHEMA, type AudioRigEffectKey } from '@/data/audioRigConfig';
import { useUIStore, type FleetParamsGroup, type SelectedFleetParamsEffect } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { AccordionSchema } from '@/types/controls';
import type { Trait } from '@/types/traits';
import './FleetParamsContent.css';

interface FleetParamsLeaf {
  id: string;
  humanLabel: string;
  effectKey: SelectedFleetParamsEffect;
}

interface FleetParamsGroupDef {
  id: FleetParamsGroup;
  nodeId: string;
  humanLabel: string;
  /** Colors this group's own accordion (docs/specs/FLEET_PARAMS_CONTENT_REWORK.md §1.5) — the same
   *  4 values already assigned to these groups in navTreeConfig.ts and AudioRigDrawer.tsx's own
   *  AUDIO_RIG_EFFECT_TRAIT, restated here at group granularity rather than a parallel lookup map. */
  trait: Trait;
  leaves: FleetParamsLeaf[];
}

/** Matches navTreeConfig.ts's own fleetParams subtree (ids/labels/traits) and useNavTree.ts's
 *  FLEET_PARAMS_GROUP_FIRST_LEAF ordering — kept as one flat source here since this content
 *  component, not the tree, decides stacking/accordion order. All 4 groups render identically:
 *  one accordion -> one group IntroPanel -> N leaf sections with no accordion of their own
 *  (docs/specs/FLEET_PARAMS_CONTENT_REWORK.md). */
const FLEET_PARAMS_GROUPS: FleetParamsGroupDef[] = [
  {
    id: 'pacing',
    nodeId: 'fleetParams.pacing',
    humanLabel: 'Pacing',
    trait: 'composition',
    leaves: [
      { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo', effectKey: 'tempo' },
      { id: 'fleetParams.pacing.automaticEffects', humanLabel: 'Automatic Intensity', effectKey: 'automaticEffects' },
    ],
  },
  {
    id: 'eqFilters',
    nodeId: 'fleetParams.eqFilters',
    humanLabel: 'EQ & Filters',
    trait: 'spectral',
    leaves: [
      { id: 'fleetParams.eqFilters.eq', humanLabel: '3-Band EQ', effectKey: 'eq3' },
      { id: 'fleetParams.eqFilters.hpf', humanLabel: 'High-Pass Filter', effectKey: 'filterHPF' },
      { id: 'fleetParams.eqFilters.lpf', humanLabel: 'Low-Pass Filter', effectKey: 'filterLPF' },
    ],
  },
  {
    id: 'timeSpace',
    nodeId: 'fleetParams.timeSpace',
    humanLabel: 'Time & Space',
    trait: 'timeSpace',
    leaves: [
      { id: 'fleetParams.timeSpace.reverb', humanLabel: 'Reverb', effectKey: 'reverb' },
      { id: 'fleetParams.timeSpace.delay', humanLabel: 'Delay', effectKey: 'delay' },
    ],
  },
  {
    id: 'output',
    nodeId: 'fleetParams.output',
    humanLabel: 'Output',
    trait: 'output',
    leaves: [
      { id: 'fleetParams.output.compression', humanLabel: 'Compressor', effectKey: 'compressor' },
      { id: 'fleetParams.output.limiter', humanLabel: 'Limiter', effectKey: 'limiter' },
    ],
  },
];

const ALL_LEAVES = FLEET_PARAMS_GROUPS.flatMap((g) => g.leaves);

const PLACEHOLDER_LORE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.';
const PLACEHOLDER_HUMAN = 'Placeholder copy — real lore/human descriptions land in a later pass.';

function sectionAnchorRef(id: string) {
  return (el: HTMLDivElement | null) => {
    if (el) setSectionRef(id, el);
    else clearSectionRef(id);
  };
}

/** Tempo and Automatic Intensity aren't generic AudioRigEffectPanel leaves — Tempo is
 *  audioStore.bpm (a separate top-level field, not part of the globalAudio effect chain
 *  AudioRigEffectPanel reads) and Automatic Intensity has no AUDIO_RIG_CONFIG block of its own
 *  (its real control lives inside AudioRigDrawer, relocated from Settings -> Tempo verbatim, see
 *  docs/specs/FLEET_PARAMS_CONTENT_REWORK.md §1.4). Every other leaf falls through to the generic
 *  AudioRigEffectPanel path unchanged. */
function renderLeaf(effectKey: SelectedFleetParamsEffect, bpm: number) {
  if (effectKey === 'tempo') {
    return <SliderLinear schema={BPM_SCHEMA} value={bpm} onChange={(v) => useAudioStore.getState().setBPM(v)} />;
  }
  if (effectKey === 'automaticEffects') {
    return <AudioRigDrawer />;
  }
  return <AudioRigEffectPanel effectKey={effectKey as AudioRigEffectKey} />;
}

/**
 * Fleet Params branch content (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2, docs/specs/
 * FLEET_PARAMS_CONTENT_REWORK.md) — a single scrollable view: one always-open, spectral-traited
 * outer panel holding the section's own IntroPanel, then all 4 groups (Pacing, EQ & Filters, Time
 * & Space, Output) stacked identically — each its own accordion (colored by its own trait), each
 * containing a group-level IntroPanel plus its leaves as plain anchor divs, no leaf ever getting
 * an accordion of its own. Every group accordion has manual, independent open/closed state
 * (`useAccordionOpenState`) — opening one never closes another, and a nav click/scrollspy only
 * scrolls/updates `selectedFleetParamsEffect` for tree highlighting, never an accordion's own
 * state (Crawford's own follow-up call, 2026-09-24). A leaf's own scroll anchor only exists in the
 * DOM once its group's own anchor has approached (its content is lazy-mounted behind that same
 * gate) — the 2-tier `useSectionObserver` below mirrors that.
 */
export function FleetParamsContent() {
  const setSelectedFleetParamsEffect = useUIStore((s) => s.setSelectedFleetParamsEffect);
  const bpm = useAudioStore((s) => s.bpm);

  const groupIds = FLEET_PARAMS_GROUPS.map((g) => g.nodeId);
  const { hasApproached: groupHasApproached } = useSectionObserver(['fleetParams', ...groupIds], (id) => {
    const group = FLEET_PARAMS_GROUPS.find((g) => g.nodeId === id);
    if (group) setSelectedFleetParamsEffect(group.leaves[0].effectKey);
  });

  // Included here only once a group has approached, so this observer's own effect (keyed on this
  // array's contents) re-runs and finds each group's leaf anchors right after they mount.
  const approachedLeafIds = FLEET_PARAMS_GROUPS
    .filter((g) => groupHasApproached(g.nodeId))
    .flatMap((g) => g.leaves.map((l) => l.id));
  const { hasApproached: leafHasApproached } = useSectionObserver(approachedLeafIds, (id) => {
    const leaf = ALL_LEAVES.find((l) => l.id === id);
    if (leaf) setSelectedFleetParamsEffect(leaf.effectKey);
  });

  const { isOpen, setOpen } = useAccordionOpenState(FLEET_PARAMS_GROUPS[0].nodeId);

  return (
    <div ref={sectionAnchorRef('fleetParams')} className="fleet-params-content" style={getTraitColorStyle('spectral')}>
      <IntroPanel
        loreLabel="Fleet Params LORE TITLE"
        loreDescription={PLACEHOLDER_LORE}
        humanDescription={PLACEHOLDER_HUMAN}
        trait="spectral"
      />
      {FLEET_PARAMS_GROUPS.map((group) => {
        const schema: AccordionSchema = { id: group.nodeId, type: 'accordion', humanLabel: group.humanLabel };
        return (
          <div key={group.nodeId} ref={sectionAnchorRef(group.nodeId)}>
            <AccordionContainer
              schema={schema}
              open={isOpen(group.nodeId)}
              onOpenChange={(open) => setOpen(group.nodeId, open)}
              style={getTraitColorStyle(group.trait)}
            >
              {groupHasApproached(group.nodeId) ? (
                <>
                  <IntroPanel
                    loreLabel={`${group.humanLabel} LORE TITLE`}
                    loreDescription={PLACEHOLDER_LORE}
                    humanDescription={PLACEHOLDER_HUMAN}
                    trait={group.trait}
                  />
                  {group.leaves.map((leaf) => (
                    <div key={leaf.id} ref={sectionAnchorRef(leaf.id)}>
                      {leafHasApproached(leaf.id) ? renderLeaf(leaf.effectKey, bpm) : null}
                    </div>
                  ))}
                </>
              ) : null}
            </AccordionContainer>
          </div>
        );
      })}
    </div>
  );
}

export default FleetParamsContent;
