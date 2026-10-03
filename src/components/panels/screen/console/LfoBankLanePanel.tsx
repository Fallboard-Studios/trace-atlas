import { useCallback, useMemo } from 'react';
import { useAudioStore } from '@/stores/audioStore';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { TempoSyncSlider } from '@/components/ui/controls/TempoSyncSlider';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { HeldOffNote } from '@/components/ui/controls/HeldOffNote';
import { withHeldOffClass } from '@/components/ui/controls/activeClass';
import { LFO_BANK_LANE_SCHEMAS } from '@/data/audioRigConfig';
import type { NoteValue } from '@/data/noteValues';
import { allowedLaneNoteValues } from '@/utils/tempoSync';
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
 *
 * Rate renders through TempoSyncSlider (docs/specs/FREE_SYNC_TOGGLE.md §1.4): Free edits write
 * `rate`, Sync edits write `sync`, and the toggle goes through the store's
 * setLfoBankLaneSyncMode, which owns the Free <-> Sync conversion. The toggle sits in a row of its own
 * under Rate. This panel only supplies the tempo-dependent list of allowed notes.
 */
export function LfoBankLanePanel({ lane }: LfoBankLanePanelProps) {
  const schema = LFO_BANK_LANE_SCHEMAS[lane];
  const shape = useAudioStore((s) => s.lfoBank[lane].shape);
  const rate = useAudioStore((s) => s.lfoBank[lane].rate);
  const sync = useAudioStore((s) => s.lfoBank[lane].sync);
  const bpm = useAudioStore((s) => s.bpm);
  const rateDrift = useAudioStore((s) => s.lfoBank[lane].rateDrift);
  const depthDrift = useAudioStore((s) => s.lfoBank[lane].depthDrift);
  const driftHeldOff = useAudioStore((s) => s.driftHeldOff);
  const setLfoBank = useAudioStore((s) => s.setLfoBank);
  const setLfoBankLaneSyncMode = useAudioStore((s) => s.setLfoBankLaneSyncMode);

  // Memoized on bpm so TempoSyncSlider's memo and its derived Sync schema both bail on every render
  // that isn't a tempo change.
  const allowed = useMemo(() => allowedLaneNoteValues(bpm), [bpm]);
  // Stable per lane — TempoSyncSlider is React.memo'd and would otherwise re-render on each of this
  // panel's renders (the same convention AudioRigEffectPanel's own pre-bound handlers follow).
  const handleRateChange = useCallback((v: number) => setLfoBank(lane, { rate: v }), [lane, setLfoBank]);
  const handleSyncChange = useCallback((note: NoteValue) => setLfoBank(lane, { sync: note }), [lane, setLfoBank]);
  const handleModeChange = useCallback((synced: boolean) => setLfoBankLaneSyncMode(lane, synced), [lane, setLfoBankLaneSyncMode]);

  return (
    <DirectionalPanel schema={schema.panel}>
      <div className="audio-rig-drawer__param-row">
        <RadioButton
          schema={schema.shape}
          value={shape}
          onChange={(v) => setLfoBank(lane, { shape: v as LfoShape })}
        />
      </div>
      {/* Rate's own row holds the slider and, in a row of its own under it, its Free | Sync toggle. */}
      <div className="audio-rig-drawer__param-row">
        <TempoSyncSlider
          schema={schema.rate}
          freeValue={rate}
          syncValue={sync}
          allowed={allowed}
          onFreeChange={handleRateChange}
          onSyncChange={handleSyncChange}
          onModeChange={handleModeChange}
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
