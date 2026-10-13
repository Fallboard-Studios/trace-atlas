# Intent: Job Decorations

Confirmed 2026-10-12 via the interview-me skill (4 questions, every guess confirmed). Builds on
shipped Phase 43 (robot jobs; the five moves in `src/animation/jobMoves/`, documented in
[ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md#job-moves)) and on the halo-waves precedent
(`src/components/robot/gem/haloWaves.ts`, branch `various-small-fixes`). Sketch, with Crawford's
settings as the defaults and Verdict 1 in its header:
[docs/sketches/job-decorations.html](../sketches/job-decorations.html). Spec: next (not yet written).

- **Outcome:** The six sketched decorations built onto the live `work-${robotId}` job timelines at
  the sketch's settings — each a pure maths module plus per-run SVG nodes created at job start and
  removed on complete or stop, driven by proxy tweens on the job timeline so seeks and the silent
  finish land exactly.
- **User:** Crawford, watching the world — a job should be tellable from across the scene and feel
  alive up close.
- **Why now:** The orbiters' jobs already read as work; they lack the small flourishes the halo
  waves gave the station arcs.
- **Success:** Each decoration matches the sketch at its defaults; nothing pops at a move boundary
  or the reattach; every orbiter ends at rest for the reattach; the Pixel still plays clean.
- **Constraint:** Identity colour plus the gem light colour only; gradients allowed, no SVG
  filters. Timelines never touch AudioEngine (Strict Separation). Decorations live in the robot's
  frame, so they scale with the back row (0.75×) for free. Reduced motion draws none of them. If
  the perf gate misses, the decorations tier down by the Audio Load Budget (Light none, Standard
  the cheap ones, Full all) — never the fleet, its audibility or count.
- **Out of scope:** Cards and the detail avatar (they keep their orbiters attached); per-run or
  audio-driven variation; any change to the moves' timing or targets; any new dependency.

## The six rows (sketch defaults = Crawford's settings)

| Job | Decoration | Defaults |
|---|---|---|
| ventExtraction | tether wires orbiter → mouth, brightening from the mouth on that orbiter's pulse; motes rise off the mouth, shrinking | wire opacity .5, width 1.8; 3 motes per pulse, rise 40, life 1.8 s, radius 3.4 |
| acousticSurvey | on each fan ping, arcs leave the orbiter facing away from the mast, widening and thinning; during the ring the orbiters are wired into a polygon bright at the vertices | reach 36, life 1.4 s, span 80°, 3 arcs; chord opacity 1, width .6 |
| structuralInspection | a scan trail behind each orbiter along the outline; the leader leaves a tick at every vertex that fades | trail 20 u, width 4, opacity 1; tick 6 u, life 3 s |
| fluidMonitoring | droplets follow the lead orbiter along the pipe, each a lag behind; at the valve a square spins, stepping up with every pulse | 10 droplets, lag .33 s, radius 3; valve 14, spin 90 °/s + 90 per pulse |
| salvage | a gem load hangs on wires between the orbiters: grows at pick-up, swings on the carry, shrinks at the drop; wires go slack and fade on the return | hang 24, load 12, swing 10°, wire opacity 1, sag 16 |
| maintenance | on each flicker chord, line sparks fly outward from the ring, shrinking and fading, with a flash at the orbiter | 5 sparks, reach 30, length 8, life 1.2 s, spread 120°, flash 12 |

## Per-robot variation

Fixed per robot, drawn from the **end** of the existing `${gemSeed}:work` Alea stream (after
`sparks`; no existing draw moves), so it is deterministic, replay-safe and free. **±15 % on two
knobs per row**, the size-ish one and a timing one:

| Job | Varied (±15 %) |
|---|---|
| ventExtraction | mote rise, mote life |
| acousticSurvey | ping reach, ping life |
| structuralInspection | trail length, tick life |
| fluidMonitoring | droplet lag, valve size |
| salvage | hang depth, load size |
| maintenance | spark reach, spark life |

Counts and opacities never vary (a count can't do 15 %; opacity drift reads as a bug).

## Decisions easy to get wrong later

- The brief said "small"; Crawford's chosen settings are big (most knobs at or past their first
  slider range). Build at his numbers, not the brief's adjective.
- Variation is per robot, not per run and not audio-driven — the latter would collide with the
  Visual Mapping guardrail's "only through the listed dials".
- Decorations scale with the row like the orbiters; no scene-level counter-scaled layer.
- A perf miss cuts decorations by load tier, never robots.
