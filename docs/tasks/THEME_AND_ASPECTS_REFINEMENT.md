# Implementation Plan: Themes and Aspects Refinement

Source spec: [docs/specs/THEME_AND_ASPECTS_REFINEMENT.md](../specs/THEME_AND_ASPECTS_REFINEMENT.md). Source intent:
[docs/intent/themes-and-aspects-refinement.md](../intent/themes-and-aspects-refinement.md). Roadmap
[58](../todo/roadmap.md#58-themes-and-aspects-refinement), plan.md Stage 1.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`. The measuring
harness (T10) runs as `npm run sketch:bands` and asserts nothing.

The planning skill's default output paths (`tasks/plan.md`, `tasks/todo.md`) are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".

## Overview

Five steps, each ending at a gate Crawford passes (spec §1.2). The first two are paper: a character sheet for every
current and candidate theme, family and option, then Crawford's cut. Only the survivors get code. The code steps widen
the theme key list to the whole band table, add the comparison and push every widened key needs to reach a live world,
add or replace a family if the cut says so, and write the survivor columns. Then a committed harness measures what the
generators realise under every column and a sketch page shows it beside the written bands, the override grid and the
sheets' key lists; the listens run from a fixed sheet, one axis at a time, and each retune re-measures. Copy and docs
come last.

The task list is in five phases:

- **Phase 0** records the plan in roadmap 58.
- **Phase 1** (paper, `docs/sheets-58`): T1–T3 write the sheets, Checkpoint A is Crawford's read, T4 records his cut
  and the two paper tests, Checkpoint B is the cut.
- **Phase 2** (code, `feature/themes-aspects-58`): T5 widens the type, T6 carries widened keys to a live world, T7a–c
  add or replace a family if the cut kept one, T8–T9 write the survivor columns. Checkpoint C.
- **Phase 3**: T10 the harness, T11 the sketch page, Checkpoint D (the look), then the three listens L1–L3 with retune
  tasks R1… as they arise, Checkpoint E.
- **Phase 4**: T12 copy, T13–T15 docs, Checkpoint Complete.

T6, T7a–c and the shape of T8–T9 depend on the cut. They are written here with every known candidate so the build never
has to invent a step; the parts the cut does not keep are struck out at T4, not done.

Every task names its **Proof** (TASK_TEMPLATE.md): a RED test for a task that changes behaviour, a Read for a sheet,
copy or docs task, a Look for the sketch page and each listen, a Run for the harness. One commit per task, subjects
`themes-58 T<n>: …`, RED first, every new gate mutation-checked (break the code, see the test fail, restore it). A
sheets-only or docs-only commit names its proof in the message.

## Architecture Decisions

- **The spec's six open questions take their defaults** (spec §7) unless Crawford overrides them at Checkpoint A or
  B, where each is asked again in one line: sheets in `docs/reference/THEME_AND_ASPECT_SHEETS.md`; the harness
  committed; the three listen worlds the presets unless he names three; family listens under Classic first; a renamed
  character's id follows the name; the sheet counts the intent gave.
- **The harness is a vitest file outside the suite.** `scripts/sketch/measureBands.harness.ts`, run by its own config
  `vitest.sketch.config.ts` (include `scripts/sketch/**/*.harness.ts`) through `npm run sketch:bands`. It is not a
  `*.test.ts`, so `npm test` never runs it and the file-text lint rule for tests does not apply to its `node:fs` write.
  It reuses the T18 recipe from `docs/tasks/EVEN_SEEDED_DRAWS.md`: wrap the three draw functions, run the real
  generators (`generateRobotAudioBaseline` under `withLoading`, `generateWorldSeedBaseline`) and record each draw as a
  fraction of its band. Output: `docs/sketches/data/theme-and-aspect-sketch.json`, committed, so the page works from a
  checkout. A vitest config and an npm script are not dependencies.
- **The sheets' "Keys owned" lists are typed by hand into the sketch page** as a constant in its own script (spec
  §1.6: the harness does not parse markdown). The page shows moved-not-owned and owned-not-moved rows.
- **Widening is a type change plus a test change, nothing else moves on its own** (T5). The pin in
  `resolveBands.test.ts` that lists the ten keys becomes: every theme key is a `BandKey`, its band has its key's kind,
  and it lies inside the field's full range. The existing overlay cases on injected columns stand.
