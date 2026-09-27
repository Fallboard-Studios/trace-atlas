# Intent: Attenuation Style (Roadmap Phase 10.1)

Confirmed via `/interview-me` on `feature/companies`, 2026-08-28. Covers
[Roadmap Phase 10.1](../todo/roadmap.md#101-attenuation-style-single-planet-reskin) — replacing
planet-switching with a single, permanent world whose "Attenuation Style" (AS) is what the operator
retunes instead.

## Outcome

The player never leaves the one world. What was "traveling to a different planet" becomes retuning
the receiver's Attenuation Style — the same fixed device, interpreting the same ongoing
transmission differently. An AS change reseeds Global Audio Rig timbre and Global LFO settings
(unchanged mechanism, `generateGlobalAudioSettings`/`generateGlobalLfoSettings` — just retargeted
off an AS change instead of a planet change) and now also recolors existing factories in place — a
genuinely new coupling, since today an AS-equivalent (planet) change never touches an
already-populated locale's actors at all. Factory *placement* stays exactly as x/y-derived as it is
today; only the palette read from those coordinates' factories changes. Robots, companies, and
melodies are confirmed unaffected by an AS change, matching their existing purely-locale-(x/y)-seeded
generation — nothing here touches that.

World Time drops the three planet-size options for a flat 6-minute day, universal. A locale's
current hour on load (or after a coordinate-changing retransmit) is `abs(x % 24)` hours, zero
minutes — computed directly from that locale's own X coordinate, no seed, no shared/offset clock.
Because time depends on the locale's X rather than the AS, `dayStartTimestamp` moves off `Planet`
onto `Locale`, and the retransmit branch that recalculates it is the literal inverse of today's:
a coordinate-changing retransmit now recalculates time; an AS-only retransmit never does (today it's
the other way around — only a planet swap touches time, coordinates-only never does).

## User

Crawford (solo dev), for the game's own fictional consistency — not a response to player feedback,
and not driven by any upcoming technical need (confirmed not a Session-Storage-simplification move).

## Why now

Pure fiction fix. The planet-hopping framing stopped matching a device that doesn't travel — "the
receiver we're using instead changes how it interprets the data" was the framing Crawford gave for
the replacement. Nothing about the underlying data model needs to change to serve this: the
Planet-swap mechanism (build a fresh record with a new seed, discard the old one) stays exactly as
it is under the hood; only what it's called and what an AS change visibly does changes.

## Success

- Every literal "Planet"-flavored user-facing string in Sector Settings (`PLANET_NAME_SCHEMA`'s
  labels, `PLANET_NAME_PRESETS`) and TransportBar's status readout is gone, replaced with
  Attenuation Style framing.
- World Time is a flat 6-minute day everywhere, with no size selector; a locale's hour on load is
  `abs(x % 24)`, zero minutes, exactly.
- An AS-only retransmit reseeds Global Audio Rig/LFO and recolors existing factories in place,
  without touching factory position/count/id, robots, companies, or melodies.
- A coordinate-only retransmit recalculates world time and regenerates the locale (unchanged from
  today) but never touches AS-derived state (Global Audio Rig/LFO, factory color) — confirming the
  trigger inversion actually landed the right way round, not backwards.

## Constraint

- Reskin-only at the code level: internal identifiers (`Planet`, `PlanetSize`, `usePlanetStore`,
  `planetStore.ts`, `derivePlanetSeed`, `getPlanetNoiseMap`, `RetransmitInput.planetName`, the
  `?seed=`/`window.__GLOBAL_PLANET_SEED__` debug override) are **not** renamed. Only user-facing
  copy plus the specific mechanics above change — kept deliberately small and low-risk rather than a
  project-wide rename.
- `PlanetSize`, `PLANET_DURATION_MS`, and `planetInitialHour` (the letter-average seeded-hour
  algorithm) are deleted outright — dead once the initial hour is x-derived rather than seed-derived.
- `computeLocalTime`'s longitude-offset composition is retired, not preserved — there is no
  persistent, cross-locale clock to offset from (only one locale is ever mounted at a time via
  `currentLocaleId`), so a locale's hour is exactly what its own `dayStartTimestamp` implies, no
  second step.

## Out of scope

- Renaming "Sector Settings" / "Plot Tuning" / "Retransmit" panel wording — confirmed these already
  read as "tuning/re-pointing within the world," not travel, and don't need the fiction pass this
  time.
- Any change to factory *placement* logic — factories still move only when x/y coordinates change;
  this phase only changes how their color is derived, not where they are or how many there are.
- Editing `CONSOLE_THEMING.md` (Phase 11) or `SESSION_STORAGE.md` (Phase 12) now — both describe
  "planet seed" as a design concept before either is built; the roadmap entry leaves a Forward Note
  so their terminology updates when those phases actually get implemented, not before.
- Finalizing concrete AS preset name copy (replacements for Kryndara/Vessport Null/Halcyon
  Drift/The Rusting) — left as a TBD for implementation time, not decided here.
- Any data-model collapse of `planets: Planet[]` to a single non-list record — confirmed not needed
  since this isn't in service of simplifying toward Session Storage; the existing swap-a-record
  mechanism is kept as-is.
