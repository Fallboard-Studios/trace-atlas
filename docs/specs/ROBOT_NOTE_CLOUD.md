# Phase Spec: The Note Cloud — a robot's melody drawn as notes around it

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests, the engine: `npx vitest run src/engine/noteEvents.test.ts src/engine/AudioEngine.test.ts`
> - Focused tests, the cloud: `npx vitest run src/components/robot/notes src/systems/robotAttention.test.ts src/components/robot/Robot.test.tsx src/components/robot/RobotBody.test.tsx src/systems/workLoop.test.ts src/components/panels/screen/worldView/FollowedRobotMarker.test.tsx`
> - Focused tests, the avatar: `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`
> - Cost: `npm run perf:idle -- --only stock --throttle 1` (cloud off against on, §5.3)

**Status:** spec written 2026-11-12 from the intent
[docs/intent/robot-note-cloud.md](../intent/robot-note-cloud.md), whose twelve "To confirm" points Crawford answered
the same day (§7.1 records each answer), with his answers to this spec's first open questions folded in (§7.1,
second table). Paused that day at Crawford's word until backlog 82 and 83 were finished. **Picked up again
2026-11-12:** both closed with the one music clock (PR #635), and §1.1, §1.2 and §1.9 have been re-read against the
engine as it now is. §1.1 gained the music clock and §1.9 is rewritten on it. Asked whether Part E should now move
into the first branch, Crawford kept it last (§7.1). **Planned 2026-11-12:**
[docs/tasks/ROBOT_NOTE_CLOUD.md](../tasks/ROBOT_NOTE_CLOUD.md), 37 tasks, awaiting his read; nothing built. Backlog
[79](../todo/backlog.md#79-robots-move-in-time-with-their-own-melody), plan.md Stage 4.

**Who it is for:** a player watching the world, on the desk shell and on a phone, who wants to see which robot is
playing which sound.

**The reference for the look** is the spike branch `spike/note-pulse` (local, fifteen commits, never merges) at
`?trail=all`, whose defaults are the settings Crawford approved. None of its code is carried over as it stands: it
has no tests, registers no timeline, and inserts its layers into React's mover by hand. Where this spec says "as the
spike draws it", the spike is the picture and this spec is the rule.

---

## 0. Scope check

One capability (a robot's notes drawn around it), in six parts that are each testable alone. One spec, because every
part reads the same note events and the same numbers. Part E leans on what backlog 82 and 83 fixed (the one music
clock, §1.1), and both are closed.

| Part | Responsibility | Depends on |
|---|---|---|
| 0 — the bob | The working bob's cycle doubles (§1.11). Unrelated to the cloud; Crawford asked for it "while we are in there" | — |
| A — note events | The engine tells listeners about each note it triggers (§1.2) | — |
| B — the cloud | The piano roll around a world robot: belts, rows, colours, timing (§1.3–§1.6) | A |
| C — attention | Dim and full strength, the battery fade, waking, the marker on a pointed-at robot (§1.7) | B |
| D — the avatar | The same cloud on the robot screen's detail avatar (§1.8) | B |
| E — early announcements | The engine announces a note before its trigger, so it enters at the roll's edge (§1.9) | A, B (backlog 82 and 83, closed) |

Build order: 0, A, B, C, D, then E. Parts 0 to D are one branch and merge when Gate 3 passes; Part E is its own
branch straight after (§6). Crawford agreed this while Part E still had to wait for 82 and 83, and kept it once
nothing made it wait (2026-11-12, §7.1): Part E is last.

---

## 1. Overview & Claude Explanation

### 1.1 Today

- **Nothing on a robot moves per note.** The three audio dials (the lights, each Mid's lit level, the body scale)
  follow settings. `useStripFlicker` plays on an edit, not on a note.
- **One music clock** (backlog 82 and 83, PR #635). A transport callback's own `time` says where it sits in the
  music: `positionAt(time)` (`src/engine/beatClock.ts`) gives the sixteenth since the transport's tick 0, the measure
  and the melody step (1 to 16). The chord palette is a pure function of the measure, `paletteForMeasure(measure)`
  (`src/engine/harmonySystem.ts`); nothing is remembered and nothing lags. The melody's 16n tick starts on the grid
  at tick 0, so step 1 is on the bar. Velocity and Humanize are rolled from the robot's seed and the sixteenth.
- **Where a note is known to sound.** The 16n transport tick in `startMelodyPlayback` (`src/engine/AudioEngine.ts`)
  calls `processMelodyStep(at, time)` with that position, which calls `scheduleNote`, which calls `triggerWithCap`.
  `triggerWithCap` is the one
  place where Mute, Solo, the dock (`isRobotAudible`), the Audio Load budget (`soundingRobots`), the polyphony cap,
  the missing-voice check and the note-string check have all been applied. Past
  `synth.triggerAttackRelease(...)` the note will sound.
- **When it sounds.** The tick's callback runs the transport's lookahead ahead of its `time`; the note is scheduled
  at `time + MIN_LEAD` (0.1 s) plus the Humanize offset (±20 ms at most). The output's own latency comes on top. So a
  trigger runs about a fifth of a second before the note is heard.
- **A world robot is a mover** (`src/components/robot/Robot.tsx`): a `div.mover.mover--robot`, a compositor layer of
  its own, holding one `<svg class="mover__svg">` the size of the gem canvas, holding `g.robot > g.robot__row >
  RobotBody`. GSAP owns the mover's transform (the swim's x, y and tilt). The work loop
  (`src/systems/workLoop.ts`, `placeRow` and `easeRowWith`) owns the back row's scale on `.robot__row`
  (`BACK_LAYER_SCALE`, 0.75), eased over a swim. `.mover` has `pointer-events: none`; only `g.robot` takes clicks.
- **The detail avatar** (`AvatarGem` in `src/components/panels/screen/screens/RobotScreen.tsx`) is a bare
  `<svg class="robot-screen__gem">` framed by `gemMotionViewBox`, holding `RobotBody ignoreDaylight ignoreScale
  motion="avatar"`. The desk column draws it 100% wide and 300 px tall; the phone band draws it 72 × 58 px.
- **World timelines** are registered with `setTimeline(id, timeline, 'world')` (`src/animation/timelineMap.ts`) and
  pause as a set on a power-off (`pauseWorldTimelines`).
- **The marker** (`FollowedRobotMarker.tsx`) frames the robot the Deck camera follows
  (`getFollowedRobotId` / `subscribeFollowedRobot`, `src/animation/deckCamera.ts`). The camera only follows where the
  world is wider than the window, so never on a desktop.
- **Reduced motion** is `prefersReducedMotion()` (`src/utils/reducedMotion.ts`), read by every motion hook.

### 1.2 Note events (Part A)

- **A plain listener registry, keyed by robot id:** `src/engine/noteEvents.ts`. It imports nothing from
  `AudioEngine.ts` or Tone. A listener is handed what a note is and never the engine, so the arrow runs audio to
  visual only and Strict Separation stands as written.
- **Not a store.** Twelve robots on sixteenths is about a hundred events a second; none of it goes through Zustand or
  React.
- **The event** is four plain facts: `note` (the pitch as triggered, e.g. `C4`), `duration` (the sounding length in
  seconds, after articulation), `at` (the note's scheduled start on the audio clock, in seconds, so one note can be
  compared with the next; never used to schedule anything) and `lead` (seconds from now until the note leaves the
  speakers: `at` less `Tone.now()`, plus the context's output latency). No velocity: nothing draws it.
- **Emitted in `triggerWithCap`, after the trigger succeeds,** and nowhere else. A note refused by Mute, another
  robot's Solo, the dock, the budget, the polyphony cap, a missing voice or a bad note string emits nothing, so "only
  what sounds is drawn" needs no second rule.
- **Free when nobody listens.** The engine asks `hasRobotNoteListener(robotId)` before it builds an event.
- **A listener cannot cost a note.** `emitRobotNote` catches a throwing listener; `triggerWithCap` still returns
  true.
- **More than one listener per robot** (the world's cloud and the avatar's can both be mounted).

### 1.3 The cloud (Part B): what is drawn

- **The roll.** A box centred on the gem canvas centre, 2.5 times the box the robot's parts fill (backing, Mids, Top
  and orbiters, at the body's scale). Nothing marks its edges.
- **A note is a solid rounded bar.** Its length is the note's sounding length at the roll's speed (a note crosses the
  roll in 5 s), never shorter than the bar is thick and never longer than 80% of the roll's width. Its thickness is a
  fourteenth of the roll's height and never under 4 CSS pixels on screen: where the stage is drawn small (a phone) or
  the robot is in the back row, the bar grows in scene units to hold the 4 pixels.
- **Its row is its pitch** within that robot's own range so far: the range is at least an octave, centred on the
  middle of the lowest and highest pitch the robot has played, so the first note sits at mid-height and a two-note
  melody does not leap the whole roll.
- **Right to left.** Both layers ride one belt speed.
- **Half in front, half behind.** C, D, E, F♯, G♯ and A♯ (and their flat spellings) cross in front of the body; the
  other six cross behind it.
- **Rows run straight through the middle and fan at the edges.** A row holds its pitch height with a wave of 1.5% of
  the roll's height until 55% of the way from the centre to either edge. Past that the rows spread apart (by up to
  0.6 of their middle spread at the edge), the wave grows to five times, and a bar tilts to its row's slope.
- **Colour.** A robot in a company wears the company's colour. A freelancer's notes wear the complement of its
  identity hue (the hue plus 180°, at 100% saturation and 70% lightness).
- **A repeated note is not drawn twice.** A repeat is the same pitch **and the same sounding length** as the note
  before it, **with no rest between them** (Crawford, 2026-11-12, both). In a run of identical notes the first,
  third, fifth are drawn and the even-numbered ones are not. The run is counted on every note the robot plays, drawn
  or not, so which are dropped follows the melody and not what happened to be on screen.
- **A rest breaks the run.** A rest is a silence: the second note starts after the first has stopped sounding, by
  more than Humanize can account for (§7.2 A4). It is judged by sound, so a gap in the rhythm, a note the Rests
  slider cut short and a staccato note all count, and the note after any of them is drawn. The rule now thins only
  identical notes that run straight into each other. The spike's pitch-only rule dropped 88 of 373 notes in one
  probe; what this rule drops has not been measured and will be fewer (§7.3 Q3).

### 1.4 The cloud: in time with the sound

- **"Now" is 22.5% of the roll's width in from the right edge**, where the right-hand fan ends and the rows run
  straight. A note's leading (left) end reaches it as the note leaves the speakers: the bar is placed `lead` seconds
  of travel to the right of "now".
- **It turns white as it sounds** (`#fffbe6`, over 0.05 s), stays white for the note's length, then cools to its own
  colour over 0.25 s.
- **It fades in before it sounds and out as it leaves**, through a fixed mask on the layer, not a tween per note:
  transparent at the left edge, the dim level from 30% of the width, full strength from 14% of the width left of
  "now" up to "now", and transparent again to the right of where a note is first known.
- **Until Part E is built, a note is first known about a fifth of a second before it sounds,** so it appears about
  4% of the roll's width to the right of "now" and the outer right-hand fan carries nothing. This is the one way the
  first build differs from the approved look, and Crawford chose it (§7.1, point 2). With Part E a note enters at the
  right edge and fades in across the whole fan, a little over a second at these numbers.
- **Only what sounds is drawn** (§1.2). A robot that goes quiet stops gaining notes; the ones already crossing finish
  their crossing.
- **A hidden tab places nothing.** GSAP's ticker stops with the page; a note event that arrives while
  `document.hidden` is dropped. A note event that arrives while the world is not `running` is dropped too.

### 1.5 The cloud: how it is mounted

- **React renders the layers; the hook fills them.** `Robot.tsx` renders two note layers as children of the mover,
  one before the `<svg>` and one after: a wrapper (the roll's box, masked, `pointer-events: none`, `aria-hidden`)
  holding a belt. z-index −1 and 1 inside the mover's own stacking context put them behind and in front of the body.
  Their note elements are appended by the hook through refs; React renders no children there and never reconciles
  them. Nothing is inserted into the mover by hand.
- **The back row.** The work loop's row-scale writes (`placeRow`, `easeRowWith`) take the two note layers as targets
  beside `.robot__row`, about the same centre, in the same tween. The cloud eases with the body on a row switch and
  never pops.
- **An edit never pops the cloud.** A company-colour or identity-colour change colours the notes placed after it. A
  body-scale change (octave range or attack) re-sizes the roll under a fade of the layers out and back in
  (§7.2 A6).
- **A layer switch's dissolve copy** (`<use href="#world-robot-…">`) copies the body only. The cloud stays with the
  mover. Whether that reads is on the eye gate's list (§5.4).

### 1.6 The cloud: cost is part of the design

The spike's first cut ran a tween for every moving part of every note and dragged the page. What fixed it is kept,
and what the approved settings still cost is taken back here.

- **Notes ride a belt.** Each layer's belt is a compositor layer of its own inside the mover, and one linear tween
  per robot moves both belts. The robot's own layer is never repainted for a note.
- **A note is placed once:** two plain `div`s (the bar and its white copy), positioned on the belt.
- **No tween per note, no timer per note.** The belt tween's `onUpdate` makes one pass a frame over that robot's
  live notes. The pass settles each note on its row, sets the white copy's opacity from the belt's own time, and
  removes a note that has left the roll. So a note's whole life hangs off one registered timeline, and a power-off
  pause freezes it mid-flight.
- **A write only when the value changes.** The pass quantises a note's transform and skips the style write when the
  quantised value is the one already written. Through the straight middle of the roll, most frames write nothing.
  The quantum is pinned by the plan from a look, so the motion still reads as smooth (§7.2 A7). This is where the
  spike's main-thread cost at the approved settings (about 19% over cloud-off) is to be taken back; §5.3 measures it.
- **A silent robot costs no layer.** While a robot has no live notes its wrappers are `display: none`, its belts
  carry no `will-change`, and its belt tween is paused.
- **No layout read per note.** The stage's scale and the row's scale, which the 4-pixel floor needs, are read when
  they change, not when a note arrives.
- **Two registered timelines per robot per context,** both `'world'` scope and both killed on unmount: the belt
  (`note-belt-<context>-<robotId>`) and the strength fade (`note-strength-<context>-<robotId>`, §1.7). No
  `gsap.delayedCall`, `setTimeout`, `requestAnimationFrame` or `Tone.Draw` anywhere.
- **A switch for the A/B.** `?notes=off` (beside `?debug` and `?latency=` in `src/utils/debugParams.ts`) draws no
  cloud and registers no listener, so cloud-off and cloud-on are measured from one build (§7.2 A8).

### 1.7 Attention (Part C)

Two separate things set how strongly a robot's cloud shows. **Dim** is how faint a note becomes once it has sounded.
**Strength** is the opacity of the whole cloud.

- **Bright now, faint after.** For a robot nobody has turned to, a note is at full strength where it sounds and
  falls to 0.35 as it moves on. The dimming is the layer's mask, so overlapping notes look like one shape.
- **The robot the player turns to is undimmed.** A robot is *singled out* while it is under the pointer, or the Deck
  camera is following it, or it is selected, soloed or highlighted. Its whole cloud is at full strength (dim = 1).
  One custom property on the mover (`--note-dim`), read by both masks; a change rebuilds nothing.
- **The battery thins the population.** Strength is 1 down to 50% battery, then falls in a straight line to 0 at a
  flat battery (Crawford, 2026-11-12: zero at flat, not at the recall line). A robot recalled at 10% heads home at a
  fifth strength. At strength 0 no notes are placed.
- **Attention brings them back.** Pointing at a robot or selecting it *wakes* its notes: strength 1 whatever the
  battery, and it stays there after the pointer leaves or the selection moves, until the robot is next in its station
  (`activity === 'charging'`). The Deck camera following a robot singles it out but does not wake it.
- **Strength changes are eased, never a step:** a rise over 0.3 s, a fall over 1 s (the battery steps once a
  measure).
- **Touch.** A tap selects, which singles out and wakes. On a phone the robot the Deck camera follows is singled out
  while it is followed. Nothing else is added for touch (Crawford, 2026-11-12).
- **Keyboard.** Selecting a robot from the roster singles it out and wakes it like any other selection. Nothing new
  takes focus.
- **The marker frames the robot under the pointer.** `FollowedRobotMarker` shows the pointed-at robot when there is
  one, else the Deck camera's followed robot, else nothing (Crawford, 2026-11-12: keep it, as seen). So on a desktop
  the marker appears on hover, where it never appeared before.
- **Where the state lives.** Which robot is under the pointer and which robots are woken are module state in
  `src/systems/robotAttention.ts`, read through `useSyncExternalStore` by the world's bodies and the marker only.
  Never Zustand. A robot's own selection and mode it already reads from the stores.
- **Nothing is heard differently.** No ducking, no tour (Crawford, 2026-11-12). The spike's `&spot` and `&tour` stay
  on the spike branch.

### 1.8 The detail avatar (Part D)

Crawford, 2026-11-12: the cloud shows in the world **and on the detail avatar**. The cards and roster tiles show
nothing.

- **The same notes.** The avatar's cloud reads the same events and the same per-robot model (§4) as the world's, so
  a note has the same row, the same layer and the same colour in both, and the repeat rule drops the same notes.
- **Always full strength, undimmed.** The player has turned to this robot by opening its screen. No battery fade.
- **Only what sounds.** A muted or docked robot's avatar shows no notes, as in the world.
- **Mounting.** `AvatarGem` gains a positioned box that takes the avatar's present size and holds the behind layer,
  the `<svg>` and the front layer. The avatar's box does not change size (Crawford's rule: a control holds its
  size).
- **The roll keeps its size and the box cuts it off** (Crawford, 2026-11-12: "the note animation can be cut off as
  it leaves the viewing area"). The robot is drawn as it is today, the roll is 2.5 times the robot as in the world,
  and the avatar's box clips whatever falls outside it. No shrinking, and no second set of numbers.
- **What the clip takes, to be seen at Gate 3.** The robot is fitted to its box, so the box shows roughly the middle
  two fifths of the roll in the direction the robot fits tightest. Two things follow. "Now" sits about a fifth of
  the robot's width outside its right edge, so where the box has no room there a note is first seen after it has
  sounded, already cooling, and the white flash is off the edge. And the rows for a robot's highest and lowest
  pitches lie above and below the box, so those notes are not seen at all. If either reads badly, the remedy is an
  avatar-only "now" or roll size, and that is Crawford's call at the gate (§7.3 Q1).
- **The desk column's avatar shows the cloud; the phone band's 72 × 58 px gem does not** (default, §7.3 Q1).
- **The 4-pixel floor** uses the avatar's own scale (rendered pixels per viewBox unit), not the stage's.

### 1.9 Early announcements (Part E; approved)

Crawford approved this engine interface on 2026-11-12, to be built once backlog
[82](../todo/archive/backlog-archive.md#82-audio-the-chord-cycle-does-not-always-change-on-time) and
[83](../todo/archive/backlog-archive.md#83-audio-melody-steps-may-sit-one-sixteenth-off-the-measure) were closed.
Both closed the same day (PR #635), and this section is rewritten on what they shipped.

- **A listener asks for notes earlier.** `setNotePreviewSeconds(seconds)` on `noteEvents.ts`. The cloud asks for the
  run-in from the roll's right edge to "now" (22.5% of 5 s) less the lead every note already has: about 0.9 s.
- **The engine then announces a step ahead of its trigger.** At each 16n tick it announces the notes of a later
  step: the first whole sixteenth that is at least the asked-for time on. A note announced early is not emitted
  again at its trigger. The event's shape does not change; only `lead` is longer, and it moves with the tempo (a
  whole number of sixteenths, never less than what was asked for).
- **A forecast reads what the trigger will read.** The later step's place in the music is `positionAt` of its own
  time, its pitch is `paletteForMeasure` of that measure with the event's note index and octave, its length is the
  event's after articulation, and its Humanize offset is the same roll at that sixteenth (§1.1). The melody comes
  from `stepRegistry`, and `triggerWithCap`'s gates are asked as they stand now, bar the polyphony cap. The plan
  takes these reads out of `processMelodyStep` into one place both the trigger and the forecast call, so the two
  cannot drift.
- **So with nothing changed inside the lead, the forecast is the note.** The spike could not say that: it measured
  330 pitches right, 23 wrong and 13 notes not announced, then 352, 1 and 13, and the wrong ones followed a chord
  change, because the palette then turned late and the steps sat off the bar. Both are gone, and so are the spike's
  two workarounds (the measure read off the transport, the cycle's lag as observed).
- **What a forecast may still get wrong, and is accepted:** a robot muted, soloed away, docked or stood by inside the
  lead keeps drawing notes it will not play, for at most the lead; a robot that has just started sounding shows no
  notes for the lead; a tempo move or a melody edit inside the lead draws the old note; a note the polyphony cap
  refuses at its trigger was drawn anyway.
- **No forecast check ships.** The spike's `window.__noteForecast` counter is a probe for Part E's own run (§5.3),
  behind `?debug` or not at all (the plan decides).

### 1.10 What a player meets

- Every sounding robot sits in a faint cloud of its notes: a bright blip where a note sounds, a ghost of what it just
  played drifting left. The rhythm reads in the spacing and the melody in the heights.
- Point at a robot, or select it: its cloud comes to full strength, the marker frames it, and its notes stay woken
  until it is back in its station.
- A robot low on battery shows fainter notes, and none at a flat battery, unless the player woke them.
- Open a robot's screen on the desk: its avatar sits in the same cloud at full strength.
- Mute a robot, or let it dock: its notes stop arriving and the last ones finish crossing.
- Power off: every cloud freezes. Power on: they carry on.
- With reduced motion set: no cloud anywhere (Crawford, 2026-11-12).

### 1.11 The bob (Part 0)

Crawford, 2026-11-12: "cut the idle bob in half in velocity and distance", then, asked which he meant: also double
the cycle. `BOB_PX` is already 3 (82b11962). `BOB_CYCLE_SECONDS` goes from 1.2 to 2.4, so a working robot moves ±3
units on a 2.4 s cycle: half as far, and a quarter of the speed it had at ±6 on 1.2 s. `buildJobTimeline.ts` fits
whole cycles to the job (`Math.round(duration / BOB_CYCLE_SECONDS)`); jobs last 6 to 10 s, so a job now holds two to
four cycles where its comment says five or more, and the comment is corrected. The waiting robot's one bob
(`workLoop.ts` `wait`) is timed by `WAIT_RETRY_SECONDS` and is untouched.

### 1.12 What does not change

- The robot's body, its dials, the lit strips, the lights and the halo. The cloud is drawn around the robot, not on
  it. The line-width dials and `useStripFlicker` stay as they are here; removing them is backlog 85 (§1.13).
- Anything that is heard. `triggerWithCap`'s gates, velocity, the budget and the polyphony cap are read, not changed.
- The selection halo, the company glow and the Deck camera's follow loop.
- The cards and roster tiles.
- Zustand: no new state, and nothing about the cloud is saved in a session or carried on a link.

### 1.13 Out of scope

Rejected in the spike and not to be raised again: a pulse on the lit strips or the lights; notes as gems; notes
trailing off one side; a panel behind the notes; lowering each note's own opacity; notes only while a robot works; a
switch-off at 50% battery; a body bob in time with the melody.

Separate items:

- **Fixed-width boundary lines and the edit flicker's removal** — backlog 85 (Crawford, 2026-11-12: yes, as its own
  item).
- **Keeping a robot playing until it is in its station** — backlog
  [84](../todo/backlog.md#84-audio-keep-a-robot-playing-until-it-is-in-the-station). Until then a recalled robot goes
  quiet within a measure and its notes stop with it, part-way home.
- **The chord cycle's timing and the steps' alignment** — backlog 82 and 83, fixed and archived (PR #635).
- **Moving the world to a measure, and loops, recordings and links at a measure** — backlog 86 and 87. The cloud
  draws whatever the engine triggers and holds no position of its own, so neither is prepared for here.
- **A reduced-motion alternative** (a blip without travel) — not built; its own item if wanted.
- **Shapes driven by oscillators and envelopes** — Crawford's idea from the spike session; recorded only in the
  intent.

---

## 2. Target File Structure

Names are provisional; the plan pins them.

```text
src/engine/
├── noteEvents.ts                 # Part A: the registry (onRobotNote, hasRobotNoteListener, emitRobotNote);
│                                 #   Part E: setNotePreviewSeconds / getNotePreviewSeconds
├── noteEvents.test.ts
├── AudioEngine.ts                # Part A: the emit in triggerWithCap; Part E: the announce at the 16n tick,
│                                 #   and a step's reads shared by the trigger and the forecast (§1.9)
└── AudioEngine.test.ts
src/components/robot/notes/
├── noteCloudModel.ts             # pure, per robot: the repeat rule, the range and row, front or behind (§1.3)
├── noteCloudModel.test.ts
├── noteRows.ts                   # pure geometry: the roll's box, a row's height across the roll, a bar's
│                                 #   thickness and length, the mask, the note colour
├── noteRows.test.ts
├── noteStrength.ts               # pure: strength from battery and woken (§1.7)
├── noteStrength.test.ts
├── NoteCloudLayers.tsx           # the two wrappers and belts React renders (§1.5), for the mover and the avatar
├── NoteCloud.css
├── useNoteCloud.ts               # the hook: listens, places notes, runs the belt and the per-frame pass (§1.6)
└── useNoteCloud.test.tsx
src/systems/
├── robotAttention.ts             # runtime module state: the pointed-at robot, the singled-out id, the woken set
├── robotAttention.test.ts
├── workLoop.ts                   # placeRow / easeRowWith also scale the note layers (§1.5)
└── workLoop.test.ts
src/components/robot/
├── Robot.tsx                     # renders NoteCloudLayers round the svg; pointer enter / leave on g.robot
├── Robot.test.tsx
├── RobotBody.tsx                 # strength, singled out, the wake and the sleep; calls useNoteCloud (world, avatar)
└── RobotBody.test.tsx
src/components/panels/screen/worldView/
├── FollowedRobotMarker.tsx       # frames the pointed-at robot, else the followed one (§1.7)
└── FollowedRobotMarker.test.tsx
src/components/panels/screen/screens/
├── RobotScreen.tsx               # AvatarGem's positioned box and its layers (Part D)
├── RobotScreen.css
└── RobotScreen.test.tsx
src/animation/jobMoves/
├── buildJobTimeline.ts           # Part 0: the cycles comment
└── buildJobTimeline.test.ts      # Part 0: BOB_CYCLE_SECONDS is 2.4
src/constants/index.ts            # the cloud's numbers (§7.2 A1), BOB_CYCLE_SECONDS
src/utils/debugParams.ts          # ?notes=off (§1.6)
src/utils/debugParams.test.ts

CLAUDE.md                         # the Visual Mapping guardrail gains a sentence naming the cloud (Crawford's wording, §5.4)
docs/ROBOT_DESIGN.md              # the note cloud as the third overlay; the render contexts; the forbidden patterns line
docs/ANIMATION_SYSTEM.md          # the cloud's layers, belt, per-frame pass and timelines; the bob's cycle
docs/AUDIO_SYSTEM.md              # note events (Part A); early announcements (Part E, when built)
docs/PERFORMANCE.md               # §5.3's measurements
docs/todo/backlog.md, docs/todo/plan.md   # entry 79 and its line; archive after the merge
docs/specs/ROBOT_NOTE_CLOUD.md    # an "As built" section
```

Untouched: `beatClock.ts` and `harmonySystem.ts` (Part E reads `positionAt` and `paletteForMeasure` as they are),
`RobotGem.tsx` and everything under `src/components/robot/gem/`, `robotAudibility.ts`,
`audioBudgetSystem.ts`, `deckCamera.ts`, every store, `src/content/` (the cloud has no words).

---

## 3. Implementation Boundaries & Constraints

**Always**
- RED first for every behaviour, one commit per task, the suite green at each (Crawford's TDD rule). Each rule in
  §1.2–§1.9 and §1.11 that a test can reach is a test that fails on today's code.
- The arrow runs audio to visual. `noteEvents.ts` imports nothing from the engine or Tone; nothing under
  `src/components/robot/notes/`, `src/systems/robotAttention.ts` or any timeline callback imports `AudioEngine` or
  Tone.
- Animation is GSAP. Every timeline the cloud makes is registered in `timelineMap` with the `'world'` scope and
  killed on unmount.
- The notes on screen, the range a robot has played, the pointed-at robot and the woken set are runtime only.
- The numbers are named constants (§7.2 A1), not literals in a hook.
- Run the focused tests per task, then the full suite, `build:types`, `lint` and `build` at each checkpoint.

**Ask first**
- Any change to `triggerWithCap`'s gates, or an emit from anywhere but its success path.
- Any engine interface beyond §1.2's three functions before Part E, and any change to `beatClock.ts` or
  `harmonySystem.ts` (the music clock is read here, not changed).
- The wording of the CLAUDE.md guardrail sentence (a guardrail edit is Crawford's alone).
- Anything that makes the cloud audible (a dip, a duck), or a tour.
- A cloud on a card or a roster tile, or on the phone band's gem.
- A new dependency.

**Never**
- A Tone synth, `Tone.Draw`, `setTimeout`, `setInterval`, `requestAnimationFrame` or `queueMicrotask` in this work;
  no `gsap.delayedCall` or tween that is not reachable from a registered timeline.
- A note event, a timeline, a DOM ref or the woken set in Zustand or React state.
- A write to the robot's `<svg>` or anything inside it for a note. The body is not repainted for the cloud.
- A second copy of how a step becomes a note. The forecast and the trigger share one (§1.9); the spike's mirror of
  `processMelodyStep` and its observed-lag workaround are not carried over.
- A file-text test (source, doc or CSS read as text). The look, the mask and the CSS get Crawford's eye in the
  browser, named on the task's Proof line; a task with no behaviour (a doc, the guardrail sentence) has no RED test.
- A "keep existing look" or compatibility clause in any doc (pre-v1 rule).
- Code carried over from `spike/note-pulse` without its test.

---

## 4. Code Style & Architecture Conventions

The registry, as it would read (Part A; names provisional):

```typescript
// src/engine/noteEvents.ts — written by the engine, read by the animation layer. Imports nothing.
export interface RobotNoteEvent {
  /** Seconds from now until the note leaves the speakers: the transport's lookahead, MIN_LEAD, Humanize and the
   *  output's latency. */
  lead: number;
  /** The note's sounding length in seconds, after articulation. */
  duration: number;
  /** The note's scheduled start on the audio clock, in seconds: for comparing one note with the next (a rest),
   *  never for scheduling. */
  at: number;
  /** The pitch as triggered, e.g. `C4`. */
  note: string;
}

/** Listen for one robot's triggered notes. Returns the unsubscribe. */
export function onRobotNote(robotId: string, listener: (event: RobotNoteEvent) => void): () => void;
/** Whether anything listens to this robot, so the engine builds no event nobody reads. */
export function hasRobotNoteListener(robotId: string): boolean;
/** The engine's side. A throwing listener never reaches the caller. */
export function emitRobotNote(robotId: string, event: RobotNoteEvent): void;
```

The emit, in `triggerWithCap`'s success path:

```typescript
synth.triggerAttackRelease(note, /* … */);
const noteEnd = scheduleVoiceRelease(duration, scheduleTime);
standingBy.recordNoteEnd(robotId, noteEnd);
if (hasRobotNoteListener(robotId)) {
  emitRobotNote(robotId, {
    lead: Math.max(0, scheduleTime - Tone.now()) + outputLatencySeconds(),
    duration: noteEnd - scheduleTime,
    at: scheduleTime,
    note,
  });
}
return true;
```

What a note becomes, as pure functions the hook calls (Part B and C):

```typescript
// noteCloudModel.ts — one model per robot id, shared by the world's cloud and the avatar's.
export interface DrawnNote {
  /** The row: −0.5 (the robot's lowest so far) to 0.5 (its highest). */
  row: number;
  layer: 'front' | 'behind';
  duration: number;
}
/** The next note of this robot's melody: what to draw, or null for the even-numbered notes of a run (§1.3). */
export function nextDrawnNote(robotId: string, event: RobotNoteEvent): DrawnNote | null;

// noteStrength.ts
/** 1 down to NOTE_BATTERY_FULL, then a straight line to 0 at a flat battery; 1 whenever woken (§1.7). */
export function noteStrength(batteryLevel: number, woken: boolean): number;
```

- **Pure first.** Everything that decides *what* is drawn (the repeat rule, the row, the layer, the colour, the roll's
  box, a row's height across the roll, the thickness, the strength) is a pure function with a unit test. The hook
  only listens, places elements and runs the belt.
- **Names follow the neighbours':** `useNoteCloud` beside `useOrbiterMotion` and `useHaloMotion` (same options shape:
  `root`, `robotId`, `context`, `enabled`); `robotAttention.ts` shaped like `deckCamera.ts`'s followed-robot pair
  (`getX` / `subscribeX` for `useSyncExternalStore`); constants named `NOTE_…` in `src/constants/index.ts`.
- **The per-robot model survives a re-mount** of either cloud and is cleared when the robot's body unmounts for
  good (a replaced world). The plan pins where it is cleared.
- **Plain CSS beside the component** (`NoteCloud.css`); inline styles only for values computed per robot or per note
  (the roll's box, a bar's position and size, the mask's stops).
- **Headless-safe.** With no `window` or with `prefersReducedMotion()` the hook returns before touching GSAP, as the
  other motion hooks do.
- Comments as dense as the modules': each new function's doc comment names the spec section it implements.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first; Vitest, the existing Tone mocks, real GSAP as the other motion hooks' tests use)

**Part 0**
- `buildJobTimeline.test.ts`: `BOB_CYCLE_SECONDS` is 2.4; a 6 s and a 10 s job bob in whole cycles and end where
  they started.

**Part A**
- `noteEvents.test.ts`: a listener hears its own robot's events and no other's; two listeners on one robot both
  hear; the unsubscribe stops it, and `hasRobotNoteListener` is false once the last has gone; a throwing listener
  does not stop the next listener and nothing is thrown to the caller.
- `AudioEngine.test.ts`: a triggered note emits one event carrying the pitch, the sounding length in seconds, its
  scheduled start and a lead of at least zero; a note refused by Mute, by another robot's Solo, by the dock, by the budget (standing by),
  by the polyphony cap, by a missing voice or by a bad note string emits nothing; with no listener no event is
  built; a throwing listener leaves `triggerWithCap` returning true and the synth triggered.

**Part B**
- `noteCloudModel.test.ts`: the first note sits at mid-height; rows spread over at least an octave; a pitch above
  the range so far moves the range for the notes after it; C, D, E, F♯, G♯, A♯ are `front` and the other six
  `behind`, flats included (`Bb` is `front`, `Db` is `behind`); two identical notes that run straight into each
  other draw the first only; a run of five draws the first, third and fifth; the same pitch at a different length is
  drawn; an identical note after a rest is drawn, and starts a new run; two notes moved apart by no more than
  Humanize's reach are still a run; the run is counted across notes that were not drawn; two robots' models do not
  share a run or a range.
- `noteRows.test.ts`: the roll's box is 2.5 times the parts' box about the canvas centre, at the body's scale; in the
  middle of the roll a row is within the wave's amplitude of its pitch height; at an edge the rows are spread by
  1 + 0.6; the rows are the same on the left as on the right; the thickness is a fourteenth of the roll's height
  until the 4-pixel floor takes over at a small scale; a bar's length follows the note's length between its two
  clamps; the note colour is the company colour when there is one, else the identity hue's complement.
- `useNoteCloud.test.tsx`: an event places one bar in the front or the behind layer, in the right colour; a repeat
  places none; reduced motion, `?notes=off`, a hidden document and a world that is not running each place none; the
  belt timeline is registered under the `'world'` scope; a bar is removed once it has crossed (the belt's time
  advanced past it); the white copy is opaque while the note sounds and clear after; with no live notes the wrappers
  are `display: none`; unmount removes every bar, kills both timelines and leaves no listener
  (`hasRobotNoteListener` false).
- `Robot.test.tsx`: the mover holds a note layer before the `<svg>` and one after it, both `aria-hidden`.
- `workLoop.test.ts`: `placeRow` and the swim's ease write the row's scale to the note layers as to `.robot__row`.

**Part C**
- `noteStrength.test.ts`: 1 at 100 and at 50; 0.5 at 25; 0.2 at 10; 0 at 0; 1 at any level when woken.
- `robotAttention.test.ts`: the singled-out id is the pointed-at robot, else the Deck camera's followed robot, else
  null; a subscriber is called only when the id changes; pointing at a robot wakes it and it stays woken after the
  pointer leaves; `sleep` ends it; the followed robot is not woken.
- `Robot.test.tsx`: pointer enter and leave on the robot set and clear the pointed-at robot.
- `RobotBody.test.tsx`: selecting a robot wakes it; `activity === 'charging'` sleeps it; a pointed-at, followed,
  selected, soloed or highlighted robot's mover carries the undimmed level and any other the dim level; a card
  (no `motion`) reads none of it.
- `FollowedRobotMarker.test.tsx`: the marker frames the pointed-at robot; with none it frames the followed robot;
  with neither it renders nothing.

**Part D**
- `RobotScreen.test.tsx`: the desk avatar's box holds a note layer either side of its `<svg>`; an event for the
  robot on screen places a bar there at full strength whatever its battery; the phone band's gem has no note layers
  (default, §7.3 Q1); the avatar and the world place the same note in the same layer. The clip at the box's edge is
  CSS and gets a look, not a test.

**Part E**
- `noteEvents.test.ts`: the preview asked for is read back; it is 0 until asked.
- `AudioEngine.test.ts` (on the music clock's own helpers, `atStep` and the mocked `positionAt` /
  `paletteForMeasure`): with a preview asked for, a note is announced at the first tick at least that far ahead of
  its step, with the pitch, the length and the scheduled start its trigger then gives it, across a palette change
  and across a measure's end; it is not emitted again at its trigger; a robot that is muted, soloed away, docked or
  standing by at the announcing tick announces nothing; the polyphony cap refuses no announcement; with no preview
  asked for, Part A's behaviour is unchanged; and the trigger plays the same notes it played before the step's reads
  were shared (the existing `processMelodyStep` tests stay green untouched).

### 5.2 Checks

`npm run build:types`, `npm run lint`, `npm test`, `npm run build` green at each task and at each checkpoint.

### 5.3 Runs (the proof; not tests)

- **Cost, headless** (`npm run perf:idle -- --only stock --throttle 1`, 6-second windows, off / on / off / on in
  one session, `?notes=off` against the default): main-thread time, the compositor's update time, paint time,
  rastered area and frames a second, recorded in PERFORMANCE.md. **Working target: main-thread time with the cloud on
  within 10% of off; paint time, rastered area and frame rate inside the off runs' own spread.** The 10% is this
  spec's proposal and Crawford has not set it (2026-11-12: "I'm not really sure"), so Gate 1 reports the numbers and
  he decides with them in hand (§7.3 Q2). What it stands in for is the next run: no crackle and no dropped frames
  where he plays. The compositor's update time is recorded; the spike's was about a third more and has no target
  here.
- **Cost, where it has never been measured:** Crawford's desktop at full screen, a phone, and a world with all
  twelve robots sounding at the Full tier, each with the `?debug` HUD up. No added crackle by ear, and the HUD's
  underrun count no worse with the cloud on than with `?notes=off`.
- **The pause:** power off with notes mid-flight; they freeze. Power on; they carry on, and no note is stranded on
  screen.
- **The look:** the cloud against `spike/note-pulse` at `?trail=all`, side by side, on the desk and on a phone.
- **Part E's forecast:** two power-ons of one world with no input, a few hundred notes each, a palette change
  included; no wrong pitch, and no unannounced note outside the lead after a robot starts sounding. The spike's
  figures (§1.9) are the before.

### 5.4 Gates (the build stops and reports at each)

- **Gate 1, cost** — after Part B: §5.3's headless run, reported with the spike's figures beside it. Crawford sets
  the line there. Over the working 10%, the build does not go on to Part C without his decision (take more back, or
  accept the figure).
- **Gate 2, Crawford's eye and ear** — after Part C: the look on his desktop and on a phone; the unmeasured cost
  runs; the row switch, the layer switch's dissolve and an edit that re-sizes the roll; the marker on hover. He
  names any of §7.2 A1's numbers he wants re-pinned (he chose a re-check on a phone, 2026-11-12), and gives the
  guardrail sentence its wording.
- **Gate 3, the avatar** — after Part D: his look at the desk avatar with the roll clipped by its box (§1.8: where
  "now" falls, and the top and bottom rows), and his answer to §7.3 Q1. Parts 0 to D merge when it passes.
- **Gate 4, Part E** — its own eye gate is the note entering at the roll's edge, and §5.3's forecast run. §5.3's
  headless cost run is taken again here, against Gate 1's figures: with early notes a note is on the roll about a
  fifth longer than in the cloud Gate 1 measured, and the spike's 19% was measured with them on.

### 5.5 Done when

**Parts 0 to D (the first branch):**
- Every test in §5.1 for Parts 0 to D is written RED and passes; the suite, types, lint and build are green.
- §5.3's runs are done, the 10% target is met or re-pinned by Crawford, and Gates 1 to 3 have passed.
- CLAUDE.md's guardrail carries Crawford's sentence; ROBOT_DESIGN.md, ANIMATION_SYSTEM.md, AUDIO_SYSTEM.md and
  PERFORMANCE.md read as the code is; this spec has its "As built" section.
- Backlog 79's entry says what shipped and that Part E follows; it is archived only when Part E is built or cut.

**Part E:** its tests pass, §5.3's forecast run is clean, Gate 4 has passed, AUDIO_SYSTEM.md describes the
announcement, and backlog 79 is archived with its plan.md line deleted.

---

## 6. Git & Workflow Context

- **The order** (Crawford, 2026-11-12): backlog 82 and 83 first, then this. Both are merged (PR #635) and archived
  (PR #636), so this is next. Nothing here is built before the spec is approved and planned, Part 0 included.
- **What is already in:** the intent, this spec, backlog 79's status and the bob's first half (`BOB_PX` 6 to 3,
  82b11962) merged ahead of the pause (PR #634).
- **Parts 0 to D:** `feature/note-cloud`, brought up to `main` at 2d2dbdae (the merged branch fast-forwarded, so it
  starts as `main`), one task per commit, RED test in the same commit as its GREEN, message in the repo's voice
  (`feat(robots): a triggered note tells its listeners (Task 2)`), ending with the attribution line the session
  carries.
- **Part E:** its own branch off `main` once Parts 0 to D have merged (`feature/note-cloud-early-notes`).
- Crawford opens and merges each PR; the PR body links this spec's sections.
- The intent file stays. This spec and the plan (`docs/tasks/ROBOT_NOTE_CLOUD.md`) are committed before the first
  task.
- `spike/note-pulse` is reference only and is deleted on Crawford's say-so, after Gate 2 at the earliest.

---

## 7. Decisions, Assumptions and Open Questions

### 7.1 Decided by Crawford, 2026-11-12 (the intent's twelve "To confirm" points)

| # | Point | Answer |
|---|---|---|
| 1 | The Visual Mapping guardrail | Add a sentence naming the cloud as a third overlay. His wording, at Gate 2 |
| 2 | The engine announcing notes early | Approved. Built after backlog 82 and 83; the cloud ships first on trigger-time events (§1.4, §1.9) |
| 3 | The marker on a robot under the pointer | Keep it, as seen (§1.7) |
| 4 | Ducking the others, the tour | Neither |
| 5 | Where the battery fade reaches zero | A flat battery |
| 6 | What a repeat is | The same pitch and the same length (§1.3). The spike compared pitch only |
| 7 | Reduced motion | No cloud |
| 8 | Where it shows | The world and the detail avatar (§1.8). The spike drew the world only |
| 9 | Touch | As built: a tap selects; the camera's followed robot is singled out |
| 10 | The lit strips' dials and the edit flicker | Yes, as backlog 85, not in this spec |
| 11 | The bob's cycle | Also double the cycle: 2.4 s (§1.11) |
| 12 | The numbers he did not name | Pinned at the spike's values, re-checked on a phone at Gate 2 |

Decided earlier, in the spike (the intent's Behavior): the cloud itself, 2.5×, 5 s, 4 pixels, every robot, right to
left, half in front, the fan, white as it sounds, company colour or the complement, bright now and faint after, the
wake until the station.

His answers to this spec's first open questions, the same day:

| Question | Answer |
|---|---|
| The avatar's sizing | "The note animation can be cut off as it leaves the viewing area": the roll keeps its 2.5 times and the avatar's box clips it (§1.8) |
| The cost target | "I'm not really sure." The 10% stays a working figure; he sets the line at Gate 1 with the numbers in hand (§5.3) |
| A silence inside a run of identical notes | A rest breaks the run (§1.3) |
| Merging Parts 0 to D before Part E | Yes |
| The order against Stage 3 | Pause this; finish backlog 82 and 83; then come back (§6) |
| Part E's place, once 82 and 83 had closed and nothing made it wait | Last, as written: its own branch after Parts 0 to D merge. The first cloud ships on trigger-time events (§1.4), and Gate 4 re-measures the cost with early notes on (§5.4) |

### 7.2 Assumptions (defaults the plan builds on; each re-pinned at a gate)

- **A1. The numbers,** as constants in `src/constants/index.ts`. The first four are Crawford's; the rest were the
  spike's defaults while he looked.

  | Constant (provisional) | Value | What |
  |---|---|---|
  | `NOTE_ROLL_SIZE` | 2.5 | the roll against the robot's box |
  | `NOTE_CROSSING_SECONDS` | 5 | a note's time across the roll |
  | `NOTE_MIN_PX` | 4 | a bar's least thickness on screen |
  | `NOTE_HEIGHT_SHARE` | 1/14 | a bar's thickness against the roll's height |
  | `NOTE_NOW` | 0.225 | "now", in from the right edge |
  | `NOTE_DIM` | 0.35 | a sounded note's strength on a robot not singled out |
  | `NOTE_FAN` | 0.6 | the rows' extra spread at an edge |
  | `NOTE_WAVE` | 0.015 | the wave in the middle, against the roll's height (×5 at an edge, 1.5 waves across) |
  | `NOTE_EDGE_START` | 0.55 | where the fan begins, from the centre (0) to an edge (1) |
  | `NOTE_BRIGHT_BAND` | 0.14 | how far past "now" a note is still at full strength |
  | `NOTE_HOT_COLOR` | `#fffbe6` | a sounding note; 0.05 s in, 0.25 s to cool |
  | `NOTE_RANGE_MIN_SEMITONES` | 12 | the least range the roll's height stands for |
  | `NOTE_BATTERY_FULL` | 50 | the battery level down to which strength is 1 |
  | `NOTE_WAKE_SECONDS` / `NOTE_EBB_SECONDS` | 0.3 / 1 | a strength rise / fall |
  | complement | S 100, L 70 | a freelancer's note colour |

- **A2. A length is the same when the two events' sounding lengths are equal to the millisecond.** A tempo move
  between two written-identical notes makes them differ once; accepted.
- **A3. The range is "so far"** and is never reset while the robot's body stays mounted, so an early note keeps the
  height it was placed at when the range later widens. As the spike draws it.
- **A4. A rest is a gap of more than 50 ms** between the first note's sounding end (`at + duration`) and the
  second's `at` (`NOTE_REST_MIN_SECONDS`, provisional). Humanize moves a note by 20 ms at most, so two notes written
  to touch can sit 40 ms apart and are still a run. Judged by sound, not by the written melody, so the model needs
  nothing but the events.
- **A5. The pointed-at robot is set by pointer enter and leave on `g.robot`,** whatever the pointer type. On touch a
  tap's enter and leave bracket the tap, and the selection it makes carries the rest.
- **A6. A body-scale edit re-sizes the roll under a fade** (the layers out over `NOTE_WAKE_SECONDS`, rebuilt, back
  in), dropping the notes in flight. A colour edit rebuilds nothing.
- **A7. The per-frame pass quantises a note's transform** (a quarter of a scene unit and a quarter of a degree as
  the first try) and writes only on a change. Gate 1 measures it and Gate 2 looks at it.
- **A8. `?notes=off` is a debug switch,** read once at load like `?debug`, not part of the world link and not
  mirrored to the URL. The plan checks the name is free.
- **A9. The avatar's timelines are `'world'` scope too,** as the avatar's orbiter and flicker timelines already are:
  the console is off screen while the world is paused.
- **A10. During a layer switch the cloud stays on the mover** and is not copied into the dissolve.
- **A11. The output latency in `lead`** is the raw context's `outputLatency`, else `baseLatency`, else 0, capped at
  half a second, as the spike read it.
- **A12. The Click Track is drawn like any other sound.** A robot with Click Track on plays the test pattern on its
  own voice through `triggerWithCap` (back on the robot, company and All Probes screens since PR #635), so its
  sixteen sixteenths are note events and the cloud draws them, thinned by the repeat rule like a melody. No special
  case either way.

### 7.3 Open questions

None blocks planning. Q1 to Q3 are answered at a gate, with something to look at or a number in hand; Q4 and Q5 are
answered and kept for the record.

- **Q1. What the avatar's clip takes (Gate 3).** With the roll clipped by the avatar's box, "now" and the rows for
  a robot's highest and lowest pitches can fall outside it (§1.8). Whether that reads, and whether the phone band's
  small gem should show a cloud at all (default: no).
- **Q2. The cost line (Gate 1).** The working figure is main-thread time within 10% of cloud-off; the spike
  measured about 19% at the approved settings. Crawford sets the line when the build's own numbers are in front of
  him.
- **Q3. How much the repeat rule still thins (Gate 2).** With length and rests both counted, only identical notes
  that run straight into each other are dropped. If the cloud reads as too busy at the eye gate, the rule is the
  first thing to look at; the per-robot counts of drawn and dropped notes are the probe.
- **Q4. Does Part E still wait for its own branch? Answered: yes, it is last** (Crawford, 2026-11-12). The
  recommendation put to him was to build its engine half straight after Part A, so that Gate 1 measured the cloud
  that ships and Gate 2 showed the approved look. He kept the order as written. What follows from that: Gates 1 and
  2 judge the stopgap of §1.4, with an empty right-hand fan and fewer notes alive at once, and Gate 4 takes the cost
  run again with early notes on (§5.4).
- **Q5. What 82 and 83 left: answered.** The palette is a pure function of the measure and the steps sit on the bar
  (§1.1), which is what §1.9 hoped for; it is rewritten on that and nothing in Parts A to D changed.
