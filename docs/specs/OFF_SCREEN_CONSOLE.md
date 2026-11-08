# Phase Spec: The Off Screen as the Console — one place to make, load, keep, share and delete a world

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests: `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/stores/sessionStore.test.ts src/utils/sessionStorageEngine.test.ts src/components/panels/screen/nav src/components/panels/screen/screens/FleetParamsScreen.test.tsx src/content`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`

Intent: [docs/intent/off-screen-console.md](../intent/off-screen-console.md), confirmed with Crawford on 2026-11-08
after an `idea-refine` pass. It reworks the screen roadmap
[57](../todo/archive/roadmap-archive.md#57-the-off-screen-power-as-pause-the-two-axis-chooser-keep-and-the-band-table)
built and backlog 64 ([spec](OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md)) revised, and retires two Settings tabs
roadmap 45 laid out ([LAYOUT_REWORK.md](LAYOUT_REWORK.md) §1.8). Backlog number 71 (the next free on the one counter);
its entry and plan.md line are written when Crawford names the stage.

**Status: draft**, 2026-11-08, awaiting Crawford's review.

Written for: Crawford, and the agent that plans and builds it.

---

## 0. Scope check

The intent bundles two capabilities that could ship and be verified apart, so they are named here and the plan slices
along the line between them. Crawford asked for one spec file; this is it, in two parts.

| Module id | Responsibility | Depends on |
|---|---|---|
| `off-screen-console` | The off screen's left column: the New Transmission editor, the collapsible Transmissions list, the action row, Share on the readout, the Device section. §1.1–§1.8. | — |
| `settings-retirement` | Audio Quality moves to Fleet Params; the Settings branch, `SettingsScreen`, `SectorSettingsDrawer`, `SessionsPanel` and `SessionListItem` leave; docs follow. §1.9. | `off-screen-console` (nothing is removed until the off screen does its job) |

Build order: `off-screen-console` → `settings-retirement`. The first part is complete and reviewable before the second
deletes anything; the second is mostly deletion and gets few tests (CLAUDE.md: a task that only deletes gets no test).

---

## 1. Overview & Claude Explanation

The off screen (`src/components/panels/screen/screens/OffScreen.tsx`) becomes the only place a world is made, loaded,
edited, saved, shared or deleted. Today three places overlap: the off screen's chooser, Foundry (Settings → Seeds:
style name, coordinates, Random, Retransmit, Copy link) and Save & Share (Settings → Sessions: a name field, Save,
Share live, a list with Load / Share / Delete per row, Factory Reset). The off screen absorbs the lot, loses what the
absorption makes redundant (a Load button, a Keep button, per-row buttons, a standing warning line), and hides the
stored worlds behind a collapsed header so the common case stays short.

The first-visit screen (the etched label, the power hint, the footer, shown while `hasHeardWorld()` is false) does not
change. Everything below is the returning visit.

### 1.1 The layout

The desk keeps `.off-screen__axes`, two equal columns under the etch, the readout spanning both. The phone stacks the
left column, then the right, as today.

```text
┌─ left: which world ─────────────────┐  ┌─ right: how it loads ──────────────┐
│ New Transmission            [Scan]  │  │ Trace Type · select one            │
│ [ style name          ] [x   ][y  ] │  │ (theme row)                        │
│                                     │  │ (theme description)                │
│ ▸ Transmissions · Harbour Song · 5  │  │ Trace Aspects · select many        │
│   (collapsed; open: the list)       │  │ (six family rows + descriptions)   │
│   [Save] [Rename] [Delete]          │  │                                    │
│                                     │  │                                    │
│ ▸ Device                            │  │                                    │
│   (collapsed; open: Factory Reset)  │  │                                    │
└─────────────────────────────────────┘  └────────────────────────────────────┘
          [ AS · (x, y) · Theme · aspects ]  [Share]
          (status slot: "copied" / a failure line / empty, height held)
