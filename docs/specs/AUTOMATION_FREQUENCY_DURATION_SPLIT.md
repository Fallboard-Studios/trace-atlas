# Phase Spec: Automation Frequency/Duration Split

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/automation-frequency-duration-split.md](../intent/automation-frequency-duration-split.md) (confirmed via `/interview-me`, 2026-09-26), plus two implementation-level decisions confirmed directly with the user during Specify itself (§1.5 the seed-carry-forward grouping, §1.6 the new SliderLog display-formatter capability). Not a new feature — a reshaping of [docs/specs/PING-VARIANCE-AUTOMATION.md](PING-VARIANCE-AUTOMATION.md)'s one master control (`pingVarianceAutomation`), which this spec supersedes wherever the two disagree. Prior art reused directly rather than re-derived: `audioSwells.ts`'s existing trigger/selection/magnitude/duration mechanics (unchanged except where called out below), `globalAudioSeed.ts`'s seeded-default convention (`generatePingVarianceAutomation`, the `PING_VARIANCE_AUTOMATION_UNSEEDED`-sentinel carry-forward pattern), `sliderLogMath.ts`'s existing `min = 0` epsilon-floor handling (Frequency's off value needs no new math), and `types/lfo.ts`'s `LFO_RATE_MIN = 0` "rate 0 = disconnected" precedent (the same shape Frequency's on/off role reuses).

---

## 1. Overview & Claude Explanation

`pingVarianceAutomation` (a `[0, 1]` fraction, one slider — "Intensity"/"Automatic Effects") currently does two unrelated jobs: it scales every new swell's magnitude, *and* doubles as the whole system's on/off switch (`=== 0` blocks new swells and forces in-flight ones back to base). This spec splits those jobs across three sliders, and adds a third job (swell length) that today isn't user-controlled at all:

1. **Intensity** (renamed internal role, same field) — magnitude only, never gates on/off. Range narrows from `[0, 1]` to `[0.01, 1]` (displayed `[1, 100]%`, was `[0, 100]%`).
2. **Frequency** (new field `swellFrequency`) — takes over the on/off role (`0` = off) and replaces the fixed `SWELL_TRIGGER_CHANCE` per-whole-measure roll with a genuine rate: swells/measure when `≥ 1`, one swell every `1/value` measures when `0 < value < 1`. `sliderLog`, range `[0, 24]`.
3. **Duration** (new field `swellDuration`) — total swell length in measures (rising + falling together), replacing today's independent per-swell-randomized `pickPhaseMeasures` calls for each phase. The rising/falling split inside that total stays randomized per swell (skewed up to ~20/80), but the *total* is now this one deterministic, shared value. `sliderLinear`, range `[1, 24]`. Applies flat to every swell type — the existing `MIX_SWELL_DURATION_RANGE` (delay.wet/reverb.wet's 2x-longer treatment) is deleted, not preserved.

All three stay single Rig-wide values shared by both pools (global-chain and robot), exactly as `pingVarianceAutomation` alone is today — no pool ever gets its own independent Frequency/Duration/Intensity.

### 1.1 What's reused vs. what's new

Reused, unchanged: `SWELL_GLOBAL_TARGET_IDS`/`SWELL_ROBOT_ATTRIBUTE_IDS`, every direction/magnitude helper (`pickSwellPeakDelta`, `peakDeltaForDirection`, `peakDeltaCappedByFraction`, `clampVolumeDownward`, `clampGlobalPeak`, `clampSwellFloor`/`clampSwellCeiling`, `scaleSwellPeakByAutomation`), `SWELL_COMPANY_CHANCE` and the company-pick mechanics, `MAX_CONCURRENT_SWELLS_PER_POOL`, the whole eligibility/selection shape, and the falling-phase interpolation formula in `advanceGlobalSwell`/`advanceRobotSwell` (the forced-return mechanism, moved from Intensity to Frequency, rides it exactly as before).

New: `swellFrequency`/`swellDuration` store fields + actions + seed functions, two new bare schemas (`SWELL_FREQUENCY_SCHEMA` `sliderLog`, `SWELL_DURATION_SCHEMA` `sliderLinear`), a per-tick rate-based trigger check replacing `SWELL_TRIGGER_CHANCE`'s once-per-measure roll, a `pickSwellSplit` helper replacing the two independent `pickPhaseMeasures` calls per swell, a new optional `formatValue` prop on `SliderLogSchema` (§1.6), and the Pacing row's 2x2 layout in `FleetParamsContent.tsx`. `ActiveSwell`/`SwellMember` need no new field — `risingMeasures`/`fallingMeasures` keep their existing shape, just computed differently.

### 1.2 Intensity — narrower range, no on/off role

`PING_VARIANCE_AUTOMATION_SCHEMA.min` changes from `0` to `1` (display percent; internal fraction floor becomes `0.01`, not `0`). `pingVarianceAutomation` itself is never read as a gate anywhere in `audioSwells.ts` after this spec — `scaleSwellPeakByAutomation` still multiplies every new swell's peak by it (§1.3's `automation` parameter is renamed `intensity` throughout for clarity, same values, same call sites, same "always the last step after every attribute-specific clamp" rule from `PING-VARIANCE-AUTOMATION.md` §1.3), but nothing checks `intensity > 0`/`=== 0` — that check moves to `swellFrequency` (§1.3 below). `PING_VARIANCE_AUTOMATION_SEED_RANGE` changes from `{ min: 0.33, max: 0.66 }` to `{ min: 0.10, max: 0.60 }` (the confirmed load range `[10, 60]%`).

Since `intensity` can never reach `0` anymore, `scaleSwellPeakByAutomation`'s existing "never silently creates a `peakDelta: 0` swell" comment (`PING-VARIANCE-AUTOMATION.md` §1.3) is even more strongly guaranteed than before — no code change needed there, just a doc-comment update noting the new floor.

### 1.3 Frequency — the new on/off + rate mechanism

**Storage:** `swellFrequency: number`, `[0, 24]`, same domain the slider itself uses (no fraction/percent conversion — `sliderLog`'s `SliderLogSchema` has no built-in unit-conversion idiom the way `SliderLinear`'s existing `* 100`/`/ 100` pattern does, and none is needed here since the store value and the displayed number are the same unit, "swells per measure").

**Trigger mechanism — replaces the once-per-whole-measure roll with a per-tick rate check.** Today, `SWELL_TRIGGER_CHANCE` (a fixed `0.28`) is rolled at most once per whole measure, gated by `lastRolledMeasure`. This spec deletes that gate for the trigger/selection roll (the *advance* step stays every-tick, unchanged) and rolls once per **tick** (the existing `16n` cadence `tickAudioSwells` already runs at — 16 ticks/measure) instead, with a per-tick probability derived from `swellFrequency` so the long-run expected rate matches it:

