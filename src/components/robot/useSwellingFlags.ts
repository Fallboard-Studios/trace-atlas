import { useMemo } from 'react';

import { ROBOT_SEND_FIELDS, recordByField, type RobotSendField } from '@/data/robotSends';
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

/**
 * The five send flags as one record keyed by field (docs/specs/ROBOT_SEND_TABLE.md §1.4), all false without a robot.
 * Unlike the two hooks around it there is no `source`: the five reads it replaces ran on every render, and a send's flag
 * can flip on a render no send field caused (a swell ends while the screen re-renders for another field), so this reads
 * every render too and keeps its object only while the five answers are unchanged - a memo keyed on it still holds.
 */
export function useSendSwellingFlags(robotId: string | undefined): Readonly<Record<RobotSendField, boolean>> {
  // One character per send, in table order: '1' swelling, '0' not.
  const answers = ROBOT_SEND_FIELDS.map((field) => (robotId !== undefined && isRobotAttributeSwelling(robotId, field) ? '1' : '0')).join('');
  return useMemo(() => recordByField((_spec, i) => answers[i] === '1'), [answers]);
}

export function useLayerSwellingFlags(robotId: string, index: 0 | 1 | 2, source: unknown): LayerSwellingFlags;
export function useLayerSwellingFlags(robotId: string | undefined, index: 0 | 1 | 2, source: unknown): LayerSwellingFlags | undefined;
export function useLayerSwellingFlags(robotId: string | undefined, index: 0 | 1 | 2, source: unknown): LayerSwellingFlags | undefined {
  return useMemo(
    () => (robotId === undefined ? undefined : {
      gain: isRobotAttributeSwelling(robotId, `layer${index}.gain`),
      detune: isRobotAttributeSwelling(robotId, `layer${index}.detune`),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `source` gates recompute timing, not read in the body (see above)
    [robotId, index, source],
  );
}
