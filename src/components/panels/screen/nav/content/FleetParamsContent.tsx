import { useCallback, useState } from 'react';
import { AudioRigDrawer, AudioRigEffectPanel } from '../../console/AudioRigDrawer';
import { LfoBankLanePanel } from '../../console/LfoBankLanePanel';
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
import type { LfoLaneId } from '@/types/lfo';
import { labels, introProps, type ContentKey } from '@/content';
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

/** LFO Bank's own 4 synthetic SelectedFleetParamsEffect members ('laneA'-'laneD') map back onto
 *  the real LfoLaneId each LfoBankLanePanel reads from the store. */
const LFO_BANK_EFFECT_KEY_TO_LANE: Record<'laneA' | 'laneB' | 'laneC' | 'laneD', LfoLaneId> = {
  laneA: 'a',
  laneB: 'b',
  laneC: 'c',
  laneD: 'd',
};

interface FleetParamsLeaf {
  id: string;
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
  /** The group's concept — accordion heading + IntroPanel copy come from CONTENT. */
  content: ContentKey;
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
    content: 'fleet.pacing',
    trait: 'composition',
    leaves: [
      { id: 'fleetParams.pacing.tempo', effectKey: 'tempo', row: 'top' },
      { id: 'fleetParams.pacing.frequency', effectKey: 'swellFrequency', row: 'top' },
      { id: 'fleetParams.pacing.duration', effectKey: 'swellDuration', row: 'bottom' },
      { id: 'fleetParams.pacing.automaticEffects', effectKey: 'automaticEffects', row: 'bottom' },
    ],
  },
  {
    // New top-level group (docs/tasks/LFO_BANK.md Task 15), displayed as "LFO Bank" — replaces the
    // former 2-leaf "Drift" group entirely (not renamed: a different control altogether), positioned
    // right after Pacing rather than after EQ & Filters where Drift used to sit. This is a
    // *different* table from navTreeConfig.ts's own NAV_TREE_SCHEMA (this content component, not
    // the tree, decides stacking/accordion order — see this file's own doc comment above) — both
    // must be kept in sync by hand, same as every other group here already is. Holds 4 leaves, one
    // per world lane (a-d) — each an LfoBankLanePanel, which reads/writes useAudioStore directly
    // rather than via props, same convention the old FleetDriftPanel/RobotDriftPanel established.
    id: 'lfoBank',
    nodeId: 'fleetParams.lfoBank',
    content: 'fleet.lfoBank',
    trait: 'timeSpace',
    leaves: [
      { id: 'fleetParams.lfoBank.a', effectKey: 'laneA' },
      { id: 'fleetParams.lfoBank.b', effectKey: 'laneB' },
      { id: 'fleetParams.lfoBank.c', effectKey: 'laneC' },
      { id: 'fleetParams.lfoBank.d', effectKey: 'laneD' },
    ],
  },
  {
    id: 'eqFilters',
    nodeId: 'fleetParams.eqFilters',
    content: 'fleet.eqFilters',
    trait: 'spectral',
    leaves: [
      { id: 'fleetParams.eqFilters.eq', effectKey: 'eq3' },
      { id: 'fleetParams.eqFilters.hpf', effectKey: 'filterHPF' },
      { id: 'fleetParams.eqFilters.lpf', effectKey: 'filterLPF' },
    ],
  },
  {
    id: 'timeSpace',
    nodeId: 'fleetParams.timeSpace',
    content: 'fleet.timeSpace',
    trait: 'timeSpace',
    leaves: [
      { id: 'fleetParams.timeSpace.reverb', effectKey: 'reverb' },
      { id: 'fleetParams.timeSpace.delay', effectKey: 'delay' },
    ],
  },
  {
    id: 'output',
    nodeId: 'fleetParams.output',
    content: 'fleet.output',
    trait: 'output',
    leaves: [
      { id: 'fleetParams.output.compression', effectKey: 'compressor' },
      { id: 'fleetParams.output.limiter', effectKey: 'limiter' },
    ],
  },
];

const ALL_LEAVES = FLEET_PARAMS_GROUPS.flatMap((g) => g.leaves);

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
  if (effectKey === 'laneA' || effectKey === 'laneB' || effectKey === 'laneC' || effectKey === 'laneD') {
    return <LfoBankLanePanel lane={LFO_BANK_EFFECT_KEY_TO_LANE[effectKey]} />;
  }
  return <AudioRigEffectPanel effectKey={effectKey as AudioRigEffectKey} />;
}

/**
 * Fleet Params branch content (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2, docs/specs/
 * FLEET_PARAMS_CONTENT_REWORK.md) — a single scrollable view: one always-open, spectral-traited
 * outer panel holding the section's own IntroPanel, then all 5 groups (Pacing, LFO Bank,
 * EQ & Filters, Time & Space, Output — LFO Bank added by docs/tasks/LFO_BANK.md Task 15,
 * replacing the former Drift group entirely; its 4 leaves — one per world lane — are covered in
 * that group's own def comment above) stacked identically — each its own accordion (colored by
 * its own trait), each
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

  // useCallback with an empty dependency array — a stable ref identity, unlike a plain inline
  // arrow function (which React re-invokes with null then the element again on every single
  // re-render, not just mount/unmount). Setting opacity via the JSX style prop instead would be
  // reapplied on every re-render too, fighting GSAP's own inline-style tween once fadeInView()
  // starts animating opacity back up and making the fade look instant (found live).
  const rootRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      setSectionRef('fleetParams', el);
      if (startHidden) el.style.opacity = '0';
    } else {
      clearSectionRef('fleetParams');
    }
    setViewFadeRoot(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startHidden never changes after mount
  }, []);

  return (
    <div ref={rootRef} className="fleet-params-content" style={getTraitColorStyle('spectral')}>
      <IntroPanel
        {...introProps('fleet.root')}
        trait="spectral"
      />
      {FLEET_PARAMS_GROUPS.map((group) => {
        const schema: AccordionSchema = { id: group.nodeId, type: 'accordion', humanLabel: labels(group.content).humanLabel };
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
                    {...introProps(group.content)}
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
