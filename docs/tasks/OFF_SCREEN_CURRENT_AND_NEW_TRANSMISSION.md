# Implementation Plan: The Off Screen — Current stays the world you came from, and a New Transmission row with Scan

Source spec: [docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md](../specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md).
Source intent: [docs/intent/off-screen-current-and-new-transmission.md](../intent/off-screen-current-and-new-transmission.md).
Backlog 64 (Task 0 numbers it). Branch: `docs/archive-roadmap-57`, as it stands (Crawford, 2026-11-02).

Written for: Crawford, and the agent that builds it.

## Overview

Almost all of the work is in `src/components/panels/screen/screens/OffScreen.tsx` and its test. `sessionStore.ts`
gains two small functions for Keep, and the content layer gains two entries. The tasks are ordered as follows:

- **Task 0** numbers the item.
- **Task 1** adds the store's half of Keep, independently testable.
- **Tasks 2–4** make Current an anchor, one behaviour each:
  - the selection stays put on a theme or aspect click;
  - the snapshot, with Current's name and its restore;
  - the selected row's tail and the readout.
- **Task 5** replaces Roll with the New Transmission row and Scan.
- **Task 6** routes Keep and the dirty read to the snapshot.
- **Task 7** is docs.

Each behaviour task goes RED first in `OffScreen.test.tsx`. It rewrites the existing cases its rule contradicts, and
names each one, so the diff shows exactly which old promise changed.

## Architecture Decisions

- **The spec's open questions take their defaults.** Crawford approved the spec on 2026-11-02 without overriding them:
  1. backlog 64;
  2. the unsaved line's copy goes to backlog 62;
  3. the tail names the theme whenever it differs from the row's own, Classic included.
- **One deviation from spec §2: `src/utils/describeWorld.ts` gains an exported `describeLoading`.** It's the loading
  tail, lifted out of `describeWorld`, which then calls it. The selected row's tail (§1.3) reuses it rather than
  repeating ` · ` and ` + ` in the component. An option names Classic for open question 3. `describeWorld.test.ts`
  passes unmodified as the parity proof. Task 4 amends the spec's §2.
- **The snapshot lives in a ref plus a state, set together**, the way `intentRef` and `intent` are. `realise` and the
  handlers read the ref, and the rows render from the state. It's never a store (spec §3).
- **The snapshot is taken in one helper, `leaveCurrent()`.** It's called by every world click that leaves Current: a
  save, a preset, New Transmission, or Scan. It's a no-op when a snapshot already exists. `landed` turns true in
  `realise` when any non-Current world part lands, and the snapshot is dropped when a Current restore lands.
- **`Intent` gets the spec's three world parts (§1.5) in stages.** Task 3 adds `kind: 'current'` next to today's
  payload world and `roll`. Task 5 replaces `roll` with `kind: 'new'`. Each task leaves the screen working.
- **`rollWorld` goes in Task 5.** The off screen is its only caller, and Crawford said on 2026-11-02 to remove it and
  its tests there. That covers its cases in `worldTransition.test.ts` and in `OffScreen.test.tsx`.
- **Order:** Task 1 has no dependants until Task 6, so it can be built at any point before that. Tasks 2 → 3 → 4 are
  sequential, because each rewrites cases the previous one touched. Task 5 needs Task 3's `leaveCurrent`. Task 6
  needs Tasks 1 and 3.

## Dependency Graph

```
Task 0 (backlog 64, plan.md line)

Task 1 (sessionStore: keepWorld, isPayloadDirty)          Task 2 (the selection stays on a theme/aspect click)
        │                                                          │
        │                                                  Task 3 (the snapshot: Current's name, restore, cancel)
        │                                                          │
        │                                   ┌──────────────────────┼──────────────────────┐
        │                                   │                      │                      │
        │                   Task 4 (the tail, the readout)   Task 5 (New Transmission + Scan)
        │                                                                                 │
        └───────────────────────────────────────────── Task 6 (Keep and dirty follow the snapshot — needs 1 + 3)
                                                                   │
                                                           Task 7 (docs)
```

