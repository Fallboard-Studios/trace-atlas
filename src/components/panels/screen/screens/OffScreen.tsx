import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { Button } from '@/components/ui/controls/Button';
import { TRANSMISSION_PRESETS, presetPayload } from '@/data/transmissionPresets';
import { loadingOf } from '@/data/bands/loadingIdentity';
import { THEME_IDS, isThemeId, type ThemeId } from '@/data/bands/themes';
import { ASPECT_FAMILY_IDS, canonicalPicks, pickOrderOf, type AspectFamilyId, type AspectId } from '@/data/bands/aspects';
import { applySessionPayload } from '@/utils/sessionDiff';
import { retransmitWorld, rollWorld } from '@/systems/worldTransition';
import { requestWorldChange } from '@/systems/worldChange';
import { useSessionStore, isWorldDirty } from '@/stores/sessionStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useLoadingStore } from '@/stores/loadingStore';
import { listSessions, loadSession } from '@/utils/sessionStorageEngine';
import { hasHeardWorld } from '@/utils/deviceFlags';
import { formatSessionTimestamp } from '@/utils/helpers';
import { describeWorld } from '@/utils/describeWorld';
import { aspectDescription, aspectName, familyLabels, themeDescription, themeName } from '@/utils/loadingNames';
import { setRef, deleteRef } from '@/utils/refs';
import { killTimeline } from '@/animation/timelineMap';
import { OFF_SCREEN_FADE_TIMELINE, OFF_SCREEN_REF_KEY, skipOffScreenBoot, startOffScreenBoot } from '@/animation/offScreenTheatre';
import { fill, labels } from '@/content';
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

/** Roll and Keep (spec assumption 14), muted — nothing pops while the power is off. Roll rides on the Current row
 *  (docs/tasks/OFF_SCREEN_REVISIONS.md Task 4); Keep sits under the list. */
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

/** The family rows (Task 31's Melody row, made generic by docs/tasks/OFF_SCREEN_REVISIONS.md Task 9): per family in
 *  ASPECT_FAMILY_IDS, a multiple RadioButton labelled by the family — its options in canonical order (pickOrderOf), each
 *  on or off on its own, no "As theme" option (revisions Task 6: the row cleared is every robot as theme). The cabinet
 *  appearance (Crawford's note 5): the aspect boxes pop on hover and select, the only thing on this screen that does.
 *  Static: the names are content; a new family is a data change. */
const FAMILY_SCHEMAS = Object.fromEntries(
  ASPECT_FAMILY_IDS.map((family): [AspectFamilyId, RadioButtonSchema] => [
    family,
    {
      id: `off${family[0].toUpperCase()}${family.slice(1)}`,
      type: 'radio',
      ...familyLabels(family),
      multiple: true,
      options: pickOrderOf(family).map((id) => ({ value: id, humanLabel: aspectName(family, id) })),
    },
  ]),
) as Record<AspectFamilyId, RadioButtonSchema>;

/** A family row's value with no picks: one array, so the memoized row sees the same props each render. */
const NO_PICKS: readonly AspectId[] = [];

/** One family's row and the line under it (revisions Task 9). The row hands its family back with the list, so one
 *  stable handler in OffScreen serves every family. */