```typescript
/** Ticks per whole measure — the existing 16n scheduleRepeat cadence
 *  startAudioSwells already runs tickAudioSwells at (docs/specs/
 *  AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3). Not re-derived from
 *  BeatClock at runtime — 16n is a fixed subdivision, same constant shape
 *  DEFAULT_SWELL_DURATION_RANGE etc. already use for "a number this file's
 *  own scheduling cadence depends on". */
const TICKS_PER_MEASURE = 16;

/**
 * Frequency's per-tick trigger probability (docs/specs/
 * AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3), replacing SWELL_TRIGGER_CHANCE's
 * fixed once-per-measure roll. frequency is swells/measure directly (not a
 * fraction) — over TICKS_PER_MEASURE independent per-tick Bernoulli trials
 * with probability p, the expected number of successes per measure is
 * TICKS_PER_MEASURE * p, so solving for p gives frequency / TICKS_PER_MEASURE.
 * This is an approximation (a true Poisson-style "expected count" rather than
 * a guarantee of exactly `frequency` triggers every single measure — some
 * measures get more, some fewer, matching every other seeded-probability
 * field in this file's own existing "average gap" framing, e.g.
 * SWELL_TRIGGER_CHANCE's own "~3-4 measure average gap" comment). frequency
 * values above TICKS_PER_MEASURE (24 > 16) are clamped to 1 — a per-tick
 * probability can't exceed 1, so "24 times a measure" and "16 times a
 * measure" are behaviorally identical (at most one trigger per tick, no
 * multi-trigger-per-tick concept exists) — an accepted, documented ceiling,
 * not a bug (§7).
 */
function frequencyToPerTickChance(frequency: number): number {
  return Math.min(1, frequency / TICKS_PER_MEASURE);
}
```

`maybeStartGlobalSwell`/`maybeStartRobotSwell`'s own `triggerRoll >= SWELL_TRIGGER_CHANCE` line becomes `triggerRoll >= frequencyToPerTickChance(frequency)`, and the seeded `dataId` these roll against (`'audioSwell.trigger.global'`/`'audioSwell.trigger.robot'`) now needs a `measure` **offset with tick-level resolution**, not just the whole measure — otherwise every tick within the same whole measure would roll the exact same noise value and either always or never trigger for that entire measure, defeating the whole point of a per-tick check. `tickAudioSwells` already receives a fractional `measure` (sub-measure precision, per its own existing doc comment) — that same fractional value becomes the trigger roll's offset (`getSeededVal(noiseMap, 'audioSwell.trigger.global', measure, 0, 1)`, `measure` no longer floored to `wholeMeasure` for this one call site).

**The once-per-whole-measure `lastRolledMeasure` gate is deleted entirely** — trigger/selection now runs unconditionally on every `tickAudioSwells` call, the same cadence advance already runs at:

```typescript
export function tickAudioSwells(localeId: string, measure: number): void {
  const as = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!as) return;
  const noiseMap = getAttenuationStyleNoiseMap(as.id, as.name);

  const intensity = useAudioStore.getState().pingVarianceAutomation;
  const frequency = useAudioStore.getState().swellFrequency;
  const duration = useAudioStore.getState().swellDuration;
  advanceActiveSwells(localeId, measure, frequency);

  if (frequency > 0) {
    maybeStartGlobalSwell(noiseMap, measure, intensity, frequency, duration);
    maybeStartRobotSwell(localeId, noiseMap, measure, intensity, frequency, duration);
  }
}
```

**Frequency = 0 is the sole on/off switch**, replacing every `automation`/`pingVarianceAutomation` reference in the gate and forced-return checks with `frequency`: `advanceActiveSwells`/`advanceGlobalSwell`/`advanceRobotSwell`/`maybeForceGlobalSwellReturn`/`maybeForceRobotSwellReturn` all take `frequency: number` in place of their current `automation: number` parameter, and every `automation === 0`/`automation !== 0`/`automation > 0` check becomes the same check against `frequency`. The forced-return mechanism itself (`PING-VARIANCE-AUTOMATION.md` §1.4 — re-deriving `peakDelta` from the live current value, riding the existing falling-phase formula, the `phase === 'rising'` guard doubling as the "already forced" marker) is otherwise **byte-for-byte unchanged**, just re-keyed.

**`sliderLog`, `[0, 24]`.** `sliderLogMath.ts`'s existing `min = 0` epsilon-floor handling (`t <= 0` maps to exactly `min`, including `min = 0`) already does the right thing here with zero new math — dragged fully left is exactly `0` (off), everything above it follows a genuine log curve to `24`. No new slider primitive behavior needed for the on/off value itself.

### 1.4 Duration — one total value, still-randomized split

**Storage:** `swellDuration: number`, `[1, 24]` measures, same domain the slider uses directly (no conversion).

**Replaces `pickPhaseMeasures`'s two independent per-phase draws with one total-then-split draw.** Today, `risingMeasures` and `fallingMeasures` are each an independent `pickPhaseMeasures(noiseMap, dataId, offset, range)` call against a range (`DEFAULT_SWELL_DURATION_RANGE` or `MIX_SWELL_DURATION_RANGE`). This spec replaces both calls, at every call site, with one call to a new helper that takes the user's `duration` as the fixed total and draws only the **split ratio**:

```typescript
/** Confirmed via /interview-me, 2026-09-26: Duration is the swell's total
 *  length (rising + falling together); the split between the two phases
 *  stays randomized per swell, skewed as far as ~20/80 either way rather
 *  than a fixed 50/50 — replaces DEFAULT_SWELL_DURATION_RANGE/
 *  MIX_SWELL_DURATION_RANGE's two independent per-phase draws with one
 *  shared total and a single ratio draw. Returns [risingMeasures,
 *  fallingMeasures], each floored to the existing 1-measure-per-phase hard
 *  minimum (docs/specs/AUDIO_SWELLS.md §1.5) — duration values below 2 can't
 *  actually honor both floors simultaneously; see §7 for the accepted
 *  rounding behavior at that edge. */
const SWELL_SPLIT_MIN_FRACTION = 0.2;
const SWELL_SPLIT_MAX_FRACTION = 0.8;

function pickSwellSplit(
  noiseMap: NoiseFunction2D,
  dataId: string,
  offset: number,
  totalMeasures: number,
): [risingMeasures: number, fallingMeasures: number] {
  const risingFraction = getSeededVal(noiseMap, `${dataId}.split`, offset, SWELL_SPLIT_MIN_FRACTION, SWELL_SPLIT_MAX_FRACTION);
  const rising = Math.max(1, Math.round(totalMeasures * risingFraction));
  const falling = Math.max(1, Math.round(totalMeasures - rising));
  return [rising, falling];
}
```

