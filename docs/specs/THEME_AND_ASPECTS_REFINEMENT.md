# Phase Spec: Themes and Aspects Refinement — character sheets, the cut, the measured sketch, the listens, the copy

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests: `npx vitest run src/data/bands src/systems/aspectDeal.test.ts src/systems/robotFieldDerivation.test.ts src/systems/spawnSystem.test.ts src/utils/worldLink.test.ts src/content`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`
> - The measured sketch: one command the plan names (§1.6), which writes the page's data and asserts nothing

Intent: [docs/intent/themes-and-aspects-refinement.md](../intent/themes-and-aspects-refinement.md), confirmed with
Crawford on 2026-11-02. Roadmap [58](../todo/roadmap.md#58-themes-and-aspects-refinement), the first item of plan.md's
Stage 1. Step zero, backlog 47 (even draws), merged 2026-11-02 as PR #596, so every band is heard as written.

**Scope check (Phase 0):** one capability, taken in five ordered steps (§1.2). The steps are not independent modules:
every code step waits on the paper cut, and the copy waits on the listens. The one conditional step, a fifth family or
a replaced Distance (§1.5), has no meaning without the cut, so it is a step of this spec and not a module of its own.

---

## 1. Overview & Claude Explanation

The off screen's Loading axis offers a world one **theme** and, per **aspect family**, any number of **options**
(`src/data/bands/themes.ts`, `src/data/bands/aspects.ts`). Roadmap 57 shipped five themes and four families of three
options as placeholders: numbers with no sentence behind them. This phase replaces that set with **characters**: each
theme a place a first-time visitor can hear in a minute, each family an axis of robot variation they can hear, and
each option a distinct point on it. The choice is made on paper from character sheets, then the survivors get numbers,
measured, listened to one axis at a time, and named last.

### 1.1 What is there

- **The band table** (`bandKeys.ts`, `classic.ts`): 79 keys (`BandKey`: `bpm`, 50 global rows, 23 robot bands, 5
  sends), four kinds (range, lit, toggle, pick). Classic is the lifted table and the one every column overlays.
- **Themes** (`themes.ts`): `THEME_IDS = classic | calm | bold | adventurous | perilous`, Classic's column `{}`. A
  column is `Partial<Pick<BandTable, ThemeBandKey>>` over a ten-key list (`bpm`, Density, Rests, Attack, Release, the
  two shaped stages, the Reverb and Delay sends, the Low-Pass cutoff). A column naming another key does not compile.
- **Aspects** (`aspects.ts`): `ASPECT_FAMILY_IDS = melody | envelope | distance | voice`, three options each, every
  option a column over its family's key set only (`AspectFamily<F, K>`). Melody owns Density, Note Variance, Motif
  Length and Pitch Repeat; Envelope the four stages and the two shaped stages; Distance the Reverb and Delay sends;
  Voice the waveform pick, the open and accent cutoffs, the accent Q and the layer gain. No key is in two families;
  every family key is robot-side.
- **Resolution** (`resolveBands.ts`): Classic, the theme's column over it, each dealt aspect over that, whole band for
  whole band; the aspect wins on overlap. `resolveBands.test.ts` pins the key lists, the bounds and the placeholders.
- **The deal and the re-derive** (`dealAspects.ts`, `src/systems/aspectDeal.ts`): picks dealt round-robin over the
  companies then the freelancers; each dealt family's fields re-derived by its one derive function in
  `robotFieldDerivation.ts` (`deriveMelodyFields`, `deriveEnvelopeFields`, `deriveSendFields`, `deriveVoiceFields`); a
  theme or aspect change re-derives the live roster in place, field by field (`rederiveLoading`, `movedFields`), and
  the comparison covers the four families' fields plus `rests`. The global half moves through
  `deriveGlobalHalfMoves` (`audioStore.ts`), which diffs every seeded global field.
- **The carriers**: `LoadingIdentity` (`theme`, `aspects: FamilyPicks`), the session payload, the world link (a
  `theme` param and one param per family, `worldLink.ts`), `Robot.loadedUnder`, the off screen's rows (one per family
  in `ASPECT_FAMILY_IDS` order), the "Loaded Under" lines on the robot and company screens (`loadingNames.ts`), and
  `describeWorld`'s tail.
- **The words**: `src/content/copy/home.ts`, `home.off.theme.<id>`, `home.off.themeDescription.<id>`,
  `home.off.<family>`, `home.off.<family>.<id>`, `home.off.<family>Description.<id | none>`. All stand-ins. The Guide
  (roadmap 51) will read the same entries.
- **The records**: `docs/reference/GLOBAL_CHAIN_GRID.md` and `ROBOT_DATA_GRID.md`, "Loading ranges by theme and
  aspect"; `docs/AUDIO_SYSTEM.md`, "The band table"; `docs/COMPANIES.md`, "The deal".

### 1.2 The method, in five steps

Each step ends at a gate Crawford passes. Nothing in a later step starts before the gate.

| Step | Output | Gate |
|---|---|---|
| **1. Sheets** (§1.3) | A character sheet for every current theme, family and option, and for the candidates: eight to ten themes, two or three options per family, and the Motion and Performance families with their options. No numbers. | Crawford reads them. |
| **2. The cut** (§1.4) | Crawford's mark on every sheet: kept, renamed, cut. The survivor set, each survivor passing the coverage and importance tests on paper. | Crawford's marks are in the sheets file. |
| **3. The table** (§1.5) | `ThemeBandKey` widened to `BandKey`; a survivor column per theme and option, every key justified by a sheet sentence; the family list changed if the cut says so, with everything that follows it. | Types, lint and the suite clean; Classic parity holds. |
| **4. The measured sketch and the listens** (§1.6, §1.7) | `docs/sketches/` page: realised spread per band per column, and the theme × family override grid. Then the listens, one axis at a time, from a fixed sheet. A retune re-runs the sketch. | Crawford's listen record, every survivor kept or retuned. |
| **5. Copy** (§1.8) | Names and sentences in `home.ts`, the grids and docs rewritten to the shipped set. | `src/content/content.test.ts` passes; Crawford reads the lines. |

### 1.3 The character sheets

**Where.** One file, `docs/reference/THEME_AND_ASPECT_SHEETS.md`. A reference doc, not a sketch page or a spec
section: the sheets are prose, they outlive the build (the copy step and the Guide read them, and each column's code
comment cites its sheet), and the spec stays the contract rather than the catalogue. Cut sheets stay in the file under
a "Cut" heading with Crawford's reason, so a candidate is never proposed twice.

**The fixed shape.** Every sheet has the same fields, in this order, and no numbers in any of them. One optional field
was added at the cut (Crawford, 2026-11-03): a **Sketch starting points** line carrying his numbers for the measured
sketch, read as guesses the sketch tests and never as rules; the sentence beside each key remains the contract.

```markdown
### <Working name>  ·  <theme | family | option of <family>>  ·  status: candidate | kept | renamed → <name> | cut

