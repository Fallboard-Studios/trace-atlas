# Implementation Plan: Monitor Mode Made Trustworthy

Source spec: [docs/specs/MONITOR_MODE_TRUSTWORTHY.md](../specs/MONITOR_MODE_TRUSTWORTHY.md). Source intent:
[docs/intent/monitor-mode-trustworthy.md](../intent/monitor-mode-trustworthy.md). Backlog slot: 81, written by Task 0
(spec §7.2 Q1; default Stage 3, one entry for both parts).

**Status:** plan written 2026-11-11 from the spec, before Crawford's answers to §7.2 Q1–Q2. Phases 0–2 built
2026-11-11 (Tasks 0–11). Both gates passed 2026-11-11 (Crawford: "all looks and sounds fine"), every §7.1 default and
§7.2 Q2 kept as built. Task 12 (docs) done 2026-11-11. Next: Checkpoint Complete, then Crawford's PR.

## Overview

Part A makes Highlight a bus-gain dip the engine applies from a live set the Audio Load budget pushes, deletes the
velocity halving, and ranks Highlight between Solo and Auto for admission. Part B shows each robot's own mode on the
robot screen, the phone band and the roster tile as a small light plus the Monitor Mode word, lit while the robot
sounds, and gives the desk tile two status lines. Fourteen tasks in four phases:

1. **The sound** (Tasks 1–4): the rank in `audioBudget.ts`, the dip in `AudioEngine.ts`, the velocity block deleted,
   the live set pushed by `audioBudgetSystem.ts`. Then the ear gate.
2. **The display** (Tasks 5–11): `isRobotEmitting`, the two light colours, `useRobotMeta`'s mode and `lit`, the old
   three-word vocabulary deleted, `ModeLight`, the tile, the robot screen, the desk's two lines. Then the eye gate.
3. **Docs** (Task 12).
4. **The records** (Task 13), after the merge. Task 0, the backlog entry and plan line, comes first.

## Architecture Decisions

- **Resolves spec §7.2 Q1 by default:** one backlog entry, 81, in plan.md Stage 3 (audio refinement), named for both
  parts. Crawford moves it if he prefers Stage 5.
- **Resolves spec §7.2 Q2 by default:** the lit/dim rule wins. A user-muted robot's light is red and dim, since bright
  means "you can hear it" everywhere else. The eye gate (Checkpoint B) re-pins it.
- **The engine never reads the store for the dip** (spec §3 Always). `setHighlightedRobots` ramps every reserved voice
  from a `masterVolume` the `VoiceEntry` already remembers: `reserveVoice` records it at build and
  `updateRobotMasterVolume` updates it. One field on `VoiceEntry` (`src/engine/audioEngine/voiceEntry.ts`), no store
  lookup, and the ramp target is the same `busGainTarget` every other write uses.
- **`reconcileSounding` takes a fourth array** (`highlightIds`, spec §7.1 A5) and derives a rank per id inside; the
  eviction helper stays `lastIndexWhere` with a predicate per rank. The existing solo tests pass unchanged, which is
  Task 1's parity criterion.
- **The live set is the budget system's** (spec §7.1 A4): `reconcile` computes `next ∩ highlighted` and pushes it
  before `applySet`, keyed like `applyStandingBy` so a repeat is a no-op. The signature already carries `audioMode`
  and docking, so there is no new subscription.
- **`isRobotEmitting` replaces `getAudibilityState`** rather than living beside it: the Deck's count and the light's
  `lit` are the same boolean, and the three-state type has no consumer once the words go. Task 5 adds it and moves
  `MetaBox`; Task 7b deletes the old one when its last consumer (`useRobotMeta`) has moved.
- **Templates move with their consumers.** The tile's template reorders in Task 9 and the band's in Task 10, because a
  template's proof is the test that renders it; the content file is touched twice, once per consumer, and never with a
  template nobody renders yet.
- **The light is a local component** (spec §7.1 B2) with `data-mode` and `data-lit` attributes, so the tests of its
  consumers assert the mode and the lit state without reading CSS. Its colours come from `getStatusLightColor`, which
  gains `'yellow'` (`wire`) and `'blue'` (`glass`) in Task 6 (spec §7.1 B1).
