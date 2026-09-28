# Implementation Plan: Session Storage

Source spec: [docs/specs/SESSION_STORAGE.md](../specs/SESSION_STORAGE.md). Source intent: [docs/intent/session-storage.md](../intent/session-storage.md). Roadmap: [Phase 20](../todo/roadmap.md#20-session-storage).

## Overview

Local, manual session save/load: a new "Sessions" accordion in the Settings view, backed by a pure diff/storage core with no new dependency. The 12 tasks below split into four phases — **pure foundations** (types, the `spawnSystem.ts` baseline refactor, and the diff functions built on it), **headless persistence** (the storage engine, a small new store, and the 5-minute autosave system — all provable without any UI), **the UI slice** (the list row, the panel, and wiring both into `SettingsContent.tsx` and app boot), and **docs**. Foundations are ordered first and are the riskiest piece (Task 2 touches `spawnSystem.ts`, which the recent `TEST_COVERAGE_CORE_MODULES` pass just finished covering) so a regression surfaces immediately rather than under a UI built on top of it.

## Architecture Decisions

Carried forward from spec §7, all confirmed by Crawford 2026-09-27:

- **`masterVolume` and `audioMode` are excluded** from persistence — not part of any task's payload.
- **Robot override diffing is computed at save time by comparison against a regenerated seed baseline**, not a new `Robot.lastEditedOptions`-style tracked field. This is why Task 2 (extracting a pure baseline generator from `spawnSystem.ts`) comes before the diff functions that consume it (Task 3) — there's nothing to diff against otherwise.
- **"Transducer pressure ratio" maps to `AudioAttributes.filterFreq`**, provisionally — Task 3's acceptance criteria include a check against the actual `RobotOptionsTab.tsx` label; if it names a different field, that's a one-line fix to Task 3, not a re-plan.
- **The 5-minute autosave is a plain `setInterval`**, not a debounced store `subscribe()` (spec §3) — confirmed not to conflict with `CLAUDE.md`'s musical-timing guardrail, since this timer touches no audio/animation path.
- **`applySessionPayload` regenerates through the existing `worldTransition.ts` entry point**, never a parallel regeneration path — this is what keeps a future fix to `docs/DUPLICATE_VALUE_AUDIT.md` automatically covering session loads too (spec §7 risk 7).

## Definition of Done (every task)

- [ ] `npm run build:types` and `npm run lint` clean.
- [ ] The task's focused tests pass; the **full suite** (`npm test`) passes at every checkpoint.
- [ ] `CLAUDE.md` PR checklist: no synths in components; no timelines/refs in Zustand state; the autosave timer is not treated as (or used for) musical/animation timing; state stays JSON-serializable.
- [ ] Any new gate with a real failure mode (FIFO rotation, name-overwrite, "diff is empty when untouched") is mutation-checked — break it, confirm the test fails, revert.
- [ ] One commit per task, tests with their code, message ends with this session's attribution line.

## Dependency Graph

```
Phase 1 — Pure foundations
Task 1 (types/session.ts)
        │
        ▼
Task 2 (spawnSystem.ts: extract pure baseline generator)
        │
        ▼
Task 3 (sessionDiff.ts: computeRobotAudioOverrideDiff / computeCompanyDiff)
        │
        ▼
Task 4 (sessionDiff.ts: buildSessionPayload / applySessionPayload)
                ── Checkpoint A: diff core proven, Full-equivalent round-trip ──
Phase 2 — Headless persistence
Task 1 ──→ Task 5 (sessionStorageEngine.ts)
Task 1 ──→ Task 6 (sessionStore.ts)
Tasks 4, 5, 6 ──→ Task 7 (sessionAutosave.ts)
                ── Checkpoint B: save/load/autosave provable with no UI ──
Phase 3 — UI + wiring
Tasks 5, 6 ──→ Task 8 (SessionListItem.tsx)
Tasks 4, 5, 6, 8 ──→ Task 9 (SessionsPanel.tsx)
Task 9 ──→ Task 10 (wire into SettingsContent.tsx + navTreeConfig.ts)
Task 7 ──→ Task 11 (main.tsx boot wiring + boot-regression test)
                ── Checkpoint C: feature complete end to end ──
Phase 4 — Docs
Tasks 1–11 ──→ Task 12 (docs)
                ── Checkpoint D: complete ──
```

Independent chains that could run in parallel: Task 5 ∥ Task 6 (both depend only on Task 1); Task 8 could start as soon as Tasks 5–6 land, in parallel with Task 4's completion.

## Task List

### Phase 1: Pure foundations

- [ ] **Task 1: `src/types/session.ts` — payload and entry types**

  **Description:** Define `RobotAudioOverrideDiff`, `CompanyDiff`, `SessionPayload`, `SessionEntry`, and `AutosaveSlotId` exactly as specified (spec §4.1). Pure types, no runtime logic — same category as `greebleTypes.ts` (roadmap-confirmed "nothing to test").

  **Acceptance criteria:**
  - [ ] Every field named in spec §1.2's persisted-fields table has a corresponding optional property on `RobotAudioOverrideDiff` or `CompanyDiff`.
  - [ ] `SessionPayload` has no field for `audioMode`, `masterVolume`, job assignment, docking state, or battery level (regression guard for the confirmed exclusion).
  - [ ] `SessionPayload` has a required `version: 1` field — forward-compatibility for roadmap Phase 21's import/export, unused by this phase's own logic (spec §4.1).
  - [ ] `AutosaveSlotId` is a union of exactly the 5 rotating slot ids plus `'draft'` (6 total).

  **Verification:**
  - [ ] `npm run build:types` clean (the type-check *is* the verification for a pure-types file).

  **Dependencies:** None.

  **Files:** `src/types/session.ts`

  **Estimated scope:** XS (1 file)

- [ ] **Task 2: `spawnSystem.ts` — extract a pure per-robot seed-baseline generator**

  **Description:** `spawnRobot()` currently computes `rhythmicDensity`/`rhythmicMotifLength`/`noteVariance`/`pitchRepeat` as inline locals and calls the already-exported `generateAudioAttributes`/`generateRobotLfoSettings` for the rest — all as a side effect of writing to the store. Extract a new pure export (e.g. `generateRobotAudioBaseline(noiseMap, offset): RobotAudioOverrideDiff`) that produces the same values **without** touching any store, and have `spawnRobot()` call it internally so there is exactly one source of truth for "what the seed alone produces." This is the one task in the plan touching code the recent `TEST_COVERAGE_CORE_MODULES` pass just finished covering.

  **Acceptance criteria:**
  - [ ] `generateRobotAudioBaseline(noiseMap, offset)` returns the same `adsr`, `layers`, `filterFreq`, `rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `pitchRepeat`, `octaveRange`, and `lfoSettings` values that `spawnRobot()` assigns to a freshly spawned robot at the same `(noiseMap, offset)` — verified by a test that spawns a robot and separately calls the new function with the same inputs, asserting equality field by field.
  - [ ] Every existing `spawnSystem.test.ts` test still passes unmodified — behavior parity, not just new coverage.
  - [ ] The new function has zero side effects: no `useLocaleStore` import, no store write.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (return type).

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S (2 files, behavior-preserving refactor)

- [ ] **Task 3: `sessionDiff.ts` — `computeRobotAudioOverrideDiff` / `computeCompanyDiff`**

  **Description:** Pure diff functions per spec §4.2. `computeRobotAudioOverrideDiff(live, baseline)` compares a live robot's audio-relevant fields against the Task 2 baseline and returns only the fields that differ (deep-equal per field, not reference equality — `layers`/`octaveRange`/`lfoSettings` are objects/arrays). `computeCompanyDiff(live, spawnDefault)` does the same for `name`/`robotIds`. Also confirm the "transducer pressure ratio" → `filterFreq` mapping against `RobotOptionsTab.tsx`'s actual UI label while writing this task.

  **Acceptance criteria:**
  - [ ] A robot whose live values exactly match its baseline diffs to `{}`.
  - [ ] A robot with exactly one changed field (tested separately for `adsr`, `layers`, `filterFreq`, `rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `pitchRepeat`, `octaveRange`, and one `lfoSettings` target) diffs to an object containing only that field.
  - [ ] A robot with a custom `name` includes `name` in the diff; one with no custom name omits it.
  - [ ] `computeCompanyDiff` on an untouched company returns `{}`; a renamed or membership-changed company returns only the changed key(s).
  - [ ] The `filterFreq` UI-label check is recorded as a code comment citing the actual `RobotOptionsTab.tsx` label found.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionDiff.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2.

  **Files:** `src/utils/sessionDiff.ts`, `src/utils/sessionDiff.test.ts`

  **Estimated scope:** M (2 files, several field-by-field cases)

