import { AudioRigDrawer, AudioRigEffectPanel } from '../../console/AudioRigDrawer';
import { useSectionObserver } from '../useSectionObserver';
import { useAccordionOpenState } from '../useAccordionOpenState';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { BPM_SCHEMA, type AudioRigEffectKey } from '@/data/audioRigConfig';
import { useUIStore, type FleetParamsGroup } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { AccordionSchema } from '@/types/controls';
import './FleetParamsContent.css';

/** Tempo (relocated from Settings -> Tempo) and Automatic Effects (AudioRigDrawer, relocated from
 *  this component's own former unwrapped top content) both live inside this one shared accordion
 *  — unlike the 3 groups below, whose leaves each get their own accordion. Matches
 *  navTreeConfig.ts's own fleetParams.pacing children (ids/labels). */
const PACING_ACCORDION_SCHEMA: AccordionSchema = { id: 'fleetParams.pacing', type: 'accordion', humanLabel: 'Pacing' };
const PACING_TEMPO_ID = 'fleetParams.pacing.tempo';
const PACING_AUTOMATIC_EFFECTS_ID = 'fleetParams.pacing.automaticEffects';

interface FleetParamsLeaf {
  id: string;
  humanLabel: string;
  effectKey: AudioRigEffectKey;
}

interface FleetParamsGroupDef {
  id: FleetParamsGroup;
  nodeId: string;
  humanLabel: string;
  leaves: FleetParamsLeaf[];
}

/** Matches navTreeConfig.ts's own fleetParams subtree (ids/labels) and useNavTree.ts's
 *  FLEET_PARAMS_GROUP_FIRST_LEAF ordering — kept as one flat source here since this content
 *  component, not the tree, decides stacking/accordion order. */
const FLEET_PARAMS_GROUPS: FleetParamsGroupDef[] = [
  {
    id: 'eqFilters',
    nodeId: 'fleetParams.eqFilters',
    humanLabel: 'EQ & Filters',
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
    leaves: [
      { id: 'fleetParams.timeSpace.reverb', humanLabel: 'Reverb', effectKey: 'reverb' },
      { id: 'fleetParams.timeSpace.delay', humanLabel: 'Delay', effectKey: 'delay' },
    ],
  },
  {
    id: 'output',
    nodeId: 'fleetParams.output',
    humanLabel: 'Output',
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

/**
 * Fleet Params branch content (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2) — replaces the
 * content-swap model with a single scrollable view stacking Pacing above the 3 EQ & Filters/
 * Time & Space/Output groups × their leaves. Pacing has its own 2 tree children (Tempo, Automatic
 * Effects) but only ONE shared accordion — those 2 children are pure scroll/highlight anchors
 * within it, not separate accordions of their own, unlike the 3 groups below it (heading-only, no
 * accordion of their own, spec §2's "mid-level (group)" row) whose 7 leaves each get a real
 * accordion. Every accordion has manual, independent open/closed state (`useAccordionOpenState`)
 * — opening one never closes another, and a nav click/scrollspy only scrolls/updates
 * `selectedFleetParamsEffect` for tree highlighting, never an accordion's own state (Crawford's
 * own follow-up call, 2026-09-24).
 */
export function FleetParamsContent() {
  const setSelectedFleetParamsEffect = useUIStore((s) => s.setSelectedFleetParamsEffect);
  const bpm = useAudioStore((s) => s.bpm);

  const leafIds = ALL_LEAVES.map((l) => l.id);
  const sectionIds = [PACING_ACCORDION_SCHEMA.id, ...leafIds];
  const { hasApproached } = useSectionObserver(sectionIds, (id) => {
    if (id === PACING_ACCORDION_SCHEMA.id) {
      setSelectedFleetParamsEffect('tempo');
      return;
    }
    const leaf = ALL_LEAVES.find((l) => l.id === id);
    if (leaf) setSelectedFleetParamsEffect(leaf.effectKey);
  });

  // Pacing's own 2 children (Tempo, Automatic Effects) only exist in the DOM once Pacing's own
  // content has mounted (the hasApproached gate below) — included here only once available, so
  // this observer's own effect (keyed on this array's contents) re-runs and finds them right
  // after they mount, matching SettingsContent.tsx's own 2-tier subsection pattern.
  const pacingSubsectionIds = hasApproached(PACING_ACCORDION_SCHEMA.id) ? [PACING_TEMPO_ID, PACING_AUTOMATIC_EFFECTS_ID] : [];
  useSectionObserver(pacingSubsectionIds, (id) => {
    setSelectedFleetParamsEffect(id === PACING_TEMPO_ID ? 'tempo' : 'automaticEffects');
  });

  const { isOpen, setOpen } = useAccordionOpenState(PACING_ACCORDION_SCHEMA.id);

  return (
    <div ref={sectionAnchorRef('fleetParams')} className="fleet-params-content" style={getTraitColorStyle('spectral')}>
      <div ref={sectionAnchorRef(PACING_ACCORDION_SCHEMA.id)}>
        <AccordionContainer
          schema={PACING_ACCORDION_SCHEMA}
          open={isOpen(PACING_ACCORDION_SCHEMA.id)}
          onOpenChange={(open) => setOpen(PACING_ACCORDION_SCHEMA.id, open)}
        >
          {hasApproached(PACING_ACCORDION_SCHEMA.id) ? (
            <>
              {/* Relocated from Settings -> Tempo verbatim (Task 12 originally) — bpm is stored
                  and displayed in the same BPM units, no scaling, matching BPM_SCHEMA's own doc
                  comment. */}
              <div ref={sectionAnchorRef(PACING_TEMPO_ID)}>
                <SliderLinear schema={BPM_SCHEMA} value={bpm} onChange={(v) => useAudioStore.getState().setBPM(v)} />
              </div>
              <div ref={sectionAnchorRef(PACING_AUTOMATIC_EFFECTS_ID)}>
                <AudioRigDrawer />
              </div>
            </>
          ) : null}
        </AccordionContainer>
      </div>
      {FLEET_PARAMS_GROUPS.map((group) => (
        <div key={group.nodeId}>
          <div ref={sectionAnchorRef(group.nodeId)}>{group.humanLabel}</div>
          {group.leaves.map((leaf) => {
            const schema: AccordionSchema = { id: leaf.id, type: 'accordion', humanLabel: leaf.humanLabel };
            return (
              <div key={leaf.id} ref={sectionAnchorRef(leaf.id)}>
                <AccordionContainer
                  schema={schema}
                  open={isOpen(leaf.id)}
                  onOpenChange={(open) => setOpen(leaf.id, open)}
                >
                  {hasApproached(leaf.id) ? <AudioRigEffectPanel effectKey={leaf.effectKey} /> : null}
                </AccordionContainer>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default FleetParamsContent;
