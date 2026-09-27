# Phase Spec: Audio Rig V2 (Chorus Removal, Limiter, Chain Reorder, Seeded Bypass, Loading Ranges)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: this session's direct conversation with the user (no `/interview-me` run — requirements were given directly and precisely; see §7 for the two points flagged back for confirmation rather than silently decided). Source of prior art: [docs/specs/AUDIO_RIG.md](AUDIO_RIG.md) (the V1 spec this amends in practice, though not in the document itself — V1 stays a frozen historical record, see §3). Source of target data: [docs/reference/GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md) (to be updated as part of this phase, not just read).

---

## 1. Overview & Claude Explanation

This phase makes four changes to the already-shipped Audio Rig: it removes Chorus from the global chain entirely (state, UI, seeding, engine, LFO targets — the effect doesn't suit this music), adds Tone.js's `Limiter` as a new, fully editable global effect with no LFO target, reorders the global chain to `EQ3 → LPF → HPF → Delay → Reverb → Compressor → Limiter`, and adds one user-facing toggle ("Natural Decay" / "Controlled Decay") that swaps `Compressor` to before `Delay`+`Reverb` instead of after. Reordering the chain has a real structural consequence beyond the audible one: `Compressor` is no longer first, but `AudioEngine.reserveVoice()` currently wires every robot's per-voice bus into the global chain through `getMasterCompressor()` specifically — verified as its only consumer. That accessor is replaced by a new `getGlobalChainEntry()`, returning whichever node is genuinely first (`EQ3`, in both the Natural and Controlled Decay topologies), and the `Compressor`/`Limiter` internal naming drops its "master" framing to match its siblings (`_globalCompressor`, matching `_globalReverb`/`_globalDelay`/etc.) now that it isn't structurally special anymore.

Separately, this phase retires a Phase 0 shim: `audioStore.ts`'s `regenerateGlobalAudioFromSeed` currently force-sets every effect's `enabled` to `true` regardless of what the seed generates — its own doc comment already called this "a deliberate, temporary override, not the long-term design." That override is removed. In its place, `generateGlobalAudioSettings` (`globalAudioSeed.ts`) seeds `enabled` directly: every effect defaults seeded-on except `Delay`, which gets a real 25% chance of seeding active, using the same `getSeededVal`-threshold pattern the already-shipped LFO `active` seeding uses (`activeT >= 0.8` for ~20%; this is `delayEnabledT >= 0.75` for 25%).

Finally, this phase adds a second, narrower seed-sampling range per continuous numeric field — a "loading range" — alongside the existing full range every field already has. The existing range (`GLOBAL_AUDIO_SEED_RANGES`) keeps meaning exactly what it always has: the full valid range for that field, which the UI's sliders already expose in full and which `lfoEngine.ts`'s `resolveLfoOutputRange` must keep using unchanged (an LFO modulating a parameter needs to swing across its *entire* usable range, not just whatever a fresh planet happened to roll). The new, narrower range only bounds what a *fresh seed* is allowed to land on — nothing about the UI or the app's own operating limits changes. Per-field loading-range numbers are now finalized — [docs/reference/GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md) is the authoritative source for both ranges every field carries (its own "Unit / Range" and "Loading Range" columns), confirmed with the user effect-by-effect after the Tone.js verification pass below; `src/data/globalAudioLoadingRanges.ts` is a direct, mechanical transcription of that column, not an independent source of the numbers.

**Two correctness fixes, found while verifying every field's range against Tone.js's own source ahead of the loading-range work (§7) — not part of the original four changes, folded in because they surfaced directly from that review:**

- **`reverb.dampening` is removed — it has never done anything.** `Tone.Reverb` (the installed v15.1.22) has exactly two settable params, `decay` and `preDelay` (plus the inherited `wet`) — verified directly against its `.d.ts` and `.js` source, no `dampening` property exists anywhere on it. `globalFx.ts`'s `setGlobalReverb` sets it anyway through an unsafe cast (`(_globalReverb as unknown as { dampening: number }).dampening = params.dampening`), which silently assigns a property Tone never reads. Every `dampening` slider drag and every seeded `dampening` value, since Phase 0, has been audibly inert. Rebuilding it as a real control (Tone's convolution reverb has no built-in high-frequency damping — a real version would mean inserting an actual `Tone.Filter` into the reverb's own tail) is explicitly out of scope here; this phase just stops pretending it works. `ReverbSettings.dampening`, its `GLOBAL_AUDIO_SEED_RANGES`/eventual loading-range entry, its seed sampling, its UI slider, and its `GLOBAL_CHAIN_GRID.md` row are all removed. Reverb keeps 3 real fields: `decay`, `preDelay`, `wet`.
- **`Delay`'s `maxDelay` becomes explicit.** `globalFx.ts` constructs the `Tone.FeedbackDelay` node without setting `maxDelay`, so it silently defaults to Tone's own default of `1` second — which happens to exactly match `delay.delayTime`'s existing 0–1s UI/seed range, with zero headroom, entirely by implicit coincidence rather than a stated relationship. This phase sets `maxDelay` explicitly (matching the current effective value, `1`) with a comment tying it to `delay.delayTime`'s own range, so the two can't silently drift apart if either is ever changed independently — no audible or numeric change today, purely making an implicit coupling explicit.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── globalAudio.ts               # MODIFIED — remove ChorusSettings/chorus; add LimiterSettings/limiter; add compressorBeforeDelay: boolean; remove ReverbSettings.dampening (non-functional, see Overview); update DEFAULT_GLOBAL_AUDIO_SETTINGS
│   ├── globalAudio.test.ts          # MODIFIED
│   ├── lfo.ts                       # MODIFIED — GlobalLfoTargetId/GLOBAL_LFO_TARGET_IDS drop 'chorus.delayTime' (9 -> 8 global targets; 22 -> 21 total with the 13 robot targets)
│   └── lfo.test.ts                  # MODIFIED
├── data/
│   ├── globalAudioSeedRanges.ts     # MODIFIED — remove chorus.* keys and reverb.dampening; add limiter.threshold key. Stays the FULL/UI-matching range table — unchanged in meaning.
│   ├── globalAudioSeedRanges.test.ts  # MODIFIED
│   ├── globalAudioLoadingRanges.ts  # NEW — the narrower per-field seed-sampling sub-range table (§4). Real values, transcribed directly from GLOBAL_CHAIN_GRID.md's Loading Range column — not invented independently.
│   ├── globalAudioLoadingRanges.test.ts  # NEW — structural tests (field coverage, subset-of-full-range invariant) AND value tests (every entry matches GLOBAL_CHAIN_GRID.md's Loading Range column exactly)
│   ├── audioRigConfig.ts            # MODIFIED — remove chorus block; add limiter block; drop reverb's dampening slider; reorder blocks to match the new chain order; add the Natural/Controlled Decay toggle's schema pair (chain-level, not per-effect — lives alongside AUDIO_RIG_CONFIG, not inside it)
│   └── audioRigConfig.test.ts       # MODIFIED
├── utils/
│   ├── globalAudioSeed.ts           # MODIFIED — remove chorus sampling and reverb.dampening sampling; add limiter sampling; enabled seeding moves here (true for everything except Delay's 25% roll); value sampling switches to GLOBAL_AUDIO_LOADING_RANGES
│   └── globalAudioSeed.test.ts      # MODIFIED
├── engine/
│   ├── audioEngine/
│   │   └── globalFx.ts              # MODIFIED — remove Tone.Chorus/setGlobalChorus/its bypass case; add Tone.Limiter/setGlobalLimiter/its bypass case; remove reverb.dampening's dead cast-set + its _fxParamCache entry; set Delay's maxDelay explicitly (matching delay.delayTime's own range, with a comment tying the two together); rename _masterCompressor -> _globalCompressor; remove getMasterCompressor, add getGlobalChainEntry(); replace the static buildGlobalFxChain wiring with wireGlobalFxChain(controlledDecay: boolean), called once at build time and again on toggle
│   ├── AudioEngine.ts               # MODIFIED — reserveVoice() uses getGlobalChainEntry() instead of getMasterCompressor(); re-exports setGlobalLimiter, drops setGlobalChorus re-export; setEffectBypass's effect-key union drops 'chorus', adds 'limiter'
│   ├── AudioEngine.test.ts          # MODIFIED
│   ├── lfoEngine.ts                 # MODIFIED only in the sense that GlobalLfoTargetId narrows to 8 — no chorus-specific branch existed in this file to remove (verified: globalSeedRangeKey only special-cases 'lpf.'/'hpf.', never chorus)
│   └── lfoEngine.test.ts            # MODIFIED — target-count assertions (8, not 9)
└── stores/
    ├── audioStore.ts                # MODIFIED — GLOBAL_SETTER/BYPASS_KEY/BYPASS_EFFECT_KEYS drop chorus, add limiter; regenerateGlobalAudioFromSeed's force-enabled-true block removed entirely; new compressorBeforeDelay state + setCompressorBeforeDelay action wired to globalFx's wireGlobalFxChain
    └── audioStore.test.ts           # MODIFIED

src/components/panels/screen/console/
├── AudioRigDrawer.tsx               # MODIFIED — drop chorus accordion; add limiter accordion; add the Natural/Controlled Decay toggle row; accordion render order matches the new chain order
└── AudioRigDrawer.test.tsx          # MODIFIED

docs/
├── AUDIO_SYSTEM.md                  # MODIFIED — Signal Graph section (new chain order, both topologies), AudioEngine API listing (setGlobalLimiter, dropped setGlobalChorus, updated setEffectBypass union), LFO Modulation section (8 targets not 9; remove the now-moot chorus.delayTime divergence note), Seeding section (enabled behavior rewritten)
├── reference/GLOBAL_CHAIN_GRID.md   # MODIFIED — remove Chorus rows and the reverb.dampening row; add Limiter row(s); note the new default chain order and the two named topologies
├── todo/roadmap.md               # MODIFIED — Phase 4 "About" text needs another pass (same kind of fix as V1's own Task 13, now stale again re: effect list/count and chain behavior)
└── SESSION_STORAGE.md               # MODIFIED — one-line effect list in the "what's persisted" bullet (Chorus -> Limiter), low-priority
```

**Explicitly out of scope / not touched** (historical record, per this project's established convention — see e.g. how `docs/tasks/LFO_INTEGRATION_PLAN.md` itself was never rewritten when later phases superseded parts of it):
- `docs/specs/AUDIO_RIG.md`, `docs/tasks/AUDIO_RIG.md`, `docs/intent/audio-rig.md` (V1's own frozen record)
- `docs/specs/LFO_INTEGRATION.md`, `docs/tasks/LFO_INTEGRATION_PLAN.md`, `docs/intent/lfo-integration.md` (Phase 0's frozen record)

No new dependency — `Tone.Limiter` ships in the already-installed `tone` package.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Historical docs stay frozen.** `docs/specs/AUDIO_RIG.md`, `docs/tasks/AUDIO_RIG.md`, `docs/specs/LFO_INTEGRATION.md`, `docs/tasks/LFO_INTEGRATION_PLAN.md`, and both `docs/intent/*.md` files are point-in-time records of what those phases decided and shipped at the time — they are not rewritten to reflect V2. Only living-reference docs (`AUDIO_SYSTEM.md`, `GLOBAL_CHAIN_GRID.md`, `roadmap.md`, `SESSION_STORAGE.md`) get updated.
* **`reverb.dampening` is removed outright, not rebuilt.** No code path anywhere may keep writing to a `dampening`-named property on the live `Tone.Reverb` node — that was always a no-op cast, and this phase's job is to stop it, not preserve it under a different name.
* **Delay's `maxDelay` must stay `>= delay.delayTime`'s own max range** (`GLOBAL_AUDIO_SEED_RANGES['delay.delayTime'].max`) — set explicitly in `globalFx.ts` with a comment stating this dependency, so a future change to one doesn't silently invalidate the other the way the implicit default did.
* **`GLOBAL_AUDIO_SEED_RANGES` keeps its existing meaning and its existing consumer.** It stays the full/UI-matching range table; `lfoEngine.ts`'s `resolveLfoOutputRange` must keep resolving against it unchanged. The new `GLOBAL_AUDIO_LOADING_RANGES` table is additive, consumed only by `generateGlobalAudioSettings`'s value-sampling — never by anything LFO-related, and never presented anywhere as a UI bound.
* **Every loading range must be a genuine subset of its field's full range** (`loadingMin >= fullMin && loadingMax <= fullMax`) — a test-level invariant (§5), not just a written convention, so a future edit to either table can't silently widen a "loading" range past what the UI/engine actually supports.
* **Loading-range numbers come from `GLOBAL_CHAIN_GRID.md`, never invented independently.** Every value in `globalAudioLoadingRanges.ts` must match that doc's "Loading Range" column exactly — a mechanical transcription, not a place to make a fresh judgment call. If a number in the grid ever looks wrong during implementation, fix the grid first (with the user), then transcribe — don't silently diverge the code from the doc.
* **`enabled` seeding is per-effect-fixed, not a general per-effect probability table.** Compressor, EQ3, LPF, HPF, Reverb, and Limiter always seed `enabled: true` — only Delay rolls (25%). Do not generalize this into a per-effect probability field unless asked; that's a different, larger design than what was requested.
* **The Natural/Controlled Decay toggle is a fixed two-topology swap, not a general reorder mechanism.** `wireGlobalFxChain(controlledDecay: boolean)` knows exactly two full sequences and rewires by disconnect-then-reconnect-everything on each call — it is not a graph algorithm accepting an arbitrary order. An earlier in-conversation idea about per-accordion up/down arrows for freely reordering all effects is explicitly not part of this phase.
* **`compressorBeforeDelay` is not seeded.** Defaults `false` (Natural Decay) for every planet; only a direct user toggle changes it. If seeding this later turns out to be wanted, that's a follow-up decision, not assumed here.
* **Limiter bypass follows the Compressor precedent** — neutralize via parameter (`threshold` pushed to a passthrough-equivalent, e.g. `0`) rather than physically routing around the node, matching every other non-wet-mix effect's existing bypass style in `setEffectBypass`.
* **No Tone objects outside `src/engine/`** (per [CLAUDE.md](../../CLAUDE.md)) — unchanged from V1, still applies to every file touched here.
* **State stays serializable** — `compressorBeforeDelay: boolean` and `LimiterSettings` are plain JSON-safe data, consistent with the rest of `GlobalAudioSettings`.

---

## 4. Code Style & Architecture Conventions

### Types (`src/types/globalAudio.ts`)

```typescript
// REMOVE ChorusSettings entirely.

export interface LimiterSettings {
  enabled: boolean;
  /** dB — the only controllable Tone.Limiter param (internally wraps a Compressor
   *  with a fixed ratio=20/attack=0.003/release=0.01, none of which are exposed). */
  threshold: number;
}