## Task List

### Phase 0: Record

- [x] **Task 0: `docs/todo/` — number the item 64 and put it first in Stage 1**

  **Description:** Add backlog 64 to `backlog.md`: a short entry pointing at the intent, the spec and this plan. Bump
  the header's next free number to 65. Add a line at the top of plan.md's Stage 1, ahead of roadmap 58. Change the
  intent's "Not yet numbered" to backlog 64.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] Backlog 64 exists and links the three docs. The next free number reads 65.
  - [x] plan.md's Stage 1 opens with 64.

  **Verification:**
  - [x] Every new link resolves (file and anchor).

  **Dependencies:** None. **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`, `docs/intent/off-screen-current-and-new-transmission.md`

  **Estimated scope:** XS (docs only)

### Phase 1: The store's half of Keep

- [x] **Task 1: `sessionStore.ts` — `keepWorld(payload, loadedName)` and `isPayloadDirty(payload, loadedName)`**

  **Description:** Spec §1.4. `keepWorld` saves the given payload under `loadedName`. When that's null or blank, it
  saves under `unusedSessionName('')`. It returns the name and writes no session field. `isPayloadDirty` is today's
  `isWorldDirty` body with the payload and the name passed in. `isWorldDirty()` becomes
  `isPayloadDirty(buildSessionPayload(), currentLoadedSessionName)`. No caller yet: Task 6 wires it.

  **Proof:** RED test — `src/stores/sessionStore.test.ts`:
  - `keepWorld` with a name overwrites that save with the given payload, not the live one;
  - `keepWorld` with null writes a new row under a name no save has;
  - `currentLoadedSessionName` and `currentSessionName` are unchanged after either;
  - `isPayloadDirty` is false for a payload equal to its stored save, and true for a changed one, a null name or a
    name with no save.

  **Acceptance criteria:**
  - [x] The four cases pass. The existing `keepCurrentWorld` and `isWorldDirty` cases pass unmodified.

  **Verification:**
  - [x] `npx vitest run src/stores/sessionStore.test.ts src/components/panels/screen/screens/OffScreen.test.tsx`
  - [x] Mutants: `keepWorld` saving `buildSessionPayload()`; `keepWorld` setting `currentLoadedSessionName`;
        `isPayloadDirty` ignoring its payload.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None. **Files:** `src/stores/sessionStore.ts`, `src/stores/sessionStore.test.ts`

  **Estimated scope:** S (one store, two functions)

### Phase 2: Current becomes an anchor

- [x] **Task 2: `OffScreen.tsx` — a theme or aspect click keeps the selected row**

  **Description:** Spec §1.1 row 6 and §1.3's last bullet:
  - `onThemeChange` and `onFamilyChange` stop calling `setPick(CURRENT_PICK)`.
  - `realise` sets the row to `intended.pick` always: the F12 drop to Current after a laid-over loading goes.
  - `shownTheme` and `shownAspects` read the intent while a change waits, else the **live** loading store, not the
    landed pick's stored identity. That identity goes stale after an in-place edit.

  The in-place retransmit itself is unchanged.

  **Proof:** RED test — `OffScreen.test.tsx`: a save pick lands, then a theme click. The save's row stays checked, and
  the theme row shows the clicked theme. The same holds for a family toggle. A save pick, then a theme while it waits,
  then the cover: the save's row is still checked.

  **Acceptance criteria:**
  - [x] The new cases pass.
  - [x] These cases are rewritten to the new rule, each named in the commit:
    - `a theme pick drops the world row to Current…` (`:358`);
    - `a change drops the world row to Current…` (`:576`);
    - `a family change drops the world row to Current…` (`:759`);
    - F12's `lands the save, then the theme over it; the row then drops to Current…` (`:1711`).
  - [x] Every other case passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx`
  - [x] Mutants: `setPick(CURRENT_PICK)` restored in either handler; the drop restored in `realise`; the Loading rows
        reading the pick's identity after it lands.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None. **Files:** `OffScreen.tsx`, `OffScreen.test.tsx`

  **Estimated scope:** S (one component, three small changes)

