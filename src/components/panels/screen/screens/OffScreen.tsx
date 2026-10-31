import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { Button } from '@/components/ui/controls/Button';
import { TRANSMISSION_PRESETS, presetPayload } from '@/data/transmissionPresets';
import { loadingOf } from '@/data/bands/loadingIdentity';
import { THEME_IDS, isThemeId, type ThemeId } from '@/data/bands/themes';
import { THEME_PICK, canonicalPicks, pickOrderOf, type AspectId, type AspectPick } from '@/data/bands/aspects';
import { applySessionPayload } from '@/utils/sessionDiff';
import { retransmitWorld, rollWorld } from '@/systems/worldTransition';
import { useSessionStore, isWorldDirty } from '@/stores/sessionStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useLoadingStore } from '@/stores/loadingStore';
import { listSessions, loadSession } from '@/utils/sessionStorageEngine';
import { hasHeardWorld } from '@/utils/deviceFlags';
import { describeWorld } from '@/utils/describeWorld';
import { aspectDescription, aspectName, asThemeLabel, familyLabels, themeDescription, themeName } from '@/utils/loadingNames';
import { setRef, deleteRef } from '@/utils/refs';
import { killTimeline } from '@/animation/timelineMap';
import { OFF_SCREEN_FADE_TIMELINE, OFF_SCREEN_REF_KEY, skipOffScreenBoot, startOffScreenBoot } from '@/animation/offScreenTheatre';
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
const FOOTER = labels('home.off.footer').humanLabel;

/** The Loading axis's theme row (docs/tasks/OFF_SCREEN.md Task 30; spec assumption 17): the five ids in THEME_IDS
 *  order under the Loading heading — the row's own label, as Transmission is the world row's — muted like it. Static:
 *  the names are content. */
const THEME_SCHEMA: RadioButtonSchema = {
  id: 'offTheme',
  type: 'radio',
  ...labels('home.off.loading'),
  appearance: 'muted',
  options: THEME_IDS.map((id) => ({ value: id, humanLabel: themeName(id) })),
};

/** The Melody row (Task 31; spec assumptions 17 and 21): a muted multiple RadioButton labelled by the family — the
 *  as-theme member first, then the three options in canonical order (pickOrderOf), each on or off on its own. */
const MELODY_SCHEMA: RadioButtonSchema = {
  id: 'offMelody',
  type: 'radio',
  ...familyLabels('melody'),
  appearance: 'muted',
  multiple: true,
  options: pickOrderOf('melody').map((pick) => ({
    value: pick,
    humanLabel: pick === THEME_PICK ? asThemeLabel() : aspectName('melody', pick),
  })),
};

/** The Melody row's value for a world with no picks: one array, so the memoized row sees the same props each render. */
const NO_PICKS: readonly AspectPick[] = [];

/** The saves, newest first, as SessionsPanel lists them. */
const sortedSaves = () => listSessions().sort((a, b) => b.savedAt - a.savedAt);

/** What a pick is: Current — the loaded world, described live from the stores — or a save / preset, described
 *  from its own payload under its name, so the well names what was picked even before the world has rebuilt. The
 *  identity is whole (Task 30): the payload's loading, read leniently by loadingOf, sets the Loading rows and the
 *  readout's tail. */