Every call site that today does:

```typescript
const risingMeasures = pickPhaseMeasures(noiseMap, `audioSwell.rising.${target}`, measure, durationRange);
const fallingMeasures = pickPhaseMeasures(noiseMap, `audioSwell.falling.${target}`, measure, durationRange);
```

becomes:

```typescript
const [risingMeasures, fallingMeasures] = pickSwellSplit(noiseMap, `audioSwell.duration.${target}`, measure, duration);
```

(same shape for `startSingleRobotSwell`'s `${robot.id}.${attribute}` id and `startCompanyWideSwell`'s shared `'audioSwell.company'` id — each keeps its own existing per-target/per-robot/per-company `dataId` prefix, just against the new helper).

**`pickPhaseMeasures` itself is deleted** — nothing calls it once every call site above is converted; do not leave it as unused dead code.

**`MIX_SWELL_DURATION_RANGE`/`MIX_SWELL_TARGETS` are deleted entirely.** `maybeStartGlobalSwell`'s `durationRange = MIX_SWELL_TARGETS.includes(target) ? MIX_SWELL_DURATION_RANGE : DEFAULT_SWELL_DURATION_RANGE` line — and the whole distinction it expresses — goes away; every target uses the same `duration` value, confirmed directly with the user ("one flat Duration for everything"). `DEFAULT_SWELL_DURATION_RANGE` is also deleted (no caller survives this spec).

**`sliderLinear`, `[1, 24]`.**

### 1.5 Seeding — both new fields join the same carry-forward group as Intensity

Confirmed with the user during Specify (consistency call, not separately interviewed): `swellFrequency` and `swellDuration` seed **once per session**, then carry forward across every later Attenuation Style switch, identically to `pingVarianceAutomation`'s existing sentinel-gated mechanism (`PING-VARIANCE-AUTOMATION.md` §1.2) — not the "reseed every switch" behavior most `GlobalAudioSettings` fields use. This keeps all three Pacing sliders behaving the same way from the user's perspective (drag one, it stays put across locale changes, exactly like Intensity already does) rather than having Frequency/Duration silently reset on an Attenuation Style change while Intensity doesn't.

Two new sentinels, same shape as `PING_VARIANCE_AUTOMATION_UNSEEDED`:

```typescript
const SWELL_FREQUENCY_UNSEEDED = -1; // outside [0, 24]
const SWELL_DURATION_UNSEEDED = -1;  // outside [1, 24]
```

`regenerateGlobalAudioFromSeed` gains two more conditional single-field seeds, same pattern as `pingVarianceAutomation`'s existing one:

```typescript
const swellFrequency = get().swellFrequency === SWELL_FREQUENCY_UNSEEDED
  ? generateSwellFrequency(attenuationStyleId, attenuationStyleName)
  : undefined;
const swellDuration = get().swellDuration === SWELL_DURATION_UNSEEDED
  ? generateSwellDuration(attenuationStyleId, attenuationStyleName)
  : undefined;
set({
  globalAudio,
  ...(pingVarianceAutomation !== undefined ? { pingVarianceAutomation } : {}),
  ...(swellFrequency !== undefined ? { swellFrequency } : {}),
  ...(swellDuration !== undefined ? { swellDuration } : {}),
});
```

New seed functions in `globalAudioSeed.ts`, same file/shape as `generatePingVarianceAutomation`:

```typescript
const SWELL_FREQUENCY_SEED_RANGE = { min: 2, max: 8 };
const SWELL_DURATION_SEED_RANGE = { min: 2, max: 8 };

export function generateSwellFrequency(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  return getSeededVal(noiseMap, 'globalAudio.swellFrequency', 0, SWELL_FREQUENCY_SEED_RANGE.min, SWELL_FREQUENCY_SEED_RANGE.max);
}

export function generateSwellDuration(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  return getSeededVal(noiseMap, 'globalAudio.swellDuration', 0, SWELL_DURATION_SEED_RANGE.min, SWELL_DURATION_SEED_RANGE.max);
}
```