- **The desk tile reserves two lines** (spec §7.1 B4) in CSS alone, a Look task: the test environment loads no
  stylesheet.

## Dependency Graph

```
Task 0 (records)      Task 1 (rank)     Task 2 (dip in engine)      Task 5 (isRobotEmitting)   Task 6 (two colours)
                             │               │          │                    │                       │
                             │               │     Task 3 (velocity          │                       │
                             │               │       block deleted)     Task 7a (useRobotMeta:       │
                             └───────┬───────┘                            word, mode, lit)      Task 8 (ModeLight)
                                     │                                       │      │                │
                          Task 4 (budget pushes                       Task 7b │      └───────┬────────┘
                             the live set)                        (old words  │              │
                                     │                              deleted)  │     Task 9 (tile)   Task 10 (robot screen)
                          Checkpoint A: ear gate                              │              │
                                                                              │     Task 11 (desk two lines)
                                                                              │              │
                                                                     Checkpoint B: eye gate
                                                                              │
                                                                     Task 12 (docs) → Task 13 (records, after merge)
```

Tasks 1, 2, 5 and 6 are independent and may run in parallel; Part B does not depend on Part A.

## Task List

Every task names its **Proof**: **RED test** for a behaviour change (a test that imports or renders the code and
fails first); **Look** for a CSS-only task; **Read** for a docs, copy or deletion task (CLAUDE.md, "Tests exercise
code, not text").

### Phase 0: The records

- [x] **Task 0: `docs/todo/backlog.md`, `docs/todo/plan.md` — entry 81 and its Stage 3 line**

  **Description:** Add backlog entry `### 81. Monitor Mode Made Trustworthy — Highlight you can hear, from a robot
  that is playing, and the mode on every card`, in the house shape (raised 2026-11-11, the four findings kept, the two
  called features, links to the intent, spec and this plan). Add the one-sentence line to plan.md Stage 3 under 80.
  If Crawford answers §7.2 Q1 with Stage 5, the line goes there instead.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] Entry 81 exists, links the three docs, and names what is out of scope (spec §1.8).
  - [x] plan.md carries one line for 81 in the agreed stage, with its anchor link.

  **Verification:**
  - [x] `npm run lint` clean (docs-only change).

  **Dependencies:** None.

  **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`

  **Estimated scope:** XS (two docs)

---

### Phase 1: The sound (Part A)

- [x] **Task 1: `audioBudget.ts` — `reconcileSounding` ranks Solo, Highlight, Auto**

  **Description:** `reconcileSounding(previous, eligible, soloIds, highlightIds, maxAudibleRobots)` implements spec
  §1.4's five steps: keep, evict on a fallen cap (newest Auto, then newest Highlight, then newest Solo), admit Solos
  (evicting newest Auto, else newest Highlight, else wait), admit Highlights (evicting newest Auto only, else wait),
  fill. A `rank(id)` helper and `lastIndexWhere` with a predicate per rank; the doc comment restates the steps.
  `audioBudgetSystem.ts` passes `[]` for now so it compiles (Task 4 passes the real list).

  **Proof:** RED test — `src/utils/audioBudget.test.ts`: a Highlight evicts the newest Auto when the cap is full; it
  waits when every slot holds a Solo or a Highlight; a Solo evicts the newest Highlight when no Auto is in; a fallen
  cap evicts Auto, then Highlight, then Solo.

  **Acceptance criteria:**
  - [x] A Highlight with a free slot is admitted in arrival order; with none it evicts the newest Auto, never a Solo
        or another Highlight, and waits if only those are in.
  - [x] A Solo evicts the newest Auto first and the newest Highlight when no Auto is in; it waits only when every
        slot holds a Solo.
  - [x] A cap that fell evicts newest Auto, then newest Highlight, then newest Solo; an un-highlighted robot keeps its
        slot; `previous` is returned by reference when nothing changed.
  - [x] Every existing `reconcileSounding` test passes unmodified apart from the added `[]` argument (behaviour parity
        with no Highlights).

  **Verification:**
  - [x] `npx vitest run src/utils/audioBudget.test.ts src/systems/audioBudgetSystem.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/audioBudget.ts`, `src/utils/audioBudget.test.ts`, `src/systems/audioBudgetSystem.ts` (the
  `[]` argument only)

  **Estimated scope:** S (one algorithm and its tests; one call site)

- [x] **Task 2: `AudioEngine.ts`, `headroom.ts`, `voiceEntry.ts` — the dip is one bus-gain target**

  **Description:** `HIGHLIGHT_DIP_DB = -10` and `HIGHLIGHT_DIP_GAIN` beside `HEADROOM_TRIM_GAIN` in `headroom.ts`;
  `HIGHLIGHT_RAMP_SECONDS = 0.15` beside `VOLUME_RAMP_SECONDS`. In the engine: module state `highlightedLive`,
  `busGainTarget(robotId, masterVolume)` (spec §4), and `setHighlightedRobots(ids)` on the public object, which ramps
  every reserved voice's `busGain` to its new target over `HIGHLIGHT_RAMP_SECONDS` and is a no-op for the same set.
  `VoiceEntry` gains `masterVolume`, written by `reserveVoice` and `updateRobotMasterVolume`. `reserveVoice`'s initial
  bus gain, `reReserveVoice` (through `reserveVoice`) and `updateRobotMasterVolume` all use `busGainTarget`. `killAll`
  leaves the set alone.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: with `setHighlightedRobots(['h'])`, `updateRobotMasterVolume`
  on another robot lands at `robotBusGain(v) * HIGHLIGHT_DIP_GAIN` and on `'h'` at `robotBusGain(v)`; a voice reserved
  while the set is live is built at the dipped gain; the empty set ramps every voice back.

  **Acceptance criteria:**
  - [x] While the live set is non-empty, every voice not in it has bus gain `robotBusGain(volume) * HIGHLIGHT_DIP_GAIN`
        at build, on a Volume edit and on the set change; a voice in it has `robotBusGain(volume)`.
  - [x] `setHighlightedRobots` ramps through `rampOrSet` over `HIGHLIGHT_RAMP_SECONDS` (the `rampTo` spy receives the
        duration); the same set again calls nothing; the empty set restores every voice.
  - [x] The existing `updateRobotMasterVolume` and `reserveVoice` bus-gain tests pass unmodified (no live set = today's
        gains).

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/audioEngine/headroom.ts`, `src/engine/audioEngine/voiceEntry.ts`,
  `src/engine/AudioEngine.test.ts`

  **Estimated scope:** M (three source files, one test file; new module state and one new public call)

