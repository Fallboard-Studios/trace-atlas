# Implementation Plan: Sector Settings — Shareable Link

Source spec: [docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md](../specs/SECTOR_SETTINGS_SHARABLE_LINK.md). Source intent: [docs/intent/sector-settings-shareable-link.md](../intent/sector-settings-shareable-link.md). Roadmap: [Phase 21](../todo/roadmap.md#21-sector-settings-shareable-linkimportexport).

**All three of spec §7's open items are resolved (Crawford, 2026-09-28)** — see Architecture Decisions below. Item 1 is a scope change, not just a design confirmation: `?seed=`/`?x=`/`?y=` are removed entirely (Task 0), not merely deprioritized behind the share payload.

## Overview

11 tasks across 5 phases. Phase 0 is a single cleanup task — remove `?seed=`/`?x=`/`?y=` URL-param reading — that simplifies every task after it (no more "which param wins" logic to build or test). Phase 1 builds the encode/decode/clipboard utility in two steps — the read half first (decode + boot-time getter, since Phase 2 needs it), the write half second (encode + clipboard, since Phase 3 needs it). Phase 2 is the load-bearing "no flash" mechanism: three small, largely-independent pieces (the `applySessionPayload` option, the Attenuation Style name default, the coordinate default) that converge in one wiring task. Phase 3 is the two UI buttons, each a thin, mechanical addition once Phase 1's write half exists. Phase 4 is docs. No task touches audio scheduling or GSAP timelines; the one `setTimeout` this phase introduces (the "Link copied"/"Unable to copy" 5-second auto-dismiss, Tasks 8/9) is UI-only, not musical timing, so `CLAUDE.md`'s no-timer-for-musical-timing guardrail doesn't apply.

## Architecture Decisions

Carried forward from spec §7, **all confirmed by Crawford, 2026-09-28:**

- **`?seed=`/`?x=`/`?y=` are removed, not deprioritized.** They existed purely for reproducible debugging; `?session=` is a strictly better tool for that same purpose. Task 0 removes their URL-reading in `seedUtils.ts` and `main.tsx`. The underlying override *functions* (`setGlobalAttenuationStyleSeedOverride`/`getGlobalAttenuationStyleSeedOverride`/`setLocaleCoordinateOverride`/`getLocaleCoordinateOverride`) are **not** removed — they're general-purpose primitives still used by tests, `AudioDebugHud.tsx` (read-only display), and `getSeededVal.ts`/`noiseMaps.ts` (which still mix the override into their seed formulas whenever something sets it directly) — only the URL entry point goes away. Removing the primitives themselves would be a separate, larger refactor into shared seeded-generation machinery, out of scope here.
- **`DEFAULT_ATTENUATION_STYLE_NAME`/`DEFAULT_LOCALE_COORDINATES` read the share payload's exact values directly, falling back to a fresh random value** (`generateRandomAttenuationStyleName()`/`randomCoordinate()`) once `?seed=`/`?x=`/`?y=` no longer exist as a fallback tier. This was already the right design independent of the param removal — it avoids `deriveAttenuationStyleSeed`'s sanitization entirely by never routing the exact name through it.
- **`applySessionPayload` gains a `skipLocaleRebuild` option (Task 4)** rather than `retransmitWorld` gaining an "already correct, no-op" short-circuit — the option lives on the caller-facing function specific to this feature's boot path; `resolveRetransmitAction`/`retransmitWorld` themselves (shared by Sector Settings' manual retransmit UI) are untouched.
- **`sessionShareUtils.ts` is a new file, not added to `seedUtils.ts`.** Keeps the (now boot-time-only, test/debug-HUD-facing) override plumbing structurally separate from the share-link mechanism.
- **The query param is `?session=`.** No collision with `?debug=`/`?latency=` (the two remaining debug params after Task 0).
- **"Link copied" / "Unable to copy" auto-dismiss after 5 seconds** (Tasks 8/9), replacing the spec's earlier no-auto-dismiss/silent-failure draft.

## Definition of Done (every task)