No quantization step (unlike `generatePingVarianceAutomation`'s percent-space rounding) — both fields store whole-unit-adjacent values directly in their own display domain already (no `* 100`/`/ 100` split to create an off-grid rounding risk), matching `BPM_SCHEMA`'s own un-quantized seed treatment.

### 1.6 New capability: `SliderLogSchema.formatValue` — confirmed directly with the user

Confirmed via a direct question during Specify: the user wants Frequency's displayed text itself to switch phrasing by value ("x/measure" at or above 1, "every x measures" below 1), which today's `SliderLog` cannot do — `formatDisplayValue(value)` + `schema.unit` is the only display path, a fixed number plus a static unit string, no per-value branching. This spec adds one new **optional** field to `SliderLogSchema` only (not `SliderLinearSchema`/`SliderCenteredZeroSchema` — no other current or planned slider needs it, and the intent doc's own "reuse existing primitives" spirit argues against widening every schema for one field's need):

```typescript
export interface SliderLogSchema extends ControlSchemaBase, SliderVerticalHeightProp {
  type: 'sliderLog';
  min: number;
  max: number;
  unit?: string;
  orientation: SliderOrientation;
  /** Optional per-value display override (docs/specs/
   *  AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.6) — when present, replaces
   *  the default `formatDisplayValue(value) + unit` label entirely with this
   *  function's return value. The raw `value`/`onChange`/slider-thumb-position
   *  math (sliderLogValueToT/sliderLogTToValue) is completely unaffected —
   *  this only changes what text renders next to the track. Optional so
   *  every existing SliderLog schema (Attack/Decay/Release, etc.) keeps its
   *  current plain-number-plus-unit display with zero changes. */
  formatValue?: (value: number) => string;
}
```

`SliderLog.tsx`'s `valueLabel` becomes:

```typescript
const valueLabel = (
  <span className="sc-slider-log__value">
    {schema.formatValue ? schema.formatValue(value) : `${formatDisplayValue(value)}${schema.unit ?? ''}`}
  </span>
);
```

`SWELL_FREQUENCY_SCHEMA`'s own formatter (`audioRigConfig.ts`):

```typescript
/** "x times per measure when above 1, every x measures (calculated) when
 *  below 1" (docs/intent/automation-frequency-duration-split.md) — 0 reads
 *  as "Off" (Frequency's on/off role, §1.3), not "0.0/measure" or "every
 *  Infinity measures". Below 1, "every x measures" uses 1/value, rounded to
 *  1 decimal like the per-measure form for a consistent significant-figure
 *  feel (e.g. 0.4 -> "every 2.5 measures", not an integer-only round that
 *  would collapse several nearby slider positions to the same displayed
 *  text). */
function formatSwellFrequency(value: number): string {
  if (value === 0) return 'Off';
  if (value >= 1) return `${formatDisplayValue(value)}/measure`;
  return `every ${formatDisplayValue(1 / value)} measures`;
}
```

(`formatDisplayValue` is already exported from `formatDisplayValue.ts` for exactly this "round to 3 decimals for display" job — reused here, not reimplemented.)

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── controls.ts                # MODIFIED — SliderLogSchema gains optional formatValue (§1.6)
│   └── controls.test.ts           # MODIFIED
├── stores/
│   ├── audioStore.ts              # MODIFIED — swellFrequency/setSwellFrequency and
│   │                                 #   swellDuration/setSwellDuration added (top-level,
│   │                                 #   mirror pingVarianceAutomation's shape exactly);
│   │                                 #   PING_VARIANCE_AUTOMATION_SEED_RANGE range narrows
│   │                                 #   is actually in globalAudioSeed.ts, not here — this
│   │                                 #   file only gains the two new sentinels/fields/actions
│   │                                 #   and regenerateGlobalAudioFromSeed's two new
│   │                                 #   conditional seeds (§1.5)
│   └── audioStore.test.ts         # MODIFIED
├── utils/
│   ├── globalAudioSeed.ts         # MODIFIED — generateSwellFrequency/generateSwellDuration
│   │                                 #   added; PING_VARIANCE_AUTOMATION_SEED_RANGE changed
│   │                                 #   to { min: 0.10, max: 0.60 } (§1.2)
│   └── globalAudioSeed.test.ts    # MODIFIED
├── data/
│   ├── audioRigConfig.ts          # MODIFIED — PING_VARIANCE_AUTOMATION_SCHEMA.min: 0 -> 1;
│   │                                 #   new SWELL_FREQUENCY_SCHEMA (sliderLog, 0-24, with
│   │                                 #   formatValue) and SWELL_DURATION_SCHEMA (sliderLinear,
│   │                                 #   1-24) exported as bare schemas, same non-AUDIO_RIG_CONFIG
│   │                                 #   treatment PING_VARIANCE_AUTOMATION_SCHEMA already gets
│   └── audioRigConfig.test.ts     # MODIFIED
├── components/
│   ├── ui/controls/
│   │   ├── SliderLog.tsx          # MODIFIED — valueLabel uses schema.formatValue when present (§1.6)
│   │   └── SliderLog.test.tsx     # MODIFIED
│   └── panels/screen/
│       ├── console/
│       │   ├── AudioRigDrawer.tsx        # MODIFIED — AudioRigDrawer() (the "Automatic Intensity"
│       │   │                                #   leaf's render function) drops its own
│       │   │                                #   SPEED_AUTOMATION_PANEL_SCHEMA/DirectionalPanel
│       │   │                                #   wrapper entirely — see §2's note below, its
│       │   │                                #   Intensity slider now renders directly inside
│       │   │                                #   FleetParamsContent's own Pacing row layout
│       │   └── AudioRigDrawer.test.tsx     # MODIFIED
│       └── nav/content/
│           ├── FleetParamsContent.tsx      # MODIFIED — PACING_ROW_SCHEMA's single row becomes
│           │                                #   two DirectionalPanel rows (Tempo+Frequency,
│           │                                #   Duration+Intensity), same 'responsive'
│           │                                #   orientation COMPRESSOR_TOP_ROW_SCHEMA/
│           │                                #   COMPRESSOR_BOTTOM_ROW_SCHEMA already establish
│           │                                #   for a 2-control row; renderLeaf's 'tempo'/
│           │                                #   'automaticEffects' special-casing is restructured
│           │                                #   to place each of the 4 sliders in its row (§2.1)
│           └── FleetParamsContent.test.tsx # MODIFIED
└── systems/
    ├── audioSwells.ts             # MODIFIED — see §1.3/§1.4 for the full diff shape:
    │                                 #   SWELL_TRIGGER_CHANCE, DEFAULT_SWELL_DURATION_RANGE,
    │                                 #   MIX_SWELL_DURATION_RANGE, MIX_SWELL_TARGETS, and
    │                                 #   pickPhaseMeasures are all DELETED; TICKS_PER_MEASURE,
    │                                 #   frequencyToPerTickChance, pickSwellSplit are NEW;
    │                                 #   every function currently taking `automation: number`
    │                                 #   is re-keyed to take `frequency: number` for its
    │                                 #   gate/forced-return role, plus (where it creates a
    │                                 #   swell) `intensity: number` for magnitude and
    │                                 #   `duration: number` for the split call; lastRolledMeasure
    │                                 #   and its whole-measure gating in tickAudioSwells are
    │                                 #   removed entirely
    └── audioSwells.test.ts        # MODIFIED — see §5
```

**§2.1 — `AudioRigDrawer`'s two exported components diverge further.** `AudioRigEffectPanel` (the generic per-effect leaf renderer) is completely untouched by this spec. `AudioRigDrawer` (the Intensity-only leaf renderer, `AudioRigDrawer.tsx:249-274`) currently wraps its one slider in its own `SPEED_AUTOMATION_PANEL_SCHEMA` `DirectionalPanel` + its own outer `<div className="audio-rig-drawer" style={getTraitColorStyle('composition')}>`. Once Intensity moves into a shared 2-up row with Duration (§2.2), that per-component wrapper would produce a panel-inside-a-panel — this spec removes `AudioRigDrawer`'s own outer wrapper and `SPEED_AUTOMATION_PANEL_SCHEMA` entirely, and `AudioRigDrawer` becomes a plain function returning just the bare `<SliderLinear>` row (still exported, still doing the `useAudioStore`/`useCallback` wiring — only the JSX wrapper shrinks). `FleetParamsContent.tsx`'s own `PACING_ROW_SCHEMA`-driven `DirectionalPanel`s become the only panel wrapping any Pacing slider, matching how `AudioRigEffectPanel`'s siblings (EQ, HPF, etc.) already get their panel from their own call site, not from a self-wrapping leaf component.

**Explicitly not touched, and why:** `src/types/audioSwell.ts` (no new `ActiveSwell`/`SwellMember` field — `risingMeasures`/`fallingMeasures` keep their existing shape), `src/data/audioSwellRanges.ts` (robot swing bounds are unrelated to trigger/duration), `src/engine/lfoEngine.ts`/`lfoDrift.ts`/`lfoShared.ts` (Audio Swells stays independent of LFO machinery, unchanged by this reshaping), `src/systems/audioBudgetSystem.ts` (the Audio Load Budget performance-tier system — "load min/max" in this spec means the seeded-default range convention, an unrelated concept, confirmed in Specify), `src/systems/worldTransition.ts` (`stopAudioSwells()`/`startAudioSwells(localeId)` lifecycle wiring is unaffected), `src/components/ui/controls/SliderLinear.tsx`/`SliderCenteredZero.tsx` (no change — only `SliderLog.tsx` gains the new optional prop, §1.6).

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`formatValue` is additive and optional — no existing `SliderLogSchema` consumer changes behavior.** Every current `sliderLog` schema (Attack/Decay/Release, etc.) must render identically after this change; only `SWELL_FREQUENCY_SCHEMA` supplies `formatValue`.
* **No new UI primitive.** Duration reuses `SliderLinear` exactly as `BPM_SCHEMA`/`PING_VARIANCE_AUTOMATION_SCHEMA` already do; Frequency reuses `SliderLog` exactly as every Attack/Decay/Release control already does (plus the one new optional prop, §1.6). No bespoke slider component, no new `ControlSchema` variant.
* **`Math.random()` stays banned.** `generateSwellFrequency`/`generateSwellDuration` must use `getSeededVal`, no exception.
* **`BeatClock`-driven scheduling is unchanged in kind, tighter in cadence for one thing only.** This spec does not add a new schedule or timer — `tickAudioSwells` keeps running off the exact same `scheduleRepeat('16n', ...)` call in `startAudioSwells`. The only change is that the trigger/selection roll, which used to skip itself on 15 out of every 16 ticks (`lastRolledMeasure` gate), now runs on all 16 — still zero `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask`, per CLAUDE.md's non-negotiable rule.
* **`frequencyToPerTickChance`'s clamp-at-`TICKS_PER_MEASURE` ceiling is intentional, not a bug to work around** — do not attempt to simulate more than one trigger per tick to achieve a literal "24 times a measure" above the 16-tick cadence. §7 tracks this as an accepted approximation.
* **The magnitude-scaling multiply's ordering is unchanged from `PING-VARIANCE-AUTOMATION.md` §1.3** — `intensity` (renamed `automation`) still multiplies strictly after every attribute-specific clamp, never before or instead of one. This spec's renaming of the parameter must not accidentally reorder anything.
* **`pickSwellSplit`'s 1-measure-per-phase floor can violate the total for `duration < 2`** — e.g. `duration = 1` cannot give both phases at least 1 measure each; `Math.max(1, ...)` on both sides means the realized total can exceed the requested `duration` at the extreme low end. This is an accepted rounding edge (§7), not something to special-case with new branching logic.
* **Delete dead code, don't deprecate.** `pickPhaseMeasures`, `DEFAULT_SWELL_DURATION_RANGE`, `MIX_SWELL_DURATION_RANGE`, `MIX_SWELL_TARGETS`, `SWELL_TRIGGER_CHANCE`, and `lastRolledMeasure` are all fully removed once their replacements land — no unused exports left behind "in case something still imports them" without checking first (`audioSwells.test.ts` almost certainly imports several of these directly; update, don't leave stale).
* **Global writes still go through `setGlobalAudio()`; robot writes still go through `robotOptionsActions.ts`'s `apply*` functions** — unchanged.
* **`setSwellFrequency`/`setSwellDuration` are plain state writes, no `AudioEngine` call** — same shape as `setPingVarianceAutomation`.
* **All three Pacing fields (`pingVarianceAutomation`, `swellFrequency`, `swellDuration`) seed once per session and carry forward across every Attenuation Style switch** (§1.5) — do not let Frequency/Duration reseed on every switch the way most `GlobalAudioSettings` fields do.
* **No changes to `docs/COMPONENT_LIBRARY.md`** beyond documenting `formatValue` as a new optional field on the existing `SliderLog` primitive's contract — no new primitive is added to the library's 14-primitive count.

---

## 4. Code Style & Architecture Conventions

**`src/stores/audioStore.ts`** (diff shape — additive, alongside the existing `pingVarianceAutomation` block):

```typescript
const SWELL_FREQUENCY_UNSEEDED = -1;
const SWELL_DURATION_UNSEEDED = -1;

export interface AudioStore {
  // ...existing pingVarianceAutomation field/action unchanged...
  /** Swells per measure ([0, 24], sliderLog) — the Audio Rig's Pacing
   *  "Frequency" slider (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md
   *  §1.3). 0 is the sole on/off switch for the whole Audio Swells system
   *  (replacing pingVarianceAutomation's former on/off role). Seeded once
   *  per session, then carried forward across every future Attenuation
   *  Style switch, same as pingVarianceAutomation. */
  swellFrequency: number;
  /** Total swell length in measures ([1, 24], sliderLinear) — the Audio
   *  Rig's Pacing "Duration" slider. Replaces the former per-swell-randomized
   *  independent rising/falling picks with one shared total; the rising/
   *  falling split within that total still varies per swell. Seeded once
   *  per session, carried forward like swellFrequency/pingVarianceAutomation. */
  swellDuration: number;
  setSwellFrequency: (value: number) => void;
  setSwellDuration: (value: number) => void;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  // ...
  swellFrequency: SWELL_FREQUENCY_UNSEEDED,
  swellDuration: SWELL_DURATION_UNSEEDED,
  // ...
  setSwellFrequency: (value) => { set({ swellFrequency: value }); },
  setSwellDuration: (value) => { set({ swellDuration: value }); },

  regenerateGlobalAudioFromSeed: (attenuationStyleId, attenuationStyleName) => {
    // ...existing generated/current/globalAudio block unchanged...
    const pingVarianceAutomation = get().pingVarianceAutomation === PING_VARIANCE_AUTOMATION_UNSEEDED
      ? generatePingVarianceAutomation(attenuationStyleId, attenuationStyleName)
      : undefined;
    const swellFrequency = get().swellFrequency === SWELL_FREQUENCY_UNSEEDED
      ? generateSwellFrequency(attenuationStyleId, attenuationStyleName)
      : undefined;
    const swellDuration = get().swellDuration === SWELL_DURATION_UNSEEDED
      ? generateSwellDuration(attenuationStyleId, attenuationStyleName)
      : undefined;
    set({
      globalAudio,
      ...(pingVarianceAutomation !== undefined ? { pingVarianceAutomation } : {}),
      ...(swellFrequency !== undefined ? { swellFrequency } : {}),
      ...(swellDuration !== undefined ? { swellDuration } : {}),
    });
    applyGlobalAudioToEngine(globalAudio);
  },
}));
```

**`src/utils/globalAudioSeed.ts`:**

```typescript
// PING_VARIANCE_AUTOMATION_SEED_RANGE narrows per docs/specs/
// AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2 (load range confirmed [10, 60]%):
const PING_VARIANCE_AUTOMATION_SEED_RANGE = { min: 0.10, max: 0.60 };