- [x] **Task 3: `AudioEngine.ts` — the velocity halving goes**

  **Description:** Delete the `anyHighlight` block in `scheduleNote` (the `isDockMuted` import stays for
  `triggerWithCap`). Velocity is the Dynamics roll's and the accents' alone. The two existing Highlight velocity tests
  (`applies ~50% attenuation…`, `a highlighted robot in the station attenuates nobody…`) are rewritten to assert the
  new contract, not deleted.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: `scheduleNote` passes the same velocity to the synth for a
  non-highlighted robot whether or not a highlighted robot is out of its station.

  **Acceptance criteria:**
  - [x] A highlighted robot in the roster, docked or active, changes no other robot's note velocity.
  - [x] Every other `audioMode enforcement` test (mute, solo, the dock) passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2 (so the dip exists before the halving goes; the suite is green either way).

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** XS (one block deleted, two tests rewritten)

- [x] **Task 4: `audioBudgetSystem.ts` — the live Highlight set is pushed before the sounding set**

  **Description:** `reconcile` builds `highlightIds` (eligible robots with `audioMode === 'highlight'`), passes it to
  `reconcileSounding`, and derives the live set `next.filter(highlighted)`. A `pushedHighlighted` key beside
  `pushedStandingBy`; `applyHighlighted(next, force)` calls `AudioEngine.setHighlightedRobots` only on a change, and is
  called **before** `applySet` (spec §1.3). `stopAudioBudget` pushes the empty set and clears the key;
  `startAudioBudget`'s forced reconcile re-pushes.

  **Proof:** RED test — `src/systems/audioBudgetSystem.test.ts`: a highlighted active robot is pushed to
  `setHighlightedRobots`; one docked, under a Solo, or standing by on a Light tier is not; the push precedes
  `setSoundingRobots` on the same reconcile (spy call order); `stopAudioBudget` pushes `[]`.

  **Acceptance criteria:**
  - [x] The live set is exactly the highlighted robots in the sounding set: a docked, solo-silenced or standing-by
        Highlight is absent.
  - [x] On a Light tier (`robotLoad` at the floor) a Highlight on a standing-by robot admits it, pushes it, and the
        newest Auto robot stands by in its place.
  - [x] `setHighlightedRobots` is called before `setSoundingRobots` within one reconcile, not called for an unchanged
        set, and called with `[]` by `stopAudioBudget`.
  - [x] Every existing budget-system test passes unmodified, but one: `treats an unset audioMode as audible and
        highlight as audible, muted as not` now expects `[b, a, d]`, not `[a, b, d]`; the Highlight is admitted ahead
        of the Autos, as a Solo is (spec §1.4 step 4). Nothing reads the sounding set's order (membership only).

  **Verification:**
  - [x] `npx vitest run src/systems/audioBudgetSystem.test.ts src/utils/audioBudget.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2.

  **Files:** `src/systems/audioBudgetSystem.ts`, `src/systems/audioBudgetSystem.test.ts`

  **Estimated scope:** S (one system file and its test)

### Checkpoint A: the sound (stop — Crawford's ear, spec §5.4)
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean; `npm run build` clean.
- [x] Run 1 (spec §5.3, desk, headphones, Full tier): Highlight one robot, the others drop and it stands clear; back to
      Auto, the drop releases without a step; Highlight a docked robot, nothing changes; Solo one and Highlight
      another, nothing changes until the Solo lifts.
- [x] Run 2 (`?load=` at the floor): Highlight a standing-by robot; it is admitted and the newest Auto stands by.
- [x] Crawford names the dip (A1, −10 dB) and the ramp (A2, 150 ms), or re-pins them; a re-pin is one constant each
      and no new task. **Kept:** −10 dB and 150 ms, as built.
- [x] Reviewed with Crawford (2026-11-11, with Checkpoint B: "all looks and sounds fine"; Phase 2 was built before
      this gate, at his request).

---

### Phase 2: The display (Part B)

- [x] **Task 5: `robotAudibility.ts`, `MetaBox.tsx` — `isRobotEmitting`**

  **Description:** Add `isRobotEmitting(audioMode, anySolo, docking, isSounding): boolean` = `isRobotAudible(...) &&
  isSounding`. `MetaBox.tsx`'s `useEmittingCount` counts with it instead of `getAudibilityState(...) === 'emitting'`.
  `getAudibilityState` stays until Task 7b.

  **Proof:** RED test — `src/utils/robotAudibility.test.ts`: `isRobotEmitting` is true only for an audible, sounding
  robot (muted, solo-silenced, docked-not-soloed and standing-by robots are false; a soloed robot in its station that
  is sounding is true).

  **Acceptance criteria:**
  - [x] `isRobotEmitting` agrees with `getAudibilityState(...) === 'emitting'` on every case the old tests cover.
  - [x] `MetaBox.test.tsx` passes unmodified (the Deck's count is unchanged).

  **Verification:**
  - [x] `npx vitest run src/utils/robotAudibility.test.ts src/components/panels/screen/worldView/MetaBox.test.tsx`
        passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/robotAudibility.ts`, `src/utils/robotAudibility.test.ts`,
  `src/components/panels/screen/worldView/MetaBox.tsx`

  **Estimated scope:** XS (one helper, one consumer)

