# Implementation Plan: BPM Control

Source spec: [docs/specs/BPM_CONTROL.md](../specs/BPM_CONTROL.md). Source intent: [docs/intent/bpm-control.md](../intent/bpm-control.md). Not yet slotted into [docs/todo/roadmap.md](../todo/roadmap.md) — same "not decided here" status the source spec inherited from `PING-VARIANCE-AUTOMATION.md`'s own task plan.

## Overview

Make `audioStore.bpm` (currently a hardcoded `60` that never changes) a real, locale-seeded value drawn from `[40, 100]` via `getSeededVal` against each locale's own noise map, pushed through the existing `AudioEngine.setBPM` (which gains a short ramp so repeated calls don't zipper). The Audio Rig drawer gains a new bare `Tempo` slider (`[20, 200]`) for live manual override, reusing the existing `setBPM` action directly — no new override-path plumbing. Reseeding is wired into exactly the two `worldTransition.ts` branches that build a genuinely new locale from new coordinates, plus one module-load sync for the locale active at boot; the branch that only changes the Attenuation Style (same locale, no rebuild) is deliberately left untouched, so a manually-dialed BPM survives it. No new files besides one small seed-generator util and its test.

## Architecture Decisions

- **The seed function (Task 1) and the `AudioEngine.setBPM` ramp (Task 2) land first, in parallel, with no dependency on each other.** `generateLocaleBpm` is a pure function over a noise map; the `setBPM` ramp is a self-contained change to `AudioEngine.ts` that doesn't touch `generateLocaleBpm` at all — `audioStore.setBPM`'s call signature into `AudioEngine.setBPM` is unchanged, only its internal ramping behavior is. Both are independently testable and neither blocks the other, mirroring `PING-VARIANCE-AUTOMATION.md`'s own "de-risk foundation work first" ordering.
- **Task 3 (`audioStore.ts`: `regenerateBpmFromSeed` + module-load sync) depends on Task 1 only, not Task 2.** It calls the existing `setBPM` action, whose public behavior from `audioStore`'s perspective is identical whether or not `AudioEngine.setBPM` ramps internally — Task 2 changes what happens *inside* `AudioEngine`, not the shape of the call `audioStore` makes into it.
- **Task 4 (`worldTransition.ts` wiring) depends on Task 3, not Task 1 directly.** It calls `regenerateBpmFromSeed`, never `generateLocaleBpm` itself — the seed function is an implementation detail of the store action, not something `worldTransition.ts` reaches past it for.
- **Task 5 (the new slider UI) has no technical dependency on any other task in this plan.** `audioStore.bpm`/`setBPM` already exist today (hardcoded default aside) — the drawer control just binds to them directly, exactly as `TransportBar.tsx` already does. Unlike `PING-VARIANCE-AUTOMATION.md`'s Task 6 (which needed its store field to exist first, since that field was brand new), this task could start on day one. The default ordering below still places it after Tasks 1–4 for a simpler single-session read and because manually verifying the slider is most useful once real seeded values are visible to compare against — but it's the one genuine parallelization candidate in this plan if two sessions are available.
- **`retransmitAttenuationStyleOnly` gets no task of its own** — the whole point (spec §1.3) is that it stays untouched. Task 4's acceptance criteria include a negative assertion (it must *not* call `regenerateBpmFromSeed`) rather than a separate task, since "don't add a call here" isn't independently implementable work.
- **Docs (Task 6) land last**, spot-checked against final shipped source once Tasks 2, 4, and 5 have all landed — same reasoning `PING-VARIANCE-AUTOMATION.md`'s own Task 8 used.

## Dependency Graph

```
Task 1 (localeBpmSeed.ts: generateLocaleBpm)      Task 2 (AudioEngine.ts: setBPM ramp)
                │                                                │
                └──→ Task 3 (audioStore.ts: regenerateBpmFromSeed +           │
                              module-load syncBpmToCurrentLocale)             │
                               │                                              │
                               └──→ Task 4 (worldTransition.ts: retransmitCoordsOnly/     │
                                             retransmitBoth call sites)                    │
                                              │                                            │
              Task 5 (audioRigConfig.ts + AudioRigDrawer.tsx: Tempo slider) ── no dep ──┐  │
                                              │                                          │  │
                                              └──────────────────┬───────────────────────┴──┘
                                                                 ▼
                                                   Task 6 (docs/AUDIO_SYSTEM.md)
```

