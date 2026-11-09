import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useGSAP } from '@gsap/react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Disclosure } from './Disclosure';
import { TransmissionEditor, type EditorIdentity } from './TransmissionEditor';
import { actionRow, type ActionRowKind } from './offScreenActions';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { Button } from '@/components/ui/controls/Button';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { TextInput } from '@/components/ui/controls/TextInput';
import { useShareStatus } from '@/components/panels/screen/console/useShareStatus';
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
import { applySessionPayload, buildSessionPayload } from '@/utils/sessionDiff';
import { deepEqual } from '@/utils/math';
import { retransmitWorld, type RetransmitInput } from '@/systems/worldTransition';
import { cancelWorldChange, requestWorldChange } from '@/systems/worldChange';
import { getWorldState } from '@/systems/worldState';
import { useSessionStore, isPayloadDirty, isWorldDirty } from '@/stores/sessionStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useLoadingStore } from '@/stores/loadingStore';
import { deleteNamedSession, listSessions, loadSession, renameNamedSession } from '@/utils/sessionStorageEngine';
import { hasHeardWorld } from '@/utils/deviceFlags';
import { formatSessionTimestamp, getScreenViewportDomNode } from '@/utils/helpers';
import { CLEAR_STORAGE_SCHEMA } from '@/data/sessionConfig';
import { generateRandomAttenuationStyleName, randomCoordinate } from '@/utils/seedUtils';
import { describeLoading, describeWorld, withTail } from '@/utils/describeWorld';
import { aspectDescription, aspectName, familyLabels, themeDescription, themeName } from '@/utils/loadingNames';
import { setRef, deleteRef } from '@/utils/refs';
import { killTimeline } from '@/animation/timelineMap';
import {
  OFF_SCREEN_FADE_TIMELINE,
  OFF_SCREEN_REF_KEY,
  fadeInOffScreen,
  skipOffScreenBoot,
  startOffScreenBoot,
} from '@/animation/offScreenTheatre';
import { fill, labels } from '@/content';
import type { ButtonSchema, RadioButtonSchema, TextInputSchema } from '@/types/controls';
import type { SessionPayload } from '@/types/session';
import type { WorldIdentity } from '@/utils/seedBaseline';
import './OffScreen.css';

// ========================================
// CONSTANTS
// ========================================

// Option values carry their source, so a save named Current or New Transmission never collides with either. (The
// presets, a third source, went at docs/tasks/OFF_SCREEN_CONSOLE.md's Checkpoint A; Crawford may bring them back.)
const NEW_VALUE = 'new';
const CURRENT_VALUE = 'current';
const SAVE_PREFIX = 'save:';

const LABEL = labels('home.off.label');
const POWER_HINT = labels('home.off.powerHint').humanLabel;
const TRANSMISSION = labels('home.off.transmission');
const CURRENT = labels('home.off.current');
const NEW_TRANSMISSION = labels('home.off.newTransmission').humanLabel;
// The list's title over the saves, and the title over the aspect family rows with its hint (Task 6c).
const SAVED_TITLE = labels('home.off.savedTransmissions').humanLabel;
const ASPECTS_TITLE = labels('home.off.aspects').humanLabel;
const ASPECTS_HINT = labels('home.off.aspectsHint').humanLabel;
const READOUT_LABEL = labels('home.off.readout').humanLabel;

/** The action row under the list (docs/specs/OFF_SCREEN_CONSOLE.md §1.5): Save, Rename and Delete, muted — flat, like the
 *  theme row and the list; only the aspect rows pop (Crawford's note 5). Each acts on the selected row and is named after
 *  it through its template. Scan is the New Transmission editor's (TransmissionEditor.tsx). */
const SAVE_SCHEMA: ButtonSchema = { id: 'offSave', type: 'button', ...labels('home.off.save'), appearance: 'muted' };
const RENAME_SCHEMA: ButtonSchema = { id: 'offRename', type: 'button', ...labels('home.off.rename'), appearance: 'muted' };
const DELETE_SCHEMA: ButtonSchema = { id: 'offDelete', type: 'button', ...labels('home.off.delete'), appearance: 'muted' };
/** Rename's inline input (spec §1.5), in the selected save's row: the save's name, as long as the Sessions panel's name
 *  field allows. */
const RENAME_INPUT_SCHEMA: TextInputSchema = {
  id: 'offRenameInput',
  type: 'textInput',
  ...labels('home.off.rename'),
  maxLength: 128,
};
/** Rename refused: another save has the typed name (spec assumption 3). */
const RENAME_TAKEN = labels('home.off.renameTaken').humanLabel;
/** Share (docs/specs/OFF_SCREEN_CONSOLE.md §1.6), last in the action row since the presets went at Checkpoint A (beside
 *  the readout, then under it, before), muted like the rest of it, and the two lines its copy writes into the status slot, read from the Sessions panel's
 *  content. */
const SHARE_SCHEMA: ButtonSchema = { id: 'offShare', type: 'button', ...labels('home.off.share'), appearance: 'muted' };
const LINK_COPIED = labels('session.status.linkCopied').humanLabel;
const COPY_FAILED = labels('session.status.copyFailed').humanLabel;
/** Current's eyebrow while no save matches it (docs/specs/OFF_SCREEN_CONSOLE.md §1.3): what the standing warning said. */
const UNSAVED_EYEBROW = labels('home.off.unsavedEyebrow').humanLabel;
const FOOTER = labels('home.off.footer').humanLabel;

/** The Transmissions section's header (docs/specs/OFF_SCREEN_CONSOLE.md §1.4): its face is a fill of its template, so
 *  the schema carries the id alone; Disclosure makes it muted. */
const TRANSMISSIONS_SCHEMA: ButtonSchema = { id: 'offTransmissions', type: 'button' };

/** Factory Reset (spec §1.4): under its label row, behind SessionsPanel's confirm, read from the same content. At the
 *  foot of the Transmissions section, with the saves it deletes (Checkpoint A: the Device section it had is gone). */
const RESET_LABELS = labels('session.clearStorage');
const RESET_CONFIRM_TITLE = labels('session.clearStorage.confirmTitle').humanLabel;
const RESET_CONFIRM_BODY = labels('session.clearStorage.confirmBody').humanLabel;
const CANCEL = labels('ui.cancel').humanLabel;
/** Delete's confirm (Checkpoint A): the Sessions list's delete confirm, read from the same content. */
const DELETE_CONFIRM_BODY = labels('session.delete.confirmBody').humanLabel;
const DELETE = labels('home.off.delete').humanLabel;