type TransmissionPick =
  | { value: typeof CURRENT_VALUE }
  | { value: string; name: string; identity: WorldIdentity };

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
 * writes a new row rather than overwriting the save. The veil (assumption 18) is the screen's own backdrop — the
 * blur and dim over the still world, under everything else here — and the lore footer is the last thing in the
 * column in both gate states. The column is the root's third child, `.off-screen__scroll`, after the veil and the
 * dark layer (docs/tasks/OFF_SCREEN_REVISIONS.md Task 2): it is what scrolls on the phone, so the veil stays put.
 *
 * The boot theatre (assumption 18, animation/offScreenTheatre.ts): on mount the dark layer over the content holds
 * for half a second, then flickers off — a 'ui' timeline in timelineMap, so it runs over the paused world; a tap
 * anywhere on the screen skips it, reduced motion skips it outright, and the rocker outside the screen works
 * throughout. The screen registers its root under the off-screen ref so powerController's power-on can await
 * fadeOffScreen() — the screen and its veil to transparent — before the power flag flips and ScreenViewport
 * unmounts it. Both timelines are killed, and the ref dropped, on unmount.
 *
 * The Loading axis (docs/tasks/OFF_SCREEN.md Task 30; spec assumptions 9 and 17, §1.6): the second column, under the
 * Loading heading — the theme row, a muted RadioButton of the five themes, and one muted sentence under it describing
 * the shown theme (the Guide's small part: the same content entry the Guide will read). The row shows the loaded
 * world's theme from the loading store while Current is the pick, and the picked save's or preset's own (its payload,
 * through loadingOf) after a pick — the two agree once the retransmit has run, but the row never waits on it. A theme
 * pick is `retransmitWorld({ theme })`: the seed and the plot stay, the tweaks go, the world row drops back to Current
 * (the decided pick rules, docs/sketches/off-screen.html), the loaded save stays attached — the seed is still the
 * save's, under another theme, so Keep overwrites it — and dirty is read again. The readout carries describeWorld's
 * tail, so the three readers of the helper agree. Desktop: the two axes side by side, the readout spanning under
 * both; the phone shell stacks them (OffScreen.css).
 *
 * The Melody row (Task 31; assumptions 17 and 21) sits under the theme row's line: a muted multiple RadioButton — As
 * theme, then the three options in canonical order — showing the loaded world's picks for Current and the picked
 * payload's after a save or preset pick, as the theme row does. A change sends the whole set, canonical, as
 * `retransmitWorld({ aspects: { melody } })` (an empty list when the row is cleared — the deal re-runs over the same
 * seed and plot), with the same drop to Current, the same attached save and the same dirty read as a theme pick. Its
 * own description line names the aspect toggled on last while it is still on, else the last of the set in canonical
 * order, else — the as-theme member alone, or nothing — the as-theme sentence; a world pick resets the toggle memory, so
 * a save reads as its own set. Roll touches neither row: rollWorld leaves the loading store alone (assumption 14).
 */