```

The right column's content and behaviour are unchanged by this spec: the theme row, its description, the aspects title
and the six family rows do what [UI_SHELL.md](../UI_SHELL.md#the-off-screen) says. Nothing here touches the Loading
axis's handlers.

### 1.2 The New Transmission editor

A titled group (a `DualLabel`, "New Transmission"), a `TextInput` for the Attenuation Style name, a `CoordsInput` for
the coordinates, and Scan as a muted `Button` in the title row. It replaces the New Transmission *row* and its trailing
Scan; `RadioButton`'s `trailing` slot is no longer used on this screen.

- **The inputs hold a draft of the live identity.** On mount they show the live world's style name and coordinates
  (Current's). Whenever the live identity changes from elsewhere (a pick lands, a Current restore, a Scan), the draft
  re-syncs to it, Foundry's way (`lastSeen` comparison during render, `SectorSettingsDrawer.tsx`). While a world
  change waits under the wash the draft shows the intent's identity, as the Loading rows show the intent's loading. A
  draft the user is mid-edit on (differs from what it last synced to) is not overwritten by a sync; the next sync
  after commit is.
- **There is no draw on mount.** Today New Transmission draws a random world when the screen opens. Under this spec
  the editor opens on the live world, and Scan is the draw. (Assumption 1; the mount draw was only there because a
  row needs a label.)
- **A commit is a pick.** Enter in either input, or blur out of the editor group, commits the draft. A commit whose
  identity equals what the editor last synced to does nothing (Foundry's `retransmitChangesWorld` guard). A commit
  that differs selects New Transmission and does exactly what picking the New Transmission row does today: the
  snapshot is taken if there is none (§1.3), the change waits under the wash, then
  `retransmitWorld({ attenuationStyleName, coordinates, theme: 'classic', aspects: {} })` and
  `detachLoadedSession()`. A blank name commits as no name, as `retransmitWorld` reads it. A coordinate field left
  blank or non-numeric is `CoordsInput`'s own guard and never reaches the commit.
- **Scan** draws `generateRandomAttenuationStyleName()` at `randomCoordinate()`s into both inputs and commits in one
  go, from any selected row.
- **Selected state.** New Transmission is selected when the last landed or waiting world is the editor's (the pick's
  value is `NEW_VALUE`, which no list row carries, so no row is checked). The editor group wears the list row's
  selected fill (`data-selected`) in that state and the collapsed header names "New Transmission" (§1.4). A theme or
  family click with New Transmission selected keeps it selected and edits the live world in place, as for any other
  row.
- **The wash rule (R3) stands.** A commit made while a change waits joins the waiting intent, the last world click
  winning. A theme or family click made while it waits joins the intent's loading.

### 1.3 One list of every world you could load

Inside the collapsible Transmissions section (§1.4), one `RadioButton` in the `list` appearance:

1. **Current**, first: the world you powered off on. Its eyebrow (`loreLabel`) reads "Current" while a save matches
   it, and "Current · unsaved" while none does (the dirty read: `isWorldDirty()` with no snapshot,
   `isPayloadDirty(snapshot.payload, snapshot.loadedName)` with one). The snapshot, the restore under the wash, the
   cancel of a still-waiting change and the naming from the snapshot are unchanged from
   [OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md](OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md) §1.1–§1.3.
2. **Saved Transmissions**, newest first, under that `headingBefore` while there are any, each with its "saved …"
   `meta`, named `<name> · <world>`, with the live loading tail when its loading has drifted (§1.3 of the earlier
   spec). Picking one is loading it: `applySessionPayload` under the wash, the session names moving with it. **There
   is no Load button.**
3. A divider (`dividerBefore`, only when there are saves), then **Preset Transmissions** under their heading: the
   three presets as today, read-only (they have no Rename and no Delete; §1.5).

Re-clicking the selected row does nothing. The address bar follows every landed world (`mirrorWorldToUrl`) as today.

### 1.4 The two collapsible sections

Two sections in the left column, under the editor: **Transmissions** (the list and the action row) and **Device**
(Factory Reset). Each is a header `Button` (muted, single face, `aria-expanded`, `aria-controls`) over a body that is
in the DOM only while open, the lazy mount `SectionTabs` already uses. Both start collapsed on every mount; the open
state is component state and is not persisted (assumption 6).

- **The Transmissions header** reads its title, the selected row's name and the count of stored worlds (saves plus
  presets): "Transmissions · Harbour Song · 7", through one `fill` template. When New Transmission is selected the
  name is "New Transmission"; when Current is, "Current". The header holds one line at every width (the name wraps
  inside a fixed height with `text-overflow`), so opening and closing moves only the body.
- **The Device header** reads "Device". Its body is the Factory Reset `Button` with its lore label, behind the
  `AlertDialog` confirm `SessionsPanel` has today (portalled into `ScreenViewport`, focus returned to the opener).
  On confirm: `localStorage.clear()`, `currentLoadedSessionName` to null, the saves re-read. The device flag goes
  with the rest of storage, so the screen re-reads `hasHeardWorld()` and shows the first-visit view at once
  (assumption 4).
- **Focus after a power-off** (R25) lands on the Transmissions header when the list is collapsed, since the selected
  row is not in the DOM; on the selected row when it is open.
- No `Accordion` and no `Collapsible` from Radix: the pair is two independent disclosures, which a button and a
  conditional render give without a dependency (assumption 6). `IntroPanel`'s expander is the precedent for an
  expander that is not an accordion.

### 1.5 The action row

One row at the list's foot, inside the Transmissions section, where Keep sits today: **Save**, **Rename**, **Delete**,
three muted `Button`s, each acting on the selected row. An inert one is `disabled`, dimmed in place; the row never
loses a button.

| Selected | Save | Rename | Delete |
|---|---|---|---|
| Current, no snapshot | `keepCurrentWorld()`: the live world under its loaded save's name, else a fresh unused name (R6). Enabled while `isWorldDirty()`. | dimmed | dimmed |
| Current, with a snapshot | `keepWorld(snapshot.payload, snapshot.loadedName)`; the snapshot carries the name it got. Enabled while `isPayloadDirty(…)`. | dimmed | dimmed |
| A save | `keepCurrentWorld()`: the live world (its edited loading included) overwrites the save, since the save is the loaded one. Enabled while `isWorldDirty()`. | enabled | enabled |
| A preset | `keepCurrentWorld()`: the live world (the preset, with any edits) under a fresh unused name; the selection moves to the new save's row. Always enabled. | dimmed | dimmed |
| New Transmission | the same: the typed world under a fresh name; the selection moves to the new row. Always enabled. | dimmed | dimmed |
| Any, while a change waits under the wash | dimmed | dimmed | dimmed |

- **Save** re-reads the saves afterwards so the new row appears, and re-reads the dirty flag. A save the storage
  refuses writes the failure line into the status slot (§1.6), never a throw into the click (R20). The eyebrow on
  Current turns from "unsaved" to plain as the dirty read clears.
- **Rename** turns the selected row's name into an inline `TextInput` in the row, prefilled, focused and selected.
  Enter or blur commits; Escape cancels; a blank or unchanged name reverts. A name another save already has is refused:
  the input reverts and the status slot says so (one content line; assumption 3). The commit is
  `renameNamedSession(from, to)` in `sessionStorageEngine.ts`: the entry re-keyed, `savedAt` and payload kept. The
  session names follow: `currentLoadedSessionName` when it was `from`, the snapshot's `loadedName` when it was `from`.
  The list re-reads; the row stays selected under its new name.
- **Delete** removes the save at once, no confirm (the intent's decision; `deleteNamedSession`). The live world
  stands. If the deleted save was the loaded one, `detachLoadedSession()`; if it was the snapshot's, the snapshot's
  `loadedName` goes null (Current reads "unsaved"). The selection, now matching no row, falls to New Transmission: the
  editor already mirrors the live identity, so it reads as the deleted save's world, selected, and the readout names
  it (assumption 2). No world change and no wash.
- The three buttons carry an `accessibleName` naming the row they act on ("Delete Harbour Song"), as
  `SessionListItem`'s buttons do today.

### 1.6 Share on the readout, and the status slot

The readout (`role="status"`, `describeWorld` of the selected row's world as today) gains **Share**, a muted `Button`
beside it. Share copies the link for whatever the readout names, through `useShareStatus` and `copySessionLink`:

- Current with a snapshot: the snapshot's payload.
- Everything else: `buildSessionPayload()`, the live world. An edited save shares its edited loading; a landed preset or
  New Transmission shares what landed.
- While a change waits under the wash, Share is dimmed: the intent is not yet a world.

Share Live, Share Save and Copy link collapse into it: one encoder, one button.

The **status slot** is one line under the readout, the height the warning line holds today (one line on the desk, two
on the phone), and shows at most one of: "copied" (`role="status"`, auto-dismissed after `useShareStatus`'s 5 s), the
copy failure, the save failure, the rename refusal (`role="alert"` for the failures). Empty otherwise. The standing
unsaved warning (`home.off.unsavedWarning`) goes: Current's eyebrow says it.

### 1.7 Row labels and the readout

Unchanged from the earlier spec's §1.3: `describeWorld`, `describeLoading` and `withTail` name the rows and the
readout, Current from the snapshot or the live stores, a save or preset from its own payload with the live loading
tail when it differs, New Transmission from the editor's committed identity (the readout, not a row, since it has no
row).

### 1.8 Content

New entries in `src/content/copy/home.ts`, every one a stand-in until Crawford's copy (backlog 62): the Transmissions
header template (`home.off.transmissionsHeader`, "Transmissions · {name} · {count}"), `home.off.device`,
`home.off.save`, `home.off.rename`, `home.off.delete`, `home.off.share`, `home.off.unsavedEyebrow` ("Current ·
unsaved"), `home.off.renameTaken` ("a save already has that name"). Reused from elsewhere: `sector.attenuationStyle`,
`sector.coords`, `sector.coords.x`, `sector.coords.y` for the editor's inputs; `session.clearStorage` and its confirm
copy, `session.status.linkCopied`, `session.status.copyFailed`, `session.status.saveFailed` for the slot. Removed
with the features they named: `home.off.keep`, `home.off.keepFailed` (superseded by `session.status.saveFailed`),
`home.off.unsavedWarning`, `home.off.scan` stays. §1.9 lists the retirement's removals.

### 1.9 The retirement (`settings-retirement`)

- **Audio Quality moves to Fleet Params** as the eighth section, last after Output: `'quality'` joins
  `FleetParamsGroup`, `FLEET_PARAMS_GROUP_CONTENT` and `FleetParamsScreen`'s `SECTION_ITEMS`, rendering `AudioLoadPanel`
  with its intro (the `settings.quality` entry, which carries one), in the seed trait, with no sub-tabs (like Pacing).
  The content keys move to `fleet.ts` as `fleet.quality*` (assumption 5); `settings.ts` is deleted.
- **The Settings branch leaves the nav.** `NavPanel` shows four boxes (Deck, Fleet Params, Probes, Companies).
  `'settings'` leaves `TopLevelBranch`, `HubTile` and `NavBranch`; `ConsolePanel`'s `Record<HubTile, …>` loses its
  entry; `selectedSettingsLeaf`, `SettingsLeaf`, `setSelectedSettingsLeaf`, `SETTINGS_LEAVES`, `SETTINGS_LEAF_CONTENT`,
  `DEFAULT_SETTINGS_LEAF`, `activeSettingsLeaf` and the breadcrumb's Settings branch go. The nav box's trait table and
  the content keys `settings.root`, `settings.seeds`, `settings.sessions` go.
- **Deleted:** `SettingsScreen.tsx/.css` and its two test files, `SectorSettingsDrawer.tsx/.css/.test.tsx`,
  `SessionsPanel.tsx/.css/.test.tsx`, `SessionListItem.tsx/.css/.test.tsx`, `sectorSettingsConfig.ts` (its
  `ATTENUATION_STYLE_SCHEMA` and `COORDS_SCHEMA` move to where the editor builds its schemas), the `session.*` keys and
  `sessionConfig.ts` schemas nothing reads any more (`session.name`, `session.save`, `session.shareLive`,
  `session.load`, `session.share`, `session.saved`, `session.delete.confirm*`, `session.status.saved`), and the
  `sector.*` keys the editor does not reuse (`sector.retransmit`, `sector.status`, `sector.copyLink`,
  `sector.random.*`). `useShareStatus.ts` moves beside the off screen or to `src/hooks/`, its only consumer now.
- **Docs:** UI_SHELL.md (the nav panel's five boxes become four, the screens table loses `SettingsScreen` and gains
  Fleet Params' eighth tab, the off screen section rewritten), SESSION_STORAGE.md (the Save & Share paragraphs become
  the off screen's), COMPONENT_LIBRARY.md (the consumers it names), CLAUDE.md's UI_SHELL and SESSION_STORAGE
  reference lines, and `docs/sketches/off-screen.html` gains a frame for the new left column before the build.

---

## 2. Target File Structure

```text
src/
├── components/panels/screen/screens/
│   ├── OffScreen.tsx              # the editor, the two disclosures, the action row, Share, the Device confirm
│   ├── OffScreen.test.tsx         # Keep / New Transmission row / Scan / warning cases rewritten; the new cases (§5)
│   ├── OffScreen.css              # editor group, disclosure header, action row, status slot; warning rules removed
│   └── FleetParamsScreen.tsx      # the eighth section (retirement)
├── components/panels/screen/nav/
│   ├── navActions.ts              # Settings tables and branch removed; FLEET_PARAMS_GROUP_CONTENT.quality
│   ├── navActions.test.ts
│   └── NavPanel.tsx               # four boxes
├── components/panels/screen/console/
│   ├── ConsolePanel.tsx           # no settings tile
│   ├── useShareStatus.ts          # moved (see §1.9) or left; the plan decides
│   └── (SettingsScreen, SectorSettingsDrawer, SessionsPanel, SessionListItem deleted)
├── stores/
│   ├── uiStore.ts                 # FleetParamsGroup + 'quality'; SettingsLeaf and its field removed
│   ├── sessionStore.ts            # unchanged API; keepWorld / keepCurrentWorld / detachLoadedSession as they are
│   └── sessionStore.test.ts
├── utils/
│   ├── sessionStorageEngine.ts    # renameNamedSession
│   └── sessionStorageEngine.test.ts
├── data/
│   ├── sectorSettingsConfig.ts    # deleted; the two input schemas move to OffScreen's constants
│   └── sessionConfig.ts           # CLEAR_STORAGE_SCHEMA kept, the rest removed
└── content/copy/
    ├── home.ts                    # §1.8's entries
    ├── fleet.ts                   # fleet.quality*
    ├── sector.ts                  # the four input entries only
    ├── session.ts                 # clearStorage*, status.linkCopied/copyFailed/saveFailed only
    └── settings.ts                # deleted
