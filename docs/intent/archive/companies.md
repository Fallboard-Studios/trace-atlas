# Intent: Companies (Roadmap Phase 10)

Confirmed via `/interview-me` on `main`, 2026-08-27. Covers
[Roadmap Phase 10](../todo/roadmap.md#10-companies) — introducing Companies, seeded named
groups of robots that let every Robot Options field be edited across many robots at once, refining
the initial roadmap draft's spawn-generation range and reseed behavior.

## Outcome

Companies are seeded, named groups of robots — 2-3 companies per locale, 3-4 robots each,
generated deterministically the same way the rest of a fresh locale is (`spawnInitialRoster`, same
Adjective+Noun word-list pattern `generateRobotName` already uses). A robot not seeded into a
company is Freelance, the implicit default — a meaningful chunk of the 12-robot roster is expected
to start out Freelance, not a rare edge case.

`RobotsTab` gains a company button row (one per company, plus "None") and CRUD (create/rename/
delete) beneath the existing robot card list, and beneath that a `CompanyOptionsPanel` reusing
Robot Options' own drawers (Audio Setting, Volume+LFO, Ping Controls, Ping Contour, Signature
Array). With "None" selected the panel renders fully disabled with no bound value; selecting a
company binds the panel to that company's own persistent settings snapshot (seeded from its first
member's values on first edit, updated field-by-field on every edit after that) — so re-selecting a
company later picks up exactly where you left it, not wherever its member robots happen to be now.
Editing a field in the panel broadcasts that one field to every current member robot through the
same call path a single-robot edit already uses; it's a one-time broadcast, not a live link — a
robot edited individually afterward stays exactly as edited, undisturbed by its company.

Retransmitting a new seed/coordinates in Sector Settings regenerates Companies fresh, the same way
it already regenerates the entire robot roster — nothing about a company (membership, name, its
snapshot) survives a reseed. This was an explicit choice, not an oversight: it reads better
lore-wise as part of the same "new world" event that already wipes everything else.

## User

Crawford (solo dev), tuning the robot roster's sound design himself — no multiplayer or
other-audience angle.

## Why now

Companies is next in the roadmap sequence (inserted as Phase 10, ahead of the two
already-drafted-but-unbuilt design docs, Console Theming and Session Storage, which shift to 11
and 12). Two things are driving it, in Crawford's own words: manually matching settings across
multiple robots by hand is "frustrating" and easy to get wrong as an art-performance workflow —
tuning a cluster of robots to sound cohesive currently means re-dialing the same values into each
one by hand and trying to remember what you set last time. And it's fiction-first as much as
mechanical — "Company" is meant to read as a real organizational unit robots belong to (matching
how the rest of the console already leans on diegetic framing — `SYSTEM_FIRMWARE_RESETS`, seed-
driven console chrome, deterministic "field equipment" seeding), not a generic "select multiple
robots" checkbox UI wearing a themed label.

## Success

- A player can select a company, dial in a cohesive sound once across every editable Robot Options
  field, and have it land on every member robot — without visiting each robot individually.
- Any member robot stays individually tweakable afterward without disturbing its siblings or being
  reverted by a later company-wide edit.
- A company remembers its own dialed-in state the next time it's selected — no need to re-enter or
  remember values between sessions of editing it, even after selecting a different company or
  "None" in between.
- The roster spawns with a meaningful chunk of robots already grouped (2-3 companies, 3-4 robots
  each) and a meaningful chunk Freelance — Companies read as a real, seeded part of the locale's
  identity from the moment it loads, not an empty feature waiting for manual setup.

## Constraint

- Built entirely on the existing schema-driven Design System — one new primitive, `Select`
  (the 14th; none of the 13 shipped ones are a dropdown), used for the robot→company assignment
  control shown in both `RobotSelectionCard` and `RobotDisplaySection`.
- Fully seeded/deterministic, like everything else in the app — no `crypto.randomUUID()` or bare
  `Math.random()` for company count, names, or membership.
- Capped at 6 companies total (`MAX_COMPANIES`) as a CRUD ceiling on manual creation — separate
  from and higher than the 2-3 seeded at spawn, leaving headroom for a player to create more by
  hand.
- A company-wide edit must replicate every live side effect a single-robot edit already makes
  (`AudioEngine`/`lfoEngine`/`regenerateMelody` calls, not just the `updateRobot` store write) —
  the same shared per-field functions both call sites use, so a company-wide edit can't silently
  reproduce the stale-cache class of bug Phase 9's post-launch fixes already found and fixed once
  for the single-robot case.

## Out of scope

- Any tie-in to job assignment or docking state — both remain fully system-driven, unaffected by
  company membership (same boundary Phase 9 already drew for individual robots).
- Persistence across a page reload or shared link — that's Session Storage (now Phase 12, still
  unbuilt); this phase's Forward Note flags that Companies will need the same override-diff
  treatment robots already get once that phase lands, but nothing here builds toward it yet.
- Companies surviving a Sector Settings reseed — explicitly not wanted (see Outcome above).
- A live/standing link between a company and its members after a broadcast edit — editing a member
  robot individually is never overwritten by, or reconciled against, its company afterward.
- Any visual/audio treatment beyond the existing single-robot selection glow reused for company
  membership — no new audio routing (company selection is not `audioMode: 'highlight'` or similar),
  no persistent in-world badge beyond the selection-time glow.