export function OffScreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const stopBootRef = useRef<(() => void) | null>(null);
  const [heardWorld] = useState(() => hasHeardWorld());
  const [saves, setSaves] = useState(sortedSaves);
  const [pick, setPick] = useState<TransmissionPick>(CURRENT_PICK);
  // The Melody aspect toggled on most recently (Task 31), for the row's description line; null after a world pick.
  const [lastMelodyOn, setLastMelodyOn] = useState<AspectId | null>(null);
  // Only the chooser reads it; a first visit (hint only) never builds the payload.
  const [dirty, setDirty] = useState(() => heardWorld && isWorldDirty());

  // The loaded world, for the Current row and the readout. Narrow selectors (the name, the coordinates
  // object) as SectorSettingsDrawer reads them, so a robot write elsewhere in the locale never re-renders this.
  const currentAttenuationStyle = useAttenuationStyleStore(selectCurrentAttenuationStyle);
  const currentLocaleId = currentAttenuationStyle?.currentLocaleId;
  const coordinates = useLocaleStore((s) => (currentLocaleId ? s.locales[currentLocaleId]?.coordinates : undefined));
  const loadedSessionName = useSessionStore((s) => s.currentLoadedSessionName);
  // The loaded world's loading (Task 30): two narrow reads, so only a theme or pick-list change re-renders this.
  const loadedTheme = useLoadingStore((s) => s.theme);
  const loadedAspects = useLoadingStore((s) => s.aspects);
  // The stores hold a current world from module load on (their defaults), so the fallback never shows in the app.
  const currentLabel = describeWorld(
    {
      attenuationStyleName: currentAttenuationStyle?.name ?? '',
      coordinates: coordinates ?? { x: 0, y: 0 },
      theme: loadedTheme,
      aspects: loadedAspects,
    },
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
    // A world pick shows the set as that world carries it: nothing toggled (Task 31).
    setLastMelodyOn(null);
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
    setPick({
      value,
      name,
      identity: { attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates, ...loadingOf(payload) },
    });
    setDirty(isWorldDirty());
  }, []);

  // A theme pick (Task 30): the loading alone moves — the same seed and plot, drawn again under the new bands — so the
  // world row drops back to Current. The loaded save stays attached (see the component note), and dirty is read again.
  const onThemeChange = useCallback((value: string) => {
    if (!isThemeId(value)) return;
    retransmitWorld({ theme: value });
    setPick(CURRENT_PICK);
    setDirty(isWorldDirty());
  }, []);

  // The boot theatre, built through useGSAP (CLAUDE.md: animation in components goes through it) and registered in
  // timelineMap by the animation module; the ref the fade reads is set here, where the root exists.
  useGSAP(
    () => {
      if (!rootRef.current || !darkRef.current) return;
      setRef(OFF_SCREEN_REF_KEY, rootRef.current);
      stopBootRef.current = startOffScreenBoot(darkRef.current);
    },
    { scope: rootRef, dependencies: [] },
  );

  // useGSAP ignores its callback's return, so the kills live here (PowerRockerSwitch's pattern): the theatre, a
  // fade still in flight, and the ref — a pending fade's onComplete must never resolve against an unmounted screen.
  useEffect(
    () => () => {
      stopBootRef.current?.();
      stopBootRef.current = null;
      killTimeline(OFF_SCREEN_FADE_TIMELINE);
      deleteRef(OFF_SCREEN_REF_KEY);
    },
    [],
  );

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
  // The theme the Loading row shows: the pick's own after a save or preset pick, the loaded world's for Current.
  const shownTheme: ThemeId = 'identity' in pick ? pick.identity.theme : loadedTheme;
  // The Melody row's set (Task 31), by the same rule.
  const shownMelody: readonly AspectPick[] =
    ('identity' in pick ? pick.identity.aspects.melody : loadedAspects.melody) ?? NO_PICKS;
  // The described aspect: the one toggled on last while it is still on, else the last of the set in canonical order,
  // else (the as-theme member alone, or nothing) the as-theme member itself, whose sentence says so.
  const shownMelodyAspects = shownMelody.filter((p): p is AspectId => p !== THEME_PICK);
  const describedMelody: AspectPick =
    (lastMelodyOn && shownMelodyAspects.includes(lastMelodyOn)
      ? lastMelodyOn
      : shownMelodyAspects[shownMelodyAspects.length - 1]) ?? THEME_PICK;

  // A Melody change (Task 31): the set, canonical, through retransmitWorld — the deal re-runs over the same seed and
  // plot — so the world row drops back to Current; the loaded save stays attached and dirty is read again, as for a
  // theme pick. The aspect toggled on, if one was, becomes the described one.
  const onMelodyChange = useCallback(
    (picks: string[]) => {
      const next = canonicalPicks('melody', picks as AspectPick[]);
      const turnedOn = next.find((p): p is AspectId => p !== THEME_PICK && !shownMelody.includes(p));
      if (turnedOn) setLastMelodyOn(turnedOn);
      retransmitWorld({ aspects: { melody: next } });
      setPick(CURRENT_PICK);
      setDirty(isWorldDirty());
    },
    [shownMelody],
  );

  return (
    <div className="off-screen" ref={rootRef} onPointerDown={skipOffScreenBoot}>
      <div className="off-screen__veil" aria-hidden="true" />
      {/* The boot theatre's dark layer: opaque over everything at first paint, faded and hidden by the timeline. */}
      <div className="off-screen__dark" ref={darkRef} aria-hidden="true" />
      {/* The column (docs/tasks/OFF_SCREEN_REVISIONS.md Task 2): it scrolls on the phone, so the veil and the dark
          layer — the root's own children — stay put over the whole glass while it moves under them. */}
      <div className="off-screen__scroll">
        <div className="off-screen__etch">
          <h2 className="off-screen__label">{LABEL.humanLabel}</h2>
          {LABEL.loreLabel && <p className="off-screen__lore">{LABEL.loreLabel}</p>}
          <p className="off-screen__hint">{POWER_HINT}</p>
        </div>
        {heardWorld && (
          <div className="off-screen__picker">
            {/* The two axes (Task 30): Transmission — which world — then Loading — how it loads. */}
            <div className="off-screen__axes">
              <div className="off-screen__axis">
                <RadioButton schema={schema} value={pick.value} onChange={onChange} />
                <div className="off-screen__actions">
                  <Button schema={ROLL_SCHEMA} face="single" onClick={onRoll} />
                  <Button schema={KEEP_SCHEMA} face="single" onClick={onKeep} disabled={!dirty} />
                </div>
              </div>
              <div className="off-screen__axis">
                <RadioButton schema={THEME_SCHEMA} value={shownTheme} onChange={onThemeChange} />
                <p className="off-screen__description off-screen__description--theme">{themeDescription(shownTheme)}</p>
                <RadioButton schema={MELODY_SCHEMA} value={shownMelody} onChange={onMelodyChange} />
                <p className="off-screen__description off-screen__description--melody">
                  {aspectDescription('melody', describedMelody)}
                </p>
              </div>
            </div>
            <p className="off-screen__readout" role="status" aria-label={READOUT_LABEL} data-testid="off-screen-readout">
              {readout}
            </p>
            {dirty && <p className="off-screen__warning">{UNSAVED_WARNING}</p>}
          </div>
        )}
        <p className="off-screen__footer">{FOOTER}</p>
      </div>
    </div>
  );
}
