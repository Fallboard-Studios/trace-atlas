# Phase Spec: The Off Screen — Current stays the world you came from, and a New Transmission row with Scan

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests: `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/stores/sessionStore.test.ts src/content`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`

Intent: [docs/intent/off-screen-current-and-new-transmission.md](../intent/off-screen-current-and-new-transmission.md),
confirmed with Crawford on 2026-11-02. It revises roadmap
[57](../todo/archive/roadmap-archive.md#57-the-off-screen-power-as-pause-the-two-axis-chooser-keep-and-the-band-table)'s
Transmission list. One capability: Phase 0's scope check found no split.

Written for: Crawford, and the agent that plans and builds it.

---

## 1. Overview & Claude Explanation

The off screen's Transmission list (`src/components/panels/screen/screens/OffScreen.tsx`) changes in three ways:

- **Current** becomes a fixed anchor: the world you powered off on, named after itself the whole time the screen is
  open.
- A **New Transmission** row holds a freshly rolled world. A **Scan** button in that row replaces Roll.
- A theme or aspect click keeps whichever row is selected.

Today, Current is named from the live stores, so every pick renames it. A theme or aspect click after a pick also moves
the selection back to Current (`setPick(CURRENT_PICK)` in `onThemeChange` and `onFamilyChange`). And Current's only
power over a pick, cancelling it (R3, F12), lasts the wash's 0.5 s fade-in.

The fix is a runtime-only **snapshot** of the Current world, captured the moment the listener leaves Current. Clicking
Current restores it. Keep saves it.

### 1.1 Behaviour

| Action | What happens | The rows after it |
|---|---|---|
| Off screen opens (power-off or fresh page) | No snapshot: Current *is* the live world. New Transmission draws a random Attenuation Style name and coordinates. | Current selected, named from the live world. |
| Theme or aspect click, Current selected, no snapshot | As today: the live world is re-derived in place (`retransmitWorld({ theme })` / `({ aspects })`), no wash. | Current stays selected and is renamed from the live world, because the click changes Current itself. |
| Pick a save or preset | If there's no snapshot, capture one first (§1.2). Then, as today, the world change waits under the wash and lands the payload. | That row selected. Current keeps the snapshot's name. |
| Pick New Transmission | Capture the snapshot if there's none. The change waits under the wash, then lands `retransmitWorld({ attenuationStyleName, coordinates, theme: 'classic', aspects: {} })` and `detachLoadedSession()`. | New Transmission selected. |
| Scan (in New Transmission's row) | Draws a new name and coordinates into the row, then does exactly what picking New Transmission does. It works from any selected row, including New Transmission itself. | New Transmission selected, holding the new draw. |
| Theme or aspect click with a save, preset or New Transmission selected | The live world is re-derived in place, as today, with no wash. **The selection stays.** Nothing is written to storage. | The same row selected, labelled `<row name> · <loading tail>` (§1.3). Current is unchanged. |
| Pick Current while another row's change is **still waiting** | The departure never landed, so the live world is still Current's. Cancel the waiting change (`cancelWorldChange()`) and drop the snapshot. The paused world stands and resumes on power-on. | Current selected. |
| Pick Current after another world **has landed** | A world change under the wash: `applySessionPayload(snapshot.payload)`, then re-attach the snapshot's save name, or detach if it had none. The snapshot is dropped, so Current is live again. | Current selected. |
| Click the row that's already selected | Nothing. | Unchanged. |
| Keep ("Save Last World") | With no snapshot: as today (`keepCurrentWorld()`, the live world). With a snapshot: save **the snapshot** (§1.4). The live world and its attachment are untouched. | Unchanged, plus a new save row when one was written. |
| Power on | As today: whichever world is live plays. At the next power-off the screen remounts, so that world is Current and New Transmission draws again. | — |

The wash rule is unchanged. A world change waits under the wash, and every click made while it waits joins the waiting
intent, the last world click winning (R3). The one exception is the "still waiting" Current case in the table, which
cancels the change instead.

### 1.2 The snapshot

```ts
/** The world the listener powered off on, kept from the moment they leave it (a save, preset or New Transmission pick,
 *  or a Scan) until it is live again (Current picked). Runtime only: component state, never a store, a save or the link. */
