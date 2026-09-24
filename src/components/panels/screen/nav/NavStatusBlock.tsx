import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getAudibilityState, isRobotSounding } from '@/utils/robotAudibility';
import { robotLoadToLimits } from '@/utils/audioBudget';
import './NavStatusBlock.css';

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
 * Live status readout at the top of the nav panel, above NavTree's own rows (Crawford's own
 * request) — reads directly across attenuationStyleStore/localeStore/audioStore/uiStore rather
 * than a schema/ControlSchema-driven primitive, since none of these values are a single item's own
 * field (unlike Textbox, docs/specs/TEXTBOX_COMPONENT.md). Three rows: the current Attenuation
 * Style/coordinates, how many robots are actually emitting sound right now versus the Audio Load
 * budget's own current cap (docs/specs/AUDIO_LOAD_BUDGET.md), and the locale's own live clock/
 * temperature.
 */
export function NavStatusBlock() {
  const attenuationStyle = useAttenuationStyleStore(selectCurrentAttenuationStyle);
  const localeId = getActiveLocaleId();
  const coordinates = useLocaleStore((s) => s.locales[localeId]?.coordinates);
  const robots = useLocaleStore((s) => s.locales[localeId]?.robots ?? []);
  const soundingRobotIds = useAudioStore((s) => s.soundingRobotIds);
  const robotLoad = useAudioStore((s) => s.robotLoad);
  const localTime = useUIStore((s) => s.activeLocaleLocalTime);
  const temperature = useUIStore((s) => s.activeLocaleTemperature);

  const anySolo = robots.some((r) => r.audioMode === 'solo');
  const emittingCount = robots.filter(
    (r) => getAudibilityState(r.audioMode, anySolo, isRobotSounding(soundingRobotIds, r.id)) === 'emitting',
  ).length;
  const maxAudibleRobots = robotLoadToLimits(robotLoad).maxAudibleRobots;

  const styleName = attenuationStyle?.name ?? 'CORRUPT NAME';
  const x = coordinates?.x ?? '?';
  const y = coordinates?.y ?? '?';
  const tempLabel = temperature !== null ? `${temperature}°C` : 'CORRUPT TEMPERATURE';

  return (
    <div className="nav-status-block" role="status">
      <span className="seed-row">{styleName} @ {x}, {y}.</span>
      <span className="robot-count-row">{emittingCount} of {maxAudibleRobots} Probes active.</span>
      <span className="time-temp-row">{formatClock(localTime)} {tempLabel}</span>
    </div>
  );
}

export default NavStatusBlock;
