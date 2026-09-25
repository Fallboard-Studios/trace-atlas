import { memo, useCallback } from 'react';

import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { AUDIO_EFFECTS_LOAD_SCHEMA, AUDIO_LOAD_PANEL_SCHEMA, AUDIO_LOAD_PRESET_SCHEMA, AUDIO_ROBOT_LOAD_SCHEMA } from '@/data/audioRigConfig';
import { AUDIO_LOAD_PRESETS } from '@/constants';
import { useAudioStore } from '@/stores/audioStore';
import { describeLimits, effectsLoadToLimits, presetForLoads, robotLoadToLimits } from '@/utils/audioBudget';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import './AudioLoadPanel.css';

/** Ref callback registering/clearing a nav scroll anchor (src/utils/sectionRefs.ts) — matches
 *  navTreeConfig.ts's own settings.quality.robotLoad/effectsLoad tree node ids (Settings ->
 *  Performance's own 3rd tree level). */
function sectionAnchorRef(id: string) {
  return (el: HTMLDivElement | null) => {
    if (el) setSectionRef(id, el);
    else clearSectionRef(id);
  };
}

/**
 * The Audio Load control (docs/specs/AUDIO_LOAD_BUDGET.md §4.5) — rendered from Settings -> Quality
 * (docs/tasks/NAV_LAYOUT_REWRITE.md Task 13, SettingsContent.tsx). Previously sat inside
 * AudioRigDrawer's Transport & Composition accordion, next to a Tempo slider that itself relocated
 * to Settings -> Tempo (Task 12) — both moved out once "Quality"/"Tempo" became real tree leaves.
 * A preset radio and two fine sliders (Robot Load, Effects Load) are three views of TWO stored
 * numbers (audioStore.robotLoad/effectsLoad): choosing a preset sets both sliders; dragging either
 * slider off a shared preset leaves the radio with nothing selected (presetForLoads requires both
 * axes to agree). A plain store write — no engine call here; audioBudgetSystem reacts to the
 * dials. Its own component (not inline in its host) so a change of either dial re-renders only
 * this panel.
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
      <div className="audio-rig-drawer__param-row" ref={sectionAnchorRef('settings.quality.robotLoad')}>
        <SliderLinear schema={AUDIO_ROBOT_LOAD_SCHEMA} value={Math.round(robotLoad * 100)} onChange={handleRobotSlider} />
      </div>
      <div className="audio-rig-drawer__param-row" ref={sectionAnchorRef('settings.quality.effectsLoad')}>
        <SliderLinear schema={AUDIO_EFFECTS_LOAD_SCHEMA} value={Math.round(effectsLoad * 100)} onChange={handleEffectsSlider} />
      </div>
      <p className="audio-load-panel__readout">
        {describeLimits({ ...robotLoadToLimits(robotLoad), ...effectsLoadToLimits(effectsLoad) })}
      </p>
    </DirectionalPanel>
  );
});