- [x] **Task 6: `statusLightColors.ts` — yellow and blue**

  **Description:** `StatusLightState` gains `'yellow'` (`colorTheme.wire.base`) and `'blue'` (`colorTheme.glass.base`),
  spec §7.1 B1; the existing four are untouched, so the rocker's light does not move.

  **Proof:** RED test — `src/utils/statusLightColors.test.ts`: `getStatusLightColor('yellow')` and `('blue')` return
  the `hslToString` of those families, with the glow at the given alpha.

  **Acceptance criteria:**
  - [x] The two new states resolve from `colorTheme.json`, never a literal.
  - [x] The four existing states return exactly what they did (existing tests unmodified).

  **Verification:**
  - [x] `npx vitest run src/utils/statusLightColors.test.ts src/components/ui/physical` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/statusLightColors.ts`, `src/utils/statusLightColors.test.ts`

  **Estimated scope:** XS

- [x] **Task 7a: `useRobotMeta.ts`, `robotSelectionConfig.ts` — the status is the mode word, plus `mode` and `lit`**

  **Description:** `MODE_LABELS: Record<NonNullable<Robot['audioMode']>, ValueLabel> =
  optionsRecord('probe.monitorMode')` beside `AUDIBILITY_LABELS` (deleted in 7b). `useRobotMeta` returns a `RobotMeta`
  (spec §4): `status` is `MODE_LABELS[mode].humanLabel`, plus `mode` (`robot.audioMode ?? 'none'`) and `lit`
  (`isRobotEmitting(...)` from the same two boolean selectors it has today). The consumers' tests that asserted
  Emitting / Standing by / Disabled are rewritten to the word (the light's tests come in Tasks 9 and 10).

  **Proof:** RED test — `src/components/panels/screen/screens/RobotScreen.test.tsx` and `RosterTile.test.tsx`: the
  status value reads `Auto` for an Auto robot and `Mute` for a muted one; a robot silenced by another's Solo still
  reads `Auto`; a standing-by robot reads its mode word, not "Standing by".

  **Acceptance criteria:**
  - [x] `status` is the robot's own mode word in every state; the three old words appear nowhere on screen.
  - [x] `mode` and `lit` are returned; `lit` is true only for an audible, sounding robot.
  - [x] `robotSelectionConfig.test.ts` covers `MODE_LABELS` (the four options, human and lore).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx
        src/components/panels/screen/screens/RosterTile.test.tsx src/components/panels/screen/screens/RosterBoard.test.tsx
        src/data/robotSelectionConfig.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/components/panels/screen/screens/useRobotMeta.ts`, `src/data/robotSelectionConfig.ts`,
  `src/data/robotSelectionConfig.test.ts`, `src/components/panels/screen/screens/RobotScreen.test.tsx`,
  `src/components/panels/screen/screens/RosterTile.test.tsx`

  **Estimated scope:** M (two source files, three test files rewritten)

  **As built:** `fill` takes string vars only, so `RobotMeta`'s boolean `lit` could not be spread into the two
  status-line templates: a `metaWords(meta)` helper in `useRobotMeta.ts` picks the four words, and `RosterTile.tsx` and
  `RobotScreen.tsx` call it (one line each). `mode` and `lit` get their own RED test, `useRobotMeta.test.ts` (new),
  since the tile and screen tests reach them only in Tasks 9 and 10.