const SWELL_FREQUENCY_SEED_RANGE = { min: 2, max: 8 };
const SWELL_DURATION_SEED_RANGE = { min: 2, max: 8 };

export function generateSwellFrequency(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  return getSeededVal(noiseMap, 'globalAudio.swellFrequency', 0, SWELL_FREQUENCY_SEED_RANGE.min, SWELL_FREQUENCY_SEED_RANGE.max);
}

export function generateSwellDuration(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  return getSeededVal(noiseMap, 'globalAudio.swellDuration', 0, SWELL_DURATION_SEED_RANGE.min, SWELL_DURATION_SEED_RANGE.max);
}
```

**`src/data/audioRigConfig.ts`:**

```typescript
export const PING_VARIANCE_AUTOMATION_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.pingVarianceAutomation',
  type: 'sliderLinear',
  loreLabel: 'PING VARIANCE AUTOMATION',
  humanLabel: 'Intensity',
  min: 1, // was 0 — docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2
  max: 100,
  step: 1,
  unit: '%',
  orientation: 'horizontal',
};

function formatSwellFrequency(value: number): string {
  if (value === 0) return 'Off';
  if (value >= 1) return `${formatDisplayValue(value)}/measure`;
  return `every ${formatDisplayValue(1 / value)} measures`;
}

