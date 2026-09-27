# Phase Spec: LFO Modulation Engine — Stacked LFO Drift (Roadmap Phase 10.2)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/lfo-drift.md](../intent/lfo-drift.md) (confirmed via `/interview-me`, 2026-08-28). Source of scope: [docs/todo/roadmap.md § 10.2](../todo/roadmap.md#102-lfo-modulation-engine-stacked-lfo-drift) (inserted out of sequence, same as 10.1). Supersedes an external plan draft reviewed and found to contain hallucinated file paths and an over-broad per-target UI design that the interview explicitly rejected in favor of one global control. Prior art: [docs/specs/LFO_INTEGRATION.md](LFO_INTEGRATION.md) (the Phase 0 engine this phase extends — `lfoEngine.ts`'s existing lifecycle, the `Signal.override` bug and its fix, `centeredSwingFromRange`'s bounded-safe swing math), [docs/AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md)'s LFO Modulation section.

> **Superseded:** this single-shared-pool design shipped, then was itself restructured into 4 independent drift groups by [docs/specs/LFO_DRIFT_GROUPS.md](LFO_DRIFT_GROUPS.md) (Roadmap 10.3) — see that spec's own post-implementation note for where the code actually lives today (`lfoDrift.ts`/`lfoShared.ts`, not `lfoEngine.ts`). This doc's file/line references reflect the single-pool code as it stood when this phase shipped, before either the 10.3 reshape or the later module-extraction refactor.

---

## 1. Overview & Claude Explanation

This phase adds one global, seeded "Drift" control — two bipolar sliders, Rate Drift and Depth Drift — to the Audio Rig drawer. Turning either past `0` makes every currently-connected `Tone.LFO` (robot-level and global-chain alike) wander its own rate or depth slowly over a ~33-second cycle instead of repeating with mechanical precision. There is no per-target drift state anywhere — one pair of values, sourced from `GlobalAudioSettings`, drives every active primary at once.

### 1.1 Where the two new values live

`GlobalAudioSettings` ([src/types/globalAudio.ts](../../src/types/globalAudio.ts)) already models two top-level, non-effect flags — `globalBypass`, `compressorBeforeDelay` — alongside its seven effect-param objects. `lfoDrift: { rateDrift: number; depthDrift: number }` (both `-1.0`–`1.0`, default `0.0`) becomes a third. This is a deliberate fit, not a new pattern: `audioStore.ts`'s `EffectKey` already `Exclude`s the two existing flags from the generic `setGlobalAudio`/`GLOBAL_SETTER` per-effect dispatch table ([audioStore.ts:22](../../src/stores/audioStore.ts#L22)), and `compressorBeforeDelay` already gets its own bespoke setter (`setCompressorBeforeDelay`, [audioStore.ts:188](../../src/stores/audioStore.ts#L188)) that calls something other than an `AudioEngine.setGlobal*` effect function (`wireGlobalFxChain`). `lfoDrift` follows exactly that precedent, except its bespoke setter (`setGlobalLfoDrift`) calls into `lfoEngine`, not `globalFx.ts`.

Seeding reuses the exact machinery already sampling every other `GlobalAudioSettings` field from the planet noise map ([globalAudioSeed.ts](../../src/utils/globalAudioSeed.ts)): `GLOBAL_AUDIO_SEED_RANGES`/`GLOBAL_AUDIO_LOADING_RANGES` ([globalAudioSeedRanges.ts](../../src/data/globalAudioSeedRanges.ts), [globalAudioLoadingRanges.ts](../../src/data/globalAudioLoadingRanges.ts)) both key off `GlobalAudioSeedFieldKey` — a `Record`, so TypeScript itself enforces that adding `'lfoDrift.rateDrift'`/`'lfoDrift.depthDrift'` to that union means both tables must supply an entry (`npm run build:types` catches a missed one). `generateGlobalAudioSettings`'s existing `sampleField()` helper needs no new code beyond the two new keys and a call each — the loading-range window is what gives "seeded, but subtle by default" (confirmed intent) for free: the full range is `-1..1`, but a fresh planet only ever rolls within a narrower loading sub-window (§4 proposes `-0.4..0.4`, flagged in §7 as a first-pass default — unlike every other field in that table, this one has no `GLOBAL_CHAIN_GRID.md` row to transcribe from, since drift didn't exist when that grid was written).

### 1.2 The shared drift-oscillator pool, and why it isn't one-per-primary

