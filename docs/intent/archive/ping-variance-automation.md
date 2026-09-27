# Intent: Ping Variance Automation (Audio Swells master control)

Confirmed via `/interview-me`, 2026-09-01. Replaces `audioSwellsEnabled` — the Sector Settings "Enable automatic effects" toggle (lore label `ENABLE DYNAMIC PING DEPLOYMENT`, shipped as part of [docs/intent/audio-swells.md](audio-swells.md)) — with a continuous slider. Not a new feature; a reshaping of the existing Audio Swells system's one master control.

## Outcome

A single 0–100% slider, **Ping Variance Automation** (lore label; human label still pending), replacing the boolean toggle entirely — relocated from the Sector Settings drawer to a bare control at the bottom of the Audio Rig drawer (below the seven effect accordions, not inside a new accordion of its own — it's a Rig-wide meta-setting, not an effect module). It still governs **both** pools (global-effect swells and robot-attribute swells, including company-wide) exactly as the old boolean did.

Instead of a flat on/off, the slider's value scales down how far *newly created* swells are allowed to travel: at 100%, swells reach their normal full peak (today's unmodified behavior); at 50%, a swell that would have swung 60% of its attribute's range only swings 30%; at 0%, no new swell starts at all, and every in-flight swell is actively walked back to its base value rather than left to finish naturally.

## User

Same audience as the toggle it replaces: anyone tuning the ambient soundscape from the console's Audio Rig. The dial now reads as "how much is the mix allowed to wander," not just "is it wandering or not."

## Why now

The binary toggle was too blunt — reconsidered after shipping the original Audio Swells feature. A continuous dial lets someone taper the amount of automation instead of an all-or-nothing switch, and it belongs physically alongside the other Rig controls it's shaping rather than off in Sector Settings, where it originally landed only because Audio Swells shipped with "no new UI."

## Success

- **Both pools governed.** No behavior split between global-effect swells and robot-attribute swells — the slider is one master dial over the whole system, same scope the old boolean had.
- **Seeded default.** Loads to a value drawn (via `getSeededVal`) somewhere in `[33, 66]` per fresh Attenuation Style — the same bounded/legible-default convention every other seeded Rig field already follows (e.g. Delay's ~25% enabled-on-load chance). Freely draggable across the full `[0, 100]` range afterward; the 33–66 band is only where it starts.
- **Magnitude scaling, baked in once.** For any newly created swell, its peak magnitude is multiplied by the slider's value as the *last* step of that swell's peak calculation — after direction is picked, after the default 50%-of-range magnitude rule (or an attribute's own exception: the detune swing cap, Volume's downward floor, the HPF/LPF frequency ceilings). Safe by construction: multiplying an already-clamped delta by a fraction in `[0, 1]` only ever shrinks it toward the current value, so it can never push a peak past a bound an earlier clamp already enforced. This value is fixed at swell creation — moving the slider again does not retroactively rescale a swell already in flight.
- **0% is a full stop, not just a magnitude of zero.** At exactly 0%: no new swell starts (not "starts with peakDelta 0"), and every currently in-flight swell is forced into its falling phase from wherever it currently sits, riding its own already-drawn `fallingMeasures` back down to base — reusing the same interpolation math a swell already uses to end a normal cycle, not a new instant-snap or separate return-timing concept.
- **Forced returns aren't undone.** Once a swell has been forced into its return at 0%, moving the slider to a new nonzero value before that return completes does not interrupt, reverse, or resume normal automation for that swell — it keeps riding out the return it already started.

## Constraint

- Reuse existing mechanics wherever possible: the same falling-phase interpolation for a forced return, the same "last step in the peak-calculation pipeline" shape every other per-attribute clamp already uses (Volume's floor, the detune cap, HPF/LPF ceilings).
- Must stay `BeatClock`-driven and seeded — no new timer mechanism, no `Math.random()`, consistent with the rest of Audio Swells (`docs/specs/AUDIO_SWELLS.md` §1.4, §3).
- The old boolean control is fully replaced, not kept alongside the new slider — one control, relocated and reshaped, not two.

## Out of scope

- `SWELL_TRIGGER_CHANCE` / `SWELL_COMPANY_CHANCE` — untouched. This slider shapes the magnitude of a swell that has already been decided to trigger; it has no effect on whether one triggers.
- The exact human-facing label — not yet decided; lore label (`Ping Variance Automation`) is confirmed, human label is still pending from the user.
- The exact internal storage domain (0–1 fraction vs. 0–100 integer) — an implementation detail for Spec/Plan, not a behavior decision made here.
- Live/continuous rescaling of an in-flight, non-zero-phase swell's peak when the slider changes mid-ramp — explicitly not wanted; see "Magnitude scaling, baked in once" above.
