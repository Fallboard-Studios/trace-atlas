# Implementation Plan: Session Autosave History

> **Status: cut. Do not implement.** This plan was drafted from
> [docs/specs/archive/SESSION_AUTOSAVE_HISTORY.md](../specs/archive/SESSION_AUTOSAVE_HISTORY.md),
> then the underlying work was reverted at Crawford's call as too complicated for v1 — see
> [docs/intent/session-autosave-removal.md](../intent/session-autosave-removal.md). Sessions go back
> to plain manual CRUD with no autosave at all. This doc is kept as a historical record only.

Source spec: [docs/specs/archive/SESSION_AUTOSAVE_HISTORY.md](../../specs/archive/SESSION_AUTOSAVE_HISTORY.md). Source intent: [docs/intent/archive/session-autosave-history.md](../../intent/archive/session-autosave-history.md). Amends roadmap [Phase 20](../../todo/roadmap.md#20-session-storage) (shipped).

## Overview

Two changes to the shipped Sessions feature: revert the per-row "Update" button back to "Load" everywhere (with a "Primary Save" label on the currently-loaded row instead), and replace the flat 6-slot autosave scheme with a per-session 3-deep rotating history plus a two-bucket ("current"/"last") scheme for unsaved work. The 7 tasks below split into four phases — **pure foundations** (the new storage schema/API and a shared timestamp formatter, both provable without any UI or store wiring), **the autosave tick** (rewiring `sessionAutosave.ts` to write into the new schema and promote unsaved history once per boot — still headless), **the UI slice** (the row component's revert + recursive subrow rendering, then the panel that hosts it), and **docs**. Foundations are ordered first because every other task's acceptance criteria depend on the new storage API existing and behaving correctly.

## Architecture Decisions

Carried forward from spec §7, all first-pass proposals pending Crawford's confirmation before Task 1 starts (per the spec's own framing — flag again here since this plan bakes them into concrete task acceptance criteria):

- **`deleteNamedSession` cascades to delete that session's own autosave history** (spec §7 item 1) — Task 1's acceptance criteria enforce this directly.
- **No Delete button on any autosave subrow**, named or unsaved (spec §7 item 2) — Task 5 does not add one. The unsaved-history row's own existing top-level Delete button is kept, now clearing the whole `unsavedLast` bucket.
- **Loading a subrow keeps its parent session "current"** (spec §7 item 3) — a confirmed behavior change from today's shipped code, where loading *any* autosave slot unconditionally clears `currentLoadedSessionName`. Task 5's acceptance criteria include a direct regression guard for this reversal.
- **The unsaved-history row's own label stays identity-based** (`` `${attenuationStyleName} @ (x, y)` ``), not timestamp-based (spec §7 item 4) — its Load action applies its *newest* entry, but the row itself isn't "the newest entry," it's a summary of the bucket. Task 6 implements this exact asymmetry with the named-session case.
- **No migration for pre-existing autosave data** from the old 5-slot+draft shape (spec §7 item 6) — the new read path in `sessionStorageEngine.ts` simply ignores the old `autosave`/`nextRotatingIndex` keys rather than converting them. Not a task on its own; implicit in Task 1's schema replacement.

## Definition of Done (every task)

- [ ] `npm run build:types` and `npm run lint` clean.
- [ ] The task's focused tests pass; the **full suite** (`npm test`) passes at every checkpoint.
- [ ] `CLAUDE.md` PR checklist: no synths in components; no timelines/refs in Zustand state; the autosave timer stays a plain, non-musical `setInterval`; state stays JSON-serializable.
- [ ] Any new gate with a real failure mode (FIFO-of-3 eviction, cascade delete, boot-only promotion, subrow-keeps-parent-loaded) is mutation-checked — break it, confirm the test fails, revert.
- [ ] One commit per task, tests with their code, message ends with this session's attribution line.

## Dependency Graph

```
Phase 1 — Pure foundations
Task 1 (types/session.ts + sessionStorageEngine.ts: new schema/API)
Task 2 (helpers.ts: formatSessionTimestamp)               ── independent of Task 1, can run in parallel
Task 3 (sessionStore.ts: viewingUnsavedHistory)            ── independent of Tasks 1–2, can run in parallel
                ── Checkpoint A: storage/format/store proven headless ──
Phase 2 — Autosave tick
Task 1, Task 3 ──→ Task 4 (sessionAutosave.ts: tick rewrite + boot promotion)
                ── Checkpoint B: full non-UI autosave lifecycle proven ──
Phase 3 — UI
Task 1, Task 2, Task 3 ──→ Task 5 (SessionListItem.tsx + sessionConfig.ts: Load revert, Primary Save, subrows)
Task 1, Task 2, Task 5 ──→ Task 6 (SessionsPanel.tsx: banner format, unsaved-history row)
                ── Checkpoint C: feature complete end to end ──
Phase 4 — Docs
Tasks 1–6 ──→ Task 7 (docs)
                ── Checkpoint D: complete ──
```

Independent chains that could run in parallel: Task 1 ∥ Task 2 ∥ Task 3 (none of the three depend on each other).

## Task List

### Phase 1: Pure foundations

- [ ] **Task 1: `src/types/session.ts` + `src/utils/sessionStorageEngine.ts` — new schema and storage API**

  **Description:** Replace `AutosaveSlotId`/`AUTOSAVE_ROTATING_SLOT_IDS`/`isAutosaveSlotName` with `MAX_AUTOSAVES_PER_SESSION`, `AutosaveHistory` (`SessionEntry[]`, length 0–3), and `LAST_UNSAVED_SESSION_KEY` (spec §4.2). Restructure `SessionsStorageShape` to `{ named, namedAutosaves: Record<string, AutosaveHistory>, unsavedCurrent: AutosaveHistory, unsavedLast: AutosaveHistory }` and implement the new function set (spec §4.3): `saveNamedSession` (unchanged), `deleteNamedSession` (now cascades into `namedAutosaves`), `listSessions`/`loadSession` (named only), `saveNamedSessionAutosave`/`listNamedSessionAutosaves`, `saveUnsavedAutosave`/`promoteUnsavedHistoryOnBoot`/`listUnsavedLastAutosaves`.

  **Acceptance criteria:**
  - [ ] `saveNamedSessionAutosave('foo', ...)` called 4 times leaves exactly 3 entries under `'foo'`'s history, oldest evicted; a different session's history (`'bar'`) is untouched by any of the 4 calls.
  - [ ] `deleteNamedSession('foo')` removes both `named['foo']` and `namedAutosaves['foo']` in the same call — no dead entry survives.
  - [ ] `saveUnsavedAutosave` caps `unsavedCurrent` at 3 the same way, independent of any named session's history.
  - [ ] `promoteUnsavedHistoryOnBoot()` moves the full contents of `unsavedCurrent` into `unsavedLast` (overwriting whatever was there), then empties `unsavedCurrent` — verified with `unsavedLast` pre-populated from a prior "boot" to confirm it's overwritten, not merged.
  - [ ] `listSessions()` returns only named entries (no autosave-shaped rows mixed in) — regression guard for the old flat-list behavior being gone.
  - [ ] `listNamedSessionAutosaves`/`listUnsavedLastAutosaves` both return `[]` (not `undefined`, no throw) for a session/bucket with no history, and sort their results by `savedAt` descending.
  - [ ] With malformed JSON manually written to the storage key, every read function above fails soft (`[]`/`undefined`, never throws) — same standard as the existing `readStorage()` fallback.
  - [ ] Old-shape data (`{ autosave: {...}, nextRotatingIndex: N }` with no `namedAutosaves`/`unsavedCurrent`/`unsavedLast` keys) parses without throwing — the new read path treats missing new-shape keys as empty, per spec §7 item 6 (no migration, no crash on old data).

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionStorageEngine.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/types/session.ts`, `src/utils/sessionStorageEngine.ts`, `src/utils/sessionStorageEngine.test.ts`

  **Estimated scope:** M (3 files — schema replacement plus several new functions)

- [ ] **Task 2: `src/utils/helpers.ts` — `formatSessionTimestamp`**

  **Description:** A pure date+time formatter (spec §4.6) — `new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })` — shared by the save-confirmation banner (Task 6) and every autosave-subrow label (Task 5).

  **Acceptance criteria:**
  - [ ] `formatSessionTimestamp(ms)` returns a string containing both a recognizable month/day and a recognizable time-of-day for a known fixed timestamp (assert on presence of expected substrings, not a hardcoded exact locale string, since `toLocaleString` output can vary by environment).
  - [ ] The function is pure — same input always produces the same output, no reliance on mutable module state.

  **Verification:**
  - [ ] `npx vitest run src/utils/helpers.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/helpers.ts`, `src/utils/helpers.test.ts`

  **Estimated scope:** XS (2 files)

- [ ] **Task 3: `src/stores/sessionStore.ts` — `viewingUnsavedHistory`**

  **Description:** Add `viewingUnsavedHistory: boolean` (default `false`) and `setViewingUnsavedHistory(viewing: boolean)` (spec §4.1). Enforce mutual exclusivity: `setCurrentLoadedSessionName(name)` with a non-null `name` also sets `viewingUnsavedHistory: false`; `setViewingUnsavedHistory(true)` also sets `currentLoadedSessionName: null`.

  **Acceptance criteria:**
  - [ ] `viewingUnsavedHistory` defaults to `false` on every fresh store creation.
  - [ ] Calling `setCurrentLoadedSessionName('some-session')` after `setViewingUnsavedHistory(true)` leaves `viewingUnsavedHistory` back at `false`.
  - [ ] Calling `setViewingUnsavedHistory(true)` after `setCurrentLoadedSessionName('some-session')` leaves `currentLoadedSessionName` back at `null`.
  - [ ] `setCurrentLoadedSessionName(null)` does **not** itself set `viewingUnsavedHistory` (only an explicit `setViewingUnsavedHistory(true)` call does) — regression guard against accidentally coupling "nothing named is loaded" with "now viewing unsaved history."

  **Verification:**
  - [ ] `npx vitest run src/stores/sessionStore.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/stores/sessionStore.ts`, `src/stores/sessionStore.test.ts`

  **Estimated scope:** XS (2 files)

### Checkpoint A: Foundations proven headless
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite, no new failures).
- [ ] The new storage API's FIFO-of-3/cascade-delete/boot-promotion behaviors and the store's mutual-exclusivity behavior are all provable in tests with no UI or autosave-tick involvement.
- [ ] Reviewed with human before proceeding to Phase 2.

---

### Phase 2: Autosave tick

- [ ] **Task 4: `src/systems/sessionAutosave.ts` — tick rewrite + boot promotion**

  **Description:** Per spec §4.4: `tick()` reads `currentLoadedSessionName`; if non-null, calls `saveNamedSessionAutosave(loadedName, payload)`; if `null`, calls `saveUnsavedAutosave(payload)`. `startSessionAutosave()` calls `promoteUnsavedHistoryOnBoot()` once, inside its existing idempotency guard, before starting the interval.

  **Acceptance criteria:**
  - [ ] With a named session loaded, 4 consecutive simulated ticks leave exactly 3 entries in that session's own history (Task 1's `listNamedSessionAutosaves`), oldest evicted — never touching `unsavedCurrent`/`unsavedLast`.
  - [ ] With nothing loaded, 4 consecutive ticks leave exactly 3 entries in `unsavedCurrent` the same way, never touching any named session's history.
  - [ ] Switching which named session is loaded mid-run writes subsequent ticks into the newly-loaded session's own history, leaving the previously-loaded session's history exactly as it was.
  - [ ] `startSessionAutosave()` calls `promoteUnsavedHistoryOnBoot()` exactly once even if called twice in a row (the existing idempotency guard covers it) — a spy/mock assertion, not just an absence-of-crash check.
  - [ ] Calling `startSessionAutosave()` → `stopSessionAutosave()` → `startSessionAutosave()` again (a genuine restart, not a double-call) is out of scope for "once per boot" — document this as a known limitation in a code comment if the implementation can't tell a restart from a double-call, rather than silently making a promotion-on-every-start claim the tests don't back up.

  **Verification:**
  - [ ] `npx vitest run src/systems/sessionAutosave.test.ts` (fake timers).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1, Task 3.

  **Files:** `src/systems/sessionAutosave.ts`, `src/systems/sessionAutosave.test.ts`

  **Estimated scope:** S (2 files)

### Checkpoint B: Full non-UI autosave lifecycle proven
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite).
- [ ] Per-session history, the unsaved current/last split, and boot-time promotion are all provable with no UI involved.
- [ ] Reviewed with human before proceeding to Phase 3.

---

### Phase 3: UI

- [ ] **Task 5: `SessionListItem.tsx` — Load revert, Primary Save label, recursive subrows**

  **Description:** Per spec §4.5: remove the `isCurrentlyLoaded` → Update branch entirely (`handleUpdate`, `saveNamedSession` call, `UPDATE_SESSION_SCHEMA` import) — every row always renders Load, which always calls `applySessionPayload` then `setCurrentLoadedSessionName`. The currently-loaded named row's label becomes `` `${entry.name} Primary Save` ``. Add an `indented?: boolean` prop (CSS modifier, no Delete button when true) and recursive rendering: when `isCurrentlyLoaded`, render `listNamedSessionAutosaves(entry.name)` as indented `SessionListItem`s beneath it, each labeled `` `Autosave from ${formatSessionTimestamp(savedAt)}` ``, each Load setting `currentLoadedSessionName` to the **parent's** name (not `null`) — the confirmed "subrow load keeps parent current" behavior. Remove `UPDATE_SESSION_SCHEMA` from `sessionConfig.ts` (now unused).

  **Acceptance criteria:**
  - [ ] The currently-loaded named row always shows a "Load" button, never "Update" — clicking it re-applies the saved payload and does not call `saveNamedSession` (regression guard for the revert).
  - [ ] The currently-loaded row's label reads `` `${name} Primary Save` ``; a non-loaded row's label is plain `name`.
  - [ ] The currently-loaded row renders up to 3 indented subrows (from `listNamedSessionAutosaves`) with `Autosave from …` labels; a non-loaded named row renders **no** subrows even when it has its own stored history (drill-down-on-load-only rule).
  - [ ] Clicking Load on a subrow leaves `currentLoadedSessionName` equal to the **parent** session's name afterward (not `null`) — direct regression guard for the reversed today's-code behavior.
  - [ ] An `indented` row renders no Delete button (spec §7 item 2 — no per-subrow delete).
  - [ ] `sessionConfig.ts` no longer exports `UPDATE_SESSION_SCHEMA`, and nothing in the codebase still imports it (`npm run build:types` catches any straggling import).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SessionListItem.test.tsx`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1, Task 2, Task 3.

  **Files:** `src/components/panels/screen/console/SessionListItem.tsx`, `src/components/panels/screen/console/SessionListItem.css`, `src/components/panels/screen/console/SessionListItem.test.tsx`, `src/data/sessionConfig.ts`

  **Estimated scope:** M (4 files — the behavioral revert plus new recursive rendering)

