import { AudioRigDrawer, AudioRigEffectPanel } from '../../console/AudioRigDrawer';
import { useSectionObserver } from '../useSectionObserver';
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
const FIRST_EFFECT = ALL_LEAVES[0].effectKey;

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
 * leaves gets its own controlled accordion, exactly one open at a time across the WHOLE view, not
 * per group — opening Limiter (Output) closes an open Reverb (Time & Space) just as it would close
 * a sibling within the same group. AudioRigDrawer (Automatic Effects) is not part of the accordion
 * model — it renders unwrapped, same as every branch's own non-accordion top content (matches this
 * component's pre-Task-8 fallback role, not a new tree leaf).
 */
export function FleetParamsContent() {
  const selectedFleetParamsEffect = useUIStore((s) => s.selectedFleetParamsEffect);
  const setSelectedFleetParamsEffect = useUIStore((s) => s.setSelectedFleetParamsEffect);

  const leafIds = ALL_LEAVES.map((l) => l.id);
  const { hasApproached } = useSectionObserver(leafIds, (id) => {
    const leaf = ALL_LEAVES.find((l) => l.id === id);
    if (leaf) setSelectedFleetParamsEffect(leaf.effectKey);
  });

  const openEffect = selectedFleetParamsEffect ?? FIRST_EFFECT;

  return (
    <div ref={sectionAnchorRef('fleetParams')}>
      <AudioRigDrawer />
      {FLEET_PARAMS_GROUPS.map((group) => (
        <div key={group.nodeId}>
          <div ref={sectionAnchorRef(group.nodeId)}>{group.humanLabel}</div>
          {group.leaves.map((leaf) => {
            const schema: AccordionSchema = { id: leaf.id, type: 'accordion', humanLabel: leaf.humanLabel };
            const isOpen = openEffect === leaf.effectKey;
            return (
              <div key={leaf.id} ref={sectionAnchorRef(leaf.id)}>
                <AccordionContainer
                  schema={schema}
                  open={isOpen}
                  onOpenChange={(open) => setSelectedFleetParamsEffect(open ? leaf.effectKey : null)}
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