interface CurrentSnapshot {
  payload: SessionPayload;      // buildSessionPayload() at the moment of leaving
  loadedName: string | null;    // useSessionStore's currentLoadedSessionName at that moment; Keep may set it later
  landed: boolean;              // has any world change landed since it was taken? false → picking Current cancels
}
```

- **Taken lazily, on leaving.** With no snapshot, Current is simply the live world, so a theme or aspect click on
  Current needs no special path, and the snapshot "follows" every such click for free.
- **Restored through the Load path.** Restoring uses the Load path (`applySessionPayload`), so "exactly" means
  exactly as a Keep followed by a Load would bring it back, at `buildSessionPayload`'s quantisation. That's the
  precision every save already has.
- **A restore after a landed change rebuilds cold.** Once another world has landed, the paused world was torn down
  (roadmap 57's "No resume into a different world"). Bringing Current back is then a cold rebuild, and the next
  power-on starts the world rather than resuming it. Only the still-waiting case keeps the paused world.

### 1.3 Row labels and the readout

- **Current:** `describeWorld(snapshot identity, snapshot.loadedName)` while a snapshot exists, else today's
  `currentLabel` (live).
- **New Transmission:** looks like Current. "New Transmission" is its lore label, where `CURRENT` is Current's, and its
  label is its drawn world, `describeWorld(drawn)`, from the moment the screen opens. Each Scan replaces it. (Amended
  by Crawford on 2026-11-02, plan Task 6b. It read "the rolled name and coordinates are never on the row".)
- **A save or preset:** its name fronting its world, as Current's label reads with a save loaded:
  `describeWorld(identityOf(payload), name)`, so "Harbour Song · tr3nch-2 (-30, -30) · Calm". (Task 6b. It was the
  name alone.)
- **The selected row:** while it isn't Current and the live loading differs from the row's own loading (the
  payload's, through `loadingOf`, or Classic with no aspects for New Transmission), the row reads the live loading in
  place of its own: its name and its seed and plot, then ` · ` and describeWorld's loading tail of the live loading,
  naming the theme whenever it differs from the row's own. For example, "Harbour Song · tr3nch-2 (-30, -30) · Classic"
  or "New Transmission, k2f9 · (101, -37) · Hypnotic". It reads as stored again the moment the row is left, and a
  save or preset reloads as stored when picked again.
- **The readout:** names the selected row's actual world. With a change waiting, it uses the intent, as today. Once a
  change has landed, it reads the live world: `describeWorld(live identity, the row's name)`, where Current's name is
  the snapshot's or the live loaded save's, a save's or preset's is its own, and New Transmission's is no label (so
  the readout shows the rolled style and coordinates).
- **The Loading rows** (theme and families): show the intent's loading while a change waits, else the **live**
  loading store's. They no longer read a pick's stored identity once it has landed, because that's now stale after an
  in-place edit.

### 1.4 Keep and the dirty read with a snapshot

- **Saving the snapshot:** with a snapshot, Keep saves `snapshot.payload` under `snapshot.loadedName`, overwriting
  that save as today's Keep does. If it has no name, Keep uses a fresh unused name (`unusedSessionName('')`). It then
  sets `snapshot.loadedName` to that name. It never changes `currentLoadedSessionName` or `currentSessionName`, which
  describe the live world the Sessions panel will see on power-on.
- **The dirty read** (which dims Keep and shows the unsaved line) describes Current. With a snapshot, it's dirty
  unless `snapshot.loadedName` names a stored save deep-equal to `snapshot.payload` (through `asStored`). With no
  snapshot, it's today's `isWorldDirty()`.
- **The store API:**

  ```ts
  /** Save `payload` under `loadedName`, or a fresh unused name when null; returns the name. Touches no session field. */
  keepWorld: (payload: SessionPayload, loadedName: string | null) => string;
  /** Today's isWorldDirty, for any payload and name; isWorldDirty() becomes isPayloadDirty(buildSessionPayload(), …). */
  export function isPayloadDirty(payload: SessionPayload, loadedName: string | null): boolean;
  ```

  `keepCurrentWorld` stays as it is, so the no-snapshot path doesn't change.
- **Keep while a change waits:** stays disabled, as today.

### 1.5 The intent

Today's `Intent` has `world` (a payload pick) and `roll: boolean`. It becomes one world part of three kinds:

```ts
type WorldPart =
  | { kind: 'payload'; value: string; name: string; payload: SessionPayload }    // a save or preset
  | { kind: 'new'; attenuationStyleName: string; coordinates: { x: number; y: number } } // New Transmission or Scan
  | { kind: 'current'; snapshot: CurrentSnapshot };                               // restore Current
```

