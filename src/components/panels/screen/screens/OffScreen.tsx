import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { Button } from '@/components/ui/controls/Button';
import { TRANSMISSION_PRESETS, presetPayload } from '@/data/transmissionPresets';
import { loadingOf, type LoadingIdentity } from '@/data/bands/loadingIdentity';
import { THEME_IDS, isThemeId, type ThemeId } from '@/data/bands/themes';
import {
  ASPECT_FAMILY_IDS,
  canonicalAspects,
  canonicalPicks,
  pickOrderOf,
  type AspectFamilyId,
  type AspectId,
  type FamilyAspects,
  type FamilyPicks,
} from '@/data/bands/aspects';
import { applySessionPayload } from '@/utils/sessionDiff';
import { deepEqual } from '@/utils/math';
import { retransmitWorld, rollWorld, type RetransmitInput } from '@/systems/worldTransition';
import { cancelWorldChange, requestWorldChange } from '@/systems/worldChange';
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
const KEEP_FAILED = labels('home.off.keepFailed').humanLabel;
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
 * A world change waiting under the scene wash, as the clicks since have shaped it (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md
 * R3). The world part is at most one of a save or preset to apply and a Roll, the last world click winning; then the
 * loading the world should end under, and the row the list shows. `from` is the loading shown at the first of these
 * clicks: what a Roll, or a change with no world part, leaves loaded before the intended loading is laid over it. Runtime
 * only, like the change itself (worldChange.ts keeps the closure).
 */
