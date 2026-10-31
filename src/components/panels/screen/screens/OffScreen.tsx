import { useCallback, useMemo, useState } from 'react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { TRANSMISSION_PRESETS } from '@/data/transmissionPresets';
import { applySessionPayload } from '@/utils/sessionDiff';
import { useSessionStore } from '@/stores/sessionStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { listSessions, loadSession } from '@/utils/sessionStorageEngine';
import { hasHeardWorld } from '@/utils/deviceFlags';
import { describeWorld } from '@/utils/describeWorld';
import { labels } from '@/content';
import type { RadioButtonSchema } from '@/types/controls';
import type { SessionPayload } from '@/types/session';
import type { WorldIdentity } from '@/utils/seedBaseline';
import './OffScreen.css';

// ========================================
// CONSTANTS
// ========================================

// Option values carry their source, so a save named like a preset's id (or like its name) never
// collides with the preset — or with Current.
const CURRENT_VALUE = 'current';
const PRESET_PREFIX = 'preset:';
const SAVE_PREFIX = 'save:';

const LABEL = labels('home.off.label');
const POWER_HINT = labels('home.off.powerHint').humanLabel;
const TRANSMISSION = labels('home.off.transmission');
const CURRENT = labels('home.off.current');
const READOUT_LABEL = labels('home.off.readout').humanLabel;

/** What a pick is: Current — the loaded world, described live from the stores — or a save / preset, described
 *  from its own payload under its name, so the well names what was picked even before the world has rebuilt. */
type TransmissionPick =
  | { value: typeof CURRENT_VALUE }
  | { value: string; name: string; identity: Pick<WorldIdentity, 'attenuationStyleName' | 'coordinates'> };

const CURRENT_PICK: TransmissionPick = { value: CURRENT_VALUE };

/**
 * The powered-off screen (docs/specs/LAYOUT_REWORK.md §1.9; docs/specs/OFF_SCREEN.md §1.1, assumptions 7 and 8):
 * the etched label and the power hint over the dimmed, still world (WorldView stays mounted behind it —
 * ScreenViewport), and — once this device has heard a world — the Transmission row: Current on top (the loaded
 * world, named by describeWorld, or the loaded save's name in front of it), then the user's saves newest first,
 * a divider, then the three presets, as a muted RadioButton (nothing comes off the plate while the power is
 * off), with a well naming the pick through the same helper.
 *
 * The gate (assumption 7) is read once on mount, as the saves are: a device that has never heard a world sees
 * the label and the hint only — the first flip writes the flag, so the chooser waits behind the first power-off.
 *
 * Picking a save or preset retransmits the faint world through applySessionPayload, the same path a Load does,
 * and never starts audio: only the power switch does (powerController). Current is the loaded world, so picking
 * it applies nothing. A save pick also names the session after the save, as loading it from the Sessions list
 * does, so a later Save overwrites it. A save that has since vanished from storage applies nothing and is not
 * claimed as the pick. The Loading axis (the theme and Melody rows) is the themes phase's.
 */
export function OffScreen() {
  const [heardWorld] = useState(() => hasHeardWorld());
  // Newest first, as SessionsPanel lists them.
  const [saves] = useState(() => listSessions().sort((a, b) => b.savedAt - a.savedAt));
  const [pick, setPick] = useState<TransmissionPick>(CURRENT_PICK);

  // The loaded world, for the Current row and the readout. Narrow selectors (the name, the coordinates
  // object) as SectorSettingsDrawer reads them, so a robot write elsewhere in the locale never re-renders this.
  const currentAttenuationStyle = useAttenuationStyleStore(selectCurrentAttenuationStyle);
  const currentLocaleId = currentAttenuationStyle?.currentLocaleId;
  const coordinates = useLocaleStore((s) => (currentLocaleId ? s.locales[currentLocaleId]?.coordinates : undefined));
  const loadedSessionName = useSessionStore((s) => s.currentLoadedSessionName);
  // The stores hold a current world from module load on (their defaults), so the fallback never shows in the app.
  const currentLabel = describeWorld(
    { attenuationStyleName: currentAttenuationStyle?.name ?? '', coordinates: coordinates ?? { x: 0, y: 0 } },
    loadedSessionName ?? undefined,
  );

  const schema = useMemo<RadioButtonSchema>(
    () => ({
      id: 'offTransmission',
      type: 'radio',
      ...TRANSMISSION,
      appearance: 'muted',
      options: [
        { value: CURRENT_VALUE, humanLabel: currentLabel, loreLabel: CURRENT.humanLabel },
        ...saves.map((save) => ({
          value: SAVE_PREFIX + save.name,
          humanLabel: save.name,
        })),
        ...TRANSMISSION_PRESETS.map((preset, i) => ({
          value: PRESET_PREFIX + preset.id,
          humanLabel: labels(preset.nameKey).humanLabel,
          // The rule between the saves and the presets — only when there are saves to rule off.
          dividerBefore: i === 0 && saves.length > 0,
        })),
      ],
    }),
    [currentLabel, saves],
  );

  const onChange = useCallback((value: string) => {
    if (value === CURRENT_VALUE) {
      setPick(CURRENT_PICK);
      return;
    }
    let name: string;
    let payload: SessionPayload | undefined;
    if (value.startsWith(PRESET_PREFIX)) {
      const preset = TRANSMISSION_PRESETS.find((p) => PRESET_PREFIX + p.id === value);
      name = preset ? labels(preset.nameKey).humanLabel : '';
      payload = preset?.payload;
    } else {
      name = value.slice(SAVE_PREFIX.length);
      payload = loadSession(name);
    }
    if (!payload) return;
    applySessionPayload(payload);
    if (value.startsWith(SAVE_PREFIX)) {
      const { setCurrentSessionName, setCurrentLoadedSessionName } = useSessionStore.getState();
      setCurrentSessionName(name);
      setCurrentLoadedSessionName(name);
    }
    setPick({ value, name, identity: { attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates } });
  }, []);

  const readout = 'identity' in pick ? describeWorld(pick.identity, pick.name) : currentLabel;

  return (
    <div className="off-screen">
      <div className="off-screen__etch">
        <h2 className="off-screen__label">{LABEL.humanLabel}</h2>
        {LABEL.loreLabel && <p className="off-screen__lore">{LABEL.loreLabel}</p>}
        <p className="off-screen__hint">{POWER_HINT}</p>
      </div>
      {heardWorld && (
        <div className="off-screen__picker">
          <RadioButton schema={schema} value={pick.value} onChange={onChange} />
          <p className="off-screen__readout" role="status" aria-label={READOUT_LABEL} data-testid="off-screen-readout">
            {readout}
          </p>
        </div>
      )}
    </div>
  );
}