export const SWELL_FREQUENCY_SCHEMA: SliderLogSchema = {
  id: 'audioRig.swellFrequency',
  type: 'sliderLog',
  loreLabel: 'PING RECURRENCE',
  humanLabel: 'Frequency',
  min: 0,
  max: 24,
  orientation: 'horizontal',
  formatValue: formatSwellFrequency,
};

export const SWELL_DURATION_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.swellDuration',
  type: 'sliderLinear',
  loreLabel: 'PING SUSTAIN',
  humanLabel: 'Duration',
  min: 1,
  max: 24,
  step: 1,
  unit: ' measures',
  orientation: 'horizontal',
};
```

(Lore labels above are first-pass placeholders, same "confirm during manual check" treatment `LFO_DRIFT_GROUPS`'s own labels got in `PING-VARIANCE-AUTOMATION.md` — not yet confirmed with the user; flagged in §7.)

**`src/components/panels/screen/nav/content/FleetParamsContent.tsx`** (Pacing group's leaf rendering restructured from 2 leaves to 4, laid out as 2 rows of 2):

```typescript
const PACING_TOP_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.pacing.topRow', type: 'directionalPanel', orientation: 'responsive' };
const PACING_BOTTOM_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.pacing.bottomRow', type: 'directionalPanel', orientation: 'responsive' };

