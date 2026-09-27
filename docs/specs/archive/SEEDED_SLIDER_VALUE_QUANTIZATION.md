# Phase Spec: Seeded Slider Value Quantization

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/seeded-slider-value-quantization.md](../intent/seeded-slider-value-quantization.md) (confirmed via `/interview-me`, 2026-09-16). Covers [Roadmap Phase 22](../todo/roadmap.md#22-bug-seeded-values-not-quantized-to-their-sliders-step). Source of investigation: [docs/reference/SLIDER_VALUES.md](../reference/SLIDER_VALUES.md). Touches presentation-layer schemas, seeded-generation logic, and one new pure-math helper — no `AudioEngine` scheduling change, no new Zustand field.

> **Scope correction, found during the Specify pass for the intent doc (not new to this spec):** the intent doc's own history records that Volume and Ping Variance Automation were initially misclassified as "implicit default step" fields during the interview, then corrected via a full schema sweep — both actually declare `step: 1` explicitly and are in scope. This spec is written against the corrected intent.

---

## 1. Overview & Claude Explanation

### 1.1 The shared helper

`src/utils/math.ts` (already holds `lerp`, the only other pure numeric helper in this codebase) gains:

```typescript
/**
 * Rounds `value` to the nearest multiple of `step` above `min` — the same
 * grid a SliderLinear with this `min`/`step` restricts dragging to. Used to
 * make a seeded/generated value land exactly where the slider itself could
 * have landed, instead of an arbitrary point in its continuous sampling range.
 */
export function quantizeToStep(value: number, min: number, step: number): number {
  return min + Math.round((value - min) / step) * step;
}
```

No clamping to `max` — every call site already samples within its own declared range (`getSeededVal`/`scaleUnitValue` both take explicit min/max bounds), so a quantized value can only exceed `max` by less than one `step`, the same tolerance a real Radix slider's own step grid already accepts at its upper bound.

### 1.2 Where step values live, and the duplication this reuses on purpose

Every field's `step` is declared once, in its UI schema (`audioRigConfig.ts`/`robotOptionsConfig.ts`/`Lfo.tsx`). The generation-time code that needs to quantize *by* that step lives in different files (`globalAudioSeed.ts`, `spawnSystem.ts`) that don't import UI schema modules today (and shouldn't start, to avoid a presentation-layer import in generation code). Rather than invent a lookup across module boundaries, this spec **mirrors each relevant step value as a literal constant** at its generation call site — the exact same "mirror with a do-not-drift comment" convention `globalAudioSeedRanges.ts`'s own header already uses for its min/max values ("`min`/`max` mirror the doc-comment ranges already in `src/types/globalAudio.ts` — do not change one without the other"). This is a deliberate, pre-existing pattern in this codebase, not a new duplication being introduced.

### 1.3 The six value/range edits (from `SLIDER_VALUES.md`)

| Field | Change | Files |
|---|---|---|
| EQ3 Low/Mid/High | New `step: 0.5` (dB) | `audioRigConfig.ts`, `globalAudioSeedRanges.ts` |
| Delay Time | `step: 0.01 → 0.001`; `max: 1 → 10` (s) | `audioRigConfig.ts`, `globalAudioSeedRanges.ts` |
| Reverb Pre-Delay | `max: 0.5 → 1` (s) | `audioRigConfig.ts`, `globalAudioSeedRanges.ts` |
| Compressor Attack | `max: 1 → 0.2` (s) | `audioRigConfig.ts`, `globalAudioSeedRanges.ts` |
| LFO Rate | `max: 10 → 20` (Hz); `step: 0.25 → 0.05` | `types/lfo.ts` (`LFO_RATE_MAX`), `Lfo.tsx` (`RATE_STEP`) |

`GLOBAL_AUDIO_LOADING_RANGES` (the narrower fresh-seed sub-window) needs **no change** for any of these five — Delay Time's loading window (`0.05–0.5`), Reverb Pre-Delay's (`0–0.1`), and Compressor Attack's (`0.003–0.05`) all already sit comfortably inside their new, wider full ranges.

### 1.4 `SliderCenteredZeroSchema` gains an optional `step`

`src/types/controls.ts`'s `SliderCenteredZeroSchema` has no `step` field today — `SliderCenteredZero.tsx:65` hardcodes `step={1}` for every consumer (EQ3, Detune, Rate Drift, Depth Drift). Adding `step?: number` and reading `schema.step ?? 1` changes **only** EQ3's own drag granularity (the only consumer whose schema will set it) — every other `SliderCenteredZero` instance keeps dragging in the same whole-unit steps it always has, confirmed directly rather than assumed.

### 1.5 Quantization call sites

**Global-chain fields** (`globalAudioSeed.ts`'s `sampleField`, the one function every `GLOBAL_AUDIO_SEED_RANGES` entry already funnels through): add an optional `step?: number` to the `SeedRange` interface (`globalAudioSeedRanges.ts`), set it on the 9 fields that have a real UI step (`eq3.low`/`mid`/`high`: `0.5`; `delay.delayTime`: `0.001`; `delay.feedback`/`delay.wet`/`reverb.preDelay`/`reverb.wet`: `0.01`; `compressor.ratio`: `1`), and quantize in `sampleField` after `scaleUnitValue` when `range.step` is present:

```typescript
function sampleField(noiseMap: NoiseFunction2D, key: GlobalAudioSeedFieldKey): number {
  const range: SeedRange = { ...GLOBAL_AUDIO_LOADING_RANGES[key], scale: GLOBAL_AUDIO_SEED_RANGES[key].scale };
  const t = getSeededVal(noiseMap, `globalAudio.${key}`, 0, 0, 1);
  const raw = scaleUnitValue(t, range);
  const step = GLOBAL_AUDIO_SEED_RANGES[key].step;
  return step ? quantizeToStep(raw, GLOBAL_AUDIO_SEED_RANGES[key].min, step) : raw;
}
```

Quantizing against `GLOBAL_AUDIO_SEED_RANGES[key].min` (the field's real, full-range floor — e.g. EQ3's `-12`), not `range.min` (the narrower *loading* floor) — the step grid a slider enforces is anchored to its own `min`, never to a generation-only sub-window, so a seeded value must land on the same grid a user's own drag would, regardless of which narrower band it was sampled from.

**Global-chain LFO Rate/Depth** (`generateGlobalLfoSettings`): Rate gets the same treatment (`quantizeToStep(rate, LFO_RATE_MIN, LFO_RATE_STEP)`, a new mirrored constant — see §1.2). Depth is explicitly **not** quantized (`Lfo.tsx`'s `depthSchema` has no declared step).

**Robot-level fields** (`spawnSystem.ts`): three call sites, each needs the mirrored step constant:
- `generateRobotLfoSettings`'s `rate` (per target): `quantizeToStep(rate, LFO_RATE_MIN, LFO_RATE_STEP)`.
- `generateAudioAttributes`'s per-layer `gain` (`layerWave.gain`, only when not `quiet`/muted — a muted layer's gain stays the literal `0`, never quantized into something else): `quantizeToStep(gain, 0, GAIN_STEP)` where `GAIN_STEP = 0.01` (mirrors `robotOptionsConfig.ts`'s Signature Array Gain schemas — all 3 layers share the same `step: 0.01`, so one mirrored constant covers all 3).
- `masterVolume`: stored as a `0..1` fraction, but the UI's `step: 1` is in **percent** space (`VOLUME_SCHEMA`, `min: 0, max: 100`) — quantize in percent space, then convert back: `quantizeToStep(raw * 100, 0, 1) / 100`. This is the one call site where the step's own unit doesn't match the stored value's unit; every other quantized field stores and displays in the same unit 1:1.

**Ping Variance Automation** (`globalAudioSeed.ts`'s `generatePingVarianceAutomation`): same percent-space unit mismatch as Volume — stored/returned as a `0..1` fraction, `step: 1` is in percent: `quantizeToStep(raw * 100, 0, 1) / 100`.

### 1.6 Fields confirmed out of scope (no `step` declared)

Density, Sustain, Pitch Repeat, Compressor Threshold/Knee, Limiter Threshold, Signature Array Phase, and LFO Depth (robot and global) — none declare a `step` in their schema; `SliderLinear.tsx`'s default of `1` was never a deliberate choice for any of them. Left untouched per the intent doc's Constraint.

Motif Length, Note Variance, Octave Range Min/Max, and BPM already generate step-aligned integers today (`seedToggleValue`, `OCTAVE_REGISTERS`, `Math.round`) — no code change needed; not touched by this spec.

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── math.ts                       # MODIFIED — quantizeToStep, §1.1
│   └── math.test.ts                  # NEW — see §5 (no test file exists for math.ts today)
├── types/
│   ├── controls.ts                   # MODIFIED — SliderCenteredZeroSchema.step, §1.4
│   └── lfo.ts                        # MODIFIED — LFO_RATE_MAX 10→20, §1.3
├── components/ui/controls/
│   ├── SliderCenteredZero.tsx        # MODIFIED — step={schema.step ?? 1}, §1.4
│   └── Lfo.tsx                       # MODIFIED — RATE_STEP 0.25→0.05, §1.3
├── data/
│   ├── audioRigConfig.ts             # MODIFIED — EQ3 step, Delay Time step+max,
│   │                                    #   Reverb Pre-Delay max, Compressor Attack max, §1.3
│   ├── globalAudioSeedRanges.ts      # MODIFIED — SeedRange.step, 9 field entries, §1.3/§1.5
│   └── globalAudioLoadingRanges.ts   # NOT MODIFIED — every existing loading window already
│                                        #   fits inside its field's new, wider range (§1.3)
├── utils/
│   └── globalAudioSeed.ts            # MODIFIED — sampleField quantizes when range.step is set;
│                                        #   generateGlobalLfoSettings quantizes Rate;
│                                        #   generatePingVarianceAutomation quantizes (%-space), §1.5
│                                        #   plus their own .test.ts files — see §5
└── systems/
    └── spawnSystem.ts                # MODIFIED — quantizes robot LFO Rate, per-layer Gain,
                                         #   masterVolume (%-space), §1.5 — plus spawnSystem.test.ts
```

**Explicitly not touched, and why:**

- `globalAudioLoadingRanges.ts` — no field's existing loading window needs adjusting for any of the 5 range/max edits (§1.3's table).
- `robotOptionsConfig.ts`, `robotSelectionConfig.ts` — UI schemas for the affected robot-level fields (`VOLUME_SCHEMA`, Signature Array Gain) already declare the correct `step`; nothing there changes.
- `lfoEngine.ts` — `LFO_RATE_MAX`'s consumers there (`resolveLfoOutputRange`, clamp bounds) already reference the constant, not a hardcoded `10`; the wider range flows through with no code change.
- Every field listed in §1.6 — no `step`, no quantization, no schema/generation change.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Only fields with an explicitly declared `step` are quantized.** Do not add a `step` to any schema in §1.6, and do not quantize any value whose schema omits one — that would be inventing a requirement, not fixing a bug (intent doc's own Constraint).
* **`SliderCenteredZeroSchema.step` is EQ3-only.** Do not set it on Detune, Rate Drift, or Depth Drift's schemas — all three must keep resolving to the hardcoded-equivalent default of `1` via `schema.step ?? 1`.
* **A muted Signature Array layer's `gain` stays exactly `0`.** Quantization applies only to the `!quiet` branch — never let `quantizeToStep` run on the literal muted value.
* **Quantize against the field's real `min` (its full range floor), never the narrower loading-range floor** — see §1.5's `sampleField` example. Getting this backwards would shift the entire step grid for any field whose loading window doesn't start exactly on a step boundary of the full range.
* **Percent-space fields (Volume, Ping Variance Automation) quantize in percent, not in their stored fraction** — `quantizeToStep(raw * 100, 0, 1) / 100`, never `quantizeToStep(raw, 0, 0.01)` (the latter would quantize to the wrong grid: hundredths of the fraction, not whole percent).
* **No `setTimeout`/`setInterval`/`requestAnimationFrame`** — this is pure generation-time math plus schema/constant edits, no new timing behavior.

---

## 4. Code Style & Architecture Conventions

**`src/utils/math.ts`** (diff — add alongside `lerp`):

```typescript
/**
 * Rounds `value` to the nearest multiple of `step` above `min` — the same
 * grid a SliderLinear with this `min`/`step` restricts dragging to. Used to
 * make a seeded/generated value land exactly where the slider itself could
 * have landed, instead of an arbitrary point in its continuous sampling range.
 */
export function quantizeToStep(value: number, min: number, step: number): number {
  return min + Math.round((value - min) / step) * step;
}
```

**`src/types/controls.ts`** (diff):

```typescript
export interface SliderCenteredZeroSchema extends ControlSchemaBase, SliderVerticalHeightProp {
  type: 'sliderCenteredZero';
  min: number; // negative bound, e.g. -50
  max: number; // positive bound, e.g. +50
  step?: number; // drag granularity — omitted consumers keep SliderCenteredZero.tsx's default of 1
  unit?: string;
  orientation: SliderOrientation;
}
```

**`src/components/ui/controls/SliderCenteredZero.tsx`** (diff, line 65):

```typescript
step={schema.step ?? 1}
```

**`src/types/lfo.ts`** (diff):

```typescript
export const LFO_RATE_MIN = 0;
export const LFO_RATE_MAX = 20;
```

**`src/components/ui/controls/Lfo.tsx`** (diff):

```typescript
const RATE_STEP = 0.05;
```

**`src/data/audioRigConfig.ts`** (diff — EQ3, Delay Time, Reverb Pre-Delay, Compressor Attack):

```typescript
{ id: 'eq3.low', type: 'sliderCenteredZero', loreLabel: 'SUB-BAND', humanLabel: 'Low', min: -12, max: 12, step: 0.5, unit: 'dB', orientation: 'vertical', verticalHeight: 256 },
// ...mid, high identical shape, step: 0.5

{ field: 'delayTime', schema: { id: 'delay.delayTime', type: 'sliderLinear', loreLabel: 'PROPAGATION LAG', humanLabel: 'Time', min: 0, max: 10, step: 0.001, unit: 's', orientation: 'horizontal' } },

{ field: 'preDelay', schema: { id: 'reverb.preDelay', type: 'sliderLinear', loreLabel: 'INITIAL LAG', humanLabel: 'Pre-Delay', min: 0, max: 1, step: 0.01, unit: 's', orientation: 'horizontal' } },

{ field: 'attack', schema: { id: 'compressor.attack', type: 'sliderLog', loreLabel: 'COMPRESSION RATE', humanLabel: 'Attack', min: 0.001, max: 0.2, unit: 's', orientation: 'horizontal' } },
```

**`src/data/globalAudioSeedRanges.ts`** (diff — `SeedRange` gains `step`, 9 fields set it):

```typescript
export interface SeedRange {
  min: number;
  max: number;
  scale: SeedScale;
  /** Mirrors the field's own UI schema step (audioRigConfig.ts) — omitted fields have no declared
   *  step and are never quantized. Kept in lockstep manually, same "do not change one without the
   *  other" convention this file's min/max already follow against globalAudio.ts's doc comments. */
  step?: number;
}

export const GLOBAL_AUDIO_SEED_RANGES: Record<GlobalAudioSeedFieldKey, SeedRange> = {
  'compressor.threshold': { min: -60, max: 0, scale: 'linear' },
  'compressor.ratio': { min: 1, max: 20, scale: 'linear', step: 1 },
  'compressor.attack': { min: 0.001, max: 0.2, scale: 'log' },
  'compressor.release': { min: 0.01, max: 1, scale: 'log' },
  'compressor.knee': { min: 0, max: 40, scale: 'linear' },

  'eq3.low': { min: -12, max: 12, scale: 'linear', step: 0.5 },
  'eq3.mid': { min: -12, max: 12, scale: 'linear', step: 0.5 },
  'eq3.high': { min: -12, max: 12, scale: 'linear', step: 0.5 },

  'filterLPF.frequency': { min: 20, max: 20000, scale: 'log' },
  'filterLPF.Q': { min: 0.1, max: 20, scale: 'log' },
  'filterHPF.frequency': { min: 20, max: 20000, scale: 'log' },
  'filterHPF.Q': { min: 0.1, max: 20, scale: 'log' },

  'delay.delayTime': { min: 0, max: 10, scale: 'linear', step: 0.001 },
  'delay.feedback': { min: 0, max: 0.95, scale: 'linear', step: 0.01 },
  'delay.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },

  'reverb.decay': { min: 0.1, max: 10, scale: 'log' },
  'reverb.preDelay': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'reverb.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },

  'limiter.threshold': { min: -20, max: 0, scale: 'linear' },

  // lfoDrift.* entries unchanged — no declared step (SliderCenteredZero, drift sliders keep the
  // hardcoded default; not EQ3).
  ...
};
```

**`src/utils/globalAudioSeed.ts`** (diff — `sampleField`, `generateGlobalLfoSettings`, `generatePingVarianceAutomation`):

```typescript
import { quantizeToStep } from './math';
import { LFO_RATE_MIN } from '@/types/lfo';

const LFO_RATE_STEP = 0.05; // mirrors Lfo.tsx's RATE_STEP — see §1.2

function sampleField(noiseMap: NoiseFunction2D, key: GlobalAudioSeedFieldKey): number {
  const seedRange = GLOBAL_AUDIO_SEED_RANGES[key];
  const range: SeedRange = { ...GLOBAL_AUDIO_LOADING_RANGES[key], scale: seedRange.scale };
  const t = getSeededVal(noiseMap, `globalAudio.${key}`, 0, 0, 1);
  const raw = scaleUnitValue(t, range);
  return seedRange.step ? quantizeToStep(raw, seedRange.min, seedRange.step) : raw;
}

// inside generateGlobalLfoSettings's per-target loop:
rate: quiet ? 0 : quantizeToStep(
  scaleUnitValue(rateT, { min: LFO_RATE_LOADING_MIN, max: LFO_RATE_LOADING_MAX, scale: 'linear' }),
  LFO_RATE_MIN,
  LFO_RATE_STEP,
),

// generatePingVarianceAutomation:
export function generatePingVarianceAutomation(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getSeededVal(
    noiseMap, 'globalAudio.pingVarianceAutomation', 0,
    PING_VARIANCE_AUTOMATION_SEED_RANGE.min, PING_VARIANCE_AUTOMATION_SEED_RANGE.max
  );
  return quantizeToStep(raw * 100, 0, 1) / 100;
}
```

**`src/systems/spawnSystem.ts`** (diff — 3 call sites; mirrored constants alongside the existing `ATTACK_RANGE`-style block):

```typescript
import { quantizeToStep } from '../utils/math';

// Mirrors Lfo.tsx's RATE_STEP / robotOptionsConfig.ts's Signature Array Gain step /
// robotOptionsConfig.ts's VOLUME_SCHEMA step — see docs/specs/SEEDED_SLIDER_VALUE_QUANTIZATION.md §1.2.
const LFO_RATE_STEP = 0.05;
const LAYER_GAIN_STEP = 0.01;
const VOLUME_STEP_PERCENT = 1;

// generateAudioAttributes's layer loop:
gain: quiet ? 0 : quantizeToStep(
  getSeededVal(noiseMap, 'robot.audio.layer.gain', layerOffset, 0.2, 1.2),
  0,
  LAYER_GAIN_STEP,
),

// generateRobotLfoSettings's per-target loop:
rate: quiet ? 0 : quantizeToStep(
  getSeededVal(noiseMap, `robot.lfo.${target}.rate`, offset, LFO_RATE_MIN, LFO_RATE_MAX),
  LFO_RATE_MIN,
  LFO_RATE_STEP,
),

// spawnRobot's masterVolume:
masterVolume: (() => {
  const raw = noiseMap
    ? getSeededVal(noiseMap, 'robot.masterVolume', spawnCount, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX)
    : MASTER_VOLUME_MIN + alea(`${localeId}:${spawnCount}:mv`)() * (MASTER_VOLUME_MAX - MASTER_VOLUME_MIN);
  return quantizeToStep(raw * 100, 0, VOLUME_STEP_PERCENT) / 100;
})(),
```

* **Naming conventions:** mirrored step constants named `<FIELD>_STEP` (`LFO_RATE_STEP`, `LAYER_GAIN_STEP`, `VOLUME_STEP_PERCENT`), matching this codebase's existing `<FIELD>_MIN`/`<FIELD>_MAX`/`<FIELD>_RANGE` constant style.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`src/utils/math.test.ts` (new — `math.ts` has no test file today):**
  1. `quantizeToStep(4.236, 0, 0.25)` returns `4.25` (rounds to nearest, not floor/ceil).
  2. `quantizeToStep(0, 0, 0.25)` returns `0` (already on-grid, unchanged).
  3. `quantizeToStep(-3, -12, 0.5)` returns a value on the `-12 + n*0.5` grid (negative `min`, e.g. EQ3's own range).
  4. `quantizeToStep` result is always `min + n*step` for an integer `n`, checked via `(result - min) / step` being an integer within floating-point tolerance.
* **`src/utils/globalAudioSeed.test.ts` (modified):**
  - `sampleField`-driven fields with a `step` (via `generateGlobalAudioSettings`) always return a step-aligned value across many seeds — assert for `eq3.low`, `delay.delayTime`, `compressor.ratio`.
  - Fields without a `step` (`compressor.threshold`, `filterLPF.frequency`) are unaffected — same value as before this change (regression, not just "still works").
  - `generateGlobalLfoSettings`'s `rate` is always step-aligned to `0.05` across many seeds (excluding the `quiet: true` → `0` case, itself trivially aligned).
  - `generatePingVarianceAutomation`'s result, ×100, is always an integer percent.
* **`src/systems/spawnSystem.test.ts` (modified):**
  - `generateAudioAttributes`'s per-layer `gain` (non-muted layers) is always step-aligned to `0.01` across many seeds.
  - `generateRobotLfoSettings`'s `rate` is always step-aligned to `0.05` (excluding quiet/0 case).
  - A spawned robot's `masterVolume × 100` is always an integer percent.
* **`src/types/controls.test.ts` (if one exists covering `CONTROL_SCHEMA_TYPES`/schema shape — check during implementation; modify only if it asserts on `SliderCenteredZeroSchema`'s exact field set):** confirm `step` is accepted as optional and doesn't break the existing `satisfies`-based schema literals elsewhere.
* **`src/data/audioRigConfig.test.ts` (modified, if it exists — check during implementation):** assert EQ3's 3 schemas each carry `step: 0.5`; Delay Time's schema carries `max: 10`/`step: 0.001`; Reverb Pre-Delay's schema carries `max: 1`; Compressor Attack's schema carries `max: 0.2`.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including every existing `AudioEngine.test.ts`/`lfoEngine.test.ts` assertion referencing `LFO_RATE_MAX`/`LFO_RATE_MIN` unmodified (widening `LFO_RATE_MAX` must not require editing those files' own expectations unless they hardcode `10` — check during implementation).
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** `npm run dev`. Drag the EQ3 Low slider and confirm it now moves in `0.5 dB` steps (previously `1 dB`). Reseed several Attenuation Styles (Sector Settings) and confirm the Audio Rig's EQ3/Delay Time/Compressor Ratio values always land on a visible slider tick. Spawn/reseed a locale several times and confirm a robot's Signature Array Gain, LFO Rate (Signature Array's per-layer LFO drawers), and Volume all load on values reachable by dragging their own sliders.

---

## 6. Documentation & Git/Workflow Context

* **`docs/reference/SLIDER_VALUES.md` update (per the roadmap item's own Docs section):** once this ships, update the per-field footnotes that currently describe unrounded/off-grid loading behavior for every field this spec quantizes (EQ3, Delay Time, Delay Feedback/Wet, Reverb Pre-Delay/Wet, Compressor Ratio, Volume, Ping Variance Automation, Signature Array Gain, LFO Rate) to reflect the corrected behavior, and update Delay Time's/Reverb Pre-Delay's/Compressor Attack's/LFO Rate's Min/Max/Step columns to their new values. Leave the still-unrounded fields' footnotes (Density, Sustain, Pitch Repeat, Compressor Threshold/Knee, Limiter Threshold, LFO Depth) as-is — still accurate.
* **`docs/reference/GLOBAL_CHAIN_GRID.md`:** the source-of-truth doc `globalAudioSeedRanges.ts`'s header comment points to — check during implementation whether it documents per-field step/precision and needs the same 5 range/max edits reflected; if it's silent on step/precision today, no update needed there.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/seeded-slider-value-quantization`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `quantizeToStep` + its own test, standalone, no consumer wired yet, (2) `SliderCenteredZeroSchema.step` + `SliderCenteredZero.tsx` wiring (+ any schema test), (3) the 5 schema/constant value edits (EQ3 step, Delay Time step+max, Reverb Pre-Delay max, Compressor Attack max, LFO Rate range+step) across `audioRigConfig.ts`/`types/lfo.ts`/`Lfo.tsx`, (4) `globalAudioSeedRanges.ts`'s `SeedRange.step` + 9 field entries, (5) `globalAudioSeed.ts`'s 3 quantization call sites (+ tests), (6) `spawnSystem.ts`'s 3 quantization call sites (+ tests), (7) docs.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, or reasoned through above — not left open):

- ~~Should the implicit-default-`1` fields (Density, Sustain, Volume, Compressor Threshold/Knee, Ping Variance Automation, Pitch Repeat) be quantized too?~~ **Resolved: only fields with an explicit `step` — Volume and Ping Variance Automation were miscategorized as implicit during the interview and are actually explicit-step, in scope; the rest listed stay out of scope** (corrected via full schema sweep, confirmed with Crawford before this spec).
- ~~Should the `0.5` EQ3 step apply to all `SliderCenteredZero` consumers or just EQ3?~~ **Resolved: EQ3-only**, via a new optional schema field defaulting to today's hardcoded `1`.
- ~~One shared helper, or per-call-site inline rounding?~~ **Resolved: one shared helper** (`quantizeToStep`, `src/utils/math.ts`).
- ~~Does widening `LFO_RATE_MAX` also widen robot-level LFO's loading range?~~ **Resolved: no separate loading range exists for robot-level LFO (by design, confirmed in the intent doc's Constraint) — it continues sampling its own full range, which is simply wider now (`0–20` instead of `0–10`).**

Still open — flag for Plan/Tasks, not blocking this spec:

1. **Whether `GLOBAL_CHAIN_GRID.md` needs updating** for the 5 range/max edits — depends on whether that doc documents per-field precision/step today; check during implementation (§6).
2. **Whether any existing test hardcodes `LFO_RATE_MAX`'s old value (`10`)** anywhere outside `spawnSystem.test.ts`/`globalAudioSeed.test.ts` (e.g. `lfoEngine.test.ts`, `AudioEngine.test.ts`) — flagged in §5's Verification Steps rather than assumed clean.
3. **Whether `audioRigConfig.ts`/`controls.ts` have their own dedicated test files today** — the file list in §5 says "if it exists, check during implementation" rather than asserting their current state, since this spec didn't verify that directly.
