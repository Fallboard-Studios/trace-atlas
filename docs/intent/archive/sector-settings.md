# Intent: Sector Settings (Roadmap Phase 5)

Confirmed via `/interview-me` on `main`, 2026-08-25. This is the "why" behind Phase 5's scope in
[docs/todo/roadmap.md](../todo/roadmap.md#5-sector-settings) — read that first for the
file-level deliverables; this doc resolves the decisions its prose left open. **Depends on
[Locale Seed Decoupling](locale-seed-decoupling.md)** landing first — this feature's core
guarantee (see Success, below) isn't achievable on today's planet-coupled locale noise map.

## Outcome

Sector Settings becomes the console's world-control panel, replacing `ConsolePanel.tsx`'s
`settings` stub. `src/data/sectorSettingsConfig.ts` defines `ControlSchema` data plus preset
lists for two panels, and `SectorSettingsDrawer.tsx` renders a status header (active plot
coordinates + planet name/seed) above both:

- **Planet Calibration** — a `TextInput` for the planet name (the name *is* the seed, per
  `derivePlanetSeed` — there's no separate "seed" field distinct from the name), pre-populated
  with the current planet's name, plus a hand-curated ("promoted") list of lore-flavored preset
  names and a "random" option, both authored as static data in the config file.
- **Plot Tuning** — a `CoordsInput` for locale X/Y, pre-populated with the current locale's
  coordinates, plus its own promoted-preset/random list of interesting coordinate pairs.
  **Coordinates are integers, system-wide** — decided once the decoupling prerequisite made
  it safe: the new coordinate-hash seeding works identically for integers and floats (no
  entropy loss, unlike the old simplex-sampled derivation), `x`'s only other consumer
  (`computeLocalTime`, `src/constants/time.ts`) degrades gracefully to a 4-minute-per-unit
  time granularity, and the status header/`TransportBar` already round coordinates for
  display today. `CoordsInput`/`TextInput` reject or round non-integer entry rather than
  silently accepting decimals; `LocaleCoordinates.x`/`y` stay typed `number` (no native TS
  int type) but every write path enforces the integer constraint.
- **One shared retransmit `Button`** — not two independent triggers, despite the roadmap prose
  listing a trigger under each panel. Submitting reads whichever field(s) the user actually
  edited, and — this is a deliberate refinement over the first draft of this intent — **edits
  the user made to whichever half didn't change are preserved, not reset**:
  - **Coordinates changed, planet name unchanged:** the current planet is left completely
    untouched — `currentPlanetId` never changes, so any edits the user made to it (Audio Rig
    settings, global LFOs) survive exactly as they were. A new locale is created at the new
    coordinates (fresh robots/actors, generated deterministically) and the old locale is
    released (its robots' reserved audio voices/melodies cleaned up) and discarded.
  - **Planet name changed, coordinates unchanged:** a brand-new planet is created using the
    typed name as both display name and seed (`dayStartTimestamp`/`currentHour` recompute fresh,
    genuinely a new planet — its Audio Rig/global LFO settings reseed from the new planet's own
    seed, since there's nothing to preserve for a planet that didn't exist a moment ago). The
    **current locale is not discarded or regenerated** — it's re-parented onto the new planet
    exactly as it is (same robots, same actors, any edits the user made through the existing
    robot editor survive), because Locale Seed Decoupling already made locale-generated content
    a pure function of `(x, y)` coordinates, independent of which planet owns it. The old planet
    record is discarded.
  - **Both changed:** a full reset — nothing is eligible for preservation since neither of the
    two rules above applies. Fresh planet, fresh locale, both discarded from the old world.
  - **Neither changed:** a genuine no-op. Under the two rules above this is really both
    preservation conditions holding at once, so retransmit does nothing at all rather than
    silently regenerating an identical-looking world.

## User

Crawford, exploring different generated worlds and locales from one console panel instead of
editing store state by hand or via URL/debug overrides.

## Why now

Next in the roadmap's phase sequence (Phase 5), and it's the first feature to put free-form
coordinate entry and planet reseeding directly in a user's hands — exactly the two things
Phase 5's own "Known Issue" callout flags as broken on the current architecture. Building this
UI first and discovering the coupling/dead-zone problems live (as that callout warns) is the
thing being avoided by resolving them in the Locale Seed Decoupling doc first.

## Success

- Retransmitting a new planet name (coordinates untouched) yields fresh Audio Rig settings and
  global LFO state (a genuinely new planet), while the *locale itself* — robots, actors, any
  edits already made to them — carries over completely unchanged, not regenerated. This is a
  stronger guarantee than "the same recipe reproduces the same values" (which the decoupling
  work alone would provide) — it's literal continuity of the same objects.
- Retransmitting new coordinates (planet unchanged) regenerates locale-derived content
  deterministically, including at round-number inputs that would have collapsed under the old
  simplex-sampling derivation, while the current planet's Audio Rig/LFO state is left completely
  untouched.
- Retransmitting with neither field changed does nothing — no world regeneration, no discarded
  state, a true no-op.
- Both input fields show the *current* planet name / locale coordinates on open, not blank
  fields — a user edits from the live state, not from scratch.
- Promoted presets are a small, hand-authored, lore-consistent list per panel (not user-saved
  favorites) sitting alongside a random option; every label traces to `sectorSettingsConfig.ts`,
  no hardcoded strings in `SectorSettingsDrawer.tsx` (per CLAUDE.md's zero-hardcoded-strings
  rule, same as every other drawer).
- The status header accurately reflects the active plot and planet immediately after a
  retransmit — no stale readout.

## Constraint

- Stays inside CLAUDE.md's guardrails: schema-driven, zero hardcoded labels in the component;
  state stays serializable in Zustand; no Tone/GSAP objects touched directly by this drawer.
- Built entirely on Phase 1's existing primitives (`TextInput`, `CoordsInput`, `Button`,
  `DualLabel`) — no new primitive needed, though `CoordsInput`'s decimal-accepting behavior
  gets a small integer-enforcement addition (reject or round non-integer entry) as part of
  this feature, not a separate phase.
- No persistence — a retransmitted-away world is genuinely gone this phase; Session Storage
  (Phase 12) is what will later let a user's edited world survive a reload, out of scope here.

## Out of scope

- Locale Seed Decoupling itself — a separate, prerequisite doc/spec (see above), not part of
  this feature's own implementation work.
- Persisting or reloading a previous world (Phase 12).
- Phase 6's melody rhythm-engine overhaul and robot ID determinism — unrelated, stay in Phase 6.
- User-saved/favorited presets — promoted presets are static designer-authored data only.
- Any change to Robot Selection/Robot Options (Phases 8/9) — a planet-only retransmit respawning
  the robot roster is this phase's concern; how that roster is browsed/edited afterward isn't.