- **`realise`:** lands the world part, then lays the intended loading over it where it differs (as today). It then
  sets the row to `intended.pick`, **always**: the drop to Current after a laid-over loading (F12's last bullet) goes.
- **A theme or aspect click on a restore:** joins the intent while a Current restore waits. It's laid over the
  restored world, so Current ends under it, which matches the "the click changes Current" row of §1.1.

### 1.6 Content

- `home.off.newTransmission`: `{ human: 'New Transmission' }`, the row's label.
- `home.off.scan`: `{ human: 'Scan' }`, the button. It replaces `home.off.roll`, which is deleted.
- Both are Crawford's words. `src/content/content.test.ts` must still pass.

---

## 2. Target File Structure

```text
src/
├── components/panels/screen/screens/
│   ├── OffScreen.tsx          # snapshot, New Transmission row + Scan, intent kinds, labels, Keep/dirty routing
│   ├── OffScreen.test.tsx     # the Roll, Current-cancel (R3) and F12 cases rewritten; the new cases (§5)
│   └── OffScreen.css          # only if the New Transmission row's trailing Scan needs a rule Current's Roll had
├── stores/
│   ├── sessionStore.ts        # keepWorld, isPayloadDirty (isWorldDirty delegates)
│   └── sessionStore.test.ts
├── utils/
│   ├── describeWorld.ts       # describeLoading (the loading tail, lifted out) and withTail; describeWorld calls both
│   └── describeWorld.test.ts  # describeLoading's cases; the describeWorld cases unmodified
└── content/copy/
    └── home.ts                # home.off.newTransmission, home.off.scan; home.off.roll removed
docs/
├── UI_SHELL.md                # the off screen's Transmission list paragraph
└── todo/                      # the item's number, its plan.md line
```

Nothing in `systems/` or `animation/` changes, and in `utils/` only `describeWorld.ts`: the selected row's tail (§1.3)
reuses its loading tail, and its ` · ` join, rather than repeating them in the component (the plan's deviation,
[docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md](../tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md),
Architecture Decisions). `retransmitWorld`, `applySessionPayload`, `requestWorldChange` and `cancelWorldChange` are
used as they are.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** touch only the files in §2. `rollWorld` stays exported for its other callers, if any. The off
  screen stops calling it, because New Transmission needs the draw before the retransmit.
- **Runtime only:** the snapshot and the New Transmission draw live in component state or refs, never in a Zustand
  store, a save payload or the link (CLAUDE.md: state stays serialisable; these hold a whole payload only for the
  screen's lifetime).
- **The guardrails stand:**
  - A theme or aspect change is re-derived in place and rebuilds nothing.
  - A world change goes under the scene wash.
  - Nothing here schedules audio or reads a timer.
  - The address bar keeps mirroring at the end of every `retransmitWorld`.
- **No new content outside `src/content/`:** the tail punctuation ` · ` is describeWorld's, reused.
- **Ask first:**
  - a confirm dialog of any kind;
  - persisting the snapshot;
  - a change to `worldChange.ts` or `sceneWash.ts`;
  - a new `RadioButton` prop.
- **Never:** reintroduce autosave (roadmap 57 and SESSION_STORAGE.md).

---

## 4. Code Style & Architecture Conventions

Match `OffScreen.tsx` as it stands:

- Module constants for schemas, read through `labels()`.
- `useCallback` handlers that read the waiting intent through `intentRef`.
- A doc comment that cites the spec section it implements.
- The component's long header comment is revised in place to describe the new list, not appended to.

```ts
// The snapshot is taken on the way out of Current, never on mount: with none, Current is the live world, so a theme or
// aspect click on it needs no special path (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.2).
const leaveCurrent = useCallback(() => {
  if (snapshotRef.current) return;
  setSnapshot({
    payload: buildSessionPayload(),
    loadedName: useSessionStore.getState().currentLoadedSessionName,
    landed: false,
  });
}, [setSnapshot]);
```

---

## 5. Testing & Verification Requirements

Vitest + Testing Library, colocated. The tasks go RED first, one commit per task. A task that only changes docs or copy
gets no test (CLAUDE.md). Each new gate is mutation-checked by hand.

**`OffScreen.test.tsx`** (with the wash attached where the case needs a wait):

1. **On open:** Current is selected and New Transmission is the first row, unselected, labelled "New Transmission",
   with Scan in its trailing slot. Current's row has no Roll.
2. **A save pick, then a theme click:** the save row stays checked, its label gains the theme ("<save> · Calm"), and
   Current's label is unchanged from before the pick.
3. **A save pick lands, then Current:** `applySessionPayload` is called with the snapshot payload. The live world
   equals the pre-pick world (the store fields the payload carries), Current is checked, and the loaded save name is
   the pre-pick one.
4. **A save pick still waiting, then Current:** the change is cancelled, nothing runs at the cover, and the paused
   world is not torn down.
5. **Theme on Current first, then a save, then Current:** the restored world carries the theme, because the snapshot
   followed.
6. **New Transmission pick:** lands the drawn name and coordinates under Classic with no aspects, and the loaded save
   is detached.
7. **Scan:** draws a new name and coordinates, selects the row, and lands them. Scan with New Transmission already
   selected draws again. Current's label never changes.
8. **Re-clicking the selected row:** does nothing (no world change requested).
9. **Leaving an edited save and picking it again:** reloads it as stored, and the tail is gone.
10. **The readout:** for New Transmission it names the rolled style and coordinates. For an edited save it names the
    save under the live loading.
11. **Keep with a snapshot:** saves the snapshot payload, not the live one. A Current that was a save overwrites that
    save. `currentLoadedSessionName` is unchanged. Keep then dims.
12. **The dirty read with a snapshot:** follows the snapshot, not the live world (a clean Current and an edited save
    → Keep dimmed).
13. **Rewritten:** R3's Current-cancel cases and F12's "row drops to Current after a laid-over loading" case are
    rewritten to the new rules. Roll's cases become Scan's.

**`sessionStore.test.ts`:** `keepWorld` with a name overwrites, and with null writes a fresh unused name, touching
no session field. `isPayloadDirty` agrees with `isWorldDirty` for the live payload.

**Mutants** (at least):

- the snapshot taken on mount instead of on leaving (case 5 fails);
- `setPick(CURRENT_PICK)` left in the theme or aspect handlers (case 2);
- Keep saving the live payload (case 11);
- the cancel branch always restoring (case 4);
- the tail always shown (case 1 or 9).

**Look (Crawford):** power off on a world, Scan twice, click Calm, pick a save, click a Melody aspect, then click
Current. You're back on the world you powered off on, and Current's name never changed. Power on: it plays. Power off:
New Transmission shows a fresh draw.

**Gates:** `npm run build:types`, `npm run lint` and `npm test` clean, and `npm run build` clean.

---

## 6. Git & Workflow Context

- **Branch:** `feature/off-screen-current`, off `main` after `docs/archive-roadmap-57` merges. Or off that branch if
  Crawford wants it to carry this intent and spec; his call.
- **Commits:** `off-screen-current T<n>: …`, one per task, RED first, `Co-Authored-By` as the reminder gives.
- **PR:** Crawford opens it.

---

## 7. Open Questions & Risks

**Open questions** (each has a default the plan will use unless Crawford says otherwise):

1. **The number:** backlog 64 (the next free number on the one counter), with a line at the top of plan.md's Stage 1,
   ahead of roadmap 58? *Default: yes.*
2. **The unsaved line** (`home.off.unsavedWarning`) reads "Picking another transmission discards this world's unsaved
   changes." Under this spec, picking no longer discards Current; powering on into another row does. *Default: leave
   the copy alone and add it to backlog 62's copy entry.*
3. **The tail for a return to Classic.** describeWorld leaves Classic out of a tail. So a save stored under Calm, with
   Classic clicked, would show no tail even though it was edited. *Default: name the theme in the tail whenever it
   differs from the row's own, Classic included ("Harbour Song · Classic").*

**Risks:**

| Risk | Impact | Mitigation |
|---|---|---|
| The snapshot restore isn't byte-equal to the pre-pick world (a field `buildSessionPayload` doesn't carry) | Medium | It's the Keep + Load round trip, already tested by session storage. Case 3 compares the stores the payload carries. |
| The intent rewrite breaks a R3 rule nobody restated (Keep dims while waiting, the last click wins, the loading laid over) | Medium | R3's cases are kept, only rewritten where §1.5 changes them. The rest pass unmodified. |
| A Current restore rebuilds cold, so the next power-on starts rather than resumes | Low | Stated in §1.2 and inherent to roadmap 57. The still-waiting case cancels and keeps the paused world. |
| `buildSessionPayload` on leaving Current costs a frame on the phone | Low | It runs once per departure, as Keep already does at a click. |
