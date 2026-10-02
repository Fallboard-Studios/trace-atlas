import { useAudioStore } from '@/stores/audioStore';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { HeldOffNote } from '@/components/ui/controls/HeldOffNote';
import { withHeldOffClass } from '@/components/ui/controls/activeClass';
import { LFO_BANK_LANE_SCHEMAS } from '@/data/audioRigConfig';
import type { LfoLaneId, LfoShape } from '@/types/lfo';

interface LfoBankLanePanelProps {
  lane: LfoLaneId;
}

/**
 * One LFO Bank lane's own Shape + Rate (the lane's own primary oscillator) plus its Rate
 * Drift/Depth Drift pair (docs/tasks/LFO_BANK.md Task 15) — reads/writes audioStore.lfoBank[lane]
 * directly, same "rig-wide control, not scoped to a selection, reads the store itself" shape
 * FleetDriftPanel/RobotDriftPanel already established (AudioRigDrawer.tsx/SignatureArrayDrawer.tsx,
 * both removed by this same task). Only the drift pair greys out while Audio Load Budget holds
 * drift off (`driftHeldOff`) — Shape/Rate are the lane's own primary oscillator, unaffected by
 * that dial.
 */
export function LfoBankLanePanel({ lane }: LfoBankLanePanelProps) {
  const schema = LFO_BANK_LANE_SCHEMAS[lane];
  const shape = useAudioStore((s) => s.lfoBank[lane].shape);
  const rate = useAudioStore((s) => s.lfoBank[lane].rate);
  const rateDrift = useAudioStore((s) => s.lfoBank[lane].rateDrift);
  const depthDrift = useAudioStore((s) => s.lfoBank[lane].depthDrift);
  const driftHeldOff = useAudioStore((s) => s.driftHeldOff);
  const setLfoBank = useAudioStore((s) => s.setLfoBank);

  return (
    <DirectionalPanel schema={schema.panel}>
      <div className="audio-rig-drawer__param-row">
        <RadioButton
          schema={schema.shape}
          value={shape}
          onChange={(v) => setLfoBank(lane, { shape: v as LfoShape })}
        />
      </div>
      <div className="audio-rig-drawer__param-row">
        <SliderLinear
          schema={schema.rate}
          value={rate}
          onChange={(v) => setLfoBank(lane, { rate: v })}
        />
      </div>
      <div className={withHeldOffClass('audio-rig-drawer__param-row', driftHeldOff)}>
        <SliderCenteredZero
          schema={schema.rateDrift}
          value={driftHeldOff ? 0 : rateDrift * 100}
          onChange={(v) => setLfoBank(lane, { rateDrift: v / 100 })}
          disabled={driftHeldOff}
        />
      </div>
      <div className={withHeldOffClass('audio-rig-drawer__param-row', driftHeldOff)}>
        <SliderCenteredZero
          schema={schema.depthDrift}
          value={driftHeldOff ? 0 : depthDrift * 100}
          onChange={(v) => setLfoBank(lane, { depthDrift: v / 100 })}
          disabled={driftHeldOff}
        />
      </div>
      {driftHeldOff && <HeldOffNote />}
    </DirectionalPanel>
  );
}
