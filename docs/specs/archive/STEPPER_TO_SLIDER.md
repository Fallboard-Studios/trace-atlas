# Phase Spec: Stepper → Slider Conversion

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: this session's conversation (`/context-engineering` pass over every `Stepper`/
`StepperWithToggle` usage, confirmed decisions in the chat that followed — no separate
`docs/intent/*.md` file). Prior art: `docs/COMPONENT_LIBRARY.md` (`Stepper`/`StepperWithToggle`/
`SliderLinear` primitives), `docs/MELODY_SYSTEM.md` (Motif Length/Note Variance toggle semantics),
`robotOptionsConfig.ts`'s own `DENSITY_SCHEMA` comment — an earlier, identical Stepper→SliderLinear
conversion done for the same reason this phase exists.

---

## 1. Overview & Claude Explanation

Every real call site of the `Stepper`/`StepperWithToggle` `ControlSchema` primitives becomes a
`SliderLinear` with `step: 1`. **The `Stepper` and `StepperWithToggle` components themselves are
NOT deleted** — they stay in `src/components/ui/controls/` with their existing tests, simply
unused by any real app schema after this phase. Confirmed via repo-wide grep: no other consumers
exist.

**5 call sites, 3 of which are a pure UI substitution and 2 of which carry real logic changes:**

| # | Schema | Today | File | Change |
|---|---|---|---|---|
| 1 | `OCTAVE_RANGE_MIN_SCHEMA` | `Stepper` | `robotOptionsConfig.ts` | Pure UI swap |
| 2 | `OCTAVE_RANGE_MAX_SCHEMA` | `Stepper` | `robotOptionsConfig.ts` | Pure UI swap |
| 3 | `MOTIF_LENGTH_SCHEMA` | `StepperWithToggle` | `robotOptionsConfig.ts` | Toggle removed, min→0 |
| 4 | `NOTE_VARIANCE_SCHEMA` | `StepperWithToggle` | `robotOptionsConfig.ts` | Toggle removed, min→0 |
| 5 | compressor `ratio` (inline) | `Stepper` | `audioRigConfig.ts` | Pure UI swap |

**#1, #2, #5 (Octave Range, Compressor Ratio) — pure substitution.** Each already hands a plain
`number` through `onChange`; nothing downstream cares which component produced it. Octave Range's
min≤max relational clamp already lives outside the component, in `applyOctaveMin`/`applyOctaveMax`
(`robotOptionsActions.ts`) — **preserved exactly as-is, untouched by this phase.**

**#3, #4 (Motif Length, Note Variance) — the toggle is removed entirely, not just hidden.** Today
each is a `StepperWithToggle`: a `Toggle` (sets `active` independently) composed with a `Stepper`
(disabled whenever `!active`, edits `value`). After this phase there is no toggle — only a
`SliderLinear` whose range extends down to `0`. Confirmed decisions from this session:

- **`value === 0` reproduces the exact old `active: false` behavior.** `melodyGenerator.ts`'s
  `generateMelodyForRobot` (motif-tiling branch), its Note Variance selection branch, and
  `reRollMelodyPitches` all branch on `.active` today — **none of that branching logic changes.**
  They keep reading `.active` exactly as they do now.
