# Intent: Attenuation Style Internal Rename (Roadmap Phase 10.4)

Confirmed via direct conversation on `feature/stacked-lfo`, 2026-08-29 (not `/interview-me` — the
human raised this as a direct follow-up while reviewing [Phase 10.1](../todo/roadmap.md#101-attenuation-style-single-planet-reskin)'s
shipped work). Reverses [docs/specs/ATTENUATION_STYLE.md](../specs/ATTENUATION_STYLE.md) §1.3/§3's
explicit "no internal renames" constraint — that constraint is left untouched as an accurate record
of what was decided *then*; this phase is the follow-up that decides differently *now*.

## Outcome

Every internal identifier, filename, and doc reference that still says "Planet" where the concept
meant is actually the Attenuation Style (AS) gets renamed to say so. `Planet`-the-type,
`usePlanetStore`, `derivePlanetSeed`, `PlanetView.tsx`, `PLANET_NAME_PRESETS`, and everything else in
the rename map below become `AttenuationStyle`-flavored, spelled out in full (no `AS` abbreviation in
code identifiers — matches this codebase's existing no-abbreviation naming convention). This is a
pure identifier/copy rename: confirmed by direct grep that no `getSeededVal`/`precomputeDataX`
`dataId` string literal anywhere in `src/` contains "planet," so no generated world's seed or
determinism changes as a result of this phase — it cannot, by construction, be a breaking change to
existing procedurally-generated content.

## User

Crawford (solo dev) — same fictional-consistency motivation as 10.1 itself, extended one step
further: having both "Planet" and "Attenuation Style" refer to the same concept in the codebase is
exactly the kind of two-names-one-thing ambiguity that invites future mistakes (a new call site
reaching for `usePlanetStore` without realizing it's the AS store, a doc author unsure which term is
"the real one"). Closing that gap now, while the concept is still fresh from 10.1, is cheaper than
letting it calcify.

## Why now

10.1 deliberately scoped itself to a UI/copy reskin and left the rename for "a separate, later unit
of work" (§1.3 of its own spec). This is that later unit of work — raised directly during review of
10.1's shipped state, not from new external pressure.

## Success

- No exported identifier, type, filename, CSS class, or live-reference-doc prose anywhere in `src/`
  or `docs/` (excluding the historical docs named in Constraint below) says "Planet" where the AS
  concept is meant. `git grep -i planet` against the same scope returns only: genuinely
  planet-as-concept-superseded historical docs (excluded below), the proper noun `DEFAULT_PELAGOS`
  and its literal `'pelagos'` id, and prose that is *about* the historical rename decision itself
  (e.g. this doc, and 10.1's own docs, explaining what "Planet" used to mean).
- `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all pass with zero references to
  any pre-rename identifier remaining anywhere in `src/`.
- `docs/CONSOLE_THEMING.md`, `docs/SESSION_STORAGE.md`, and the Phase 11/12 sections of
  `docs/todo/roadmap.md` read "AS seed"/"Attenuation Style seed," resolving 10.1's own Forward
  Note rather than leaving it for those phases' own eventual implementation.
- `window.__GLOBAL_PLANET_SEED__` is renamed to `window.__GLOBAL_ATTENUATION_STYLE_SEED__`
  end-to-end (the debug override mechanism, not the unrelated `?seed=` URL param name, which doesn't
  say "planet" today and is unaffected).

## Constraint

- **Reverses 10.1's no-rename constraint deliberately and explicitly** — this phase exists
  specifically to do what that one declined to. Do not treat 10.1's spec text as still binding for
  the identifiers it named; it documents a past decision, not a present one.
- `DEFAULT_PELAGOS` (and its literal id `'pelagos'`) stays as-is — a proper-noun default *instance*
  name (the default planet's name, "Pelagos"), not an instance of the generic "planet" concept being
  renamed. Its type changes to `AttenuationStyle`; its own name does not.
- `PlanetState` (`src/types/planet.ts`) is dead code — `planetStore.ts` never imports it, defining its
  own separate `PlanetStore` interface instead. Delete it outright rather than renaming it.
- No behavior changes anywhere. Every function's logic, every component's render output, every
  store's state shape (field renames aside) stays identical — this is a rename-only phase, verified
  by the existing test suite passing unmodified in substance (test *names*/*fixtures* get the same
  rename, not new assertions).
- **Historical docs stay untouched**, preserving the record of what was actually decided at the time:
  `docs/specs/ATTENUATION_STYLE.md`, `docs/tasks/ATTENUATION_STYLE.md`,
  `docs/intent/attenuation-style.md`, `docs/specs/SECTOR_SETTINGS.md`,
  `docs/specs/LOCALE_SEED_DECOUPLING.md`, and `docs/todo/roadmap.md`'s own `## 10.1` section. These
  keep saying "Planet"/`usePlanetStore`/etc. where that's what the code was actually called when the
  decision was made — including 10.1's own now-reversed "internal identifiers are not renamed" line.
  A reader of those docs needs to see what was true then, not have it silently rewritten to match now.

## Out of scope

- `PLANET_NAME_PRESETS`' four placeholder values (Kryndara/Vessport Null/Halcyon Drift/The Rusting) —
  10.1 already flagged these as a content TBD, unrelated to this identifier rename. The *constant
  name* changes (`ATTENUATION_STYLE_PRESETS`); the four string values inside it do not, here.
- Any data-model or behavioral change to how AS/planet switching, factory recoloring, or world time
  works — 10.1 already shipped that mechanism; this phase only touches what things are called.
- Session Storage wiring (Phase 12, not yet built) — this phase updates that design doc's
  terminology (per Success above) but does not implement anything in it.

## Forward Note

`docs/CONSOLE_THEMING.md` and `docs/SESSION_STORAGE.md` get their "planet seed" prose updated to "AS
seed" as part of this phase's Docs work — resolving 10.1's own Forward Note now rather than waiting
for Phase 11/12 to actually be built, since leaving it any longer just re-creates the same doc-debt
10.1 deferred once already.
