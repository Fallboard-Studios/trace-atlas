# Intent: Harmony palette sequencing (decouple from hour-of-day)

Captured via `/interview-me`, 2026-09-02. Confirmed intent — downstream of this: spec/implementation
for the `harmonySystem.ts` change, plus a rewrite of `docs/DUPLICATE_VALUE_AUDIT.md` item 2.

## Outcome

`harmonySystem.ts` stops deriving its note palette from `getCurrentHour()`/hour-of-day, and instead
free-runs sequentially through a renamed `HARMONY_PALETTES: EighthNotes[]` — collapsed from the
current 24-entry `TIME_PITCHES` (hours 12-23 are literal duplicates of hours 0-11 today) down to the
12 structurally-unique entries — holding each entry for `MEASURES_PER_PALETTE_ENTRY` measures before
advancing to the next index, wrapping via `% HARMONY_PALETTES.length` so a future palette array of any
length works without further code changes.

## Why now

More palettes are coming later, with varying lengths — the current hour-keyed `Record<number,
EighthNotes>` (0-23) bakes in an assumption (a 24-slot, hour-of-day-shaped table, doubled up to cover
two 12-hour halves) that doesn't generalize. Switching to plain sequential array-cycling removes the
hour dependency and the length assumption in one pass.

## Mechanism

- **Stateless derivation**, not an incrementing counter: `index = Math.floor(getCurrentMeasure() /
  MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length`, recomputed fresh on every tick. Self-correcting
  — a missed or errored tick (the callback is still wrapped in try/catch) can never leave the palette
  permanently offset from where the transport actually is, unlike an accumulating counter.
- `resetHarmony()` keeps its existing shape: resets to `HARMONY_PALETTES[0]` / index 0, e.g. on
  power-on.

## Scheduling refactor

`harmonySystem.ts` currently owns its own local `TransportLike` interface, `transportInstance`, and a
`scheduleHarmonyCycle(transport)` that calls `transport.scheduleRepeat`/`.clear` directly — bypassing
`beatClock.ts`'s own scheduling exports (the pattern the rest of the app follows per CLAUDE.md's core
rule: "Prefer `Transport.scheduleRepeat` / `scheduleOnce`... use `BeatClock`").

This change also fixes that, since the callback body is being rewritten anyway:
- `scheduleHarmonyCycle()` drops its `transport` parameter entirely — no more local transport plumbing.
- Uses `beatClock.ts`'s `scheduleRepeat('2m', callback)` / `cancelSchedule(scheduleId)` instead.
- `getCurrentHour` import replaced by `getCurrentMeasure`.
- The `AudioEngine.ts` call site updates to the new no-arg signature.

## New constant

`MEASURES_PER_PALETTE_ENTRY = 2` — declared **local to `harmonySystem.ts`**, not centralized in
`constants/index.ts` (nothing outside this module needs it). One value read by both the index-derivation
math and the `scheduleRepeat` interval string, so the two don't independently restate `2` — avoiding a
fresh instance of the exact duplicate-value failure mode this whole audit line of work is about.

**Not wired into any UI/store yet.** The user plans to make this user-editable later, once more palette
options exist; today it stays a plain internal constant, easy to bump by hand, deliberately not exposed.

## Docs to update

- `docs/HARMONY_SYSTEM.md`, `docs/AUDIO_SYSTEM.md`, `docs/BEAT_CLOCK.md` — wherever they describe
  hour-based palette selection (`TIME_PITCHES`, `getCurrentHour()`-driven switching).
- `docs/DUPLICATE_VALUE_AUDIT.md` item 2 (`MEASURES_PER_CYCLE` / `DAY_CYCLE_MEASURES`) — harmony's
  indirect coupling to `beatClock`'s 96-measure day concept goes away entirely once this ships, so the
  "two 96 constants, unrelated subsystems" framing needs rewriting. `lightingUtils.ts`'s
  `DAY_CYCLE_MEASURES` remains the only other real "day cycle" consumer outside `beatClock.ts` itself
  — worth re-assessing whether item 2 is still open, changes shape, or closes as a side effect of this
  work.
- Possibly item 4's note ("`harmonySystem.ts`'s `TIME_PITCHES` map... left out of scope") — the
  12-vs-24 duplication that note referenced is eliminated as a natural side effect of this change, not
  left as a structural byproduct anymore.

## Explicitly left as-is (flagged, not acted on)

`getCurrentHour()` stays exported from `beatClock.ts` — still tested, still a valid derived value —
even though nothing in production code will call it anymore after this change (its only production
caller today is `harmonySystem.ts`). Not removed or deprecated as part of this task.

## Out of scope

- Any UI/store wiring for a user-editable `MEASURES_PER_PALETTE_ENTRY`.
- Adding actual new/additional palette sets — this task only restructures and renames the existing one.
- Any change to `beatClock.ts`'s own 96-measure day-cycle constant or `getCurrentHour()`'s behavior.
