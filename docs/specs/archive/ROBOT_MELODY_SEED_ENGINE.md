# Phase Spec: Robot Melody & Seed Engine (Roadmap Phase 6)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-melody-seed-engine.md](../intent/robot-melody-seed-engine.md)
(confirmed via `/interview-me`). Source of scope: [docs/todo/roadmap.md § 6](../todo/roadmap.md#6-robot-melody--seed-engine),
minus its first Restructure bullet (planet-agnostic lat/long seeding), already pulled forward and
resolved by [docs/specs/LOCALE_SEED_DECOUPLING.md](LOCALE_SEED_DECOUPLING.md). Prior art / current
architecture: [docs/MELODY_SYSTEM.md](../MELODY_SYSTEM.md), [docs/PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md),
[docs/HARMONY_SYSTEM.md](../HARMONY_SYSTEM.md).

---

## 1. Overview & Claude Explanation

This phase rewrites `melodyGenerator.ts`'s rhythm engine from an onset-count model to a
percentage/toggle model, makes robot IDs deterministic, and corrects two stale doc comments left
over from an already-fixed scheduler bug. **The scope is deliberately wider than the roadmap's own
file list**: the roadmap's About/Docs sections name only `melodyGenerator.ts` and `localeStore.ts`,
but `generateMelodyForRobot`'s API is also called directly by `regenerateMelody.ts` and consumed by
`RobotAudioTab.tsx`'s sliders. Confirmed during intake (`docs/intent/robot-melody-seed-engine.md`):
both of those get fixed in this same phase rather than left stale for Phase 9 to inherit.

**Density** (`Robot.rhythmicDensity`) changes from a `4–12` onset count to a `0–100` fill-rate
percentage. `generateMelodyForRobot` converts percentage → onset count via round-to-nearest against
either 16 (the full measure, when motif tiling is off) or `rhythmicMotifLength.value` (one motif
cell, when tiling is on, before `buildMotifOnsets` tiles/truncates it across the measure) — with a
hard floor of 1 onset in both cases, so no seeded roll can ever produce a silent robot.
`buildMotifOnsets` itself is unaffected — it still consumes a plain onset count, exactly as today;
the percentage→count conversion is a new pre-step inside `generateMelodyForRobot`, not a change to
`buildMotifOnsets`'s own contract. This keeps `buildMotifOnsets`'s existing test suite valid as-is.

**Motif Length** and **Note Variance** (`Robot.rhythmicMotifLength`, `Robot.noteVariance`) both
change from plain numbers to `{ active: boolean; value: number }`, `value` ranging `1–8` (step 1) —
an exact match for Phase 1's existing `StepperWithToggleValue` shape
(`src/components/ui/controls/StepperWithToggle.tsx`). Motif Length: off → onsets scatter freely
across the full measure (today's non-repeating fallback path in `buildMotifOnsets`); on → a
`value`-length cell tiles across the measure and truncates at measure end (today's repeating path).
Note Variance: off → unweighted random pick from all 8 pitch indices; on → a weighted slice of
`value` notes from the pitch array (today's `noteVariance > 0` branch, restricted to `value` unique
indices instead of an arbitrary `1–8` magnitude). `GenerateMelodyForRobotOptions.onsetCount` is
deleted — it was a pre-percentage legacy fallback (`rhythmicDensity ?? onsetCount`) with no
remaining caller once every call site is fixed in this phase.

**Robot IDs** replace `crypto.randomUUID()` (`spawnSystem.ts`) with a derivation through the
*existing* seeding mechanism: `getSeededVal(getLocaleNoiseMap(localeId, x, y), 'robot.id',
spawnCount, ...)`, formatted into a human-legible string. No new hashing or collision-avoidance
utility is introduced — uniqueness is structural, not actively checked: `getSeededVal`'s `dataId`
string already gives every distinct field its own effectively-unique x-position in the noise map
(the same property every other seeded attribute in `spawnSystem.ts` already relies on — `robot.name.adj`,
`robot.masterVolume`, etc.), and `spawnCount` is already a monotonic per-locale counter incremented
once per spawn. This satisfies Phase 12's (Session Storage) requirement that overrides can be
reapplied by ID after the roster regenerates from a reload or shared link, since the same locale
coordinates always replay the same `spawnCount` sequence and therefore the same ID sequence.

**Measure-length references**: `AudioEngine.ts`'s scheduler already correctly ticks `'16n'` (16
steps = 1 measure) — this was fixed previously and needs no runtime change here. What's actually
stale are two leftover doc comments describing the old, already-fixed "2-measure loop" model:
`src/types/Robot.ts:60` and `src/engine/melodyGenerator.ts:13`. Both get corrected to describe the
real, shipped single-measure/16-subdivision model.

`localeStore.ts`'s `updateRobot` clamp block (~lines 117–125) is rewritten in lockstep: `rhythmicDensity`
clamps to `0–100`; `rhythmicMotifLength`/`noteVariance` clamp their nested `.value` to `1–8` and
coerce `.active` to boolean, instead of the current flat `Math.max/min/trunc` against the old numeric
ranges.

---

## 2. Target File Structure

```text
src/
├── constants/
│   └── index.ts                      # MODIFIED — RHYTHMIC_DENSITY_MIN/MAX → 0/100;
│                                      #   RHYTHMIC_MOTIF_LENGTH_MIN/MAX → 1/8 (was 1/16);
│                                      #   NOTE_VARIANCE_MIN/MAX → 1/8 (was 0/8 — `0`-as-"off" is
│                                      #   retired now that `active: false` covers that state)
├── types/
│   └── Robot.ts                      # MODIFIED — rhythmicMotifLength/noteVariance become
│                                      #   `{ active: boolean; value: number }`; MelodyEvent's
│                                      #   stale "2-measure loop" comment (~L60) corrected
├── engine/
│   ├── melodyGenerator.ts            # MODIFIED — density→onset-count conversion, motif/variance
│                                      #   toggle branches, onsetCount removed, stale comment (~L13)
│                                      #   corrected
│   ├── melodyGenerator.test.ts       # MODIFIED — GenerateMelodyForRobotOptions describe block
│                                      #   updated for the new option shape; buildMotifOnsets/
│                                      #   pickDurationForGap/gridUnitsToDuration blocks untouched
│   ├── regenerateMelody.ts           # MODIFIED — reads the new field shapes when building
│                                      #   GenerateMelodyForRobotOptions
│   └── regenerateMelody.test.ts      # MODIFIED — makeRobot() fixture and density/motif
│                                      #   assertions updated for new shapes/ranges
├── stores/
│   ├── localeStore.ts                # MODIFIED — updateRobot's clamp block (~L117-125) rewritten
│                                      #   for 0-100 density and the two toggle-object shapes
│   └── localeStore.test.ts           # MODIFIED — new test coverage added for the rewritten clamp
│                                      #   block (no existing test currently exercises these three
│                                      #   fields — confirmed via grep, this is net-new coverage,
│                                      #   not an update)
├── systems/
│   ├── spawnSystem.ts                # MODIFIED — robot.id derivation (~L431) switches from
│                                      #   crypto.randomUUID() to getSeededVal(...)-based derivation;
│                                      #   generateMelodyForRobot call (~L425) drops onsetCount,
│                                      #   passes the new rhythmicDensity/motif/variance shapes
│   └── spawnSystem.test.ts           # MODIFIED — new test coverage added asserting ID determinism
│                                      #   across two spawns against the same locale coordinates
│                                      #   (no existing test currently checks ID format/determinism,
│                                      #   only that robot.id is defined — net-new coverage)
└── components/panels/screen/console/
    ├── RobotAudioTab.tsx             # MODIFIED — Density/Motif/Note-Variance controls read/write
                                       #   the new shapes and ranges; keeps current hand-rolled Radix
                                       #   Slider/input markup — no early adoption of
                                       #   StepperWithToggle (stays Phase 9's job for the whole tab)
    └── RobotAudioTab.test.tsx        # MODIFIED — assertions updated for new field shapes/ranges
                                       #   (e.g. the motif-length test currently sets `12`, now
                                       #   out of range — must move to a valid `1-8` value and
                                       #   assert the `{active, value}` shape)
docs/
├── MELODY_SYSTEM.md                  # MODIFIED — per roadmap §6 Docs: Density as 0-100% fill rate,
│                                      #   Motif Length as 1-8 on/off-toggled value, Note Variance
│                                      #   as on/off-toggled value, RHYTHMIC_MOTIF_LENGTH_MAX (16→8)
├── PROCEDURAL_GENERATION.md          # MODIFIED — resolve the existing "Planned change" callout on
│                                      #   the Locale map bullet (already actually resolved by
│                                      #   LOCALE_SEED_DECOUPLING.md; this phase just updates the doc
│                                      #   text, no code dependency)
└── todo/roadmap.md                # MODIFIED — §6's remaining bullets marked resolved, mirroring
                                       #   the strikethrough+pointer pattern already used for the
                                       #   first (pulled-forward) bullet
```

**Confirmed NOT touched:** `src/engine/AudioEngine.ts` (scheduler already ticks `'16n'`/16-steps-
per-measure correctly — no runtime change, only the two comment fixes listed above live elsewhere),
`src/utils/noiseMaps.ts` / `src/utils/getSeededVal.ts` (both consumed as-is, no signature change),
`src/utils/seedUtils.ts` (untouched), `docs/HARMONY_SYSTEM.md` (its `noteIndex`/palette model is
unaffected by a rhythm-engine change), `src/components/ui/controls/StepperWithToggle.tsx` (read as
precedent for the value shape, not modified or newly wired up — Phase 9's job).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No new seeding/hashing mechanism.** Robot ID derivation reuses `getLocaleNoiseMap` +
  `getSeededVal` exactly as every other spawn-time attribute in `spawnSystem.ts` does. Do not
  introduce a separate `alea(...)` call outside that registry, and do not build a "seed row already
  used" collision-checking utility — the uniqueness guarantee is structural (distinct `dataId` +
  monotonic `spawnCount`), not actively verified at runtime.
* **`onsetCount` is a real deletion, not a deprecation.** Remove it from
  `GenerateMelodyForRobotOptions` entirely; don't leave it as an optional/ignored field. Both
  `npm run lint` and `npm run build:types` should catch any leftover reference.
* **`buildMotifOnsets`'s signature and contract do not change.** It still takes a plain onset count
  (not a percentage) — the density→count conversion happens once, inside `generateMelodyForRobot`,
  before calling it. Do not push percentage-awareness down into `buildMotifOnsets` itself.
* **The onset-count floor is exactly 1, applied after rounding, in both the scatter (measure-wide)
  and tiled (motif-cell) branches.** A density roll of `0%` (or any low roll that rounds to `0`)
  still yields a melody with at least one note.
* **`RobotAudioTab.tsx` gets a correctness-only fix.** Update it to read/write the new
  `{active, value}` shapes and the new numeric ranges (which it already gets "for free" for the
  plain-number `rhythmicDensity` field via `constants/index.ts`'s updated `DENSITY_MIN`/`DENSITY_MAX`
  re-exports). Do **not** swap its markup to the `StepperWithToggle` primitive — that migration is
  explicitly Phase 9's job for the whole tab (Audio Mode, Octave Range, and everything else) in one
  pass, not this phase's for two controls.
* **`Robot.rhythmicMotifLength`/`Robot.noteVariance` stay JSON-serializable.** `{ active: boolean;
  value: number }` is a plain serializable object — no class instances, no functions — consistent
  with CLAUDE.md's "state stays serializable" rule. This is a type/shape change, not a new runtime
  concept.
* **No UI primitive changes, no audio-scheduling changes, no GSAP/timeline changes.** This phase is
  pure generation-math, one type shape change, and store-validation logic — none of CLAUDE.md's
  audio-scheduling or animation guardrails are exercised here beyond the general serializability
  rule, which stays true throughout.

---

## 4. Code Style & Architecture Conventions

**`melodyGenerator.ts` — density→onset-count conversion (new logic inside `generateMelodyForRobot`):**

```typescript
// BEFORE (current) — rhythmicDensity IS the onset count, clamped 4-12
const density = Math.max(
  RHYTHMIC_DENSITY_MIN,
  Math.min(RHYTHMIC_DENSITY_MAX, opts.rhythmicDensity ?? opts.onsetCount),
);
const motifLength = opts.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH;
const onsets = buildMotifOnsets(density, motifLength, subdivisions, rand);
```

```typescript
// AFTER — rhythmicDensity is a 0-100 fill-rate %; motif is an {active, value} toggle
const densityPct = Math.max(
  RHYTHMIC_DENSITY_MIN,
  Math.min(RHYTHMIC_DENSITY_MAX, opts.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY),
);
const motif = opts.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH; // { active, value }

let onsets: number[];
if (motif.active) {
  // buildMotifOnsets' own `rhythmicDensity` param is a TOTAL onset count across
  // the whole tiled measure, not a per-cell count — so the per-cell fill has to
  // be multiplied back out by the repeat count before calling it. Passing the
  // per-cell count directly (perCell alone, not perCell * repeats) would
  // under-fill every cell by a factor of `repeats`: e.g. value=8, subdivisions=16
  // (repeats=2) at 100% density would compute perCell=8 but only place 4 onsets
  // per cell if passed straight through, since buildMotifOnsets would divide it
  // by repeats again internally.
  const repeats = Math.max(1, Math.floor(subdivisions / motif.value));
  const perCell = Math.max(1, Math.round((densityPct / 100) * motif.value));
  onsets = buildMotifOnsets(perCell * repeats, motif.value, subdivisions, rand);
} else {
  const onsetCount = Math.max(1, Math.round((densityPct / 100) * subdivisions));
  onsets = buildMotifOnsets(onsetCount, subdivisions, subdivisions, rand); // motifLength === subdivisions ⇒ buildMotifOnsets' own non-repeating fallback path
}
```

**`melodyGenerator.ts` — note variance toggle (replaces the current 0/1-7/8 three-way branch):**

```typescript
// BEFORE (current) — noteVariance is a 0-8 magnitude
const noteVariance = Math.max(NOTE_VARIANCE_MIN, Math.min(NOTE_VARIANCE_MAX, Math.trunc(opts.noteVariance ?? 0)));
// ...noteVariance === 0 ⇒ unweighted; 1-7 ⇒ growing unique set; 8 ⇒ draw without replacement
```

```typescript
// AFTER — noteVariance is { active, value }; off ⇒ unweighted, on ⇒ weighted slice of `value` notes
const variance = opts.noteVariance ?? DEFAULT_NOTE_VARIANCE; // { active, value }
// ...variance.active === false ⇒ unweighted (today's noteVariance === 0 branch, unconditional);
//    variance.active === true  ⇒ today's 1-7 / 8 branches, using variance.value in place of the
//    old magnitude (value === 8 still reduces to the existing draw-without-replacement path)
```

**`types/Robot.ts` — field shape change:**

```typescript
// BEFORE
rhythmicMotifLength?: number; // 1-16
noteVariance?: number;       // 0-8, 0 = off

// AFTER
rhythmicMotifLength?: { active: boolean; value: number }; // value: 1-8
noteVariance?: { active: boolean; value: number };        // value: 1-8
```

**`localeStore.ts` — `updateRobot`'s clamp block:**

```typescript
// BEFORE
if (typeof normalized.rhythmicMotifLength === 'number') {
  normalized.rhythmicMotifLength = Math.max(RHYTHMIC_MOTIF_LENGTH_MIN, Math.min(RHYTHMIC_MOTIF_LENGTH_MAX, Math.trunc(normalized.rhythmicMotifLength)));
}
if (typeof normalized.noteVariance === 'number') {
  normalized.noteVariance = Math.max(NOTE_VARIANCE_MIN, Math.min(NOTE_VARIANCE_MAX, Math.trunc(normalized.noteVariance)));
}
```

```typescript
// AFTER — same clamp-at-the-store-boundary principle, applied to the nested `.value`
function clampToggleValue(v: unknown, min: number, max: number): { active: boolean; value: number } | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const { active, value } = v as { active?: unknown; value?: unknown };
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return { active: Boolean(active), value: Math.max(min, Math.min(max, Math.trunc(value))) };
}

if (normalized.rhythmicMotifLength !== undefined) {
  const clamped = clampToggleValue(normalized.rhythmicMotifLength, RHYTHMIC_MOTIF_LENGTH_MIN, RHYTHMIC_MOTIF_LENGTH_MAX);
  if (clamped) normalized.rhythmicMotifLength = clamped; else delete normalized.rhythmicMotifLength;
}
if (normalized.noteVariance !== undefined) {
  const clamped = clampToggleValue(normalized.noteVariance, NOTE_VARIANCE_MIN, NOTE_VARIANCE_MAX);
  if (clamped) normalized.noteVariance = clamped; else delete normalized.noteVariance;
}
```

**`spawnSystem.ts` — robot ID derivation:**

```typescript
// BEFORE
const robot: Robot = {
  id: crypto.randomUUID(),
  // ...
};
```

```typescript
// AFTER — deterministic, reuses the existing seeding mechanism, human-legible
const idSeed = noiseMap
  ? getSeededVal(noiseMap, 'robot.id', spawnCount, 0, 1)
  : alea(`${localeId}:${spawnCount}:id`)(); // same no-noise-map fallback pattern already used elsewhere in this file
const robot: Robot = {
  id: `robot-${spawnCount}-${idSeed.toString(36).slice(2, 10)}`,
  // ...
};
```

* **Naming Conventions:** No new files. `DEFAULT_RHYTHMIC_DENSITY`, `DEFAULT_RHYTHMIC_MOTIF_LENGTH`,
  and a new `DEFAULT_NOTE_VARIANCE` stay in `melodyGenerator.ts` alongside the existing defaults,
  matching current convention.
* **Formatting:** Match each touched file's existing section-comment banner style
  (`// ========================================` in `melodyGenerator.ts`/`spawnSystem.ts`,
  `// ── Section ──` in `RobotAudioTab.tsx`) — don't introduce a different comment convention.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate (already established — see § 2 for the exact `.test.ts`/`.test.tsx` files touched).
* **`melodyGenerator.test.ts` — coverage targets for the changed `generateMelodyForRobot` describe block:**
  1. `rhythmicDensity: 0` (or any value that rounds to 0 onsets) still produces a melody with ≥1 event, in both the scatter and tiled branches.
  2. `rhythmicDensity: 100` with motif tiling off produces 16 onsets (fully dense measure); with tiling on and `motif.value: 4`, produces a fully dense 4-step motif cell tiled across the measure.
  3. A representative mid-range density (e.g. `50`) against a `16`-step measure (tiling off) produces the expected rounded onset count.
  4. `rhythmicMotifLength: { active: false, value: N }` produces the non-repeating scatter path regardless of `value` (value is inert when inactive).
  5. `rhythmicMotifLength: { active: true, value: N }` produces the existing repeating/tiling behavior, `N` clamped 1-8.
  6. `noteVariance: { active: false }` produces unweighted note selection (existing `noteVariance === 0` behavior, now unconditional on `active`).
  7. `noteVariance: { active: true, value: 8 }` still exercises the existing draw-without-replacement path.
  8. `onsetCount` is no longer a recognized option — confirm via `tsc` (compile-time) that passing it is a type error, not a runtime test.
  9. `buildMotifOnsets`/`pickDurationForGap`/`gridUnitsToDuration`/`applyRhythmicVariance`/`applyTonalVariance` describe blocks are verified to still pass unmodified — these operate below the percentage-conversion layer and are untouched by this phase.
* **`localeStore.test.ts` (new coverage, not an update — confirmed via grep no existing test exercises these three fields):**
  1. `updateRobot` clamps `rhythmicDensity` to `0-100`.
  2. `updateRobot` clamps `rhythmicMotifLength.value`/`noteVariance.value` to `1-8` and coerces non-boolean `active` values.
  3. `updateRobot` rejects (or strips) a malformed `rhythmicMotifLength`/`noteVariance` payload (e.g. a bare number, matching the *old* shape) rather than silently mis-clamping it — this is the exact regression the roadmap's clamp bullet is protecting against.
* **`spawnSystem.test.ts` (new coverage):**
  1. Two calls to `spawnRobot` against a locale reset to the same coordinates and a reset spawn counter produce robots with identical IDs in the same order.
  2. Robot IDs are unique within a single spawn sequence (spot-check across several consecutive spawns).
* **`regenerateMelody.test.ts` (updated):** `makeRobot()`'s fixture and the density/motif assertions (currently asserting exact `melody.length` equal to a raw onset-count magnitude) updated to reflect that `rhythmicDensity` is now a percentage and event count is derived, not literal.
* **`RobotAudioTab.test.tsx` (updated):** the motif-length test's `fireEvent.change(..., { value: '12' })` moves to a valid `1-8` value; both density and motif/variance assertions updated for the new shapes (`{active, value}` for motif/variance, plain `0-100` for density).
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (catches any leftover `onsetCount` reference or old-shape field access).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/robot-melody-seed-engine`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences, roughly one commit per file group in § 2 (constants + Robot.ts type change,
  melodyGenerator.ts + its test, localeStore.ts clamp + its test, spawnSystem.ts robot ID + its
  test, regenerateMelody.ts + RobotAudioTab.tsx + their tests since they share the same consumer
  pattern, doc updates last).

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan/Tasks phase before implementation, not silently during coding:

1. **Exact new `DEFAULT_RHYTHMIC_DENSITY` value.** The old default was `8` (out of a `4-12` range — roughly the 57th percentile). A clean round default like `50` is proposed in § 4 but wasn't asked about directly during intake; confirm during Plan.
2. **Default `active` state for `DEFAULT_RHYTHMIC_MOTIF_LENGTH`/`DEFAULT_NOTE_VARIANCE` when a `Robot` doesn't specify one.** Proposed default: `rhythmicMotifLength: { active: true, value: 8 }` (preserves the old always-tiling-at-8 default behavior exactly), `noteVariance: { active: false, value: 1 }` (preserves the old `noteVariance === 0`/unweighted default exactly). Low risk, but pick during Plan rather than assumed here.
3. **Exact robot-ID string format.** § 4's `robot-${spawnCount}-${idSeed.toString(36).slice(2,10)}` is illustrative, not mandated — confirmed during intake that the precise format is non-critical as long as it's deterministic and human-legible. Finalize the exact format during Plan/implementation.
4. **`RHYTHMIC_MOTIF_LENGTH_MAX`'s rename/comment, not value.** The roadmap's Docs bullet calls out documenting "the `RHYTHMIC_MOTIF_LENGTH_MAX` constant change (16 → 8)" explicitly — confirm `docs/MELODY_SYSTEM.md`'s rewrite states the old and new values side by side (as the roadmap phrasing implies) rather than just the new value alone.
5. **`RobotAudioTab.tsx`'s motif/note-variance controls need a toggle affordance now**, since the underlying data is `{active, value}` — the current markup only has a `Slider`+`input` pair per field, no on/off control. Confirmed in intake that this stays hand-rolled (no `StepperWithToggle` adoption), but the exact interim toggle markup (a checkbox? a second small button?) wasn't specified — decide the minimal-effort shape during Plan; it only needs to work, not be polished, since Phase 9 replaces it wholesale.
