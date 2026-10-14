import type { CSSProperties } from 'react';
import { memo, useCallback } from 'react';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { LfoLink } from '@/components/ui/controls/LfoLink';
import { HeldOffNote } from '@/components/ui/controls/HeldOffNote';
import {
  BUS_FILTER_PANEL_SCHEMA,
  BUS_FILTER_ROW_PANEL_SCHEMA,
  BUS_CUTOFF_SCHEMA,
  BUS_RESONANCE_SCHEMA,
  BUS_FILTER_TYPE_SCHEMA,
} from '@/data/robotOptionsConfig';
import type { AudioAttributes, RobotFilterType } from '@/types/Robot';
import type { LfoLinkSchema, LfoLinkValue } from '@/types/controls';

import './BusFilterDrawer.css';

/** What the drawer shows. The three numbers and the type are already resolved (a robot with none stored
 *  shows today's sound: Q 1, lowpass), and `lfoLink` is the robot's `bus.frequency` link or the default. */
export interface BusFilterValue {
  filterFreq: number;
  filterQ: number;
  filterType: RobotFilterType;
  lfoLink: LfoLinkValue;
}

/** One edit: the single field the user touched, never the other two (applyBusFilter writes only what it is given). */
export type BusFilterPatch = Partial<Pick<AudioAttributes, 'filterFreq' | 'filterQ' | 'filterType'>>;

interface BusFilterDrawerProps {
  value: BusFilterValue;
  onChange: (patch: BusFilterPatch) => void;
  onLfoLinkChange: (link: LfoLinkValue) => void;
  /** The Audio Load dial is holding the robot bus-filter links off (audioStore.busFilterLinksHeldOff): the link shows Off / 0
   *  and the note says why; the stored link is untouched. Passed in, so the drawer reads no store. */
  heldOff: boolean;
  disabled?: boolean;
  /** Trait-colour scoping (getTraitColorStyle('spectral')), applied identically at the robot and company call sites. */
  style?: CSSProperties;
}

// No labels on the link: Cutoff's slider above it already names the field, and LfoLink draws no label row when it has none.
const BUS_FILTER_LINK_SCHEMA: LfoLinkSchema = { id: 'robotOptions.busFilter.link', type: 'lfoLink' };

/**
 * The probe's bus filter, the Source section's fourth sub-tab (docs/specs/ROBOT_ARTICULATION.md §1.6):
 * Cutoff, the Cutoff's LFO link, then Resonance beside Type. Purely presentational, like the other
 * drawers: no `robot` prop and no store access. RobotScreen wires `onChange` to applyBusFilter and
 * `onLfoLinkChange` to applyLayerLfoLink(…, 'bus.frequency', …), and the company screen to its broadcast
 * handlers. Each control reports only its own field, so the handlers need no latest-value ref.
 */
function BusFilterDrawerInner({ value, onChange, onLfoLinkChange, heldOff, disabled, style }: BusFilterDrawerProps) {
  const handleCutoffChange = useCallback((filterFreq: number) => onChange({ filterFreq }), [onChange]);
  const handleResonanceChange = useCallback((filterQ: number) => onChange({ filterQ }), [onChange]);
  const handleTypeChange = useCallback((filterType: string) => onChange({ filterType: filterType as RobotFilterType }), [onChange]);

  return (
    <div className="bus-filter-drawer" style={style}>
      <DirectionalPanel schema={BUS_FILTER_PANEL_SCHEMA}>
        <SliderLog schema={BUS_CUTOFF_SCHEMA} value={value.filterFreq} onChange={handleCutoffChange} disabled={disabled} />
        <div className="bus-filter-drawer__link">
          <LfoLink schema={BUS_FILTER_LINK_SCHEMA} value={value.lfoLink} onChange={onLfoLinkChange} disabled={disabled} heldOff={heldOff} />
          {heldOff && <HeldOffNote />}
        </div>
        <DirectionalPanel schema={BUS_FILTER_ROW_PANEL_SCHEMA}>
          <SliderLog schema={BUS_RESONANCE_SCHEMA} value={value.filterQ} onChange={handleResonanceChange} disabled={disabled} />
          <RadioButton schema={BUS_FILTER_TYPE_SCHEMA} value={value.filterType} onChange={handleTypeChange} disabled={disabled} />
        </DirectionalPanel>
      </DirectionalPanel>
    </div>
  );
}

export const BusFilterDrawer = memo(BusFilterDrawerInner);

export default BusFilterDrawer;
