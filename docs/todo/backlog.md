# Backlog

Tracks todos, bug fixes, and cleanup items that aren't part of a roadmap phase — either
surfaced by a `/code-review-and-quality` pass (or similar) on unrelated feature work, or
raised directly by Crawford as a smaller idea that doesn't warrant its own roadmap phase.
Distinct from `docs/todo/roadmap.md`, which tracks features/phases with their own
Create/Restructure/About/Docs shape.

Not a spec — this is a review-output backlog. Each item gets its own `/interview-me` or
spec pass (as warranted by its size) when picked up; check it off here once merged. Not
itself one of CLAUDE.md's Reference docs. The order items get done in is
[plan.md](plan.md); this file is the record, that one is the sequence.

See also [docs/DUPLICATE_VALUE_AUDIT.md](../DUPLICATE_VALUE_AUDIT.md) — a dedicated sibling
backlog for one specific bug class (independently-declared duplicate values) rather than a
duplicate of this doc.

Rewritten 2026-09-27: a full audit against git history found several fully-resolved items
still saying "not yet merged" (the underlying branches had merged months earlier — the doc
had just never been updated after the fact) and a few whose entire subject had since become
moot through later, unrelated work. Those are pruned outright below rather than kept as
closed-and-noted — git log is the record of what shipped; this file only tracks what's
still actionable. Anything genuinely still open is carried forward unchanged.

Going forward, a fully-closed item moves to [docs/todo/archive/backlog-archive.md](archive/backlog-archive.md)
instead of being pruned outright, keeping the closure's own detail around. Item numbers are
never reused or renumbered when an item moves.

**Numbering (Crawford, 2026-11-02): one counter across the three todo files.** From 58 on, a new roadmap phase or
backlog item takes the next number after the highest in *either* file, so a number names one item wherever it is
written (roadmap 58 and 59, backlog 60–63 were the first). The earlier overlap (roadmap and backlog each run from 1
into the 50s) stays as it is: nothing is renumbered. The next free number is 65.

## Open items

### 1. Onload: Better Power-Off Background

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority. Today, powering
off shows nothing but the static sleeve shell + rocker switch — no distinct background
art. Crawford wants to swap in something more considered, possibly one of his own
abstract paintings. Pure asset + `background` CSS swap on `SleeveContainer.css` — no
architecture impact. Blocked on Crawford supplying the artwork.