- [x] **Task 7b: `robotAudibility.ts`, `robotSelectionConfig.ts`, `probe.ts` — the old vocabulary goes**

  **Description:** Delete `getAudibilityState`, `AudibilityState`, `AUDIBILITY_LABELS` and their tests, and the
  `options` block of `probe.status` (the entry keeps its label). `content.test.ts` stays green: `probe.status` is still
  referenced by the field's `DualLabel` schema.

  **Proof:** Read — a deletion; `npm run build:types` proves nothing imports what went.

  **Acceptance criteria:**
  - [x] No export, type or content option of the three-state vocabulary remains; types, lint and the full suite are
        green.

  **Verification:**
  - [x] `npm run build:types`, `npm run lint`, `npm test` clean.

  **Dependencies:** Task 7a.

  **Files:** `src/utils/robotAudibility.ts`, `src/utils/robotAudibility.test.ts`, `src/data/robotSelectionConfig.ts`,
  `src/data/robotSelectionConfig.test.ts`, `src/content/copy/probe.ts`

  **Estimated scope:** S (deletions in five files)

- [x] **Task 8: `ModeLight.tsx`, `ModeLight.css` — the small light**

  **Description:** A stateless `ModeLight({ mode, lit })` in `src/components/panels/screen/screens/`: one inline
  `span`, `aria-hidden`, `data-mode` and `data-lit`, its `--mode-light-color` and `--mode-light-glow` set inline from
  `getStatusLightColor` (none → green, solo → yellow, mute → red, highlight → blue). CSS: an em-sized disc; lit shows
  the colour with the rocker light's glow idiom; dim shows the colour at low alpha with no glow (spec §7.1 B3).

  **Proof:** RED test — `src/components/panels/screen/screens/ModeLight.test.tsx`: renders with the right `data-mode`
  and `data-lit`, is hidden from the accessibility tree, and its inline colour is `getStatusLightColor(...).color` for
  each of the four modes.

  **Acceptance criteria:**
  - [x] The four modes map to the four colours through `getStatusLightColor`; no literal colour in the component.
  - [x] `lit` toggles `data-lit` and nothing else in the markup.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/ModeLight.test.tsx` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/components/panels/screen/screens/ModeLight.tsx`, `src/components/panels/screen/screens/ModeLight.css`,
  `src/components/panels/screen/screens/ModeLight.test.tsx`

  **Estimated scope:** S (one new component, its stylesheet and test)

