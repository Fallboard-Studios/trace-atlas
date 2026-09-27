# Phase Spec: Pitch Repeat

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/pitch-repeat.md](../intent/pitch-repeat.md) (confirmed via
`/interview-me`, verified against code via `/context-engineering`). Prior art / current
architecture: [docs/MELODY_SYSTEM.md](../MELODY_SYSTEM.md), [docs/specs/ROBOT_MELODY_SEED_ENGINE.md](ROBOT_MELODY_SEED_ENGINE.md)
(the rhythm engine this phase extends), [docs/specs/COMPANIES.md](COMPANIES.md) (the
broadcast-not-link wiring pattern this phase's company-mode support follows).

---

## 1. Overview & Claude Explanation

This phase adds **Pitch Repeat** (`Robot.pitchRepeat`, `0–100`, lore label "Ping Repetition
Allowance") — a new slider that, as it rises, increasingly locks a tiled motif's *repeated cells*
to the same pitches as the base cell, not just the same rhythm. It bundles one small, deliberately
scoped fix to the shared rhythm engine (§ below) so the feature has something real to lock once
motif length doesn't evenly divide 16.

**Gating:** inert whenever `rhythmicMotifLength.active === false` — no cell concept exists to lock
pitches within when tiling is off.

**Locking algorithm** (new pure function, `computePitchLockPlan` in `melodyGenerator.ts`):
- The base cell (repeat 0) has `K` onset positions. A seeded permutation of those `K` positions
  (indices `0..K-1`) is drawn once — the order positions get locked in, not always position-0-first.
- The slider's `0–100` range is divided into `K` equal-width stages, one per position in that
  order. Within a position's stage, the *count* of non-base repeats locked for that position ramps
  from `0` (stage start) to "all applicable repeats" (stage end); once a stage completes, later
  stages never unlock it — locking is monotonic as the slider rises.
- *Which* repeats lock first within a stage is controlled by a second seeded permutation — of
  non-base repeat indices — **shared across every position** (drawn once, not re-rolled per
  position). At a given slider value, the locked set for a position is always the fixed-count
  *prefix* of this shared order, filtered to repeats that actually contain that position (see tail
  cell below) — not an independent per-repeat coin flip.
- A locked `(position, repeat)` onset copies the base cell's `noteIndex` **verbatim**, bypassing
  Note Variance entirely for that onset. Unlocked onsets run through today's Note Variance logic,
  untouched, in the same iteration order as today (so a fully-unlocked melody, e.g. at
  `pitchRepeat = 0`, is statistically indistinguishable from today's output — the loop only skips
  calling the selection functions for locked onsets, it never reorders or otherwise perturbs the
  unlocked ones).
- Both permutations, and every stage/count calculation, are drawn from the same seeded `rand`
  stream `generateMelodyForRobot` already threads through onset/pitch generation — no new
  `Math.random`, no new seeding utility (per CLAUDE.md and this feature's own Constraint).
- Locked onsets are stamped `pitchLocked: true` on their `MelodyEvent` — a new, plain,
  serializable boolean field. Base-cell (repeat 0) events and unlocked events leave the field
  `undefined`. This is what lets `reRollMelodyPitches` (docking) skip re-derivation entirely.

**Tail-cell fix ("untruncating"), bundled into this same phase:** Today, when
`rhythmicMotifLength.value` (`M`) doesn't evenly divide 16, `buildMotifOnsets` drops the leftover
`16 mod M` steps entirely — verified empirically (M=3,5,6,7 against 16 subdivisions never emit an
onset past `repeats × M`). `buildMotifOnsets` gains a final partial-cell pass: after tiling
`repeats = floor(16 / M)` full copies of the base motif, it also copies whichever base-motif
positions are `< tailLength` (`tailLength = 16 − repeats × M`) into one final partial cell at
offset `repeats × M`. This is a deterministic subset of the same base motif, not a fresh random
draw, so the tail cell participates in Pitch Repeat's lock exactly like a full repeat — just with
fewer positions. **This is a change to the shared rhythm engine, not scoped to Pitch Repeat**: any
robot with `rhythmicMotifLength.active: true` and `value` in `{3, 5, 6, 7}` gets a few extra onsets
regardless of its own `pitchRepeat` setting. `value` in `{1, 2, 4, 8}` evenly divides 16 and is
unaffected. It's bundled here because without it, Pitch Repeat's tail-cell locking has nothing to
lock — the cell would stay permanently empty, making that part of the feature vacuous.

**Seeding & lifecycle:** rolled per-robot at spawn from the locale noise map
(`getSeededVal(noiseMap, 'robot.pitchRepeat', spawnCount, 0, 100)`), same convention as
Density/Motif Length/Note Variance; inherited verbatim on the `shouldCopy` path; not preserved
across a coordinate change (rerolls with everything else, since a new noise map reseeds the whole
melody); manually edited via a new `applyPitchRepeat(robot, localeId, value)` mirroring
`applyDensity` exactly (writes the field, calls `regenerateMelody`, which — like the other three
fields today — takes the existing unseeded `Math.random` path; not fixed by this phase); wired into
both `RobotOptionsTab.tsx` (robot mode) and `CompanyOptionsSection.tsx` (company-broadcast mode),
matching `applyDensity`/`applyMotifLength`/`applyNoteVariance`'s existing wiring in both.

**Docking re-roll interaction:** `reRollMelodyPitches` excludes `pitchLocked` events from its
candidate pool before picking `round(melody.length × ratio)` events to change. The existing
"always changes at least 1" floor now only applies when the eligible (unlocked) pool is non-empty —
it can pick down to zero when every eligible event is exhausted, and down to zero entirely when the
whole melody is locked. A heavily Pitch-Repeat-locked melody visibly resists drifting on dock rather
than quietly compensating to preserve a fixed amount of change.

---

## 2. Target File Structure

```text
src/
├── constants/
│   └── index.ts                       # MODIFIED — new PITCH_REPEAT_MIN = 0, PITCH_REPEAT_MAX = 100
├── types/
│   ├── Robot.ts                       # MODIFIED — new `pitchRepeat?: number` field on Robot;
│   │                                   #   `pitchLocked?: boolean` added to `MelodyEvent` (at the
│   │                                   #   time, separately declared from melodyGenerator.ts's own
│   │                                   #   RobotMelodyEvent copy — see § 3; the two were later
│   │                                   #   merged into this one canonical interface)
│   └── Company.ts                     # MODIFIED — `CompanyOptionsSnapshot.pitchRepeat?: number`
│                                       #   alongside its existing rhythmicDensity field
├── engine/
│   ├── melodyGenerator.ts             # MODIFIED — RobotMelodyEvent (since merged into MelodyEvent,
│   │                                   #   see § 3) gained `pitchLocked?: boolean`;
│   │                                   #   buildMotifOnsets gains the tail-cell pass; new exported
│   │                                   #   `computePitchLockPlan` pure function; generateMelodyForRobot
│   │                                   #   wires pitchRepeat through and stamps pitchLocked;
│   │                                   #   reRollMelodyPitches excludes locked events from its pool
│   ├── melodyGenerator.test.ts        # MODIFIED — new describe blocks for computePitchLockPlan and
│   │                                   #   the tail-cell pass; generateMelodyForRobot/reRollMelodyPitches
│   │                                   #   blocks extended for pitchRepeat/pitchLocked
│   └── regenerateMelody.ts            # MODIFIED — reads robot.pitchRepeat (default DEFAULT_PITCH_REPEAT)
│                                       #   into the GenerateMelodyForRobotOptions call
├── systems/
│   ├── spawnSystem.ts                 # MODIFIED — spawnPitchRepeat seeded via
│   │                                   #   getSeededVal(noiseMap, 'robot.pitchRepeat', spawnCount, 0, 100),
│   │                                   #   inherited on the shouldCopy path, passed into both the
│   │                                   #   Robot literal and generateMelodyForRobot
│   ├── spawnSystem.test.ts            # MODIFIED — new coverage: pitchRepeat is seeded 0-100,
│   │                                   #   inherited verbatim on shouldCopy
│   ├── robotSystems.ts                # MODIFIED — no call-site change (reRollMelodyPitches already
│   │                                   #   takes the full melody); behavior change lives inside
│   │                                   #   melodyGenerator.ts
│   ├── robotSystems.test.ts           # MODIFIED — new coverage: docking a fully-locked robot changes
│   │                                   #   zero notes; a partially-locked robot changes only unlocked ones
│   ├── robotOptionsActions.ts         # MODIFIED — new `applyPitchRepeat(robot, localeId, value)`,
│   │                                   #   placed alongside applyDensity/applyMotifLength/applyNoteVariance
│   ├── robotOptionsActions.test.ts    # MODIFIED — new applyPitchRepeat describe block
│   └── companyOptions.ts              # MODIFIED — resolveCompanyOptions includes
│                                       #   `pitchRepeat: firstMember.pitchRepeat ?? DEFAULT_PITCH_REPEAT`
├── data/
│   └── robotOptionsConfig.ts          # MODIFIED — new `PITCH_REPEAT_SCHEMA: SliderLinearSchema`
│                                       #   (same shape as DENSITY_SCHEMA), lore label "PING REPETITION
│                                       #   ALLOWANCE", human label "Pitch Repeat"
└── components/
    ├── robot/
    │   ├── PingControlsDrawer.tsx      # MODIFIED — PingControlsValue gains `pitchRepeat: number`;
    │   │                                #   new onPitchRepeatChange prop; renders a SliderLinear with
    │   │                                #   PITCH_REPEAT_SCHEMA, disabled whenever
    │   │                                #   !value.rhythmicMotifLength.active (in addition to the
    │   │                                #   existing generationDisabled gate)
    │   └── PingControlsDrawer.test.tsx # MODIFIED — new assertions for the slider + its motif-gated
    │                                    #   disabled state
    ├── panels/screen/console/
    │   ├── RobotOptionsTab.tsx         # MODIFIED — pingControlsValue includes
    │   │                                #   `pitchRepeat: robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT`;
    │   │                                #   new onPitchRepeatChange wired to applyPitchRepeat
    │   └── RobotOptionsTab.test.tsx    # MODIFIED — new wiring assertion (mirrors the existing
    │                                    #   onDensityChange → applyDensity spy test)
    └── company/
        ├── CompanyOptionsSection.tsx      # MODIFIED — DISABLED_PING_CONTROLS gains
        │                                   #   `pitchRepeat: 0`; new onPitchRepeatChange handler
        │                                   #   using the plain-number broadcast pattern (members.forEach
        │                                   #   + patchSnapshot), matching onDensityChange exactly —
        │                                   #   not the diffCompoundField pattern (pitchRepeat is a
        │                                   #   plain number, not a {active, value} toggle)
        └── CompanyOptionsSection.test.tsx # MODIFIED — new broadcast-wiring assertion
docs/
├── MELODY_SYSTEM.md                   # MODIFIED — documents the tail-cell fix under "Rhythm model"
│                                       #   and a new "Pitch Repeat" section describing
│                                       #   computePitchLockPlan's staged/seeded algorithm
└── intent/pitch-repeat.md             # Source of intent — already updated during context-engineering;
                                        #   no further change expected during this phase
```

**Confirmed NOT touched:** `src/engine/AudioEngine.ts` (no scheduling/playback change — Pitch Repeat
and the tail-cell fix are both generation-time only), `src/components/ui/controls/SliderLinear.tsx`
(reused as-is, same as Density), `src/utils/noiseMaps.ts` / `src/utils/getSeededVal.ts` (consumed
as-is), `pickDurationForGap`/`gridUnitsToDuration`/octave-selection logic in `melodyGenerator.ts`
(untouched — this phase only ever changes onset *count/placement* in the tail cell and `noteIndex`
selection, never duration or octave), `src/components/robot/PingContourDrawer.tsx` /
`SignatureArrayDrawer.tsx` (unrelated drawers).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build
  assets.
* **Fully seeded/deterministic.** No `Math.random` anywhere in `computePitchLockPlan`, the tail-cell
  pass, or `generateMelodyForRobot`'s pitch-locking wiring — every random draw goes through the
  `rand` function already threaded through `generateMelodyForRobot` (per CLAUDE.md).
  `regenerateMelody.ts`'s existing unseeded manual-edit path is unchanged, not extended, for any of
  the four rhythm/pitch fields.
* **The tail-cell fix is the *only* rhythm/onset-generation change this feature makes.** Duration
  selection and octave assignment stay untouched. `buildMotifOnsets`'s `R`-extra-onset-per-repeat
  branch and its `combined.length <= rhythmicDensity` overshoot-trim branch are both untouched — the
  tail-cell pass is additive, appended *after* that existing logic runs, never counted against the
  density target passed in.
* **`RobotMelodyEvent` (melodyGenerator.ts) and `MelodyEvent` (types/Robot.ts) were two
  separately-declared, structurally-identical interfaces** (pre-existing duplication, not introduced
  by this phase). At the time, `pitchLocked?: boolean` had to be added to *both* — a locked event
  flows from `generateMelodyForRobot`'s return type into `Robot.melody` via `updateRobot`/
  `AudioEngine.registerRobotMelody`, and any read of `robot.melody[i].pitchLocked` (the docking
  re-roll, in particular) wouldn't type-check against a `MelodyEvent[]` missing the field. The
  duplication was later resolved on `bug/duplicate-melody-event`: `melodyGenerator.ts` now imports
  the single `MelodyEvent` interface from `types/Robot.ts` instead of declaring its own copy, and
  every call site (`AudioEngine.ts`, test files) was renamed to match — `RobotMelodyEvent` no
  longer exists as a name in the codebase.
* **State stays JSON-serializable.** `pitchRepeat` is a plain number on `Robot` (same shape as
  `rhythmicDensity` — no `{active, value}` toggle of its own). `pitchLocked` is a plain boolean on
  the melody event types. No functions, no derived-at-read-time closures.
* **No new seeding/hashing utility.** Reuses `getLocaleNoiseMap` + `getSeededVal` exactly as
  `robot.rhythmicDensity`/`robot.id`/etc. already do.
* **`computePitchLockPlan` is a separately exported, separately unit-tested pure function** — same
  precedent as `buildMotifOnsets`. Do not inline its logic directly into
  `generateMelodyForRobot`'s body.
* **Base-cell (repeat 0) events are never stamped `pitchLocked: true`.** They're the copy source,
  not a locked target — see § 7, Open Question 1, for the one unresolved question this raises for
  the docking re-roll.

---

## 4. Code Style & Architecture Conventions

**`melodyGenerator.ts` — `buildMotifOnsets` tail-cell pass (appended after the existing
trim-check return):**

```typescript
// BEFORE — repeats = floor(subdivisions / M); the loop below only ever runs `repeats` times,
// so the leftover `subdivisions - repeats * M` steps never receive an onset.
for (let rep = 0; rep < repeats; rep++) {
  const offset = rep * M;
  // ...tile baseMotif (+ one R extra-onset for the first R repeats) at `offset`...
}
const combined = Array.from(onsetSet).sort((a, b) => a - b);
if (combined.length <= rhythmicDensity) {
  return combined;
}
// ...trim branch...
```

```typescript
// AFTER — same loop, unchanged, PLUS one additive tail-cell pass before the existing trim check.
// The tail is a deterministic subset of baseMotif, not counted against rhythmicDensity — it's
// appended onto onsetSet directly, not folded into the R/trim logic above.
for (let rep = 0; rep < repeats; rep++) {
  const offset = rep * M;
  // ...unchanged...
}
const tailLength = subdivisions - repeats * M;
if (tailLength > 0) {
  const tailOffset = repeats * M;
  for (const pos of baseMotif) {
    if (pos < tailLength) onsetSet.add(tailOffset + pos);
  }
}
const combined = Array.from(onsetSet).sort((a, b) => a - b);
if (combined.length <= rhythmicDensity) {
  return combined;
}
// ...trim branch, unchanged...
```

**`melodyGenerator.ts` — new `computePitchLockPlan` (pure function, separately tested):**

```typescript
/**
 * Determine which onsets in a tiled-motif melody should copy the base cell's noteIndex
 * verbatim, per Pitch Repeat's staged/seeded locking model (docs/intent/pitch-repeat.md).
 * Returns a boolean per onset, same order/length as `onsets`. Repeat-0 (base cell) onsets are
 * always `false` — they're the copy source, never a locked target.
 */
export function computePitchLockPlan(
  onsets: number[],        // sorted absolute grid positions (0-indexed), from buildMotifOnsets
  motifLength: number,     // M
  subdivisions: number,    // 16
  pitchRepeatPct: number,  // 0-100
  rand: () => number,
): boolean[] {
  const repeats = Math.floor(subdivisions / motifLength);
  const tailLength = subdivisions - repeats * motifLength;
  const totalRepeats = repeats + (tailLength > 0 ? 1 : 0);

  const basePositions = onsets.filter((o) => o < motifLength); // sorted — repeat 0's own onsets
  const K = basePositions.length;
  if (K === 0 || totalRepeats <= 1) return onsets.map(() => false);

  // Two independent seeded permutations, drawn from the same `rand` stream as everything else.
  const positionOrder = pickUniqueInRange(K, K, rand);              // order positions lock in
  const repeatOrder = pickUniqueInRange(totalRepeats - 1, totalRepeats - 1, rand)
    .map((i) => i + 1);                                             // shared repeat-lock order

  const stageWidth = 100 / K;
  const locked = new Set<string>(); // `${position}:${repeatIdx}`

  positionOrder.forEach((posIdx, stageNum) => {
    const position = basePositions[posIdx];
    const stageStart = stageNum * stageWidth;
    const stageEnd = stageStart + stageWidth;
    const fraction = pitchRepeatPct <= stageStart ? 0
      : pitchRepeatPct >= stageEnd ? 1
      : (pitchRepeatPct - stageStart) / stageWidth;

    // Only repeats that actually contain this position — the tail repeat may not.
    const applicable = repeatOrder.filter((r) => r < repeats || (r === repeats && position < tailLength));
    const n = Math.round(fraction * applicable.length);
    for (let i = 0; i < n; i++) locked.add(`${position}:${applicable[i]}`);
  });

  return onsets.map((o) => {
    const repeatIdx = Math.floor(o / motifLength);
    if (repeatIdx === 0) return false;
    return locked.has(`${o % motifLength}:${repeatIdx}`);
  });
}
```

**`melodyGenerator.ts` — wiring inside `generateMelodyForRobot` (after onsets are built, before/
during the existing per-onset noteIndex loop):**

```typescript
// NEW — only meaningful when motif tiling is active; plan is all-false otherwise.
const lockPlan = motif.active
  ? computePitchLockPlan(onsets, motifLength, subdivisions, pitchRepeatPct, rand)
  : onsets.map(() => false);

// Inside the existing per-onset loop, before the noteIndex if/else chain:
if (lockPlan[i]) {
  // Verbatim copy from the already-computed base-cell event at this position — bypasses
  // Note Variance entirely, and does NOT touch uniqueSet/withoutReplacementPool state, so
  // unlocked onsets later in the same melody see identical state to today's unmodified run.
  noteIndex = basePositionNoteIndex.get(onsets[i] % motifLength)!;
} else {
  // ...existing Note Variance if/else chain, unchanged...
}
melody.push({ ...(lockPlan[i] ? { pitchLocked: true } : {}), id: ..., startStep: ..., length: ..., noteIndex, octave: currentOctave });
```

**`melodyGenerator.ts` — `reRollMelodyPitches` (excludes locked events from the candidate pool):**

```typescript
// BEFORE
const count = Math.max(1, Math.round(melody.length * ratio));
const changeIndices = new Set(pickRandomIndices(melody, count, opts.rand));
```

```typescript
// AFTER — the floor-of-1 only applies when there's at least one eligible (unlocked) event;
// a fully-locked melody re-rolls zero notes instead of force-changing one.
const eligible = melody.map((_, i) => i).filter((i) => !melody[i].pitchLocked);
if (eligible.length === 0) return melody;
const count = Math.max(1, Math.min(Math.round(melody.length * ratio), eligible.length));
const pickedPositions = pickRandomIndices(eligible, count, opts.rand);
const changeIndices = new Set(pickedPositions.map((p) => eligible[p]));
```

**`robotOptionsActions.ts` — `applyPitchRepeat` (mirrors `applyDensity` exactly):**

```typescript
export function applyPitchRepeat(robot: Robot, localeId: string, value: number): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { pitchRepeat: value });
  regenerateMelody({ ...robot, pitchRepeat: value }, localeId);
}
```

**`localeStore.ts` — `updateRobot`'s clamp block (same pattern as `rhythmicDensity`):**

```typescript
if (typeof normalized.pitchRepeat === 'number') {
  normalized.pitchRepeat = Math.max(PITCH_REPEAT_MIN, Math.min(PITCH_REPEAT_MAX, Math.trunc(normalized.pitchRepeat)));
}
```

* **Naming Conventions:** No new files. `DEFAULT_PITCH_REPEAT` lives in `melodyGenerator.ts`
  alongside `DEFAULT_RHYTHMIC_DENSITY`/`DEFAULT_RHYTHMIC_MOTIF_LENGTH`/`DEFAULT_NOTE_VARIANCE`.
  `PITCH_REPEAT_MIN`/`MAX` live in `constants/index.ts` alongside the other three fields' ranges.
* **Formatting:** Match each touched file's existing section-comment banner style
  (`// ========================================` in `melodyGenerator.ts`/`spawnSystem.ts`).

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate (see § 2 for the exact `.test.ts`/`.test.tsx` files touched).
* **`melodyGenerator.test.ts` — new `buildMotifOnsets` tail-cell coverage:**
  1. `M` values that evenly divide 16 (`1, 2, 4, 8`) are byte-for-byte unaffected — same onset sets
     as before this change (regression guard).
  2. `M` values that don't (`3, 5, 6, 7`) now include onsets in the tail region
     (`>= repeats × M`), and every tail onset's position (`onset - repeats × M`) is a member of the
     base motif's own position set.
  3. Tail onset count never exceeds `K` (the base motif's own onset count) and never exceeds
     `tailLength`.
* **`melodyGenerator.test.ts` — new `computePitchLockPlan` describe block:**
  1. `pitchRepeatPct: 0` → every returned value is `false`.
  2. `pitchRepeatPct: 100` → every non-base-cell onset is `true` (full verbatim repetition).
  3. Monotonicity: for a fixed seed, the set of `true` indices at `pct: N` is a subset of the set at
     `pct: N+10`, swept across the full range.
  4. Determinism: same `onsets`/`motifLength`/`pitchRepeatPct`/seed → identical plan across two
     calls.
  5. Two different seeds produce different position-lock orders (not always position 0 first) —
     guards the "not always position 0 first" success criterion.
  6. A motif length with a tail (e.g. `M=6` against 16 subdivisions) correctly excludes the tail
     repeat from a position's applicable-repeat list when that position is `>= tailLength`.
* **`melodyGenerator.test.ts` — `generateMelodyForRobot` additions:**
  1. `pitchRepeat: 0` (or field absent) produces output statistically matching today's — run with a
     fixed seed and diff against the pre-change golden output for the same seed/options.
  2. `pitchRepeat: 100` — every repeat's `noteIndex` sequence (by position) matches the base cell's.
  3. `pitchRepeat > 0` events are stamped `pitchLocked: true` exactly on the locked onsets, `undefined`
     everywhere else including the base cell.
  4. `rhythmicMotifLength.active: false` → `pitchRepeat` has no effect regardless of value (gating).
* **`melodyGenerator.test.ts` — `reRollMelodyPitches` additions:**
  1. A melody with every event `pitchLocked: true` → re-roll returns the melody unchanged (0 events
     changed), not the old floor-of-1.
  2. A partially-locked melody → only unlocked events are ever selected for change across repeated
     seeded runs.
  3. A melody with no locked events → identical behavior to today (regression guard against the
     eligible-pool refactor).
* **`spawnSystem.test.ts` (new coverage):** `pitchRepeat` is seeded `0-100` from the noise map;
  inherited verbatim (not re-rolled) on the `shouldCopy` path, matching `rhythmicDensity`'s existing
  test.
* **`robotSystems.test.ts` (new coverage):** docking a robot with `pitchRepeat: 100` and motif tiling
  active changes zero notes on re-roll; docking a `pitchRepeat: 0` robot behaves exactly as today's
  existing test (2 of 8 onsets, default settings) — regression guard.
* **`robotOptionsActions.test.ts` (new coverage):** `applyPitchRepeat` writes the field via
  `updateRobot` and triggers `regenerateMelody`, mirroring the existing `applyDensity` test.
* **`localeStore.test.ts` (new coverage):** `updateRobot` clamps `pitchRepeat` to `0-100`, same
  pattern as the existing `rhythmicDensity` clamp test.
* **`PingControlsDrawer.test.tsx` / `RobotOptionsTab.test.tsx` / `CompanyOptionsSection.test.tsx`
  (new coverage):** the new slider renders, fires `onPitchRepeatChange`, is disabled whenever motif
  tiling is inactive (in addition to the existing `disabled`/`clickTrackActive` gates), and — for
  `CompanyOptionsSection` — broadcasts to every member via the plain-number pattern (not
  `diffCompoundField`).
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (catches any missing `pitchLocked` field on
     `MelodyEvent`, or a stale prop shape).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including the regression guards above.
  4. `npm run build` — production bundle builds cleanly.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges
  manually.
* **Branch Convention:** `feature/pitch-repeat`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences. Suggested grouping: (1) constants + type additions (`pitchRepeat`/`pitchLocked` on both
  melody-event interfaces), (2) `buildMotifOnsets` tail-cell pass + its tests, (3)
  `computePitchLockPlan` + its tests, (4) `generateMelodyForRobot`/`reRollMelodyPitches` wiring +
  their tests, (5) `spawnSystem.ts` seeding + its test, (6) `robotOptionsActions.ts` +
  `localeStore.ts` clamp + their tests, (7) UI wiring (schema, `PingControlsDrawer.tsx`,
  `RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx`, `companyOptions.ts`) + their tests, (8) docs.

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan/Tasks phase before implementation, not silently
during coding:

1. **Does docking re-roll also need to exclude base-cell (repeat 0) events once any of their
   repeats are locked?** Today, `reRollMelodyPitches` can still pick a base-cell event for
   re-rolling even at `pitchRepeat: 100` (base-cell events are never stamped `pitchLocked`). If it
   does, every locked *copy* of that position now silently mismatches the (newly re-rolled) base
   pitch until the next full regeneration — the tiled motif looks pitch-locked but audibly isn't,
   right after a dock. Not addressed by `docs/intent/pitch-repeat.md`. Two options: (a) leave as
   spec'd — base cell stays eligible, locked copies can drift stale until next regeneration; (b)
   also exclude base-cell events whenever any of their repeats are currently locked. Low
   implementation cost either way; needs a product call, not an engineering default.
2. **`DEFAULT_PITCH_REPEAT` value.** Proposed `0` (preserves today's behavior exactly when the field
   is absent, matching the Success criterion's "statistically indistinguishable at `pitchRepeat: 0`"
   bar) — unlike `DEFAULT_RHYTHMIC_DENSITY` (`50`), there's no mid-range "sensible default" here
   since `0` *is* the neutral/off state. Confirm during Plan.
3. **Exact stage-boundary rounding when `100 / K` isn't an integer** (e.g. `K=3` → stages at
   `33.3̄/66.6̄/100`). `computePitchLockPlan`'s sketch in § 4 uses floating-point stage boundaries
   directly; confirm this is acceptable versus e.g. rounding stage boundaries to the nearest integer
   percent (which would need its own tie-breaking rule at the last stage to guarantee `pct: 100`
   still fully locks).
4. **`PITCH_REPEAT_SCHEMA`'s exact lore label string.** `docs/intent/pitch-repeat.md` says "Ping
   Repetition Allowance"; confirm exact casing/wording against `DENSITY_SCHEMA`'s `'PING DENSITY'`
   convention (all-caps lore labels) before implementation.
5. **Where in `PingControlsDrawer.tsx`'s control order the new slider goes** — alongside
   Density/Motif Length (before Octave Range/Note Variance), or after Note Variance. Not specified
   in intake; low risk, pick during Plan.
