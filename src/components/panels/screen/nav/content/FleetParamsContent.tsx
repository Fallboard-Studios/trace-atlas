import { useCallback, useState } from 'react';
import { AudioRigDrawer, AudioRigEffectPanel, FleetDriftPanel } from '../../console/AudioRigDrawer';
import { useSectionObserver } from '../useSectionObserver';
import { useAccordionOpenState } from '../useAccordionOpenState';
import { RobotDriftPanel } from '@/components/robot/SignatureArrayDrawer';
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

interface IntroContent {
  loreLabel: string;
  loreDescription: string;
  humanDescription: string;
}

/** Fleet Params' own section-level intro, above all 5 groups. */
const FLEET_PARAMS_SECTION_INTRO: IntroContent = {
  loreLabel: 'Fleet Params — your key to mesh-wide performance.',
  loreDescription: 'Fleets of probes stay synchronized through Meridia Comms Group’s Undersea Mesh Network, broadcasting the same audio signature settings to every unit at once.',
  humanDescription: 'This screen holds every control that shapes the sound of your whole fleet at once — pacing, EQ and filtering, drift, spatial effects, and output. Changes here apply to every probe simultaneously; to adjust one probe at a time, use the Probes screen instead.',
};

/** One entry per Fleet Params group (docs/reference/text-content-tables.md's content pass) —
 *  each group's own IntroPanel reads from here instead of a shared placeholder. */
