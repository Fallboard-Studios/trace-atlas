# Phase Spec: Deterministic Robot Melody Generation

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/deterministic-robot-melody-generation.md](../intent/deterministic-robot-melody-generation.md), confirmed via `interview-me` 2026-09-28. Roadmap [Phase 31](../todo/roadmap.md#31-deterministic-robot-melody-generation), depended on by [Phase 32](../todo/roadmap.md#32-robot-melody-history--configuration-scrubber) (melody history, not part of this phase). Status: not yet implemented — Specify phase, pending Crawford's review before Plan.

---

## 1. Overview & Claude Explanation

A robot's melody today comes from **two separate, differently-seeded mechanisms** that this phase unifies into one. At spawn (`spawnSystem.ts`'s `spawnRobot`), the initial melody is already fully deterministic — it's generated via `generateMelodyForRobot({ ..., rand: melodyRand })`, where `melodyRand` draws from `getSeededVal(noiseMap, 'melody.rand', spawnCount * 100 + melodyCallIndex++)`, one noise-map row per call. But every *later* edit to a robot's Rhythmic Density, Motif Length, Note Variance, or Pitch Repeat re-triggers `regenerateMelody.ts`, which calls `generateMelodyForRobot()` with **no seed or rand at all** — `melodyGenerator.ts`'s own fallback (`opts.rand ?? (opts.seed !== undefined ? alea(String(opts.seed)) : Math.random)`) silently drops to `Math.random()`. So a robot's melody is reproducible exactly once (at spawn) and then becomes a one-way die roll on every subsequent tweak — confirmed live in `regenerateMelody.ts` (no `seed`/`rand` in its `generateMelodyForRobot` call) and in `docs/MELODY_SYSTEM.md`'s own "Seeding & lifecycle" section, which already documents this as the "existing unseeded `Math.random` manual-edit path."

This phase closes that gap **and** unifies the two mechanisms, rather than patching only the edit path. A new `Robot.compositionSeed: number` field is drawn once at spawn — its own `getSeededVal(noiseMap, 'robot.compositionSeed', spawnCount, 0, 1)`, own dataId, exactly mirroring `generateRobotId`'s shape (`spawnSystem.ts:219`) — and becomes the one shared entropy source both `spawnRobot`'s initial melody generation and every later `regenerateMelody.ts` call draw from, combined with the robot's *current* `rhythmicDensity`/`rhythmicMotifLength`/`noteVariance`/`pitchRepeat`/`octaveRange`. Unifying the two call sites is deliberate (confirmed in interview): without it, a robot's very first slider edit — even nudged right back to its starting value — would permanently shift it off the melody it was spawned with, since spawn-time and edit-time would still be drawing from two different RNG derivations. `generateMelodyForRobot`'s own signature and internals (`melodyGenerator.ts`) are **not** changed — this phase adds one new small exported helper there and changes only what its two callers pass in.

**Accepted consequence, confirmed during interview, not a bug to fix later:** once this ships, an existing, previously-familiar locale seed's robots will generate *different* initial melodies than they did before — `'melody.rand'`'s dataId is retired in favor of `'robot.compositionSeed'` combined differently, so even though every other seeded attribute (id, name, audio attributes, rhythmic density, etc.) stays byte-identical for a given seed, the melody itself changes. This is an unavoidable side effect of unifying the two mechanisms under one formula, not a regression.

`applyOctaveMin`/`applyOctaveMax` (`robotOptionsActions.ts`) start calling `regenerateMelody` too, closing a second, independent pre-existing gap: octave-range edits currently don't touch melody at all, even though octave range is one of the five formula inputs. The standalone Reset Melody control is removed outright (its `PingControlsDrawer.tsx` button, `RobotOptionsTab.tsx`'s wiring, and `RESET_MELODY_SCHEMA` in `robotOptionsConfig.ts`) — under full determinism there's nothing left for it to do that changing an attribute doesn't already do.

**What this phase deliberately does not touch:** `robotSystems.ts`'s docking pitch-drift reroll (`reRollMelodyPitches`, via `DOCKED_PITCH_DRIFT_RATIO`) is a distinct, existing mechanism that intentionally introduces gradual, non-reproducible pitch drift over a robot's lifetime — that randomness is the feature, not a gap this phase closes. Session Storage's `RobotAudioOverrideDiff`/`SessionPayload` types (`src/types/session.ts`) need **no changes** — `compositionSeed` is never user-edited, so like `id` it's never diffed; it simply regenerates identically from the seed on every roster regeneration, which is exactly what makes Session Storage's existing five-input diff "sufficient on its own" for melody fidelity across a save/load round trip (per the intent doc).

