# Implementation Plan: The Off Screen — final fixes from Crawford's review answers

> **Status (2026-11-01):** Phase 1 built and Checkpoint 1 passed. Commits: F1 `5f795e89`, F2 `f85bfd5b`, F3
> `edbdd571`, F4 `e6ceb121`, F5 `0791d1c8`. F5's "Drive" kept (Crawford, 2026-11-01: "Drive is fine for now").
> Phase 2: F6 built `cfd5ea72`; Checkpoint 2's automated half passed, Crawford's Look at F6 remains.
> Phase 3: F7 `f350a66f`, F8 `2e3b95ac`, F9 `85010432`; Checkpoint 3 passed, Crawford's Look included ("theme pick
> looks good"; "robots can stay where they are unless a new world/song is started"). His Look at F6 remains, and
> one finding for him under F8.
> Phase 4: F10 done at `85010432` (no commit: the probes and the dump are scratch); all six probes pass, the parity
> dump is byte-identical to `main`. Checkpoint: Complete's automated box is ticked. Next: Crawford's Looks.

Written for: Crawford, and a fresh agent session picking this up cold.

Source: Crawford's answers (2026-11-01) to the review walkthrough that closed
[docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md](OFF_SCREEN_REVIEW_FOLLOWUPS.md) (R1–R33, all built, last `92c67ba2`). Spec:
[docs/specs/OFF_SCREEN.md](../specs/OFF_SCREEN.md). Roadmap
[57](../todo/roadmap.md#57-the-off-screen-power-as-pause-the-two-axis-chooser-keep-and-the-band-table). Branch:
`feature/off-screen`, unpushed. Task ids are `F1…F10`, so they never collide with the R-plan's ids or the two earlier
plans' Task numbers. Commit subjects: `off-screen-final F<n>: <what>`.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`. Browser probes and
the parity dump: the R-plan's "How the findings were proven" section (the scratchpad scripts from earlier sessions are
gone; rewrite them from it).

**Hard-reload first:** before any Look or listen, hard-reload every open dev page (Ctrl+Shift+R). Phase E touched
`src/engine` and `src/systems`, and this plan touches them again.

## Crawford's answers (2026-11-01), as given

| # | The question | His answer | Where it went |
|---|---|---|---|
| 1a | A second power-on press can double-start on a slow phone | "fix 1": the second press joins the start under way | F1 |
| 1b | The world pause misses timelines built paused and played later | "ok": leave it, record it | backlog 43 |
| 1c | `worldChange.ts`'s redundant `prev.sceneWash !== 'covered'` check | "remove it" | F2 |
| 1d | Keep's failure line (stand-in "Couldn't save the last world.") | "storage is already full, cannot save world"; and a backlog item to warn when a user hits their save limit | F3; backlog 44 |
| 1e | The lore footer fails contrast | agrees: raise its opacity to about 0.55 | F4 |
| 2a | Power-on fade looks good | "powering off should have the reverse happen": no boot flicker on a power-off | F6 |
| 2b | — | "we shouldn't see the world swap out on theme changes since nothing about the physical world is changing" | F7–F9 |
| 3 | The Reads (Checkpoint C, R28, R32) | "looks fine" | ticked in the R-plan |
| 4a | Listen to the Envelope, Distance and Voice aspects | "sounds good" (taken as the listen passing; see Open Questions) | revisions Task 11 ticked |
| 4b | Stand-in copy | the Loading heading over the themes becomes "DRIVE" | F5 |
| 4c | The three preset links | a backlog item | backlog 45 |
| 4d | The phone (Pixel) A/B | last | Checkpoint: Complete |
| 5 | The five probes and the parity dump | into this list | F10 |

## Overview

Four phases:
- **Phase 1, small fixes (F1–F5):** the double start, the redundant check, Keep's failure copy, the footer's contrast,
  and the "Drive" heading.
- **Phase 2, the power-off fade (F6):** the off screen fades in over a world just paused, instead of replaying the
  first-load boot flicker.
- **Phase 3, a theme change in place (F7–F9):** a theme pick re-derives the live world where it stands, as an aspect
  change has since R33, with no rebuild and no wash.
- **Phase 4, the proofs (F10):** the five probes, a sixth for Phase 3, and the parity dump against `main`.

Then Crawford's Looks, and the phone A/B last.

## Architecture Decisions

- **A second press joins the start under way (F1, answer 1a).** `powerController` keeps the in-flight cold start as a
  promise. A press whose fade ends while that start runs awaits it rather than starting again. The rocker is unchanged,
  so a press never feels ignored. R27's rocker case ("a second click during the sequence reaches `powerOnSequence`
  again") stays true.
