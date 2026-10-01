# Phase Spec: LFO Bank (four shared LFOs replace per-target instances)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`
> - Perf harness: `npm run perf` (see `docs/PERFORMANCE.md`; foreground, one call at a time, same-session A/B, pinned worlds `charlie:200:-30` and `bravo:-150:90`)

Source of intent: [docs/intent/lfo-bank.md](../intent/lfo-bank.md) (confirmed 2026-10-01 via `idea-refine` + `interview-me`). Supersedes the per-target LFO design that the Robot LFO Priming fix (roadmap 17.2.7, [LFO_LOAD_FIX.md](LFO_LOAD_FIX.md)) just finished priming. Every decision listed in the intent's "Behavior" and "Out of scope" sections is taken as settled here and not re-opened; this spec only decides what the intent left to it ("Known implementation note").

Survey basis (2026-10-01, against `bug/LFO-load` at 08bae3a2 — 14 commits ahead of `main`, the full 17.2.7 series committed):

- **One `Tone.LFO` per connected target today.** `lfoEngine.ts` keys live nodes by `instanceKey(target, robotId)` (`activeLfos`, `settingsByKey`, `connectedSignals`), lazily constructs them in the setters (`getOrCreateLfo`), and connects each through `connectAdditively` with `lfo.min/max` set from `centeredSwingFromRange(range, currentValue)`. Robot targets resolve through `AudioEngine.getRobotModulationTarget` (gain → the layer's `Tone.Gain.gain` Param, detune → the oscillator's `detune` Signal, phase → `null`), global targets through `getGlobalModulationTarget`.
- **Phase is a control-rate poll, not a connection.** `layerN.phase` targets run `startPhaseFallback` — a `beatClock.scheduleRepeat('16n')` that re-`set()`s the layer phase via `AudioEngine.updateVoiceLayerParams`. `lfoAllowed` never counts them. The intent cuts phase as a target; this whole branch, `waveformUnit`, `PHASE_CENTER_DEGREES`, `PHASE_POLL_INTERVAL`, and the `beatClock` import go with it.
- **Drift is two pools of secondary LFOs plus a Gain pair per primary.** `lfoDrift.ts` keeps `driftPools` (`globalFx`: 7 nodes, `robots`: 8 nodes, all at `DRIFT_RATE_HZ = 0.03`, phase-spread), and per connected primary a `rateDriftGain` → `lfo.frequency` and a `depthDriftGain` → `lfo.amplitude` (the latter disconnected while depth is 0 — the "never revive a silenced target" guard). Amounts live in `GlobalAudioSettings.lfoDrift[group]` (`-1..1`, seeded from `GLOBAL_AUDIO_LOADING_RANGES` ±0.7, step 0.01), pushed by `audioStore.setGlobalLfoDrift` and `applyGlobalAudioToEngine`. `sessionDiff.ts` quantizes them on capture and `migrateLfoDrift` back-fills missing groups on load.
- **The Audio Load Budget's LFO tiers are three things**, all installed by `audioBudgetSystem.applyLfoTiers`: a `policy` predicate (`lfoAllowed`: EQ-gain LFOs always, `lpf.*`/`hpf.*` only when `filterLfosEnabled`, robot LFOs while `connectedRobotLfos < maxRobotLfos`), `setDriftEnabled`, and `reconcileLfos` + `syncHeldOff`. `maxRobotLfos` comes from `robotLfoCap` (4 → 12, plateau at `ROBOT_LFO_CAP_FULL = ROBOT_LFO_CAP_STANDARD` since df689ba8). The held-off machinery (`requested`, `heldOff`, `reconcilePasses`, `suspendConnection`, `subscribeHeldOff`, `getHeldOffLfoKeys`, `emitHeldOffIfChanged`; `audioStore.heldOffLfoKeys`/`setHeldOffLfoKeys`; `HeldOffNote`; `heldOff` props on `Lfo`, `LfoTargetGroup`, `SignatureArrayDrawer.heldOffTargets`, `RobotOptionsTab`'s `heldOffTargets` selector, `AudioRigLfoGroup`'s `heldOff` selector) exists only to serve the robot cap and the filter switch. `driftHeldOff`/`setDriftHeldOff` greys the drift sliders.
- **Three places connect LFOs from state**: `audioStore.setGlobalLfo` (user edit), `AudioEngine.start()`'s global loop then `primeRosterLfos` (power-on), and `robotLfoPriming.applyRobotLfoToEngine` (spawn, re-register, structural rebuild, session override, `applyLayerLfo`). `localeStore.clearRobots`/`removeRobot` call `disposeRobotLfos`. `applyLayersStructural` re-primes after `reReserveVoice` (the stale-signal rewire).
- **Seeding today**: `generateRobotLfoSettings(noiseMap, offset)` in `spawnSystem.ts` draws `shape`/`quiet`/`rate`/`depth` per target from the locale map under `robot.lfo.<target>.<field>` keys, `LFO_QUIET_THRESHOLD = 0.7` (≈30% on — the Load Fix docs say 25%, the code says 0.7; this spec carries the 0.7 value forward and corrects the docs). `generateGlobalLfoSettings` in `globalAudioSeed.ts` draws the 7 global targets from the Attenuation Style map under `globalLfo.<target>.<field>`, `LFO_QUIET_THRESHOLD = 0.34` (≈66% on), rate from `[1, 4]` Hz, depth `[20, 50]`, shapes triangle/sine only. Robot rate samples the full `[0, 20]`, depth the full `[0, 100]`.
- **Where the UI lives**: robot layer targets render through `LfoTargetGroup` (select a row, edit the one shared `Lfo` display — Shape radio + Rate + Depth) inside `SignatureArrayLayer`; the EQ/LPF/HPF panels use the parallel `AudioRigLfoGroup` in `AudioRigDrawer.tsx` (a copy of the composition made for Rules-of-Hooks reasons). `useLfoTargetGroup` owns the row-selection state machine and a `timelineMap` GSAP transition scaffold. Drift renders in `FleetDriftPanel` (`globalFx`) and `RobotDriftPanel` (`robots`), the two leaves of the `fleetDrift` Fleet Params group (`FleetParamsContent.tsx`, `navTreeConfig.ts`, `useNavTree.ts`'s `FLEET_PARAMS_GROUPS`/`FLEET_PARAMS_GROUP_FIRST_LEAF`, `uiStore.ts`'s `FleetParamsGroup` and `SelectedFleetParamsEffect` — `'globalDrift' | 'robotDrift'`). The company Signature Array section (`CompanyOptionsSection.tsx`) broadcasts an `LfoValue` patch per target through `applyLayerLfo` to each member.
- **Persistence today**: `Robot.lfoSettings`, `CompanyOptionsSnapshot.lfoSettings`, `audioStore.globalLfo`, `GlobalAudioSettings.lfoDrift`; `RobotAudioOverrideDiff.lfoSettings`, `SessionPayload.globalLfo` (`SessionPayloadVersion = 1`); compact share keys `lf`/`gl` with `{ s, r, d }` per target. The loaders filter LFO keys against `ROBOT_LFO_TARGET_IDS`.
- **Measured baseline** (`docs/PERFORMANCE.md`, 2026-10-01, fixed build with the cap at 12): median peak render capacity 0.413 on `charlie`, 0.443 on `bravo` at Full; ≈18 robot LFOs seeded on, 12 connected under the cap; each connected audio-rate robot LFO measured ≈ +0.033 capacity in that run.
- **Not re-primed today on an Attenuation Style switch while audio runs**: `regenerateGlobalLfoFromSeed` is data-only and nothing re-primes the global LFOs until the next `AudioEngine.start()`. Existing behaviour, outside this phase's scope; noted in §7 so the bank inherits it knowingly rather than silently.