// Pacing's leaves list grows from 2 to 4 (tempo, frequency, duration,
// automaticEffects/Intensity) — FLEET_PARAMS_GROUPS' 'pacing' entry gains 2
// new FleetParamsLeaf rows, matching navTreeConfig.ts's own tree (a
// dependency Plan/Tasks must also update, see §7).
{
  id: 'pacing',
  // ...
  leaves: [
    { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo', effectKey: 'tempo' },
    { id: 'fleetParams.pacing.frequency', humanLabel: 'Frequency', effectKey: 'swellFrequency' },
    { id: 'fleetParams.pacing.duration', humanLabel: 'Duration', effectKey: 'swellDuration' },
    { id: 'fleetParams.pacing.automaticEffects', humanLabel: 'Intensity', effectKey: 'automaticEffects' },
  ],
},
```

`renderLeaf`'s special-casing grows two branches (`'swellFrequency'`/`'swellDuration'`), each a bare slider row exactly like the existing `'tempo'` branch:

```typescript
function renderLeaf(effectKey: SelectedFleetParamsEffect, bpm: number) {
  if (effectKey === 'tempo') {
    return <div className="audio-rig-drawer__param-row"><SliderLinear schema={BPM_SCHEMA} value={bpm} onChange={(v) => useAudioStore.getState().setBPM(v)} /></div>;
  }
  if (effectKey === 'swellFrequency') {
    const frequency = useAudioStore((s) => s.swellFrequency);
    return <div className="audio-rig-drawer__param-row"><SliderLog schema={SWELL_FREQUENCY_SCHEMA} value={frequency} onChange={(v) => useAudioStore.getState().setSwellFrequency(v)} /></div>;
  }
  if (effectKey === 'swellDuration') {
    const duration = useAudioStore((s) => s.swellDuration);
    return <div className="audio-rig-drawer__param-row"><SliderLinear schema={SWELL_DURATION_SCHEMA} value={duration} onChange={(v) => useAudioStore.getState().setSwellDuration(v)} /></div>;
  }
  if (effectKey === 'automaticEffects') {
    return <AudioRigDrawer />; // now a bare <SliderLinear> row, no self-wrapping panel (§2.1)
  }
  return <AudioRigEffectPanel effectKey={effectKey as AudioRigEffectKey} />;
}
```

(Calling a hook — `useAudioStore((s) => s.swellFrequency)` — conditionally inside `renderLeaf` violates the Rules of Hooks exactly as `AudioRigDrawer`'s own doc comment already warns against for a similar shape; Plan/Tasks must restructure this into small dedicated components, e.g. `TempoLeaf`/`FrequencyLeaf`/`DurationLeaf`, each unconditionally calling its own single hook, mirroring how `AudioRigDrawer`/`AudioRigEffectPanel` are already separate components for exactly this reason — the sketch above shows *data flow* intent only, not literal hook-in-a-branch code to ship.)

The group-level render (wherever `FLEET_PARAMS_GROUPS.find(g => g.id === 'pacing').leaves` currently maps 1:1 to anchor divs) wraps the 4 leaves in 2 `DirectionalPanel`s instead of rendering each independently — `[tempo, frequency]` inside `PACING_TOP_ROW_SCHEMA`, `[duration, automaticEffects]` inside `PACING_BOTTOM_ROW_SCHEMA` — same 2-row `DirectionalPanel` shape `COMPRESSOR_TOP_ROW_SCHEMA`/`COMPRESSOR_BOTTOM_ROW_SCHEMA` already establish in `AudioRigDrawer.tsx` for a 2-control row (`'responsive'` orientation: side-by-side on desktop, stacked on mobile/tablet — matching this spec's own desktop layout requirement of Frequency right-of-Tempo and Intensity right-of-Duration, while degrading sensibly on narrow viewports the same way every other Pacing/EQ row already does).

* **Naming Conventions:** `swellFrequency`/`swellDuration`/`setSwellFrequency`/`setSwellDuration`, `SWELL_FREQUENCY_SCHEMA`/`SWELL_DURATION_SCHEMA`, `generateSwellFrequency`/`generateSwellDuration`, `SWELL_FREQUENCY_SEED_RANGE`/`SWELL_DURATION_SEED_RANGE`, `frequencyToPerTickChance`, `pickSwellSplit`, `formatSwellFrequency` — same `verbNoun`/`camelCase`/`SCREAMING_SNAKE_CASE` conventions the surrounding files already use throughout.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest.
* **Test File Location:** Colocate, matching every file in §2.
* **`controls.test.ts` (modified):** a `SliderLogSchema` with `formatValue` set is a valid schema (type-level/shape check, matching this file's existing per-variant assertion style).
* **`SliderLog.test.tsx` (modified):**
  1. A schema with no `formatValue` renders exactly as before (`formatDisplayValue(value)` + `unit`) — regression guard.
  2. A schema with `formatValue` set renders that function's return value verbatim, ignoring `unit` entirely, for several representative values.
* **`audioStore.test.ts` (modified):** `swellFrequency`/`setSwellFrequency` and `swellDuration`/`setSwellDuration` get the same 3-case `regenerateGlobalAudioFromSeed` coverage `pingVarianceAutomation` already has (`PING-VARIANCE-AUTOMATION.md` §5): first-call seed lands in range, a second call with a different Attenuation Style leaves the value unchanged, and a hand-dragged out-of-seed-range value survives a later call untouched. `PING_VARIANCE_AUTOMATION_SEED_RANGE`'s own existing seed-range assertion updates from `[0.33, 0.66]` to `[0.10, 0.60]`.
* **`globalAudioSeed.test.ts` (modified):** `generateSwellFrequency`/`generateSwellDuration` — determinism (same AS id/name -> same value), range (`[2, 8]` for both, across many sampled AS names), and a direct assertion they're `getSeededVal`-driven (no `Math.random()`) — same shape `generatePingVarianceAutomation`'s own coverage already has.
* **`audioRigConfig.test.ts` (modified):** `PING_VARIANCE_AUTOMATION_SCHEMA.min === 1` (was `0`); `SWELL_FREQUENCY_SCHEMA`/`SWELL_DURATION_SCHEMA` are valid schemas with the correct `min`/`max`/`type`; `SWELL_FREQUENCY_SCHEMA.formatValue` produces `'Off'` at `0`, an `'N/measure'`-shaped string at `4`, and an `'every N measures'`-shaped string at `0.25` (asserting the exact reciprocal: `formatSwellFrequency(0.25)` names 4 measures).
* **`audioSwells.test.ts` (modified) — the bulk of the behavioral coverage, largely a rewrite given how much of this file's existing surface (`SWELL_TRIGGER_CHANCE`, duration ranges, the automation-as-gate tests) is deleted:**
  1. **Frequency = 0 is the sole gate:** with `pingVarianceAutomation`/intensity at any nonzero value and `swellFrequency: 0`, no new swell (global or robot) ever starts across many ticks — mirrors the old "automation 0 blocks new swells" test, re-keyed to `swellFrequency`.
  2. **Rate matches expectation statistically:** run `tickAudioSwells` a large fixed number of ticks (e.g. `16 * 1000` = 1000 measures' worth) at a fixed `swellFrequency` (e.g. `4`), count total triggers attempted (not necessarily all successfully starting a swell, given the pool cap — assert against the *trigger roll succeeding*, a countable event independent of `MAX_CONCURRENT_SWELLS_PER_POOL`), and assert the observed rate is within a documented tolerance band of `frequency` per measure (e.g. ±15%, given this is a probabilistic approximation per §1.3/§7) — both for a `frequency >= 1` case and a `frequency < 1` case (e.g. `0.25`, expect roughly one trigger attempt every 4 measures).
  3. **Ceiling behavior:** `swellFrequency: 24` and `swellFrequency: 16` (`= TICKS_PER_MEASURE`) produce statistically indistinguishable trigger rates — regression guard for the documented clamp (§1.3, §7).
  4. **Intensity no longer gates anything:** with `swellFrequency` nonzero and `pingVarianceAutomation` at its new floor (`0.01`), new swells still start (previously, values this low were impossible since `0` itself gated everything — now `0` isn't even a reachable `pingVarianceAutomation` value, so this test also implicitly guards the new `[0.01, 1]` floor via `audioStore.test.ts`/`audioRigConfig.test.ts`'s own range assertions).
  5. **Magnitude scaling, renamed parameter, same math:** identical assertion shape to `PING-VARIANCE-AUTOMATION.md` §5 item 3 (half-intensity halves a newly-created swell's `peakDelta`, clamp-before-scale ordering proven via Volume's floor or HPF's ceiling), just with the parameter/variable renamed `intensity` throughout the test file too.
  6. **Duration determinism:** at a fixed `swellDuration` (e.g. `10`), a newly-created swell's `risingMeasures + fallingMeasures` equals exactly `10` (allowing for the `Math.round`/`Math.max(1, ...)` rounding `pickSwellSplit` documents) — for the global pool, single-robot pool, and company-wide pool.
  7. **Duration split varies, bounded:** across many seeded draws at a fixed `swellDuration`, the rising/falling ratio varies (not always 50/50) but never exceeds the documented `[0.2, 0.8]` bound on either side.
  8. **Mix-target duration no longer doubles:** a `delay.wet`/`reverb.wet` swell's total duration at a given `swellDuration` matches every other target's total at the same `swellDuration` — regression guard proving `MIX_SWELL_DURATION_RANGE`'s old 2x treatment is gone, not just unreachable.
  9. **Forced return, re-keyed to `swellFrequency`:** identical assertion shape to `PING-VARIANCE-AUTOMATION.md` §5 items 4-8 (no audible jump on the forcing tick, lands exactly on `baseValue` after riding out `fallingMeasures`, already-falling swells are left alone, no double-forcing, forced returns aren't undone by a later nonzero value) — every occurrence of `automation`/`pingVarianceAutomation` in these tests' setup/assertions becomes `swellFrequency`.
  10. **Once-per-tick trigger, not once-per-measure:** a direct regression test that the old `lastRolledMeasure`-style "only the first tick of a whole measure can trigger" behavior is gone — construct a scenario (fixed noise/seed) where a trigger would only succeed on a non-first tick within a measure under the new per-tick rolling, and confirm it does.
* **`FleetParamsContent.test.tsx` (modified):** Pacing renders 4 leaves, not 2; Frequency/Duration sliders wire to `swellFrequency`/`swellDuration` (value + onChange, matching the existing Tempo test's assertion shape); the 2-row layout (`PACING_TOP_ROW_SCHEMA` containing Tempo+Frequency, `PACING_BOTTOM_ROW_SCHEMA` containing Duration+Intensity) is asserted via DOM structure, matching however this file already asserts `COMPRESSOR_TOP_ROW_SCHEMA`-style grouping elsewhere in the suite (if it does; otherwise, a new DOM-structure assertion in this file's own established style).
* **`AudioRigDrawer.test.tsx` (modified):** `AudioRigDrawer`'s own tests (slider renders, dragging calls `setPingVarianceAutomation`, disabled under `globalBypass`) are updated only for the `min: 1` schema change and the removed outer-wrapper/`SPEED_AUTOMATION_PANEL_SCHEMA` (§2.1) — the value/onChange/disabled wiring itself is unchanged.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass (deliberate deletions in item 10 above and the `MIX_SWELL_DURATION_RANGE`-era tests are the intentional exceptions to "existing tests keep passing unmodified").
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** load a fresh Attenuation Style, open Fleet Params > Pacing, confirm the 2x2 layout (Tempo/Frequency top row, Duration/Intensity bottom row) with Frequency/Duration seeded somewhere in `[2, 8]` and Intensity in `[10, 60]%`; drag Frequency to `0` and confirm the soundscape audibly stops wandering within a few measures (existing swells riding out their forced return); drag Frequency to its max and confirm swells visibly/audibly overlap far more densely than today's baseline; drag Duration to its min (`1`) and its max (`24`) and confirm swells noticeably shorten/lengthen; confirm the Frequency slider's displayed text reads "Off" at 0, something like "4.0/measure" above 1, and something like "every 4.0 measures" below 1.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** Current branch (`feature/automation-sliders`, per this session's git status) already names this exact feature — no rename or fresh branch needed.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `types/controls.ts` (+ test) — the new `formatValue` field, no behavior change yet; (2) `SliderLog.tsx` (+ test) — wiring `formatValue` in, still no real caller yet; (3) `audioStore.ts` + `globalAudioSeed.ts` (+ tests) — the two new fields/actions/seed functions and the carry-forward wiring, including the `PING_VARIANCE_AUTOMATION_SEED_RANGE` narrowing; (4) `audioRigConfig.ts` (+ test) — the 3 schema changes (`PING_VARIANCE_AUTOMATION_SCHEMA.min`, new `SWELL_FREQUENCY_SCHEMA`/`SWELL_DURATION_SCHEMA` + `formatSwellFrequency`); (5) `audioSwells.ts` (+ test) — the large one: trigger-mechanism rewrite, `pickSwellSplit`, the parameter renaming/re-keying, and every deletion (`SWELL_TRIGGER_CHANCE`, `pickPhaseMeasures`, the duration-range constants, `lastRolledMeasure`); (6) `AudioRigDrawer.tsx` + `FleetParamsContent.tsx` (+ tests) — the layout/wiring change, landing last since it's the one most likely to need iteration once (5) is visibly working.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, not left open):

- ~~Does the trigger mechanism need to change to make "N times per measure" literal, or is "capped at once/measure" acceptable?~~ **Resolved: true rate, per-tick evaluation** — intent doc, confirmed via interview.
- ~~Do Frequency/Duration apply per-pool or Rig-wide?~~ **Resolved: Rig-wide, one shared value for both pools, matching Intensity's existing scope** — intent doc.
- ~~Does Duration mean each phase's length, or the swell's total length?~~ **Resolved: total length, with the rising/falling split itself still randomized (up to ~20/80 skew)** — intent doc, refined during interview from the spec author's own initial (wrong) guess of "each phase gets the full Duration."
- ~~Do delay.wet/reverb.wet keep a longer duration than everything else?~~ **Resolved: no — one flat Duration for every target, `MIX_SWELL_DURATION_RANGE` deleted** — intent doc.
- ~~Is "load min/max" the Audio Load Budget performance system or the seeded-default-range convention?~~ **Resolved: the seeded-default-range convention (`PING_VARIANCE_AUTOMATION_SEED_RANGE`-style), unrelated to `audioBudgetSystem.ts`** — confirmed at the very start of Specify.

Resolved via direct user confirmation during Specify (this spec's own new decisions, not pre-existing in the intent doc):

- ~~Do `swellFrequency`/`swellDuration` reseed every Attenuation Style switch, or carry forward like `pingVarianceAutomation`?~~ **Resolved: carry forward, same sentinel-gated mechanism** (§1.5) — a consistency call made directly during Specify, not separately interviewed at the intent stage; flagged here in case the user wants the alternative on reflection.
- ~~Does Frequency's "x/measure vs every x measures" phrasing need a new display capability, or is a plain number acceptable?~~ **Resolved: yes, add `SliderLogSchema.formatValue`** (§1.6) — confirmed directly; this is new UI-primitive surface area the source intent doc didn't anticipate needing.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **Lore labels for the two new schemas (`SWELL_FREQUENCY_SCHEMA`/`SWELL_DURATION_SCHEMA`) are first-pass placeholders** ("PING RECURRENCE"/"PING SUSTAIN") — not yet confirmed with the user, same "confirm during manual check" caveat `PING-VARIANCE-AUTOMATION.md`'s own `LFO_DRIFT_GROUPS` labels got. `PING_VARIANCE_AUTOMATION_SCHEMA.humanLabel` also changes from `'Automatic Effects'` to `'Intensity'` in §4's sketch — matching the intent doc's own naming throughout this spec — but that rename itself wasn't separately confirmed as a human-facing label change; Plan/Implement should treat it as a placeholder pending the same manual check.
2. **`navTreeConfig.ts`'s Pacing subtree (currently 2 leaves: `fleetParams.pacing.tempo`, `fleetParams.pacing.automaticEffects`) needs the same 2 new leaf entries `FleetParamsContent.tsx` gains** (§4), plus whatever `useNavTree.ts`'s `FLEET_PARAMS_GROUP_FIRST_LEAF` ordering assumes about Pacing's leaf count/order — not exhaustively traced in this spec; Plan/Tasks should grep every place `'fleetParams.pacing.tempo'`/`'fleetParams.pacing.automaticEffects'` appears (`navTreeConfig.ts`, `navTreeConfig.test.ts`, `useNavTree.test.ts`, `NavTreeNode.test.tsx`, `NavTree.test.tsx`) before treating the tree-side change as done.
3. **The exact tolerance band for the statistical rate test** (§5 item 2) — `±15%` is this spec's own placeholder, not confirmed with the user; Plan/Implement should pick a value that's tight enough to catch a real regression but loose enough not to flake given `getSeededVal`'s simplex-noise-based randomness isn't a true independent Bernoulli process (successive per-tick draws from the same noise map are spatially correlated, not i.i.d. — the "expected count" framing in §1.3 is already an acknowledged approximation for this reason too).
4. **`SelectedFleetParamsEffect`'s type (in `uiStore.ts`) must grow two new literal members** (`'swellFrequency'`, `'swellDuration'`) to match the new `effectKey` values used in §4's `FLEET_PARAMS_GROUPS`/`renderLeaf` sketch — not spelled out in §2's file list since `uiStore.ts` wasn't independently confirmed as needing a test-file change; Plan/Tasks should verify and add it to §2 if so.
