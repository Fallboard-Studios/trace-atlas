# Implementation Plan: Monitor Mode Made Trustworthy

Source spec: [docs/specs/MONITOR_MODE_TRUSTWORTHY.md](../specs/MONITOR_MODE_TRUSTWORTHY.md). Source intent:
[docs/intent/monitor-mode-trustworthy.md](../intent/monitor-mode-trustworthy.md). Backlog slot: 81, written by Task 0
(spec §7.2 Q1; default Stage 3, one entry for both parts).

**Status:** plan written 2026-11-11 from the spec, before Crawford's answers to §7.2 Q1–Q2; every §7.1 default stands
until a gate re-pins it. Not yet built.

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

- [ ] **Task 0: `docs/todo/backlog.md`, `docs/todo/plan.md` — entry 81 and its Stage 3 line**

  **Description:** Add backlog entry `### 81. Monitor Mode Made Trustworthy — Highlight you can hear, from a robot
  that is playing, and the mode on every card`, in the house shape (raised 2026-11-11, the four findings kept, the two
  called features, links to the intent, spec and this plan). Add the one-sentence line to plan.md Stage 3 under 80.
  If Crawford answers §7.2 Q1 with Stage 5, the line goes there instead.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Entry 81 exists, links the three docs, and names what is out of scope (spec §1.8).
  - [ ] plan.md carries one line for 81 in the agreed stage, with its anchor link.

  **Verification:**
  - [ ] `npm run lint` clean (docs-only change).

  **Dependencies:** None.

  **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`

  **Estimated scope:** XS (two docs)

---

### Phase 1: The sound (Part A)

- [ ] **Task 1: `audioBudget.ts` — `reconcileSounding` ranks Solo, Highlight, Auto**

  **Description:** `reconcileSounding(previous, eligible, soloIds, highlightIds, maxAudibleRobots)` implements spec
  §1.4's five steps: keep, evict on a fallen cap (newest Auto, then newest Highlight, then newest Solo), admit Solos
  (evicting newest Auto, else newest Highlight, else wait), admit Highlights (evicting newest Auto only, else wait),
  fill. A `rank(id)` helper and `lastIndexWhere` with a predicate per rank; the doc comment restates the steps.
  `audioBudgetSystem.ts` passes `[]` for now so it compiles (Task 4 passes the real list).

  **Proof:** RED test — `src/utils/audioBudget.test.ts`: a Highlight evicts the newest Auto when the cap is full; it
  waits when every slot holds a Solo or a Highlight; a Solo evicts the newest Highlight when no Auto is in; a fallen
  cap evicts Auto, then Highlight, then Solo.

  **Acceptance criteria:**
  - [ ] A Highlight with a free slot is admitted in arrival order; with none it evicts the newest Auto, never a Solo
        or another Highlight, and waits if only those are in.
  - [ ] A Solo evicts the newest Auto first and the newest Highlight when no Auto is in; it waits only when every
        slot holds a Solo.
  - [ ] A cap that fell evicts newest Auto, then newest Highlight, then newest Solo; an un-highlighted robot keeps its
        slot; `previous` is returned by reference when nothing changed.
  - [ ] Every existing `reconcileSounding` test passes unmodified apart from the added `[]` argument (behaviour parity
        with no Highlights).

  **Verification:**
  - [ ] `npx vitest run src/utils/audioBudget.test.ts src/systems/audioBudgetSystem.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/audioBudget.ts`, `src/utils/audioBudget.test.ts`, `src/systems/audioBudgetSystem.ts` (the
  `[]` argument only)

  **Estimated scope:** S (one algorithm and its tests; one call site)

- [ ] **Task 2: `AudioEngine.ts`, `headroom.ts`, `voiceEntry.ts` — the dip is one bus-gain target**

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
  - [ ] While the live set is non-empty, every voice not in it has bus gain `robotBusGain(volume) * HIGHLIGHT_DIP_GAIN`
        at build, on a Volume edit and on the set change; a voice in it has `robotBusGain(volume)`.
  - [ ] `setHighlightedRobots` ramps through `rampOrSet` over `HIGHLIGHT_RAMP_SECONDS` (the `rampTo` spy receives the
        duration); the same set again calls nothing; the empty set restores every voice.
  - [ ] The existing `updateRobotMasterVolume` and `reserveVoice` bus-gain tests pass unmodified (no live set = today's
        gains).

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/audioEngine/headroom.ts`, `src/engine/audioEngine/voiceEntry.ts`,
  `src/engine/AudioEngine.test.ts`

  **Estimated scope:** M (three source files, one test file; new module state and one new public call)

