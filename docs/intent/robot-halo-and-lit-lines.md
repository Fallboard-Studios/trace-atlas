# Intent: Robot Halo and Lit Boundary Lines

Confirmed 2026-10-05 via the interview-me skill (4 questions after a planning conversation; guesses
confirmed except where noted under "Corrections"). Builds on shipped Phase 39
([gem-polygon-robots.md](gem-polygon-robots.md)) and on Phase 40
([orbiting-polygons.md](orbiting-polygons.md), in development — Task 1 of 16 done). This is the
"Top/Mid pass" the Phase 40 intent reserved, reshaped: two of the original four asks were cut
before the sketch (see "Cut"). Sketch: [robot-halo-and-lit-lines.html](../sketches/robot-halo-and-lit-lines.html)
("these all look great", 2026-10-05 — its defaults are the numbers below).

- **Outcome:** Each gem robot gains a company-coloured halo behind its Mids, shaped by its envelope
  and sized by its volume; lit strips on the Top and Mid boundary lines, widened by that layer's
  gain-LFO depth; a two-second out-of-step flicker on any strip whose driving attribute changes; and
  a slow bright ring on the halo that runs outward during an orbiter spawn arc and inward during a
  despawn arc.
- **User:** Crawford and anyone watching the world — a robot's company, loudness, envelope and
  modulation become readable at a glance.
- **Why now:** Phase 39 gave the robots a body, Phase 40 gives the orbiters motion; this is the pass
  the Phase 40 intent set aside for the Top and Mids, after cutting drift and bevel changes for perf
  and guardrail reasons.
- **Success:** The sketch's default settings reproduced live (table below), on the world and the
  robot-detail avatar; cards show the halo and strips static; an idle-paint `npm run perf` gate like
  Phase 40's passes.
- **Constraint:** GSAP child timelines inside the robot `<g>`, registered in `timelineMap`; no
  BeatClock, no AudioEngine calls; no SVG filter or blur anywhere (the gradient stops alone carry the
  softness); no new per-frame motion beyond the ripple while an arc runs; no change to Phase 40's arc
  timing or to the generator's geometry (line widths stay inside the existing 0.35-unit clearance).
  Seeded choices derive from `gemSeed`. `prefers-reduced-motion`: no flicker, no ripple; the halo
  still tweens (duration 0). Company colour is a new non-audio visual input, so the Visual Mapping
  guardrail gains one line.
- **Out of scope:** Top/Mid drift from detune; bevel depth from phase; animating the 64 px cards;
  the rest of the "other settings" inventory raised 2026-10-05 (waveform, sustain, decay, filter
  frequency, detune-LFO links, lane tint, pulse width, audio mode, jobs, melody content) — each a
  candidate for a later pass, none decided.

## Rules