export interface GlobalAudioSettings {
  globalBypass: boolean;
  /** false = Natural Decay (Compressor after Delay+Reverb, tails ring out uncompressed).
   *  true = Controlled Decay (Compressor before Delay+Reverb). Not seeded — always
   *  starts false; only a direct user toggle changes it. */
  compressorBeforeDelay: boolean;
  reverb: ReverbSettings;
  delay: DelaySettings;
  compressor: CompressorSettings;
  eq3: EQ3Settings;
  filterLPF: FilterSettings;
  filterHPF: FilterSettings;
  limiter: LimiterSettings;
  // chorus: REMOVED
}

export const DEFAULT_GLOBAL_AUDIO_SETTINGS: GlobalAudioSettings = {
  globalBypass: false,
  compressorBeforeDelay: false,
  reverb: { enabled: true, decay: 1.5, preDelay: 0.02, dampening: 3000, wet: 0.3 },
  delay: { enabled: false, delayTime: 0.25, feedback: 0.2, wet: 0.15 },
  compressor: { enabled: false, threshold: -24, ratio: 2, attack: 0.003, release: 0.25, knee: 6 },
  eq3: { enabled: false, low: 0, mid: 0, high: 0 },
  filterLPF: { enabled: false, type: 'lowpass', frequency: 20000, Q: 1 },
  filterHPF: { enabled: false, type: 'highpass', frequency: 20, Q: 1 },
  limiter: { enabled: false, threshold: -12 },
  // chorus entry REMOVED
};
```

### The two chain topologies (`src/engine/audioEngine/globalFx.ts`)

```typescript
/**
 * Rewires the global chain into one of exactly two known topologies.
 * Disconnects every node and reconnects the full sequence — simpler and more
 * robust than a minimal partial reroute. A brief audio glitch on toggle is
 * acceptable; the user is intentionally changing routing.
 */
