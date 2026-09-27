# Phase Spec: Multi-Group LFO Drift (Roadmap Phase 10.3)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/lfo-drift-groups.md](../intent/lfo-drift-groups.md) (confirmed via `/interview-me`, 2026-08-29). Source of scope: [docs/todo/roadmap.md § 10.3](../todo/roadmap.md#103-lfo-modulation-engine--multi-group-drift) (inserted out of sequence after 10.2, same convention 10.1/10.2 already established). Prior art: [docs/specs/LFO_DRIFT.md](LFO_DRIFT.md) — the shipped Phase 10.2 this phase restructures, not extends from a blank slate. Every mechanic that phase built (the deterministic bucket-hash pool assignment, `centeredSwingFromRange`'s bounded swing math, the Depth Drift silence guard, the `Signal.override`-disable-then-restore fix) is reused unchanged; this phase changes *how many pools exist and which amount each one reads*, not the underlying mechanism.

> **Post-implementation note (post-10.3):** §4's code lives in `lfoEngine.ts` below because that's where this phase actually shipped it — accurate at the time. A later code-review-driven refactor extracted the whole drift subsystem into its own `src/engine/lfoDrift.ts` (plus a small shared `src/engine/lfoShared.ts` for `centeredSwingFromRange`/the override-fix/`isAudioContextRunning`/`clamp`), a pure reorganization with no behavior change. The file/line links and code excerpts below are a record of what this phase actually built, not a current map of the source tree — see [docs/AUDIO_SYSTEM.md § Drift](../AUDIO_SYSTEM.md#drift) for where each piece lives today.

---

## 1. Overview & Claude Explanation

10.2 shipped one shared pool of 8 secondary oscillators and one global `rateDrift`/`depthDrift` pair applied uniformly to every currently-connected primary `Tone.LFO` in the app — robot-level and global-chain alike. The roadmap named that phase "Stacked LFO Drift" from the start; the interview that scoped 10.2 explicitly deferred the actual stack (multiple independent drift layers) in favor of one uniform layer for v1 simplicity. This phase builds that deferred stack.

### 1.1 The four drift groups, and why these four

Confirmed via `/interview-me`: every LFO target in the app is sorted into exactly one of four **drift groups**, each independent — its own oscillator pool, its own seeded `rateDrift`/`depthDrift` amount, its own pair of sliders:

| Group | Covers | Real target count (ever) |
|---|---|---|
| `eq3` | `eq3.low`, `eq3.mid`, `eq3.high` | 3 |
| `filterLPF` | `lpf.frequency`, `lpf.Q` | 2 |
| `filterHPF` | `hpf.frequency`, `hpf.Q` | 2 |
| `robots` | every `RobotLfoTargetId` (`volume`, `layer{0,1,2}.{gain,detune,pulseWidth}`, any robot) | up to 12 robots × 10 drift-eligible fields (`layerN.phase` stays excluded, §1.4) |

Grounded directly against [src/types/lfo.ts](../../src/types/lfo.ts): `GLOBAL_LFO_TARGET_IDS` ([lfo.ts:83-87](../../src/types/lfo.ts#L83-L87)) is exactly these 7 targets, and `ROBOT_LFO_TARGET_IDS` ([lfo.ts:48-53](../../src/types/lfo.ts#L48-L53)) is exactly the 13 robot-level targets (`layerN.phase` included in the type, excluded from drift at the `connectLfoTarget` call site same as today, §1.4). The three global groups map one-to-one onto three of `audioRigConfig.ts`'s existing seven `AudioRigEffectKey` blocks — `eq3`, `filterLPF`, `filterHPF` are the *only* three effect blocks that carry any `lfoTarget` at all (`AUDIO_RIG_CONFIG`, [audioRigConfig.ts:66-177](../../src/data/audioRigConfig.ts#L66-L177) — Compressor/Delay/Reverb/Limiter have none). Robot-level targets have no "effect block" concept to split further by (confirmed during interview) — they share one group regardless of field or which robot.

This is a new type, not a repurposing of `AudioRigEffectKey` — `AudioRigEffectKey` includes `delay`/`reverb`/`compressor`/`limiter` (no LFO targets, not drift groups) and excludes `robots` (not an effect block at all). A new `DriftGroupId` union is the correct home:

```typescript
// src/types/lfo.ts — new export, alongside RobotLfoTargetId/GlobalLfoTargetId
export type DriftGroupId = 'eq3' | 'filterLPF' | 'filterHPF' | 'robots';
export const DRIFT_GROUP_IDS: readonly DriftGroupId[] = ['eq3', 'filterLPF', 'filterHPF', 'robots'];
```

`src/types/lfo.ts` was explicitly named as untouched in 10.2's own spec ("no per-target drift field to add") — that reasoning doesn't carry over here: `DriftGroupId` is genuinely LFO-target vocabulary (which group a target belongs to), the same category of concept as `RobotLfoTargetId`/`GlobalLfoTargetId` already living in this file, not a per-target settings field.

### 1.2 Pool size is sized to each group's own ceiling, not a uniform 8

Confirmed via interview: an EQ3 pool of 8 would mostly sit unused — there are only ever 3 possible EQ3 LFO targets in the entire app, ever, regardless of how many robots exist or what's currently active. Pool size becomes a per-group table:

```typescript
const DRIFT_POOL_SIZE: Record<DriftGroupId, number> = {
  eq3: 3,        // exactly 3 possible targets (low/mid/high) — never more
  filterLPF: 2,  // exactly 2 possible targets (frequency/Q)
  filterHPF: 2,  // exactly 2 possible targets (frequency/Q)
  robots: 8,     // dozens of possible simultaneously-active primaries across
                 // every robot/layer/field — the same "70-100+ primaries, a
                 // handful of buckets is enough" reasoning 10.2 already
                 // established (docs/specs/LFO_DRIFT.md §1.2), unchanged here
};
```

Total oscillator count goes from 10.2's flat 8 to `3 + 2 + 2 + 8 = 15` — a larger fixed constant, still bounded, still never scaling with how many robots or targets happen to be active (confirmed constraint). Each group's pool is still constructed lazily, once, on that group's own first successful `connectLfoTarget` call — a robot connecting before any EQ3 LFO is ever touched does not construct the `eq3` pool.

### 1.3 What changes mechanically, and what's reused unchanged

Every one of 10.2's already-shipped mechanics is reused as-is, just re-scoped from "one pool, one amount" to "per-group pool, per-group amount":

- **Bucket assignment** — still `alea(key)()` hashed into a pool index ([lfoEngine.ts:309](../../src/engine/lfoEngine.ts#L309)), just against that primary's own *group's* pool length instead of a single constant `DRIFT_POOL_SIZE`.
- **The override-disable-then-restore connection sequence** ([lfoEngine.ts:316-324](../../src/engine/lfoEngine.ts#L316-L324) for frequency, [lfoEngine.ts:382-390](../../src/engine/lfoEngine.ts#L382-L390) for amplitude) — untouched, reused verbatim per connection regardless of group.
- **`centeredSwingFromRange`** ([lfoEngine.ts:220-234](../../src/engine/lfoEngine.ts#L220-L234)) — untouched; still the single swing-bounding function for both rate and depth, called once per primary per refresh, agnostic to which group that primary belongs to.
- **The Depth Drift silence guard** (`refreshDepthDriftGain`'s connect/disconnect toggle, [lfoEngine.ts:364-395](../../src/engine/lfoEngine.ts#L364-L395)) — untouched in mechanism; now reads its group's own `globalDepthDrift` amount instead of one module-scope value.

What *does* change: `DriftLink` gains a `group: DriftGroupId` field (set once at `attachDrift` time, from the target the link was created for — never reassigned), `getOrCreateDriftPool()`/`attachDrift()` take a `group` parameter, `refreshRateDriftGain`/`refreshDepthDriftGain` look up their link's own group's amount instead of one shared module-scope variable, and `setGlobalRateDrift`/`setGlobalDepthDrift` both gain a `group: DriftGroupId` parameter — an intentional, breaking signature change from 10.2's shipped 1-argument form, since "one global amount" no longer describes the feature.

### 1.4 `layerN.phase` stays excluded, unchanged

10.2's own exclusion of `layerN.phase` targets from drift (no live `Signal`/`Param` exists for phase at all — a `scheduleRepeat`-driven manual poll, [lfoEngine.ts:509-524](../../src/engine/lfoEngine.ts#L509-L524)) carries over exactly as-is. `phase` targets stay part of `RobotLfoTargetId`/`ROBOT_LFO_TARGET_IDS` (so `driftGroupForTarget` below still classifies them as `robots` if ever asked), but `connectLfoTarget`'s existing phase branch ([lfoEngine.ts:545-552](../../src/engine/lfoEngine.ts#L545-L552)) returns before reaching `attachDrift` either way, exactly like today — no new guard needed, this phase doesn't touch that branch.

### 1.5 This phase restructures shipped code — it does not layer on top of it

Every file 10.2 already touched gets **modified again**, not extended additively: `GlobalAudioSettings.lfoDrift`'s shape changes from a flat `{ rateDrift, depthDrift }` pair to `Record<DriftGroupId, { rateDrift, depthDrift }>`; `GlobalAudioSeedFieldKey` grows from 2 `lfoDrift.*` keys to 8; `lfoEngine.setGlobalRateDrift`/`setGlobalDepthDrift`'s exported signatures change; `audioStore.ts`'s `setGlobalLfoDrift` action gains a `group` parameter; `audioRigConfig.ts`'s three standalone Drift consts become one array of four; `AudioRigDrawer.tsx`'s single hardcoded Drift block becomes a `.map()`. Every test written against 10.2's single-pool shape (`lfoEngine.test.ts`'s drift describe blocks, `audioStore.test.ts`'s `setGlobalLfoDrift` describe block, `audioRigConfig.test.ts`'s `LFO_DRIFT_ACCORDION` describe block, `AudioRigDrawer.test.tsx`'s Drift accordion describe block) gets rewritten in place for the new per-group shape, not left standing alongside new group-aware tests.

`docs/AUDIO_SYSTEM.md`'s "LFO Modulation" section (the full section, [docs/AUDIO_SYSTEM.md:206-260](../../docs/AUDIO_SYSTEM.md#L206-L260) — bounded by the next `##` heading, "Note Resolution Pipeline") still only documents the override fix and the primary-to-target swing math — 10.2's own Task 9 (documenting the shipped single-pool drift design) was never executed, confirmed by direct inspection (zero case-insensitive matches for "drift" anywhere in that range). This phase's own docs task (§6) writes the *final*, multi-group design directly — there is no single-pool description to first write and then supersede.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── lfo.ts                    # MODIFIED — new DriftGroupId union + DRIFT_GROUP_IDS export,
│   │                               #   alongside RobotLfoTargetId/GlobalLfoTargetId. Explicitly
│   │                               #   NOT touched by 10.2; touched here — see §1.1 for why that's
│   │                               #   a deliberate reversal, not scope creep.
│   └── globalAudio.ts             # MODIFIED — GlobalAudioSettings.lfoDrift becomes
│                                    #   Record<DriftGroupId, { rateDrift: number; depthDrift: number }>;
│                                    #   DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift gains all 4 group entries
├── data/
│   ├── globalAudioSeedRanges.ts       # MODIFIED — GlobalAudioSeedFieldKey's 2 'lfoDrift.*' keys become
│   │                                   #   8 ('lfoDrift.<group>.rateDrift'/'.depthDrift' × 4 groups);
│   │                                   #   GLOBAL_AUDIO_SEED_RANGES gains all 8 at the same
│   │                                   #   { min: -1, max: 1, scale: 'linear' } 10.2 already used
│   ├── globalAudioLoadingRanges.ts     # MODIFIED — same 8-key expansion, same -0.4..0.4 first-pass
│   │                                   #   window 10.2 already used per group
│   ├── globalAudioLoadingRanges.test.ts # MODIFIED
│   └── audioRigConfig.ts              # MODIFIED — LFO_DRIFT_ACCORDION/LFO_RATE_DRIFT_SCHEMA/
│                                        #   LFO_DEPTH_DRIFT_SCHEMA (3 standalone consts) replaced by
│                                        #   one LFO_DRIFT_GROUPS: LfoDriftGroupSchema[] (4 entries) —
│                                        #   still NOT part of AUDIO_RIG_CONFIG's own array, same
│                                        #   reasoning as 10.2 (no matching AudioRigEffectBlock shape)
│   └── audioRigConfig.test.ts         # MODIFIED
├── utils/
│   ├── globalAudioSeed.ts       # MODIFIED — generateGlobalAudioSettings's lfoDrift block samples
│   │                              #   all 4 groups × 2 fields via the existing sampleField() helper,
│   │                              #   unchanged otherwise
│   └── globalAudioSeed.test.ts  # MODIFIED
├── engine/
│   ├── lfoEngine.ts        # MODIFIED — see §4. DriftLink gains `group`; pool state, pool-size
│   │                        #   constant, and global drift amounts all become per-group;
│   │                        #   setGlobalRateDrift/setGlobalDepthDrift both gain a `group` param
│   │                        #   (breaking signature change from 10.2's shipped 1-arg form)
│   └── lfoEngine.test.ts   # MODIFIED — every drift-related describe block from 10.2 rewritten for
│                            #   per-group behavior, plus new cross-group isolation coverage (§5)
├── stores/
│   ├── audioStore.ts       # MODIFIED — setGlobalLfoDrift gains a `group: DriftGroupId` first
│   │                        #   parameter; applyGlobalAudioToEngine loops DRIFT_GROUP_IDS instead
│   │                        #   of one hardcoded pair of calls
│   └── audioStore.test.ts  # MODIFIED
└── components/panels/screen/console/
    ├── AudioRigDrawer.tsx      # MODIFIED — the single hardcoded Drift accordion block becomes a
    │                            #   LFO_DRIFT_GROUPS.map(...), mirroring AUDIO_RIG_CONFIG's own
    │                            #   existing map — sibling to it, still not nested inside any
    │                            #   effect block's own accordion
    └── AudioRigDrawer.test.tsx # MODIFIED

docs/
└── AUDIO_SYSTEM.md   # MODIFIED — "LFO Modulation" section documents the shipped multi-group
                        #   design directly (§1.5 — there is no single-pool description to
                        #   supersede, 10.2's own doc task was never executed)
```

**Explicitly not touched, and why** (same three as 10.2, still true): `src/components/ui/controls/Lfo.tsx` (no per-target drift UI — still one global-per-group control, never per-target), `src/data/robotOptionsConfig.ts`/`src/data/companyConfig.ts`/`CompanyOptionsSection.tsx` (still no per-robot drift state — "Robots" stays one shared group, per the interview's explicit rejection of per-robot drift). `src/components/ui/controls/SliderCenteredZero.tsx` and `AccordionContainer.tsx` are reused completely as-is, same as 10.2 — no UI primitive changes.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No Tone objects outside `src/engine/`** (CLAUDE.md) — unchanged from 10.2; the per-group pools, their Gains, and every connection between them still live in `lfoEngine.ts` alone.
* **Four groups, fixed — this phase does not build a general N-group system.** `DriftGroupId` is a closed 4-member union, not an extensible registry. Adding a 5th group later is a new decision, not something this phase's code should anticipate with, e.g., a dynamic group-count parameter.
* **Pool size is a per-group constant, sized to that group's own real target ceiling — never a parameter, never derived at runtime from how many targets happen to be active.** `DRIFT_POOL_SIZE`'s four values (§1.2) are fixed the same way 10.2's single `8` was fixed: a design decision recorded in code, not computed.
* **"Robots" is one shared group — never one group per robot, never split further by field.** Confirmed via interview as a deliberate rejection, same status as 10.2's own "per-target drift" rejection. `driftGroupForTarget` (§4) returns `'robots'` for every `RobotLfoTargetId` unconditionally, `robotId` included in the instance key but never consulted for grouping.
* **Every mechanic §1.3 lists as reused must be reused, not re-implemented.** `centeredSwingFromRange`, the override-disable-then-restore sequence, and the disconnect-not-zero silence guard all keep their exact existing bodies; only what feeds them (which pool, which amount) changes.
* **`layerN.phase` targets stay excluded from drift, unchanged.** No new logic gates this — `connectLfoTarget`'s existing phase branch already returns before any drift code runs (§1.4).
* **Cross-group isolation is a first-class requirement, not an incidental property.** Setting one group's `rateDrift`/`depthDrift` must never move another group's `Gain` values. This is the single most likely regression class in this phase (§7) and must be directly tested (§5), not just implied by the per-group data structure.
* **No changes to `docs/COMPONENT_LIBRARY.md`** — `SliderCenteredZero`/`AccordionContainer` are reused with no schema or behavior change.

---

## 4. Code Style & Architecture Conventions

**`types/lfo.ts`** (new exports, alongside `RobotLfoTargetId`/`GlobalLfoTargetId`):

```typescript
/**
 * The 4 independent LFO drift groups (docs/specs/LFO_DRIFT_GROUPS.md) — every
 * connected primary LFO belongs to exactly one, determined by its own target
 * id (see lfoEngine.ts's driftGroupForTarget). Global-chain targets split by
 * effect block (only eq3/filterLPF/filterHPF ever carry an lfoTarget at all —
 * see audioRigConfig.ts's AUDIO_RIG_CONFIG); every RobotLfoTargetId, regardless
 * of field or which robot, shares the one 'robots' group.
 */
export type DriftGroupId = 'eq3' | 'filterLPF' | 'filterHPF' | 'robots';
export const DRIFT_GROUP_IDS: readonly DriftGroupId[] = ['eq3', 'filterLPF', 'filterHPF', 'robots'];
```

**`types/globalAudio.ts`** (diff):

```typescript
export interface GlobalAudioSettings {
  globalBypass: boolean;
  compressorBeforeDelay: boolean;
  /** Global, seeded LFO drift amounts — one independent { rateDrift, depthDrift }
   *  pair per DriftGroupId, applied to every currently-connected primary
   *  Tone.LFO belonging to that group. Both fields -1.0 to 1.0, default 0.0.
   *  See docs/specs/LFO_DRIFT_GROUPS.md. */
  lfoDrift: Record<DriftGroupId, { rateDrift: number; depthDrift: number }>;
  reverb: ReverbSettings;
  // ...unchanged...
}

const DEFAULT_LFO_DRIFT_GROUP = { rateDrift: 0, depthDrift: 0 };

export const DEFAULT_GLOBAL_AUDIO_SETTINGS: GlobalAudioSettings = {
  globalBypass: false,
  compressorBeforeDelay: false,
  lfoDrift: {
    eq3: { ...DEFAULT_LFO_DRIFT_GROUP },
    filterLPF: { ...DEFAULT_LFO_DRIFT_GROUP },
    filterHPF: { ...DEFAULT_LFO_DRIFT_GROUP },
    robots: { ...DEFAULT_LFO_DRIFT_GROUP },
  },
  // ...unchanged...
};
```

**`data/globalAudioSeedRanges.ts`** (diff — the dotted-path convention already established for every other field extends to a 3-level path here, `lfoDrift.<group>.<field>`; nothing about `sampleField`'s own implementation needs to change, since it treats these keys as opaque strings, not runtime property paths):

```typescript
export type GlobalAudioSeedFieldKey =
  | 'compressor.threshold'
  // ...unchanged...
  | 'limiter.threshold'
  | 'lfoDrift.eq3.rateDrift' | 'lfoDrift.eq3.depthDrift'
  | 'lfoDrift.filterLPF.rateDrift' | 'lfoDrift.filterLPF.depthDrift'
  | 'lfoDrift.filterHPF.rateDrift' | 'lfoDrift.filterHPF.depthDrift'
  | 'lfoDrift.robots.rateDrift' | 'lfoDrift.robots.depthDrift';

export const GLOBAL_AUDIO_SEED_RANGES: Record<GlobalAudioSeedFieldKey, SeedRange> = {
  // ...unchanged...
  'limiter.threshold': { min: -20, max: 0, scale: 'linear' },
  'lfoDrift.eq3.rateDrift': { min: -1, max: 1, scale: 'linear' },
  'lfoDrift.eq3.depthDrift': { min: -1, max: 1, scale: 'linear' },
  'lfoDrift.filterLPF.rateDrift': { min: -1, max: 1, scale: 'linear' },
  'lfoDrift.filterLPF.depthDrift': { min: -1, max: 1, scale: 'linear' },
  'lfoDrift.filterHPF.rateDrift': { min: -1, max: 1, scale: 'linear' },
  'lfoDrift.filterHPF.depthDrift': { min: -1, max: 1, scale: 'linear' },
  'lfoDrift.robots.rateDrift': { min: -1, max: 1, scale: 'linear' },
  'lfoDrift.robots.depthDrift': { min: -1, max: 1, scale: 'linear' },
};
```

`data/globalAudioLoadingRanges.ts` gains the matching 8-entry expansion at the same `-0.4..0.4` first-pass window 10.2 already used per field — mechanically identical treatment, just 4x the keys.

**`utils/globalAudioSeed.ts`** (the one block inside `generateGlobalAudioSettings` that changes):

```typescript
return {
  globalBypass: defaults.globalBypass,
  compressorBeforeDelay: defaults.compressorBeforeDelay,
  lfoDrift: {
    eq3: {
      rateDrift: sampleField(noiseMap, 'lfoDrift.eq3.rateDrift'),
      depthDrift: sampleField(noiseMap, 'lfoDrift.eq3.depthDrift'),
    },
    filterLPF: {
      rateDrift: sampleField(noiseMap, 'lfoDrift.filterLPF.rateDrift'),
      depthDrift: sampleField(noiseMap, 'lfoDrift.filterLPF.depthDrift'),
    },
    filterHPF: {
      rateDrift: sampleField(noiseMap, 'lfoDrift.filterHPF.rateDrift'),
      depthDrift: sampleField(noiseMap, 'lfoDrift.filterHPF.depthDrift'),
    },
    robots: {
      rateDrift: sampleField(noiseMap, 'lfoDrift.robots.rateDrift'),
      depthDrift: sampleField(noiseMap, 'lfoDrift.robots.depthDrift'),
    },
  },
  compressor: { /* ...unchanged... */ },
  // ...
};
```

**`engine/lfoEngine.ts`** — the module-scope state and functions that change (diff against the shipped 10.2 code):

```typescript
import { DriftGroupId, DRIFT_GROUP_IDS, /* ...existing imports... */ } from '../types/lfo';

/** Per-group pool size — sized to each group's own real target ceiling, not
 *  a uniform constant. See docs/specs/LFO_DRIFT_GROUPS.md §1.2. */
const DRIFT_POOL_SIZE: Record<DriftGroupId, number> = {
  eq3: 3,
  filterLPF: 2,
  filterHPF: 2,
  robots: 8,
};

/** One pool per group, each lazily constructed on that group's own first
 *  successful connectLfoTarget call. Never disposed; never shared across
 *  groups. */
const driftPools: Partial<Record<DriftGroupId, Tone.LFO[]>> = {};

interface DriftLink {
  /** Set once at attachDrift time from the target the link was created for
   *  — never reassigned. Determines which group's globalRateDrift/
   *  globalDepthDrift amount this link's Gains read. */
  group: DriftGroupId;
  rateDriftGain: Tone.Gain;
  depthDriftGain: Tone.Gain;
  depthDriftConnected: boolean;
}
const driftLinks = new Map<string, DriftLink>();

/** One { rateDrift, depthDrift } pair per group, all starting at 0 — pushed
 *  by setGlobalRateDrift/setGlobalDepthDrift, both now group-scoped. */
const globalRateDriftByGroup: Record<DriftGroupId, number> = { eq3: 0, filterLPF: 0, filterHPF: 0, robots: 0 };
const globalDepthDriftByGroup: Record<DriftGroupId, number> = { eq3: 0, filterLPF: 0, filterHPF: 0, robots: 0 };

/** Which drift group a target belongs to — the three global effect blocks
 *  that ever carry an lfoTarget map one-to-one by their own short-form
 *  prefix; every RobotLfoTargetId (isRobotTarget(target) === true) shares
 *  'robots' regardless of field or robotId. Mirrors globalSeedRangeKey's
 *  existing 'lpf.'/'hpf.' prefix-matching style just above it in this file. */
function driftGroupForTarget(target: LfoTargetId): DriftGroupId {
  if (target.startsWith('eq3.')) return 'eq3';
  if (target.startsWith('lpf.')) return 'filterLPF';
  if (target.startsWith('hpf.')) return 'filterHPF';
  return 'robots';
}

function getOrCreateDriftPool(group: DriftGroupId): Tone.LFO[] {
  const existing = driftPools[group];
  if (existing) return existing;
  const size = DRIFT_POOL_SIZE[group];
  const pool: Tone.LFO[] = [];
  for (let i = 0; i < size; i++) {
    const lfo = new Tone.LFO({ frequency: DRIFT_RATE_HZ, type: 'sine', phase: (360 / size) * i });
    if (isAudioContextRunning()) lfo.start();
    pool.push(lfo);
  }
  driftPools[group] = pool;
  return pool;
}

function attachDrift(key: string, lfo: Tone.LFO, group: DriftGroupId): void {
  if (driftLinks.has(key)) return;
  const pool = getOrCreateDriftPool(group);
  const poolLfo = pool[Math.floor(alea(key)() * pool.length)];

  const rateDriftGain = new Tone.Gain(0);
  const depthDriftGain = new Tone.Gain(0);
  poolLfo.connect(rateDriftGain);
  poolLfo.connect(depthDriftGain);

  (lfo.frequency as unknown as { override?: boolean }).override = false;
  const currentFreq = lfo.frequency.value as number;
  rateDriftGain.connect(lfo.frequency as unknown as Tone.InputNode);
  if (Number.isFinite(currentFreq)) lfo.frequency.value = currentFreq;

  driftLinks.set(key, { group, rateDriftGain, depthDriftGain, depthDriftConnected: false });
  refreshRateDriftGain(key);
  refreshDepthDriftGain(key);
}

function refreshRateDriftGain(key: string): void {
  const link = driftLinks.get(key);
  const lfo = activeLfos.get(key);
  if (!link || !lfo) return;
  const currentRate = lfo.frequency.value as number;
  const swing = centeredSwingFromRange({ min: LFO_RATE_MIN, max: LFO_RATE_MAX }, currentRate);
  link.rateDriftGain.gain.value = globalRateDriftByGroup[link.group] * swing.max;
}

function refreshDepthDriftGain(key: string): void {
  const link = driftLinks.get(key);
  const lfo = activeLfos.get(key);
  if (!link || !lfo) return;
  const currentAmp = lfo.amplitude.value as number;

  if (currentAmp <= 0) {
    if (link.depthDriftConnected) {
      try { link.depthDriftGain.disconnect(); } catch (err) { devWarn('[lfoEngine] refreshDepthDriftGain: disconnect failed', err); }
      link.depthDriftConnected = false;
    }
    return;
  }

  if (!link.depthDriftConnected) {
    (lfo.amplitude as unknown as { override?: boolean }).override = false;
    link.depthDriftGain.connect(lfo.amplitude as unknown as Tone.InputNode);
    if (Number.isFinite(currentAmp)) lfo.amplitude.value = currentAmp;
    link.depthDriftConnected = true;
  }

  const swing = centeredSwingFromRange({ min: 0, max: 1 }, currentAmp);
  link.depthDriftGain.gain.value = globalDepthDriftByGroup[link.group] * swing.max;
}

/** BREAKING vs. 10.2's shipped 1-argument form — now takes the group to set. */
function setGlobalRateDrift(group: DriftGroupId, value: number): void {
  globalRateDriftByGroup[group] = clamp(value, -1, 1);
  for (const [key, link] of driftLinks) {
    if (link.group === group) refreshRateDriftGain(key);
  }
}

function setGlobalDepthDrift(group: DriftGroupId, value: number): void {
  globalDepthDriftByGroup[group] = clamp(value, -1, 1);
  for (const [key, link] of driftLinks) {
    if (link.group === group) refreshDepthDriftGain(key);
  }
}
```

`connectLfoTarget`'s two `attachDrift(key, lfo)` call sites ([lfoEngine.ts:575](../../src/engine/lfoEngine.ts#L575) and [lfoEngine.ts:630](../../src/engine/lfoEngine.ts#L630)) both become `attachDrift(key, lfo, driftGroupForTarget(target))` — the target is already in scope at both call sites, no new parameter threading needed. `detachDrift` is unchanged (it never needed to know the group; it reads it off `driftLinks.get(key)` if needed, but doesn't need to today).

**`stores/audioStore.ts`** (diff):

```typescript
setGlobalLfoDrift: (group: DriftGroupId, partial: Partial<GlobalAudioSettings['lfoDrift'][DriftGroupId]>) => {
  set((state) => ({
    globalAudio: {
      ...state.globalAudio,
      lfoDrift: { ...state.globalAudio.lfoDrift, [group]: { ...state.globalAudio.lfoDrift[group], ...partial } },
    },
  }));
  if (partial.rateDrift !== undefined) lfoEngine.setGlobalRateDrift(group, partial.rateDrift);
  if (partial.depthDrift !== undefined) lfoEngine.setGlobalDepthDrift(group, partial.depthDrift);
},
```

`applyGlobalAudioToEngine`'s two hardcoded calls ([audioStore.ts:70-71](../../src/stores/audioStore.ts#L70-L71)) become a loop:

```typescript
for (const group of DRIFT_GROUP_IDS) {
  lfoEngine.setGlobalRateDrift(group, globalAudio.lfoDrift[group].rateDrift);
  lfoEngine.setGlobalDepthDrift(group, globalAudio.lfoDrift[group].depthDrift);
}
```

**`data/audioRigConfig.ts`** (the three standalone 10.2 consts collapse into one array, mirroring `AUDIO_RIG_CONFIG`'s own shape so `AudioRigDrawer.tsx` can `.map()` it the same way):

```typescript
export interface LfoDriftGroupSchema {
  group: DriftGroupId;
  accordion: AccordionSchema;
  rateSchema: SliderCenteredZeroSchema;
  depthSchema: SliderCenteredZeroSchema;
}

function driftGroupSchema(group: DriftGroupId, loreLabel: string, humanLabel: string): LfoDriftGroupSchema {
  return {
    group,
    accordion: { id: `audioRig.lfoDrift.${group}`, type: 'accordion', loreLabel, humanLabel },
    rateSchema: { id: `audioRig.lfoDrift.${group}.rateDrift`, type: 'sliderCenteredZero', humanLabel: 'Rate Drift', min: -100, max: 100, unit: '%' },
    depthSchema: { id: `audioRig.lfoDrift.${group}.depthDrift`, type: 'sliderCenteredZero', humanLabel: 'Depth Drift', min: -100, max: 100, unit: '%' },
  };
}

export const LFO_DRIFT_GROUPS: LfoDriftGroupSchema[] = [
  driftGroupSchema('eq3', 'SPECTRAL FLUX', 'EQ Drift'),
  driftGroupSchema('filterLPF', 'HIGH-MASK FLUX', 'Low-Pass Drift'),
  driftGroupSchema('filterHPF', 'LOW-MASK FLUX', 'High-Pass Drift'),
  driftGroupSchema('robots', 'AGENT FLUX', 'Robot Drift'),
];
```

Copy (`loreLabel`/`humanLabel` per group) is a first-pass default, flagged in §7 — not confirmed against any reference grid, since none exists for this feature (same status 10.2's own `ATTENUATION FLUX`/`CADENCE INSTABILITY` labels had).

**`components/panels/screen/console/AudioRigDrawer.tsx`** (the single hardcoded block becomes a map, sibling to `AUDIO_RIG_CONFIG.map(...)`, same position it occupies today):

```tsx
{LFO_DRIFT_GROUPS.map((driftGroup) => {
  const groupSettings = globalAudio.lfoDrift[driftGroup.group];
  return (
    <div className="audio-rig-drawer__effect-block" key={driftGroup.group}>
      <AccordionContainer
        schema={driftGroup.accordion}
        contentActive={groupSettings.rateDrift !== 0 || groupSettings.depthDrift !== 0}
      >
        <div className="audio-rig-drawer__param-row">
          <SliderCenteredZero
            schema={driftGroup.rateSchema}
            value={groupSettings.rateDrift * 100}
            onChange={(v) => setGlobalLfoDrift(driftGroup.group, { rateDrift: v / 100 })}
            disabled={rigDisabled}
          />
        </div>
        <div className="audio-rig-drawer__param-row">
          <SliderCenteredZero
            schema={driftGroup.depthSchema}
            value={groupSettings.depthDrift * 100}
            onChange={(v) => setGlobalLfoDrift(driftGroup.group, { depthDrift: v / 100 })}
            disabled={rigDisabled}
          />
        </div>
      </AccordionContainer>
    </div>
  );
})}
```

* **Naming Conventions:** `driftGroupForTarget`/`driftGroupSchema` follow this file's existing lowerCamelCase-private-helper convention (`globalSeedRangeKey`, `accordionSchema`). `DriftGroupId`/`DRIFT_GROUP_IDS` match `RobotLfoTargetId`/`ROBOT_LFO_TARGET_IDS`'s existing type-plus-array-of-values pairing exactly.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest (+ React Testing Library for `AudioRigDrawer.test.tsx`).
* **Test File Location:** Colocate, matching every file in §2.
* **`lfoEngine.test.ts` (modified) — every 10.2 drift describe block rewritten for per-group behavior, plus new cross-group coverage:**
  1. **Per-group pool sizing:** the `eq3` pool never exceeds 3 oscillators, `filterLPF`/`filterHPF` never exceed 2 each, `robots` never exceeds 8 — regardless of how many targets across other groups have connected. A group's pool is not constructed until *that group's own* first successful `connectLfoTarget` call (connecting an EQ3 target does not construct the `filterLPF`/`filterHPF`/`robots` pools).
  2. **`driftGroupForTarget` classification:** every `GlobalLfoTargetId` maps to its documented group (`eq3.*` → `eq3`, `lpf.*` → `filterLPF`, `hpf.*` → `filterHPF`); every `RobotLfoTargetId` maps to `robots`, regardless of field or robotId.
  3. **Cross-group isolation (the highest-risk regression class, §7):** connecting one primary in each of the 4 groups, then calling `setGlobalRateDrift('eq3', 1)` changes *only* the `eq3`-group primary's rate-drift Gain — the other 3 groups' Gains stay at whatever they were before the call. Repeat for `setGlobalDepthDrift`. Repeat with a different group as the one being set, to rule out an accidental first-group-only bug.
  4. **`setGlobalRateDrift`/`setGlobalDepthDrift` are safe no-ops per-group** with zero primaries connected in that specific group (even if other groups have primaries connected).
  5. Swing-bound behavior (edge vs. midpoint, zero swing exactly at `LFO_RATE_MIN`) and the full Depth Drift silence-guard matrix (disconnect at depth 0, reconnect above 0, survives a group's own amount changing while silenced) — same assertions 10.2 already had, re-run once per representative group (not necessarily all 4 for every case; at least one global-chain group and `robots` each, to catch a group-plumbing bug the single-group 10.2 tests couldn't).
  6. `connectLfoTarget('layerN.phase', …)` still creates no drift link at all (unchanged from 10.2 — re-run to confirm the phase exclusion survived the refactor).
* **`types/lfo.test.ts` (new, if this file doesn't already exist as `lfo.test.ts` — check first):** `DRIFT_GROUP_IDS` has exactly the 4 documented members, no duplicates.
* **`globalAudioSeedRanges.test.ts`/`globalAudioLoadingRanges.test.ts` (modified):** the closed-set key-coverage assertions extend from 2 `lfoDrift.*` keys to 8; bounds/scale assertions per new key mirror the existing pattern exactly.
* **`globalAudioSeed.test.ts` (modified):** `generateGlobalAudioSettings`'s `lfoDrift` output has all 4 groups populated; each group's `rateDrift`/`depthDrift` sampled independently (a per-group version of the existing "not the same draw for both fields" test, now also asserting no two *groups* share a draw); determinism and non-degeneracy re-run per group.
* **`audioStore.test.ts` (modified):** `setGlobalLfoDrift(group, partial)` updates only that group's stored values and calls only that group's matching `lfoEngine` setter(s) — the existing single-group test shape, parameterized or repeated across all 4 groups; `applyGlobalAudioToEngine` calls both `lfoEngine` setters for all 4 groups with each group's own current values.
* **`audioRigConfig.test.ts` (modified):** `LFO_DRIFT_GROUPS` has exactly 4 entries, one per `DriftGroupId`, each with a valid accordion + two `sliderCenteredZero` schemas at `-100..100`; every id is unique across all 4 groups' 12 schemas combined (4 accordions + 8 sliders).
* **`AudioRigDrawer.test.tsx` (modified):** all 4 Drift accordions render with their own two sliders (8 total, replacing 10.2's 2); dragging any one slider calls `setGlobalLfoDrift` with that slider's own group and the `%`-to-fraction conversion, and does not affect any other group's stored value (the UI-level version of the engine's cross-group isolation test); all 8 sliders disabled together under `rigDisabled`.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (surfaces any remaining 1-argument `setGlobalRateDrift`/`setGlobalDepthDrift` call site, and any object literal still using the old flat `lfoDrift: { rateDrift, depthDrift }` shape).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** load a fresh planet, open the Audio Rig, confirm 4 Drift accordions (EQ, Low-Pass, High-Pass, Robot) each start at their own nonzero-but-modest seeded position, not all four reading the same number; with a robot-level LFO already active and audible, raise only the Robots group's Depth Drift and confirm the EQ/LPF/HPF groups' own already-active LFOs (if any) sound unaffected; confirm the depth-0-stays-silent guarantee still holds per group.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** TBD at Tasks time — this work continues on `feature/stacked-lfo` (already the active branch, and the name now literally matches what's being built) unless the human wants a fresh branch off the merged 10.2 work.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable and each a genuine modification of a 10.2 commit's own work, not a fresh addition: (1) `types/lfo.ts`'s new `DriftGroupId` + `types/globalAudio.ts`'s reshaped `lfoDrift` (+ tests), (2) the seed-range/loading-range 2→8 key expansion (+ tests), (3) `globalAudioSeed.ts`'s per-group sampling (+ test), (4) `lfoEngine.ts`'s per-group pool/link/amount restructuring — likely the largest single commit in this phase, worth splitting further into pool-sizing-and-grouping vs. the `setGlobalRateDrift`/`setGlobalDepthDrift` signature change if it grows unwieldy — (+ test), (5) `audioStore.ts`'s group-aware wiring (+ test), (6) `audioRigConfig.ts`'s `LFO_DRIFT_GROUPS` array + `AudioRigDrawer.tsx`'s map (+ tests), (7) `docs/AUDIO_SYSTEM.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and code, not left open):

- ~~Should groups differ only in seeded amount, or in actual oscillator pool too?~~ **Resolved: separate dedicated pools per group** — §1.2/§1.3, the entire premise of this phase versus a cheaper shared-pool-with-per-group-scaling alternative that was explicitly considered and rejected during interview.
- ~~Should pool size stay a uniform 8 across all 4 groups for consistency?~~ **Resolved: no, sized to each group's own real ceiling** — §1.2, confirmed directly against the fixed, small `GlobalLfoTargetId` counts for `eq3`/`lpf`/`hpf`.
- ~~How should robot-level LFOs be grouped — one shared group, per-field, or per-robot?~~ **Resolved: one shared group** — §1.1, explicitly rejecting the finer-grained alternatives during interview.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **Cross-group isolation is the single highest-risk regression this phase introduces.** 10.2 had exactly one global amount, so there was no way to get "which amount applies to this primary" wrong. This phase introduces that exact failure mode for the first time (a `link.group` lookup bug, or a `driftGroupForTarget` misclassification, silently leaking one group's drift into another). §5's cross-group isolation tests are the direct mitigation — treat them as non-negotiable, not nice-to-have, during Implement.
2. **`LFO_DRIFT_GROUPS`'s `loreLabel`/`humanLabel` copy (§4) is a first-pass default**, same status 10.2's own Drift labels had — no reference grid exists for this feature at all (10.2's own spec already flagged this gap). Confirm the 4 labels read clearly as distinct groups during the manual check; adjust before merge if "EQ Drift"/"Low-Pass Drift"/"High-Pass Drift"/"Robot Drift" don't clearly signal what each one covers.
3. **`GLOBAL_AUDIO_LOADING_RANGES`'s `-0.4..0.4` window, carried forward per group unchanged from 10.2, is still a first-pass default** (10.2's own spec §7 already flagged this) — now multiplied across 4 independently-seeded groups instead of 1. Confirm during the manual/audible check that having *all four* roll independently within this window doesn't compound into something that reads as too busy; 10.2's own single-group version was already unconfirmed at ship time.
4. **Total oscillator count rises from 10.2's flat 8 to 15** (§1.2). Still a fixed constant, still far below the "70-100+ primaries" cost concern that motivated pooling at all — not re-litigated here, noted only for continuity with 10.2's own cost reasoning.
5. **10.2's own Task 9 (documenting the drift design in `docs/AUDIO_SYSTEM.md`) was never executed** (§1.5) — this phase's docs task (§6, commit 7) is the first time any drift design reaches that doc, and it should document the shipped multi-group result directly, not a single-pool version that was never actually written down.
