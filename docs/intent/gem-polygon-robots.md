# Intent: Gem Polygon Robots — Branch A

> **Shipped (roadmap Phase 39, 2026-10-05)** — spec [docs/specs/GEM_POLYGON_ROBOTS.md](../specs/GEM_POLYGON_ROBOTS.md), plan [docs/tasks/GEM_POLYGON_ROBOTS.md](../tasks/GEM_POLYGON_ROBOTS.md). Gate 1 (sketch) and Gate 2 (live) passed; the idle-paint gate closed with 3 facet tones on an accepted residual. Branch `back-to-gen-robots`.

Confirmed 2026-10-04 via the interview-me skill (four questions, each guess confirmed), from
[docs/ideas/gem-polygon-robots.md](../ideas/gem-polygon-robots.md). Branches B (signal chain) and
C (motion) have their own intent passes later, gated on this one shipping.

- **Outcome:** Gem-polygon robots replace the four hand-drawn shapes — but only after a standalone
  sketch of 12 seeded, rulebook-bound robots passes Crawford's eye test.
- **User:** Crawford, judging the aesthetic; the player sees nothing until the swap lands.
- **Why now:** The current robots don't match the console, blur together, and feel lifeless — and
  the aesthetic itself is being explored, not fixed.
- **Success:**
  - Gate 1 — the sketch ([docs/sketches/gem-polygon-robots.html](../sketches/gem-polygon-robots.html):
    12 robots, the real generator, real identity colours, on console chrome, at world scale / 96 px
    / 64 px) gets a gut "yes, this matches the UI". Distinctness at 64 px and size-consistency are
    looked at in the same pass but a miss there is a generator tweak, not a gate failure.
  - Gate 2 — the live app shows the new robots everywhere (world, detail avatar, card); the old
    shape / greeble / socket / slot code is gone; the identity guardrail is rewritten in
    ROBOT_DESIGN.md, CLAUDE.md and `.github/copilot-instructions.md`; suite green.
- **Constraint:** The polygon rulebook is binding from the first sketch (the rules *are* the
  aesthetic under test); geometry is seeded and permanent; audio touches only the two lights, Mid
  lit state and scale; GSAP still owns the root `<g>`; nothing from Branches B/C leaks in.
- **Out of scope:** Audio → geometry / bevel mapping; orbiter enter/leave and any motion; the
  angle-dialect question; Mid colour beyond "lit or dark"; the 6-targets / 4-corners question.
  If the sketch fails, Branch A stops there with the sketch kept as the record.

## Interpretations made while building the sketch

- "Each boundary of the polygon canvas has ≥1 touch point" is read as each polygon filling *its
  own* bounding box (Top 32×32, Mid 20–24×34–36, …), not the robot canvas.
- "Angles less than 90°" on Top/Mids/orbiters is read as concave corners, produced by a slanted
  step cut into a corner (one concave corner + one right angle each), matching the step on the
  Top polygon in Crawford's drawing.
- One light direction (top-left) for every facet on every robot; the drawing hatched two opposite
  corners, the sketch deliberately does not.
