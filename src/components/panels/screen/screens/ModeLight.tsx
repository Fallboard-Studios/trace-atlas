import type { CSSProperties } from 'react';
import { getStatusLightColor, type StatusLightState } from '@/utils/statusLightColors';
import type { Robot } from '@/types/Robot';
import './ModeLight.css';

type Mode = NonNullable<Robot['audioMode']>;

/** Each Monitor Mode's light (docs/specs/MONITOR_MODE_TRUSTWORTHY.md §1.5, §7.1 B1). */
const MODE_LIGHT_STATE: Record<Mode, StatusLightState> = {
  none: 'green',
  solo: 'yellow',
  mute: 'red',
  highlight: 'blue',
};

/** The colour and glow pair per mode, resolved once: the inline custom properties the stylesheet reads. */
const MODE_LIGHT_STYLE = Object.fromEntries(
  Object.entries(MODE_LIGHT_STATE).map(([mode, state]) => {
    const { color, glow } = getStatusLightColor(state);
    return [mode, { '--mode-light-color': color, '--mode-light-glow': glow } as CSSProperties];
  }),
) as Record<Mode, CSSProperties>;

/**
 * The small light before a robot's Status word (docs/specs/MONITOR_MODE_TRUSTWORTHY.md §1.5, §7.1 B2–B3): its colour is
 * the robot's own mode, lit (with the rocker light's glow) while the robot is heard, dim for any silence. Stateless;
 * hidden from assistive tech, since the word beside it carries the meaning. Shared by the robot screen's Status well,
 * the phone band and the roster tile.
 */
export function ModeLight({ mode, lit }: { mode: Mode; lit: boolean }) {
  return <span className="mode-light" aria-hidden="true" data-mode={mode} data-lit={lit ? 'true' : 'false'} style={MODE_LIGHT_STYLE[mode]} />;
}