function AspectFamilyRow({
  family,
  value,
  described,
  onChange,
}: {
  family: AspectFamilyId;
  value: readonly AspectId[];
  described: AspectId | null;
  onChange: (family: AspectFamilyId, picks: string[]) => void;
}) {
  const onRowChange = useCallback((picks: string[]) => onChange(family, picks), [family, onChange]);
  return (
    <>
      <RadioButton schema={FAMILY_SCHEMAS[family]} value={value} onChange={onRowChange} />
      <p className={`off-screen__description off-screen__description--${family}`}>{aspectDescription(family, described)}</p>
    </>
  );
}

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
 * each with when it was saved, a divider, then the three presets, as a RadioButton in the `list` appearance — rows,
 * nothing coming off the plate while the power is off (docs/tasks/OFF_SCREEN_REVISIONS.md Task 4, Crawford's note 1)
 * — with a well naming the pick through the same helper.
 *
 * The gate (assumption 7) is read once on mount, as the saves are: a device that has never heard a world sees
 * the label and the hint only — the first flip writes the flag, so the chooser waits behind the first power-off.
 *
 * Picking a save or preset retransmits the faint world through applySessionPayload, the same path a Load does,
 * and never starts audio: only the power switch does (powerController). Current is the loaded world, so picking
 * it applies nothing. A save pick also names the session after the save, as loading it from the Sessions list
 * does, so a later Save overwrites it. A save that has since vanished from storage applies nothing and is not
 * claimed as the pick. Roll (assumption 14) is the action on the Current row — the list's trailing slot, beside the
 * radio and never inside it (revisions Task 4, Crawford's note 2): a fresh random world through rollWorld —
 * a retransmit, so the pick returns to Current and the row renames from the stores. Keep (assumption 14), labelled
 * "Save the last session" under the list, saves the
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
 * The family rows (Task 31's Melody row, one per family since docs/tasks/OFF_SCREEN_REVISIONS.md Task 9; assumptions
 * 17 and 21) sit under the theme row's line, in ASPECT_FAMILY_IDS order — Melody, Envelope, Distance: each a multiple
 * RadioButton in the cabinet appearance, the only thing on this screen that pops (Crawford's note 5; the theme row,
 * the list, Roll and Keep stay flat), its options in canonical order with no "As theme" (revisions Task 6), showing the
 * loaded world's picks for Current and the picked payload's after a save or preset pick, as the theme row does. A change
 * sends the whole loading, `retransmitWorld({ aspects })`, with the changed family's set canonical (an empty list when
 * its row is cleared — every robot as theme for that family) and every other family's carried as shown; the deal
 * re-runs over the same seed and plot, with the same drop to Current, the same attached save and the same dirty read as
 * a theme pick. Each row's description line names the aspect toggled on last in that family while it is still on, else
 * the last of its set in canonical order, else the family's own `none` sentence; a world pick resets every family's
 * toggle memory, so a save reads as its own sets. Roll touches no row: rollWorld leaves the loading store alone
 * (assumption 14).
 */
export function OffScreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const stopBootRef = useRef<(() => void) | null>(null);
  const [heardWorld] = useState(() => hasHeardWorld());
  const [saves, setSaves] = useState(sortedSaves);
  const [pick, setPick] = useState<TransmissionPick>(CURRENT_PICK);
  // Per family, the aspect toggled on most recently (Task 31, per family since revisions Task 9), for its row's
  // description line; emptied by a world pick.
  const [lastOn, setLastOn] = useState<Partial<Record<AspectFamilyId, AspectId>>>({});
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
      // The list (revisions Task 4, Crawford's note 1): rows, the saves carrying when they were saved.
      appearance: 'list',
      options: [
        { value: CURRENT_VALUE, humanLabel: currentLabel, loreLabel: CURRENT.humanLabel },
        ...saves.map((save) => ({
          value: SAVE_PREFIX + save.name,
          humanLabel: save.name,
          meta: fill('home.off.savedAt', { time: formatSessionTimestamp(save.savedAt) }),
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
      // Current is the loaded world already: no world change, so nothing waits. A world pick shows each set as that
      // world carries it: nothing toggled (Task 31).
      setLastOn({});
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
    const picked = payload;
    // The world change waits under the scene wash (docs/tasks/OFF_SCREEN_REVISIONS.md Task 13); the pick, the names and
    // the dirty read move with the world, after the change.
    requestWorldChange(() => {
      applySessionPayload(picked);
      const { setCurrentSessionName, setCurrentLoadedSessionName, detachLoadedSession } = useSessionStore.getState();
      if (value.startsWith(SAVE_PREFIX)) {
        setCurrentSessionName(name);
        setCurrentLoadedSessionName(name);
      } else {
        detachLoadedSession();
      }
      setLastOn({});
      setPick({
        value,
        name,
        identity: { attenuationStyleName: picked.attenuationStyleName, coordinates: picked.coordinates, ...loadingOf(picked) },
      });
      setDirty(isWorldDirty());
    });
  }, []);

  // A theme pick (Task 30): the loading alone moves — the same seed and plot, drawn again under the new bands — so the
  // world row drops back to Current. The loaded save stays attached (see the component note), and dirty is read again.
  // Under the scene wash, as every world change here (revisions Task 13).
  const onThemeChange = useCallback((value: string) => {
    if (!isThemeId(value)) return;
    requestWorldChange(() => {
      retransmitWorld({ theme: value });
      setPick(CURRENT_PICK);
      setDirty(isWorldDirty());
    });
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

  // Roll is the retransmit itself: the stores change under the Current row, which renames from them. Under the scene
  // wash (revisions Task 13).
  const onRoll = useCallback(() => {
    requestWorldChange(() => {
      rollWorld();
      useSessionStore.getState().detachLoadedSession();
      setPick(CURRENT_PICK);
      setDirty(isWorldDirty());
    });
  }, []);

  // Roll on the Current row (revisions Task 4, Crawford's note 2): the list's trailing slot, beside Current's radio and
  // never inside it, so a Roll is never a pick. Held in a callback so the memoized list keeps its props.
  const rollOnCurrent = useCallback(
    (value: string) => (value === CURRENT_VALUE ? <Button schema={ROLL_SCHEMA} face="single" onClick={onRoll} /> : null),
    [onRoll],
  );

  const onKeep = useCallback(() => {
    useSessionStore.getState().keepCurrentWorld();
    setSaves(sortedSaves());
    setDirty(isWorldDirty());
  }, []);

  const readout = 'identity' in pick ? describeWorld(pick.identity, pick.name) : currentLabel;
  // The theme the Loading row shows: the pick's own after a save or preset pick, the loaded world's for Current.
  const shownTheme: ThemeId = 'identity' in pick ? pick.identity.theme : loadedTheme;
  // The family rows' sets (Task 31; per family since revisions Task 9), by the same rule.
  const shownAspects = 'identity' in pick ? pick.identity.aspects : loadedAspects;
  const shownOf = (family: AspectFamilyId): readonly AspectId[] => shownAspects[family] ?? NO_PICKS;
  // A family's described aspect: the one toggled on last while it is still on, else the last of its set in canonical
  // order, else none — the row cleared, whose own sentence says every probe takes that family from the theme.
  const describedOf = (family: AspectFamilyId): AspectId | null => {
    const shown = shownOf(family);
    const last = lastOn[family];
    return (last && shown.includes(last) ? last : shown[shown.length - 1]) ?? null;
  };

  // A family change (Task 31; per family since revisions Task 9): the whole loading through retransmitWorld, this family's
  // set replaced, canonical, and every other family's carried as shown — retransmitWorld replaces the aspects whole — so
  // the deal re-runs over the same seed and plot; the world row drops back to Current, the loaded save stays attached and
  // dirty is read again, as for a theme pick. The aspect toggled on, if one was, becomes the family's described one. Under
  // the scene wash, the row and its line moving with the world (revisions Task 13).
  const onFamilyChange = useCallback(
    (family: AspectFamilyId, picks: string[]) => {
      const next = canonicalPicks(family, picks as AspectId[]);
      const shown = shownAspects[family] ?? NO_PICKS;
      const turnedOn = next.find((p) => !shown.includes(p));
      requestWorldChange(() => {
        retransmitWorld({ aspects: { ...shownAspects, [family]: next } });
        if (turnedOn) setLastOn((prev) => ({ ...prev, [family]: turnedOn }));
        setPick(CURRENT_PICK);
        setDirty(isWorldDirty());
      });
    },
    [shownAspects],
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
                <RadioButton schema={schema} value={pick.value} onChange={onChange} trailing={rollOnCurrent} />
                <div className="off-screen__actions">
                  <Button schema={KEEP_SCHEMA} face="single" onClick={onKeep} disabled={!dirty} />
                </div>
              </div>
              <div className="off-screen__axis">
                <RadioButton schema={THEME_SCHEMA} value={shownTheme} onChange={onThemeChange} />
                <p className="off-screen__description off-screen__description--theme">{themeDescription(shownTheme)}</p>
                {/* The family rows (revisions Task 9): one per family, from the data. */}
                {ASPECT_FAMILY_IDS.map((family) => (
                  <AspectFamilyRow
                    key={family}
                    family={family}
                    value={shownOf(family)}
                    described={describedOf(family)}
                    onChange={onFamilyChange}
                  />
                ))}
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