## Task List

### Phase 1: Foundation — seed function & engine ramp

- [x] **Task 1: `localeBpmSeed.ts` — `generateLocaleBpm`**

  **Description:** New file `src/utils/localeBpmSeed.ts` exporting `LOCALE_BPM_SEED_RANGE` (`{min: 40, max: 100}`) and `generateLocaleBpm(localeId, x, y): number`, drawing `getSeededVal(getLocaleNoiseMap(localeId, x, y), 'locale.bpm', 0, 40, 100)` and rounding to the nearest integer — spec §1.2, §4. Mirrors `globalAudioSeed.ts`'s pure-generator shape, keyed by locale coordinates instead of Attenuation Style.

  **Acceptance criteria:**
  - [x] `generateLocaleBpm` always returns an integer in `[40, 100]`.
  - [x] Same `(localeId, x, y)` always returns the identical value (determinism).
  - [x] Different coordinate pairs produce different values across a reasonable sample (proves it's actually sampled, not a constant).
  - [x] Uses `getLocaleNoiseMap`/`getSeededVal` exclusively — a source-scan/assertion confirms no `Math.random()` and no `getAttenuationStyleNoiseMap`.

  **Verification:**
  - [x] `npx vitest run src/utils/localeBpmSeed.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/localeBpmSeed.ts`, `src/utils/localeBpmSeed.test.ts`

  **Estimated scope:** XS (one small pure function)

- [x] **Task 2: `AudioEngine.ts` — `setBPM` gains a short ramp**

  **Description:** New `BPM_RAMP_SECONDS` constant (`0.05`, matching `VOLUME_RAMP_SECONDS`'s magnitude) and a `rampTo`-with-fallback rewrite of `setBPM`, reusing `updateRobotMasterVolume`'s exact guarded shape ([AudioEngine.ts:942-949](../../src/engine/AudioEngine.ts#L942-L949)) — spec §1.6, §4. One unconditional behavior for every caller (seed-time set and manual drag alike), no separate instant path.

  **Acceptance criteria:**
  - [x] When the transport's `bpm` param exposes a `rampTo` function, `setBPM(x)` calls `rampTo(x, BPM_RAMP_SECONDS)`, not a direct `.value` assignment.
  - [x] When `bpm` is a plain `{ value }` object (no `rampTo`), `setBPM(x)` falls back to `bpm.value = x`.
  - [x] `setBPM` remains a no-op (no throw, no call into the transport) when `!initialized` — regression guard for the existing early-return.
  - [x] `setBPM`'s public signature (`(bpm: number): void`) and every existing caller (`audioStore.setBPM`) are unchanged.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes with a new `describe('setBPM', ...)` block (no prior dedicated coverage existed).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** XS (one function, a well-precedented pattern copied from `updateRobotMasterVolume`)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [x] `generateLocaleBpm` and `setBPM`'s new ramp are both independently correct; nothing in the app calls either from a new wiring path yet.
- [x] Review with human before proceeding.

---

### Phase 2: Reseed wiring — store & retransmit

- [x] **Task 3: `audioStore.ts` — `regenerateBpmFromSeed` + module-load sync**

  **Description:** New `regenerateBpmFromSeed(localeId, coordinates)` action that calls `get().setBPM(generateLocaleBpm(localeId, coordinates.x, coordinates.y))`; new module-scope `syncBpmToCurrentLocale()` function, called once immediately after store creation, that looks up the current Attenuation Style's `currentLocaleId` and the matching `Locale` from `useLocaleStore` and calls `regenerateBpmFromSeed` for it — spec §1.3, §4. **Not** a `subscribe` — this is a one-shot module-load call only; every later reseed is triggered explicitly by Task 4, not by this function running again.

  **Acceptance criteria:**
  - [x] `regenerateBpmFromSeed(localeId, coordinates)` calls `setBPM` with exactly `generateLocaleBpm(localeId, coordinates.x, coordinates.y)`'s result (assert via the existing `AudioEngine.setBPM` mock).
  - [x] The module-load `syncBpmToCurrentLocale()` call seeds `bpm` into `[40, 100]` for the store's default state (current Attenuation Style's `currentLocaleId` → `DEFAULT_LOCALE_ID` → `DEFAULT_LOCALE`'s coordinates).
  - [x] No new `useAttenuationStyleStore.subscribe`/`useLocaleStore.subscribe` is added for this — a source-scan confirms `syncBpmToCurrentLocale` is called exactly once, at module scope, not registered as a subscription callback.
  - [x] `setBPM` itself is unchanged in this file — its state-write + `AudioEngine.setBPM` delegation behavior is identical to before this task.

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts` passes with the new coverage above.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** S (one file, a new action plus a one-shot module-load call)

- [x] **Task 4: `worldTransition.ts` — wire reseeding into the two locale-building retransmit branches**

  **Description:** `retransmitCoordsOnly` and `retransmitBoth` each call `useAudioStore.getState().regenerateBpmFromSeed(newLocale.id, coordinates)` immediately after `buildLocale`/`addLocale` — spec §1.3, §4. `retransmitAttenuationStyleOnly` receives **no** equivalent call, by design.

  **Acceptance criteria:**
  - [x] `retransmitCoordsOnly` (coordinates changed, Attenuation Style preserved) calls `regenerateBpmFromSeed` with the new locale's id and coordinates.
  - [x] `retransmitBoth` (both changed) calls `regenerateBpmFromSeed` with the new locale's id and coordinates.
  - [x] `retransmitAttenuationStyleOnly` (Attenuation Style changed, coordinates preserved) does **NOT** call `regenerateBpmFromSeed` — asserted directly (mock not called), and, using a live (non-mocked) store elsewhere in this file's existing setup, `audioStore.bpm` is provably unchanged across that retransmit.
  - [x] A live end-to-end pass — drag `bpm` to an arbitrary value, retransmit coordinates-only, confirm `bpm` lands in `[40, 100]` and is *not* the dragged value — passes, directly exercising the behavior a manual check would otherwise verify.

  **Verification:**
  - [x] `npx vitest run src/systems/worldTransition.test.ts` passes with the 3 new cases above.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** S (two small, mechanical call-site additions, plus one deliberate non-addition)

### Checkpoint: Reseed wiring complete
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean. (1609 tests across 104 files; two intermittent noise-map-based flakes seen on one run self-resolved on rerun, unrelated to this feature — same known flakiness class `PING-VARIANCE-AUTOMATION.md`'s own plan flagged.)
- [x] The exact behavior this feature exists for is now provably true: a coords-changing retransmit reseeds `audioStore.bpm` within `[40, 100]` and discards any manual override; an Attenuation-Style-only retransmit leaves `audioStore.bpm` completely untouched.
- [x] Review with human before proceeding.

---

### Phase 3: UI — the Tempo slider

- [x] **Task 5: `audioRigConfig.ts` + `AudioRigDrawer.tsx` — the Tempo slider**

  **Description:** Add `BPM_SCHEMA` (`SliderLinearSchema`, `min: 20, max: 200, step: 1, unit: 'BPM'`, `loreLabel: 'RESONANCE CADENCE'`, `humanLabel: 'Tempo'`) to `audioRigConfig.ts`, exported as a bare schema alongside `PING_VARIANCE_AUTOMATION_SCHEMA`. Render a bare `SliderLinear` in `AudioRigDrawer.tsx`, in its own `audio-rig-drawer__master-row` after the existing Ping Variance Automation row, wired directly to `audioStore.bpm`/`setBPM` — no unit conversion, unlike the `* 100`/`/ 100` Ping Variance Automation uses — `disabled={rigDisabled}` — spec §1.4, §1.5, §4. No technical dependency on Tasks 1–4 (see Architecture Decisions) — safe to build in parallel with any of them.

  **Acceptance criteria:**
  - [x] `BPM_SCHEMA` is a valid `SliderLinearSchema` with `min: 20, max: 200, step: 1, unit: 'BPM'`.
  - [x] The slider renders with `value = bpm` (no scaling).
  - [x] Dragging it calls `setBPM(value)` directly, with no intermediate conversion.
  - [x] It's disabled when `globalAudio.globalBypass` is `true`, matching every other Rig-wide control.
  - [x] It renders exactly once, outside any `AccordionContainer`, in its own `audio-rig-drawer__master-row`.
  - [x] Checked directly against `AudioRigDrawer.test.tsx`'s existing suite for a brittle pre-existing count assertion on `audio-rig-drawer__master-row` divs (spec §7 item 3) — none found; no such assertion existed.

  **Verification:**
  - [x] `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (technical) — sequenced here for a simpler single-session read; see Architecture Decisions for the parallelization note.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`, `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** M (4 files, new UI wiring reusing an existing primitive)

### Checkpoint: UI live
- [x] `npm run build:types`, `npm run lint`, `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console/AudioRigDrawer.test.tsx` clean. `npm test` also clean (1620 tests across 104 files; one intermittent noise-map-based flake seen on one run self-resolved on rerun, same known class as the Reseed wiring checkpoint's).
- [x] Manual check: the Tempo slider is visible at the bottom of the Audio Rig drawer, below Ping Variance Automation; dragging it updates `TransportBar.tsx`'s live BPM readout with no visible/audible stutter; it disables under Bypass. Confirmed in a live browser.
- [x] Review with human before proceeding.

---

### Phase 4: Docs

- [x] **Task 6: `docs/AUDIO_SYSTEM.md` — document the seeded/live BPM behavior**

  **Description:** Add a short subsection (near the existing BPM/Transport references) covering: `audioStore.bpm` is now locale-seeded (`[40, 100]`, `generateLocaleBpm`) on any coordinate-changing retransmit, freely overridable via the new Audio Rig Tempo slider (`[20, 200]`), and ramps via `AudioEngine.setBPM` rather than jumping instantly — spot-checked against final shipped source, not reconstructed from the spec from memory. Must explicitly disambiguate from `locale.settings.bpm` (Factory/BubbleStream production cadence, untouched, still hardcoded `60`) — spec §1, §2.

  **Acceptance criteria:**
  - [x] The new subsection names `generateLocaleBpm`, `regenerateBpmFromSeed`, and `BPM_RAMP_SECONDS` matching the actual shipped source exactly.
  - [x] It states explicitly that `retransmitAttenuationStyleOnly` does not reseed BPM, and why (locale preserved, no coordinate change).
  - [x] It includes a one-line disambiguation from `locale.settings.bpm`, clear enough that a future reader searching for "bpm" doesn't conflate the two.

  **Verification:**
  - [x] Manual review — every documented name/behavior spot-checked directly against `localeBpmSeed.ts`'s, `audioStore.ts`'s, `worldTransition.ts`'s, and `AudioEngine.ts`'s final shipped code.
  - [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 2, Task 4, Task 5.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean. Final full-suite count: 1620 tests across 104 files (1622 after the post-launch fix below).
- [x] All acceptance criteria across all 6 tasks are met.
- [x] `docs/AUDIO_SYSTEM.md` reflects the shipped API — every documented name spot-checked against source.
- [x] Manual check (spec §5): retransmit coordinates-only several times, confirm the Tempo slider jumps to a new value each time, always within `40`–`100` immediately after; drag to an extreme (e.g. `190`), retransmit Attenuation-Style-only (name change, same coordinates), confirm the dragged value survives untouched; drag to an extreme, retransmit coordinates-only, confirm the drag is discarded in favor of a freshly seeded value; drag the slider while a melody is audibly playing and confirm no audible click/zipper on each step. Confirmed in a live browser (used the Click Track testing toggle, added afterward specifically to make this audible check unambiguous — see Post-launch addition below).
- [x] Ready for human review / PR.

### Post-launch fix: voice releases stalling on a live BPM change

User-reported after Task 5 shipped: changing BPM made playback "peter out" — only already-triggered notes finished, then nothing new played. Root cause (found via source-level Tone.js tracing, not the live-browser manual check above, which is still pending): `AudioEngine.ts`'s pre-existing `scheduleVoiceRelease` computed a real-seconds voice-release delay but scheduled it via `transport.scheduleOnce('+N')`, whose `'+N'` offset resolves against the **Transport's own tick timeline** (`Transport.scheduleOnce` → `TransportTimeClass(...).toTicks()`) — a fixed tick position computed using the tempo in effect at schedule time. Any bpm change before that tick position is reached shifts how much real time it takes to get there (late if bpm decreased, early if increased); enough skew strands `activeVoices` at `MAX_POLYPHONY`, silently blocking every new trigger. This bug was **pre-existing but dormant** — `bpm` was a hardcoded, never-changing `60` before this feature, so `setBPM` was never reachable during live playback until Task 5's Tempo slider made it so.

**Fix:** `scheduleVoiceRelease` now uses `Tone.getContext().setTimeout` — a real-seconds, AudioContext-clock-based timeout, genuinely tempo-independent — instead of `transport.scheduleOnce`.

- [x] Reproduction test written first (RED): asserts release scheduling goes through `Tone.getContext().setTimeout`, not `transport.scheduleOnce`, and that 16 in-flight voices are freed (polyphony cap lifts) after their releases fire, even with a `setBPM` call in between.
- [x] Fix applied (GREEN): `src/engine/AudioEngine.ts`'s `scheduleVoiceRelease`.
- [x] `npx vitest run src/engine/AudioEngine.test.ts` passes (97 tests). Full suite clean: 1622 tests across 104 files. `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [x] Live-browser confirmation from the user that playback no longer peters out on a BPM change.

**Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

### Post-launch addition: Skipped Notes debug counter

Added immediately after the voice-release stall fix above, to make the polyphony cap visible in real time rather than inferred from audible symptoms — a bottom-left, dev-only overlay showing how many note triggers were rejected in the current measure and why (polyphony cap, no composite voice reserved, invalid note string, a thrown scheduling error). Started as a one-off diagnostic for chasing that bug; kept afterward on its own merit — not a BPM Control task, no entry existed for it in the plan above, but it stayed useful for the live-browser tempo checks below (a rising skip count during a Tempo-slider drag flags voices genuinely not clearing, without waiting to hear playback audibly "peter out"), and the user has decided it's worth keeping as a standing tool rather than removing it. Recorded here as the build-log entry this file was otherwise missing.

- [x] `debugStore.ts` — a rolling per-measure history of skip counts, written once per measure boundary and reset for the next.
- [x] `AudioEngine.ts`'s `triggerWithCap`, `startMelodyPlayback`, and `playRegisteredEvents` each count every reason a note fails to play (not just the polyphony cap) into a per-measure counter, snapshotted into `debugStore` on each `subscribeToMeasure` tick.
- [x] `SkippedNotesCounter.tsx` — the overlay itself, rendered from `App.tsx` behind `DEV_TUNING` (same gate the Click Track toggle below uses) — unreachable in a production build.
- [x] `npm test`, `npm run build:types`, `npm run lint` all clean.

**Files:** `src/stores/debugStore.ts`, `src/stores/debugStore.test.ts`, `src/components/debug/SkippedNotesCounter.tsx`, `src/components/debug/SkippedNotesCounter.css`, `src/components/debug/SkippedNotesCounter.test.tsx`, `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`, `src/App.tsx`

### Post-launch fix: reverted setBPM's ramp — it made live tempo changes feel unstable

User-reported (a trained musician) after the voice-release fix above shipped: dragging the Tempo slider made the beat feel "wishy-washy," with no locatable downbeat — not just a tempo change, an *unstable* one. Root cause: Task 2 (§Foundation) had `setBPM` ramp the transport's `bpm` param over `BPM_RAMP_SECONDS` (0.05s) via `rampTo`, mirroring `updateRobotMasterVolume`'s `Tone.Gain` ramp. That precedent doesn't transfer: BPM isn't a continuously-summed audio signal, so an instant change doesn't click the way an instant Gain jump does — there was nothing for the ramp to protect against. Worse, the Tempo slider's `onChange` fires continuously during a drag (Radix's `onValueChange`, not `onValueCommit`), far more often than a 50ms ramp can complete — each call cancelled the previous still-in-flight ramp and restarted a new one (`Tone.Param.rampTo`'s own `cancelAndHoldAtTime` behavior), so the actual tempo never settled for the whole drag gesture. Standard DAW behavior — and this function's own pre-Task-2 shape — applies tempo changes instantly.

**Fix:** `setBPM` reverted to a plain `transport.bpm.value = bpm` assignment. `BPM_RAMP_SECONDS` removed (dead constant). This also simplifies Task 2's own diff away — no ramp, no fallback branch to maintain.

- [x] Tests rewritten first (RED against the ramped code): assert `setBPM` sets `transport.bpm.value` directly, never calls `rampTo`, and that many rapid successive calls (simulating a fast drag) each land immediately with no restart/interruption.
- [x] Fix applied (GREEN): `src/engine/AudioEngine.ts`'s `setBPM`, `BPM_RAMP_SECONDS` constant removed.
- [x] `npx vitest run src/engine/AudioEngine.test.ts` passes (103 tests). `npm run build:types`, `npm run lint` clean.
- [x] `docs/AUDIO_SYSTEM.md`'s "BPM / Tempo" section and `AudioEngine` API listing updated to describe the instant assignment, not the ramp.
- [x] Live-browser confirmation from the user that dragging the Tempo slider now tracks a stable, locatable beat.

**Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`, `docs/AUDIO_SYSTEM.md`

### Post-launch addition: Company "All" broadcast mode

Also added as a testing convenience, ahead of the Click Track toggle below: verifying a tempo behavior across every robot at once meant selecting each company one at a time, since `CompanyOptionsSection` only ever bound to a single company or nothing. A third `CompanyButtonRow` option — "All" (`uiStore.allRobotsSelected`, mutually exclusive with `selectedCompanyId`) — lets a broadcast edit reach every robot in the locale regardless of company in one action. Building it surfaced a latent, unrelated bug in the existing per-company broadcast path: every compound-value edit (Volume LFO, Motif Length, Note Variance, Ping Contour/ADSR, Signature Array layers) replaced each member's *entire* compound value with the panel's shared baseline plus the one changed field, silently overwriting members' own untouched sub-fields whenever they differed from that baseline — `diffCompoundField`/`diffLayerField` (`src/systems/companyOptions.ts`) now isolate just the changed field before broadcasting, for both the per-company and "All" paths alike.

Not a BPM Control task itself — no entry existed for it in the plan above — but the user has decided it's worth keeping beyond testing, as a general bulk-edit capability. Its mechanics are documented fully in [docs/COMPANIES.md](../COMPANIES.md)'s "Editing Semantics" section; recorded here only as the build-log entry this file was otherwise missing.

- [x] `CompanyButtonRow.tsx`/`uiStore.ts` — the "All" selection and its `selectAllRobots` action.
- [x] `CompanyOptionsSection.tsx` — a third `members` source (every robot in the locale) alongside the existing single-company path; `resolveCompanyOptions` takes a snapshot directly (`Company.lastEditedOptions`, or the new `Locale.allRobotsLastEditedOptions` for "All") rather than a whole `Company`, since that's all it ever read.
- [x] `diffCompoundField`/`diffLayerField` (`src/systems/companyOptions.ts`) — the sibling-field-overwrite fix, applied to every compound broadcast handler in both modes.
- [x] `npm test`, `npm run build:types`, `npm run lint` all clean.

**Files:** `src/components/company/CompanyButtonRow.tsx`, `src/components/company/CompanyButtonRow.test.tsx`, `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`, `src/components/company/CompanyOptionsSection.tsx`, `src/components/company/CompanyOptionsSection.test.tsx`, `src/systems/companyOptions.ts`, `src/systems/companyOptions.test.ts`, `src/data/companyConfig.ts`, `src/data/companyConfig.test.ts`, `src/types/locale.ts`, `docs/COMPANIES.md`

### Post-launch addition: Click Track testing toggle

Added to make the live-browser tempo checks above (Checkpoint: Complete, and the setBPM-ramp-revert's own live-browser confirmation) unambiguous — a robot's own generated melody is hard to track a downbeat against by ear, especially at higher BPM with longer seeded ADSR release times. A dev-only per-robot (or company/All-broadcast) toggle at the top of Ping Controls overrides playback with a fixed 4-quarter-note downbeat pattern instead.

- [x] `src/engine/clickTrack.ts` — the fixed pattern, enforced centrally in `AudioEngine.registerRobotMelody` (the one funnel every melody-registration call site shares) rather than at each call site.
- [x] Bug found and fixed during this addition: the docking pitch-drift reroll (`robotSystems.ts`'s `landOnDocked`) was silently overwriting an active click track with the drifted real melody while the toggle still read as on — now impossible, since the override is enforced at the shared funnel, not per call site.
- [x] Available in both `RobotOptionsTab` (single robot) and `CompanyOptionsSection` (company/All broadcast).
- [x] Gated entirely behind `DEV_TUNING` — same gate as the Skipped Notes debug counter — never reachable in a production build.
- [x] `npm test` (1687 tests), `npm run build:types`, `npm run lint` all clean.
- [x] Documented in `docs/MELODY_SYSTEM.md` (Click Track note), `docs/AUDIO_SYSTEM.md` (`registerRobotMelody`'s API listing), and `docs/COMPANIES.md` (`CompanyOptionsSnapshot`'s field list, the broadcast function list).

**Files:** `src/engine/clickTrack.ts`, `src/engine/clickTrack.test.ts`, `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`, `src/types/Robot.ts`, `src/types/Company.ts`, `src/systems/robotOptionsActions.ts`, `src/systems/robotOptionsActions.test.ts`, `src/systems/companyOptions.ts`, `src/systems/companyOptions.test.ts`, `src/systems/robotSystems.test.ts`, `src/data/robotOptionsConfig.ts`, `src/data/robotOptionsConfig.test.ts`, `src/components/robot/PingControlsDrawer.tsx`, `src/components/robot/PingControlsDrawer.test.tsx`, `src/components/panels/screen/console/RobotOptionsTab.tsx`, `src/components/panels/screen/console/RobotOptionsTab.test.tsx`, `src/components/company/CompanyOptionsSection.tsx`, `src/components/company/CompanyOptionsSection.test.tsx`, `docs/MELODY_SYSTEM.md`, `docs/AUDIO_SYSTEM.md`, `docs/COMPANIES.md`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `retransmitAttenuationStyleOnly` is defined by what it *doesn't* call — easy for a future edit to that function (unrelated to this feature) to accidentally add a `regenerateBpmFromSeed` call by analogy with the other two branches | Low-medium — would silently break "no override carryover" for the one branch it's supposed to be exempt from | Task 4's acceptance criteria include an explicit negative assertion (mock not called) plus a live-store "bpm unchanged" check, not just positive coverage of the other two branches |
| `audioStore.ts` importing `useLocaleStore` (Task 3) sits inside an area of the codebase (`localeStore.ts` ⇄ `AudioEngine.ts`) that already has one pre-existing import cycle | Low — traced in spec §1.3 as a safe new one-directional edge, no cycle introduced, but worth re-verifying if either file's import graph changes before this task lands | Task 3 should re-run a quick import-graph check (`localeStore.ts` still doesn't import `audioStore.ts`) immediately before merging, not just trust the spec's point-in-time analysis |
| `AudioRigDrawer.test.tsx`'s existing test suite may already assert an exact count of `audio-rig-drawer__master-row` divs (spec §7 item 3) | Low-medium — would surface as a confusing, seemingly-unrelated test failure | Task 5 should read the existing test file first and update any such count-based assertion deliberately, same mitigation `PING-VARIANCE-AUTOMATION.md` used for its own equivalent addition |
| `setBPM`'s ramp (Task 2) is unconditional — a locale-build reseed (Task 3/4) now ramps too, not just manual drags | Low — a 50ms ramp is inaudible as a discrete jump either way, per spec §1.6's own reasoning | No mitigation needed; flagged in spec §7 item 1 as a default worth a quick manual sanity check during Task 4/6, not a design flaw |

## Open Questions

Carried forward from spec §7 — all resolved as of the manual review above:

1. ~~The drawer slider's full range (`[20, 200]`) and the ramp duration (`BPM_RAMP_SECONDS = 0.05`) are engineering defaults, not separately confirmed with the user.~~ **Resolved**: the ramp itself was removed entirely by the setBPM-ramp-revert post-launch fix (a musician tester found it made tempo feel unstable, not just unconfirmed) — the range `[20, 200]` was confirmed as part of the live-browser manual review above.
2. ~~Whether `disabled={rigDisabled}` (gating the Tempo slider under the master Bypass toggle) is the right call musically.~~ **Resolved**: confirmed during the manual review — no reported issue, left as shipped.
3. ~~`AudioRigDrawer.test.tsx`'s existing test suite may already assert an exact list/count of `audio-rig-drawer__master-row` divs.~~ **Resolved** during Task 5 — no such assertion existed (see Task 5's acceptance criteria above).