export function wireGlobalFxChain(controlledDecay: boolean): void {
  const chainNodes = controlledDecay
    ? [_globalEQ, _globalLPF, _globalHPF, _globalCompressor, _globalDelay, _globalReverb, _globalLimiter]
    : [_globalEQ, _globalLPF, _globalHPF, _globalDelay, _globalReverb, _globalCompressor, _globalLimiter];
  // ... disconnect all, then connect chainNodes[i] -> chainNodes[i+1], last -> masterGain -> Destination,
  // filtering Boolean() the same way buildGlobalFxChain's existing chainNodes construction already does.
}

/** Whichever node robots' per-voice busses connect into — first in BOTH
 *  topologies (EQ3), so this does not need to vary with controlledDecay.
 *  Replaces getMasterCompressor(), which existed only because Compressor used
 *  to be structurally first — it no longer is, in either topology. */
export function getGlobalChainEntry(): Tone.EQ3 | null {
  return _globalEQ;
}
```

`AudioEngine.ts`'s `reserveVoice()` changes its one call site from `getMasterCompressor()` to `getGlobalChainEntry()` — everything else about per-robot bus construction (panner → busGain → busFilter → chain entry) is unchanged.

### Seeded `enabled` (`src/utils/globalAudioSeed.ts`)

```typescript
/** 25% chance Delay seeds active — mirrors the shipped LFO active-threshold
 *  pattern (activeT >= 0.8 for ~20%), same getSeededVal/dot-namespaced-dataId
 *  convention as every other seeded field. */