- [ ] **Task 6: `SessionsPanel.tsx` — date+time banner, unsaved-history row**

  **Description:** Per spec §4.5/§4.6: the save-confirmation banner (added in a prior session) switches from `toLocaleTimeString()` to `formatSessionTimestamp`. Render the single unsaved-history row only when `listUnsavedLastAutosaves()` is non-empty, using its **newest** entry for the existing `` `${attenuationStyleName} @ (${x}, ${y}) (Autosaved Session)` `` label; its Load button applies that newest entry's payload, then calls `setCurrentLoadedSessionName(null)` and `setViewingUnsavedHistory(true)`. When `viewingUnsavedHistory` is `true`, render all of `listUnsavedLastAutosaves()` (all up to 3, including the newest — no de-duplication, per spec §7 item 4) as indented `SessionListItem` subrows beneath it, each Load call setting the same `currentLoadedSessionName: null` / `viewingUnsavedHistory: true` pair (stays "current," mirroring Task 5's named-subrow behavior).

  **Acceptance criteria:**
  - [ ] The save-confirmation banner text uses the new date+time format (assert via the same substring approach as Task 2, not an exact locale-dependent string).
  - [ ] The unsaved-history row appears only when `listUnsavedLastAutosaves()` is non-empty, and is absent when it's `[]`.
  - [ ] The unsaved-history row's label uses the existing `@ (x, y) (Autosaved Session)` format, derived from its newest entry.
  - [ ] Clicking its Load button applies the newest entry's payload and leaves `viewingUnsavedHistory: true`, `currentLoadedSessionName: null`.
  - [ ] Once loaded, up to 3 indented subrows appear beneath it, each individually loadable, each leaving `viewingUnsavedHistory: true` afterward.
  - [ ] On initial render (fresh mount, store reset to defaults), no row's subrows are visible and the unsaved-history row itself is collapsed — regression guard for "nothing expanded by default."

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SessionsPanel.test.tsx`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1, Task 2, Task 5.

  **Files:** `src/components/panels/screen/console/SessionsPanel.tsx`, `src/components/panels/screen/console/SessionsPanel.test.tsx`

  **Estimated scope:** M (2 files — panel logic plus a genuinely new row kind)

### Checkpoint C: Feature complete end to end
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual check (`npm run dev`): Load-not-Update on the currently-loaded row, the "Primary Save" label, per-session subrow drill-down, the unsaved-history row's appearance/label/drill-down, and the date+time formatting all behave as described — including a real 5-minute tick (or a shortened test-only override) and an actual browser refresh to confirm boot-time promotion moves `unsavedCurrent` into `unsavedLast` without auto-loading anything.
- [ ] Reviewed with human before proceeding to Phase 4.

---

### Phase 4: Docs

- [ ] **Task 7: Rewrite `docs/SESSION_STORAGE.md`'s autosave section; update `docs/todo/roadmap.md`**

  **Description:** Replace `docs/SESSION_STORAGE.md`'s "The 6-Slot Autosave" section with the per-session/two-bucket model, and remove its "Update" button description from the UI section — spot-checking every named function/field against the final source rather than the spec draft. Add a dated sub-entry to `docs/todo/roadmap.md` amending Phase 20 (exact placement — new numbered phase vs. an addendum under Phase 20's existing "Done" paragraph — decided at task time against the roadmap's established convention, per spec §6). Update `docs/UI_SHELL.md` only if it currently describes the old Update button or slot labeling.

  **Acceptance criteria:**
  - [ ] `docs/SESSION_STORAGE.md` describes only what was actually built — no leftover references to the Update button, the 5-rotating-slot scheme, or the single draft slot.
  - [ ] Every function/type name cited in the doc is spot-checked against the real source file (`src/types/session.ts`, `src/utils/sessionStorageEngine.ts`, `src/systems/sessionAutosave.ts`, `src/stores/sessionStore.ts`, `src/components/panels/screen/console/SessionListItem.tsx`/`SessionsPanel.tsx`, `src/utils/helpers.ts`) — any drift between this plan's proposed names and what actually shipped is documented, not silently reconciled away.
  - [ ] `docs/todo/roadmap.md` reflects this work with a link to this task file and the spec.

  **Verification:**
  - [ ] Manual review — every documented name/behavior checked directly against shipped code.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change) — also re-run the full suite as a final regression check.

  **Dependencies:** Tasks 1–6.

  **Files:** `docs/SESSION_STORAGE.md`, `docs/todo/roadmap.md`, `docs/UI_SHELL.md` (if needed)

  **Estimated scope:** XS (2–3 files, docs only)

### Checkpoint D: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across all 7 tasks are met.
- [ ] Docs reflect the shipped API — every documented name spot-checked against source.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `promoteUnsavedHistoryOnBoot()` accidentally runs more than once per real app boot (e.g. a hot-reload path, or a test double-calling `startSessionAutosave()` without an intervening `stop`) | Medium — could silently clobber a legitimate `unsavedLast` with an empty/stale `unsavedCurrent` | Task 4's acceptance criteria require a spy-based assertion (not just absence-of-crash) that promotion runs exactly once per idempotency-guarded start, plus an explicit note if a genuine restart can't be distinguished from a double-call |
| `deleteNamedSession`'s cascade delete (Task 1) is implemented but the UI never surfaces that a session's history was implicitly wiped alongside it | Low — no data-loss risk beyond what deleting the session itself already implies, but could surprise a user who assumed history was independent | Not separately mitigated — matches the confirmed spec §7 item 1 decision; flagged again here in case Crawford wants an explicit confirm-copy update in Task 5/6 |
| Subrow-keeps-parent-loaded (Task 5) is a genuine behavior reversal from shipped code — a regression in the *opposite* direction (subrows clearing `currentLoadedSessionName` again) would be easy to miss since both states look superficially similar in manual testing | Medium — would silently break the "keep browsing history" UX this phase specifically adds | Task 5's acceptance criteria include a direct assertion on `currentLoadedSessionName`'s value after a subrow load, not just "the subrow list is still visible" |
| The unsaved-history row's "load newest, show all 3 including the newest" asymmetry (Task 6) reads as an inconsistency next to the named-session case during code review | Low — a design choice, not a bug, but worth a comment at the call site | Task 6's implementation should carry the same explanatory comment as spec §7 item 4, not just match the acceptance criteria silently |

## Open Questions

All four of spec §7's items relevant to this plan are first-pass proposals baked into task acceptance criteria above, **not yet confirmed by Crawford**:

1. Cascade-delete of a named session's autosave history — **assumed in Task 1's acceptance criteria.**
2. No Delete button on any subrow — **assumed in Task 5's acceptance criteria.**
3. Subrow-load-keeps-parent-current — **assumed in Task 5's acceptance criteria** (this is the most load-bearing of the four, since it's a direct behavior reversal from shipped code).
4. Unsaved-history row's identity-based (not timestamp-based) label with all-3-including-newest subrows — **assumed in Task 6's acceptance criteria.**

None of these block starting Task 1, Task 2, or Task 3 (all pure/additive, no user-visible behavior change on their own) — but Task 5 and Task 6 should not start until Crawford has confirmed items 1–4, since reversing any of them after those tasks land would mean rewriting acceptance criteria that are already test-enforced.
