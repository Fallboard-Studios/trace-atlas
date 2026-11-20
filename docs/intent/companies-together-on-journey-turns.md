# Intent: Companies Together — a company leaves as one, and comings and goings land on the journey's turns

Confirmed via `interview-me` on 2026-11-20 (seven questions, each guess confirmed; two answers added to the guess:
staggered entrances are fine, and the size of the journey's move sets the chance of a group exit). Seven open items
were then put to him the same day: he took Claude's lean on six and reversed the seventh, so tempo is in. Ahead of a
`spec-driven-development` pass. Raised by Crawford on 2026-11-18 as "how to control batteries better". Roadmap
[94](../todo/roadmap.md#94-companies-together-a-company-leaves-as-one-and-comings-and-goings-land-on-the-journeys-turns).

## Outcome

A company is heard as an ensemble. Its members are out together and, above all, stop being heard together, so a
member is rarely playing without its mates. Comings and goings usually land on the turning measures of the melody
journey ([MELODY_SYSTEM.md](../MELODY_SYSTEM.md#the-melody-journey-roadmap-92)), so a change in who is playing
sounds like part of the music.

Today ([ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md)) every robot draws its own battery size and its own starting
charge, company members included ([spawnSystem.ts](../../src/systems/spawnSystem.ts), `generateBatterySize`), so each
member has its own cycle of 27 to 53 measures and a company's members drift apart from the first shift. Nothing in the
docking machine ([robotSystems.ts](../../src/systems/robotSystems.ts)) reads the journey.

## Why now

The melody journey (roadmap 92, merged 2026-11-19, PR #656) gives a company one shared journey with turning measures,
and Journey Dynamics (roadmap 93) makes those turns audible. Comings and goings that ignore them now stand out.
Crawford, 2026-11-18: "I want companies to stay together i think is my main issue. and the timing of the robots coming
and going just feels random. which it essentially is, i get it, but if we can time robot entrances and exits with the
journey pivots that would be ideal as well."

This reverses his answer B2 of 2026-11-11 in Company Families
([spec](../specs/NO_SILENCE_AND_COMPANY_FAMILIES.md) §7.3): a company keeps today's start, a member draws its own
battery size, and he "would rather a company line up organically for the time being". They do not line up.

## Behavior

Everything here is a strong tendency, not a rule (Crawford, 2026-11-20: "it doesn't ALWAYS have, but usually should").

- **The fault being fixed** is a company member heard without its mates (his answer to the first question: "the first
  mainly"). A whole group arriving at once is wanted too, but second.
- **An exit is the moment the company stops being heard**, not the moment it turns for home. A recalled robot plays
  all the way home (backlog 84, [intent](play-until-in-the-station.md)), finishing its job and swimming from wherever
  it is, so members recalled on one measure would go quiet one at a time over as much as 20 seconds
  ([ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md), "Headless Sims": up to 10.0 s at 20 BPM, 20.3 s at 110, 19.1 s at
  200, which is 16 measures at 200 BPM). The company's last notes should end together. When its members set off for
  home to make that happen is free.
- **A group exit is the norm, and likelier the bigger the move the company has just finished.** The move is the one
  that ends at the turn: the company plays through a long climb or a long fall and goes out together as it arrives. A
  drop counts as the biggest move of all, so a company that has just dropped is the likeliest to leave as one. After a
  small move between nearby intensities, members may drift off one by one. It is the move just finished, never the
  move about to start (his answer to the fifth question). The chance is never worse than a coin flip, and near
  certain after a drop or a move across more than half the journey's range (Claude's lean, taken 2026-11-20).
- **Gathering at the station door is fine to see.** For the last notes to land together, the members who get home
  first wait at their ports, still playing, until the slowest arrives; at fast tempos that is several bars of robots
  at the door. It reads as the company gathering before it goes in (Claude's lean, taken 2026-11-20).
- **Exits usually land on a turn.** Any turning measure counts; no kind of turn (home, a peak) is asked for beyond
  the size of the move above.
- **Entrances usually land on a turn.** A group arrival is preferred ("i would prefer group arrivals usually"), but
  members may come in staggered ("i'm ok with robots having staggered entrances within a company, but much prefer a
  group exit"). The company may come in plain at home or already busy; where on the journey it enters does not matter.
- **Companies overlap freely.** No designed order, no taking turns, no handover. About the amount of sound there is
  today (a mean of 5.1 of 12 robots Active) is the expectation, not a target he set.
- **Freelancers come and go one by one**, usually on the turns of the journey they travel. Journey Dynamics seeds
  them on the Fleet journey, so those are the fleet's turns.
- **Uneven is welcome.** A company may be out for 10 measures one time and 40 the next, and airtime need not be fair
  between companies or robots (today every robot is heard 44.4 to 45.9 % of the time, in shifts of 11 to 23 measures).
  Two limits: no line-up may feel stuck, so a company neither stays out nor stays away without end; and the fleet is
  never silent.
- **Stuck, in numbers:** a company is out for at most about 40 bars in one go and gone for at most about 50, at
  60 BPM (Claude's lean, taken 2026-11-20; first cuts for the sim and his ear).
- **Never silent, and the company stays whole.** When a company is the only thing playing and its time is up, the
  whole company stays out until someone else arrives; its mates do not go home and leave one robot alone, which is
  the fault being fixed (Claude's lean, taken 2026-11-20, in place of the confirmed restate's "one robot occasionally
  staying out after its mates").
- **A member moved to another journey still comes and goes with its company.** The company decides when a robot
  comes and goes; its Journey setting (Own, Company, Fleet) only changes what it plays (Claude's lean, taken
  2026-11-20).
- **The battery stays believable, not the true cause.** It falls while a robot is out and rises while it is home, and
  never looks stuck or jumps, in the readouts and in the body's battery dimming. The journey may be what calls the
  moves.
- **The battery paces itself.** It reaches empty as the company leaves and full as it comes out, instead of draining
  at a fixed rate and hovering near empty until the exit (Claude's lean, taken 2026-11-20).
- **Tempo no longer sets the pace** (Crawford, 2026-11-20: "let's fix it now. instead of trying to use the real world
  clock or something let's just say that numbers given are for 60bpm and we should scale them for faster and slower
  tempos"). Today everything is counted in bars, so a faster tempo makes robots come and go quicker (roadmap
  [90](../todo/roadmap.md#90-the-score-editable-chords-a-clock-with-two-rulers-hand-edited-parts)'s complaint). The
  pacing numbers (how long a shift and a charge last, the stuck limits) are written for 60 BPM, where a bar is 4
  seconds, and scaled by the tempo, so a shift lasts about as long in seconds at any tempo. No wall clock: the
  battery still moves on the measure tick. Two details, both Claude's leans taken on 2026-11-20: 60 BPM stays the
  reference, so a world faster than 60 gets longer shifts in bars than today; and a shift is never shorter than about
  8 bars, so a slow world always has a turn to land on and its shifts run somewhat longer in seconds.

## Style / constraint

- **Seeded behaviour, no control.** The same for a world every time it loads; nothing for the user to set, show or
  save.
- **Judged by Crawford's ear**, at a gate the spec names: a company reads as a group, and exits feel placed. The
  headless sims ([lifecycleSim.ts](../../src/systems/lifecycleSim.ts)) back it with numbers before he listens: how
  often a company's members go quiet together, how often a move lands on a turn, the spread of shift lengths, the
  robots sounding per measure, and zero silent measures.
- **Counted in measures, on the one music clock.** Docking transitions stay measure-quantized (BeatClock, never a
  timer), and battery and docking stay replayable headlessly. A journey's turning measures are a pure function of its
  key and the measure ([melodyJourney.ts](../../src/engine/melodyJourney.ts)), so reading them does not break replay.
- **Strict Separation holds.** The docking machine may call the work loop through the seam; no GSAP callback
  schedules audio. The last notes ending together is the audio side's, as the station fade is.
- Pre-v1: no "keep the existing sound" clause. Shift lengths, airtime and the sims' pinned rows are allowed to move.

## Out of scope

- **Any new user control or readout**, on the robot, the company or the fleet.
- **A designed arrangement** of who follows whom: taking turns, a relay, a handover between companies.
- **Company membership, the shared rhythm and the journey itself.** Who is in a company, what it plays and how its
  journey is drawn do not change; this reads the journey, it does not write it.
- **The journey's and the chords' own pace.** A journey's turns stay counted in bars, on the chord changes, at every
  tempo; roadmap [90](../todo/roadmap.md#90-the-score-editable-chords-a-clock-with-two-rulers-hand-edited-parts)'s
  other half (chords that last twice as long at faster tempos, a clock with two rulers) is not built here. Claude's
  reading of "scale the numbers", not asked.
- **A wall clock for the docking cycle.** Turned down by Crawford on 2026-11-20 in favour of scaling by tempo.
- **Hard guarantees.** No "always together", no "always on a turn". Only never silent is absolute.

## Known implementation notes (not yet spec'd)

- **Depends on Journey Dynamics.** Freelancers on the Fleet journey exist only on `feature/journey-dynamics`; on main
  a freelancer travels alone. This is built after 93 merges.
- **How far apart the turns are.** A scratch probe (300 journeys of 400 pairs at max time 16, run on
  `feature/journey-dynamics` on 2026-11-18; not repo code, to be re-measured by the spec's sim), in measures: any turn
  mean 7.3, median 8, p10 to p90 1 to 13; a peak median 18 (9 to 31); a turn at home median 28 (12 to 70); a drop
  median 32 (8 to 100).
- **The mechanism.** Two shapes came up before the interview: the battery arms and the turn fires (a robot at critical
  or at full waits for the next turn, with one battery per company); or the journey schedules the shifts outright and
  the battery is a gauge. "The battery paces itself" points to the second: a battery can only arrive at empty on the
  exit if the exit is known ahead. Claude's reading; the spec chooses.
- **Tempo scaling meets turns counted in bars.** With the pace written for 60 BPM, today's shift of 11 to 23 bars
  (44 to 92 seconds at 60) becomes 37 to 77 bars at 200 BPM and 4 to 8 at 20, while a journey turns every 8 bars or
  so and finishes a big move every 18 or so at any tempo. So a fast world has many turns to choose from in a shift
  and a slow one has one or none. The spec says what gives at slow tempos (a least shift in bars is Claude's lean),
  whether 60 is the tempo at which today's pace is right (Classic worlds seed 40 to 100 BPM, so most would get longer
  shifts in bars than today), and what a tempo change in mid-shift and a replay read.
- **Ending together needs a lead.** For a company's last notes to land together, each member's recall goes out ahead
  by its own trip home (the job in hand, then the swim), and the members hold at their ports until a shared bar line.
  The hold at the port and the fade to the bar line exist (`stationFadeSystem.ts`, `STATION_FADE_MIN_STEPS`); a lead
  in seconds turned into measures at the live tempo, and a hold longer than one measure, do not. Wall-clock swim times
  must not enter the replayed docking state (the reason backlog 84 did not move the landing).
- **The size of a move** is read from the journey's shares, which a company's members share, not from one robot's
  scaled pairs (two shares can round to one intensity at a low max intensity). The spec sets the curve from move size
  to the chance of a group exit between the two ends given above, and how the draw is seeded.
- **Which journey a member follows.** A member comes and goes on its company's journey whatever its own Journey
  setting, so the docking reads the company's key, not the robot's. A robot with a max intensity of 0 still has
  turning measures.
- **The stay-up rule** holds the last robot today. It becomes the last group: the spec says how a company is held
  whole, what "someone else arrives" counts (one freelancer, or a company), and what a freelancer's stay is.
- **The stuck limits** (about 40 bars out, about 50 gone, at 60 BPM) are first cuts; the spec's sim measures what
  they do to the robots sounding per measure before they are pinned.
- **The sims' pins move.** The drain rows and the cover rows in `lifecycleSim.test.ts` are re-pinned in the commits
  that move them, and the cover sim gains per-company rows.
