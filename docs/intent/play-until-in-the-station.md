# Intent: Play until in the Station — a recalled robot plays all the way home and fades out over one measure

Confirmed via `interview-me` on 2026-11-14 (five questions; the first guess was wrong and reshaped the work: not
"silent when hidden" but a measure-long fade at the port), ahead of a `spec-driven-development` pass. Backlog
[84](../todo/backlog.md#84-audio-keep-a-robot-playing-until-it-is-in-the-station), raised during the note cloud's
spike ([intent](robot-note-cloud.md)): the cloud shows what a robot plays, so a robot that goes quiet mid-swim shows it.

## Outcome

A recalled robot is heard all the way home. When it reaches its station's port its volume ramps to zero while its body
shrinks and fades into the port on an arc of the same length, both ending on the next bar line. If less than half a
measure is left when it arrives, it holds there instead, still playing at its regular volume, until the bar line, and
then takes the whole next measure to go (Crawford, 2026-11-14, revising the interview's answer). Sound and body leave
together, on the bar.
Today ([ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md)) the robot lands on `Docked` within a measure of its recall,
wherever it is, and `Docked` is the dock's mute (`isDockMuted`, [robotAudibility.ts](../../src/utils/robotAudibility.ts)),
so for most of the swim home the robot is in view and silent, and its entry arc is one second
(`STATION_ARC_SECONDS`, [workLoop.ts](../../src/systems/workLoop.ts)).

## Why now

The note cloud (backlog 79, merged 2026-11-13) draws the robot's own notes around its body on the robot screen, so the
silent swim home became visible: the notes stop while the robot is still moving. Crawford's words on 2026-11-12: he
wants it "to keep playing until it is in its station"; on 2026-11-14: "once it reaches the port, a robot should play
for one more entire measure, but the volume should ramp down to 0 during that measure."

## Behavior

- **No robot in motion is silent.** A `Recalled` robot, and a robot that has landed on `Docked` while still returning,
  is heard exactly as an `Active` one: audible by the mute/solo/dock rule, in the Audio Load budget's sounding set,
  its voice kept, its mode light lit, counted in the Deck's "n of m".
- **The fade, to the bar line.** On reaching the port with half a measure or more left before the bar line, the volume
  ramps from its regular level to zero and the entry arc plays over the same time (scale 1 → `STATION_PORT_SCALE`,
  alpha 1 → 0, the halo and station ripple riding on it as today), both ending on the bar line. The fade lasts between
  half a measure and a whole one. The robot is then hidden and silent in its station, `'charging'`, as today.
- **The hold, only when less than half a measure is left** (Crawford, 2026-11-14: "can we have this trigger only if
  there's less than half a measure left when the robot hits the station?"). Then the robot stays at full volume, body
  visible at full scale at the port, until the bar line, and the fade and arc take the whole next measure. The
  interview's first answer, a hold for the bar on every arrival, is replaced by this. The measure is the music clock's,
  on the grid (the one music clock, [intent](one-music-clock.md)), never a timer.
- **The fade is heard as a ramp, not a cut.** The volume moves continuously over the measure; no step at the start or
  end.
- **The docking machine is untouched.** `beginRecall` still sets the one-measure hold and the robot still lands on
  `Docked` at the next measure tick wherever it is; the battery starts to recharge, the pitch drift is stored and the
  melody re-registered at that landing exactly as today (`landOnDocked`, [robotSystems.ts](../../src/systems/robotSystems.ts)).
  Deterministic replay (World Clock, [intent](world-clock-deterministic-lifecycle-replay.md)) re-derives docking from
  measures only and is unchanged. The mute functionality does not change either (Crawford, 2026-11-14: "it's just
  volume ramping down"); the one thing that moves is when the dock's existing silence begins, from the `Docked` landing
  to the robot being in its station, since the landing is what silences the swim today (spec §1.3).
- **A turn-back ramps the volume back up.** A robot that goes `Active` again during the hold or the fade has its volume
  ramp back up to its regular level (Crawford, 2026-11-14: "the volume just ramps back up to normal"); the body comes
  back the way it went. No measure is waited for on the way back out.
- **The audio stays the same** (Crawford, 2026-11-14): the melody, its registration, the drift, the note events, the
  Highlight dip, Volume and the sends are untouched. The ramp is one more multiplier on the robot's bus gain.
- **The way out stays as it is.** `Undocking` is silent and hidden; the landing on `Active` makes the robot heard at its
  regular volume at once, with the one-second exit arc fading the body in. No ramp up.
- **Solo still beats the dock.** A soloed robot is heard in its station today and stays heard; its fade measure is
  then no fade at all, or the spec says what a Solo does to the ramp. A user Mute still wins everywhere.
- **The note cloud follows by itself.** It is fed only by the engine's note events, so the notes run on through the
  swim and thin out with the fade without a change of its own.

## Style / constraint

- The volume ramp is the audio side's: a robot-bus gain ramp scheduled through AudioEngine on the transport, with
  `MIN_LEAD`, never from a GSAP callback (Strict Separation). The precedent is the Highlight dip, a per-robot bus gain
  target ramped over `HIGHLIGHT_RAMP_SECONDS` ([AudioEngine.ts](../../src/engine/AudioEngine.ts), `robotBusGain`).
- The arc stays a GSAP timeline in `timelineMap`'s `'world'` scope, keyed `station-${robotId}` as today; its duration
  becomes the measure's length at the current tempo instead of a constant. It triggers nothing audible.
- The hold and the fade are live visual state, like `activity`: nothing about them is saved, linked or replayed. A
  power-on that finds a `Docked` robot hides and mutes it at its station as today.
- Pre-v1: no "keep the existing sound" clause. The fleet's sound is allowed to change; a homebound robot now plays for
  up to two measures longer.
- **Provisional, judged by eye and ear at a gate** (Crawford, 2026-11-14: "subject to change upon visual review"): the
  stretched arc, the half-measure boundary and the fade's length. The spec names the gate and what it looks at.
- **No collision rule up front.** Crawford is worried about robots colliding as they fade in and out at one station.
  The slots cannot double-book (a slot is reserved on the turn home and held through `'returning'`, `'entering'` and
  `'charging'`), so the collision is visual: two bodies at one station's ports for longer than today. It is judged at
  the gate; if it looks wrong, the exit waits for the fade measure to end. Not designed until then.

## Out of scope

- **A fade-in on the way out.** No ramp up; the exit is unchanged. If the asymmetry shows once the entry is seen, it is
  a follow-up, not part of this.
- **Backlog [74](../todo/backlog.md#74-audio-fade-a-robot-in-and-out-on-its-station-arcs)'s fade** is not built. Its
  fade-out is superseded by this item on the way in; its fade-in is the follow-up above. 74 stays off the plan.
- **Moving the landing.** The `Recalled` → `Docked` landing does not wait for the swim; that would put wall-clock swim
  times into the docking machine and break replay.
- **Shortening the swim or the arc on the way out, or any station layout change** for the collision worry.
- **Any UI**: no new readout or control. The card and tile lights read the same `isRobotEmitting` rule, now true for
  the whole trip home.

## Known implementation notes (not yet spec'd)

- **When the dock's silence begins** (answered 2026-11-14, spec §1.3). Today audibility is
  `isRobotAudible(audioMode, anySolo, docking)`, read at the note trigger (`triggerWithCap`), by the Audio Load budget's
  eligibility and standing-by filters ([audioBudgetSystem.ts](../../src/systems/audioBudgetSystem.ts), whose
  subscription key is `id:audioMode:docking` per robot), by `useRobotMeta`, `MetaBox` and `audioDiagnostics`. Nothing in
  audibility reads `activity`. The spec has the dock's silence begin at `'charging'` (the robot in its station) with no
  new mute, the budget key, the trigger check and the readers moving together, and ROBOT_LIFECYCLE.md's "Two state
  machines" principle naming the one exception.
- **Standing by.** The budget stands a dock-muted robot by and releases its voice after its last note. The release
  must not come before the ramp has reached zero, or the fade ends in a cut; the ramp's end is the moment the robot
  becomes dock-muted.
- **The bar line.** The work loop runs on wall-clock GSAP time and has no measure today. It needs the next bar line's
  time and the measure's length: BeatClock's `subscribeToMeasure` and `positionAt` / `getTickSeconds`
  ([BeatClock.ts](../../src/engine/BeatClock.ts)) give them; the tick is a BeatClock subscriber, so calling into the
  work loop from it is allowed (the seam already does).
- **`'entering'` grows.** Today it is the one-second arc. It becomes hold + fade measure, or splits into a hold
  activity and a fade activity; the station's occupancy set (`'returning' | 'entering' | 'charging'`) must still hold
  the slot through both. Reduced motion today shortens the arc to `STATION_REDUCED_ARC_SECONDS` (0.3 s) with no scale;
  the spec says whether the fade measure is also shortened under reduced motion (the sound's length is not a motion).
- **Turn-back during the hold or fade** (answered 2026-11-14, spec §1.2 step 5). Today an `Active` landing during
  `'entering'` lets the arc finish and turns the robot back at the port. Now the robot turns back at once: the arc is
  reversed from where it is and the volume ramps back up to its regular level over a short constant.
- **Power-off mid-fade.** The world's timelines pause as a set and the transport pauses; the ramp is a transport
  automation, so it should pause with them. To be checked, not assumed.
- **Tempo.** The fade measure's length follows the tempo, so at 60 BPM in 4/4 it is four seconds and the station
  overlap is longest there; the gate should look at a slow world.
