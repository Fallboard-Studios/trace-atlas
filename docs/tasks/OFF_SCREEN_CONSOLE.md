# Implementation Plan: The Off Screen as the Console

Source spec: [docs/specs/OFF_SCREEN_CONSOLE.md](../specs/OFF_SCREEN_CONSOLE.md). Source intent:
[docs/intent/off-screen-console.md](../intent/off-screen-console.md). Backlog
[71](../todo/backlog.md#71-off-screen-the-console--the-one-place-a-world-is-made-loaded-kept-shared-or-deleted), first
line of plan.md's Stage 1. Sketch: `docs/sketches/off-screen.html`, frame F (drafted 2026-11-08).

Written for: Crawford, and the agent that builds it.

## Overview

Two modules in order (spec §0). **`off-screen-console`** (Tasks 1–11) reworks the left column of
`src/components/panels/screen/screens/OffScreen.tsx`: one engine function for Rename, a `Disclosure` component and the
two collapsible sections, the New Transmission editor in place of the row, Current's eyebrow and the status slot, the
Save / Rename / Delete action row in place of Keep, Share on the readout, then a layout pass against frame F. Every task
leaves the screen working and the suite green; the Settings tabs keep working beside it until the second module.
**`settings-retirement`** (Tasks 12–16) moves Audio Quality into Fleet Params, takes the Settings branch out of the nav,
deletes Foundry, Save & Share and their configs, moves `useShareStatus`, and brings the docs up to date. The first
module is complete and reviewable at Checkpoint A before the second deletes anything.

Almost all behaviour work is in `OffScreen.tsx` and `OffScreen.test.tsx` (2,670 lines today). Each behaviour task goes
RED first there, rewrites the existing cases its rule contradicts, and names them, so the diff shows which old promise
changed. Spec §5 case 14 lists the rewrites; the blocks are named in the tasks below by their `describe` titles.

## Architecture Decisions

- **The nine assumptions stand at their defaults** (spec §7; Crawford approved 2026-11-08 without overriding any):
  no draw on mount; Delete falls to New Transmission; a taken rename is refused; Factory Reset flips the gate at once;
  Audio Quality is Fleet Params' last tab with `fleet.quality*` keys; the disclosures are a muted `Button` over a
  conditional render, no Radix `Collapsible`; the count is saves plus presets; Save on a preset or New Transmission
  moves the selection to the new row; `useShareStatus` moves to `src/hooks/`. (Since Checkpoint A there are no
  presets, so the count is the saves and only New Transmission's Save moves the selection.)
- **Enter and blur are caught on the editor group, not in `TextInput`.** `TextInput` (`src/components/ui/controls/
  TextInput.tsx`) takes `schema`, `value`, `onChange`, `numeric` and `disabled` only: no key or blur props, and spec §3
  says the controls are used as they are. React's `onKeyDown` and `onBlur` bubble, so the editor's wrapping `div`
  commits on Enter (any input) and on a blur whose `relatedTarget` is outside the group. The rename input does the
  same for Enter, Escape and blur, and is focused and selected through a wrapper ref's `querySelector('input')` in an
  effect. No control gains a prop.
- **The rename input renders through `RadioButton`'s `trailing` slot** on the selected save's row (spec §1.5, "an
  inline `TextInput` in the row"). The slot exists (`OffScreen.tsx` uses it for Scan today), it renders beside the
  radio and outside it (review R8), so the row keeps its radio semantics and `RadioButton`'s props stay untouched
  (spec §3's ask-first list). Spec §1.2's "the `trailing` slot is no longer used on this screen" described Scan's move
  and is amended by Task 8; Open Question 1 flags it for Crawford at Checkpoint A, with the alternative.
- **Three children come out of `OffScreen.tsx`** (spec §7 risk 2): `Disclosure.tsx` (the header button and lazy body,
  Task 2), `TransmissionEditor.tsx` (the inputs, the draft sync and the commit, Task 4) and `offScreenActions.ts` (the
  pure dim matrix of spec §4, Task 7), each beside `OffScreen.tsx` with its own test where it has behaviour. The action
  row's handlers stay in `OffScreen.tsx`: they read the snapshot, the intent and the saves, which live there.
- **The New Transmission pick after a Delete carries the live identity whole** (seed, plot and the live loading), not
  `NEW_LOADING`: the editor mirrors the live world, and the readout names it with no tail (spec §1.5, assumption 2). A
  commit or a Scan from there is `NEW_LOADING` as today.
- **Spec §2 is amended for the Audio Quality keys' readers.** `settings.quality*` is read by `src/data/audioRigConfig.ts`
  (the Preset, Voice Limit, Effects Limit and Audio Load schemas) and `src/utils/audioBudget.ts` (`describeLimits`), and
  by `AudioLoadPanel.test.tsx` and `AudioRigDrawer.test.tsx`; the spec's §2 lists none of them. Task 12 renames the
  keys in all four. `CONTENT_AREAS` (`src/content/types.ts`) drops `'settings'` when `settings.ts` goes (Task 14), and
  `src/content/index.test.ts` line 183 follows.
- **Test fixtures stop naming Settings before the branch goes.** Nine test files use `'settings'` as an incidental
  `HubTile` (listed in Task 13). Switching them to another tile first is a test-only change that keeps the suite green,
  so Task 14's removal is one clean commit.
- **Content entries land with their first consumer.** Each task adds the §1.8 entries it reads and removes the ones its
  feature retires, so `content.test.ts` and ESLint pass at every commit.
- **Order.** Task 1 (engine) has no dependant until Task 8. Tasks 2 → 3 build the sections round the list as it is.
  Task 4 → 5 replace the row with the editor. Task 6 (eyebrow, slot) is independent of 4–5 but is sequenced after them
  because both rewrite the Keep block's warning cases. Task 7 needs 6 (the slot takes the save failure); 8 needs 1 and
  7; 9 needs 7; 10 needs 6. Task 11 is the look over all of it. Module B starts at 12 and is strictly sequential.

## Dependency Graph

```
Task 0 (record)

Task 1 (engine: renameNamedSession)      Task 2 (Disclosure + Transmissions section)
        │                                          │
        │                                  Task 3 (Device section: Factory Reset, the gate)
        │                                          │
        │                                  Task 4 (the editor replaces the row; Scan)
        │                                          │
        │                                  Task 5 (commit on Enter/blur; draft sync; the intent)
        │                                          │
        │                                  Task 6 (Current's eyebrow; the status slot)
        │                                          │
        │                        ┌─────────────────┴─────────────────┐
        │                        │                                   │
        │                Task 7 (action row: dim matrix, Save)   Task 10 (Share on the readout)
        │                        │                                   │
        └────────────── Task 8 (Rename — needs 1 + 7)                │
                                 │                                   │
                        Task 9 (Delete)                              │
                                 └──────────────┬────────────────────┘
                                        Task 11 (layout look, frame F)
                                                │
                                   ═══ Checkpoint A: off-screen-console ═══
                                                │
                        Task 12 (Audio Quality → Fleet Params; fleet.quality*)
                                                │
                        Task 13 (test fixtures stop naming Settings)
                                                │
                        Task 14 (the Settings branch leaves; SettingsScreen deleted)
                                                │
                        Task 15 (Foundry, Save & Share, configs, keys deleted; useShareStatus moves)
                                                │
                        Task 16 (docs)
```

## Task List

Every task names its **Proof**: **RED test** for a behaviour change, **Look** for a visual one, **Read** for docs, copy or
deletion. Only a RED-test task lists a `*.test.ts(x)` in its Files. Commits: `off-screen-console T<n>: …`, one per task,
RED first, `Co-Authored-By` as the reminder gives. Branch: `feature/off-screen-console` off `main` once the intent, the
spec and this plan merge (they sit on `docs/off-screen-console-intent`).

Focused run for module A: `npx vitest run src/components/panels/screen/screens src/stores/sessionStore.test.ts
src/utils/sessionStorageEngine.test.ts src/content`. For module B add `src/components/panels/screen/nav
src/components/panels/screen/console src/stores/uiStore.test.ts`.

### Phase 0: Record

- [x] **Task 0: `docs/` — point the status lines at this plan**

  **Description:** The spec's header ("Plan not yet written"), backlog 71's **Status** line and plan.md's Stage 1 line
  all say "plan next". Each gains a link to this file. Nothing else changes.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] The three lines link `docs/tasks/OFF_SCREEN_CONSOLE.md` and no longer say the plan is pending.

  **Verification:**
  - [x] Every link resolves.

  **Dependencies:** None. **Files:** `docs/specs/OFF_SCREEN_CONSOLE.md`, `docs/todo/backlog.md`, `docs/todo/plan.md`

  **Estimated scope:** XS (docs only)

---

### Phase 1: The engine's half of Rename

- [x] **Task 1: `sessionStorageEngine.ts` — `renameNamedSession(from, to): boolean`**

  **Description:** Spec §1.5 (Rename). Re-keys `named[from]` to `to`, setting the entry's `name` to `to` and keeping
  its `savedAt` and `payload`. Returns `true` when it re-keyed. Returns `false` and writes nothing when `from` has no
  entry, or when `to` already has one (assumption 3). `from === to` is the second case: it returns `false` and writes
  nothing. No caller yet: Task 8 wires it.

  **Proof:** RED test — `src/utils/sessionStorageEngine.test.ts`: a rename re-keys the entry with `savedAt` and payload
  unchanged and `name` updated, and `listSessions()` shows the new name only; a missing `from` returns `false` and
  storage is byte-for-byte unchanged; a taken `to` returns `false` and both entries stand unchanged.

  **Acceptance criteria:**
  - [x] The three cases pass; the existing engine cases pass unmodified.
  - [x] `loadSession(from)` is `undefined` and `loadSession(to)` is the payload after a successful rename.

  **Verification:**
  - [x] `npx vitest run src/utils/sessionStorageEngine.test.ts` passes.
  - [x] Mutants: `savedAt` reset to `Date.now()`; the taken-name guard removed (overwrites `to`); `from`'s entry left
        beside `to`'s.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None. **Files:** `src/utils/sessionStorageEngine.ts`, `src/utils/sessionStorageEngine.test.ts`

  **Estimated scope:** XS (one function, one test file)

---

### Phase 2: The two sections

- [x] **Task 2: `Disclosure.tsx` + `OffScreen.tsx` — the Transmissions section round the list**

  **Description:** Spec §1.4. A new `src/components/panels/screen/screens/Disclosure.tsx`: props `{ schema, title, open,
  onToggle, children }`; it renders a muted single-face `Button` with `expanded={open}` and `controls={bodyId}`
  (`useId`), `accessibleName={title}`, and the body `div` with that id only while open (the lazy mount `SectionTabs`
  uses; `IntroPanel` is the precedent for a non-accordion expander). The title is the button's face. In `OffScreen.tsx`
  the Transmission `RadioButton` and the actions row move inside a `Disclosure` that starts collapsed on every mount
  (component state, never persisted). Its title is `fill('home.off.transmissionsHeader', { name, count })`: `name` is
  "New Transmission" when the shown pick is `NEW_VALUE`, "Current" for `CURRENT_VALUE`, else the row's `name`; `count` is
  `saves.length + TRANSMISSION_PRESETS.length`. R25's focus effect now targets the header when the list is collapsed
  (always, on mount) and the checked row when it is open. Content added: `home.off.transmissionsHeader` (template
  "Transmissions · {name} · {count}"). The screen's header comment gains the section.

  **Proof:** RED test — `src/components/panels/screen/screens/Disclosure.test.tsx` (the button carries `aria-expanded`
  and `aria-controls`; the body is absent from the DOM while closed and present, under that id, while open; a click
  calls `onToggle`) and `OffScreen.test.tsx` (spec §5 case 6: on open the list is not in the DOM and the header names
  Current and the count; opening reveals the list with Current checked; the header's text updates after a preset pick;
  collapsing then opening keeps the pick; mounted paused, focus is on the header — rewrites R25's "selected row has
  focus" case, block "focus on the selected row after a power-off (review R25)").

  **Acceptance criteria:**
  - [x] Both sections' bodies are conditionally rendered; no Radix `Collapsible` or `Accordion` import.
  - [x] The header text is one `fill` template and re-renders on every pick and every save-list change.
  - [x] Every other `OffScreen.test.tsx` case passes, with the list opened first where a case clicks a row (a shared
        `openTransmissions()` helper in the test file, used by every existing row-clicking case).

  **Verification:**
  - [x] Focused run passes.
  - [x] Mutant: the header text computed once on mount (case 6's "updates on a pick" fails).

  **As built:** R25 had a second case in the F6 block ("a power-off still lands the focus on the selected row"),
  rewritten to the header too. The focus effect targets the header only: the list is collapsed on every mount, so a
  checked-row branch could never run there. 142 existing cases gained `openTransmissions()` after their render.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None. **Files:** `src/components/panels/screen/screens/Disclosure.tsx`, `Disclosure.test.tsx`,
  `OffScreen.tsx`, `OffScreen.test.tsx`, `src/content/copy/home.ts`

  **Estimated scope:** M (one new component, the screen, the test's row-click helper threaded through)

- [x] **Task 3: `OffScreen.tsx` — the Device section: Factory Reset behind its confirm, and the gate**

  **Description:** Spec §1.4 (Device), assumption 4. A second `Disclosure` under Transmissions, titled
  `home.off.device` ("Device"), collapsed on mount. Its body: a `DualLabel` from `session.clearStorage` and the
  `CLEAR_STORAGE_SCHEMA` `Button` (single face), opening the `AlertDialog` `SessionsPanel.tsx` has today (the confirm
  title, body, `ui.cancel` and the action from the same keys), portalled into `getScreenViewportDomNode()` when there
  is one, focus returned to the opener on close. On confirm: `localStorage.clear()`,
  `setCurrentLoadedSessionName(null)`, `setSaves(sortedSaves())`, and `heardWorld` becomes state set to
  `hasHeardWorld()` again, so the picker gives way to the first-visit view at once. `SessionsPanel` keeps its own copy
  until Task 15. The dialog's CSS classes (`clear-storage-confirm__*`, in `SessionsPanel.css`) move to `OffScreen.css`
  now, since the dialog portals out of both components' trees; `SessionsPanel.css` keeps a copy until Task 15 deletes it.

  **Proof:** RED test — `OffScreen.test.tsx` (spec §5 case 13): Device is collapsed on mount and opening it shows the
  Reset button; clicking Reset opens the confirm and clears nothing; confirming clears storage (the sessions key and
  the device flag), nulls `currentLoadedSessionName`, and the screen shows the first-visit view (the hint, no picker);
  cancelling leaves storage and the picker.

  **Acceptance criteria:**
  - [x] Reset is behind a confirm; the gate flips with no reload.
  - [x] The dialog is inside `#screen-viewport` when that node exists.

  **Verification:**
  - [x] Focused run passes.
  - [x] Mutant: `heardWorld` not re-read after confirm (the first-visit case fails).

  **As built:** no `setSaves(sortedSaves())` on confirm. The device flag always goes with `localStorage.clear()`, so the
  chooser that lists the saves unmounts in the same render and the next mount reads them afresh: the re-read could
  never be seen, and a mutant removing it would survive. Four more mutants killed: the loaded name kept, storage not
  cleared, focus not returned on Escape, the confirm never portalled. Spec §5 case 13 also gained: Device opens apart
  from Transmissions, and a confirm requests no world change.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2. **Files:** `OffScreen.tsx`, `OffScreen.test.tsx`, `OffScreen.css`, `src/content/copy/home.ts`

  **Estimated scope:** S (one section, one dialog moved)

### Checkpoint: The sections
- [x] `npm run build:types`, `npm run lint` clean; focused run green. Full suite 2026-11-08: 356 files, 13,661 tests,
      all pass (218 s, run alone).
- [x] In the browser: the off screen opens with both headers collapsed; the Transmissions header names Current and
      the count; Reset from Device, confirmed, shows the first-visit screen.
- [x] Reviewed with Crawford before Phase 3 (passed 2026-11-08).

---

### Phase 3: The New Transmission editor

- [x] **Task 4: `TransmissionEditor.tsx` + `OffScreen.tsx` — the editor replaces the row; Scan moves into its title**

  **Description:** Spec §1.2, assumption 1. A new `src/components/panels/screen/screens/TransmissionEditor.tsx`: a
  group `div` with a title row (`DualLabel` "New Transmission" from `home.off.newTransmission`, and Scan, a muted
  single-face `Button`, `SCAN_SCHEMA`), then a `TextInput` (`ATTENUATION_STYLE_SCHEMA`) and a `CoordsInput`
  (`COORDS_SCHEMA`); the two schemas move from `src/data/sectorSettingsConfig.ts` into the editor's module constants
  (Foundry imports them from there until Task 15; `sectorSettingsConfig.ts` keeps re-exporting them until then). Props:
  `{ identity: { attenuationStyleName, coordinates }, selected, onCommit(identity), onScan }`. In this task the editor
  shows `identity` (the live world's name and coordinates, or the intent's while a change waits) and holds a draft the
  user can type into, synced Foundry's way (`lastSeen` compared during render, §4's sample); the draft is not committed
  yet (Task 5), so the editor is read-and-type only. `OffScreen.tsx`: the New Transmission row and the `trailing` Scan
  go; `newWorld`, `drawWorld` on mount and `DrawnWorld` go; `onScan` draws `generateRandomAttenuationStyleName()` and two
  `randomCoordinate()`s and calls `pickNew(world)` as today; `pickNew` is unchanged. The editor wears `data-selected`
  while the shown pick is `NEW_VALUE`. The readout names New Transmission from the pick's identity as today (§1.7).
  Rewrites the row cases: block "New Transmission and Scan (Current and New Transmission, Task 5)" (the first-row,
  trailing-slot and draw-on-mount cases), "the Transmission list and Scan on New Transmission" (the trailing-slot
  cases), "the Transmission row" (the row order case), "on the phone shell (Task 28)" (the New Transmission row), and
  "only the aspect rows come off the plate" names the editor's Scan instead of the row's.

  **Proof:** RED test — `TransmissionEditor.test.tsx` (renders the live identity in the inputs; typing changes the
  draft and not `identity`; a new `identity` prop re-syncs an untouched draft; Scan calls `onScan`) and
  `OffScreen.test.tsx` (spec §5 case 1: on open the editor shows the live world's style and coordinates, no row is New
  Transmission, Current is checked, the header names Current; case 4: Scan draws into both inputs and lands under
  Classic with no aspects from Current, from a save and from New Transmission, a second Scan draws again; the editor
  carries `data-selected` only while New Transmission is the shown pick).

  **Acceptance criteria:**
  - [x] No random draw happens on mount (the seed helpers are not called until Scan).
  - [x] The list has no `NEW_VALUE` option and `RadioButton` gets no `trailing` prop from this screen.
  - [x] Every R3, F12, Current and family-row case passes, with "the New Transmission row" replaced by Scan where a
        case clicked the row to land a drawn world.

  **Verification:**
  - [x] Focused run passes (16 files, 978 tests, Foundry's two files included).
  - [x] Mutant: the editor rendering `NEW_LOADING`'s world instead of the live identity on mount (case 1 fails).
  - [x] `npm run build:types`, `npm run lint` clean.

  **As built:** the two schemas live in `transmissionEditorSchemas.ts` beside the editor, not in the component file:
  exported from a `.tsx` they drew two `react-refresh/only-export-components` warnings, and `sectorSettingsConfig.ts`
  (re-exporting them for Foundry until Task 15) would have imported a component. The editor takes no `onCommit` yet
  (Task 5 adds it with the commit). Its sync is Foundry's, overwriting the draft on any change of identity, compared by
  value since the screen builds the identity each render; Task 5's mid-edit guard goes RED against it. The editor
  already shows the waiting change's identity (this task's description), so the wash cases for it (a waiting Scan, a
  preset replacing it, a waiting Current restore) landed here, not in Task 5. The editor is a `role="group"` named New
  Transmission. Two row cases went with the row ("holds the same world on return", "re-clicking the selected row");
  Task 5's unchanged commit is the latter's heir. "Every cabinet box belongs to an aspect row" now admits the editor's
  three `TextInput` facades (spec §3: the controls as they are). The test file gained `landsInStores`, a
  `retransmitWorld` double that writes the seed and plot into the stores, which the global `beforeEach` resets. Eight
  mutants killed: a fixed world on mount, the waiting change ignored, a waiting payload or restore read as the live
  world, the editor never selected, no sync, a sync by reference, a draw on mount.

  **Dependencies:** Task 2. **Files:** `TransmissionEditor.tsx`, `transmissionEditorSchemas.ts`,
  `TransmissionEditor.test.tsx`, `OffScreen.tsx`, `OffScreen.test.tsx`, `OffScreen.css` (the group and title row),
  `src/data/sectorSettingsConfig.ts`

  **Estimated scope:** M (one new component, the row removed, five test blocks rewritten)

- [x] **Task 5: `TransmissionEditor.tsx` + `OffScreen.tsx` — a commit is a pick; the draft follows the live identity**

  **Description:** Spec §1.2 (commit, sync, the wash rule). In the editor: Enter in any input, or a blur whose
  `relatedTarget` is outside the group, calls `onCommit(draft)`; a commit whose draft `deepEqual`s what the editor last
  synced to is dropped in the editor (nothing is called). A sync never overwrites a draft that differs from the last
  synced value (mid-edit); after a commit the draft equals the synced value again, so the next sync lands. In
  `OffScreen.tsx`, `onEditorCommit(identity)` is `pickNew(identity)`: `leaveCurrent()`, the `'new'` intent, the wash
  (joining a waiting intent, the last world click winning; R3), `retransmitWorld({ …identity, …NEW_LOADING })` and
  `detachLoadedSession()` at the cover. A blank name commits as blank, as `retransmitWorld` reads it. `CoordsInput`'s own
  guard keeps a non-numeric coordinate out of the draft. A theme or family click with New Transmission selected keeps
  it selected and edits in place, as for any row (already the rule; a case pins it).

  **Proof:** RED test — `TransmissionEditor.test.tsx` (Enter commits the draft once; blur to outside the group commits;
  blur between the group's own inputs does not; an unchanged draft calls nothing; a mid-edit draft survives a new
  `identity`; after a commit the next `identity` lands in the inputs) and `OffScreen.test.tsx` (spec §5 case 2: a
  typed name + Enter waits under the wash and lands that world under Classic with no aspects, detaches the save, the
  editor reads selected and the header says New Transmission; an unchanged commit requests no world change
  (`requestWorldChange` not called); blur commits as Enter does; case 3: a save pick lands → the editor shows the
  save's style and coordinates; mid-edit, a landing pick does not overwrite the draft, and the next landing after a
  commit does; case 5: a commit while a save pick waits replaces it, the editor's world landing alone; the editor shows
  the intent's identity while it waits; a theme click with New Transmission selected keeps it selected).

  **Acceptance criteria:**
  - [x] An unchanged commit is no world change and no wash.
  - [x] A commit that differs does exactly what picking the New Transmission row did (one `retransmitWorld` with the
        identity and `NEW_LOADING`, then `detachLoadedSession`).
  - [x] The draft survives a sync while mid-edit and takes the next sync after a commit.

  **Verification:**
  - [x] Focused run passes.
  - [x] Mutants: the sync overwriting a mid-edit draft (case 3 fails); the unchanged commit requesting a change (case 2
        fails).
  - [x] `npm run build:types`, `npm run lint` clean.

  **As built:** a commit sets the editor's baseline to the committed draft before `onCommit`, so a second Enter or the
  blur after it commits nothing and the next identity lands. Scan drops a mid-edit draft before it draws: focus moving
  onto Scan is inside the group, so nothing commits, and without the drop the mid-edit guard would keep the typed draft
  over the drawn world, against spec §1.2 ("draws into both inputs"); not in the plan, pinned by its own case. Enter
  commits only from an input (Enter on Scan is Scan's); a blur to nowhere (`relatedTarget` null) commits as a blur to
  outside does. `onCommit` is `pickNew` itself. The "editor shows the intent's identity" part of case 5 landed with
  Task 4. Ten mutants killed, both of the plan's among them; also the baseline not moved on commit, Scan keeping the
  draft, Enter from any target, any key, a blur inside the group, no blur, a blur to nowhere, and the commit unwired.

  **Dependencies:** Task 4. **Files:** `TransmissionEditor.tsx`, `TransmissionEditor.test.tsx`, `OffScreen.tsx`,
  `OffScreen.test.tsx`

  **Estimated scope:** S (the commit path and the sync rule, both in the new component)

- [x] **Task 6: `OffScreen.tsx` — Current's eyebrow says unsaved; the warning line becomes the status slot**

  **Description:** Spec §1.3 item 1, §1.6 (the slot), §1.8. Current's `loreLabel` reads `home.off.unsavedEyebrow`
  ("Current · unsaved") while `dirty` is true and `home.off.current` while false. The `.off-screen__warning` paragraph
  becomes `.off-screen__status`, the same held height (one line on the desk, two on the phone), showing at most one
  of: the save failure (`fill('session.status.saveFailed', { name })`, `role="alert"`) while `keepFailed`, else empty.
  The standing warning goes: `home.off.unsavedWarning` and `home.off.keepFailed` are removed from `home.ts`
  (`session.status.saveFailed` supersedes the latter; the name is the one Keep tried, returned by `keepWorld` /
  `keepCurrentWorld`, so the failure path captures the attempted name before the throw — read `loadedName ?? ''` for
  the snapshot path and `currentLoadedSessionName ?? currentSessionName` for the live one). Rewrites the warning cases
  (R26): in blocks "Keep (spec assumption 14)" and "a Keep the storage refuses (review R20)", every "with the warning
  line" / "no warning" assertion becomes an eyebrow assertion, and the failure line is read from the slot.

  **Proof:** RED test — `OffScreen.test.tsx` (spec §5 case 12: Current's eyebrow reads "Current · unsaved" while dirty
  and "Current" after a Keep; the slot is empty while dirty (no standing warning); a refused Keep writes the failure line
  with the attempted name into the slot with `role="alert"`, and a later Keep clears it).

  **Acceptance criteria:**
  - [x] No element on the screen carries the old warning sentence; the slot element is always in the DOM.
  - [x] The eyebrow follows the same `dirty` state Keep dims on.

  **Verification:**
  - [x] Focused run passes (14 files, 972 tests).
  - [x] `npm run build:types`, `npm run lint` clean (`content.test.ts` passes with the two entries gone).

  **As built:** the eyebrow moves Current's accessible name ("Current · unsaved, <label>") whenever Current is dirty,
  the test file's default state, which the plan did not foresee: 53 call sites name Current. The test helpers that
  name a row (`row`, `radioNames`) now read the unsaved eyebrow as plain "Current" (`plainEyebrow`), so those cases pin
  the label as before, and the eyebrow's own cases read it from the row (`currentEyebrow`). Three cases outside the
  named blocks changed by a token: the theme-row and family-row dirty cases (warning → eyebrow), the Current row's
  "under the Current eyebrow" (unsaved there: no save loaded), and one raw `aria-label` read through `plainEyebrow`.
  `keepFailed` holds the tried name (`string | null`). **For Crawford:** on the snapshot path with no save behind the
  snapshot, the tried name is `''` as the plan says (keepWorld draws a fresh name inside the throw), so the line reads
  " failed to save." with no name; stand-in copy (backlog 62) either way. Seven mutants killed: the eyebrow ignoring
  dirty or always unsaved, either path naming the wrong save, the failure not an alert, a later Keep keeping it, a
  standing line in the slot.

  **Dependencies:** Task 5 (sequencing: both rewrite the Keep block's cases). **Files:** `OffScreen.tsx`,
  `OffScreen.test.tsx`, `OffScreen.css`, `src/content/copy/home.ts`

  **Estimated scope:** S (one label, one slot, two entries removed)

### Checkpoint: The editor
- [x] `npm run build:types`, `npm run lint` clean; focused run green. Full suite 2026-11-08: 357 files, 13,700 tests,
      all pass (210 s, run alone, twice). Vitest still exits 1 on one unhandled `[vitest-worker]: Timeout calling
      "onTaskUpdate"` (a worker's report to the main process timing out, no test named); the Phase 2 commit 1c1f10c5
      gives the same error with all 13,661 of its tests passing, so it predates this phase.
- [x] In the browser: type a name, Enter: the wash, the new world, the editor selected, the header says New
      Transmission. Open the list: no row checked. Pick a save: the editor follows. Current reads "Current · unsaved"
      after an edit.
- [x] Reviewed with Crawford before Phase 4 (passed 2026-11-09).

  **Found at the look (2026-11-09):** the commit logic works, but an X or Y field could not be emptied (`CoordsInput`
  ignored a blank entry, so React put the old number back), which made a sign flip awkward. Fixed: `CoordsValue`'s
  axes are `number | null`; a cleared field (or a lone "-", which the browser blanks) calls `onChange` with null and
  renders empty. The editor's commit draws a blank axis with `randomCoordinate()`, keeps a typed one, and puts the
  drawn value in the draft; a draw that lands back on the identity commits nothing. Foundry's Retransmit draws a blank
  axis too, since it shares the input (it goes at Task 15). Spec §1.2 and `docs/COMPONENT_LIBRARY.md` updated. Eight
  of nine mutants killed; the survivor (a null axis rendered as the text "null") is the same as `''` in jsdom, which
  blanks any non-number, but in a browser React would rewrite the field and erase a typed "-": the browser look
  covers it.
- [x] In the browser: clear X, type "-", then a number: the minus stays. Clear a field and press Enter: that axis is
      drawn and shows in the field.

---

### Phase 4: The action row and Share

- [x] **Task 7: `offScreenActions.ts` + `OffScreen.tsx` — Save / Rename / Delete replace Keep; the dim matrix; Save**

  **Description:** Spec §1.5 (the table, Save), §4, assumption 8. A new `src/components/panels/screen/screens/
  offScreenActions.ts` exporting `actionRow(pick, hasSnapshot, dirty, waiting): { save, rename, delete }` (true =
  enabled): all false while `waiting`; Current → save = dirty, the other two false; a save row → save = dirty, rename
  and delete true; a preset or New Transmission → save true, the other two false. In `OffScreen.tsx` the actions row
  holds three muted single-face `Button`s (`SAVE_SCHEMA`, `RENAME_SCHEMA`, `DELETE_SCHEMA` from `home.off.save`,
  `home.off.rename`, `home.off.delete`), each `disabled` from the matrix, each with an `accessibleName` naming the row
  through the schema's `template` ("Delete {name}", `fill`). `onSave` (the former `onKeep`): on Current it is today's
  Keep (snapshot → `keepWorld`, the snapshot carrying the name; none → `keepCurrentWorld`); on a save, a preset or New
  Transmission it is `keepCurrentWorld()`, and for a preset or New Transmission the pick moves to the new save's row
  (`{ value: SAVE_PREFIX + name, name, identity: identityOf(buildSessionPayload()) }`). After any Save: the saves re-read,
  `dirty` re-read, `keepFailed` false; a throw writes the failure into the slot (Task 6). Rename and Delete are wired in
  Tasks 8 and 9 (no-op handlers here, disabled by the matrix where inert). `KEEP_SCHEMA` and `home.off.keep` go.
  Rewrites the Keep cases: blocks "Keep (spec assumption 14)", "Keep follows Current (Current and New Transmission, Task
  6)", the "keeps Keep alone in the actions row" case, and every "Keep dims while it waits" case in the wash block
  (R3's "dims Keep between a click and the cover", R33's, F8's) become Save cases with the same expectations.

  **Proof:** RED test — `offScreenActions.test.ts` (every row of §1.5's table, including all three false while waiting)
  and `OffScreen.test.tsx` (spec §5 case 7: the three buttons' `disabled` on Current clean and dirty, on a save, on a
  preset, on New Transmission, and all three while a change waits; case 8: Save on Current with a snapshot saves the
  snapshot (the earlier plan's Task 6 case, rewritten); Save on an edited save overwrites it and the row stays
  selected; Save on a preset writes a fresh name, lists the row and moves the selection to it; Save on New Transmission
  the same; a refused Save writes the failure line into the slot).

  **Acceptance criteria:**
  - [x] The row never loses a button: inert ones are `disabled` in place.
  - [x] The matrix is one pure function with no React import, and the component reads it.
  - [x] Each button's accessible name names the selected row.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/offScreenActions.test.ts` and the focused run pass.
  - [x] Mutants: Save on New Transmission saving the snapshot (case 8 fails); the matrix ignoring `waiting`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6. **Files:** `offScreenActions.ts`, `offScreenActions.test.ts`, `OffScreen.tsx`,
  `OffScreen.test.tsx`, `src/content/copy/home.ts`

  **Estimated scope:** M (one pure module, the row, Save's five branches, the Keep blocks rewritten)

  **As built:** **§1.5's "Current, with a snapshot" row cannot be reached**, so Save on Current is always
  `keepCurrentWorld()` and no Save calls `keepWorld`. Current is selected again only by picking it, which either cancels
  the change that left it (the snapshot dropped) or restores the snapshot under the wash (the action row dimmed while it
  waits, the snapshot dropped when it lands). The snapshot branch would be code no click reaches and no test can pin, so
  it was not written; case 8's "Save on Current with a snapshot" became "Current saved, then left, then restored: the
  restore attaches the saved name". `sessionStore.keepWorld` now has no caller in the app (its own tests remain):
  **for Crawford**, cut or keep. Task 6's open note (the snapshot path's " failed to save." with no name) went with the
  branch. The matrix is `actionRow(kind, dirty, waiting)` with `kind` one of `'current' | 'save' | 'preset' | 'new'`;
  the plan's `hasSnapshot` argument decided nothing, so it is not there. Two dirty reads (`DirtyReads`, read together at
  the same moments as before): `current` (Current's, the snapshot's while there is one) sets the eyebrow; `live` (the
  live world against its loaded save) dims Save on every row, since Save always writes the live world (on Current the
  two agree: no snapshot while it is selected; a mutant feeding Current's Save the `current` read survived as
  equivalent, so the row reads `live` alone). Not in
  the plan: Save off Current also sets the pick's identity to the live world's, so an edited save, once saved, reads as
  stored with no tail. Each button is named "Save {name}" etc. after the header's name for the shown row. The "Keep
  follows Current" block became "the action row (console Task 7)" with the matrix, Save and "the eyebrow and Save read
  different worlds" cases; five cases elsewhere changed an expectation where Save now acts on a non-Current row (the
  family-row toggle on a preset, "recomputes dirty after a pick", the preset-and-Scan detach case, the refused Save on a
  save, the wash's kept-Current Scan landing: Save lit there, Current's eyebrow plain). Nine mutants killed: the plan's
  two, the component passing `waiting` false, a save row's identity not following, the selection never moving, Save
  reading Current's dirty read, Current's dirty read being the live one, Save not re-reading dirty, a preset gaining
  Rename.

- [x] **Task 8: `OffScreen.tsx` — Rename, inline in the row**

  **Description:** Spec §1.5 (Rename), assumption 3; Architecture Decisions (the `trailing` slot, the wrapper's key
  and blur handling). Clicking Rename with a save selected sets `renaming` state (the save's name as the draft). The
  list's `trailing(value)` returns, for that save's row only, a `TextInput` (schema from `home.off.rename`, no
  cabinet pop beyond the control's own) in a wrapper `div` that focuses and selects the input on mount and handles
  Enter (commit), Escape (cancel) and blur to outside (commit). Commit: a blank or unchanged name reverts; else
  `renameNamedSession(from, to)`; `false` (taken) reverts and writes `home.off.renameTaken` into the slot
  (`role="alert"`, cleared by the next successful Save, Rename or world change); `true` runs `renameFollowers(from,
  to)`: `setCurrentLoadedSessionName(to)` (and `setCurrentSessionName(to)`) when the loaded name was `from`, the
  snapshot's `loadedName` to `to` when it was `from`; the saves re-read; the pick becomes `{ value: SAVE_PREFIX + to,
  name: to, identity }` so the row stays selected under its new name. The header (Task 2) follows. Spec §1.2's line
  about the `trailing` slot is amended in the spec to name Rename.

  **Proof:** RED test — `OffScreen.test.tsx` (spec §5 case 9): Rename turns the row's trailing slot into a focused input
  prefilled and selected; Enter re-keys the save with `savedAt` kept and the row stays checked under the new name;
  `currentLoadedSessionName` follows when it was the loaded save; the snapshot's `loadedName` follows (Current's label
  names the new name after a restore-cancel path, or Save on Current writes under the new name); Escape, a blank and an
  unchanged name revert with no engine call; a taken name reverts and the slot shows the refusal; Rename is `disabled`
  on Current, a preset and New Transmission (case 7 already pins it).

  **Acceptance criteria:**
  - [x] One `renameFollowers` step updates both names; neither is left stale.
  - [x] The input is in the DOM only while renaming; the row's radio stays checked throughout.

  **Verification:**
  - [x] Focused run passes.
  - [x] Mutants: the snapshot's `loadedName` not followed; the taken-name refusal path committing anyway.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 7. **Files:** `OffScreen.tsx`, `OffScreen.test.tsx`, `OffScreen.css` (the inline input's
  width in the slot), `src/content/copy/home.ts`, `docs/specs/OFF_SCREEN_CONSOLE.md` (§1.2 amendment)

  **Estimated scope:** M (one inline editor, the engine wired, two followers)

  **As built:** the input is a small `RenameField` in `OffScreen.tsx` (a `TextInput` from `home.off.rename`, maxLength
  128 as the Sessions name field), in RadioButton's trailing slot on the save being renamed; the radio stays checked.
  The slot's one line is now a union (`SlotLine`: the save failure or the rename refusal), which Task 10 extends with the
  share status. Not in the plan: the typed name is trimmed (spaces round it are not part of the save's name), and the
  field reports once: Chrome blurs an input as it is removed, and a second commit would find the old name gone and show a
  false refusal, so a `done` ref guards it (a case fires Enter and a blur in one tick). `setCurrentSessionName(to)` runs
  with `setCurrentLoadedSessionName(to)` only when the loaded name was `from`. Dirty is not re-read: with both
  followers done, neither read changes. The CSS is the input's width only (`min(14rem, 55vw)`); the trailing slot's old
  rules for Scan's flat button are unused since Task 4 and are left for Task 11's pass. Spec §1.2's trailing-slot line
  amended. Thirteen mutants killed: the plan's two, the loaded name not followed or followed always, no trim, an
  unchanged name reaching the engine, Escape committing, blur not committing, no select on mount, no `done` guard, the
  pick not following, a successful rename keeping the refusal, the input on every save row.

- [x] **Task 9: `OffScreen.tsx` — Delete, at once**

  **Description:** Spec §1.5 (Delete), assumption 2. Clicking Delete with a save selected calls
  `deleteNamedSession(name)` with no confirm. Then: `detachLoadedSession()` when it was the loaded save; the snapshot's
  `loadedName` to `null` when it was the snapshot's (Current reads "unsaved" at the next dirty read, taken here); the
  saves re-read; the pick becomes New Transmission with the live identity whole (Architecture Decisions), so the editor
  reads selected holding the deleted save's world and the readout names it with no tail. No world change, no wash,
  `dirty` re-read.

  **Proof:** RED test — `OffScreen.test.tsx` (spec §5 case 10): the save is gone from storage and the list at once with
  no dialog; the loaded save detaches; the snapshot's name clears and Current's eyebrow reads unsaved; the editor is
  selected showing the live identity and the header says New Transmission; `requestWorldChange` is not called; Delete is
  `disabled` on Current, a preset and New Transmission (case 7).

  **Acceptance criteria:**
  - [x] No `AlertDialog` on Delete.
  - [x] The selection matches no row after the delete and the editor carries `data-selected`.

  **Verification:**
  - [x] Focused run passes.
  - [x] Mutant: the loaded name left attached after deleting the loaded save (case 10 fails).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7. **Files:** `OffScreen.tsx`, `OffScreen.test.tsx`

  **Estimated scope:** S (one handler)

  **As built:** `onDelete` in `OffScreen.tsx`, as described; the live identity comes from the stores (the editor's seed
  and plot, now memoized as `liveWorld`, and the loading store), not a built payload. The slot is left alone (the spec
  names Save, Rename and a world change as what clears it). Seven cases, among them: deleting a save that is not the
  loaded one leaves the loaded name alone, and Save from New Transmission after a delete writes the deleted world back
  under a fresh name. Six mutants killed: the plan's (the loaded name left attached), any loaded name detached, the
  snapshot keeping the name, the pick staying on the gone row, the saves or dirty not re-read. **One equivalent
  survivor:** New Transmission's pick carrying `NEW_LOADING` instead of the live loading. A pick's loading is read only
  for the selected row's tail, and New Transmission has no row; the readout reads the shown loading whichever it
  carries. Kept as the plan says (the identity whole), the behaviour case kept, the mutant recorded here.

- [x] **Task 10: `OffScreen.tsx` — Share on the readout; "copied" in the slot**

  **Description:** Spec §1.6. A muted single-face `Button` (`SHARE_SCHEMA` from `home.off.share`) beside the readout, in
  one row with it (`.off-screen__readout-row`), `disabled` while `intent !== null`. Click: `share(payload)` from
  `useShareStatus` (imported from its current path; Task 15 moves it), where `payload` is the snapshot's when the shown
  pick is Current with a snapshot, else `buildSessionPayload()`. The slot (Task 6) shows `session.status.linkCopied`
  (`role="status"`) while `shareStatus === 'copied'` and `session.status.copyFailed` (`role="alert"`) while `'error'`;
  the save failure and the rename refusal take precedence over a stale "copied" (one line, most recent event wins:
  a shared `slot` state of `{ kind, name? } | null` replaces `keepFailed` and the rename refusal flag, and the share
  status maps into it).

  **Proof:** RED test — `OffScreen.test.tsx` (spec §5 case 11): Share on Current with a snapshot copies the snapshot's
  payload (`copySessionLink` spied); on a save, a preset or New Transmission it copies `buildSessionPayload()`; "copied"
  shows in the slot and is gone after the dismiss (fake timers); a failed copy shows the failure with `role="alert"`;
  Share is `disabled` while a change waits and enabled once it lands.

  **Acceptance criteria:**
  - [x] One encoder: every Share goes through `copySessionLink`.
  - [x] The slot shows at most one line at a time.

  **Verification:**
  - [x] Focused run passes.
  - [x] Mutant: Share enabled while waiting (case 11 fails).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6. **Files:** `OffScreen.tsx`, `OffScreen.test.tsx`, `OffScreen.css`, `src/content/copy/home.ts`

  **Estimated scope:** S (one button, one hook, the slot's union)

  **As built:** Share always copies `buildSessionPayload()`: "Current with a snapshot" cannot be the shown pick while
  Share is lit, for Task 7's reason (picking Current drops the snapshot, and Share dims while a change waits), so the
  snapshot branch was not written; a mutant that copies the snapshot whenever one is held is killed by the save-row
  case. The share status maps into the slot without an effect: a click sets the slot to `{ kind: 'share' }`, and that
  line renders from the hook's live `shareStatus` (copied as `role="status"`, the failure as `role="alert"`, nothing once
  the hook's 5 s dismiss clears it). A later Save failure or rename refusal replaces it; a later Share takes it back.
  The hook is unchanged and imported from its current path (Task 15 moves it). Share is named "Share {name}" after the
  shown row, like the action row. The readout and Share sit in `.off-screen__readout-row`; two layout cases now read
  the readout's row as the axes' and the slot's sibling. A first run leaked an attached wash into later suites when the
  waiting case failed before its inline detach; the detach moved to the block's `afterEach`. Seven mutants killed: the
  plan's (Share enabled while waiting), copying the snapshot, Share not taking the slot, "copied" as an alert, the
  failure worded as copied, the share line ignoring the dismiss, the share line showing over a later failure.

- [x] **Task 11: `OffScreen.css` — the left column against frame F**

  **Description:** The layout pass over Tasks 2–10's markup, read against `docs/sketches/off-screen.html` frame F: the
  editor group's selected fill (`[data-selected]`, the list row's flat light fill from `RadioButton.css`, no walls),
  the title row with Scan trailing right; the disclosure header one line at every width (fixed height, `text-overflow:
  ellipsis`, `white-space: nowrap`), muted and flat; the action row's three buttons equal width, never wrapping on the
  desk, wrapping to a second line only on the phone if 320 px needs it; the readout row with Share; the status slot
  holding its height. The phone stacks the left column, then the right, as today. Nothing pops but the family rows.

  **Proof:** Look — desk at 1280 × 720 and the phone shell at 320 px: both sections collapsed on open; open each in turn
  and only the body moves; a save with a long name keeps the header on one line; the editor selected shows the fill;
  the slot's "copied" and the failure line neither grow nor shrink the column.

  **Acceptance criteria:**
  - [x] The header, the action row, the readout row and the slot hold their largest size on every content flip.
  - [x] No new cabinetry: headers, action row and Share are muted, flat.

  **Verification:**
  - [x] The Look above in a live browser, recorded in the commit.
  - [x] `npm run build:types`, `npm run lint` clean. No test file.

  **Dependencies:** Tasks 2–10. **Files:** `OffScreen.css` (no `*.test.ts`)

  **Estimated scope:** S (one stylesheet)

  **As built (2026-11-09):** the look was taken in headless Chrome through `scripts/perf/cdp-lib.mjs` (a scratch script,
  not committed), desk 1280 × 720 and phone 320 × 640, driving the real UI: Save on Current, Scan, Save (the selection
  moves), Rename to an 82-character name, Share, Delete (falls to New Transmission), Device open. Found before the CSS:
  a long save name **widened the column** — on the desk the header pushed the left column past half, on the phone the
  whole column overflowed sideways — the list was content-width (~220 px, so "Iron Cre…" while the column had room), the
  rename input covered its row, and the headers and the three buttons were content-sized and unequal. Now: the axes are
  `minmax(0, 1fr)` columns, so no content widens one; each section and its body stretch to the column; the header is one
  line at the muted face's fixed height with an ellipsis and a ▸/▾ caret; the action row is a three-column grid of equal
  `1fr` tracks, centred, never wrapping (it fits 320 px); the rename field hides the TextInput's own label line (the input
  is still named Rename) and trims its facade's padding to a row's height. The trailing slot's old rules for Scan's flat
  button (unused since Task 4) are gone with it. The readout row and the slot needed nothing more: "Unable to copy" (the
  headless clipboard refusing) took the slot's one line without moving the column. **For Crawford at Checkpoint A:** on
  the phone the rename input covers the row's name while renaming (it holds that name) — Open Question 1's call; the
  RadioButton's own "Transmission" label still shows under the header, which frame F does not draw (it names the list
  for screen readers, so it was left). Also seen: a save whose stored payload lacks fields (a hand-written fixture with
  no `globalAudio`) makes `applySessionPayload` throw inside `realise`, leaving the pick on Current and the world half
  applied; real saves are whole, so not this plan's, but worth a backlog line.

### Checkpoint A: `off-screen-console` built
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean (full suite; name any pre-existing, unrelated
      failures). `npm run build` clean. 2026-11-09: types clean; lint 0 errors (the 4 warnings are in
      `src/components/actors/scenery`, unchanged); vite build clean. Full suite run alone: 358 files, 13,756 tests,
      13,755 pass (233 s). The one failure is `sceneToOrbiterLocal.test.tsx`'s round-trip case timing out at 5 s under
      the full run — the known slow case; alone it passes (10/10), and this branch has not touched `src/animation`.
      Vitest also reports the pre-existing `[vitest-worker]: Timeout calling "onTaskUpdate"` (see "The editor").
- [x] Spec §5's Look, by Crawford, through "Share: copied. Factory Reset (at the Transmissions section's foot since
      the Device section went), confirm: the first-visit screen. Power on: the live world plays. On a phone: the same,
      stacked, the header one line at 320 px."
- [x] The long docs describe the console as built (2026-11-09, Crawford: "make sure any documentation correctly
      reflects the current layout"): the module-A half of Task 16, done here since module B goes on its own branch.
      UI_SHELL.md's off screen section (the editor, the Transmissions section, the action row, Factory Reset, the
      status slot, no presets, no Keep), SESSION_STORAGE.md's off screen section (Save, Rename, Delete, Share, Factory
      Reset; `renameNamedSession` in the engine's list; the presets' lines gone), the scene-wash and paused-change
      lines in ANIMATION_SYSTEM.md and AUDIO_SYSTEM.md, CONTENT_LAYER.md's preset line, COMPONENT_LIBRARY.md's
      off-screen consumers, CLAUDE.md's UI_SHELL and SESSION_STORAGE lines, the spec's stale clauses (marked as built),
      backlog 71, plan.md and frame F's note. Proof: Read; every name grepped in `src/`.
- [x] Open Question 1 (the rename input's placement) answered. Crawford, 2026-11-09: on the desk it stays beside the
      row (the trailing slot); on the phone it drops inside the selected row, under its name, and covers the rows below
      rather than shifting them. CSS only (the slot positioned against its row's grid area); a look at 320 px.
- [x] Crawford's call (spec §6): module B on this branch, or on `feature/settings-retirement` after this one merges.
      **A separate branch** (Crawford, 2026-11-09), which he expects will also retire the **Companies** nav item; that
      is not in this plan's Tasks 12–16 yet and needs planning before module B starts.
- [x] Reviewed with Crawford before Phase 5. Passed 2026-11-09 (Crawford).

  **Review, 2026-11-09 (Crawford, after the Phase 4 report), each its own commit:**
  - `sessionStore.keepWorld` cut, with its tests (fd15996e): no Save reaches a snapshot (Task 7's As built).
  - **Factory Reset moves in with the saves; the Device section goes** (f02862af): nothing else would ever go in it,
    and Reset deletes the saves (for the most part). It sits at the Transmissions section's foot, under the action row,
    set off by a rule. Spec §1.1, §1.4, §5 amended.
  - **A modal confirm before Delete** (5a613ddc), reversing the intent's "no confirm": the Sessions list's
    `session.delete.confirm*` copy (Task 15 now keeps those two keys), placed as Reset's confirm is; Cancel or Escape
    returns the focus to Delete, a confirmed Delete to the Transmissions header. Spec §1.5, §3, §5 amended.
  - **Share moves into the action row** (22909047), last, after Delete; the readout stands alone again. Four buttons:
    one row on the desk, two by two on the phone. Share is now inside the collapsed section, so sharing opens the list
    first. Spec §1.1, §1.5, §1.6 amended. **Superseded** by the next round.

  **Review, round 2 (Crawford, same day):**
  - **Share sits under the readout** (3532f79f), over the status slot, in view with the list collapsed; the action row
    is Save / Rename / Delete again, three across at every width. Spec §1.1, §1.5, §1.6 amended.
  - **The New Transmission editor's three fields share one panel** (7e29396e, ee622a0c): `TextInput` and `CoordsInput`
    gained `facade={false}` (default on; COMPONENT_LIBRARY.md), and the editor draws one static facade around the name
    and the coordinates. One row when the panel is 32rem or wider, else X and Y under the name. On the desk the editor
    went from about 340 px to 150 px tall. Spec §1.2 amended.
  - **The presets are gone** (5d3faaed; Crawford: "we don't need them" for now, maybe back later). The list is Current
    and the saves; the header counts the saves; `src/data/transmissionPresets.ts`, its test and the presets' content
    went in that one commit, so **bringing them back is `git revert 5d3faaed`** (then re-apply Share's place). Test
    cases that picked a preset pick one of three saves with the presets' names and links (`seedWorlds`); preset-only
    cases were rewritten or removed. That commit had no RED step: the code changed before the list-shape cases were
    rewritten. Task 16 now lists the long docs still describing presets.
  - **Share back in the action row** (4bcdf5d1), grouped with the saves now that the presets went: Save / Rename /
    Delete / Share, one row on the desk, two by two on the phone; the reverse of 3532f79f, tests reversed first.
  - **The panel's labels are the names alone** (Crawford: "leave atmosphere, location, x, & y, remove the rest"): the
    lore lines (Attenuation Style, Atlas Vector, Lateral/Vertical Vector [C]) are hidden inside the panel by CSS; the
    help icons stay, and Foundry keeps its labels until Task 15 removes it. Proof: a look at 1280 × 720 and 320 px.
  - The missing-fields question: `withGlobalAudioDefaults` fills missing fields inside `globalAudio`; the throw seen in
    Task 11's look came from a hand-written fixture with no `globalAudio` at all, which no app save lacks. Not filed.
  - Seen in the look, for Crawford: Factory Reset's button is the full cabinet face (`CLEAR_STORAGE_SCHEMA` is not
    muted), as it was in Device; under the saves it now stands out more than the flat action row.
  - **The list's show/hide toggle is gone** (Crawford: "we no longer need to show/hide the sessions"): the list, the
    action row and Factory Reset show on every mount in a plain `.off-screen__transmissions` block, with no header.
    `Disclosure.tsx`, its test, its CSS and `home.off.transmissionsHeader` are deleted, and so is the
    `openTransmissions()` helper threaded through 179 cases. Focus after a power-off is back on the selected row (R25's
    original rule); a confirmed Delete puts it on Save, the button beside Delete, always lit on New Transmission. The
    header's name and count are gone with it: the checked row and the readout name the pick. Factory Reset's cabinet
    button now shows on open (the "only the aspect rows pop" case counts it). Proof: RED test (the list shown with no
    click and no header; the two R25 cases; Delete's focus); mutants killed (power-off focus on an unchecked row, Delete's
    focus on the action row's last button); a third, power-off focus on the list's first radio, survives as equivalent
    (Current is always first and checked on mount). Spec §1.1, §1.2, §1.3, §1.4, §1.5, §1.8, §2, §5 amended.

---

### Phase 5: The retirement

**On a branch of its own** (Crawford at Checkpoint A): `feature/settings-retirement`, off `main` once
`feature/off-screen-console` merges. Crawford expects it to retire the Companies nav item too, which Tasks 12–16 do not
cover yet: plan that before Task 12 starts. **Built 2026-11-09, Crawford's call that day:** stacked on
`feature/off-screen-console` (not merged yet; rebase onto `main` after it), and Tasks 12–15 as written, the nav at four
boxes with Companies kept; the Companies retirement is a follow-up to plan on its own.

- [x] **Task 12: Fleet Params gains Audio Quality; `settings.quality*` becomes `fleet.quality*`**

  **Description:** Spec §1.9 (first bullet), assumption 5; Architecture Decisions (the readers). `'quality'` joins
  `FleetParamsGroup` (`uiStore.ts`), last; `FLEET_PARAMS_GROUP_CONTENT.quality = 'fleet.quality'` and
  `FLEET_PARAMS_SUBSECTIONS.quality = []` (`navActions.ts`); `FleetParamsScreen.tsx`'s `SECTIONS` gains
  `['quality', 'seed']` last, `SectionPanel` renders `<AudioLoadPanel />` for it (like Pacing: no `SubTabs`), under the
  `fleet.quality` intro. The eleven `settings.quality*` entries move verbatim from `settings.ts` to `fleet.ts` as
  `fleet.quality*`; `audioRigConfig.ts`, `audioBudget.ts`, `AudioLoadPanel.test.tsx` and `AudioRigDrawer.test.tsx` read
  the new keys. `SETTINGS_LEAF_CONTENT.quality` reads `'fleet.quality'` until Task 14 removes it, so Settings' first
  tab keeps working.

  **Proof:** RED test — `FleetParamsScreen.test.tsx` (Audio Quality is the eighth and last tab; selecting it renders
  the Audio Load sliders and no sub-tab row) and `navActions.test.ts` (the breadcrumb for `fleetParamsSection:
  'quality'` reads Root / Fleet Params / Audio Quality with no sub-tab segment; `activeFleetParamsSubsection('quality',
  …)` is null).

  **Acceptance criteria:**
  - [x] `CONTENT['settings.quality…']` no longer exists; every reader compiles against `fleet.quality*`.
  - [x] `AudioLoadPanel.test.tsx` and `AudioRigDrawer.test.tsx` pass with the renamed keys and no other change.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/FleetParamsScreen.test.tsx src/components/panels/screen/nav
        src/components/panels/screen/console/AudioLoadPanel.test.tsx src/components/panels/screen/console/AudioRigDrawer.test.tsx
        src/content src/utils/audioBudget.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint A. **Files:** `src/stores/uiStore.ts`, `src/components/panels/screen/nav/navActions.ts`,
  `navActions.test.ts`, `src/components/panels/screen/screens/FleetParamsScreen.tsx`, `FleetParamsScreen.test.tsx`,
  `src/content/copy/fleet.ts`, `src/content/copy/settings.ts`, `src/data/audioRigConfig.ts`, `src/utils/audioBudget.ts`,
  `AudioLoadPanel.test.tsx`, `AudioRigDrawer.test.tsx`

  **Estimated scope:** M (one section added; a key rename across four readers — mechanical)

  **As built (2026-11-09, on `feature/settings-retirement`, stacked on `feature/off-screen-console` by Crawford's
  call since that branch has not merged):** nine entries moved, not eleven (the plan miscounted: `quality`,
  `.audioLoad`, `.preset`, `.robotLoad`, `.effectsLoad` and the four `.limits.*`), appended verbatim to the end of
  `fleet.ts`. Two more readers than the plan named, renamed in the same sweep: `audioRigConfig.test.ts` and the two
  `SettingsScreen` test files (deleted in Task 14). The screen's body choice is a small `SectionBody` (Pacing, Audio
  Quality, else the sub-tabs). The screen test stubs `AudioLoadPanel` like the other panels, so `mountedPanels()`
  counts it and the `GROUPS` tables cover it (trait, intro); the sliders stay `AudioLoadPanel.test.tsx`'s. Mutants
  killed: `quality` rendering nothing (3 cases), `FLEET_PARAMS_SUBSECTIONS.quality` given a sub-tab (10 cases).

- [x] **Task 13: Test fixtures stop naming Settings**

  **Description:** Architecture Decisions. Nine test files use `'settings'` as an incidental `HubTile` or branch:
  `src/animation/deckCamera.test.ts` (1341, 1348), `Header.test.tsx` (528), `PhoneBar.test.tsx` (114),
  `worldView/MetaBox.test.tsx` (156, the `it.each` list), `worldView/WorldView.test.tsx` (41, 96),
  `systems/worldTransition.test.ts` (365, 368), `nav/NavBreadcrumb.test.tsx` (284), `console/ConsolePanel.test.tsx` (52),
  `stores/uiStore.test.ts` (342, 345, 366). Each switches to `'audioRig'` or `'companies'` where the tile is a stand-in
  for "some tile open"; a case whose point is Settings itself (the `uiStore.test.ts` `selectedSettingsLeaf` block, the
  `NavBreadcrumb` Settings path, the `NavPanel.test.tsx` five-box cases, `navActions.test.ts`'s Settings leaf cases) is
  left for Task 14 to remove. No source changes.

  **Proof:** Read — the diff is fixtures only; the suite passes before and after. No RED test: nothing changes
  behaviour (CLAUDE.md, "No RED test for a task with no behaviour").

  **Acceptance criteria:**
  - [x] `grep -rn "'settings'" src --include=*.test.*` lists only the cases Task 14 deletes.

  **Verification:**
  - [x] `npm test` green (the eight files at this commit; the full suite ran at Task 14).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 12. **Files:** the nine test files above

  **Estimated scope:** S (nine one-line edits)

  **As built (2026-11-09):** eight files, not nine: `ConsolePanel.test.tsx`'s only `'settings'` is the Settings tile
  case itself, so Task 14 takes it. A stand-in tile became `'audioRig'` (or `'companies'` where `'audioRig'` was
  already the step before); the `MetaBox` and `WorldView` tile lists drop `'settings'` instead, the other three still
  listed; `uiStore.test.ts`'s "touches no other nav field" case pins `expandedTopLevelBranch` in place of
  `selectedSettingsLeaf`, and its expand case sets `'probes'`. The eight files: 460 pass, before and after.

- [x] **Task 14: The Settings branch leaves the nav; `SettingsScreen` is deleted**

  **Description:** Spec §1.9 (second and third bullets, the screen). `'settings'` leaves `HubTile` (`src/types/hub.ts`),
  `TopLevelBranch`, `SettingsLeaf`, `selectedSettingsLeaf` and `setSelectedSettingsLeaf` (`uiStore.ts`);
  `navActions.ts` loses `BRANCH_TILE.settings`, `TILE_CONTENT.settings`, `SETTINGS_LEAVES`, `SETTINGS_LEAF_CONTENT`,
  `DEFAULT_SETTINGS_LEAF`, `activeSettingsLeaf`, `cleanSlate`'s leaf reset and the breadcrumb's Settings arm;
  `BreadcrumbState` drops the field. `NavPanel.tsx`'s `PARENT_BOXES` loses the fifth row. `ConsolePanel.tsx`'s record
  loses `settings` and the import. Deleted: `SettingsScreen.tsx`, `.css`, `SettingsScreen.test.tsx`,
  `SettingsScreen.panels.test.tsx`. `settings.ts` is deleted (its remaining keys `settings.root`, `settings.seeds`,
  `settings.sessions` have no reader), `CONTENT_AREAS` drops `'settings'` and `index.test.ts` line 183 follows. Tests:
  `NavPanel.test.tsx` (`BOX_ORDER` four boxes, the Settings rows of its tables, the `it.each` lists),
  `navActions.test.ts` (the Settings leaf cases), `uiStore.test.ts` (the `selectedSettingsLeaf` block and the field
  list), `NavBreadcrumb.test.tsx` (the Settings path), `ConsolePanel.test.tsx` (the Settings tile case).

  **Proof:** RED test — `NavPanel.test.tsx` (four parent boxes, Deck, Fleet Params, Probes, Companies, in order; no box
  named Settings) and `uiStore.test.ts` (the store has no `selectedSettingsLeaf` field and no setter, the way the
  `selectedSettingsSubsection` case already pins a retired field).

  **Acceptance criteria:**
  - [x] `npm run build:types` passes with `'settings'` gone from every union: a missing tile is a compile error the
        record catches (spec §7 risk 3), so nothing routes to it.
  - [x] `src/content/copy/settings.ts` does not exist; `content.test.ts` passes.

  **Verification:**
  - [x] Module B's focused run and `npm test` pass.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 13. **Files:** `src/types/hub.ts`, `src/stores/uiStore.ts`, `uiStore.test.ts`,
  `src/components/panels/screen/nav/navActions.ts`, `navActions.test.ts`, `NavPanel.tsx`, `NavPanel.test.tsx`,
  `NavBreadcrumb.test.tsx`, `src/components/panels/screen/console/ConsolePanel.tsx`, `ConsolePanel.test.tsx`,
  `src/components/panels/screen/screens/SettingsScreen.*` (deleted), `src/content/copy/settings.ts` (deleted),
  `src/content/types.ts`, `src/content/index.test.ts`

  **Estimated scope:** L (fourteen files, but every edit is a deletion or a one-row table change; splitting would
  leave the build red between commits because the `HubTile` union and `ConsolePanel`'s record must change together)

  **As built (2026-11-09):** as planned, plus three readers the plan did not name: `NavBreadcrumb.tsx` subscribed to
  `selectedSettingsLeaf` and passed it to `breadcrumbTrail`; `src/content/index.ts` imported `settings`; and
  `AudioLoadPanel.tsx`'s doc comment named `SettingsScreen` (now Fleet Params' tab). `TopLevelBranch` also loses
  `'settings'`. `NavBreadcrumb.test.tsx` had no Settings case left after Task 13. The `uiStore.test.ts`
  `selectedSettingsLeaf` block became "the Settings branch's fields are retired" (both Settings fields, the
  `selectedSettingsSubsection` case folded in). Tests whose point was any non-expanding box now press Fleet Params
  (or the Deck, for "two leaves, no width change"); navActions' "goes nowhere" case checks Audio Quality's crumb in
  place of a Settings leaf. The gates are the type unions (a `'settings'` anywhere is a compile error) plus the two
  RED cases.

- [x] **Task 15: Foundry, Save & Share and their configs go; `useShareStatus` moves to `src/hooks/`**

  **Description:** Spec §1.9 (the deleted list), assumption 9. Deleted: `SectorSettingsDrawer.tsx/.css/.test.tsx`,
  `SessionsPanel.tsx/.css/.test.tsx`, `SessionListItem.tsx/.css/.test.tsx`, `src/data/sectorSettingsConfig.ts` (the two
  input schemas already live in `transmissionEditorSchemas.ts` since Task 4; the config's re-export of them goes with
  it). `src/data/sessionConfig.ts` keeps
  `CLEAR_STORAGE_SCHEMA` only. `session.ts` keeps `session.clearStorage`, `.action`, `.confirmTitle`, `.confirmBody`,
  `session.delete.confirmTitle` and `.confirmBody` (the off screen's Delete confirm, Checkpoint A),
  `session.status.linkCopied`, `.copyFailed`, `.saveFailed`. `sector.ts` keeps `sector.attenuationStyle`,
  `sector.coords`, `sector.coords.x`, `sector.coords.y`. `useShareStatus.ts` and `useShareStatus.test.ts` move to
  `src/hooks/` (a new folder); `OffScreen.tsx` imports from there. The old `clear-storage-confirm__*` rules in
  `SessionsPanel.css` go with the file (Task 3 copied them to `OffScreen.css`).

  **Proof:** Read — a deletion-only task gets no test (CLAUDE.md). The moved hook's test runs from its new path. The
  proof is `npm run build:types` (no dangling import) and `content.test.ts` (no unread entry), plus a look: the
  powered-on app has no Seeds and no Save & Share anywhere.

  **Acceptance criteria:**
  - [x] `grep -rn "SectorSettingsDrawer\|SessionsPanel\|SessionListItem\|sectorSettingsConfig" src` is empty.
  - [x] `useShareStatus.test.ts` passes unmodified from `src/hooks/`.

  **Verification:**
  - [x] `npm test`, `npm run build:types`, `npm run lint` clean; `npm run build` clean.

  **Dependencies:** Task 14. **Files:** the twelve deleted files above, `src/data/sessionConfig.ts`,
  `src/content/copy/session.ts`, `src/content/copy/sector.ts`, `src/hooks/useShareStatus.ts`,
  `src/hooks/useShareStatus.test.ts`, `OffScreen.tsx` (one import)

  **Estimated scope:** M (mostly deletion; two config trims, one move)

  **As built (2026-11-09):** eleven files deleted (the three components' nine files and `sectorSettingsConfig.ts` with its test) and
  the hook's two moved unchanged. `sessionConfig.test.ts` keeps Factory Reset's two cases. `content.test.ts`'s help
  walk reads `transmissionEditorSchemas` in place of the deleted config (the editor's two inputs still need help) and
  no longer expects `session.name`. The guard named exactly the thirteen entries to drop: `session.name`, `.save`,
  `.shareLive`, `.share`, `.load`, `.delete`, `.saved`, `.status.saved`; `sector.retransmit`, `.status`, `.copyLink`,
  `.random.attenuationStyle`, `.random.coords`. The acceptance grep also matched comments in eleven files (and one
  `localeStore.test.ts` title), each reworded to the off screen, the editor or "Foundry" / "the Save & Share tab" in
  the past tense. **For Crawford:** `retransmitChangesWorld` (`worldTransition.ts`) has no app caller now, only its
  own test (Foundry was its last); and the `sector.attenuationStyle` and `sector.coords` help still says "then press
  Retransmit", a button that no longer exists (the editor commits on Enter or blur). Both left as they are: a removal
  and a copy change are his call. The look (no Seeds, no Save & Share in the powered-on app) is Checkpoint B's.
  **Answered 2026-11-09 (Crawford):** `retransmitChangesWorld` cut; both help lines now end "then press Scan to go there."

### Checkpoint B: `settings-retirement` built
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean. 2026-11-09, at Task 15: types
      clean; lint 0 errors (the same 4 warnings in `src/components/actors/scenery`); full suite 350 files, 13,549 pass,
      with the known `[vitest-worker] Timeout calling "onTaskUpdate"` exit; vite build clean.
- [x] In the browser: the nav shows four boxes; Fleet Params' last tab is Audio Quality with its sliders and intro,
      breadcrumb Root / Fleet Params / Audio Quality; nothing in the powered-on app makes, loads, saves or shares a
      world.
- [x] Reviewed with Crawford before Phase 6. Passed 2026-11-09 (Crawford).

---

### Phase 6: Docs

- [ ] **Task 16: `docs/` — document the shipped behaviour**

  **Description:** Spec §1.9 (Docs). **The off screen's half is done** (Checkpoint A, 2026-11-09, on
  `feature/off-screen-console`): the off screen section of `UI_SHELL.md` and of `SESSION_STORAGE.md`, the presets'
  lines everywhere, `renameNamedSession` in the engine's list, the off-screen consumers in `COMPONENT_LIBRARY.md`,
  `CLAUDE.md`'s two reference lines, the spec's new children in §2, and frame F's note. **What is left is the
  retirement's half**, on its own branch. `UI_SHELL.md`: the nav panel's five boxes become four; the screens table
  loses `SettingsScreen` and Fleet Params' row gains Audio Quality as the eighth tab; `ConsolePanel`'s route list loses
  `settings`; the scene wash paragraph loses Foundry's Retransmit and a session Load; the Foundry paragraph goes (the
  off screen section's last sentence of its intro, "Foundry and Save & Share still do the same jobs", goes with it).
  `SESSION_STORAGE.md`: the Save & Share tab paragraphs go (the off screen section already describes Save, Rename,
  Delete, Share and Factory Reset), and the "three buttons, one encoder" bullet becomes one button.
  `COMPONENT_LIBRARY.md`: the consumers it names (`SectorSettingsDrawer`, Save & Share, the session list's rows,
  `SettingsScreen`) go. `CLAUDE.md`: SESSION_STORAGE's line loses the "Sessions" Settings accordion.
  `docs/specs/OFF_SCREEN_CONSOLE.md` §2 gains the readers Task 12 found. Plus whatever the Companies nav item's
  retirement needs, once planned. Spot-check every identifier against the shipped source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every documented name exists in the shipped source; no doc names `SettingsScreen`, `SectorSettingsDrawer`,
        `SessionsPanel`, `SessionListItem`, Keep or the warning line as current.

  **Verification:**
  - [ ] Manual review, each named identifier grepped in `src/`.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Tasks 1–15. **Files:** `docs/UI_SHELL.md`, `docs/SESSION_STORAGE.md`, `docs/COMPONENT_LIBRARY.md`,
  `CLAUDE.md`, `docs/specs/OFF_SCREEN_CONSOLE.md`, `docs/sketches/off-screen.html`

  **Estimated scope:** S (docs only, five files)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every automated acceptance criterion across Tasks 1–15 met; spec §5's seven mutants each checked by hand and
      named in their task's commit.
- [ ] Docs reflect the shipped API, every name spot-checked.
- [ ] Any Look not done this session flagged here, never silently skipped.
- [ ] Ready for Crawford's PR. Archiving backlog 71 and the spec's status line wait for the merge (the todo
      conventions).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The editor's sync overwrites a draft the user started during the wash (spec §7 risk 1) | Medium | Task 5's sync leaves a draft that differs from the last synced value alone; case 3 and `TransmissionEditor.test.tsx` pin it, and the mutant is named. |
| `OffScreen.tsx` grows past readable (spec §7 risk 2) | Medium | Tasks 2, 4 and 7 extract `Disclosure`, `TransmissionEditor` and `offScreenActions`; the action row's handlers stay, since they read the snapshot and intent refs. |
| The blur-commit fires when focus moves between the editor's own inputs, or into Scan | Medium | The group's `onBlur` checks `currentTarget.contains(relatedTarget)`; Task 5's component test has a case for an internal blur and one for a blur to outside. A click on Scan while mid-edit: Scan's own `pickNew` wins, and the unchanged-draft guard drops the blur's commit when Scan already synced the draft. |
| The rename input in the `trailing` slot reads oddly beside the old name (Open Question 1) | Low | Checkpoint A's look decides; the alternative (the input replacing the row's label) needs a `RadioButton` prop, which the spec says to ask about first. |
| A rename of the loaded save while the snapshot also names it leaves one stale (spec §7 risk 4) | Medium | One `renameFollowers(from, to)` step in Task 8; case 9 covers both names and the mutant is named. |
| Deleting the Settings branch breaks a path a link arrival or the Guide expects (spec §7 risk 3) | Low | `ConsolePanel`'s `Record<HubTile, …>` makes a missing tile a compile error (Task 14's criterion); the link arrival never names a branch. |
| `content.test.ts` fails between commits on an entry nobody reads yet | Low | Content entries land with their first consumer (Architecture Decisions); removals land with the feature they named. |
| Task 14 is L and cannot be split without a red build | Medium | Task 13 pulls the fixture sweep out first, so Task 14 is deletions plus one-row table edits only. |
| The phone's left column is longer than the row it replaced (spec §7 risk 6) | Low | Both sections start collapsed; Task 11's Look measures at 320 px. |
| The test file's many row-click cases each need the list opened first (Task 2) | Low | One `openTransmissions()` helper in `OffScreen.test.tsx`, threaded through in Task 2 alone, so later tasks inherit it. |

## Open Questions

1. **Where the rename input renders.** **Default (this plan):** `RadioButton`'s `trailing` slot on the selected save's
   row, the control untouched. **Alternative:** the input replaces the row's label, which needs a new `RadioButton` prop
   (spec §3, ask first). Crawford decides at Checkpoint A from the look. **Answered 2026-11-09:** the trailing slot on
   the desk; on the phone, inside the selected row under its name, covering the rows below (Checkpoint A).
2. **One branch or two for module B** (spec §6). Crawford's call at Checkpoint A. **Answered 2026-11-09:** two; module
   B on `feature/settings-retirement` after this branch merges (Phase 5's note).
3. **Does the editor's blank-name commit need a guard?** `retransmitWorld` reads a blank name as none and derives a
   world from it today (Foundry's behaviour), so the plan passes it through (spec §1.2). If the resulting world reads
   as a mistake in the look, a follow-up pins a minimum length. **Open**, low priority, decided at Checkpoint A.