/** The Loading axis's theme row (docs/tasks/OFF_SCREEN.md Task 30; spec assumption 17): the five ids in THEME_IDS
 *  order under the Loading heading — the row's own label, as Transmission is the world row's — muted like it. Static:
 *  the names are content. */
const THEME_SCHEMA: RadioButtonSchema = {
  id: 'offTheme',
  type: 'radio',
  ...labels('home.off.loading'),
  // "select one" under "Trace Type" (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6c).
  hint: labels('home.off.loadingHint').humanLabel,
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

/** Rename's input (docs/specs/OFF_SCREEN_CONSOLE.md §1.5), in RadioButton's trailing slot on the save's row: prefilled,
 *  focused and selected on mount. Enter commits, Escape cancels (null), and a blur out of it commits, caught on the
 *  wrapper as the New Transmission editor catches its own (TextInput takes no key or blur props, and both bubble). It
 *  reports once: the input unmounting after a commit is no second one. */
function RenameField({ name, onDone }: { name: string; onDone: (from: string, to: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const finish = (to: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name, to);
  };
  useEffect(() => {
    const input = ref.current?.querySelector('input');
    input?.focus();
    input?.select();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') finish(draft);
    else if (e.key === 'Escape') finish(null);
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) finish(draft);
  };
  return (
    <div className="off-screen__rename" ref={ref} onKeyDown={onKeyDown} onBlur={onBlur}>
      {/* Bare in the row: no cabinet box of its own (Crawford, Checkpoint A). */}
      <TextInput schema={RENAME_INPUT_SCHEMA} value={draft} onChange={setDraft} facade={false} />
    </div>
  );
}

/** The saves, newest first, as SessionsPanel lists them. */
const sortedSaves = () => listSessions().sort((a, b) => b.savedAt - a.savedAt);

/** What a pick is: Current — the loaded world, described live from the stores — or a save / New Transmission, described from its own world under its name (none for New Transmission), so the well names what was
 *  picked even before the world has rebuilt. The identity is whole (Task 30): the payload's loading, read leniently by
 *  loadingOf, or New Transmission's Classic with no aspects, is the row's own, which its tail is read against. New
 *  Transmission is the editor's pick (docs/specs/OFF_SCREEN_CONSOLE.md §1.2): no row carries its value. */
type TransmissionPick =
  | { value: typeof CURRENT_VALUE }
  | { value: string; name: string; identity: WorldIdentity };

const CURRENT_PICK: TransmissionPick = { value: CURRENT_VALUE };

/** A world's seed and plot alone, what the New Transmission editor shows. */
const seedAndPlotOf = ({ attenuationStyleName, coordinates }: EditorIdentity): EditorIdentity => ({
  attenuationStyleName,
  coordinates,
});

/** The loading New Transmission's world lands under (spec §1.1): Classic, every robot as theme. */
const NEW_LOADING: LoadingIdentity = { theme: 'classic', aspects: {} };

/** A payload's whole identity: its seed, its plot and its loading, read leniently by loadingOf. */
const identityOf = (payload: SessionPayload): WorldIdentity => ({
  attenuationStyleName: payload.attenuationStyleName,
  coordinates: payload.coordinates,
  ...loadingOf(payload),
});

/** The world the listener powered off on, kept from the moment they leave it (a save or New Transmission pick,
 *  or a Scan) until it is live again (Current picked). Runtime only: component state, never a store, a save or the link
 *  (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.2). */
interface CurrentSnapshot {
  /** buildSessionPayload() at the moment of leaving. */
  payload: SessionPayload;
  /** The loaded save's name at that moment. */
  loadedName: string | null;
  /** Has a world change landed since it was taken? Until one has, picking Current cancels rather than restores. */
  landed: boolean;
}

/** The status slot's one line (docs/specs/OFF_SCREEN_CONSOLE.md §1.6): a refused Save, naming the save it tried, a
 *  refused Rename, or a Share — whose words are useShareStatus's live status, so the hook's dismiss empties the slot. */
type SlotLine = { kind: 'saveFailed'; name: string } | { kind: 'renameTaken' } | { kind: 'share' };

/** The two dirty reads (docs/specs/OFF_SCREEN_CONSOLE.md §1.5). `current`: is Current unsaved? It describes Current — its
 *  snapshot while there is one, else the live world (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.4) — and
 *  sets Current's eyebrow. `live`: does the live world differ from its loaded save? It dims Save, which writes the live
 *  world: over the selected save, or Current's (Current is selected only with no snapshot). The same read while there is
 *  no snapshot. */
interface DirtyReads {
  current: boolean;
  live: boolean;
}

const CLEAN: DirtyReads = { current: false, live: false };

const readDirty = (snapshot: CurrentSnapshot | null): DirtyReads => {
  const live = isWorldDirty();
  return { current: snapshot ? isPayloadDirty(snapshot.payload, snapshot.loadedName) : live, live };
};

/**
 * A world change waiting under the scene wash, as the clicks since have shaped it (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md
 * R3). The world part is one of a save to apply, New Transmission's world (a Scan's draw), or Current's
 * snapshot to restore, the last world click winning (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.5); then
 * the loading the world should end under, and the row the list shows. Runtime only, like the change itself
 * (worldChange.ts keeps the closure).
 */
interface Intent {
  world:
    | { kind: 'payload'; name: string; payload: SessionPayload }
    | ({ kind: 'new' } & EditorIdentity)
    | { kind: 'current'; snapshot: CurrentSnapshot };
  pick: TransmissionPick;
  theme: ThemeId;
  aspects: FamilyPicks;
}

/**
 * The powered-off screen (docs/specs/LAYOUT_REWORK.md §1.9; docs/specs/OFF_SCREEN.md §1.1, assumptions 7 and 8):
 * the etched label and the power hint over the dimmed, still world (WorldView stays mounted behind it —
 * ScreenViewport), and — once this device has heard a world — the Transmission row: Current (the world the listener
 * powered off on), then the user's saves newest first under "Saved Transmissions", each with when it was saved (the
 * three presets that followed went at docs/tasks/OFF_SCREEN_CONSOLE.md's Checkpoint A), as a RadioButton in the `list`
 * appearance — rows, nothing coming off the plate while the power is off (docs/tasks/OFF_SCREEN_REVISIONS.md Task 4, Crawford's note 1) — every row
 * naming its world through describeWorld (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Tasks 6b and 6c), with a
 * well naming the pick through the same helper.
 *
 * The New Transmission editor (docs/specs/OFF_SCREEN_CONSOLE.md §1.2; TransmissionEditor.tsx) sits over the list in
 * place of the row that held a world drawn on mount: it shows the live world's seed and plot, or a waiting change's, and
 * draws nothing on mount (assumption 1). A commit — Enter, or a blur out of it — of a draft that differs is a New
 * Transmission pick of the typed world; Scan, in its title row, draws one and picks it the same way. No row carries New
 * Transmission, so while it is the shown pick no row is checked and the editor wears the selected state.
 *
 * The Transmissions section (docs/specs/OFF_SCREEN_CONSOLE.md §1.4): the list and its action row sit in a Disclosure that starts
 * collapsed on every mount — component state, never persisted — under a header naming the shown row (New Transmission,
 * Current, or the save's name) and the count of saves, read every render. At the
 * section's foot, with the saves it deletes, Factory Reset behind SessionsPanel's confirm, portalled into the screen
 * (it had a Device section of its own until Checkpoint A: nothing else was ever going in it). Confirmed, it clears all of localStorage and detaches the loaded save, and the gate is read again, so the
 * chooser gives way to the first-visit view at once (assumption 4).
 *
 * The gate (assumption 7) is read once on mount, as the saves are: a device that has never heard a world sees
 * the label and the hint only — the first flip writes the flag, so the chooser waits behind the first power-off.
 *
 * Picking a save retransmits the faint world through applySessionPayload, the same path a Load does,
 * and never starts audio: only the power switch does (powerController). A save pick also names the session after the
 * save, as loading it from the Sessions list does, so a later Save overwrites it. A save that has since vanished from
 * storage applies nothing and is not claimed as the pick. Scan draws a world and picks it as New Transmission, from any
 * row, landing it under Classic with no aspects (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.1). A Scan
 * or an editor commit detaches the loaded save (sessionStore.detachLoadedSession): that world is no longer the save.
 *
 * Current is an anchor (spec §1.2): the first pick that leaves it takes a snapshot (CurrentSnapshot, above: the payload
 * and the loaded save's name, runtime only), and Current is named from the snapshot while there is one, so no pick
 * renames it; with none, it is the live world. Picking Current before the change that left it has landed cancels that
 * change (worldChange.ts's cancelWorldChange) and drops the snapshot, so the paused world stands; after another world
 * has landed, it restores the snapshot under the wash through applySessionPayload, re-attaches its save (or detaches),
 * and drops it. Re-clicking the selected row does nothing. A theme or aspect click keeps the selected row; on a row
 * other than Current, the row's label names the live loading in place of its own until the row is left (§1.3).
 *
 * The action row under the list (docs/specs/OFF_SCREEN_CONSOLE.md §1.5; Keep's place, review R20): Save, Rename and
 * Delete, each acting on the selected row and named after it, an inert one dimmed in place by the pure matrix in
 * offScreenActions.ts, all three while a change waits. Save writes the live world through sessionStore.keepCurrentWorld —
 * no name field — and the new row appears at once: on Current, under its loaded save's name or a fresh one, lit while
 * Current is unsaved; on a save, over that save, lit while the live world differs from it; on New Transmission,
 * under a fresh name, always lit, and the selection moves to the new row. Current's eyebrow reads
 * "Current · unsaved" only while no save matches Current (DirtyReads, above; spec §1.3; the standing warning line it
 * replaced is gone). A Save the storage refuses shows its failure line, naming the save it tried, in the status slot
 * under the readout until a Save succeeds or the world changes (R20, spec §1.6). Rename puts an input in the selected
 * save's trailing slot (RenameField, above): its commit re-keys the save, and the loaded name and Current's snapshot
 * name follow; a taken name is refused in the same slot, one line at a time. Delete removes the selected save at once,
 * no confirm and no world change, and the selection falls to New Transmission holding the live world (onDelete). Dirty is read on mount, after a landed
 * change, after an in-place edit and after a Save — never per render (it builds the live payload). The veil
 * (assumption 18) is the screen's own backdrop — the
 * blur and dim over the still world, under everything else here — and the lore footer is the last thing in the
 * column in both gate states. The column is the root's third child, `.off-screen__scroll`, after the veil and the
 * dark layer (docs/tasks/OFF_SCREEN_REVISIONS.md Task 2): it is what scrolls on the phone, so the veil stays put.
 *
 * The boot theatre (assumption 18, animation/offScreenTheatre.ts): on mount the dark layer over the content holds
 * for half a second, then flickers off — a 'ui' timeline in timelineMap, so it runs over the paused world; a tap
 * anywhere on the screen skips it, reduced motion skips it outright, and the rocker outside the screen works
 * throughout. That is a fresh page's: after a power-off (the world 'paused') the screen fades in over the world just
 * frozen instead, the reverse of the power-on fade (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F6). The screen registers its root under the off-screen ref so powerController's power-on can await
 * fadeOffScreen() — the screen and its veil to transparent — before the power flag flips and ScreenViewport
 * unmounts it. Both timelines are killed, and the ref dropped, on unmount.
 *
 * The Loading axis (docs/tasks/OFF_SCREEN.md Task 30; spec assumptions 9 and 17, §1.6): the second column, under the
 * Loading heading ("Trace Type", hinted "select one") — the theme row, a muted RadioButton of the five themes, and one
 * muted sentence under it describing the shown theme (the Guide's small part: the same content entry the Guide will
 * read). The row shows a waiting change's theme while one waits, else the live loading store's, whichever row is
 * selected (a landed pick's stored loading goes stale at the first edit in place; spec §1.3). A theme pick is
 * `retransmitWorld({ theme })`, at the click and under no wash: the seed, the plot and the live world stay, only
 * the seeded fields the theme moves are re-derived in place (a tweak on one of them goes; docs/tasks/
 * OFF_SCREEN_FINAL_FIXES.md F7–F8), the world row stays where it is (spec §1.1), the loaded save stays attached — the
 * seed is still the save's, under another theme — and dirty is read again. The readout carries describeWorld's
 * tail, so the three readers of the helper agree. Desktop: the two axes side by side, the readout spanning under
 * both; the phone shell stacks them (OffScreen.css).
 *
 * The family rows (Task 31's Melody row, one per family since docs/tasks/OFF_SCREEN_REVISIONS.md Task 9; assumptions
 * 17 and 21) sit under the theme row's line and a "Trace Aspects" title (hinted "select many"), in ASPECT_FAMILY_IDS
 * order — Melody, Envelope, Distance, Voice: each a
 * multiple RadioButton in the cabinet appearance, the only thing on this screen that pops (Crawford's note 5; the theme
 * row, the list, Scan and the action row stay flat), its options in canonical order with no "As theme" (revisions Task 6), showing the
 * waiting change's picks or the live world's, as the theme row does. A change
 * sends the whole loading, `retransmitWorld({ aspects })`, with the changed family's set canonical (an empty list when
 * its row is cleared — every robot as theme for that family) and every other family's carried as shown; the live roster
 * is re-dealt in place, at the click and under no wash (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33: an aspect is no
 * world change), with the same row kept, the same attached save and the same dirty read as a theme pick. Each
 * row's description line names the aspect toggled on last in that family while it is still on, else
 * the last of its set in canonical order, else the family's own `none` sentence; a world pick resets every family's
 * toggle memory, so a save reads as its own sets. New Transmission's world lands under Classic with no aspects, so a
 * Scan clears every row.
 *
 * While a world change waits under the wash, every click joins it (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R3). The
 * screen keeps the clicks' intent (Intent, above), and the one request realises all of it at the cover: the world part,
 * then the loading where it differs from the one the world part leaves. The rows, the description lines and the readout
 * draw from the intent, so a click shows at once. A theme pick or a family toggle made then joins the intent instead of
 * re-deriving a world about to go, and the waiting row stays selected, the readout naming it under the loading clicked
 * (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F12); the loading is laid over its world at the cover, and the row stays the
 * intended pick, always (spec §1.5). The last world click wins, a Current restore included. Picking Current before the
 * change has landed cancels it instead (above); the action row dims until the change has run.
 */
export function OffScreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  // Read on mount, and again after a Factory Reset, which clears the flag with the rest of storage (spec assumption 4).
  const [heardWorld, setHeardWorld] = useState(() => hasHeardWorld());
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
  // Current's snapshot (spec §1.2), the same ref-and-state pair: the handlers and realise read the ref, the rows the state.
  const snapshotRef = useRef<CurrentSnapshot | null>(null);
  const [snapshot, setSnapshotState] = useState<CurrentSnapshot | null>(null);
  const setSnapshot = useCallback((next: CurrentSnapshot | null) => {
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);
  // Per family, the aspect toggled on most recently (Task 31, per family since revisions Task 9), for its row's
  // description line; emptied by a world pick.
  const [lastOn, setLastOn] = useState<FamilyAspects>({});
  // Only the chooser reads them; a first visit (hint only) never builds the payload.
  const [dirty, setDirty] = useState(() => (heardWorld ? readDirty(null) : CLEAN));
  // The status slot's line (spec §1.6), one at a time, the latest event's: a Save the storage refused (R20), naming the
  // save it tried, or a Rename refused for a taken name. It stays until a Save or Rename succeeds or the world changes.
  const [slot, setSlot] = useState<SlotLine | null>(null);
  // The save whose row holds Rename's input, while one does (spec §1.5).
  const [renaming, setRenaming] = useState<string | null>(null);
  // Share's copy and its auto-dismissing status (spec §1.6), the Sessions panel's hook.
  const { shareStatus, share } = useShareStatus();
  // The Transmissions section (docs/specs/OFF_SCREEN_CONSOLE.md §1.4): collapsed on every mount, never persisted.
  const [transmissionsOpen, setTransmissionsOpen] = useState(false);
  const toggleTransmissions = useCallback(() => setTransmissionsOpen((open) => !open), []);
  // Factory Reset's confirm.
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // A modal Radix dialog gives focus back only to its own Trigger, and Reset is not one, so the button that opened it
  // is kept and focused again on close (SessionsPanel's way).
  const resetOpenerRef = useRef<HTMLElement | null>(null);
  // The save Delete's confirm asks about while it is open, and the button that opened it (Checkpoint A).
  const [deleting, setDeleting] = useState<string | null>(null);
  const deleteOpenerRef = useRef<HTMLElement | null>(null);

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
  const liveName = currentAttenuationStyle?.name ?? '';
  const liveWorld = useMemo(
    () => ({ attenuationStyleName: liveName, coordinates: coordinates ?? { x: 0, y: 0 } }),
    [liveName, coordinates],
  );
  const liveLabel = describeWorld({ ...liveWorld, theme: loadedTheme, aspects: loadedAspects }, loadedSessionName ?? undefined);
  // Current is named after the world the listener left while there is a snapshot, so no pick renames it; with none it
  // is the live world (spec §1.3).
  const currentLabel = snapshot ? describeWorld(identityOf(snapshot.payload), snapshot.loadedName ?? undefined) : liveLabel;

  // What the rows show: a waiting change's intent while there is one (R3), so a click shows at once; else the live
  // world's loading, whichever row is selected — a landed pick's stored identity goes stale at the first theme or aspect
  // click on it (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.3).
  const shownPick = intent?.pick ?? pick;
  // The theme the Loading row shows.
  const shownTheme: ThemeId = intent?.theme ?? loadedTheme;
  // The family rows' sets (Task 31; per family since revisions Task 9), by the same rule.
  const shownAspects = intent?.aspects ?? loadedAspects;
  // The readout names the shown pick. A save's or New Transmission's world is named under the loading shown:
  // the intent's while a change waits, the live world's once it has landed, so an edit in place shows (spec §1.3). Its
  // seed and plot are the pick's: only the loading moves in place. New Transmission's name is empty, so its readout is
  // the drawn style and plot alone. Current with a change waiting is a restore of its snapshot, named under the intended
  // loading; else it is the live world.
  const restoring = intent?.world.kind === 'current' ? intent.world.snapshot : null;
  const readout =
    'identity' in shownPick
      ? describeWorld({ ...shownPick.identity, theme: shownTheme, aspects: shownAspects }, shownPick.name)
      : restoring
        ? describeWorld({ ...identityOf(restoring.payload), theme: shownTheme, aspects: shownAspects }, restoring.loadedName ?? undefined)
        : liveLabel;

  // What the New Transmission editor shows (docs/specs/OFF_SCREEN_CONSOLE.md §1.2): the waiting change's seed and plot
  // while one waits, as the Loading rows show its loading, else the live world's. It draws nothing on mount: Scan is the
  // draw (assumption 1).
  const waitingWorld = intent?.world;
  const editorIdentity = !waitingWorld
    ? liveWorld
    : seedAndPlotOf(
        waitingWorld.kind === 'payload'
          ? waitingWorld.payload
          : waitingWorld.kind === 'current'
            ? waitingWorld.snapshot.payload
            : waitingWorld,
      );

  // The waiting change, realised once the cover has landed, or at once with no wash (R3): the world part - the pick's
  // payload and names, or New Transmission's world - then the intended loading where it differs from the one the
  // world part leaves, then the row and the dirty read. It reads the ref, so every click made while it waited is in it. It runs only as the
  // pending change, and picking Current cancels that change along with its intent, so the intent is always set here.
  // A Current restore lands the snapshot through the Load path and re-attaches the save it was, then drops the snapshot:
  // Current is the live world again. Any other world part marks the snapshot landed (spec §1.2, §1.5).
  const realise = useCallback(() => {
    const intended = intentRef.current!;
    setIntent(null);
    let left: LoadingIdentity;
    const { setCurrentSessionName, setCurrentLoadedSessionName, detachLoadedSession } = useSessionStore.getState();
    if (intended.world.kind === 'current') {
      const { payload, loadedName } = intended.world.snapshot;
      applySessionPayload(payload);
      if (loadedName) {
        setCurrentSessionName(loadedName);
        setCurrentLoadedSessionName(loadedName);
      } else {
        detachLoadedSession();
      }
      setSnapshot(null);
      left = loadingOf(payload);
    } else if (intended.world.kind === 'payload') {
      const { name, payload } = intended.world;
      applySessionPayload(payload);
      setCurrentSessionName(name);
      setCurrentLoadedSessionName(name);
      left = loadingOf(payload);
    } else {
      // New Transmission's world, whole: its seed and plot under Classic with no aspects, and no save attached (spec §1.1).
      const { attenuationStyleName, coordinates } = intended.world;
      retransmitWorld({ attenuationStyleName, coordinates, ...NEW_LOADING });
      detachLoadedSession();
      left = NEW_LOADING;
    }
    const loading: RetransmitInput = {};
    if (intended.theme !== left.theme) loading.theme = intended.theme;
    if (!deepEqual(canonicalAspects(intended.aspects), canonicalAspects(left.aspects))) loading.aspects = intended.aspects;
    if (loading.theme !== undefined || loading.aspects !== undefined) retransmitWorld(loading);
    const held = snapshotRef.current;
    if (intended.world.kind !== 'current' && held && !held.landed) setSnapshot({ ...held, landed: true });
    // The row is the intended pick, always: a loading laid over it keeps it, as a theme or aspect click on a landed pick
    // does (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.5).
    setPick(intended.pick);
    setDirty(readDirty(snapshotRef.current));
    setSlot(null);
  }, [setIntent, setSnapshot]);

  // The snapshot is taken on the way out of Current, never on mount: with none, Current is the live world, so a theme or
  // aspect click on it needs no special path (spec §1.2). A no-op once one is held: Current stays the world first left.
  const leaveCurrent = useCallback(() => {
    if (snapshotRef.current) return;
    setSnapshot({
      payload: buildSessionPayload(),
      loadedName: useSessionStore.getState().currentLoadedSessionName,
      landed: false,
    });
  }, [setSnapshot]);

  // The selected save's or New Transmission's live loading (spec §1.3): the shown loading, while it is not the
  // row's own, the theme named whenever it differs from the row's (Classic too). The row then reads it in place of its
  // own (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6b). Current never needs one: its label is the live
  // world already. Not stored: the row reads as stored again once it is left.
  const own = 'identity' in shownPick ? shownPick.identity : null;
  const edited =
    own !== null &&
    (shownTheme !== own.theme || !deepEqual(canonicalAspects(shownAspects), canonicalAspects(own.aspects)));
  const selectedLoading = edited ? describeLoading(shownTheme, shownAspects, { nameTheme: shownTheme !== own.theme }) : null;
  const selectedValue = shownPick.value;

  // The Transmissions header names the shown row — New Transmission, Current, or the save's name — and the count of
  // saves, read every render so a pick or a save shows at once (spec §1.4).
  const shownName = selectedValue === NEW_VALUE ? NEW_TRANSMISSION : 'name' in shownPick ? shownPick.name : CURRENT.humanLabel;
  const transmissionsTitle = fill('home.off.transmissionsHeader', {
    name: shownName,
    count: String(saves.length),
  });

  // The action row (spec §1.5): the dim matrix of the shown row, the live world's dirty read — Save writes the live world,
  // and Current is selected only with no snapshot, when Current's read is the same one — and the waiting change, under
  // which nothing acts on a world not yet live.
  const currentDirty = dirty.current;
  const rowKind: ActionRowKind = selectedValue === CURRENT_VALUE ? 'current' : selectedValue === NEW_VALUE ? 'new' : 'save';
  const actions = actionRow(rowKind, dirty.live, intent !== null);

  const schema = useMemo<RadioButtonSchema>(() => {
    // Every row names its world, as Current does (Task 6b): the name fronting the seed and plot, then the loading - the
    // row's own, or on the selected, edited row the live one in its place.
    const named = (value: string, name: string, world: WorldIdentity) => {
      if (value !== selectedValue || selectedLoading === null) return describeWorld(world, name || undefined);
      const { attenuationStyleName, coordinates } = world;
      return withTail(describeWorld({ attenuationStyleName, coordinates }, name || undefined), selectedLoading);
    };
    return {
      id: 'offTransmission',
      type: 'radio',
      ...TRANSMISSION,
      // The list (revisions Task 4, Crawford's note 1): rows, the saves carrying when they were saved. Current first: New
      // Transmission is the editor above the section, no row (docs/specs/OFF_SCREEN_CONSOLE.md §1.2).
      appearance: 'list',
      options: [
        // Current's eyebrow says whether a save matches it, from Current's dirty read (spec §1.3).
        { value: CURRENT_VALUE, humanLabel: currentLabel, loreLabel: currentDirty ? UNSAVED_EYEBROW : CURRENT.humanLabel },
        ...saves.map((save, i) => ({
          value: SAVE_PREFIX + save.name,
          humanLabel: named(SAVE_PREFIX + save.name, save.name, identityOf(save.payload)),
          meta: fill('home.off.savedAt', { time: formatSessionTimestamp(save.savedAt) }),
          // Titled while there are saves (Task 6c).
          headingBefore: i === 0 ? SAVED_TITLE : undefined,
        })),
      ],
    };
  }, [currentLabel, currentDirty, saves, selectedValue, selectedLoading]);

  // New Transmission picked — a Scan, or the editor's commit, which drops an unchanged draft itself
  // (docs/specs/OFF_SCREEN_CONSOLE.md §1.2): its world waits under the wash like any pick, joining a waiting change with
  // the last world click winning (R3), the editor selected at the click, under the world's own loading — Classic with no
  // aspects — which replaces any loading clicked before it, as applying it would. Like a save pick, it leaves Current
  // first.
  const pickNew = useCallback(
    (world: EditorIdentity) => {
      leaveCurrent();
      setIntent({
        world: { kind: 'new', ...world },
        pick: { value: NEW_VALUE, name: '', identity: { ...world, ...NEW_LOADING } },
        ...NEW_LOADING,
      });
      setLastOn({});
      requestWorldChange(realise);
    },
    [leaveCurrent, realise, setIntent],
  );

  const onChange = useCallback((value: string) => {
    if (value === CURRENT_VALUE) {
      // A world pick shows each set as that world carries it: nothing toggled (Task 31).
      setLastOn({});
      const left = snapshotRef.current;
      if (left?.landed) {
        // Another world has landed since Current was left: bring Current back, a world change under the wash like any
        // pick, with the snapshot's own loading (spec §1.1, §1.5). A pick made while it waits replaces it, and the
        // snapshot stays.
        const loading = loadingOf(left.payload);
        setIntent({
          world: { kind: 'current', snapshot: left },
          pick: CURRENT_PICK,
          theme: loading.theme,
          aspects: loading.aspects,
        });
        requestWorldChange(realise);
        return;
      }
      // Nothing has landed, so the live world is still Current's: the waiting change is cancelled (the cover still lands
      // and lifts, and nothing runs; R3) and the snapshot dropped, so the paused world stands.
      if (intentRef.current) {
        cancelWorldChange();
        setIntent(null);
      }
      setSnapshot(null);
      setPick(CURRENT_PICK);
      return;
    }
    const name = value.slice(SAVE_PREFIX.length);
    const payload = loadSession(name);
    if (!payload) return;
    // The world change waits under the scene wash (docs/tasks/OFF_SCREEN_REVISIONS.md Task 13), the pick showing at the
    // click (R3); the payload, the names, the row and the dirty read land with the cover. The pick's own loading
    // replaces any loading clicked before it, as applying it would.
    leaveCurrent();
    const identity = identityOf(payload);
    setIntent({
      world: { kind: 'payload', name, payload },
      pick: { value, name, identity },
      theme: identity.theme,
      aspects: identity.aspects,
    });
    setLastOn({});
    requestWorldChange(realise);
  }, [leaveCurrent, realise, setIntent, setSnapshot]);

  // A theme pick (Task 30): the loading alone moves — the same seed and plot, the live world re-derived in place under
  // the new bands (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F7) — so the world row stays where it is
  // (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.1). The loaded save
  // stays attached (see the component note), and dirty is read again. Not under the scene wash: nothing physical
  // changes, so it applies at the click, as a family toggle does (F8; Crawford, answer 2b). With a world change waiting,
  // the theme joins its intent instead (R3).
  const onThemeChange = useCallback(
    (value: string) => {
      if (!isThemeId(value)) return;
      const waiting = intentRef.current;
      if (waiting) {
        setIntent({ ...waiting, theme: value });
        return;
      }
      retransmitWorld({ theme: value });
      setDirty(readDirty(snapshotRef.current));
      setSlot(null);
    },
    [setIntent],
  );

  // The boot theatre, built through useGSAP (CLAUDE.md: animation in components goes through it) and registered in
  // timelineMap by the animation module; the ref the fade reads is set here, where the root exists. The callback's
  // return is the unmount's kills (useGSAP's gsap.context keeps a returned function and runs it on revert): the
  // theatre, a fade still in flight, and the ref — a pending fade's onComplete must never resolve against an unmounted
  // screen. A power-off fades the screen in instead (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F6): the world tells the two
  // apart as R25's focus does below — 'paused' after a power-off, 'cold' on a fresh page, which keeps the theatre.
  useGSAP(
    () => {
      if (!rootRef.current || !darkRef.current) return;
      setRef(OFF_SCREEN_REF_KEY, rootRef.current);
      const stopShow =
        getWorldState() === 'paused' ? fadeInOffScreen(rootRef.current) : startOffScreenBoot(darkRef.current);
      return () => {
        stopShow();
        killTimeline(OFF_SCREEN_FADE_TIMELINE);
        deleteRef(OFF_SCREEN_REF_KEY);
      };
    },
    { scope: rootRef, dependencies: [] },
  );

  // After a power-off the chooser takes the focus, so keyboard and screen-reader users land in it rather than on a
  // readout that mounted already filled (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R25; Crawford, its Open Question 5):
  // on the Transmissions header, which names the selected row, since the list starts collapsed on every mount and its
  // rows are not in the DOM (docs/specs/OFF_SCREEN_CONSOLE.md §1.4). The world tells a power-off from a fresh page:
  // pause() writes 'paused' in the same call that flips the power flag, before this mounts, and a fresh page is 'cold',
  // which leaves the focus where it is. A first visit renders no header, so nothing is found to take it.
  useEffect(() => {
    if (getWorldState() !== 'paused') return;
    rootRef.current?.querySelector<HTMLElement>(`.disclosure--${TRANSMISSIONS_SCHEMA.id} > button`)?.focus();
  }, []);

  // Scan (docs/specs/OFF_SCREEN_CONSOLE.md §1.2): a new draw, then exactly a pick of it as New Transmission, from
  // whichever row is selected, New Transmission included; the editor shows it from the click. It replaces a waiting
  // change, the last world click winning (R3).
  const onScan = useCallback(() => {
    pickNew({
      attenuationStyleName: generateRandomAttenuationStyleName(),
      coordinates: { x: randomCoordinate(), y: randomCoordinate() },
    });
  }, [pickNew]);

  // Save (docs/specs/OFF_SCREEN_CONSOLE.md §1.5) writes the live world through keepCurrentWorld, whichever row is selected:
  // on Current, under its loaded save's name or a fresh one, as Keep did; on a save, over that save, the loaded one; on
  // New Transmission, under a fresh name, since nothing is loaded. Current is selected only with no snapshot —
  // picking it cancels the change that left it or restores the snapshot, and both drop it — so Current's Save is the live
  // world. Off Current the selection moves to the save just written, its identity the live world's, so the row reads as
  // stored with no tail. Only enabled with no change waiting (actionRow), so the pick is the shown one.
  const onSave = useCallback(() => {
    // A save the storage refuses (a full quota) is a line in the status slot, never a throw into the click (R20). It
    // names the save it tried, read before the attempt: the loaded save, else the session name keepCurrentWorld would
    // try first (docs/tasks/OFF_SCREEN_CONSOLE.md Task 6).
    const { currentLoadedSessionName, currentSessionName, keepCurrentWorld } = useSessionStore.getState();
    const tried = currentLoadedSessionName ?? currentSessionName;
    let name: string;
    try {
      name = keepCurrentWorld();
    } catch (err) {
      console.error('[OffScreen] Save could not save', err);
      setSlot({ kind: 'saveFailed', name: tried });
      return;
    }
    setSlot(null);
    setSaves(sortedSaves());
    if (pick.value !== CURRENT_VALUE) setPick({ value: SAVE_PREFIX + name, name, identity: identityOf(buildSessionPayload()) });
    setDirty(readDirty(snapshotRef.current));
  }, [pick]);

  // Rename (docs/specs/OFF_SCREEN_CONSOLE.md §1.5): the selected save's row gains its input. Only enabled on a save with no
  // change waiting (actionRow), so the pick is the shown one.
  const onRename = useCallback(() => {
    if ('name' in pick && pick.value.startsWith(SAVE_PREFIX)) setRenaming(pick.name);
  }, [pick]);

  // A save renamed: the names that point at it follow — the loaded save's (and the session name with it, so a later Save
  // overwrites the renamed row) and Current's snapshot's, so Current is named after it and a restore attaches it
  // (spec §7 risk 4). Neither is left naming a save that is gone.
  const renameFollowers = useCallback(
    (from: string, to: string) => {
      const { currentLoadedSessionName, setCurrentLoadedSessionName, setCurrentSessionName } = useSessionStore.getState();
      if (currentLoadedSessionName === from) {
        setCurrentLoadedSessionName(to);
        setCurrentSessionName(to);
      }
      const held = snapshotRef.current;
      if (held?.loadedName === from) setSnapshot({ ...held, loadedName: to });
    },
    [setSnapshot],
  );

  // Rename's commit: a blank or unchanged name (trimmed) or an Escape reverts with nothing written; a name another save
  // has is refused, the slot saying so (assumption 3); else the save is re-keyed (renameNamedSession: its savedAt and
  // payload kept), the followers follow, the saves re-read, and the row stays selected under its new name.
  const onRenameDone = useCallback(
    (from: string, typed: string | null) => {
      setRenaming(null);
      const to = typed?.trim();
      if (!to || to === from) return;
      if (!renameNamedSession(from, to)) {
        setSlot({ kind: 'renameTaken' });
        return;
      }
      renameFollowers(from, to);
      setSlot(null);
      setSaves(sortedSaves());
      setPick((shown) => ('name' in shown && shown.value === SAVE_PREFIX + from ? { ...shown, value: SAVE_PREFIX + to, name: to } : shown));
    },
    [renameFollowers],
  );

  // Delete (docs/specs/OFF_SCREEN_CONSOLE.md §1.5, assumption 2) asks first: a modal confirm naming the save (Checkpoint
  // A; it was at once, with none). Only enabled on a save with no change waiting (actionRow), so the pick is the shown
  // one; the opener is kept for the focus to return to.
  const openDeleteConfirm = useCallback(() => {
    if (!('name' in pick) || !pick.value.startsWith(SAVE_PREFIX)) return;
    deleteOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDeleting(pick.name);
  }, [pick]);

  // Confirmed, the save goes, and the live world stands — no world change, no wash. The names that pointed at it let go:
  // the loaded save detaches (a fresh name suggested), and Current's snapshot forgets it, so Current reads unsaved. The
  // selection, matching no row now, falls to New Transmission holding the live identity whole — the editor already shows
  // its seed and plot, and the live loading is its own, so the readout names the deleted save's world with no tail.
  const deleteSave = useCallback((name: string) => {
    deleteNamedSession(name);
    const { currentLoadedSessionName, detachLoadedSession } = useSessionStore.getState();
    if (currentLoadedSessionName === name) detachLoadedSession();
    const held = snapshotRef.current;
    if (held?.loadedName === name) setSnapshot({ ...held, loadedName: null });
    setSaves(sortedSaves());
    setPick({ value: NEW_VALUE, name: '', identity: { ...liveWorld, theme: loadedTheme, aspects: loadedAspects } });
    setDirty(readDirty(snapshotRef.current));
  }, [liveWorld, loadedTheme, loadedAspects, setSnapshot]);

  const onConfirmDelete = () => {
    if (deleting !== null) deleteSave(deleting);
    setDeleting(null);
  };
  // The focus goes back to Delete when it is still lit (a cancel), else to the Transmissions header: a confirmed Delete
  // leaves New Transmission selected, where Delete is dimmed.
  const returnDeleteFocus = useCallback((event: Event) => {
    event.preventDefault();
    const opener = deleteOpenerRef.current;
    if (opener instanceof HTMLButtonElement && opener.isConnected && !opener.disabled) opener.focus();
    else rootRef.current?.querySelector<HTMLElement>(`.disclosure--${TRANSMISSIONS_SCHEMA.id} > button`)?.focus();
  }, []);

  // The list's trailing slot (RadioButton's): Rename's input on the save being renamed, nothing on any other row.
  const trailing = useCallback(
    (value: string) => (renaming !== null && value === SAVE_PREFIX + renaming ? <RenameField name={renaming} onDone={onRenameDone} /> : null),
    [renaming, onRenameDone],
  );

  // Share (docs/specs/OFF_SCREEN_CONSOLE.md §1.6) copies the link for the world the readout names — the live world:
  // Current is shown only with no snapshot, and Share dims while a change waits — through useShareStatus and
  // copySessionLink, the one encoder. The slot takes the share's line at the click, so the latest event's line shows.
  const onShare = () => {
    setSlot({ kind: 'share' });
    void share(buildSessionPayload());
  };

  // Factory Reset (spec §1.4, assumption 4): Reset opens the confirm, keeping its opener for the focus to return to.
  const openResetConfirm = useCallback(() => {
    resetOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setResetConfirmOpen(true);
  }, []);
  const returnResetFocus = useCallback(() => resetOpenerRef.current?.focus(), []);

  // Confirmed, it wipes all of localStorage, as SessionsPanel's does — the device flag with it — and drops the loaded
  // save's name, which no entry backs any more. The gate is read again at once, so the chooser gives way to the
  // first-visit view with no reload (assumption 4). The saves are not re-read: the chooser that lists them is gone for
  // this mount, and the next mount reads them afresh. The paused world stands: nothing here is a world change.
  const onConfirmReset = useCallback(() => {
    localStorage.clear();
    useSessionStore.getState().setCurrentLoadedSessionName(null);
    setResetConfirmOpen(false);
    setHeardWorld(hasHeardWorld());
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
  // the deal moves over the live roster; the world row stays where it is, the loaded save stays attached and dirty is
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
        setIntent({ ...waiting, aspects: { ...waiting.aspects, [family]: next } });
        return;
      }
      retransmitWorld({ aspects: { ...shownAspects, [family]: next } });
      setDirty(readDirty(snapshotRef.current));
      setSlot(null);
    },
    [shownAspects, setIntent],
  );

  // Factory Reset's confirm, SessionsPanel's dialog read from the same content (spec §1.4), and Delete's, in its look.
  const screenNode = resetConfirmOpen || deleting !== null ? getScreenViewportDomNode() : null;
  const deleteConfirm = (
    <>
      <AlertDialog.Overlay className="clear-storage-confirm__overlay" />
      <AlertDialog.Content className="clear-storage-confirm__content" onCloseAutoFocus={returnDeleteFocus}>
        <AlertDialog.Title className="clear-storage-confirm__title">
          {fill('session.delete.confirmTitle', { session: deleting ?? '' })}
        </AlertDialog.Title>
        <AlertDialog.Description className="clear-storage-confirm__description">{DELETE_CONFIRM_BODY}</AlertDialog.Description>
        <div className="clear-storage-confirm__actions">
          <AlertDialog.Cancel className="clear-storage-confirm__cancel">{CANCEL}</AlertDialog.Cancel>
          <AlertDialog.Action className="clear-storage-confirm__confirm" onClick={onConfirmDelete}>
            {DELETE}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </>
  );
  const resetConfirm = (
    <>
      <AlertDialog.Overlay className="clear-storage-confirm__overlay" />
      <AlertDialog.Content className="clear-storage-confirm__content" onCloseAutoFocus={returnResetFocus}>
        <AlertDialog.Title className="clear-storage-confirm__title">{RESET_CONFIRM_TITLE}</AlertDialog.Title>
        <AlertDialog.Description className="clear-storage-confirm__description">{RESET_CONFIRM_BODY}</AlertDialog.Description>
        <div className="clear-storage-confirm__actions">
          <AlertDialog.Cancel className="clear-storage-confirm__cancel">{CANCEL}</AlertDialog.Cancel>
          <AlertDialog.Action className="clear-storage-confirm__confirm" onClick={onConfirmReset}>
            {RESET_LABELS.humanLabel}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </>
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
                {/* The New Transmission editor (docs/specs/OFF_SCREEN_CONSOLE.md §1.2): the shown world's seed and plot,
                    and Scan; selected while New Transmission is the shown pick. */}
                <TransmissionEditor
                  identity={editorIdentity}
                  selected={selectedValue === NEW_VALUE}
                  onCommit={pickNew}
                  onScan={onScan}
                />
                {/* The Transmissions section (spec §1.4): the list and its actions, under a header naming the selected
                    row, collapsed until opened. */}
                <Disclosure
                  schema={TRANSMISSIONS_SCHEMA}
                  title={transmissionsTitle}
                  open={transmissionsOpen}
                  onToggle={toggleTransmissions}
                >
                  <RadioButton schema={schema} value={shownPick.value} onChange={onChange} trailing={trailing} />
                  <div className="off-screen__actions">
                    <Button
                      schema={SAVE_SCHEMA}
                      face="single"
                      accessibleName={fill('home.off.save', { name: shownName })}
                      onClick={onSave}
                      disabled={!actions.save}
                    />
                    <Button
                      schema={RENAME_SCHEMA}
                      face="single"
                      accessibleName={fill('home.off.rename', { name: shownName })}
                      onClick={onRename}
                      disabled={!actions.rename}
                    />
                    <Button
                      schema={DELETE_SCHEMA}
                      face="single"
                      accessibleName={fill('home.off.delete', { name: shownName })}
                      onClick={openDeleteConfirm}
                      disabled={!actions.delete}
                    />
                    {/* Share (spec §1.6), last in the row: with the saves, since the presets went (Checkpoint A). */}
                    <Button
                      schema={SHARE_SCHEMA}
                      face="single"
                      accessibleName={fill('home.off.share', { name: shownName })}
                      onClick={onShare}
                      disabled={!actions.share}
                    />
                  </div>
                  {/* Factory Reset (spec §1.4), with the saves: under its label row, behind the confirm below. */}
                  <div className="off-screen__reset">
                    <DualLabel loreLabel={RESET_LABELS.loreLabel} humanLabel={RESET_LABELS.humanLabel} />
                    <Button schema={CLEAR_STORAGE_SCHEMA} face="single" onClick={openResetConfirm} />
                  </div>
                </Disclosure>
              </div>
              <div className="off-screen__axis">
                <RadioButton schema={THEME_SCHEMA} value={shownTheme} onChange={onThemeChange} />
                <p className="off-screen__description off-screen__description--theme">{themeDescription(shownTheme)}</p>
                {/* Their title, "Trace Aspects" over "select many" (Task 6c): the theme row's label, standing alone. */}
                <div className="off-screen__aspects-title">
                  <DualLabel humanLabel={ASPECTS_TITLE} hint={ASPECTS_HINT} />
                </div>
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
            {/* The status slot (docs/specs/OFF_SCREEN_CONSOLE.md §1.6), where the unsaved warning was: always there,
                empty but for one line, so a line coming and going never moves the column (docs/tasks/
                OFF_SCREEN_REVIEW_FOLLOWUPS.md R26). Current's eyebrow says unsaved now. A failure is an alert; "copied"
                a status, gone at the hook's dismiss. */}
            <p className="off-screen__status">
              {slot?.kind === 'saveFailed' && <span role="alert">{fill('session.status.saveFailed', { name: slot.name })}</span>}
              {slot?.kind === 'renameTaken' && <span role="alert">{RENAME_TAKEN}</span>}
              {slot?.kind === 'share' && shareStatus === 'copied' && <span role="status">{LINK_COPIED}</span>}
              {slot?.kind === 'share' && shareStatus === 'error' && <span role="alert">{COPY_FAILED}</span>}
            </p>
            {/* Factory Reset's confirm: into the screen, never <body> (the UI Shell guardrail), or in place when there
                is no screen (a component test). */}
            <AlertDialog.Root open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
              {screenNode ? <AlertDialog.Portal container={screenNode}>{resetConfirm}</AlertDialog.Portal> : resetConfirm}
            </AlertDialog.Root>
            {/* Delete's confirm (Checkpoint A), placed as Factory Reset's is. */}
            <AlertDialog.Root open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
              {screenNode ? <AlertDialog.Portal container={screenNode}>{deleteConfirm}</AlertDialog.Portal> : deleteConfirm}
            </AlertDialog.Root>
          </div>
        )}
        <p className="off-screen__footer">{FOOTER}</p>
      </div>
    </div>
  );
}
