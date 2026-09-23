/**
 * The single color source for every status-light dot/lens in the app —
 * PowerRockerSwitch's power light and AudioStatusBadge (Roadmap Phase 8) both
 * resolve their color through this module rather than hardcoding hex. Confirmed during intake: off=purple,
 * mute/inactive=red, solo/active=green, highlight/transitioning=amber,
 * sourced from colorTheme.json's existing vent/alert/indicator/strut families
 * rather than invented hex — the same colorTheme.json + hslToString() pattern
 * realWorldGradient.ts already uses for the `vent` family.
 */
import colorTheme from '@/constants/colorTheme.json';
import { hslToString, type HSL } from '@/utils/colorUtils';

export type StatusLightState = 'purple' | 'red' | 'green' | 'amber';

const STATUS_LIGHT_SOURCE: Record<StatusLightState, HSL> = {
  purple: colorTheme.vent.base,
  red: colorTheme.alert.powered,
  green: colorTheme.indicator.powered,
  amber: colorTheme.strut.base,
};

/**
 * Returns the solid `color` (opaque) and a translucent `glow` (for
 * box-shadow use) for a given status-light state, both derived from the same
 * colorTheme.json HSL value.
 *
 * @param state - which semantic status-light color to resolve
 * @param glowAlpha - opacity for the glow color (default 0.6)
 */
export function getStatusLightColor(state: StatusLightState, glowAlpha = 0.6): { color: string; glow: string } {
  const hsl = STATUS_LIGHT_SOURCE[state];
  return {
    color: hslToString(hsl),
    glow: hslToString(hsl, glowAlpha),
  };
}