docs/
├── UI_SHELL.md, SESSION_STORAGE.md, COMPONENT_LIBRARY.md, CLAUDE.md   # §1.9
├── sketches/off-screen.html       # a frame for the new left column
└── todo/                          # backlog 71's entry, its plan.md line
```

`systems/`, `animation/`, `worldChange.ts`, `worldTransition.ts` and `describeWorld.ts` are used as they are.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. The right column's handlers (`onThemeChange`, `onFamilyChange`) are not touched.
- **Runtime only:** the snapshot, the editor's draft, the disclosures' open state and the rename input's draft live in
  component state or refs, never in a Zustand store, a save or the link.
- **The guardrails stand:** a theme or aspect change is re-derived in place and rebuilds nothing; a world change goes
  under the wash; nothing here schedules audio or reads a timer (the 5 s dismiss in `useShareStatus` is UI, not
  musical timing, and is already in the codebase); the address bar mirrors at the end of every `retransmitWorld`; all
  interactive UI stays inside `ScreenViewport` (the Reset confirm portals into it).
- **Existing controls keep their styling.** `TextInput`, `CoordsInput`, `Button`, `RadioButton` and `DualLabel` are
  used as they are; the only new CSS is the editor group, the disclosure header, the action row and the status slot.
  Cabinetry only on interactive things: the headers and the action row are muted, flat; the family rows stay the only
  thing that pops.
- **Controls hold their largest size** (Crawford's rule): the header's one line, the status slot's height, the action
  row's three buttons and the readout's `min-height` never change on a content flip.
- **Dim, never hide**: an inert action is `disabled` in place.
- **Content through the content layer:** every string in §1.8 is an entry; ESLint and `content.test.ts` enforce it.
- **Ask first:**
  - a Radix `Collapsible` or `Accordion` dependency (the spec assumes neither);
  - a confirm on Delete or Rename (the intent says none);
  - persisting a disclosure's open state;
  - a change to `worldChange.ts`, `sceneWash.ts` or `RadioButton`'s props;
  - keeping any of Foundry or Save & Share in the powered-on app.
- **Never:** reintroduce autosave; a display string in a component or config; a timeline, ref or synth in state.

---

## 4. Code Style & Architecture Conventions

Match `OffScreen.tsx` as it stands: module constants for schemas read through `labels()`; `useCallback` handlers that
read the waiting intent through `intentRef`; a doc comment citing the spec section it implements; the long header
comment revised in place.

```ts
// The editor's draft follows the live identity, Foundry's way: a sync compares during render and only overwrites a
// draft the user is not mid-edit on (docs/specs/OFF_SCREEN_CONSOLE.md §1.2).
const live = intent?.identity ?? liveIdentity;
const [synced, setSynced] = useState(live);
const [draft, setDraft] = useState(live);
if (live !== synced) {
  setSynced(live);
  if (deepEqual(draft, synced)) setDraft(live);
}