- [ ] **Task 4: `sessionDiff.ts` — `buildSessionPayload` / `applySessionPayload`**

  **Description:** Extend the same file with the two integration-facing functions from spec §4.2. `buildSessionPayload()` reads current state from `attenuationStyleStore`/`localeStore`/`audioStore`, calls Task 3's diff functions per robot/company, and assembles a `SessionPayload` (spawn-generated companies as diffs, user-created companies as full objects per spec §1.2). `applySessionPayload(payload)` regenerates the world via `worldTransition.ts`'s `retransmitWorld` for `payload.seed`/`payload.coordinates`, then overlays `globalAudio` (via `audioStore.setGlobalAudio`) and every robot/company diff (via existing `localeStore`/`robotOptionsActions` update paths) on top.

  **Acceptance criteria:**
  - [ ] `buildSessionPayload()` stamps `version: 1` on every payload it produces.
  - [ ] `buildSessionPayload()` → `applySessionPayload()` round-trips: after building a payload from a world with several hand-edited robots/companies, wiping to a different seed, and applying the payload back, every diffed field matches the pre-wipe values.
  - [ ] An untouched robot's entry is `{}` in the built payload and applying it changes nothing about that robot beyond what the seed alone produces.
  - [ ] Applying a payload never writes `audioMode`, job assignment, docking state, or battery level (explicit regression guard — spec §5.3 criterion 3).
  - [ ] `applySessionPayload` calls `worldTransition.ts`'s existing `retransmitWorld`, not a new parallel regeneration path (spec §7 risk 7 — verified by the call appearing in the implementation, not just by output).

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionDiff.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/utils/sessionDiff.ts`, `src/utils/sessionDiff.test.ts`

  **Estimated scope:** M (same 2 files as Task 3, new integration-level cases)

### Checkpoint A: Diff core proven
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite, no new failures).
- [ ] A save/wipe/load round trip is provable in a test, with zero spurious diffs on untouched entities and zero leakage of excluded fields.
- [ ] Reviewed with human before proceeding to Phase 2.

---

### Phase 2: Headless persistence

- [ ] **Task 5: `sessionStorageEngine.ts` — the `localStorage` layer**

  **Description:** Implement the storage API from spec §4.3: `saveNamedSession` (overwrite-by-name), `saveAutosaveSlot`, `deleteNamedSession`, `listSessions`, `loadSession`, under one versioned namespaced key (`trace-atlas.sessions.v1`). Fails soft on corrupted/missing data, per the codebase's `swallow`/`devWarn` convention.

  **Acceptance criteria:**
  - [ ] `saveNamedSession('foo', payloadA)` then `saveNamedSession('foo', payloadB)` leaves exactly one entry named `'foo'` holding `payloadB`.
  - [ ] `saveNamedSession('bar', ...)` after the above leaves two named entries, `'foo'` and `'bar'`.
  - [ ] `saveAutosaveSlot` writes to the 5 rotating slots FIFO: 5 sequential calls populate all 5; a 6th overwrites the oldest (slot 0), never touching a named entry.
  - [ ] `saveAutosaveSlot('draft', ...)` writes a single slot that a repeat call overwrites in place.
  - [ ] `deleteNamedSession('foo')` removes only that entry — autosave slots and other named entries are untouched.
  - [ ] With corrupted JSON manually written to the storage key, `listSessions()` returns `[]` and `loadSession(name)` returns `undefined` — neither throws.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionStorageEngine.test.ts` (mocked/stubbed `localStorage`, per this repo's existing test conventions for browser globals).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/utils/sessionStorageEngine.ts`, `src/utils/sessionStorageEngine.test.ts`

  **Estimated scope:** S (2 files)

- [ ] **Task 6: `sessionStore.ts` — session UI state**

  **Description:** New Zustand store per spec §2/§4.4: `currentSessionName: string` (the Session Name input's value, initialized to a freshly generated word-list name using the same mechanism `spawnSystem.ts` uses for robot/company names) and `currentLoadedSessionName: string | null` (which named session, if any, is currently loaded — drives Task 7's slot choice). Both fields plain and serializable; this store is itself never persisted.

  **Acceptance criteria:**
  - [ ] `currentSessionName` is non-empty on store creation (a generated name, never a blank string).
  - [ ] `setCurrentSessionName`/`setCurrentLoadedSessionName` actions update state and nothing else (no side effects, no `AudioEngine`/storage calls from this store).
  - [ ] `currentLoadedSessionName` defaults to `null` on every fresh store creation — a regression guard for "no session is ever auto-loaded" (spec §1, §5.3 criterion 5), since this store's own default is part of what keeps that true.

  **Verification:**
  - [ ] `npx vitest run src/stores/sessionStore.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/stores/sessionStore.ts`, `src/stores/sessionStore.test.ts`

  **Estimated scope:** XS (2 files)

- [ ] **Task 7: `sessionAutosave.ts` — the 5-minute background tick**

  **Description:** `startSessionAutosave()`/`stopSessionAutosave()` per spec §4.4, mirroring `startAudioBudget()`'s module-singleton, idempotent shape. Every 5 minutes: read `sessionStore.getState().currentLoadedSessionName`; if `null`, build a payload (`buildSessionPayload`, Task 4) and write it to the next slot in the 5-slot FIFO rotation; if non-null, write to the single `'draft'` slot instead.

  **Acceptance criteria:**
  - [ ] With `currentLoadedSessionName: null`, 5 consecutive simulated ticks populate all 5 rotating slots in order; a 6th overwrites the oldest.
  - [ ] With `currentLoadedSessionName` set to a name, ticks write only to `'draft'` and never call `saveNamedSession` for that name.
  - [ ] Switching `currentLoadedSessionName` to a *different* name between ticks still writes to the same single `'draft'` slot (overwritten, not duplicated).
  - [ ] `startSessionAutosave()` is idempotent (calling it twice does not create two intervals — one test asserts the tick logic runs exactly once per interval regardless of call count).
  - [ ] `stopSessionAutosave()` stops all further writes.

  **Verification:**
  - [ ] `npx vitest run src/systems/sessionAutosave.test.ts` (fake timers).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 4, 5, 6.

  **Files:** `src/systems/sessionAutosave.ts`, `src/systems/sessionAutosave.test.ts`

  **Estimated scope:** S (2 files)

### Checkpoint B: Headless persistence proven
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite).
- [ ] Save, overwrite, delete, list, and the full 6-slot autosave rotation are all provable with no UI involved.
- [ ] Reviewed with human before proceeding to Phase 3.