**Character.** One paragraph. For a theme: the place, what no single robot decides (tempo, rooms, filter and EQ,
crowdedness, colour, pedals) and what every robot does there when nothing else is picked. For a family: the axis, in
the visitor's words. For an option: the point on the axis.

**Heard first / second / third.** Three lines: what a first-time visitor on a tablet notices, in order, inside a minute.

**Keys owned.** The band keys the column must move, one per line, each followed by the sentence from this sheet that
needs it. (The importance test: a key with no sentence is not owned.)

**Leaves alone.** What stays the theme's or Classic's on purpose, in words.

**Overlaps.** For a theme: which families' options can take which of its keys, and what of the character survives when
they do. For an option: which theme keys it overrides, and so what the theme's sentence must not promise.

**Distinct from.** Its nearest neighbour in the set, and the one-minute difference.

**Promise.** What the one-line description will have to say, in plain words. Not the sentence: that is step 5.
```

**Who writes what.** Claude writes every sheet. Crawford marks status and writes the reason on a cut. A kept sheet's
"Keys owned" is the contract its column is checked against in step 3 and its listen is checked against in step 4.

**Rules the sheets follow** (the intent's):

- A theme is a place, not a rung. A candidate that reads as "more" or "less" of another is a rung and is not proposed.
- A theme is the world **and** the default guardrails: its sheet names the robot bands its robots need when no aspect
  is picked. A theme whose robots would fall through to Classic on a band its character needs is not covered.
- A family is an axis a visitor can hear. Distance is reproposed on that test beside Motion (LFO links, portamento,
  the room sends a probe is sent to) and Performance (Dynamics, Accents, Rests). A family's three or more options must
  be distinct from each other on the sheet before any number exists.
- Classic gets a sheet like any theme. If it survives as the neutral table its sheet says so, and why that is a
  character a visitor can hear and not just an absence.

### 1.4 The cut, and the two paper tests

Crawford cuts and renames on the sheets, with no numbers in front of him. Then, before any column is written, each
survivor is checked on paper:

- **Covered.** For a theme: every band its "Keys owned" lists is one its column will set, and every band the
  "Character" paragraph needs is in "Keys owned". A need with no key is a hole; it is filled on the sheet first.
- **Important.** For every column: no key outside "Keys owned". A key that turns out to be needed while writing the
  column goes onto the sheet with its sentence first, and Crawford sees the sheet move.

The survivor count is Crawford's. He expects no axis to pass eight and sets no minimum; the off screen's rows do not
steer the count (§3).

### 1.5 The table

**Widening.** `ThemeBandKey` goes; `ThemeColumn` becomes `Partial<BandTable>`. The type still refuses a key the table
does not have and a band of the wrong kind. The "ask first" on widening recorded in `themes.ts`, `aspectDeal.ts`
(the `rederiveLoading` comment) and the two grids is answered by the interview, and those comments say so.

**What a widened key costs.** A theme column may now move any of the 79 keys, and two mechanisms must carry a moved
band to a live world on a theme change, without a rebuild:

- **Global rows and `bpm`**: `deriveGlobalHalfMoves` already diffs every seeded global field under the old and the new
  loading, so a theme moving `reverb.decay` or `chorus.depth` is carried today. The plan verifies this against the
  code, not this sentence.
- **Robot bands and sends**: `movedFields` compares the four families' fields plus `rests`, and nothing else. A
  survivor theme that moves a key outside that set, say `robot.portamento`, `robot.lfoGainDepth`, `robot.dynamics`,
  `robot.accents`, `robot.masterVolume` or a room send, needs that field in the comparison **and** a push that carries
  it to the engine as a hand edit of the field would. The plan lists the keys the survivors move, the Robot field each
  lands on, and the push each takes; a key with no push is not written into a column until it has one.

**A fifth family, or Distance replaced.** If the cut keeps Motion or Performance, or replaces Distance, the family list
changes and these follow it. Most are compile errors by construction; the rest are named so none is missed.

| Follows the family list | How |
|---|---|
| `ASPECT_FAMILY_IDS`, `ASPECT_IDS_BY_FAMILY`, a `<FAMILY>_BAND_KEYS` key set, an `AspectFamily` entry | Written. The option type refuses a key outside the set. |
| One derive function per family in `robotFieldDerivation.ts`, reading `Pick<BandTable, K>` | Written. A Motion family lifts the portamento draw and `generateRobotLfoLinks` out of `spawnSystem.ts` into `deriveMotionFields` at the same dataIds and offsets, so spawn is unchanged byte for byte. If Motion takes the three room sends, `deriveSendFields` splits; the Reverb and Delay sends stay with Distance or go with it. A Performance family's function draws Dynamics, Rests and Accents. |
| `deriveFamilyFields` (a `switch`), `pushFamilyToEngine`, `TOP_LEVEL_FIELDS` and `movedFields` | The switch is a compile error until the case exists. The push is the call a hand edit makes: Motion `primeRobotLinks` and the portamento setter, Performance `regenerateMelody`. |
| `loadingNames.ts` key maps, `home.ts` entries (label, option names, `none` and option sentences) | Typed `Record`s over the family and its ids: compile errors until filled. |
| The off screen's rows, the link params, `WORLD_PARAM_NAMES`, `canonicalAspects`, `loadingOf`, `describeLoadedUnder`, `describeWorld`'s tail | Already iterate `ASPECT_FAMILY_IDS`; nothing to write, tests to extend. |
| The grids, `AUDIO_SYSTEM.md`, `COMPANIES.md`, `UI_SHELL.md` | Rewritten in step 5. |

**An old `distance` list** in a saved payload or a link, if Distance goes: dropped as any unknown family is
(`loadingOf` and `readAspects` read only `ASPECT_FAMILY_IDS`, so the param is never read and no warning fires); the
world loads with that family as theme. The address-bar mirror (`mirrorWorldToUrl`) treats a param outside the family
list as not the world's and leaves it in place, so a stale `distance=` rides in the bar until the user edits the URL;
accepted, and the plan says so in a test. A stale `distance` key in a saved `Robot.loadedUnder` is ignored by every
reader and dropped the next time the deal writes the record. No migration: pre-v1, and the intent's "nothing protected
for an old sound's sake".

**Pitch drift and Humanize are not bands.** Pitch drift is the docking lifecycle's (`dockCycles.ts`); Humanize is a
seeded global setting (`globalAudio.humanize`, `globalAudioSeed.ts`), not a table row. A sheet that needs either needs a
new key or a new mechanism, and that is ask-first (§3). The sheets say so where it applies rather than owning the key.

**Columns.** One per survivor, each key with a comment citing the sheet line that needs it. Every number is a first
guess for step 4 and says so. Classic's rows stay where they are unless a Classic sheet owns a key, in which case
Classic's own band moves in `classic.ts` and the parity fixture is re-recorded once, with its header saying why.

### 1.6 The measured sketch

A page in `docs/sketches/`, `theme-and-aspect-sketch.html`, following the sketch page rules (a sticky bar per frame,
page-wide toggles in the fixed panel). Static HTML and a little JS over a data file the harness writes. It shows,
before anything is heard:

- **Realised spread per band per column.** For every survivor theme and option, every key its column moves: the
  written band beside what the live generators realise over many worlds (the low, median and high value and, for a lit
  or toggle band, the share that lit or landed on). The harness is the live one `docs/tasks/EVEN_SEEDED_DRAWS.md` T18
  describes: it wraps the three draw functions and records each draw the real generators make, robots over
  `generateRobotAudioBaseline` under each theme and aspect, the global half over `generateWorldSeedBaseline` under each
  theme. On an even draw the realised spread should be the written band; a cell that is not says a column names a key
  the generator does not read from the table, and that is a finding.
- **The override grid.** Theme × family: for each pair, the theme keys the family's options take (the theme column's
  keys ∩ the family's key set), so every overlap the sheets' "Overlaps" field promised is seen, and one the sheets
  missed is caught before the listen.
- **The coverage view.** Per theme, the keys the column moves beside the sheet's "Keys owned" list, read from the
  sheets file by hand into the data (the harness does not parse markdown): a key moved and not owned, or owned and not
  moved, is a row to fix before the listen.

The harness is committed and run by one documented command, so every retune in step 4 re-runs it; it is not a test and
asserts nothing (CLAUDE.md: no file-text tests, and a measurement is not a gate). Where it lives and how it runs is the
plan's (open question 2).

### 1.7 The listens

From a fixed listen sheet in the plan, one axis at a time, each listen recorded against the character sheet's "Heard
first / second / third":

1. **Themes**: three fixed worlds (open question 3) × every survivor theme, no aspect picked. Two themes that cannot be
   told apart inside a minute fail the set, not the number: one is retuned on its sheet's sentences or cut.
2. **Each family against none**: under one theme, each family's options one at a time against the row empty. An option
   that does not read as its sheet says is retuned or cut.
3. **The risky pairs**: the override grid's cells where a family takes a theme key the theme's sheet leans on. The
   theme's sentence must survive the override or must stop promising it.

A retune moves a number only with a sentence: the sheet's or a new one Crawford agrees to on the sheet. Each retune
re-runs the sketch. The listen record (what was heard, the verdict, the retune) goes into the plan's checkpoints.

### 1.8 Copy, last

Once the listens have settled what each character is: a name and one sentence per theme, a label, option names and
`none` and option sentences per family, in `home.ts`, replacing the stand-ins, written from the sheets' "Promise" lines.
The sentence under the theme row must not promise what an aspect can override (the sheet's "Overlaps" field). Ids are
code and follow a rename (a renamed theme gets a new id; an old link naming the old id loads Classic with the existing
dev warning). The same pass rewrites the grids' "Loading ranges" tables, `AUDIO_SYSTEM.md`'s band-table bullet,
`COMPANIES.md`'s deal note if the family list moved, and roadmap 58's entry.

---

## 2. Target File Structure

```text
docs/
├── reference/
│   ├── THEME_AND_ASPECT_SHEETS.md     # step 1: every sheet; step 2: Crawford's marks; cut sheets kept under "Cut"
│   ├── GLOBAL_CHAIN_GRID.md           # step 5: "Loading ranges by theme" rewritten to the shipped set
│   └── ROBOT_DATA_GRID.md             # step 5: "Loading ranges by theme and aspect" rewritten
├── sketches/
│   ├── theme-and-aspect-sketch.html   # step 4: spread, override grid, coverage view
│   └── data/                          # the harness's output the page reads (plan decides the exact path)
├── AUDIO_SYSTEM.md · COMPANIES.md · UI_SHELL.md   # step 5, where the set or the family list moved
└── todo/roadmap.md · plan.md          # roadmap 58's entry; plan.md's line deleted when it ships

