import { useState } from 'react';
import { AudioRigDrawer, AudioRigEffectPanel } from '../../console/AudioRigDrawer';
import { useSectionObserver } from '../useSectionObserver';
import { useAccordionOpenState } from '../useAccordionOpenState';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { hasPendingNavTargetFor } from '@/utils/accordionSync';
import { setViewFadeRoot } from '@/utils/viewFade';
import { BPM_SCHEMA, SWELL_FREQUENCY_SCHEMA, SWELL_DURATION_SCHEMA, type AudioRigEffectKey } from '@/data/audioRigConfig';
import { useUIStore, type FleetParamsGroup, type SelectedFleetParamsEffect } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { AccordionSchema, DirectionalPanelSchema } from '@/types/controls';
import type { Trait } from '@/types/traits';
import './FleetParamsContent.css';

/**
 * Pacing's 4 leaves (Tempo, Frequency, Duration, Automatic Intensity) render as 2 rows of 2
 * instead of each getting its own panel (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md) —
 * top row Tempo+Frequency, bottom row Duration+Intensity — same 'responsive'-orientation
 * DirectionalPanel shape AudioRigDrawer.tsx's own COMPRESSOR_TOP_ROW_SCHEMA/
 * COMPRESSOR_BOTTOM_ROW_SCHEMA already establish for a 2-control row (side-by-side on desktop,
 * stacked on mobile/tablet). Top-level (not nested in anything else at this point), so each is
 * the one CabinetBox facade its 2 leaves render inside — AudioRigDrawer no longer wraps itself in
 * its own panel at all as of docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §2.1, so this is
 * the only panel wrapping it now. Pacing-only: the other 3 groups' leaves each keep their own
 * separate panel.
 */
const PACING_TOP_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.pacing.topRow', type: 'directionalPanel', orientation: 'responsive' };
const PACING_BOTTOM_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.pacing.bottomRow', type: 'directionalPanel', orientation: 'responsive' };

interface FleetParamsLeaf {
  id: string;
  humanLabel: string;
  effectKey: SelectedFleetParamsEffect;
  /** Pacing-only — which of its 2 rows this leaf renders in (docs/specs/
   *  AUTOMATION_FREQUENCY_DURATION_SPLIT.md). Row membership lives on the
   *  leaf itself rather than being inferred from array position, so
   *  reordering or inserting a Pacing leaf can't silently drop one from
   *  either row. Undefined for every other group's leaves, which don't
   *  split into rows at all. */
  row?: 'top' | 'bottom';
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
      { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo', effectKey: 'tempo', row: 'top' },
      { id: 'fleetParams.pacing.frequency', humanLabel: 'Frequency', effectKey: 'swellFrequency', row: 'top' },
      { id: 'fleetParams.pacing.duration', humanLabel: 'Duration', effectKey: 'swellDuration', row: 'bottom' },
      { id: 'fleetParams.pacing.automaticEffects', humanLabel: 'Automatic Intensity', effectKey: 'automaticEffects', row: 'bottom' },
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

/** Tempo, Frequency, Duration, and Automatic Intensity aren't generic AudioRigEffectPanel leaves —
 *  Tempo/Frequency/Duration are separate top-level audioStore fields (not part of the globalAudio
 *  effect chain AudioRigEffectPanel reads), and Automatic Intensity has no AUDIO_RIG_CONFIG block
 *  of its own (its real control lives inside AudioRigDrawer, relocated from Settings -> Tempo
 *  verbatim, see docs/specs/FLEET_PARAMS_CONTENT_REWORK.md §1.4). Every other leaf falls through
 *  to the generic AudioRigEffectPanel path unchanged. Frequency/Duration's own values are passed
 *  in as plain data (same shape Tempo's `bpm` already uses) rather than each having renderLeaf
 *  call its own useAudioStore hook — renderLeaf is a plain function, not a component, so a
 *  conditional hook call here would violate the Rules of Hooks (docs/specs/
 *  AUTOMATION_FREQUENCY_DURATION_SPLIT.md §4's own explicit warning against this shape). */
function renderLeaf(effectKey: SelectedFleetParamsEffect, bpm: number, swellFrequency: number, swellDuration: number) {
  if (effectKey === 'tempo') {
    return (
      <div className="audio-rig-drawer__param-row">
        <SliderLinear schema={BPM_SCHEMA} value={bpm} onChange={(v) => useAudioStore.getState().setBPM(v)} />
      </div>
    );
  }
  if (effectKey === 'swellFrequency') {
    return (
      <div className="audio-rig-drawer__param-row">
        <SliderLog schema={SWELL_FREQUENCY_SCHEMA} value={swellFrequency} onChange={(v) => useAudioStore.getState().setSwellFrequency(v)} />
      </div>
    );
  }
  if (effectKey === 'swellDuration') {
    return (
      <div className="audio-rig-drawer__param-row">
        <SliderLinear schema={SWELL_DURATION_SCHEMA} value={swellDuration} onChange={(v) => useAudioStore.getState().setSwellDuration(v)} />
      </div>
    );
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
  const swellFrequency = useAudioStore((s) => s.swellFrequency);
  const swellDuration = useAudioStore((s) => s.swellDuration);

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

  const { isOpen, setOpen } = useAccordionOpenState(groupIds, FLEET_PARAMS_GROUPS[0].nodeId);

  // Starts hidden only when a nav click was already mid-flight targeting one of this view's own
  // accordions at the moment of this component's OWN first mount — i.e. arriving here from a
  // genuinely different view. Evaluated once (lazy useState initializer). NavTreeNode's own
  // onSettled callback (scroll, then fadeInView) is what reveals it again once the target
  // accordion chain has actually finished opening — see src/utils/viewFade.ts.
  const [startHidden] = useState(() => hasPendingNavTargetFor(groupIds));

  return (
    <div
      ref={(el) => {
        if (el) setSectionRef('fleetParams', el);
        else clearSectionRef('fleetParams');
        setViewFadeRoot(el);
      }}
      className="fleet-params-content"
      style={startHidden ? { ...getTraitColorStyle('spectral'), opacity: 0 } : getTraitColorStyle('spectral')}
    >
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
                  {group.id === 'pacing' ? (
                    <>
                      <DirectionalPanel schema={PACING_TOP_ROW_SCHEMA}>
                        {group.leaves.filter((leaf) => leaf.row === 'top').map((leaf) => (
                          <div key={leaf.id} ref={sectionAnchorRef(leaf.id)}>
                            {leafHasApproached(leaf.id) ? renderLeaf(leaf.effectKey, bpm, swellFrequency, swellDuration) : null}
                          </div>
                        ))}
                      </DirectionalPanel>
                      <DirectionalPanel schema={PACING_BOTTOM_ROW_SCHEMA}>
                        {group.leaves.filter((leaf) => leaf.row === 'bottom').map((leaf) => (
                          <div key={leaf.id} ref={sectionAnchorRef(leaf.id)}>
                            {leafHasApproached(leaf.id) ? renderLeaf(leaf.effectKey, bpm, swellFrequency, swellDuration) : null}
                          </div>
                        ))}
                      </DirectionalPanel>
                    </>
                  ) : (
                    group.leaves.map((leaf) => (
                      <div key={leaf.id} ref={sectionAnchorRef(leaf.id)}>
                        {leafHasApproached(leaf.id) ? renderLeaf(leaf.effectKey, bpm, swellFrequency, swellDuration) : null}
                      </div>
                    ))
                  )}
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