- **A widened robot key needs a comparison entry and a push before a column may name it** (spec §1.5; T6). The
  comparison is `movedFields` in `aspectDeal.ts` (today: Melody's four fields and `rests` as `TOP_LEVEL_FIELDS`, the
  five sends, the `adsr` keys, `VOICE_FIELDS`, `LAYER_KEYS`). The push is `pushFamilyToEngine`'s case for the family
  the field is filed under. The candidate keys outside today's comparison and the push each would take, from
  `robotOptionsActions.ts`:

  | Key | Robot field | Push today (the hand edit's path) |
  |---|---|---|
  | `robot.portamento` | `audioAttributes.portamento` | the live glide write `AudioEngine.ts` makes through `composite.setShared({ portamento })` (the portamento edit at `robotOptionsActions.ts:181`) |
  | `robot.lfoGainDepth`, `robot.lfoDetuneDepth`, `robot.lfoBusDepth` | `lfoLinks` | `primeRobotLinks(robot)` |
  | `robot.dynamics` | `dynamics` | store only; read at play (the dynamics edit writes the store alone) |
  | `robot.accents` | `accents` | `regenerateMelody` (as `rests`) |
  | `robot.masterVolume` | `masterVolume` | the store write plus the engine's volume cache (the volume edit, `robotOptionsActions.ts:38–44`) |
  | `gritSend`, `shimmerSend`, `doubleSend` | the three sends | already compared and pushed through `updateRobotSends` (Distance's case) |

  Each field is filed under a family for `movedFields`' `families` set: a fifth family's own if one is kept, else the
  nearest existing push (`accents` with `rests` under `melody`; the rest need a case of their own, T6 adds a
  `'world'`-style pseudo-family only if no real family carries them — see the risk table).
- **A fifth family is three tasks, not one** (T7a–c): the derive function lifted with parity, the family wired through
  the typed records, the carriers' tests extended. T7a is the risky one and goes first.
- **A Motion family that takes the three room sends splits `deriveSendFields`** into the Reverb/Delay pair and the
  exclusive trio at the same dataIds, with `TOP_LEVEL_FIELDS` filing each send under its family. If the cut leaves the
  room sends with Distance, nothing splits.
- **Pitch drift and Humanize are not keys** (spec §1.5). A sheet that wants either says so in "Leaves alone" and
  Crawford decides at Checkpoint A whether to open an ask-first item; no task here adds a key.
- **Order.** The paper phase is strictly first. T5 has no dependants until T8 and can be built the moment Checkpoint B
  passes. T6 and T7a–c run in parallel if both apply (different files). T8 needs T5 and T6; T9 needs T7b if a family
  changed. T10 needs the columns. Listens need the sketch. Copy needs the listens.

## Dependency Graph

```
T0 (roadmap 58 entry)

T1 (sheets file, current set) ──┬── T2 (theme candidates)
                                └── T3 (family and option candidates)
                                            │
                                     Checkpoint A (Crawford reads)
                                            │
                                     T4 (the cut, the paper tests, the key → field → push table)
                                            │
                                     Checkpoint B (the cut)
                                            │
            ┌───────────────────────────────┼─────────────────────────────┐
     T5 (ThemeColumn = Partial<BandTable>)  T6 (movedFields + push        T7a (derive function, parity)
            │                                   for every survivor key)      │
            │                                      │                      T7b (family wiring)
            │                                      │                         │
            │                                      │                      T7c (carriers' tests)
            └──────────────┬───────────────────────┘                         │
                    T8 (theme columns)                              T9 (option columns)
                           └────────────────────┬────────────────────────────┘
                                         Checkpoint C (types, lint, suite, parity)
                                                │
                                         T10 (harness) ── T11 (sketch page)
                                                │
                                         Checkpoint D (the look)
                                                │
                                   L1 (themes) ── L2 (families) ── L3 (pairs), each with R-tasks
                                                │
                                         Checkpoint E (the listens)
                                                │
                                   T12 (copy) ── T13 (grids) ── T14 (docs + comments) ── T15 (roadmap, plan.md)
                                                │
                                         Checkpoint Complete
```

## Task List

### Phase 0: Record

- [x] **T0: `docs/todo/roadmap.md` — roadmap 58 points at the spec and this plan**

  **Description:** Roadmap 58's first paragraph ends "Next: spec → plan." Replace with links to the spec and this plan
  and "Next: the sheets (plan T1)". Add the spec and plan to the intent's header line as the off-screen intent did.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Roadmap 58 links both files and names T1 as next. Every link resolves (file and anchor).

  **Verification:**
  - [ ] `npm run lint` clean (docs only).

  **Dependencies:** None. **Files:** `docs/todo/roadmap.md`, `docs/intent/themes-and-aspects-refinement.md`

  **Estimated scope:** XS (docs only)

### Phase 1: Paper (`docs/sheets-58`)

- [x] **T1: `docs/reference/THEME_AND_ASPECT_SHEETS.md` — the file, the shape, and the current set's sheets**

  **Description:** Create the sheets file: a header stating the rules (spec §1.3: no numbers, a key with no sentence is
  not owned, status marks are Crawford's), the sheet template verbatim from spec §1.3, then one sheet each for the five
  current themes (Classic included, spec §1.3's last rule), the four current families, and their twelve options. Each
  sheet is written from the code as it stands (the column's keys are the starting "Keys owned") and then rewritten as a
  character: where a key has no sentence it moves to "Leaves alone" with the note that the placeholder moved it for no
  reason the sheet can give. A "Cut" heading at the end, empty.

  **Proof:** Read — Crawford, at Checkpoint A.

  **Acceptance criteria:**
  - [ ] Twenty-one sheets, every field of the template filled, no digit in any field except a key name's.
  - [ ] Every key a current column moves appears in that sheet's "Keys owned" with a sentence or in "Leaves alone" with
        the note. (Checked by hand against `themes.ts` and `aspects.ts`.)
  - [ ] Every "Overlaps" field of a theme names the families whose key sets intersect its "Keys owned"; every option's
        names the theme keys it overrides. (Checked against the key sets in `aspects.ts`.)

  **Verification:**
  - [ ] A read-through against spec §1.3's rules. `npm run lint` clean.

  **Dependencies:** T0. **Files:** `docs/reference/THEME_AND_ASPECT_SHEETS.md`

  **Estimated scope:** M (one file, twenty-one sheets)

- [x] **T2: the sheets file — eight to ten theme candidates**

  **Description:** Append eight to ten theme candidates, each a place and not a rung (spec §1.3). Each "Distinct from"
  names its nearest neighbour among the current five and the other candidates. Each "Keys owned" may name any of the
  79 keys, global rows included, with its sentence; a candidate that needs pitch drift or Humanize says so in "Leaves
  alone" as an ask-first. A candidate whose character reads as "more" or "less" of another is not written.

  **Proof:** Read — Crawford, at Checkpoint A.

  **Acceptance criteria:**
  - [ ] Eight to ten sheets, status `candidate`, every field filled, no numbers.
  - [ ] No two sheets (current or candidate) share a "Heard first" line.
  - [ ] Every key named exists in `bandKeys.ts`'s `BandKey` (checked by hand).

  **Verification:**
  - [ ] Read-through. `npm run lint` clean.

  **Dependencies:** T1. **Files:** `docs/reference/THEME_AND_ASPECT_SHEETS.md`

  **Estimated scope:** M (one file, eight to ten sheets)

- [x] **T3: the sheets file — the family and option candidates**

  **Description:** Append: two or three extra option candidates per current family (Melody, Envelope, Voice, and
  Distance reproposed on the axis test, spec §1.3); a **Motion** family sheet with three options (its key set drawn from
  `robot.portamento`, the three `robot.lfo*Depth` keys and, if the sheet wants them, `gritSend`, `shimmerSend` and
  `doubleSend`; pitch drift named as ask-first if wanted); a **Performance** family sheet with three options (its key
  set from `robot.dynamics`, `robot.rests`, `robot.accents`; Humanize named as ask-first if wanted). A family sheet
  states the axis, why its options are distinct, and the key set; each option is a sheet of its own. Where Motion or
  Performance would take a key a theme column uses today (`robot.rests`), the family sheet's "Overlaps" says which
  themes lose it.

  **Proof:** Read — Crawford, at Checkpoint A.

  **Acceptance criteria:**
  - [ ] Each current family has two or three candidate options; Motion and Performance each have a family sheet and
        three option sheets; every field filled, no numbers.
  - [ ] No key appears in two families' key sets across current and candidate families (checked by hand; the type
        will check it at T7b).
  - [ ] Every candidate family key is robot-side (`robot.*` or a send).

  **Verification:**
  - [ ] Read-through. `npm run lint` clean.

  **Dependencies:** T1. **Files:** `docs/reference/THEME_AND_ASPECT_SHEETS.md`

  **Estimated scope:** M (one file, about twenty sheets)

### Checkpoint A: Crawford reads the sheets
- [x] Crawford has read every sheet. His notes go into the sheets as status marks and reasons at T4; nothing is
      built from them before T4 lands. (Passed 2026-11-03.)
- [x] The spec's open questions 1, 3, 5 and 6 confirmed or overridden in one line each. (Defaults confirmed.)
- [x] Any ask-first a sheet raised (pitch drift, Humanize, a new key) decided: opened as a backlog item, or struck from
      the sheet. (Four new keys; pitch drift and the fleet's size struck.)
- [x] Session ends here. (Ran on into T4 in the same session at Crawford's pace.)

- [x] **T4: the sheets file — the cut, the two paper tests, and the survivor table**

  **Description:** Record Crawford's marks: every sheet `kept`, `renamed → <name>`, or `cut` with his reason; cut
  sheets move under "Cut". Then run spec §1.4's two paper tests over the survivors and write the result into each
  sheet (a "Covered" line and an "Important" line, pass or the fix made). Add a **Survivor table** section to the
  sheets file: every key any survivor column will move, the Robot field or global row it lands on, whether `movedFields`
  or `deriveGlobalHalfMoves` compares it today, and the push it takes (the Architecture Decisions table, cut to the
  survivors). Strike through the tasks below this plan will not do (T6 if no widened robot key survives; T7a–c if no
  family changes) with one line each saying why.

  **Proof:** Read — Crawford, at Checkpoint B.

  **Acceptance criteria:**
  - [ ] Every sheet has a status; no sheet is `candidate`.
  - [ ] Every survivor passes both paper tests, or its fix is on the sheet.
  - [ ] The survivor table lists every key every survivor column names, with a push for each robot key or the word
        "compared today".
  - [ ] This plan's T6–T9 say exactly which keys and families they will build.

  **Verification:**
  - [ ] Read-through. `npm run lint` clean.

  **Dependencies:** Checkpoint A. **Files:** `docs/reference/THEME_AND_ASPECT_SHEETS.md`, this plan

  **Estimated scope:** S (marks and one table)

### Checkpoint B: the cut
- [x] Crawford confirms the survivor set and the table. The spec's open question 2 (the harness committed) confirmed.
      (Passed 2026-11-03: "checkpoint A & B are both passing"; the harness takes its default, committed.)
- [x] The sheets branch is ready for his PR. Session ends here; Phase 2 starts fresh off `main` after it merges.

---

### Phase 2: The table (`feature/themes-aspects-58`)

- [x] **T5: `themes.ts` + `resolveBands.test.ts` — `ThemeColumn` is `Partial<BandTable>`**

  **Description:** Spec §1.5, widening. Delete `ThemeBandKey`; `ThemeColumn = Partial<BandTable>`. Rewrite the
  `themes.ts` header and `ThemeColumn` comments to cite this spec and say the v1 list went with the interview. Update
  the "ask first" sentence in `aspectDeal.ts`'s `rederiveLoading` comment (`:289`) to point at T6's rule instead. The
  five current columns are unchanged in this task; T8 replaces them.

  **Proof:** RED test — `src/data/bands/resolveBands.test.ts`: an injected theme column naming `reverb.decay` and
  `robot.portamento` resolves with both bands replaced and every other key Classic's (fails to compile today). The
  ten-key pin is replaced by: for every theme and every key its column names, the key is in `CLASSIC` (so a `BandKey`),
  the band has its kind (`lit` on a `ROBOT_LIT_KEYS` key or a send, `offShare` on a toggle key, `weights` on the pick
  key, `min`/`max` otherwise), and `min ≤ max` lie inside the field's full range as the existing bound check reads it.

  **Acceptance criteria:**
  - [ ] The new cases pass; the overlay cases on injected columns pass unmodified.
  - [ ] A column naming a key not in the table, or a `RangeBand` on a lit key, fails `npm run build:types` (checked by
        hand with a throwaway edit, then reverted).

  **Verification:**
  - [ ] `npx vitest run src/data/bands`
  - [ ] Mutants: the kind check accepting a `RangeBand` on a send key; the bound check skipping a global key.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint B. **Files:** `src/data/bands/themes.ts`, `src/data/bands/resolveBands.test.ts`,
  `src/systems/aspectDeal.ts` (comment only)

  **Estimated scope:** S

- [x] **T6: `aspectDeal.ts` — every survivor robot key is compared and pushed on a loading change**

  **Description:** Spec §1.5, "what a widened key costs". For each robot key in T4's survivor table that `movedFields`
  does not compare today, add the comparison and the push, per the Architecture Decisions table:
  - `audioAttributes.portamento` compared beside `VOICE_FIELDS`; its push the live glide write (no rebuild).
  - `lfoLinks` compared per target (`lane`, `depth`); its push `primeRobotLinks` (already in Voice's case; file the
    field under the family T4 names, Motion if kept).
  - `dynamics`, `accents` added to `TOP_LEVEL_FIELDS` under the family T4 names (Performance if kept, else `melody`,
    whose push `regenerateMelody` already reads `accents`; `dynamics` needs no engine call).
  - `masterVolume` compared; its push the store write plus the engine volume cache, as the volume edit does.
  Where T4 filed a field under no real family, add the case to `pushFamilyToEngine` under the family whose push
  carries it rather than a pseudo-family; the `families` set stays `AspectFamilyId`.

  **Scope from T4 (2026-11-03):** compare and push `dynamics`, `accents` (performance), `portamento`, `lfoLinks`
  (motion), `masterVolume` (voice's case; check the velocity cache follows `reReserveVoice`, else add the volume edit's
  cache write), `octaveRange` (melody's case). Add the four new keys to `bandKeys.ts` and `classic.ts` with Classic's band
  equal to today's draw: `robot.detune` (the layers' detune, read by `deriveVoiceFields`; compared and pushed already),
  `robot.octaveRegister` (a `PickBand`-shaped weighted pick over the register list), `lfoLink.lpf.frequency` (send-band
  shaped: lit share and depth on the master low-pass tie), `humanize` (a range; add it to the half-moves draw and push
  `setHumanize`). The fleet's size is not a key (Crawford, 2026-11-03). Names are fixed in this task.

  **Proof:** RED test — `src/systems/aspectDeal.test.ts`: under injected theme columns (`vi.mock('../data/bands/themes')`
  as `resolveBands.test.ts` does) that move each survivor key, a theme change through `rederiveLoading` writes that
  field alone on every robot whose draw moved, drops the swell riding it if any, and makes the push's engine call
  once per moved robot; a robot whose draw did not move is not written.

  **Acceptance criteria:**
  - [ ] One case per survivor key, passing; the F16/F20 cases pass unmodified.
  - [ ] A theme change that moves none of a robot's fields does not touch that robot (the existing no-write case).

  **Verification:**
  - [ ] `npx vitest run src/systems/aspectDeal.test.ts`
  - [ ] Mutants, per key: the comparison removed (the field is not written); the push removed (the engine mock is not
        called).
  - [ ] `grep -rln "vi.mock(.*aspectDeal\|vi.mock(.*AudioEngine" src` and run those files too.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint B (the survivor table). Parallel with T5 and T7. **Files:** `src/systems/aspectDeal.ts`,
  `src/systems/aspectDeal.test.ts`

  **Estimated scope:** M (one module and its test; a case per key)

- [x] **T7a: `robotFieldDerivation.ts` + `spawnSystem.ts` — the new family's derive function, with Classic parity**
  *(only if T4 kept Motion or Performance, or replaced Distance)*

  **Description:** Spec §1.5, the fifth-family table. Lift the draws the new family's keys make into one
  `derive<Family>Fields(noiseMap, offset, bands: Pick<BandTable, <Family>BandKey>)` at the same dataIds and offsets:
  - **Motion:** the portamento draw (`robot.audio.portamento.glider`, `robot.audio.portamento`) out of
    `generateAudioAttributes`, and `generateRobotLfoLinks`' per-target draws (`robot.lfo.<target>.quiet|lane|depth`),
    keeping `priorLaneCounts` as a parameter. If the sheet took the room sends, split `deriveSendFields` into the
    Reverb/Delay pair (Distance) and `deriveRoomSendFields` (the three exclusive sends) at their dataIds.
  - **Performance:** the `robot.dynamics`, `robot.rests`, `robot.accents` draws out of `spawnSystem.ts` into
    `derivePerformanceFields`.
  `spawnSystem.ts` calls the new function where the draws were, with `current<Family>Bands()` from the context.

  **Scope from T4 (2026-11-03):** both families, so this task runs twice (Motion first, the riskier lift). Motion's keys
  are `robot.portamento` and the three LFO depths; the room sends stay with the theme, so `deriveSendFields` does not
  split. Performance's keys are `robot.dynamics`, `robot.rests`, `robot.accents`.

  **Proof:** RED test — `src/systems/robotFieldDerivation.test.ts`: under Classic's bands the new function returns, for
  the same noise map and offset, exactly the fields `generateRobotAudioBaseline` produced before the lift (the
  fixture typed in from a run on `main` before the task, not read back); under an injected option column every value
  lands inside the column's band over 500 robots and a lit share lands within 3 points of its `lit`.

  **Acceptance criteria:**
  - [ ] Both cases pass. `spawnSystem.test.ts`'s Classic fixture passes unmodified.
  - [ ] No dataId or offset string changes (the parity case proves it).

  **Verification:**
  - [ ] `npx vitest run src/systems/robotFieldDerivation.test.ts src/systems/spawnSystem.test.ts src/utils/seedBaseline.test.ts`
  - [ ] Mutants: a dataId renamed in the lifted draw (parity fails); the band's `lit` ignored (the share case fails).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint B. **Files:** `src/systems/robotFieldDerivation.ts`,
  `src/systems/robotFieldDerivation.test.ts`, `src/systems/spawnSystem.ts`

  **Estimated scope:** M (two modules and a test; the riskiest code task)

- [x] **T7b: `aspects.ts` + `aspectDeal.ts` + `loadingNames.ts` + `home.ts` — the family wired through**
  *(only with T7a)*

  **Description:** Add the family to `ASPECT_FAMILY_IDS` (position per Crawford at Checkpoint B, default last) and
  `ASPECT_IDS_BY_FAMILY`; its `<FAMILY>_BAND_KEYS` and `AspectFamily` entry with its options' columns as T9's first
  cut (`{}` placeholders are fine here; T9 fills them); the `deriveFamilyFields` case; the `pushFamilyToEngine` case
  (Motion: the glide write and `primeRobotLinks`; Performance: `regenerateMelody`); the `TOP_LEVEL_FIELDS` entries
  filed under it; the three typed maps in `loadingNames.ts`; the content entries (`home.off.<family>`,
  `home.off.<family>.<id>` ×3, `home.off.<family>Description.none|<id>`) with stand-in words marked as such. If
  Distance is replaced, delete it the same way; its `distance` ids leave the content and the maps.

  **Scope from T4 (2026-11-03):** Motion (`gliding`, `trembling`, `sweeping`) and Performance (`steady`, `dramatic`,
  `halting`) added, default order last, in that order; Distance stays. `rests` moves from melody to performance in
  `TOP_LEVEL_FIELDS`; `dynamics` and `accents` join it there; `portamento` and `lfoLinks` are filed under motion.

  **Proof:** RED test — `src/data/bands/resolveBands.test.ts` (the family in order with its key set; an option replaces
  only its family keys; no key in two families) and `src/systems/aspectDeal.test.ts` (a robot dealt the new family is
  what it would have been had it spawned under the option; the push is called once).

  **Acceptance criteria:**
  - [ ] The cases pass. `src/content` tests pass with the new entries.
  - [ ] Compile errors guided every typed record: no `as` cast added to make one pass.

  **Verification:**
  - [ ] `npx vitest run src/data/bands src/systems/aspectDeal.test.ts src/utils src/content`
  - [ ] Mutants: the family left out of `ASPECT_FAMILY_IDS` (the order case fails); the push case removed (the deal
        case's engine mock is not called).
  - [ ] `grep -rln "ASPECT_FAMILY_IDS\|ASPECT_IDS_BY_FAMILY" src` and run every test file in the list.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T7a. **Files:** `src/data/bands/aspects.ts`, `src/systems/aspectDeal.ts`, `src/utils/loadingNames.ts`,
  `src/content/copy/home.ts`, plus the two test files

  **Estimated scope:** M (five files, mostly guided by the compiler)

- [x] **T7c: the carriers' tests — link, payload, rows, Loaded Under**
  *(only with T7b)*

  **Description:** No source change expected (spec §2's last paragraph). Extend the tests that enumerate families so
  the new one, and a dropped Distance, are covered: `worldLink.test.ts` (the family's param round-trips; a `distance=`
  param on an old link is not read and the rest loads; the mirror leaves it in the bar), `loadingIdentity.test.ts` (a
  `distance` list in a payload is dropped, the new family's list is kept canonical), `loadingStore.test.ts`'s
  `canonicalAspects` case, `OffScreen.test.tsx`'s one-row-per-family case, `loadingNames`' `describeLoadedUnder`
  through `RobotScreen.test.tsx` or `CompanyScreen.test.tsx` (a stale `distance` key is ignored). If any of these
  needs a source change, record it here as a deviation and why.

  **Scope from T4 (2026-11-03):** two new families, no family dropped; the `distance=` stale-param cases do not arise.

  **Proof:** RED test — the cases above fail before T7b's family exists only where they assert the new family; they
  are written after T7b and go RED by temporarily reverting `ASPECT_FAMILY_IDS` (the mutation check doubles as RED).

  **Acceptance criteria:**
  - [ ] Every listed file has its case; all pass.
  - [ ] No source file outside T7b's list changed, or the deviation is recorded.

  **Verification:**
  - [ ] `npx vitest run src/utils/worldLink.test.ts src/data/bands/loadingIdentity.test.ts src/stores/loadingStore.test.ts src/components/panels/screen/screens`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T7b. **Files:** the five test files

  **Estimated scope:** S (tests only)

- [x] **T8: `themes.ts` (+ `classic.ts` if a Classic sheet owns a key) — the survivor theme columns, first cut**

  **Description:** Spec §1.5, "Columns". Replace the five current columns with one per survivor theme (renamed ids per
  T4), each key with a comment citing the sheet line that needs it, every number marked "first cut, T10 measures, L1
  listens". No key outside the sheet's "Keys owned". No robot key outside T6's compared-and-pushed set. If Classic's
  sheet owns a key, move that band in `classic.ts` and re-record once: `resolveBands.test.ts`'s `EXPECTED` literal,
  `spawnSystem.test.ts`'s fixture and `robotFieldDerivation.test.ts`'s share pins, each header saying which sheet line
  asked.

  **Scope from T4 (2026-11-03):** fourteen themes, ids following the names: `classic` (empty column), `float`, `anchor`,
  `shatter`, `tide`, `trench`, `tidepool`, `floe`, `thicket`, `wreck`, `openWater`, `ventField`, `beacon`, `squall`.
  Classic's sheet owns no key, so `classic.ts` does not move. This task also builds the lit rule: a column naming any row
  of a pedal or a colour node forces its lit roll in `generateGlobalAudioSettings`, counted against the two-lit cap.

  **Proof:** RED test — `src/data/bands/resolveBands.test.ts`: `THEME_IDS` pinned to the survivor ids in row order;
  per theme, the set of keys its column names equals a literal typed from the sheet's "Keys owned" (the importance
  test, as code: a key not on the sheet fails); every band passes T5's kind-and-bounds check. The "no-op column"
  rule stands: a theme band equal to Classic's fails (it would be a key moved for nothing).

  **Acceptance criteria:**
  - [ ] The cases pass. `isThemeId` and `THEME_IDS` are the survivors; `DEFAULT_LOADING.theme` is still `classic`
        unless the cut renamed it (then the rename follows through `loadingIdentity.ts`, `worldLink.ts` reading, and
        their tests).
  - [ ] `src/content` tests still pass with stand-in names for any new id (T12 writes the real ones).

  **Verification:**
  - [ ] `npx vitest run src/data/bands src/systems src/utils`
  - [ ] Mutants: a column given a key not on its sheet (the key-set case fails); a band set equal to Classic's.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T5, T6. **Files:** `src/data/bands/themes.ts`, `src/data/bands/resolveBands.test.ts`,
  `src/content/copy/home.ts` (stand-in ids), and if Classic moved: `src/data/bands/classic.ts` and the three fixtures

  **Estimated scope:** M (data, but every number cited)

- [x] **T9: `aspects.ts` — the survivor option columns, first cut**

  **Description:** One column per survivor option in every family (renamed ids per T4), each key cited to its sheet
  line, every number marked first cut. Cut options go; new ones come in with their content stand-ins. A family's key
  set is exactly the union its surviving sheets own.

  **Scope from T4 (2026-11-03):** twenty-seven options. Melody: hypnotic, mechanical, wandering, chanting, tumbling,
  telegraph. Envelope: plucked, swelling, held, bowed, hammered, breathing. Distance: near, echoing, halfHeard (far and
  remote go). Voice: glassy, woody, hollow, brassy, muted, chiming. Motion: gliding, trembling, sweeping. Performance:
  steady, dramatic, halting.

  **Proof:** RED test — `src/data/bands/resolveBands.test.ts`: `ASPECT_IDS_BY_FAMILY` pinned to the survivors in row
  order; per option, the set of keys it names equals a literal typed from its sheet; no two options in a family are
  equal column for column; every option differs from the theme-less table on at least one key.

  **Acceptance criteria:**
  - [ ] The cases pass; the overlay and other-family cases pass unmodified (injected columns).
  - [ ] `src/content` tests pass.

  **Verification:**
  - [ ] `npx vitest run src/data/bands src/content src/components/panels/screen/screens/OffScreen.test.tsx`
  - [ ] Mutants: an option given a key off its sheet; two options made equal.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T5; T7b if a family changed. **Files:** `src/data/bands/aspects.ts`,
  `src/data/bands/resolveBands.test.ts`, `src/content/copy/home.ts`, `src/utils/loadingNames.ts`

  **Estimated scope:** M

### Checkpoint C: the table stands
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (any pre-existing failure named). (At T9: 13,521 passed;
      lint 0 errors, its 4 warnings standing before this phase.)
- [x] Classic spawn is byte for byte what it was, or moved once for a named Classic sheet key (the fixtures say which).
      (No Classic sheet key; the parity literal and the spawn fixtures pass unmodified.)
- [x] Every survivor column's keys are its sheet's; every robot key has a compared-and-pushed path (T6's cases).
- [x] If a derive function was added: `generateRobotRosterBaseline(noiseMap, 12)` re-timed as T18 did; still under
      the 16 ms line. (See the re-time below.)
- [x] Reviewed with Crawford. Session ends here. (Passed, Crawford, 2026-11-03. Next: T10, in a fresh session.)
- Crawford's answers (2026-11-03): a lit share of 0 as a column's "none" is fine; an off share of 1 as "always off"
  (and the `seedToggleValue` guard) is fine; a theme forcing more than two pedals lights them all and no coin pedal, as
  built; `scripts/sketch` is type-checked (T10 adds it to a tsconfig include).
- **The re-time (2026-11-03, the desktop, non-essentials shut down).** EVEN_SEEDED_DRAWS T0's recipe: median of 200
  runs after 20 warm-ups, a different world each run, three runs, under Classic and three themes that move the most
  (Shatter, Tide, Squall). A temporary `src/utils/zzTime.test.ts`, deleted after the run.

  | Generator | T18 (after Even Seeded Draws) | Now: Classic | Shatter | Tide | Squall |
  |---|---|---|---|---|---|
  | `generateRobotRosterBaseline(noiseMap, 12)` | 5.60 ms | 5.61–5.79 ms | 5.62–5.70 ms | 5.84–5.90 ms | 5.66–5.86 ms |
  | `generateWorldSeedBaseline` | 1.25 ms | 1.21–1.26 ms | 1.24 ms | 1.25–1.26 ms | 1.23–1.29 ms |

  T7a's two derive functions and the themes cost nothing measurable (within 0.3 ms of T18, run to run); both stay about
  a third of the 16 ms stop line, so no cache.

---

### Phase 3: The measured sketch and the listens

- [x] **T10: `scripts/sketch/measureBands.harness.ts` + `vitest.sketch.config.ts` + `package.json` — the harness**

  **Description:** The committed T18 recipe (Architecture Decisions). For every survivor theme: `withLoading({ theme,
  aspects: {} })`, 300 locales × 12 robots through `generateRobotAudioBaseline`, and 300 style names through
  `generateWorldSeedBaseline`. For every survivor option: 300 × 12 robots through `applyDealToBaselines` with that one
  pick under Classic and under each theme (the override grid's cells). Wrap `getUniformSeededVal` and
  `getCentredSeededVal` to record, per dataId, the value as a fraction of the band handed to the call, and read the
  resulting Robot and global fields to record per band key: low, median, high, and the realised lit or toggle share.
  Write `docs/sketches/data/theme-and-aspect-sketch.json` with the written bands (`resolveBands` output) beside the
  realised values, the override grid (theme column keys ∩ each family's key set), and the timings. Add
  `"sketch:bands": "vitest run --config vitest.sketch.config.ts"` to `package.json`. The config includes
  `scripts/sketch/**/*.harness.ts` only. Verified against the repo: `vitest.config.ts` includes only
  `src/**/*.{test,spec}.{ts,tsx}` and `scripts/**/*.{test,spec}.mjs`, and `eslint.config.js`'s text-read rule has the
  same globs, so the harness is outside both. `tsconfig.app.json` includes only `src`, so `npm run build:types` does
  not type-check the harness; vitest strips its types at run time. Add `scripts/sketch` to a tsconfig include so
  `npm run build:types` checks the harness (Crawford, Checkpoint C, 2026-11-03: yes).

  **Proof:** Run — `npm run sketch:bands` writes the JSON; `npm test` does not run the harness (its file count is
  unchanged).

  **Acceptance criteria:**
  - [x] The JSON has an entry for every survivor theme and option and every key its column moves, with written and
        realised values.
  - [x] Under Classic the realised robot spread matches T18's after-table within sampling noise (a sanity check by eye).
  - [x] `npm run lint` is clean with the harness in place (the file is not a test, so the text-read rule does not
        fire; if it does, the file moves, not the rule).

  **Verification:**
  - [x] `npm run sketch:bands`; `npm test` file count unchanged; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint C. **Files:** `scripts/sketch/measureBands.harness.ts`, `vitest.sketch.config.ts`,
  `package.json`, `docs/sketches/data/theme-and-aspect-sketch.json`

  **Estimated scope:** M (one script, a config, a script entry, the data)

- [x] **T11: `docs/sketches/theme-and-aspect-sketch.html` — the page**

  **Description:** Spec §1.6. Static HTML and a little JS reading the JSON (relative path), following the sketch page
  rules (each frame `section.frame` with a sticky `div.bar` holding the h2 and its options; page-wide toggles in the
  fixed panel). Three frames: **Spread** (per axis, a table of band key × column, each cell the written band over the
  realised low/median/high and share; a cell whose realised spread is not its written band is marked); **Override
  grid** (theme × family, the keys taken, with the theme's sheet "Overlaps" promise typed beside it); **Coverage** (per
  theme, keys moved vs. the sheet's "Keys owned", a `SHEET_KEYS` constant typed by hand from the sheets file; a
  moved-not-owned or owned-not-moved key is a marked row). A header line names the JSON's run date and the commit.

  **Proof:** Look — open the page from a checkout; every survivor appears; a marked cell or row is visible at a
  glance; the page has no numbers the JSON did not supply.

  **Acceptance criteria:**
  - [x] The three frames render from the committed JSON with no server.
  - [x] `SHEET_KEYS` equals the sheets file's "Keys owned" lists (read side by side).

  **Verification:**
  - [x] The Look, recorded in the commit. `npm run lint` clean (the page is not linted; nothing else changed).

  **Dependencies:** T10. **Files:** `docs/sketches/theme-and-aspect-sketch.html`

  **Estimated scope:** M (one page)

### Checkpoint D: the look
- [x] Crawford opens the sketch. Every realised spread is its written band; every promised overlap is in the grid;
      the coverage frame has no marked row, or each marked row is fixed on the sheet or in the column first.
      (The look: "seems fine". `robot.masterVolume`'s mark stands by Crawford's call; Trench's grid mark fixed on the
      sheet; coverage had none.)
- [x] The three listen worlds confirmed (open question 3). (The three presets, as answered.)
- [x] Session ends here. (Passed, Crawford, 2026-11-03. Next: L1, the themes listen.)
- Crawford's answers (2026-11-03):
  - **`robot.masterVolume` stays as built** ("I'm fine with it"). `masterVolumeFrom`'s register bias and its
    0.5-0.95 clamp keep reaching past a theme's written band: a bass robot plays louder and a treble one quieter than
    the band says, and Open Water's 0.45 floor is never reached. The sketch keeps marking the three cells; they are
    known, not a fault.
  - **Trench's Overlaps fixed** ("yes"): the sheet now says Performance would take `robot.rests`, the gaps, and the
    gaps leave the survivor sentence. The page's `SHEETS` entry carries the same text. Proof: Read, and the page
    rendered again in headless Chrome from file://: the grid has no marked cell, the spread one marked row
    (`robot.masterVolume`, three cells), coverage none.
  - **The theme for the family listens** (open question 4): the default stands for now, Classic then the grid's
    riskiest theme; Crawford may name a different one at L2 ("we'll see").

- [ ] **L1: the themes listen — three worlds × every survivor theme, no aspect**

  **Description:** Spec §1.7 step 1. A fixed listen sheet appended to this plan under "Listen record": per world, per
  theme, what was heard first, second and third against the sheet, and a verdict (keep, retune, cut). Two themes
  that cannot be told apart inside a minute fail the set: one is retuned on its sheet's sentences or cut. Each retune is
  a task **R\<n\>** added below this one: the sheet sentence it answers, the key, the old and new band, `npm run
  sketch:bands` re-run and the JSON recommitted, the kind-and-bounds and key-set tests still passing.

  **Proof:** Look (a listen) — Crawford's record.

  **Acceptance criteria:**
  - [ ] Every survivor theme has a verdict on each of the three worlds.
  - [ ] Every retune has an R-task with a sheet sentence; no number moved without one.

  **Verification:**
  - [ ] After the last R-task: `npx vitest run src/data/bands`, `npm run sketch:bands`, `npm run build:types`,
        `npm run lint` clean.

  **Dependencies:** Checkpoint D. **Files:** this plan (the record), `src/data/bands/themes.ts` and the JSON per
  R-task

  **Estimated scope:** S per R-task

- [ ] **L2: the families listen — each option against the row empty**

  **Description:** Spec §1.7 step 2. Under Classic first, then under the theme the override grid marks as taking the
  most from that family (open question 4): each survivor option on alone, against no pick, in one world. Verdict per
  option against its sheet; retunes as R-tasks on `aspects.ts`.

  **Proof:** Look (a listen) — Crawford's record.

  **Acceptance criteria:**
  - [ ] Every survivor option has a verdict under both themes.
  - [ ] Every retune has an R-task with a sheet sentence.

  **Verification:**
  - [ ] As L1's.

  **Dependencies:** L1. **Files:** this plan, `src/data/bands/aspects.ts` and the JSON per R-task

  **Estimated scope:** S per R-task

- [ ] **L3: the risky pairs**

  **Description:** Spec §1.7 step 3. The override grid's cells where a family takes a key the theme's sheet leans on
  (its "Heard first" or "second" key): the theme with that option on, in one world. Verdict: the theme's sentence
  survives, or the theme's "Promise" line is amended on the sheet to stop promising it, or the option is retuned.

  **Proof:** Look (a listen) — Crawford's record.

  **Acceptance criteria:**
  - [ ] Every marked cell has a verdict; every amended promise is on the sheet.

  **Verification:**
  - [ ] As L1's.

  **Dependencies:** L2. **Files:** this plan, the sheets file, the column files and the JSON per R-task

  **Estimated scope:** S per R-task

### Checkpoint E: the listens
- [ ] Every survivor theme and option is kept or retuned, none `candidate`, and the listen record is complete.
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean; the JSON is from the final columns.
- [ ] Reviewed with Crawford. Session ends here.

---

### Phase 4: Copy and docs

- [ ] **T12: `src/content/copy/home.ts` — the words**

  **Description:** Spec §1.8. For every shipped theme: `home.off.theme.<id>` and `home.off.themeDescription.<id>`
  from the sheet's "Promise", one sentence, promising nothing an aspect can override (the sheet's "Overlaps"). For
  every family: `home.off.<family>`, its option names, and `home.off.<family>Description.none|<id>`. Remove every
  stand-in and every cut id's entry. Crawford's words where he gave them at the listens; Claude's draft otherwise,
  each marked for his pass in the commit message, not in the file.

  **Proof:** Read — Crawford. No test file: `src/content/content.test.ts` already guards the key set and passes.

  **Acceptance criteria:**
  - [ ] Every shipped id has its entries; no cut id has one; no entry says "stand-in".
  - [ ] Each theme sentence names only keys the theme's sheet owns and no family can take.

  **Verification:**
  - [ ] `npx vitest run src/content src/utils/describeWorld.test.ts src/components/panels/screen/screens/OffScreen.test.tsx`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint E. **Files:** `src/content/copy/home.ts`

  **Estimated scope:** S

- [ ] **T13: the two grids — "Loading ranges by theme and aspect" rewritten to the shipped set**

  **Description:** `docs/reference/GLOBAL_CHAIN_GRID.md` §"Loading ranges by theme": every global row any theme
  moves, one column per shipped theme, and the paragraph rewritten (no "v1 key list", no "assumption 16").
  `docs/reference/ROBOT_DATA_GRID.md` §"Loading ranges by theme and aspect": the theme table over every robot key a
  theme moves, then one table per family; each row's sheet sentence in the notes under the table. Every number typed
  from the shipped `themes.ts` and `aspects.ts`, spot-checked.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every column in the grids equals the shipped code, value for value.
  - [ ] The word "placeholder" is gone from both sections.

  **Verification:**
  - [ ] Spot-check every number against the source. `npm run lint` clean.

  **Dependencies:** T12. **Files:** `docs/reference/GLOBAL_CHAIN_GRID.md`, `docs/reference/ROBOT_DATA_GRID.md`

  **Estimated scope:** S (docs only)

- [ ] **T14: `AUDIO_SYSTEM.md`, `COMPANIES.md`, `UI_SHELL.md`, the code comments — the set as shipped**

  **Description:** `docs/AUDIO_SYSTEM.md`'s band-table bullet "Themes and aspects": `ThemeColumn` over the whole table,
  the shipped families and options, the derive function per family, the rederive comparison's new fields, the
  harness and the sketch page. `docs/COMPANIES.md`'s "The deal" if the family list moved. `docs/UI_SHELL.md`'s off
  screen paragraph if the row count moved. Comments: `themes.ts`, `aspects.ts`, `aspectDeal.ts`, `loadingNames.ts`,
  `home.ts` headers describe the shipped set and cite this spec; `grep -rn "ThemeBandKey\|v1 key list\|assumption 16"
  src docs --include=*.ts --include=*.md` finds only archives and history. Mark the spec's and intent's status lines
  built, with any deviation from the spec named.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No live doc or comment describes the ten-key list or the placeholder set as current.
  - [ ] Every named identifier spot-checked against the source.

  **Verification:**
  - [ ] The grep above; `npm run lint` clean.

  **Dependencies:** T13. **Files:** `docs/AUDIO_SYSTEM.md`, `docs/COMPANIES.md`, `docs/UI_SHELL.md`, the spec, the
  intent, comments in the five source files

  **Estimated scope:** S (docs and comments)

- [ ] **T15: `docs/todo/` — roadmap 58 and plan.md**

  **Description:** Roadmap 58's entry: "Done — merged via PR #N", the archive move per the todo conventions (the phase
  moves whole to `archive/roadmap-archive.md` with links rebased, a stub with any Open item stays), and plan.md's
  Stage 1 line deleted. Backlog 62's copy bullet that defers to 58's copy step is updated. Done after Crawford's PR
  merges, on a docs branch, as the convention says.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Roadmap 58 is archived with every inbound anchor resolving; plan.md no longer lists it.

  **Verification:**
  - [ ] A before/after broken-link count over `docs/`. `npm run lint` clean.

  **Dependencies:** T14, the merge. **Files:** `docs/todo/roadmap.md`, `docs/todo/archive/roadmap-archive.md`,
  `docs/todo/plan.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean; `npm run sketch:bands` runs and its
      JSON matches the committed one.
- [ ] Every task's acceptance criteria met; every mutant listed killed, or recorded and argued equivalent.
- [ ] Spec §7's success criteria read against the shipped code and the listen record, one by one.
- [ ] Crawford's reads (sheets, copy, docs) and looks (sketch, listens) all recorded in this file.
- [ ] Ready for Crawford's PR.

## Listen record

(Filled in at L1–L3: per world and theme, per option, per pair — what was heard first, second and third against the
sheet; the verdict; the R-task if any.)

## As Shipped

(Filled in as the build goes: Checkpoint A's and B's one-line answers to the open questions; T4's strike-outs; each
task's deviations; the final survivor set.)

**Phase 0–1 (2026-11-02).** The spec and this plan were committed as their own commit on `docs/intent-themes-aspects-58`,
and T0 on that branch too (the roadmap and the intent are its files); `docs/sheets-58` branched from it for T1–T3.
No deviation from the task text. The sheets file holds fifty sheets: the twenty-one current, ten theme candidates
(Trench, Tidepool, Floe, Thicket, Wreck, Current, Open Water, Vent Field, Beacon, Squall), three option candidates each
for Melody, Envelope and Voice, two for Distance with a reproposal paragraph, and the Motion and Performance family
sheets with three options each. Motion's sheet leaves the three room sends with the theme, so `deriveSendFields` does
not split unless the cut says otherwise. Bold's and Perilous's shaped stages sit under "Leaves alone" (moved by the
placeholder for no reason the sheet can give); Adventurous is written so its statistic can be seen.

**Ask-firsts the sheets raised, for Checkpoint A:** a pedal lit in every world (Current: Vibrato; Vent Field: Auto-Wah
and Phaser; Squall: Tremolo); a colour node lit in every world (Wreck); the octave register (Trench); the fleet's size
(Open Water); pitch drift (Current, Motion); Humanize (Beacon, Performance). None owns a key for it.

**Checkpoint A, the theme marks (2026-11-03).** Crawford's first marks, recorded on the sheets as T4's first commit:
Adventurous cut; Calm, Bold, Perilous and the Current candidate renamed Float, Anchor, Shatter (by way of "Gale") and
Tide, each redefined from his notes (Gemini-assisted, checked against the band table). "Undertow" in his notes was Tide.
Redundancy fixes he took: the pumping compressor is Squall's alone; Shatter has no resonance or sweep (Vent Field's) and
is square-free (Anchor's); Vent Field is pushed all the way into its sweep. Neighbours kept as they are: Squall, Vent
Field, Open Water, Thicket, Tidepool. One rule relaxed by him: a sheet may carry a "Sketch starting points" line of his
numbers, guesses for the sketch and not rules (spec §1.3 and the sheets file's rules say so). The option sheets'
"Overlaps" lines still name the old themes until the family marks.

**The ask-firsts, answered (Crawford, 2026-11-03), recorded on the sheets' rules and the sheets:** pitch drift is no
theme's business (dropped everywhere). Two new robot keys are agreed and built at T6: `robot.detune` (the fixed offset
between a probe's layers; Anchor none, Shatter wide) and `robot.octaveRegister` (a weighted pick over the register list;
Trench low, Shatter high); their names are fixed at T6, and T6/T8's key-set tests must learn them. **A theme that names a
pedal's or a colour node's rows lights it in every world; a theme that names none leaves the coin.** So Shatter lights
all three colour nodes, Wreck the drive and the crush, Tide the Vibrato, Vent Field the Auto-Wah, Squall the Tremolo; a
theme that wants no drive owns `gritSend` at none (Float). T5/T8 must build the rule: a column naming any row of a pedal
or node forces its lit roll, and the two-lit pedal cap counts a forced pedal. **Three more keys (Crawford, 2026-11-03,
"make them keys"):** `lfoLink.lpf.frequency` (the master low-pass cutoff's tie to the global LFO bank, send-band shaped:
a theme naming it forces the tie live; Tide), `fleetSize` (how many probes a fresh world holds; Open Water fewer) and
`humanize` (the per-world timing scatter; Beacon none; whether Performance's options own it waits for the family marks).
**Then struck (Crawford, 2026-11-03, "we're definitely not changing fleet size"):** `fleetSize` is not a key; Open
Water's sheet dropped it and the roster stays `MAX_ROBOTS`. Four new keys in all; nothing the sheets want is an ask-first
any more.

**The family marks (Crawford, 2026-11-03, "taking all of your recs; keep Near"):** every family and option proposed is
kept; Motion and Performance come in as the fifth and sixth families; Distance stays as Near, Echoing and Half-heard, and
Far and Remote are cut as rungs. Of the fourteen theme sheets, Float, Anchor, Shatter and Tide are renamed and Tidepool,
Thicket, Open Water, Vent Field and Squall kept ("keep those as is"); Classic, Trench, Floe, Wreck and Beacon carry no
mark yet. If all fourteen stand, the theme row exceeds Crawford's "no axis past eight" expectation, and the off-screen
layout question goes to Checkpoint E as the intent says. **Six families** of 6 / 6 / 3 / 6 / 3 / 3 options. Two keys filed by default and open to his move: `robot.detune`
stays the theme's, `humanize` stays the theme's. So T7a–c (a family added) and T6 (widened robot keys: every theme now
names Voice, Envelope and Motion keys) both run; the Architecture Decisions table and the survivor table must carry the
five new keys. Still open: open questions 1, 3, 5, 6; then T4's two paper tests and the survivor table.

**T4 done (2026-11-03).** Crawford's last answers: Classic, Trench, Floe, Wreck and Beacon kept; the two defaults
(`robot.detune` and `humanize` stay the theme's) fine as filed; open questions 1, 3, 5 and 6 answered (defaults stand;
no cut for count, "I want to hear them before I cut them"). Every sheet has a status: 43 kept, 4 renamed, 3 cut, none
candidate. The paper tests ran over every survivor and pass with no fix needed (one line per sheet). The survivor table
is on the sheets file, T6–T9 carry "Scope from T4" lines, and nothing is struck: both T6 and T7a–c run, T7a twice. Open
question 7 is answered by the table (no pseudo-family). Lint clean.

**Checkpoints A and B passed (Crawford, 2026-11-03).** One correction with the pass: the fleet's size is not a key
("we're definitely not changing fleet size"); struck from the rules, Open Water's sheet, the survivor table and T6's
scope. Four new keys remain. Open question 2 takes its default: the harness is committed.

**Next:** Crawford's PR for `docs/sheets-58` (and `docs/intent-themes-aspects-58`); Phase 2 (T5) starts fresh off `main`
after it merges. (Merged as PR #599; `feature/themes-aspects-58` branched from it, 2026-11-03.)

**T5 (2026-11-03).** `ThemeBandKey` deleted, `ThemeColumn = Partial<BandTable>`. The RED was the type check: the test
injects Adventurous with `reverb.decay` and `robot.portamento` as `satisfies ThemeColumn`, which failed `build:types`
until the widening. The ten-key pin is now one kind-and-bounds check (`bandProblems` in `resolveBands.test.ts`) run over
every theme and aspect band; its full ranges are a complete record over the robot keys, the tempo and the sends (so a
new key without a bound does not compile) plus `GLOBAL_AUDIO_SEED_RANGES` for the global rows. The check has negative
cases of its own, which kill both named mutants (the send clause dropped from the kind check; the global bound skipped).
One deviation: the acceptance's "checked by hand with a throwaway edit" is held for good as `@ts-expect-error` lines (a
key outside the table, a plain range on a lit key and on a send, a return level), so `build:types` keeps checking it.

**T6 (2026-11-03).** The four new keys are named `robot.detune`, `robot.octaveRegister`, `humanize` and
`lfoLink.lpf.frequency`; the table holds 83 bands. `robot.octaveRegister` weighs five register ids, `bass`, `low`, `mid`,
`high`, `treble` (`src/data/octaveRegisters.ts`, the list moved out of `spawnSystem.ts`), through a `PickBand<O>` made
generic and one `pickWeighted` the waveform shares; `humanize` and the low-pass tie are `WORLD_RANGE_KEYS` and
`WORLD_LIT_KEYS` in `bandKeys.ts`. Classic's four bands are today's draws, so spawn is unchanged: the parity rosters
pass with no value moved. `HUMANIZE_SEED_RANGE` went into the table (its guard in `globalAudioSeed.test.ts` now reads
Classic's band). Deviations, all from the order of the plan (T6 runs before T7b makes Motion and Performance):
- **Filing until T7b.** `accents` and the register under Melody (the push `regenerateMelody`); `dynamics` under no
  family (`null`: the Dynamics edit makes no engine call, so the write is all); `masterVolume` and `lfoLinks` under
  Voice (`reReserveVoice` reserves at the robot's volume, so the velocity cache follows; then `primeRobotLinks`); the
  glide under Envelope, whose push now also makes the Portamento edit's live write (`updateVoicePortamento`). T7b refiles
  the Performance fields and the glide and links under their own families.
- **`masterVolume` joins `RobotAudioBaseline`**, drawn outside the copy branch as `spawnRobot` draws it
  (`seedMasterVolume`), so a loading change can compare it. The session diff never reads it (a listening choice). The
  parity fixtures gained one `masterVolume` per robot, computed with `main`'s formula and checked equal.
- **A moved register writes `audioAttributes.octaveRange` too** (the body scale reads it), so an untweaked world ends
  what a fresh build gives; the top-level field carries Melody's push.
- **Humanize** is drawn per loading in `deriveGlobalHalfMoves` and written through `setHumanize`; a style switch still
  carries it forward.
- **The cases are their own file**, `src/systems/aspectDeal.widened.test.ts`, so `aspectDeal.test.ts`'s real-column
  cases run unmodified. One case I wrote expected an LFO depth key to move only its own targets; the lane tally moves
  other targets' lanes too, as a fresh build does, so the case now expects every moved target.

**T7a, Motion (2026-11-03).** `deriveMotionFields(noiseMap, offset, bands, priorLaneCounts)` in
`robotFieldDerivation.ts` composes two lifted pieces, `derivePortamento` and `deriveLfoLinks`, because spawn draws the
glide inside `generateAudioAttributes` and the links apart (with the roster's lane tally); `generateRobotLfoLinks` stays
as spawn's wrapper over `deriveLfoLinks` and `currentMotionBands()`. `MotionBandKey` is a plain union in `aspects.ts`
until T7b makes it the family's key list. The parity fixture (seven fresh robots, two gliders, lit gain, detune and bus
links) was captured at `b35a8558` before the lift; the spawn fixtures pass unmodified. Five mutants killed (two dataIds
renamed, either lit ignored, the lane tally mutated in place).

**T7a, Performance (2026-11-03).** `derivePerformanceFields(noiseMap, offset, bands)` draws the three at their own band
keys as dataIds, as before; `spawnRobot` keeps its alea fallback beside it for a world with no noise map, and
`PerformanceBandKey` is a plain union until T7b. Parity fixture from the same capture; three mutants killed (a dataId
renamed, the band ignored, two fields swapped). The plan's "lit share within 3 points" does not apply here (three plain
ranges); the case checks every value whole and inside its band, both ends reached.

**T7b (2026-11-03).** Motion and Performance are families five and six, their options `{}` until T9, their content
entries stand-ins marked in `home.ts`. The refiling T6 left for here: `rests` and `accents` under Performance, the glide
and the links under Motion (Motion's push: the live glide write and `primeRobotLinks`, no rebuild), Envelope's push back
to the adsr alone. Deviations:
- **`dynamics` stays filed under no family** in the comparison, not Performance: a dynamics move needs no engine call
  (the Dynamics edit makes none), so filing it would regenerate a melody for nothing. A Performance *deal* still pushes
  Performance whole.
- **One regeneration, not two.** Melody's and Performance's pushes are the same `regenerateMelody`, so a robot dealt
  both, or a change moving both, regenerated twice; `aspectDeal.test.ts`'s rests case caught it. `pushFamilies` skips
  Performance's push when Melody's runs.
- **The Motion deal's lane tally** is the roster before the robot as spawned (undealt), so the baseline, the live deal
  and a re-derive agree without each robot waiting on the deals before it.
- **Two OffScreen row pins moved here from T7c** (the family row labels, the description line count), since the suite
  must pass at this commit; T7c adds the carriers' cases proper.
Seven mutants killed. Full suite: 13,446 passed; the 3 failures were those two pins and the documented
`sceneToOrbiterLocal` parallel-run timeout (passes alone).

**T7c (2026-11-03).** No source change. Cases added: the link writes and reads all six families' params, Motion and
Performance last, and drops another family's id in either (`worldLink.test.ts`); a payload keeps both lists canonical
(`loadingIdentity.test.ts`); `canonicalAspects` and `canonicalPicks` over six families (`loadingStore.test.ts`); the
Loaded Under line names them after the four (`RobotScreen.test.tsx`, `CompanyScreen.test.tsx`). The OffScreen row pins
moved at T7b. RED by reverting `ASPECT_FAMILY_IDS` to four: 8 failures (the 6 cases, the 2 pins).

**T8 (2026-11-03).** Fourteen columns in `themes.ts`, each key commented with its sheet sentence, every number a first
cut (the file header says so once, not per line); Crawford's "Sketch starting points" taken where given, Float's
release clamped to the 2 s slider (his 1.5 to 3 s). `resolveBands.test.ts` types each sheet's "Keys owned" in as
`SHEET_KEYS` and holds every column to it, to the kind-and-bounds check and to "no band equal to Classic's". The lit
rule is `themeLights(column)` in `themes.ts` (any row of a colour node or of the four dry-chain pedals; the rooms light
nothing), installed beside the table by the loading context (`isLitByTheme`, restored by `withLoading`) and read at the
rolls in `generateGlobalAudioSettings`: a named node is lit on top of the character's pick, a named pedal is lit
whatever its roll and counts against the cap from the start, so a coin pedal lights only while fewer than two are lit
counting the forced ones. Classic draws, and lights, exactly as before (with nothing forced the AutoWah and Phaser
never meet the cap). Content: the fourteen names and each sheet's Promise line as the stand-in description (T12 writes
the words). Deviations:
- **A lit share of 0 is a column's "none".** T5's check refused lit 0; the sheets ask for none (Float's Grit send,
  Anchor's glide, detune links and rooms, Tidepool's and Shatter's rooms, Shatter's sweep), and every generator reads
  lit 0 as never (a roll under 0 never lands, a quiet roll under 1 always does). The check now takes [0, 1]; Classic's
  own shares stay in (0, 1].
- **A theme forcing more than two pedals lights them all and no coin pedal.** No real column does (each forces at most
  one); the case is held on an injected column so the rule has an answer.
- **Owning a row to light a pedal moves its band.** Tide's `vibrato.wet` and Vent Field's `autoWah.wet` would equal
  Classic's as written, a no-op the key-set test fails; each is nudged up (0.95 to 1, 0.45 to 0.6).
- **The test ripple.** Eighteen test files named the old ids; `calm`, `bold`, `perilous` and `adventurous` became
  `float`, `anchor`, `shatter` and `tide` (a script over quoted ids, object keys, content keys and link params), plus
  the display names the describeWorld and status-line cases pin. Four cases had leaned on the old columns' contents and
  were restated: `aspectDeal.test.ts`'s push case now expects Voice's rebuild for exactly the robots whose voice moved
  (Shatter moves the waveform and the layers), its swell case counts every swellable field (Shatter's detune drops
  layer swells), its tweak case runs under Trench, and `worldTransition.test.ts`'s "no voice re-reserved" case runs
  under Beacon, the one survivor naming no Voice key. `globalAudioSeed.test.ts`'s injected Sync-band column names the
  Chorus rate instead of the Phaser's, since a Phaser row now lights the Phaser.
- `DEFAULT_LOADING.theme` stays `classic`; the presets carry no theme, so nothing there moved.
Fourteen mutants killed: the two the task names (a key off a sheet, a band equal to Classic's), a sheet key dropped, a
band outside its field, the lit rule's six (nothing lit, a room lit, a node ignoring the theme, a named node replacing
the character, a forced pedal uncounted, unforced or capped), the context's two (lights not installed, not restored)
and the lit check refusing lit 0. "Not restored" first survived: its case drew `before` after an earlier case's install
had leaked under the mutant; `before` is now drawn inside an explicit Classic install.

**T9 (2026-11-03).** Twenty-seven option columns in six families (6 / 6 / 3 / 6 / 3 / 3), the new ones after the
options that stood, in the sheets' order: Melody adds Chanting, Tumbling, Telegraph; Envelope Bowed, Hammered,
Breathing; Distance is Near, Echoing, Half-heard (`halfHeard`; Far and Remote gone from the ids, the maps and the
content); Voice adds Brassy, Muted, Chiming; Motion and Performance fill their `{}`. The twelve options that stood keep
the numbers their listens left: each sheet owns exactly the keys its column already named. Each new key is commented
with its sheet sentence; every number is a first cut. `resolveBands.test.ts` types each option's "Keys owned" in
(`OPTION_SHEET_KEYS`) and holds every column to it and to the kind-and-bounds check; per family, no two options equal
and the key set the union of its sheets; per option, a difference from the theme-less table somewhere (the plan's
rule, weaker than the themes': an option band equal to Classic's still overrides a theme that moves the key). Content
stand-ins: the new names and each sheet's Promise line as the sentence. Deviations:
- **An off share of 1 is a sheet's "always off"** (Tumbling: "never tiles a figure"). T5's check refused it, and
  `seedToggleValue` divided by zero at a draw of exactly 1 (NaN); the toggle now lands off for any draw when the off
  share is 1, with cases at both ends of the off share in `robotFieldDerivation.test.ts`, and the check takes [0, 1].
- **The test ripple.** `far` and `remote` became `echoing` and `halfHeard` in eleven test files (the same script as
  T8's); two `spawnSystem.test.ts` cases had leaned on Remote's deep sends on every robot and now run under Echoing,
  with its own bounds; two OffScreen pins on the Melody row's option count moved to six.
Nine mutants killed: a key off a sheet, a sheet key dropped, two options equal, an option equal to Classic everywhere,
an option band outside its field, a cut id still listed, a new id out of row order, the toggle guard removed, the off
share check refusing 1.

**T10 (2026-11-03).** `npm run sketch:bands` runs `scripts/sketch/measureBands.harness.ts` in 183 s on the desktop and
writes `docs/sketches/data/theme-and-aspect-sketch.json` (900 KB, four significant figures). Per theme: `moves`,
`lights`, the full written table, every one of the 83 band keys realised over 300 worlds × 12 robots or 300 styles
(n, low, median, high, and the share or the picks), the override grid, and the per-dataId draw record for the robots
and the world apart (draw function, n, low / median / high fraction of the band, outer-tenths share, distinct values).
Per option: its keys, its written bands, and those keys realised under each of the fourteen themes, every robot of the
same 300 rosters dealt the option. Per theme, the timings. Each band key has a reader over the robot or world fields (a
record over every robot key, so a new key does not compile until it is read): a shaped stage reads the shaped robots
and the plain stage the rest; the open cutoff the open robots and the accent rows the accent ones (told apart by the
bus Q); a Mix row of a node or pedal is a lit share plus the lit worlds' values; the shift its magnitude. Proof (Run):
the JSON has every survivor theme (14) and option (27) and every key each moves, none missing; `vitest list` finds
353 files, HEAD's count, none of them the harness; `npm run build:types` and `npm run lint` clean (0 errors, the 4
standing warnings).
- **Classic against T18, by eye.** Robots: the even draws' outer tenths 18.2-21.7 % over the 43 dataIds drawn at
  least 1,000 times (T18: 19.0-20.7 % over ten times the robots), the centred 4.1-4.3 % (T18: 3.9-4.0 %), every draw
  distinct. The world, 300 styles: 14-26 % even, 4.7-7.0 % on the three EQ bands. Within sampling noise.
- **Timings** (the harness's own, wrappers installed, 50 runs after 10 warm-ups): the roster 5.2-6.5 ms, the world
  1.2-1.6 ms across the fourteen themes, as Checkpoint C's re-time.
- **A finding for Checkpoint D: `robot.masterVolume` never realises its written band.** `masterVolumeFrom`
  (`spawnSystem.ts`) adds a register bias of up to +0.125 (bass) or -0.075 (treble) after the band draw, then clamps to
  0.5-0.95: Classic's 0.65-0.85 realises 0.58-0.95, Open Water's 0.45-0.65 realises 0.50-0.77 (its floor cannot be
  reached), Squall's 0.8-0.95 realises 0.73-0.95. The sketch marks the three cells; nothing here changes it.
- **Deviations.** (1) The type check is its own `tsconfig.sketch.json` (the app's options, plus Node's types, over
  `scripts/sketch` and the two vitest configs), and `build:types` runs it after the app's: putting the harness in
  `tsconfig.app.json` would have brought Node's globals into the app's program. (2) The harness also writes
  `theme-and-aspect-sketch.data.js`, the same data as `window.THEME_AND_ASPECT_SKETCH`: a page opened from a checkout
  (file://) cannot fetch a JSON file, and T11's page must open with no server. The JSON stays the record. ESLint
  ignores `docs/sketches/data/*` (flat config lints a `.js` by default). (3) The run is async and yields to the event
  loop at each step: a first run that never yielded wrote the data and then failed on vitest's "Timeout calling
  onTaskUpdate". (4) The output path resolves from the repo root, where the npm script runs: under jsdom
  `import.meta.url` is not a file URL.

**T11 (2026-11-03).** `docs/sketches/theme-and-aspect-sketch.html` loads `data/theme-and-aspect-sketch.data.js` with a
script tag (T10's carrier) and opens from file://. Three frames, each a sticky bar: **Spread** (an Axis row, themes or
one of the six families; a family's view has an "Under theme" pick, the cell's robots all dealt the option), **Override
grid** (theme × family, the keys taken, the sheet's Overlaps beside each theme), **Coverage** (moved and owned, moved not
owned, owned not moved). The fixed panel holds "marked only" and the mark rules. The one hand-typed constant is
`SHEETS`, each theme sheet's "Keys owned" and "Overlaps" (named `SHEETS`, not `SHEET_KEYS`, since it carries both); its
thirteen key lists were checked equal, key for key, to `resolveBands.test.ts`'s `SHEET_KEYS`, typed from the same sheets
at T8. The marks' rules are on the panel: a value more than 2 % of the band's width outside it or filling under 90 % of
it; a share more than 2 points or 4 standard errors off its expectation (the plain sends after the 1 % grid, the Shimmer
and Double sends after the earlier rooms' rolls, which is why Floe's, Thicket's and Tide's room sends read under their
`lit` and are not marked); a Mix row the theme lights that is dark in some world; a grid cell whose sheet's Overlaps
names neither the family nor a key taken; a coverage difference. The rules are the page's only numbers of its own.
Proof (Look, headless Chrome from file://, plus the page's own script run over every family × theme view, 84 views):
every survivor theme and option appears; **three marks**, each visible at a glance:
- `robot.masterVolume` under Classic, Open Water and Squall, outside the band (T10's finding).
- **Trench's grid cell for Performance**: Performance takes Trench's `robot.rests`, and Trench's Overlaps names neither
  the family nor the key. A sheet fix for Checkpoint D.
- Coverage: no marked row; every column moves exactly its sheet's keys.
No other cell is marked, in any view.

**Before L1: the envelope floors (Crawford, 2026-11-04).** Squall's Glass Nomad (`?seed=kr1nd4ra&x=12&y=68`; attack
9 ms, decay 101 ms, sustain 40 %, release 5 ms, both linear) clicked on every note; sweeping the release up cleared it.
Not an R-task (no sheet sentence asked for it): Attack now starts at `ENVELOPE_ATTACK_MIN_SECONDS` (15 ms) and Release at
`ENVELOPE_RELEASE_MIN_SECONDS` (20 ms), Crawford's numbers. The floor is the sliders' minimum, Classic's bands, the swell
ranges and the kind-and-bounds check's field range (shaped stages too), so the slider always shows what plays; no
hidden floor in the engine, and old saves are left alone. Columns raised to it: Anchor's and Shatter's attack (now
0.015 flat, their sketch's 1-10 ms is below the floor), Shatter's, Tidepool's and Squall's release, Tidepool's, Vent
Field's and Squall's attack, Tidepool's shaped attack, Plucked's attack and shaped attack, and all four of Hammered's
edges (attack and shaped attack 0.015 flat, release and shaped release 0.02 flat). The Classic parity rosters in
`spawnSystem.test.ts` were re-captured from the generator for the plain stages that moved. `npm run sketch:bands` re-run
and its JSON recommitted.

**Before L1: Tide renamed Undertow (Crawford, 2026-11-04).** The id follows the name (open question 5): `undertow` in
`THEME_IDS`, `themes.ts`, `loadingNames.ts`, `home.ts` (name "Undertow", the description unchanged), the sketch page's
`SHEETS` and its JSON (re-run), and the sheets file (heading "Undertow (was Current, then Tide)"; Tidepool's two
"shares the name's root" remarks dropped, as the root is no longer shared). An old link's `tide` is no theme and loads
Classic. The history above and in the spec keeps the name Tide.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A survivor theme moves a robot key no family's push carries (`masterVolume`, `dynamics`), and a theme change leaves live robots stale on it | High | T4's survivor table names a push per key before any column exists; T6's per-key case fails if the field is not written or the engine mock not called; T8 refuses a key outside T6's set. |
| Lifting the portamento or LFO-link draws (T7a) changes a dataId or offset and Classic spawn moves | High | T7a's parity case is a fixture typed from `main` before the lift; `spawnSystem.test.ts`'s fixture must pass unmodified; the dataId mutant is named. |
| `lfoLinks` compared per target writes a whole-record diff that drops a hand edit on another target | Medium | T6 compares per target and writes only the moved targets, as the layers are compared per key; a case with a tweaked target proves it stands. |
| The harness file trips the test-text lint rule or lands in `npm test` | Medium | It is `*.harness.ts` under `scripts/`, run by its own config; T10 verifies the suite's file count is unchanged and lint is clean. If the rule still fires, the file moves, the rule does not. |
| The sheets converge on rungs because the current five are the starting material | Medium | T1 rewrites the current set as characters first; T2's "no shared Heard first" criterion; Crawford cuts with no numbers in view (Checkpoint A before any column). |
| A retune at L2 or L3 needs a key the sheet does not own | Medium | The key goes on the sheet with its sentence first (T4's rule), then the R-task; T8/T9's key-set tests fail otherwise. |
| The survivor set crowds the off screen's rows on the phone | Medium | Out of scope (spec §3 ask-first); Checkpoint E records it as a layout task for backlog 63 or its own number. |
| A renamed theme id breaks a preset link (`transmissionPresets.ts`) or a saved payload of Crawford's | Low | Presets are checked at T8 (`npx vitest run src/data/transmissionPresets.test.ts`); an old id loads Classic with the dev warning, pre-v1. |
| Roster generation slows with a new derive function | Low | Checkpoint C re-times against the 16 ms line as T18 did. |

## Open Questions

Carried from the spec; each takes its default until Crawford answers at the named checkpoint.

1. **Where the sheets live.** Default `docs/reference/THEME_AND_ASPECT_SHEETS.md`. **Answered** (Crawford,
   2026-11-03): the default is fine.
2. **The harness committed.** Default yes, as `scripts/sketch/measureBands.harness.ts`. **Answered** (Crawford,
   2026-11-03, Checkpoint B passed on the defaults): committed.
3. **The three listen worlds.** Default the three presets (`transmissionPresets.ts`). **Answered** (Crawford,
   2026-11-03): "the defaults you've been using for pixel testing are fine", read as the three presets, the worlds the
   Pixel underrun A/Bs ran on.
4. **The theme for the family listens.** Default Classic, then the grid's riskiest theme. **Answered**
   (Crawford, Checkpoint D, 2026-11-03): the default for now; "I might later choose a different theme, we'll see."
5. **A renamed character's id.** Default: the id follows the name. **Answered** (Crawford, 2026-11-03): proposed is
   fine. So `float`, `anchor`, `shatter`, `tide` and the candidates' ids follow their names; an old link's `calm`,
   `bold`, `perilous` loads Classic with the dev warning.
6. **Sheet counts.** Default: the intent's. **Answered** (Crawford, 2026-11-03): "for now we're not worrying about max
   counts; of the remaining items I want to hear them before I cut them." So no survivor is cut for the count; the
   theme row carries fourteen into the sketch and the listens, and any further cut is made after a listen.
7. **Where a family-less widened key is filed for the push.** **Answered by the survivor table** (T4): two keys have no
   family. `robot.masterVolume` is filed under Voice's case (`reReserveVoice` already passes `masterVolume`; T6 checks
   the engine's velocity cache follows and adds the volume edit's cache write if not). `robot.octaveRegister` is filed
   under Melody's case (`regenerateMelody` reads `octaveRange`, as the octave edit does). `robot.detune` lands on the
   layers' `detune`, compared under `LAYER_KEYS` and pushed by Voice's case already. No pseudo-family.