- [x] **Task 3: `OffScreen.tsx` — the snapshot: Current keeps its name, and picking it restores or cancels**

  **Description:** Spec §1.1 (the Current rows), §1.2 and §1.5:
  - **The snapshot and `leaveCurrent()`:** `snapshotRef` and `snapshot` (`CurrentSnapshot`), plus `leaveCurrent()`,
    called from `onChange` for a save or preset pick and from `onRoll` until Task 5 replaces it.
  - **Current's name:** Current's row is named from the snapshot while one exists (`describeWorld(snapshot identity,
    snapshot.loadedName)`), else live.
  - **Picking Current:**
    - With no snapshot, nothing (as today).
    - With a snapshot that hasn't landed: `cancelWorldChange()`, clear the intent, drop the snapshot.
    - With a landed snapshot: an intent with `world: { kind: 'current', snapshot }`, requested under the wash.
      `realise` lands it with `applySessionPayload(snapshot.payload)`, then re-attaches the name if
      `snapshot.loadedName` is set (`setCurrentSessionName` and `setCurrentLoadedSessionName`), else
      `detachLoadedSession()`. It then drops the snapshot.
  - **`landed`:** turned true in `realise` for every other world part.
  - **Last click wins:** a pick made while a Current restore waits replaces it, and the snapshot stays.

  **Proof:** RED test — `OffScreen.test.tsx`, with the wash attached:
  - Current's label is unchanged through a save pick landing.
  - A save lands, then Current: `applySessionPayload` is called with the pre-pick payload, Current is checked, and the
    loaded save name is the pre-pick one.
  - A save still waiting, then Current: `cancelWorldChange` runs, nothing applies at the cover, and the world isn't
    torn down.
  - A theme on Current, then a save lands, then Current: the restored payload carries the theme.
  - A save lands, Current waits, then a preset: only the preset lands, and Current's label still names the snapshot.

  **Acceptance criteria:**
  - [x] The five cases pass.
  - [x] These cases are rewritten to the new rule, each named in the commit:
    - R3's `a save, then Current, then a theme pick: Current cancels the save…` (`:1518`) and `a preset then Current
      applies nothing…` (`:1550`), which stay true as cancels and only change if their setup lands the pick;
    - F12's two `then Current cancels…` cases (`:1670`, `:1699`);
    - `follows the loaded world: a change of Attenuation Style renames the row…` (`:856`), which still holds with no
      snapshot.
  - [x] Every other case passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx`
  - [x] Mutants:
    - the snapshot taken on mount (the theme-on-Current case fails);
    - the snapshot never dropped after a restore;
    - the cancel branch always restoring;
    - the restore not re-attaching the name;
    - `landed` never set.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2. **Files:** `OffScreen.tsx`, `OffScreen.test.tsx`

  **Estimated scope:** M (the heart of the change; one component and its test, about ten cases touched)