### 3. Onload: Sleeve Logo

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority.
The project name is final ("Trace Atlas") and the sleeve already shows it as a text
wordmark — a CSS `::before` pseudo-element on `.sleeve-container__bottom-strip`
(`SleeveContainer.css:116-133`, uppercased, centered), not markup in `SleeveContainer.tsx`.
Crawford wants a real image logo, bottom-right — open question whether it replaces the
text wordmark or sits alongside it. Blocked only on the logo artwork itself (a favicon
cube, `public/favicon.svg`, exists but isn't a wordmark-scale logo).

### 6. Audio: Groove Feature

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. A new mechanic: a "groove" value that raises the odds of robots syncing
their rhythm to other robots while docked/recharging. Would touch `robotSystems.ts`'s
docking logic and melody/rhythm generation. Not yet scoped — open question is whether
"groove" is a single global dial (e.g. a Sector Settings or Audio Rig control) or a
per-robot/per-locale value.

Note (2026-10-06): roadmap Phase 43 puts docked robots inside 2–3 charging stations (capacity 6
each), so the robots sharing a station are a natural grouping for "who syncs with whom".

Note (2026-11-02): backlog [24](archive/backlog-archive.md#24-audio-palette-trials-transport-groove-and-tempo-walk)
(a global Transport swing, which plan.md said might satisfy this item outright) was cut at the plan review of that date,
so this item starts from scratch when it is picked up, post-launch.

### 7. Audio: Tagged Chord Progressions, Seeded Mood Chain + Tag Filter

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11, as "more chord progressions +
selection UI". Low priority — deprioritized behind launch. Design discussed with Crawford
2026-10-09 and recorded here; **not interviewed, not specced** — needs its own `/interview-me`
pass when picked up, which should start from the "Open" list below.

**Note 2026-10-22 (Crawford):** the user-facing part (the tag filter, the mood choice) is now expected to
be built with item [5](archive/backlog-archive.md#5-sector-settings-ascoordsfavorites-reorganization)'s
powered-down state rather than in the Audio Rig's Pacing section as the "UI home" lean below says. The
progression engine, the catalogue and the seeded chain stay this item and are a large build in their own
right. Item 5 closed 2026-10-31 as the off screen (roadmap 57), which settled the surface: the Mood row has
its slot in the off screen's Loading axis. This item's interview decides the music.

**Note 2026-11-02 (Crawford's decisions of 2026-11-01, at the start of the themes-and-aspects refinement, roadmap
[58](roadmap.md#58-themes-and-aspects-refinement)):** Mood, the row the off screen's Loading axis holds for this item,
means only the note options: which `HARMONY_PALETTES` entries (or, once this item ships, which progressions and tags) a
world may draw from. Whether a theme limits the moods is undecided and likely later. The overlap rule between a theme
and an aspect is aspect-wins (`resolveBands` replaces whole bands, the aspect last), so theme copy must not promise what
an aspect can override. Sequenced post-launch in plan.md.

**What exists (verified 2026-10-09).** `src/engine/harmonySystem.ts` holds one fixed progression,
`HARMONY_PALETTES`: 12 entries of 8 pitch-class names (`EighthNotes`, no octave), cycled
sequentially at `MEASURES_PER_PALETTE_ENTRY = 2`, so one lap is 24 measures. The active index is
derived statelessly from `getCurrentMeasure()` on every tick and wraps by array length (the
September 2026 rewrite that replaced the hour-keyed `TIME_PITCHES`; merged). Nothing seeds it,
nothing selects it, nothing persists it; `powerController.start` calls `resetHarmony()` back to
entry 0. Two production consumers only: `AudioEngine.processMelodyStep` reads `getAvailableNotes()`
per step, and `powerController`. Palette **slot position carries musical weight**:
`melodyGenerator.ts`'s `NOTE_INDEX_WEIGHTS` (0.35 → 0.03) biases melodies toward low indices, and
the existing palettes put the root at slots 0 and 5 and the fifth at slot 1 — every new progression
must honour that slot convention or every melody changes character.

**Crawford's design (2026-10-09):**

- **Progression** = `{ id, tags, measuresPerEntry?, palettes: EighthNotes[] }`. Progressions may
  differ in length; `measuresPerEntry` defaults to 1 when omitted (the "multiples of two" constraint
  goes away — the tick becomes per-measure and computes (progression, entry) from the measure).
- **Content convention, not mechanism:** each progression ends leading to C; openings may be other
  reasonable chords. Hoped for, not enforced — the chain joins the last chord of one progression to
  the first of the next, so it only lands if openings mostly follow a dominant well.
- **Seeded, so reproducible**, with mood steered by **tags**. Each progression carries tags. A
  ranked tag queue (earlier = more likely, same decaying-weight idea as `NOTE_INDEX_WEIGHTS`) holds
  the tags of the current progression and the last-played one. Each pick: draw a tag from the
  queue, then a progression carrying that tag. Then update the queue: the chosen tag first, the new
  progression's other tags next, the just-finished progression's tags after, anything older dropped
  (de-duplicated) — a two-progression window with the chosen tag pinned in front, i.e. mood
  momentum.
- **User tag filter, maybe:** a multiselect of tags so the user can limit the feeling.
- **Themes** (`docs/ideas/themes.md`) might weight the initial tag differently per theme.

**Leans from the discussion (Claude's, unconfirmed by Crawford):**

- **Determinism model.** Keep the whole chain a pure function of (seed, theme, filter, measures
  since chain start): replay the seeded choices from the chain's start whenever the active
  progression is needed, or memoise the chain as it grows. Never an accumulated live-only state —
  that would break share links, power-cycle resets and the World Clock replay.
- **Seed = the Attenuation Style**, same source as BPM (`src/utils/bpmSeed.ts`; use
  `getUniformSeededVal` for discrete picks). Reseeds on style change; nothing new in the payload for
  the chain itself.
- **Theme list as the opening queue.** At chain start the queue is empty; let the theme supply an
  ordered tag list and treat it as the queue for the first draw, with the same decay weights. Classic
  = a default ordering that has to exist anyway, so harmony does not depend on the themes phase —
  it ships with the default and one injection point. Fits the decided "themes affect generation
  only" rule. Consequence: with a two-progression window plus momentum the chain forgets its opening
  after a while; if a theme should *hold* a mood, the hook is the theme presetting the default tag
  filter (user may still edit it), not a standing bias in the draw.
- **Tag filter semantics.** User state, not seed: a JSON `string[]` of allowed tag ids in
  `audioStore` plus an optional `SessionPayload` field, absent/empty = all tags allowed (same
  convention as the optional pacing fields; travels in share links for free). Carried forward across
  Attenuation Style switches like the swell settings, not reseeded like BPM. **Any-match**: a
  progression is reachable if at least one of its tags is allowed; queue entries the filter excludes
  are skipped; if nothing in the queue is allowed, draw uniformly over the allowed set. A live filter
  change lets the current progression finish and governs the next pick — so the live sequence and a
  reloaded one can differ, the same class of divergence a live BPM edit already causes; recomputing
  from measure 0 on change would jump chords mid-phrase.
- **Chain anchor.** A live retransmit does **not** reset the transport (`worldTransition.ts` stamps
  the new locale's `createdAtMeasure` from the running count), so the chain needs its own start
  measure when the seed changes live. Reusing `createdAtMeasure` matches the World Clock replay but
  would also restart harmony on a coordinate-only change where the harmony seed has not changed; a
  harmony-owned anchor set only on seed change avoids that.
- **Catalogue tests over runtime wildcards:** (a) every tag reachable from every other through the
  catalogue (otherwise a tag cluster can never be left), (b) each tag on at least two or three
  progressions (otherwise a one-tag filter loops one progression), (c) slot convention / 8 notes /
  no octave digits.
- **Tag ids as a string union** with display labels in `src/content/` (content layer); the restore
  boundary drops unknown tags from an old payload, the same way `sanitizeLaneSync` does for `sync`.
- **UI home: Audio Rig, Pacing section, beside BPM** (`AudioRigDrawer.tsx`) — it is a live audio
  control, not a generation band, so not beside the Attenuation Style radio or the theme picker. No
  multiselect primitive exists among the 14 controls (`RadioButton` is single-select); cheapest build
  is a row of `Toggle`s in a `PanelGroup`, and the largest-content-size rule applies. Land it on the
  reworked layout (roadmap 22 / Layout Rework), not the current drawer.
- **Debug HUD** line showing current progression id, entry and the tag queue — the cheapest way to
  tune the decay ratio by ear.

**Open (for the interview):**

1. The opening draw when no theme system exists yet — just the Classic default ordering, or a fixed
   opening progression?
2. Decay ratio (the stickiness knob). Geometric 0.5 makes the front tag win about half the time.
3. Immediate repeats: is the progression that just finished eligible again?
4. Within the chosen tag: uniform among its progressions, or a second ranked list? (Lean: uniform.)
5. Whether themes colour only the opening or also preset the filter (see the theme lean above).
6. Anchor on seed change: `createdAtMeasure` or a harmony-owned start measure.
7. Does a user-facing tag vocabulary need lore-voice names (`docs/reference/copy-tone-guide.md`), and
   how many tags (lean: 5–8).

**Side effects to accept:** adding a progression later changes the chain for every existing seed,
exactly as widening any seeded range does. Changing a tag id later is a payload migration.

A possible phase two — users authoring their own progressions and tags — is item 20 below; it
reopens the "tag ids as a string union" and "catalogue tests" leans above, so decide it before the
spec fixes those.

### 10. Visuals: Atmospheric Animations

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority — deprioritized
behind launch. No weather/atmosphere/particle system exists in `WorldView` today — this
would be genuinely new (fog, dust, light rays, precipitation, or similar — not yet
specified). Not yet scoped.

**Update 2026-10-22:** roadmap [42](roadmap.md#42-world-view-districts)'s D3 branch shipped `LightShafts`, an
atmosphere layer of light rays. Marine snow, the particle half, was built and cut on 2026-10-07 (it read as film
grain). Fog, dust and precipitation are still unbuilt, so the item stays open.

### 13. SVG: Invalid Empty `y` Attribute — Live-Browser Confirmation Outstanding

**Status:** fix merged to `main` via PR #469 (`7eb1f67`), 2026-09-15 — confirmed still
present at `PowerRockerSwitch.tsx:314` (`y={POWER_SVG_REST.y}`). Only the live-browser
confirmation remains genuinely open; no evidence since of that check having happened.

`PowerRockerSwitch.tsx`'s nested `.rocker-power-svg` (the power icon inside the rocker
switch) was the one element in the codebase whose `y` position was never set in JSX at
all — set only by `useGSAP`'s `gsap.set(powerSvgEl, { attr: { y: POWER_SVG_REST.y } })` on
mount, so on the very first paint the attribute was absent/invalid. The fix gives the
`<svg>` an explicit `y` default in JSX so a valid value exists from the very first paint;
GSAP still owns the tween from there. Covered by a `PowerRockerSwitch.test.tsx` regression
test. **Not yet confirmed in a live browser** — the hypothesis is strong (the one
component matching the bug's exact shape) but the real Chrome console output was never
watched directly for it.

### 17. Audit: LFO Drift / Audio Swells / Ping Variance — Replayability Findings

Task 8 of `docs/tasks/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md` (roadmap Phase 20.5),
2026-09-28. Non-blocking, informational — nothing here was fixed as part of this audit, and
nothing in it blocked Phase 20.5's own deliverable (battery/docking/job/melody-drift
replay), which is independently proven regardless of these findings. Recorded so a future
phase wanting to replay/reproduce *audio* state (not just robot lifecycle) knows exactly
what it's dealing with, rather than assuming "everything here is already measure-quantized"
and discovering otherwise mid-implementation.

**`src/systems/audioSwells.ts` — trigger/target logic is safe; ramp interpolation isn't
(and doesn't need to be, a precedent already exists).** Its scheduling is
`scheduleRepeat('16n', () => tickAudioSwells(localeId, getCurrentMeasurePrecise()))`
(line 406) — Transport-driven, measure-based, never a raw `setTimeout`/`setInterval`. Every
trigger-probability and target-selection roll (`getSeededVal(noiseMap, 'audioSwell.*', measure,
...)`, lines 530-669) is seeded by `(noiseMap, measure)` — zero `Math.random`, zero
`Date.now()` anywhere in the file (confirmed by direct search, not assumed). *Deciding
whether/which/when a swell starts* is therefore fully deterministic and replayable from
elapsed measures alone. What is **not** replayable: a swell's own in-flight `rampTo`
interpolation is real Web Audio time, not measure time — the literal value at some
arbitrary mid-ramp moment depends on real elapsed seconds since the ramp started, which
`stepRobotLifecycle`-style measure replay has no way to reconstruct. This is not a new
problem or a gap to fix here: `sessionDiff.ts`'s `extractSwellBaseValueIfActive`/
`extractGlobalSwellBaseValueIfActive` (added for Session Storage, see
`docs/todo/backlog.md`'s own history and `docs/SESSION_STORAGE.md`) already solve exactly
this by capturing a swell's normalized *target* value instead of its mid-ramp interpolated
one at save time. Any future phase wanting swell state to survive a World-Clock-style
replay should reuse that same normalize-to-target-value technique, not invent a new one.

**`src/engine/lfoEngine.ts` — NOT replayable from elapsed measures, by design, and this is
correct as shipped.** `Tone.LFO` nodes (line 199, `new Tone.LFO(settings.rate)`) are real,
continuous audio-rate oscillators driven by the Web Audio clock itself — their phase at any
moment is a function of real elapsed wall-clock time since the node started, not of
elapsed measures. The manual phase-polling fallback (`startPhaseFallback`, lines 283-298)
makes this explicit in code: `const startTime = Tone.now()`, then every poll computes
`const elapsed = Tone.now() - startTime; const angle = 2 * Math.PI * settings.rate * elapsed`
— a textbook real-time oscillator, scheduled via `scheduleRepeat('16n', ...)` (measure-cadenced
*polling*, but the *math inside* is real-seconds-based, not measure-based). This is
deliberate, confirmed-intended behavior — the file's own doc comment states LFO `rate`
must stay "a free-running Hz value," explicitly *not* tempo/transport-coupled (`sync()` is
deliberately never called, for this exact reason). **Consequence for any future World Clock
consumer:** reproducing "the exact LFO phase at this moment" needs real elapsed wall-clock
time tracked as its own primitive — `createdAtMeasure`/elapsed-measures alone cannot derive
it, since measures and real seconds are only loosely related via BPM and an LFO's own
`startTime` is a real timestamp, not a measure count. Not a bug — a different kind of state
than robot lifecycle, requiring a different (not yet built) mechanism if it's ever needed.

**"Ping variance automation" is not a separate timing/randomness system — nothing to audit
independently.** It's a single scalar (`audioStore.pingVarianceAutomation`, read at
`audioSwells.ts:467`) that feeds into audio swells' own already-covered, already-safe
trigger-probability math as one more input value. No independent scheduling mechanism, no
independent randomness source, no separate file.

**Summary for a future reader:** robot lifecycle (this phase) and audio-swell
trigger/targeting are both genuinely measure-replayable today. LFO phase is not, and
correctly so — it would need a real-elapsed-time primitive this phase deliberately doesn't
build (out of scope, see `docs/intent/world-clock-deterministic-lifecycle-replay.md`). Swell
ramp interpolation is "not replayable" in the same sense LFO phase is, but has an existing,
reusable fix (normalize to target value) already proven by Session Storage.

### 18. Telemetry: Charts of Notes Played, Jobs Worked, Fleet Activity

Raised by Crawford, 2026-10-09, during the districts brainstorm on `feature/layout-rework`
("what other data analysis could we implement? Charts and graphs of notes played, jobs
worked, etc?"). Not yet scoped; needs its own `/interview-me` pass. Siblings: roadmap
[46](roadmap.md#46-mobile-deck-camera-the-world-crop-on-phones) (the letterbox band is one
candidate home), [25](#25-neighbourhood-map-coherent-districts-and-the-visited-log)
(the visited log is the first wall-clock record), and roadmap
[32](roadmap.md#32-robot-melody-history--configuration-scrubber) (per-robot melody history —
should share whatever storage decision this makes).

The useful split, verified against the code 2026-10-09, is not "which charts" but **what already
exists, what can be replayed for free, and what needs a new log**:

- **Free, because it is deterministic.** Roadmap 20.5 made docking a pure replay from seed +
  elapsed measures (`replayLifecycle` / `stepRobotLifecycle`, `src/systems/robotSystems.ts`), so
  battery curves, dock cycles, pitch-drift history and the fleet's active-vs-docked count over the
  day are computable on demand with no logging — `lifecycleSim.ts`'s `activeCountsOverTime`
  already produces the last one. Melodies are loops of note indices, so notes played per robot per
  hour = melody × measures elapsed × docked state. The harmony palette is a function of the
  transport measure (`src/engine/harmonySystem.ts` derives its index from `beatClock.ts`'s
  `getCurrentMeasure`, two measures per entry; `getCurrentHour` has no production caller since the
  September 2026 rewrite), so "which palette when" is a lookup and "which palettes you've heard"
  falls out of time spent — and stays one if item 7's seeded chain lands, since that chain is
  designed to be a pure function of seed and measure. Swell *triggers* are seeded by
  measure (item 17 above); ramp interpolation is not, and doesn't need to be for a chart.
- **Cheap, one counter at an existing seam.** Every note goes through `AudioEngine.scheduleNote`
  from one internal call site (the melody playback loop), so a per-robot tally of the eight palette
  degrees is an array increment. `src/engine/audioDiagnostics.ts` already snapshots audible,
  sounding, load and playback health about once a second for the `?debug` HUD
  (`subscribeDiagnostics`, `DiagInfo`); a bounded ring buffer behind the same subscribe gives a
  load / dropout sparkline.
- **Needs a new log, because it is wall-clock.** Jobs. The work loop (`src/systems/workLoop.ts`)
  knows robot, site, job and every activity transition (the `onLifecycleChange` seam,
  `Robot.siteId` / `Robot.job` / `Robot.activity`), but nothing records a visit today. A visit
  record — robot, site, job, start, end — is the one real logging addition, and it unlocks hours
  per job, sites visited, site popularity, variety per robot, and a heat map of work across the
  world that pairs with roadmap 46's minimap. Same for user actions (edits per robot, time per
  coordinate), which item 25's visited log starts.

**Charts that would mean something to a user, in the Meridia telemetry fiction** (lore voice per
`docs/reference/copy-tone-guide.md`): a note signature per robot (eight bars for the eight palette
degrees) and the fleet's combined one; a strip chart of the last stretch of measures, who sounded
when, dock gaps visible; the day's palette wheel with the current hour marked and time spent in
each wedge; fleet activity over the day (active vs charging) with swells as markers; jobs — hours
by job type, busiest site, each robot's variety; audio health — sounding robots against the
budget, dropouts on phones; session totals in the style of a year-end wrap (longest-serving robot,
most-played degree, districts discovered out of nine).

**Constraints that shape the build:**

- Charts are readouts, so under the UI depth rule they are recessed wells — flat, in the app
  palette, never gem material (gem stays on world and robots).
- They update on the measure tick or the diagnostics tick, never per frame
  (docs/ANIMATION_SYSTEM.md); nothing in a chart may touch the audio path.
- Per-note / per-measure records live in a module with a subscribe, like the diagnostics, with
  only bounded aggregates in Zustand (JSON-serialisable) and only what is worth keeping in session
  storage (`docs/SESSION_STORAGE.md` — a visit log would be a new payload field, optional, absent =
  none, like every field added since v1).
- Labels through the content layer (`src/content/`); use the `dataviz` skill when the charts are
  actually drawn.

**Open:** where it lives — a new Telemetry leaf in the nav, per-robot stats on the robot detail
screen, or roadmap 46's letterbox band if the 16:9 fit is chosen after all. And whether any of it
survives a reload (the visit log is the only part that can't be recomputed).

### 20. Audio: User-Authored Progressions and Tags (Editor UI) — Maybe

Raised by Crawford, 2026-10-09, straight after item 7's design discussion: "could we build a UI
where a user could easily create their own palettes and tags?" Crawford's verdict: **a maybe**. Not
interviewed, not specced. Strictly phase two of item 7 — the chain and a built-in catalogue ship
first — and, if it ever graduates, it is its own roadmap phase rather than a backlog line. Lands on
the reworked layout (roadmap 22), never the current drawers.

**The design problem is musical, not technical.** A palette is 8 *weighted* slots, not a chord:
`melodyGenerator.ts`'s `NOTE_INDEX_WEIGHTS` gives slot 0 about a third of all melody notes and slot
7 about three percent, and the built-in palettes use that on purpose (the fourth entry puts F, the
seventh of G7, in slot 0 so the fleet leans on the tension note). A user typing eight pitch classes
into eight boxes would need to know that. The proposed answer: **author chords, not slots** — root +
quality (+ one extension) and a voicing template fills the eight slots in a sensible weight order,
with an "edit slots" disclosure for anyone who wants the F-over-G7 trick. One chord per entry is also
what keeps the editor usable at phone width.

**Audition through the fleet, not a preview synth.** `setAvailableNotes` (`harmonySystem.ts`) exists
with no production caller; a preview button temporarily overrides the live palette so the whole
fleet plays the chord being edited in its own melodies and voices, then hands control back to the
chain. No new audio code, and no Tone node in a component (CLAUDE.md forbids it anyway).

**Precedents already in the codebase (verified 2026-10-09):** user-created companies (random ids,
persisted whole in `SessionPayload.userCreatedCompanies` because there is no seed to regenerate them
from — the exact shape user progressions need); the Sessions panel's name input / save / load /
confirmed-delete library CRUD; `TextInput` (names), `RadioButton` (root, quality), `Stepper`
(measures per entry), a `Toggle` row (tags), `PanelGroup` / `AccordionContainer`. User-typed names
bypass the content-layer guard the same way robot and company names do; built-in tag labels stay in
`src/content/`. **No primitive for reordering entries exists** — that is the one new interaction.

**What it forces back onto item 7's design:**

- Tag ids stop being a closed string union; user tags make the type a plain string, and the restore
  sanitizer must accept any tag the payload's own progressions define instead of dropping unknowns.
- The catalogue tests (reachability, coverage) cannot cover user content — they become authoring-time
  hints in the editor, and the draw keeps its uniform fallback at runtime regardless.
- Library vs payload: a progression is made once and wanted everywhere (argues for a local library,
  like the sessions list), but a share link must reproduce the chain (argues for embedding). Lean:
  both — library for reuse, embedded copies in the payload for sharing; a progression is a few dozen
  characters, so the link cost is negligible.
- Adding a user progression reshuffles the seed's chain, exactly as adding a built-in one does —
  worth saying in the editor.

**Open:** whether it is for Crawford (a composing tool with slot-level control) or for players (chord
picker only); whether built-ins are forkable; whether a library is shareable on its own; the voicing
templates themselves (the bulk of the musical work).

### 25. Neighbourhood Map, Coherent Districts and the Visited Log

Raised by Crawford, 2026-10-09, in the same brainstorm: "a map of the nearby world, color coded by
district", and, some day, a server tracking where people went with a map of "discovered" areas. Not
yet interviewed or specced. Depends on roadmap [42](roadmap.md#42-world-view-districts) (the districts) and, for where
it is shown, on roadmap [46](roadmap.md#46-mobile-deck-camera-the-world-crop-on-phones) and the layout rework.

**Moved here from roadmap phase 47 on 2026-10-12** (Crawford: not ready to implement it, and nothing relies on it —
checked: the only references were cross-notes in roadmap 46, the mobile-deck-camera intent doc and backlog 18, all
repointed here). The roadmap number is not reused.

#### About

**The map has a hidden prerequisite.** A locale's noise map is seeded by hashing its coordinate pair
as text — ``createNoise2D(alea(`${x}:${y}`))`` in `src/utils/noiseMaps.ts` — so two neighbouring plots
share nothing, and `pickDistrict` (`src/systems/districts.ts`) draws on that map. Coloured by district,
a map of the neighbourhood is noise, not regions. For it to mean anything, the district pick needs a
**second, world-level field over coordinates**: seeded cells (Voronoi-style, each carrying a district
label) or low-frequency noise, so there is a wreck field to the east and a habitat belt to the north.
Constraints on that field:

- **Even spread stays.** Phase 42 pinned every district at ≥ 8 of the 121-coordinate grid
  (`districts.test.ts`, `lifecycleSim.ts`'s `SIM_SEED_COORDS`); simplex output is bell-curved, which is
  why `getUniformSeededVal` exists (docs/PROCEDURAL_GENERATION.md). Cellular labelling gives an even
  spread by construction; quantised low-frequency simplex fights it.
- **It is a generation change.** Every coordinate's district changes, so saved sessions and share
  links (which regenerate the locale from its coordinates) show a different place. Phase 42 accepted
  the same break; it is a conscious call again, not a side effect.
- **Everything else per locale stays as it is** — the recipe rows, derelict rolls, terrain, roster
  and stations still come from the locale's own map. Only *which* recipe is chosen moves to the
  world field.

Upside beyond the map: coherent regions make navigation a concept ("go east into the vent fields")
and give the Settings → Seeds coordinates a reason to be stepped rather than typed.

**What a map can show today, honestly, with no generation change:**

- **The visited log.** A local store of coordinates, first-seen time and district — JSON in Zustand,
  persisted beside the sessions in `localStorage` (`sessionStorageEngine.ts`'s pattern). Fog of war
  for one person; the current plot highlighted; tapping a plot retransmits to it (navigation lives
  inside `ScreenViewport`, per the UI-shell rule).
- **The day/night stripe.** A plot's hour is set by its x alone (`buildLocale`'s
  `dayStartTimestamp`, `abs(x % 24)`), so the map has vertical day/night bands that move with the
  wall clock, free and spatially coherent already.
- **District per plot** is cheap to compute on demand (one `alea` + `createNoise2D` + three samples;
  the test suite does 121 of them), but it needs its own cache keyed by coordinates — the live
  `localeMaps` cache is keyed by locale id.

#### Not Doing (and why)

- **A server, user accounts, and a shared "discovered" map** — Crawford, 2026-10-09: "a bit much to
  add now." The visited log gives one person the same screen; a server later only merges everyone's
  sets, and the map component would not change. Nothing in the local design should assume a
  server, and nothing should block one.
- **Per-plot roster, derelict counts or station counts on the map** — those need `spawnSystem` or
  `placeDistrict` per plot; too heavy for a map that paints many plots at once. District and hour
  only, until measured otherwise.
- **Colouring the map by district before the field is coherent** — it would look like a bug.

### 31. Tooling: `profile.mjs` Against the Layout Rework

**Found 2026-10-23** while proving backlog 30 ([archive](archive/backlog-archive.md#30-tooling-one-shared-cdp-helper-for-the-perf-scripts)):
`npm run perf` (`scripts/perf/profile.mjs`, [PERFORMANCE.md](../PERFORMANCE.md)) threw on `main` after Fleet Params. The
layout rework (roadmap [45](roadmap.md#45-layout-rework-shell-nav-section-tabs-roster-off-screen)) had moved everything
it drives: Task 21 (`4ba12cae`) replaced the Probes list's `.robot-selection-card__top` with the roster tile; the header
nav became the nav panel (no "back" button, no `role="radio"`, the Settings tile no longer "Nav & Comms", `.console` now
`.console-panel`); and the accordions became section tabs, so no `.sc-accordion` exists in the app at all.

**(A) Unbreak — built 2026-10-23 on `fix/profile-step-table`.** The robot opens through `.roster-tile__face`; "back to
the roster" is the nav panel's Probes box (`navActions.pressBranchBox` → `selectBranch` when a robot is open); the
capture windows return to the Deck through its box and check `.console-panel` is gone; the `TILE_*` labels are the
`human` of the content layer's `*.root` entries. The per-section rows (`fleet › …`, `detail › …`) and `--smoothness`
find no accordions and say so once instead of failing: dormant, not broken. PERFORMANCE.md's 17.2.x tables stay as the
history of the accordion screens, marked so.

**Proof for (A), 2026-10-23** (a run, not a test: nothing imports the script): against a production build on :4173 at
1×, the step table, `--profile` and `--smoothness` each ran to the end, exit 0; the two dormant paths printed their
note; `--profile`'s capture windows returned to the Deck both times; the orphan check read the same `trace-atlas-perf-*`
count before and after. The table, for the record (desktop 1280, tasks ≥ 100 ms / longest ms / cabinet boxes): power on
2 / 325 / 12 · open Fleet Params 0 / 53 / 58 · switch to Probes 1 / 202 / 175 · open first robot 1 / 113 / 93 · back
to the roster 1 / 177 / 175 · switch to Settings 0 / 59 / 39 · back to Fleet Params 0 / 0 / 58. A second run read the
same within noise. Not a baseline (one run each, `main`'s desktop); PERFORMANCE.md's 17.2.x tables are the accordion
screens' and are not comparable.

**(B) Re-aim — open, unsequenced.** The section rows become a first click of each `.section-tabs__trigger` (Fleet
Params' five with its sub-tab row; the robot screen's), and `--smoothness` goes with its PERFORMANCE.md section: tabs do
not tween height, so the empty-open flash and the height snap it measured cannot happen. Then a fresh baseline table.
Half a day with a Look; only when a main-thread question needs per-section numbers.

### 33. Audio Rig: Exact Stepped Values, and Log Sliders That Read Cleanly

**Raised by Crawford, 2026-10-25,** on `feature/short-world-link`, after its code review: "those values should be
quantized when they're loaded in initially, then they should stick to the steps of the sliders … why are we rounding
things on save/share?" Weighed the same day and cut down to the two small pieces below; the larger version (a value
grid for every log slider) is parked at the end. Not yet specced. It waited for roadmap
[56](roadmap.md#56-short-world-link) to merge (the finish-the-branch rule); 56 merged on 2026-10-26 (PR #581), so nothing
blocks piece 2 now.

**Background (verified 2026-10-25).** A save snaps the Audio Rig to slider steps and rounds the LFO drifts
(`quantizeGlobalAudioForCapture` / `roundLfoBankForCapture`, `src/utils/sessionCapture.ts`, called by
`buildSessionPayload`). Roadmap 56's review fix (`7cf54637`) runs the world link's seed baseline through the same step,
so saves and links agree, and `src/utils/worldLinkBoot.test.ts` guards it through the real boot. The rounding is there
for two reasons, and each piece below takes one of them.

**1. `quantizeToStep` returns exact numbers.** Fields with a linear step are already snapped when they load:
`sampleField` (`src/utils/globalAudioSeed.ts`) snaps every field whose `GLOBAL_AUDIO_SEED_RANGES` entry has a `step`,
and `generateLfoBankSettings` snaps the drifts to 0.01. But `quantizeToStep` (`src/utils/math.ts`) is
`min + Math.round((value - min) / step) * step`, so a drift of −0.4712 comes out as `-0.47000000000000003`, and the
save's `roundToDecimals` is only there to clean that up.

- Round the result to the step's own decimal places, so an on-step value is exact (`-0.47`).
- One function, used by every generator and slider that snaps, so it fixes the noise everywhere at once. No value
  moves by more than the noise itself.
- Then check whether the capture step still changes anything for the stepped fields; if it doesn't, drop those lines
  from it.

**Piece 1 done 2026-10-25** (on `feature/short-world-link`, at Crawford's "if it's as simple as it sounds do it"):

- `quantizeToStep` (`src/utils/math.ts`) rounds to the grid's own decimal places: the more of the step's and the
  origin's, since a grid at min 0.05 with step 0.1 has two. It reads an exponent-form step too (`1e-7` → 7 places).
- `tempoSync.ts` already had this as a private `quantizeClean` (step decimals only); it is deleted and its three calls
  use `quantizeToStep`.
- The seed oracle in `globalAudioSeed.test.ts` ("do not regenerate") held twelve literals with float tails
  (`0.7000000000000001` …). They were amended by hand, each to its value without the tail, with a note in the oracle's
  amendment log; no draw, band or grid moved. A colour-wet band check lost the `1e-9` slack it kept for that noise.
- The capture step's `roundToDecimals` wrappers in `sessionCapture.ts` were redundant once `quantizeToStep` is exact,
  and are gone (output identical on 20,000 random rigs, compared as JSON against the old function). The capture step
  itself stays: it is still the only grid for the seven log fields it snaps, and the drift rounding still covers
  dragged values.

**2. Log sliders show sensible decimals.** Twelve log-scale fields have no step anywhere, so their values are whatever
the seed or the drag produced: compressor attack and release, the LPF and HPF frequency and Q, reverb decay, the
AutoWah's base frequency, Q and follower, and the Phaser's base frequency and Q. None of their `sliderLog` schemas
(`src/data/audioRigConfig.ts`) has a `unit` or a `formatValue`, so the label falls back to `formatDisplayValue`
(3 decimals, no unit) and a cutoff reads `3152.859`.

- Give each a display format: for example whole hertz with a unit for the frequencies, 2 decimals for Q, milliseconds
  for attack and release, 2 decimals of seconds for decay.
- Display only, like `formatDisplayValue` itself: the stored value and the sound do not change.
- Copy: any unit text goes through `src/content/` like every other label.

**Parked: a value grid for the log sliders.** Giving the twelve fields a step at load, making `SliderLog` snap to it,
and then deleting `sessionCapture.ts`. Weighed 2026-10-25 and not worth it now: nothing audible changes (every value
moves by less than a step), links and saves already agree, and the risky part is the slider. A fixed step sticks at the
low end of a log range: at attack's minimum one key press moves the value about 0.0000053 s, which snaps back to
0.001 s, so the key never leaves the bottom step (a cutoff near 20 Hz on a 1 Hz grid sticks the same way). Revisit only
if piece 2 leaves the decimals still bothering Crawford. Options then: every press moves at least one whole step, a
relative grid (three significant figures), or `schema.steps`, the fixed list of allowed values `SliderLog` already
supports for Automation Rate. The robot side of `sessionDiff.ts` (layer gain and the five sends rounded to 2 decimals,
whose comment notes "a seed off the grid") would be the same question.

### 34. Audio: Upgrade Tone Once the Leak Fix Is `latest`, Then Delete the Patch

**Split out 2026-10-26** from [32](archive/backlog-archive.md#32-audio-oscillator-leak-fix--disconnecting-the-dead-notes-params)
when it was archived. Tone fixed the per-note oscillator leak upstream ([#1379](https://github.com/Tonejs/Tone.js/issues/1379),
[#1393](https://github.com/Tonejs/Tone.js/pull/1393)) in **15.3.11**, which so far ships only on npm's `next` tag. The
app pins `^15.1.22`, which resolves to `latest`, and works around the leak with `src/engine/tonePatches.ts`; since T6 the
patch is safe on a fixed Tone too (its repeated disconnects are swallowed), so the upgrade does not have to hurry.

**Waits on npm (Crawford, 2026-10-23):** no move to 15.3+ while the fix rides `next`. Checked 2026-10-26: `latest`
15.1.22, `next` 15.5.62. Check with `npm view tone dist-tags`.

**When a release with the fix becomes `latest`:** upgrade on its own branch: read the changelog from 15.1.22, run the
full suite, listen, and run the perf runs against the old version. In the same change, delete
`src/engine/tonePatches.ts`, its test, its call in `src/engine/audioContextSetup.ts` and `oscillatorLeakPatched`, and
the "Tone patch: the per-note oscillator leak" section of [AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md).

### 39. Main Thread: Recurring Store Writes Fan Out to the World View (Measure First)

**Found 2026-10-26** by the steady-state review
([PERFORMANCE.md](../PERFORMANCE.md#steady-state-review--what-runs-continuously-and-which-of-it-can-pop-2026-10-26)).
Not built until the `?debug` overlay shows lag spikes beside the pops; if the pops survive 37 and 38 with the lag line
quiet, this item does not help and stays parked.

**What runs.** Three recurring writers each re-render far more than they change:

- **The swell tick** (25–65 store writes a second with both pools full). `updateRobot` rebuilds the locale, so every robot
  swell write re-renders that robot's Robot → RobotBody → RobotGem chain (RobotGem is memo'd, but RobotBody hands it
  new `palette`, `orbiters` and `halo` objects every render, `src/components/robot/RobotBody.tsx`), LightShafts and both
  TerrainLayers (`s.locales[localeId]`, the whole locale; TerrainLayer recomputes the terrain outline and facets), and
  the audio budget's `signature()` string (`src/systems/audioBudgetSystem.ts`). A `layer1.gain` or `layer2.gain` swell
  also rebuilds that robot's strip-flicker timeline every tick, because the gain sits in the flicker trigger tuple.
  EQ/filter swells re-render 6–9 ChargingStation fragments (they select the swelled fields). Zustand renders at React's
  blocking lane, inside the Tone clock callback; Task 12 measured the store half under 1 % and React about a third of
  the 61–185 ms tasks it sat in (4× throttle).
- **The 1 Hz clock tick** (`AttenuationStyleView`, `setInterval` → `activeLocaleLocalTime`, a float that changes every
  second, running powered off too). About 60 Factories recompute fills, facets and window grids; every scenery actor,
  the 12 world robots, WaterColumn, LightShafts and TerrainLayer subscribe; LocaleView → OceanScene (neither memo'd)
  cascades to every non-memo child. One burst a second; whether it exceeds 100 ms is unmeasured.
- **The battery tick** (`tickRobotLifecycle`): 10–12 separate `updateRobot` sets per measure, each carrying the fan-out
  above, for a dimming overlay that is a step function.

**To check first:** one `npm run perf -- --profile` idle window with swells on, read for long tasks attributed to
`performWorkOnRoot` under the clock tick and under the swell tick, before any edit.

**Fix (behaviour, RED first), if the measurement says so:** RobotBody memoises the three objects it hands RobotGem;
LightShafts and TerrainLayer select only what they draw; the flicker trigger tuples lose the layer gains (a swell is not
an edit); the lifecycle tick writes its batteries in one store set; and the Factories subscribe to a quantised hour.
Done when the same profile window shows the two ticks' React share gone from the long tasks, with the world looking the
same.

### 42. Audio: Does a Long Pause on iOS Safari Come Back? (Measure First)

**Found 2026-10-31** by the off-screen review ([OFF_SCREEN_REVIEW_FOLLOWUPS.md](../tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md)
R24). Power is a pause: `AudioEngine.pause()` suspends the AudioContext and `AudioEngine.resume()` resumes it
(`src/engine/AudioEngine.ts`). A rejected resume is only logged, in dev builds only (`devWarn`), and nothing falls back:
`powerController.resume()` is unconditional, so the world reads `'running'` over a context that may still be suspended,
and the tablet comes back silent. The engine's comment used to promise a cold-start fallback that was never built.
Whether iOS Safari refuses, or quietly drops, a resume after a long suspend is unmeasured.

**To check first:** on an iPhone in Safari, power on and let it play, power off for 10 minutes (once with the screen on,
once locked), then power on. Read `Tone.getContext().rawContext.state` right after the resume and again a second later,
and listen.

**If it stays suspended, build the fallback:** `powerOnSequence` reads the context's state after the resume, and if it is
not `'running'`, tears the paused world down (`tearDownPausedWorld`, worldTransition.ts) and starts cold. The power-on
is a user gesture, so `Tone.start()` may unlock the context there; a plain retry of `resume()` inside the gesture is the
cheaper first try. Done when a 10-minute pause on iOS comes back with sound.

### 43. Animation: The World Pause Misses Timelines Built Paused and Played Later

**Found 2026-10-31** by the off-screen review ([OFF_SCREEN_REVIEW_FOLLOWUPS.md](../tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md)
R26, item 1); **recorded, not fixed** (Crawford, 2026-11-01). Power is a pause: `pauseWorldTimelines()` pauses every
`'world'` timeline that is playing, and a `'world'` timeline registered during the pause is paused on arrival
(`setTimeline`, `src/animation/timelineMap.ts`). The arrival guard only pauses a timeline that is already playing, so a
timeline built `{ paused: true }` and played after `setTimeline` slips through and runs under the pause. That is how the
deck camera's float moved behind the off screen, and R26.1 gated the camera's tick on the world state.

**Still open:** the same pattern builds the robots' swims, the work loop's dissolve and work moves, and the station
ripples. Nothing starts those while the world is paused today, so nothing visible is wrong. A future change that does
would reopen it. **The general fix, when wanted:** have the registry hold a paused-span timeline paused until the span
ends, whenever it is played (wrap `play`, or check the world state where those callers play), and drop R26.1's
camera-only gate. Done when a `'world'` timeline built paused and played during a pause stays still until the resume.

### 44. Sessions: Warn Before the Saves Fill the Browser's Storage

Requested by Crawford, 2026-11-01, with the off screen's Keep failure line. There is no save-count limit in the app.
The saves live in `localStorage` (`src/utils/sessionStorageEngine.ts`), which browsers cap per origin, at about 5 MB
in Chrome. A save that does not fit throws. Keep catches it and shows its failure line in the warning's place (off-screen
review R20; Crawford's words for it, "storage is already full, cannot save world", land at F3 of
[OFF_SCREEN_FINAL_FIXES.md](../tasks/OFF_SCREEN_FINAL_FIXES.md)). Comms' Save shows "<name> failed to save."
(`session.status.saveFailed`). Neither warns before the limit.

**To work out:** how big a save is (the payload is a diff against the seed, so an untouched world is small and a
heavily tweaked one is not); how many fit; and whether the off screen and the Sessions panel should show the space
left, warn as it runs low, or both. Delete is already in the Sessions list. Needs a short interview: where the warning
lives and what it says are Crawford's.

### 45. Off Screen: Crawford's Three Preset Links

Moved here from the off-screen review (Crawford, 2026-11-01). The off screen's three presets
(`src/data/transmissionPresets.ts`) are still placeholders. They are the bare triples of the first build's stand-in
worlds (`kr1nd4ra` at 12, 68; `qb9mezm3` at -84, 131; `h4lcy0n` at 143, -57), named by stand-in copy
(`home.off.presets.a`–`c` in `src/content/copy/home.ts`: Kryndara, Vessport Null, Halcyon Drift). A preset is a pasted
world link ([docs/specs/OFF_SCREEN.md](../specs/OFF_SCREEN.md) assumption 13): paste each share link over its `link`,
and its name over its content entry. Nothing else changes: `presetPayload` decodes whatever the link carries, the
theme and the aspect picks included. The review's probes use Vessport Null and the `kr1nd4ra` plot by name, so a later
probe run picks its worlds again.

### 46. World: Seeded Draws Are Welded and Centre-Heavy (Names, Colours, Gems, Companies, Placement)

**Found 2026-11-01** while measuring the audio draws for backlog [47](archive/backlog-archive.md#47-audio-seeded-draws-are-welded-and-centre-heavy--even-draws-first);
**recorded, not fixed** (Crawford: the visuals go on their own branch in case they need different tuning). A plain
`getSeededVal` draw samples one smooth simplex patch per world, so keys whose hashed x land close together read nearly
the same value, a key at offset 0 takes only a few values across all worlds, and a band's outer tenths rarely come up
([docs/specs/EVEN_SEEDED_DRAWS.md](../specs/EVEN_SEEDED_DRAWS.md) §1.1 has the measurements). 47 moved the audio draws
to `getUniformSeededVal` (merged via PR #596, 2026-11-02; [PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md)
"Sampling Values" describes the three draws and lists the keys left on the plain one). The world and visual draws keep the plain draw: robot and company names, identity colours,
gem seeds, robot and company ids, company count, size and membership, spawn positions, the roster's active count and
docked batteries (`lifecycleSim.ts`, `spawnSystem.ts`), factory placement (`factoryPlacementSystem.ts`), districts
(`districts.ts`), terrain (`terrainProfile.ts`), light shafts (`LightShafts.tsx`), locale temperature.

**To work out:** which of those are picks (they should go even, like 47) and which are smooth walks on purpose (the
terrain profile and the temperature steps probably are). Then measure, switch the picks, and look: every world's
names, colours, gems and layout move. Done when no pick is welded to another and each fills its range.

### 60. Audio: Cover the Silence When Every Active Robot Is Charging

Requested by Crawford at the 2026-11-02 plan review: occasionally every active robot is docked and charging at once and
the music stops, an awkward pause. Cover it for now; the elegant answer waits on backlog
[7](#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter) (chord progressions) post-launch. The shape he has
in mind: always keep at least one robot sounding, perhaps "min 1 stays, max 3" by audio quality tier.

**Where it lands.** The docking lifecycle (`src/systems/robotSystems.ts`, [ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md):
the fixed 12-robot roster, flat drain and recharge on the measure tick) decides who docks when, and the Audio Load Budget
(`src/systems/audioBudgetSystem.ts`, [AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md) "Audio Load Budget") already caps sounding
robots per tier, so a floor beside the cap is the natural pair. Needs a short interview before a spec: a floor means
either a robot stays up past empty (which bends the battery rule) or the drains are staggered so the fleet never empties
together, and whichever it is must keep the lifecycle a pure function of seed and measures (roadmap 20.5's replay).
Plan.md Stage 3.

### 61. Accessibility Review

Requested by Crawford at the 2026-11-02 plan review. A fresh pass over the shipped UI before launch: focus order and
keyboard navigation through the nav panel, the section tabs, the roster and the off screen; the reduced-motion paths
(the scene wash, the boot theatre, the robots' and camera's motion); contrast of the console palette and the off
screen's veil and footer; labels and roles on the 13 control primitives and the dialogs. CLAUDE.md asks for basic a11y
checks on every PR; roadmap 18 (Cabinetry Verification: Accessibility & Performance) was the last planned pass and was
cut on 2026-10-22 before it ran, and the UI has been rebuilt since (roadmap 45, 57). Not yet scoped: a short interview
decides the checklist and the tools (an axe run in the browser, a keyboard walk, a screen-reader pass). Plan.md Stage 5.

### 62. Misc Review Items (a Bucket)

Opened by Crawford at the 2026-11-02 plan review: a place to add small review findings as he finds them, text content
included, to fix in one pass (plan.md Stage 6). One bullet per item, dated; when the pass runs, each bullet becomes its
own commit, and the item archives when the list is empty.

- 2026-11-02 — Roadmap 57's copy stand-ins, all marked in `src/content/`: the five theme sentences, the Melody label and
  four Melody sentences, the Envelope, Distance and Voice labels, names and sentences, Roll and a save row's "saved …"
  (`home.ts`), `Loaded Under` (`company.ts`, `probe.ts`), the lore footer, the Factory Reset body (`session.ts`). Roadmap
  [58](roadmap.md#58-themes-and-aspects-refinement)'s copy step rewrites the theme and aspect sentences; the rest is here.
- 2026-11-02 — Tone's `The AudioContext is "suspended"` console warning on every world rebuild while off (a pick or
  Roll): a warning, not an error, to silence or accept.
- 2026-11-02 — The off screen's unsaved line (`home.off.unsavedWarning`, "Picking another transmission discards this
  world's unsaved changes."): under backlog [64](archive/backlog-archive.md#64-off-screen-current-stays-the-world-you-came-from-and-a-new-transmission-row-with-scan)
  picking no longer discards Current, powering on into another row does. Reword it.

### 63. Style Fixes (a Bucket)

Opened by Crawford at the 2026-11-02 plan review: visual chrome fixes collected as he finds them, to fix in one pass
(plan.md Stage 7, beside backlog [1](#1-onload-better-power-off-background) and [3](#3-onload-sleeve-logo)). One bullet
per item, dated; each becomes its own commit when the pass runs, and the item archives when the list is empty.

- (none yet)
