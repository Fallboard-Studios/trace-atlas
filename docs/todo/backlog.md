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

### 5. Sector Settings: AS/Coords/Favorites Reorganization

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority. Today's
`ATTENUATION_STYLE_PRESETS` (`sectorSettingsConfig.ts`) is what Crawford means by
"favorites" — same concept, different name; not a new feature so much as a reframing
plus a data refresh. Crawford has been separately keeping his own list of good
Attenuation Style + coordinate combinations; once roadmap Phase 21 (Sector Settings:
Shareable Link Import/Export) lands, he wants to update the in-app preset list with
current, shareable links, alongside reorganizing how AS/coordinates/presets are laid
out in the Sector Settings panel. Depends on Phase 21 for the "shareable link" half —
Session Storage (Phase 20) alone only makes a link possible via the address bar, not
an in-app Export/Import action.

**Reframed 2026-10-22 (Crawford):** this item is now about the **powered-down state**, not the Sector
Settings panel. The off screen's Transmission row from roadmap 45 (three preset worlds and the user's
saves; [backlog archive 2](archive/backlog-archive.md#2-onload-power-off-intro-text)) is the partial
start; Crawford has a plan for how that screen shows the themes ([docs/ideas/themes.md](../ideas/themes.md)),
the sessions and the presets. Item [7](#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter)'s
selection UI is expected to live here too (its progression engine stays item 7's own, large, piece of
work), and item [19](archive/backlog-archive.md#19-short-world-link-bring-back-seed-x-and-y)'s short link is the natural form for
a preset entry. Still needs its own `/interview-me`.

### 6. Audio: Groove Feature

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. A new mechanic: a "groove" value that raises the odds of robots syncing
their rhythm to other robots while docked/recharging. Would touch `robotSystems.ts`'s
docking logic and melody/rhythm generation. Not yet scoped — open question is whether
"groove" is a single global dial (e.g. a Sector Settings or Audio Rig control) or a
per-robot/per-locale value.

Note (2026-10-06): roadmap Phase 43 puts docked robots inside 2–3 charging stations (capacity 6
each), so the robots sharing a station are a natural grouping for "who syncs with whom".

### 7. Audio: Tagged Chord Progressions, Seeded Mood Chain + Tag Filter

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11, as "more chord progressions +
selection UI". Low priority — deprioritized behind launch. Design discussed with Crawford
2026-10-09 and recorded here; **not interviewed, not specced** — needs its own `/interview-me`
pass when picked up, which should start from the "Open" list below.

**Note 2026-10-22 (Crawford):** the user-facing part (the tag filter, the mood choice) is now expected to
be built with item [5](#5-sector-settings-ascoordsfavorites-reorganization)'s powered-down state rather
than in the Audio Rig's Pacing section as the "UI home" lean below says. The progression engine, the
catalogue and the seeded chain stay this item and are a large build in their own right; 5's interview
decides the surface, this item's interview decides the music.

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

### 23. Audio Palette Trials: Dynamics Processing and Ducking

`Tone.MultibandCompressor` (low / mid / high compressors with two crossovers) as a richer Output stage
than the single `Compressor`; `Tone.Gate` (`threshold`, `smoothing`) to close the chain between phrases
on a sparse world; and `Tone.Follower` driving a `Gain` for sidechain-style ducking — the fleet dipping
under a soloed robot (`audioMode: 'solo'`), or under a swell. Ducking is the interesting one: a
*behaviour*, not a knob. The follower's output is a signal, so it needs a `Tone.Multiply` / `Scale`
pair into the dry bus's gain — no other nodes. All three react to the signal and carry no clock, so
they replay in the follower sense. Output section tab. Phone gate as always; multiband is three
compressors.

**Interviewed with roadmap 54, 2026-10-23, and deferred, not built** ([docs/specs/OUTPUT_HEADROOM.md](../specs/OUTPUT_HEADROOM.md)
assumption 9). Multiband is worth trying only if the single Compressor sounds wrong now that it is off safety duty (the
output ceiling holds the master under full scale). Roadmap 54's Checkpoint A heard one Compressor fault, a 70 ms release
slammed by every robot at 100 %, and the seeded release floor (0.25 s) answered it, not multiband.

### 24. Audio Palette Trials: Transport Groove and Tempo Walk

`Tone.Transport.swing` (0–1) and `swingSubdivision` (`'8n'` / `'16n'`) exist on the transport the
melody loop already runs on. A Pacing-section Swing slider is one store field and one transport write,
and **every** robot swings together. Check first that swing reaches the playback loop's scheduled
times — the `8n` step scheduler ([AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md) §Playback loop) computes its
own offsets from the tick, and Tone applies swing to the transport's own event times. Ties to backlog
[6](#6-audio-groove-feature) (Groove: robots syncing while docked) and to item 7 (progressions): a
global swing is the simplest groove and may be enough.

**Tempo walk:** a slow seeded random walk on BPM (± a few BPM over many measures, `getSeededVal` by
measure, the swells pattern) as Pacing's equivalent of an LFO — replayable by construction, but BPM
moves everything that counts measures, so the fleet's lifecycle speeds and slows with it (accepted:
the 2026-10-09 time decision keeps the lifecycle on measures) and Sync-mode lanes follow. Try swing
first; the walk only if a world feels too metronomic.

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

### 27. Audio: Phone Playback Underruns at Light Load, `main` Included

**Found 2026-10-18** during the per-mover Pixel A/B (PERFORMANCE.md "the Pixel A/B: not separable on the phone"). On the
Pixel 8 at **Light** Audio Load (`load 20%·fx 20%`, latency `playback`, every LFO tier off), the Task 20 world crackles
on both builds: `main` about 22 playback underruns in three minutes, the branch 41 to about 88 depending on the run. The
`?debug` overlay rules out a broken signal (`fin ok`, master peak −3 to −11 dB, no clipping) and the main thread (57–60
fps, low lag): the audio thread misses its deadline in bursts of one to four, and keeps doing so with only one robot
sounding, so most of the cost does not scale with notes played. Related history:
[scratchy-audio-phones.md](scratchy-audio-phones.md) (the Audio Load Budget was its mitigation).

**First candidate, unmeasured:** the five colour and modulation effects in the global chain (Distortion, Chebyshev,
BitCrusher, AutoWah, Phaser; `src/engine/audioEngine/globalFx.ts`) sit in series and are never disconnected, so at wet 0
each still processes every sample; Tone's dry/wet mix only discards the result. The Phaser runs ten all-pass stages per
channel and the BitCrusher is an AudioWorklet. Disconnecting an effect at wet 0, the way an LFO at rate 0 Hz disconnects
(roadmap: LFO Active toggle removed), would take that cost off a world that does not use them. Changing how the chain is
wired is an audio-architecture change (CLAUDE.md: ask first).

**How to start:** measure before changing anything: the audio thread's render capacity with the five effects in the chain
against out of it (a scratch build), on the desktop with `npm run perf:audio` and on the Pixel through Chrome's remote
DevTools WebAudio panel over USB, which reads a continuous load figure rather than counting failures. The phone's
underrun count alone proved too noisy to separate two builds (the A/B above). Then Crawford's call.

**Update 2026-10-20: the first candidate is built; the item stays open.** On `feature/pedals`, every dark global effect
now leaves the signal path (the Dark-Effect Bypass, [docs/specs/DARK_EFFECT_BYPASS.md](../specs/DARK_EFFECT_BYPASS.md)
§8; numbers in [scratchy-audio-phones.md](scratchy-audio-phones.md), T12 and rounds 3 and 4).

**Measured.**
- **Desktop:** all ten dark cost 38.3 ‰ in their cells, against 150.6 inline in the same sitting. `perf:audio`: branch
  0.431 / 0.502, `main` 0.460 / 0.580.
- **Pixel 8, Full, at 3:00 / 4:00:** a dark world 31 / 54 against `main`'s 48 / 75; four lit 59 / 69 and 53 / 110 on
  a fresh phone.

**Still open: a run late in a sitting collapses on both builds.**
- In round 4, `main`'s baseline ran fifth: 26 at 3:00, then out at 4:13 with 2 000+ underruns. The branch's third and
  fourth runs collapsed the same way.
- A collapse survives a Chrome restart.
- A sine-only page on the same hot phone still carried 700 oscillators before underruns climbed. So the audio path
  works, and the app sits near the phone's limit.
- In every round the collapses come 2:50–4:00 into a run.
- Not yet separated: heat against state accumulating across runs.

**Next.**
1. A desktop long run: 15 minutes headless, logging render capacity, live node count, Transport events, voices and
   memory, looking for load that grows during a run.
2. On the phone, the same link in an Incognito tab right after a collapse, and the sine ramp on a cool phone, to price
   what heat costs.

**Update 2026-10-22 (Robot Effect Sends T21, [scratchy-audio-phones.md](scratchy-audio-phones.md)):** the first
collapse on a rested phone. With the phone off for at least 20 minutes before each run, the second run of the sitting
(the 50.7 branch, Full) spiked at 3:30 and was out at about 4:20; its repeat, run 7, was fine, and the base's run 6 rose
95 → 250 with clipping at 4:20. A heavier world on the same build and tier (7 lit, run 5) did not collapse. So heat or
state left over from earlier runs explains it less well than it did in round 4.

**Update 2026-10-23 (Output Headroom T10, [scratchy-audio-phones.md](scratchy-audio-phones.md)):** clicks at Light, the
tier a phone picks by itself, on a rested Pixel 8. `56c2t2t8` at (−116, −2) "clicks throughout" on `main` (190
underruns at 3:00, 254 at 4:00) and on the Output Headroom branch (140 → 173); `bravo` read 93 (`main`) and 149
(branch) at 3:00. The two builds swap order between the worlds, so the clicks are not that branch's; its output is
never at full scale, so they are not clipping either. Crawford: chase them here, after roadmap 54 merges.

**Next, re-ordered 2026-10-23** ([plan.md](plan.md) Stage 1: the desktop first, the Pixel once at the end). The two
rested sittings changed the list above. T21's run 2 collapsed after 20 minutes off, and run 7, the same link on the same
build and storage later in the sitting, did not; so heat and carried state each explain the collapse less well, and the
Incognito tab and the cool-phone sine ramp drop to last, run only if the desktop leaves the collapse unexplained. T10
added a second symptom the list did not have, steady clicks at Light, which no phone-side step addresses.
1. Desktop: `npm run perf:audio` on D1 (`56c2t2t8` at (−116, −2)) against D5 (`bravo` at (−150, 90)) at Light, and a
   read of what D1 carries. Light on D1 (190 at 3:00) read worse than Full on D5 did in T21 (48–95): the world costs
   more than the tier saves. What is it, and why does Light not cut it?
2. Desktop: the 15-minute long run as written above, for the late collapse.
3. Pixel, in the sitting: 29's lighting by ear; and the Incognito tab after a collapse and the cool-phone sine ramp
   only if 1 and 2 leave the collapse unexplained.

**Update 2026-10-23 (Stage 1 step 1 done, desktop; [scratchy-audio-phones.md](scratchy-audio-phones.md) "Backlog 27,
desktop step 1").** D1 and D5 at Light read alike on steady load (means 0.49–0.52, both bursting to 0.95–0.998 from the
first bucket), so the tier is not what separates them. What separates them is **notes**: D1 plays about ten times as
many with the same four robots sounding, and **every note leaks one native OscillatorNode** — Tone 15's `Oscillator`
connects its persistent frequency and detune Signals into a fresh node per start and never disconnects them when the
note ends, and standardized-audio-context keeps each such connection as a strong reference in the Signal's output Set,
scanned on every later connect. Forced GC frees the matching Gains and not one oscillator: retention, not lag. About
two a second on D1 (+324 nodes in four minutes, identical across three rounds; D5 +55). Pending Transport events hold
at 12. Not yet tied to the underruns (the bursts predate any accumulation); the two settling measurements are the
15-minute long run (step 2, unchanged, now with `nodes`/`heap`/`events` columns) and a same-session A/B against a
scratch build whose `Oscillator.onstop` disconnects the dead node's params. A fix is a dependency patch or an upstream
change: Crawford's call, then a spec.

**Update 2026-10-23, later (step 2 done; [scratchy-audio-phones.md](scratchy-audio-phones.md) "Backlog 27, desktop step
2").** The 15-minute runs: the leak holds its rate (D1 +1057 nodes, D5 +171) and capacity shows no trend on either
world; the heap climbs the same 12 MB on both, so most of that is a **second, world-independent accumulation of about
0.8 MB/min, unidentified**. The A/B (a throwaway build that disconnects the dead node's two params at `onended`) proves
the mechanism, taking D1 from +324 to +48 nodes, and changes nothing on the audio thread: stock 0.526–0.579 against
patched 0.541–0.558, same bursts, same max lag (9–26 ms), heap still climbing. **The desktop has answered what it can**:
the bursts at Light are the graph's standing cost with four robots sounding; the collapse does not reproduce in fifteen
minutes; two things accumulate that only the phone can price. Open for Crawford: carry the one-line disconnect as a
dependency patch or an upstream Tone PR (a spec either way); name the heap growth (a heap-snapshot diff) before the
sitting or not; take the patched build to the sitting beside stock.

**Update 2026-10-23, later still (Crawford's calls, and the heap growth named; [scratchy-audio-phones.md](scratchy-audio-phones.md)
"step 2b").** Decisions: the leak fix goes as a dependency patch, spec at
[docs/specs/OSCILLATOR_LEAK_FIX.md](../specs/OSCILLATOR_LEAK_FIX.md); the heap growth was named; the Pixel sitting comes
after both. **The heap growth is Tone's per-Param automation history** (`Param.setValueAtTime` on every note, each
Param's Timeline capped at its newest 1 000 events), so it is bounded and saturates after tens of minutes; a
sampling-profiler read on the dev server put it, the leaked oscillator wrappers and dev-only React bookkeeping at the
top, and a direct read showed the context's timeout list flat. Closed as a cause; the one loose end is the prediction
that a 30-minute production run flattens the heap. The leak fix is its own item now:
[32](archive/backlog-archive.md#32-audio-oscillator-leak-fix--disconnecting-the-dead-notes-params).

**Update 2026-10-26: the desktop half is done; only the phone sitting is left.** Steps 1 and 2 above are recorded, the
leak fix merged (PR #577, archived as [32](archive/backlog-archive.md#32-audio-oscillator-leak-fix--disconnecting-the-dead-notes-params)),
and the other Stage 1 items that rode with this one are merged too (29, roadmap 17.2.8, roadmap 53's Checkpoints B and
C). What the sitting still owes, on `main` (the leak fix in it), D1 and D5 at Light, reading the overlay's underrun
count as a pointer and not as evidence (backlog 29):
1. The steady clicks at Light on D1 and D5, by ear. Crawford's call of 2026-10-23 was to carry a build without the
   leak fix beside the fixed one; with the fix merged, that is any `main` before `4e0cb174`.
2. Whether the late collapse (2:50–4:00 into a run) still comes. Only if it does: the same link in an Incognito tab
   right after it, then the sine ramp on a cool phone, to price heat against carried state.
3. Optional, desktop, any time before the sitting: the step 2b prediction that a 30-minute production run flattens
   the heap. It exceeds the agent's tool limit, so it is Crawford's terminal run: step 2's command with
   `--seconds 1800`.

**Update 2026-10-26, later: the sitting is done ([scratchy-audio-phones.md](scratchy-audio-phones.md) "Backlog 27 on
the Pixel — the sitting"). Both halves of the measurement are in; what is left is a design decision.** Four runs on a
rested Pixel 8 at Light, `main` `286ee642` beside `main` just before the leak fix (`5bd7f593`), D1 and D5: every run
"scratchy throughout" from the first seconds, about two hundred underruns by 3:00 (191 / 200 on D1, 136 / 222 on D5),
no audible difference the leak fix makes in either direction, and **no collapse in any run**, the second rested sitting
without one. So the clicks are the graph's standing cost at Light on this phone, not an accumulation; the Dark-Effect
Bypass, the leak fix and the tier's own cuts (four sounding robots, eight voices) have each left them in place, and the
collapse of round 4 and T21 has not recurred since 2026-10-22 and stays unexplained. Step 3 (the 30-minute heap run)
was not run; it is optional and settles nothing here. **Next:** what Light still carries (about 1 790 live nodes with
two to four robots sounding, `fx in 5/10`) and what else it could cut is a change to how the audio graph is built, so
per the Stage 1 agreement it goes interview → spec → plan, with the two `main` sittings at Light (2026-10-23 and today)
as the baseline. Where that sits in [plan.md](plan.md) is Crawford's call.

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
grid for every log slider) is parked at the end. Not yet specced. Waits for roadmap
[56](roadmap.md#56-short-world-link) to merge (the finish-the-branch rule); nothing on that branch depends on it.

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

### 35. Audio: BeatClock Drops the Transport Time Its Callbacks Are Given

**Found 2026-10-26** (Crawford, dev and production builds alike): Tone prints, once per page load,
"Events scheduled inside of scheduled callbacks should use the passed in scheduling time"
([Accurate Timing](https://github.com/Tonejs/Tone.js/wiki/Accurate-Timing)). Tone raises it the first time a call
inside a Transport callback reaches `toSeconds(undefined)`, that is, a Tone method given no time while the Transport is
running a scheduled callback (`assertUsedScheduleTime` in Tone's `Debug.js`, called from `ToneWithContext.toSeconds`).

**Cause.** The engine's own note tick passes the Transport's time through (`AudioEngine.ts`, `scheduleRepeat((time) =>`),
so notes are placed on the beat. BeatClock does not: its `scheduleRepeat(interval, callback)` wrapper
(`src/engine/beatClock.ts`) takes a `() => void` callback and discards the `time` the Transport hands it. Every consumer
of the measure tick runs through that wrapper: the harmony tick (`harmonySystem.ts`), the swell tick
(`audioSwells.ts`, every 16th), and the docking lifecycle's ramps and starts. Each of their Tone calls (ramps, level
sets, starts) therefore lands at "now", the audio clock's current time, rather than at the callback's time, which runs
about `lookAhead` (100 ms) ahead of it: early by up to that much, with jitter. Those are ramps and levels, so it has
not been heard; it is still scheduling off the beat on the path CLAUDE.md says is beat-based.

**Fix (behaviour, so RED first):** BeatClock's wrapper passes the Transport time to its callback; `scheduleRepeat`'s
callback type becomes `(time: number) => void`; each consumer that reaches Tone from the tick takes the time and uses it
(the swells' `apply*` writes, the harmony change, the lifecycle's ramps), or states in a comment why "now" is right for
it. Done when the warning does not fire on a fresh page through a few measures of a playing world (a headless check over
CDP catches it: a `console.warn` listener on the page) and the measure-tick consumers' tests pass a time through. This
changes how the scheduling path is called, not what it schedules; Crawford asked for it (2026-10-26), so the CLAUDE.md
"ask first" is met.

**Status:** intent [docs/intent/beatclock-transport-time.md](../intent/beatclock-transport-time.md), spec
[docs/specs/BEATCLOCK_TRANSPORT_TIME.md](../specs/BEATCLOCK_TRANSPORT_TIME.md), plan
[docs/tasks/BEATCLOCK_TRANSPORT_TIME.md](../tasks/BEATCLOCK_TRANSPORT_TIME.md); building on branch
`fix/beatclock-transport-time`.

### 36. Audio: Swells on `pulseWidth` Write NaN Into the Voice Every Tick

**Found 2026-10-26** (Crawford, dev and production): a flood of
`[AudioEngine] Failed to set pulseWidth on composite layer Error: Invalid argument(s) to setValueAtTime: null, 14.2…`,
one every 16th note, from `applyOscFieldViaSet` ← `composite.set` ← `AudioEngine.updateVoiceLayerParams` ←
`applyLayersContinuous` (`robotOptionsActions.ts`). The `null` is `JSON.stringify(NaN)` (Tone's `Param.setValueAtTime`
assert prints the value that way), so the value written is **NaN**, not null.

**Cause.** A swell whose target is `layerN.pulseWidth` reads its base from the robot's stored layer
(`readRobotValue` in `audioSwells.ts`: `layer[field]`), and `OscillatorLayer.pulseWidth` is optional
(`src/types/layeredAudio.ts`: "meaningful for pulse/square oscillators"), so on a layer without one the base is
`undefined`, the swell's arithmetic makes NaN, and `writeRobotValue` applies it through `applyLayersContinuous` on every
tick for the swell's life. The eligibility check (`isRobotAttributeStructurallyLive`) asks only that the layer's gain be
nonzero, not that the field exist or that the layer be a pulse type. The composite catches the throw and warns, so the
voice keeps its old width and nothing is heard; the console is unusable while it runs.

**To check first:** whether `applyLayersContinuous` also writes the NaN into the store (a NaN in Zustand serialises
as `null`, so a saved session or world link could carry a `pulseWidth: null`), and whether `phase`, also optional on
the type, can do the same.

**Fix (behaviour, RED first):** a swell on a layer field is structurally unavailable when the robot's layer has no finite
value for that field, the same way a missing layer slot already is, so the pool never selects it; and
`readRobotValue` never returns a non-number (fall back or throw in a test, not NaN into the engine). If the store check
finds a NaN, the write path refuses non-finite values too. Done when a world with non-pulse layers runs several swells
with no warning, and a seeded test that forces a `layerN.pulseWidth` swell on such a layer passes.

### 37. Audio: Phase Swells Rebuild a Periodic Wave Every Tick

**Found 2026-10-26** by backlog 35's measurement (Task 12, [PERFORMANCE.md](../PERFORMANCE.md#the-swell-ticks-main-thread-share-task-12)).
Crawford asked for it as its own item after the breakdown (2026-10-26); whether 35's pre-scheduled curve is built at all
is 35's Checkpoint C decision, not this item's.

**What was measured.** On the swell-heavy link (charlie, Swell Frequency 16, Duration 1), unminified build, 4× throttle,
the IDLE window: the swell tick takes 4.13–6.45 % of sampled time. Writes to a layer's `phase` are **1.82–4.10 %** of
that window, most of the tick, and every other part is smaller: pulse width 0.05–0.12 %, the robot param writes 0.21–0.24 %, the global setters
0.23–0.48 %, the store 0.77–0.83 %. The ticks that write phase sit inside Tone clock tasks of 61–185 ms.

**Cause.** A swell on `layerN.phase` (0–360°, `ROBOT_SWELL_FIELD_RANGE` in `src/data/audioSwellRanges.ts`) writes a new
value every `16n` through `applyLayersContinuous` → `AudioEngine.updateVoiceLayerParams` → the composite's `set` →
`applyOscFieldViaSet` → `synth.set({ oscillator: { phase } })`. Tone's `Oscillator` `phase` setter re-runs its `type`
setter, which looks for a cached periodic wave with exactly that type and phase (`_periodicWaveCache`, 100 entries) and,
on a miss, computes the partials (`_getRealImaginary`) and calls the native `createPeriodicWave`. A swelling phase is a
new value on nearly every tick, so nearly every tick misses: in one run 210 of the layer method's 310 ms was
`createPeriodicWave`. A curve cannot carry it: phase is a setting, not a Param, so 35's agreed curve design leaves it
stepwise.

**To check first:** whether swapping the wave of a sounding oscillator every 16th is audible at all (a click, or nothing),
which decides whether a phase swell is worth keeping; and how many distinct phase values a swell writes in practice.

**Options for the interview** (not decided): write phase only when it has moved by at least a step, so the
cache hits; quantise the swelled phase to a coarse grid that fits the cache; take `phase` off the swell targets; or keep
a wave per layer and swap it less often. Then the same measurement as 35's Task 12 on the same link, before and after.
[36](#36-audio-swells-on-pulsewidth-write-nan-into-the-voice-every-tick) touches the same layer-field swell path
(`readRobotValue`, eligibility), so the two may share a branch.
