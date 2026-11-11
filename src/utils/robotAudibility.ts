import { DockingState, type Robot } from '@/types/Robot';

/**
 * The dock's own mute: a robot in the station — Docked, or Undocking on its way out — is silent whatever its
 * audioMode, which stays the user's alone (Crawford, 2026-11-11: the dock used to write `audioMode` itself, which
 * overwrote a Solo, Mute or Highlight at every landing). A Recalled robot is still heard on its way home.
 */
export function isDockMuted(docking: DockingState | undefined): boolean {
  return docking === DockingState.Docked || docking === DockingState.Undocking;
}

/**
 * True if a robot with `audioMode` and `docking` would actually be heard right now, given whether ANY robot in
 * its locale is currently soloed — mirrors AudioEngine.ts's own triggerWithCap mute/solo check
 * exactly (that check is refactored to call this instead of re-deriving the rule, see
 * docs/specs/archive/ROBOT_CARDS_REDESIGN.md §1.2). `undefined` (a robot not yet in the store, or
 * audioMode unset) behaves identically to `'none'`; an undefined docking is out of the station. Mute always wins;
 * under any Solo only the soloed robots are heard, in the station or not (Solo beats the dock); otherwise the dock
 * mutes a robot in the station.
 *
 * Takes `anySolo: boolean`, not the full locale robot list (bugfix, found live: the only thing
 * this ever read off that list was this same boolean, but every caller still had to subscribe to
 * the WHOLE array to compute it — for RobotSelectionCard.tsx specifically, that meant a fresh
 * Zustand subscription re-render on every robot-attribute write anywhere in the locale, including
 * audioSwells.ts's own 16n modulation ticks on totally unrelated robots, ~8-9x a second. Each
 * caller now derives `anySolo` itself, the way RobotSelectionCard.tsx does via a boolean-typed
 * selector — a primitive Zustand can bail out on with its own default equality check, unlike an
 * array reference that changes every tick regardless of whether solo state itself changed).
 */
export function isRobotAudible(audioMode: Robot['audioMode'], anySolo: boolean, docking: DockingState | undefined): boolean {
  if (audioMode === 'mute') return false;
  if (anySolo) return audioMode === 'solo';
  return !isDockMuted(docking);
}

/**
 * True while a robot is heard right now: audible by the mute/solo/dock rule AND in the Audio Load budget's sounding
 * set (docs/specs/MONITOR_MODE_TRUSTWORTHY.md §1.5). The Deck's "n of m" counts it; the mode light is lit by it.
 */
export function isRobotEmitting(audioMode: Robot['audioMode'], anySolo: boolean, docking: DockingState | undefined, isSounding: boolean): boolean {
  return isRobotAudible(audioMode, anySolo, docking) && isSounding;
}

/** What a robot's card says: audible and sounding, held back by the Audio Load budget, or silenced by mute/solo/the dock. */
export type AudibilityState = 'emitting' | 'limited' | 'disabled';

/**
 * Three-state audibility for the UI (docs/specs/archive/AUDIO_LOAD_BUDGET.md §4.5). A robot `isRobotAudible` rules out
 * is `disabled`; one that is eligible but outside the budget's sounding set is `limited` ("Standing by"); an
 * eligible robot in the set is `emitting`. `isRobotAudible` itself stays the mute/solo/dock rule.
 */
export function getAudibilityState(audioMode: Robot['audioMode'], anySolo: boolean, docking: DockingState | undefined, isSounding: boolean): AudibilityState {
  if (!isRobotAudible(audioMode, anySolo, docking)) return 'disabled';
  return isSounding ? 'emitting' : 'limited';
}

/**
 * Whether the budget lets this robot sound, for use as a per-robot boolean selector (never subscribe a card to
 * the whole list). An EMPTY list means the budget system is not running — it is cleared on stop and, once
 * running, always holds at least the minimum audible robots for any eligible one — so every robot reads as
 * sounding and Full stays exactly today's behavior.
 */
export function isRobotSounding(soundingRobotIds: readonly string[], robotId: string): boolean {
  return soundingRobotIds.length === 0 || soundingRobotIds.includes(robotId);
}