- [ ] **Task 3: `AudioEngine.ts` — the velocity halving goes**

  **Description:** Delete the `anyHighlight` block in `scheduleNote` (the `isDockMuted` import stays for
  `triggerWithCap`). Velocity is the Dynamics roll's and the accents' alone. The two existing Highlight velocity tests
  (`applies ~50% attenuation…`, `a highlighted robot in the station attenuates nobody…`) are rewritten to assert the
  new contract, not deleted.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: `scheduleNote` passes the same velocity to the synth for a
  non-highlighted robot whether or not a highlighted robot is out of its station.

  **Acceptance criteria:**
  - [ ] A highlighted robot in the roster, docked or active, changes no other robot's note velocity.
  - [ ] Every other `audioMode enforcement` test (mute, solo, the dock) passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2 (so the dip exists before the halving goes; the suite is green either way).

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** XS (one block deleted, two tests rewritten)

- [ ] **Task 4: `audioBudgetSystem.ts` — the live Highlight set is pushed before the sounding set**

  **Description:** `reconcile` builds `highlightIds` (eligible robots with `audioMode === 'highlight'`), passes it to
  `reconcileSounding`, and derives the live set `next.filter(highlighted)`. A `pushedHighlighted` key beside
  `pushedStandingBy`; `applyHighlighted(next, force)` calls `AudioEngine.setHighlightedRobots` only on a change, and is
  called **before** `applySet` (spec §1.3). `stopAudioBudget` pushes the empty set and clears the key;
  `startAudioBudget`'s forced reconcile re-pushes.

  **Proof:** RED test — `src/systems/audioBudgetSystem.test.ts`: a highlighted active robot is pushed to
  `setHighlightedRobots`; one docked, under a Solo, or standing by on a Light tier is not; the push precedes
  `setSoundingRobots` on the same reconcile (spy call order); `stopAudioBudget` pushes `[]`.

  **Acceptance criteria:**
  - [ ] The live set is exactly the highlighted robots in the sounding set: a docked, solo-silenced or standing-by
        Highlight is absent.
  - [ ] On a Light tier (`robotLoad` at the floor) a Highlight on a standing-by robot admits it, pushes it, and the
        newest Auto robot stands by in its place.
  - [ ] `setHighlightedRobots` is called before `setSoundingRobots` within one reconcile, not called for an unchanged
        set, and called with `[]` by `stopAudioBudget`.
  - [ ] Every existing budget-system test passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioBudgetSystem.test.ts src/utils/audioBudget.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2.

  **Files:** `src/systems/audioBudgetSystem.ts`, `src/systems/audioBudgetSystem.test.ts`

  **Estimated scope:** S (one system file and its test)

### Checkpoint A: the sound (stop — Crawford's ear, spec §5.4)
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean; `npm run build` clean.
- [ ] Run 1 (spec §5.3, desk, headphones, Full tier): Highlight one robot, the others drop and it stands clear; back to
      Auto, the drop releases without a step; Highlight a docked robot, nothing changes; Solo one and Highlight
      another, nothing changes until the Solo lifts.
- [ ] Run 2 (`?load=` at the floor): Highlight a standing-by robot; it is admitted and the newest Auto stands by.
- [ ] Crawford names the dip (A1, −10 dB) and the ramp (A2, 150 ms), or re-pins them; a re-pin is one constant each
      and no new task.
- [ ] Reviewed with Crawford before Phase 2.

---

### Phase 2: The display (Part B)