- [ ] `npm run build:types` and `npm run lint` clean.
- [ ] The task's focused tests pass; the **full suite** (`npm test`) passes at every checkpoint.
- [ ] `CLAUDE.md` PR checklist: no synths in components; no timelines/refs in Zustand state; no new `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's own code; state stays JSON-serializable (`SessionPayload` is reused as-is, never mutated into a new shape).
- [ ] Any new fails-soft path (malformed `?session=`, clipboard-write rejection) is verified to actually fail soft — a deliberately malformed input in a test, not just the happy path.
- [ ] One commit per task, tests with their code, message ends with this session's attribution line.

## Dependency Graph

```
Phase 0 — Remove the superseded debug params
Task 0 (seedUtils.ts + main.tsx: remove ?seed=/?x=/?y= URL reading)
                ── independent of everything else; unblocks nothing but simplifies Tasks 4/5 ──
Phase 1 — The encode/decode/clipboard utility
Task 1 (sessionShareUtils.ts: decode + getSessionSharePayload — the read half)
        │
        ▼
Task 2 (sessionShareUtils.ts: buildShareUrl + copySessionLink — the write half)
                ── Checkpoint A: payload <-> URL round-trips correctly, both directions proven in isolation ──
Phase 2 — Boot-time correctness (the "no flash" mechanism)
Task 1 ──┬──→ Task 3 (sessionDiff.ts: applySessionPayload skipLocaleRebuild option)
         ├──→ Task 4 (attenuationStyleStore.ts: DEFAULT_ATTENUATION_STYLE_NAME override)
         └──→ Task 5 (localeStore.ts: DEFAULT_LOCALE_COORDINATES override)
Tasks 3, 4, 5 ──→ Task 6 (OceanScene.tsx: wire the boot-time apply call)
                ── Checkpoint B: hand-built ?session= URL loads with no flash — manual check ──
Phase 3 — The two Share buttons
Task 7 (sessionConfig.ts: SHARE_SESSION_SCHEMA — independent, can run any time from the start)
Task 2 ──┬──→ Task 8 (SessionListItem.tsx: per-row Share button)
Task 7 ──┘
Task 2 ──┬──→ Task 9 (SessionsPanel.tsx: panel-level Share button)
Task 7 ──┘
                ── Checkpoint C: full click-through, Share -> copy -> open link -> world reproduced ──
Phase 4 — Docs
Tasks 1–9 ──→ Task 10 (docs/SESSION_STORAGE.md + roadmap)
                ── Checkpoint D: complete ──
```

Task 7 has no dependency on anything else and can be done whenever — first, last, or interleaved with Phase 1/2.

## Task List

### Phase 0: Remove the superseded debug params

- [ ] **Task 0: `seedUtils.ts` + `main.tsx` — remove `?seed=`/`?x=`/`?y=` URL-param reading**

  **Description:** Per Architecture Decisions above. Remove the module-level top-level code in `seedUtils.ts` that reads `?seed=`/`?x=`/`?y=` from `window.location.search` and populates `GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE`/`LOCALE_COORDINATE_OVERRIDE` at import time. Remove `main.tsx`'s post-render `?seed=` block (the `setGlobalAttenuationStyleSeedOverride(seedParam)` + `console.info` lines). **Do not remove** `setGlobalAttenuationStyleSeedOverride`/`getGlobalAttenuationStyleSeedOverride`/`setLocaleCoordinateOverride`/`getLocaleCoordinateOverride`/`parseCoordinateParam`/`resolveDefaultAttenuationStyleName`/`generateRandomAttenuationStyleName`/`randomCoordinate` themselves — they stay as general-purpose primitives, still called by tests, `AudioDebugHud.tsx`, and `getSeededVal.ts`/`noiseMaps.ts`.

  **Acceptance criteria:**
  - [ ] Loading the app with `?seed=anything` or `?x=1&y=2` in the URL has zero effect on the resulting default locale/Attenuation Style — both are always fresh-random now, regardless of query string.
  - [ ] `getGlobalAttenuationStyleSeedOverride()`/`getLocaleCoordinateOverride()` are still exported and still return whatever a caller explicitly sets via their setters (tests, `AudioDebugHud.tsx`'s read path, and Task 4/5's `getSeededVal.ts`/`noiseMaps.ts` consumers are unaffected) — only the URL-driven *population* of them is gone.
  - [ ] Every existing `seedUtils.test.ts` case for the URL-reading behavior specifically (`describe('boot-time ?x= / ?y= URL params', ...)` and its `?seed=` counterpart) is removed, not left failing; every case for the setter/getter functions themselves is kept and still passes.
  - [ ] `localeStore.test.ts`'s existing `?x=`/`?y=` override describe block (`localeStore.test.ts:86-111`) is removed for the same reason — that behavior no longer exists.

  **Verification:**
  - [ ] `npx vitest run src/utils/seedUtils.test.ts src/stores/localeStore.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/seedUtils.ts`, `src/utils/seedUtils.test.ts`, `src/main.tsx`, `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** S (5 files, but each change is a deletion, not new logic)

