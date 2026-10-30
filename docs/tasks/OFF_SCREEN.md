# Implementation Plan: The Off Screen

Source spec: [docs/specs/OFF_SCREEN.md](../specs/OFF_SCREEN.md). Source intent:
[docs/intent/off-screen.md](../intent/off-screen.md). Roadmap slot: proposed **57** (the spec's call; backlog
[5](../todo/backlog.md#5-sector-settings-ascoordsfavorites-reorganization) moves to the archive under it in Task 38).

Written 2026-10-30 against `main` at `cc9a01f2`. The spec's §7 recommendations were accepted as written the same day
(Crawford: "your recs are fine"), so every task below builds the spec's default; Open Questions names which task moves
if the T0 spike overturns assumption 2. Per Crawford (2026-10-30), the intent, the spec and this plan are committed
together once this plan is approved; the build then runs one commit per task.

## Overview

Four modules in one spec, built in the spec's §0 order, each closed by a checkpoint Crawford looks at or listens to.
**`power-pause` (Tasks 0–8):** the audio context suspends and resumes, the world's GSAP timelines gain a scope and pause
as a set, the work loop's clock shifts, `powerController` learns `cold / running / paused`, and the rocker loses its
dialog. **`off-screen-chooser` (Tasks 9–17):** the heard-a-world flag, the Current row, presets as pasted links, Roll,
Keep, the address-bar mirror, the veil, the boot theatre and the footer; the Seeds tab loses its shortcut buttons.
**`band-table` (Tasks 18–28):** every loading band lifted into `src/data/bands/` with Classic byte-for-byte, one
resolver, one loading context, the identity (theme + aspect sets) in the payload, the link and the baseline, a
`loadingOnly` retransmit, the round-robin deal and its post-deal re-derivation — no audible change until the fourth
module. **`themes-and-aspects` (Tasks 29–35):** `RadioButton`'s `multiple` variant, the Loading axis on the off screen,
the "loaded under" readout, Foundry's status line, and the listen that puts real numbers in the five theme columns and
the three Melody columns. **Docs (Tasks 36–38).**

## Architecture Decisions

- **Task 0 is a spike that gates assumption 2.** Before any pause code, suspend and resume the raw context by hand in
  the browser with a world running and watch the BeatClock's measure count, a swell mid-ramp, a sounding note and the
  Pixel. If it holds, Tasks 1–8 build the context path; if not, Task 1 builds the fallback (transport `pause()` plus a
  release of active voices) and the spec's assumption 2 is amended before Task 1 is committed. Nothing is committed for
  Task 0 itself; its record goes under Checkpoint 0 below.
- **`timelineMap` grows `getTimelineScope(id)` beside the scope** (Task 2) so the call-site tasks (3a, 3b) can prove a
  registration's scope by code — `createSwimTimeline(...)` then `getTimelineScope('swim-<id>') === 'world'` — instead of
  reading source (CLAUDE.md: tests exercise code, not text).
- **`deviceFlags.ts` is built in Phase 1 (Task 5), though the spec files it under the chooser:** `powerController`'s
  first-start path writes the flag (spec assumption 7), so the controller task (6) needs it to exist. It is a two-function
  module with no dependencies; building it early costs nothing.
- **`worldState` goes `'cold'` from the teardown, not from the screen.** `initializeLocale(..., { startSystems: false })`
  and the two `retransmit*` paths call `powerController.noteWorldReplaced()` (Task 8); the off screen never writes the
  state. A world change while `'paused'` therefore leaves `'cold'` without the chooser knowing anything about power.
- **The bare-boot URL mirror lives where the link is consumed** (Task 15): `OceanScene`'s mount effect already asks
  `consumeSessionSharePayload()`; when it returns `null` the boot was bare and the random identity is mirrored; when it
  returns a payload the arrival URL stands (spec assumption 12). No second place reads the address bar.
- **Robot baselines are regenerated at diff time, not stored — so the deal runs inside the generator** (Tasks 26–27;
  corrects the spec's assumption 22 wording, amended the same day). `buildSessionPayload` calls
  `generateRobotRosterBaseline(noiseMap, n)` and diffs each live robot against `robotBaselines[i]`
  (`sessionDiff.ts:317–320`); the company roster is regenerated the same way (`generateCompanyRosterBaseline`). So the
  deal pass is one pure function, `applyDealToBaselines(baselines, companies, identity, noiseMap)`, used by both the
  live spawn (`spawnInitialRoster` → `spawnInitialCompanies` → the pass writes the live robots) and the baseline
  regeneration (the pass transforms the array before the diff). An untweaked dealt world then diffs `{}` by
  construction. `generateWorldSeedBaseline` (world-level fields only, `seedBaseline.ts:95–115`) needs only `withLoading`.
- **A copied-baseline robot re-derives from its own index.** `generateRobotAudioBaseline` sometimes returns a copy of an
  earlier robot's baseline (`spawnSystem.ts:680–683`); when such a robot is dealt an aspect, its Melody fields are
  re-derived from its own `spawnIndex` draws, not the source's. Deterministic either way; stated so nobody chases it.
- **A theme or aspect change is a new retransmit mode, `loadingOnly`** (Task 25). `RetransmitInput` gains `theme` and
  `aspects`; when only they change, `retransmitWorld` sets the loading store, regenerates the global half from seed under
  the new bands (`regenerateGlobalAudioFromSeed`, `regenerateLfoBankFromSeed`, `regenerateGlobalLfoLinksFromSeed`,
  `regenerateBpmFromSeed` — the AS-sync subscription does not fire, since the Attenuation Style id is unchanged), then
  removes and re-initialises the locale at the same identity (the `coordsOnly` path's remove-before-init order, which
  regenerates the same robot ids). `applySessionPayload` reaches the same code when a payload's theme or aspects differ.
- **`RadioButton`'s `multiple` variant is Radix `ToggleGroup type="multiple"`** (Task 29) — `@radix-ui/react-toggle-group`
  is already a dependency (`package.json:35`), so no new package; the single-value path keeps Radix `RadioGroup` untouched.
- **Keep is a store action, `keepCurrentWorld()` in `sessionStore.ts`** (Task 14), beside `saveNamedSession`, so the
  name rule (`currentLoadedSessionName ?? currentSessionName`) and the `setCurrentLoadedSessionName` follow-up live once
  and `OffScreen` only calls it.
- **Order rationale.** `describeWorld` (Task 9) comes first in Phase 2 because the Current row, the readout and later
  Foundry all read it; presets-as-links (11) before the mirror (15) so the mirror has picks to follow; the veil and
  theatre (16a/16b) last in Phase 2 because they are look, not behaviour, and Checkpoint B wants the behaviour settled
  first. In Phase 3 the keys and Classic (18) precede every reader; the identity plumbing (23–24) precedes the
  `loadingOnly` mode (25), which the deal (26–27) then rides. Phase 4 starts with the control (29) the Melody row needs.

## Dependency Graph

```
Task 0 (spike)
   │
Task 1 (AudioEngine pause/resume)   Task 2 (timelineMap scope)   Task 4 (workLoop pause)   Task 5 (deviceFlags)
   │                                   │          │                     │                       │
   │                          Task 3a (anim sites) Task 3b (ui sites)   │                       │
   └───────────────────────────────────┴──────────┴─────────────────────┴───────────────────────┘
                                                   │
                                      Task 6 (powerController paths)
                                                   │
                                Task 7 (rocker, no dialog)   Task 8 (noteWorldReplaced)
                                                   │
                                            ── Checkpoint A ──
                                                   │
Task 9 (describeWorld) → Task 10 (gate + Current) → Task 11 (presets as links) → Task 13 (Roll) → Task 14 (Keep)
                                                   │                                 │
                                    Task 12 (shortcut buttons go)         Task 15 (URL mirror)
                                                                                     │
                                                              Task 16a (veil + footer) → Task 16b (boot theatre + fade)
                                                                                     │
                                                                              Task 17 (Comms copy)
                                                                                     │
                                                                              ── Checkpoint B ──
                                                                                     │
Task 18 (keys + Classic + resolver) → Task 19 (themes/aspects scaffolds + loadingStore) → Task 20 (loadingContext)
                                                   │
                        Task 21 (spawnSystem reads bands)   Task 22 (global / bpm / sends read bands)
                                                   │
                        Task 23 (identity: payload v3, WorldIdentity, baseline under withLoading)
                                                   │
                        Task 24 (link params) → Task 25 (loadingOnly retransmit) → Task 26 (dealAspects) → Task 27 (the deal pass)
                                                                                                                │
                                                                                                        Task 28 (describeWorld + loading)
                                                                                                                │
                                                                                                         ── Checkpoint C ──
                                                                                                                │
Task 29 (RadioButton multiple) → Task 30 (theme row + descriptions + readout) → Task 31 (Melody row, sets, Roll keeps loading)
                                                   │
                        Task 32 (loaded-under line)   Task 33 (Foundry status)   Task 34 (placeholder columns)
                                                   │
                                            Task 35 (the listen) ── Checkpoint D ──
                                                   │
                                   Task 36, 37 (docs) → Task 38 (roadmap, archive, headers)
```

## Task List

Every task names its **Proof**: **RED test** for behaviour (a test that imports or renders the code and fails first),
**Look** / **Listen** for what only the browser shows, **Read** for docs and copy. Only a RED-test task lists a
`*.test.ts(x)` in its Files. Commit subjects: `<module> T<n>: <what>`.

### Phase 0: The spike

- [ ] **Task 0: Suspend and resume the raw context by hand — does Tone 15 come back whole?**

  **Description:** With a world running on desktop Chrome and on the Pixel, in the console:
  `Tone.getContext().rawContext.suspend()`, wait 20 s, `…resume()`. Watch the `?debug` HUD's measure count, a swell in
  flight (pick a robot with a visible send swell), a held note, and whether `playbackStats` reports the gap as a stall.
  Decides spec assumption 2; nothing is committed for this task.

  **Proof:** Listen — the measure count continues from where it stopped (no jump, no double tick); the swell completes
  its ramp; the held note resumes; the Pixel resumes without a reload; the HUD does not count the span as underruns.

  **Acceptance criteria:**
  - [ ] All five observations recorded under Checkpoint 0 with the browser and the commit hash of `main` used.
  - [ ] If any fails: spec assumption 2 is amended to the fallback (transport `pause()` + release of active voices) before
        Task 1 is started, and Task 1's description below is rewritten to match.

  **Verification:**
  - [ ] The Checkpoint 0 record exists in this file.

  **Dependencies:** None.

  **Files:** none (this file's Checkpoint 0 record only)

  **Estimated scope:** XS (an experiment)

### Checkpoint 0: The spike
- [ ] Record: browser(s), `main` hash, the five observations, the decision (context path / fallback).
- [ ] Reviewed with human before Task 1.

---

### Phase 1: `power-pause`

- [ ] **Task 1: `AudioEngine.ts` — `pause()` / `resume()` suspend and resume the raw context**

  **Description:** Rewrite the two unused soft-transport methods (`AudioEngine.ts:1515–1532`) to
  `Tone.getContext().rawContext.suspend()` / `.resume()` (the accessor `audioDiagnostics.ts:156` already uses); the
  transport is not touched; both are no-ops before `start()` has run and swallow a throw with `devWarn`, as their
  neighbours do. (If Task 0 chose the fallback: `transport.pause()` + release every active voice via the voice manager,
  and `resume()` = `transport.start()`.)

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: with a mocked `Tone.getContext()` whose `rawContext` records
  calls, `pause()` after `start()` calls `suspend` once and never `transport.pause`; `resume()` calls `resume`; before
  `start()` neither touches the context.

  **Acceptance criteria:**
  - [ ] `pause()` calls `rawContext.suspend()` exactly once; `resume()` calls `rawContext.resume()` exactly once.
  - [ ] Neither reads or writes the transport; `killAll` is unchanged (its existing tests pass unmodified).
  - [ ] Both are no-ops before `start()` and never throw.

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 0.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S (two methods and their tests)

- [ ] **Task 2: `timelineMap.ts` — a scope per timeline, `pauseWorldTimelines()`, `resumeWorldTimelines()`, `getTimelineScope()`**

  **Description:** `setTimeline(id, timeline, scope: 'world' | 'ui' = 'ui')` stores the scope beside the timeline;
  `pauseWorldTimelines()` pauses every `'world'` entry and sets a module flag; `resumeWorldTimelines()` plays them and
  clears it; a `'world'` timeline registered while the flag is set is paused on registration (spec assumption 3);
  `getTimelineScope(id)` returns the scope or `undefined`. `killTimeline` / `killAllTimelines` unchanged.

  **Proof:** RED test — `src/animation/timelineMap.test.ts`: a `'world'` timeline is paused by `pauseWorldTimelines()`
  and playing after `resumeWorldTimelines()`; a `'ui'` timeline is untouched by both; a `'world'` timeline set during the
  paused span is paused immediately; `killAllTimelines` still empties the map and clears the flag.

  **Acceptance criteria:**
  - [ ] The default scope is `'ui'`; existing callers compile and behave unchanged (existing tests pass unmodified).
  - [ ] `pauseWorldTimelines()` / `resumeWorldTimelines()` affect only `'world'` entries; registration while paused pauses.
  - [ ] `getTimelineScope` reports `'world'`, `'ui'` or `undefined` for an unknown id.

  **Verification:**
  - [ ] `npx vitest run src/animation/timelineMap.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/animation/timelineMap.ts`, `src/animation/timelineMap.test.ts`

  **Estimated scope:** S

- [ ] **Task 3a: The animation modules register as `'world'` — `swimAnimation`, `buildJobTimeline`, `stationRipple`, `deckCamera`**

  **Description:** Pass `'world'` at `swimAnimation.ts:122`, `buildJobTimeline.ts:207`, `stationRipple.ts:91`,
  `deckCamera.ts:310`. One-line changes; the proof is by scope lookup.

  **Proof:** RED test — the existing test file of each module (or `timelineMap.test.ts` where a module has none) builds
  the timeline through the module's own entry point and asserts `getTimelineScope(<its key>) === 'world'`.

  **Acceptance criteria:**
  - [ ] Each of the four registrations reports `'world'`.
  - [ ] Every existing test in the four modules passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/animation` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/animation/swimAnimation.ts`, `src/animation/jobMoves/buildJobTimeline.ts`, `src/animation/stationRipple.ts`,
  `src/animation/deckCamera.ts`, their `*.test.ts`

  **Estimated scope:** S (four one-liners and four assertions)

- [ ] **Task 3b: The component hooks and the work loop register as `'world'`**

  **Description:** Pass `'world'` at `BubbleStream.tsx:243`, `useHaloMotion.ts:68`, `useOrbiterMotion.ts:142` and `:301`,
  `useStripFlicker.ts:109`, and the six `setTimeline` calls in `workLoop.ts` (`:403`, `:460`, `:541`, `:580`, `:602`,
  `:622`). The rocker, nav, cabinet and roster registrations keep the `'ui'` default.

  **Proof:** RED test — `workLoop.test.ts` asserts a started loop's `swim-`/`work-`/`bob-wait-` keys report `'world'`;
  one hook test (`useOrbiterMotion.test.ts` or the nearest existing one) asserts its key reports `'world'`;
  `PowerRockerSwitch.test.tsx` asserts `'power-rocker-sequence'` reports `'ui'`.

  **Acceptance criteria:**
  - [ ] Every listed world registration reports `'world'`; the UI ones report `'ui'`.
  - [ ] Existing tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/workLoop.test.ts src/components/robot/gem src/components/ui/physical` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/actors/BubbleStream.tsx`, `src/components/robot/gem/useHaloMotion.ts`,
  `src/components/robot/gem/useOrbiterMotion.ts`, `src/components/robot/gem/useStripFlicker.ts`, `src/systems/workLoop.ts`,
  their `*.test.ts(x)`

  **Estimated scope:** M (five files, one-line edits, three assertions)

- [ ] **Task 4: `workLoop.ts` — `pauseWorkLoop()` / `resumeWorkLoop()` with a shifted clock**

  **Description:** The loop's `now` (`workLoop.ts:94`, `:752`) becomes `baseNow() - pausedSeconds`; `pauseWorkLoop()`
  records the pause start and calls `pauseWorldTimelines()` is **not** its job (the controller does that) — it only
  freezes the clock; `resumeWorkLoop()` adds the elapsed span to `pausedSeconds`. Every stamped `readyAt` (`:437`,
  `:562`, `:693`) keeps its meaning across the gap (spec assumption 4). `startWorkLoop` resets `pausedSeconds`.

  **Proof:** RED test — `src/systems/workLoop.test.ts`: with an injected `now`, a cooldown stamped at t = 10 with
  `siteCooldown` 5 is still unexpired after `pauseWorkLoop()` at 11, an injected jump to 100, and `resumeWorkLoop()`;
  it expires at the shifted time; pausing twice accumulates.

  **Acceptance criteria:**
  - [ ] A `readyAt` stamped before a pause is honoured after it as if no time passed.
  - [ ] Two pauses accumulate; `startWorkLoop` starts from zero.
  - [ ] Existing loop tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/workLoop.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (Task 3b touches the same file; land 3b first to avoid a merge of two edits).

  **Files:** `src/systems/workLoop.ts`, `src/systems/workLoop.test.ts`

  **Estimated scope:** S

- [ ] **Task 5: `deviceFlags.ts` — the heard-a-world flag**

  **Description:** New `src/utils/deviceFlags.ts`: `hasHeardWorld()` reads `localStorage['trace-atlas.device.v1']`
  (JSON `{ heardWorld: true }`), false on absence, bad JSON or a throwing storage; `markHeardWorld()` writes it,
  swallowing a throw. The precedent is `sessionStorageEngine.ts`.

  **Proof:** RED test — `src/utils/deviceFlags.test.ts`: false on empty storage; true after `markHeardWorld()`; false after
  `localStorage.clear()`; false when `getItem` throws; a garbage value reads false.

  **Acceptance criteria:**
  - [ ] The four reads above; the write is idempotent.
  - [ ] No other key is touched; `trace-atlas.sessions.v1` is untouched by both functions.

  **Verification:**
  - [ ] `npx vitest run src/utils/deviceFlags.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/deviceFlags.ts`, `src/utils/deviceFlags.test.ts`

  **Estimated scope:** XS

- [ ] **Task 6: `powerController.ts` — `worldState`, `pause()`, `resume()`, the two-way `powerOnSequence()`**

  **Description:** Module state `worldState: 'cold' | 'running' | 'paused'` with `getWorldState()`. `pause()` =
  `pauseWorkLoop()` → `pauseWorldTimelines()` → `AudioEngine.pause()` → `setPowerOff()` → `'paused'`; the lifecycle
  subscription stands. `resume()` = `AudioEngine.resume()` → `resumeWorldTimelines()` → `resumeWorkLoop()` →
  `setPowerOn()` → `'running'`. `powerOnSequence()` resumes when `'paused'` and the off screen's pick is Current
  (`OffScreen` exposes nothing yet — until Task 10 the condition is simply `'paused'`), else today's `start()` +
  `startLocaleSystems` → `'running'`, and on the very first start `markHeardWorld()`. `shutdown()` is deleted (its one
  caller moves in Task 7). `noteWorldReplaced()` → `'cold'` is added here, wired in Task 8.

  **Proof:** RED test — `src/systems/powerController.test.ts` (extend the existing mocks: `AudioEngine.pause/resume`,
  `../animation/timelineMap`, `./workLoop`'s pause/resume, `../utils/deviceFlags`): `pause()` call order and `'paused'`;
  `powerOnSequence()` from `'paused'` calls `resume` and none of `start`/`startLocaleSystems`; from `'cold'` calls
  `start` + `startLocaleSystems` and `markHeardWorld` once; a second cold start does not call `markHeardWorld` again when
  `hasHeardWorld` is true; `shutdown` is gone.

  **Acceptance criteria:**
  - [ ] The two paths and the state machine in spec §1.2; `killAll` is never called by `pause()`.
  - [ ] `markHeardWorld` fires only on a start when `hasHeardWorld()` is false.
  - [ ] `shutdown` no longer exists; `powerOnSequence` keeps its name and signature.

  **Verification:**
  - [ ] `npx vitest run src/systems/powerController.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean (the rocker still compiles against `shutdown` until Task 7 — land 6 and 7 back to back, or keep a one-line `shutdown = pause` alias deleted in Task 7).

  **Dependencies:** Tasks 1, 2, 4, 5.

  **Files:** `src/systems/powerController.ts`, `src/systems/powerController.test.ts`

  **Estimated scope:** M

- [ ] **Task 7: `PowerRockerSwitch.tsx` — no dialog; the off-branch mirrors the on-branch**

  **Description:** Remove `showConfirm`, the dialog markup and `handlePowerOffConfirm`; the off-branch of
  `handleRockerClick` (`:189–194`) becomes a `power-rocker-sequence`-style timeline: 0.18 s hold →
  `powerController.pause()`, 0.5 s → `returnRocker()`. Delete `ui.power.confirmTitle` / `confirmBody` from
  `src/content/copy/ui.ts` (unread entries fail `content.test.ts`) and any dialog-only CSS.

  **Proof:** RED test — `src/components/ui/physical/PowerRockerSwitch.test.tsx`: an off-click while powered renders no
  dialog and, after the hold, calls `powerController.pause()` once; `returnRocker` follows; the on-click path is
  unchanged (existing assertions pass).

  **Acceptance criteria:**
  - [ ] No dialog, no `AlertDialog` import, no `showConfirm` state remain.
  - [ ] `pause()` is called exactly once per off-click; the timeline ids `'power-rocker-sequence'` / `'power-rocker-confirm-delay'` — the latter is gone, the former serves both directions.
  - [ ] `content.test.ts` passes with the two keys deleted.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/physical/PowerRockerSwitch.test.tsx src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/components/ui/physical/PowerRockerSwitch.tsx`, `src/components/ui/physical/PowerRockerSwitch.test.tsx`,
  `src/components/ui/physical/PowerRockerSwitch.css`, `src/content/copy/ui.ts`

  **Estimated scope:** M

- [ ] **Task 8: `worldTransition.ts` — a replaced world is `'cold'`**

  **Description:** `initializeLocale(..., { startSystems: false })` and both `retransmit*` teardowns call
  `powerController.noteWorldReplaced()` after `stopWorkLoop` / `killAll`, so a world changed while `'paused'` (a pick,
  Roll, Retransmit, a session Load) leaves the controller `'cold'` and the next flip is a `start`. `startLocaleSystems`
  is otherwise unchanged.

  **Proof:** RED test — `src/systems/worldTransition.test.ts`: after `pause()`, `retransmitWorld({ coordinates })` leaves
  `getWorldState() === 'cold'`, and a following `powerOnSequence()` calls `start`, not `resume`.

  **Acceptance criteria:**
  - [ ] Every path that tears a world down marks `'cold'`; `startLocaleSystems` alone does not change the state (the controller does, on start).
  - [ ] Existing world-transition tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/worldTransition.test.ts src/systems/powerController.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`, `src/systems/powerController.ts`

  **Estimated scope:** S

### Checkpoint A: Power is a pause
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Browser (desktop + Pixel): flip off mid-phrase, wait 30 s, flip on — the music resumes mid-phrase, every robot is
      where it was, batteries unchanged, the day light has moved; a second cycle behaves the same; a fresh reload's first
      flip still starts from measure 0; Retransmit while off, then flip → the new world starts.
- [ ] `npm run perf:audio` Pixel A/B against `main`: no rise in underruns in the worst-case run; HUD counts recorded here.
- [ ] `npm run perf` off-state busy recorded against `main`'s off state (expected lower).
- [ ] Reviewed with human before Phase 2.

---

### Phase 2: `off-screen-chooser`

- [ ] **Task 9: `describeWorld.ts` — one name for a world**

  **Description:** New `src/utils/describeWorld.ts`: `describeWorld({ attenuationStyleName, coordinates }, label?)`
  returns `AS · (x, y)` or `<label> · AS (x, y)` when a save or preset name is given. Pure; the theme and aspects tail is
  added in Task 28. Used by the Current row and the readout (Task 10), Foundry's status (Task 33).

  **Proof:** RED test — `src/utils/describeWorld.test.ts`: the two shapes; negative coordinates render with the minus sign
  the Seeds tab's status line uses today (`SectorSettingsDrawer.tsx:84`).

  **Acceptance criteria:**
  - [ ] The two shapes above, byte-exact.

  **Verification:**
  - [ ] `npx vitest run src/utils/describeWorld.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/describeWorld.ts`, `src/utils/describeWorld.test.ts`

  **Estimated scope:** XS

- [ ] **Task 10: `OffScreen.tsx` — the gate, and the Current row**

  **Description:** On mount read `hasHeardWorld()`: false → render only the etched label and the hint (today's markup
  minus the Transmission row); true → the chooser. The Transmission `RadioButton` gains a first option `current`
  (default value, label from `describeWorld` of the loaded world, or the loaded save's / preset's name via
  `sessionStore.currentLoadedSessionName`), then the saves, divider, presets as today. The readout well names the pick
  through `describeWorld`. New content keys: the group heading `home.off.transmission` keeps its name; add
  `home.off.current` (the Current label's eyebrow), `home.off.loading` reserved for Task 30. `powerController`'s resume
  condition becomes "pick is `current`" (an exported `isCurrentPick()` read from the controller).

  **Proof:** RED test — `src/components/panels/screen/screens/OffScreen.test.tsx` (extend the 23): with the flag false,
  no radio renders and the hint does; with the flag true, the radio renders with `current` selected and the readout
  names `describeWorld`'s string; a save pick still calls `applySessionPayload`; `powerController.powerOnSequence` resumes
  only when the pick is `current` (controller test).

  **Acceptance criteria:**
  - [ ] First visit = label + hint only; returning = chooser with Current selected.
  - [ ] Current's label is `describeWorld(identity)` or the loaded save's name; the readout matches it.
  - [ ] Today's save / preset picks behave as before (existing cases pass).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/systems/powerController.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 5, 6, 9.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.test.tsx`,
  `src/content/copy/home.ts`, `src/systems/powerController.ts`

  **Estimated scope:** M

- [ ] **Task 11: `transmissionPresets.ts` — presets are links**

  **Description:** `TransmissionPreset = { id, nameKey, link }`; `presetPayload(preset)` =
  `decodeWorldLink(searchOf(preset.link))`, with `searchOf(link)` in `sessionShareUtils.ts` accepting a full URL or a
  bare `?…` query. The three entries become the placeholders' bare triples (`?seed=kr1nd4ra&x=12&y=68`, …) until
  Crawford pastes his; the three ~200-line payload constants go. `OffScreen` picks a preset through `presetPayload`.

  **Proof:** RED test — `src/data/transmissionPresets.test.ts`: each entry decodes to a whole payload whose
  `attenuationStyleName` / `coordinates` match the link; `searchOf` handles `https://host/path?seed=a&x=1&y=2` and
  `?seed=a&x=1&y=2` alike; `OffScreen.test.tsx`: a preset pick applies the decoded payload.

  **Acceptance criteria:**
  - [ ] No `SessionPayload` constant remains in the file; the type has exactly `id`, `nameKey`, `link`.
  - [ ] A preset pick on the off screen applies `decodeWorldLink`'s payload.
  - [ ] A malformed link yields the random-filled world `decodeWorldLink` returns, never a throw.

  **Verification:**
  - [ ] `npx vitest run src/data/transmissionPresets.test.ts src/components/panels/screen/screens/OffScreen.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10.

  **Files:** `src/data/transmissionPresets.ts`, `src/data/transmissionPresets.test.ts`, `src/utils/sessionShareUtils.ts`,
  `src/components/panels/screen/screens/OffScreen.tsx`

  **Estimated scope:** M

- [ ] **Task 12: `SectorSettingsDrawer.tsx` — the shortcut buttons go**

  **Description:** Delete `ATTENUATION_STYLE_PRESETS` and `COORDINATE_PRESETS` from `sectorSettingsConfig.ts`
  (`:66–80`), their button rows in the drawer (`:95–135`) and their content keys (`settings.ts` / `sector.ts`). The AS
  input, the coordinates and Retransmit stay.

  **Proof:** RED test — `src/components/panels/screen/console/SectorSettingsDrawer.test.tsx`: no button named after a
  preset renders; Retransmit and the two inputs still do (existing cases pass).

  **Acceptance criteria:**
  - [ ] The two arrays, their rows and their copy are gone; `content.test.ts` passes.
  - [ ] Retransmit with an edited name or coordinates behaves as before.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SectorSettingsDrawer.test.tsx src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/console/SectorSettingsDrawer.tsx`, `src/data/sectorSettingsConfig.ts`,
  `src/components/panels/screen/console/SectorSettingsDrawer.test.tsx`, `src/content/copy/settings.ts` (or `sector.ts`)

  **Estimated scope:** S

- [ ] **Task 13: `OffScreen.tsx` — Roll**

  **Description:** A `Button` beside the Current row (`home.off.roll`) calling `rollWorld()` in `worldTransition.ts`:
  `retransmitWorld({ attenuationStyleName: generateRandomAttenuationStyleName(), coordinates: { x: randomCoordinate(),
  y: randomCoordinate() } })`; the pick returns to `current` and the readout renames. (That it leaves the loading store
  alone is Task 31's criterion, once the store exists.)

  **Proof:** RED test — `OffScreen.test.tsx`: clicking Roll calls `retransmitWorld` with a name and integer coordinates
  and the pick is `current` afterwards; `worldTransition.test.ts`: `rollWorld()` produces a fresh identity each call.

  **Acceptance criteria:**
  - [ ] One click = one retransmit with fresh AS + coords; Current selected and renamed.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/systems/worldTransition.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.test.tsx`,
  `src/systems/worldTransition.ts`, `src/content/copy/home.ts`

  **Estimated scope:** S

- [ ] **Task 14: Keep — `sessionStore.keepCurrentWorld()` and the button**

  **Description:** `keepCurrentWorld()` in `sessionStore.ts`: `name = currentLoadedSessionName ?? currentSessionName`,
  `saveNamedSession(name, buildSessionPayload())`, `setCurrentLoadedSessionName(name)`; returns the name. `isWorldDirty()`
  beside it: true unless `currentLoadedSessionName` names a save whose payload deep-equals `buildSessionPayload()` now
  (both sides through `sessionDiff`'s normalisation). `OffScreen`: a Keep `Button` (`home.off.keep`) beside Current,
  dimmed (held-off look, `disabled`) when not dirty; on click, keep, re-list the saves, recompute dirty; a muted line
  (`home.off.unsavedWarning`) under the chooser while dirty. Dirty is computed on mount, after a pick and after a Keep.

  **Proof:** RED test — `src/stores/sessionStore.test.ts` (new or extended): `keepCurrentWorld` saves under the loaded
  name when one is loaded, else the suggested name, and marks it loaded; `isWorldDirty` is false right after a keep and
  true after a payload change. `OffScreen.test.tsx`: Keep is disabled when clean, enabled when dirty; clicking adds a row
  and disables Keep; the warning line renders only while dirty.

  **Acceptance criteria:**
  - [ ] Keep saves without a name field, under the rule above; the new row appears at once.
  - [ ] Keep dims when the loaded world equals its save; the warning shows only while dirty.
  - [ ] Dirty is not recomputed per render (no `buildSessionPayload` call in render).

  **Verification:**
  - [ ] `npx vitest run src/stores/sessionStore.test.ts src/components/panels/screen/screens/OffScreen.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 10, 11.

  **Files:** `src/stores/sessionStore.ts`, `src/stores/sessionStore.test.ts`, `src/components/panels/screen/screens/OffScreen.tsx`,
  `src/components/panels/screen/screens/OffScreen.test.tsx`, `src/content/copy/home.ts`

  **Estimated scope:** M

- [ ] **Task 15: `sessionShareUtils.ts` — the address bar follows the loaded world**

  **Description:** `mirrorWorldToUrl(identity)`: rewrite `seed`, `x`, `y` (theme and family params join in Task 24)
  through `withParam` (`audioBudget.ts:189`), remove `s`, `history.replaceState`; a no-op outside a browser or when the
  URL already matches. Call sites: `OceanScene`'s mount effect when `consumeSessionSharePayload()` returns `null`;
  `retransmitWorld` after a rebuild (every mode); `applySessionPayload` when called from the off screen (a flag in its
  options, so a boot-time link apply does not mirror). Never on Keep or an edit.

  **Proof:** RED test — `src/utils/sessionShareUtils.test.ts`: the three params written, `s` removed, `debug` / `load`
  preserved, no write when unchanged; `worldTransition.test.ts`: a retransmit mirrors; `OceanScene`'s boot path mirrors
  on a bare boot and not on a link arrival (a unit of the mount effect's helper, extracted so it can be tested without
  the scene).

  **Acceptance criteria:**
  - [ ] After a pick, Roll or Retransmit the URL names the loaded world and carries no `s`.
  - [ ] A link arrival's URL is untouched until the world changes; a bare boot's URL gains the random identity.
  - [ ] Unrelated params survive every rewrite.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionShareUtils.test.ts src/systems/worldTransition.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 11, 13.

  **Files:** `src/utils/sessionShareUtils.ts`, `src/utils/sessionShareUtils.test.ts`, `src/systems/worldTransition.ts`,
  `src/components/panels/screen/worldView/OceanScene.tsx`, `src/utils/sessionDiff.ts`

  **Estimated scope:** M

- [ ] **Task 16a: `OffScreen.css` / `.tsx` — the veil and the lore footer**

  **Description:** `off-screen__veil` as the screen's own backdrop element (`backdrop-filter: blur(3px)` over
  `rgba(8, 12, 16, .55)`, inside `ScreenViewport`, under the content); `off-screen__footer` under the chooser (and under
  the hint on a first visit) in tiny etched type, text `home.off.footer` (Crawford's legalese; a stand-in until he
  writes it). Phone and desktop.

  **Proof:** RED test — `OffScreen.test.tsx`: the veil element and the footer text render in both gate states (presence
  only); **Look** — the world is blurred and dimmed behind the label on desktop and phone, the footer sits last and
  scrolls with the column.

  **Acceptance criteria:**
  - [ ] Veil and footer present while off, in both gate states.
  - [ ] No horizontal scroll at 360 px; the footer is the last element in the column.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx` passes.
  - [ ] The Look above, recorded in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.css`,
  `src/components/panels/screen/screens/OffScreen.test.tsx`, `src/content/copy/home.ts`

  **Estimated scope:** S

- [ ] **Task 16b: `OffScreen.tsx` — the boot theatre and the power-on fade**

  **Description:** On mount a `'ui'` timeline `off-screen-boot` in `timelineMap`: 0–0.5 s dark (`off-screen--dark`),
  0.5–1.5 s flicker to full, then ready; `gsap.matchMedia` jumps to ready under `prefers-reduced-motion`; a
  `pointerdown` on the screen calls `progress(1)`. `fadeOffScreen()` (exported) tweens the screen and veil to 0 over
  0.4 s and resolves; `powerController.powerOnSequence()` awaits it before `setPowerOn()` on both paths, so the veil is
  gone before `ScreenViewport` unmounts the screen. Timelines killed on unmount.

  **Proof:** RED test — `OffScreen.test.tsx`: mount registers `off-screen-boot` with scope `'ui'`; a `pointerdown` sets
  its progress to 1; unmount kills it; `powerController.test.ts`: `powerOnSequence` awaits `fadeOffScreen` before
  `setPowerOn`. **Look** — dark, flicker, ready; a tap skips; reduced motion shows the screen at once; the veil fades on
  the flip.

  **Acceptance criteria:**
  - [ ] The three-stage mount timeline, skippable, absent under reduced motion; the rocker works throughout.
  - [ ] The veil fades before the chrome appears; no flash of unveiled world.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/systems/powerController.test.ts` passes.
  - [ ] The Look above, recorded in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 6, 16a.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.css`,
  `src/components/panels/screen/screens/OffScreen.test.tsx`, `src/systems/powerController.ts`

  **Estimated scope:** M

- [ ] **Task 17: `session.ts` — the Factory Reset copy loses "and autosaved"**

  **Description:** `session.clearStorage.confirmBody` says every saved and autosaved session is deleted; autosave is
  gone. Reword to the saves and the device's flag (Crawford's words).

  **Proof:** Read — human review of the string. No test file.

  **Acceptance criteria:**
  - [ ] The string names no autosave; mentions that the device returns to a first visit.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/content/content.test.ts` clean.

  **Dependencies:** None.

  **Files:** `src/content/copy/session.ts`

  **Estimated scope:** XS (copy only)

### Checkpoint B: The six stories
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Browser, desktop and phone, the sketch's six stories by hand: bare first visit (hint only → flip → flip off →
      chooser); returning with no saves; with saves (pick → preview → flip); link first visit (hint only, the friend's
      world); link returning (Current named; the URL stands until a pick); link with saves (Keep makes a row). Keep dims
      after a keep; the URL follows picks and Roll and drops `s`; Factory Reset returns the device to a first visit.
- [ ] `npm run perf:idle` on the off state against the Checkpoint A figure: no rise with the veil.
- [ ] Reviewed with human before Phase 3.

---

### Phase 3: `band-table`

- [ ] **Task 18: `src/data/bands/` — `bandKeys.ts`, `classic.ts`, `resolveBands.ts`**

  **Description:** `BandKey`, the three band kinds and `BandTable` (spec §1.3); `CLASSIC: BandTable` holding every
  constant in the spec's survey, byte-for-byte (`GLOBAL_AUDIO_LOADING_RANGES`'s rows, `BPM_SEED_RANGE`,
  `ROBOT_SEND_LOADING_RANGES`'s rows with `lit`, the `spawnSystem.ts` ranges and thresholds, the master volume pair, the
  LFO depth ranges, the two toggle fields as `{ offShare: 0.15, min: 1, max: 8 }`); `resolveBands(theme, robotAspects)`
  over a `THEMES` / `ASPECT_FAMILIES` that this task stubs as `{ classic: {} }` and `{}` (Task 19 fills them). No reader
  yet: independently testable new code.

  **Proof:** RED test — `src/data/bands/resolveBands.test.ts`: `resolveBands('classic', {})` deep-equals a literal table
  typed into the test from today's constants (so a lift that changes a value fails); an overlay replaces exactly its keys.

  **Acceptance criteria:**
  - [ ] Classic parity against the literal table — every key in the spec's survey present with today's value.
  - [ ] The resolver replaces, never widens; untouched keys are Classic's.

  **Verification:**
  - [ ] `npx vitest run src/data/bands/resolveBands.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/data/bands/bandKeys.ts`, `src/data/bands/classic.ts`, `src/data/bands/resolveBands.ts`,
  `src/data/bands/resolveBands.test.ts`

  **Estimated scope:** M (one large data file, two small ones, one test)

- [ ] **Task 19: `themes.ts`, `aspects.ts`, `loadingStore.ts` — the ids, the (empty) columns, the store**

  **Description:** `ThemeId`, `THEMES` with five ids and `{}` columns; `AspectFamilyId = 'melody'`, `AspectId`,
  `AspectPick`, `ASPECT_FAMILIES.melody` with its key set (`robot.rhythmicDensity`, `robot.noteVariance`,
  `robot.rhythmicMotifLength`, `robot.pitchRepeat`) and three `{}` option columns; the type that forbids an option
  naming a foreign key. `src/stores/loadingStore.ts` (Zustand, JSON): `{ theme, aspects }` with `setLoading`,
  `canonicalPicks(family, picks)` (sorts into option order, dedupes, drops unknown ids). Real numbers arrive in Task 34.

  **Proof:** RED test — `src/data/bands/resolveBands.test.ts` (extend): a theme column with one key replaces only it; an
  aspect option replaces only family keys; `src/stores/loadingStore.test.ts`: defaults, `canonicalPicks` ordering and
  dedupe, unknown ids dropped.

  **Acceptance criteria:**
  - [ ] Five theme ids, one family, three options, `'theme'` as a pick; the foreign-key type test fails to compile when violated (a `// @ts-expect-error` case).
  - [ ] `canonicalPicks(['mechanical','hypnotic','hypnotic','zzz'])` → `['hypnotic','mechanical']`.

  **Verification:**
  - [ ] `npx vitest run src/data/bands src/stores/loadingStore.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 18.

  **Files:** `src/data/bands/themes.ts`, `src/data/bands/aspects.ts`, `src/stores/loadingStore.ts`,
  `src/stores/loadingStore.test.ts`, `src/data/bands/resolveBands.test.ts`

  **Estimated scope:** M

- [ ] **Task 20: `loadingContext.ts` — `getBand()`, `setLoading()`, `withLoading()`**

  **Description:** Module state holding the current `BandTable` (Classic at load); `setLoading(identity)` installs
  `resolveBands(identity.theme, {})` — the theme's table, aspects never enter the context (spec assumption 15);
  `withLoading(identity, fn)` installs, runs, restores (also on throw); `getBand(key)` reads. No reader yet.

  **Proof:** RED test — `src/data/bands/loadingContext.test.ts`: `getBand` returns Classic by default; after `setLoading`
  of a theme with one overridden key, that key changes and others do not; `withLoading` restores after `fn` and after a
  throw.

  **Acceptance criteria:**
  - [ ] The three functions as specified; aspects passed in an identity are ignored by the context.

  **Verification:**
  - [ ] `npx vitest run src/data/bands/loadingContext.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 19.

  **Files:** `src/data/bands/loadingContext.ts`, `src/data/bands/loadingContext.test.ts`

  **Estimated scope:** S

- [ ] **Task 21: `spawnSystem.ts` — the robot bands read `getBand(...)`**

  **Description:** Replace each robot-side constant read (the `*_RANGE`s, thresholds, master volume pair, LFO depth
  ranges, the 0–100 density / pitchRepeat bounds, the two toggle fields' threshold and 1–8 span) with `getBand(key)` at
  the point of the draw (spec §4's snippet). The constants move into `classic.ts` (Task 18 already holds their values;
  this task deletes the module-level copies, keeping any still exported for tests as re-exports of the Classic entry).
  `seedToggleValue` takes the toggle band.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`: under Classic every existing deterministic-generation case
  passes unmodified; under `withLoading` of a theme that moves `robot.rhythmicDensity` to `{ 90, 100 }`, every generated
  robot's density is ≥ 90 (a distinguishing value — the parity-fixture rule).

  **Acceptance criteria:**
  - [ ] No robot-side band literal remains in `spawnSystem.ts`; every draw reads `getBand`.
  - [ ] Classic output is byte-for-byte unchanged (existing tests); a non-Classic band is applied.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 20.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, `src/data/bands/classic.ts`

  **Estimated scope:** M (one wide file; mechanical)

- [ ] **Task 22: `globalAudioSeed.ts`, `bpmSeed.ts`, the sends — the global and send bands read `getBand(...)`**

  **Description:** `GLOBAL_AUDIO_LOADING_RANGES` lookups in `globalAudioSeed.ts` become `getBand(key)`;
  `BPM_SEED_RANGE` in `bpmSeed.ts:18` becomes `getBand('bpm')`; `generateRobotSends` reads `getBand(sendField)` for
  `{ min, max, lit }`. `globalAudioLoadingRanges.ts` and `robotSendLoadingRanges.ts` keep their names as re-exports of
  Classic's rows (the grid mirror and `COLOUR_LOAD_MIX_MAX` stay), so the grid comment's "this file mirrors the grid"
  rule still has a file.

  **Proof:** RED test — `globalAudioSeed.test.ts`, `bpmSeed.test.ts`, `spawnSystem.test.ts` (sends): Classic parity via
  the existing cases; under a theme moving `bpm` to `{ 150, 160 }` the generated BPM lands in it; a theme moving
  `reverbSend.lit` to 0 seeds every robot's reverb send to 0.

  **Acceptance criteria:**
  - [ ] All three generators read the table; Classic output unchanged; a moved band is applied.

  **Verification:**
  - [ ] `npx vitest run src/utils/globalAudioSeed.test.ts src/utils/bpmSeed.test.ts src/systems/spawnSystem.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 20.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/bpmSeed.ts`, `src/systems/spawnSystem.ts`,
  `src/data/globalAudioLoadingRanges.ts`, `src/data/robotSendLoadingRanges.ts`

  **Estimated scope:** M

- [ ] **Task 23: Identity — payload v3, `WorldIdentity`, the world baseline under `withLoading`**

  **Description:** `types/session.ts`: `SessionPayloadVersion` adds `3`, `theme?`, `aspects?`;
  `buildSessionPayload` writes both from the loading store, version 3; `applySessionPayload` reads them (absent →
  `'classic'` / `{}`) and sets the loading store before the world is rebuilt. `seedBaseline.ts`: `WorldIdentity` gains
  the two fields; `generateWorldSeedBaseline(identity)` wraps its generators in `withLoading(identity, …)`;
  `diffWorldAgainstSeed` / `fillWorldFromSeed` take the identity through.

  **Proof:** RED test — `sessionDiff.test.ts`: a version 2 payload applies as Classic; a v3 payload sets the store;
  `buildSessionPayload` carries the store's values; `seedBaseline.test.ts`: a baseline for `{ theme: 'calm' }` with a
  Calm column moving `bpm` differs from Classic's exactly there; an untweaked Calm payload diffs `{}` against its own
  baseline.

  **Acceptance criteria:**
  - [ ] Round trip: build → apply restores theme and aspects; old payloads read as Classic.
  - [ ] The world baseline is generated inside the identity's theme bands.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionDiff.test.ts src/utils/seedBaseline.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 19, 20.

  **Files:** `src/types/session.ts`, `src/utils/sessionDiff.ts`, `src/utils/seedBaseline.ts`, `src/utils/sessionDiff.test.ts`,
  `src/utils/seedBaseline.test.ts`

  **Estimated scope:** M

- [ ] **Task 24: `worldLink.ts` — `theme` and `melody` on the link; the mirror writes them**

  **Description:** `encodeWorldLinkParams` writes `theme=<id>` when not `classic` and `melody=<pick>,<pick>` in canonical
  order when non-empty; `decodeWorldLink` reads both leniently (unknown ids dropped with `devWarn`); the `theme` comment
  ("reserved") is replaced. `mirrorWorldToUrl` (Task 15) writes the same two params.

  **Proof:** RED test — `worldLink.test.ts`: round trip of theme + set; `mechanical,hypnotic` decodes and re-encodes as
  `hypnotic,mechanical`; a Classic untweaked world is the bare triple; `sessionShareUtils.test.ts`: the mirror writes
  and removes the two params.

  **Acceptance criteria:**
  - [ ] Same set → same string; defaults never written; unknown ids ignored.

  **Verification:**
  - [ ] `npx vitest run src/utils/worldLink.test.ts src/utils/sessionShareUtils.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 23.

  **Files:** `src/utils/worldLink.ts`, `src/utils/worldLink.test.ts`, `src/utils/sessionShareUtils.ts`,
  `src/utils/sessionShareUtils.test.ts`

  **Estimated scope:** S

- [ ] **Task 25: `worldTransition.ts` — the `loadingOnly` retransmit**

  **Description:** `RetransmitInput` gains `theme?` and `aspects?`; `resolveRetransmitAction` adds `loadingOnly` (and
  the existing modes carry the loading fields when present). `loadingOnly`: `setLoading(identity)` in the store and the
  context, `regenerateGlobalAudioFromSeed` / `regenerateLfoBankFromSeed` / `regenerateGlobalLfoLinksFromSeed` /
  `regenerateBpmFromSeed` for the current Attenuation Style, then the `coordsOnly` remove-before-init rebuild at the same
  coordinates; `noteWorldReplaced()` and the URL mirror fire as for any rebuild. `applySessionPayload` routes a payload
  whose theme or aspects differ from the store through it.

  **Proof:** RED test — `worldTransition.test.ts`: `retransmitWorld({ theme: 'calm' })` keeps the AS id and coordinates,
  sets the stores, calls the four regenerators, rebuilds the locale (same robot ids), marks `'cold'`; `{ aspects: {
  melody: ['hypnotic'] } }` alone does the same; no change → `noop`.

  **Acceptance criteria:**
  - [ ] A theme/aspects-only change regenerates the global half under the new bands and rebuilds the robots at the same identity.
  - [ ] Existing modes behave as before (existing cases pass).

  **Verification:**
  - [ ] `npx vitest run src/systems/worldTransition.test.ts src/utils/sessionDiff.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 23, 24.

  **Files:** `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`, `src/utils/sessionDiff.ts`

  **Estimated scope:** M

- [ ] **Task 26: `dealAspects.ts` — the round-robin deal**

  **Description:** `dealAspects(identity, companies, roster, noiseMap)` (spec assumption 21): groups = companies in spawn
  order, then each freelancer alone in roster order; per family with a non-empty list, rotate the canonical list by
  `Math.floor(getUniformSeededVal(noiseMap, 'aspects.<family>.deal', 0) * n)` and deal `i mod n`; `'theme'` deals
  nothing; returns the per-robot map. Pure; no reader yet.

  **Proof:** RED test — `src/data/bands/dealAspects.test.ts`: one pick → every robot; two picks alternate over groups in
  the stated order; `['theme','hypnotic']` leaves alternate groups absent; the rotation differs between two noise maps
  and repeats for one; three companies with no freelancers seat three picks; an empty list → an empty map.

  **Acceptance criteria:**
  - [ ] The six cases above.

  **Verification:**
  - [ ] `npx vitest run src/data/bands/dealAspects.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 19.

  **Files:** `src/data/bands/dealAspects.ts`, `src/data/bands/dealAspects.test.ts`

  **Estimated scope:** S

- [ ] **Task 27: `spawnSystem.ts` — the deal pass, live and in the baseline; `loadedUnder`**

  **Description:** `applyDealToBaselines(baselines, companies, identity, noiseMap)`: for each dealt robot, re-derive the
  family's keys from the same `noiseMap` / `dataId` / `spawnIndex` with `resolveBands(identity.theme, { [family]:
  aspect })`'s bands (the toggle fields through `seedToggleValue` with the aspect's `offShare` / span), set
  `loadedUnder[family] = aspect` on the baseline; everything else untouched. Called (a) live, after
  `spawnInitialCompanies` in `initializeLocale`, writing the live robots through `updateRobot`; (b) inside
  `generateRobotRosterBaseline`, after `generateCompanyRosterBaseline`, so `buildSessionPayload` diffs against dealt
  baselines. `Robot` (`types/Robot.ts`) gains `loadedUnder?: Partial<Record<AspectFamilyId, AspectId>>` (JSON).

  **Proof:** RED test — `spawnSystem.test.ts`: a dealt robot's four Melody fields equal a direct re-derivation under the
  aspect's bands; undealt robots and non-family fields are byte-for-byte unchanged; `loadedUnder` set for dealt robots
  only; `sessionDiff.test.ts`: `buildSessionPayload` of an untweaked world dealt `['hypnotic','mechanical']` has
  `robotOverrides` `{}`.

  **Acceptance criteria:**
  - [ ] Live roster and regenerated baseline agree for a dealt world (the `{}` diff).
  - [ ] With no picks the pass is a no-op (Classic parity tests still pass).
  - [ ] A copied-baseline robot re-derives from its own index (one case).

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 21, 25, 26.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, `src/types/Robot.ts`,
  `src/systems/worldTransition.ts`, `src/utils/sessionDiff.test.ts`

  **Estimated scope:** M

- [ ] **Task 28: `describeWorld.ts` — the theme and aspects tail**

  **Description:** `describeWorld(identity, label?)` appends ` · <Theme name>` when not Classic and ` · A + B` for the
  world's picks (the aspect names from content; `'theme'` omitted), e.g. `tr3nch-2 · (−30, −30) · Calm · Hypnotic +
  Mechanical`. Names come from `labels()` so the helper stays the one place.

  **Proof:** RED test — `describeWorld.test.ts`: Classic with no picks is unchanged; Calm alone; Calm with two picks and
  a `'theme'` member.

  **Acceptance criteria:**
  - [ ] The three shapes above.

  **Verification:**
  - [ ] `npx vitest run src/utils/describeWorld.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 9, 19.

  **Files:** `src/utils/describeWorld.ts`, `src/utils/describeWorld.test.ts`, `src/content/copy/home.ts`

  **Estimated scope:** XS

### Checkpoint C: Nothing audible changed
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Browser: a Classic world sounds and looks as it did at Checkpoint B; a saved session from before Phase 3 loads as
      Classic; a share link from before Phase 3 loads; `?theme=calm` on a URL loads a world (the columns are still empty,
      so it sounds Classic) and the readout says Calm.
- [ ] Reviewed with human before Phase 4.

---

### Phase 4: `themes-and-aspects`

- [ ] **Task 29: `RadioButton.tsx` — the `multiple` variant**

  **Description:** `RadioButtonSchema.multiple?: true`; with it, `value: string[]`, `onChange(string[])`, rendered on
  Radix `ToggleGroup type="multiple"` (`@radix-ui/react-toggle-group`, already installed) instead of `RadioGroup`; each
  option is a `CabinetBox` that pops while selected (the `Toggle`'s on look) in `cabinet` appearance and carries the muted
  selected mark in `muted`; `dividerBefore` works; the group has `role="group"`, options `aria-pressed`. The single-value
  path is untouched. `docs/COMPONENT_LIBRARY.md` documents it in Task 36.

  **Proof:** RED test — `src/components/ui/controls/RadioButton.test.tsx`: with `multiple`, clicking toggles an option in
  and out, several can be on, the selected class is on each selected option, no `radiogroup` role; without `multiple`
  the existing cases pass unmodified. **Look** — in a scratch story on a cabinet appearance, two popped options at once.

  **Acceptance criteria:**
  - [ ] The variant's behaviour above; the single-value control unchanged.
  - [ ] Controls hold their largest-content size (no reflow on toggle).

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/RadioButton.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/types/controls.ts`, `src/components/ui/controls/RadioButton.tsx`,
  `src/components/ui/controls/RadioButton.test.tsx`, `src/components/ui/controls/RadioButton.css`

  **Estimated scope:** M

- [ ] **Task 30: `OffScreen.tsx` — the Loading axis: theme row, description line, readout tail**

  **Description:** Under a `home.off.loading` heading, a muted `RadioButton` of the five themes (`home.off.theme.<id>`),
  one muted line under it with `home.off.themeDescription.<picked>`; the readout uses `describeWorld`'s tail. A theme
  pick calls `retransmitWorld({ theme })`, sets the Transmission pick to `current`; picking a save or preset sets the
  theme row from the payload. Desktop: two columns (Transmission left, Loading right, the readout spanning); phone: one.

  **Proof:** RED test — `OffScreen.test.tsx`: the five options render with Classic selected for a Classic world; a pick
  calls `retransmitWorld` with the theme and resets the world pick to `current`; a save pick with `theme: 'calm'` selects
  Calm; the description line shows the picked theme's sentence; the readout carries the tail. **Look** — the two-column
  layout at 1600 × 900 and the one-column scroll at 375 × 812.

  **Acceptance criteria:**
  - [ ] Theme row, description line and readout as specified; the drop-to-Current rule.
  - [ ] Content keys for the five names and five descriptions exist (stand-in sentences marked for Crawford).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/content/content.test.ts` passes.
  - [ ] The Look above, recorded in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 25, 28.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.css`,
  `src/components/panels/screen/screens/OffScreen.test.tsx`, `src/content/copy/home.ts`

  **Estimated scope:** M

- [ ] **Task 31: `OffScreen.tsx` — the Melody row (multi-select), the set semantics, Roll keeps the loading**

  **Description:** A muted `multiple` `RadioButton` labelled `home.off.aspect.melody` with "as theme" (`'theme'`) and the
  three options; a change calls `retransmitWorld({ aspects: { melody: canonicalPicks(...) } })` and resets the world pick
  to `current`; a save / preset pick sets the row from the payload; the description line under the row shows the last
  toggled-on aspect's sentence (`home.off.aspectDescription.melody.<id>`); the readout tail joins the picks. Roll
  (`rollWorld`) leaves the loading store alone — criterion added here.

  **Proof:** RED test — `OffScreen.test.tsx`: toggling two aspects calls `retransmitWorld` with both in canonical order;
  "as theme" alongside one aspect sends both; clearing sends an empty list; a save with a set selects it; Roll after a set
  keeps the store's value (`worldTransition.test.ts`).

  **Acceptance criteria:**
  - [ ] Set semantics end to end; Roll keeps theme + aspects.
  - [ ] Content keys for the three names, three descriptions and the "as theme" label exist.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/systems/worldTransition.test.ts src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 29, 30.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.test.tsx`,
  `src/content/copy/home.ts`, `src/systems/worldTransition.ts`

  **Estimated scope:** M

- [ ] **Task 32: `CompanyScreen.tsx`, `RobotScreen.tsx` — the "loaded under" line**

  **Description:** One more `robot-screen__well` in the company column (`CompanyScreen.tsx:110–118`) and in the robot
  avatar column's meta (`RobotScreen.tsx:452`): a `DualLabel` (`company.loadedUnder` / `probe.loadedUnder`) over the
  aspect's name; a member shows its company's (all members share it), a freelancer its own; rendered only when
  `loadedUnder` has an entry; the All Probes form shows nothing.

  **Proof:** RED test — `CompanyScreen.test.tsx`, `RobotScreen.test.tsx`: the line shows the dealt aspect's name for a
  company whose members carry it and for a freelancer; absent for an as-theme robot and for All Probes.

  **Acceptance criteria:**
  - [ ] The four cases above; the line is text, not a control.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/CompanyScreen.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 27.

  **Files:** `src/components/panels/screen/screens/CompanyScreen.tsx`, `src/components/panels/screen/screens/RobotScreen.tsx`,
  their `*.test.tsx`, `src/content/copy/company.ts`, `src/content/copy/probe.ts`

  **Estimated scope:** M

- [ ] **Task 33: `SectorSettingsDrawer.tsx` — the status line through `describeWorld`**

  **Description:** The status line (`:84`) becomes `describeWorld(identity)`, so it names the theme and picks.

  **Proof:** RED test — `SectorSettingsDrawer.test.tsx`: for a Calm world with one pick the line carries ` · Calm ·
  Hypnotic`; for Classic it is `AS · (x, y)` as today.

  **Acceptance criteria:**
  - [ ] One helper, three readers (off screen, readout, Foundry) agree byte-for-byte.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SectorSettingsDrawer.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 28.

  **Files:** `src/components/panels/screen/console/SectorSettingsDrawer.tsx`,
  `src/components/panels/screen/console/SectorSettingsDrawer.test.tsx`

  **Estimated scope:** XS

- [ ] **Task 34: `themes.ts`, `aspects.ts` — placeholder columns on the v1 key list**

  **Description:** Fill the four non-Classic theme columns and the three Melody options with the spec's assumption 16
  placeholders, touching only the v1 keys (`bpm`, `robot.rhythmicDensity`, `robot.rests`, `robot.attack`,
  `robot.release`, the shaped pair, `reverbSend`, `delaySend`, `filterLPF.frequency`; Melody: its four keys). Values
  are to be replaced at Task 35.

  **Proof:** RED test — `resolveBands.test.ts`: each non-Classic theme differs from Classic on a subset of the v1 key
  list and nowhere else; each Melody option differs on a subset of the family's keys; Hypnotic's `noteVariance` value
  band is within 1–2 and Mechanical's density min ≥ 70 (the spec's stated intent, so a wrong-way edit fails).

  **Acceptance criteria:**
  - [ ] Columns touch only permitted keys; the two intent checks hold.

  **Verification:**
  - [ ] `npx vitest run src/data/bands/resolveBands.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 19.

  **Files:** `src/data/bands/themes.ts`, `src/data/bands/aspects.ts`, `src/data/bands/resolveBands.test.ts`

  **Estimated scope:** S

- [ ] **Task 35: The listen — real numbers in the columns and the grids**

  **Description:** On one seed, Crawford listens to the five themes and the three aspects (each aspect alone against
  Classic and against one theme) and adjusts the placeholder bands until each is audibly itself; the agreed numbers go
  into `themes.ts` / `aspects.ts`, and `docs/reference/GLOBAL_CHAIN_GRID.md` and `ROBOT_DATA_GRID.md` gain a Loading
  Range column per theme and a note per aspect. Task 34's tests keep the columns on the v1 keys; the key list may widen
  only by Crawford's say-so (ask-first).

  **Proof:** Listen — five themes audibly distinct on the same AS + coords; Hypnotic, Mechanical and Wandering each
  recognisable on a company. Numbers recorded under Checkpoint D.

  **Acceptance criteria:**
  - [ ] Crawford's sign-off per theme and per aspect recorded here with the final bands.
  - [ ] Grids and tables agree (the grid is the source of truth).

  **Verification:**
  - [ ] `npx vitest run src/data/bands` passes with the final numbers.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 31, 34.

  **Files:** `src/data/bands/themes.ts`, `src/data/bands/aspects.ts`, `docs/reference/GLOBAL_CHAIN_GRID.md`,
  `docs/reference/ROBOT_DATA_GRID.md`

  **Estimated scope:** S (data + docs; the time is listening)

### Checkpoint D: The listen
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Browser: the Loading axis on desktop and phone; a theme pick re-rolls the same world audibly differently; two
      Melody picks show up as different companies (the company detail's line says which); a save made under Calm +
      Hypnotic reloads with the rows set; its share link carries `theme=calm&melody=hypnotic`.
- [ ] `npm run perf:audio` Pixel A/B on a Perilous world (the densest column) against `main`.
- [ ] Reviewed with human before docs.

---

### Phase 5: Docs

- [ ] **Task 36: `COMPONENT_LIBRARY.md`, `ANIMATION_SYSTEM.md`, `AUDIO_SYSTEM.md`, `ROBOT_LIFECYCLE.md` — pause and the variant**

  **Description:** The `multiple` variant (shape, a11y, the two appearances); the timeline scope and the rule that every
  world mover passes `'world'`; `AudioEngine.pause()/resume()` as context suspend/resume and `powerController`'s three
  states; the lifecycle's "pause freezes measures, the day runs" paragraph. Spot-check every name against shipped code.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every documented identifier exists in the final source with the documented behaviour.

  **Verification:**
  - [ ] Manual review; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1–8, 29.

  **Files:** `docs/COMPONENT_LIBRARY.md`, `docs/ANIMATION_SYSTEM.md`, `docs/AUDIO_SYSTEM.md`, `docs/ROBOT_LIFECYCLE.md`

  **Estimated scope:** S (docs only)

- [ ] **Task 37: `UI_SHELL.md`, `SESSION_STORAGE.md`, `MELODY_SYSTEM.md`, `COMPANIES.md` — the off screen, the identity, the deal**

  **Description:** The off screen's two axes, the gate, Keep, the veil and theatre; payload v3 and the `theme` /
  `melody` link params, the address-bar mirror; the band table and the resolver (where the bands live now, how a theme
  reaches a draw); the deal (groups, rotation, re-derivation, `loadedUnder`) in `COMPANIES.md`. Spot-check names.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] As Task 36.

  **Verification:**
  - [ ] Manual review; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 9–35.

  **Files:** `docs/UI_SHELL.md`, `docs/SESSION_STORAGE.md`, `docs/MELODY_SYSTEM.md`, `docs/COMPANIES.md`

  **Estimated scope:** S (docs only)

- [ ] **Task 38: `roadmap.md` 57, backlog 5 archived, plan.md Stage 1, the headers**

  **Description:** Roadmap entry 57 (About / Decisions / Not Doing) written from the spec's assumptions and the
  checkpoint records; backlog 5 moved to `backlog-archive.md` with its links rebased (todo-archive conventions);
  plan.md's Stage 1 line marked done; `docs/sketches/off-screen.html`'s header marked BUILT (the sketch becomes the
  record); `docs/ideas/themes.md`'s status marked built, pointing here; the intent and spec headers get their "built"
  line.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Roadmap 57 exists; backlog 5 is in the archive and gone from the live list; every moved link resolves.

  **Verification:**
  - [ ] Manual review; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 36, 37.

  **Files:** `docs/todo/roadmap.md`, `docs/todo/backlog.md`, `docs/todo/archive/backlog-archive.md`, `docs/todo/plan.md`,
  `docs/sketches/off-screen.html`, `docs/ideas/themes.md`, `docs/intent/off-screen.md`, `docs/specs/OFF_SCREEN.md`

  **Estimated scope:** S (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across all tasks are met.
- [ ] Docs reflect the shipped API — every documented name spot-checked against source.
- [ ] The Checkpoint 0, A, B, C, D records are filled in (browser, hash, figures, sign-offs).
- [ ] Any outstanding manual check explicitly flagged here if not performed — never silently skipped.
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Tone 15 mis-resumes after a context suspend (double tick, dropped `16n` repeat, dead swell) | High | Task 0 spike before any pause code; the fallback (transport pause + voice release) is written into assumption 2 and Task 1 |
| A phone drops the audio context on a long suspend | Medium | Checkpoint A on the Pixel (30 s and a 10-minute pause); if `resume()` rejects, `powerOnSequence` falls back to the `start` path (one branch, Task 6) |
| A world mover registered without `'world'` keeps moving through a pause | Medium | Tasks 3a/3b assert every known site; `docs/ANIMATION_SYSTEM.md` (Task 36) states the rule; the `timelineMap` test pins the mechanism |
| The work loop's absolute `readyAt` stamps expire during a pause, so every robot leaves its site on resume | Medium | Task 4's shifted clock, pinned by the cooldown-across-pause test |
| The Classic lift changes a seeded value by a transcription slip | High | Task 18's literal parity table plus Tasks 21–22's existing deterministic-generation tests, which must pass unmodified |
| The deal re-derivation and the live spawn disagree, so an untweaked dealt world reads as overrides | High | One pure pass used by both paths (Task 27); the `{}`-diff test in `sessionDiff.test.ts` |
| A theme-only change leaves the global half on the old bands (AS-sync does not fire for an unchanged id) | High | Task 25's `loadingOnly` mode calls the four regenerators explicitly; its test asserts the calls |
| `mirrorWorldToUrl` rewrites a link arrival's URL and loses the friend's blob | Medium | Task 15: the boot path mirrors only when `consumeSessionSharePayload()` is `null`; a test for each branch |
| Keep's dirty test reads dirty on an untouched world because of float noise | Low | Both sides pass through `sessionDiff`'s normalisation (Task 14); a test keeps an untouched reload clean |
| The veil's `backdrop-filter` raises idle paint on the Pixel | Low | Checkpoint B's `perf:idle` against Checkpoint A; the world is a still frame while off, so it rasters once |
| The v1 key list is too narrow for five audibly different themes | Medium | Task 35 is a listen with Crawford; widening is ask-first and lands as a Task 34 test change |

## Open Questions

1. **Spec §7.1 — suspend vs transport pause.** **Open until Task 0**; the plan builds the context path and names the
   fallback in Task 1.
2. **Spec §7.2 — resume on phones after a long suspend.** **Open until Checkpoint A** (Pixel, 30 s and 10 min).
3. **Spec §7.10 — does the off screen pop?** **Resolved** (Crawford, 2026-10-30, "your recs are fine"): the off screen
   stays `muted`; Tasks 30–31 render `muted`. One attribute per row to flip if he changes his mind.
4. **Spec §7.11 — re-derivation per key.** **Resolved** (Architecture Decisions): Task 27 re-derives each Melody key by
   its own recipe (plain draw or `seedToggleValue`); a copied-baseline robot uses its own index.
5. **Spec §7.12 — reshuffling on a pick change.** **Accepted**; noted for the Guide's description.
6. **The three real preset links.** **Open — Crawford**: Task 11 ships the placeholders' bare triples; paste the three
   links any time after Task 11 (one-line edits, no task).
7. **The copy.** **Open — Crawford**: theme and aspect descriptions, the footer legalese, the Factory Reset wording, the
   "loaded under" labels ship as stand-ins marked in `src/content/`; his pass can land in any later commit.