---

## 2. Target File Structure

```text
src/
├── types/
│   └── Robot.ts                          MODIFIED — add `compositionSeed: number` (required, like `id`,
│                                          not optional like the five overridable attribute fields)
├── engine/
│   ├── melodyGenerator.ts                MODIFIED — add one new exported pure helper, buildSeededComposition
│                                          (name TBD at Plan; see §4), combining a compositionSeed and the
│                                          five current attribute values into an `alea`-based `() => number`.
│                                          generateMelodyForRobot's own signature/internals: UNCHANGED.
│   ├── melodyGenerator.test.ts           MODIFIED — new tests for the new helper (see §5)
│   ├── regenerateMelody.ts               MODIFIED — builds the rand via the new helper from
│                                          robot.compositionSeed + current attributes, passes it as
│                                          opts.rand (not opts.seed — see §4 for why this departs from the
│                                          intent doc's literal wording)
│   └── regenerateMelody.test.ts          MODIFIED — makeRobot() fixture gains a compositionSeed default;
│                                          new determinism tests (see §5)
├── systems/
│   ├── spawnSystem.ts                    MODIFIED — new generateCompositionSeed(noiseMap, spawnCount)
│                                          (mirrors generateRobotId's shape); spawnRobot's own initial-melody
│                                          call switches from the melodyRand/melodyCallIndex mechanic to the
│                                          same buildSeededComposition helper regenerateMelody.ts uses; the
│                                          'melody.rand' dataId and melodyCallIndex local are retired.
│                                          compositionSeed is always fresh (computed unconditionally,
│                                          outside the shouldCopy branch — never inherited on copy, same
│                                          treatment as id/name/melody itself)
│   ├── spawnSystem.test.ts               MODIFIED — new tests: compositionSeed is deterministic from
│                                          (noiseMap, spawnCount); NOT inherited on the copy path; a
│                                          same-seed same-coordinates reload reproduces the same initial
│                                          melody (regression guard replacing the retired melody.rand
│                                          coverage)
│   └── robotOptionsActions.ts            MODIFIED — applyOctaveMin/applyOctaveMax each gain a
│                                          regenerateMelody call, mirroring applyDensity's existing shape
│   └── robotOptionsActions.test.ts       MODIFIED — new tests confirming applyOctaveMin/applyOctaveMax now
│                                          trigger regeneration; existing tests for the other four setters
│                                          are the reference shape
├── data/
│   ├── robotOptionsConfig.ts             MODIFIED — RESET_MELODY_SCHEMA removed
│   └── robotOptionsConfig.test.ts        MODIFIED — RESET_MELODY_SCHEMA references removed
└── components/
    ├── panels/screen/console/
    │   ├── RobotOptionsTab.tsx           MODIFIED — handleResetMelody and the onResetMelody prop passed to
    │   │                                 PingControlsDrawer/PingControlsRhythmSection removed
    │   └── RobotOptionsTab.test.tsx      MODIFIED — the onResetMelody-wiring test (line ~349) and the
    │                                     fake test double's onResetMelody prop/button removed
    └── robot/
        ├── PingControlsDrawer.tsx        MODIFIED — onResetMelody prop + `{onResetMelody && <Button .../>}`
        │                                 JSX removed from all three component exports in this file (the
        │                                 legacy combined drawer plus the two split
        │                                 PingControlsRhythmSection/PingControlsFrequencySection pieces —
        │                                 see docs/UI_SHELL.md's "gained a 4th tree level" note for why
        │                                 three copies exist)
        └── PingControlsDrawer.test.tsx   MODIFIED — every Reset-Melody-specific test/describe block removed
                                          (multiple occurrences across the file's three render-target
                                          sections — confirmed via grep, not assumed single-occurrence)
docs/
├── MELODY_SYSTEM.md                      MODIFIED — "Seeding & lifecycle" section rewritten (Pitch Repeat
│                                          and its siblings no longer take "the existing unseeded
│                                          Math.random manual-edit path"); Click Track funnel's call-site
│                                          list drops "Reset Melody"
├── PROCEDURAL_GENERATION.md              MODIFIED — the `melodyGenerator.ts` row's "spawnSystem.ts wires
│                                          getSeededVal(noiseMap, 'melody.rand', ...) in" description, and
│                                          the `offset` example citing `spawnCount * 100 +
│                                          melodyCallIndex++`, both describe the retired mechanic
└── todo/roadmap.md                       MODIFIED — Phase 31 marked done once shipped, per Phase 19/20's
                                           citation style
```