---

### Phase 3: UI + wiring

- [ ] **Task 8: `SessionListItem.tsx` — one row**

  **Description:** Per spec §4.5: a label (session name, or a fixed "Unsaved Session"-style label for autosave slots), a "Load" button (calls `applySessionPayload`, and sets `sessionStore.currentLoadedSessionName` — the entry's name for a named load, `null` for an autosave-slot load), and — named entries only — a "Delete" button behind an `AlertDialog` confirm, matching `CompanyCrudControls.tsx`'s existing pattern exactly (same component, same confirm copy style).

  **Acceptance criteria:**
  - [ ] A named entry renders its name, a Load button, and a Delete button; an autosave-slot entry renders its fixed label and a Load button only (no Delete).
  - [ ] Clicking Load calls `applySessionPayload` immediately with no confirmation step, and sets `currentLoadedSessionName` correctly for each of the two entry kinds.
  - [ ] Clicking Delete opens an `AlertDialog`; the entry is removed only on confirm, and is unchanged on cancel.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SessionListItem.test.tsx`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 5, 6.

  **Files:** `src/components/panels/screen/console/SessionListItem.tsx`, `src/components/panels/screen/console/SessionListItem.test.tsx`, `src/components/panels/screen/console/SessionListItem.css`

  **Estimated scope:** S (3 files)

- [ ] **Task 9: `SessionsPanel.tsx` — the "Load Sessions" panel**

  **Description:** Per spec §4.5: the Session Name text input (bound to `sessionStore.currentSessionName`, prefilled with a generated name via Task 6) and "Save Session" button above a list of `SessionListItem` rows from `listSessions()`, sorted/interleaved by `savedAt`.

  **Acceptance criteria:**
  - [ ] The Session Name input shows a non-empty generated value on first render.
  - [ ] Clicking "Save Session" calls `buildSessionPayload()` then `saveNamedSession(currentSessionName, payload)`, and the new/updated entry appears in the list immediately.
  - [ ] Saving again under the *same* name updates the existing row in place (no duplicate row appears) — a UI-level check on top of Task 5's storage-level guarantee.
  - [ ] Renaming the input before saving produces a second, separate row.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SessionsPanel.test.tsx`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 4, 5, 6, 8.

  **Files:** `src/components/panels/screen/console/SessionsPanel.tsx`, `src/components/panels/screen/console/SessionsPanel.test.tsx`, `src/components/panels/screen/console/SessionsPanel.css`

  **Estimated scope:** S (3 files)

- [ ] **Task 10: Wire "Sessions" into `SettingsContent.tsx` and `navTreeConfig.ts`**

  **Description:** Add a third `SettingsLeaf`/`AccordionSchema` entry (`sessions`, humanLabel "Sessions") to `SETTINGS_LEAVES`/`SETTINGS_ACCORDION_SCHEMAS` in `SettingsContent.tsx`, rendering `<SessionsPanel />` from `renderLeafContent`, and the matching `settings.sessions` leaf in `navTreeConfig.ts` (mirroring `settings.quality`/`settings.sectorSettings`).

  **Acceptance criteria:**
  - [ ] "Sessions" renders as the third and last accordion in the Settings view, after "Audio Profile" and "Audio Seeds".
  - [ ] The nav tree's Settings branch lists "Sessions" as a selectable leaf, consistent with the other two.
  - [ ] Existing `SettingsContent.test.tsx`/`navTreeConfig.test.ts` behavior for the two pre-existing leaves is unchanged (parity check).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/content/SettingsContent.test.tsx src/data/navTreeConfig.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check (`npm run dev`): open Settings, confirm "Sessions" appears last, opens/closes independently of the other two accordions, and its content lazy-mounts the same way the existing leaves do.

  **Dependencies:** Task 9.

  **Files:** `src/components/panels/screen/nav/content/SettingsContent.tsx`, `src/components/panels/screen/nav/content/SettingsContent.test.tsx`, `src/data/navTreeConfig.ts`, `src/data/navTreeConfig.test.ts`

  **Estimated scope:** M (4 files)

- [ ] **Task 11: `main.tsx` boot wiring + boot-regression test**

  **Description:** Call `startSessionAutosave()` at app boot, alongside `startAudioBudget()`. Add an explicit regression test proving the "never auto-load" requirement holds with the real boot path in place.

  **Acceptance criteria:**
  - [ ] `startSessionAutosave()` is called once at module load in `main.tsx`.
  - [ ] A test confirms that on a fresh app load — with and without `?seed=` present — `loadSession`/`applySessionPayload` are never called (spec §5.3 criterion 5).
  - [ ] `?seed=` continues to set the global seed override exactly as before (existing `seedUtils`/`main.tsx`-adjacent behavior unchanged) — parity check, not new behavior.

  **Verification:**
  - [ ] `npx vitest run src/systems/sessionAutosave.test.ts` (extended) or a new small boot-focused test file.
  - [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite).

  **Dependencies:** Task 7.

  **Files:** `src/main.tsx`, one test file (new or extended, e.g. `src/systems/sessionAutosave.test.ts`)

  **Estimated scope:** S (2 files)

### Checkpoint C: Feature complete end to end
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual check (`npm run dev`): save a named session, refresh the page (confirm it does *not* auto-load), open Sessions, load the named session back, confirm world/Audio Rig/robot-override state matches what was saved. Wait for (or simulate via dev tools) an autosave tick and confirm an "Unsaved Session" entry appears without disturbing the named one.
- [ ] Reviewed with human before proceeding to Phase 4.

---

### Phase 4: Docs

- [ ] **Task 12: Rewrite `docs/SESSION_STORAGE.md`; update `docs/UI_SHELL.md` and `docs/todo/roadmap.md`**

  **Description:** Replace `docs/SESSION_STORAGE.md`'s content with the shipped design (multi-session, name-keyed, 6-slot autosave split, no URL involvement) — spot-checking every named function/field against the final source rather than the plan or spec draft. Add a short "Sessions" mention to `docs/UI_SHELL.md` alongside the other two Settings sections. Update `docs/todo/roadmap.md` Phase 20's status.

  **Acceptance criteria:**
  - [ ] `docs/SESSION_STORAGE.md` describes only what was actually built — no leftover references to URL compression, single-slot autosave, or debounced `subscribe()`.
  - [ ] Every function/type name cited in the doc is spot-checked against the real source file.
  - [ ] `docs/todo/roadmap.md` Phase 20 marked done with a link to this task file and the spec, following the citation style of other completed phases (e.g. Phase 19).

  **Verification:**
  - [ ] Manual review — every documented name/behavior checked directly against shipped code.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Tasks 1–11.

  **Files:** `docs/SESSION_STORAGE.md`, `docs/UI_SHELL.md`, `docs/todo/roadmap.md`

  **Estimated scope:** XS (3 files, docs only)

### Checkpoint D: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across all 12 tasks are met.
- [ ] Docs reflect the shipped API — every documented name spot-checked against source.
- [ ] Ready for human review / PR against `feature/session-storage`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 2's `spawnSystem.ts` refactor changes observable spawn behavior by accident (wrong offset, wrong noise-map slice) | High — would silently corrupt every robot's seeded values, not just diffing | Task 2's acceptance criteria require exact field-by-field equality against a real `spawnRobot()` call, plus the full pre-existing `spawnSystem.test.ts` suite passing unmodified |
| `computeRobotAudioOverrideDiff` treats two structurally-equal-but-differently-ordered arrays/objects (e.g. `layers`) as "changed" when they aren't, producing spurious diffs that grow every save | Medium — sessions would slowly accumulate noise, defeating "an untouched robot round-trips to `{}}`" | Task 3 requires a deep-equality comparison (not reference equality) and an explicit round-trip test per field, including `layers`/`lfoSettings` |
| The autosave interval and a manual "Save Session" click race (both write around the same moment) | Low — a rare double-write, not data loss, since named saves and autosave slots never share a key | Not specifically mitigated by a task; acceptable risk given named entries and autosave slots are always disjoint keys (Task 5) |
| `applySessionPayload` diverges from `worldTransition.ts`'s regeneration path over time as that file evolves independently | Medium — session loads could silently drift from "what a fresh locale looks like" | Task 4's acceptance criteria require the implementation to call `retransmitWorld` directly, not reimplement regeneration — a code-level check, not just behavioral |
| "Transducer pressure ratio" doesn't actually mean `filterFreq` | Low — cosmetic/mapping fix only | Task 3 includes an explicit check against `RobotOptionsTab.tsx`'s real label before the mapping is load-bearing anywhere |

## Open Questions

All three of spec §7's items were resolved by Crawford before this plan was written:

1. `masterVolume`/`audioMode` inclusion — **Resolved:** excluded (Architecture Decisions above).
2. Diff mechanism for robots — **Resolved:** structural comparison against a regenerated seed baseline (Architecture Decisions above; Tasks 2–3).
3. "Transducer pressure ratio" mapping — **Resolved as provisional, not blocking:** proceed with `filterFreq`; Task 3 double-checks the real UI label as part of its own acceptance criteria rather than as a separate gate.

No open questions remain that block starting Task 1.
