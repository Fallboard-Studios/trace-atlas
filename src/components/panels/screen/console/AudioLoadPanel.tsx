import { memo, useCallback } from 'react';

import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { AUDIO_EFFECTS_LOAD_SCHEMA, AUDIO_LOAD_PANEL_SCHEMA, AUDIO_LOAD_PRESET_SCHEMA, AUDIO_ROBOT_LOAD_SCHEMA } from '@/data/audioRigConfig';
import { AUDIO_LOAD_PRESETS } from '@/constants';
import { useAudioStore } from '@/stores/audioStore';
import { describeLimits, effectsLoadToLimits, presetForLoads, robotLoadToLimits } from '@/utils/audioBudget';
import './AudioLoadPanel.css';

/**
 * The Audio Load control (docs/specs/AUDIO_LOAD_BUDGET.md §4.5), next to Tempo in Transport & Composition. A preset
 * radio and two fine sliders (Robot Load, Effects Load) are three views of TWO stored numbers
 * (audioStore.robotLoad/effectsLoad): choosing a preset sets both sliders; dragging either slider off a shared
 * preset leaves the radio with nothing selected (presetForLoads requires both axes to agree). A plain store write —
 * no engine call here; audioBudgetSystem reacts to the dials. Its own component (not inline in AudioRigDrawer) so a
 * change of either dial re-renders only this panel, never the rest of the drawer.
 */
export const AudioLoadPanel = memo(function AudioLoadPanel() {
  const robotLoad = useAudioStore((s) => s.robotLoad);
  const effectsLoad = useAudioStore((s) => s.effectsLoad);
  const setRobotLoad = useAudioStore((s) => s.setRobotLoad);
  const setEffectsLoad = useAudioStore((s) => s.setEffectsLoad);

  // Stable handlers — the primitives are memoized, so a fresh function per render would defeat that.
  const handlePreset = useCallback(
    (value: string) => {
      const preset = AUDIO_LOAD_PRESETS[value as keyof typeof AUDIO_LOAD_PRESETS];
      if (preset !== undefined) {
        setRobotLoad(preset);
        setEffectsLoad(preset);
      }
    },
    [setRobotLoad, setEffectsLoad],
  );
  const handleRobotSlider = useCallback((percent: number) => setRobotLoad(percent / 100), [setRobotLoad]);
  const handleEffectsSlider = useCallback((percent: number) => setEffectsLoad(percent / 100), [setEffectsLoad]);

  return (
    <DirectionalPanel schema={AUDIO_LOAD_PANEL_SCHEMA}>
      <div className="audio-rig-drawer__param-row">
        <RadioButton schema={AUDIO_LOAD_PRESET_SCHEMA} value={presetForLoads(robotLoad, effectsLoad) ?? ''} onChange={handlePreset} />
      </div>
      <div className="audio-rig-drawer__param-row">
        <SliderLinear schema={AUDIO_ROBOT_LOAD_SCHEMA} value={Math.round(robotLoad * 100)} onChange={handleRobotSlider} />
      </div>
      <div className="audio-rig-drawer__param-row">
        <SliderLinear schema={AUDIO_EFFECTS_LOAD_SCHEMA} value={Math.round(effectsLoad * 100)} onChange={handleEffectsSlider} />
      </div>
      <p className="audio-load-panel__readout">
        {describeLimits({ ...robotLoadToLimits(robotLoad), ...effectsLoadToLimits(effectsLoad) })}
      </p>
    </DirectionalPanel>
  );
});
