# Implementation Plan: Session Autosave Removal

Source spec: [docs/specs/SESSION_AUTOSAVE_REMOVAL.md](../specs/SESSION_AUTOSAVE_REMOVAL.md). Source intent: [docs/intent/session-autosave-removal.md](../intent/session-autosave-removal.md). Amends [Phase 20](../todo/roadmap.md#20-session-storage).

## Overview

Removes the in-progress Session Autosave History work from `features/session-updates` (current `HEAD` `02efeb1`) down to plain manual session CRUD, per the confirmed intent. 7 tasks: two UI-slice tasks that strip the last consumers of the autosave APIs first, three removal tasks for the autosave system/storage engine/types (in dependency order so the tree stays buildable at every step), one independent store-cleanup task, and docs last. No task resets or rewrites git history — see Architecture Decisions below for why that changed from the spec's original proposal.

## Architecture Decisions

- **Forward removal commits, not `git reset` — spec §6/§7 item 1, resolved before this plan.** The spec originally proposed resetting the branch back to before commit `3227081`. Checked against the real commit contents (not assumed): the "Revert Update to Load" change and the date+time save-confirmation banner are each bundled *inside* larger commits (`4566fcf`, `02efeb1`) alongside autosave-history-specific work, with no earlier disentangled version to reset back to. A reset would have silently brought the Update button back — the opposite of confirmed intent. Every task below instead deletes code forward from current `HEAD`, which keeps the already-shipped Load-only behavior and date+time banner exactly as they are, with nothing to reconstruct.
- **Removal order follows the consumer graph, not the file list order in spec §2.** TypeScript's build must stay green after every task (Definition of Done, below) — so UI code that *calls* the autosave APIs is stripped first (Tasks 1–2), then the autosave system that's now only called from `main.tsx` (Task 3), then the storage engine functions now only called from the deleted autosave system (Task 4), then the types now only referenced by the already-stripped storage engine and UI (Task 5). `sessionStore.ts`'s `viewingUnsavedHistory` (Task 6) only depends on Task 1 (its sole UI consumer) and can run in parallel with Tasks 3–5.
- **Test files are removed/edited in the same task as their source file**, per this repo's existing one-task-one-slice convention (see `docs/tasks/SESSION_STORAGE.md` for precedent) — never a separate "fix the tests" task at the end.

## Definition of Done (every task)

- [ ] `npm run build:types` and `npm run lint` clean.
- [ ] The task's focused tests pass; the **full suite** (`npm test`) passes at every checkpoint.
- [ ] `CLAUDE.md` PR checklist: no synths in components; no timelines/refs in Zustand state; state stays JSON-serializable (trivially true — this phase only removes fields/functions).
- [ ] No dangling reference to a removed export anywhere in `src/` (spec §5.3 criterion 3) — `npm run build:types` is the actual gate for this, not a manual grep.
- [ ] One commit per task, tests with their code, message ends with this session's attribution line.

## Dependency Graph

```
Task 1 (SessionListItem.tsx)          Task 6 (sessionStore.ts) ── depends on Task 1
        │
        ▼
Task 2 (SessionsPanel.tsx)
        │
        ▼
Task 3 (sessionAutosave.ts deleted; main.tsx wiring removed)
        │
        ▼
Task 4 (sessionStorageEngine.ts stripped to CRUD-only)
        │
        ▼
Task 5 (types/session.ts stripped)
                ── Checkpoint A: autosave code fully gone, CRUD intact ──
Tasks 1–6 ──→ Task 7 (docs)
                ── Checkpoint B: complete ──
```

Task 6 only depends on Task 1 and can be done any time after it, in parallel with Tasks 2–5.

## Task List

### Phase 1: Strip the UI down to plain rows

- [ ] **Task 1: `SessionListItem.tsx` — remove subrows, indentation, and the Primary Save/unsaved-row branches**

  **Description:** Remove the `indented` prop, the recursive subrow `.map(...)` render, the `isUnsavedRow`/`LAST_UNSAVED_SESSION_KEY` branch, and the `Primary Save` label branch (spec §4.5). `label` becomes always `entry.name`. `handleLoad` becomes always `applySessionPayload(entry.payload); setCurrentLoadedSessionName(entry.name);`. `handleConfirmDelete` becomes always `deleteNamedSession(entry.name)`. Drop the now-unused `deleteUnsavedHistory`, `listNamedSessionAutosaves`, `listUnsavedLastAutosaves`, `LAST_UNSAVED_SESSION_KEY` imports and the `onChange`-triggering `subrows` computation. Also remove `.session-list-item--indented` from `SessionListItem.css` — its only consumer is the removed `indented` prop.

  **Acceptance criteria:**
  - [ ] Every row — including the currently-loaded one — always renders plain `entry.name`, never `${entry.name} Primary Save` and never the `@ (x, y) (Autosaved Session)` unsaved-row label.
  - [ ] No row ever renders a nested/indented subrow, regardless of `currentLoadedSessionName`.
  - [ ] Clicking Load calls `applySessionPayload(entry.payload)` then `setCurrentLoadedSessionName(entry.name)` — never `setViewingUnsavedHistory` (component no longer imports it).
  - [ ] Clicking Delete's confirm always calls `deleteNamedSession(entry.name)` — the component no longer imports `deleteUnsavedHistory`.
  - [ ] The Delete `AlertDialog` confirm/cancel flow is otherwise unchanged (regression guard for a pre-existing, in-scope-to-keep behavior).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SessionListItem.test.tsx`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/console/SessionListItem.tsx`, `src/components/panels/screen/console/SessionListItem.test.tsx`, `src/components/panels/screen/console/SessionListItem.css`

  **Estimated scope:** S (3 files, subtraction only)

- [ ] **Task 2: `SessionsPanel.tsx` — remove the unsaved-history row**

  **Description:** Remove `unsavedHistory` state, its `listUnsavedLastAutosaves()` read in the initializer and in `refresh()`, the `unsavedHistoryRow` derivation, and the `...(unsavedHistoryRow ? [unsavedHistoryRow] : [])` spread (spec §4.5). `sorted` becomes `[...sessions].sort((a, b) => b.savedAt - a.savedAt)`. The Session Name input, "Save Session" button, `saveStatus` state, the date+time-formatted save-confirmation banner (`formatSessionTimestamp`), and "Clear Local Storage" are all left exactly as they are — none of this is autosave-history code.

  **Acceptance criteria:**
  - [ ] The rendered list is exactly `listSessions()`, sorted by `savedAt` descending — no synthetic row is ever added.
  - [ ] `formatSessionTimestamp` import and its use in the save-confirmation banner are untouched (regression guard — this is the one piece of the cut work's UI that stays).
  - [ ] Saving, then refreshing, shows only named entries — never a row derived from `listUnsavedLastAutosaves()` (function no longer imported).
  - [ ] Clear Local Storage's confirm flow is unchanged.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SessionsPanel.test.tsx`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (not a hard build dependency, but keeps the UI slice reviewable as one coherent unit before moving to backend removal).

  **Files:** `src/components/panels/screen/console/SessionsPanel.tsx`, `src/components/panels/screen/console/SessionsPanel.test.tsx`

  **Estimated scope:** S (2 files)

### Checkpoint: UI slice complete
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite, no new failures).
- [ ] Manual check (`npm run dev`): Sessions panel shows only named rows, each with Load/Delete, no subrows, no Primary Save label, no unsaved-history row.
- [ ] Reviewed with human before proceeding to Phase 2.

---

### Phase 2: Remove the autosave system, storage, and types (dependency order)

- [ ] **Task 3: Delete `sessionAutosave.ts`; remove its `main.tsx` wiring**

  **Description:** Delete `src/systems/sessionAutosave.ts` and `src/systems/sessionAutosave.test.ts` outright. Remove the `import { startSessionAutosave } from './systems/sessionAutosave'` line, the `startSessionAutosave()` call, and its explanatory comment block from `main.tsx`. Delete `src/main.sessionAutosave.test.ts` (it exists solely to assert that import/call are present — once the module is gone, a re-add would fail at the `tsc` level before any test could run, so there's no meaningful "does NOT call" test to write in its place, per spec §4.4).

  **Acceptance criteria:**
  - [ ] `src/systems/sessionAutosave.ts`, `src/systems/sessionAutosave.test.ts`, and `src/main.sessionAutosave.test.ts` no longer exist.
  - [ ] `main.tsx` has no reference to `sessionAutosave` or `startSessionAutosave` anywhere.
  - [ ] `startAudioBudget()` and every other `main.tsx` boot call are unaffected (regression guard — only the session-autosave lines are removed).
  - [ ] No test file anywhere still imports from `./systems/sessionAutosave` or `../systems/sessionAutosave`.

  **Verification:**
  - [ ] `npm test` (full suite — this task removes test files rather than adding/editing one, so there's no single focused file to target).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (but see Overview — ordered before Task 4 so the storage engine's autosave functions have no remaining caller when they're removed).

  **Files:** `src/systems/sessionAutosave.ts` (deleted), `src/systems/sessionAutosave.test.ts` (deleted), `src/main.tsx`, `src/main.sessionAutosave.test.ts` (deleted)

  **Estimated scope:** S (1 file edited, 3 deleted)

- [ ] **Task 4: `sessionStorageEngine.ts` — strip back to CRUD-only**

  **Description:** Remove `namedAutosaves`, `unsavedCurrent`, `unsavedLast` from `SessionsStorageShape` and `emptyStorage()`; remove their fallback reconstruction in `readStorage()`. Remove `saveNamedSessionAutosave`, `listNamedSessionAutosaves`, `saveUnsavedAutosave`, `promoteUnsavedHistoryOnBoot`, `listUnsavedLastAutosaves`, `deleteUnsavedHistory`, and the `pushCapped`/`sortedDesc` helpers that exist only to support them (spec §4.3). `deleteNamedSession` drops its `delete data.namedAutosaves[name]` line. `saveNamedSession`, `listSessions`, `loadSession` are otherwise untouched.

  **Acceptance criteria:**
  - [ ] `SessionsStorageShape` has exactly one field: `named: Record<string, SessionEntry>`.
  - [ ] `saveNamedSession('foo', a)` then `saveNamedSession('foo', b)` still leaves exactly one entry named `'foo'` holding `b` (parity check — same assertion `docs/tasks/SESSION_STORAGE.md` Task 5 already proved).
  - [ ] `deleteNamedSession('foo')` removes only that entry; no `namedAutosaves` reference remains in its implementation.
  - [ ] With a `localStorage` blob containing old `namedAutosaves`/`unsavedCurrent`/`unsavedLast` keys (simulating leftover dev data from this branch), `readStorage()`'s output type still only has `named` — the extra keys are silently ignored, not a parse failure (fail-soft, spec §4.3).
  - [ ] With corrupted JSON, `listSessions()` returns `[]` and `loadSession()` returns `undefined` — unchanged fail-soft behavior.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionStorageEngine.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3 (the deleted `sessionAutosave.ts` was the only caller of the autosave-history write functions; Tasks 1–2 already removed the UI's read-path calls).

  **Files:** `src/utils/sessionStorageEngine.ts`, `src/utils/sessionStorageEngine.test.ts`

  **Estimated scope:** S (2 files)

- [ ] **Task 5: `types/session.ts` — remove the autosave-history types**

  **Description:** Delete `MAX_AUTOSAVES_PER_SESSION`, `AutosaveHistory`, `LAST_UNSAVED_SESSION_KEY`, and the doc-comment block above them citing the now-archived spec (spec §4.2). `SessionPayload`, `SessionEntry`, `RobotAudioOverrideDiff`, `CompanyDiff`, `SessionPayloadVersion` are untouched — this is a pure-types file, same "the type-check is the verification" category as `docs/tasks/SESSION_STORAGE.md` Task 1.

  **Acceptance criteria:**
  - [ ] `MAX_AUTOSAVES_PER_SESSION`, `AutosaveHistory`, `LAST_UNSAVED_SESSION_KEY` are no longer exported from `types/session.ts`.
  - [ ] `SessionPayload`/`SessionEntry` and every other pre-existing export are byte-for-byte unchanged.
  - [ ] No file anywhere in `src/` still imports any of the three removed names (only provable via `npm run build:types` — a stray import fails the compile).

  **Verification:**
  - [ ] `npm run build:types` clean (the type-check *is* the verification for a pure-types file).
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 4 (its last remaining consumer in `src/`) and Task 1 (`SessionListItem.tsx`'s `LAST_UNSAVED_SESSION_KEY` import).

  **Files:** `src/types/session.ts`

  **Estimated scope:** XS (1 file)

- [ ] **Task 6: `sessionStore.ts` — remove `viewingUnsavedHistory`**

  **Description:** Remove the `viewingUnsavedHistory: boolean` field and `setViewingUnsavedHistory` action (spec §4.1). `setCurrentLoadedSessionName` simplifies from its current conditional (`name === null ? {...} : {..., viewingUnsavedHistory: false}`) to a plain `(name) => set({ currentLoadedSessionName: name })`.

  **Acceptance criteria:**
  - [ ] `SessionStore` has exactly `currentSessionName`, `currentLoadedSessionName`, `setCurrentSessionName`, `setCurrentLoadedSessionName` — no `viewingUnsavedHistory`/`setViewingUnsavedHistory`.
  - [ ] `setCurrentLoadedSessionName('x')` then `setCurrentLoadedSessionName(null)` still round-trips `currentLoadedSessionName` correctly (parity check on the surviving behavior).
  - [ ] `currentSessionName`/`currentLoadedSessionName` defaults (non-empty generated name; `null`) are unchanged.

  **Verification:**
  - [ ] `npx vitest run src/stores/sessionStore.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (`SessionListItem.tsx` was the only reader/writer of `viewingUnsavedHistory`).

  **Files:** `src/stores/sessionStore.ts`, `src/stores/sessionStore.test.ts`

  **Estimated scope:** XS (2 files, small diff)

### Checkpoint A: Autosave code fully gone, CRUD intact
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (full suite — note any pre-existing, unrelated failures explicitly, e.g. the known-flaky `worldTransition.test.ts` swell-clear case per `docs/todo/backlog.md` item 15, so new failures are distinguishable).
- [ ] `grep -rn "AutosaveHistory\|MAX_AUTOSAVES_PER_SESSION\|LAST_UNSAVED_SESSION_KEY\|viewingUnsavedHistory\|startSessionAutosave\|saveNamedSessionAutosave\|listNamedSessionAutosaves\|saveUnsavedAutosave\|promoteUnsavedHistoryOnBoot\|listUnsavedLastAutosaves\|deleteUnsavedHistory" src/` returns nothing (spec §5.3 criterion 3 — belt-and-suspenders on top of the type-check).
- [ ] Manual check (`npm run dev`): Save/Load/Delete/Clear Local Storage all work; leave the tab open past 5 minutes and confirm `localStorage`'s `trace-atlas.sessions.v1` key still has only a `named` field and hasn't changed since the last manual Save (spec §5.3 criterion 5).
- [ ] Reviewed with human before proceeding to Phase 3.

---

### Phase 3: Docs

- [ ] **Task 7: Rewrite `docs/SESSION_STORAGE.md`; add a roadmap sub-note; check `docs/UI_SHELL.md`**

  **Description:** Replace `docs/SESSION_STORAGE.md`'s "The 6-Slot Autosave" section with a short note that v1 has no autosave of any kind — only manual Save/Load/Delete/Clear Local Storage — and drop its "Update" button description (already false in code since commit `4566fcf`; the doc never caught up, so this also fixes a pre-existing staleness as a side effect, per spec §7 item 2). Spot-check every named function/field against the final shipped source, not this plan or the spec draft. Add a dated sub-note under [Phase 20](../todo/roadmap.md#20-session-storage) in `docs/todo/roadmap.md` recording that the Session Autosave History amendment was scoped and partially implemented, then cut before merge, linking to `docs/intent/session-autosave-removal.md` and the three archived intent/spec/tasks docs. Check `docs/UI_SHELL.md` for any stale Update-button or autosave-slot mention and fix if found.

  **Acceptance criteria:**
  - [ ] `docs/SESSION_STORAGE.md` describes only what exists after Tasks 1–6: named-session CRUD, no autosave, Load-only rows, the date+time save-confirmation banner. No leftover mention of the 6-slot scheme, the per-session/unsaved-bucket scheme, or the Update button.
  - [ ] Every function/type name cited in the rewrite (`saveNamedSession`, `deleteNamedSession`, `listSessions`, `loadSession`, `SessionsStorageShape`, `formatSessionTimestamp`) is spot-checked directly against the final source files, not assumed from this plan.
  - [ ] `docs/todo/roadmap.md`'s Phase 20 entry has a dated sub-note describing the scope-and-cut, linking to this task file, the spec, and the intent doc.
  - [ ] `docs/UI_SHELL.md` has no stale Update-button/autosave-slot reference (either confirmed already clean, or fixed).

  **Verification:**
  - [ ] Manual review — every documented name/behavior spot-checked against shipped code.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Tasks 1–6.

  **Files:** `docs/SESSION_STORAGE.md`, `docs/todo/roadmap.md`, `docs/UI_SHELL.md` (only if it needs a fix)

  **Estimated scope:** XS (2–3 files, docs only)

### Checkpoint B: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across all 7 tasks are met.
- [ ] Docs reflect the shipped (post-removal) state — every documented name spot-checked against source.
- [ ] Any outstanding manual/live-browser checks explicitly flagged here if not performed in this session — never silently skipped.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A removal task deletes a function/field that turns out to still have a caller elsewhere (missed during spec's file-structure pass) | Medium — build break, or worse, a silent runtime error if the missed caller isn't type-checked (e.g. a dynamic string key) | `npm run build:types` runs after every task, not just at checkpoints — a stray reference fails loudly and immediately, not at the end |
| The UI tasks (1–2) are done out of dependency order relative to backend removal (3–5), leaving a window where `SessionListItem.tsx` still imports now-about-to-be-removed storage functions | Low — this is the *intended* order (UI first strips the calls, so the backend removal that follows has no caller left) | Dependency Graph above makes the ordering explicit; Task 4/5's acceptance criteria explicitly check for zero remaining references |
| `docs/SESSION_STORAGE.md`'s rewrite (Task 7) silently re-introduces a claim from the stale pre-branch doc (e.g. the Update button) since it was already wrong before this phase started | Medium — a doc that looks freshly rewritten but still misleads | Task 7's acceptance criteria require every cited name to be spot-checked against final source, not carried over from the old doc text |
| Leftover `namedAutosaves`/`unsavedCurrent`/`unsavedLast` keys in a developer's real browser `localStorage` (from running this branch's dev build before the removal) cause confusion during manual testing | Low — cosmetic/dev-environment only, per spec §7 item 3's accepted no-migration decision | Task 4's acceptance criteria explicitly test that these keys are silently ignored on read, not treated as corruption |

## Open Questions

Carried forward from spec §7:

1. Reset vs. forward-revert mechanics — **Resolved** (Architecture Decisions above): forward removal, no history rewrite.
2. `docs/SESSION_STORAGE.md`'s pre-existing staleness (Update button, generic autosave-slot labels) — **Resolved**: fixed as part of Task 7's rewrite, not treated as separate scope creep.
3. No migration for already-written autosave-history `localStorage` data — **Resolved**: accepted, per spec §7 item 3; Task 4's fail-soft handling covers it.
4. Roadmap sub-note placement — **Resolved**: a dated sub-note under Phase 20 (Task 7), not a new numbered phase.

No open questions remain that block starting Task 1.
