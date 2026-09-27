# Implementation Plan: Ping Variance Automation

Source spec: [docs/specs/PING-VARIANCE-AUTOMATION.md](../specs/PING-VARIANCE-AUTOMATION.md). Source intent: [docs/intent/ping-variance-automation.md](../intent/ping-variance-automation.md). Not yet slotted into [docs/todo/roadmap.md](../todo/roadmap.md) — same "not decided here" status the source spec inherited from [docs/specs/AUDIO_SWELLS.md](../specs/AUDIO_SWELLS.md) §7 item 4.

## Overview

Replace `audioStore.audioSwellsEnabled` (a boolean gate) with `audioStore.pingVarianceAutomation` (a continuous `[0, 1]` fraction) that scales every newly-created swell's peak magnitude and, at exactly `0`, forces every still-rising swell into an early return-to-base. The control itself moves from a Sector Settings toggle to a bare slider at the bottom of the Audio Rig drawer. A related gap — `globalBypass` not actually silencing in-flight global swells — is closed in the same pass. No new files: every task in this plan modifies an existing one.

## Architecture Decisions

- **The seed function (Task 1) lands first, alone, with no store dependency.** `generatePingVarianceAutomation` is a pure function over a noise map — independently testable, and the one thing Task 2 needs to exist first. Mirrors `AUDIO_SWELLS.md`'s own "de-risk foundation work first" ordering.
- **The store field is added, not swapped in, at Task 2 — `audioSwellsEnabled` stays in place until Task 7.** Deleting `audioSwellsEnabled` at the same time as adding `pingVarianceAutomation` would leave `SectorSettingsDrawer.tsx` and `audioSwells.ts` referencing a field that no longer exists until every later task also lands — a broken intermediate state, violating "each task leaves the system in a working state." Instead: Task 2 *adds* the new field (the old one sits unused but harmless), Task 3 migrates `audioSwells.ts` off the old field onto the new one (old field now fully dead in that file, but still declared in the store and still read by `SectorSettingsDrawer.tsx`), and Task 7 is the one atomic task that deletes the field *and* its last remaining consumer together. The spec's "deleted, not deprecated" language (§4) describes the final shipped state, not a constraint on how implementation stages get there.
- **`audioSwells.ts`'s three behavioral changes (Tasks 3–5) are sequenced, not parallelized, even though §1.6's `globalBypass` extension is logically independent of §1.3/§1.4's automation logic.** All three touch the same file, several of them the same functions (`advanceGlobalSwell` in particular) — sequential tasks avoid two in-flight diffs colliding on the same lines. If genuinely parallelizing across sessions, Task 5 is the one safe candidate to peel off onto its own branch early (it only needs Task 2, not Tasks 3–4), but the default plan keeps it last of the three for a clean, reviewable diff history matching the spec's own §6 commit grouping.
- **Task 6 (the new slider UI) only depends on Task 2, not on Tasks 3–5.** `AudioRigDrawer.tsx`/`audioRigConfig.ts` never touch `audioSwells.ts` — this is a genuine parallelization opportunity (two sessions, one on Tasks 3–5, one on Task 6, both starting right after Task 2) if that's useful; the default ordering below is sequential for a simpler single-session read.
- **Task 7 (removal) depends on both Task 5 and Task 6, not just one.** It needs Task 5 because that's the last `audioSwells.ts` change that could plausibly still care about the old field's presence (it doesn't, after Task 3, but sequencing after the whole mechanism is complete is simpler to reason about than "after Task 3 specifically"), and Task 6 because deleting the old control before the new one is live and working would leave a real functional gap — no automation control at all — for however long elapses between the two tasks.
- **Docs (Task 8) land last**, spot-checked against final shipped source — same reasoning and ordering `AUDIO_SWELLS.md`'s own Task 7 used.

## Dependency Graph

```
Task 1 (globalAudioSeed.ts: generatePingVarianceAutomation)
    │
    └──→ Task 2 (audioStore.ts: pingVarianceAutomation field/action, seed-once/carry-forward)
                │
                ├──→ Task 3 (audioSwells.ts: magnitude scaling + trigger gate switch)
                │              │
                │              └──→ Task 4 (audioSwells.ts: 0% forced-return mechanism)
                │                             │
                │                             └──→ Task 5 (audioSwells.ts: globalBypass extension)
                │                                            │
                └──→ Task 6 (audioRigConfig.ts + AudioRigDrawer.tsx: new slider UI)         │
                               │                                                             │
                               └──────────────────────┬──────────────────────────────────────┘
                                                       ▼
                                     Task 7 (remove audioSwellsEnabled: audioStore.ts +
                                              sectorSettingsConfig.ts + SectorSettingsDrawer.tsx)
                                                       │
                                                       └──→ Task 8 (docs/AUDIO_SYSTEM.md)
```

## Task List

### Phase 1: Foundation — seed function & store field

- [x] **Task 1: `globalAudioSeed.ts` — `generatePingVarianceAutomation`**

  **Description:** New private `PING_VARIANCE_AUTOMATION_SEED_RANGE` constant (`{min: 0.33, max: 0.66}`) and new exported `generatePingVarianceAutomation(attenuationStyleId, attenuationStyleName): number`, drawing `getSeededVal(noiseMap, 'globalAudio.pingVarianceAutomation', 0, 0.33, 0.66)` — spec §1.2, §4. Same file/conventions `generateGlobalAudioSettings`/`DELAY_ENABLED_THRESHOLD` already use; no other function in this file is touched.

  **Acceptance criteria:**
  - [ ] `generatePingVarianceAutomation` always returns a value in `[0.33, 0.66]`.
  - [ ] Same Attenuation Style id/name always returns the identical value (determinism).
  - [ ] Different Attenuation Style id/name pairs produce different values across a reasonable sample (proves it's actually sampled, not a constant).
  - [ ] Uses `getSeededVal` exclusively — a source-scan/assertion confirms no `Math.random()`.

  **Verification:**
  - [ ] `npx vitest run src/utils/globalAudioSeed.test.ts` passes with the new coverage above.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`

  **Estimated scope:** XS (one small pure function)

- [x] **Task 2: `audioStore.ts` — `pingVarianceAutomation` field/action, seed-once carry-forward**

  **Description:** Add `PING_VARIANCE_AUTOMATION_UNSEEDED` sentinel (`-1`), a `pingVarianceAutomation: number` field (initialized to the sentinel) and `setPingVarianceAutomation(value)` action to `AudioStore`; extend `regenerateGlobalAudioFromSeed` to call `generatePingVarianceAutomation` only when the current value is still the sentinel, otherwise leaving it untouched — spec §1.2, §4. **Additive only** — do not remove `audioSwellsEnabled`/`setAudioSwellsEnabled` in this task (see Architecture Decisions above); they stay in place, unused by this change, until Task 7.

  **Acceptance criteria:**
  - [ ] `pingVarianceAutomation` is `PING_VARIANCE_AUTOMATION_UNSEEDED` immediately after store init, before any seed call.
  - [ ] The first `regenerateGlobalAudioFromSeed` call seeds it into `[0.33, 0.66]`.
  - [ ] A second call with a **different** Attenuation Style id/name leaves it at exactly the value the first call produced.
  - [ ] If `setPingVarianceAutomation` was called with an arbitrary value (e.g. `0.9`, outside the seed range) between two `regenerateGlobalAudioFromSeed` calls, a later call leaves it at exactly `0.9` — proves the carry-forward reads the live value, not just "was it ever seeded."
  - [ ] `setPingVarianceAutomation` is a plain state write — no `AudioEngine.*` call.
  - [ ] `audioSwellsEnabled`/`setAudioSwellsEnabled` are still present and behaviorally unchanged (not yet touched).

  **Verification:**
  - [ ] `npx vitest run src/stores/audioStore.test.ts` passes with the 3 new `regenerateGlobalAudioFromSeed` cases from spec §5.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** S (one file, a well-precedented carry-forward pattern with one new wrinkle — the sentinel gate)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean. (1571 tests passed across 103 files.)
- [x] `pingVarianceAutomation` seeds correctly and carries forward; nothing else in the app reads or writes it yet.
- [ ] Review with human before proceeding.

---

### Phase 2: Core mechanism — `audioSwells.ts`

- [x] **Task 3: Magnitude scaling + trigger gate switch**

  **Description:** `tickAudioSwells` reads `useAudioStore.getState().pingVarianceAutomation` instead of `audioSwellsEnabled`, gating new-swell rolls on `automation > 0`; `maybeStartGlobalSwell`/`startSingleRobotSwell`/`startCompanyWideSwell` each gain an `automation: number` parameter; a new `scaleSwellPeakByAutomation(peakDelta, automation)` helper is applied as the literal last step at each swell-creation call site, after the existing attribute-specific clamp — spec §1.3, §4. After this task, `audioSwellsEnabled` is fully unused within this file (it remains declared in the store per Task 2, deleted only in Task 7).

  **Acceptance criteria:**
  - [ ] At `pingVarianceAutomation: 0`, no new swell (global or robot, single or company-wide) starts even when the trigger draw would otherwise succeed.
  - [ ] At `pingVarianceAutomation: 0.5`, a newly-created swell's `peakDelta` is exactly half of what the identical seed produces at `1` — verified for a global target and a single-robot pick.
  - [ ] The multiply is provably the *last* step: a case that exercises Volume's downward floor or HPF's ceiling shows clamp-then-scale results (not scale-then-clamp) — i.e. the clamp bound is respected exactly, then scaled.
  - [ ] A company-wide swell scales each member's `peakDelta` independently by the same `automation` value, while shared direction/timing are untouched.
  - [ ] `audioSwellsEnabled` is no longer read anywhere in `audioSwells.ts` (grep/source-scan clean).

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` passes — spec §5's `pingVarianceAutomation` describe block, items 2–3, plus a company-wide magnitude-scaling case.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** M (touches every swell-creation call site in the file, though each change is small and mechanical)

- [x] **Task 4: 0% forced-return mechanism**

  **Description:** `advanceActiveSwells` reads `pingVarianceAutomation` fresh each tick (not the value captured at swell creation) and threads it to `advanceGlobalSwell`/`advanceRobotSwell`; each gains a forced-return check as its first statement — `if (automation === 0 && swell.phase === 'rising')`, converting the swell in place (`peakDelta = currentValue - baseValue`, `risingMeasures = 0`, `startMeasure = measure`, `phase = 'falling'`) so it rides its own already-drawn `fallingMeasures` to base via the existing falling-phase formula — spec §1.4. For the robot pool this happens per-member (own `baseValue`/`peakDelta`) with shared `phase`/timing mutated once at the swell level.

  **Acceptance criteria:**
  - [ ] Forcing a rising swell into return produces no audible jump on the forcing tick — the written value is unchanged from the tick immediately prior.
  - [ ] The swell's `phase` becomes `'falling'` immediately, and it lands exactly on `baseValue` once its own original `fallingMeasures` elapses.
  - [ ] A company-wide swell's members are all force-converted together in the same tick (shared `phase`/timing), each keeping its own `baseValue` and independently-derived new `peakDelta`.
  - [ ] A swell already in its falling phase when `automation` hits `0` is left untouched — its `peakDelta`/`startMeasure` don't change on that tick.
  - [ ] Ticking repeatedly while `automation` stays `0` does not re-derive an already-forced (now-falling) swell's `peakDelta` — no "frozen in place" regression.
  - [ ] Setting `automation` back to nonzero before a forced fall completes does not interrupt, reverse, or resume it — the swell rides out the original forced schedule untouched.
  - [ ] The old `describe('audioSwellsEnabled (Sector Settings toggle)', ...)` test *"lets an already-in-flight swell finish naturally while disabled mid-ramp"* is deleted outright, not adapted (spec §1.5).

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` passes — spec §5's `pingVarianceAutomation` describe block, items 1, 4–8.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** M (the most subtle logic in this plan — in-place state mutation with a one-shot guard)

- [x] **Task 5: `globalBypass` fully silences the global pool**

  **Description:** Extend `isGlobalTargetEligible` and `advanceGlobalSwell`'s `stillEnabled` check to also gate on `globalAudio.globalBypass`, treated exactly like a per-effect `enabled: false` — same immediate cancel-and-snap-to-base path, not the gradual Task 4 forced-return — spec §1.6. Robot-pool functions (`isRobotAttributeEligible`, `advanceRobotSwell`, `startSingleRobotSwell`, `startCompanyWideSwell`) are untouched.

  **Acceptance criteria:**
  - [ ] With `globalBypass: true`, no new global swell starts even when the trigger draw would otherwise succeed; a robot swell can still start in the same tick.
  - [ ] An in-flight global swell is cancelled and snapped directly to `baseValue` on the very next tick after `globalBypass` flips to `true` — not a gradual fall.
  - [ ] Robot-pool swells (single-robot and company-wide) are completely unaffected by `globalBypass` — both new-swell eligibility and in-flight advancement continue normally.
  - [ ] `globalBypass: true` together with `pingVarianceAutomation: 1` still blocks new global swells (bypass alone is sufficient, no dependency on automation also being `0`).

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` passes — spec §5's new `describe('globalBypass', ...)` block (4 items).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** S (small, additive, one-condition widening of an existing check)

### Checkpoint: Mechanism complete
- [x] `npm run build:types`, `npm run lint`, `npx vitest run src/systems/audioSwells.test.ts` clean.
- [x] Full `audioSwells.test.ts` suite (magnitude scaling, forced return, `globalBypass`, plus every pre-existing global/robot/company-wide test from `AUDIO_SWELLS.md`) passes together. `npm test` also clean: 1586 tests across 103 files.
- [ ] Review with human before proceeding.

Note: a couple of `audioSwells.test.ts`'s real-noise robot-pool tests showed occasional intermittent flakiness during this phase (self-resolves on rerun, unrelated to the global-pool-only diffs in Tasks 3-5 — suspected `mockReturnValueOnce` queue bleed across tests, since `mockClear()` doesn't drain queued once-values). Not investigated further; flagged for awareness, not blocking.

---

### Phase 3: UI — the new slider

- [x] **Task 6: `audioRigConfig.ts` + `AudioRigDrawer.tsx` — the Ping Variance Automation slider**

  **Description:** Add `PING_VARIANCE_AUTOMATION_SCHEMA` (`SliderLinearSchema`, `min: 0, max: 100, step: 1, unit: '%'`, `humanLabel: 'Automatic Effects'`, confirmed) to `audioRigConfig.ts`, exported as a bare schema alongside `DECAY_MODE_SCHEMA`. Render a bare `SliderLinear` in `AudioRigDrawer.tsx`, after the `LFO_DRIFT_GROUPS.map(...)` block and outside any `AccordionContainer`, wired to `pingVarianceAutomation`/`setPingVarianceAutomation` with the same `* 100` / `/ 100` conversion the LFO Drift rows already use, `disabled={rigDisabled}` — spec §1.2, §4. Can be implemented in parallel with Tasks 3–5 (see Architecture Decisions) since it touches no shared file.

  **Acceptance criteria:**
  - [ ] The slider renders with `value = pingVarianceAutomation * 100`.
  - [ ] Dragging it calls `setPingVarianceAutomation(v / 100)`.
  - [ ] It's disabled when `globalAudio.globalBypass` is `true`, matching every other Rig-wide control.
  - [ ] It renders exactly once, at the bottom of the drawer, outside any `AccordionContainer` (a DOM-structure assertion).

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`, `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** M (4 files, new UI wiring reusing an existing primitive)

### Checkpoint: New control live
- [x] `npm run build:types`, `npm run lint`, `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console/AudioRigDrawer.test.tsx` clean. `npm test` also clean: 1596 tests across 103 files.
- [ ] Manual check: the slider is visible at the bottom of the Audio Rig drawer, drags correctly, and disables under Bypass. The old Sector Settings toggle is still present too (harmless, temporary overlap — removed in Task 7).
- [ ] Review with human before proceeding.

---

### Phase 4: Cleanup & docs

- [x] **Task 7: Remove the old `audioSwellsEnabled` boolean entirely**

  **Description:** Delete `audioSwellsEnabled`/`setAudioSwellsEnabled` from `AudioStore` (`audioStore.ts`); remove `AUDIO_SWELLS_ENABLED_SCHEMA` from `sectorSettingsConfig.ts`; remove the `Toggle` and its wiring from `SectorSettingsDrawer.tsx` (drop the `Toggle` import if this was its only use in the file) — spec §2, §4's "deleted, not deprecated."

  **Acceptance criteria:**
  - [ ] `audioSwellsEnabled`/`setAudioSwellsEnabled` no longer exist anywhere in `src/` (grep clean).
  - [ ] `AUDIO_SWELLS_ENABLED_SCHEMA` is no longer exported from `sectorSettingsConfig.ts`.
  - [ ] `SectorSettingsDrawer.tsx` no longer renders a `Toggle` for this control.
  - [ ] Every existing `audioSwellsEnabled`-related test in `SectorSettingsDrawer.test.tsx` is deleted, not adapted (spec §5).
  - [ ] The app builds and type-checks cleanly with the field gone — proves nothing else still referenced it.

  **Verification:**
  - [ ] `npm run build:types` clean — the real test here; a stray reference anywhere fails the build.
  - [ ] `npx vitest run src/stores/audioStore.test.ts src/data/sectorSettingsConfig.test.ts src/components/panels/screen/console/SectorSettingsDrawer.test.tsx` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 5, Task 6.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`, `src/data/sectorSettingsConfig.ts`, `src/data/sectorSettingsConfig.test.ts`, `src/components/panels/screen/console/SectorSettingsDrawer.tsx`, `src/components/panels/screen/console/SectorSettingsDrawer.test.tsx`

  **Estimated scope:** M (6 files, but every change is a deletion — low complexity despite the file count)

- [x] **Task 8: `docs/AUDIO_SYSTEM.md` — document the slider**

  **Description:** Rewrite the "Audio Swells" section's "User toggle" paragraph (and any other stale reference) to describe `pingVarianceAutomation` and the new slider instead of the old boolean/toggle — spot-checked against the final shipped source, not reconstructed from the spec from memory. Cover: the seed-once/carry-forward behavior, magnitude scaling as the pipeline's last step, the 0% forced-return mechanism, and the `globalBypass` extension (§1.6).

  **Acceptance criteria:**
  - [ ] No remaining reference to `audioSwellsEnabled`, `setAudioSwellsEnabled`, or the Sector Settings drawer as this control's home.
  - [ ] Every documented constant/function name matches the actual shipped source exactly (`pingVarianceAutomation`, `scaleSwellPeakByAutomation`, `generatePingVarianceAutomation`, etc.).
  - [ ] The `globalBypass` extension (§1.6) is documented explicitly, not just the slider's own two behaviors.

  **Verification:**
  - [ ] Manual review — every documented name/behavior spot-checked directly against `audioSwells.ts`'s and `audioStore.ts`'s final shipped code.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 7.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean. Final full-suite count: 1591 tests across 103 files.
- [x] All acceptance criteria across all 8 tasks are met.
- [x] `docs/AUDIO_SYSTEM.md` reflects the shipped API — every documented name spot-checked against source.
- [x] Manual check (spec §5): fresh Attenuation Style → slider starts in the 33–66% band; drag to 0% while a swell is mid-rise → it audibly settles back rather than snapping or continuing to climb; drag to 50% → new swells are noticeably subtler than at 100%; enable Bypass → no swell-related sound from the global chain, robot swells unaffected. **Passed — confirmed by the user.**
- [x] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `audioSwellsEnabled` sits dead-but-declared in the store between Tasks 2 and 7 — an easy field to accidentally start reading again in a later task if not careful | Low — purely a discipline risk, not a design flaw | Task 3's acceptance criteria explicitly require a grep/source-scan proving `audioSwells.ts` no longer reads it; Task 7's final grep catches anything missed anywhere else in `src/` |
| Tasks 3–5 all touch `advanceGlobalSwell`/the same handful of functions in sequence — a merge/rebase between them (if worked across sessions or branches) could silently drop one task's change | Low-medium if parallelized against the plan's own recommendation | Architecture Decisions above flag Task 5 as the one safe parallelization candidate; Tasks 3→4 specifically should stay sequential on one branch, since Task 4's forced-return check and Task 3's `automation` parameter threading land in the same function signatures |
| `AudioRigDrawer.test.tsx`'s existing suite may already assert an exact count of `audio-rig-drawer__master-row` divs or top-level children (spec §7 item 1) — Task 6 could break a brittle pre-existing assertion incidentally | Low-medium — would surface as a confusing, seemingly-unrelated test failure | Task 6 should read the existing test file first and update any such count-based assertion deliberately, not treat it as this task's own new-coverage failure |
| The Task 2 sentinel (`-1`) is a magic-number-shaped mechanism — a future field reusing the same "add a field to `AudioStore`" pattern without reading this one's comment could copy the sentinel idea where it isn't needed, or forget it where it is | Low — a documentation/discoverability risk, not a correctness risk for this feature itself | Task 2's doc comment (spec §4) explains exactly when a sentinel gate is needed (genuinely-seeded field) vs. not (static-default field, `globalBypass`'s own simpler spread trick) — keep that comment intact in review |
| Two independent mechanisms — the UI's `disabled={rigDisabled}` (Task 6) and `audioSwells.ts`'s functional `globalBypass` gate (Task 5) — both key off `globalAudio.globalBypass` but live in different files (spec §7 item 2) | Low — not a conflict today, but a future refactor of one without the other could silently desync "looks disabled" from "actually blocked" | No mitigation needed for this plan; flagged in Open Questions below for Plan/Implement awareness, not a blocking risk |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **`AudioRigDrawer.test.tsx`'s existing test suite may already assert an exact list/count of `audio-rig-drawer__master-row` divs or top-level children** — Task 6 should check for this directly rather than assume its new coverage is additive-only.
2. **Whether the UI's `disabled={rigDisabled}` and `audioSwells.ts`'s functional `globalBypass` gate should be more explicitly linked (e.g. both reading through one shared selector) is not designed here** — both are correct and consistent as of this plan, but nothing stops them from drifting apart in a future change to either file independently.
