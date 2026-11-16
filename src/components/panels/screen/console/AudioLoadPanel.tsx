import { memo, useCallback } from 'react';

import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { AUDIO_EFFECTS_LOAD_SCHEMA, AUDIO_LOAD_PANEL_SCHEMA, AUDIO_LOAD_PRESET_SCHEMA, AUDIO_ROBOT_LOAD_SCHEMA } from '@/data/audioRigConfig';
import { AUDIO_LOAD_PRESETS } from '@/constants';
import { useAudioStore } from '@/stores/audioStore';
import { describeLimits, effectsLoadToLimits, presetForLoads, robotLoadToLimits } from '@/utils/audioBudget';
import type { DirectionalPanelSchema } from '@/types/controls';
import './AudioLoadPanel.css';

// 2 nested rows (docs/reference/layout-updates.md — "Audio Profiles accordion"): Preset paired
// with its own live description, Voice Limit paired with Effects Limit below it. Nested (not
// top-level) 'responsive' rows inside the one box, with the sheet's ids (docs/specs/CONTENT_LAYOUT.md
// §1.2: `fleetParams.settings.p1.r1`, `.r2`); the order is today's, Preset first (assumption 5).
const AUDIO_LOAD_PRESET_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.settings.p1.r1', type: 'directionalPanel', orientation: 'responsive' };
const AUDIO_LOAD_SLIDERS_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.settings.p1.r2', type: 'directionalPanel', orientation: 'responsive' };

/**
 * The Audio Load control (docs/specs/archive/AUDIO_LOAD_BUDGET.md §4.5) — rendered as Fleet Params' World > Settings
 * sub-tab (FleetParamsScreen.tsx, docs/specs/CONTENT_LAYOUT.md §1.2; the Audio Quality tab from
 * docs/tasks/OFF_SCREEN_CONSOLE.md Task 12; Settings' first tab before that, from
 * docs/tasks/archive/NAV_LAYOUT_REWRITE.md Task 13 until Settings left the nav). Previously sat inside
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
      <DirectionalPanel schema={AUDIO_LOAD_PRESET_ROW_SCHEMA}>
        <div className="audio-rig-drawer__param-row">
          <RadioButton schema={AUDIO_LOAD_PRESET_SCHEMA} value={presetForLoads(robotLoad, effectsLoad) ?? ''} onChange={handlePreset} />
        </div>
        <p className="audio-load-panel__readout">
          {describeLimits({ ...robotLoadToLimits(robotLoad), ...effectsLoadToLimits(effectsLoad) })}
        </p>
      </DirectionalPanel>
      <DirectionalPanel schema={AUDIO_LOAD_SLIDERS_ROW_SCHEMA}>
        <div className="audio-rig-drawer__param-row">
          <SliderLinear schema={AUDIO_ROBOT_LOAD_SCHEMA} value={Math.round(robotLoad * 100)} onChange={handleRobotSlider} />
        </div>
        <div className="audio-rig-drawer__param-row">
          <SliderLinear schema={AUDIO_EFFECTS_LOAD_SCHEMA} value={Math.round(effectsLoad * 100)} onChange={handleEffectsSlider} />
        </div>
      </DirectionalPanel>
    </DirectionalPanel>
  );
});