const DELAY_ENABLED_THRESHOLD = 0.75;

export function generateGlobalAudioSettings(planetId: string, planetName: string): GlobalAudioSettings {
  const noiseMap = getPlanetNoiseMap(planetId, planetName);
  const delayEnabledT = getSeededVal(noiseMap, 'globalAudio.delay.enabled', 0, 0, 1);

  return {
    globalBypass: DEFAULT_GLOBAL_AUDIO_SETTINGS.globalBypass,
    compressorBeforeDelay: DEFAULT_GLOBAL_AUDIO_SETTINGS.compressorBeforeDelay,
    compressor: { enabled: true, /* ...sampled fields, per loading range */ },
    eq3: { enabled: true, /* ... */ },
    filterLPF: { enabled: true, type: 'lowpass', /* ... */ },
    filterHPF: { enabled: true, type: 'highpass', /* ... */ },
    reverb: { enabled: true, /* ... */ },
    limiter: { enabled: true, /* ... */ },
    delay: { enabled: delayEnabledT >= DELAY_ENABLED_THRESHOLD, /* ... */ },
  };
}
```

`sampleField()`'s internals switch from `scaleUnitValue(t, GLOBAL_AUDIO_SEED_RANGES[key])` to `scaleUnitValue(t, GLOBAL_AUDIO_LOADING_RANGES[key])` — same `t` draw, narrower target range, same log/linear scale (read from `GLOBAL_AUDIO_SEED_RANGES[key].scale`, not duplicated onto the loading table).

### Loading ranges (`src/data/globalAudioLoadingRanges.ts`)

```typescript
/**
 * Narrower per-field seed-sampling sub-ranges — bounds what a FRESH SEED can
 * roll, never what the UI exposes or what the app can do. GLOBAL_AUDIO_SEED_RANGES
 * (globalAudioSeedRanges.ts) stays the full/UI-matching range and is what
 * lfoEngine.ts's resolveLfoOutputRange keeps using — never this table.
 *
 * Values are a direct transcription of docs/reference/GLOBAL_CHAIN_GRID.md's
 * "Loading Range" column — that doc is the source of truth; this file mirrors
 * it, it doesn't decide it. If a value here and the grid ever disagree, the
 * grid is right and this file has drifted.
 */
