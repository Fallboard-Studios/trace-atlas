import { useShell } from '../useShell';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getAudibilityState, isRobotSounding } from '@/utils/robotAudibility';
import { robotLoadToLimits } from '@/utils/audioBudget';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { Robot } from '@/types/Robot';
import { CONTENT, fill } from '@/content';
import './MetaBox.css';

const NO_ROBOTS: readonly Robot[] = [];
// The sketch draws the meta box in the Deck's colour, the header trait (PhoneBar's too).
const META_ACCENT = getTraitColorStyle('header');

/** HH:MM from uiStore's own fractional-hour clock (e.g. 14.5 -> "14:30") — the same math the
 *  pre-nav-rewrite Header.tsx used before its own time/temp row was retired, reinstated here
 *  rather than left unrecoverable. */
function formatClock(localTime: number | null): string {
  const t = localTime ?? 0;
  const hour = Math.max(0, Math.min(23, Math.floor(t)));
  const minute = Math.max(0, Math.min(59, Math.floor((t % 1) * 60)));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * How many robots are emitting sound right now. A number, not the robots array: `updateRobot` replaces
 * the array on every battery tick and swell, and the world line shows only this count, so a tick that
 * leaves it alone re-renders nothing (the Deck is where the idle-paint gate measures, Task 29). The
 * sounding set comes in through the closure; a change to it re-renders through its own subscription.
 */
function useEmittingCount(): number {
  const localeId = getActiveLocaleId();
  const soundingRobotIds = useAudioStore((s) => s.soundingRobotIds);
  return useLocaleStore((s) => {
    const robots = s.locales[localeId]?.robots ?? NO_ROBOTS;
    const anySolo = robots.some((r) => r.audioMode === 'solo');
    return robots.filter((r) => getAudibilityState(r.audioMode, anySolo, isRobotSounding(soundingRobotIds, r.id)) === 'emitting').length;
  });
}

/**
 * The world line (docs/specs/LAYOUT_REWORK.md §1.7): the locale's clock and temperature, how many robots
 * are emitting against the Audio Load budget's cap (docs/specs/AUDIO_LOAD_BUDGET.md), and the current
 * Attenuation Style and coordinates — NavStatusBlock's three rows, moved here verbatim (Task 8) and laid
 * in one line. Inline, so a parent's one-line ellipsis cuts it: the meta box's well on the desk,
 * PhoneBar's well on the phone.
 */
export function WorldLine() {
  const attenuationStyle = useAttenuationStyleStore(selectCurrentAttenuationStyle);
  const localeId = getActiveLocaleId();
  const coordinates = useLocaleStore((s) => s.locales[localeId]?.coordinates);
  const emittingCount = useEmittingCount();
  const robotLoad = useAudioStore((s) => s.robotLoad);
  const localTime = useUIStore((s) => s.activeLocaleLocalTime);
  const temperature = useUIStore((s) => s.activeLocaleTemperature);

  const maxAudibleRobots = robotLoadToLimits(robotLoad).maxAudibleRobots;
  const styleName = attenuationStyle?.name ?? CONTENT['nav.status.unknownName'].human;
  const x = coordinates?.x ?? '?';
  const y = coordinates?.y ?? '?';
  const tempLabel = temperature !== null ? `${temperature}°C` : CONTENT['nav.status.noTemperature'].human;

  return (
    <span className="world-line">
      <span className="world-line__field"><span className="world-line__clock">{formatClock(localTime)}</span> <span className="world-line__temp">{tempLabel}</span></span>
      <span className="world-line__field"><span className="world-line__count">{fill('nav.status.probesActive', { emitting: String(emittingCount), max: String(maxAudibleRobots) })}</span></span>
      <span className="world-line__field">{fill('nav.status.viewing', { name: styleName, x: String(x), y: String(y) })}</span>
    </span>
  );
}

/**
 * The meta box (spec §1.7; docs/tasks/LAYOUT_REWORK.md Task 8): the glow-glass well at the top of the
 * Deck, right of the nav and level with the header (it began in the corner the content surface and the breadcrumb take on the other views; Crawford moved it up, 2026-10-10), carrying the
 * world line. It replaces NavStatusBlock, the panel's old status readout. Desk shell, Deck only: on a
 * branch the breadcrumb has the corner and the world sits under the surface, and on the phone the world
 * line shows in PhoneBar's well. Robots carry no text box in the world; a selection reads as a halo
 * (Robot.tsx), and the screen it opens names it.
 */
export function MetaBox() {
  const shell = useShell();
  const onDeck = useUIStore((s) => s.activeHubTile === null);

  if (shell !== 'desk' || !onDeck) return null;

  return (
    <div className="meta-box" style={META_ACCENT}>
      <WorldLine />
    </div>
  );
}

export default MetaBox;