- [x] **Task 9: `RosterTile.tsx`, `probe.ts` — the light leads the line, the mode first**

  **Description:** `probe.roster.statusLine` becomes `{status} · {job} · {dockingState} · {activity}`. The tile
  renders `<ModeLight mode lit />` inside `.roster-tile__status` before the filled text. `RosterBoard.test.tsx`'s
  status assertions follow.

  **Proof:** RED test — `src/components/panels/screen/screens/RosterTile.test.tsx`: the status text begins with the
  mode word; the light inside the line carries `data-mode` and `data-lit`, lit for a sounding robot and dim for one in
  its station, under a Solo, standing by, or muted.

  **Acceptance criteria:**
  - [x] The line reads `<mode> · <job> · <docking> · <activity>` for every robot; an unassigned robot's job word is now
        second, not first.
  - [x] The light's `data-mode` is the robot's own mode in every case; `data-lit` follows `isRobotEmitting`.
  - [x] `aria-describedby` still points at the status span, whose text is the line without the light.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/RosterTile.test.tsx
        src/components/panels/screen/screens/RosterBoard.test.tsx src/content/content.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 7a, 8.

  **Files:** `src/components/panels/screen/screens/RosterTile.tsx`, `src/content/copy/probe.ts`,
  `src/components/panels/screen/screens/RosterTile.test.tsx`, `src/components/panels/screen/screens/RosterBoard.test.tsx`

  **Estimated scope:** S

  **As built:** `RosterBoard.test.tsx` asserts no status text, so it needed no change; `content.test.ts`'s tile-line case
  pinned the old order and moved with the template.

- [x] **Task 10: `RobotScreen.tsx`, `RobotScreen.css`, `probe.ts` — the Status well first, the light inline**

  **Description:** `META_FIELDS` reorders to status, job, docking, activity. The Status well's value renders
  `<ModeLight />` before the word (a small inline gap in `RobotScreen.css`). `probe.band.statusLine` becomes
  `{status} · {job} · {dockingState} · {activity} · {battery}`, and the band renders the light before its line.

  **Proof:** RED test — `src/components/panels/screen/screens/RobotScreen.test.tsx`: `metaValues(container)` reads
  `['Auto', 'Acoustic Survey', 'Active', 'Working']`; the first well holds a `ModeLight` with the robot's mode and lit
  state; the phone band's line begins with the mode word and carries the light.

  **Acceptance criteria:**
  - [x] The Status well is first on the desk; its light and word agree with `useRobotMeta`.
  - [x] The phone band leads with the mode, then job, docking, activity, battery, the light before the line.
  - [x] Every other `RobotScreen.test.tsx` test passes unmodified (but for the well indices the reorder shifts: job
        0 → 1, activity 2 → 3).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx src/content/content.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Look: the robot screen on the desk, the Status well first with its light; the phone band at 320 px, the mode
        leading.

  **Dependencies:** Tasks 7a, 8.

  **Files:** `src/components/panels/screen/screens/RobotScreen.tsx`, `src/components/panels/screen/screens/RobotScreen.css`,
  `src/content/copy/probe.ts`, `src/components/panels/screen/screens/RobotScreen.test.tsx`

  **Estimated scope:** S

  **As built:** the light sits inside the value span (the well's and the band line's), first, so `metaValues` and the
  line's text still read the words alone. `ModeLight.css`'s own `margin-inline-end` is the gap, so `RobotScreen.css`
  is untouched. The Look was done with Task 11's, in one browser run (see Task 11's As built). Found there, not
  changed: the phone band wraps to two lines at 320 px (it has no one-line rule; B5 assumed one), for the eye gate.

