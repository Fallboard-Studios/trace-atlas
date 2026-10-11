import { useMemo } from 'react';

import { isRobotAttributeSwelling } from '@/systems/audioSwells';

/**
 * Audio Swells: per-field swelling flags for each slider's own `swelling` prop (useEasedControlValue), so
 * a swell's already-smooth ramp is not eased a second time. Shared by the robot screen and the company
 * options (which read them for the company's first member).
 *
 * isRobotAttributeSwelling reads a plain module-scope Map (audioSwells.ts's own runtime state,
 * deliberately kept out of Zustand per CLAUDE.md), not anything React tracks. The `source` argument is
 * the robot field a swell tick writes (the ADSR, a layer): it is a dependency purely so the memo
 * recomputes at that moment, even though the body never reads it.
 */

export interface AdsrSwellingFlags {
  attack: boolean;
  decay: boolean;
  sustain: boolean;
  release: boolean;
}

export interface LayerSwellingFlags {
  gain: boolean;
  detune: boolean;
  phase: boolean;
  pulseWidth: boolean;
}

export function useAdsrSwellingFlags(robotId: string, source: unknown): AdsrSwellingFlags;
export function useAdsrSwellingFlags(robotId: string | undefined, source: unknown): AdsrSwellingFlags | undefined;
export function useAdsrSwellingFlags(robotId: string | undefined, source: unknown): AdsrSwellingFlags | undefined {
  return useMemo(
    () => (robotId === undefined ? undefined : {
      attack: isRobotAttributeSwelling(robotId, 'adsr.attack'),
      decay: isRobotAttributeSwelling(robotId, 'adsr.decay'),
      sustain: isRobotAttributeSwelling(robotId, 'adsr.sustain'),
      release: isRobotAttributeSwelling(robotId, 'adsr.release'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `source` gates recompute timing, not read in the body (see above)
    [robotId, source],
  );
}

export function useLayerSwellingFlags(robotId: string, index: 0 | 1 | 2, source: unknown): LayerSwellingFlags;
export function useLayerSwellingFlags(robotId: string | undefined, index: 0 | 1 | 2, source: unknown): LayerSwellingFlags | undefined;
export function useLayerSwellingFlags(robotId: string | undefined, index: 0 | 1 | 2, source: unknown): LayerSwellingFlags | undefined {
  return useMemo(
    () => (robotId === undefined ? undefined : {
      gain: isRobotAttributeSwelling(robotId, `layer${index}.gain`),
      detune: isRobotAttributeSwelling(robotId, `layer${index}.detune`),
      phase: isRobotAttributeSwelling(robotId, `layer${index}.phase`),
      pulseWidth: isRobotAttributeSwelling(robotId, `layer${index}.pulseWidth`),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `source` gates recompute timing, not read in the body (see above)
    [robotId, index, source],
  );
}