src/
├── data/bands/
│   ├── bandKeys.ts                    # unchanged unless a Classic sheet moves a key kind (ask first)
│   ├── classic.ts                     # only if a Classic sheet owns a key
│   ├── themes.ts                      # ThemeColumn = Partial<BandTable>; the survivor columns, sheet-cited
│   ├── aspects.ts                     # the survivor families and options; a fifth family's key set if kept
│   ├── resolveBands.test.ts           # the key-list pin becomes a kind-and-bounds check over any BandKey (§5)
│   └── dealAspects.ts (.test.ts)      # only if the family list changes
├── systems/
│   ├── robotFieldDerivation.ts        # a derive function per new family; deriveSendFields split if Motion takes the room sends
│   ├── spawnSystem.ts                 # the lifted draws call the new derive function at the same dataIds
│   └── aspectDeal.ts                  # deriveFamilyFields, pushFamilyToEngine, TOP_LEVEL_FIELDS / movedFields for every key a survivor moves
├── utils/loadingNames.ts              # the key maps for the shipped ids
└── content/copy/home.ts               # step 5: the words
```

`resolveBands.ts`, `loadingContext.ts`, `loadingIdentity.ts`, `worldLink.ts`, `sessionShareUtils.ts`, `describeWorld.ts`
and `OffScreen.tsx` are expected to change only in tests, because they iterate the family list. If one needs a code
change, the plan names it and why.

---

## 3. Implementation Boundaries & Constraints

- **Always**
  - A key moves only with a sheet sentence (the importance test). Sheets carry no numbers outside the "Sketch starting
    points" line, and those are guesses for the sketch, not rules.
  - No column is written before Crawford's cut; no number is tuned before its listen.
  - Replace, never widen: `resolveBands` overlays whole bands, the aspect last. Unchanged.
  - A theme or aspect change is re-derived in place and rebuilds nothing. Every key a survivor moves has a push.
  - Classic parity by construction: a lifted draw keeps its dataId and offset; the spawn fixture passes unchanged, or
    is re-recorded once with a header saying which Classic band moved and which sheet asked for it.
  - Words in `src/content/` only, read through `labels()`; `content.test.ts` passes.
  - Tests exercise code, never text (CLAUDE.md). A sheet, a listen or a copy line is proved by Crawford's read.
- **Ask first**
  - A new band kind, or a key the table does not have (pitch drift, Humanize, a Mix the sheets want).
  - A change to the off screen's rows, columns or scroll, even if the survivor set crowds them (the intent: the set is
    decided first and the layout follows in a task of its own).
  - A theme presetting a Mood (backlog 7, post-launch).
  - A dependency, or a change to the draw functions or `getBand`.
- **Never**
  - A "keep today's sound" clause anywhere (pre-v1, the standing rule).
  - A compat path for an old payload or link beyond what `loadingOf` and `readAspects` already do.
  - A docs guard, CSS contract or source scan as a test.
  - Touching the world or visual draws (backlog 46) or the Mood row (backlog 7).

---

## 4. Code Style & Architecture Conventions

Match `themes.ts` and `aspects.ts` as they stand: a module-level constant per table, a doc comment that cites the
sheet and the spec section, every number marked as the plan's first cut until its listen.

```ts
/** A theme's column: a whole band for each key it moves and nothing for the rest; resolveBands overlays it on Classic,
 *  replacing never widening. Any key in the table (docs/specs/THEME_AND_ASPECTS_REFINEMENT.md §1.5; the v1 ten-key list
 *  went with the interview); the type still refuses a key the table lacks or a band of the wrong kind. */