import type { GlobalAudioSeedFieldKey } from './globalAudioSeedRanges';

export interface LoadingRange {
  min: number;
  max: number;
}

export const GLOBAL_AUDIO_LOADING_RANGES: Record<GlobalAudioSeedFieldKey, LoadingRange> = {
  'eq3.low': { min: -6, max: 6 },
  'eq3.mid': { min: -6, max: 6 },
  'eq3.high': { min: -6, max: 6 },
  'filterLPF.frequency': { min: 2000, max: 20000 },
  'filterLPF.Q': { min: 0.1, max: 5 },
  'filterHPF.frequency': { min: 20, max: 500 },
  'filterHPF.Q': { min: 0.1, max: 5 },
  'delay.delayTime': { min: 0.05, max: 0.5 },
  'delay.feedback': { min: 0, max: 0.4 },
  'delay.wet': { min: 0, max: 0.3 },
  'reverb.decay': { min: 0.5, max: 4 },
  'reverb.preDelay': { min: 0, max: 0.1 },
  'reverb.wet': { min: 0.1, max: 0.4 },
  'compressor.threshold': { min: -24, max: -6 },
  'compressor.ratio': { min: 1.5, max: 4 },
  'compressor.attack': { min: 0.003, max: 0.05 },
  'compressor.release': { min: 0.05, max: 0.3 },
  'compressor.knee': { min: 2, max: 15 },
  'limiter.threshold': { min: -3, max: -1 },
};
```

### The Decay toggle (`src/data/audioRigConfig.ts` + `AudioRigDrawer.tsx`)

```typescript
// audioRigConfig.ts — chain-level, not per-effect, so it lives alongside
// AUDIO_RIG_CONFIG rather than inside any one block.
export const NATURAL_DECAY_SCHEMA: ToggleSchema = { id: 'audioRig.compressorBeforeDelay', type: 'toggle', humanLabel: 'Natural Decay' };
export const CONTROLLED_DECAY_SCHEMA: ToggleSchema = { id: 'audioRig.compressorBeforeDelay', type: 'toggle', humanLabel: 'Controlled Decay' };
```

```typescript
// AudioRigDrawer.tsx — schema swapped by current value, so the label always
// names whichever state is currently active (see §7, open question).
<Toggle
  schema={globalAudio.compressorBeforeDelay ? CONTROLLED_DECAY_SCHEMA : NATURAL_DECAY_SCHEMA}
  value={globalAudio.compressorBeforeDelay}
  onChange={setCompressorBeforeDelay}