| Feature | Source (range) | Rule |
|---|---|---|
| Halo colour | `companies[].color` of the robot's `companyId`; none → `identityColor` | One hex, same shape as identity; a freelance robot glows in its own card colour |
| Halo radius | `masterVolume` (0–1; seeded 0.65–0.85) | 20 + 20 × volume → 20–40 units; 0.5 s tween on edit |
| Halo shape | seeded width factor | Ellipse: rx = radius × k, ry = radius; centred on the canvas centre |
| Halo slot | — | Above the backing, below the orbiters' rest copies (and the Mids); behind the Mids by DOM order |
| Halo brightness | `adsr` (attack/decay/release 0–5 s, sustain 0–1) + fixed hold | Radial stops, radius read as time: 0 inside the 10-unit hole; up to the peak at the end of attack; down to peak × sustain over decay; flat over a fixed 1 s-equivalent hold; out to 0 over release. Shares are each phase's seconds over the total (attack + decay + hold + release); an all-zero envelope falls back to four equal shares |
| Halo peak | constant | 0.55 opacity cap, so the halo never swamps the lit Mids |
| Halo overlays | battery, daylight | Battery dim multiplies the halo's opacity (same tiers as the lights); daylight does **not** touch it |
| Top/Mid line width | that layer's gain-LFO link depth (`lfoLinks['layerN.gain'].depth`, 0–100); Top = layer 0, Mid left = layer 1 (Coaxial), Mid right = layer 2 (Harmonic) | 0.3 + 0.4 × depth / 100 → 0.3–0.7; a link with `lane: null` reads as depth 0; immediate on edit |
| Top/Mid strip | constant | New centre stroke in `palette.light`, ⅓ of the line width, opacity fixed 0.6, round caps; emissive like the lights (no daylight), battery-dimmed like them |
| Orbiter lines/strip | Phase 40 §1.1 | Unchanged: width (3 + Note Variance) / 10, strip 0.35 + 0.65 × Pitch Repeat / 100 |
| Flicker | any edit to the attribute a strip is tied to | That strip only: 3–5 blinks seeded per line (pattern re-drawn each run), each ≈ 0.1 s dipping to opacity 0, placed anywhere in the 2 s after the edit; a further edit restarts the window; never in unison across lines |
| Flicker triggers | — | Top ← layer0.gain depth or lane; Mid left ← layer1.gain depth or lane, layer 1 gain; Mid right ← layer2.gain depth or lane, layer 2 gain; all shown orbiters ← Note Variance, Pitch Repeat |
| Ripple | Phase 40 spawn / despawn arcs | A second ellipse over the halo with a narrow bright ring (width 0.08 of the radius, opacity 0.9, the halo's colour). Spawn: the ring runs from the hole edge to the outer radius, repeating until the orbiter is home. Despawn: from 95 % of the radius in to the hole edge, repeating until the orbiter is hidden. Whole cycles per arc: `max(1, round(arcDuration / 2.5 s))`, so the last ring lands with the orbiter; the ring fades in and out over the arc's first and last 10 %. The base halo dims by 0.25 while a ripple runs |

### Render contexts

- **World:** full behaviour.
- **Robot-detail avatar:** full behaviour; Phase 40's `gemMotionViewBox` already pads the frame, and
  the largest halo (radius 40, rx 80 at k = 2) stays inside the canvas, so no further padding.
- **Selection cards (64 px):** halo and strips at their current values, static; no flicker, no ripple.

### Guardrail amendment (CLAUDE.md, `.github/copilot-instructions.md`, `Robot.ts`, ROBOT_DESIGN.md)

Phase 40's rewrite ("Audio and composition settings reach the body only through the dials listed in
ROBOT_DESIGN.md …") already admits new dials without rewording. This pass adds the company colour as
a fifth non-audio input beside identity, seed, daylight and battery (ROBOT_DESIGN.md "Forbidden
patterns" names the list), and ROBOT_DESIGN.md's dial list gains the halo, the Top/Mid strips, the
flicker and the ripple.

## Cut before the sketch (Crawford, 2026-10-05)

- **Top and Mid drift from detune (±5 units)** — "performance is already being pushed"; Phase 40's
  drift on four orbiters is already the one real idle-paint risk.
- **Bevel depth from phase, with the line-replacement sequence** — lines and lights are generated
  against the inner polygon, so a bevel change would reposition them; that is a second guardrail
  amendment (seeded, permanent line layout) and a generator rework. Dropped.

## Corrections during the interview

- Strip opacity source for Top/Mids: a pasted readout showed the "layer gain" source and was taken as
  the choice; Crawford then clarified the paste was meant to carry only the ripple pace. **Fixed 0.6
  stands** (first answer), and line widths stay at the sketch's 0.3–0.7 (the pasted 1.3–1.4 widths
  were not a choice).
- Ripple pace: "the most important thing was keeping the ripple slow" — 2 cycles over a 5 s arc in
  the sketch. Phase 40's arcs (2–4 s) are **not** lengthened; the preferred period is ≈ 2.5 s, so
  shorter arcs get a single slow ring.

## Facts checked against the code (2026-10-05)

- `Company.color` is a required single hex (`types/Company.ts`); `Robot.companyId` is optional;
  companies live on the locale (`localeStore`), so the lookup sits outside `RobotBody`'s audio memo
  like daylight.
- `Robot.masterVolume` is stored 0–1 (display 0–100 %), seeded 0.65–0.85 (`spawnSystem.ts`).
- `ADSREnvelope` has attack/decay/sustain/release; spawn ranges 0–5 s, 0–5 s, 0–1, 0–5 s. There is no
  hold field — hence the fixed hold constant.
- `ROBOT_LFO_TARGET_IDS` is the six `layerN.gain` / `layerN.detune` ids; `LfoLink` is
  `{ lane: LfoLaneId | null, depth: 0–100 }` (`types/lfo.ts`, `LFO_DEPTH_MIN/MAX`).
- Nothing in `src/` uses an SVG `radialGradient` or `filter` today; the halo is the first gradient.
- Phase 40 (unbuilt): the strip path, the line-width prop, the composition memo, `useOrbiterMotion`'s
  arc start/end and `gemMotionViewBox` are the pieces this pass depends on — build after it.