export type ThemeColumn = Partial<BandTable>;

export const THEMES: Record<ThemeId, ThemeColumn> = {
  classic: {},
  // <Name>'s sheet (docs/reference/THEME_AND_ASPECT_SHEETS.md, "<Name>"). Each key's comment is the sheet line that
  // needs it; a key with no line is not owned and is not here. Numbers: step 4's first cut, kept or retuned at the listen.
  <id>: {
    bpm: { min: …, max: … },                  // "heard first: …"
    'reverb.decay': { min: …, max: … },       // "the room is …"
    'robot.portamento': { min: …, max: …, lit: … }, // "most probes slur …"; carried by rederiveLoading's Motion push
  },
};
```

- A derive function takes `(noiseMap, offset, bands: Pick<BandTable, K>)` and draws at the dataIds spawn always used.
- A family's push is the call a hand edit of its fields makes, never a rebuild.
- Doc comments cite `docs/specs/THEME_AND_ASPECTS_REFINEMENT.md §n` and the sheet by name.

---

## 5. Testing & Verification Requirements

Vitest + Testing Library, colocated. RED first for every task that changes behaviour, one commit per task, each new
gate mutation-checked by hand. A task that only writes sheets, a sketch page, docs or copy has no test; its **Proof**
line names Crawford's read or look.

**`resolveBands.test.ts`**

1. The ten-key pin goes. In its place: every key a theme column names is a `BandKey`, and its band is its key's kind
   (a range for a range key, `lit` present on a lit key, `offShare` on a toggle key, `weights` on the pick key).
2. Every theme band lies inside the field's full range (the existing bound check, over any key now).
3. Every option column stays inside its family's key set; no key is in two families; every family key is robot-side.
4. The survivor ids and option orders are pinned as `THEME_IDS` and `ASPECT_IDS_BY_FAMILY` ship.
5. The overlay cases (a theme replaces only its keys; an aspect replaces only its family's; the aspect wins) stand on
   injected columns, as today.

**If the family list changes**

6. `robotFieldDerivation.test.ts`: the new derive function under Classic's bands reproduces spawn's fields for the same
   noise map and offset (parity by construction), and under an option's bands lands inside the option's bands over
   many robots, with a lit share near its `lit`.
7. `aspectDeal.test.ts`: a robot dealt the new family is what it would have been had it spawned under the option; a
   theme change that moves one of the family's keys writes that field alone and drops its swell; the push is the hand
   edit's call.
8. `worldLink.test.ts`, `loadingIdentity.test.ts`: the new family's param round-trips; a `distance` list in an old
   payload or link is dropped and the rest loads.
9. `OffScreen.test.tsx`: one row per family in order, named from content (the existing generic case extended).
10. `spawnSystem.test.ts`'s Classic fixture passes unchanged, or is re-recorded once with the header saying why.

**Mutants** (at least): a column key outside its family's set (3); a band outside its full range (2); the new derive
function drawing at a new dataId (6, the parity case fails); `movedFields` missing the moved field (7, the field is not
written); the push left out (7, the engine mock is not called); an old `distance` param kept (8).

**Not tests, proved by Crawford:** the sheets (step 1 read, step 2 marks), the measured sketch (step 4 look: every
realised spread is its written band, every promised overlap is in the grid), each listen (step 4 record), the copy
(step 5 read).

**Gates:** `npm run build:types`, `npm run lint`, `npm test` and `npm run build` clean at every checkpoint; the full
suite after any task that adds a call on a module tests mock (`grep -rln "vi.mock(.*<module>" src`).

---

## 6. Git & Workflow Context

- **Branches.** Steps 1 and 2 on `docs/sheets-58` (sheets, marks: no code). Steps 3 to 5 on
  `feature/themes-aspects-58`, off `main` after the sheets merge; the sketch page and its data ride the feature branch
  because they measure its columns. Or one branch for all five if Crawford prefers; his call.
- **Commits.** `themes-58 T<n>: …`, one per task, RED first where there is a behaviour, ending with the session's
  `Co-Authored-By` line. A sheets-only or copy-only commit states its proof.
- **PRs.** Crawford opens them. The plan's checkpoints end a session; the next step starts fresh.

---

## 7. Success Criteria, Open Questions & Risks

**Success criteria**

- Every shipped theme, family and option has a sheet with status `kept` or `renamed`, and every key its column moves
  has a sentence on that sheet. No cut sheet has a column.
- Every shipped theme is covered: no band its sheet's character needs falls through to Classic by accident.
- A first-time visitor can tell any two shipped themes apart inside a minute, by Crawford's listen record, on each of
  the three fixed worlds.
- Each shipped option reads as its sheet says against the row empty, by the listen record.
- Every theme sentence survives every override the grid shows, or does not promise it.
- `ThemeColumn` is `Partial<BandTable>`; a column with a key the table lacks or a band of the wrong kind does not
  compile.
- A theme or aspect change on a live world writes only the fields the change moves, for every key a shipped column
  names, with no rebuild and no wash.
- Classic spawn is byte for byte what it was, or moved once for a named Classic sheet key.
- The measured sketch's realised spread is the written band for every cell.
- The words are in `src/content/`, `content.test.ts` passes, the grids and docs describe the shipped set, and
  roadmap 58 moves to the archive.

**Open questions** (each with the default the plan uses unless Crawford says otherwise)

1. **Where the sheets live.** `docs/reference/THEME_AND_ASPECT_SHEETS.md`, one file, cut sheets kept. *Default: yes.*
   Alternatives: a sketch page (prose does not need HTML), or this spec (the catalogue would swamp the contract).
2. **The harness.** Committed, run by one command, output under `docs/sketches/data/`, so every retune re-measures.
   *Default: committed.* The alternative is T18's way, a temporary file deleted after the run, which would mean
   rewriting it at each retune.
3. **The three listen worlds.** Crawford names three style names and plots he knows. *Default if he does not: the
   three preset links (`home.off.presets.a/b/c`), since a theme click on a preset re-derives it in place.*
4. **Which theme the family-against-none listens run under.** *Default: Classic first, then the theme the override
   grid marks as taking the most from that family.*
5. **A renamed character's id.** *Default: the id follows the name (ids are code, pre-v1); an old link with the old
   id loads Classic with the existing dev warning.*
6. **The number of sheets.** The intent says eight to ten theme candidates, two or three extra options per family, and
   two family candidates with their options. *Default: those counts, and Crawford may ask for more on any axis after
   the first read.*

**Risks**

| Risk | Impact | Mitigation |
|---|---|---|
| A survivor theme moves a robot key `movedFields` does not compare, so a theme change leaves live robots stale on it | High | §1.5's rule: no column key without a push; test 7's mutant; the plan lists every survivor key with its field and push before step 3 writes a column. |
| Lifting the portamento or LFO link draws into a derive function moves a dataId or offset and Classic spawn changes | High | Test 6 (parity under Classic) and test 10 (the spawn fixture) RED first; the same dataIds by construction. |
| The sheets converge on rungs (Calm → Calmer) because the current set is the starting material | Medium | The "Distinct from" and "Heard first" fields; Crawford cuts on paper before any number exists. |
| The survivor set crowds the off screen's rows on the phone | Medium | Out of scope by the intent; a layout task of its own follows the set. Not a reason to cut a character. |
| Listens stall because a retune needs a new key (pitch drift, Humanize) | Medium | Ask-first, named on the sheet in step 1 so Crawford decides before step 3, not during a listen. |
| The harness's realised spread disagrees with the written band | Low | That is the sketch doing its job: the generator reads the key off the table or the column names a key no draw reads. Fix the reader or the sheet, not the number. |
| Roster generation slows further with wider columns | Low | Columns change bands, not draw counts; T18's timings (5.6 ms roster, 1.25 ms global) stand. Re-time at Checkpoint of step 3 if a derive function is added. |