- **The `ToggleValue`/`StepperWithToggleValue` shape (`{ active: boolean; value: number }`) is
  kept**, not collapsed to a plain number — explicit user call ("keep the ToggleValue type ... just
  in case"). What changes is that `active` becomes a **derived, enforced consequence of
  `value > 0`** at every write site, never independently settable.
- **The slider must never be disabled.** With no toggle, dragging the slider back above `0` is the
  *only* way to turn the field back on — disabling it the way the old Stepper was disabled while
  inactive would strand the control permanently off.

This makes the real work of #3/#4 an invariant-enforcement problem: every place that currently sets
`.active` independently of `.value` must instead derive it. Four such places exist (see §2/§3).

**Compressor Ratio (#5) detail:** `audioRigConfig.ts`'s inline schema changes `type: 'stepper'` →
`type: 'sliderLinear'` (adding `step: 1`). `AudioRigDrawer.tsx`'s `renderParamControl` already has a
`'sliderLinear'` case — no dispatcher change is required for this schema to render correctly. Its
existing `'stepper'` case becomes dead code once this is the only `AUDIO_RIG_CONFIG` entry that ever
used it — **confirmed: leave the case and its `Stepper` import in place** as defensive dead code
rather than removing them.

---

## 2. Target File Structure

```text
src/
├── constants/
│   └── index.ts                        # MODIFIED — RHYTHMIC_MOTIF_LENGTH_MIN 1→0,
│                                        #   NOTE_VARIANCE_MIN 1→0. Rewrite the doc comment (current
│                                        #   lines 61-69) — it explicitly asserts "value itself has
│                                        #   no reachable off/magic-zero meaning", the exact opposite
│                                        #   of the new design.
├── types/
│   └── Robot.ts                        # MODIFIED — doc comments on rhythmicMotifLength/noteVariance
│                                        #   fields (no shape change): "value is 1-8" → "0-8";
│                                        #   noteVariance's "Default: { active: false, value: 1 }"
│                                        #   → "{ active: false, value: 0 }"
├── engine/
│   ├── melodyGenerator.ts              # MODIFIED (constants only, not branch logic) —
│   │                                    #   DEFAULT_NOTE_VARIANCE: { active: false, value: 1 } →
│   │                                    #   { active: false, value: 0 } (today's default violates
│   │                                    #   the new value>0⟺active invariant — see §3).
│   │                                    #   DEFAULT_RHYTHMIC_MOTIF_LENGTH is already consistent
│   │                                    #   ({ active: true, value: 8 }) — unchanged.
│   └── melodyGenerator.test.ts         # MODIFIED — update the DEFAULT_NOTE_VARIANCE assertion
├── stores/
│   ├── localeStore.ts                  # MODIFIED — clampToggleValue derives `active` from the
│   │                                    #   post-clamp `value` (`value > 0`) instead of trusting the
│   │                                    #   caller's `active` field. This is the single central
│   │                                    #   enforcement point: every store-mediated write
│   │                                    #   (robotOptionsActions.ts, RobotOptionsTab.tsx,
│   │                                    #   CompanyOptionsSection.tsx's broadcast) funnels through
│   │                                    #   updateRobot.
│   └── localeStore.test.ts             # MODIFIED — existing cases assert the old min-1 clamp and
│                                        #   caller-trusted `active` (e.g. `{active:false,value:-3}`
│                                        #   → `{active:false,value:1}` today); update expected
│                                        #   outputs for min-0 + derived-active
├── systems/
│   ├── spawnSystem.ts                  # MODIFIED — collapses each field's two independent seed
│                                        #   draws (`...active`, `...value`) into one tuned single
│                                        #   draw over an extended range (e.g. `0-9`, floored),
│                                        #   calibrated so landing on `0` still happens ~15% of the
│                                        #   time — preserves today's RHYTHMIC_MOTIF_LENGTH_ACTIVE_
│                                        #   THRESHOLD/NOTE_VARIANCE_ACTIVE_THRESHOLD (0.15) off-rate
│                                        #   statistically, exact range math worked out at
│                                        #   implementation time
│   ├── spawnSystem.test.ts             # MODIFIED — update seeded-value coverage for the new scheme;
│   ├── robotOptionsActions.ts          # MODIFIED — applyMotifLength/applyNoteVariance change
│                                        #   signature from `(robot, localeId, value:
│                                        #   StepperWithToggleValue)` to `(robot, localeId, value:
│                                        #   number)`, constructing `{ active: value > 0, value }`
│                                        #   internally before writing/regenerating — mirrors
│                                        #   applyDensity/applyPitchRepeat's existing plain-number
│                                        #   pattern
│   ├── robotOptionsActions.test.ts     # MODIFIED — update for the new number-in signature
│   ├── companyOptions.ts               # No direct change expected — diffCompoundField itself stays
│                                        #   as-is (§3); the fix lives entirely in
│                                        #   CompanyOptionsSection.tsx (below), which stops calling it
│                                        #   for these two fields
│   └── companyOptions.test.ts          # Unchanged, unless review surfaces a gap
├── data/
│   ├── robotOptionsConfig.ts           # MODIFIED — OCTAVE_RANGE_MIN/MAX_SCHEMA: type 'stepper' →
│                                        #   'sliderLinear' (+ step: 1). MOTIF_LENGTH_SCHEMA/
│                                        #   NOTE_VARIANCE_SCHEMA: type 'stepperToggle' →
│                                        #   'sliderLinear' (+ step: 1), min: 0. StepperSchema/
│                                        #   StepperWithToggleSchema imports dropped if now unused.
│   ├── robotOptionsConfig.test.ts      # MODIFIED — schema-shape assertions for all 4 changed schemas
│   ├── audioRigConfig.ts               # MODIFIED — compressor.ratio schema: type 'stepper' →
│                                        #   'sliderLinear' (+ step: 1)
│   └── audioRigConfig.test.ts          # MODIFIED — update the stepper-schema assertion to
│                                        #   sliderLinear shape. renderParamControl's own 'stepper'
│                                        #   case and Stepper import are left in place (confirmed) —
│                                        #   no dispatcher change, so no test change needed there
├── components/
│   ├── robot/
│   │   ├── PingControlsDrawer.tsx      # MODIFIED — Octave Range Min/Max: <Stepper> → <SliderLinear>
│                                        #   (mechanical). Motif Length/Note Variance: <StepperWithToggle>
│                                        #   → <SliderLinear>, never disabled by an active flag (still
│                                        #   respects generationDisabled/clickTrackActive, same as
│                                        #   every other control in this drawer). PingControlsValue's
│                                        #   rhythmicMotifLength/noteVariance fields flatten from
│                                        #   StepperWithToggleValue to plain number (matching
│                                        #   pitchRepeat's existing shape in this same drawer);
│                                        #   onMotifLengthChange/onNoteVarianceChange props become
│                                        #   `(value: number) => void`, {active,value} reconstruction
│                                        #   pushed down into robotOptionsActions.ts only
│   ├── robot/PingControlsDrawer.test.tsx        # MODIFIED
│   ├── panels/screen/console/RobotOptionsTab.tsx        # MODIFIED — pingControlsValue's
│                                        #   rhythmicMotifLength/noteVariance become
│                                        #   `robot.rhythmicMotifLength?.value ?? DEFAULT_...value`
│                                        #   (plain number, mirroring pitchRepeat's existing mapping);
│                                        #   onMotifLengthChange/onNoteVarianceChange wired straight
│                                        #   through to applyMotifLength/applyNoteVariance's new
│                                        #   number-in signature, no local reconstruction
│   ├── panels/screen/console/RobotOptionsTab.test.tsx   # MODIFIED
│   ├── panels/screen/console/AudioRigDrawer.tsx         # Confirmed NOT touched — renderParamControl's
│                                        #   'stepper' case and its Stepper import stay in place as
│                                        #   defensive dead code (see §1)
│   ├── company/CompanyOptionsSection.tsx        # MODIFIED — DISABLED_PING_CONTROLS' noteVariance
│                                        #   default → { active: false, value: 0 }; motif/variance
│                                        #   broadcast handlers move off diffCompoundField onto the
│                                        #   plain-number pattern onPitchRepeatChange already uses
│                                        #   (members.forEach + patchSnapshot on the raw number, each
│                                        #   member's {active,value} reconstructed on write)
│   └── company/CompanyOptionsSection.test.tsx   # MODIFIED
docs/
├── COMPONENT_LIBRARY.md                # MODIFIED — note that Octave Range Min/Max, Motif Length,
│                                        #   and Note Variance moved off Stepper/StepperWithToggle
│                                        #   onto SliderLinear, mirroring the existing DENSITY_SCHEMA
│                                        #   precedent comment
├── MELODY_SYSTEM.md                    # MODIFIED — `ToggleValue.value` comments ("1-8") → "0-8"
│                                        #   (lines ~51, 55); DEFAULT_NOTE_VARIANCE reference
│                                        #   (~line 178) → { active: false, value: 0 }; NOTE_VARIANCE_MIN
│                                        #   reference (~line 175, which currently narrates the *prior*
│                                        #   0→1 migration this phase now reverses) updated to describe
│                                        #   the new 1→0 change instead
└── reference/ROBOT_DATA_GRID.md        # MODIFIED — Motif Length/Note Variance/Octave Range Min/Max
                                         #   rows' Component column: "Stepper Component"/"Stepper with
                                         #   active toggle Component" → "Slider Component"; Motif
                                         #   Length/Note Variance min bound 1→0. (Density's row is
                                         #   already stale — still says "Stepper Component" though it's
                                         #   been SliderLinear since an earlier phase; fix opportunistically
                                         #   while this table is open, not required by this phase's scope.)
```

**Confirmed NOT touched:** `src/components/ui/controls/Stepper.tsx`, `StepperWithToggle.tsx`, and
their own test files (component stays, tests stay green, simply unused elsewhere).
`src/engine/melodyGenerator.ts`'s branch logic (`generateMelodyForRobot`'s motif-tiling and
Note Variance selection, `reRollMelodyPitches`) — all keep reading `.active` unchanged; only the
`DEFAULT_NOTE_VARIANCE` constant's *value* changes. `docs/PROCEDURAL_GENERATION.md` — confirmed
generic (documents the seeding *mechanism*, not a per-field dataId catalog); no per-field edit needed
regardless of the spawn-seeding scheme's exact range math (§7.1). `src/engine/AudioEngine.ts` —
no scheduling/playback change.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build
  assets.
* **`Stepper`/`StepperWithToggle` are not deleted.** Do not remove the components, their CSS, or
  their test files as part of this phase.
* **`melodyGenerator.ts`'s `.active`-branching logic does not change.** The entire point of keeping
  `ToggleValue` is that `active` continues to be the single thing generation logic reads; only its
  *derivation* moves. Do not refactor `generateMelodyForRobot`/`reRollMelodyPitches` to read `.value`
  directly as part of this phase.
* **The `value > 0 ⟺ active` invariant must hold everywhere a `{active, value}` payload for these two
  fields is constructed**, not just at the UI. Confirmed write sites needing enforcement:
  1. `StepperWithToggle`'s own `Toggle` (removed at these 2 call sites by construction — no fix
     needed, the composing usage goes away)
  2. `localeStore.ts`'s `clampToggleValue` — currently `active: Boolean(active)` (trusts caller);
     becomes derived from the clamped `value`
  3. `spawnSystem.ts` — currently draws `active` and `value` from two *independent* noise-map
     channels (`'robot.rhythmicMotifLength.active'` / `'.value'`, threshold-compared separately);
     collapse to one tuned derivation (§7.1)
  4. `robotOptionsActions.ts`'s `applyMotifLength`/`applyNoteVariance` — currently forward whatever
     `StepperWithToggleValue` the caller passes verbatim; becomes number-in, constructing the object
     itself
* **`diffCompoundField` (`companyOptions.ts`) assumes exactly one key changes per edit.** A slider
  drag that crosses `0` (e.g. `0 → 3`) now changes **both** `active` (`false → true`) and `value`
  (`0 → 3`) in the same commit — `diffCompoundField` returns only the *first* changed key by
  `Object.keys` iteration order, silently dropping the other. This did not matter for the old
  Toggle+Stepper split (each control fired its own isolated `onChange`, one key at a time) but does
  now. **Resolved: `diffCompoundField` itself is untouched** (it's shared by ADSR/LFO/layer
  broadcasts too, unrelated to this phase) — `CompanyOptionsSection.tsx`'s Motif Length/Note
  Variance handlers stop calling it and move onto the plain-number broadcast pattern
  `onPitchRepeatChange` already uses instead.
* **Existing defaults that violate the new invariant must be corrected, not just the invariant-
  enforcement code.** `DEFAULT_NOTE_VARIANCE = { active: false, value: 1 }` (melodyGenerator.ts) and
  its mirrors (`RobotOptionsTab.tsx`'s `?? { active: false, value: 1 }` fallback,
  `CompanyOptionsSection.tsx`'s `DISABLED_PING_CONTROLS`) all pair `active: false` with a *nonzero*
  `value` today — each becomes `{ active: false, value: 0 }`. `DEFAULT_RHYTHMIC_MOTIF_LENGTH`
  (`{ active: true, value: 8 }`) already satisfies the invariant; leave as-is.
* **State stays JSON-serializable.** No shape change introduces a function, closure, or non-plain
  object — `{active, value}` stays a plain object exactly as it is today.

---

## 4. Code Style & Architecture Conventions

**`robotOptionsConfig.ts` — schema type changes (mechanical, ×4):**

```typescript
// BEFORE
export const OCTAVE_RANGE_MIN_SCHEMA: StepperSchema = {
  id: 'robotOptions.octaveRangeMin',
  type: 'stepper',
  loreLabel: 'PING FREQUENCY RANGES (MIN)',
  humanLabel: 'Octave Range Min',
  min: OCTAVE_RANGE_MIN,
  max: OCTAVE_RANGE_MAX,
};
```

```typescript
// AFTER
export const OCTAVE_RANGE_MIN_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.octaveRangeMin',
  type: 'sliderLinear',
  loreLabel: 'PING FREQUENCY RANGES (MIN)',
  humanLabel: 'Octave Range Min',
  min: OCTAVE_RANGE_MIN,
  max: OCTAVE_RANGE_MAX,
  step: 1,
};
```

`MOTIF_LENGTH_SCHEMA`/`NOTE_VARIANCE_SCHEMA` follow the same `type`/`step` change, plus `min: 0`
(replacing `RHYTHMIC_MOTIF_LENGTH_MIN`/`NOTE_VARIANCE_MIN`, both now `0` per §2's constants change —
no literal `0` needed at the call site, the constant itself moves).

**`localeStore.ts` — `clampToggleValue` derives `active` instead of trusting it:**

```typescript
// BEFORE
function clampToggleValue(v: unknown, min: number, max: number): { active: boolean; value: number } | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const { active, value } = v as { active?: unknown; value?: unknown };
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return { active: Boolean(active), value: Math.max(min, Math.min(max, Math.trunc(value))) };
}
```

```typescript
// AFTER
function clampToggleValue(v: unknown, min: number, max: number): { active: boolean; value: number } | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const { value } = v as { value?: unknown };
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const clamped = Math.max(min, Math.min(max, Math.trunc(value)));
  return { active: clamped > 0, value: clamped };
}
```

**`robotOptionsActions.ts` — number-in, object constructed internally:**

```typescript
// BEFORE
export function applyMotifLength(robot: Robot, localeId: string, value: StepperWithToggleValue): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicMotifLength: value });
  regenerateMelody({ ...robot, rhythmicMotifLength: value }, localeId);
}
```

```typescript
// AFTER
export function applyMotifLength(robot: Robot, localeId: string, value: number): void {
  const next = { active: value > 0, value };
  useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicMotifLength: next });
  regenerateMelody({ ...robot, rhythmicMotifLength: next }, localeId);
}
```

`applyNoteVariance` follows identically.

* **Naming Conventions:** No new files, no new schema-variant names — `'sliderLinear'` already
  exists in `CONTROL_SCHEMA_TYPES`. `SliderLinearSchema` import added to `robotOptionsConfig.ts`/
  `audioRigConfig.ts` where not already present.
* **Formatting:** Match each touched file's existing section-comment banner style.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate (see §2 for the exact files touched).
* **`robotOptionsConfig.test.ts`:** all 4 changed schemas assert `type: 'sliderLinear'`, `step: 1`,
  and the new `min` bound (`0` for Motif Length/Note Variance, unchanged for Octave Range).
* **`audioRigConfig.test.ts`:** compressor `ratio` schema assertion updated to the SliderLinear
  shape; confirm (or update) whatever assertion currently documents the drawer's "closed set of
  ControlSchema variants" now that `'stepper'` may no longer appear in `AUDIO_RIG_CONFIG` at all.
* **`localeStore.test.ts`:** rewrite the existing `rhythmicMotifLength`/`noteVariance` clamp cases
  for min `0` (not `1`) and derived `active`:
  - `{ value: 20 }` → clamps `value` to max, `active: true`
  - `{ value: -3 }` → clamps `value` to `0`, `active: false` (today expects `value: 1`)
  - `{ active: false, value: 5 }` (caller lies about `active`) → `{ active: true, value: 5 }` — new
    case, guards that the store no longer trusts a caller-supplied `active`
* **`melodyGenerator.test.ts`:** `DEFAULT_NOTE_VARIANCE` assertion updated to
  `{ active: false, value: 0 }`.
* **`spawnSystem.test.ts`:** coverage for the tuned single-draw scheme — confirm the field is still
  seeded across its full `0-8` range, and that the *statistical* rate of landing at `value: 0` (off)
  stays ~15%, matching today's `RHYTHMIC_MOTIF_LENGTH_ACTIVE_THRESHOLD`/`NOTE_VARIANCE_ACTIVE_THRESHOLD`
  (`0.15`).
* **`robotOptionsActions.test.ts`:** `applyMotifLength`/`applyNoteVariance` tests updated for the
  number-in signature; assert the constructed `{ active: value > 0, value }` object is what's written
  and what's passed to `regenerateMelody`.
* **`CompanyOptionsSection.test.ts`:** new coverage for the plain-number broadcast path — a broadcast
  that crosses the `0` boundary (e.g. `0 → 3`) must propagate to every member with both `active: true`
  and `value: 3` reconstructed correctly, not just one field.
* **`PingControlsDrawer.test.tsx` / `RobotOptionsTab.test.tsx` / `CompanyOptionsSection.test.tsx`:**
  updated for the new SliderLinear controls — renders, fires `onChange` with a value at `0` and above,
  and is never disabled purely because the underlying value is `0` (still respects
  `generationDisabled`/`clickTrackActive`/company "None selected", same as every other control in
  these drawers).
* **Regression guard:** a fixed-seed `generateMelodyForRobot` run with `rhythmicMotifLength: { active:
  false, value: 0 }` / `{ active: true, value: N }` (any `N`) must produce byte-identical output to
  the same seed/options today — this phase changes construction paths, never generation output.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors (catches the now-unused `Stepper`/`StepperWithToggle`
     imports in `robotOptionsConfig.ts`/`PingControlsDrawer.tsx`; `AudioRigDrawer.tsx`'s `Stepper`
     import stays, since its dead `'stepper'` case stays).
  3. `npm test` — all new and existing tests pass, including the regression guard above.
  4. `npm run build` — production bundle builds cleanly.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges
  manually.
* **Branch Convention:** `feature/stepper-to-slider` — the active branch (renamed from
  `feature/removing-stepper` during this session).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences. Suggested grouping: (1) constants + doc-comment updates (`RHYTHMIC_MOTIF_LENGTH_MIN`/
  `NOTE_VARIANCE_MIN` → 0, `Robot.ts` comments), (2) `localeStore.ts`'s derived-`active` clamp + its
  tests, (3) `robotOptionsActions.ts`'s number-in signature + `DEFAULT_NOTE_VARIANCE` fix + their
  tests, (4) `spawnSystem.ts`'s single-draw seeding + its test, (5) `CompanyOptionsSection.tsx`'s
  broadcast-path fix + its test, (6) schema changes (`robotOptionsConfig.ts`, `audioRigConfig.ts`) +
  their tests, (7) UI wiring (`PingControlsDrawer.tsx`, `RobotOptionsTab.tsx`) + their tests,
  (8) docs.

---

## 7. Decisions Confirmed With the Human

All open questions from the Specify pass were resolved directly with the human before Plan/Tasks —
recorded here so the reasoning isn't lost:

1. **Spawn-seeding scheme.** A single tuned draw per field, over an extended range (e.g. `0-9`,
   floored to `0-8`), calibrated so `P(value = 0)` stays ≈15% — preserving
   `RHYTHMIC_MOTIF_LENGTH_ACTIVE_THRESHOLD`/`NOTE_VARIANCE_ACTIVE_THRESHOLD`'s existing statistical
   off-rate rather than letting it drift to the ~11% a uniform `0-8` draw would produce. Exact range
   math (and whether floor/round/clamp) worked out at implementation time; `spawnSystem.test.ts`'s
   off-rate assertion is the acceptance check.
2. **Company broadcast fix.** `diffCompoundField` stays untouched (shared by ADSR/LFO/layer
   broadcasts, out of scope here). `CompanyOptionsSection.tsx`'s Motif Length/Note Variance handlers
   move onto the plain-number broadcast pattern `onPitchRepeatChange` already established.
3. **`PingControlsDrawer` prop shape.** Flattens to plain `number`, matching `pitchRepeat`'s existing
   shape in the same drawer. `{active, value}` reconstruction happens only in
   `robotOptionsActions.ts`; nothing above that layer ever touches the `ToggleValue` shape for these
   two fields again.
4. **`AudioRigDrawer.tsx`'s dead `'stepper'` case.** Left in place, along with its `Stepper` import,
   as defensive dead code — not removed by this phase.
5. **Branch.** `feature/stepper-to-slider` — already the active branch (renamed from
   `feature/removing-stepper` during this session).
