import { memo, useCallback } from 'react';

import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { AUDIO_LOAD_PANEL_SCHEMA, AUDIO_LOAD_PRESET_SCHEMA, AUDIO_LOAD_SCHEMA } from '@/data/audioRigConfig';
import { AUDIO_LOAD_PRESETS } from '@/constants';
import { useAudioStore } from '@/stores/audioStore';
import { describeLimits, loadToLimits, presetForLoad } from '@/utils/audioBudget';
import './AudioLoadPanel.css';

/**
 * The Audio Load control (docs/specs/AUDIO_LOAD_BUDGET.md §4.5), next to Tempo in Transport & Composition. A preset
 * radio and a fine slider are two views of ONE stored number (audioStore.audioLoad): choosing a preset sets the
 * slider; dragging the slider off a preset leaves the radio with nothing selected. A plain store write — no engine
 * call here; audioBudgetSystem reacts to the dial. Its own component (not inline in AudioRigDrawer) so a change of
 * the dial re-renders only this panel, never the rest of the drawer.
 */
export const AudioLoadPanel = memo(function AudioLoadPanel() {
  const audioLoad = useAudioStore((s) => s.audioLoad);
  const setAudioLoad = useAudioStore((s) => s.setAudioLoad);

  // Stable handlers — the primitives are memoized, so a fresh function per render would defeat that.
  const handlePreset = useCallback(
    (value: string) => {
      const preset = AUDIO_LOAD_PRESETS[value as keyof typeof AUDIO_LOAD_PRESETS];
      if (preset !== undefined) setAudioLoad(preset);
    },
    [setAudioLoad],
  );
  const handleSlider = useCallback((percent: number) => setAudioLoad(percent / 100), [setAudioLoad]);

  return (
    <DirectionalPanel schema={AUDIO_LOAD_PANEL_SCHEMA}>
      <div className="audio-rig-drawer__param-row">
        <RadioButton schema={AUDIO_LOAD_PRESET_SCHEMA} value={presetForLoad(audioLoad) ?? ''} onChange={handlePreset} />
      </div>
      <div className="audio-rig-drawer__param-row">
        <SliderLinear schema={AUDIO_LOAD_SCHEMA} value={Math.round(audioLoad * 100)} onChange={handleSlider} />
      </div>
      <p className="audio-load-panel__readout">{describeLimits(loadToLimits(audioLoad))}</p>
    </DirectionalPanel>
  );
});
