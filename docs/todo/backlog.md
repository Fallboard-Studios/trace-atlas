# Backlog

Tracks todos, bug fixes, and cleanup items that aren't part of a roadmap phase — either
surfaced by a `/code-review-and-quality` pass (or similar) on unrelated feature work, or
raised directly by Crawford as a smaller idea that doesn't warrant its own roadmap phase.
Distinct from `docs/todo/roadmap.md`, which tracks features/phases with their own
Create/Restructure/About/Docs shape.

Not a spec — this is a review-output backlog. Each item gets its own `/interview-me` or
spec pass (as warranted by its size) when picked up; check it off here once merged. Not
itself one of CLAUDE.md's Reference docs.

See also [docs/DUPLICATE_VALUE_AUDIT.md](DUPLICATE_VALUE_AUDIT.md) — a dedicated sibling
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

### 11. Visuals: Small Immersion Animations

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. Likely a grab-bag of minor polish (idle bobs, blinking lights, and similar
small touches) rather than a single feature; exact list not yet defined.

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

### 14. Live-Profiler Reverification Still Pending (3 spots)

The `refactor/factory-timing` performance series (merged to `main` via PR #465, `e55e846`,
2026-09-14/15) fixed a long chain of re-render bugs — most were live-verified with
Crawford and React DevTools Profiler at the time and are fully closed. Three specific
fixes in that same series still haven't gotten their own live-Profiler recheck:

- **`RobotBody`'s lighting/audio-shape split** (`RobotBody.tsx` — `audioVisual` vs.
  `colors` memos) — code fix landed and unit-tested (a regression spy confirmed the
  wasted recompute before the fix), but never re-checked live in the Profiler the way the
  sibling `Factory`/`BubbleStream` fixes were.
- **Once/sec lighting-tick batching smoothness** (`AttenuationStyleView.tsx`'s
  `React.startTransition` wrap) — doesn't reduce total work, only lets React spread/
  interrupt it; whether the commit visibly spreads across multiple frames now (and feels
  less spiky) still needs a live look.
- **`RobotOptionsTab`/`CompanyOptionsSection` memoization** — the fix and its cascade
  regression tests are merged and passing, but note the file shape has since moved on:
  both components were later rewritten to render through a shared
  `RobotSectionAccordionStack` (roadmap Phase 28, Robot Section/Subsection Config
  Consolidation) — any specific file:line citations from the original fix are stale, but
  the underlying stabilized-callback/memo pattern is confirmed still present (a `// Task 6`
  comment referencing the original fix survives the restructure). Re-verify against
  current code, not old line numbers, when this gets checked.

### 15. Test Suite: Three Tests Fail Intermittently Under a Full Parallel Run

**Status:** ☐ open — noticed 2026-09-18, still reproducing as of 2026-09-28 (see project
memory: known-flaky unmocked-random tests).

Four tests fail occasionally in a full `npx vitest run` and pass every time when their own file is run alone (3–5 isolated runs each):

- `src/systems/audioSwells.test.ts` › *pingVarianceAutomation forced return at 0% (Task 4) › forces every member of a company-wide swell together, sharing phase/timing, each landing exactly on its own baseValue* — failed in 4 of 7 full runs.
- `src/components/company/CompanyCrudControls.test.tsx` › *Rename Submit button › is (normally) enabled immediately after selecting a company — the auto-suggested draft differs from the current name* — failed in 2 full runs, one of them on the commit *before* any 17.2.2 work.
- `src/systems/factoryPlacementSystem.test.ts` › *recolorFactoriesForAttenuationStyle › changes only config.hueShift/config.satShift on every factory — everything else round-trips byte-identical* — failed in 1 full run.
- `src/systems/worldTransition.test.ts` › *initializeLocale › fully clears in-flight swells on a second `initializeLocale` call — no swell survives a restart* — failed 1 full run, seen 2026-09-28 during Session Storage (Phase 20) Task 12 verification; passed immediately on an isolated re-run.

