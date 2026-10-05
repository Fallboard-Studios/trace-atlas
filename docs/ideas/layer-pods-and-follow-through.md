# Layer Pods and Follow-Through

> **Superseded (2026-10-05)** by [gem-polygon-robots.md](gem-polygon-robots.md) (roadmap Phase 39): the gem robots' four orbiters take the place of pods, and their motion is that idea's Branch C. Kept as the record.

> **Re-sequenced (2026-10-03); static half shipped (Phase 38), motion remains.** The parametric
> hull this depended on is set aside. The static half of this idea (a marker per audible layer, no
> motion) is branch 3 of [robot-visual-rework.md](robot-visual-rework.md) — shipped as
> [docs/specs/ROBOT_LAYER_MARKERS.md](../specs/ROBOT_LAYER_MARKERS.md). The motion half (orbits,
> trailing, lean) remains a later branch on top of those markers. Kept as the idea-stage record.

Refined 2026-10-02 via the idea-refine skill. Third of three sequenced branches:
world-palette-pull → parametric-robot-hull → layer-pods-and-follow-through. Depends on the
parametric hull landing first.

## Problem Statement

How might we give robots parts that orbit or trail the hull, with motion that feels fluid,
without a per-frame loop and without regressing the roadmap 17.2.5 idle-paint work?

## Recommended Direction

Each nonzero-gain oscillator layer beyond the base (`AudioAttributes.layers[1..]`) becomes a
**pod** (Crawford's call, 2026-10-02: pods carry audio meaning, not decorative). Mapping:

| Visual | Driver |
|---|---|
| Pod present | layer `gain > 0` |
| Pod radius | layer gain |
| Orbit wobble / eccentricity | layer detune |
| Starting angle on orbit | layer phase |

Setting a layer's gain to zero removes its pod — matching the shipped gain-zero-is-mute rule
(Coaxial/Harmonic "Active" toggle removal, 2026-09-03).

Orbits are GSAP timelines registered in `timelineMap`, one per robot, repeating. On a swim, the
pods trail the hull by a short delay inside the swim timeline and overshoot on arrival. The hull
gains a small lean into the swim direction and a slow idle drift, replacing the deleted
propeller spin. All of this stays inside the "GSAP for animation, no `requestAnimationFrame`
loops, timelines never call AudioEngine" rules.

## Key Assumptions to Validate

- [ ] Up to 24 extra orbit tweens plus trailing tweens do not show up in the perf harness.
      Test: `npm run perf` before and after on the same session, following the measurement
      hygiene rules (foreground, one call at a time, no orphaned Chrome, A/B same session).
- [ ] Pods flipping with the hull's `scaleX` look right when the robot turns. Pods live inside the
      robot `<g>`, so they flip for free, but orbit direction reverses — decide in the sketch
      whether that is acceptable.
- [ ] Pod add/remove on a live gain edit can be animated, not popped. Needs a mount/unmount tween
      keyed on layer presence.
- [ ] Roughly how many robots in a typical seed have zero extra layers. If most do, pods are rare
      and the feature is quiet — check `spawnSystem.ts` layer odds before building.

## MVP Scope

- Pod rendering from layers.
- Orbit timelines in `timelineMap`.
- Swim trailing and arrival overshoot.
- Hull lean and idle drift.
- Pods settle onto the hull when the robot docks.
- Perf harness run as the exit gate.

## Not Doing (and Why)

- Decorative seeded pods — rejected: an audio edit could never add or remove one.
- A guaranteed minimum pod — rejected with the above; a base-only robot is a lone hull.
- Pods carrying the identity color — the lamp and rim already do; keeps the guardrail carve-out
  narrow.
- Pod collisions or avoidance — complexity with no audio meaning.
- Per-note light flashes — would mean state churn per sixteenth note across 12 robots; the BPM
  breathe period (parametric hull branch) covers "musical" lighting.

## Open Questions

- Docking: pods settle onto the hull (recommended), hover above the dock, or fade?
- Orbit period: fixed, seeded, or tied to the transport BPM like the lamp breathe?