### Phase 1: The encode/decode/clipboard utility

- [ ] **Task 1: `sessionShareUtils.ts` — decode + `getSessionSharePayload()` (the read half)**

  **Description:** Per spec §4.1, the half Phase 2 needs first. UTF-8-safe base64 helpers (`TextEncoder`/`TextDecoder`, not the deprecated `escape`/`unescape` trick). `decodeSessionPayload(encoded: string): SessionPayload | null` — fails soft (malformed base64, malformed JSON, or wrong shape all return `null`, never throw), matching `sessionStorageEngine.ts`'s `readStorage` convention. A module-level `SESSION_SHARE_PAYLOAD` constant, decoded once from `window.location.search`'s `?session=` param at import time — same timing `seedUtils.ts` uses for its own overrides — exposed via `getSessionSharePayload()`. `encodeSessionPayload` is also written here (decode's test needs it to construct valid encoded fixtures), but nothing consumes it in production code until Task 2.

  **Acceptance criteria:**
  - [ ] `decodeSessionPayload(encodeSessionPayload(payload))` deep-equals `payload` for a representative `SessionPayload`, including a company/robot name containing non-Latin1 characters (e.g. `"Ü Robot"`).
  - [ ] `decodeSessionPayload` returns `null` (never throws) for: invalid base64, valid base64 that isn't JSON, and valid JSON that isn't a `SessionPayload`-shaped object (`{}`, `[]`, `"a string"`, `null`).
  - [ ] `getSessionSharePayload()` reflects a mocked `?session=` param present at **module import time** — tested via `window.history.replaceState({}, '', '/?session=' + encodeSessionPayload(payload))` + `vi.resetModules()` + dynamic `import('./sessionShareUtils')`, the exact pattern `seedUtils.test.ts`'s `loadFreshWithQuery` helper already establishes for `?x=`/`?y=`.
  - [ ] `getSessionSharePayload()` returns `null` when `?session=` is absent, and when it's present but malformed (regression guard tying the two prior criteria together at the getter level, not just the decode function level).

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionShareUtils.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/sessionShareUtils.ts`, `src/utils/sessionShareUtils.test.ts`

  **Estimated scope:** S (2 files)

- [ ] **Task 2: `sessionShareUtils.ts` — `buildShareUrl` + `copySessionLink` (the write half)**

  **Description:** Per spec §4.1. `buildShareUrl(payload): string` — `window.location.origin + pathname + ?session=<encoded>`, deliberately dropping any other query params currently in the address bar. `copySessionLink(payload): Promise<boolean>` — writes `buildShareUrl(payload)` to the clipboard via `navigator.clipboard.writeText`, resolves `true` on success, resolves `false` (never throws/rejects) on failure — the one shared helper both Phase 3 buttons call.

  **Acceptance criteria:**
  - [ ] `buildShareUrl(payload)` equals `${origin}${pathname}?session=${encodeSessionPayload(payload)}` exactly, for a `window.location` mocked with extra existing query params (e.g. `?debug&seed=x`) — confirms those are dropped, not merged.
  - [ ] `copySessionLink(payload)` calls `navigator.clipboard.writeText` with exactly `buildShareUrl(payload)`'s output.
  - [ ] `copySessionLink(payload)` resolves `true` when the clipboard write succeeds, and resolves `false` (not a rejected promise) when it's mocked to reject — a fail-soft regression guard, same category as Task 1's decode fail-soft checks.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionShareUtils.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (shares the file; `encodeSessionPayload` already exists).

  **Files:** `src/utils/sessionShareUtils.ts`, `src/utils/sessionShareUtils.test.ts`

  **Estimated scope:** S (2 files)

### Checkpoint A: Payload <-> URL round-trips correctly, in isolation
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite, no new failures).
- [ ] Every `sessionShareUtils.ts` export is proven correct against fixtures alone — no store, no component, no boot sequence involved yet.
- [ ] Reviewed with human before proceeding to Phase 2.

---

### Phase 2: Boot-time correctness (the "no flash" mechanism)

- [ ] **Task 3: `sessionDiff.ts` — `applySessionPayload` `skipLocaleRebuild` option**

  **Description:** Per spec §4.2. `applySessionPayload(payload: SessionPayload, options?: { skipLocaleRebuild?: boolean })` — when `options?.skipLocaleRebuild` is true, the existing `attenuationStyleUnchanged` check and `retransmitWorld(...)` call are skipped entirely; every other line (globalAudio, robot overrides, company diffs, user-created companies) runs exactly as today. Purely additive — no call site is forced to pass the new option.

  **Acceptance criteria:**
  - [ ] `applySessionPayload(payload, { skipLocaleRebuild: true })` never calls `retransmitWorld` — verified with `vi.spyOn(worldTransition, 'retransmitWorld')`, the same mock `sessionDiff.test.ts` already uses for its existing `retransmitWorld`-related cases (`sessionDiff.test.ts:283-305`), asserting zero calls instead of the existing "called with X" assertions.
  - [ ] `applySessionPayload(payload, { skipLocaleRebuild: true })` still applies `globalAudio`, `robotOverrides`, `companyDiffs`, and `userCreatedCompanies` exactly as `applySessionPayload(payload)` (no options) does — reuse the existing non-retransmit assertions from the current test suite against the new call shape.
  - [ ] `applySessionPayload(payload)` and `applySessionPayload(payload, {})` (no options / empty options) are both unchanged from today's behavior — every existing test in `sessionDiff.test.ts` passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionDiff.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (independent of Phase 1 — this task doesn't touch `sessionShareUtils.ts` at all).

  **Files:** `src/utils/sessionDiff.ts`, `src/utils/sessionDiff.test.ts`

  **Estimated scope:** S (2 files)

- [ ] **Task 4: `attenuationStyleStore.ts` — `DEFAULT_ATTENUATION_STYLE_NAME` share-payload priority**

  **Description:** Per spec §4.4 and Architecture Decisions above. `DEFAULT_ATTENUATION_STYLE_NAME` becomes `getSessionSharePayload()?.attenuationStyleName ?? generateRandomAttenuationStyleName()` — the share payload's exact, unsanitized name takes priority over a fresh random name (Task 0 already removed the `?seed=` tier this used to fall back to). `setGlobalAttenuationStyleSeedOverride` is never called by this path. `resolveDefaultAttenuationStyleName()` itself is no longer called here — it's now dead code from this call site's perspective (still exported/used elsewhere per Task 0's note), so this task also removes the import if nothing else in the file needs it.

  **Acceptance criteria:**
  - [ ] With a mocked `?session=` param whose payload has `attenuationStyleName: "Pelagos 7!"`, `DEFAULT_ATTENUATION_STYLE_NAME` equals `"Pelagos 7!"` exactly — not lowercased, not stripped of punctuation. Tested via the same `vi.resetModules()` + dynamic-import pattern Task 1 establishes, now importing `attenuationStyleStore.ts` fresh.
  - [ ] With no `?session=` param, `DEFAULT_ATTENUATION_STYLE_NAME` is a fresh random name (`generateRandomAttenuationStyleName()`'s shape) every time — every existing `attenuationStyleStore.test.ts` test not specific to the removed `?seed=` path passes unmodified.
  - [ ] `getGlobalAttenuationStyleSeedOverride()` remains `null` after loading with `?session=` present — regression guard that this mechanism never touches that override (moot for URL-driven leakage after Task 0, but confirms this task didn't reintroduce a dependency on it).

  **Verification:**
  - [ ] `npx vitest run src/stores/attenuationStyleStore.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 0 (the fallback tier this replaces), Task 1 (`getSessionSharePayload`).

  **Files:** `src/stores/attenuationStyleStore.ts`, `src/stores/attenuationStyleStore.test.ts`

  **Estimated scope:** S (2 files, but the highest-risk correctness claim in this plan — see Risks)

- [ ] **Task 5: `localeStore.ts` — `DEFAULT_LOCALE_COORDINATES` share-payload priority**

  **Description:** Per spec §4.4. `DEFAULT_LOCALE_COORDINATES` becomes `{ x: sharePayload?.coordinates.x ?? randomCoordinate(), y: sharePayload?.coordinates.y ?? randomCoordinate() }` — share payload's coordinates take priority over random (Task 0 already removed the `?x=`/`?y=` tier this used to fall back to; `getLocaleCoordinateOverride`/`coordinateOverride` is no longer read here).

  **Acceptance criteria:**
  - [ ] With a mocked `?session=` param whose payload has `coordinates: { x: -5, y: 777 }`, `DEFAULT_LOCALE.coordinates` equals `{ x: -5, y: 777 }` exactly — same `vi.resetModules()` + dynamic-import pattern Task 0/1 establish, mocking `?session=` on `window.location.search` this time.
  - [ ] With no `?session=` param, `DEFAULT_LOCALE.coordinates` is a fresh random integer pair every time (Task 0 already covers the removed `?x=`/`?y=` behavior; this is a regression guard that Task 5 didn't reintroduce it).

  **Verification:**
  - [ ] `npx vitest run src/stores/localeStore.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 0 (the fallback tier this replaces), Task 1 (`getSessionSharePayload`).

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** S (2 files)

- [ ] **Task 6: `OceanScene.tsx` — wire the boot-time apply call**

  **Description:** Per spec §4.3. The existing mount effect's `initializeLocale(localeId)` call is followed by: read `getSessionSharePayload()`; if non-null, call `applySessionPayload(sharePayload, { skipLocaleRebuild: true })`. This is the task where Tasks 1/3/4/5 actually converge into the end-to-end boot behavior.

  **Acceptance criteria:**
  - [ ] When `getSessionSharePayload()` returns a payload (mocked), `applySessionPayload` is called exactly once, with that payload and `{ skipLocaleRebuild: true }`, and only *after* `initializeLocale` has been called (assert call order, not just that both were called).
  - [ ] When `getSessionSharePayload()` returns `null` (the common case — no `?session=` param), `applySessionPayload` is never called — regression guard that normal boot is completely unaffected.
  - [ ] The existing mount-effect cleanup (`stopRobotLifecycle` on unmount) and the "mount-only, not a `localeId` re-run" behavior are unchanged — every existing `OceanScene.test.tsx` test passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/OceanScene.test.tsx`
  - [ ] `npm run build:types`, `npm run lint`, `npm test` (full suite — this is the convergence point of Phase 2).
  - [ ] **Manual check (Checkpoint B):** in a dev build, hand-construct a `?session=` URL (e.g. via the browser console: `` `${location.origin}${location.pathname}?session=` + await import('/src/utils/sessionShareUtils.ts').then(m => m.encodeSessionPayload(somePayload)) `` — or simpler, `Save` a session in the running app, then in the console call `encodeSessionPayload(buildSessionPayload())` and navigate to the resulting URL), open it, and confirm by eye: no flash of a different world before the shared one appears, and the Attenuation Style name displayed matches exactly (not lowercased).

  **Dependencies:** Tasks 3, 4, 5 (needs the option, the name override, and the coordinate override all present to produce correct end-to-end behavior).

  **Files:** `src/components/panels/screen/worldView/OceanScene.tsx`, `src/components/panels/screen/worldView/OceanScene.test.tsx`

  **Estimated scope:** S (2 files, but see Risks — this is the task the phase's entire "no flash" claim rests on)

### Checkpoint B: Hand-built `?session=` URL loads with no flash
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite, no new failures).
- [ ] Manual check (Task 6) performed and passed — no visible flash, exact Attenuation Style name reproduced.
- [ ] `getGlobalAttenuationStyleSeedOverride()` confirmed `null` after a share-link boot (Task 4's regression guard) — the specific risk this phase exists to avoid is proven absent, not just "seems fine."
- [ ] Reviewed with human before proceeding to Phase 3.

---

### Phase 3: The two Share buttons

- [ ] **Task 7: `sessionConfig.ts` — `SHARE_SESSION_SCHEMA`**

  **Description:** Per spec §4.5. One new `ButtonSchema`, following the existing `SAVE_SESSION_SCHEMA`/`LOAD_SESSION_SCHEMA`/`DELETE_SESSION_SCHEMA` shape (`id: 'session.share'`, `humanLabel: 'Share Session'`, a lore label). Consumed by both Task 8 (cloned with a dynamic per-row `humanLabel`, same pattern `loadSchema`/`deleteSchema` already use in `SessionListItem.tsx`) and Task 9 (used as-is).

  **Acceptance criteria:**
  - [ ] `SHARE_SESSION_SCHEMA` matches the existing `ButtonSchema` shape and naming convention exactly (spot-checked against `SAVE_SESSION_SCHEMA` in the same file).
  - [ ] No other file changed — this task only adds the schema; nothing consumes it until Tasks 8/9.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] No test file needed — a static data export with no logic, same as its three siblings (none of which have dedicated tests either).

  **Dependencies:** None.

  **Files:** `src/data/sessionConfig.ts`

  **Estimated scope:** XS (1 file)

- [ ] **Task 8: `SessionListItem.tsx` — per-row Share button**

  **Description:** Per spec §4.5 (as resolved, §7 item 3). A new Share button between the existing Load and Delete buttons, calling `copySessionLink(entry.payload)` — the *stored* payload, never live state. A `ShareStatus` (`'copied' | 'error' | null`) state drives the note: `'copied'` shows "Link copied" (`role="status"`), `'error'` shows "Unable to copy" (`role="alert"`) on a failed copy — both auto-dismiss to `null` after 5 seconds via `window.setTimeout` (a UI-only timer, not musical timing).

  **Acceptance criteria:**
  - [ ] Clicking Share calls `copySessionLink(entry.payload)` — not `buildSessionPayload()` — a direct regression guard that this button shares the row's *stored* payload, not current live app state (the two are easy to conflate since both produce a `SessionPayload`).
  - [ ] On a successful copy (mocked `copySessionLink` resolving `true`), "Link copied" appears with `role="status"`; on a failed copy (mocked resolving `false`), "Unable to copy" appears with `role="alert"` — never both, never neither.
  - [ ] The note disappears after 5 simulated seconds (`vi.useFakeTimers()` + `vi.advanceTimersByTime(5000)`), for both the success and error case.
  - [ ] Clicking Share again before the 5 seconds elapse resets the timer / doesn't leave two overlapping notes or a stale timeout that clears a newer note early (a direct regression guard against the classic "second click, first timer still fires" bug).
  - [ ] The Share button sits between Load and Delete in DOM order — a direct check of the placement Crawford specified.
  - [ ] Every existing `SessionListItem.test.tsx` test (Load, Delete, the delete-confirm dialog) passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SessionListItem.test.tsx`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2 (`copySessionLink`), Task 7 (`SHARE_SESSION_SCHEMA`).

  **Files:** `src/components/panels/screen/console/SessionListItem.tsx`, `src/components/panels/screen/console/SessionListItem.css`, `src/components/panels/screen/console/SessionListItem.test.tsx`

  **Estimated scope:** S (3 files)

- [ ] **Task 9: `SessionsPanel.tsx` — panel-level Share button**

  **Description:** Per spec §4.5 (as resolved, §7 item 3). A new Share button next to the existing Save Session button, calling `copySessionLink(buildSessionPayload())` — current *live* state, never `listSessions()`/local storage. Same `ShareStatus`/5-second-auto-dismiss pattern as Task 8, independently stateful (its own state, not shared with any row's).

  **Acceptance criteria:**
  - [ ] Clicking Share calls `copySessionLink(buildSessionPayload())` — a direct regression guard that this button shares *live* state, not a stored entry (the inverse of Task 8's guard, and the two are easy to accidentally swap).
  - [ ] On success, "Link copied" appears with `role="status"`; on failure, "Unable to copy" appears with `role="alert"`.
  - [ ] The note auto-dismisses after 5 simulated seconds, same fake-timer approach as Task 8.
  - [ ] The Share button sits next to Save Session (not inside the session list).
  - [ ] Every existing `SessionsPanel.test.tsx` test (Save, Clear Local Storage, the clear-confirm dialog) passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SessionsPanel.test.tsx`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2 (`copySessionLink`), Task 7 (`SHARE_SESSION_SCHEMA`).

  **Files:** `src/components/panels/screen/console/SessionsPanel.tsx`, `src/components/panels/screen/console/SessionsPanel.css`, `src/components/panels/screen/console/SessionsPanel.test.tsx`

  **Estimated scope:** S (3 files)

### Checkpoint C: Full click-through — Share, copy, open, reproduced
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (full suite — note any pre-existing, unrelated flaky failures explicitly, e.g. `spawnSystem.test.ts`'s known-flaky LFO-seeding case, so new failures are distinguishable).
- [ ] **Manual check:** Save a session with a distinctive Attenuation Style name (containing punctuation/capitalization, e.g. via a fresh random world) and at least one robot audio edit. Click the panel-level Share Session button; confirm "Link copied" appears; paste the clipboard contents into a new tab. Confirm: no flash, exact Attenuation Style name, the same robot audio edit present. Repeat via a saved row's own Share button after reloading with a fresh random world (proving the per-row button shares the *stored* payload, not whatever the live world happens to be at click time).
- [ ] Reviewed with human before proceeding to Phase 4.

---

### Phase 4: Docs

- [ ] **Task 10: Docs — `SESSION_STORAGE.md` + roadmap**

  **Description:** Document the share-link mechanism in `docs/SESSION_STORAGE.md` — the `?session=` param, its relationship to the existing local-CRUD `SessionPayload`, and the two-phase boot sequence (early locale pinning, then post-mount overrides), spot-checked against the final shipped source. Mark roadmap [Phase 21](../todo/roadmap.md#21-sector-settings-shareable-linkimportexport) done, following the citation style of Phase 20/20.5.

  **Acceptance criteria:**
  - [ ] `docs/SESSION_STORAGE.md` describes the shipped `sessionShareUtils.ts` exports and the boot-time sequence exactly as implemented — every named function spot-checked against source, not assumed from this plan.
  - [ ] The doc explicitly states the known limitation from spec §7 item 1 (a session saved while `?seed=` was manually active won't reproduce identically via a share link), so a future reader doesn't assume perfect fidelity in that edge case.
  - [ ] `docs/todo/roadmap.md` Phase 21 marked done, linking this task file, the spec, and the intent doc.

  **Verification:**
  - [ ] Manual review — every documented name/behavior spot-checked against shipped code.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Tasks 1–9 (needs final shipped shape of everything it documents).

  **Files:** `docs/SESSION_STORAGE.md`, `docs/todo/roadmap.md`

  **Estimated scope:** XS (2 files, docs only)

### Checkpoint D: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across all 10 tasks are met.
- [ ] Both manual checks (Checkpoint B, Checkpoint C) performed and passed.
- [ ] Docs reflect the shipped mechanism — every documented name spot-checked against source.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 4's name-override design (spec §7 item 1) turns out wrong in some case this plan didn't trace — e.g. a downstream consumer of `deriveAttenuationStyleSeed` this spec missed | High — would either silently corrupt the shared world's generation seed, or leak the pinned name into unrelated future Attenuation Styles the user creates later in the same session | Task 4's acceptance criteria include an explicit regression guard that `getGlobalAttenuationStyleSeedOverride()` stays `null` after a share-link boot — the specific persistence-leak risk is directly tested, not just inferred from code reading |
| Task 6's boot-time wiring produces a flash anyway, because something else (not accounted for in the spec's tracing of `retransmitCoordsOnly`/`buildLocale`) also runs on mount and depends on timing this plan didn't verify | High — defeats the phase's entire stated purpose | Checkpoint B's manual check happens immediately after Task 6, before any UI work — fail fast, before Phase 3 is built on top of an assumption that turned out false |
| Tasks 8/9 accidentally swap which payload source they use (row's stored payload vs. live `buildSessionPayload()`) — an easy mistake since both produce the same `SessionPayload` type | Medium — a subtle, hard-to-notice bug: sharing would "work" but silently share the wrong world | Each task's acceptance criteria include a direct regression guard asserting the specific call (`copySessionLink(entry.payload)` vs. `copySessionLink(buildSessionPayload())`), not just "Share works" |
| A share payload with a very long `userCreatedCompanies`/`robotOverrides` set produces a URL long enough to be silently truncated by some clipboard/paste target (chat apps, some browsers' address bars) | Low — no compression was chosen deliberately (interview-confirmed), and this is a fixed 12-robot roster, but not measured against a real worst-case payload | Not mitigated in this plan — flagged as an Open Question below rather than speculatively built around, since the interview explicitly deprioritized this |

## Open Questions

Carried forward from spec §7 — **all three resolved by Crawford, 2026-09-28:**

1. Ditch `?seed=`/`?x=`/`?y=` entirely (not just deprioritize behind the share payload) — **resolved**, Task 0.
2. `applySessionPayload`'s `skipLocaleRebuild` option vs. a `retransmitWorld`-level short-circuit — **resolved**, option approach confirmed.
3. "Link copied" auto-dismiss timing, and whether a copy failure needs a visible error state — **resolved**: 5-second auto-dismiss, "Unable to copy" on failure. Tasks 8/9 updated accordingly.

No open questions remain that block starting Task 0.