All known failures since (per project memory) are real-RNG preconditions, not assertion
bugs — re-run once to confirm rather than retry-looping or editing assertions. All four
suggest a shared, load- or order-dependent input (wall-clock time, seeded randomness that
isn't fully pinned, or a timing-sensitive assertion). Worth a look before a CI gate is
added (there is none yet — see `CLAUDE.md`'s PR process note), since a flaky gate trains
people to re-run instead of read.

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

### 19. Short World Link: Bring Back `?seed=`, `?x=` and `?y=`

Raised by Crawford, 2026-10-09, on `feature/layout-rework`, reversing the Phase 21 call that removed
them: "I want to bring `?seed=`, `?x=`, and `?y=` back actually, they're so much better to use if a
user didn't change anything than the current json soup, especially if they want to share an
untweaked world with someone." Not yet interviewed or specced — needs its own `/interview-me`. Sits
beside roadmap [21](roadmap.md#21-sector-settings-shareable-linkimportexport) (the `?session=` link,
which stays for tweaked worlds) and roadmap
[48](roadmap.md#48-one-day-clock-remove-the-measure-based-day)'s dead-code sweep, which leaves the old
override primitives alone until this item decides their fate.

**The case, verified 2026-10-09.** An untweaked world is fully determined by two values: the
Attenuation Style's *name* (the seed for the Audio Rig, the LFO Bank, tempo and swells, via
`deriveAttenuationStyleSeed`) and the locale's integer coordinates (robots, companies, melodies,
district, terrain, stations, via `getLocaleNoiseMap`). `SessionPayload` says so itself
(`src/types/session.ts:52–58`). Yet `?session=` always carries `globalAudio`, `lfoBank` and
`globalLfoLinks` whole — "never diffed", by design — so even an untouched world shares as a long
base64 blob (`encodeSessionPayload`, `src/utils/sessionShareUtils.ts:361`). `?seed=pelagos7&x=12&y=68`
is the same world in a link a person can read, type and remember.

**What exists.** The boot seam the short form needs is already the `?session=` one: at module load
`src/stores/attenuationStyleStore.ts:23` pins `DEFAULT_ATTENUATION_STYLE_NAME` and
`src/stores/localeStore.ts:73–77` pins `DEFAULT_LOCALE_COORDINATES` from `getSessionSharePayload()`,
before first paint (no flash of the wrong world); `OceanScene.tsx`'s mount effect consumes the
payload once for its side effects. The old primitives survive in `src/utils/seedUtils.ts` with no
production caller: the sanitising `setGlobalAttenuationStyleSeedOverride` and its getter (still read
by `deriveAttenuationStyleSeed`, `getSeededVal.ts:29`, `noiseMaps.ts:55` and the debug HUD, whose
world line has printed "random" ever since), `parseCoordinateParam`, and the
`LocaleCoordinateOverride` setter / getter. Their URL readers in `seedUtils.ts` and `main.tsx` were
deleted (Phase 21 Task 0). The perf harness's `--world name:x:y` option assumed the params and has
been dead since ([PERFORMANCE.md](../PERFORMANCE.md) lines 52, 295, 382, 721);
[PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md) lines 23–38 still document the removed
mechanism as live.

**The constraint that killed them, which the spec must answer**
([SECTOR_SETTINGS_SHARABLE_LINK.md](../specs/SECTOR_SETTINGS_SHARABLE_LINK.md) §7 item 1): the old
`?seed=` worked by setting a *persistent, sanitising* module override, which (a) lowercased and
stripped the style's name, so a shared "Pelagos 7!" arrived as "pelagos7" under a different display
name, and (b) stayed set for the whole session, so every Attenuation Style created afterwards silently
inherited the pinned seed. The recommended shape is therefore **a second wire format for the same boot
path, not a revival of the override**: decode `?seed=&x=&y=` into a minimal `SessionPayload`
(`attenuationStyleName` = the exact, URL-decoded name; `coordinates`; everything else absent, so
`applySessionPayload` leaves the freshly seeded values alone as it already does for older payloads)
and hand it to the existing `getSessionSharePayload` / `consumeSessionSharePayload` seam. Then nothing
persists, nothing is sanitised, later styles are untouched, and the `seedUtils.ts` primitives become
deletable (roadmap 48 picks them up). If both forms are present, `?session=` wins — the Phase 21
interview's answer to the same question.

**Questions for the interview:**

- Param names: `?seed=` was the style's seed, which is its name; `?style=` or `?world=` may read
  better now that the name is a human string. Case and spaces must round-trip exactly.
- Each axis independent as before (`?x=5` alone pins x, y stays random), or all-or-nothing?
- Does the Sessions panel's Share (`SessionListItem.tsx` / `SessionsPanel.tsx`, `buildShareUrl`)
  emit the short form automatically when the live state equals the seeded baseline, offer both, or
  is the short form something a user composes by hand? Detecting "untweaked" means comparing against
  what the seed would regenerate (`generateGlobalAudioSettings`, `generateLfoBankSettings` and
  `generateGlobalLfoLinks` in `src/utils/globalAudioSeed.ts`, plus the seeded BPM), not just checking
  that `robotOverrides` and `companyDiffs` are empty.
- The off screen's three transmission presets ([docs/tasks/LAYOUT_REWORK.md](../tasks/LAYOUT_REWORK.md)
  Task 25) are untweaked worlds — store them as `(name, x, y)` triples and print them as short links?
