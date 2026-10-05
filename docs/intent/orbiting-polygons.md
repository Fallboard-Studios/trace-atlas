# Intent: Orbiting Polygons

Confirmed 2026-10-05 via the interview-me skill (13 questions; guesses confirmed except where noted
under "Corrections"). Builds on shipped Phase 39 ([gem-polygon-robots.md](gem-polygon-robots.md));
replaces Branch C of [docs/ideas/gem-polygon-robots.md](../ideas/gem-polygon-robots.md) — orbiter
motion is driven by composition settings, **not** LFO links, and not by BPM.

- **Outcome:** Gem-robot orbiters come alive — they drift near their corners, occasionally orbit
  the robot on an x, y or z ring, and enter/leave by passing behind it. Count, size, line and
  timing come from the robot's composition settings.
- **User:** Crawford and anyone watching the world — a robot's orbiters show its rhythm and range at
  a glance.
- **Why now:** Phase 39 drew the orbiters but left them static; they were always meant to move, and
  what drives them is now decided.
- **Success:** In the world and on the robot-detail avatar, orbiters drift, orbit, spawn and despawn
  as below with no pop-in; selection cards show the correct static layout; robots no longer flip
  on direction change; idle paint passes an `npm run perf` gate like Phase 39 Task 9.
- **Constraint:** GSAP child timelines inside the robot `<g>`, registered in `timelineMap`; no
  BeatClock, no AudioEngine calls, no React-owned transform on anything GSAP moves. Seeded choices
  derive from `gemSeed`. Orbiters never rotate (the existing 5° swim tilt of the whole robot is
  accepted). `prefers-reduced-motion` turns off drift and orbits; spawn/despawn become a short
  fade at the corner. Guardrail rewritten into the general form below.
- **Out of scope:** Top/Mid oscillator-driven rules (a separate pass next); job animations; the
  idle "bob" on entering idle (does not exist today — backlog); LFO → orbiter links (dropped for
  good); animation on the 64 px selection cards.

## Rules

