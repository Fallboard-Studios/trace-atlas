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