- [x] **Task 11: `RosterTile.css` — the desk tile holds two status lines (the CSS-only task)**

  **Description:** Under `.roster-tile--desk .roster-tile__status`: `white-space: normal`, a two-line clamp
  (`display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden`) and a `min-height`
  of two line-heights, so every desk tile is the same height whether its text takes one line or two (spec §1.6,
  §7.1 B4). The phone rule is untouched (one line, ellipsis).

  **Proof:** Look — the roster on the desk at 768 px and at a wide window: every tile in a row the same height; a
  long line wraps to a second line and a third is clipped; a short line leaves an empty second line; the light sits on
  the first line before the word. The phone shell at 320 px: one line, the mode word never cut.

  **Acceptance criteria:**
  - [x] Desk tiles are uniform in height with one- and two-line statuses side by side; no tile grows past two lines.
  - [x] The phone tile is unchanged.

  **Verification:**
  - [x] The Look above, in a live browser, recorded in the commit. No test file.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 9.

  **Files:** `src/components/panels/screen/screens/RosterTile.css` (no `*.test.ts`)

  **Estimated scope:** XS

  **As built:** a `line-height` of 1.3 on the desk status sets the two-line `min-height` (`calc(2em * 1.3)`), and the
  standard `line-clamp: 2` sits beside the prefixed one. The Look (headless Chrome over the dev server, 1440, 768
  and 320 px, 2026-11-11) found the lit light's glow clipped square by the status span's `overflow: hidden`: the base
  rule now gives the clip 8 px of room above and before the line (padding, with matching negative margins, so the
  text and the tile heights do not move: desk 97 px, phone 81 px, before and after). Measured: all twelve desk tiles
  97 px at both widths, the status box two 19.5 px lines, a three-line status clipped to two with its ellipsis, the
  light on the first line; the phone one 23 px line, the mode first. Not seen live: a status short enough for one
  line on the desk (at the 250 px tile every status took two), so the empty reserved second line rests on the
  `min-height` alone. Found, not this branch's: at 768 px the panel content overflows by 9 px (a 250 px tile in a
  233 px row), with or without these rules.

### Checkpoint B: the display (stop — Crawford's eye, spec §5.4)
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (2026-11-11: 13857 passed,
      2 skipped, 354 files).
- [x] Run 3 (spec §5.3): the roster on the desk and the phone, the robot screen and the band, as Tasks 10 and 11
      describe; the colours Auto green, Solo yellow, Mute red, Highlight blue; the dim level readable.
- [x] Crawford names the blue (B1, `glass`), the light's size, the dim level (B3) and the muted robot's light (Q2,
      dim); a re-pin is a CSS or colour-table edit and no new task, unless he asks for a new theme family (ask first).
      **Kept:** `glass` blue, the 0.6em light, 0.3 opacity dim, a muted robot's red dim, as built.
- [x] Reviewed with Crawford before the docs (2026-11-11), with the two findings reported (the phone band wraps to
      two lines at 320 px; the 768 px panel's 9 px overflow, not this branch's) and no change asked.

---

### Phase 3: Docs