| Dial | Source (range) | Rule |
|---|---|---|
| Count | `rhythmicDensity` (0–100) | <25 → 1, ≤50 → 2, ≤75 → 3, 76+ → 4 |
| Size | Phrase Length = `rhythmicMotifLength.value` (0–8) | Uniform scale 0.75× → 1.25× (1.0× at 4), 24×16 proportions kept; 0.5 s tween on edit |
| Boundary-line width | `noteVariance.value` (0–8) | (3 + v) / 10 → 0.3–1.1 (today's fixed 0.8 sits inside) |
| Line light strip | `pitchRepeat` (0–100) | New centre stroke in `palette.light`, ⅓ of line width, opacity 0.35 → 1.0 (floor keeps it visible at night); not battery-dimmed |
| Gap between orbits | min octave (1–7) | 15 + 2 × min octave → 17–29 s; per orbiter, at most one orbit per gap |
| Orbit duration | max octave (1–7) | 2 + (max − 1) / 2 → 2–5 s; overlaps the swim freely |
| Drift | seeded | ±2–3 units x/y around the corner, 3–6 s sine cycle, per-orbiter phase; no rotation, no scale change; continues while swimming (no lag/trail) |

### Count changes (spawn / despawn)

- Each robot has a seeded corner order (from `gemSeed`); n orbiters fill the first n corners.
  Spawning adds the next corner; despawning removes the most recent (last in, first out).
- All four orbiter polygons are still derived from the seed — a returning orbiter is the same shape.
- **Despawn:** triggers an x or y orbit; the orbiter disappears as it crosses the canvas centre on
  the *behind* half.
- **Spawn:** appears at the canvas centre (behind) and plays the remaining half-orbit out to its corner.
- Rapid edits queue (a debounce is fine): each change waits for the previous arrival/departure.

### Orbit paths

> **Superseded at Gate 1 (2026-10-05)** — kept as the interview record. The three axis rings below
> ran along the canvas edges and never passed the body; the shipped rule is the single paired
> corner→centre hoop in "Corrections at Gate 1" and spec §1.2. Do not implement from this list.

All centred on the canvas centre, starting and ending at the orbiter's own corner, eased in/out
at the corner; axis and direction (CW/CCW) are a seeded pick per orbit.

- **y ring (horizontal):** travels to the mirrored x on the far side and back, y fixed. Behind half:
  drawn below the backing, ~0.8×, slightly dimmer. Front half: drawn above the Top, ~1.15×.
- **x ring (vertical):** the same along y.
- **z ring:** one full circle in the screen plane at the corner's distance from centre; no depth
  change; stays at today's z (between backing and Mids).

### Render contexts

- **World:** full behaviour.
- **Robot-detail avatar:** full behaviour (it's a single robot); its viewBox needs margin for a full
  orbit and the 1.15× front scale so nothing clips.
- **Selection cards (64 px):** static resting layout — correct count, size, line width and strip
  brightness — no drift or orbit; count changes simply update.

### Flip removal

Robots have no discernible front any more, so they stop mirroring on direction change: drop the
`scaleX: ±1` set in `Robot.tsx` and the 0.5 s orientation phase in `swimAnimation.ts`.

### Guardrail rewrite (CLAUDE.md, `.github/copilot-instructions.md`, `Robot.ts`, ROBOT_DESIGN.md)

The shipped wording ("No count, side, line or position may change on an audio edit") forbids
density-driven orbiter count. Rewrite into a general form the Top/Mid pass can extend without
another rewrite: audio may drive only the dials listed in ROBOT_DESIGN.md; the backing, Mids and
Top keep seeded, permanent polygon count, sides and boundary-line layout; orbiters may enter and
leave, animated, never popping. ROBOT_DESIGN.md's dial list gains the orbiter dials above.

## Corrections at Gate 1 (the motion sketch, 2026-10-05)

Judged live in [docs/sketches/gem-polygon-robots.html](../sketches/gem-polygon-robots.html)'s
Motion panel; the table above is kept as interviewed, these amend it. Spec:
[docs/specs/ORBITING_POLYGONS.md](../specs/ORBITING_POLYGONS.md).

- **Orbit paths:** the x / y / z rings ran along the canvas edges and never passed the body. There is
  one ring: from the orbiter's corner along the line toward the canvas centre, through the body to
  the far side and back — behind the body one way, in front the other. The line's angle is the
  corner's own angle toward the centre (≈ 49° on a square canvas, flatter on wide ones).
- **Paired:** a solo orbit's far point is exactly the diagonal partner's resting spot, so it clipped
  through it. Orbits run per diagonal pair (TL+BR, TR+BL): both ride the same hoop π apart, meet at
  the canvas centre (one behind, one in front) and swap corners. A lone orbiter orbits alone.
  Chosen over "the stationary one moves aside" and "make the orbit bigger".
- **Variety** comes from the hoop's seeded openness (0 → 0.3, an edge-on line fattening into a thin
  ellipse) and its direction, not from a tilt of the line.
- **Spawn / despawn:** always the exact centre line, openness 0, drift faded to zero, so the orbiter
  is fully behind the backing at the instant it vanishes or appears — with any offset it could be
  seen disappearing. One arc at a time per robot; the queue works on an explicit shown set.
- **Speeds:** orbit duration 4 → 8 s (was 2 → 5: "too fast, down by at least 50 %", then "top speed
  fine, bottom range up 20 %"); drift cycle 6 → 10 s (was 3 → 6). Gap 17 → 29 s per pair, unchanged.

## Corrections during the interview

- Orbit duration: the literal "2 + max octave" gave 3–9 s; Crawford wanted ~2 s up to ~5 s.
- Line width: the literal "3 + Note Variance" gave 3–11 units on a 24×16 orbiter; scaled by /10.
- Avatar: first agreed static; corrected — the detail avatar animates, only cards stay static.
- "Keep the flip" read as *keep the flip removal in scope* (robots stop flipping).

## Facts checked against the code (2026-10-05)

- Orbiters are four `<g class="gem__orbiter--tl|tr|bl|br">` in `gem/RobotGem.tsx`, drawn after the
  backing and before the Mids, each with a React-owned `translate(...)`.
- Swim cycle (`animation/swimAnimation.ts`): idle delay → destination → 0.5 s scaleX flip → swim at
  120 px/s `sine.inOut` with a 5° tilt in/out → idle. No bob exists.
- Ranges: `RHYTHMIC_DENSITY` 0–100, `NOTE_VARIANCE` 0–8, `OCTAVE_RANGE` 1–7 (`constants/index.ts`);
  `rhythmicMotifLength.value` and `pitchRepeat` per `types/Robot.ts`. Boundary lines today are a
  single 0.8-unit stroke in a darker tone of the host colour — no light strip exists yet.