- [ ] **Task 5: `robotAudibility.ts`, `MetaBox.tsx` — `isRobotEmitting`**

  **Description:** Add `isRobotEmitting(audioMode, anySolo, docking, isSounding): boolean` = `isRobotAudible(...) &&
  isSounding`. `MetaBox.tsx`'s `useEmittingCount` counts with it instead of `getAudibilityState(...) === 'emitting'`.
  `getAudibilityState` stays until Task 7b.

  **Proof:** RED test — `src/utils/robotAudibility.test.ts`: `isRobotEmitting` is true only for an audible, sounding
  robot (muted, solo-silenced, docked-not-soloed and standing-by robots are false; a soloed robot in its station that
  is sounding is true).

  **Acceptance criteria:**
  - [ ] `isRobotEmitting` agrees with `getAudibilityState(...) === 'emitting'` on every case the old tests cover.
  - [ ] `MetaBox.test.tsx` passes unmodified (the Deck's count is unchanged).

  **Verification:**
  - [ ] `npx vitest run src/utils/robotAudibility.test.ts src/components/panels/screen/worldView/MetaBox.test.tsx`
        passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/robotAudibility.ts`, `src/utils/robotAudibility.test.ts`,
  `src/components/panels/screen/worldView/MetaBox.tsx`

  **Estimated scope:** XS (one helper, one consumer)

- [ ] **Task 6: `statusLightColors.ts` — yellow and blue**

  **Description:** `StatusLightState` gains `'yellow'` (`colorTheme.wire.base`) and `'blue'` (`colorTheme.glass.base`),
  spec §7.1 B1; the existing four are untouched, so the rocker's light does not move.

  **Proof:** RED test — `src/utils/statusLightColors.test.ts`: `getStatusLightColor('yellow')` and `('blue')` return
  the `hslToString` of those families, with the glow at the given alpha.

  **Acceptance criteria:**
  - [ ] The two new states resolve from `colorTheme.json`, never a literal.
  - [ ] The four existing states return exactly what they did (existing tests unmodified).

  **Verification:**
  - [ ] `npx vitest run src/utils/statusLightColors.test.ts src/components/ui/physical` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/statusLightColors.ts`, `src/utils/statusLightColors.test.ts`

  **Estimated scope:** XS

- [ ] **Task 7a: `useRobotMeta.ts`, `robotSelectionConfig.ts` — the status is the mode word, plus `mode` and `lit`**

  **Description:** `MODE_LABELS: Record<NonNullable<Robot['audioMode']>, ValueLabel> =
  optionsRecord('probe.monitorMode')` beside `AUDIBILITY_LABELS` (deleted in 7b). `useRobotMeta` returns a `RobotMeta`
  (spec §4): `status` is `MODE_LABELS[mode].humanLabel`, plus `mode` (`robot.audioMode ?? 'none'`) and `lit`
  (`isRobotEmitting(...)` from the same two boolean selectors it has today). The consumers' tests that asserted
  Emitting / Standing by / Disabled are rewritten to the word (the light's tests come in Tasks 9 and 10).

  **Proof:** RED test — `src/components/panels/screen/screens/RobotScreen.test.tsx` and `RosterTile.test.tsx`: the
  status value reads `Auto` for an Auto robot and `Mute` for a muted one; a robot silenced by another's Solo still
  reads `Auto`; a standing-by robot reads its mode word, not "Standing by".

  **Acceptance criteria:**
  - [ ] `status` is the robot's own mode word in every state; the three old words appear nowhere on screen.
  - [ ] `mode` and `lit` are returned; `lit` is true only for an audible, sounding robot.
  - [ ] `robotSelectionConfig.test.ts` covers `MODE_LABELS` (the four options, human and lore).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx
        src/components/panels/screen/screens/RosterTile.test.tsx src/components/panels/screen/screens/RosterBoard.test.tsx
        src/data/robotSelectionConfig.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/components/panels/screen/screens/useRobotMeta.ts`, `src/data/robotSelectionConfig.ts`,
  `src/data/robotSelectionConfig.test.ts`, `src/components/panels/screen/screens/RobotScreen.test.tsx`,
  `src/components/panels/screen/screens/RosterTile.test.tsx`

  **Estimated scope:** M (two source files, three test files rewritten)

- [ ] **Task 7b: `robotAudibility.ts`, `robotSelectionConfig.ts`, `probe.ts` — the old vocabulary goes**

  **Description:** Delete `getAudibilityState`, `AudibilityState`, `AUDIBILITY_LABELS` and their tests, and the
  `options` block of `probe.status` (the entry keeps its label). `content.test.ts` stays green: `probe.status` is still
  referenced by the field's `DualLabel` schema.

  **Proof:** Read — a deletion; `npm run build:types` proves nothing imports what went.

  **Acceptance criteria:**
  - [ ] No export, type or content option of the three-state vocabulary remains; types, lint and the full suite are
        green.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint`, `npm test` clean.

  **Dependencies:** Task 7a.

  **Files:** `src/utils/robotAudibility.ts`, `src/utils/robotAudibility.test.ts`, `src/data/robotSelectionConfig.ts`,
  `src/data/robotSelectionConfig.test.ts`, `src/content/copy/probe.ts`

  **Estimated scope:** S (deletions in five files)

- [ ] **Task 8: `ModeLight.tsx`, `ModeLight.css` — the small light**

  **Description:** A stateless `ModeLight({ mode, lit })` in `src/components/panels/screen/screens/`: one inline
  `span`, `aria-hidden`, `data-mode` and `data-lit`, its `--mode-light-color` and `--mode-light-glow` set inline from
  `getStatusLightColor` (none → green, solo → yellow, mute → red, highlight → blue). CSS: an em-sized disc; lit shows
  the colour with the rocker light's glow idiom; dim shows the colour at low alpha with no glow (spec §7.1 B3).

  **Proof:** RED test — `src/components/panels/screen/screens/ModeLight.test.tsx`: renders with the right `data-mode`
  and `data-lit`, is hidden from the accessibility tree, and its inline colour is `getStatusLightColor(...).color` for
  each of the four modes.

  **Acceptance criteria:**
  - [ ] The four modes map to the four colours through `getStatusLightColor`; no literal colour in the component.
  - [ ] `lit` toggles `data-lit` and nothing else in the markup.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/ModeLight.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/components/panels/screen/screens/ModeLight.tsx`, `src/components/panels/screen/screens/ModeLight.css`,
  `src/components/panels/screen/screens/ModeLight.test.tsx`

  **Estimated scope:** S (one new component, its stylesheet and test)

- [ ] **Task 9: `RosterTile.tsx`, `probe.ts` — the light leads the line, the mode first**

  **Description:** `probe.roster.statusLine` becomes `{status} · {job} · {dockingState} · {activity}`. The tile
  renders `<ModeLight mode lit />` inside `.roster-tile__status` before the filled text. `RosterBoard.test.tsx`'s
  status assertions follow.

  **Proof:** RED test — `src/components/panels/screen/screens/RosterTile.test.tsx`: the status text begins with the
  mode word; the light inside the line carries `data-mode` and `data-lit`, lit for a sounding robot and dim for one in
  its station, under a Solo, standing by, or muted.

  **Acceptance criteria:**
  - [ ] The line reads `<mode> · <job> · <docking> · <activity>` for every robot; an unassigned robot's job word is now
        second, not first.
  - [ ] The light's `data-mode` is the robot's own mode in every case; `data-lit` follows `isRobotEmitting`.
  - [ ] `aria-describedby` still points at the status span, whose text is the line without the light.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/RosterTile.test.tsx
        src/components/panels/screen/screens/RosterBoard.test.tsx src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 7a, 8.

  **Files:** `src/components/panels/screen/screens/RosterTile.tsx`, `src/content/copy/probe.ts`,
  `src/components/panels/screen/screens/RosterTile.test.tsx`, `src/components/panels/screen/screens/RosterBoard.test.tsx`

  **Estimated scope:** S

- [ ] **Task 10: `RobotScreen.tsx`, `RobotScreen.css`, `probe.ts` — the Status well first, the light inline**

  **Description:** `META_FIELDS` reorders to status, job, docking, activity. The Status well's value renders
  `<ModeLight />` before the word (a small inline gap in `RobotScreen.css`). `probe.band.statusLine` becomes
  `{status} · {job} · {dockingState} · {activity} · {battery}`, and the band renders the light before its line.

  **Proof:** RED test — `src/components/panels/screen/screens/RobotScreen.test.tsx`: `metaValues(container)` reads
  `['Auto', 'Acoustic Survey', 'Active', 'Working']`; the first well holds a `ModeLight` with the robot's mode and lit
  state; the phone band's line begins with the mode word and carries the light.

  **Acceptance criteria:**
  - [ ] The Status well is first on the desk; its light and word agree with `useRobotMeta`.
  - [ ] The phone band leads with the mode, then job, docking, activity, battery, the light before the line.
  - [ ] Every other `RobotScreen.test.tsx` test passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Look: the robot screen on the desk, the Status well first with its light; the phone band at 320 px, the mode
        leading.

  **Dependencies:** Tasks 7a, 8.

  **Files:** `src/components/panels/screen/screens/RobotScreen.tsx`, `src/components/panels/screen/screens/RobotScreen.css`,
  `src/content/copy/probe.ts`, `src/components/panels/screen/screens/RobotScreen.test.tsx`

  **Estimated scope:** S

- [ ] **Task 11: `RosterTile.css` — the desk tile holds two status lines (the CSS-only task)**

  **Description:** Under `.roster-tile--desk .roster-tile__status`: `white-space: normal`, a two-line clamp
  (`display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden`) and a `min-height`
  of two line-heights, so every desk tile is the same height whether its text takes one line or two (spec §1.6,
  §7.1 B4). The phone rule is untouched (one line, ellipsis).

  **Proof:** Look — the roster on the desk at 768 px and at a wide window: every tile in a row the same height; a
  long line wraps to a second line and a third is clipped; a short line leaves an empty second line; the light sits on
  the first line before the word. The phone shell at 320 px: one line, the mode word never cut.

  **Acceptance criteria:**
  - [ ] Desk tiles are uniform in height with one- and two-line statuses side by side; no tile grows past two lines.
  - [ ] The phone tile is unchanged.

  **Verification:**
  - [ ] The Look above, in a live browser, recorded in the commit. No test file.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 9.

  **Files:** `src/components/panels/screen/screens/RosterTile.css` (no `*.test.ts`)

  **Estimated scope:** XS

### Checkpoint B: the display (stop — Crawford's eye, spec §5.4)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Run 3 (spec §5.3): the roster on the desk and the phone, the robot screen and the band, as Tasks 10 and 11
      describe; the colours Auto green, Solo yellow, Mute red, Highlight blue; the dim level readable.
- [ ] Crawford names the blue (B1, `glass`), the light's size, the dim level (B3) and the muted robot's light (Q2,
      dim); a re-pin is a CSS or colour-table edit and no new task, unless he asks for a new theme family (ask first).
- [ ] Reviewed with Crawford before the docs.

---

### Phase 3: Docs

- [ ] **Task 12: `AUDIO_SYSTEM.md`, `POLYPHONY_GUIDE.md`, `ROBOT_LIFECYCLE.md`, the spec — document the shipped behaviour**

  **Description:** AUDIO_SYSTEM.md: the `audioMode` policy item (~line 575) describes the bus-gain dip, when a
  Highlight is live, and `setHighlightedRobots`; the budget paragraph (~line 233) reads "Solo, then Highlight, then
  Auto" with the eviction order. POLYPHONY_GUIDE.md line 27: `scheduleNote` applies nothing for Highlight.
  ROBOT_LIFECYCLE.md rule 6: "Off" becomes "Auto", and a Highlight counts only while heard. The spec gets its "As
  built" section with the pinned constants and the gates' answers. Spot-check every named identifier against the
  shipped source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every named API, constant and rule matches the shipped source; no "keep existing sound" clause anywhere.

  **Verification:**
  - [ ] Manual review against the code.
  - [ ] `npm run lint` clean.

  **Dependencies:** All prior tasks.

  **Files:** `docs/AUDIO_SYSTEM.md`, `docs/POLYPHONY_GUIDE.md`, `docs/ROBOT_LIFECYCLE.md`,
  `docs/specs/MONITOR_MODE_TRUSTWORTHY.md`

  **Estimated scope:** XS (docs only)

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