The interview explicitly rejected one dedicated secondary oscillator per active primary (a likely 70-100+ node cost in a typical session, most of it wasted since a human can't perceptually distinguish more than a handful of independent phases) in favor of a **fixed pool of 8 shared secondary `Tone.LFO`s**, each at its own distinct, deterministic phase offset, constructed once, lazily, inside `lfoEngine.ts` — not per robot, not per target. Every primary that successfully connects picks one pool oscillator by hashing its own `instanceKey(target, robotId)` (`lfoEngine.ts`'s existing private helper, [lfoEngine.ts:83](../../src/engine/lfoEngine.ts#L83)) through `alea()` — the same deterministic-string-to-float primitive `getSeededVal.ts`'s `precomputeDataX` already uses ([getSeededVal.ts:28](../../src/utils/getSeededVal.ts#L28)) — so the same target always lands on the same bucket across a session, and no `Math.random()` enters a codebase that otherwise has none.

Each primary still gets its **own** pair of `Tone.Gain` nodes (rate-drift, depth-drift) between its chosen pool oscillator and its own `frequency`/`amplitude` — gains are cheap (a per-sample multiply, no waveform synthesis), and the swing amount is inherently primary-specific: a primary currently at `9.5`Hz has almost no headroom to swing before hitting `LFO_RATE_MAX` (`10`), while one at `5`Hz has plenty — the existing `centeredSwingFromRange()` ([lfoEngine.ts:177](../../src/engine/lfoEngine.ts#L177)) already solves exactly this "bound the swing by the base value's distance to the nearer edge" problem for the primary-to-target case, and this phase reuses it unchanged, just against `{min: LFO_RATE_MIN, max: LFO_RATE_MAX}`/`{min: 0, max: 1}` (the amplitude domain) instead of a modulation target's own range.

### 1.3 Depth Drift must never revive a silenced target

Confirmed directly in interview: a primary whose own Depth is currently `0` (a human's deliberate "off" for that one LFO) must stay silent regardless of global drift — Depth Drift only ever modulates targets already producing sound. Because `centeredSwingFromRange`'s bound is computed from the *current* amplitude, a base of exactly `0` already produces a swing of `0` at the low end — but the pool oscillator's signal is bipolar, so a depth-drift Gain wired straight through would still be capable of swinging the amplitude *up* into positive territory on the upswing half of its cycle, which is exactly the revival this phase must not allow. The fix isn't a smaller swing, it's no connection at all: a primary's depth-drift `Gain` is only ever connected to `lfo.amplitude` while that primary's own depth is `> 0`, and gets disconnected (not just zeroed) the moment depth is set to `0` — re-connected automatically if depth is later raised again. Rate Drift has no equivalent "off" state (a primary's own rate is never `0`, `LFO_RATE_MIN` is `0.1`) — this guard applies to Depth Drift only.

### 1.4 The `Signal.override` bug applies here too, unchanged

`Tone.LFO.frequency` is a `Signal`; `Tone.LFO.amplitude` is a `Param` (confirmed directly against `node_modules/tone/Tone/source/oscillator/LFO.ts`). Both are exactly the two destination kinds `connectLfoTarget`'s own connections to a *target* already had to work around `Signal.override`'s connect-time reset for ([lfoEngine.ts:407-421](../../src/engine/lfoEngine.ts#L407-L421), documented in `docs/AUDIO_SYSTEM.md` as "the worst LFO bug found here"). Wiring a pool-oscillator's Gain into a primary's own `frequency`/`amplitude` is a second, independent `.connect()` call and is exposed to the identical bug — it must disable `override` before connecting and restore the destination's pre-connect value after, reusing the same two-line pattern, not re-deriving it.

### 1.5 A pre-existing gap this phase does not need to fix, but must design around

Direct inspection of `AudioEngine.ts` confirms robot-level seeded-active LFOs are **not** primed into `lfoEngine` anywhere today — `reserveVoice` ([AudioEngine.ts:673](../../src/engine/AudioEngine.ts#L673)) never calls `connectLfoTarget`, and no other robot-spawn code path does either; only `AudioEngine.start()`'s own priming loop connects already-seeded-active **global-chain** targets ([AudioEngine.ts:550-558](../../src/engine/AudioEngine.ts#L550-L558)). A robot's own seeded `lfoSettings.active: true` only actually connects once a human opens that robot's Options screen and the relevant drawer calls `applyLayerLfo` ([robotOptionsActions.ts:122](../../src/systems/robotOptionsActions.ts#L122)). This means the realistic number of simultaneously-active primaries in a typical session is well under the "70-100+" upper bound floated during interview (worth knowing when judging the pool-of-8 sizing, not a reason to change it) — and it means drift **must not** be wired at either of those two call sites individually. Instead, it hooks into `connectLfoTarget`/`disconnectLfoTarget` themselves (§4) — the one choke point every current and future "make an LFO live" path already funnels through, regardless of which of the two priming paths above (or a future third one) triggers it.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── globalAudio.ts              # MODIFIED — GlobalAudioSettings gains lfoDrift: { rateDrift: number;
│                                     #   depthDrift: number }; DEFAULT_GLOBAL_AUDIO_SETTINGS gains
│                                     #   lfoDrift: { rateDrift: 0, depthDrift: 0 }
├── data/
│   ├── globalAudioSeedRanges.ts       # MODIFIED — GlobalAudioSeedFieldKey gains 'lfoDrift.rateDrift' |
│   │                                   #   'lfoDrift.depthDrift'; GLOBAL_AUDIO_SEED_RANGES gains both at
│   │                                   #   { min: -1, max: 1, scale: 'linear' }
│   ├── globalAudioLoadingRanges.ts     # MODIFIED — both new keys, narrow loading sub-window (§7 — no
│   │                                   #   GLOBAL_CHAIN_GRID.md row exists to transcribe, unlike every
│   │                                   #   other entry in this file)
│   ├── globalAudioLoadingRanges.test.ts # MODIFIED if key-coverage is asserted there
│   └── audioRigConfig.ts              # MODIFIED — new standalone LFO_DRIFT_ACCORDION +
│                                        #   LFO_RATE_DRIFT_SCHEMA/LFO_DEPTH_DRIFT_SCHEMA exports
│                                        #   (SliderCenteredZeroSchema, -100..100, unit '%'), following
│                                        #   DECAY_MODE_SCHEMA's existing "global chain-level, not nested
│                                        #   inside any one effect block" precedent — NOT added to
│                                        #   AUDIO_RIG_CONFIG's array (that array's own AudioRigEffectBlock
│                                        #   type requires a matching GlobalAudioSettings effect key,
│                                        #   which lfoDrift, a top-level flag, is not)
│   └── audioRigConfig.test.ts         # MODIFIED
├── utils/
│   ├── globalAudioSeed.ts       # MODIFIED — generateGlobalAudioSettings samples the 2 new fields via
│   │                              #   the existing sampleField() helper, unchanged otherwise
│   └── globalAudioSeed.test.ts  # MODIFIED
├── engine/
│   ├── lfoEngine.ts        # MODIFIED — the drift-pool + per-primary drift-Gain mechanism; see §4.
│   │                        #   New exports: setGlobalRateDrift, setGlobalDepthDrift. connectLfoTarget/
│   │                        #   disconnectLfoTarget/setLfoRate/setLfoDepth all gain new internal calls
│   │                        #   (no signature changes on any of the four).
│   └── lfoEngine.test.ts   # MODIFIED — drift-pool + per-primary swing coverage, see §5
├── stores/
│   ├── audioStore.ts       # MODIFIED — EffectKey's Exclude gains 'lfoDrift'; new setGlobalLfoDrift
│   │                        #   action (bespoke, compressorBeforeDelay-shaped, not GLOBAL_SETTER-routed);
│   │                        #   applyGlobalAudioToEngine pushes lfoDrift too
│   └── audioStore.test.ts  # MODIFIED
└── components/panels/screen/console/
    ├── AudioRigDrawer.tsx      # MODIFIED — new standalone Drift accordion, sibling to the
    │                            #   AUDIO_RIG_CONFIG.map(...) block (not nested inside any effect's own
    │                            #   accordion), wired to globalAudio.lfoDrift / setGlobalLfoDrift
    └── AudioRigDrawer.test.tsx # MODIFIED

docs/
└── AUDIO_SYSTEM.md   # MODIFIED — extend the existing "LFO Modulation" section per §6 of the intent doc
```

**Explicitly not touched, and why** (all three were named in the superseded external plan draft): `src/types/lfo.ts` (drift is not a per-target `LfoSettings` field), `src/components/ui/controls/Lfo.tsx` (no per-target drift UI), `src/data/robotOptionsConfig.ts`/`src/data/companyConfig.ts`/`CompanyOptionsSection.tsx` (no per-robot or per-company drift state exists to add). `src/components/ui/controls/SliderCenteredZero.tsx` is reused completely as-is — no changes to any UI primitive.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No Tone objects outside `src/engine/`** (CLAUDE.md) — the drift pool, its Gains, and every connection between them live in `lfoEngine.ts` alone, matching Phase 0's own constraint that `lfoEngine.ts`/`AudioEngine.ts` are the only files permitted to `import * as Tone`.
* **One global amount, never per-target.** `rateDrift`/`depthDrift` are read from exactly one place (`GlobalAudioSettings.lfoDrift`, via `lfoEngine`'s own module-scope cache of the last-pushed values) and applied identically, in *proportion*, to every connected primary — a primary's own current rate/amplitude changes how large its swing is, never whether drift applies to it at all (except the Depth Drift silence guard, §1.3).
* **The drift-oscillator pool is a fixed constant (8), created lazily on first use, never per-robot or per-target.** `DRIFT_POOL_SIZE` does not scale with robot count, target count, or how many primaries happen to be bound at once.
* **Depth Drift must never move a target off `0`.** Enforced by disconnecting (not merely zeroing) a primary's depth-drift `Gain` whenever its own depth is `0` — confirmed via interview as a deliberate rule.
* **Reuse the `Signal.override` fix; do not re-derive it.** Every new `.connect()` this phase adds (pool oscillator → per-primary Gain → primary's `frequency`/`amplitude`) disables `override` first and restores the destination's pre-connect value after, exactly as `connectLfoTarget` already does for its own target connections.
* **Drift attaches inside `connectLfoTarget`/`disconnectLfoTarget` themselves, not at any call site.** No changes to `AudioEngine.start()`'s priming loop, `robotOptionsActions.ts`'s `applyLayerLfo`, or `audioStore.ts`'s existing `setGlobalLfo` — all three already funnel through `lfoEngine.connectLfoTarget`/`disconnectLfoTarget`, and drift rides along for free once those two functions handle it internally.
* **`layerN.phase` targets (the manual-polling fallback, no live Signal) are out of scope for this phase** — see §7. Drift only attaches to primaries that have a real `Tone.LFO` node connected via `.connect()`.
* **No changes to `docs/COMPONENT_LIBRARY.md`** — `SliderCenteredZero` is reused with no schema or behavior change, so there is nothing new to document there.

---

## 4. Code Style & Architecture Conventions

**`types/globalAudio.ts`** (diff):

```typescript
export interface GlobalAudioSettings {
  globalBypass: boolean;
  compressorBeforeDelay: boolean;
  /** Global, seeded LFO drift amount — applies to every currently-connected
   *  primary Tone.LFO in the app (robot-level and global-chain alike), never
   *  a per-target setting. Both -1.0 to 1.0, default 0.0. See
   *  docs/specs/LFO_DRIFT.md. */
  lfoDrift: { rateDrift: number; depthDrift: number };
  reverb: ReverbSettings;
  // ...unchanged...
}

export const DEFAULT_GLOBAL_AUDIO_SETTINGS: GlobalAudioSettings = {
  globalBypass: false,
  compressorBeforeDelay: false,
  lfoDrift: { rateDrift: 0, depthDrift: 0 },
  // ...unchanged...
};
```

**`data/globalAudioSeedRanges.ts`** (diff):

```typescript
export type GlobalAudioSeedFieldKey =
  | 'compressor.threshold'
  // ...unchanged...
  | 'limiter.threshold'
  | 'lfoDrift.rateDrift'
  | 'lfoDrift.depthDrift';

export const GLOBAL_AUDIO_SEED_RANGES: Record<GlobalAudioSeedFieldKey, SeedRange> = {
  // ...unchanged...
  'limiter.threshold': { min: -20, max: 0, scale: 'linear' },
  'lfoDrift.rateDrift': { min: -1, max: 1, scale: 'linear' },
  'lfoDrift.depthDrift': { min: -1, max: 1, scale: 'linear' },
};
```

`data/globalAudioLoadingRanges.ts` gains the matching narrower pair — see §7 for why `-0.4..0.4` is a first-pass default rather than a grid-sourced value:

```typescript
export const GLOBAL_AUDIO_LOADING_RANGES: Record<GlobalAudioSeedFieldKey, LoadingRange> = {
  // ...unchanged...
  'limiter.threshold': { min: -3, max: -1 },
  'lfoDrift.rateDrift': { min: -0.4, max: 0.4 },
  'lfoDrift.depthDrift': { min: -0.4, max: 0.4 },
};
```

**`utils/globalAudioSeed.ts`** (one new block inside `generateGlobalAudioSettings`, no new helper needed):

```typescript
return {
  globalBypass: defaults.globalBypass,
  compressorBeforeDelay: defaults.compressorBeforeDelay,
  lfoDrift: {
    rateDrift: sampleField(noiseMap, 'lfoDrift.rateDrift'),
    depthDrift: sampleField(noiseMap, 'lfoDrift.depthDrift'),
  },
  compressor: { /* ...unchanged... */ },
  // ...
};
```

**`engine/lfoEngine.ts`** — new module-scope state and functions, added alongside the existing `activeLfos`/`connectedSignals` maps:

```typescript
import alea from 'alea';

const DRIFT_POOL_SIZE = 8;
const DRIFT_RATE_HZ = 0.03; // ~33s cycle, fixed — not exposed anywhere

/** 8 shared secondary oscillators, phase-spread evenly (45° apart) — fixed
 *  and deterministic, not seeded per-planet (only the drift AMOUNT is
 *  seeded; the pool's own relative phases are a structural implementation
 *  detail, the same for every session). Constructed lazily, once, on first
 *  use — never per-robot, never per-target. */
let driftPool: Tone.LFO[] | null = null;

function getOrCreateDriftPool(): Tone.LFO[] {
  if (driftPool) return driftPool;
  driftPool = Array.from({ length: DRIFT_POOL_SIZE }, (_, i) => {
    const lfo = new Tone.LFO({ frequency: DRIFT_RATE_HZ, type: 'sine', phase: (360 / DRIFT_POOL_SIZE) * i });
    if (isAudioContextRunning()) lfo.start();
    return lfo;
  });
  return driftPool;
}

/** Deterministically pick a pool bucket for an instance key — same target
 *  always lands on the same bucket within a session, reusing the
 *  hash-a-string-to-a-float primitive getSeededVal.ts's precomputeDataX
 *  already establishes, no noise map involved. */
function poolIndexForKey(key: string): number {
  return Math.floor(alea(key)() * DRIFT_POOL_SIZE);
}

interface DriftLink {
  poolIndex: number;
  rateDriftGain: Tone.Gain;
  /** null until first connected — see refreshDepthDriftGain's lazy-connect/
   *  disconnect-on-silence behavior (§1.3). */
  depthDriftConnected: boolean;
  depthDriftGain: Tone.Gain;
}
const driftLinks = new Map<string, DriftLink>();

let globalRateDrift = 0; // -1..1, pushed by setGlobalRateDrift
let globalDepthDrift = 0;

/** Wire a bound primary into the shared drift pool — called once from
 *  connectLfoTarget, right after the primary's OWN connection to its target
 *  succeeds. Idempotent (checked via driftLinks, same pattern connectedSignals
 *  already uses for the primary's own connection). */
function attachDrift(key: string, lfo: Tone.LFO): void {
  if (driftLinks.has(key)) return;
  const pool = getOrCreateDriftPool();
  const poolLfo = pool[poolIndexForKey(key)];

  const rateDriftGain = new Tone.Gain(0);
  const depthDriftGain = new Tone.Gain(0);
  poolLfo.connect(rateDriftGain);
  poolLfo.connect(depthDriftGain);

  // Same Signal.override fix connectLfoTarget already applies to its own
  // connection — see docs/specs/LFO_DRIFT.md §1.4.
  (lfo.frequency as unknown as { override?: boolean }).override = false;
  const currentFreq = lfo.frequency.value as number;
  rateDriftGain.connect(lfo.frequency as unknown as Tone.InputNode);
  if (Number.isFinite(currentFreq)) lfo.frequency.value = currentFreq;

  driftLinks.set(key, { poolIndex: poolIndexForKey(key), rateDriftGain, depthDriftGain, depthDriftConnected: false });
  refreshRateDriftGain(key);
  refreshDepthDriftGain(key); // connects depthDriftGain too, iff current depth > 0
}

/** Recompute one primary's rate-drift Gain value from its OWN current rate
 *  (bounded via centeredSwingFromRange, same shape as the primary-to-target
 *  case) and the current global rateDrift amount. Called after attachDrift,
 *  after setLfoRate, and from setGlobalRateDrift for every linked key. */
function refreshRateDriftGain(key: string): void {
  const link = driftLinks.get(key);
  const lfo = activeLfos.get(key);
  if (!link || !lfo) return;
  const currentRate = lfo.frequency.value as number;
  const swing = centeredSwingFromRange({ min: LFO_RATE_MIN, max: LFO_RATE_MAX }, currentRate);
  link.rateDriftGain.gain.value = globalRateDrift * swing.max;
}

/** Recompute one primary's depth-drift Gain — connects it lazily the first
 *  time depth > 0, and DISCONNECTS it entirely (not just zeroes it) whenever
 *  depth is 0, per the Depth-Drift-never-revives-a-silenced-target rule
 *  (§1.3) — a zeroed-but-still-connected Gain can't guarantee that on its
 *  own, since the pool oscillator's own signal is bipolar. */
function refreshDepthDriftGain(key: string): void {
  const link = driftLinks.get(key);
  const lfo = activeLfos.get(key);
  if (!link || !lfo) return;
  const currentAmp = lfo.amplitude.value as number;

  if (currentAmp <= 0) {
    if (link.depthDriftConnected) {
      try { link.depthDriftGain.disconnect(lfo.amplitude as unknown as Tone.InputNode); } catch (err) { devWarn('[lfoEngine] depth-drift disconnect failed', err); }
      link.depthDriftConnected = false;
    }
    return;
  }

  if (!link.depthDriftConnected) {
    (lfo.amplitude as unknown as { override?: boolean }).override = false; // Param has no override concept, harmless — mirrors connectLfoTarget's own defensive symmetry
    const currentValue = currentAmp;
    link.depthDriftGain.connect(lfo.amplitude as unknown as Tone.InputNode);
    lfo.amplitude.value = currentValue;
    link.depthDriftConnected = true;
  }
  const swing = centeredSwingFromRange({ min: 0, max: 1 }, currentAmp);
  link.depthDriftGain.gain.value = globalDepthDrift * swing.max;
}

/** Tear down a primary's drift link — called from disconnectLfoTarget. Pool
 *  oscillators themselves are never disposed here; they're app-lifetime. */
function detachDrift(key: string): void {
  const link = driftLinks.get(key);
  if (!link) return;
  try { link.rateDriftGain.disconnect(); } catch (err) { devWarn('[lfoEngine] rate-drift teardown failed', err); }
  try { link.depthDriftGain.disconnect(); } catch (err) { devWarn('[lfoEngine] depth-drift teardown failed', err); }
  driftLinks.delete(key);
}

function setGlobalRateDrift(value: number): void {
  globalRateDrift = clamp(value, -1, 1);
  for (const key of driftLinks.keys()) refreshRateDriftGain(key);
}

function setGlobalDepthDrift(value: number): void {
  globalDepthDrift = clamp(value, -1, 1);
  for (const key of driftLinks.keys()) refreshDepthDriftGain(key);
}
```

Four existing functions gain one new call each, no signature changes:

- `connectLfoTarget` — right after its own `lfo.connect(signal)` succeeds (the existing `try { lfo.connect(signal...) } catch {...}` block), add `attachDrift(key, lfo)`. The phase-fallback branch (`layerN.phase`, no live Signal) is explicitly skipped — see §7.
- `disconnectLfoTarget` — alongside its existing `activeLfos.get(key)?.disconnect()`, add `detachDrift(key)`.
- `setLfoRate` — after `getOrCreateLfo(key, target, robotId).frequency.value = clamped`, add `refreshRateDriftGain(key)` (a no-op if the key has no drift link yet).
- `setLfoDepth` — after its own `.amplitude.value = clamped / 100` write, add `refreshDepthDriftGain(key)`.

`lfoEngine`'s exported object gains `setGlobalRateDrift`, `setGlobalDepthDrift` alongside the existing exports.

**`stores/audioStore.ts`** (diff):

```typescript
type EffectKey = Exclude<keyof GlobalAudioSettings, 'globalBypass' | 'compressorBeforeDelay' | 'lfoDrift'>;

// ...inside the store...
setGlobalLfoDrift: (partial: Partial<GlobalAudioSettings['lfoDrift']>) => {
  set((state) => ({ globalAudio: { ...state.globalAudio, lfoDrift: { ...state.globalAudio.lfoDrift, ...partial } } }));
  if (partial.rateDrift !== undefined) lfoEngine.setGlobalRateDrift(partial.rateDrift);
  if (partial.depthDrift !== undefined) lfoEngine.setGlobalDepthDrift(partial.depthDrift);
},
```

`applyGlobalAudioToEngine` (used both by `regenerateGlobalAudioFromSeed` and by `AudioEngine.start()`'s re-apply-after-real-nodes-exist step) gains two lines pushing `lfoDrift` the same way every other field is pushed:

```typescript
export function applyGlobalAudioToEngine(globalAudio: GlobalAudioSettings): void {
  AudioEngine.setGlobalCompressor(globalAudio.compressor);
  // ...unchanged...
  lfoEngine.setGlobalRateDrift(globalAudio.lfoDrift.rateDrift);
  lfoEngine.setGlobalDepthDrift(globalAudio.lfoDrift.depthDrift);
  for (const [effectKey, bypassKey] of Object.entries(BYPASS_KEY) /* unchanged */) { /* ... */ }
}
```

Calling `setGlobalRateDrift`/`setGlobalDepthDrift` before any primary is ever connected is safe and cheap — both just update the module-scope `globalRateDrift`/`globalDepthDrift` and loop over an empty `driftLinks` map.

**`data/audioRigConfig.ts`** (new standalone exports, alongside `DECAY_MODE_SCHEMA`):

```typescript
export const LFO_DRIFT_ACCORDION: AccordionSchema = {
  id: 'audioRig.lfoDrift', type: 'accordion', loreLabel: 'ATTENUATION FLUX', humanLabel: 'Drift',
};
export const LFO_RATE_DRIFT_SCHEMA: SliderCenteredZeroSchema = {
  id: 'audioRig.lfoDrift.rateDrift', type: 'sliderCenteredZero', loreLabel: 'CADENCE INSTABILITY', humanLabel: 'Rate Drift', min: -100, max: 100, unit: '%',
};
export const LFO_DEPTH_DRIFT_SCHEMA: SliderCenteredZeroSchema = {
  id: 'audioRig.lfoDrift.depthDrift', type: 'sliderCenteredZero', loreLabel: 'AMPLITUDE INSTABILITY', humanLabel: 'Depth Drift', min: -100, max: 100, unit: '%',
};
```

Percent-to-fraction conversion (`ui / 100` each way) happens at the `AudioRigDrawer.tsx` wiring point, matching how Depth's own `0-100%` UI already maps to `lfoEngine`'s `0-1` internal amplitude domain elsewhere in this same file.

**`components/panels/screen/console/AudioRigDrawer.tsx`** (new section, sibling to the existing `AUDIO_RIG_CONFIG.map(...)` block — not nested inside any effect's own accordion):

```tsx
<div className="audio-rig-drawer__effect-block">
  <AccordionContainer schema={LFO_DRIFT_ACCORDION} contentActive={globalAudio.lfoDrift.rateDrift !== 0 || globalAudio.lfoDrift.depthDrift !== 0}>
    <div className="audio-rig-drawer__param-row">
      <SliderCenteredZero
        schema={LFO_RATE_DRIFT_SCHEMA}
        value={globalAudio.lfoDrift.rateDrift * 100}
        onChange={(v) => setGlobalLfoDrift({ rateDrift: v / 100 })}
        disabled={rigDisabled}
      />
    </div>
    <div className="audio-rig-drawer__param-row">
      <SliderCenteredZero
        schema={LFO_DEPTH_DRIFT_SCHEMA}
        value={globalAudio.lfoDrift.depthDrift * 100}
        onChange={(v) => setGlobalLfoDrift({ depthDrift: v / 100 })}
        disabled={rigDisabled}
      />
    </div>
  </AccordionContainer>
</div>
```

* **Naming Conventions:** `setGlobalRateDrift`/`setGlobalDepthDrift` (engine) and `setGlobalLfoDrift` (store) match the existing verb-first, `Global`-prefixed naming already used for rig-wide (not per-effect) concerns (`setGlobalBypass`, `setGlobalCompressor`).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest.
* **Test File Location:** Colocate, matching every file in §2.
* **`lfoEngine.test.ts` (modified) — the bulk of new coverage:**
  1. The drift pool is constructed lazily — no `Tone.LFO` beyond what already exists is created until the first `connectLfoTarget` call succeeds; a second bound target reuses the existing pool (still exactly 8 pool oscillators, not 16).
  2. Two different instance keys deterministically map to the same pool bucket every time (same key in, same bucket out, across repeated calls) — and, given a representative spread of keys, don't all collapse onto one bucket.
  3. `setGlobalRateDrift`/`setGlobalDepthDrift` update every currently-linked primary's drift-`Gain` value, and are safe no-ops with zero primaries connected.
  4. A primary's rate-drift swing is bounded by `centeredSwingFromRange` against `{LFO_RATE_MIN, LFO_RATE_MAX}` — a primary parked near `LFO_RATE_MAX` gets a smaller swing than one at the domain's midpoint, for the same `globalRateDrift` value.
  5. **The Depth Drift silence guard**: a primary with depth `0` has its depth-drift `Gain` disconnected, not merely zeroed (assert `.disconnect` was called, or that no connection exists) — setting depth back above `0` reconnects it and `setGlobalDepthDrift` immediately reaches it again.
  6. `disconnectLfoTarget` tears down a primary's drift link (`detachDrift`) — reconnecting the same target later re-attaches drift from scratch, not from stale state.
  7. `setLfoRate`/`setLfoDepth` on a target with no drift link yet (never connected) do not throw and do not construct a drift link as a side effect.
  8. A `layerN.phase` target's `connectLfoTarget` call does not attach drift (no drift link created for a phase-fallback key) — confirms the explicit phase exclusion (§7) rather than a silent accidental one.
* **`globalAudioSeed.test.ts` (modified):** `generateGlobalAudioSettings`'s `lfoDrift.rateDrift`/`depthDrift` are within the new loading range on every call for a fixed planet id/name (determinism, matching every other seeded field's existing coverage pattern); both values differ between two different planet names (not a constant).
* **`audioStore.test.ts` (modified):** `setGlobalLfoDrift` updates `globalAudio.lfoDrift` in the store AND calls the matching `lfoEngine.setGlobalRateDrift`/`setGlobalDepthDrift` (spy) — mirroring the existing `setCompressorBeforeDelay` test's shape. `applyGlobalAudioToEngine` calls both `lfoEngine` setters with the given `globalAudio.lfoDrift` values.
* **`audioRigConfig.test.ts` (modified):** the closed-set/coverage assertion this file already runs over `AUDIO_RIG_CONFIG`'s param schema `type`s is unaffected (drift's schemas are standalone exports, not part of that array) — add a direct assertion that `LFO_RATE_DRIFT_SCHEMA`/`LFO_DEPTH_DRIFT_SCHEMA` are both `sliderCenteredZero` with `min: -100, max: 100`.
* **`AudioRigDrawer.test.tsx` (modified):** the Drift accordion renders two `SliderCenteredZero`s; dragging Rate Drift calls `setGlobalLfoDrift({ rateDrift: <fraction> })` with the UI's `%` value divided by 100; the accordion is `disabled` when `globalBypass` is on, matching every other block's `rigDisabled` wiring.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (this is what catches a missed `GLOBAL_AUDIO_LOADING_RANGES`/`GLOBAL_AUDIO_SEED_RANGES` entry for the two new `GlobalAudioSeedFieldKey` members).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** load a fresh planet, open the Audio Rig, confirm a Drift accordion with two centered-zero sliders exists and starts at a nonzero (but modest) seeded position on at least some planets; with an LFO already active and audible (e.g. a global filter frequency LFO), raise Depth Drift and confirm the modulation's depth visibly/audibly wanders over roughly half a minute rather than looping identically; set that same target's own Depth slider to `0` and confirm raising Depth Drift produces no sound at all from that target.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** TBD at Tasks time — likely `feature/lfo-drift`, mirroring `feature/attenuation-style`/`feature/LFO`'s naming.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) types + seed-range tables (`globalAudio.ts`/`globalAudioSeedRanges.ts`/`globalAudioLoadingRanges.ts` + tests), (2) `globalAudioSeed.ts` + test (seeding), (3) `lfoEngine.ts` + test (the drift-pool mechanism — the largest single change, worth its own commit, possibly split further into pool/attach-detach vs. refresh-on-rate/depth-change if it grows unwieldy), (4) `audioStore.ts` + test (wiring), (5) `audioRigConfig.ts`/`AudioRigDrawer.tsx` + tests (UI), (6) `docs/AUDIO_SYSTEM.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and code, not left open):

- ~~Should drift be per-target or global?~~ **Resolved: global, one shared pair** — the entire premise of this spec versus the superseded external draft.
- ~~Should a silenced (depth `0`) target ever audibly flicker from Depth Drift?~~ **Resolved: never** — §1.3, enforced by disconnecting rather than zeroing.
- ~~Independent phase per LFO, or one shared oscillator?~~ **Resolved: a fixed pool of 8**, not fully independent, not fully shared — §1.2.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **`GLOBAL_AUDIO_LOADING_RANGES`'s new `-0.4..0.4` entries are a first-pass default, not sourced from `GLOBAL_CHAIN_GRID.md`** (that doc predates this feature and has no Drift row at all — every other entry in that file is a direct transcription from it; these two are not, and this spec is explicit about that rather than silently implying otherwise). Confirm during manual verification (§5) that a freshly-seeded planet's default drift reads as "subtly alive," not inaudible or overbearing; adjust before merge if not.
2. **`layerN.phase` targets are excluded from drift in this pass.** They have no live `Signal`/`Param` at all (a `scheduleRepeat`-driven manual `.set()` poll, [lfoEngine.ts:329](../../src/engine/lfoEngine.ts#L329)) — extending drift to them would mean modulating the *poll's own* effective rate/depth read each tick, a materially different mechanism from everything else in this spec. Confirm at Plan time whether this exclusion is permanent (phase just never drifts) or a follow-up phase's job — not decided here.
3. **The pre-existing robot-level LFO priming gap (§1.5) is out of scope to fix**, but Plan should double check it doesn't quietly change this phase's own test assumptions — e.g., a manual-check step that expects a seeded-active robot LFO to already be audible on load will fail today for reasons unrelated to drift.
4. **8 as the pool size is the interview's own confirmed number, not independently re-derived here.** If Plan/Implement finds 8 audibly insufits (too much perceptible synchrony, or unnecessary against actual measured node cost), that's a number to revisit with the user, not to change unilaterally.
