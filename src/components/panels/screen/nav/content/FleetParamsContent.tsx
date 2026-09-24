import { AudioRigDrawer, AudioRigEffectPanel } from '../../console/AudioRigDrawer';
import { useSectionObserver } from '../useSectionObserver';
import { useAccordionOpenState } from '../useAccordionOpenState';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { useUIStore, type FleetParamsGroup } from '@/stores/uiStore';
import type { AudioRigEffectKey } from '@/data/audioRigConfig';
import type { AccordionSchema } from '@/types/controls';

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
 * content-swap model with a single scrollable view stacking all 3 groups × their leaves. Groups
 * are heading-only (no accordion of their own, spec §2's "mid-level (group)" row); each of the 7
 * leaves gets its own accordion with manual, independent open/closed state
 * (`useAccordionOpenState`) — opening one never closes another, and a nav click/scrollspy only
 * scrolls/updates `selectedFleetParamsEffect` for tree highlighting, never an accordion's own
 * state (Crawford's own follow-up call, 2026-09-24). AudioRigDrawer (Automatic Effects) is not
 * part of the accordion model — it renders unwrapped, same as every branch's own non-accordion top
 * content (matches this component's pre-Task-8 fallback role, not a new tree leaf).
 */
export function FleetParamsContent() {
  const setSelectedFleetParamsEffect = useUIStore((s) => s.setSelectedFleetParamsEffect);

  const leafIds = ALL_LEAVES.map((l) => l.id);
  const { hasApproached } = useSectionObserver(leafIds, (id) => {
    const leaf = ALL_LEAVES.find((l) => l.id === id);
    if (leaf) setSelectedFleetParamsEffect(leaf.effectKey);
  });

  const { isOpen, setOpen } = useAccordionOpenState(ALL_LEAVES[0].id);

  return (
    <div ref={sectionAnchorRef('fleetParams')}>
      <AudioRigDrawer />
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