- [x] **Task 4: `describeWorld.ts` + `OffScreen.tsx` — the selected row's tail, and a readout of the live world**

  **Description:** Spec §1.3:
  - Lift the loading tail out of `describeWorld` into an exported `describeLoading(theme, aspects, { nameTheme })`.
    It names the theme when it isn't Classic, or always when `nameTheme` is set. `describeWorld` calls it.
  - The selected non-Current row's label gains ` · ` + `describeLoading(live loading, { nameTheme: liveTheme !==
    ownTheme })` while the live loading differs from the row's own loading (`loadingOf(payload)`).
  - Once a change has landed, the readout reads the live world under the row's name. With a change waiting, it reads
    the intent, as today.
  - Amend the spec's §2 to list `describeWorld.ts`.

  **Proof:** RED test — `OffScreen.test.tsx`:
  - A save lands, then Calm: the row reads "<save> · Calm", and the readout names the save under Calm.
  - A Calm save, then Classic: the row reads "<save> · Classic".
  - Leaving and picking the save again: the tail is gone, and the save reloads as stored.
  - An unedited save shows no tail.

  `src/utils/describeWorld.test.ts` passes unmodified, with one new case for `nameTheme`.

  **Acceptance criteria:**
  - [x] The cases pass. `describeWorld`'s output is byte-identical for every existing case.
  - [x] Current never shows a tail: its name already carries its loading.

  **Verification:**
  - [x] `npx vitest run src/utils/describeWorld.test.ts src/components/panels/screen/screens/OffScreen.test.tsx`
  - [x] Mutants: the tail always shown; `nameTheme` ignored (the Classic case fails); the readout reading the pick's
        stored identity after landing.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3. **Files:** `src/utils/describeWorld.ts`, `src/utils/describeWorld.test.ts`, `OffScreen.tsx`, `OffScreen.test.tsx`, the spec

  **Estimated scope:** M (four source and test files, a small lift)

### Checkpoint 1: Current is an anchor
- [x] `npm run build:types`, `npm run lint`, `npm test` clean.
- [x] A save pick, a theme on it and Current back all behave as the spec's table says. Roll is still on Current's row.
- [x] Reviewed with Crawford before Phase 3.
  - 2026-11-02: passed. `npm test` had one failure, `sceneToOrbiterLocal`'s 50-gem round-trip timing out under the
    parallel run; it passes alone. Decided: a save whose only edit is clearing its aspects under Classic shows no
    tail (`describeLoading('classic', {})` is empty), and that is fine.

---

### Phase 3: New Transmission and Scan

- [x] **Task 5: `OffScreen.tsx` + `home.ts` — the New Transmission row with Scan, replacing Roll**

  **Description:** Spec §1.1 (the New Transmission and Scan rows), §1.3 and §1.6:
  - **The draw:** `newWorld` state (an Attenuation Style name and coordinates), drawn on mount from
    `generateRandomAttenuationStyleName()` and `randomCoordinate()`.
  - **The row:** an option `NEW_VALUE` first in the list, labelled `home.off.newTransmission`.
  - **The button:** the trailing slot moves from Current to it, with `SCAN_SCHEMA` (`home.off.scan`).
  - **Picking the row:** `leaveCurrent()`, then an intent `{ kind: 'new', …newWorld }` under the wash. `realise`
    lands it with `retransmitWorld({ attenuationStyleName, coordinates, theme: 'classic', aspects: {} })` and
    `detachLoadedSession()`.
  - **Scan:** draws again into `newWorld`, then does the same with the new draw.
  - **The readout** for the row names the drawn world with no label.
  - **What goes:** `onRoll`, `roll` on `Intent`, `ROLL_SCHEMA` and `home.off.roll`. `rollWorld` itself is deleted
    from `worldTransition.ts`, along with its cases in `worldTransition.test.ts` (Crawford, 2026-11-02).

  **Proof:** RED test — `OffScreen.test.tsx`, with `seedUtils`' two draws mocked to fixed values:
  - The row is first, unselected, labelled "New Transmission", with Scan in its trailing slot. Current has no trailing
    action.
  - Picking it lands one `retransmitWorld` with the drawn name and coordinates under Classic with no aspects, and
    detaches the save.
  - Scan with Current selected draws a second world, selects the row and lands that world.
  - Scan with the row already selected draws and lands again.
  - Current's label is unchanged through all of it.
  - Re-clicking the selected row requests no change.

  **Acceptance criteria:**
  - [x] The cases pass.
  - [x] Roll's cases are rewritten as Scan's, each named in the commit: `:882–:910`, `:1037`, `:1077`, `:1133–:1150`,
        `:1479`, `:1594`, `:638`, `:1834`, and the list-order cases `:1203`, `:1209` and `:1226`. They keep what still
        holds: a flat button, never a pick by itself, never starts audio, and the last click wins.
  - [x] `src/content` tests pass, and `home.off.roll` is gone.
  - [x] `rollWorld` and its cases are gone, and nothing in `src/` names it. The rest of `worldTransition.test.ts`
        passes unmodified.
    - As built: the address-bar case "a both-changed retransmit, and a roll, write the whole new identity" lost its
      roll half and the words "and a roll"; the rest of the file is unmodified. OffScreen.tsx's header comment lost
      its rollWorld sentences here, so `src/` names it nowhere; Task 7 still rewrites the header whole.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/content src/systems/worldTransition.test.ts`
  - [x] Mutants: the draw taken at the click instead of on mount (the "same world on return" case fails); Scan not
        selecting the row; the theme not reset to Classic; the save not detached.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3. **Files:** `OffScreen.tsx`, `OffScreen.test.tsx`, `src/content/copy/home.ts`,
  `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** M (five files; the most rewritten cases of any task, and a deletion)

### Phase 4: Keep follows Current

- [x] **Task 6: `OffScreen.tsx` — Keep and the dirty read follow the snapshot**

  **Description:** Spec §1.4:
  - **Keep:** with a snapshot, `onKeep` calls `keepWorld(snapshot.payload, snapshot.loadedName)` and sets the
    snapshot's `loadedName` to the name it returns. Without one, it calls `keepCurrentWorld()` as today.
  - **The dirty read:** `isPayloadDirty(snapshot.payload, snapshot.loadedName)` with a snapshot, `isWorldDirty()`
    without. It's read at the same moments as today: mount, a landed change, a Keep, and an in-place edit.
  - **Keep while a change waits:** stays disabled. A storage failure keeps R20's line.

  **Proof:** RED test — `OffScreen.test.tsx`:
  - Current unsaved, a save lands, then Keep: the new row holds the pre-pick payload, `currentLoadedSessionName`
    still names the picked save, and Keep dims.
  - Current was a save, then a preset lands and Keep: that save is overwritten with the snapshot.
  - A clean Current, then a save lands and is edited: Keep stays dim, because the dirty read follows Current.
  - Current, after Keep and a restore: attached to the kept name.

  **Acceptance criteria:**
  - [x] The cases pass. The Keep cases with no snapshot (`:917–:1102`) pass unmodified.
    - As built: five older cases had a pick or Scan in their setup, so a snapshot, and asserted the old live-world
      Keep. They are rewritten to the new rule and named in the commit. The no-snapshot Keep cases pass unmodified.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/stores/sessionStore.test.ts`
  - [x] Mutants: Keep saving the live payload with a snapshot; the dirty read on the live world with a snapshot; the
        snapshot's `loadedName` not updated after Keep (the restore case fails).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1 and 3. **Files:** `OffScreen.tsx`, `OffScreen.test.tsx`

  **Estimated scope:** S

