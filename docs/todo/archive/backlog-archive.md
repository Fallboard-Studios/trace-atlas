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

## 32. Audio: Oscillator Leak Fix — Disconnecting the Dead Note's Params

**Closed** 2026-10-26 (Crawford; `fix/oscillator-leak`, merged via PR #577, `4e0cb174`). Every note's two param connections are disconnected when it ends: `patchOscillatorEndedDisconnect` in `src/engine/tonePatches.ts`, applied at boot by `src/engine/audioContextSetup.ts` (`oscillatorLeakPatched`), documented in [AUDIO_SYSTEM.md](../../AUDIO_SYSTEM.md), "Tone patch: the per-note oscillator leak"; proof in [PERFORMANCE.md](../../PERFORMANCE.md), "Oscillator Leak Fix — the T3 proof run". The Tone upgrade that deletes the patch waits on npm and is its own item: [34](../backlog.md#34-audio-upgrade-tone-once-the-leak-fix-is-latest-then-delete-the-patch). The original request follows.

**Found 2026-10-23** by backlog [27](../backlog.md#27-audio-phone-playback-underruns-at-light-load-main-included)'s desktop step 1
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
