# Phase Spec: Session Autosave Removal

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/session-autosave-removal.md](../intent/session-autosave-removal.md), confirmed via `interview-me` 2026-09-28. Amends roadmap [Phase 20](../todo/roadmap.md#20-session-storage) (shipped) a second time — the first amendment was the now-cut [Session Autosave History](../intent/archive/session-autosave-history.md) work (`docs/specs/archive/SESSION_AUTOSAVE_HISTORY.md`); this spec undoes that amendment rather than building on it. Status: not yet implemented — Specify phase, pending Crawford's review before Plan.

---

## 1. Overview & Claude Explanation

Branch `features/session-updates` currently has autosave code beyond what's shipped on `main`: a background 5-minute tick (`sessionAutosave.ts`) that writes into a per-named-session 3-deep FIFO history and a two-bucket ("current"/"last") unsaved-work history, plus `SessionListItem.tsx`/`SessionsPanel.tsx` UI to browse and load from that history. This was scoped and partially built per the now-archived [Session Autosave History spec](archive/SESSION_AUTOSAVE_HISTORY.md), then Crawford called it too complicated for v1.

This phase removes that entire autosave mechanism — code, storage shape, and UI — down to plain manual session CRUD: a Session Name input + "Save Session" button (create-or-overwrite by name), a list of saved sessions each with Load and Delete, and the existing "Clear Local Storage" button. **No background timer, no automatic saving of any kind, in v1.** This is a rollback below even the originally-shipped Phase 20 design (which had a 6-slot autosave) — not a partial simplification of the in-progress work.

### 1.1 What's removed entirely

- The 5-minute `setInterval` autosave tick (`src/systems/sessionAutosave.ts`) and its `main.tsx` wiring (`startSessionAutosave()`).
- Every autosave storage bucket: per-named-session history (`namedAutosaves`), and both unsaved buckets (`unsavedCurrent`, `unsavedLast`) in `sessionStorageEngine.ts`'s `SessionsStorageShape`. `localStorage` goes back to holding only `named: Record<string, SessionEntry>`.
- `sessionStore.ts`'s `viewingUnsavedHistory` field and `setViewingUnsavedHistory` action — there's no unsaved-history row left to view.
- `SessionListItem.tsx`'s recursive `indented` subrow rendering, the "Primary Save" label, and the unsaved-history pseudo-row (`LAST_UNSAVED_SESSION_KEY`).
- `types/session.ts`'s `MAX_AUTOSAVES_PER_SESSION`, `AutosaveHistory`, and `LAST_UNSAVED_SESSION_KEY`.
- `sessionStorageEngine.ts`'s `saveNamedSessionAutosave`, `listNamedSessionAutosaves`, `saveUnsavedAutosave`, `promoteUnsavedHistoryOnBoot`, `listUnsavedLastAutosaves`, `deleteUnsavedHistory`, and the `pushCapped`/`sortedDesc` helpers that only exist to support them.
- The now-dead `main.sessionAutosave.test.ts` (asserts `main.tsx` imports and calls `startSessionAutosave` — both become false) and `src/systems/sessionAutosave.ts`'s own test file.

### 1.2 What's kept

- **Plain CRUD, unchanged mechanics:** `saveNamedSession`, `deleteNamedSession`, `listSessions`, `loadSession` in `sessionStorageEngine.ts` — signatures and behavior untouched, only `deleteNamedSession`'s now-pointless `delete data.namedAutosaves[name]` line is dropped along with the field itself.
- **Load-only rows, no Update button** — `SessionListItem.tsx` already reverted its "Update" button back to "Load" on commit `4566fcf`; that stays exactly as-is (confirmed in the interview: overwrite-by-name is already covered by the top "Save Session" box, so no per-row Update is added back).
- **`sessionStore.currentLoadedSessionName`** (`string | null`) — still needed to drive the Load button and nothing else now that there's no autosave history keyed off it.
- **`formatSessionTimestamp`** (`src/utils/helpers.ts`) and its use in `SessionsPanel.tsx`'s save-confirmation banner — the date+time formatting change is independent of the autosave-history concept and stays, per the confirmed intent.
- **"Clear Local Storage"** — untouched, still wipes all of `localStorage` and resets `currentLoadedSessionName` to `null`.

### 1.3 Existing precedents this rollback follows

- **Rollback via forward removal commits, not `git reset`.** A reset was the original plan but doesn't survive contact with the actual commit contents — see §6 for why — so the Plan phase instead removes the autosave-history code with new commits on top of current `HEAD`, same as any other change to this codebase.
- **`docs/intent/archive/session-autosave-history.md`** / **`docs/specs/archive/SESSION_AUTOSAVE_HISTORY.md`** / **`docs/tasks/archive/SESSION_AUTOSAVE_HISTORY.md`** — already marked `Status: cut. Do not implement.` and moved to their `archive/` folders (done ahead of this spec, in the `interview-me` pass). This spec does not re-touch them beyond what's already there.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── session.ts                        MODIFIED — remove MAX_AUTOSAVES_PER_SESSION,
│                                          AutosaveHistory, LAST_UNSAVED_SESSION_KEY, and the
│                                          "Session Autosave History" doc-comment block referencing
│                                          the now-archived spec. SessionEntry/SessionPayload/etc.
│                                          unchanged.
├── utils/
│   ├── sessionStorageEngine.ts           MODIFIED — SessionsStorageShape back to { named } only;
│   │                                     remove namedAutosaves/unsavedCurrent/unsavedLast and
│   │                                     every function/helper that only exists for them (§1.1)
│   ├── sessionStorageEngine.test.ts      MODIFIED — remove autosave-history test blocks; keep/adapt
│   │                                     named-session CRUD tests; deleteNamedSession test drops
│   │                                     its namedAutosaves-cascade assertion
│   └── helpers.ts                        UNCHANGED — formatSessionTimestamp stays
├── systems/
│   ├── sessionAutosave.ts                DELETED
│   └── sessionAutosave.test.ts           DELETED
├── stores/
│   ├── sessionStore.ts                   MODIFIED — remove viewingUnsavedHistory field and
│   │                                     setViewingUnsavedHistory action; setCurrentLoadedSessionName
│   │                                     simplifies back to a plain setter (no more
│   │                                     viewingUnsavedHistory side effect to clear)
│   └── sessionStore.test.ts              MODIFIED — remove every viewingUnsavedHistory-related test
│                                         case; keep currentSessionName/currentLoadedSessionName ones
├── main.tsx                              MODIFIED — remove the sessionAutosave import and the
│                                         startSessionAutosave() call + its explanatory comment
├── main.sessionAutosave.test.ts          DELETED
└── components/panels/screen/console/
    ├── SessionsPanel.tsx                 MODIFIED — remove unsavedHistory state, its
    │                                     listUnsavedLastAutosaves() read/refresh, and the
    │                                     unsavedHistoryRow merge into `sorted`; list becomes
    │                                     listSessions() sorted by savedAt, unchanged otherwise
    ├── SessionsPanel.test.tsx            MODIFIED — remove unsaved-history-row test cases
    ├── SessionListItem.tsx               MODIFIED — remove indented prop, subrows rendering,
    │                                     isUnsavedRow/LAST_UNSAVED_SESSION_KEY branch, and the
    │                                     "Primary Save" label branch; label is always plain
    │                                     entry.name; Load always calls applySessionPayload then
    │                                     setCurrentLoadedSessionName(entry.name); Delete always
    │                                     calls deleteNamedSession (deleteUnsavedHistory import removed)
    └── SessionListItem.test.tsx          MODIFIED — remove subrow/indented/Primary-Save/unsaved-row
                                          test cases; keep Load/Delete-confirm CRUD cases
docs/
├── SESSION_STORAGE.md                    REWRITTEN — "The 6-Slot Autosave" section replaced with a
│                                         short "No Autosave in v1" note; "Update" button mention
│                                         removed (was already dropped from code, doc was stale);
│                                         storage-engine function list matches §1.2's kept set
├── UI_SHELL.md                           MODIFIED only if it currently describes autosave slots or
│                                         the Update button (confirm during Plan)
└── todo/roadmap.md                       MODIFIED — a new dated sub-note under Phase 20 recording
                                          that the Session Autosave History amendment was scoped,
                                          partially built, then cut before merge (see §6)
```

No new dependency. No new component or file beyond doc updates — this phase is subtractive.

---

## 3. Implementation Boundaries & Constraints

Non-negotiable, from `CLAUDE.md` (re-checked for this change):

- **No Tone synths in components.** N/A — nothing here touches audio.
- **State stays JSON-serializable, no runtime objects in Zustand.** `sessionStore` shrinks (removes `viewingUnsavedHistory`); nothing added violates this.
- **No new timer of any kind.** This phase deletes the one background `setInterval` this codebase had for session persistence — it does not replace it with anything. The `CLAUDE.md` "no `setTimeout`/`setInterval` for musical timing" guardrail was never actually at issue here (background persistence, not musical timing), and after this phase there's no interval-based session code left to even discuss the exception for.
- **No GSAP involved.** Nothing here animates.
- **UI shell:** unchanged — everything stays inside `ScreenViewport`'s Settings content, never `SleeveContainer`.
- **Melodies untouched.** Loading a named session still regenerates melodies from the seed via the existing `applySessionPayload` → `retransmitWorld` path, unchanged.

**Ask first** (per `CLAUDE.md`): none anticipated — no new dependency, no architecture change, pure removal.
**Never:** leave dead code referencing removed exports (`namedAutosaves`, `AutosaveHistory`, `LAST_UNSAVED_SESSION_KEY`, `viewingUnsavedHistory`, `startSessionAutosave`) anywhere in `src/` after this phase — a build/lint/type-check pass must come back clean, not just "the feature looks gone in the UI"; silently leave any of the three archived autosave-history docs un-marked or un-moved (already done, verify not regressed); reintroduce any form of automatic/background saving.

---

## 4. Code Style & Architecture Conventions

### 4.1 Store (`src/stores/sessionStore.ts`)

```typescript
export interface SessionStore {
  currentSessionName: string;
  /** Which named session, if any, is currently loaded — drives SessionListItem.tsx's Load-button
   *  wiring only now that there's no autosave history keyed off it. Defaults to null: nothing ever
   *  auto-loads a session on boot. */
  currentLoadedSessionName: string | null;
  setCurrentSessionName: (name: string) => void;
  setCurrentLoadedSessionName: (name: string | null) => void;
}
```

`viewingUnsavedHistory`/`setViewingUnsavedHistory` and every mutual-exclusivity comment referencing them are removed. `setCurrentLoadedSessionName` becomes a plain `(name) => set({ currentLoadedSessionName: name })` — no conditional branch.

### 4.2 Types (`src/types/session.ts`)

`MAX_AUTOSAVES_PER_SESSION`, `AutosaveHistory`, and `LAST_UNSAVED_SESSION_KEY` — and the doc-comment block above them citing the archived spec — are deleted outright. `SessionPayload`, `SessionEntry`, `RobotAudioOverrideDiff`, `CompanyDiff`, `SessionPayloadVersion` are untouched.

### 4.3 The storage engine (`src/utils/sessionStorageEngine.ts`)

```typescript
interface SessionsStorageShape {
  named: Record<string, SessionEntry>;
}

function emptyStorage(): SessionsStorageShape {
  return { named: {} };
}

export function saveNamedSession(name: string, payload: SessionPayload): void;   // unchanged
export function deleteNamedSession(name: string): void;                          // drops the namedAutosaves cascade line; otherwise unchanged
export function listSessions(): SessionEntry[];                                  // unchanged
export function loadSession(name: string): SessionPayload | undefined;           // unchanged
```

`readStorage()` drops the `namedAutosaves`/`unsavedCurrent`/`unsavedLast` fallback fields from its parsed-shape reconstruction — a pre-existing user's now-orphaned autosave-history keys (from this branch's own dev testing, if any) are simply ignored on the next read, same "extra keys aren't a parse failure" fail-soft behavior the engine already has for any unrecognized key. `saveNamedSessionAutosave`, `listNamedSessionAutosaves`, `saveUnsavedAutosave`, `promoteUnsavedHistoryOnBoot`, `listUnsavedLastAutosaves`, `deleteUnsavedHistory`, `pushCapped`, `sortedDesc` are all deleted.

### 4.4 The autosave system (`src/systems/sessionAutosave.ts`)

Deleted in full, along with `sessionAutosave.test.ts`. `main.tsx` drops:

```typescript
import { startSessionAutosave } from './systems/sessionAutosave'
// ...
startSessionAutosave()
```

and its explanatory comment block. `main.sessionAutosave.test.ts` — which exists solely to assert that import and call are present — is deleted rather than inverted into a "does NOT call" test, since there's no meaningful regression to guard against once the module it references no longer exists (a re-add would fail at the import itself, `tsc`-level, before any test could run).

### 4.5 The UI (`SessionListItem.tsx`, `SessionsPanel.tsx`)

```typescript
interface SessionListItemProps {
  entry: SessionEntry;
  onChange?: () => void;
}
```

`indented` prop, the recursive subrow `.map(...)` render, `isUnsavedRow`/`LAST_UNSAVED_SESSION_KEY` handling, and the `Primary Save` label branch are all removed. Label is always `entry.name`. `handleLoad` is always `applySessionPayload(entry.payload); setCurrentLoadedSessionName(entry.name);`. `handleConfirmDelete` is always `deleteNamedSession(entry.name)` — the `isUnsavedRow ? deleteUnsavedHistory() : ...` branch goes with it, along with the now-unused `deleteUnsavedHistory`/`listNamedSessionAutosaves`/`listUnsavedLastAutosaves` imports.

`SessionsPanel.tsx` drops `unsavedHistory` state, the `listUnsavedLastAutosaves()` calls in its initializer and `refresh()`, the `unsavedHistoryRow` derivation, and the `...(unsavedHistoryRow ? [unsavedHistoryRow] : [])` spread — `sorted` becomes `[...sessions].sort((a, b) => b.savedAt - a.savedAt)`. `formatSessionTimestamp` stays exactly where it is (save-confirmation banner).

### 4.6 Naming and conventions

No new identifiers are introduced by this phase. Section-header comment blocks (`// ====`) and `IMPORTS/TYPES/FUNCTIONS` layout are preserved in every modified file, matching the existing style — this is subtraction within the existing structure, not a restructure.

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location

Vitest + Testing Library, co-located `*.test.ts(x)`, unchanged.

### 5.2 Changed/removed tests

- **`sessionStorageEngine.test.ts`** — remove every `saveNamedSessionAutosave`/`listNamedSessionAutosaves`/`saveUnsavedAutosave`/`promoteUnsavedHistoryOnBoot`/`listUnsavedLastAutosaves`/`deleteUnsavedHistory` test block. `deleteNamedSession`'s test drops its "also clears namedAutosaves" assertion, keeps the rest. `saveNamedSession`/`listSessions`/`loadSession` cases, and malformed-JSON fail-soft cases, stay as regression coverage for the CRUD path.
- **`sessionAutosave.test.ts`** — deleted with its source file.
- **`main.sessionAutosave.test.ts`** — deleted; replace with nothing (no test asserts the *absence* of a call to a function that no longer exists — see §4.4's reasoning).
- **`sessionStore.test.ts`** — remove the `viewingUnsavedHistory defaults to false` block and every `setViewingUnsavedHistory`/mutual-exclusivity case. Keep `currentSessionName`/`currentLoadedSessionName` cases; `setCurrentLoadedSessionName with a non-null name clears viewingUnsavedHistory` and `setCurrentLoadedSessionName(null) does NOT itself set viewingUnsavedHistory` are removed outright (the behavior they guard no longer exists).
- **`SessionListItem.test.tsx`** — remove every subrow-rendering, `indented`, `Primary Save` label, and unsaved-row test case. Keep/restore: a loaded row still shows "Load" (never "Update" — already true, stays true); Load calls `applySessionPayload` and `setCurrentLoadedSessionName(entry.name)`; Delete goes through the `AlertDialog` confirm and calls `deleteNamedSession`.
- **`SessionsPanel.test.tsx`** — remove the unsaved-history-row test cases. Keep: Save writes via `saveNamedSession` and shows the date+time-formatted confirmation banner; the list reflects `listSessions()`; Clear Local Storage confirm flow.

### 5.3 Success criteria

1. No automatic/background save happens under any circumstance — grep confirms `setInterval` no longer appears anywhere under `src/systems/` or `src/utils/session*` after this phase. (deterministic, verified by file absence + full-suite pass)
2. Saving, loading, and deleting a named session behaves identically to before this phase's autosave-history work started — same functions, same signatures, same test assertions carried forward. (deterministic, unit-tested)
3. No dangling reference to any removed export (`AutosaveHistory`, `MAX_AUTOSAVES_PER_SESSION`, `LAST_UNSAVED_SESSION_KEY`, `viewingUnsavedHistory`, `setViewingUnsavedHistory`, `startSessionAutosave`, `stopSessionAutosave`, `saveNamedSessionAutosave`, `listNamedSessionAutosaves`, `saveUnsavedAutosave`, `promoteUnsavedHistoryOnBoot`, `listUnsavedLastAutosaves`, `deleteUnsavedHistory`) anywhere in `src/`. (deterministic — `npm run build:types` fails loudly on any miss)
4. `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
5. Manual check in `npm run dev`: Save/Load/Delete/Clear Local Storage all work exactly as before; no autosave-related UI (subrows, Primary Save label, unsaved-history row) appears anywhere; waiting past 5 minutes with the tab open causes no background write (spot-check `localStorage` in devtools, confirm `named` is the only top-level key and it hasn't changed since the last manual Save).

### 5.4 Verification order

`npm run build:types` → `npm run lint` → `npm test` → `npm run build` → manual check in `npm run dev`.

---

## 6. Documentation & Git/Workflow Context

- **Docs to update:** `docs/SESSION_STORAGE.md` — rewrite "The 6-Slot Autosave" section (already stale relative to the branch's in-progress autosave-history work, and about to be stale relative to the *removal* too) into a short note that v1 has no autosave at all, only manual Save/Load/Delete/Clear Local Storage; drop its "Update" button description (already false in code as of commit `4566fcf`, the doc just never caught up). `docs/UI_SHELL.md` — check during Plan for any stale Update-button or autosave-slot mention. `docs/todo/roadmap.md` — add a dated sub-note under [Phase 20](../todo/roadmap.md#20-session-storage) recording that the Session Autosave History amendment was scoped and partially implemented, then cut before merge per this spec, linking to `docs/intent/session-autosave-removal.md` and the archived intent/spec/tasks trio.
- **Branch:** stays on `features/session-updates` — this is a rollback of that branch's own in-progress work, not a new branch.
- **Mechanics of the rollback — forward removal, not `git reset` (revised; see §7 item 1).** `features/session-updates` has no upstream/remote (`git rev-parse @{u}` fails, `git ls-remote --heads origin` shows no matching ref) so rewriting its history would have been *safe*, but a plain `git reset` back to before commit `3227081` was checked against the real commit contents and rejected: the "Revert Update to Load" change is entangled inside commit `4566fcf` together with the Primary-Save-label/autosave-subrow additions it was bundled with, so resetting past it would silently bring the Update button back — the opposite of the confirmed intent ("no per-row Update button... overwrite-by-name already covered by the Save box"). Similarly, the date+time save-confirmation banner (`SessionsPanel.tsx`'s `saveStatus` state/JSX) was introduced for the first time in the final commit `02efeb1`, bundled with the unsaved-history-row addition — there is no earlier, disentangled version of it to reset back to. **Implementation instead builds forward from current `HEAD` (`02efeb1`)**, deleting the autosave-history-specific code called out in §2/§4 above via new commits — which keeps the already-shipped Load-only behavior and the date+time banner exactly as they are today, with zero reconstruction needed.
- **Commits:** one per task, tests with their code; attribution per this session's rules. **PR:** references this spec; reviewed by another contributor per `CLAUDE.md`.
- **Sequencing:** independent of every other open roadmap item; touches only files Phase 20 already owns.

---

## 7. Open Questions & Risks

Spec-author (Claude) decisions made to keep the implementation concrete — **flagged for Crawford's explicit confirmation before the Plan phase**, not silently baked in.

1. **Resolved — forward removal, not reset (§6).** Originally scoped as a `git reset`; checked against the actual commit contents and rejected because the Update→Load revert and the date+time banner are each bundled inside larger commits (`4566fcf`, `02efeb1`) alongside autosave-history-specific work, so a reset would have silently undone confirmed-wanted behavior along with the cut work. Implementation removes the autosave-history code forward, via new commits on `features/session-updates` (confirmed no upstream/remote exists for this branch, so either approach was safe w.r.t. force-push — forward removal wins on correctness, not safety).
2. **`docs/SESSION_STORAGE.md`'s current content already doesn't match `main`** — it describes the "Update" button and generic autosave-slot labels, both of which were already changed by commit `4566fcf` on this branch before the autosave-history work was cut. Reasoning: since this phase rewrites that doc's autosave section anyway, the Update-button staleness gets fixed as a side effect rather than needing its own separate doc task. **Confirm this reads as in-scope cleanup, not scope creep.**
3. **No migration for any already-written autosave-history `localStorage` data.** Only relevant to whoever has actually run this branch's dev build (almost certainly just Crawford) — any `namedAutosaves`/`unsavedCurrent`/`unsavedLast` keys already sitting in a browser's `localStorage` are silently orphaned (ignored on read, dropped on next write), matching the same "autosave data is disposable, no migration" precedent the original autosave-history spec itself set (§7 item 6 there). **Confirm acceptable, or ask for an explicit `localStorage.clear()` step during testing.**
4. **Roadmap sub-note placement (§6)** — proposed as a dated addition under Phase 20 rather than a new numbered phase, since this reverses an amendment to already-"Done" work rather than building something new. Exact wording/placement is left for Plan. **Confirm this reading.**