const FLEET_PARAMS_GROUP_INTRO: Record<FleetParamsGroup, IntroContent> = {
  pacing: {
    loreLabel: 'Pacing — set the tempo of the mesh.',
    loreDescription: 'Every probe keeps time together, and the network periodically intensifies its own signal processing to surface new data.',
    humanDescription: '<ul>'
      + '<li><strong>Tempo</strong>: how fast the music plays, in beats per minute.</li>'
      + '<li><strong>Automation Rate</strong>: how often the fleet automatically nudges its own effects settings — swells of extra motion that come and go on their own. Set it to 0 to turn automatic swells off entirely.</li>'
      + '<li><strong>Automation Length</strong>: how many measures one of those swells lasts, start to finish.</li>'
      + '<li><strong>Automation Range</strong>: how far a swell can push the affected settings once one is happening — bigger numbers mean more dramatic swells.</li>'
      + '</ul>',
  },
  eqFilters: {
    loreLabel: 'EQ & Filters — shape the signal every probe shares.',
    loreDescription: 'Meridia Comms Group’s Undersea Mesh Network carries every probe’s signal through the same equalizer and filter bank before it reaches you.',
    humanDescription: '<ul>'
      + '<li><strong>3-Band EQ</strong>: three sliders to boost or cut the low, mid, and high ranges of the sound.</li>'
      + '<li><strong>High-Pass Filter</strong>: cuts the deep, thumping bass and lets bright, high sounds through — like a small phone speaker.</li>'
      + '<li><strong>Low-Pass Filter</strong>: cuts the harsh high pitches and lets deep, low sounds through smoothly — like a thick blanket over the sound.</li>'
      + '</ul>'
      + '<p>Each of these sliders has its own LFO (Low Frequency Oscillator) — an invisible hand that turns the slider’s knob back and forth automatically. Click a slider to see and edit its LFO below: Rate controls how fast the hand turns, Depth controls how far.</p>',
  },
  fleetDrift: {
    loreLabel: 'Drift — a wandering hand behind every dial.',
    loreDescription: 'No signal holds perfectly steady across an entire mesh network — Drift keeps every automated adjustment a little unpredictable, the way a real network would.',
    humanDescription: '<p>Drift adds a second, slower LFO on top of an existing one — a hand turning the hand that’s turning the knob. Set Rate Drift positive and the underlying LFO’s speed wanders faster over time; set it negative and it wanders slower. Depth Drift works the same way for how far the LFO swings.</p>'
      + '<p><strong>Environmental Drift</strong> affects the shared LFOs on the EQ & Filters sliders above — one setting for all of them together. <strong>Voice Drift</strong> affects every probe’s own oscillator LFOs the same way, fleet-wide.</p>',
  },
  timeSpace: {
    loreLabel: 'Time & Space — give every signal somewhere to travel.',
    loreDescription: 'Reverb and Delay recreate the vast, echoing distances a probe’s signal crosses before reaching your receiver.',
    humanDescription: '<ul>'
      + '<li><strong>Reverb Length</strong>: how long the echo rings out after a sound plays.</li>'
      + '<li><strong>Pre-Delay</strong>: how long the echo waits before it starts, after the original sound.</li>'
      + '<li><strong>Reverb Amount</strong>: how much of that echo you hear blended in with the original sound.</li>'
      + '<li><strong>Delay Time</strong>: how long between the original sound and its first repeat.</li>'
      + '<li><strong>Repeats</strong>: how many times that repeat echoes back before fading out.</li>'
      + '<li><strong>Delay Amount</strong>: how loud those repeats are, blended in with the original sound.</li>'
      + '</ul>',
  },
  output: {
    loreLabel: 'Output — the final stage before transmission.',
    loreDescription: 'Every probe’s signal is compressed and limited here, guaranteeing a clean, consistent transmission back to your receiver.',
    humanDescription: '<p><strong>Compressor</strong>: automatically turns down loud moments and evens out the overall volume.</p>'
      + '<ul>'
      + '<li><strong>Threshold</strong>: how loud a sound has to get before the compressor starts working on it.</li>'
      + '<li><strong>Ratio</strong>: how strongly the compressor turns the sound down once it’s past the threshold.</li>'
      + '<li><strong>Attack Time</strong>: how quickly the compressor reacts once a sound crosses the threshold.</li>'
      + '<li><strong>Release Time</strong>: how quickly the compressor lets go once the sound drops back below the threshold.</li>'
      + '<li><strong>Knee</strong>: how gradually the compressor eases into effect, rather than snapping on abruptly.</li>'
      + '<li><strong>Decay Mode</strong>: Natural Decay lets Reverb’s and Delay’s echoes ring out uncompressed, after the Compressor. Controlled Decay compresses them too, keeping everything — echoes included — evened out.</li>'
      + '</ul>'
      + '<p><strong>Limiter</strong>: a hard ceiling that keeps the loudest sounds from ever going too loud. <strong>Ceiling</strong> sets the maximum volume nothing is allowed to pass.</p>',
  },
};

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
      { id: 'fleetParams.pacing.frequency', humanLabel: 'Automation Rate', effectKey: 'swellFrequency', row: 'top' },
      { id: 'fleetParams.pacing.duration', humanLabel: 'Automation Length', effectKey: 'swellDuration', row: 'bottom' },
      { id: 'fleetParams.pacing.automaticEffects', humanLabel: 'Automation Range', effectKey: 'automaticEffects', row: 'bottom' },
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
    // New top-level group (docs/specs/FLEET_DRIFT_CONSOLIDATION.md), displayed as "Drift" —
    // renamed "Fleet Drift" -> "LFO Drift" -> "Drift" (id unchanged throughout, label-only
    // renames — see navTreeConfig.ts's own comment for the full history), positioned right after
    // EQ & Filters. This is a *different* table from navTreeConfig.ts's own NAV_TREE_SCHEMA (this
    // content component, not the tree, decides stacking/accordion order — see this file's own doc
    // comment above) — both must be kept in sync by hand, same as every other group here already
    // is. Holds 2 leaves, stacked: "Environmental Drift" (formerly "Fleet Drift", the merged eq3/
    // filterLPF/filterHPF control) on top, "Voice Drift" (formerly "Robot Drift") beneath it —
    // moved here from Probes/Companies entirely (RobotDriftPanel, earlier follow-up), reusing the
    // same standalone component, which already reads/writes useAudioStore directly rather than
    // via props.
    id: 'fleetDrift',
    nodeId: 'fleetParams.fleetDrift',
    humanLabel: 'Drift',
    trait: 'spectral',
    leaves: [
      { id: 'fleetParams.fleetDrift.drift', humanLabel: 'Environmental Drift', effectKey: 'globalDrift' },
      { id: 'fleetParams.fleetDrift.robots', humanLabel: 'Voice Drift', effectKey: 'robotDrift' },
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
  if (effectKey === 'globalDrift') {
    return <FleetDriftPanel />;
  }
  if (effectKey === 'robotDrift') {
    return <RobotDriftPanel />;
  }
  return <AudioRigEffectPanel effectKey={effectKey as AudioRigEffectKey} />;
}

/**
 * Fleet Params branch content (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2, docs/specs/
 * FLEET_PARAMS_CONTENT_REWORK.md) — a single scrollable view: one always-open, spectral-traited
 * outer panel holding the section's own IntroPanel, then all 5 groups (Pacing, EQ & Filters,
 * Drift, Time & Space, Output — Drift added by docs/specs/FLEET_DRIFT_CONSOLIDATION.md, its
 * 2 leaves — Environmental Drift, Voice Drift — covered in that group's own def comment above)
 * stacked identically — each its own accordion (colored by its own trait), each
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
        loreLabel={FLEET_PARAMS_SECTION_INTRO.loreLabel}
        loreDescription={FLEET_PARAMS_SECTION_INTRO.loreDescription}
        humanDescription={FLEET_PARAMS_SECTION_INTRO.humanDescription}
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
                    loreLabel={FLEET_PARAMS_GROUP_INTRO[group.id].loreLabel}
                    loreDescription={FLEET_PARAMS_GROUP_INTRO[group.id].loreDescription}
                    humanDescription={FLEET_PARAMS_GROUP_INTRO[group.id].humanDescription}
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
