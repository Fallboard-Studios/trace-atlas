import { AudioLoadPanel } from '../../console/AudioLoadPanel';
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
 * fit it). `volume`/`tempo`/`quality` all have real content now (Tasks 11-13); the bare Settings
 * category itself and `sectorSettings` both fall back to SectorSettingsDrawer, matching today's
 * actual ConsolePanel behavior for the whole `settings` tile.
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

  if (selectedSettingsLeaf === 'quality') {
    // Relocated from AudioRigDrawer.tsx unchanged (Task 13) — AudioLoadPanel is a fully
    // self-contained, prop-less component; only where it's rendered from changed.
    return <AudioLoadPanel />;
  }

  return <SectorSettingsDrawer />;
}

export default SettingsContent;