- [x] **Task 12: `AUDIO_SYSTEM.md`, `POLYPHONY_GUIDE.md`, `ROBOT_LIFECYCLE.md`, the spec — document the shipped behaviour**

  **Description:** AUDIO_SYSTEM.md: the `audioMode` policy item (~line 575) describes the bus-gain dip, when a
  Highlight is live, and `setHighlightedRobots`; the budget paragraph (~line 233) reads "Solo, then Highlight, then
  Auto" with the eviction order. POLYPHONY_GUIDE.md line 27: `scheduleNote` applies nothing for Highlight.
  ROBOT_LIFECYCLE.md rule 6: "Off" becomes "Auto", and a Highlight counts only while heard. The spec gets its "As
  built" section with the pinned constants and the gates' answers. Spot-check every named identifier against the
  shipped source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] Every named API, constant and rule matches the shipped source; no "keep existing sound" clause anywhere.

  **Verification:**
  - [x] Manual review against the code.
  - [x] `npm run lint` clean.

  **Dependencies:** All prior tasks.

  **Files:** `docs/AUDIO_SYSTEM.md`, `docs/POLYPHONY_GUIDE.md`, `docs/ROBOT_LIFECYCLE.md`,
  `docs/specs/MONITOR_MODE_TRUSTWORTHY.md`

  **Estimated scope:** XS (docs only)

  **As built:** besides the plan's lines, the same files carried the old vocabulary in four more places, now the mode
  word and its light: AUDIO_SYSTEM.md's standing-by sentence (`getAudibilityState`), its muted-card sentence, the UI
  paragraph's "Standing by", and the Headroom trim (now `busGainTarget`, at four places); ROBOT_LIFECYCLE.md's Audibility
  section (the card line and "Standing by") and its test list's "Off". Left alone, outside this task's files:
  `docs/reference/ROBOT_DATA_GRID.md` (Emitting / Disabled, `AUDIBILITY_LABELS`) and `docs/specs/CONTENT_LAYER.md`'s
  migration table (names `AUDIBILITY_LABELS` as history).

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every automated acceptance criterion met; both gates passed and their re-pins applied.
- [ ] Any Look not done this session is flagged here, never silently skipped.
- [ ] Ready for Crawford's PR.

---

### Phase 4: The records (after the merge)

- [ ] **Task 13: `backlog.md`, `backlog-archive.md`, `plan.md` — 81 archived**

  **Description:** Move entry 81 to the archive in the usual way (rebase its links), delete its plan.md line, and note
  the merged PR number in the spec's As built section.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] 81 is in the archive with working links; plan.md no longer lists it.

  **Verification:**
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 12 and the merge.

  **Files:** `docs/todo/backlog.md`, `docs/todo/archive/backlog-archive.md`, `docs/todo/plan.md`

  **Estimated scope:** XS (docs only)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A voice rebuilt on admission comes up at full while a Highlight is live, then ramps down audibly | Medium | Task 2's criterion: `reserveVoice` builds at `busGainTarget`; Task 4 pushes the live set before `applySet`, asserted by spy order. |
| The dip reads a stale Volume (a robot edited while standing by has no voice to remember it) | Low | `VoiceEntry.masterVolume` is written at build from the store's robot, the same source `reReserveVoice` uses today; a standing-by robot's edit reaches the entry when it is rebuilt. |
| Highlight's admission churns the sounding set when a mode flips quickly on a Light tier (voices rebuilt and released) | Low | No new path: it is exactly Solo's behaviour today, and the stand-down waits out the last note. Noted for the ear gate on a phone tier. |
| The roster tile's `aria-describedby` text picks up the light's content | Low | The light is `aria-hidden` and empty; Task 9's criterion checks the status text is the line alone. |
| `content.test.ts` flags `probe.status` once its options go | Low | The entry stays as the field's label and is referenced by `ROBOT_SELECTION_ROW_SCHEMAS.status`; Task 7b runs the content test. |
| A −10 dB dip plus the −12 dB headroom trim takes quiet robots under the noise of the rooms' tails | Medium | The ear gate's Run 1 listens for it; the dip is one constant (A1) if 10 dB proves too much. |
| `-webkit-line-clamp` behaves differently across engines | Low | It is supported in every current engine; the Look at Checkpoint B covers Chrome, and Safari's look is already a parked item (roadmap 53). |

## Open Questions

1. Spec §7.2 Q1, the number and stage. **Resolved by default** (Architecture Decisions): 81, Stage 3, one entry.
   Crawford may move it to Stage 5.
2. Spec §7.2 Q2, the muted robot's light. **Resolved by default:** dim red; the eye gate re-pins it.
3. Spec §7.2 Q3 and Q4. **No decision needed:** a Solo and a live Highlight never coexist, so the solo-silenced voices
   never meet the dip; a dipped robot still counts in the Deck's "n of m".
4. Spec §7.1 A1, A2 (the dip and ramp) and B1, B3 (the blue and the dim level). **Open until the gates:** the defaults
   are built; each re-pin is a constant or a colour-table entry.