- Settings → Seeds already shows the style name and coordinates; a "copy short link" there is the
  obvious home. Whether Retransmit updates the address bar is open (`?session=` is never cleared
  today, by design).

**Knock-ons once built:** the HUD's world line reads a real name again; the perf harness's `--world`
pinning comes back to life and [PERFORMANCE.md](../PERFORMANCE.md)'s suspect `charlie` / `bravo`
baselines can be re-measured honestly; PROCEDURAL_GENERATION.md is rewritten around the new mechanism;
[SESSION_STORAGE.md](../SESSION_STORAGE.md)'s "Shareable Links" section gains the second form.

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

### 22. Audio Palette Trials: More Global Pedals to Audition

The single-instance Tone 15 effects not shipped in roadmap 50.3 / 50.4 (AutoWah and Phaser both shipped, so neither moves here) — each one slot in
`wireGlobalFxChain` (`src/engine/audioEngine/globalFx.ts:144`) with a `wet`, each behind the phone
gate, auditioned one at a time on the Pixel:

- `Chorus` (own LFO: `frequency`, `delayTime`, `depth`, `spread`), `Tremolo` (`frequency`, `depth`,
  `spread`), `Vibrato` (`frequency`, `depth`), `FrequencyShifter` (`frequency` — strange, and
  on-brand). The ones with an internal
  oscillator are wall-clock (backlog 17's accepted class); Free | Sync (roadmap 33) could apply to
  their `frequency`.
- `StereoWidener` (`width`, no clock, cheap) — and a mono fold for phone speakers is the same control
  at 0.
- `PingPongDelay` as an alternative delay topology (stereo bounce) — a *type* radio on the Delay row
  rather than a second delay; `Freeverb` / `JCReverb` as algorithmic reverb colours beside the
  convolution `Reverb` (cheaper per sample than the impulse response, but metallic) — again a type
  radio, not a second reverb.

Keep what passes the gate and earns a lore name; the rest stays here as "tried, no".

### 23. Audio Palette Trials: Dynamics Processing and Ducking

`Tone.MultibandCompressor` (low / mid / high compressors with two crossovers) as a richer Output stage
than the single `Compressor`; `Tone.Gate` (`threshold`, `smoothing`) to close the chain between phrases
on a sparse world; and `Tone.Follower` driving a `Gain` for sidechain-style ducking — the fleet dipping
under a soloed robot (`audioMode: 'solo'`), or under a swell. Ducking is the interesting one: a
*behaviour*, not a knob. The follower's output is a signal, so it needs a `Tone.Multiply` / `Scale`
pair into the dry bus's gain — no other nodes. All three react to the signal and carry no clock, so
they replay in the follower sense. Output section tab. Phone gate as always; multiband is three
compressors.

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

### 26. Desktop Paint: Stage-Sized Moving Layers Re-Raster Every Frame

**Status (2026-10-17): mostly built, one finding left open.** Candidate 1 is done: small layers per mover, built as
[roadmap Phase 53](roadmap.md#53-per-mover-compositor-layers) on `perf/per-mover-layers` (not merged). Candidate 2 is
done (the camera's idle no-op, merged). Candidate 3 is not taken (the audio-headroom default stays Crawford's call).
The idle-paint gate missed its headline criterion, 0.31 × `main` against 0.25, because of a **document layer** that
repaints a full viewport on nearly every frame on both builds (cause unidentified); the work this item described fell
by over 90 %. That repaint is the open remainder, to be accepted, fixed or reframed by Crawford. The record below is the
original diagnosis, kept as written.

Diagnosed 2026-10-16 while finishing roadmap 50.5, after Crawford reported the sound breaking up about 25–30 s into every
world on his laptop at full screen. **Not an audio feature.** `main` at `2ec52f2f` reproduces it (411 underruns by 0:47,
25 fps) and a window at a quarter of the area halves the cost (66 underruns by 1:00, 54 fps), so the cost scales with pixels.
The full record, numbers and how to re-measure are in
[PERFORMANCE.md](../PERFORMANCE.md#desktop-full-screen-underruns-are-raster-bound-2026-10-16).

**Mechanism.** The scene is seven stacked `<svg>` roots sharing one viewBox (`OceanScene.tsx`'s `SceneLayer`); the four
*moving* ones — `robots-back`, `bubbles`, `robots`, `marker` — carry `will-change: transform` and are each the whole stage.
Chrome composites an SVG root, never a `<g>` inside it, so a GSAP write to one robot group's transform dirties its entire
stage-sized layer and the GPU re-rasters up to four 2560 × 1440 layers per frame for about fifty small movers (orbiters, work
sparks, robot bodies, bubbles). On Crawford's laptop Chrome runs on the integrated Radeon (the RTX sits idle) and the GPU
process is 94 % busy; the renderer main thread is 62 % busy, over half of it GSAP's frame render plus 3.3 s of layerization
in 31 s. The audio thread averages 0.55 of its quantum but spikes to 0.99, so any CPU contention tips it into underruns.

**Fix candidates, ranked:**

1. **Small compositor layers per mover** (needs `interview-me` → spec → plan; the idle-paint gate `npm run perf:idle` and the
   PERFORMANCE.md baseline are the numbers to beat). Each robot in its own positioned wrapper moved by a compositor-only
   transform, with the gem's own small SVG inside, so a swim costs a composite and only an orbiter or spark costs a small
   raster. Everything that reads a robot's group or ref must keep working: the swim and job timelines (`createSwimTimeline`,
   `buildJobTimeline`), the row switch and its dissolve, the deck camera's target (`deckCamera.ts`, `getRef('robot-…')` and
   `gsap.getProperty(el, 'x')`), `FollowedRobotMarker`, and click handling. Bubbles the same way.
2. **The deck camera's idle tick** — **done 2026-10-16** on `fix/deck-camera-idle-range`: the two dimensions are measured at
   registration and on resize, and with scroll range 0 the camera stands down (no tick work, no pick, no marker). The
   diagnosis, kept: `registerDeckScroller` added the per-frame handler
   whenever a scroller exists, scroll range 0 or not; at full screen the range is 0, yet every frame `targetFor` reads
   `scrollWidth` / `clientWidth` (a forced layout right after GSAP's writes) and writes `scrollLeft`. It was 4.2 % of
   main-thread samples. No-op when the range is 0; cache the two dimensions on resize.
3. **Audio headroom as mitigation**, not cause: the Standard Audio Load preset or `?latency=playback` widen the margin;
   whether the desktop default should change is Crawford's call.

**Machine-side**, not a fix for anyone else: forcing `chrome.exe` onto the RTX in Windows graphics settings would show how
much of the 25 fps is the Radeon specifically; the Windows setting did not take (the AMD stayed `*ACTIVE*`), and the NVIDIA
Control Panel / Lenovo Vantage discrete-mode routes were not tried.

**How to start:** `interview-me` from this item for candidate 1; candidate 2 can go straight to a RED test.

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