/>
```

* **Naming Conventions:** unchanged from V1 — camelCase data configs, `sc-` prefix reserved for Phase 1 primitives, `audio-rig-drawer` prefix for this drawer's own layout classes.
* **Formatting:** unchanged from V1.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library, unchanged.
* **Coverage targets specific to this phase:**
  1. `globalAudio.test.ts` — `LimiterSettings`/`compressorBeforeDelay` present; no `chorus` field anywhere on `GlobalAudioSettings` or its default.
  2. `lfo.test.ts` — `GLOBAL_LFO_TARGET_IDS` has exactly 8 members, `'chorus.delayTime'` absent.
  3. `globalAudioSeedRanges.test.ts` — no `chorus.*` keys; `limiter.threshold` present with a real min/max/scale.
  4. `globalAudioLoadingRanges.test.ts` — **structural only**: one entry per `GlobalAudioSeedFieldKey` (same key set as `GLOBAL_AUDIO_SEED_RANGES`, so the two tables can't silently drift apart), and the subset invariant (`loadingMin >= fullMin && loadingMax <= fullMax`) holds for every key — trivially true against placeholders, but the test exists now so it fails loudly the moment a real number violates it later.
  5. `globalAudioSeed.test.ts` — determinism preserved; `enabled` is `true` for every effect except `delay` across a single sample; a statistical spot-check (same style as the LFO active-threshold test) that `delay.enabled` is `true` for roughly 1-in-4 planets across a sample, not roughly all or none; sampled values fall within `GLOBAL_AUDIO_LOADING_RANGES`, not just the full range.
  6. `AudioEngine.test.ts` — `reserveVoice()` wires into whatever `getGlobalChainEntry()` returns, not a compressor-specific accessor; `getGlobalChainEntry()` returns the EQ3 node in both topologies; a new test group for `wireGlobalFxChain` covering both the Natural and Controlled Decay connection sequences (mocked Tone, asserting `.connect()` call order per node, matching this file's existing style for chain-construction tests).
  7. `audioStore.test.ts` — `GLOBAL_SETTER`/`BYPASS_KEY` have no `chorus` entry and a `limiter` entry; `regenerateGlobalAudioFromSeed` no longer force-overrides `enabled` (assert it passes the seeded value straight through, including a case where `delay.enabled` comes back `false`); new `setCompressorBeforeDelay` action updates state and calls `wireGlobalFxChain`.
  8. `AudioRigDrawer.test.tsx` — no Chorus accordion renders; a Limiter accordion renders with exactly one param (threshold) and no nested LFO accordion; the Decay toggle renders, defaults to the "Natural Decay" label, and clicking it calls `setCompressorBeforeDelay` and (after a state update) flips the label to "Controlled Decay".
* **Verification Steps:** `npm run build:types`, `npm run lint`, `npm test` (full suite), `npm run build` — all clean, same bar as V1.
* **Manual/audible check (deferred to a human, same as V1's Task 9/12):** with the dev server running, confirm the Limiter is audibly transparent at its default threshold, confirm both Decay toggle states are audibly distinct on a signal with delay/reverb active, and confirm chorus is genuinely gone (no residual dry/wet artifact from a leftover disconnected node).

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch:** continues on `features/audio-rig-hookup` unless directed otherwise (no new branch requested).
* **Commit Pattern:** unchanged from V1 — short, imperative, descriptive sentences, roughly one commit per task once this spec's Plan/Tasks breakdown exists.

---

## 7. Open Questions & Risks

Both ambiguities from the initial draft are now confirmed by the user directly — recorded here for traceability, no longer open:

1. **"Controlled Decay" moves Compressor before both Delay and Reverb** — confirmed. `wireGlobalFxChain`'s Controlled sequence is `EQ3 → LPF → HPF → Compressor → Delay → Reverb → Limiter`, exactly as drafted in §4; no third topology to design.
2. **The Decay toggle's label tracks the current state** — confirmed. The dynamic-schema-swap approach in §4 (`compressorBeforeDelay ? CONTROLLED_DECAY_SCHEMA : NATURAL_DECAY_SCHEMA`) is correct as written; no change needed. Noted for implementation: this is a deliberately different convention from the rig-wide `Bypass` toggle's static label, not an inconsistency to "fix" later.
3. **`reverb.dampening` is removed, not rebuilt as a real control** — confirmed. Found while verifying every field's range against Tone.js's own source ahead of the loading-range work; see Overview. Making it genuinely functional would mean inserting a real `Tone.Filter` into the reverb's tail — explicitly out of scope; this phase only stops the dead cast-set from pretending it does anything.

Remaining lower-stakes items, decided in this spec rather than left open:

4. **`_masterCompressor` → `_globalCompressor` rename** (§1/§4) is proposed as a recommended cleanup, not a hard requirement — it's naming consistency, not correctness. Skip it if it adds unwanted diff noise to an otherwise-focused change.
5. **Loading-range numeric values are resolved, not deferred.** §2/§4's `GLOBAL_AUDIO_LOADING_RANGES` now ships real per-field values, confirmed with the user effect-by-effect and recorded as the authoritative "Loading Range" column in [docs/reference/GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md). §5's tests should assert real value-correctness against that column, not just structural placeholder-passing.
6. **`GLOBAL_CHAIN_GRID.md`'s updated shape is resolved, not left to Plan/Tasks.** The doc itself now carries both ranges (added a "Loading Range" column), the Chorus rows and the dead `dampening` row are gone, a Limiter row exists, and the chain-order/two-topology note sits at the top of the file. Nothing left to design here.