// A commit is a pick: nothing changed is nothing done; otherwise exactly what the New Transmission row did (§1.2).
const commitEditor = useCallback(() => {
  if (deepEqual(draftRef.current, syncedRef.current)) return;
  pickNew(draftRef.current);
}, [pickNew]);
```

The action row's dim matrix (§1.5) is one pure function of `(pick, snapshot, dirty, waiting)` returning three
booleans, so the test pins the table directly.

---

## 5. Testing & Verification Requirements

Vitest + Testing Library, colocated. RED first, one commit per task. A task that only deletes, or changes docs, CSS or
copy, gets no test and names a look as its proof. Each new gate is mutation-checked by hand.

**`OffScreen.test.tsx`** (the wash attached where a case needs a wait):

1. **On open:** the editor shows the live world's style and coordinates; no row is New Transmission; Current is
   checked; the Transmissions header is collapsed and names Current and the count; Device is collapsed.
2. **Editor commit:** a typed name + Enter lands that world under Classic with no aspects, detaches the save, and the
   editor reads selected. An unchanged commit requests no world change. Blur commits as Enter does.
3. **Editor sync:** a save pick lands → the editor shows the save's style and coordinates. Mid-edit, a landing pick
   does not overwrite the draft; after commit, the next sync does.
4. **Scan:** draws into both inputs and lands, from any selected row; a second Scan draws again.
5. **The waiting intent:** an editor commit while a change waits joins it (last click wins); the editor shows the
   intent's identity while it waits.
6. **The header:** opening reveals the list with the selected row checked; the header's text names the selected row
   and updates on a pick; collapsing keeps the pick. Focus after a power-off lands on the header when collapsed.
7. **The dim matrix:** every row of §1.5's table, Save / Rename / Delete `disabled` as it says, including all three
   dimmed while a change waits.
8. **Save:** on Current with a snapshot saves the snapshot (the earlier spec's case 11); on an edited save overwrites
   it; on a preset and on New Transmission writes a fresh name and moves the selection to the new row. A refused save
   writes the failure line into the slot.
9. **Rename:** the row's name becomes an input; Enter re-keys the save with `savedAt` kept, the row stays selected,
   `currentLoadedSessionName` follows when it was the loaded save, the snapshot's `loadedName` follows when it was
   the snapshot's; Escape, blank and unchanged revert; a taken name reverts with the refusal line.
10. **Delete:** the save is gone at once with no dialog; the loaded save detaches; the snapshot's name clears and
    Current reads "unsaved"; the selection falls to New Transmission with the editor showing the live identity; no
    world change is requested.
11. **Share:** copies the snapshot's payload on Current with a snapshot, else `buildSessionPayload()`; "copied" shows
    in the slot and is gone after the dismiss; dimmed while a change waits.
12. **The eyebrow:** "Current · unsaved" while dirty, "Current" after a Save.
13. **Device:** Factory Reset is behind the confirm; confirming clears storage, detaches, and the screen shows the
    first-visit view.
14. **Rewritten:** the Keep cases (spec assumption 14, Task 6), the New Transmission row and trailing Scan cases
    (Task 5), the warning line cases (R26) and R25's focus case are rewritten to these rules. Every R3, F12, Current
    and family-row case not named here passes unmodified.

**`sessionStorageEngine.test.ts`:** `renameNamedSession` re-keys, keeps `savedAt` and payload, is a no-op when `from`
is missing, and refuses (returns false, writes nothing) when `to` exists.

**`navActions.test.ts`, `NavPanel.test.tsx`, `FleetParamsScreen.test.tsx`, `uiStore.test.ts`:** the Settings cases
removed; four nav boxes; Audio Quality is Fleet Params' last tab, its breadcrumb reads Root / Fleet Params / Audio
Quality.

**Mutants** (at least): the editor syncing over a mid-edit draft (case 3); the unchanged commit requesting a change
(case 2); Save on New Transmission saving the snapshot (case 8); Rename dropping `savedAt` (engine); Delete leaving
the loaded name attached (case 10); Share while waiting enabled (case 11); the header text frozen on mount (case 6).

**Look (Crawford):** power off on a world. The editor shows it; type a new name, Enter: the wash, the new world,
the editor selected, the header says New Transmission. Open Transmissions: no row checked. Pick a save: the editor
follows, the header names the save. Click a theme: the save's label gains the tail. Save: the row stays, the eyebrow
on Current unchanged. Rename it, Delete it: the editor is selected, holding its world. Share: "copied". Open Device,
Reset, confirm: the first-visit screen. Power on: the live world plays. On a phone: the same, stacked, the header one
line at 320 px.

**Gates:** `npm run build:types`, `npm run lint` and `npm test` clean, and `npm run build` clean. Checkpoints between
the two modules and before the retirement's deletions, each a look by Crawford.

---

## 6. Git & Workflow Context

- **Branch:** `feature/off-screen-console`, off `main` after the intent and this spec merge (they sit on
  `docs/off-screen-console-intent`). One branch for both modules, or a second `feature/settings-retirement` after the
  first merges; Crawford's call at the first checkpoint.
- **Commits:** `off-screen-console T<n>: …`, one per task, RED first, `Co-Authored-By` as the reminder gives.
- **PR:** Crawford opens it.

---

## 7. Assumptions, Open Questions & Risks

**Assumptions** (each has a default the plan uses unless Crawford says otherwise):

1. **No draw on mount.** The editor opens on the live world; Scan is the only draw. *Default: yes.* The alternative
   (a random draft on mount) would mean the editor shows a world that is not live while no row is selected, which
   reads as a lie.
2. **After Delete of the selected save, the selection falls to New Transmission** with the editor mirroring the live
   identity. *Default: yes.* The alternative is to fall to Current, but selecting Current means restoring it, a world
   change the user did not ask for.
3. **A rename to a taken name is refused**, the input reverts and the slot says so. *Default: yes.* Overwriting would
   silently delete another save.
4. **Factory Reset on the off screen flips the gate at once**: the chooser gives way to the first-visit view without a
   reload. *Default: yes.*
5. **Audio Quality is Fleet Params' last tab**, and its content keys become `fleet.quality*`. *Default: yes.*
6. **The disclosures are a muted `Button` with `aria-expanded` over a conditionally rendered body**, no Radix
   `Collapsible`, open state in component state, both collapsed on every mount. *Default: yes.*
7. **The Transmissions count** is saves plus presets. *Default: yes.*
8. **Save on a preset or New Transmission moves the selection to the new save's row**; Save on Current or on an
   edited save leaves it. *Default: yes.*
9. **`useShareStatus` moves** to `src/hooks/` since the off screen becomes its only consumer. *Default: yes.*

**Open questions:**

1. The stage in plan.md and whether backlog 71's entry is written now or at the plan. *Default: entry now, stage
   Crawford's.*
2. The sketch frame: Crawford draws it, or the agent drafts it for his look. *Default: the agent drafts it as the
   plan's Task 0.*

**Risks:**

| Risk | Impact | Mitigation |
|---|---|---|
| The editor's draft-versus-live sync fights the wash: a commit lands, the intent clears, the live identity changes, and the sync overwrites a draft the user started during the wash | Medium | The sync leaves a dirty draft alone (§1.2); case 3 pins it. |
| `OffScreen.tsx` grows past readable: the editor, two disclosures, an inline rename and a confirm in one 750-line file | Medium | The plan extracts `TransmissionEditor`, `Disclosure` and `TransmissionActions` as children in the same folder, each with its own test file where it has behaviour. |
| Deleting the Settings branch breaks a path the Guide (roadmap 51) or a link arrival expects | Low | `ConsolePanel`'s `Record<HubTile, …>` makes a missing tile a compile error; the link arrival never names a branch. |
| A rename of the loaded save while a snapshot also names it leaves one of the two stale | Medium | One `renameFollowers(from, to)` step updates both; case 9 covers both names. |
| Collapsing the list hides a checked row from a screen reader's first pass | Low | The header's text names the selected row, and the `RadioButton` keeps its group semantics when open. |
| The phone's left column, with two headers and an editor, is longer than the row it replaces | Low | Both sections start collapsed; measured at 320 px as the look's last step. |