- [x] **Task 6b: `OffScreen.tsx` — every row names its world (Crawford, 2026-11-02, after Task 6)**

  **Description:** Amends spec §1.3:
  - **New Transmission** looks like Current: "New Transmission" is its lore label, the small eyebrow `CURRENT` is on
    Current's row, and its label is its drawn world, `describeWorld(drawn)`, from the moment the screen opens. Each
    Scan replaces it.
  - **Saves and presets:** the name fronts the world, as Current's label reads with a save loaded:
    `describeWorld(identityOf(payload), name)`, so "Dusk Run · tr3nch-2 (-30, -30) · Calm". A save keeps its
    "saved …" meta.
  - **The selected, edited row** (Task 4's tail) names the live loading in place of its own:
    `withTail(describeWorld({ style, plot }, name), describeLoading(shown, { nameTheme: theme differs }))`, so
    "Dusk Run · tr3nch-2 (-30, -30) · Classic", not "… · Calm · Classic". Unedited, it reads exactly as stored.

  **Proof:** RED test — `OffScreen.test.tsx`:
  - New Transmission's accessible name is "New Transmission, <drawn world>" on open, and changes to the new draw on
    Scan.
  - A save and a preset are named `describeWorld(payload, name)`.
  - An edited, selected save names the live loading in place of its own, Classic included, and reads as stored once
    left.

  **Acceptance criteria:**
  - [x] The cases pass. Row look-ups by bare name go through one helper that matches a row by what fronts its label;
        no assertion is otherwise weakened.
    - As built: the helper, `row(name)`, matches the whole accessible name, `name · …`, or `name, …`. Swapped in
      alone, before any label changed, all 190 cases still passed. Exact-label assertions (list order, Task 4's
      tails, the same-name saves, the phone's long name) now name the full label.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx`
  - [x] Mutants: New Transmission's label without its world; a save's label without its world; the edited row
        appending the live tail to the stored one. Also killed: a preset's label without its world; the edited row
        never showing the live loading.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 4 and 5. **Files:** `OffScreen.tsx`, `OffScreen.test.tsx`, the spec's §1.3

  **Estimated scope:** S (labels), with a mechanical test-helper change

### Checkpoint 2: Built
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean. Any pre-existing failure is named.
- [ ] Crawford's Look (spec §5), after a hard reload:
  1. Power off on a world.
  2. Scan twice.
  3. Click Calm.
  4. Pick a save, and toggle a Melody aspect.
  5. Click Current: you're back on the world you powered off on, and Current's name never changed.
  6. Power on: it plays.
  7. Power off: New Transmission shows a fresh draw.

  Also check on a phone width: Scan sits in New Transmission's row.
- [ ] Reviewed with Crawford before docs.

---

### Phase 5: Docs

- [ ] **Task 7: `docs/UI_SHELL.md` and the component's header comment — the list as shipped**

  **Description:** Rewrite the off screen's Transmission list paragraph in UI_SHELL.md to cover:
  - New Transmission and Scan;
  - Current as the snapshot;
  - the selection staying put through a theme or aspect click;
  - Keep saving Current.

  Make sure `OffScreen.tsx`'s header comment says the same thing, revised in place. Look for other doc mentions of
  Roll or "picking Current applies nothing" (`grep -rn "Roll\b" docs/*.md`) and fix the ones that describe live
  behaviour. Leave archived plans alone. Spot-check every name against the shipped source. Update the spec's and
  intent's status lines to "built".

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No live doc describes Roll on the Current row, or Current renaming itself to a pick.

  **Verification:**
  - [ ] Every named identifier is spot-checked against the source.
  - [ ] `npm run lint` clean.

  **Dependencies:** Tasks 0–6. **Files:** `docs/UI_SHELL.md`, `OffScreen.tsx` (comment only), the spec, the intent

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every task's acceptance criteria are met, and every mutant listed was killed (any survivor is recorded and
      argued equivalent).
- [ ] Crawford's Look passed, or flagged here if not done.
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The restore isn't the pre-pick world (a field `buildSessionPayload` doesn't carry) | Medium | It's the Keep + Load round trip session storage already tests. Task 3's restore case compares the payload, and the Look checks it by ear. |
| An R3 rule nobody restated breaks (Keep dims while waiting, the last click wins, the loading laid over the pick) | Medium | Every task names the cases it rewrites. The rest must pass unmodified. Task 3 adds the last-click-wins case for a waiting restore. |
| Mocking `seedUtils` in Task 5 leaks into other cases' worlds | Low | Mock only within Task 5's `describe`. `worldTransition.test.ts`'s style-name gotcha shows unpinned seeds flake; pin both draws. |
| `describeLoading`'s lift changes a string anywhere `describeWorld` is read (the Current row, Foundry's status line) | Low | `describeWorld.test.ts` passes unmodified (Task 4). |

## Open Questions

1. **`rollWorld`:** after Task 5, nothing calls it. **Resolved** (Crawford, 2026-11-02): Task 5 deletes it and its
   tests.
2. The spec's three questions: **Resolved** (Architecture Decisions above): backlog 64; the unsaved line to backlog
   62; the tail names Classic when it differs.
