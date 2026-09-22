import { SectorSettingsDrawer } from '../../console/SectorSettingsDrawer';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { BPM_SCHEMA } from '@/data/audioRigConfig';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import type { SliderLinearSchema } from '@/types/controls';

/** Relocated from Header.tsx verbatim (docs/tasks/NAV_LAYOUT_REWRITE.md Task 11) — same id/
 *  range/step, same audioStore.volume binding. Header keeps only Mute now. */
const VOLUME_SCHEMA: SliderLinearSchema = {
  id: 'headerVolume',
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
  orientation: 'horizontal',
  type: 'sliderLinear',
};

/**
 * Settings branch content (docs/specs/NAV_LAYOUT_REWRITE.md §2) — routes on
 * uiStore.selectedSettingsLeaf (added in Task 11; not part of the spec's original §1.3 field
 * list, since Settings isn't an "entity" the way a robot/company is, so selectedSection doesn't
 * fit it). `volume`/`tempo` have real content (Tasks 11/12); `quality`, and the bare Settings
 * category itself, still fall back to SectorSettingsDrawer — today's actual ConsolePanel
 * behavior for the whole `settings` tile, preserved as-is until Task 13 relocates Quality here
 * too (the last one, after which the fallback should only ever mean "sectorSettings" or bare).
 */
export function SettingsContent() {
  const selectedSettingsLeaf = useUIStore((s) => s.selectedSettingsLeaf);
  const isPoweredOn = useUIStore((s) => s.isPoweredOn);
  const volume = useAudioStore((s) => s.volume);
  const bpm = useAudioStore((s) => s.bpm);

  if (selectedSettingsLeaf === 'volume') {
    return (
      <SliderLinear
        schema={VOLUME_SCHEMA}
        value={volume * 100}
        onChange={(pct) => {
          if (!isPoweredOn) return;
          useAudioStore.getState().setVolume(pct / 100);
        }}
        disabled={!isPoweredOn}
      />
    );
  }

  if (selectedSettingsLeaf === 'tempo') {
    // Relocated from AudioRigDrawer.tsx verbatim (Task 12) — bpm is stored and displayed in the
    // same BPM units, no scaling, matching BPM_SCHEMA's own doc comment.
    return <SliderLinear schema={BPM_SCHEMA} value={bpm} onChange={(v) => useAudioStore.getState().setBPM(v)} />;
  }

  return <SectorSettingsDrawer />;
}

export default SettingsContent;
