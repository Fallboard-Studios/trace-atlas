# Backlog Archive

Closed items moved out of [docs/todo/backlog.md](../backlog.md) to keep that file focused on
what's still open. Item numbers are preserved exactly as they were assigned in the live backlog
— never renumbered on archive — so any existing cross-reference stays valid. Entries appear in
their original numeric order, not archive-date order.

## 2. Onload: Power-Off Intro Text

**Closed** 2026-10-10 (`feature/layout-rework`, roadmap Phase 45; `769982a5` the world before power-on, `0bde15c3` OffScreen and the muted RadioButton, `37f3878e` the phone off screen). The powered-off screen now carries an etched label, a power hint and a Transmission row (three preset worlds and the user's saves) over the dimmed, still world. The copy is placeholder until Crawford curates it. The original request follows.

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority. Today, powering
off shows nothing but the static sleeve shell + rocker switch (`SleeveContainer.tsx` has
no off-state content at all) — a new user gets no explanation of what powering on will
do. Needs a small text block added to the off-state UI, plus actual copy explaining what
happens on power-on. Content not yet written; a placeholder can stand in until Crawford
has final copy.

## 4. Helper Text on Inputs (Info Icon)

**Closed** 2026-10-10 (`feature/layout-rework`, roadmap Phase 45; `3a5d1538` `ContentEntry.help`, `e513c808` the `HelpPopover` primitive, `7fcc49f1` the help copy for the probe and company controls). The schema-wide shape was built after all: a content entry carries `help`, `labels()` puts it on the schema and `DualLabel` renders the "?" for every control that has one. The original request follows.

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Very low priority — mainly
blocked on the amount of content (a blurb per control) needed, not on technical
complexity. `ControlSchema` (`src/types/controls.ts`) has no helper/hint-text field
today. Concept: a small "i"/"?" icon per control that reveals a short blurb about what it
does on tap/hover. Deliberately scoped small (Crawford's own call) rather than a
schema-wide addition touching all 14 primitives.

## 5. Sector Settings: AS/Coords/Favorites Reorganization

**Closed** 2026-10-31 (`feature/off-screen`, roadmap [57](../roadmap.md#57-the-off-screen-power-as-pause-the-two-axis-chooser-keep-and-the-band-table); intent [docs/intent/off-screen.md](../../intent/off-screen.md), spec [docs/specs/OFF_SCREEN.md](../../specs/OFF_SCREEN.md), plan [docs/tasks/OFF_SCREEN.md](../../tasks/OFF_SCREEN.md)). Built as the off screen: power is a pause, the Transmission axis (Current, saves, presets as pasted world links, Roll, Keep), the Loading axis (five themes and four aspect families: Melody, then Envelope, Distance and Voice from the revisions the same day, with no "as theme" pick), the band table under them, and the address bar following the loaded world. The shortcut buttons this item first asked to refresh were removed in favour of the presets; the "favorites" are the three preset links, placeholders until Crawford pastes his. Item [7](../backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter)'s Mood row has its slot in the Loading axis when it comes. The original request follows.

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
saves; [backlog archive 2](#2-onload-power-off-intro-text)) is the partial
start; Crawford has a plan for how that screen shows the themes ([docs/ideas/themes.md](../../ideas/themes.md)),
the sessions and the presets. Item [7](../backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter)'s
selection UI is expected to live here too (its progression engine stays item 7's own, large, piece of
work), and item [19](#19-short-world-link-bring-back-seed-x-and-y)'s short link is the natural form for
a preset entry. Still needs its own `/interview-me`.

**Brainstormed 2026-10-29 (Crawford):** the off screen also offers **aspects** — named band sets for a handful of
robot attributes (Hypnotic, Mechanical, …), applied over the theme's bands, one pick per family; recorded with
the leans from the discussion in [docs/ideas/themes.md](../../ideas/themes.md#aspects-brainstorm-2026-10-29). The
interview therefore covers four things — presets, sessions, themes and aspects — in two halves: the screen (the
surface) and the single band table with its resolver (the engine, shared by themes and aspects, built first). It
may split them into two phases.

**Sketched 2026-10-30:** the off screen drawn as six stories — arrival (bare URL / shared link) × device (first visit /
returning / returning with saves) — in [docs/sketches/off-screen.html](../../sketches/off-screen.html), every piece
called out and tagged built / changed / proposed / open, with the power-off dialog, Foundry and Comms beside it.
Crawford decided on it: the Roll button stays, five themes, flat aspect rows, the two-axis chooser (Transmission /
Loading), the veil and the lore footer; presets are pasted share links of worlds he saved (his ask the same day).
Clarified: a theme or aspect changes only loading bands — AS + coords stay the identity — and both are chosen before
sound, on the off screen. The sketch's "Open for the interview" box is the live question list (nine items); the
decisions are recorded in [docs/ideas/themes.md](../../ideas/themes.md#decided-crawford-2026-10-30-on-the-six-story-sketch).

**Intent confirmed 2026-10-30** via `/interview-me` (6 questions): [docs/intent/off-screen.md](../../intent/off-screen.md).
Two turns on the sketch's leans — power is a **pause**, not a stop (transport, robot animations and batteries freeze;
the day clock and day / night light keep running, and run from load), and the off screen gains one **Keep** button
beside the Current row instead of any save prompt or confirm dialog. Also fixed: the first visit is hint-only behind a
heard-a-world flag; themes ship audibly in this phase as a narrow by-ear first cut, with Melody the only aspect family;
the address bar follows the loaded world. Next: `spec-driven-development`, two halves (screen / band table + resolver),
likely three phases.

## 8. Visuals: Job Animations

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority — deprioritized
behind launch. `JobType` (`Robot.ts`, see `docs/ROBOT_LIFECYCLE.md`) exists and is shown
as data/text (`RobotSelectionCard`, `RobotDisplaySection`), but nothing in the
actor-rendering layer visually differentiates a robot by its current job today. Genuinely
new visual work; not yet scoped.

**Closed** 2026-10-08 by roadmap Phase 43, Robot Jobs and Charging Stations (all four branches merged,
J4 = PR #544). Robots now work at host buildings: their orbiters detach and play one of six jobs'
moves (`hoverPulse`, `trace`, `ring`, `fan`, `carry`), so what a robot is doing shows in the world,
not only on its card. See [docs/ROBOT_LIFECYCLE.md](../../ROBOT_LIFECYCLE.md) and
[docs/ANIMATION_SYSTEM.md](../../ANIMATION_SYSTEM.md#job-moves).

## 9. Visuals: Better Building Details

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. Factories already have a real system to extend (`docs/BUILDING_DESIGN.md`:
silhouette base + rooftop greebles + seeded facade/window/color variation) — scope is
more likely additional greeble/variant variety within that existing system than a
structural change, but not yet confirmed with Crawford.

**Closed** 2026-10-09 by roadmap Phase 44, World Gem Material (built on `feature/world-gem`; the PR is not
yet merged). Every mass in the world now wears the gem robots' bevel ring and every other solid a 1.5 px
hairline, lit by the hour's sun; silhouettes, windows and greebles are unchanged. Any greeble-variety
follow-up is a later, separate item. See [docs/BUILDING_DESIGN.md](../../BUILDING_DESIGN.md) ("World Gem
Material") and [docs/todo/roadmap.md](../roadmap.md).

## 11. Visuals: Small Immersion Animations

**Closed** 2026-10-22 (Crawford). The small touches this item imagined arrived through later phases rather than as one list: the halo waves and lit lines of roadmap [41](../roadmap.md#41-robot-halo-and-lit-lines), the swims and job moves of [43](../roadmap.md#43-robot-jobs-and-charging-stations) and the job decorations of [52](../roadmap.md#52-job-decorations-six-small-animations-on-the-orbiters-work). A further touch is a new item. The original request follows.

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. Likely a grab-bag of minor polish (idle bobs, blinking lights, and similar
small touches) rather than a single feature; exact list not yet defined.

## 12. IdleSystem: console.warn Fires on the Ordinary Case, Not an Error

**Closed** 2026-09-30 (`6c4657e`, branch `fixes/idlesystem-noise-wordltransition-bug`). Narrowed
`idleSystem.ts`'s guard to warn only when the robot is genuinely missing from the store
(`!robot`) — the actually-unexpected case — instead of on every non-Idle/Active state, which
most robots hit on every locale load simply by spawning Docked. Covered by new regression tests
in `idleSystem.test.ts` asserting `console.warn` fires for a missing robot and stays silent for
every ordinary docking/state combination.

## 13. SVG: Invalid Empty `y` Attribute — Live-Browser Confirmation Outstanding

**Closed** 2026-11-10 (live-browser check on branch `bugs/empty-y`; nothing built). The fix from PR #469 still
stands, in a newer shape: the glyph's rect is now `POWER_GLYPH` (`rockerGeometry.ts`), set in JSX as `x`, `y`, `width`
and `height`, and GSAP scales the glyph about the ridge instead of tweening `y`. A headless Chrome on the Vite dev
build (StrictMode on) was watched over the DevTools Protocol for three fresh loads, each followed by power on, power
off and power on again, with `Log`, `Runtime` and `Console` events all captured. No `<svg> attribute` error appeared,
the glyph read `y="54"` at every step, and no SVG in the document carried an empty length attribute. A positive
control at the end (an injected `<svg y="">`) logged the original error word for word, `Error: <svg> attribute y:
Unexpected end of attribute. Expected length, "".`, so the probe sees this error class. The only other console line
was Tone's once-per-page scheduled-callback warning, which `AUDIO_SYSTEM.md` documents as expected on an undocking
admission. The source comment and test title that pointed at "backlog #20" now point here. The original request
follows.

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

## 14. Live-Profiler Reverification Still Pending (3 spots)

**Closed** 2026-10-22 (Crawford): obsolete. Two of the three spots name components that no longer exist (`RobotOptionsTab`, `RobotSectionAccordionStack`), and the scene has been rebuilt twice since the fixes landed (roadmap [17.2.5](../roadmap.md#1725-performance-idle-paint--composite-cost) and [53](../roadmap.md#53-per-mover-compositor-layers)), so a Profiler recheck of the September fixes would be measuring a different app. The original item follows.

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


## 15. Test Suite: Three Tests Fail Intermittently Under a Full Parallel Run

**Closed** 2026-10-22: the last of the four, `audioSwells.test.ts`'s company-wide forced-return test, is deleted in the commit that archives this item; the other three went in `b49ee27a` (2026-10-05). The standing rule is that a test documented as flaky is removed, not investigated. The original item follows.

**Status:** ☐ open — noticed 2026-09-18, still reproducing as of 2026-09-28 (see project
memory: known-flaky unmocked-random tests).

**Update 2026-10-22:** three of the four are gone. `b49ee27a` (2026-10-05) deleted the worldTransition and
CompanyCrudControls tests and the factoryPlacementSystem test's hue/sat-must-differ assertion (the rest of that test
stays). The audioSwells test is still in the suite.

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


## 16. `worldTransition.ts`: Retransmitting the Currently-Active Attenuation Style's Own Name Corrupts the Store

**Closed** 2026-09-30 (`fixes/idlesystem-noise-wordltransition-bug`, same branch as #12 above).
`createNewAttenuationStyle` now checks `addAttenuationStyle`'s boolean return and, on a
case-insensitive name collision, looks up and reuses the real existing entry instead of
proceeding with a phantom, never-added one. `finalizeAttenuationStyleTransition` additionally
guards its own `removeAttenuationStyle` call against the self-collision case — reusing the
*currently active* entry (a caller resubmitting its own current name, the bug's original
trigger) would otherwise delete the very entry just reused. Fixes the root cause directly in
`worldTransition.ts`, not just at the one caller (`sessionDiff.ts`) that had worked around it
before. Covered by new regression tests in `worldTransition.test.ts` (`describe('retransmitWorld
— Attenuation Style name collision')`) recreating both the "different existing entry" and
"resubmits its own current name" collisions directly, confirming `selectCurrentAttenuationStyle`
no longer dangles to `undefined` in either case. The previously-flagged "not covered by the
workaround" scope note is resolved by this fix; the deeper bookkeeping question this item's
own "needs its own scoping pass" caveat raised (what happens to the *reused* entry's own
previously-current locale) remains genuinely open but is now a documented, intentional
limitation rather than silent corruption — see the fix's own doc comments.

## 17. Audit: LFO Drift / Audio Swells / Ping Variance — Replayability Findings

**Closed** 2026-11-11 (read, nothing to do; Crawford's call, at the plan.md Stage 3 review after backlogs 60 and 73
archived). An informational audit with nothing to build: it records which audio state a measure replay can rebuild
(swell triggers and targets) and which it cannot (LFO phase, a swell's in-flight ramp), for whoever next wants a
reloaded world to sound identical. Not re-read against the code at closing; some details have moved since (every
audio draw is even, 2026-11-02). The original request follows.

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

## 19. Short World Link: Bring Back `?seed=`, `?x=` and `?y=`

**Closed** 2026-10-25 (built on `feature/short-world-link`, roadmap [56](../roadmap.md#56-short-world-link); PR pending). The world link replaced `?session=`: `?seed=<exact name>&x=<int>&y=<int>`, plus one `s=1.<blob>` param of raw-deflated compact JSON (`fflate`) only when the world differs from its seed; the `seedUtils.ts` override primitives were deleted, not revived. The original request follows.


Raised by Crawford, 2026-10-09, on `feature/layout-rework`, reversing the Phase 21 call that removed
them: "I want to bring `?seed=`, `?x=`, and `?y=` back actually, they're so much better to use if a
user didn't change anything than the current json soup, especially if they want to share an
untweaked world with someone." Not yet interviewed or specced — needs its own `/interview-me`. Sits
beside roadmap [21](../roadmap.md#21-sector-settings-shareable-link-importexport) (the `?session=` link,
which stays for tweaked worlds) and roadmap
[48](../roadmap.md#48-one-day-clock-remove-the-measure-based-day)'s dead-code sweep, which leaves the old
override primitives alone until this item decides their fate.

**Added 2026-10-22 (Crawford):** the `?session=` form itself should get shorter too, for tweaked worlds,
and a library is acceptable for it (this note is the ask-first; the pick still goes through the
interview). Today it is plain base64 of abbreviated-key JSON with no compression (roadmap 21). Two
candidates to measure on a real tweaked payload: the native `CompressionStream('deflate-raw')` plus
base64url that roadmap 20's original design proposed (no dependency, but decoding is async, and the
boot seam below reads the payload synchronously at module load, so it changes the boot sequence), or
`lz-string`'s `compressToEncodedURIComponent` (a small dependency, synchronous, URL-safe output).

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
been dead since ([PERFORMANCE.md](../../PERFORMANCE.md) lines 52, 295, 382, 721);
[PROCEDURAL_GENERATION.md](../../PROCEDURAL_GENERATION.md) lines 23–38 still document the removed
mechanism as live.

**The constraint that killed them, which the spec must answer**
([SECTOR_SETTINGS_SHARABLE_LINK.md](../../specs/SECTOR_SETTINGS_SHARABLE_LINK.md) §7 item 1): the old
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
- The off screen's three transmission presets ([docs/tasks/LAYOUT_REWORK.md](../../tasks/LAYOUT_REWORK.md)
  Task 25) are untweaked worlds — store them as `(name, x, y)` triples and print them as short links?
- Settings → Seeds already shows the style name and coordinates; a "copy short link" there is the
  obvious home. Whether Retransmit updates the address bar is open (`?session=` is never cleared
  today, by design).

**Knock-ons once built:** the HUD's world line reads a real name again; the perf harness's `--world`
pinning comes back to life and [PERFORMANCE.md](../../PERFORMANCE.md)'s suspect `charlie` / `bravo`
baselines can be re-measured honestly; PROCEDURAL_GENERATION.md is rewritten around the new mechanism;
[SESSION_STORAGE.md](../../SESSION_STORAGE.md)'s "Shareable Links" section gains the second form.

## 21. Audio Palette Trials: Robot Dynamics, Gate Length, Humanize and Rests

**Closed** 2026-10-16 — built as roadmap [50.5 Robot Performance](../roadmap.md#505-robot-performance-dynamics-rests-accents-humanize) on `feature/palette-performance` (intent [robot-performance.md](../../intent/robot-performance.md), spec [ROBOT_PERFORMANCE.md](../../specs/ROBOT_PERFORMANCE.md), plan [ROBOT_PERFORMANCE.md](../../tasks/ROBOT_PERFORMANCE.md)). Three of the four picks shipped as described below with corrections from the interview: Dynamics as a per-robot scale on the velocity variance; Humanize as a global Pacing slider; Rests as a seeded *shortening* of notes, not a skip. Gate length folded into Rests, and "accents" became the five classical articulation marks rather than a beat pattern. Nothing was dropped for failing to earn its slider. The original request follows.

From the 2026-10-09 audio-palette conversation. Roadmap
[50](../roadmap.md#50-audio-palette-new-attributes-without-new-libraries) carries the four picks and the
shared constraints (the phone gate, where nodes may go, replayability, seeding and saving); these are
the per-robot ideas Crawford kept back "to try and see what works". All four are trigger-time
arithmetic in `AudioEngine.scheduleNote` and the playback loop — no nodes, no budget cost — and all
replay exactly when seeded off the note index, the way velocity does (`computeNoteVelocitySeeded`,
`src/engine/AudioEngine.ts:452`).

- **Dynamics range and accents.** Velocity variance is a fixed seeded rate and width today
  (`VELOCITY_VARIANCE_RATE`, `NOTE_VELOCITY_BASELINE`). A per-robot "dynamics" slider widens or
  flattens it; an accent pattern on the 16-step grid (`MelodyEvent.startStep`) would be a second step.
- **Gate length.** A per-robot multiplier on each event's duration before `triggerAttackRelease` —
  staccato (0.3) to legato (1.0 and beyond, overlapping the next onset). Each layer's Synth is
  monophonic, so an overlap retriggers; with roadmap 50.1's portamento set, that overlap is the glide.
- **Humanize.** A seeded timing offset per note (± a few ms, scaled by a per-robot or global slider)
  added to the schedule time, inside `MIN_LEAD`. Seeded by note index, so it replays. Pacing section if
  global, Envelope if per robot.
- **Rests.** A seeded per-robot skip chance per event ("sparseness"): the melody keeps its stored
  steps, playback drops some. Composition section. Touches Pitch Repeat and the harmony palette only
  through what is heard.

Try order: dynamics first (cheapest to hear), then rests, gate, humanize. Each a short branch; drop
what does not earn its slider.

## 22. Audio Palette Trials: More Global Pedals to Audition

**Closed** 2026-10-22 (Crawford). The five pedals shipped as roadmap [50.6](../roadmap.md#506-global-pedals-chorus-tremolo-vibrato-frequency-shifter-and-width) (PR #565), none withdrawn. The two room-type radios the 2026-10-21 update left here (PingPongDelay as a Delay type; Freeverb / JCReverb as Reverb types) are dropped, not built: both reverbs are AudioWorklet comb-filter stacks that Tone's own docs warn against, and the phone sits near its limit (item 27). The item as it stood follows.

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

**Update 2026-10-21: the five pedals shipped as roadmap 50.6; this item now holds only the two room type radios.**
Chorus, Tremolo, Vibrato, FrequencyShifter and StereoWidener were built on `feature/pedals` (roadmap 50.6,
[docs/specs/GLOBAL_PEDALS.md](../../specs/GLOBAL_PEDALS.md)), with Free | Sync on the three LFO rates. None was withdrawn,
so nothing moves to "tried, no". Two corrections to the text above, for whoever picks this up:
- **The cite is stale.** `globalFx.ts:144` was the old serial chain. Delay and Reverb are no longer chain stages
  (Robot Sends, roadmap 50.2): they are two rooms that `buildGlobalFxChain` constructs beside the chain, fed by each
  robot's send and joined back through a return gain (`docs/AUDIO_SYSTEM.md`, Signal Graph). A type radio would swap
  the room node behind the sends and the return, not add a slot in `wireGlobalFxChain`.
- **Freeverb and JCReverb are not cheaper.** Tone 15 (15.1.22) builds both from AudioWorklet comb filters (Freeverb
  eight, JCReverb four, each its own worklet node) and its own docs warn that each "is now implemented with an
  AudioWorkletNode which may result on performance degradation on some platforms. Consider using Reverb." The
  BitCrusher is the app's only worklet today, and the phone is near its limit (backlog 27). So the reverb radio is
  a phone-gate question first. `PingPongDelay` is plain Web Audio nodes (a cross-feedback stereo delay), with no
  worklet.

## 23. Audio Palette Trials: Dynamics Processing and Ducking

**Cut** 2026-11-02 (Crawford, at the plan review of that date). Deferred at roadmap 54's interview and now cut outright: the single Compressor sounds right off safety duty, and no dynamics work is wanted before launch. Revisit only if a world's Compressor sounds wrong. The original request follows.

`Tone.MultibandCompressor` (low / mid / high compressors with two crossovers) as a richer Output stage
than the single `Compressor`; `Tone.Gate` (`threshold`, `smoothing`) to close the chain between phrases
on a sparse world; and `Tone.Follower` driving a `Gain` for sidechain-style ducking — the fleet dipping
under a soloed robot (`audioMode: 'solo'`), or under a swell. Ducking is the interesting one: a
*behaviour*, not a knob. The follower's output is a signal, so it needs a `Tone.Multiply` / `Scale`
pair into the dry bus's gain — no other nodes. All three react to the signal and carry no clock, so
they replay in the follower sense. Output section tab. Phone gate as always; multiband is three
compressors.

**Interviewed with roadmap 54, 2026-10-23, and deferred, not built** ([docs/specs/OUTPUT_HEADROOM.md](../../specs/OUTPUT_HEADROOM.md)
assumption 9). Multiband is worth trying only if the single Compressor sounds wrong now that it is off safety duty (the
output ceiling holds the master under full scale). Roadmap 54's Checkpoint A heard one Compressor fault, a 70 ms release
slammed by every robot at 100 %, and the seeded release floor (0.25 s) answered it, not multiband.

## 24. Audio Palette Trials: Transport Groove and Tempo Walk

**Cut** 2026-11-02 (Crawford, at the plan review of that date). Swing and the tempo walk are not wanted before launch. Backlog [6](../backlog.md#6-audio-groove-feature) (Groove) loses the swing lean plan.md said might satisfy it outright, and stays a post-launch item. The original request follows.

`Tone.Transport.swing` (0–1) and `swingSubdivision` (`'8n'` / `'16n'`) exist on the transport the
melody loop already runs on. A Pacing-section Swing slider is one store field and one transport write,
and **every** robot swings together. Check first that swing reaches the playback loop's scheduled
times — the `8n` step scheduler ([AUDIO_SYSTEM.md](../../AUDIO_SYSTEM.md) §Playback loop) computes its
own offsets from the tick, and Tone applies swing to the transport's own event times. Ties to backlog
[6](../backlog.md#6-audio-groove-feature) (Groove: robots syncing while docked) and to item 7 (progressions): a
global swing is the simplest groove and may be enough.

**Tempo walk:** a slow seeded random walk on BPM (± a few BPM over many measures, `getSeededVal` by
measure, the swells pattern) as Pacing's equivalent of an LFO — replayable by construction, but BPM
moves everything that counts measures, so the fleet's lifecycle speeds and slows with it (accepted:
the 2026-10-09 time decision keeps the lifecycle on measures) and Sync-mode lanes follow. Try swing
first; the walk only if a world feels too metronomic.

## 26. Desktop Paint: Stage-Sized Moving Layers Re-Raster Every Frame

**Closed** 2026-10-22 (Crawford). Both ranked fixes are on `main`: candidate 1 as roadmap [53](../roadmap.md#53-per-mover-compositor-layers) (PR #563) and candidate 2 as the deck camera's idle stand-down (PR #562, `fix/deck-camera-idle-range`). The "document layer" the status below leaves open was the harness, not the app: it counted Chrome's whole-frame `#document` paint as a full-viewport repaint, and with that left out the idle-paint gate passes at 0.08 × `main` ([PERFORMANCE.md](../../PERFORMANCE.md) "the Task 20 gate, re-run with the frame wrappers left out"). Not done: candidate 3 (a lighter desktop audio default) was not taken, and the full-screen underruns on Crawford's laptop were not re-measured after the merge. The item as it stood follows.

**Status (2026-10-17): mostly built, one finding left open.** Candidate 1 is done: small layers per mover, built as
[roadmap Phase 53](../roadmap.md#53-per-mover-compositor-layers) on `perf/per-mover-layers` (not merged). Candidate 2 is
done (the camera's idle no-op, merged). Candidate 3 is not taken (the audio-headroom default stays Crawford's call).
The idle-paint gate missed its headline criterion, 0.31 × `main` against 0.25, because of a **document layer** that
repaints a full viewport on nearly every frame on both builds (cause unidentified); the work this item described fell
by over 90 %. That repaint is the open remainder, to be accepted, fixed or reframed by Crawford. The record below is the
original diagnosis, kept as written.

Diagnosed 2026-10-16 while finishing roadmap 50.5, after Crawford reported the sound breaking up about 25–30 s into every
world on his laptop at full screen. **Not an audio feature.** `main` at `2ec52f2f` reproduces it (411 underruns by 0:47,
25 fps) and a window at a quarter of the area halves the cost (66 underruns by 1:00, 54 fps), so the cost scales with pixels.
The full record, numbers and how to re-measure are in
[PERFORMANCE.md](../../PERFORMANCE.md#desktop-full-screen-underruns-are-raster-bound-2026-10-16).

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

## 27. Audio: Phone Playback Underruns at Light Load, `main` Included

**Closed** 2026-10-29 (Crawford; `perf/light-tier-standing-cost`, merged via PR #590, `296079a5`; its merge of `main` repaired by PR #591, `0de23cfe`). Standing-by robots give up their voices and the dark effects' and drift's LFOs stop, every tier; at Light the pedals, the colour effects and the Reverb are held off too, and every control the hold-offs make inert is dimmed. On a rested Pixel 8 at Light, D1 and D5 drew "sounds great" (17 and 15 underruns at 4:00) against `main`'s "too scratchy" (281, 250); Full unchanged. The original request follows.

**Found 2026-10-18** during the per-mover Pixel A/B (PERFORMANCE.md "the Pixel A/B: not separable on the phone"). On the
Pixel 8 at **Light** Audio Load (`load 20%·fx 20%`, latency `playback`, every LFO tier off), the Task 20 world crackles
on both builds: `main` about 22 playback underruns in three minutes, the branch 41 to about 88 depending on the run. The
`?debug` overlay rules out a broken signal (`fin ok`, master peak −3 to −11 dB, no clipping) and the main thread (57–60
fps, low lag): the audio thread misses its deadline in bursts of one to four, and keeps doing so with only one robot
sounding, so most of the cost does not scale with notes played. Related history:
[scratchy-audio-phones.md](../scratchy-audio-phones.md) (the Audio Load Budget was its mitigation).

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
now leaves the signal path (the Dark-Effect Bypass, [docs/specs/DARK_EFFECT_BYPASS.md](../../specs/DARK_EFFECT_BYPASS.md)
§8; numbers in [scratchy-audio-phones.md](../scratchy-audio-phones.md), T12 and rounds 3 and 4).

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

**Update 2026-10-22 (Robot Effect Sends T21, [scratchy-audio-phones.md](../scratchy-audio-phones.md)):** the first
collapse on a rested phone. With the phone off for at least 20 minutes before each run, the second run of the sitting
(the 50.7 branch, Full) spiked at 3:30 and was out at about 4:20; its repeat, run 7, was fine, and the base's run 6 rose
95 → 250 with clipping at 4:20. A heavier world on the same build and tier (7 lit, run 5) did not collapse. So heat or
state left over from earlier runs explains it less well than it did in round 4.

**Update 2026-10-23 (Output Headroom T10, [scratchy-audio-phones.md](../scratchy-audio-phones.md)):** clicks at Light, the
tier a phone picks by itself, on a rested Pixel 8. `56c2t2t8` at (−116, −2) "clicks throughout" on `main` (190
underruns at 3:00, 254 at 4:00) and on the Output Headroom branch (140 → 173); `bravo` read 93 (`main`) and 149
(branch) at 3:00. The two builds swap order between the worlds, so the clicks are not that branch's; its output is
never at full scale, so they are not clipping either. Crawford: chase them here, after roadmap 54 merges.

**Next, re-ordered 2026-10-23** ([plan.md](../plan.md) Stage 1: the desktop first, the Pixel once at the end). The two
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

**Update 2026-10-23 (Stage 1 step 1 done, desktop; [scratchy-audio-phones.md](../scratchy-audio-phones.md) "Backlog 27,
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

**Update 2026-10-23, later (step 2 done; [scratchy-audio-phones.md](../scratchy-audio-phones.md) "Backlog 27, desktop step
2").** The 15-minute runs: the leak holds its rate (D1 +1057 nodes, D5 +171) and capacity shows no trend on either
world; the heap climbs the same 12 MB on both, so most of that is a **second, world-independent accumulation of about
0.8 MB/min, unidentified**. The A/B (a throwaway build that disconnects the dead node's two params at `onended`) proves
the mechanism, taking D1 from +324 to +48 nodes, and changes nothing on the audio thread: stock 0.526–0.579 against
patched 0.541–0.558, same bursts, same max lag (9–26 ms), heap still climbing. **The desktop has answered what it can**:
the bursts at Light are the graph's standing cost with four robots sounding; the collapse does not reproduce in fifteen
minutes; two things accumulate that only the phone can price. Open for Crawford: carry the one-line disconnect as a
dependency patch or an upstream Tone PR (a spec either way); name the heap growth (a heap-snapshot diff) before the
sitting or not; take the patched build to the sitting beside stock.

**Update 2026-10-23, later still (Crawford's calls, and the heap growth named; [scratchy-audio-phones.md](../scratchy-audio-phones.md)
"step 2b").** Decisions: the leak fix goes as a dependency patch, spec at
[docs/specs/OSCILLATOR_LEAK_FIX.md](../../specs/OSCILLATOR_LEAK_FIX.md); the heap growth was named; the Pixel sitting comes
after both. **The heap growth is Tone's per-Param automation history** (`Param.setValueAtTime` on every note, each
Param's Timeline capped at its newest 1 000 events), so it is bounded and saturates after tens of minutes; a
sampling-profiler read on the dev server put it, the leaked oscillator wrappers and dev-only React bookkeeping at the
top, and a direct read showed the context's timeout list flat. Closed as a cause; the one loose end is the prediction
that a 30-minute production run flattens the heap. The leak fix is its own item now:
[32](#32-audio-oscillator-leak-fix--disconnecting-the-dead-notes-params).

**Update 2026-10-26: the desktop half is done; only the phone sitting is left.** Steps 1 and 2 above are recorded, the
leak fix merged (PR #577, archived as [32](#32-audio-oscillator-leak-fix--disconnecting-the-dead-notes-params)),
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

**Update 2026-10-26, later: the sitting is done ([scratchy-audio-phones.md](../scratchy-audio-phones.md) "Backlog 27 on
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
as the baseline. Where that sits in [plan.md](../plan.md) is Crawford's call.

**Update 2026-10-27: interviewed, specified and planned.** Intent
[docs/intent/light-tier-standing-cost.md](../../intent/light-tier-standing-cost.md), spec
[docs/specs/LIGHT_TIER_STANDING_COST.md](../../specs/LIGHT_TIER_STANDING_COST.md), plan
[docs/tasks/LIGHT_TIER_STANDING_COST.md](../../tasks/LIGHT_TIER_STANDING_COST.md): a decomposition of the standing cost at
Light first (no product change), Crawford picks the cuts from its table, each cut kept or dropped on a desktop A/B,
inaudible cuts every tier and audible ones Light's, and the Pixel sitting — clean by ear on D1 and D5 at Light — the
one criterion. The item stays 27 (no new number); its Built line comes with the plan's T23.

**Update 2026-10-28: Phase A done, the decision table is ready for Gate A** ([scratchy-audio-phones.md](../scratchy-audio-phones.md)
"Backlog 27, the decomposition", §5). On the desktop at Light, the largest pieces are the standing-by robots' voices
(−0.124 D1, −0.107 D5 of capacity, inaudible to cut), the lit effects (−0.093, −0.083) and the Reverb (−0.074, −0.043).
EQ3, LPF and HPF are moderate; the dynamics and the send/room fabric are below noise. The 70 % criterion is not met on
D5 (55–69 % explained); the remainder is the sounding robots and the fixed floor. Crawford picks the cuts and whether to
chase the remainder.

**Update 2026-10-28, later: the remainder chased (§6).** With no robot voices at all (A9), Light's load falls from
0.557 to 0.167 on D1 and from 0.519 to 0.163 on D5: the robots are about 70 % of it, the floor about 30 %. A playing
robot costs about 0.06 of desktop capacity, roughly four times a standing-by one and three times what spec §1.6 assumed
for the robot-count lever. The cuts and order of §5 stand; the sounding cap at Light joins the table for Crawford to place.

**Update 2026-10-28, Gate A passed** ([intent](../../intent/light-tier-standing-cost.md) "Gate A — the cuts"; the record's
decomposition §7). Inaudible first and alone: standing-by voices released and the dark cells' and drift's LFOs stopped,
every tier, then the phone. Only if it still clicks, three Light-only cuts tried stacked in one sitting: pedals off, a
shorter Reverb, three sounding robots. EQ3/LPF/HPF out at neutral dropped (the EQ is seeded); backlog 28 stands.

**Update 2026-10-29: Phase B built, the phone sitting run** ([scratchy-audio-phones.md](../scratchy-audio-phones.md)
"Backlog 27, the decomposition", §8–§10). The three inaudible cuts (standing-by voices released, the dark cells' and
drift's LFOs stopped) are on `perf/light-tier-standing-cost`; their desktop A/Bs are all inside that sitting's
noise. On a rested Pixel 8 at Light, D5 drew "pretty good, a few scratches but passable" against `main`'s "too
scratchy", and D1 "a little too scratchy throughout" against "too scratchy". At Full the branch took off on both
worlds (about 4:30 and 3:30) and `main` did not, one run each. By the gate's wording Gate C misses on D1; the
verdict, whether the Full take-off is the build or the phone's state, and whether Phase C2 (the three audible Light
cuts) starts, are Crawford's.

**Update 2026-10-29, later: Phase C2 built, Gate C2 passed** ([scratchy-audio-phones.md](../scratchy-audio-phones.md)
"Backlog 27, the decomposition", §11–§13). Crawford at Gate C: "let's turn off the pedals and reverb on light. i still
really want four robots playing". Two Light-only cuts on the branch, each with its own constant: the pedals and colour
held off (`LOAD_EFFECTS_MIN`, T9–T13) and the Reverb off (`LOAD_REVERB_MIN`, T19, with a Convolver reset and a 1 s
lift), every inert control dimmed (T12b); three sounding robots (T25–T26) not built. On a rested Pixel 8 at Light,
pedals and Reverb off drew "sounds great" on D1 and D5 (`underruns` 17 and 15 at 4:00) against `main`'s "too
scratchy" (281, 250); pedals off alone drew "sounds great" on D5 and "a little scratchy" on D1. At Full nothing took
off; D5 "not too bad, actually", D1 "scratchy throughout". Full accepted as
unchanged (Crawford, 2026-10-29: "No need to change full."). Next: the docs (T22, T23).

**Built** 2026-10-29 on `perf/light-tier-standing-cost` (spec
[docs/specs/LIGHT_TIER_STANDING_COST.md](../../specs/LIGHT_TIER_STANDING_COST.md), plan
[docs/tasks/LIGHT_TIER_STANDING_COST.md](../../tasks/LIGHT_TIER_STANDING_COST.md), record
[scratchy-audio-phones.md](../scratchy-audio-phones.md) "Backlog 27, the decomposition" §1–§13). Desktop capacity
deltas are D1 / D5 at Light. **Kept, every tier (inaudible):** standing-by robots' voices released (H2, T14; −0.065 /
+0.013, inside that sitting's noise band of 0.10 / 0.12; docked robots keep theirs); a dark cell's LFOs stopped (H3a,
T16; +0.008 / −0.009); the drift secondaries stopped while drift is held off (H3b, T17; −0.017 / −0.015; it also fixed
drift running at Light from boot). **Kept, Light only (audible):** the pedals and colour held off (H1,
`LOAD_EFFECTS_MIN` 0.4, T9–T13; −0.289 / −0.096) and the Reverb off (`LOAD_REVERB_MIN` 0.4, T19; −0.021 / −0.059;
a lift resets the Convolver and ramps up over 1 s), every control they make inert dimmed (T12b). **Dropped or not
built:** EQ3/LPF/HPF out at neutral (A6 −0.041 / −0.019; Gate A, the EQ is seeded, backlog 28 stands), the send/room fabric and the dynamics (below noise),
the Reverb decay cap (replaced by off at Gate C), three sounding robots (about 0.06 a robot, A9; T25–T26 not built, Crawford wants four). **The phone
(Gate C2):** on a rested Pixel 8 at Light, "sounds great" on D1 and D5 against `main`'s "too scratchy"; Full
unchanged. Tools: `npm run perf:audio-handlers` and `perf:audio`'s census line
([PERFORMANCE.md](../../PERFORMANCE.md#handler-breakdown--npm-run-perfaudio-handlers)); behaviour in
[AUDIO_SYSTEM.md](../../AUDIO_SYSTEM.md#audio-load-budget). Gate B's desktop listen passed after
the phone (Crawford, 2026-10-29: "Gate B sounds good").

## 28. Audio: EQ3 and the Two Filters Stay in the Chain at Neutral

**Closed** 2026-10-24 (Crawford, on the recommendation in backlog 29's close: plan.md said it "closes itself if nothing in 27 or 29 points at them", and neither does. Backlog 27's desktop steps put the Light-tier bursts on the graph's standing cost with four robots sounding and the late collapse not reproduced; 29 turned out to be no lost quantum at all). Nothing built. The original request follows.

Recorded 2026-10-20 (Dark-Effect Bypass spec §3): the bypass takes only the ten effects out of the path when dark;
EQ3, the LPF and the HPF stay in at neutral, being cheap built-ins and global LFO targets that would flap through
neutral, and are revisited only if a phone measurement points at them.

## 29. Audio: A Connect Sometimes Loses a Render Quantum (`main` Included)

**Closed** 2026-10-24 (Crawford; `docs/backlog-29-recorder-clock`, `0f9a1972`, record [scratchy-audio-phones.md](../scratchy-audio-phones.md), "Backlog 29 — the lost render quantum is the recorder's clock, not the audio"). No render quantum is lost at a connect. Chromium sets the AudioWorklet scope's `currentFrame` only when the render thread wins a `TryLock` on the graph mutex, which a main-thread connect holds, so the probe's recorder stacked one block on the one before; in arrival order every lighting is smooth. Nothing built; any later recorder probe places blocks in arrival order. The original request follows.

**Found 2026-10-21** by the Robot Effect Sends T19 crossing probe ([scratchy-audio-phones.md](../scratchy-audio-phones.md),
"Robot Effect Sends (roadmap 50.7), desktop — T19"). In headless Chrome on a real-time context, about one connect in
six, of a Tone effect into the live graph, is followed by one missing 128-frame render block (2.7 ms) and a spike in
the master output (×50–×600 over the steady state). This happens to an effect room's branch lighting, to a 50.6 dry-chain
bypass cell lighting (on `main`), and to a FrequencyShifter connected outside the chain into a muted gain, which has no
audible path, so the whole graph loses the quantum. Disconnects, which run on the audio clock's timer, never did (0 of 42).

**Not known:** whether it happens on a real output device (not headless) and on the Pixel, and what holds the audio
thread up. Candidates: the graph lock while the main thread connects, or standardized-audio-context's connect path.

**How to start:** run the scratchpad probe (`probe-crossing.mjs focus focus controls`, rebuilt from the recipe in the
log if gone) in headed Chrome with a real device. Then a bare page with no Tone, connecting native nodes only, to split
Chrome from Tone. Then the same lighting by ear on the Pixel. Only if it is audible: options are connecting at a quieter
moment, or keeping the branch connected and paying its dark cost (which undoes 50.6's saving), Crawford's call.

**Note 2026-10-22:** weak evidence only, not the probe. The Robot Effect Sends T21 runs (seven on the Pixel 8, every
seeded world lighting Shimmer and Double branches at power-on, the hand world all five) reported no click or spike at
power-on; nothing was crossed by hand mid-run, so a live connect was never listened for. The probe steps above stand.

**Update 2026-10-24: not a lost quantum; the recorder's clock ([scratchy-audio-phones.md](../scratchy-audio-phones.md),
"Backlog 29 — the lost render quantum is the recorder's clock").** It reproduces headed on the real device as often as
headless (20 of 96 room lightings headed, 8 of 48 headless). But Chromium updates the AudioWorklet scope's
`currentFrame` only when the render thread wins a `TryLock` on the graph mutex, which a main-thread connect holds. So
the next block repeats the previous frame, and the probe's recorder stacked it on the one before. Every spike sits on a
repeated frame (6 of 6). In arrival order the same lightings read ×0.89–×1.00, while the self-check click still reads
×338–×636. The audio is continuous; there is nothing for the bare page or the Pixel to find. **Proposed: close it**
(Crawford's call). Found on the way: `playbackStats` read 0 underruns through a forced 200 ms render stall, so the
`?debug` overlay's underrun count is not evidence on the desktop.

## 30. Tooling: One Shared CDP Helper for the Perf Scripts

**Closed** 2026-10-23 (merged as PR #574, `tooling/cdp-lib`, `bbfe1930`). One finding it recorded stays open and has no item of its own yet: `scripts/perf/profile.mjs` no longer completes on `main` (its step table and `--smoothness` click `.robot-selection-card__top`, which went with the Probes list in layout rework Task 21, `4ba12cae`). The original request follows.

**Found 2026-10-23** in the Output Headroom review (roadmap 54): `scripts/perf/output-level.mjs` is the fourth copy of
the same Chrome-driving plumbing, after `profile.mjs`, `idle-paint.mjs` and `audio-load.mjs`. The 54 plan copied it on
purpose (`audio-load.mjs` was not to be refactored on that branch); this item is the follow-up. Crawford, 2026-10-23:
next, once 54 has merged.

**What is shared:** `findChrome` is the same in all four. `connect` is the same in three, and `output-level.mjs`'s copy
only lacks the `onEvent` listener, so the fuller one serves all four. The temp profile and the `spawn` launch match,
except that `profile` and `idle-paint` add `--mute-audio`. Teardown comes in three versions: `profile` kills Chrome,
`idle-paint` sends `Browser.close` and then kills it, and `audio-load` / `output-level` use `shutdown`, which also kills
Chrome's child processes on Windows (`taskkill /T`).

**The task:** a `scripts/perf/cdp-lib.mjs` holding `sleep`, `findChrome`, `connect` (with `onEvent`), a launcher that
takes extra Chrome flags, and `shutdown`; the four scripts import it. One task, one commit, size S: about 90 lines in
the lib, about 70 out of each script. **The one decision:** `profile` and `idle-paint` move to the robust `shutdown`.
That changes how they tear down, on purpose (it is the orphaned-Chrome fix the measurement hygiene asks for), and the
commit says so.

**Proof:** a Look, not a RED test. No test imports the four scripts, and what moves is file-system and network
plumbing. A short real run of each against a served build (`npm run build && npx vite preview --port 4173`), with the
orphaned-Chrome check before and after ([PERFORMANCE.md](../../PERFORMANCE.md), "Measurement hygiene").

**Where:** its own branch off `main` once 54 has merged; `output-level.mjs` exists only on `feature/output-headroom`
until then.

**Status: built 2026-10-23 on `tooling/cdp-lib`, off `main` at `3e6aca8d`; awaiting Crawford's PR.**

**As built.** `scripts/perf/cdp-lib.mjs` (126 lines, not the estimated 90) exports two things: `sleep`, and
`withChrome({ chromePath, port, flags }, run)`, which launches Chrome on a `trace-atlas-perf-` temp profile, connects,
hands `run` the page's `{ send, evaluate, onEvent }`, returns what `run` returns, and always shuts Chrome down
(`Browser.close`, then `taskkill /T`) and removes the profile, Ctrl+C included (exit 130). `findChrome`, `connect` and
`shutdown` stay private to the lib. Two additions to the task above, agreed with Crawford before the build: `evaluate`,
identical in all four scripts, moved into what `connect` returns; and the launcher became one wrapper that owns the
Ctrl+C handler, so `profile` and `idle-paint` now clean up on Ctrl+C as well. The "wait for the Power on button" loop
stays in each script, since it is about the app, not Chrome. The four scripts lost 390 lines and gained 17.

**Proof (a Look), 2026-10-23,** against a production build on :4173, one run at a time, orphaned-Chrome count 0 before
and after each run and no new temp profile left behind: `perf:idle --throttle 1 --only none`, `perf:audio` (`charlie`,
12 s) and `perf:level` (8 s) ran to the end. Ctrl+C was checked with a scratch probe that emits SIGINT into `withChrome`
mid-run: exit 130, profile removed; with the profile removal deleted from the handler, the probe reported the leftover.

**Found while proving it: `profile.mjs` no longer completes, on `main` too.** Its step table and `--smoothness` both
click `.robot-selection-card__top`, which went with the Probes list in layout rework Task 21 (`4ba12cae`). The run gets
through power-on and Fleet Params, then throws; the new teardown cleaned up after the throw. Not fixed here.

## 31. Tooling: `profile.mjs` Against the Layout Rework

**Closed** 2026-11-10 (Crawford). Option (A) shipped on `fix/profile-step-table` (2026-10-23). Option (B), the re-aim at
the section tabs, is dropped, not built: it waited on a main-thread question that needed per-section numbers, and the
desktop's clicks turned out to be the audio graph's standing cost ([67](#67-audio-the-desktop-crackles-at-full--the-graphs-standing-cost-leaves-no-headroom)),
not the main thread. The step table, `--profile` and `--trace` still run; the per-section rows and `--smoothness` stay
dormant, marked so in [PERFORMANCE.md](../../PERFORMANCE.md). The original item follows.

**Found 2026-10-23** while proving backlog 30 ([archive](#30-tooling-one-shared-cdp-helper-for-the-perf-scripts)):
`npm run perf` (`scripts/perf/profile.mjs`, [PERFORMANCE.md](../../PERFORMANCE.md)) threw on `main` after Fleet Params. The
layout rework (roadmap [45](../roadmap.md#45-layout-rework-shell-nav-section-tabs-roster-off-screen)) had moved everything
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

## 32. Audio: Oscillator Leak Fix — Disconnecting the Dead Note's Params

**Closed** 2026-10-26 (Crawford; `fix/oscillator-leak`, merged via PR #577, `4e0cb174`). Every note's two param connections are disconnected when it ends: `patchOscillatorEndedDisconnect` in `src/engine/tonePatches.ts`, applied at boot by `src/engine/audioContextSetup.ts` (`oscillatorLeakPatched`), documented in [AUDIO_SYSTEM.md](../../AUDIO_SYSTEM.md), "Tone patch: the per-note oscillator leak"; proof in [PERFORMANCE.md](../../PERFORMANCE.md), "Oscillator Leak Fix — the T3 proof run". The Tone upgrade that deletes the patch waits on npm and is its own item: [34](../backlog.md#34-audio-upgrade-tone-once-the-leak-fix-is-latest-then-delete-the-patch). The original request follows.

**Found 2026-10-23** by backlog [27](#27-audio-phone-playback-underruns-at-light-load-main-included)'s desktop step 1
([scratchy-audio-phones.md](../scratchy-audio-phones.md), "Backlog 27, desktop step 1"). Every note the app plays leaves one
native `OscillatorNode` alive for the life of the page. Tone 15.1.22's `Oscillator._start` connects the Oscillator's
persistent `frequency` and `detune` Signals into a fresh node on each start, and nothing disconnects them when the note
ends, so standardized-audio-context keeps both connections in the Signals' output Sets and scans them on every later
connect. On D1 at Light that is about two a second (+324 nodes in four minutes). Step 2's 15-minute runs held the rate
(D1 +1057, D5 +171), and its A/B against a throwaway build that disconnects the two params at `onended` took D1 to +48
with nothing changed on the audio thread. The desktop never felt it; the fix is for the phone, and for correctness.

**Route (A), Crawford 2026-10-23:** an in-app wrapper, `src/engine/tonePatches.ts`, applied once at boot by
`src/engine/audioContextSetup.ts`; no new dependency. Spec [docs/specs/OSCILLATOR_LEAK_FIX.md](../../specs/OSCILLATOR_LEAK_FIX.md),
plan [docs/tasks/OSCILLATOR_LEAK_FIX.md](../../tasks/OSCILLATOR_LEAK_FIX.md), branch `fix/oscillator-leak`. The number is
the plan's proposal; Crawford may renumber it or make it a roadmap phase.

**Progress 2026-10-23:** T1 built (`bda60dcc`, the wrapper and its tests). T2 built: `audioContextSetup.ts` applies it at boot
and exports `oscillatorLeakPatched` (`13ee3b7d`). T3 run: the leak is closed (patched Oscillator +23 to +32 in 240 s on D1 at Light,
stock +325 to +328) and max lag unchanged; one patched round read one 15 s bucket above the stock spread, so the "no
cost" criterion is missed as written ([PERFORMANCE.md](../../PERFORMANCE.md), "Oscillator Leak Fix — the T3 proof run").
Checkpoint B passed (Crawford 2026-10-23: the round 3 bucket accepted as noise, his listen passed).

**Built 2026-10-23 on `fix/oscillator-leak`.** What shipped: `patchOscillatorEndedDisconnect` in
`src/engine/tonePatches.ts`, applied at boot by `src/engine/audioContextSetup.ts`, which exports
`oscillatorLeakPatched`; documented in [AUDIO_SYSTEM.md](../../AUDIO_SYSTEM.md), "Tone patch: the per-note oscillator
leak". The proof is PERFORMANCE.md's T3 section above. Left: Crawford's PR; the Pixel sitting of plan.md Stage 1
carries this build beside stock. Archive this item when the PR merges.

**Upstream, 2026-10-23 (T5).** No report to file: Tone already has it as
[#1379](https://github.com/Tonejs/Tone.js/issues/1379), fixed by [#1393](https://github.com/Tonejs/Tone.js/pull/1393)
(the same two disconnects) in **15.3.11**, on npm's `next` tag; `latest` is still 15.1.22. On a fixed Tone the
wrapper throws on every note (Tone's own cleanup disconnects a second time; a scratch repro on 15.5.61 read 120 uncaught
errors and no `onstop` in 120 notes).

**T6, 2026-10-23 (Crawford's option (b)):** the wrapper now runs Tone's `onended` first and the two disconnects after,
each swallowing, so on a fixed Tone ours are the swallowed repeats. The repro on the real module: no error, every
`onstop`, no retained oscillator, on 15.1.22 and 15.5.61 alike. The upgrade still deletes the patch; it no longer has
to be the same change.

**The Tone upgrade waits for the official release (Crawford, 2026-10-23).** No move to 15.3+ while it rides npm's
`next` tag. When a release with the fix becomes `latest`: upgrade on its own branch (read the changelog from 15.1.22,
full suite, a listen, the perf runs against the old version), and delete `src/engine/tonePatches.ts`, its test, its
call and `oscillatorLeakPatched` in that change.

## 33. Audio Rig: Exact Stepped Values, and Log Sliders That Read Cleanly

**Closed** 2026-11-08 (piece 2 merged via PR #609, `feature/log-slider-readouts`; piece 1 had shipped 2026-10-25 inside
roadmap 56, PR #581). Both pieces are built: `quantizeToStep` returns exact on-step numbers, and the twelve log sliders
read like pedal markings through `fixedReadout`, display only. Crawford passed the look at the plan's Checkpoint A and
the docs read at Checkpoint: Complete. The parked value grid at the end stays parked: revisit only if the readouts still
bother him. The original request follows.

**Raised by Crawford, 2026-10-25,** on `feature/short-world-link`, after its code review: "those values should be
quantized when they're loaded in initially, then they should stick to the steps of the sliders … why are we rounding
things on save/share?" Weighed the same day and cut down to the two small pieces below; the larger version (a value
grid for every log slider) is parked at the end. Not yet specced. It waited for roadmap
[56](roadmap-archive.md#56-short-world-link) to merge (the finish-the-branch rule); 56 merged on 2026-10-26 (PR #581), so nothing
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
(`src/data/audioRigConfig.ts`) has a `formatValue`, so the label falls back to `formatDisplayValue` (3 decimals) and a
cutoff reads `3152.859Hz`. Eight of the twelve carry a unit through `labels()`; the four Qs are bare. (Corrected
2026-11-07: this said none had a unit.)

- Give each a display format: for example whole hertz with a unit for the frequencies, 2 decimals for Q, milliseconds
  for attack and release, 2 decimals of seconds for decay.
- Display only, like `formatDisplayValue` itself: the stored value and the sound do not change.
- Copy: any unit text goes through `src/content/` like every other label.

**Piece 2 built 2026-11-08** (on `feature/log-slider-readouts`; [spec](../../specs/LOG_SLIDER_READOUTS.md),
[plan](../../tasks/LOG_SLIDER_READOUTS.md)): `fixedReadout` (`src/components/ui/controls/formatReadout.ts`) gives the
twelve three shapes, whole hertz (`3153Hz`), whole milliseconds (`12 ms`; the compressor's content unit is now
`' ms'`), and two fixed decimals (`0.50`, `2.40s`), trailing zeros kept. `SliderLog` sets the thumb's
`aria-valuetext` whenever a schema formats its value. Display only: no step, nothing stored moves.

**Parked: a value grid for the log sliders.** Giving the twelve fields a step at load, making `SliderLog` snap to it,
and then deleting `sessionCapture.ts`. Weighed 2026-10-25 and not worth it now: nothing audible changes (every value
moves by less than a step), links and saves already agree, and the risky part is the slider. A fixed step sticks at the
low end of a log range: at attack's minimum one key press moves the value about 0.0000053 s, which snaps back to
0.001 s, so the key never leaves the bottom step (a cutoff near 20 Hz on a 1 Hz grid sticks the same way). Revisit only
if piece 2 leaves the decimals still bothering Crawford. Options then: every press moves at least one whole step, a
relative grid (three significant figures), or `schema.steps`, the fixed list of allowed values `SliderLog` already
supports for Automation Rate. The robot side of `sessionDiff.ts` (layer gain and the five sends rounded to 2 decimals,
whose comment notes "a seed off the grid") would be the same question.

## 35. Audio: BeatClock Drops the Transport Time Its Callbacks Are Given

**Closed** 2026-10-26 (merged via PR #585, `fix/beatclock-transport-time`; archived 2026-11-02). BeatClock's `scheduleRepeat` forwards the Transport time and the swell tick carries it to every write in both pools; the harmony tick, the docking lifecycle and `setRoomFeeder` stay on "now" by decision; Tone's warning no longer fires. The pre-scheduled swell curve was left out by Crawford's threshold decision (below). The original request follows.

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

**Status:** intent [docs/intent/beatclock-transport-time.md](../../intent/beatclock-transport-time.md), spec
[docs/specs/BEATCLOCK_TRANSPORT_TIME.md](../../specs/BEATCLOCK_TRANSPORT_TIME.md), plan
[docs/tasks/BEATCLOCK_TRANSPORT_TIME.md](../../tasks/BEATCLOCK_TRANSPORT_TIME.md); building on branch
`fix/beatclock-transport-time`.

**Built** 2026-10-26 on `fix/beatclock-transport-time` (T0–T14; Checkpoints A–C passed, Crawford's listen included).
BeatClock's `scheduleRepeat` forwards the Transport time, and the swell tick carries it to every write in both pools;
the harmony tick, the docking lifecycle and `setRoomFeeder` stay on "now" by decision
([AUDIO_SYSTEM.md](../../AUDIO_SYSTEM.md#scheduling-patterns)). **The proof run:** with `perf:audio`'s new console tally,
stock `main` logs Tone's warning once in each of three rounds and the branch logs nothing
([PERFORMANCE.md](../../PERFORMANCE.md#beatclock-passes-the-transport-time--the-console-check-2026-10-26-backlog-35)).
**The measurement:** the swell tick takes 3.38 % of the idle window with the store half excluded (median, 3.35–5.68 %,
4× throttle, swell-heavy link; 0.01 % with Swell Frequency 0)
([PERFORMANCE.md](../../PERFORMANCE.md#the-swell-ticks-main-thread-share-task-12)).

**Curve: not built** (Crawford, 2026-10-26, Checkpoint C). The pre-scheduled swell curve (the whole swell scheduled on
the param at its start and rendered on the audio thread, with no per-tick engine write) was left out of this item
behind a measurement and a threshold: build it only past **2 %**. The tick's 3.38 % clears that, but the param writes a
curve would take off the main thread are **0.45–0.70 %**. Most of the tick is phase writes rebuilding a periodic wave,
a setting a curve cannot carry, and that cost is
[37](#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick). The design that would have been built is in the
intent's Out of scope ([docs/intent/beatclock-transport-time.md](../../intent/beatclock-transport-time.md#out-of-scope)).

## 36. Audio: Swells on `pulseWidth` Write NaN Into the Voice Every Tick

**Closed** 2026-10-27 (with backlog 37 on `fix/swell-targets`, `d8e3fd9f`). No robot swell can target `layerN.pulseWidth` any more, which removes the flood's only source; the fix designed below was not built. The original request follows.

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

**Superseded (Crawford, 2026-10-26):** pulse width comes off the swell targets in
[37](#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick), which removes the only source of the flood; the fix
above is not built. The store check moves to 37, and 36 closes when 37 ships.

**Closes with 37's branch** (`fix/swell-targets`, 2026-10-27): no robot swell can target `layerN.pulseWidth` any more
(T4, `d8e3fd9f`). **Correction to Found:** the flood is a `devWarn`, which prints only in dev builds
(`import.meta.env.DEV`), so it cannot have appeared in production as the Found line says.

## 37. Audio: Phase Swells Rebuild a Periodic Wave Every Tick

**Closed** 2026-10-27 (Crawford; `fix/swell-targets`, `1ba47a46`..`d8e3fd9f`, docs `c44a00b3`). The robot swell pool drops layer `phase` and `pulseWidth`, 22 targets to 16, and `createPeriodicWave` under the swell tick measured 0 on every branch run. The original request follows.

**Found 2026-10-26** by backlog 35's measurement (Task 12, [PERFORMANCE.md](../../PERFORMANCE.md#the-swell-ticks-main-thread-share-task-12)).
Crawford asked for it as its own item after the breakdown (2026-10-26) and dropped 35's pre-scheduled curve the same
day: the curve would have removed only the 0.45–0.70 % of param writes, not this.

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

**Decided (Crawford, 2026-10-26): phase and pulse width come off the swell targets**, all six
(`layer0`–`layer2` `.phase` and `.pulseWidth`). Desktop has been clipping lately and the aim is to remove everything that
costs more than it plays: phase is most of the swell tick, and pulse width is the source of
[36](#36-audio-swells-on-pulsewidth-write-nan-into-the-voice-every-tick)'s flood. The other options (write phase only
when it moves a step, quantise it, keep a wave per layer) are not pursued.

**To check first:** every place a robot swell target is listed or tested: `SwellRobotAttributeId` in
`src/types/audioSwell.ts` and its tests, `ROBOT_SWELL_FIELD_RANGE`, the pool's eligible-target set, any UI that lists
targets, and the docs that name them (AUDIO_SYSTEM.md's Audio Swells). Whether a saved session or world link can name a
swell target, so a removed one is tested to load without error; and 36's store check, whether an earlier swell left a
`pulseWidth: null` in a saved session.

**Fix (behaviour, RED first):** the pool never picks a phase or pulse-width swell, and the type no longer has them.
Done when a world runs swells with no `pulseWidth` warning, and the same measurement as 35's Task 12 on the same link
shows the tick's share before and after. This removes 36's only source, so 36 closes with this branch.

**Spec and plan (2026-10-26):** [docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md](../../specs/SWELL_PHASE_PULSE_WIDTH_CUT.md),
[docs/tasks/SWELL_PHASE_PULSE_WIDTH_CUT.md](../../tasks/SWELL_PHASE_PULSE_WIDTH_CUT.md), branch `fix/swell-targets`. No
saved session or world link names a swell target (active swells are module state), so nothing needs testing to load. The
store check: the NaN does reach the store mid-swell, and a save made then carries `pulseWidth: null`. Crawford decided
old saves are left as they are. Spec §7 records all five decisions; two findings became
[40](#40-audio-every-layer-write-re-applies-every-layers-phase) and
[41](#41-audio-the-composite-voices-layer-records-drift-from-the-robots-layers).

**Built (2026-10-27)** on `fix/swell-targets`: T1–T4 (`1ba47a46`..`d8e3fd9f`), the pool goes from 22 targets to 16;
docs in T8 (`c44a00b3`).
- **Console check** (T6, `43a451e9`, [PERFORMANCE.md](../../PERFORMANCE.md#phase-and-pulse-width-off-the-swell-targets--the-console-check-2026-10-26-backlog-3637)):
  stock never printed the pulse-width line on S1, in 120 s or 300 s, so the check is recorded as unproven and T4's test
  is the proof. The branch logged nothing.
- **Measurement** (T7, `5459e740`, [PERFORMANCE.md](../../PERFORMANCE.md#the-swell-ticks-main-thread-share-stock-37-and-37--38-task-7)):
  `createPeriodicWave` under the tick is 0 on every branch run (stock's phase-swell run: 2.84 %). The tick reads 2.16 %
  (2.14–2.29) on 37, against stock's 2.26–2.41 % without a phase swell and 6.11 % with one.
- **Listen** (Crawford, 2026-10-27, stock against head, which carries 38 too): "it sounds better. there are still some
  clicks here and there but it's markedly better i think." Nothing new, fewer pops.

## 38. Audio: Swell Writes Land as Steps, Not Ramps

**Closed** 2026-10-27 (Crawford; folded into 37's `fix/swell-targets`, `2c1bcfd6`..`0922f0df`). Every timed write glides one 16th note from its tick time; the tick's share grew +0.81 points over 37, less the 0.16–0.23 T13 took off, and Crawford accepted it. The original request follows.

**Found 2026-10-26** by the steady-state review
([PERFORMANCE.md](../../PERFORMANCE.md#steady-state-review--what-runs-continuously-and-which-of-it-can-pop-2026-10-26)),
asked for by Crawford after the desktop's cracks and pops.

**Cause.** The swell tick writes a live Param or Signal through `setOrPoint` (`src/engine/audioEngine/voiceEntry.ts`),
which is a bare `setValueAtTime` at the tick's time: a hard step, sixteen a measure, for the swell's whole life. The
targets it reaches that way: layer gain (`ROBOT_SWELL_FIELD_RANGE` 0–2, a minimum swing of half the range times
Intensity, so a one-measure swell steps a sounding layer's amplitude by several percent a tick), EQ3 low/mid/high (±12
dB, through `setGlobalEQ`), LPF and HPF Q (`setGlobalFilterLPF`/`HPF`) and layer detune. Volume, the five sends and
the two filter frequencies go through `rampOrSet` with a 50 ms ramp and are fine. Before backlog 35 these writes were
`.value =`, which is the same step placed "now", so this is long-standing, not a regression; 35 dropped its
pre-scheduled curve on the main-thread criterion alone (Task 12) and never weighed the staircase.

**Also here: Auto pan.** `updateAllPanners` (`src/engine/AudioEngine.ts`) writes `entry.panner.pan.value` every `16n`
while a robot swims (gated by `PAN_WRITE_EPSILON`), a cancel-and-set step on every sounding robot in motion;
`updateRobotPan`, the slider's path, ramps over `PAN_RAMP_SECONDS`. One call.

**To check first:** the tick's `time` is the audio-clock time the write is for, and the next tick is one `16n` later
(`Tone.Time('16n').toSeconds()` at the live tempo); a ramp that ends at the next tick's time overlaps nothing. Whether
Tone's `Param.linearRampToValueAtTime` needs a preceding `setRampPoint` (it does: `rampTo` makes one) so the ramp starts
from the current value, not from the last scheduled event. The headless/test stubs that `setOrPoint` falls back on.

**Fix (behaviour, RED first):** a timed swell write to a Param or Signal is a ramp from its current value to the new one,
ending at the next tick's time, for every target `setOrPoint` serves today; Auto pan's per-tick write takes the same ramp
`updateRobotPan` uses. Done when a layer-gain swell on a sustained note is a glide, not a staircase, by ear (Crawford),
and Task 12's measurement on the same link shows the tick's share did not grow. Intended to ride
[37](#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick)'s branch: same helper, same measurement, one listen.

**Folded into 37 (Crawford, 2026-10-26):** designed as §8 of
[docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md](../../specs/SWELL_PHASE_PULSE_WIDTH_CUT.md), with tasks T10–T12 in
[its plan](../../tasks/SWELL_PHASE_PULSE_WIDTH_CUT.md), on `fix/swell-targets`. A write with a time glides one `16n` from
it (`rampTo(value, tick, time)`). Decided in spec §8.6 (Crawford, 2026-10-26): every timed write glides, robot volume,
the sends and the filter cutoffs included, and a glide lasts one 16th note at the live tempo.

**Built (2026-10-27)**, folded into 37's branch `fix/swell-targets`:
- T10 (`2c1bcfd6`): BeatClock's `getTickSeconds`, one `16n` at the live tempo.
- T11 (`42c094f6`): `setOrPoint` becomes `setOrGlide`, and `rampOrSet`'s timed ramp lasts one tick.
- T12 (`0bdf7562`): Auto pan glides.
- T13 (`0922f0df`): the tick length is read once per tick, not once per write.
- T8 (`c44a00b3`): the docs.

Every timed write glides: robot volume, the five sends, layer gain and detune (including the envelope's re-applied
layer params), the global LPF/HPF cutoff and Q, the EQ bands, and Auto pan. Hand edits are unchanged.

**The cost:**
- **Did not meet "the tick's share did not grow"** (T7,
  [PERFORMANCE.md](../../PERFORMANCE.md#the-swell-ticks-main-thread-share-stock-37-and-37--38-task-7)). Head's tick is
  2.97 % (2.90–3.07) against 37's 2.16 % (2.14–2.29), +0.81 points. A glide is a `rampTo`, about three times a point.
- **T13 removed the tick-length read,** 0.16–0.23 % → 0.00–0.03 % (T14, `8aceff32`,
  [PERFORMANCE.md](../../PERFORMANCE.md#one-tick-length-read-per-tick-task-14-2026-10-27)). In that session the tick
  total did not resolve the saving.
- **Crawford accepted the cost** (2026-10-27).

**Listen** (Crawford, 2026-10-27): the glides, Auto pan, and no glide fighting a step "sound fine"; overall "markedly
better", with some clicks left.

## 39. Main Thread: Recurring Store Writes Fan Out to the World View (Measure First)

**Closed** 2026-11-10 (Crawford): moot, nothing built. Its own gate was never met. The pops it was recorded against went
with [37](#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick) and [38](#38-audio-swell-writes-land-as-steps-not-ramps)
(the swell discontinuities) and [67](#67-audio-the-desktop-crackles-at-full--the-graphs-standing-cost-leaves-no-headroom)
(the graph's standing cost; Gate B passed by ear 2026-11-10), so there is no spike left to read the lag line beside. The
fan-out it describes is still as written when closed (RobotBody still hands RobotGem fresh `palette`, `orbiters` and
`halo` objects, LightShafts and TerrainLayer still select the whole locale, the clock tick still runs once a second), and
stays recorded as rows 4–6 of PERFORMANCE.md's steady-state review; a main-thread question on a phone would start there,
as a new item. The original item follows.

**Found 2026-10-26** by the steady-state review
([PERFORMANCE.md](../../PERFORMANCE.md#steady-state-review--what-runs-continuously-and-which-of-it-can-pop-2026-10-26)).
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

## 40. Audio: Every Layer Write Re-applies Every Layer's Phase

**Closed** 2026-10-27 (Crawford; with backlog 41 on `fix/composite-layer-writes`, `aebdb56d`..`e1bebc9a`, docs `f2ceb663`). The composite skips a layer write equal to what it last wrote, and Tone's `phase` setter under the swell tick measured 0.00 % (base 0.08 %); the probe found the removed writes were never audible. The original request follows.

**Found 2026-10-26** while writing [37](#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick)'s spec (§7 question
4 (i)). A code read, not yet measured or tested. Crawford placed it next in plan.md after 37 and 38.

**Cause.** `AudioEngine.updateVoiceLayerParams` hands the composite the robot's whole `layers` array, and the
composite's `set` (`src/engine/audioEngine/compositeVoice.ts`) writes a layer's `phase` whenever it is defined.
`OscillatorLayer.phase` is required, so it is always defined. `pulseWidth` is written whenever it is present.
`updateVoiceEnvelope` patches every layer the same way. So every layer gain or detune write and every ADSR write, by
hand or by a swell tick (up to sixteen a measure per swelling robot), runs `applyOscFieldViaSet` →
`synth.set({ oscillator: { phase } })` on every sounding layer, though phase did not change. Tone's `phase` setter
re-runs its `type` setter:

- with phase 0 and a basic type, that is a native `type` assignment;
- otherwise it is a periodic-wave cache lookup and `setPeriodicWave` on the **sounding** oscillator.

Before 37 the phase swells churned the 100-entry cache, so these lookups could also miss and rebuild a wave. After 37
they should hit.

**To check first:**

- 37's T7 measurement: the branch's remaining phase-setter share under the swell tick. **Measured 2026-10-27:
  0.03 % (0.01–0.04) of the IDLE window on the 37 build, 1.1–3.2 ms per 6 s window at 4× throttle**, all under
  `applyOscFieldViaSet`, with no `createPeriodicWave`, so the lookups hit the cache
  ([PERFORMANCE.md](../../PERFORMANCE.md#the-swell-ticks-main-thread-share-stock-37-and-37--38-task-7)).
- Whether swapping in an identical wave, or re-assigning the same native `type`, mid-note is audible. A headless probe,
  or Crawford's ear on a gain swell over a sustained note.

**Fix: spec'd** (2026-10-27), with 41 on one branch because the fix is one mechanism. Intent
[composite-layer-writes.md](../../intent/composite-layer-writes.md), spec
[COMPOSITE_LAYER_WRITES.md](../../specs/COMPOSITE_LAYER_WRITES.md), plan
[COMPOSITE_LAYER_WRITES.md](../../tasks/COMPOSITE_LAYER_WRITES.md), branch `fix/composite-layer-writes`. The composite
records what it last wrote to each layer field and skips a write equal to its record, timed or not, by exact equality.
Both checks above are answered. The size is 0.03 % of the IDLE window. The audibility probe
([spec §5.4](../../specs/COMPOSITE_LAYER_WRITES.md#54-the-audibility-probe-run-2026-10-27-recorded)) found an identical
phase re-apply sample-exact silent, so 40 alone is inaudible and small; its value is the mechanism it shares with 41.

**Built (2026-10-27)** on `fix/composite-layer-writes`, with 41: T1–T8 (`aebdb56d`..`e1bebc9a`), docs in T10
(`f2ceb663`). The composite records what it last wrote to each layer field and skips a write equal to its record (T2,
`36ed252e`); the ADSR and portamento reach it only through `setShared` (T3, `126ddcee`).
- **Measurement** (T9, `398a666c`, [PERFORMANCE.md](../../PERFORMANCE.md#the-swell-ticks-main-thread-share-base-and-head-task-9)):
  Tone's `phase` setter under the swell tick goes from 0.08 % (0.03–0.11) on the base to 0.00 % (0.00–0.01), and the
  oscillator settings bucket from 0.12 % to 0.00 %. The tick as a whole goes from 3.11 % to 2.33 %.
- **Probe** ([PERFORMANCE.md](../../PERFORMANCE.md#is-an-unchanged-phase-re-apply-audible-2026-10-27)): an identical
  phase re-apply is sample-exact with the steady note, so the removed writes were never audible.
- **Listen** (Checkpoint D, Crawford): passed, "I think it sounds good."

## 41. Audio: The Composite Voice's Layer Records Drift From the Robot's Layers

**Closed** 2026-10-27 (Crawford; with backlog 40 on `fix/composite-layer-writes`, `aebdb56d`..`e1bebc9a`, docs `f2ceb663`). Each composite record carries its robot layer index and what was last written, an envelope or glide edit writes no layer field, and unmuting a layer muted at build rebuilds the voice; Crawford's listen passed. The original request follows.

**Found 2026-10-26** while writing [37](#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick)'s spec (§7 question
4 (ii)), and checked against the code the same day. A code read with no test yet. Crawford placed it next in plan.md
after 37 and 38.

**Cause.** `createCompositeVoice` keeps one record per layer it builds (`layerNodes`, exposed as `composite.layers`),
holding the `OscillatorLayer` it was built from, and `set` never updates it. Two symptoms follow.

- **An envelope edit restores old layer values.** `updateVoiceEnvelope` builds its patch from `composite.layers`
  (`{ ...layer, adsr }`): the build-time gain, detune, phase and pulse width. `set` applies all of them. So an ADSR
  edit, a hand drag or an ADSR swell tick, writes the build-time values back over any layer edit or swell made since.
  The store and the sliders keep the new values, and the engine is wrong until that layer is written again. With an
  ADSR swell and a gain swell running on one robot, the two writes would fight every tick.
- **Layers are matched by position against a list with the muted ones removed.** `reserveVoice` builds only audible
  layers (`filterAudibleLayers` drops `gain === 0`). `updateVoiceLayerParams` passes all of the robot's layers, and
  `set` matches them by index. On a robot built with layer 1 muted, the nodes are `[layer 0, layer 2]`:
  - an edit to layer 1 lands on layer 2's synth;
  - an edit to layer 2 finds no node and is dropped;
  - unmuting layer 1 by hand is a live `applyLayersContinuous`, not a rebuild, so it raises layer 2's gain instead.

**To check first:** one test per symptom, a few lines each against `createCompositeVoice` and `AudioEngine`, to confirm
or kill it before any design. Also whether anything the read missed rebuilds the voice on an unmute.

**Fix: spec'd** (2026-10-27, after the interview), with 40 on one branch. Intent
[composite-layer-writes.md](../../intent/composite-layer-writes.md), spec
[COMPOSITE_LAYER_WRITES.md](../../specs/COMPOSITE_LAYER_WRITES.md), plan
[COMPOSITE_LAYER_WRITES.md](../../tasks/COMPOSITE_LAYER_WRITES.md), branch `fix/composite-layer-writes`. Both symptoms
are confirmed by a code read, with a fourth victim: `getRobotModulationTarget` resolves an LFO link's `layerN.*` by
position too, so on that robot a `layer1` link reaches layer 2's node. Nothing rebuilds the voice on an unmute. The
fix gives each composite record its robot layer index and its last-written values. `set` routes by index, and
`setShared` becomes the one path for the ADSR and portamento. A non-zero gain on a layer with no synth makes the
action rebuild the voice and re-prime its links. Mute stays live.

**Built (2026-10-27)** on `fix/composite-layer-writes`, with 40; docs in T10 (`f2ceb663`).
- Each record carries its robot layer `index` and what was last `written`, and `set` routes by index (T1, `aebdb56d`).
- The engine passes the indices at reservation, keys the reservation-time patch by them and resolves LFO targets
  through `layerAt`, so a layer muted at build resolves `null` (T5, `47310ce0`).
- Envelope and glide edits write no layer field (T3, `126ddcee`; tests T6, `5803edf1`).
- `updateVoiceLayerParams` returns `needsRebuild` (T7, `cfede0b9`), and `applyLayersContinuous` rebuilds on it through
  `rebuildVoice`, after the store write (T8, `e1bebc9a`).
- **Measurement** (T9, `398a666c`, [PERFORMANCE.md](../../PERFORMANCE.md#the-swell-ticks-main-thread-share-base-and-head-task-9)):
  the envelope bucket goes from 0.60 % (0.35–0.79) to 0.15 % (0.10–0.16), the layer glides it re-applied from 0.26–0.55 %
  to 0.00, and the robot param writes from 0.45 % to 0.15 %.
- **Listen** (Checkpoint D, Crawford): passed, "I think it sounds good." The listen covered the gain-then-ADSR drag,
  the muted layer's unmute, and a swell.

## 43. Animation: The World Pause Misses Timelines Built Paused and Played Later

**Closed** 2026-11-10 (Crawford): recorded, not a bug; nothing built. Checked against the code on closing: the arrival
guard (`setTimeline`, `src/animation/timelineMap.ts`) still pauses only a playing timeline, and eight builders still
create a timeline `{ paused: true }` and play it after registering (the swim, the station ripple, the job timeline, the
deck camera and four in `src/systems/workLoop.ts`). None of them can start under the pause: the pause freezes the measures
and the work loop's clock, and the one wall-clock caller, the deck camera, is gated on the world state (R26.1). The
pattern is documented in [ANIMATION_SYSTEM.md](../../ANIMATION_SYSTEM.md) beside the guard. The general fix below is not
built unless a change starts a `'world'` timeline during a pause; that change would reopen this as a new item. The
original item follows.

**Found 2026-10-31** by the off-screen review ([OFF_SCREEN_REVIEW_FOLLOWUPS.md](../../tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md)
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

## 44. Sessions: Warn Before the Saves Fill the Browser's Storage

**Closed** 2026-11-10 (nothing built; `docs/plan-update`). The "to work out" question was how big a save is and how many
fit, so it was measured before the interview: a real `buildSessionPayload` on the 12-robot roster, stored as one
`SessionEntry`. An untouched world (globalAudio, the LFO Bank and the loading identity, no overrides) is about 2.0 KB;
the worst case — every robot with every override field changed, ADSR, three layers, filter, all five sends, pan, the
performance fields, every LFO link and a rename — is about 15 KB, about 1.1 KB per fully tweaked robot. Against
Chrome's ~5 MB per-origin cap that is roughly 2,600 untouched saves or 345 worst-case ones; a realistically tweaked
world (4–6 KB) fits 800–1,200 times. Nobody keeps hundreds of named transmissions in one browser, and the full-quota
case is already handled: Save catches the throw and shows "`{name}` failed to save.", Delete is in the Transmissions
list. A space-left readout or a low-storage warning would be UI for an event that does not occur, so Crawford closed it.
The sizes are recorded in [SESSION_STORAGE.md](../../SESSION_STORAGE.md) "The Storage Engine". The original request
follows.

Requested by Crawford, 2026-11-01, with the off screen's Keep failure line. There is no save-count limit in the app.
The saves live in `localStorage` (`src/utils/sessionStorageEngine.ts`), which browsers cap per origin, at about 5 MB
in Chrome. A save that does not fit throws. Keep catches it and shows its failure line in the warning's place (off-screen
review R20; Crawford's words for it, "storage is already full, cannot save world", land at F3 of
[OFF_SCREEN_FINAL_FIXES.md](../../tasks/OFF_SCREEN_FINAL_FIXES.md)). Comms' Save shows "<name> failed to save."
(`session.status.saveFailed`). Neither warns before the limit.

**To work out:** how big a save is (the payload is a diff against the seed, so an untouched world is small and a
heavily tweaked one is not); how many fit; and whether the off screen and the Sessions panel should show the space
left, warn as it runs low, or both. Delete is already in the Sessions list. Needs a short interview: where the warning
lives and what it says are Crawford's.

## 46. World: Seeded Draws Are Welded and Centre-Heavy (Names, Colours, Gems, Companies, Placement)

**Closed** 2026-11-11 (built on `fix/even-world-draws`, `928a0938`..`da8e6276` plus this archive commit; Crawford
passed both looks, "I like it" and "looks good", and called it done). Every world and visual pick draws even
(`getUniformSeededVal`) at the dataId and offset it always had: robot and company names, identity colours, gem seeds,
ids, spawn positions, company membership, the roster's Active count and docked batteries (spawn and the sim together),
factory ids, scales and spacing, the Attenuation Style tints and accent lean, scenery ids, the derelict roll and the
light shafts. Two bell-era workarounds went: `ACCENT_PAIR_OFFSET` (the accent primary draws at offset 0) and the
derelict re-hash. The plain draw is left with the three smooth walks (the terrain profile and the two temperature
files). After-table: zero correlated pairs in every set, every pick at its even share; the world build costs about
5 ms more; the station overlap at (−160, −120) is kept and pinned. Intent
[docs/intent/even-world-draws.md](../../intent/even-world-draws.md), spec
[docs/specs/EVEN_WORLD_DRAWS.md](../../specs/EVEN_WORLD_DRAWS.md), plan and record
[docs/tasks/EVEN_WORLD_DRAWS.md](../../tasks/EVEN_WORLD_DRAWS.md). The original request follows.

**Found 2026-11-01** while measuring the audio draws for backlog [47](#47-audio-seeded-draws-are-welded-and-centre-heavy--even-draws-first);
**recorded, not fixed** (Crawford: the visuals go on their own branch in case they need different tuning). A plain
`getSeededVal` draw samples one smooth simplex patch per world, so keys whose hashed x land close together read nearly
the same value, a key at offset 0 takes only a few values across all worlds, and a band's outer tenths rarely come up
([docs/specs/EVEN_SEEDED_DRAWS.md](../../specs/EVEN_SEEDED_DRAWS.md) §1.1 has the measurements). 47 moved the audio draws
to `getUniformSeededVal` (merged via PR #596, 2026-11-02; [PROCEDURAL_GENERATION.md](../../PROCEDURAL_GENERATION.md)
"Sampling Values" describes the three draws and lists the keys left on the plain one). The world and visual draws keep the plain draw: robot and company names, identity colours,
gem seeds, robot and company ids, company count, size and membership, spawn positions, the roster's active count and
docked batteries (`lifecycleSim.ts`, `spawnSystem.ts`), factory placement (`factoryPlacementSystem.ts`), districts
(`districts.ts`), terrain (`terrainProfile.ts`), light shafts (`LightShafts.tsx`), locale temperature.

**To work out:** which of those are picks (they should go even, like 47) and which are smooth walks on purpose (the
terrain profile and the temperature steps probably are). Then measure, switch the picks, and look: every world's
names, colours, gems and layout move. Done when no pick is welded to another and each fills its range.

## 47. Audio: Seeded Draws Are Welded and Centre-Heavy — Even Draws First

**Closed** 2026-11-02 (merged via PR #596, `fix/even-seeded-draws`, `e333b033`..`2617fd8d`; Crawford passed Classic at Checkpoint D, "i love it"). Every audio draw is even (`getUniformSeededVal`) or centred (`getCentredSeededVal`: the EQ bands, the detunes, a lit detune link's depth folded to its 1 % floor), at the dataId and offset it always had; no key pair correlates above 0.1; every fitted edge became the share it says (spec §1.4). The record, before-and-after tables included, is [docs/tasks/EVEN_SEEDED_DRAWS.md](../../tasks/EVEN_SEEDED_DRAWS.md); its docs tasks T19–T20 landed after the merge on `docs/plan-2026-11-02`. The refinement this was step zero of is roadmap [58](../roadmap.md#58-themes-and-aspects-refinement); the world and visual draws are backlog [46](#46-world-seeded-draws-are-welded-and-centre-heavy-names-colours-gems-companies-placement). The original request follows.

**Found 2026-11-01**, the first step of refining the themes and aspects (Crawford agreed to fix the spread before any tuning and then
re-hear Classic). Every audio value a world seeds through plain `getSeededVal` is welded to other keys,
centre-heavy, and at offset 0 coarse (a few global keys take 3 values in 3,000 worlds), and the share edges compared
against those draws realise other shares than they say. Crawford's decisions: every audio draw goes even, the world and
visual draws wait (46), Classic is switched first and then listened to, and the shape is even everywhere. Spec:
[docs/specs/EVEN_SEEDED_DRAWS.md](../../specs/EVEN_SEEDED_DRAWS.md), on `fix/even-seeded-draws`.

## 60. Audio: Cover the Silence When Every Active Robot Is Charging

**Closed** 2026-11-11 (merged in PR #623, `feature/no-silence-for-now`; Part A of
[the spec](../../specs/NO_SILENCE_AND_COMPANY_FAMILIES.md), §8 "As built (Part A)"). Crawford passed Gate A (the band,
0.67–1.5) and Gate B by ear ("ok passes, sounds good") on 2026-11-11. The last Active robot stays up until another lands,
and every robot draws one seeded battery size that divides its drain and its charge: no silent measure in any of 121
worlds, against 3.39 % of measures in 79 worlds before; a robot stays up past critical in 0.20 % of measures
([ROBOT_LIFECYCLE.md](../../ROBOT_LIFECYCLE.md)). Nothing of it is open: A3 stayed at its default, the fade on station
arcs (A4) became backlog [74](../backlog.md#74-audio-fade-a-robot-in-and-out-on-its-station-arcs), and A5 was settled.
Stage 2 (company families) became backlog [73](#73-robots-a-seeded-company-is-a-family). The elegant answer to silence
is still backlog [7](../backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter), post-launch. The
original request follows.

**Status (2026-11-11): Stage 1 built on `feature/no-silence-for-now`, unpushed.** Interviewed and specified as Part A of
[docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md](../../specs/NO_SILENCE_AND_COMPANY_FAMILIES.md), planned in
[docs/tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md](../../tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md). The last Active robot
stays up until another lands, and every robot draws one seeded battery size (Gate A: 0.67–1.5) that divides its drain
and its charge: no silent measure in any of 121 worlds, against 3.39 % of measures in 79 worlds before; a robot
stays up past critical in 0.20 % of measures ([ROBOT_LIFECYCLE.md](../../ROBOT_LIFECYCLE.md)). Gate B passed by Crawford's ear the
same day; ready for his PR, and it archives after the merge. The fade-on-arcs note that sat here (spec open question
A4) is now backlog [74](../backlog.md#74-audio-fade-a-robot-in-and-out-on-its-station-arcs). Stage 2 (company families) is backlog
[73](#73-robots-a-seeded-company-is-a-family) (built and archived).

Requested by Crawford at the 2026-11-02 plan review: occasionally every active robot is docked and charging at once and
the music stops, an awkward pause. Cover it for now; the elegant answer waits on backlog
[7](../backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter) (chord progressions) post-launch. The shape he has
in mind: always keep at least one robot sounding, perhaps "min 1 stays, max 3" by audio quality tier.

**Where it lands.** The docking lifecycle (`src/systems/robotSystems.ts`, [ROBOT_LIFECYCLE.md](../../ROBOT_LIFECYCLE.md):
the fixed 12-robot roster, flat drain and recharge on the measure tick) decides who docks when, and the Audio Load Budget
(`src/systems/audioBudgetSystem.ts`, [AUDIO_SYSTEM.md](../../AUDIO_SYSTEM.md) "Audio Load Budget") already caps sounding
robots per tier, so a floor beside the cap is the natural pair. Needs a short interview before a spec: a floor means
either a robot stays up past empty (which bends the battery rule) or the drains are staggered so the fleet never empties
together, and whichever it is must keep the lifecycle a pure function of seed and measures (roadmap 20.5's replay).

Plan.md Stage 3.

## 64. Off Screen: Current Stays the World You Came From, and a New Transmission Row with Scan

**Closed** 2026-11-02 (built on `docs/archive-roadmap-57`, `8fb0400a`..`5127d72b`; Crawford passed the Look at Checkpoint 2, "good to go"). Current is a runtime snapshot of the world you powered off on: picking it before the change that left it lands cancels that change, and after, restores the snapshot under the wash; Keep saves it (`sessionStore.keepWorld`, `isPayloadDirty`). A New Transmission row above it holds a draw made on mount, with Scan in its row; Roll and `rollWorld` are gone. A theme or aspect click keeps the selected row, which names the live loading in place of its own; every row names its world; the list has "Saved Transmissions" and "Preset Transmissions" titles. The shipped screen is described in [UI_SHELL.md](../../UI_SHELL.md#the-off-screen). The unsaved line's reword is backlog [62](../backlog.md#62-misc-review-items-a-bucket). The original request follows.

Raised by Crawford at Checkpoint 5's Look in [OFF_SCREEN_FINAL_FIXES.md](../../tasks/OFF_SCREEN_FINAL_FIXES.md), 2026-11-02:
Current renamed itself to every pick, and its only power over one (cancelling it, R3/F12) lasted the wash's 0.5 s fade.
The fix: Current becomes a runtime snapshot of the world you powered off on, restored when picked and saved by Keep; a
New Transmission row above it holds a fresh draw, with Scan in its row in place of Roll; and a theme or aspect click
keeps whichever row is selected. Intent: [off-screen-current-and-new-transmission.md](../../intent/off-screen-current-and-new-transmission.md).
Spec: [OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md](../../specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md). Plan:
[OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md](../../tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md). Plan.md Stage 1,
ahead of roadmap 58.

## 66. Tests: the Full Run's Unhandled "Timeout calling onTaskUpdate"

**Closed** 2026-11-10 (on `main`; `f3b4ea1c` caps `maxWorkers` at 8 in `vitest.config.ts`, after the output cleanup
`2f86e9ee` and `e08c3875`). Not a test that never yields: no case in the suite runs longer than 19 s against the
60 s RPC timeout. A temporary tracer in Vitest's worker (applied to `node_modules`, run once, reverted) named the file,
`OffScreen.test.tsx`, the first and heaviest, and the moment: a progress report sent about 7 s into the run, unanswered
at 67 s. In the startup burst all sixteen workers load the heaviest module graphs at once, and the main process, which
serves every worker's transforms, falls more than a minute behind one report. On the idle 16-core desktop 16 and 12
workers errored on every run, 10 ran clean once and 8 ran clean three times, the third with the pin in the config; the
cost is about 20 s on a 3.5-minute run. Figures and the re-measuring recipe:
[PERFORMANCE.md](../../PERFORMANCE.md), "The worker cap". The same afternoon's cleanup took a full run's output from
164,660 lines to 23,520: the composite-voice warning under a Tone with no WebAudio (`toneHasWebAudio`) and SVG
components rendered into a `<div>` (`renderSvg` in `src/testUtils`). The original request follows.

**Found 2026-11-05** at the review of roadmap [58](../roadmap.md#58-themes-and-aspects-refinement); **recorded, not
chased** (Crawford). Every full `npm test` run that day (four: `main` at `70cc91ce`, then the branch
`fix/deal-master-volume-push`) passed every test in 353 files and still printed "Vitest caught 1 unhandled error
during the test run" with `[vitest-worker]: Timeout calling "onTaskUpdate"`. The run exits 0, so nothing fails, but a
full run is never clean, and roadmap 58's Checkpoint: Complete asks for one.

**What it most likely is.** A worker held its thread longer than Vitest's RPC timeout, so its progress report to the main
process timed out: a long synchronous test that never yields. The measuring harness raised the same error until T10 of
[THEME_AND_ASPECTS_REFINEMENT.md](../../tasks/THEME_AND_ASPECTS_REFINEMENT.md) made it `await` between worlds. Candidates
are the many-world loops (spread and share tests over hundreds of styles, the swell-roll counts), which run slower
under a full parallel load.

**To do:** find the file (run the suite by directory, or with `--reporter=verbose`, until the error follows one file),
then let its loop yield or split the case. Done when a full run reports no errors.

## 67. Audio: The Desktop Crackles at Full — the Graph's Standing Cost Leaves No Headroom

**Closed** 2026-11-10. The four cuts were merged in PR #607 (2026-11-07). Their A/B runs, Gate B and the pin were done
on `perf/desktop-full-tier-ab-runs`. Crawford kept four inaudible cuts: docked and muted robots release their voices
(G1), a native bus filter (G2a), Full at `playback` (G4), and the effect cells wired past Tone's wrapper (G3). At Full,
W1's mean render capacity fell from about 0.58 to about 0.44, and its crest from 0.64 to 0.53.

**Gate B passed by ear on 2026-11-10.** On W1 at Full, full screen on the 4K, the build with the cuts counted 2
underruns, both at power-on, over six minutes. The commit before the cuts counted 16, spread through five minutes.
Neither build was heard to click.

**The pin** is 0.473 mean and 0.547 crest on W1 at Full, from 5ca8679f's code, with a band of 0.015 / 0.018
([PERFORMANCE.md](../../PERFORMANCE.md), "The audio pin at Full").

**Spun off:** the leaner synth layer (G2b), as roadmap [69](../roadmap.md#69-the-leaner-synth-layer-robot-voices-on-native-nodes);
the dark effects' standing Signals (B9), as backlog [72](#72-audio-dark-effects-leave-the-graph--their-standing-signals-go-b9).
The audible candidates (G5–G8) were not needed.

**Found 2026-11-05** on Crawford's desktop (4K monitor, Balanced power plan) on the live site, at
`?seed=ez84fjmr&x=93&y=-146&theme=wreck&debug`. It clicked from about 0:20 on every trial, and worse at full screen.
The overlay read `clock x0.62` and `underruns 2063` at 1:22: the audio thread was overloaded for seconds at a time. A
clean `perf:audio` A/B read 0.61 at Full, 0.56 at Standard and 0.29 at Light. The cause was the standing graph (about
1 800 nodes, Gains and Tone's Signals), not the number of robots.

Intent: [desktop-full-tier-standing-cost.md](../../intent/desktop-full-tier-standing-cost.md). Spec:
[DESKTOP_FULL_TIER_STANDING_COST.md](../../specs/DESKTOP_FULL_TIER_STANDING_COST.md) (§8 is as built). Plan:
[DESKTOP_FULL_TIER_STANDING_COST.md](../../tasks/DESKTOP_FULL_TIER_STANDING_COST.md). Record:
[scratchy-audio-phones.md](../scratchy-audio-phones.md#backlog-67-the-decomposition-at-full-2026-11-06) §1–§10.

## 68. Audio: Automatic Tier Choice for Weaker Desktops (Revisit with the Lean Graph)

**Closed** 2026-11-10 (Crawford). The question it left for itself is answered by
[67](#67-audio-the-desktop-crackles-at-full--the-graphs-standing-cost-leaves-no-headroom) as far as it can be: the lean
graph plays clean at Full on the one desktop measured, and no weaker desktop has been reported. The Audio Load dial stays
the answer for a weaker machine. Nothing built; either shape below would be a new item, on a report. The original item
follows.

**Raised 2026-11-06** at backlog 67's interview, as the question 67 set aside. A desktop boots at Full
(`resolveInitialAudioLoad`: no coarse pointer → Full) and nothing moves the dial for it; a machine weaker than
Crawford's gets the same graph and the same clicks. Two shapes were assessed and neither is 67's work:

- **A static estimate at boot.** Cost tracks graph size and barely tracks sounding robots (r 0.04 on ez84fjmr), so a
  node census at load time could pick the default tier before the first note, with no mid-session change. It knows the
  graph and not the machine.
- **A reactive step-down.** The page already samples `AudioContext.playbackStats` every 500 ms (`?debug`); a one-way
  ratchet on a sustained underrun rate could drop the tier. It is after the fact (the first clicks are heard before it
  knows; Chrome has no render-capacity API a page can read), Standard saves only ~0.05 so the step would have to be
  Light-like and audible mid-session, and a graph change under the lock can click by itself. A safety net at best.

**Decision (Crawford, 2026-11-06):** not in 67; revisit once the graph is lean, since every node 67 removes weakens the
case for either shape. The Audio Load dial stays the answer for weaker machines meanwhile. If it is picked up, the
first question is whether the lean graph leaves any desktop that needs it.

**What 67 left for it (2026-11-10).** On Crawford's desktop, Full now reads 0.47 mean and 0.55 crest on W1, and plays
clean by ear at full 4K. No weaker desktop has been measured, so whether one still needs this is open. Backlog 72 and
roadmap 69 would lower the floor further.

## 70. Tests: The Full Run Takes Too Long — Speed the Run, Don't Thin the Suite

**Closed** 2026-11-07 (`tests/pruning`, at the plan's Gate A; `8f51a83c` the baseline, the Node project and the
changed-files run). Measured on an idle checkout, a full run is 203 s wall-clock (1,144 s of worker time, 13,607 cases);
the twelve minutes that raised the item did not reproduce, and Crawford's own run the same evening read 204 s, so the
difference was the machine that day, not the suite. Moving the 67 DOM-free files (`data/`, `constants/`, `types/`,
`content/`, `testUtils/`, `engine/` and the perf scripts) into a Node project via `test.projects` saved 5 s of wall-clock
and 90 s of worker time; two files that read the DOM opt back into jsdom by docblock. The remaining levers (the mixed
folders, the six files slow by construction, the removal audit's first PR) are left in the plan as recorded options and
not taken: at 3.4 minutes the full run is a checkpoint step, and `npx vitest run --changed` is the everyday form
(`docs/CONTRIBUTION_GUIDE.md`). Figures and gotchas: [TEST_SUITE_RUN_TIME.md](../../tasks/TEST_SUITE_RUN_TIME.md);
the run-time note in [PERFORMANCE.md](../../PERFORMANCE.md). The original request follows.

**Raised 2026-11-07** by Crawford: a full `npm test` takes long enough that it is run rarely, and the suite looks
outdated and redundant in places. The audit written for that, `docs/reference/TEST_REMOVAL_CANDIDATES.md` (since
deleted; its residue is the appendix of [TEST_SUITE_RUN_TIME.md](../../tasks/TEST_SUITE_RUN_TIME.md); 354 files,
13,607 cases, 1,142 s of worker time), found the opposite of what it set out to find: the removable tests are
about 3 % of the lines and a few seconds of run time. Deleting them cleans up the signal and does not move the clock.

**Where the time is.** Three places, none of them "too many tests":

- Every file boots jsdom, including the roughly 130 files under `engine/`, `utils/`, `systems/`, `data/`, `constants/`,
  `types/`, `content/` and `stores/` that never touch the DOM.
- Five or six files are slow by construction: `globalFx.test.ts` resets the module graph and re-imports per case
  (22 s alone), `AudioEngine.test.ts` rebuilds its Tone mocks per case (39 s), `globalAudioSeed.test.ts` loops 3,000
  styles three times (18 s), `OffScreen.test.tsx` mounts the full screen 195 times (17 s), `svgElementExtent.test.tsx`
  renders 600 React trees per case (7 s), `lifecycleSim.test.ts` runs a 17 s readiness sim.
- Sixteen workers contend for the CPU, so a file inside a full run takes three to six times its time alone; the
  full-run per-file figures in the audit measure contention.

**To do:** measure a wall-clock baseline, then take the levers in order of cost: the DOM-free folders off jsdom, a
changed-files-only run for development with the full run kept for checkpoints, then the slow-by-construction files one
at a time, each measured alone before and after. The audit's first PR (its groups 1.1 to 1.8 and 1.12) rides along as an
optional last task for signal, not speed. Plan: [TEST_SUITE_RUN_TIME.md](../../tasks/TEST_SUITE_RUN_TIME.md). Done when a
full run's wall-clock time is recorded against the baseline and every test still proves what it proved before; the
number to beat is set by the baseline task, not here.

## 71. Off Screen: The Console — the One Place a World Is Made, Loaded, Kept, Shared or Deleted

**Closed** 2026-11-10 (both modules merged in PR #611, `feature/settings-retirement`, with module B stacked on module
A; the code review follow-ups, `3555abae`..`354459d5`, in PR #612). Crawford passed Checkpoints A, B, C and Complete
on 2026-11-09. The off screen is now the one place a world is made, loaded, saved, renamed, deleted or shared. Its
left column holds the New Transmission editor in one panel (style name, coordinates, Scan) and the Transmissions list
(Current, then the saves; the presets are gone). One action row (Save, Rename, Delete, Share) sits under the list,
Delete asks first in a modal confirm, and Factory Reset sits at the foot. The Settings branch has left the nav:
Audio Quality is Fleet Params' eighth tab, and Foundry and Save & Share are deleted. The Companies box went too
(Phase 5b): a company now opens under Probes. Crawford skipped one code review finding: a world click on a company's
screen leaves the company, and that stands as built. The shipped screen is described in
[UI_SHELL.md](../../UI_SHELL.md#the-off-screen) and [SESSION_STORAGE.md](../../SESSION_STORAGE.md), and each task's
**As built** note in the [plan](../../tasks/OFF_SCREEN_CONSOLE.md) holds the detail. The original request follows.

**Raised 2026-11-08** by Crawford, refined through `idea-refine` (six of seven variations taken) and confirmed through
`interview-me` the same day ([intent](../../intent/off-screen-console.md)); spec written and approved the same day
([spec](../../specs/OFF_SCREEN_CONSOLE.md)). The off screen roadmap 57 built and backlog 64 revised duplicates two
Settings tabs, Foundry (Seeds) and Save & Share, and is already too tall at 1280 × 720 to take more without hiding
something.

**What it does.** The off screen becomes the only place a world is made, loaded, edited, saved, shared or deleted; the
first-visit screen does not change. Two modules under one spec, built in order:

1. **`off-screen-console`** — the left column re-aimed: a New Transmission *editor* (style name, coordinates, Scan; a
   commit is a pick under the wash, Classic with no aspects; the inputs mirror the live world, so there is no draw on
   mount) over a collapsible Transmissions list (Current with an "unsaved" eyebrow while nothing stored matches it, the
   saves, a divider, the presets; no Load button — the pick is the load) with one Save / Rename / Delete row at its
   foot acting on the selected row (dimmed where inert, no per-row buttons, no Keep, no confirm on Delete), and a
   collapsed Device section holding Factory Reset with its confirm. Share moves beside the readout and copies the link
   for whatever the readout names; the standing warning line goes. The Loading column is untouched.
2. **`settings-retirement`** — Audio Quality becomes Fleet Params' last tab; the Settings branch leaves the nav;
   `SettingsScreen`, `SectorSettingsDrawer`, `SessionsPanel` and `SessionListItem` are deleted with their content keys;
   UI_SHELL.md, SESSION_STORAGE.md and COMPONENT_LIBRARY.md follow.

**Decisions on record** (the spec's §7 assumptions, each with Crawford's default): no draw on mount; after Delete of
the selected save the selection falls to New Transmission; a rename to a taken name is refused; Factory Reset flips the
gate at once; the disclosures are a muted Button over a conditional render, no Radix Collapsible, both collapsed on
every mount; Save on a preset or New Transmission moves the selection to the new row.

**Amended at Checkpoint A** (Crawford, 2026-11-09; the plan's Checkpoint A records each change): the presets are gone
(the list is Current and the saves); the Device section is gone, Factory Reset sits at the Transmissions section's foot;
Delete asks first, in a modal confirm; Share is the fourth button in the action row, not beside the readout; the
editor's three fields share one panel; `sessionStore.keepWorld` is cut; the list's show/hide toggle is gone (the list,
the action row and Factory Reset always show). Module B goes on a branch of its own after
this one merges, and may also retire the Companies nav item (not yet planned).

**Status:** spec approved 2026-11-08; the sketch frame drafted in `docs/sketches/off-screen.html` (frame F); plan
written the same day ([plan](../../tasks/OFF_SCREEN_CONSOLE.md): Tasks 1–11 the console, Checkpoint A, Tasks 12–16 the
retirement and docs). Module A (`off-screen-console`) built on `feature/off-screen-console`, its docs updated; at
Checkpoint A, awaiting Crawford's look. First line of plan.md's Stage 1.

## 72. Audio: Dark Effects Leave the Graph — Their Standing Signals Go (B9)

**Closed** 2026-11-10 (merged in PR #617, `perf/dark-effects-leave-the-graph`; T1–T12 `86898863`..`06f8bbb0`,
the docs `52825193`). Crawford passed Checkpoints A, B, C and Complete and the ear (T16) on 2026-11-10. A dark
bypass-cell effect no longer exists: it is built at its cell's first light from a settings mirror and torn down
`DARK_TEARDOWN_SECONDS` (1 s) after it goes dark at its own level. At Full the census fell 307 / 251 nodes and the
`perf:audio` mean 0.050 / 0.032 (W1 / W2); at Light none of the ten exists; every crossing ≤ ×1.107 with no gap
([spec](../../specs/DARK_EFFECTS_LEAVE_THE_GRAPH.md) §8, "As built"; [record](../scratchy-audio-phones.md),
"Backlog 72"). The original request follows.

**Raised 2026-11-10**, when backlog 67's Gate B passed without it. Crawford asked for it at once.

**The problem.** A bypass cell whose effect is dark (its own Mix is 0) is disconnected from the cut, the work of 67's
G3. But the effect object stays built, and its Tone Signals keep rendering: each Signal is a ConstantSource the audio
thread runs every quantum, whether or not anything hears it. W1 (`ez84fjmr:93:-146`, Wreck) has three such effects
(Chebyshev, Phaser and Tremolo). W2 (`bravo:-150:90`) has five (Distortion, Chebyshev, BitCrusher, Phaser and Tremolo).

**What the ablation found** ([record §9](../scratchy-audio-phones.md), 67's T16b). The test build disposed every dark
effect 3 s after power-on. The node census fell by 163 nodes on W1 and 196 on W2. The rendering ConstantSources fell from
185 to 159 on W1 and from 204 to 176 on W2. At Full, against the build with the three kept cuts, the mean fell
**−0.026 / −0.022** (W1 / W2), and W1's crest fell −0.055. That is the size of G2a, and inaudible if done right.

**The shape** (record §9's recommendation, not yet a spec):
- A dark effect is torn down after its darken's disconnect.
- It is rebuilt when it lights, silent under the cell's zero wet, the way `rebuildPhaser` (`globalFx.ts`) already swaps
  a Phaser.
- "Dark" means the effect's own Mix is 0: a chain cell's `mix`, or a room branch's `depth`. A branch with a depth whose
  room is only unfed is not dark, because it lights again when its room is fed. The ablation's first cut got this
  wrong and pruned W1's Chorus.
- Proof that a light makes no click: the crossing recipe in record §8 (`DARK_EFFECT_BYPASS` spec §8.2).

**Questions for the interview:**
- Where do the effect's current options live while it is gone? A setter must not write to a null effect, and the
  rebuild must take today's settings.
- What happens to an LFO or the global modulation pedal that targets an effect while it is gone?
- How long does the teardown wait after the darken?
- How does it interact with Light's hold-offs, a world change, and a save's load?

**Status:** intent confirmed 2026-11-10 ([intent](../../intent/dark-effects-leave-the-graph.md)), which answers the
questions above or hands them to the spec; spec approved the same day ([spec](../../specs/DARK_EFFECTS_LEAVE_THE_GRAPH.md),
its two open questions at their defaults) and the plan written ([plan](../../tasks/DARK_EFFECTS_LEAVE_THE_GRAPH.md),
seventeen tasks). **Built** 2026-11-10 on `perf/dark-effects-leave-the-graph` (the spec's §8, "As built"): a dark
effect is torn down a second after its disconnect and rebuilt at its next light. At Full the census fell 307 / 251 nodes
and the mean 0.050 / 0.032 (W1 / W2); at Light none of the ten exists; every crossing ≤ ×1.107 with no gap, and
Crawford heard no click (record "Backlog 72", §1–§4). Next: Crawford's PR; archive after the merge. The ablation's code
lives only in the backlog 67 session's scratchpad, not in the repo; record §9 describes it.

## 73. Robots: A Seeded Company Is a Family

**Closed** 2026-11-11 (`feature/company-families`; T1–T6 `0594fd49`..`6a7ba905`, the docs `842d824d`). Crawford passed
the rhythm-stream and built checkpoints and Gate C by ear on 2026-11-11 ("ok, i'm happy"), and asked for the archive
before the PR. Every seeded company is a family: its lowest-index robot founds it, and its members inherit the founder's
voice, composition and performance settings, LFO links and five sends, and keep their own notes, volume, battery size
and start. A rhythm belongs to the world and the rhythm shape (B16–B19), so members play the founder's onsets, lengths,
rests and accents exactly, and any robot set to the same Density and Motif Length joins them; the moved onsets this item
first described were cut (B18). At least two robots stay freelancers (the cap touches 34 of 121 grid worlds); the 30 %
copy roll is retired; the deal derives a member from its founder ([spec](../../specs/NO_SILENCE_AND_COMPANY_FAMILIES.md)
§9, "As built (Part B)"; [COMPANIES.md](../../COMPANIES.md), "A seeded company is a family"). The original request
follows.

Stage 2 of the no-silence intent ([docs/intent/no-silence-and-company-families.md](../../intent/no-silence-and-company-families.md)),
given its own number by Crawford on 2026-11-11 (spec open question B11), so backlog 60 closes with Stage 1. Every
seeded company becomes a founder (its lowest roster index) and members that inherit the founder's voice, onset pattern
and five sends, and keep their own notes, volume, battery size and start; a quarter of members move one or two onsets
in the measure; at least two robots stay freelancers; today's 30 % copy roll goes. Specified in
[docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md](../../specs/NO_SILENCE_AND_COMPANY_FAMILIES.md) Part B (§1.9–§1.11, from
Crawford's answers to B1–B11), planned in [docs/tasks/COMPANY_FAMILIES.md](../../tasks/COMPANY_FAMILIES.md) (nine tasks,
Gate C his ear). **Built only after Stage 1's Gate B passes.** It changes every world's melodies, so it lands before
backlog [45](../backlog.md#45-off-screen-crawfords-three-preset-links). B12–B15 answered 2026-11-11 (every default stands); built on
its own branch from `main` after 60 merges. Plan.md Stage 3.


## 79. Robots: Move in Time with Their Own Melody

**Closed** 2026-11-14 (`feature/note-cloud`, merged PR #637, and `feature/note-cloud-early-notes`, merged PR #640;
the note cloud). What shipped is **the note cloud on the robot screen**: a small piano
roll of the selected robot's own notes around the desk avatar, a bar per note at its pitch height, crossing right to
left in 5 s, white while it sounds, in the company colour or a freelancer's complement, always on there, off under
reduced motion and with `?notes=off`. The engine tells a robot's listeners about each note that will sound, past every
gate (`src/engine/noteEvents.ts`), and announces a step about 0.7 s ahead so a note runs in flat from the right and
leaves through the left-hand fan; the arrow runs audio to picture only. The world cloud built first (Gates 1 to 3, the
battery bands, the attention rules) was taken out again at Gate 4 on Crawford's call ("it doesn't make sense there lore
wise or visually"), and its machinery removed with it, so the cost gates are moot. The working bob is ±3 on a 2.4 s
cycle. The record: [intent](../../intent/robot-note-cloud.md), [spec](../../specs/ROBOT_NOTE_CLOUD.md) (§8 "As built",
§8.4 for Gate 4), [plan](../../tasks/ROBOT_NOTE_CLOUD.md), ROBOT_DESIGN.md ("The note cloud — the third overlay"),
AUDIO_SYSTEM.md ("Note events — audio to the picture"). Backlog
[84](../backlog.md#84-audio-keep-a-robot-playing-until-it-is-in-the-station) and
[85](../backlog.md#85-robots-fixed-width-boundary-lines-no-edit-flicker) came out of its spike and stay open. The
original request and its branch-one status follow.


Raised by Crawford on 2026-11-11 (item 10 of his list): an animation on each robot, in time with its melody, so a
player can tell which robot is playing which melody. Today nothing on a robot moves per note. The three audio dials
(the lights, each Mid's lit level, the body scale, ROBOT_DESIGN.md) follow settings, not notes. The selected robot's
glow (`Robot.tsx`) marks the selection, and Monitor Mode's Highlight only turns the other probes down. Nothing in `src/`
uses `Tone.Draw`.

Architecture it touches, so the interview comes first, then Crawford's approval (CLAUDE.md: ask before changing the
audio or animation architecture):

- **Visual Mapping guardrail.** Audio reaches the body only through the dials ROBOT_DESIGN.md lists, each continuous or
  animated, never a pop. A note pulse would be a new animated dial, written into that list.
- **Timing.** The pulse must land on the note's audible time (the note is scheduled `MIN_LEAD` ahead), with no
  `requestAnimationFrame` loop. The path from the transport to a GSAP tween is the design question: `Tone.Draw` or a
  semantic note event. Under Strict Separation the arrow only runs audio → visual, never the reverse.
- **Who pulses.** Only a robot that sounds: not one muted by the dock (`isDockMuted`), Mute or another robot's Solo,
  nor one capped by the Audio Load Budget.
- **Cost.** Up to twelve robots, several notes a second each, on the per-mover compositor layers (roadmap 53).
  Transform or opacity on a mover stays on the compositor. A fill or palette change repaints, and desktop underruns
  have been raster-bound before.

**Status (2026-11-13): Parts 0 to D built on `feature/note-cloud`; Part E follows.** A throwaway spike
(`spike/note-pulse`, local, never merges) settled the direction by eye: a pulse on the lit strips was rejected, and
what Crawford ended happy with is **the note cloud**, a small piano roll of each robot's own notes around it, in time
with the sound. [Intent](../../intent/robot-note-cloud.md), [spec](../../specs/ROBOT_NOTE_CLOUD.md) (its §8 "As built"),
[plan](../../tasks/ROBOT_NOTE_CLOUD.md). What the first branch ships:

- **Note events** (`src/engine/noteEvents.ts`): `triggerWithCap` tells a robot's listeners about each note that will
  sound, past every gate (mute, Solo, dock mute, the Audio Load Budget, the polyphony cap), so only a robot that
  sounds is drawn. The arrow runs audio to picture only (AUDIO_SYSTEM.md, "Note events — audio to the picture").
- **The cloud** round every sounding robot in the world and on the desk's detail avatar (where it spills past the
  gem's box): a bar per note at its pitch height, half in front of the body and half behind, crossing right to left
  in 5 s, white while it sounds, in the company colour or a freelancer's complement. A robot places notes only while
  its battery is in an on band (10–28, 38–55, 65–73, 83–100 %), or once woken by the pointer or a selection until it
  is next in its station. The robot under the pointer, followed, selected, soloed or highlighted shows its cloud
  undimmed, and the marker frames the robot under the pointer. None under reduced motion; `?notes=off` for the cost
  A/B (ROBOT_DESIGN.md, "The note cloud — the third overlay").
- **The Visual Mapping guardrail** names the cloud as the third overlay, in Crawford's words (CLAUDE.md).
- **The working bob** at ±3 on a 2.4 s cycle.

Gates 1 to 3 passed 2026-11-13 (cost: +3.7 % main thread with the bands, measured on the odd tens before he re-drew
them). **Next:** the branch's Checkpoint: Complete and Crawford's PR; then **Part E**, the engine announcing notes
early so they run in through the right-hand fan (plan Tasks 31 to 37, branch `feature/note-cloud-early-notes`, Gate
4). Not archived until Part E is done. Plan.md Stage 4.

## 82. Audio: The Chord Cycle Does Not Always Change on Time

**Closed** 2026-11-12 (`docs/backlog-82-measurement-plan`, merged PR #635; one music clock, Tasks 1–12, `997b7a03`..
`a7d53c13`). The measure, the melody step and the chord palette are read from the transport at each callback's own
time; the harmony repeat and every running count are gone. Ten power-ons played the same chord sequence, every chord
change on the bar, and Crawford heard the downbeat where the chords change. Backlog
[83](#83-audio-melody-steps-may-sit-one-sixteenth-off-the-measure), folded into the same fix, closed the same day after
his pause-and-resume listen. The original request follows.

Found on 2026-11-12 during backlog [79](#79-robots-move-in-time-with-their-own-melody)'s spike, and asked for by
Crawford the same day: "definitely sounds like it's something worth investigating to make sure we're not running
redundant code." By ear he does not hear mixed-chord outcomes, so nothing sounds broken. An investigation: measure
first, and build only what the cause calls for.

**What is intended.** Each harmony palette holds for two measures ([HARMONY_SYSTEM.md](../../HARMONY_SYSTEM.md)). A `2m`
repeat in `src/engine/harmonySystem.ts` (`scheduleHarmonyCycle`) sets the palette to entry
`floor(getCurrentMeasure() / 2) % 12`, derived fresh each time it fires.

**What was seen.** The spike made the engine announce each note a few steps before it plays and checked every
announcement against the note then triggered, logging the palette in force (`getAvailableNotes()`) and BeatClock's
measure (`getCurrentMeasure()`) at a miss. One build, one pinned world (`?seed=charlie&x=200&y=-30`), headless Chrome,
a fresh power-on each run:

- One run kept time: measures 2–3 on entry 1, 4–5 on entry 2, 6–7 on entry 3, measure 8 on entry 4.
- One run fell behind: entry 3 in force at measure 6 and still at measure 8, where entry 4 is intended.
- One run fell behind and caught up: entry 2 still in force as measure 8 began (so through measures 6–7, where
  entry 3 is intended), entry 4 from measure 8 on, so entry 3 was never played; then entry 5 at measure 12, where
  entry 6 is intended.
- A forecast that assumed "on time" got 138 of 372 pitches wrong in one run. One that assumed "one entry behind" got
  88 of 366 wrong in a second run and 187 of 363 wrong in a third. Neither assumption holds from one power-on to the
  next.

The log held misses only, about fifty seconds a run, so this was a sighting, not a survey. It is now reproduced on
`main` (below).

**What was measured, 2026-11-12** ([plan](../../tasks/CHORD_CYCLE_TIMING.md), Tables 1 and 2 and Findings). A probe
wrapped the transport's `scheduleRepeat` before the Power click and logged every firing of the four repeats on it
(BeatClock's `16n` tick, the melody's `16n` tick, the harmony cycle's `2m` repeat, the swells' `16n` tick), with the
app's measure and palette before and after each callback. Ten power-ons of the same world, twelve harmony firings each,
71 BPM:

- **102 of 120 firings were late, 18 on time.** Every late firing read the boundary's measure minus one and set the
  entry already in force; every on-time one read the boundary's measure. Five power-ons were one entry late throughout
  (entries 0 to 11 where 1 to 11 then 0 are intended); the other five were mixed, each with a different sequence, and a
  mixed run skips entries (one never played entries 3, 6 or 9).
- **The cause: BeatClock's tick never sits on the bar.** It passes no start time, so Tone starts it where the transport
  has reached when `AudioEngine.start` registers it, 37 to 83 ticks after `transport.start()` (about 95 to 215 ms of
  awaits). It then runs 1.4 to 41.9 ticks after every sixteenth, a different amount on each power-on, and its measure
  turns that far after each bar. The harmony repeat is given its start and fires on the bar, so it reads the measure
  that has just ended.
- **On time only when BeatClock read ahead.** BeatClock parses `transport.position`, which is the position at Tone's
  "now", not at the tick's own time. When its last tick before a boundary ran in a clock pass that already reached past
  the boundary, it read the new measure early and that firing was on time. That held for all 18 on-time firings and for
  none of the late ones. How far a pass reaches changes from firing to firing (up to about 70 ms), so the closer
  BeatClock's tick sits before the bar, the more firings are on time: 17 of 48 at 27 ms before it, 1 of 48 at 45 to
  58 ms, none at 206 ms.
- **The first suspicion did not apply.** No BeatClock tick fell on a boundary in any run, so the order of two callbacks
  on a shared tick (the harmony's first, by Tone's source) never came into play. It could only on a power-on whose
  BeatClock start lands on a multiple of 48 ticks.

**Status:** measured 2026-11-12; the cause is established. Gate A passed the same day. Crawford's decision: both
candidates, as one fix in which nothing keeps its own count and everything reads the music clock (the chord when a
note is scheduled, the measure at each tick's own time with the tick started on the bar, the melody's step). Why:
tracking measures, moving the player to a measure and changing chord palettes are coming soon, and each breaks on a
count that does not know the transport moved. It changes the timing path CLAUDE.md asks about before changing, so an
interview and a spec come first, starting from those features. Backlog
[83](#83-audio-melody-steps-may-sit-one-sixteenth-off-the-measure) is folded in.

**Fixed, 2026-11-12** ([spec](../../specs/ONE_MUSIC_CLOCK.md), [plan](../../tasks/ONE_MUSIC_CLOCK.md); intent
[one-music-clock.md](../../intent/one-music-clock.md)), merged via PR #635. The
measure, the step, the palette and the roll position are read from the transport's tick count at each callback's own
time (`positionAt` in `beatClock.ts`); the palette is `paletteForMeasure(measure)`; the harmony repeat, its state and
`resetHarmony` are gone; BeatClock's tick and the melody tick start on the grid (a start of `0`) and are registered,
with the store's tempo set, before the transport starts. **Measured the same day** (the plan's Task 10 table): ten
power-ons of the same world on a dev server, about 88 s each (to measure 25, step 1), 406 or 407 firings of each `16n`
tick per run, 71 BPM:

- Every BeatClock, melody and swell firing sat on a multiple of 48 ticks (the largest offset in any run about 1e-11
  ticks, float error), consecutive firings 48 ticks apart throughout. The first firing of both `16n` ticks was tick 0 in
  every run (37 to 83 ticks after the start before, by the old registration).
- BeatClock turned the measure 25 times a run, each on the bar's own firing, never before or after it.
- Every step 1 (26 a run, 260 in all) played entry `floor(measure / 2) % 12`: no late chord change. The entries at step
  1 read `0 0 1 1 2 2 … 11 11 0 0` in every run.
- The (measure, step, palette entry) sequence for measures 0 to 24, 400 steps, was identical in all ten runs. Before,
  ten power-ons gave six different chord sequences.
- Three repeats registered (BeatClock's, the melody's, the swells'); no harmony repeat, nothing unexpected. The console
  showed one Tone warning per power-on, the same one seen before the change, and nothing else.

By ear (the plan's Checkpoint: By ear): Crawford, on a Click Track robot sounding alone, heard the downbeat where the
chords change: "I think we're good." Not measured: a pause and resume (see 83), and a tempo change mid-run.

**To find out:**

- ~~Reproduce on `main`.~~ **Answered:** reproduced, above.
- ~~Whether a replay from power-on gives the same chords each time.~~ **Answered: no.** The entry at each boundary
  depends on how far one clock pass reached, not on the seed. Velocity and Humanize are drawn so that a replay repeats
  (`computeNoteVelocitySeeded` and `humanizeOffsetFor`, `src/engine/AudioEngine.ts`); the chord cycle does not.
- ~~Whether the third repeat is needed at all (Crawford's "redundant code").~~ **Answered at Gate A: no.** The palette
  becomes a pure function of the transport position at a note's own time, and BeatClock's measure is taken from each
  tick's own time with its tick started on the bar. Both, as one fix (Status).
- What depends on the answer: backlog [7](../backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter) (tagged
  progressions and a seeded mood chain, which need the cycle to be predictable), and backlog 79's early announcements,
  which today read the cycle's lag off the palette in force instead of assuming it. **Open:** each is re-read against
  the spec once it is written. Backlog 7's "What exists" now names `paletteForMeasure`; 79 is re-read against the
  spec when work on it resumes.

Related: backlog [83](#83-audio-melody-steps-may-sit-one-sixteenth-off-the-measure), seen in the same log.

## 83. Audio: Melody Steps May Sit One Sixteenth off the Measure

**Closed** 2026-11-12 (with backlog [82](#82-audio-the-chord-cycle-does-not-always-change-on-time), merged PR #635; one
music clock). The melody's step is read from the transport at each tick's own time, and the tick starts on the grid at
tick 0, so step 1 falls on the bar: measured in ten power-ons and heard on the Click Track. The last open question, a
pause and resume, was checked by Crawford's ear the same day after the merge ("it sounded fine"); it was not measured.
The original request follows.

Found on 2026-11-12 in the same log as backlog [82](#82-audio-the-chord-cycle-does-not-always-change-on-time), and
asked for by Crawford the same day. He cannot tell by ear where the audio's downbeat is, so listening has neither
confirmed nor ruled it out. An investigation: measure first.

**What is intended.** A melody is sixteen steps, one measure ([MELODY_SYSTEM.md](../../MELODY_SYSTEM.md)). The melody's
`16n` tick plays step `(stepCounter % 16) + 1` (`startMelodyPlayback`, `src/engine/AudioEngine.ts`), and `stepCounter`
starts at 0, so step 1 is meant to fall on a measure's first sixteenth.

**What was seen.** In the log, taken at note triggers, a measure's steps 1 to 15 carried BeatClock's measure *m* and
step 16 carried *m + 1*: by the time step 16 is triggered, BeatClock has already moved to the next measure. Read at
face value, step 16 sounds on a measure's first sixteenth and step 1 on its second. Seen in each of the three runs
whose log held a step 16, on the spike branch only.

**Two readings, and the log cannot tell them apart:**

- The melody loop runs one sixteenth late: its first tick, at transport time 0, never fires, so `stepCounter` 0 lands
  on the second sixteenth.
- BeatClock turns the measure over one sixteenth early: it reads `transport.position` inside a callback that runs a
  lookahead ahead of the time it is scheduled for.

**Why it matters.** If the melody is late, a chord change lands on step 16 and not on step 1, and the motif accent on
a repeat window's first event (MELODY_SYSTEM.md's "downbeat") is a sixteenth after the bar. If BeatClock is early,
everything that runs on the measure (the docking tick, the swells, the harmony cycle of backlog 82) acts a sixteenth
before the bar. Either way two clocks that should agree do not.

**Measured in backlog 82's runs, 2026-11-12** ([plan](../../tasks/CHORD_CYCLE_TIMING.md), Findings, "Backlog 83"). Ten
power-ons of one world on `main`, every melody tick's and BeatClock tick's own tick count logged:

- **The melody loop is late.** Step 1 is the melody tick's first firing, and that tick passes no start time, so it
  starts where the transport has reached when it is registered. Step 1 sat 0.87 to 1.87 sixteenths after the bar (185
  to 396 ms at 71 BPM), the same in every measure of a power-on and different on the next.
- **BeatClock is early only now and then, by a fraction of a sixteenth.** It shares the melody's offset and turns the
  measure 1.3 to 41.9 ticks after the bar (a sixteenth is 48), or 6 to 13 ticks before it when it reads
  `transport.position` ahead (backlog 82).
- **The sighting reproduces.** In seven runs step 16 fell in the next bar and carried the next measure in every cycle.
  In three it sat 6 ticks before the bar and carried the next measure only when BeatClock read ahead (10 or 11 of 24).
- **A first firing was lost** by both ticks in two runs and by BeatClock alone in one, where BeatClock then runs about
  a tick before the melody tick in each sixteenth.

**To find out:**

- ~~Reproduce on `main` and see which of the two clocks is off the sixteenth it claims.~~ **Answered:** both run off
  the sixteenth by the same per-power-on offset; the melody's step numbering is what puts step 1 late (above).
- ~~Hear it.~~ **Heard, 2026-11-12, after 82's fix** (below).
- ~~Whether the first melody tick is lost at power-on.~~ **Answered:** in two of ten before the fix; in none of ten
  after it (below).
- ~~Whether a pause and resume keeps the steps on the bar.~~ **Heard, 2026-11-12, after the merge:** Crawford powered
  off and on again and "it sounded fine". Not measured.
- ~~Whether 82's fix covers this.~~ **Answered at 82's Gate A, 2026-11-12: yes.** This item is folded into 82's fix,
  in which the melody's step is read from the music clock and not counted.

**Fixed for a power-on, 2026-11-12** ([plan](../../tasks/ONE_MUSIC_CLOCK.md), Task 10 and Checkpoint: By ear). With
82's fix the melody tick starts on the grid, is registered before the transport starts, and reads its step from its
own time (`positionAt(time).step`); `stepCounter` is gone. Measured in 82's ten power-ons after the fix:

- The melody tick's first firing was tick 0, measure 0, step 1, in every run (before: 0.87 to 1.87 sixteenths after
  the bar). Every firing sat on a multiple of 48 ticks, consecutive firings 48 apart: no firing lost.
- At all 4,064 steps the position the engine was handed (sixteenth, measure, step) equalled the one worked out from
  the step's own tick count, and BeatClock's measure equalled the step's: step 16 now carries its own measure.

Heard: the Click Track, now a sixteenth on every step with each beat on its own note and step 1 an octave up (the
plan's Task 10c, for this listen), on one robot sounding alone after a hard reload. Crawford first heard a sixteenth's
difference, then put it down to the accented downbeat: "I think we're good." Nothing else was heard off. His call then:
83 stays open until a pause and resume is checked; his listen across one after the merge closed it.