No new dependency — `alea` is already a direct dependency, already imported in both `melodyGenerator.ts` and `spawnSystem.ts`.

---

## 3. Implementation Boundaries & Constraints

Non-negotiable, from `CLAUDE.md` (re-checked for this change):

- **Melody Logic guardrail** (`CLAUDE.md`): "Melodies must store note indices (0..7), never literal pitch strings" — untouched by this phase; nothing here changes `MelodyEvent`'s shape.
- **No Tone synths in components, no timers for musical timing** — this phase touches zero audio-scheduling or animation code; it only changes *which RNG stream* feeds `generateMelodyForRobot`, a synchronous pure function called from store-update paths exactly as it is today.
- **State stays JSON-serializable.** `Robot.compositionSeed: number` qualifies trivially — same shape as every other seeded numeric field already on `Robot`.
- **`melodyGenerator.ts` never imports `noiseMaps`/`getSeededVal` directly** (`docs/PROCEDURAL_GENERATION.md`'s architecture table) — the new helper in that file must keep taking a pre-computed `compositionSeed: number` as a plain argument, the same way it already takes `rand`/`seed`, never reaching into the noise-map registry itself. `getSeededVal` usage stays confined to `spawnSystem.ts`, where `compositionSeed` is actually drawn.
- **Don't rename an existing `dataId` string** (`docs/PROCEDURAL_GENERATION.md`) — `'robot.compositionSeed'` is a new dataId, not a rename of `'melody.rand'`. `'melody.rand'` is retired (simply stops being read), not renamed.
- **`generateRobotAudioBaseline`/`generateRobotRosterBaseline`/`RobotAudioBaseline`** (`spawnSystem.ts`, used by Session Storage's `sessionDiff.ts`) are **not modified** — `compositionSeed` is deliberately excluded from this type, per §1's "what this phase does not touch."
- **Ask first** (per `CLAUDE.md`): no new dependency, no change to audio/animation architecture. Nothing here requires it.
- **Never:** persist melody data directly; introduce a global settings→melody map with no robot identity; add a "Reroll" affordance in place of the removed Reset Melody button; make `robotSystems.ts`'s docking pitch-drift reroll deterministic (its randomness is intentional, not a gap).

---

## 4. Code Style & Architecture Conventions

### 4.1 `Robot.ts`

```typescript
// Alongside `id: string;` — always set at spawn, never optional, never user-edited.
compositionSeed: number;
```

### 4.2 `spawnSystem.ts` — `generateCompositionSeed`

Mirrors `generateRobotId`'s exact shape (`spawnSystem.ts:219`), including the no-noiseMap fallback convention every other per-field generator in this file already follows:

```typescript
function generateCompositionSeed(noiseMap: NoiseFunction2D, spawnCount: number): number {
  return getSeededVal(noiseMap, 'robot.compositionSeed', spawnCount, 0, 1);
}
```

Computed unconditionally in `spawnRobot`, before the `shouldCopy` branch resolves (same treatment as `id`/`name`/`melody` — "always fresh," never inherited from a copy source), with the same `noiseMap`-present/absent split every other field already uses:

```typescript
const compositionSeed = noiseMap
  ? generateCompositionSeed(noiseMap, spawnCount)
  : alea(`${localeId}:${spawnCount}:compositionSeed`)();
```

### 4.3 `melodyGenerator.ts` — the shared seed-combination helper

One new exported pure function, `buildSeededComposition` (confirmed name, per §7 item 1). Takes `compositionSeed` plus exactly the five formula inputs the intent doc names, in this order, and returns a ready-to-use `rand` function — **not** a number passed through `opts.seed`. This deliberately departs from the intent doc's literal "`opts.seed` parameter" wording: `melodyGenerator.ts`'s own `opts.seed` path just does `alea(String(opts.seed))` internally (a single number, stringified), which loses the ability to fold in five additional values without first hashing them into one number by hand. `opts.rand` already exists for exactly this case ("a deterministic noise-map-based PRNG" per its own doc comment) and matches this codebase's established convention of building one colon-joined descriptor string for `alea()` (e.g. `` alea(`${localeId}:${spawnCount}:copy`) `` in `spawnSystem.ts`) rather than hand-rolling a numeric hash. `generateMelodyForRobot`'s public options contract is unchanged either way.

```typescript
export function buildSeededComposition(
  compositionSeed: number,
  attrs: {
    rhythmicDensity: number;
    rhythmicMotifLength: ToggleValue;
    noteVariance: ToggleValue;
    pitchRepeat: number;
    octaveRange: [number, number];
  },
): () => number {
  const key = [
    compositionSeed,
    attrs.rhythmicDensity,
    `${attrs.rhythmicMotifLength.active}-${attrs.rhythmicMotifLength.value}`,
    `${attrs.noteVariance.active}-${attrs.noteVariance.value}`,
    attrs.pitchRepeat,
    `${attrs.octaveRange[0]}-${attrs.octaveRange[1]}`,
  ].join(':');
  return alea(key);
}
```

### 4.4 `regenerateMelody.ts` — the edit-time call site

```typescript
const rand = buildSeededComposition(robot.compositionSeed, {
  rhythmicDensity: robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY,
  rhythmicMotifLength: robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
  noteVariance: robot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
  pitchRepeat: robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
  octaveRange: robot.octaveRange,
});

const newMelody = generateMelodyForRobot({
  octaveMin: robot.octaveRange[0],
  octaveMax: robot.octaveRange[1],
  rhythmicDensity: robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY,
  rhythmicMotifLength: robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
  noteVariance: robot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
  pitchRepeat: robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
  rand,
});
```

Same defaulting pattern already in the file today (`??` against the four `DEFAULT_*` constants) — unchanged, just now also feeding the seed-key builder.

### 4.5 `spawnSystem.ts` — the initial-melody call site

Replaces the `melodyRand`/`melodyCallIndex` block (current lines ~606–621) with the same helper, called with the robot's *initial* values — which is exactly what makes spawn-time and a hypothetical zero-net-change "edit" produce the identical melody:

```typescript
const compositionRand = buildSeededComposition(compositionSeed, {
  rhythmicDensity: spawnRhythmicDensity,
  rhythmicMotifLength: spawnRhythmicMotifLength,
  noteVariance: spawnNoteVariance,
  pitchRepeat: spawnPitchRepeat,
  octaveRange,
});

const spawnMelody = generateMelodyForRobot({
  octaveMin: octaveRange[0],
  octaveMax: octaveRange[1],
  rhythmicDensity: spawnRhythmicDensity,
  rhythmicMotifLength: spawnRhythmicMotifLength,
  noteVariance: spawnNoteVariance,
  pitchRepeat: spawnPitchRepeat,
  rand: compositionRand,
});
```

The `compositionSeed` field is then included in the `Robot` object literal alongside `id`/`name`/`identityColor` (`spawnSystem.ts`'s existing object-literal block, ~line 626 onward).

### 4.6 `robotOptionsActions.ts` — closing the octave gap

```typescript
export function applyOctaveMin(robot: Robot, localeId: string, value: number): void {
  const [, octMax] = robot.octaveRange;
  const next: [number, number] = [Math.min(value, octMax), octMax];
  useLocaleStore.getState().updateRobot(localeId, robot.id, { octaveRange: next });
  regenerateMelody({ ...robot, octaveRange: next }, localeId);
}

export function applyOctaveMax(robot: Robot, localeId: string, value: number): void {
  const [octMin] = robot.octaveRange;
  const next: [number, number] = [octMin, Math.max(value, octMin)];
  useLocaleStore.getState().updateRobot(localeId, robot.id, { octaveRange: next });
  regenerateMelody({ ...robot, octaveRange: next }, localeId);
}
```

Exact shape of `applyDensity`/`applyPitchRepeat` immediately above it in the same file — spread the new value onto a shallow robot copy, pass to `regenerateMelody`.

### 4.7 Removing Reset Melody

Delete, don't stub: `RESET_MELODY_SCHEMA` (`robotOptionsConfig.ts`), `handleResetMelody`/the `onResetMelody` prop passed from `RobotOptionsTab.tsx`, and the `onResetMelody` prop plus its conditional `<Button>` in all three exports in `PingControlsDrawer.tsx`. No deprecation shim, no dead prop left `?`-optional-and-unused — `CLAUDE.md`'s "don't design for hypothetical future requirements" applies directly here, and the intent doc is explicit that no replacement was requested.

### 4.8 Naming and conventions

`compositionSeed`, `generateCompositionSeed`, `buildSeededComposition` — dot-namespaced dataId `'robot.compositionSeed'`, matching every other per-robot seeded field's `'robot.<field>'` convention in this file. Section-header comment blocks (`// ====`) and `IMPORTS/TYPES/FUNCTIONS`/`EXPORTS` layout, matching `spawnSystem.ts`'s and `melodyGenerator.ts`'s own existing structure.

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location

Vitest + Testing Library, co-located `*.test.ts(x)`. Pure logic first (TDD): the new `melodyGenerator.ts` helper, then `spawnSystem.ts`'s generation/baseline behavior, then `regenerateMelody.ts`, then the UI removal.

### 5.2 New/changed tests

- **`melodyGenerator.test.ts`** — the new seed-combination helper: same `compositionSeed` + same five attribute values ⇒ identical `rand` output sequence (deterministic); changing *any one* of the six inputs (compositionSeed, or any of the five attributes, including each element of `octaveRange` independently) changes the resulting sequence; output is a valid `() => number` usable directly as `generateMelodyForRobot`'s `opts.rand`.
- **`spawnSystem.test.ts`** —
  - `generateCompositionSeed`/the inline no-noiseMap fallback is deterministic given the same `(noiseMap, spawnCount)` / `(localeId, spawnCount)`.
  - Two robots spawned at different `spawnCount` in the same locale get different `compositionSeed` values (own dataId, own offset — not accidentally constant).
  - **Regression guard replacing the retired `melody.rand` coverage:** spawning the same locale (same seed/coordinates) twice produces byte-identical initial melodies for every robot.
  - **Copy-path guard:** on the `shouldCopy` branch, the copy inherits `audioAttributes`/`octaveRange`/rhythmic fields from its source (existing behavior, unchanged) but gets its **own**, independently-drawn `compositionSeed` — never the source's — mirroring the existing `name` treatment in the same branch.
  - **Unification guard (the core acceptance criterion):** spawn a robot, capture its melody; call `regenerateMelody` on that exact same robot object with no attribute changes; assert the resulting melody is byte-identical to the spawn melody. This is the test that would fail today (before this phase) and is the direct proof the "no first-edit ratchet" requirement holds.
- **`regenerateMelody.test.ts`** —
  - `makeRobot()`'s fixture gains a `compositionSeed` default (e.g. `0.42` or similar fixed value) — every existing test in this file implicitly depends on this being present once the production code reads it.
  - Same `robot` object (including `compositionSeed`) ⇒ same melody across repeated calls (replaces any latent reliance on `Math.random()`'s non-determinism).
  - Changing one attribute (e.g. `rhythmicDensity`) and then changing it back to its original value reproduces the original melody exactly — the literal "nudge a slider back" acceptance criterion from the intent doc.
  - Two robots with identical attributes but different `compositionSeed` produce different melodies — the "complementary, not unison" guarantee, tested directly at this layer rather than only inferred from the company bulk-edit call sites.
- **`robotOptionsActions.test.ts`** — `applyOctaveMin`/`applyOctaveMax` each now call `regenerateMelody` exactly once with the robot's updated `octaveRange`, mirroring the existing assertions already written for `applyDensity`/`applyPitchRepeat`/`applyMotifLength`/`applyNoteVariance` in the same file.
- **`robotOptionsConfig.test.ts`** — `RESET_MELODY_SCHEMA` import/reference removed; confirm no other schema in the file accidentally depended on it being exported.
- **`RobotOptionsTab.test.tsx`** — remove the `onResetMelody`-wiring test (~line 349) and the fake `PingControlsDrawer` test double's `onResetMelody` prop/button (~lines 47, 61); confirm no remaining reference.
- **`PingControlsDrawer.test.tsx`** — remove every Reset-Melody-specific test across the file's three render-target sections (confirmed via `grep -n "ResetMelody"` to have occurrences at multiple line ranges, not a single block) — both the "renders when provided" and "omits when not provided (company mode)" pairs, for each of the three component exports.
- **Session Storage regression guard (belt-and-suspenders, `sessionDiff.test.ts` or `spawnSystem.test.ts`):** a save → mutate `rhythmicDensity` → load round trip reproduces the exact melody, not just the exact attribute values — the end-to-end proof that no `SessionPayload` change was actually needed.

### 5.3 Success criteria

1. Same attribute values (`compositionSeed` + the five formula inputs) always produce the same melody — deterministic, unit-tested at the `melodyGenerator.ts` helper, `spawnSystem.ts`, and `regenerateMelody.ts` layers.
2. A robot's very first post-spawn edit, reverted to its original value, reproduces the exact spawn-time melody — no ratchet. (deterministic, unit-tested — §5.2's "unification guard")
3. `applyOctaveMin`/`applyOctaveMax` trigger melody regeneration. (deterministic, unit-tested)
4. Two robots (or one robot copied via the `shouldCopy` spawn path) with identical formula inputs except `compositionSeed` produce different melodies. (deterministic, unit-tested)
5. A Session Storage save/load round trip reproduces a robot's exact melody, with zero changes to `SessionPayload`'s shape. (deterministic, unit-tested)
6. The Reset Melody control is gone from the UI, its schema, and its wiring — zero remaining references anywhere in `src/`. (verified via a repo-wide search, not just the removed component's own tests)
7. `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
8. Manual check: in `npm run dev`, confirm a robot's melody survives a slider nudge-and-revert unchanged, and that the Reset Melody button no longer renders anywhere in Robot Options or the company bulk-edit panel.

### 5.4 Verification order

`npm run build:types` → `npm run lint` → `npm test` → `npm run build` → manual check in `npm run dev`.

---

## 6. Documentation & Git/Workflow Context

- **Docs to update:** `docs/MELODY_SYSTEM.md` ("Seeding & lifecycle" section's "existing unseeded `Math.random` manual-edit path" line, and the Click Track funnel's call-site list, which currently names "Reset Melody" as one of its four call sites); `docs/PROCEDURAL_GENERATION.md` (the `melodyGenerator.ts` architecture-table row and the `offset` example, both of which currently cite the retired `'melody.rand'`/`melodyCallIndex` mechanic); `docs/todo/roadmap.md` (Phase 31 status, following Phase 19/20's citation style — link this spec plus the eventual task file).
- **Branch:** new — suggest `feature/deterministic-robot-melody` (not yet created).
- **Commits:** one per task, tests with their code; attribution per this session's rules. **PR:** references this spec; reviewed by another contributor per `CLAUDE.md`.
- **Sequencing:** independent of any other open roadmap item except that [Phase 32](../todo/roadmap.md#32-robot-melody-history--configuration-scrubber) (melody history) depends on this phase shipping first.

---

## 7. Open Questions & Risks — resolved by Crawford, 2026-09-28

Items 1-2 were open when this spec was drafted; both are now confirmed. Items 3-5 are risk/consequence notes, acknowledged as-is (no spec change needed):

1. **Resolved — helper name is `buildSeededComposition`, final.** §4 and §2 updated throughout; no longer a Plan-level decision.
2. **Resolved — `opts.rand` over `opts.seed` confirmed, conditioned on zero incidental randomization.** Crawford's condition: "as long as no actual randomization is occurring." Satisfied by construction — `buildSeededComposition` (§4.3) is a pure function of `compositionSeed` and the five attribute values; its only call into `alea(key)` is deterministic given that `key` string, with no `Math.random()` anywhere in the path. This is the same determinism guarantee `opts.seed`'s own internal `alea(String(opts.seed))` would have provided — the substitution changes which typed option carries the value, not whether the result is seeded.
3. **Risk: this phase touches `spawnSystem.ts`'s `spawnRobot`, a large, sensitive, already-well-tested function** (per the file's own comments, `generateRobotAudioBaseline`/`generateRobotRosterBaseline` were deliberately built as parallel, non-refactoring implementations specifically to avoid touching this function for Session Storage). This phase can't take that same "don't touch it" path, because the whole point is unifying spawn-time melody generation with the edit-time path. Mitigation: the change is additive and narrowly scoped to the melody-generation block (~15 lines) and the object-literal's new field — every other line of `spawnRobot` is untouched, and `spawnSystem.test.ts`'s full existing suite must pass unmodified (mirroring Session Storage Task 2's own acceptance criteria for the same file).
4. **Risk: existing saved Session Storage entries and any hand-authored fixtures/mocks that construct a `Robot` object literal without a `compositionSeed` field** (confirmed at least one such case: `regenerateMelody.test.ts`'s `makeRobot()` helper, which casts `as Robot` to sidestep missing fields at compile time) **will read `robot.compositionSeed` as `undefined` at runtime** until updated. Mitigation: Task breakdown must include a repo-wide search for object-literal `Robot` construction in tests/fixtures (not just the one file already found) and add a `compositionSeed` value to each; this is a mechanical but non-optional cleanup pass, not automatically covered by the type system alone (`as Robot` casts bypass it).
5. **Accepted, not a risk:** existing locale seeds will sound different post-ship (§1) — confirmed acceptable during interview, restated here so Plan/Tasks doesn't second-guess it as a bug to avoid.