interface Intent {
  world: { value: string; name: string; payload: SessionPayload } | null;
  roll: boolean;
  pick: TransmissionPick;
  theme: ThemeId;
  aspects: FamilyPicks;
  from: LoadingIdentity;
}

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
 * "Save Last World" under the list (review R20), saves the
 * loaded world through sessionStore.keepCurrentWorld — no name field — and the new row appears at once; it dims
 * (the dim-controls rule) whenever the loaded world equals its save, and a muted warning line sits under the
 * chooser only while it does not. A Keep the storage refuses shows its failure line in that warning's place until a
 * Keep succeeds or the world changes (R20). Dirty is read on mount, after a pick, after a Roll and after a Keep — never per
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
 * its row is cleared — every robot as theme for that family) and every other family's carried as shown; the live roster
 * is re-dealt in place, at the click and under no wash (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33: an aspect is no
 * world change), with the same drop to Current, the same attached save and the same dirty read as a theme pick. Each
 * row's description line names the aspect toggled on last in that family while it is still on, else
 * the last of its set in canonical order, else the family's own `none` sentence; a world pick resets every family's
 * toggle memory, so a save reads as its own sets. Roll touches no row: rollWorld leaves the loading store alone
 * (assumption 14).
 *
 * While a world change waits under the wash, every click joins it (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R3). The
 * screen keeps the clicks' intent (Intent, above), and the one request realises all of it at the cover: the world part,
 * then the loading where it differs from the one the world part leaves. The rows, the description lines and the readout
 * draw from the intent, so a click shows at once. A family toggle made then joins the intent instead of re-dealing a
 * world about to go; picking Current cancels the change (worldChange.ts's cancelWorldChange); Keep dims until it has
 * run, since it would save the world the rows no longer show.
 */
export function OffScreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const stopBootRef = useRef<(() => void) | null>(null);
  const [heardWorld] = useState(() => hasHeardWorld());
  const [saves, setSaves] = useState(sortedSaves);
  const [pick, setPick] = useState<TransmissionPick>(CURRENT_PICK);
  // The change waiting for the cover, as the clicks since have shaped it (R3). The ref is what realise reads when the
  // cover lands; the state is what the rows draw from until then. Set together, and cleared once the change has run or
  // been cancelled.
  const intentRef = useRef<Intent | null>(null);
  const [intent, setIntentState] = useState<Intent | null>(null);
  const setIntent = useCallback((next: Intent | null) => {
    intentRef.current = next;
    setIntentState(next);
  }, []);
  // Per family, the aspect toggled on most recently (Task 31, per family since revisions Task 9), for its row's
  // description line; emptied by a world pick.
  const [lastOn, setLastOn] = useState<FamilyAspects>({});
  // Only the chooser reads it; a first visit (hint only) never builds the payload.
  const [dirty, setDirty] = useState(() => heardWorld && isWorldDirty());
  // The last Keep was refused by the storage (R20): its line shows until a Keep succeeds or the world changes.
  const [keepFailed, setKeepFailed] = useState(false);

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
  const liveWorld = { attenuationStyleName: currentAttenuationStyle?.name ?? '', coordinates: coordinates ?? { x: 0, y: 0 } };
  const currentLabel = describeWorld({ ...liveWorld, theme: loadedTheme, aspects: loadedAspects }, loadedSessionName ?? undefined);

  // What the rows show: a waiting change's intent while there is one (R3), so a click shows at once; else the picked
  // save's or preset's own payload after a pick, and the loaded world's for Current.
  const shownPick = intent?.pick ?? pick;
  // The theme the Loading row shows.
  const shownTheme: ThemeId = intent?.theme ?? ('identity' in pick ? pick.identity.theme : loadedTheme);
  // The family rows' sets (Task 31; per family since revisions Task 9), by the same rule.
  const shownAspects = intent?.aspects ?? ('identity' in pick ? pick.identity.aspects : loadedAspects);
  // The readout names the shown pick. For Current with a change waiting, it names the world that change leaves, as far
  // as it is known: a pick's world under the intended loading, or the loaded world's (a Roll's is drawn only as it runs).
  const readout =
    'identity' in shownPick
      ? describeWorld(shownPick.identity, shownPick.name)
      : intent
        ? describeWorld(
            {
              ...(intent.world
                ? { attenuationStyleName: intent.world.payload.attenuationStyleName, coordinates: intent.world.payload.coordinates }
                : liveWorld),
              theme: intent.theme,
              aspects: intent.aspects,
            },
            intent.world
              ? intent.world.value.startsWith(SAVE_PREFIX) ? intent.world.name : undefined
              : intent.roll ? undefined : (loadedSessionName ?? undefined),
          )
        : currentLabel;

  // The waiting change, realised once the cover has landed, or at once with no wash (R3): the world part - the pick's
  // payload and names, or the Roll - then the intended loading where it differs from the one the world part leaves, then
  // the row and the dirty read. It reads the ref, so every click made while it waited is in it. It runs only as the
  // pending change, and picking Current cancels that change along with its intent, so the intent is always set here.
  const realise = useCallback(() => {
    const intended = intentRef.current!;
    setIntent(null);
    let left = intended.from;
    if (intended.world) {
      const { value, name, payload } = intended.world;
      applySessionPayload(payload);
      const { setCurrentSessionName, setCurrentLoadedSessionName, detachLoadedSession } = useSessionStore.getState();
      if (value.startsWith(SAVE_PREFIX)) {
        setCurrentSessionName(name);
        setCurrentLoadedSessionName(name);
      } else {
        detachLoadedSession();
      }
      left = loadingOf(payload);
    } else if (intended.roll) {
      rollWorld();
      useSessionStore.getState().detachLoadedSession();
    }
    const loading: RetransmitInput = {};
    if (intended.theme !== left.theme) loading.theme = intended.theme;
    if (!deepEqual(canonicalAspects(intended.aspects), canonicalAspects(left.aspects))) loading.aspects = intended.aspects;
    if (loading.theme !== undefined || loading.aspects !== undefined) retransmitWorld(loading);
    setPick(intended.pick);
    setDirty(isWorldDirty());
    setKeepFailed(false);
  }, [setIntent]);

  /** The intent a click builds on: the waiting one, or a fresh one from what the rows show now. */
  const nextIntent = useCallback(
    (): Intent =>
      intentRef.current ?? {
        world: null,
        roll: false,
        pick,
        theme: shownTheme,
        aspects: shownAspects,
        from: { theme: shownTheme, aspects: shownAspects },
      },
    [pick, shownTheme, shownAspects],
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
      // Current is the loaded world already: no world change, so nothing waits. Picked while a save or preset waits
      // under the wash (the row shows the click, so Current can be picked again), it cancels that change: the cover still
      // lands and lifts, and nothing runs (R3). A world pick shows each set as that world carries it: nothing toggled
      // (Task 31).
      if (intentRef.current) {
        cancelWorldChange();
        setIntent(null);
      }
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
    // The world change waits under the scene wash (docs/tasks/OFF_SCREEN_REVISIONS.md Task 13), the pick showing at the
    // click (R3); the payload, the names, the row and the dirty read land with the cover. The pick's own loading
    // replaces any loading clicked before it, as applying it would.
    const loading = loadingOf(payload);
    setIntent({
      ...nextIntent(),
      world: { value, name, payload },
      roll: false,
      pick: { value, name, identity: { attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates, ...loading } },
      theme: loading.theme,
      aspects: loading.aspects,
    });
    setLastOn({});
    requestWorldChange(realise);
  }, [nextIntent, realise, setIntent]);

  // A theme pick (Task 30): the loading alone moves — the same seed and plot, drawn again under the new bands — so the
  // world row drops back to Current. The loaded save stays attached (see the component note), and dirty is read again.
  // Under the scene wash, as every world change here (revisions Task 13), joining a change already waiting (R3).
  const onThemeChange = useCallback(
    (value: string) => {
      if (!isThemeId(value)) return;
      setIntent({ ...nextIntent(), theme: value, pick: CURRENT_PICK });
      requestWorldChange(realise);
    },
    [nextIntent, realise, setIntent],
  );

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
  // wash (revisions Task 13). A Roll replaces a waiting pick, the last world click winning, and keeps the waiting loading,
  // laid over the rolled world once it is drawn (R3).
  const onRoll = useCallback(() => {
    setIntent({ ...nextIntent(), world: null, roll: true, pick: CURRENT_PICK });
    requestWorldChange(realise);
  }, [nextIntent, realise, setIntent]);

  // Roll on the Current row (revisions Task 4, Crawford's note 2): the list's trailing slot, beside Current's radio and
  // never inside it, so a Roll is never a pick. Held in a callback so the memoized list keeps its props.
  const rollOnCurrent = useCallback(
    (value: string) => (value === CURRENT_VALUE ? <Button schema={ROLL_SCHEMA} face="single" onClick={onRoll} /> : null),
    [onRoll],
  );

  const onKeep = useCallback(() => {
    // A save the storage refuses (a full quota) is a line in the warning's place, never a throw into the click (R20).
    try {
      useSessionStore.getState().keepCurrentWorld();
    } catch (err) {
      console.error('[OffScreen] Keep could not save', err);
      setKeepFailed(true);
      return;
    }
    setKeepFailed(false);
    setSaves(sortedSaves());
    setDirty(isWorldDirty());
  }, []);

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
  // the deal moves over the live roster; the world row drops back to Current, the loaded save stays attached and dirty is
  // read again, as for a theme pick. The aspect toggled on, if one was, becomes the family's described one. Not under
  // the scene wash: picks alone rebuild nothing, so the change applies at the click and a quick second toggle builds on
  // the first (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33). With a world change waiting, the toggle joins its intent
  // instead of re-dealing a world about to go (R3).
  const onFamilyChange = useCallback(
    (family: AspectFamilyId, picks: string[]) => {
      const next = canonicalPicks(family, picks);
      const shown = shownAspects[family] ?? NO_PICKS;
      const turnedOn = next.find((p) => !shown.includes(p));
      if (turnedOn) setLastOn((prev) => ({ ...prev, [family]: turnedOn }));
      const waiting = intentRef.current;
      if (waiting) {
        setIntent({ ...waiting, aspects: { ...waiting.aspects, [family]: next }, pick: CURRENT_PICK });
        return;
      }
      retransmitWorld({ aspects: { ...shownAspects, [family]: next } });
      setPick(CURRENT_PICK);
      setDirty(isWorldDirty());
      setKeepFailed(false);
    },
    [shownAspects, setIntent],
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
                <RadioButton schema={schema} value={shownPick.value} onChange={onChange} trailing={rollOnCurrent} />
                <div className="off-screen__actions">
                  <Button schema={KEEP_SCHEMA} face="single" onClick={onKeep} disabled={!dirty || intent !== null} />
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
            {keepFailed ? (
              <p className="off-screen__warning" role="alert">
                {KEEP_FAILED}
              </p>
            ) : (
              dirty && <p className="off-screen__warning">{UNSAVED_WARNING}</p>
            )}
          </div>
        )}
        <p className="off-screen__footer">{FOOTER}</p>
      </div>
    </div>
  );
}
