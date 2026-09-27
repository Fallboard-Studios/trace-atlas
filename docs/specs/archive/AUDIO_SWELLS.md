# Phase Spec: Seeded Audio Swells

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/audio-swells.md](../intent/audio-swells.md) (confirmed via `/interview-me`, 2026-08-29). Not yet slotted into [docs/todo/roadmap.md](../todo/roadmap.md) — this is new scope, discovered live during the interview, not a numbered phase; Plan/Tasks should propose where it lands (a new out-of-sequence entry, following the `## 10.1`/`## 10.2` precedent). Prior art this spec reuses directly rather than re-deriving: [docs/specs/LFO_DRIFT.md](LFO_DRIFT.md)/[docs/specs/LFO_DRIFT_GROUPS.md](LFO_DRIFT_GROUPS.md) (the deterministic-seeding and bounded-swing conventions), [docs/COMPANIES.md](../COMPANIES.md)/`src/systems/robotOptionsActions.ts` (the shared `apply*` write-path functions this spec calls directly), `src/systems/robotSystems.ts` (the `subscribeToMeasure`/lifecycle start-stop shape this spec's own module mirrors).

---

## 1. Overview & Claude Explanation

A "swell" is a rare, self-reversing event: one parameter ramps up from its current value, holds, ramps back down, and lands **exactly** back where it started — never a net change. Two independent pools exist, each with its own eligible-target set and its own concurrency cap of 5:

- **Global pool** — 9 targets: the 7 already LFO-eligible today (`eq3.low`/`mid`/`high`, `lpf.frequency`/`Q`, `hpf.frequency`/`Q`) plus 2 new ones this spec adds nowhere near `lfoEngine.ts`: `delay.wet` and `reverb.wet`.
- **Robot pool** — 17 attributes × 12 robots: the 13 already LFO-eligible robot targets (`volume`, and each of 3 layers' `gain`/`detune`/`phase`/`pulseWidth`) plus the 4 ADSR sub-fields (`attack`/`decay`/`sustain`/`release`), independently eligible, never treated as one atomic envelope move. A small chance turns a robot-pool pick into a **company-wide** swell — the same attribute, in lock-step, across every eligible robot in a randomly-chosen `Company` — see §1.5. A company-wide swell still counts as exactly one swell against the robot pool's 5-cap.

A swell has exactly two phases, rising then falling — no hold/plateau — and every attribute's direction, magnitude, and duration follow one of a small set of concrete, attribute-specific rules (§1.5), confirmed via a follow-up `/interview-me` pass (2026-08-29) that superseded this spec's original placeholder (formerly §7, items 1 and 3).

This is **not** an extension of `lfoEngine.ts`/`lfoDrift.ts` — no `Tone.LFO`, no `Signal`/`Param` connection, no `Signal.override` concern at all. A swell is a discrete, `BeatClock`-ticked write sequence, mechanically closer to `robotSystems.ts`'s per-measure lifecycle tick than to anything in the LFO engine. Every write goes through the exact same call a human editing a slider by hand would make — `audioStore.setGlobalAudio()` for global targets, the `apply*` functions in `robotOptionsActions.ts` for robot targets — so the relevant slider visibly crawls on its own while a swell is active on it, for free, with no new UI code.

### 1.1 Why this can't reuse `lfoEngine.ts`, concretely

`lfoEngine.ts`'s entire design assumes a live, continuously-oscillating `Tone.LFO` wired directly into a `Signal`/`Param` on the Web Audio graph — that's what the `Signal.override` bug and its fix (`docs/AUDIO_SYSTEM.md`'s "LFO Modulation" section) are about, and it's why LFO'd sliders in this app never visibly move (the modulation never touches Zustand). A swell needs the opposite of both properties: discrete, finite, and visible in the store. Grafting this onto `lfoEngine.ts` would mean either (a) giving every LFO target a second, incompatible write path, or (b) building a fake `Tone.LFO`-shaped wrapper around a one-shot ramp — both are more machinery than a from-scratch, `BeatClock`-ticked module that calls the same functions a human already calls.

### 1.2 New target vocabulary — deliberately not `LfoTargetId`

```typescript
// src/types/audioSwell.ts (new file)
import type { GlobalLfoTargetId, RobotLfoTargetId } from './lfo';

/** The 9 global-chain swell targets: every GlobalLfoTargetId (7) plus the 2
 *  new ones this feature adds — delay.wet and reverb.wet never got an
 *  lfoTarget (docs/AUDIO_SYSTEM.md's LFO Modulation section, commit
 *  508bd93) and still don't; this type is intentionally NOT GlobalLfoTargetId
 *  itself, to keep that union's own meaning ("has a real lfoEngine target")
 *  unchanged. */
export type SwellGlobalTargetId = GlobalLfoTargetId | 'delay.wet' | 'reverb.wet';

export const SWELL_GLOBAL_TARGET_IDS: readonly SwellGlobalTargetId[] = [
  'eq3.low', 'eq3.mid', 'eq3.high',
  'lpf.frequency', 'lpf.Q',
  'hpf.frequency', 'hpf.Q',
  'delay.wet', 'reverb.wet',
];

/** The 17 robot-scoped swell attributes: every RobotLfoTargetId (13,
 *  layerN.phase included — see §1.3 for why phase is fine here even though
 *  it's excluded from LFO/Drift) plus the 4 ADSR sub-fields, independently
 *  eligible (confirmed via /interview-me — never one atomic "envelope" move). */
export type SwellRobotAttributeId = RobotLfoTargetId | 'adsr.attack' | 'adsr.decay' | 'adsr.sustain' | 'adsr.release';

export const SWELL_ROBOT_ATTRIBUTE_IDS: readonly SwellRobotAttributeId[] = [
  'volume',
  'layer0.gain', 'layer0.detune', 'layer0.phase', 'layer0.pulseWidth',
  'layer1.gain', 'layer1.detune', 'layer1.phase', 'layer1.pulseWidth',
  'layer2.gain', 'layer2.detune', 'layer2.phase', 'layer2.pulseWidth',
  'adsr.attack', 'adsr.decay', 'adsr.sustain', 'adsr.release',
];
```

### 1.3 `layerN.phase` is swell-eligible, unlike LFO/Drift — a real divergence, not an oversight

`docs/AUDIO_SYSTEM.md` excludes `layerN.phase` from live LFO connection because `Tone.Oscillator.phase` has no live `Signal`/`Param` to `.connect()` a modulator to — LFO's fallback is a `scheduleRepeat('16n', …)` manual poll. A swell never connects anything; it just calls `applyLayersContinuous(robot, localeId, layers)` on a `BeatClock` tick with a new plain number, exactly what `SignatureArrayDrawer.tsx`'s own Phase slider already does by hand. Nothing about phase is special for this mechanism, so it stays in the pool. Called out explicitly so Plan/Implement doesn't silently inherit LFO's phase exclusion by copying `ROBOT_LFO_TARGET_IDS` without noticing it's the wrong list to copy from.

### 1.4 Determinism: one noise-map source, two independent per-measure draws

Every trigger/selection/timing decision is a `getSeededVal(noiseMap, dataId, offset, min, max)` draw against the **Attenuation Style** noise map (`getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName)`, `src/utils/noiseMaps.ts`) — the same source `generateGlobalAudioSettings`/`generateGlobalLfoSettings` already sample (`src/utils/globalAudioSeed.ts`), confirmed AS-only (not locale/coordinate-seeded) during interview. `Math.random()` appears nowhere in this feature.

The `offset` argument is the critical piece: `getSeededVal` is a 2D noise sample (`dataId` hashes to an x-coordinate, `offset` is the y-coordinate), so passing a different `offset` each measure yields a fresh, deterministic draw per measure without needing per-measure `dataId` string interpolation. `getCurrentMeasure()` (`beatClock.ts`) is the right value to use — it's the real, **unwrapped**, ever-increasing measure count since `AudioEngine.start()`, not the `% 96`-wrapped value `subscribeToMeasure`'s own callback argument carries. `robotSystems.ts`'s `startRobotLifecycle` already documents exactly this trap in its own comment (measure-wrap would make a hold "permanently unreachable"); this spec reuses that same reasoning rather than re-deriving it — a swell using the wrapped measure would replay an identical trigger/no-trigger decision every 96 measures (once per in-fiction day), which is wrong for a feature explicitly meant to feel like a rare, non-cyclical event.

### 1.5 Direction, magnitude & duration — attribute-specific rules, and the company-wide variant

Confirmed via a follow-up `/interview-me` pass (2026-08-29), replacing this spec's original "first-pass, unconfirmed" placeholder wholesale (formerly §7 items 1 and 3). Nothing here is a uniform, one-size-fits-all formula — every rule below is attribute-specific by design.

**Default rule** (every swell-eligible attribute except the two exceptions below):

- **Direction:** picked so the swell can cover **at least 50% of the attribute's full range** — up if the current value is at or below the range's midpoint, down if at or above it, either direction if exactly at the midpoint (seeded coin-flip tie-break).
- **Magnitude:** the peak is drawn — via `getSeededVal` — somewhere between that 50%-of-range floor and the true attribute edge (the min or max, matching direction). E.g. a field at 33% of its range swells up to somewhere in `[83%, 100%]`; a field at 70% swells down to somewhere in `[0%, 20%]`.
- **Shape:** two phases only, rising then falling — no hold/plateau.
- **Duration:** the rising-phase and falling-phase measure counts are each drawn **independently** (not mirrored) from **3–6 measures**, with a hard floor of **1 measure** on any phase, full stop (no attribute's duration can ever go below this, including the exceptions below) — a guard against an instantaneous, non-ramped jump.

**Exceptions:**

- **`delay.wet` / `reverb.wet`** — same direction/magnitude rule as the default; duration widens to **6–12 measures** per phase (both the min and the max widen, still drawn independently per phase).
- **Robot `volume`** — same direction/magnitude rule as the default, EXCEPT a downward swell's peak is clamped so it never goes below **50%** of `volume`'s own range. This is a pure clamp applied to the final peak value, not a gate on eligibility or on which direction gets picked — Volume still picks its direction the normal way; a downward pick simply cannot land below the clamp, even if that makes its actual swing smaller than the usual 50%-of-range minimum.
- **Robot Ping Controls** (`rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `octaveRange`) — never eligible. This is not a new exclusion to implement: the 17-attribute robot pool (§1.2) never included these fields in the first place, so this is already true by construction.

**General eligibility — a parent toggle gates its children, for both single-robot and company-wide picks:** a robot attribute is only pickable if its own field, and anything it structurally depends on, is actually live. Concretely: `layerN.gain`/`detune`/`phase`/`pulseWidth` require that layer's own `OscillatorLayer.active === true` (`src/types/layeredAudio.ts`); `volume` and the four ADSR fields have no such parent toggle and are always structurally available. This generalizes the same "a disabled effect's params aren't eligible" rule the global pool already has (§1, intent doc).

**Company-wide swell** — a *variant outcome* of the existing per-measure robot-pool roll, not a separate pool, its own trigger cadence, or its own concurrency cap:

- When the robot pool's per-measure roll succeeds, a second, small seeded chance (a new tunable constant, e.g. `SWELL_COMPANY_CHANCE` — unconfirmed exact value, first-pass like `SWELL_TRIGGER_CHANCE`) decides whether this pick becomes company-wide instead of single-robot.
- If company-wide: one `Company` (`Locale.companies`, `src/types/Company.ts` — `useLocaleStore.getState().getLocaleById(localeId)?.companies`) is picked via a seeded draw, and one `SwellRobotAttributeId` is picked via a seeded draw — the same attribute for the whole company.
- Every robot in `company.robotIds` participates **except** one skipped by the general eligibility rule above (e.g. the attribute's parent layer is inactive for that particular robot). If that leaves zero eligible robots, no swell starts this tick (not a re-roll, not a fallback to a different company/attribute).
- **Direction and duration are shared and drawn once** for the whole company — every participating robot ramps up (or down) together and starts/ends on the exact same measures (lock-step).
- **Magnitude is still per-robot** — each robot's own peak comes from its own current value via the default direction/magnitude rule above (including Volume's downward clamp, if applicable), independently of every other robot in the company. Because duration is shared but each robot's own distance-to-travel differs, a robot with less room simply ramps at a proportionally slower rate — no separate "rate" concept needs implementing; it falls straight out of interpolating each robot's own `[baseValue, baseValue + peakDelta]` over the one shared `[risingMeasures, fallingMeasures]`.
- Counts as **exactly one** swell against the robot pool's 5-cap, regardless of how many robots are in the company.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── audioSwell.ts              # NEW — SwellGlobalTargetId/SwellRobotAttributeId + both ID
│                                     #   arrays (§1.2), plus the ActiveSwell runtime-state shape (§4)
├── data/
│   ├── audioSwellRanges.ts        # NEW — ROBOT_SWELL_FIELD_RANGE (§4): all 17 robot-only swing
│   │                                 #   bounds (volume, layerN.gain/detune/phase/pulseWidth, the 4
│   │                                 #   ADSR fields) — a full, exhaustive Record<SwellRobotAttributeId, ...>,
│   │                                 #   sharing zero keys with GLOBAL_AUDIO_SEED_RANGES (a separate,
│   │                                 #   global-chain-only table) — UI/store-facing ranges, NOT lfoEngine.ts's
│   │                                 #   internal ROBOT_LFO_FIELD_RANGE (§4.1 — volume differs:
│   │                                 #   0-1 here vs. lfoEngine's engine-internal 0-2)
│   └── audioSwellRanges.test.ts   # NEW
├── systems/
│   ├── audioSwells.ts             # NEW — the whole mechanism: startAudioSwells/stopAudioSwells,
│   │                                 #   the per-measure tick, trigger/selection/ramp math. See §4.
│   └── audioSwells.test.ts        # NEW
│   └── worldTransition.ts         # MODIFIED — initializeLocale() gains
│                                     #   stopAudioSwells(); startAudioSwells(localeId); alongside
│                                     #   its existing stopRobotLifecycle()/startRobotLifecycle() pair
│   └── worldTransition.test.ts    # MODIFIED
└── engine/
    └── AudioEngine.ts             # NOT modified — no new AudioEngine.* methods; swells write
                                      #   through audioStore.setGlobalAudio (which already calls
                                      #   AudioEngine.setGlobal*) and robotOptionsActions.ts's apply*
                                      #   (which already call AudioEngine.updateVoice*/updateRobotMasterVolume)

docs/
└── AUDIO_SYSTEM.md   # MODIFIED — new top-level section (sibling to "LFO Modulation", not nested
                        #   inside it) documenting this mechanism, explicit that it is independent
                        #   of lfoEngine.ts
```

**Explicitly not touched, and why:** `src/engine/lfoEngine.ts`, `src/engine/lfoDrift.ts`, `src/engine/lfoShared.ts`, `src/types/lfo.ts` — this feature adds zero LFO targets, zero drift groups, no `Tone.LFO`. `src/data/audioRigConfig.ts`/`src/data/robotOptionsConfig.ts` — no new UI schema, no new control; existing sliders are reused as-is (per intent doc, no new UI). `src/components/ui/controls/*` — no primitive changes.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No `Tone` import anywhere in this feature's own files** (CLAUDE.md's "no synths in components," generalized) — `audioSwells.ts` never imports `tone` or touches an `AudioContext`/`Signal`/`Param` directly; every audible effect happens through `audioStore.setGlobalAudio`/`robotOptionsActions.ts`'s `apply*`, which already own that boundary.
* **Scheduling must be `BeatClock`-driven, never a raw timer.** `subscribeToMeasure` (`beatClock.ts`) is the only entry point — no `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask` anywhere in this feature, per CLAUDE.md's non-negotiable rule.
* **No `Math.random()` anywhere in trigger, selection, or timing logic.** Every random-shaped decision is a `getSeededVal(noiseMap, dataId, offset, min, max)` draw against the Attenuation Style noise map, offset by `getCurrentMeasure()` (unwrapped) — see §1.4 and §4.
* **A disabled/bypassed global effect is never eligible for a *new* swell** (confirmed via interview). If an effect's `enabled` flag flips to `false` while one of its params is mid-swell, that swell is cancelled immediately and the param snaps back to its captured base value in the same tick (§7 flags this as a first-pass behavior choice, not exhaustively interviewed) — better than a swell silently continuing to write into a bypassed node's now-irrelevant `wet`/param.
* **Two independent pools, two independent concurrency caps of 5 — never a shared budget.** A full global pool never blocks a robot swell from starting, and vice versa.
* **A swell always returns to *exactly* its pre-swell base value — never a seeded/random new resting value.** The base is captured once, at swell start, from whatever the field's live value is at that moment (so a swell starting on a field a human has since hand-edited via the UI mid-session still ends where the human left it, not where the seed originally placed it). For a company-wide swell this applies per-robot — every participating robot captures and returns to its own base value, not a shared one.
* **Robot selection spans the whole roster, not per-robot** — the 5-cap for the robot pool counts (robot, attribute) pairs across all 12 robots combined, never per-robot. **A company-wide swell (§1.5) still counts as exactly one entry against this same 5-cap**, regardless of how many robots it touches.
* **Direction, magnitude, and duration are attribute-specific, not one uniform formula** — see §1.5 for the concrete default rule and the `delay.wet`/`reverb.wet` and robot `volume` exceptions. Every phase (rising or falling, for any attribute) has a hard floor of 1 measure.
* **A robot attribute is only eligible if its structural parent is live** — e.g. `layerN.*` requires that layer's own `active === true` (`OscillatorLayer`, `src/types/layeredAudio.ts`). Applies to single-robot picks and to per-robot filtering within a company-wide pick alike (§1.5).
* **Global writes must go through `useAudioStore.getState().setGlobalAudio(effect, partial)`, never `AudioEngine.setGlobal*` directly** — `setGlobalAudio` is the one function that updates both the store (so the slider moves) and the live engine node in one call; calling `AudioEngine.setGlobal*` directly would move the sound without moving the slider, defeating the entire "existing sliders double as the indicator" premise.
* **Robot writes must go through `robotOptionsActions.ts`'s existing `apply*` functions** (`applyVolume`, `applyLayersContinuous`, `applyAdsr`) **— never a new bespoke `updateRobot`/`AudioEngine.updateVoice*` pairing.** These functions already do exactly what a swell tick needs (store write + live engine push); duplicating that logic in `audioSwells.ts` would be a second, driftable copy of behavior Companies (Roadmap Phase 10) already centralized for this exact reason.
* **No changes to `docs/COMPONENT_LIBRARY.md`** — no UI primitive is touched.

---

## 4. Code Style & Architecture Conventions

**`src/types/audioSwell.ts`** (new — target vocabulary from §1.2, plus runtime state shape):

```typescript
export type SwellPool = 'global' | 'robot';

/** Two phases only — no hold/plateau (§1.5, confirmed via interview). */
export type SwellPhase = 'rising' | 'falling';

/** One participating robot's own share of a 'robot'-pool swell — a single-robot
 *  swell has exactly one entry; a company-wide swell (§1.5) has one per
 *  eligible robot in the company. Every member shares the parent ActiveSwell's
 *  phase/timing, but keeps its own base/peak — a company-wide swell is
 *  lock-step in *time*, not in magnitude. */
export interface SwellMember {
  robotId: string;
  /** The field's live value at swell start — what this member must land back on exactly. */
  baseValue: number;
  /** Signed offset from baseValue at the swell's peak (base + peakDelta = the top of the swell). */
  peakDelta: number;
}

/** One in-flight swell's complete runtime state — lives in a plain module-scope
 *  Map in audioSwells.ts, never in Zustand (CLAUDE.md: runtime-only state stays
 *  out of state; only each TICK's resulting field value reaches the store, via
 *  the normal apply*/setGlobalAudio call, same as any other edit). */
export interface ActiveSwell {
  pool: SwellPool;
  /** SwellGlobalTargetId for pool 'global'; undefined for pool 'robot'. */
  globalTarget?: SwellGlobalTargetId;
  /** pool 'global' only — the field's live value at swell start / peak offset. Mirrors
   *  SwellMember's baseValue/peakDelta shape but singular, since a global swell has
   *  exactly one target and no per-robot concept. */
  baseValue?: number;
  peakDelta?: number;
  /** pool 'robot' only — the attribute every member shares. */
  robotAttribute?: SwellRobotAttributeId;
  /** pool 'robot' only. Exactly one entry for a single-robot swell; 2+ for a
   *  company-wide swell (§1.5). */
  members?: SwellMember[];
  /** Set only for a company-wide swell — which Company this pick came from, for
   *  bookkeeping/tests; not used for further lookups once `members` is built. */
  companyId?: string;
  phase: SwellPhase;
  /** Measure this swell started on (getCurrentMeasure(), unwrapped) — elapsed = current - startMeasure. */
  startMeasure: number;
  risingMeasures: number;
  fallingMeasures: number;
}
```

**`src/data/audioSwellRanges.ts`** (new — robot-only bounds; global targets reuse `GLOBAL_AUDIO_SEED_RANGES` directly, no new table needed there):

```typescript
import type { SwellRobotAttributeId } from '@/types/audioSwell';

/**
 * UI/store-facing swing bounds for every robot swell attribute — matches each
 * field's real schema range in robotOptionsConfig.ts exactly (NOT
 * lfoEngine.ts's ROBOT_LFO_FIELD_RANGE, which is a different, engine-internal
 * range for the same-named fields: e.g. 'volume' there is 0-2, the fixed
 * Tone.Gain(1) mix-stage node's own operating range; here it's 0-1, the
 * actual masterVolume fraction applyVolume/updateRobot store and the UI
 * slider displays as 0-100%. Reusing the LFO table directly would silently
 * bound a Volume swell against the wrong domain.)
 */
export const ROBOT_SWELL_FIELD_RANGE: Record<SwellRobotAttributeId, { min: number; max: number }> = {
  volume: { min: 0, max: 1 },
  'layer0.gain': { min: 0, max: 2 }, 'layer1.gain': { min: 0, max: 2 }, 'layer2.gain': { min: 0, max: 2 },
  'layer0.detune': { min: -50, max: 50 }, 'layer1.detune': { min: -50, max: 50 }, 'layer2.detune': { min: -50, max: 50 },
  'layer0.phase': { min: 0, max: 360 }, 'layer1.phase': { min: 0, max: 360 }, 'layer2.phase': { min: 0, max: 360 },
  'layer0.pulseWidth': { min: 0, max: 1 }, 'layer1.pulseWidth': { min: 0, max: 1 }, 'layer2.pulseWidth': { min: 0, max: 1 },
  'adsr.attack': { min: 0, max: 10 }, 'adsr.decay': { min: 0, max: 10 },
  'adsr.sustain': { min: 0, max: 1 }, 'adsr.release': { min: 0, max: 10 },
};
```

**`src/systems/audioSwells.ts`** (new — the whole mechanism, mirroring `robotSystems.ts`'s lifecycle shape):

```typescript
import { subscribeToMeasure, getCurrentMeasure } from '@/engine/beatClock';
import { getSeededVal } from '@/utils/getSeededVal';
import { getAttenuationStyleNoiseMap } from '@/utils/noiseMaps';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { applyVolume, applyLayersContinuous, applyAdsr } from './robotOptionsActions';
import { GLOBAL_AUDIO_SEED_RANGES } from '@/data/globalAudioSeedRanges';
import { ROBOT_SWELL_FIELD_RANGE } from '@/data/audioSwellRanges';
import { SWELL_GLOBAL_TARGET_IDS, SWELL_ROBOT_ATTRIBUTE_IDS, type ActiveSwell, type SwellMember } from '@/types/audioSwell';

const MAX_CONCURRENT_SWELLS_PER_POOL = 5;
/** Per-measure probability a pool rolls a new swell, calibrated so an average
 *  gap of ~3-4 measures emerges (confirmed via interview) — NOT a fixed
 *  "every N measures" timer; some gaps will be shorter, some much longer,
 *  same "seeded, not clockwork" character every other probability-threshold
 *  field in this app already has (DELAY_ENABLED_THRESHOLD, LFO_ACTIVE_THRESHOLD). */
const SWELL_TRIGGER_CHANCE = 0.28; // ≈ 1 / 3.5

/** Second, small chance — evaluated only when the robot pool's own trigger
 *  above already succeeded — that this pick becomes company-wide (§1.5)
 *  instead of single-robot. Unconfirmed exact value, same first-pass caveat
 *  as SWELL_TRIGGER_CHANCE (§7). */
const SWELL_COMPANY_CHANCE = 0.15; // placeholder — needs a manual audible pass

/** Rising-phase and falling-phase measure counts are drawn INDEPENDENTLY from
 *  each other (never mirrored) within whichever range matches the attribute
 *  (§1.5) — every attribute not in DELAY_REVERB_MIX_ATTRIBUTES uses DEFAULT.
 *  1 measure is a hard floor on any phase for any attribute, full stop. */
const DEFAULT_SWELL_DURATION_RANGE = { min: 3, max: 6 };
const MIX_SWELL_DURATION_RANGE = { min: 6, max: 12 }; // delay.wet / reverb.wet only
const DELAY_REVERB_MIX_TARGETS: readonly SwellGlobalTargetId[] = ['delay.wet', 'reverb.wet'];

/** Every direction/magnitude draw covers AT LEAST 50% of the attribute's full
 *  range and AT MOST the true edge (§1.5) — this is the shared floor fraction
 *  every attribute uses; only the direction pick and (for volume) an extra
 *  clamp differ per attribute. */
const SWELL_MIN_RANGE_FRACTION = 0.5;
/** Robot volume's own downward-swell floor — a pure clamp on the final peak,
 *  never a gate on direction-picking (§1.5). Expressed in volume's own 0-1
 *  domain (ROBOT_SWELL_FIELD_RANGE.volume), matching applyVolume's pct/100
 *  convention. */
const VOLUME_SWELL_DOWNWARD_FLOOR = 0.5;

let unsubscribe: (() => void) | null = null;
/** Keyed by a stable target identity: the bare global target id for pool
 *  'global'; `${robotId}:${attribute}` per member for pool 'robot' (a
 *  company-wide swell's members all key off the same underlying Map, one
 *  entry per participating robot, so per-robot exclusion checks — "already
 *  mid-swell, skip" — work identically whether the swell that put them there
 *  was single-robot or company-wide). */
const activeSwells = new Map<string, ActiveSwell>();

export function startAudioSwells(localeId: string): void {
  if (unsubscribe !== null) return; // already running — same idempotent guard startRobotLifecycle uses
  unsubscribe = subscribeToMeasure(() => tickAudioSwells(localeId, getCurrentMeasure()));
}

export function stopAudioSwells(): void {
  unsubscribe?.();
  unsubscribe = null;
  activeSwells.clear(); // no partial swells survive a locale/AS change — see §7
}

function tickAudioSwells(localeId: string, measure: number): void {
  const as = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!as) return;
  const noiseMap = getAttenuationStyleNoiseMap(as.id, as.name);

  advanceActiveSwells(localeId, measure);
  maybeStartSwell('global', localeId, noiseMap, measure);
  maybeStartSwell('robot', localeId, noiseMap, measure);
}
```

`advanceActiveSwells` recomputes every in-flight swell's current interpolated value from its phase/elapsed-measures. For pool `'global'` it writes the one value via `useAudioStore.getState().setGlobalAudio(...)`; for pool `'robot'` it iterates `members` and writes each one's own interpolated value via the matching `apply*`, so a company-wide swell's N robots each get their own call per tick, sharing only `phase`/`startMeasure`/`risingMeasures`/`fallingMeasures`. A swell is removed from `activeSwells` (every key it's stored under — see the Map's own doc comment above; deduplicate by object identity, not by key count, so a company-wide swell is only counted/removed once) once `fallingMeasures` completes, at which point every member's live value has been written back to exactly its own captured `baseValue`.

`maybeStartSwell('robot', ...)` draws one `getSeededVal(noiseMap, 'audioSwell.trigger.robot', measure, 0, 1)` per tick; below `SWELL_TRIGGER_CHANCE` **and** under the pool's 5-cap (counted by unique `ActiveSwell` objects, so an in-flight company-wide swell still only costs 1), it draws a second `getSeededVal(..., 'audioSwell.company', measure, 0, 1)` against `SWELL_COMPANY_CHANCE` to decide single-robot vs. company-wide:

- **Single-robot:** picks one (robot, attribute) pair from the 17×12 pool (excluding anything already in `activeSwells` and anything failing the parent-toggle eligibility check, §1.5/§3), computes direction + peak against `ROBOT_SWELL_FIELD_RANGE`/`SWELL_MIN_RANGE_FRACTION` (clamped further by `VOLUME_SWELL_DOWNWARD_FLOOR` for `'volume'`), and builds a one-`SwellMember` `ActiveSwell`.
- **Company-wide:** picks one `Company` from `useLocaleStore.getState().getLocaleById(localeId)?.companies` and one `SwellRobotAttributeId`, both via seeded draws; filters `company.robotIds` down to those passing the eligibility check for that attribute (aborts with no swell started if that leaves zero); draws direction and `risingMeasures`/`fallingMeasures` **once**, shared by every member; then builds one `SwellMember` per eligible robot, each computing its own `baseValue`/`peakDelta` independently (same direction, same formula, own current value) — see §1.5's "slower rate, not less time" framing.

`maybeStartSwell('global', ...)` is unchanged in shape from single-robot's — direction + peak against `GLOBAL_AUDIO_SEED_RANGES`, `risingMeasures`/`fallingMeasures` drawn from `MIX_SWELL_DURATION_RANGE` for `delay.wet`/`reverb.wet` (`DELAY_REVERB_MIX_TARGETS`) and `DEFAULT_SWELL_DURATION_RANGE` for the other 7 targets — but it has no company-wide branch; only the robot pool does.

The direction+peak draw itself (used by both pools) is a small, attribute-agnostic helper: given a field's `{min, max}` and its current value, compute the range's midpoint to pick a direction (whichever side the current value is closer to *the opposite* edge of — i.e. up if `current <= midpoint`, else down; a seeded coin-flip exactly at the midpoint), then draw the peak via `getSeededVal(..., min: valueAtFiftyPercentPoint, max: trueEdge)` in that direction. This is a **new, from-scratch formula** — not `centeredSwingFromRange` (that function computes a *symmetric, bounded* swing around a base value with no directionality or minimum-swing guarantee, which is the wrong shape for "must cover at least half the range, in a specific direction, up to the true edge"). `lfoShared.ts` is not imported by this feature (§1.1, §2).

* **Naming Conventions:** `startAudioSwells`/`stopAudioSwells`/`tickAudioSwells` deliberately mirror `startRobotLifecycle`/`stopRobotLifecycle`/`tickRobotLifecycle`'s exact naming shape (`robotSystems.ts`) — same lifecycle pattern, same module organization precedent (`src/systems/`, not `src/engine/`, since this module never touches `Tone` directly).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

**`src/systems/worldTransition.ts`** (diff — `initializeLocale`, alongside its existing robot-lifecycle restart):

```typescript
  stopRobotLifecycle();
  startRobotLifecycle(localeId);
  stopAudioSwells();
  startAudioSwells(localeId);
```

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest.
* **Test File Location:** Colocate, matching every file in §2.
* **`audioSwellRanges.test.ts` (new):** `ROBOT_SWELL_FIELD_RANGE` has exactly the 17 `SwellRobotAttributeId` keys (the full set — assert it exactly; this table shares zero keys with `GLOBAL_AUDIO_SEED_RANGES`, which covers global-chain fields only), each a valid `{min, max}` with `min < max`; `volume`'s range is `{0, 1}`, explicitly asserted distinct from `lfoEngine.ts`'s `ROBOT_LFO_FIELD_RANGE.volume` (`{0, 2}`) — the regression this table exists to prevent (§4.1).
* **`audioSwells.test.ts` (new) — the bulk of new coverage:**
  1. **Determinism:** two calls to `tickAudioSwells` with the same `localeId`/measure/AS-seed produce the identical trigger/no-trigger decision and, when triggered, the identical target/direction/duration/peakDelta (and, for a company-wide pick, the identical company/eligible-member set) — no `Math.random()` anywhere in the module (a direct source-scan assertion, matching the codebase's existing zero-`Math.random()` invariant).
  2. **Concurrency caps enforced independently per pool:** with the global pool already at 5 active swells, a tick that would start a 6th global swell doesn't, while a robot swell can still start in the same tick (and vice versa). A robot pool already at 5 active swells, one of which is company-wide, is still counted as 5 (not 5 + extra members) — a 6th doesn't start.
  3. **Global eligibility:** a disabled (`enabled: false`) effect's targets are never selected for a new swell; an effect that becomes disabled while one of its params is mid-swell has that swell cancelled and the param snapped back to its captured base value on the very next tick.
  4. **Return-to-base guarantee:** for both pools, once a swell's `fallingMeasures` completes, every member's live field value equals that member's own captured `baseValue` exactly (not approximately/asymptotically) and the swell is fully removed from `activeSwells` (every key it was stored under).
  5. **Robot pool spans the roster:** with 5 active robot swells already spread across 3 different robots, a 6th doesn't start regardless of which robot/attribute it would target.
  6. **Write-path correctness:** a global swell tick calls `useAudioStore.getState().setGlobalAudio` (spy) with the swelling effect/field, never `AudioEngine.setGlobal*` directly; a robot swell tick calls the matching `apply*` (`applyVolume`/`applyLayersContinuous`/`applyAdsr`, spied) once per member, never a bare `updateRobot`/`AudioEngine.updateVoice*` pairing.
  7. **`layerN.phase` is a reachable robot swell target** (regression guard for §1.3 — confirms the pool wasn't built by silently reusing `ROBOT_LFO_TARGET_IDS`'s exclusions).
  8. **`stopAudioSwells` clears all in-flight state** — no swell survives a locale/AS change; a subsequent `startAudioSwells` begins from zero active swells, not resumed ones.
  9. **Idempotent start/stop** — calling `startAudioSwells` twice in a row doesn't double-subscribe (mirrors `startRobotLifecycle`'s own existing guard test).
  10. **No hold phase:** an `ActiveSwell`'s `phase` only ever takes the values `'rising'`/`'falling'`; once `risingMeasures` elapses, the very next tick is already interpolating `'falling'` — no tick sits at the unmodified peak value.
  11. **Duration ranges are attribute-specific and independently drawn per phase:** `risingMeasures`/`fallingMeasures` each fall in `[3, 6]` for every attribute except `delay.wet`/`reverb.wet`, which each fall in `[6, 12]`; across many seeded draws, rising and falling measure counts are not always equal (proves they're independent, not mirrored). Every phase, for every attribute, is never less than 1 measure.
  12. **Direction/magnitude rule, default attributes:** a field seeded at 33% of its range swells up, landing in `[83%, 100%]`; a field at 70% swells down, landing in `[0%, 20%]`; a field exactly at 50% can land either direction (seeded, but both directions are reachable across enough draws).
  13. **Robot Volume's downward clamp:** a Volume swell picked to go downward never lands below 50% of Volume's own range, even from a starting value where the default rule alone would allow a lower peak.
  14. **Company-wide swell mechanics:** when a company-wide pick fires (force the `SWELL_COMPANY_CHANCE` draw via the noise-map seed in the test), (a) every eligible robot in the company gets a `SwellMember` sharing the same `robotAttribute`/direction/`risingMeasures`/`fallingMeasures`; (b) a robot whose attribute's parent is disabled (e.g. an inactive `OscillatorLayer`) is excluded from `members`, and every other eligible member still swells; (c) if every robot in the picked company is ineligible, no swell starts that tick at all; (d) two members with different starting values reach the falling phase's end on the exact same measure, each landing exactly on its own `baseValue`.
* **`worldTransition.test.ts` (modified):** `initializeLocale` calls both `stopAudioSwells` and `startAudioSwells(localeId)`, alongside its existing robot-lifecycle pair (spy-based, matching how that file already asserts the lifecycle calls).
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** load a fresh Attenuation Style, open the Audio Rig and a Robot Options screen side by side (or in sequence), leave the app running for a few minutes, and confirm: sliders occasionally crawl on their own and settle back to where they started; two separate page loads on the same seed/coordinates produce the same swell timeline (same targets, same rough timing); disabling an effect that's mid-swell doesn't leave it stuck at a swelled value.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/swells` is the active branch and already reflects this spec's actual scope — the earlier `feature/LFO-delay-reverb` naming question (see the intent doc's "Why now") is resolved; no rename or fresh branch needed.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `types/audioSwell.ts` + `data/audioSwellRanges.ts` (+ tests) — pure types/data, no behavior; (2) `systems/audioSwells.ts` (+ test) — the mechanism itself, likely the largest single commit, worth splitting further into trigger/selection vs. ramp-advance/write-path if it grows unwieldy; (3) `worldTransition.ts` wiring (+ test); (4) `docs/AUDIO_SYSTEM.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, not left open):

- ~~Should this extend `lfoEngine.ts`?~~ **Resolved: no, a wholly separate mechanism** — §1.1, the intent doc's own explicit "not built on Tone.LFO/lfoEngine.ts" constraint.
- ~~Is `layerN.phase` excluded, matching LFO/Drift?~~ **Resolved: included** — §1.3, a genuine mechanism difference, not an LFO-parity requirement.
- ~~Which seed — Attenuation Style or locale/coordinates?~~ **Resolved: Attenuation Style only** — §1.4, matching every other global-chain seeded value.
- ~~Is ADSR one atomic swell or 4 independent ones?~~ **Resolved: 4 independent** — §1.2.
- ~~Branch naming~~ **Resolved: `feature/swells`**, already the active branch — §6.

Resolved via a follow-up `/interview-me` pass (2026-08-29), superseding this section's earlier placeholders:

- ~~Ramp shape (rising/holding/falling split)~~ **Resolved: no hold — two phases only, rising then falling, each independently drawn 3–6 measures by default (6–12 for `delay.wet`/`reverb.wet`), 1-measure floor on any phase** — §1.5. One sub-piece remains genuinely open: whether interpolation *within* a phase is linear or eased was not asked or confirmed — this spec assumes linear (matching every other ramp in this codebase, e.g. `centeredSwingFromRange`'s callers) until told otherwise.
- ~~`peakDelta`'s magnitude distribution~~ **Resolved: direction is picked to guarantee at least 50% of the attribute's full range is covered, and the peak is drawn between that 50%-of-range floor and the true edge** — §1.5, with Robot Volume's downward-swell clamp at 50% as the one exception.
- ~~Should a swell ever hit multiple robots at once?~~ **Resolved: yes — a company-wide variant, a small chance within the existing robot-pool roll, lock-step timing/direction shared across the company but magnitude computed per-robot, counted as one swell against the cap** — §1.5, new scope beyond the original intent doc (intent doc updated accordingly).

Still open — flag for Plan/Tasks, not blocking this spec:

1. **Ramp interpolation curve (linear vs. eased) within a single rising/falling phase** was not asked or confirmed — this spec assumes linear as a default; confirm via a manual audible pass if an eased curve is wanted instead.
2. **`SWELL_TRIGGER_CHANCE = 0.28`** (≈ one check success every 3.5 measures on average) **and the new `SWELL_COMPANY_CHANCE` are both this spec's own placeholder derivations, not numbers the user stated directly.** The user described *typical* spacing for the former ("like one every 3-4 measures") and "a small chance" for the latter — confirm both read right once audible, especially `SWELL_TRIGGER_CHANCE` interacting with the 5-swell concurrency cap (a pool that's frequently at its cap effectively throttles below the nominal rate).
3. **Mid-swell interaction with a live manual edit is unresolved.** If a human drags a slider while a swell is actively writing to that same field, the two writes race — whichever fires last (the next `BeatClock` tick vs. the UI's own `onChange`) wins until the other fires again, and the swell's own `baseValue` (captured before the human's edit) is now stale, so the eventual return-to-base will audibly snap back to a value the human no longer has on screen. The intent doc's "barring individual edits" language suggests this is an accepted, known edge case rather than something to design around, but Plan should confirm — a simple mitigation (cancel a swell outright the instant its own target field's store value changes for a reason other than the swell's own last write) is cheap and worth considering, not yet decided here.
4. **This is new, un-roadmapped scope** — needs a home in `docs/todo/roadmap.md` (a new out-of-sequence entry, e.g. `## 10.5`, following the `10.1`–`10.4` precedent) before or during Tasks. Branch naming is already resolved (§6).
5. **`docs/AUDIO_SYSTEM.md`'s new section (§2) needs to be written to make unmistakably clear this is independent of "LFO Modulation"** — readers skimming that doc for "does this app have an LFO on Delay's Mix" should land on "no, but it has something else that moves it sometimes," not come away thinking Delay/Reverb Mix quietly gained a real `lfoEngine.ts` target.
6. **Company selection mechanics for a company-wide swell** (which `getSeededVal` dataId indexes into `Locale.companies`, how ties/single-company locales behave) **were not walked through in detail** — Plan/Tasks should nail the exact draw, following this feature's existing `dataId`/`offset` convention (§1.4).