ASSUMPTIONS I'm making (correct now or I'll proceed with these):

1. **Lane ids are `'a' | 'b' | 'c' | 'd'`** (`LfoLaneId`, `LFO_LANE_IDS`). Short, stable, order-carrying, and what a share link stores; the user-facing names come from `src/content/` and can change freely without touching data.
2. **The bank lives in `audioStore` as its own top-level field, `lfoBank: Record<LfoLaneId, BankLfoSettings>`**, next to the global links — not inside `GlobalAudioSettings`, which is the effect-chain record routed through `GLOBAL_SETTER`. `GlobalAudioSettings.lfoDrift` is deleted; the drift amounts move onto each lane. Seeded from the **Attenuation Style** noise map (the same map and re-seed trigger `globalLfo` uses today), so the four lanes are a property of the Attenuation Style and the robot links a property of the locale — together, "per world", exactly how global vs robot LFO settings split today.
3. **Per-target state is `LfoLink = { lane: LfoLaneId | null; depth: number }`**, stored under a *new* field name everywhere (`Robot.lfoLinks`, `CompanyOptionsSnapshot.lfoLinks`, `audioStore.globalLfoLinks`, `RobotAudioOverrideDiff.lfoLinks`, `SessionPayload.globalLfoLinks` + `SessionPayload.lfoBank`). Renaming rather than reusing `lfoSettings`/`globalLfo` is what makes "drop, don't migrate" mechanical: an old payload's `lfoSettings`/`globalLfo`/`globalAudio.lfoDrift` keys are simply unknown and stripped, and the seed fills the new fields. `SessionPayloadVersion` becomes `2`; a `version: 1` payload or share link still loads everything else.
4. **The graph is: lane oscillator → lane trunk Gain → one link Gain per target → `connectAdditively` into the target's Signal/Param.** The trunk (rests at gain 1) is where the lane's depth-drift secondary adds its wobble; the bank LFO's own `amplitude` stays pinned at 1 and `min/max` at −1/1 so every link sees the same unit signal. This is the one deviation from the intent's "four oscillators plus one Gain per link, nothing else": four extra Gains total, needed because `centeredSwingFromRange({0,1}, 1)` is a zero swing — depth drift could not modulate an amplitude resting at its ceiling. Rate drift adds into `lfo.frequency` exactly as `refreshRateDriftGain` does today.
5. **Depth has the same meaning per link as today**: link gain = `(depth / 100) × swing.max`, where swing is `centeredSwingFromRange(resolveLfoOutputRange(target), currentValue)` read at link time. Lane depth-drift scales every link on the lane through the trunk; the per-primary "never revive a silenced target" guard is replaced by a simpler rule — a link at `depth: 0` has gain 0 and the trunk cannot raise it (multiplicative, not additive). No drift Gain pair per link exists any more.
6. **`filterLfosEnabled` keeps a UI signal, but only for the filter links.** The engine keeps the link record and suspends/restores the `lpf.*`/`hpf.*` link Gains behind one flag (`setFilterLinksEnabled`); `audioStore` gets a derived `filterLinksHeldOff` boolean (written by `audioBudgetSystem` like `driftHeldOff`) that greys the LPF/HPF lane pickers with a `HeldOffNote`. Everything else in the held-off machinery is deleted (intent §Load dial). `HeldOffNote` itself stays — drift and the filter pickers still use it.
7. **Robot link seeding is roster-aware and still pure.** `generateRobotLfoLinks(noiseMap, offset, priorLaneCounts)` takes the lane tally of the robots already spawned in the locale (computed by `spawnRobot` from `localeStore` at that moment); the fixed 12-robot roster spawns in deterministic order, so the same world always yields the same links. Within one robot the tally updates as its 6 targets draw. Global links tally only across the 7 global targets (they seed at Attenuation Style time, before any robot exists). Weight per lane = `1 / (1 + count)`, cumulative pick on a single seeded draw.
8. **Bank rate seeding uses four fixed, adjacent, log-spaced bands** (`LFO_BANK_RATE_BANDS`, Hz): `a` 0.1–0.4, `b` 0.4–1.5, `c` 1.5–4, `d` 4–8 — one slow, one fast, two between, each jittered within its band by its own seeded draw, quantized to `LFO_RATE_STEP = 0.05`. The bands are seed-only bounds; the user slider stays `[LFO_RATE_MIN, LFO_RATE_MAX]` = `[0, 20]`. Shapes seed from the smooth two (`triangle`/`sine`, the existing global `LFO_LOADING_SHAPES`), all four reachable by hand. Drift amounts seed from the existing ±0.7 loading window, step 0.01. The numbers are a first tuning for the listening pass, not sacred.
9. **Seeded depth is never 0**: the robot depth seed draws from `[ROBOT_LFO_DEPTH_SEED_MIN = 1, LFO_DEPTH_MAX]` (today's full range with the zero rung removed; quantized to whole percent); the global draw's `[20, 50]` window already excludes it. Only a target that rolled a lane draws a depth; a `null` target stores `depth: 0`.
10. **The per-row UI is inline, not a shared display.** Each targetable slider row (Gain/Detune per layer; Low/Mid/High; Frequency/Q) renders its own `LfoLink` control (lane `RadioButton` with an Off option + one Depth slider) directly beneath the slider. `LfoTargetGroup`, `useLfoTargetGroup`, `AudioRigLfoGroup`, `NEUTRAL_LFO_VALUE`, the `lfo-target-group-*` timelines, and `Lfo.tsx` are deleted. With only two small controls per target the select-then-edit indirection no longer earns its state machine. (§7 lists the alternative if this reads as clutter on the EQ panel.)
11. **The LFO Bank accordion has four leaves, one per lane**, each a `LfoBankLanePanel` (Shape radio, Rate slider, Rate Drift and Depth Drift centered sliders, `HeldOffNote` while drift is held off). Group id `lfoBank`, trait `timeSpace`, between Pacing and EQ & Filters, replacing `fleetDrift`, `FleetDriftPanel`, `RobotDriftPanel`, `LFO_DRIFT_GROUPS`, and the `'globalDrift' | 'robotDrift'` members of `SelectedFleetParamsEffect` (replaced by `'laneA' | 'laneB' | 'laneC' | 'laneD'`).
12. **Power-on priming order**: `AudioEngine.start()` pushes the bank first (`primeLfoBank` — four nodes created, settings applied, started at `Tone.now() + MIN_LEAD`), then the global links, then `primeRosterLinks`. Links before the bank would connect trunk Gains to oscillators that don't exist yet; the order is pinned by a test.
13. **The stale-signal rewire survives**: `robotLfoPriming.ts` becomes `robotLfoLinks.ts` with `applyRobotLinkToEngine`/`primeRobotLinks`/`primeRosterLinks`; `linkTarget` detects a changed Signal for an existing key and re-wires, the same `connectedSignals` check as today. Round-robin request ordering is gone with the cap — `primeRosterLinks` is a plain roster loop.
14. **Free | Sync is untouched here.** `docs/specs/FREE_SYNC_TOGGLE.md` and its plan get one dated note that they are to be re-planned against the bank (four lane toggles + Delay Time) after this lands; no other edit.
15. **Roadmap slot is 17.2.8 "Performance: LFO Bank"**, sibling of 17.2.7, unless Crawford prefers a standalone number.

---

## 1. Overview & Claude Explanation

Today every modulated parameter owns a private `Tone.LFO`, a drift Gain pair and a slot in a per-robot cap, and the moment the Load Fix made the seeded robot LFOs real the audio thread saturated. This phase replaces all of that with an **LFO Bank**: four world-level oscillators (lanes a–d), each with its own shape, rate, rate drift and depth drift, edited in one Fleet Params accordion. A modulation target no longer *is* an LFO; it *links to* one — storing just a lane (or none) and a depth — and the engine hangs a single Gain off that lane for it. Every link on a lane moves in lockstep by design. The cap, the held-off bookkeeping, the phase-polling fallback, the drift pools and the per-target Shape/Rate controls all go away; `filterLfosEnabled` and drift-off at Light remain as the only two load effects on modulation. Seeded worlds get four lanes spread across slow-to-fast, with targets distributed across lanes by a draw that leans toward the least-used lane. Old sessions and share links keep everything except their LFO data, which re-seeds.

### 1.1 Data shapes (`src/types/lfo.ts`)

```ts
export type LfoLaneId = 'a' | 'b' | 'c' | 'd';
export const LFO_LANE_IDS: readonly LfoLaneId[] = ['a', 'b', 'c', 'd'];

/** One bank LFO — world-level, app-lifetime; the only place shape/rate live now. */
export interface BankLfoSettings {
  shape: LfoShape;
  /** Hz, LFO_RATE_MIN..LFO_RATE_MAX. 0 is a legal user value (the lane holds still); the seed never emits it. */
  rate: number;
  /** -1..1, step 0.01 — the former lfoDrift[group].rateDrift, now per lane. */
  rateDrift: number;
  /** -1..1, step 0.01 — the former lfoDrift[group].depthDrift, now per lane. */
  depthDrift: number;
}

/** What a modulation target stores. `lane: null` = not in the graph at all. */
export interface LfoLink {
  lane: LfoLaneId | null;
  /** Percent, LFO_DEPTH_MIN..LFO_DEPTH_MAX. A user may set 0 with a lane; the seed never does. */
  depth: number;
}

export type RobotLfoTargetId =
  | 'layer0.gain' | 'layer0.detune'
  | 'layer1.gain' | 'layer1.detune'
  | 'layer2.gain' | 'layer2.detune';   // 6 — phase targets cut
```

Removed from `lfo.ts`: `LfoSettings`, `DriftGroupId`, `DRIFT_GROUP_IDS`, the three `layerN.phase` members. Kept: `LfoShape`/`LFO_SHAPES`, `GlobalLfoTargetId`/`GLOBAL_LFO_TARGET_IDS` (7, unchanged), `LfoTargetId`, the four `LFO_RATE_*`/`LFO_DEPTH_*` bounds. `LfoValue` in `types/controls.ts` becomes `export type LfoLinkValue = LfoLink` (the `Lfo` primitive it aliased for is gone, see §1.5).

`src/data/lfoConfig.ts`: `DEFAULT_LFO_SETTINGS` → `DEFAULT_LFO_LINK: LfoLink = { lane: null, depth: 0 }` (one fresh object per target via a factory, as today) and `DEFAULT_BANK_LFO: BankLfoSettings = { shape: 'sine', rate: 0, rateDrift: 0, depthDrift: 0 }`.

Stores: `Robot.lfoLinks?: Record<RobotLfoTargetId, LfoLink>`; `CompanyOptionsSnapshot.lfoLinks?: Partial<Record<RobotLfoTargetId, LfoLink>>`; `audioStore.globalLfoLinks: Record<GlobalLfoTargetId, LfoLink>`; `audioStore.lfoBank: Record<LfoLaneId, BankLfoSettings>`; `audioStore.driftHeldOff` stays; `audioStore.filterLinksHeldOff` (new, derived); `audioStore.heldOffLfoKeys` and `GlobalAudioSettings.lfoDrift` deleted. All JSON-serialisable; no node ever enters Zustand.

### 1.2 The engine (`src/engine/lfoEngine.ts`, rewritten; `lfoDrift.ts` folded in)

Module state (runtime-only): `bank: Map<LfoLaneId, { lfo: Tone.LFO; trunk: Tone.Gain; drift: Tone.LFO; rateDriftGain: Tone.Gain; depthDriftGain: Tone.Gain }>` built once per lane on first `primeLfoBank`; `bankSettings: Record<LfoLaneId, BankLfoSettings>`; `links: Map<string, { target; robotId?; lane; depth; linkGain: Tone.Gain; signal: unknown; suspended: boolean }>` keyed by `instanceKey(target, robotId)` as today; `driftSuppressed`, `filterLinksEnabled` flags.

Public surface:

```ts
export const lfoEngine = {
  // bank
  primeLfoBank(settings: Record<LfoLaneId, BankLfoSettings>): void; // build-if-needed, apply, start at now+MIN_LEAD; idempotent; no-op unless the AudioContext is running
  setBankShape(lane, shape), setBankRate(lane, hz), setBankRateDrift(lane, v), setBankDepthDrift(lane, v),
  getBankSettings(lane): BankLfoSettings,
  // links
  linkTarget(target: LfoTargetId, link: LfoLink, robotId?: string): boolean, // lane null → unlink; returns false (never throws) when no live Signal resolves
  unlinkTarget(target, robotId?): void,
  disposeRobotLinks(robotId): void,
  // load dial
  setDriftEnabled(enabled: boolean): void,        // detaches/re-attaches the four secondaries' gains; amounts untouched
  setFilterLinksEnabled(enabled: boolean): void,  // suspends/restores lpf.*/hpf.* link gains; link records kept
};
```

Gone: `getLfoSettings`, `setLfoRate/Depth/Shape`, `start`, `stop`, `connectLfoTarget`, `disconnectLfoTarget`, `setLfoPolicy`, `reconcileLfos`, `getHeldOffLfoKeys`, `subscribeHeldOff`, `setGlobalRateDrift/DepthDrift`, every phase symbol, the `beatClock` import, `requested`/`heldOff`/`connectedSignals`/`activeLfos`/`settingsByKey`/`phaseFallbacks`.

**Per link** (`linkTarget`): resolve the Signal via `AudioEngine.getRobotModulationTarget`/`getGlobalModulationTarget` (null → return false); compute `swing = centeredSwingFromRange(resolveLfoOutputRange(target), signal.value)`; if a record exists for the key and its `signal` is the same object and `lane` unchanged, just set `linkGain.gain.value = depth/100 × swing.max` and return true; otherwise disconnect any old link Gain (stale signal or lane change), create/reuse `linkGain`, `bank[lane].trunk.connect(linkGain)`, `connectAdditively(linkGain, signal)`, record. A `lane: null` link calls `unlinkTarget`. `lfoShared.ts` (`clamp`, `isAudioContextRunning`, `centeredSwingFromRange`, `connectAdditively`) is unchanged and still the home of the additive-connect fix.

**Per lane** (`primeLfoBank`/setters): `lfo = new Tone.LFO({ frequency: rate, type: shape, min: -1, max: 1 })`, `amplitude = 1`; `trunk = new Tone.Gain(1)`; `lfo.connect(trunk)`; `drift = new Tone.LFO({ frequency: DRIFT_RATE_HZ, type: 'sine', phase: 90 × laneIndex })`; `rateDriftGain`/`depthDriftGain` start at 0; `drift.connect(rateDriftGain)` → `connectAdditively(rateDriftGain, lfo.frequency)`; `drift.connect(depthDriftGain)` → `connectAdditively(depthDriftGain, trunk.gain)`. `refreshLaneDrift(lane)`: `rateDriftGain.gain = rateDrift × centeredSwingFromRange({LFO_RATE_MIN, LFO_RATE_MAX}, rate).max`; `depthDriftGain.gain = depthDrift × centeredSwingFromRange({0, 2}, 1).max` (= `depthDrift × 1`, a ±100% wobble of every link's depth at full drift). Called after `setBankRate` and both drift setters. `setDriftEnabled(false)` disconnects both drift gains per lane (nodes kept); `true` reconnects and refreshes.

**Lifecycle**: bank nodes are app-lifetime, like today's drift pools — never disposed on a power cycle; `primeLfoBank` on the next `AudioEngine.start()` re-applies settings and re-`start()`s them (a stopped-then-started `Tone.LFO` is fine). `disposeRobotLinks(robotId)` disconnects and disposes that robot's link Gains and drops the records (called from the same two `localeStore` sites `disposeRobotLfos` is today).

### 1.3 Seeding (`spawnSystem.ts`, `globalAudioSeed.ts`)

| what | where | keys (`getSeededVal` dataId) | draw |
|---|---|---|---|
| bank lane settings | `generateLfoBankSettings(asId, asName)` in `globalAudioSeed.ts`, Attenuation Style map | `lfoBank.<lane>.rate`, `.shape`, `.rateDrift`, `.depthDrift` | rate: `scaleUnitValue(t, { ...LFO_BANK_RATE_BANDS[lane], scale: 'log' })` quantized to 0.05; shape: `LFO_LOADING_SHAPES`; drifts: `[-0.7, 0.7]` step 0.01 (the current `lfoDrift` loading window, re-keyed) |
| global target links | `generateGlobalLfoLinks(asId, asName)` | `globalLfo.<target>.quiet`, `.lane`, `.depth` | quiet: `LFO_QUIET_THRESHOLD = 0.34` unchanged; lane: weighted draw over the running global tally; depth: `[20, 50]` step 1 |
| robot target links | `generateRobotLfoLinks(noiseMap, offset, priorLaneCounts)` | `robot.lfo.<target>.quiet`, `.lane`, `.depth` | quiet: `LFO_QUIET_THRESHOLD = 0.7` unchanged; lane: weighted draw over `priorLaneCounts` + this robot's own earlier targets; depth: `[1, 100]` step 1 |

Weighted lane draw (`pickLane(t, counts)` in a new `src/utils/lfoLaneDraw.ts`, pure, shared by both seeders): `weights[l] = LFO_LANE_SEED_BIAS[l] / (1 + counts[l])`, normalise, walk the cumulative sum with `t ∈ [0, 1)`. Two leans multiply: the least-used lane is favoured (a lane with 0 links is twice as likely as one with 1), and the lanes carry a fixed order bias on load — `LFO_LANE_SEED_BIAS = { a: 1, b: 0.85, c: 0.7, d: 0.55 }` — so the Core LFO (`a`) is a little more likely than the Companion (`b`), which is a little more likely than the Accent (`c`), and so on (Crawford, 2026-10-01: "keep things weighted on load"). Both are leans, not rules; the bias numbers are a first tuning for the listening pass. `spawnRobot` computes `priorLaneCounts` by tallying `lfoLinks` over the active locale's existing robots before calling the generator; `reRegisterAllRobotsAudio`/session restore never re-seed, so order only matters at first spawn, which is deterministic. The `source.lfoSettings ?? generate` respawn branch becomes `source.lfoLinks ?? generate`.

The per-target `.shape`/`.rate` draws disappear; the Task 1 seed oracle in `spawnSystem.test.ts` is retired (intent).

### 1.4 Store actions and call sites

`audioStore`: `setLfoBank(lane, partial: Partial<BankLfoSettings>)` (state write + the matching `setBank*` engine calls, the `setGlobalLfoDrift` shape); `setGlobalLfoLink(target, link)` (state write + `linkTarget`); `regenerateLfoBankFromSeed`/`regenerateGlobalLfoLinksFromSeed` (data-only, called from the existing Attenuation-Style sync in place of `regenerateGlobalLfoFromSeed`); `setFilterLinksHeldOff`. `applyGlobalAudioToEngine` loses its drift loop.

`robotLfoLinks.ts` (renamed from `robotLfoPriming.ts`): `applyRobotLinkToEngine(robotId, target, link)` = `lfoEngine.linkTarget(target, link, robotId)`; `primeRobotLinks(robot, targets?)`; `primeRosterLinks(robots)`. `robotOptionsActions.applyLayerLfo` → `applyLayerLfoLink(robot, localeId, target, link)`: store write + `applyRobotLinkToEngine`. Call sites are exactly the Load Fix's §1.3 table with the new names: `spawnRobot`, `reRegisterAllRobotsAudio`, `AudioEngine.start()`'s post-load pass, `applyLayersStructural` (re-link after `reReserveVoice`), `applySessionPayload` (changed targets only), plus the bank/global prime at the top of `AudioEngine.start()` (assumption 12).

`audioBudgetSystem.applyLfoTiers` shrinks to: `setDriftEnabled`, `setFilterLinksEnabled`, `setDriftHeldOff`, `setFilterLinksHeldOff`. `audioBudget.ts`: `EffectsLoadLimits` loses `maxRobotLfos`; `robotLfoCap`, `lfoAllowed`, `FILTER_TARGET`/`PHASE_TARGET`, and the three `ROBOT_LFO_CAP_*` constants are deleted; `describeLimits` loses the robot-LFO clause. `audioDiagnostics` replaces `globalLfosOn/Total` with `linksOn/linksTotal` (global + robot, from state) and adds `bankRunning` (0–4).

Company broadcast (`CompanyOptionsSection.handleLayerLfoFieldChange`): unchanged shape, now diffing an `LfoLink` (`lane`/`depth`) and calling `applyLayerLfoLink` per member — "broadcast, not link" semantics as today.

### 1.5 UI

**`LfoLink` primitive** (`src/components/ui/controls/LfoLink.tsx`, replaces `Lfo.tsx`): `DualLabel` + a `RadioButton` over `options('ui.lfoLane')` (values `off`, `a`, `b`, `c`, `d`; `null` ↔ `'off'` at the edge) + one `SliderLinear` for Depth (`labels('ui.lfo.depth')`, unchanged key). Schema type `'lfoLink'` replaces `'lfo'` in `ControlSchema`. Props `{ schema, value: LfoLink, onChange, disabled?, heldOff? }` — `heldOff` now only ever true for the two filter panels. Memoized like every primitive; stable per-field handlers via the same `latest` ref pattern.

**Robot layers** (`SignatureArrayLayer`): Type radio, then for each of the layer's two LFO-targetable params (gain, detune) the slider row followed by its own `LfoLink`; Phase and Interval render as plain rows (Phase loses its `lfoTarget` in `robotOptionsConfig.ts`). `LfoTargetGroup`/`useLfoTargetGroup` and the `heldOffTargets` prop go. `RobotDriftPanel` is deleted from this file.

**EQ / LPF / HPF** (`AudioRigEffectPanel`): the `lfoFields` branch renders each param row followed by its `LfoLink`, reading `globalLfoLinks[target]` and calling `setGlobalLfoLink`; `AudioRigLfoGroup` is deleted. The LPF/HPF pickers pass `heldOff={filterLinksHeldOff}` and render a `HeldOffNote` while held off. `FleetDriftPanel` is deleted.

**LFO Bank accordion** (`FleetParamsContent.tsx`): group `{ id: 'lfoBank', nodeId: 'fleetParams.lfoBank', content: 'fleet.lfoBank', trait: 'timeSpace', leaves: a/b/c/d }` inserted between `pacing` and `eqFilters`; `renderLeaf` maps `'laneA'`…`'laneD'` to `<LfoBankLanePanel lane="a" />` etc. `LfoBankLanePanel` (new, `src/components/panels/screen/console/LfoBankLanePanel.tsx`): one `DirectionalPanel` with the Shape `RadioButton` (`ui.lfo.shape`), Rate `SliderLinear` (`ui.lfo.rate`, `[0, 20]`, step 0.05), Rate Drift and Depth Drift `SliderCenteredZero`s (`fleet.lfoBank.rateDrift`/`.depthDrift`, the existing ±100% display of a `-1..1` value), the two drift rows greyed + `HeldOffNote` while `driftHeldOff`. Reads/writes `useAudioStore` directly like the drift panels it replaces. `navTreeConfig.ts`, `useNavTree.ts` (`FLEET_PARAMS_GROUPS`, `FLEET_PARAMS_GROUP_FIRST_LEAF`, the leaf-segment map), and `uiStore.ts` (`FleetParamsGroup`, `SelectedFleetParamsEffect`) change in step, by hand, as the existing comments require.

**Content** (`src/content/copy/fleet.ts`, `ui.ts`): remove `fleet.drift*` (6 keys); add `fleet.lfoBank` (human "LFO Bank", lore "Phase Locking", intro copy), the four lane keys with Crawford's names (2026-10-01) — `fleet.lfoBank.laneA` human "Core LFO" / lore "Apex Signature", `.laneB` "Companion LFO" / "Lateral Signature", `.laneC` "Accent LFO" / "Impulse Signature", `.laneD` "Overtone LFO" / "Canopy Signature" — which also supply `ui.lfoLane`'s per-value option copy (so the picker and the accordion leaf never drift apart), `fleet.lfoBank.rateDrift`/`.depthDrift` (human "Rate Drift"/"Depth Drift", lore carried over from `fleet.drift.environmental.*`, unit `%`); add `ui.lfoLane` with `options: { off, a, b, c, d }`; keep `ui.lfo`, `ui.lfo.shape`, `ui.lfo.rate`, `ui.lfo.depth`, `ui.heldOff`. `fleet.root`'s human description drops the word "drift" for "modulation lanes". The ESLint rule and `content.test.ts` enforce that no string lands in a component.

### 1.6 Persistence

`SessionPayloadVersion = 2`. `SessionPayload` gains `lfoBank?: Partial<Record<LfoLaneId, BankLfoSettings>>` and `globalLfoLinks?: Partial<Record<GlobalLfoTargetId, LfoLink>>`, loses `globalLfo`; `RobotAudioOverrideDiff.lfoLinks` replaces `lfoSettings`; `globalAudio` loses `lfoDrift`. `captureSessionPayload` quantizes bank drifts to 0.01 (moving the existing block in `sessionDiff.ts` lines ~170–178) and diffs `lfoLinks` per target with `deepEqual` as today. `applySessionPayload`: `version === 1` → strip `globalLfo`, every `robotOverrides[*].lfoSettings`, `globalAudio.lfoDrift`, then proceed; `migrateLfoDrift` is deleted; bank/global links written data-only (the `AudioEngine.start()` prime picks them up; a running session re-primes exactly the overridden targets through `primeRobotLinks(robot, targets)` and `setGlobalLfoLink`/`setLfoBank` for the global halves). Compact share (`sessionShareUtils.ts`): `v: 2`, `lb` (bank: `{ s, r, rd, dd }` per lane), `gll`/`ll` (links: `{ l, d }` per target, `l` omitted when null); a `v: 1` blob decodes with `lf`/`gl` ignored. `computeRobotAudioOverrideDiff`, `buildRobotUpdates`, `fromCompactLfoLinkMap` filter keys against `ROBOT_LFO_TARGET_IDS` as today (so `layerN.phase` from a v2 blob written by a future build is dropped too).

### 1.7 What stays the same

`lfoShared.ts` entire; `AudioEngine.getGlobalModulationTarget`; the gain/detune branches of `getRobotModulationTarget` (phase branch deleted); `ROBOT_LFO_FIELD_RANGE` and `resolveLfoOutputRange` (the regex loses nothing — it already matches only gain/detune); `GLOBAL_LFO_TARGET_IDS`; both quiet thresholds; `LOAD_DRIFT_MIN`/`LOAD_FILTER_LFOS_MIN`; `driftHeldOff`; `HeldOffNote`; Audio Swells (its `volume`/`pulseWidth` *attributes* are a different system); `localeStore`'s dispose sites; the company broadcast semantics; `applyLayersStructural`'s rebuild-then-re-link order.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── lfo.ts                         LfoLaneId, LFO_LANE_IDS, BankLfoSettings, LfoLink; RobotLfoTargetId → 6; − LfoSettings, DriftGroupId
│   ├── lfo.test.ts                    6 robot targets, 4 lanes
│   ├── controls.ts                    LfoLinkSchema ('lfoLink') replaces LfoSchema; LfoLinkValue replaces LfoValue
│   ├── globalAudio.ts                 − lfoDrift
│   ├── Robot.ts                       lfoSettings → lfoLinks
│   ├── Company.ts                     CompanyOptionsSnapshot.lfoSettings → lfoLinks
│   └── session.ts                     version 2; lfoBank, globalLfoLinks, RobotAudioOverrideDiff.lfoLinks
├── data/
│   ├── lfoConfig.ts                   DEFAULT_LFO_LINK, DEFAULT_BANK_LFO
│   ├── audioRigConfig.ts              − LFO_DRIFT_GROUPS/LfoDriftGroupSchema; + LFO_BANK_LANE_SCHEMAS (panel, shape, rate, rateDrift, depthDrift per lane)
│   ├── robotOptionsConfig.ts          phase param loses lfoTarget
│   ├── globalAudioSeedRanges.ts       − lfoDrift.* keys
│   └── globalAudioLoadingRanges.ts    − lfoDrift.* keys (the ±0.7 window moves to LFO_BANK_DRIFT_SEED_RANGE in globalAudioSeed.ts)
├── engine/
│   ├── lfoEngine.ts                   REWRITTEN — bank + links + two dial flags (§1.2)
│   ├── lfoEngine.test.ts              rewritten
│   ├── lfoDrift.ts / lfoDrift.test.ts DELETED (folded into lfoEngine)
│   ├── lfoShared.ts                   unchanged
│   ├── AudioEngine.ts                 start(): primeLfoBank → global links → primeRosterLinks; getRobotModulationTarget − phase branch
│   ├── AudioEngine.test.ts            + order case
│   └── audioDiagnostics.ts            linksOn/linksTotal/bankRunning
├── utils/
│   ├── lfoLaneDraw.ts                 NEW — pickLane(t, counts), tallyLanes(links[])
│   ├── lfoLaneDraw.test.ts            NEW
│   ├── globalAudioSeed.ts             generateLfoBankSettings, generateGlobalLfoLinks (replaces generateGlobalLfoSettings); LFO_BANK_RATE_BANDS; LFO_BANK_DRIFT_SEED_RANGE
│   ├── globalAudioSeed.test.ts        rewritten LFO cases
│   ├── audioBudget.ts                 − maxRobotLfos/robotLfoCap/lfoAllowed; describeLimits trimmed
│   ├── audioBudget.test.ts            updated
│   ├── sessionDiff.ts                 v1 strip; lfoLinks diff; bank quantize; − migrateLfoDrift
│   ├── sessionDiff.test.ts            updated
│   ├── sessionShareUtils.ts           v2 compact shape; v1 tolerated
│   └── sessionShareUtils.test.ts      updated
├── constants/index.ts                 − ROBOT_LFO_CAP_LIGHT/STANDARD/FULL
├── stores/
│   ├── audioStore.ts                  lfoBank, globalLfoLinks, filterLinksHeldOff + actions; − globalLfo, heldOffLfoKeys, setGlobalLfo, setGlobalLfoDrift
│   ├── audioStore.test.ts             updated
│   ├── localeStore.ts                 disposeRobotLfos → disposeRobotLinks
│   └── uiStore.ts                     FleetParamsGroup 'fleetDrift' → 'lfoBank'; SelectedFleetParamsEffect 'globalDrift'|'robotDrift' → 'laneA'..'laneD'
├── systems/
│   ├── robotLfoLinks.ts               RENAMED from robotLfoPriming.ts — applyRobotLinkToEngine, primeRobotLinks, primeRosterLinks
│   ├── robotLfoLinks.test.ts          renamed/rewritten
│   ├── spawnSystem.ts                 generateRobotLfoLinks(noiseMap, offset, priorLaneCounts); ROBOT_LFO_DEPTH_SEED_MIN; spawn tallies prior lanes
│   ├── spawnSystem.test.ts            seed cases rewritten; Task 1 oracle retired
│   ├── robotOptionsActions.ts         applyLayerLfoLink; applyLayersStructural re-links
│   ├── robotOptionsActions.test.ts    updated
│   ├── audioBudgetSystem.ts           applyLfoTiers → drift + filter flags only; − syncHeldOff/subscribeHeldOff
│   ├── audioBudgetSystem.test.ts      updated
│   └── companyOptions.ts              EMPTY_LFO_SETTINGS → EMPTY_LFO_LINKS
├── components/
│   ├── ui/controls/LfoLink.tsx (+ .css, .test.tsx)      NEW — lane RadioButton + Depth slider
│   ├── ui/controls/Lfo.tsx / Lfo.css / Lfo.test.tsx      DELETED
│   ├── ui/controls/LfoTargetGroup.tsx/.css/.test.tsx     DELETED
│   ├── ui/controls/useLfoTargetGroup.ts/.test.ts         DELETED
│   ├── ui/controls/HeldOffNote.*                         kept
│   ├── robot/SignatureArrayDrawer.tsx                    inline LfoLink per gain/detune row; − LfoTargetGroup, − RobotDriftPanel, − heldOffTargets
│   ├── robot/SignatureArrayDrawer.test.tsx               updated
│   ├── panels/screen/console/AudioRigDrawer.tsx          inline LfoLink per lfoTarget row; − AudioRigLfoGroup, − FleetDriftPanel
│   ├── panels/screen/console/AudioRigEffectPanel.test.tsx updated; FleetDriftPanel.test.tsx DELETED
│   ├── panels/screen/console/LfoBankLanePanel.tsx (+ .test.tsx)  NEW
│   ├── panels/screen/console/RobotOptionsTab.tsx         − heldOffTargets selector; lfoLinks wiring
│   ├── company/CompanyOptionsSection.tsx                 lfoLinks snapshot/broadcast
│   ├── panels/screen/nav/content/FleetParamsContent.tsx  lfoBank group (4 leaves) between pacing and eqFilters; − fleetDrift
│   ├── panels/screen/nav/useNavTree.ts                   group list/first-leaf/leaf-segment maps
│   └── (nav tests)                                       navTreeConfig.test.ts, useNavTree.test.ts, navPanelViewsAndContent.integration.test.ts, FleetParamsContent.test.tsx updated
├── data/navTreeConfig.ts              fleetParams.lfoBank (+ .a/.b/.c/.d) replaces fleetParams.fleetDrift; placed after pacing
├── content/copy/fleet.ts              − fleet.drift.*; + fleet.lfoBank, .laneA–D, .rateDrift, .depthDrift
├── content/copy/ui.ts                 + ui.lfoLane (options off/a/b/c/d)
docs/
├── AUDIO_SYSTEM.md                    LFO Modulation section rewritten around the bank; Seeding paragraph; odds 30%/66%
├── PERFORMANCE.md                     dated section: bank measurement; ?fxLoad= row loses "robot-LFO count"
├── reference/ROBOT_DATA_GRID.md       LFO columns → lane/depth; phase "Has LFO: No"
├── reference/GLOBAL_CHAIN_GRID.md     LFO? column → lane/depth
├── specs/FREE_SYNC_TOGGLE.md + tasks/FREE_SYNC_TOGGLE.md   one dated note each (assumption 14)
├── specs/LFO_LOAD_FIX.md              one dated note: superseded by LFO_BANK.md
├── todo/roadmap.md                    17.2.8 entry
└── specs/LFO_BANK.md                  this file
```

Not touched: `lfoShared.ts`, `audioSwell*`, `audioContextSetup.ts`, the robot/company melody systems, `AudioLoadPanel` (reads `describeLimits`, which still works), anything under `src/animation/`.

---

## 3. Implementation Boundaries & Constraints

- **CLAUDE.md holds**: the four lanes and every link Gain are Tone nodes owned by `lfoEngine` (never created in a component); no `setTimeout`/`requestAnimationFrame` anywhere in modulation; Zustand holds lane ids, depths and `BankLfoSettings` only; rate stays a plain Hz float in the engine (no `Tone.LFO.sync()`); the bank starts at `Tone.now() + MIN_LEAD`.
- **The additive-connect fix applies per link** (`connectAdditively`, `centeredSwingFromRange`); a bank lane's unit output must never reach a target without a bounded link Gain between them. The same two helpers bound the drift gains.
- **Every engine touch happens after audio is running and after the voice is reserved**: `primeLfoBank` and every `linkTarget` caller are the sites in §1.4, all downstream of `AudioEngine.start()`. Seed-time store writes stay data-only.
- **Removals happen before the new graph is wired** so no task carries both a cap and a bank. Phase targets, the cap, the held-off machinery and the drift pools are deleted in the first tasks; the compiler's error list is the to-do list for the type-union changes.
- **Strict scope**: files in §2. The two quiet thresholds, `LOAD_DRIFT_MIN`, `LOAD_FILTER_LFOS_MIN`, the Audio Swells attribute lists and `lfoShared.ts` are off limits. `LFO_BANK_RATE_BANDS` and the lane-draw weighting are the only numbers this phase introduces and both are expected to be retuned by ear (§5 manual pass), not by argument.
- **Content**: every new string goes through `src/content/` keys named in §1.5; lane lore names are an open question (§7) and ship with placeholders that the `copy-tone-guide` pass replaces.
- **Perf measurement hygiene** (`docs/PERFORMANCE.md`, memory): foreground, one run at a time, orphaned-Chrome check, same-session A/B, pinned worlds.
- **Ask before**: adding a dependency; changing `LFO_RATE_MIN/MAX` or `LFO_DEPTH_MIN/MAX`; re-adding any form of per-link decorrelation; keeping `LfoTargetGroup` (assumption 10's alternative is Crawford's call, not a mid-task swap).
- **Never**: commit throwaway measurement builds; push or open a PR unless asked; migrate old LFO data (the intent says drop).

---

## 4. Code Style & Architecture Conventions

The link path — one function owns "lane or none", swing bounding, stale-signal rewire and idempotence:

```ts
// src/engine/lfoEngine.ts (excerpt)
function linkTarget(target: LfoTargetId, link: LfoLink, robotId?: string): boolean {
  const key = instanceKey(target, robotId);
  if (link.lane === null) { unlinkTarget(target, robotId); return true; }
  if (isRobotTarget(target) && !robotId) return false;

  const signal = isRobotTarget(target)
    ? AudioEngine.getRobotModulationTarget(robotId!, target as RobotLfoTargetId)
    : AudioEngine.getGlobalModulationTarget(target as GlobalLfoTargetId);
  if (!signal) return false;

  const lane = bank.get(link.lane);
  if (!lane) return false; // primeLfoBank has not run — every caller is downstream of AudioEngine.start()

  const range = resolveLfoOutputRange(target);
  const swing = range ? centeredSwingFromRange(range, (signal as { value: number }).value) : { min: 0, max: 0 };
  const gainValue = (clamp(link.depth, LFO_DEPTH_MIN, LFO_DEPTH_MAX) / 100) * swing.max;

  const existing = links.get(key);
  if (existing && existing.signal === signal && existing.lane === link.lane) {
    existing.depth = link.depth;
    existing.linkGain.gain.value = gainValue; // depth-only edit: no re-connect, no click
    return true;
  }
  if (existing) teardownLink(existing); // lane change or a rebuilt voice's new Signal — never leave two live

  const linkGain = new Tone.Gain(gainValue);
  lane.trunk.connect(linkGain);
  try {
    connectAdditively(linkGain, signal);
  } catch (err) {
    devWarn('[lfoEngine] linkTarget: connect failed', err);
    linkGain.dispose();
    return false;
  }
  links.set(key, { target, robotId, lane: link.lane, depth: link.depth, linkGain, signal, suspended: false });
  if (isFilterTarget(target) && !filterLinksEnabled) suspendLink(key);
  return true;
}
```

And the seeded lane draw, pure and shared:

```ts
// src/utils/lfoLaneDraw.ts
/** Seed-only lane order bias (spec §1.3): a > b > c > d on load, a little each step. */
export const LFO_LANE_SEED_BIAS: Readonly<Record<LfoLaneId, number>> = { a: 1, b: 0.85, c: 0.7, d: 0.55 };

/** Weighted pick: order bias / (1 + count) — leans toward earlier AND less-used lanes. `t` is one seeded draw in [0, 1). */
export function pickLane(t: number, counts: Readonly<Record<LfoLaneId, number>>): LfoLaneId {
  const weights = LFO_LANE_IDS.map((lane) => LFO_LANE_SEED_BIAS[lane] / (1 + counts[lane]));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < LFO_LANE_IDS.length; i++) {
    acc += weights[i] / total;
    if (t < acc) return LFO_LANE_IDS[i];
  }
  return LFO_LANE_IDS[LFO_LANE_IDS.length - 1]; // t === 1 - ε rounding
}
```

Conventions as elsewhere: section-banner comments; doc comments say *why* and cite this spec's section; `devWarn` + swallow at the call sites that already try/catch reservation; one object per default (factory, never a shared reference); memoized schemas and stable handlers in every primitive; `labels()`/`options()` for every string.

---

## 5. Testing & Verification Requirements

Framework: Vitest + Testing Library, co-located; `Tone` mocked at the module boundary in `lfoEngine.test.ts` (the existing pattern), `lfoEngine` mocked in systems/store tests. House TDD rhythm: RED first, one commit per task, mutation checks at gates.

**Types/config** — `lfo.test.ts`: `ROBOT_LFO_TARGET_IDS` is exactly the 6 gain/detune members; `LFO_LANE_IDS` is `['a','b','c','d']`. `lfoConfig.test.ts`: `DEFAULT_LFO_LINK` is `{ lane: null, depth: 0 }` and distinct per target. `robotOptionsConfig.test.ts`: phase has no `lfoTarget`; gain/detune do. `audioRigConfig.test.ts`: `LFO_BANK_LANE_SCHEMAS` has 4 entries with unique ids.

**Engine** (`lfoEngine.test.ts`, real engine, mocked Tone) — `primeLfoBank` constructs exactly 4 `Tone.LFO` + 4 trunk `Gain` + 4 drift `LFO` + 8 drift `Gain` on first call and none on the second; no-op before the context is running; each lane starts at `now + MIN_LEAD`. `linkTarget`: one `Gain` per link, connected trunk → gain → signal via `connectAdditively` (the destination's `override` set false, value restored); gain value = depth/100 × bounded swing (eq3 at 0 dB in ±12 → 12 × depth; LPF at 20 kHz → 0); a second call with the same lane/signal creates no new node and only updates `gain.value`; a lane change disconnects the old gain before the new one connects; a new Signal object for the same key (rebuilt voice) is re-wired; `lane: null` tears down; `unlinkTarget` on an unknown key is a no-op; `disposeRobotLinks` disposes every gain for that robot and nothing else. Drift: `setBankRateDrift(lane, 0.5)` sets that lane's rate-drift gain to `0.5 × swing.max` and touches no other lane; `setBankRate` refreshes the rate-drift gain; `setDriftEnabled(false)` disconnects all 8 drift gains, `true` reconnects at the current amounts. Filter flag: `setFilterLinksEnabled(false)` disconnects only `lpf.*`/`hpf.*` link gains and keeps their records; `true` restores them; a filter link created while disabled is created suspended.

**Seeding** — `lfoLaneDraw.test.ts`: `pickLane` with zero counts partitions `[0,1)` in `LFO_LANE_SEED_BIAS` proportions (a's share > b's > c's > d's, each strictly); with counts `{a:3,b:0,c:0,d:0}` lane `a`'s share is a quarter of its zero-count share; `t` just below 1 returns `d`; `tallyLanes` counts null-free. `globalAudioSeed.test.ts`: `generateLfoBankSettings` returns rates inside each lane's band in ascending lane order, quantized to 0.05, never 0; shapes from triangle/sine; drifts in ±0.7 step 0.01; deterministic for a fixed map; `generateGlobalLfoLinks` honours the 0.34 quiet roll (on-rate across 50 maps within [55%, 80%]), a quiet target is `{ lane: null, depth: 0 }`, a lit target has depth in `[20, 50]`. `spawnSystem.test.ts`: `generateRobotLfoLinks` on-rate per target across 50 robots within [20%, 40%]; depth never 0 when a lane is set; the `priorLaneCounts` argument shifts the distribution (with `{a: 20, …}` fewer than 15% of 100 lit draws land on `a`); byte-identical output for identical inputs; `spawnRobot` passes the tally of the locale's existing robots (spy); the old shape/rate keys are no longer sampled (the `getSeededVal` spy sees only `.quiet`/`.lane`/`.depth`).

**Call sites** — `robotLfoLinks.test.ts`: `primeRobotLinks` calls `linkTarget` once per stored target with the stored link and skips targets the robot has no entry for; `primeRosterLinks` covers every robot. `spawnSystem.test.ts`: `spawnRobot` primes after a successful reserve, not after a failed one; `reRegisterAllRobotsAudio` primes the roster after all reserves. `robotOptionsActions.test.ts`: `applyLayerLfoLink` writes the store and calls `applyRobotLinkToEngine`; `applyLayersStructural` re-links after `reReserveVoice`. `AudioEngine.test.ts`: `start()` calls `primeLfoBank` before any `linkTarget`, then global links, then `primeRosterLinks` (call order asserted). `audioStore.test.ts`: `setLfoBank('b', { rate: 2 })` writes state and calls `setBankRate('b', 2)` only; `setGlobalLfoLink` writes and links; the Attenuation-Style sync regenerates bank + global links and never touches the engine. `audioBudgetSystem.test.ts`: tiers push exactly `setDriftEnabled`/`setFilterLinksEnabled` and the two held-off booleans; no policy, no reconcile; `stopAudioBudget` restores both flags. `localeStore` (existing dispose tests): `disposeRobotLinks` called on remove/clear.

**Persistence** — `sessionDiff.test.ts`: capture writes `version: 2`, `lfoBank` with 0.01-quantized drifts, `globalLfoLinks`, per-robot `lfoLinks` only for changed targets; a v1 payload (fixture carrying `globalLfo`, `lfoSettings`, `globalAudio.lfoDrift`) loads with every non-LFO field applied and the LFO fields left at the fresh seed; a v2 payload re-primes exactly the overridden robot targets; `migrateLfoDrift` no longer exists. `sessionShareUtils.test.ts`: v2 round-trip is lossless (`l` omitted for null lanes); a v1 blob decodes with `lf`/`gl` dropped and the rest intact; unknown target keys dropped. Parity fixtures seed at least one *non-default* lane and depth (memory: parity tests pass by coincidence otherwise).

**UI** — `LfoLink.test.tsx`: renders the 5-option radio and the Depth slider; `off` ↔ `null`; selecting a lane fires `onChange({ lane, depth })` keeping depth; `heldOff` shows 0/none and the note. `SignatureArrayDrawer.test.tsx`: each layer renders Type, Gain + LfoLink, Detune + LfoLink, Phase (plain), Interval (pulse only, plain); no drift panel; editing one layer's link re-renders only that layer (existing memo test adapted). `AudioRigEffectPanel.test.tsx`: EQ renders three rows each with an LfoLink bound to `globalLfoLinks`; LPF/HPF pickers grey with a note when `filterLinksHeldOff`; Delay/Reverb/Compressor/Limiter unchanged. `LfoBankLanePanel.test.tsx`: shape/rate/drift controls bound to `lfoBank[lane]`, drift rows grey while `driftHeldOff`. `FleetParamsContent.test.tsx` + nav tests: group order Pacing → LFO Bank → EQ & Filters → Time & Space → Output; four lane leaves; `fleetDrift` gone from tree, store union and first-leaf map. `CompanyOptionsSection.test.tsx`: a lane change broadcasts `{ lane }` to every member, a depth change `{ depth }`. `content.test.ts`: every new key resolves; no `fleet.drift.*` key remains.

**Perf measurement (its own task, the decision gate for the intent's first success bar)** — `npm run perf` on `charlie` and `bravo`, same session, 3 interleaved rounds each, pre-branch (`08bae3a2`, cap at 12) vs post-bank at Full, plus one run each at Standard and Light on `bravo`. Record link count and `bankRunning` from the `?debug` overlay. Dated table in `docs/PERFORMANCE.md`. **Hard gate**: `bravo` Full median peak render capacity < 0.9, no callback-interval doubling. **Success bar** (intent): with every seeded link connected and no cap (expected ≈ 22 robot + ≈ 5 global links), median peak on both worlds **at or below** the pre-branch medians (0.413 / 0.443) — i.e. more modulation for no more cost. If the hard gate fails, stop and report; if only the success bar misses, report the numbers and continue to the listening pass — whether to proceed is Crawford's call.

**Lint/type/build** — `npm run lint`, `npm run build:types`, `npm run build` clean at every checkpoint.

**Manual (Crawford)** — power on `charlie:200:-30` and `bravo:-150:90` at Full: hear four distinct lanes (open the LFO Bank, drag lane `a`'s rate and hear every `a` link move together); set a layer's Gain link to Off and hear only that target stop; set two robots' detune to lane `d` and hear them lock; drop Effects Load to Standard and watch only LPF/HPF pickers grey; to Light and watch the four drift rows grey too; change a layer's waveform type on a robot with a running link and confirm it survives; load a v1 session and confirm everything but LFO data restores; share a v2 link and open it fresh; a Pixel run at Light. The success bar "sounds as good or better by ear" is judged here, against a pre-branch build kept in a worktree.

---

## 6. Git & Workflow Context

- Branch: `bug/LFO-load` (checked out), 14 commits ahead of `main` with the complete 17.2.7 series; the intent doc is uncommitted and lands in this spec's first commit. Alternative: Crawford merges 17.2.7 first and this phase starts on `feature/lfo-bank` — either is fine; the spec assumes continuing on the current branch since 17.2.7's priming call sites are the ones this phase rewrites.
- One commit per task; imperative subject; body cites the spec section; co-author trailer per the session reminder. Crawford merges.
- Removal tasks first (phase targets, cap, held-off, drift pools), then types, engine, seeding, store/call sites, persistence, UI, docs, perf — each a green checkpoint. The plan (`docs/tasks/LFO_BANK.md`) orders this.
- Roadmap: "17.2.8 Performance: LFO Bank", with a "Not Doing" list mirroring the intent's out-of-scope section (control-rate lanes, decorrelation, lane-based load degradation, fixed lane characters, migration, matrix UI, Free | Sync).
- Docs land in the last two tasks (code docs, then the perf table).

---

## 7. Open Questions & Risks

**Decided by Crawford, 2026-10-01** (from the intent; not re-litigated here): four audio-rate lanes, one world pool; per target lane + depth only; lockstep wanted, no polarity; phase targets cut; cap and held-off removed, filter switch and drift-off kept; mild variety in seeding, never lane + depth 0 on load; old sessions/links dropped; Free | Sync re-planned after; "LFO Bank" / "Phase Locking", `timeSpace`, between Pacing and EQ & Filters; both quiet thresholds untouched.

**Answered by Crawford, 2026-10-01** (the four questions this spec first shipped with):

1. **Lane names**: `a` Core LFO / Apex Signature, `b` Companion LFO / Lateral Signature, `c` Accent LFO / Impulse Signature, `d` Overtone LFO / Canopy Signature (§1.5).
2. **Picker UI**: the inline per-row `LfoLink` built on the existing `RadioButton` primitive (assumption 10 stands; no shared-display composition).
3. **Seed weighting**: keep a load-time order bias on top of the least-used lean — `a` a little more likely than `b`, and so on (`LFO_LANE_SEED_BIAS`, §1.3). The rate bands and both weightings remain first guesses the listening pass retunes.
4. **Branch**: continue on `bug/LFO-load`.

**Risks:**

5. **Every world sounds different again**, and this time structurally (shared phase). Keep a pre-branch worktree for A/B by ear; budget the listening pass as real work.
6. **Depth-drift trunk** (assumption 4) is the one place the graph deviates from the intent's sentence. Four Gains; negligible cost; flagged so it is not read later as scope creep.
7. **Roster-aware lane tally** (assumption 7) couples a robot's seed to spawn order. Order is deterministic today (fixed roster, sequential spawn); if a future phase spawns robots in a different order the lanes shift. The spawn test pins the tally hand-off; `docs/PROCEDURAL_GENERATION.md` gets one sentence.
8. **Attenuation Style switch while running** does not re-prime global LFOs today (survey); the bank inherits that gap. A one-line follow-up (`primeLfoBank` + global links from the AS subscription when the context is running) is noted in the roadmap entry's follow-ups, not done here.
9. **Phase re-targeting**: `layerN.phase` keys can still arrive from old data; loaders filter against `ROBOT_LFO_TARGET_IDS`, so they drop silently — same mechanism as the volume/pulseWidth removal.
10. **Free | Sync overlap**: that phase's merged plan assumes per-target Rate controls that no longer exist. Assumption 14's dated note prevents someone starting it against stale docs.
