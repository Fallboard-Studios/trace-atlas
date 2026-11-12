# Intent: The Note Cloud — a robot's melody drawn as notes around it

**Not yet confirmed.** Drafted on 2026-11-12 from a spike, not from an `interview-me` pass: Crawford steered a
throwaway build by eye over one session and ended "happy with the current state". Everything under Outcome and
Behavior is what he decided by looking, as built. What he was never asked is under **To confirm**, and nothing there
is settled. Ahead of a `spec-driven-development` pass. Backlog
[79](../todo/backlog.md#79-robots-move-in-time-with-their-own-melody), plan.md Stage 4.

The spike is the branch `spike/note-pulse` (local, fifteen commits, never merges). It is the reference for how
everything below looks; none of its code is to be carried over as it stands (no tests, no timeline registration).
The link he was looking at when he approved it carried `?trail=all&rollSize=2.5&trailLife=5&notePx=4`, and those are
now the spike's defaults, so plain `?trail=all` shows the approved look.

## Outcome

A player can see which robot is playing which sound. Each note a robot plays is drawn as a small bar on a piano
roll around that robot, in time with the sound, so the rhythm reads in the spacing and the melody in the heights.
It is there on every robot but quiet about it, and it comes forward for the robot the player turns to.

## Behavior

### The cloud

- **A piano roll around the robot.** It is two and a half times the robot as drawn (2.5× the box its parts fill, at
  the body's scale). Nothing marks its edges: there is no panel behind the notes.
- **A note is a solid rounded bar.** Its length is the note's length (a note takes 5 seconds to cross the roll), and
  its row is the note's pitch within that robot's own range.
- **Notes cross from right to left.** A robot has no front or back, so nothing trails it; the roll sits on it.
- **Half in front, half behind.** C, D, E, F♯, G♯ and A♯ cross in front of the body; C♯, D♯, F, G, A and B cross
  behind it. The robot sits in a cloud of its notes.
- **The rows run straight through the middle and fan at the edges.** Across the middle of the roll a row holds its
  pitch height with the slightest wave, so the pattern of notes still reads as a piano roll. Toward the left and
  right edges the rows spread apart, the wave grows, and a bar tilts to follow its row.
- **A note is a fourteenth of the roll's height thick, and never under four pixels on screen.** At 2.5× that is the
  roll's share on a desktop. On a small screen, where the scene is drawn smaller, the four-pixel floor takes over and
  the note grows in the scene to stay legible.

### In time with the sound

- **A note arrives before it sounds.** It enters at the right edge in its own colour and fades in as it travels,
  for a little over a second at his settings.
- **It turns white as it sounds**, at the point where the rows come together, a little under a quarter of the way
  in from the right edge. It stays white for as long as the note lasts, then cools to its colour.
- **Only what sounds is drawn.** A robot that is muted, silenced by another robot's Solo, standing by over the Audio
  Load budget, or in its station plays nothing and draws nothing.

### Colour

- **A robot in a company wears the company's colour.** A freelancer's notes wear the complement of its identity
  colour.

### Unobtrusive but present

- **Bright now, faint after.** A note is at full strength where it sounds and falls to about a third as it moves
  on. So every robot shows a bright blip on the beat and a ghost of what it just played.
- **Overlapping notes look like one shape.** The dimming belongs to the whole cloud, not to each note.
- **The robot the player turns to is at full strength.** A robot under the pointer, selected, soloed or highlighted
  shows its whole cloud undimmed.
- **An immediately repeated note is not drawn twice.** When a robot plays the same pitch twice in a row, the second
  is left out; in a longer run the even-numbered ones are.
- **The battery thins the population.** A robot's notes are at full strength down to 50% battery, then grow fainter
  with the battery.
- **Attention brings them back.** Pointing at a robot or selecting it returns its notes to full strength, and they
  stay there after the pointer leaves, until the robot is next back in its station.

### What does not change

- The robot's body, its dials, the lit strips and the lights are untouched. The cloud is drawn around the robot,
  not on it.
- Nothing about what is heard changes.

### The bob, while we are in there

- **A working robot still bobs, half as far and half as fast.** Crawford, 2026-11-12: "cut the idle bob in half in
  velocity and distance." It moves ±3 units where it moved ±6, on the same 1.2-second cycle, so it covers 12 units a
  cycle at about 10 a second where it covered 24 at about 20. Built the same day (`BOB_PX`,
  `src/constants/index.ts`), ahead of the rest. The waiting robot's one bob reads the same distance and halves with
  it.

## Style / constraint

- **The arrow runs from audio to visual only.** The engine tells listeners about notes; nothing in the animation
  calls the engine or Tone. Strict Separation stands as written.
- **Animation is GSAP.** No `setTimeout`, no `requestAnimationFrame` loop, no `Tone.Draw`. Every timeline the real
  build makes is registered in `timelineMap` with the `'world'` scope, so a power-off pause freezes the clouds, and
  is killed on unmount.
- **Nothing new in state.** The notes on screen, the range a robot has played and which robots the player woke are
  runtime only.
- **Cost is part of the design, not a later pass.** The first cut ran a tween for every moving part of every note
  and dragged the page on Crawford's machine. The shape that fixed it: notes ride a belt (a compositor layer of its
  own inside the robot's mover) that one tween moves, so the robot is never repainted for a note; notes enter and
  fade through a fixed mask; a silent robot's layers are switched off.
- **Tests exercise code** (CLAUDE.md): the note events, the early announcements and the rules for when a robot
  shows notes are behaviour with tests. The look gets Crawford's eye in the browser.

## Out of scope

Tried in the spike and rejected, so not to be raised again:

- **A pulse on the lit strips or the lights.** Not indicative enough, and noise when every robot does it at once.
- **Notes as gems.** The gem look did not work; notes are solid.
- **Notes trailing off one side of the robot**, and **a panel behind the notes**.
- **Lowering each note's own opacity.** Overlaps showed.
- **Notes only while a robot is working**, with the bob removed.
- **Notes switching off at 50% battery.** Replaced by the fade.
- **A body bob in time with the melody.** Never built; dropped when the cloud arrived.

Separate items:

- **Shapes driven by oscillators and envelopes.** Crawford's idea from the same session: a look question, and a
  large one, with its own guardrail change. Not recorded anywhere yet.
- **Keeping a robot playing until it is in its station** is backlog
  [84](../todo/backlog.md#84-audio-keep-a-robot-playing-until-it-is-in-the-station). Until then a recalled robot
  goes quiet within a measure and its notes stop with it, part-way home.
- **The chord cycle's timing and the melody's step alignment** are backlog 82 and 83 (see the note below).

## To confirm

Built by me without being asked, or never put to Crawford. Each needs a yes or a no before the spec.

1. **The Visual Mapping guardrail.** CLAUDE.md says audio reaches the body only through ROBOT_DESIGN.md's dials and
   that day/night and battery dimming are the only two overlays. The cloud is audio-driven, sits around the body
   and fades with the battery. My reading: it is a third overlay and the guardrail needs a sentence naming it. A
   guardrail edit is Crawford's alone.
2. **The engine announcing notes early.** He chose it on 2026-11-12 so a note can travel in from the edge. It is a
   new engine interface, so it needs his architecture approval as such (CLAUDE.md), with what it costs: an early
   announcement is a forecast. At his settings a note is announced about 0.9 seconds sooner than its trigger, and
   two power-ons of one world gave 330 pitches right, 23 wrong and 13 notes not announced, then 352, 1 and 13. (At
   the spike's first settings, about 0.3 seconds sooner: 353/8, 354/9 and 362/1, with 4 or 5 not announced.) The
   wrong pitches are the notes just after a chord change. The longer the lead, the longer a robot that has just
   started sounding goes without notes, and the longer one that has just gone quiet keeps drawing notes it will not
   play; the second is expected from how it works and was not counted.
3. **The marker on a robot under the pointer.** In the spike, pointing at a robot also frames it with the Deck
   camera's marker (the square with "name | job"). I wired that; he has seen it but never said he wants it.
4. **Ducking the others.** `&spot` in the spike drops the other robots about 10 dB while one is singled out
   (Highlight's dip), and `&tour` moves the spotlight round by itself. Both are off unless switched on. My guess:
   out.
5. **Zero at a flat battery.** I read "fade to zero" as zero at 0%. A robot is recalled at 10%, so it heads home
   with its notes at a fifth strength. The alternative is zero at the recall line.
6. **A repeat is the same pitch**, whatever the two notes' lengths, and a silence between them does not break the
   run. My reading of "identical note played twice in a row".
7. **Reduced motion.** The spike draws no cloud at all under `prefers-reduced-motion`. An alternative is the blip
   without the travel.
8. **Where it shows.** The world only. The detail avatar and the cards show nothing.
9. **Touch.** There is no pointer to hover with. A tap selects, which wakes the notes, and on a phone the robot the
   Deck camera follows counts as singled out. Whether that is enough.
10. **The lit strips' dials.** Before the cloud, Crawford agreed the boundary lines could stop being dynamic in
    width (the differences are invisible below a 4K screen) and that the edit flicker could go. That was for the
    strip pulse, which is rejected. Whether he still wants those two cleanups, as their own item.
11. **The bob's cycle.** I read "half in velocity and distance" as half the distance on the same cycle, which is
    also half the speed. If he meant the bob to take twice as long as well, that is `BOB_CYCLE_SECONDS` 1.2 to 2.4,
    and the speed would then be a quarter of what it was.
12. **The numbers.** He named four himself: every robot (`trail=all`), roll 2.5×, crossing 5 s, four pixels. The
    rest were the spike's defaults while he looked and he did not name them: "now" 22.5% in, dim 0.35, fan 0.6,
    wave 1.5%, the 50% battery line. Each is a switch in the spike. Whether any wants another look on a phone.

## Known implementation notes (not yet spec'd)

- **Where a note is known to sound.** `triggerWithCap` in `src/engine/AudioEngine.ts` is the one place where mute,
  Solo, the dock, the Audio Load budget and the polyphony cap have all been applied. The spike emits there, through
  a plain listener registry keyed by robot id (`src/engine/noteEvents.ts` on the spike branch). Not a store: twelve
  robots on sixteenths would be about a hundred writes a second through React.
- **The lead.** A trigger runs about a fifth of a second before its note sounds (the transport's lookahead plus
  `MIN_LEAD`), and the output's latency comes on top (about 60 ms in headless Chrome). The visual waits that out
  with a GSAP delay.
- **Announcing early.** A listener asks for notes some seconds sooner; at each sixteenth tick the engine then
  announces the notes of the step far enough on, from the melody it already holds, mirroring `processMelodyStep`
  (pitch, length, Humanize) and `triggerWithCap`'s gates bar the polyphony cap. It can be wrong for a moment after a
  chord change, a mute, a tempo move or a melody edit.
- **It leans on backlog 82 and 83.** Forecasting a pitch needs the palette a future measure will use. The spike
  found that the chord cycle does not keep fixed time and that the melody's steps sit a sixteenth off the measure,
  and works round both: it reads the measure off the transport and takes the cycle's lag as observed. If 82 makes
  the palette a function of the transport position, the forecast becomes exact and that workaround goes. So 82 and
  83 are better settled before this part is built.
- **Layers.** The two note layers are HTML siblings of the robot's `<svg>` inside its mover (`Robot.tsx`), one
  below it and one above. About four compositor layers per sounding robot. The mover's children are React's, so
  how the layers are mounted is a spec question (the spike inserts them by hand).
- **The back row.** A back-row robot is drawn at `BACK_LAYER_SCALE`, eased by the work loop on `.robot__row`. The
  spike sets the layers' scale from `robot.layer` at once, which pops on a row switch.
- **Who is singled out.** The spike keeps one robot id: under the pointer, else the Deck camera's followed robot,
  else none. The Deck camera only follows where the world is wider than the window, so never on a desktop.
- **Measured, headless, one world** (`npm run perf:idle --only stock --throttle 1`, cloud off against on, 6-second
  windows). **At his settings** (2.5×, 5 s, the wavy rows and the early announcements): main-thread time 2,844 and
  2,716 ms off against 3,315 and 3,290 ms on, about 19% more; the compositor's update time 203 and 171 ms against
  250 and 251, about a third more; paint time and rastered area unchanged; 57 to 58 frames a second either way. So
  the approved look has a main-thread cost the real build has to take back: a 5-second crossing keeps about twice as
  many notes alive as 2.2 did, and each is rewritten every frame to follow its row. **At the spike's first settings**
  (1.33×, 2.2 s, straight rows): paint time per sounding robot back at baseline with the belt (10 to 18 ms a window,
  against 27 to 40 ms in the first cut) and main-thread time inside the spread of the off runs. Not measured at
  all: Crawford's full-screen desktop, a phone, a world with all twelve sounding.