- **A power-off fades the screen in; only a fresh page plays the boot theatre (F6, answer 2a).**
  - At mount, `OffScreen` already tells the two apart: `getWorldState()` reads `'paused'` after a power-off (pause()
    writes it before the flag flips, R25) and `'cold'` on a fresh page.
  - `'paused'` gets the reverse of `fadeOffScreen`: the screen's parts (veil and column) tween from transparent to
    opaque over the same 0.4 s, as a `'ui'` timeline, with the dark layer already hidden. The parts fade, never the
    root, for R26 item 2's reason: the veil's blur fades in with it.
  - `'cold'` keeps the boot theatre. Reduced motion cuts straight to shown in both cases.
- **A theme change re-derives in place (F7–F8, answer 2b).**
  - **Why the swap is not needed:** a theme moves only seeded bands, the tempo, the Low-Pass cutoff and every robot's
    theme bands. The plot, the district, the buildings and every robot's body, colour and id stay the same. Today the
    `loadingOnly` path still removes the locale and rebuilds it at the same identity (`rebuildCurrentLocaleInPlace` →
    `retransmitCoordsOnly`). So every robot respawns at its station with a fresh battery and job, and the scene wash
    is there to hide that jump. Crawford's rule applies: no world rebuild for a partial change; re-derive in place
    (his answer to the review's Open Question 2, which became R33).
  - **What changes:** the global half is regenerated from seed under the new theme, as today
    (`regenerateGlobalHalfFromSeed`). It stays whole because a fresh seed's Sync picks depend on the tempo
    (`allowedRateNoteValues`). A partial redraw would leave an untouched world reading dirty against its own seed
    baseline, and Keep would light up.
  - **The robots:** the live roster is re-derived in place, generalising R33's `redealAspects`. For each robot, the
    rebuild's baseline under the old loading and under the new one is compared (`generateRobotRosterBaseline`, then the
    deal). Every field whose seeded value moves takes the new value, and every other field (tweaks included) stays.
    Expect the Melody, Envelope and Distance families, plus `rests` (on the theme key list, in no family). Voice never
    moves. Each moved family reaches the engine through `pushFamilyToEngine`.
  - **What stays:** positions, batteries, jobs, the companies, the hour (R22 becomes trivially true) and the power
    state. A theme change while paused stays paused, so R1's teardown no longer runs for it.
  - **The off screen:** the theme row then behaves like a family row. It applies at the click with no wash, or joins a
    world change already waiting (R3's intent).
  - **Unchanged:** world picks (a save, a preset, Roll) and a payload whose loading differs still rebuild under the
    wash, because they change the plot or the style.

## Dependency Graph

```
F1 (double start)   F2 (redundant check)   F3 (Keep copy)   F4 (footer)   F5 (Drive)
                                   │
                            Checkpoint 1
                                   │
                         F6 (power-off fade)
                                   │
                            Checkpoint 2
                                   │
      F7 (theme in place: worldTransition + aspectDeal) → F8 (the theme row: no wash) → F9 (docs)
                                   │
                            Checkpoint 3
                                   │
                    F10 (six probes + the parity dump)
                                   │
          Checkpoint: Complete (Crawford's Looks, then the phone A/B last, then his PR)
```

## Task List

Every task names its **Proof**: **RED test** for behaviour (a test that imports or renders the code and fails first),
**Look** for CSS or visuals, **Read** for copy, docs and deletions, **Probe** for what only the browser shows. Only a
RED-test task lists a `*.test.ts(x)` in its Files. Each new behaviour is mutation-checked: break the guarded line and
watch its test fail.

### Phase 1: Small fixes

- [x] **F1: `powerController.ts` — a second press joins the start under way** (answer 1a; R18's found-not-fixed)

  **Description:**
  - **The gap:** two presses can both pass R18's running check when both fades end before the first press's start
    resolves. R18's scratch test, holding `AudioEngine.start` open, saw two starts and two re-registrations. This
    happens on a slow phone, with a press more than about 0.4 s after the first.
  - **The fix:**
    - keep the cold start under way as a module-level promise;
    - after the fade, a press that finds one awaits it and returns, after the existing running and paused checks;
    - clear it when the start settles, either way.
  - **When the start rejects:** the joined press rejects too, and `restoreOffScreen` runs once.

  **Proof:** RED test — `src/systems/powerController.world.test.ts`. Hold `AudioEngine.start` open, press twice so
  both fades end before it resolves, then resolve it. Expect one start, one `reRegisterAllRobotsAudio`, one
  `startLocaleSystems`, the power flag on, the world `'running'`, and both presses' promises resolved.

  **Acceptance criteria:**
  - [ ] Two presses whose fades end during one start start once.
  - [ ] A rejected start rejects both presses, restores the screen once, and leaves the world cold, so a third press
        starts again.
  - [ ] After a joined start, a pause and a power-on resume as before (the promise is cleared).
  - [ ] R18's three cases and R27's rocker case pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/powerController.world.test.ts src/systems/powerController.test.ts src/components/ui/physical`
  - [ ] Mutants: no join (the second press starts again); the promise never cleared (a third press after a rejection
        never starts).

  **Dependencies:** None. **Files:** `src/systems/powerController.ts`, `src/systems/powerController.world.test.ts`

  **Estimated scope:** XS

- [x] **F2: `worldChange.ts` — the redundant check goes** (answer 1c; R27's equivalent mutant)

  **Description:** In the UI-store subscriber, `prev.sceneWash !== 'covered'` (`worldChange.ts:43`) has been
  redundant since R12: `runPending` returns unless the state is `'covered'`. Without it, a UI-store write while covered
  queues one more `runPending`, which finds the pending change gone and returns. Delete the condition and update the
  comment above it.

  **Proof:** Read (a deletion). R27's case — "a change that writes the UI store while covered runs once, and the
  state stays `'covered'` until it ends" — passes unmodified.

  **Acceptance criteria:**
  - [ ] The check is gone, and `worldChange.test.ts` and `sceneWash.test.ts` pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/worldChange.test.ts src/animation/sceneWash.test.ts src/components/panels/screen/worldView`

  **Dependencies:** None. **Files:** `src/systems/worldChange.ts`

  **Estimated scope:** XS

- [x] **F3: `home.ts` — Keep's failure line, in Crawford's words** (answer 1d)

  **Description:**
  - `home.off.keepFailed` becomes `storage is already full, cannot save world`, verbatim: lowercase, no full stop, as
    he wrote it.
  - The "Stand-in copy" note on the entry goes.
  - A test that asserts the old words by literal (not through `CONTENT`) moves with them.

  **Proof:** Read (copy only).

  **Acceptance criteria:**
  - [ ] The line reads as given wherever Keep's failure shows; `OffScreen.test.tsx` passes.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/content`

  **Dependencies:** None. **Files:** `src/content/copy/home.ts`

  **Estimated scope:** XS

- [x] **F4: `OffScreen.css` — the lore footer readable** (answer 1e; R26 item 4)

  **Description:** The footer's colour `rgba(200, 220, 230, 0.38)` (`OffScreen.css:78`) becomes 0.55 alpha. R26
  measured 2.2–2.9:1 at 0.38, never reaching 3:1, and estimated about 0.55 for 4.5:1 over a typical backdrop. The
  descriptions stay at 0.6 (his agreement with the recommendation).

  **Proof:** Look, plus R26 item 4's contrast measurement rerun (the text made transparent, the backdrop shot behind
  it, the colour composited, WCAG ratio). Desk 1920 × 1080 at hours 0, 9, 12 and 15 over the three presets' worlds;
  phone 375 × 812 at noon. Record the median and the minimum.

  **Acceptance criteria:**
  - [ ] The footer's median contrast is at least 4.5:1, and its minimum is recorded. If the median falls short, stop
        and report rather than re-tune: the number is Crawford's.

  **Verification:**
  - [ ] The measurement recorded under this task; `npm run lint` clean.

  **Dependencies:** None. **Files:** `src/components/panels/screen/screens/OffScreen.css`

  **Estimated scope:** XS

  **As measured (2026-11-01):** R26 item 4's method, rewritten: a headless dev server on 5195, the footer made
  transparent and its box shot (scrolled into view), each pixel's backdrop composited under the footer colour, WCAG
  ratio per pixel. The hour was set through the active locale's `dayStartTimestamp`. Both alphas were computed from the
  same shots.
  - **At 0.38 (the control):** per-shot medians 2.80–2.87, the same as R26's 2.82–2.87, so the rewritten probe agrees.
  - **At 0.55, desk 1920 × 1080,** hours 0, 9, 12 and 15 over the three presets (12 shots): medians 4.51–4.73, median
    of medians 4.67. Lowest pixel 3.77 (Kryndara at 15:00); every other shot's lowest pixel is 4.06 or above.
  - **At 0.55, phone 375 × 812 at noon,** over the three presets: medians 4.53, 4.54 and 4.71. Lowest pixel 4.07.
  - **Verdict:** the median clears 4.5:1 in all 15 shots; the minimum is 3.77.

- [x] **F5: `home.ts` — the Loading heading becomes "Drive"** (answer 4b)

  **Description:**
  - `home.off.loading`'s human label `Loading` becomes `Drive`. The CSS already uppercases it, so it reads "DRIVE"
    over the theme row.
  - The key and the code's internal name for the axis ("the Loading axis") stay; only the shown word changes.
  - `docs/UI_SHELL.md`'s off screen section names the shown heading once. Check that no other test asserts "Loading"
    by literal.
  - **Noticed, not a blocker:** the Audio Rig's Distortion has a "Drive" slider (`fleet.distortion.drive`). They sit on
    different screens; flagged in case the shared word matters to Crawford.

  **Proof:** Read (copy) and Look.

  **Acceptance criteria:**
  - [ ] The theme row's heading reads "DRIVE"; the screen's tests pass.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens src/content`

  **Dependencies:** None. **Files:** `src/content/copy/home.ts`, `docs/UI_SHELL.md`

  **Estimated scope:** XS

  **As shipped (2026-11-01): the heading reads "Drive", not "DRIVE".** The plan's "the CSS already uppercases it" is
  wrong. The heading is a `sc-dual-label__human` span with `text-transform: none` (headless probe at 1600 × 900). Like
  its siblings "Transmission", "Melody" and "Voice", it shows in title case. The label is `Drive`, as the Description
  says. **Answered (Crawford, 2026-11-01):** "Drive is fine for now"; it stays in title case.

### Checkpoint 1: Small fixes
- [x] `npm run build:types`, `npm run lint`, `npm test` clean.
- [x] F4’s contrast figures recorded.

---

### Phase 2: The power-off fade

- [x] **F6: `offScreenTheatre.ts`, `OffScreen.tsx` — a power-off fades the screen in** (answer 2a)

  **Description:**
  - **Today:** every mount plays the boot theatre: the dark layer holds for 0.5 s, then flickers through five steps
    over 1 s (`startOffScreenBoot`). So a power-off replays the first-load flicker over a world that was running a
    moment ago.
  - **New:** add `fadeInOffScreen(root)`, the reverse of `fadeOffScreen`.
    - The dark layer is set hidden at once.
    - The other parts (the veil and the column) tween from opacity 0 to 1 over `FADE_SECONDS` (0.4 s), as a `'ui'`
      timeline registered under its own key.
    - Reduced motion sets them shown at once.
    - It returns the stop: kill the timeline.
  - **`OffScreen`'s `useGSAP` callback chooses at mount:** `getWorldState() === 'paused'` gives the fade-in, anything
    else the boot theatre. The callback returns either stop, as R29 made it.
  - **A power-on during the fade-in:** `fadeOffScreen` kills the fade-in first, as it kills the boot theatre today,
    and fades from where the parts stand.
  - A tap during the fade-in needs nothing (0.4 s). `skipOffScreenBoot` stays the boot theatre's.

  **Proof:**
  - **RED test,** `src/animation/offScreenTheatre.test.ts`: `fadeInOffScreen` hides the dark layer, tweens the other
    parts from 0 to 1 over 0.4 s as a `'ui'` timeline, and its stop kills it. `fadeOffScreen` started mid fade-in
    kills the fade-in. Under reduced motion the parts are shown at once.
  - **RED test,** `OffScreen.test.tsx`:
    - mounted with the world `'paused'`, no boot timeline exists and the fade-in does;
    - mounted `'cold'`, the boot theatre runs as now;
    - an unmount mid fade-in kills it.
  - **Look (Crawford's):** power off over a running world. The screen fades in over the frozen world with its blur, and
    there is no flash or flicker. A fresh page still flickers on.

  **Acceptance criteria:**
  - [ ] A power-off shows the screen by a 0.4 s fade-in and never the boot theatre; a fresh page keeps the theatre.
  - [ ] R25's focus on the selected row after a power-off still lands.
  - [ ] The boot-theatre cases in `OffScreen.test.tsx` and `offScreenTheatre.test.ts` pass unmodified (they mount
        cold).

  **Verification:**
  - [ ] `npx vitest run src/animation/offScreenTheatre.test.ts src/components/panels/screen/screens/OffScreen.test.tsx src/systems/powerController.world.test.ts`
  - [ ] Mutants: the choice inverted; the dark layer not hidden; the fade-in never registered (so `fadeOffScreen`
        cannot kill it).

  **Dependencies:** None (F1 touches `powerController.ts`, not the theatre).

  **Files:** `src/animation/offScreenTheatre.ts`, `src/animation/offScreenTheatre.test.ts`,
  `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.test.tsx`

  **Estimated scope:** S

  **As shipped (2026-11-01, `cfd5ea72`):** as described. The timeline id is `'off-screen-fade-in'`, and the fade-in
  uses `fromTo` from opacity 0, so the parts start transparent on the first frame. Edge cases beyond the plan: a
  `'running'` mount keeps the theatre (only `'paused'` fades in), and a root with no dark layer still fades its parts.
  Mutants 7/7 killed: the plan's three, plus `fadeOffScreen` not killing the fade-in, the stop not killing it, no
  reduced-motion jump, and the dark layer faded with the rest.

### Checkpoint 2: The power-off fade
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (345 files, 13,191 tests; lint 0 errors).
- [ ] Crawford's Look at F6 (power off, then a fresh page), with the hard reload first.

---

### Phase 3: A theme change in place

- [x] **F7: `worldTransition.ts`, `aspectDeal.ts` — a theme change re-derives the live world in place** (answer 2b)

  **Description:** The Architecture Decision above, built.
  - **`retransmitWorld`'s `loadingOnly` mode** stops calling `rebuildCurrentLocaleInPlace`. It runs
    `regenerateGlobalHalfFromSeed` as today (the LFO bank push included, R2), then re-derives the live roster in place.
  - **`rebuildsLocale` returns false for it,** so a theme change while paused tears nothing down and stays `'paused'`.
  - **The re-derive generalises `redealAspects`.** Per robot, compare the rebuild's baseline under the old loading
    with the new one (the roster baseline, then the deal). Write every field whose seeded value moves. Drop the swells
    riding those fields first (`dropSwell`). Push each moved family to the engine through `pushFamilyToEngine`.
    `rests` moves without a family. Check how playback reads it (from the store at note time, or through an engine
    call) and give it the same path a hand edit takes.
  - **Keep `redealAspects`' existing contract** for an aspects-only change. One function serving both is the likely
    shape; two that share the comparison is fine.
  - **Verify first:** list the robot fields a theme change moves in a rebuild today, over the fixture world with
    aspects dealt (a scratch dump, not committed). The in-place path must move exactly those.

  **Proof:** RED test — `src/systems/worldTransition.test.ts` (and `aspectDeal.test.ts` for the re-derive itself):
  - after `retransmitWorld({ theme })` on a built world, the locale id, every robot id, position, battery, job and
    company are unchanged;
  - the moved fields equal a rebuild's under the same loading, field by field, over a world with Melody and Envelope
    dealt (the parity check R33's tests made for aspects);
  - an untweaked world's `isWorldDirty()` stays false after the change;
  - a tweak on a field the theme does not move survives, and one on a moved field resets;
  - paused before, paused after: no `killAll`, no teardown;
  - the engine receives one push per moved family per robot, and none for Voice;
  - the hour stays (R22's case passes unmodified).

  **Acceptance criteria:**
  - [ ] A theme change rebuilds nothing, and the re-derived world equals a rebuild's on every seeded field it moves.
  - [ ] World picks, Roll, a payload and a plot or style change still rebuild (their cases pass unmodified).

  **Verification:**
  - [ ] `npx vitest run src/systems src/data/bands src/utils/sessionDiff.test.ts`
  - [ ] Mutants: a moved field skipped; a moved family's push skipped; `rebuildsLocale` still true for a theme
        (a paused world torn down); the global half not regenerated (the dirty read lights).
  - [ ] Classic parity: the R27 parity tiers in `spawnSystem.test.ts` pass unmodified.

  **Dependencies:** R33 (built). **Files:** `src/systems/worldTransition.ts`, `src/systems/aspectDeal.ts`, their tests

  **Estimated scope:** M–L (the one real design task here; stop and report if the verify-first dump finds a moved
  field outside the four named)

  **As shipped (2026-11-01, `f350a66f`):**
  - **The verify-first dump** covered 12 plots × every ordered theme pair × three aspect sets (none; Melody + Envelope;
    Distance + Voice), comparing `generateDealtRosterBaseline` field by field. It found `rhythmicDensity`, `rests`,
    `adsr.attack`, `adsr.attackCurve`, `adsr.release`, `adsr.releaseCurve`, `reverbSend` and `delaySend`. Those are
    Melody, Envelope, Distance and `rests`, as the plan named. Nothing in Voice, the companies or `loadedUnder` moved.
  - **Two functions sharing the comparison:** `redealAspects` keeps R33's contract, and a new `rederiveLoading(localeId,
    from, dropSwell)` serves `loadingOnly`. It draws the baseline and the deal under `from` and under the store's new
    loading (`withLoading`), then writes per robot only the fields that moved, field by field: the four Melody fields
    and `rests`, the five sends, each `adsr` key, each Voice key, and `loadedUnder`. So it also covers aspects riding
    on a theme. Swells are dropped per moved field (an `adsr.*` key, a send; every layer swell if `layers` moved).
  - **`rests`** is baked into the melody by `regenerateMelody`, the path a hand edit of Rests takes, so a moved `rests`
    rides the Melody push.
  - **The selection** is kept on a theme change, as on an aspect change: the ids stand. A style-only change still
    clears it, as before.
  - **Tests moved with the behaviour.** In `worldTransition.test.ts`: the locale id now stands, the theme keeps the
    selection, "a theme with aspects" re-derives, paused stays paused, and running restarts nothing. R22's case lost
    one line asserting the rebuild's new locale id; the hour assertion is unchanged. R4's theme row became a name
    change carrying a theme, which still rebuilds. `powerController.world.test.ts`'s teardown list dropped the theme,
    and its style-only "tears nothing down" case became an `it.each` with the theme.
  - **The payload check:** an in-place change to Calm with two Melody picks gives the same `buildSessionPayload()` as
    the same plot rebuilt under that loading, with `robotOverrides` `{}`.
  - **Mutants 8/8 killed:** `rests` skipped, the Envelope push skipped, `rebuildsLocale` true for a theme, the global
    half not regenerated, no swell dropped, `adsr` never compared, `loadedUnder` never written, `from` ignored.
  - **Suite:** 346 files / 13,209 tests.

- [x] **F8: `OffScreen.tsx` — the theme row applies at the click, with no wash** (answer 2b)

  **Description:**
  - `onThemeChange` mirrors `onFamilyChange`:
    - with a world change waiting, the theme joins the intent (R3);
    - otherwise it calls `retransmitWorld({ theme })` at once, drops the pick to Current, reads dirty again and clears
      the Keep failure line.
  - `requestWorldChange` is no longer called for a theme.
  - R3's realise keeps sending the intended theme after a world part, which now re-derives in place too.

  **Proof:** RED test — `OffScreen.test.tsx`, with the wash attached:
  - a theme pick raises no wash and retransmits at once;
  - a theme pick while a save pick waits joins it, and the one change lands the save under the theme;
  - picking Current then cancels both, as R3's cases do.

  **Acceptance criteria:**
  - [ ] No wash on a theme pick; R3's intent cases pass with the theme's expectation updated from "waits" to "applies
        at once".

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/systems/worldChange.test.ts`

  **Dependencies:** F7. **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, its test

  **Estimated scope:** S

  **As shipped (2026-11-01, `2e3b95ac`):** as described.
  - **New cases:** no wash and an immediate retransmit; a theme joins a waiting save, and the save lands before the
    theme; a theme reads dirty at the click.
  - **Moved R3 cases:** "a theme pick then a toggle" now starts from a preset, so a change is waiting. "A theme pick
    then a preset" counts the theme's own retransmit at the click. The cover-dirty case waits on a Roll.
  - **Mutants 3/3 killed:** still washed, no join, no dirty read.
  - **Finding for Crawford, not fixed:** "picking Current then cancels both" cannot happen as the plan words it. A
    theme pick drops the world row to Current, as it always has (R3), so with a save waiting, Current is already
    checked and a click on it does nothing. The waiting save then lands at the cover under the theme. The test covers
    the reachable order instead: save, Current (cancels), theme (applies at once). This predates F8. Before F8, a theme
    pick while a save waited showed the same Current row. Should a theme pick while a world pick waits keep that pick
    shown?

- [x] **F9: the docs for Phases 1–3**

  **Description:**
  - **`docs/specs/OFF_SCREEN.md`:** one dated amendment, tagged `OFF_SCREEN_FINAL_FIXES F<n>`: a theme change
    re-derives in place (§1.2's world-change list, §3's modes, assumption 18's theatre on a power-off, the Keep failure
    line, the "Drive" heading).
  - **`docs/AUDIO_SYSTEM.md`:** "A theme change is a world change" becomes in place; the power section's
    paused-world list drops the theme; the double-start join.
  - **`docs/UI_SHELL.md`:** the theme row applies at once; the power-off fade; the footer.
  - **`docs/ANIMATION_SYSTEM.md`:** the wash's callers drop the theme; the fade-in beside the boot theatre.
  - **`docs/COMPANIES.md`:** the deal re-runs in place on a theme change too.
  - **Roadmap 57's About:** the same.
  - **Once Crawford confirms 4a (Open Questions):** the "placeholders, not yet heard" notes go, so the Envelope,
    Distance and Voice numbers read as listened-to. They are in `docs/reference/ROBOT_DATA_GRID.md`'s aspect tables,
    roadmap 57's revised item 3 ("the numbers wait on a listen") and `src/data/bands/aspects.ts`'s docblock
    (comment only).

  Spot-check each against the code.

  **Proof:** Read. **Dependencies:** F1–F8. **Files:** the docs above. **Estimated scope:** S

  **As shipped (2026-11-01, `85010432`):** every doc listed. A sweep found one more stale claim, in
  `docs/SESSION_STORAGE.md`'s power-off line, which listed a theme change as a rebuild; it is fixed. Roadmap 57's
  Decisions and Not Doing still record the first build, as that section says, so its "No resume into a different
  world" line still names a theme change. The 4a notes stay until Crawford confirms the listen.

### Checkpoint 3: A theme change in place
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (346 files, 13,212 tests; lint 0
      errors, 4 warnings in untouched scenery files).
- [x] Crawford's Look (2026-11-01, "theme pick looks good"): a theme pick on the off screen changes the sound with no wash; the robots stay where they swam.

---

### Phase 4: The proofs

- [x] **F10: the six probes and the parity dump** (answer 5; the R-plan's Checkpoint: Complete)

  **Description:** Rewrite the probe script from the R-plan's "How the findings were proven", against a dev server on
  a free port (never 5173 or 5174), restarted after every source edit. Use `?seed=kr1nd4ra&x=12&y=68` at 1600 × 900.
  1. **Nothing paused after a pick:** on, off, pick Vessport Null, on; no `'world'` timeline paused.
  2. **The bank equals the store:** on, off, Roll, on; `lfoEngine.getBankSettings(lane)` equals the store's on all four
     lanes.
  3. **The clock restarts:** on for 25 s, off, Roll, on; the measure reads 0 at power-on, then about
     seconds × BPM / 240.
  4. **Both toggles land:** Hypnotic then Wandering 150 ms apart; both picks in the loading store, both pressed, the
     bar mirrors both, no wash raised.
  5. **No keyboard loop:** pick Vessport Null, focus Keep, Shift+Tab six times; focus never cycles between Roll and
     the selected row.
  6. **(new) A theme in place:** on, wait 10 s, read every robot's position and the locale id, pick Calm; no wash
     raised, the same locale id, positions continuing (not reset to the stations), the BPM in Calm's band. Then off,
     pick Bold: the world stays `'paused'`.
  - **The parity dump:** the R-plan's scratch test (`generateRobotRosterBaseline` for 40 robots,
    `generateCompanyRosterBaseline`, `generateGlobalAudioSettings`, `generateAttenuationStyleBpm` over 12 seeds,
    plus R27's 400-robot fixture). Run it in worktrees at `main` (`cc9a01f2`) and at the tip, and compare with `cmp`:
    byte-identical.

  **Proof:** Probe; every reading recorded under this task. **Dependencies:** F1–F9. **Files:** none committed (the
  probe and the dump are scratch).

  **Estimated scope:** M (tooling to rewrite)

  **Readings (2026-11-01, at `85010432`, dev server on 5195, headless Chrome at 1600 × 900, `?seed=kr1nd4ra&x=12&y=68`):**
  1. **Nothing paused after a pick:** 0 of 94 `'world'` timelines paused, 3 s after power-on. The pick landed: the bar
     read `?seed=qb9mezm3&x=-84&y=131`. (At `b148c1e8`: 64 of 94.)
  2. **The bank equals the store:** all four lanes equal on two Rolls. The engine holds Hz, so the comparison is
     against `resolveLaneForEngine(store lane, bpm)`, with `sync` left out:
     - a synced roll at 53 BPM: lanes a–d at ½ dotted, ⅛ dotted, 1/16 and 1/32 read 0.294, 1.178, 3.533 and
       7.067 Hz in the engine, which is the store's notes at 53 BPM;
     - a free roll at 74 BPM: shape, rate and both drifts equal on every lane.

     A raw comparison of `getBankSettings` against `lfoBank` shows `rate` and `sync` "differing" on every synced lane.
     That is the Hz convention, not a fault.
  3. **The clock restarts:** off at measure 4.5625 after 25 s, Roll, on. 0.0625 at the first read after `'running'`
     (one 16th tick); 6.01 s later, 1.375 against 6.01 × 53 / 240 = 1.328. The 0.047 gap is that first tick. (At
     `b148c1e8`: 5.88.)
  4. **Both toggles land:** Hypnotic then Wandering 150 ms apart: the loading store holds
     `{ melody: ['hypnotic', 'wandering'] }`, both rows read pressed, the bar reads `…&melody=hypnotic,wandering`, and
     the wash never left `'clear'`.
  5. **No keyboard loop:** from Keep, Shift+Tab ×6: Roll, Vessport Null (the selected radio), Power on, the status
     line, then on round to Glassy and Near. Roll and the selected row are each visited once and never cycle.
  6. **A theme in place:** the theme rows exist only on the off screen, so the probe runs on for 10 s, then off, reads
     the world, picks Calm, reads it again, then powers on:
     - the same locale id (`pelagos-default`) and theme `calm`;
     - every robot's store position, activity, battery and job unchanged, and every mover's on-screen x/y unchanged;
       sample: robot-0 (652, 582), working, 88 %, structuralInspection, before and after;
     - BPM 43 → 41, inside Calm's 40–70; the wash stays `'clear'`; the world stays `'paused'`;
     - 4 s after power-on, the movers carry on from where they stood, not from the stations: 3 of 12 had moved
       (robot-0 652, 588 → 632, 620), and the rest were still at their work sites;
     - then off, Bold: the world stays `'paused'`, the locale id is unchanged, BPM 72 (inside Bold's 70–110), and the
       wash never left `'clear'`.
  - **The parity dump:** a scratch test copied into `src/` of a worktree at `main` (`cc9a01f2`) and of the tip
    (`85010432`). Over 12 seeds it draws `generateRobotRosterBaseline` (40 robots), `generateCompanyRosterBaseline`,
    `generateGlobalAudioSettings` and `generateAttenuationStyleBpm`, plus R27's 400-robot articulation sample (10 worlds
    × 40, `spawnSystem.test.ts:316`). `cmp`: **byte-identical** (1,234,508 bytes each).
    - The dump was mutation-checked: Classic's `bpm` max 100 → 101 on the tip made `cmp` differ at char 77,924. The
      mutation was reverted.
  - The scratch probe and dump scripts live in this session's scratchpad. The worktree is removed, and no Chrome was
    left orphaned.

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean; F10's six probes and the parity
      dump recorded. (2026-11-01: 346 files, 13,212 tests; types clean; lint 0 errors, the same 4 warnings; build OK.)
- [x] **Crawford's Looks** (hard reload first):
  - [x] the power-off fade (F6), and the theme change with no swap (F7, F8) — passed (Crawford, 2026-11-01);
  - [x] the footer (F4) and the "DRIVE" heading (F5) — passed (Crawford, 2026-11-01);
  - [x] **carried from the review:** toggling aspects and making the "unsaved" warning appear moves no
    row or button, at the desk and at phone width, and the held lines read as spacing (R26 item 3); Keep reads
    "Save Last World" — passed (Crawford, 2026-11-01).
- [x] **The plan files are committed before the PR:**
  - `docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md` and this file are untracked;
  - committed docs (`AUDIO_SYSTEM.md`, `UI_SHELL.md`, `COMPANIES.md`, the spec, roadmap 57) link to the review plan,
    so its links break on the PR without it.
- [ ] **Last, the phone (answer 4d):** Crawford's Pixel `perf:audio` A/B against `main`, the HUD counts recorded here.
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| F7's in-place theme change drifts from what a rebuild deals, or misses a moved field | High | The verify-first dump lists the fields a rebuild moves; the parity test compares in place against a rebuild field by field; the untweaked dirty read stays clean; probe 6 |
| F7 leaves a paused world inconsistent (BPM, LFO bank) without the teardown | Medium | The global half path is unchanged and pushes the bank to a primed engine (R2); probe 6's paused leg; probe 2 rerun |
| F1's join hides a start that never settles | Low | The promise is cleared in a `finally`; the rejection case is a test |
| F6's fade-in and the power-on fade overlap | Low | `fadeOffScreen` kills the fade-in first, as it kills the boot theatre; a test |

## Open Questions

- **4a, "sounds good":** taken as the listen passing, so the Envelope, Distance and Voice placeholder columns stand
  as final, and `docs/tasks/OFF_SCREEN_REVISIONS.md` Task 11 is ticked on those words. If it meant "do the listen
  later", untick it there.
- **F3's casing:** "storage is already full, cannot save world" is kept verbatim (lowercase, no full stop). The other
  lines on the screen are sentence case with a full stop; say if it should match them.
