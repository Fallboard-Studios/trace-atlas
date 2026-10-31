import { useCallback, useMemo, useState } from 'react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { Button } from '@/components/ui/controls/Button';
import { TRANSMISSION_PRESETS, presetPayload } from '@/data/transmissionPresets';
import { applySessionPayload } from '@/utils/sessionDiff';
import { rollWorld } from '@/systems/worldTransition';
import { useSessionStore, isWorldDirty } from '@/stores/sessionStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { listSessions, loadSession } from '@/utils/sessionStorageEngine';
import { hasHeardWorld } from '@/utils/deviceFlags';
import { describeWorld } from '@/utils/describeWorld';
import { labels } from '@/content';
import type { ButtonSchema, RadioButtonSchema } from '@/types/controls';
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

/** Roll and Keep (spec assumption 14): the actions beside Current, muted like the options — nothing pops while the
 *  power is off. */
const ROLL_SCHEMA: ButtonSchema = { id: 'offRoll', type: 'button', ...labels('home.off.roll'), appearance: 'muted' };
const KEEP_SCHEMA: ButtonSchema = { id: 'offKeep', type: 'button', ...labels('home.off.keep'), appearance: 'muted' };
const UNSAVED_WARNING = labels('home.off.unsavedWarning').humanLabel;

/** The saves, newest first, as SessionsPanel lists them. */
const sortedSaves = () => listSessions().sort((a, b) => b.savedAt - a.savedAt);

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
 * claimed as the pick. Roll (assumption 14) is the action beside Current: a fresh random world through rollWorld —
 * a retransmit, so the pick returns to Current and the row renames from the stores. Keep (assumption 14) saves the
 * loaded world through sessionStore.keepCurrentWorld — no name field — and the new row appears at once; it dims
 * (the dim-controls rule) whenever the loaded world equals its save, and a muted warning line sits under the
 * chooser only while it does not. Dirty is read on mount, after a pick, after a Roll and after a Keep — never per
 * render (it builds the live payload). A preset pick or a Roll detaches the loaded save (sessionStore
 * .detachLoadedSession): that world is no longer the save, so Current is named by its identity alone and Keep
 * writes a new row rather than overwriting the save. The Loading axis (the theme and Melody rows) is the themes
 * phase's.
 */
export function OffScreen() {
  const [heardWorld] = useState(() => hasHeardWorld());
  const [saves, setSaves] = useState(sortedSaves);
  const [pick, setPick] = useState<TransmissionPick>(CURRENT_PICK);
  // Only the chooser reads it; a first visit (hint only) never builds the payload.
  const [dirty, setDirty] = useState(() => heardWorld && isWorldDirty());

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
      // A preset is a link (spec assumption 13): the pick applies whatever world it decodes to.
      const preset = TRANSMISSION_PRESETS.find((p) => PRESET_PREFIX + p.id === value);
      name = preset ? labels(preset.nameKey).humanLabel : '';
      payload = (preset && presetPayload(preset)) ?? undefined;
    } else {
      name = value.slice(SAVE_PREFIX.length);
      payload = loadSession(name);
    }
    if (!payload) return;
    applySessionPayload(payload);
    const { setCurrentSessionName, setCurrentLoadedSessionName, detachLoadedSession } = useSessionStore.getState();
    if (value.startsWith(SAVE_PREFIX)) {
      setCurrentSessionName(name);
      setCurrentLoadedSessionName(name);
    } else {
      detachLoadedSession();
    }
    setPick({ value, name, identity: { attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates } });
    setDirty(isWorldDirty());
  }, []);

  // Roll is the retransmit itself: the stores change under the Current row, which renames from them.
  const onRoll = useCallback(() => {
    rollWorld();
    useSessionStore.getState().detachLoadedSession();
    setPick(CURRENT_PICK);
    setDirty(isWorldDirty());
  }, []);

  const onKeep = useCallback(() => {
    useSessionStore.getState().keepCurrentWorld();
    setSaves(sortedSaves());
    setDirty(isWorldDirty());
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
          <div className="off-screen__actions">
            <Button schema={ROLL_SCHEMA} face="single" onClick={onRoll} />
            <Button schema={KEEP_SCHEMA} face="single" onClick={onKeep} disabled={!dirty} />
          </div>
          <p className="off-screen__readout" role="status" aria-label={READOUT_LABEL} data-testid="off-screen-readout">
            {readout}
          </p>
          {dirty && <p className="off-screen__warning">{UNSAVED_WARNING}</p>}
        </div>
      )}
    </div>
  );
}
