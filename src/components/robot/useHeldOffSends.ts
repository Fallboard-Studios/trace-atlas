import { useMemo } from 'react';
import { useAudioStore } from '@/stores/audioStore';
import { isRoomSendKey, recordByField, type RobotSendField } from '@/data/robotSends';

/**
 * Which of a robot's five send rows do nothing right now because the Audio Load dial holds their room dark
 * (docs/specs/LIGHT_TIER_STANDING_COST.md §1.4: every control a hold-off makes inert is dimmed; Crawford, 2026-10-29,
 * "if they don't do anything they should be dimmed"). While the effects are held off (`effectsHeldOff`), the three
 * effect-room sends (Grit, Shimmer, Double) feed dark rooms; while the Reverb is held off (`reverbHeldOff`), the Reverb
 * send feeds an unwired Reverb. The Delay send is never held off.
 */
export function heldOffSends(effectsHeldOff: boolean, reverbHeldOff: boolean): Record<RobotSendField, boolean> {
  return recordByField((spec) => (isRoomSendKey(spec.engineKey) ? effectsHeldOff : spec.engineKey === 'reverb' && reverbHeldOff));
}

/** `heldOffSends` from the store's flags, as a record that keeps its reference until a flag changes, so the memoised
 *  AudioSettingSection it is handed to does not re-render on an unrelated store write. The robot screen and the company
 *  screen both read it, which keeps AudioSettingSection itself store-free. */
export function useHeldOffSends(): Readonly<Record<RobotSendField, boolean>> {
  const effectsHeldOff = useAudioStore((s) => s.effectsHeldOff);
  const reverbHeldOff = useAudioStore((s) => s.reverbHeldOff);
  return useMemo(() => heldOffSends(effectsHeldOff, reverbHeldOff), [effectsHeldOff, reverbHeldOff]);
}
