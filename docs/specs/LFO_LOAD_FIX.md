# Phase Spec: Robot LFO Priming (seeded robot LFOs never reach the engine)

> **Superseded (2026-10-01):** the per-target `lfoEngine.ts`/`lfoDrift.ts`/`robotLfoPriming.ts` this spec fixes and the `volume`/`layerN.pulseWidth` target removals, `ROBOT_LFO_CAP_*` constants, and `LFO_QUIET_THRESHOLD` odds it introduces were all replaced or removed by the LFO Bank (`docs/specs/LFO_BANK.md`, `docs/tasks/LFO_BANK.md`). Priming now goes through `primeRobotLinks`/`primeRosterLinks` (`src/systems/robotLfoLinks.ts`); the robot-LFO cap this spec's own §1.4 measured is gone outright (Task 2); the robot on-odds this spec set to 25% is 30% as of the Bank's own seeder. See `docs/AUDIO_SYSTEM.md`'s LFO Modulation section for the current design. Kept here for the priming-gap history and the cost measurements in §1.4/`docs/PERFORMANCE.md`, which the Bank's own Task 19 perf gate built on rather than re-deriving.

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`
> - Perf harness: `npm run perf` (see `docs/PERFORMANCE.md`; foreground, one call at a time, same-session A/B)

Source of intent: no `docs/intent/` file exists for this one. The bug surfaced as a code-survey finding during the Free | Sync spec (2026-09-30, [docs/specs/FREE_SYNC_TOGGLE.md](FREE_SYNC_TOGGLE.md) survey basis and §7.6) and was confirmed in conversation the same day; Crawford asked for it to be documented as its own fix. The archived Audio Load Budget spec already records the condition as a known fact ([docs/specs/archive/AUDIO_LOAD_BUDGET.md](archive/AUDIO_LOAD_BUDGET.md) survey line "Robot LFOs are not connected at spawn") — it was *observed* then, never scheduled. Not yet on the roadmap; §6 proposes a slot.

Survey basis (2026-09-30, against `main` at 1330e880; unchanged by the docs-only merge 3816b20c):

- **Only three places connect and start an LFO:** `audioStore.setGlobalLfo` (global, on user edit), `AudioEngine.start()`'s priming loop (global only — iterates `GLOBAL_LFO_TARGET_IDS`), and `robotOptionsActions.applyLayerLfo` (robot, on user edit). `lfoDebug.ts` is a dev hook. Nothing walks `robot.lfoSettings` at spawn, at power-on, on a locale change, or on session load.
- **The Audio Load Budget cannot bring them in either.** `lfoEngine`'s reconcile pass (`reconcilePasses`) only re-applies entries in its `requested` map, and a request is only recorded by `connectOne`. Unrequested seeded robot LFOs are invisible to it.
- **Robots touch the engine's LFO state only to dispose:** `localeStore.clearRobots`/`removeRobot` call `lfoEngine.disposeRobotLfos`; `AudioEngine.releaseVoice` disposes the composite and bus nodes but never informs `lfoEngine`.
- **Consequence of that last point:** a connected robot LFO points at a *disposed* signal after `AudioEngine.reReserveVoice` (called by `applyLayersStructural` on a layer-type change). `connectOne` can detect and re-wire a stale signal, but only when someone calls `connectLfoTarget` again — nobody does after a rebuild. So a user-connected LFO goes silent after its robot's waveform type changes, until the user nudges that LFO. Same root cause (no post-reservation re-apply), fixed by the same hook.
- **The seed says roughly half should be running.** `generateRobotLfoSettings` seeds 13 targets per robot with a 50% quiet roll (`LFO_QUIET_THRESHOLD = 0.5`); 10 of the 13 are audio-rate (`volume`, and `gain`/`detune`/`pulseWidth` on 3 layers — `layerN.phase` is a control-rate poll and is not counted by the budget). Expected audio-rate LFOs seeded on: ≈ 5 per robot, ≈ 60 across a 12-robot roster.
- **The budget's robot-LFO cap is finite only below Full.** `robotLfoCap(load)` returns `ROBOT_LFO_CAP_LIGHT = 4` at Light, `ROBOT_LFO_CAP_STANDARD = 12` at Standard, interpolates toward `ROBOT_LFO_CAP_CEILING = MAX_ROBOTS * 10 = 120` just short of Full, and **`Infinity` at Full** (`src/utils/audioBudget.ts`). Desktop defaults to Full (`detectDefaultAudioLoad`: coarse pointer → Light, else Full). The budget work measured ≈ +0.012 render capacity per audio-rate robot LFO and that "51 at once saturates the audio thread" / "uncapped Full saturates 0.99" (`docs/PERFORMANCE.md`, memory of the 2026-09-21 runs). **Priming ≈ 60 LFOs at Full on desktop would reproduce that saturation.**
- **Admission is request-ordered.** `connectOne` records requests in call order; `reconcilePasses` suspends newest-connected first when the cap falls and admits in request order when it rises. Whatever order priming requests in becomes the roster's LFO priority.
- **Ordering at power-on:** `powerController.start()` awaits `AudioEngine.start()` (which has a "post-load reservation" pass for robots that spawned before audio was ready) and then `reRegisterAllRobotsAudio` (release + re-reserve every voice). Robots normally spawn *after* power-on, so `spawnSystem.spawnRobot`'s own `reserveVoice` is the common path. `lfoEngine.start()` is a no-op unless the AudioContext is running; `connectOne` returns false for an unreserved robot (`getRobotModulationTarget` resolves null).
- **Session load** (`applySessionPayload`) writes `lfoSettings` overrides through `updateRobot` as data and regenerates the melody; nothing re-applies LFOs. With priming at spawn (which `retransmitWorld` triggers first), the overrides applied afterwards would be *stale in the engine* unless re-primed.
- **Docs are wrong in one place:** `docs/AUDIO_SYSTEM.md` "Seeding" says a freshly-spawned robot "can have real modulation already audible on roughly half its targets before anything is touched." The archived budget spec says the opposite, and the code agrees with the budget spec.

ASSUMPTIONS I'm making (correct now or I'll proceed with these):

1. **The fix is "re-apply a robot's stored LFO settings to the engine after every point its voice is (re)reserved"** — one function, `primeRobotLfos(robot)`, called from each reservation site and from session load. It mirrors `AudioEngine.start()`'s global loop exactly: set shape/rate/depth, then connect + start when `rate > 0`, else disconnect + stop. No new engine concept.
2. **Priming goes through the existing Load Budget policy unchanged** — `connectOne` records the request and declines over the cap, held-off state surfaces in the UI as it does for a user edit. No bypass, no second budget.
3. **Full's robot-LFO cap stays unlimited for now** (Crawford, 2026-09-30: "not yet — I want to see if we absolutely have to first"). The saturation risk is instead removed at the source by assumption 9 and the lowered seed odds in assumption 5, which take the expected primed count from ≈ 60 to ≈ 18 (≈ 0.22 render capacity — a heavy world stays under 0.8 on desktop). The perf measurement in §5 is the proof; if it fails the gate, a finite Full cap (`ROBOT_LFO_CAP_FULL`, previously proposed at a placeholder 24) is the documented fallback and gets its own decision then, not silently.
4. **Priming order is round-robin across robots, not robot-by-robot**: pass 1 requests each robot's first seeded-on target in spawn order, pass 2 the second, and so on. Under a cap of 12 that gives 12 robots one LFO each rather than robots 1–2 everything and robots 3–12 nothing. Request order is the budget's priority order, so this decides what a capped world *sounds* like.
5. **The robot quiet roll is lowered from 50% on to 25% on** (`LFO_QUIET_THRESHOLD` in `spawnSystem.ts` 0.5 → 0.75; Crawford, 2026-09-30). The `getSeededVal` key and draw order are unchanged, so every world's *shapes, rates and depths* are byte-identical to today — only which targets land quiet changes (a target that was quiet stays quiet; some that were on become quiet). The global-chain odds (`globalAudioSeed.ts`, 34%) are untouched. Combined with assumption 9: 6 audio-rate targets × 25% ≈ 1.5 primed LFOs per robot, ≈ 18 per roster.
6. **Priming is idempotent and cheap to repeat**: re-running it for an already-connected target with the same signal is a no-op in `connectOne` (`connectedSignals.get(key) === signal`), and for a rebuilt voice it re-wires the stale signal — which is exactly the second bug above.
7. **No priming before audio is running.** `lfoEngine` setters construct `Tone.LFO` nodes; every call site below already runs after `AudioEngine.start()` succeeded or is inside it. The post-load pass in `AudioEngine.start()` reaches `primeRobotLfos` through the same dynamic-import pattern it already uses for `audioStore` (static import would create an engine → systems cycle).
8. **Free | Sync compatibility:** when that phase lands, `primeRobotLfos` uses its `resolveLfoRateHz`/`isLfoOn` resolvers like every other apply path. Until then it reads `rate` directly, like `applyLayerLfo` does today. Whichever lands first, the other adapts in one line. (The Free | Sync spec's robot-target counts — 13 per robot, 4 panels — become 9 and 3 after assumption 9; its plan's Task 13 list loses the Volume LFO caller. Noted there in that phase's Task 17 docs pass, not here.)
9. **Two robot LFO targets are removed outright — `volume` and `layerN.pulseWidth`** (Crawford, 2026-09-30: volume "not as impactful as I had hoped"; pulse width is the ≈ 7× cost outlier and only exists on pulse-type layers). `RobotLfoTargetId` becomes the 9 members `layer{0,1,2}.{gain,detune,phase}`; 6 of them audio-rate. The Volume LFO frame leaves `AudioSettingSection` (Mode + Volume stay); the Signature Array's pulse-width slider stays but loses its `lfoTarget`; `CompanyOptionsSnapshot.volumeLfo` is deleted. Audio Swells' own `volume`/`pulseWidth` *attributes* are a different system (`audioSwell.ts`) and are untouched. Old sessions/share links may carry `volume`/`…pulseWidth` keys under `lfoSettings` and a `volumeLfo` on user-created companies: loaders drop unknown LFO keys (one filter in `buildRobotUpdates` and the compact decoder); the stale `volumeLfo` field on a stored company object is inert and ignored.

---

## 1. Overview & Claude Explanation

Every robot is seeded with 13 LFO settings at spawn, about half of them "on", and the UI shows them lit — but nothing ever hands those settings to `lfoEngine`, so no robot LFO runs until a user drags one, and even then only that one target. The global chain doesn't have this problem because `AudioEngine.start()` primes its 7 targets from state. This phase adds the missing robot half: a `primeRobotLfos(robot)` step that re-applies a robot's stored LFO settings to the engine whenever its voice has just been reserved — at spawn, at power-on, after a structural rebuild, and after a session restores overrides — requesting connections in round-robin order across the roster so the Load Budget's cap spreads fairly. Because the budget's cap is unlimited at Full and ≈ 60 LFOs would saturate the audio thread, the count is cut at the source instead: the `volume` and `pulseWidth` LFO targets are removed (the latter is the 7× cost outlier) and the seed turns on 25% of targets rather than 50%, for ≈ 18 primed LFOs per roster. The fix also closes a second gap with the same cause: a user-connected LFO that went silent when its robot's voice was rebuilt.

### 1.1 `primeRobotLfos` — the one new function

`src/systems/robotLfoPriming.ts`:

```ts
/** Re-apply one robot's stored LFO settings to lfoEngine. Mirrors AudioEngine.start()'s global loop.
 *  Requires the robot's voice to be reserved and the AudioContext running (every caller guarantees it);
 *  otherwise connectOne declines and nothing is recorded. Idempotent. */
export function primeRobotLfos(robot: Robot, targets: readonly RobotLfoTargetId[] = ROBOT_LFO_TARGET_IDS): void;

/** Prime a whole roster in round-robin target order (§1.2) — the only entry point used at power-on,
 *  re-register, and world transition. */
export function primeRosterLfos(robots: readonly Robot[]): void;
```

For each target: `setLfoShape`, `setLfoRate`, `setLfoDepth` with the stored values; then `if (rate > 0) { if (connectLfoTarget(target, robot.id)) start(target, robot.id) } else { disconnectLfoTarget; stop }`. This is `applyLayerLfo` minus the store write — the two share a helper so they cannot drift (`applyLayerLfo` becomes "store write + `primeRobotLfos(robot, [target])`").

### 1.2 Round-robin order (assumption 4)

`primeRosterLfos` builds the request sequence as: for `i` in 0..12, for each robot in roster order, the robot's `i`-th target in `ROBOT_LFO_TARGET_IDS` order. Targets at `rate: 0` are still visited (they disconnect/stop, cheap and idempotent) but don't consume cap. Under a cap of *N*, the first *N* `rate > 0` audio-rate requests in that sequence connect; the rest are recorded as held off and admitted in that same order when the dial rises. `ROBOT_LFO_TARGET_IDS` order already puts `volume` first, so the first pass is "every robot's volume LFO if seeded on" — the most audible target per robot.

A single-robot prime (spawn of one robot, a structural rebuild, a session override) uses `ROBOT_LFO_TARGET_IDS` order for that robot alone; it joins the back of the request queue, which is the right priority for a late arrival (same as a robot joining the sounding set, decision B in the budget spec).

### 1.3 Call sites (all existing reservation points, nothing new invented)

| site | today | after |
|---|---|---|
| `spawnSystem.spawnRobot` | `reserveVoice(...)` then `registerRobotMelody` | + `primeRobotLfos(robot)` after a successful reserve |
| `spawnSystem.reRegisterAllRobotsAudio` | release + reserve each robot | + `primeRosterLfos(robots)` after the loop (one pass, round-robin) |
| `AudioEngine.start()` post-load reservation pass | reserves voices for robots that spawned before audio was ready | + `primeRosterLfos(robots)` after the pass, via dynamic import of `robotLfoPriming` (assumption 7) |
| `robotOptionsActions.applyLayersStructural` | `reReserveVoice(robot.id)` | + `primeRobotLfos(robot)` — re-wires the now-stale signals (second bug) |
| `sessionDiff.applySessionPayload` | `updateRobot(updates)`, `regenerateMelody` | + `primeRobotLfos(updatedRobot, changedTargets)` when `diff.lfoSettings` is present |
| `applyLayerLfo` | store write + 3 setters + connect/disconnect | store write + `primeRobotLfos(robot, [target])` (same behaviour, shared code) |

`localeStore.clearRobots`/`removeRobot` already dispose; unchanged. World transitions go through `clearRobots` → spawn, so they are covered by the spawn site.

### 1.4 Load control: fewer targets and lower odds, not a Full cap (assumptions 3, 5, 9)

The expected primed count is brought down at the source so no cap change is needed:

| | today (if primed) | after |
|---|---|---|
| audio-rate targets per robot | 10 (volume + 3 × gain/detune/pulseWidth) | 6 (3 × gain/detune) |
| seeded-on odds | 50% | 25% |
| expected primed per robot | ≈ 5 | ≈ 1.5 |
| expected primed per 12-robot roster | ≈ 60 | ≈ 18 |
| cost at ≈ 0.012 each (pulseWidth ≈ 0.08 gone) | ≈ 0.7 + pulse outliers → saturates | ≈ 0.22 |

`robotLfoCap`, `ROBOT_LFO_CAP_*`, `lfoAllowed` and `audioBudget.ts` are **unchanged**. Light (4) and Standard (12) caps are now reachable on load and keep doing their job. The §5 measurement is the gate; a finite Full cap is the fallback if it fails (assumption 3).

**Target removal** (`src/types/lfo.ts`): `RobotLfoTargetId` loses `'volume'` and the three `layerN.pulseWidth` members; `ROBOT_LFO_TARGET_IDS` becomes 9. Every consumer that enumerates the union follows by compiler error — that list is the removal task's to-do list (§2). Behaviourally: the Volume LFO frame disappears from the robot Output section and the company Output section; the pulse-width slider in each Signature Array layer stays, un-targeted (the layer's LFO group has three fields, not four). The engine's `getRobotModulationTarget` loses its `volume` and `pulseWidth` branches; `lfoEngine`'s `ROBOT_LFO_FIELD_RANGE` loses the same two rows.

**Seed odds** (`src/systems/spawnSystem.ts`): `LFO_QUIET_THRESHOLD` 0.5 → 0.75, comment updated. Nothing else in the seeder moves.

**Backward compatibility:** `buildRobotUpdates` (sessionDiff) and `fromCompactLfoSettingsMap` (sessionShareUtils) keep only keys in `ROBOT_LFO_TARGET_IDS`; `computeRobotAudioOverrideDiff` already iterates that list, so a re-saved session drops the dead keys. No payload version bump.

### 1.5 What stays the same

Seeded shapes/rates/depths (same keys, same draws), the budget's caps and LIFO eviction, held-off greying for robots (`LfoTargetGroup.heldOff`, `heldOffTargets`), drift attachment (inside `connectOne`), the global priming loop and odds, Audio Swells, and every remaining `lfoEngine` API. No Zustand field changes beyond the narrower target union; no session/share *format* change (only two keys that may now be ignored on load).

---

## 2. Target File Structure

```text
src/
├── systems/
│   ├── robotLfoPriming.ts                 NEW — primeRobotLfos, primeRosterLfos (round-robin), shared apply helper
│   ├── robotLfoPriming.test.ts            NEW
│   ├── spawnSystem.ts                     spawnRobot + reRegisterAllRobotsAudio call priming
│   ├── spawnSystem.test.ts                + cases
│   ├── robotOptionsActions.ts             applyLayerLfo → shared helper; applyLayersStructural primes after rebuild
│   └── robotOptionsActions.test.ts        + cases
├── engine/
│   ├── AudioEngine.ts                     post-load pass primes the roster (dynamic import)
│   └── AudioEngine.test.ts                + case
├── utils/
│   ├── sessionDiff.ts                     applySessionPayload primes changed targets; buildRobotUpdates drops unknown LFO keys
│   ├── sessionDiff.test.ts                + cases
│   ├── sessionShareUtils.ts               fromCompactLfoSettingsMap drops unknown LFO keys
│   └── sessionShareUtils.test.ts          + case
├── types/
│   ├── lfo.ts                             RobotLfoTargetId → 9 members; ROBOT_LFO_TARGET_IDS; doc comments
│   ├── lfo.test.ts                        13 → 9
│   └── Company.ts                         − CompanyOptionsSnapshot.volumeLfo
├── data/
│   ├── robotOptionsConfig.ts              − VOLUME_LFO_TARGET; pulseWidth param loses lfoTarget
│   └── lfoConfig.ts                       (follows ROBOT_LFO_TARGET_IDS — no edit expected)
├── engine/
│   ├── lfoEngine.ts                       ROBOT_LFO_FIELD_RANGE − volume/pulseWidth; regex narrowed; comments
│   └── AudioEngine.ts                     getRobotModulationTarget − volume/pulseWidth branches
├── systems/
│   ├── spawnSystem.ts                     LFO_QUIET_THRESHOLD 0.5 → 0.75 (plus the priming calls above)
│   ├── robotOptionsActions.ts             − applyVolumeLfo (plus the priming changes above)
│   └── companyOptions.ts                  − volumeLfo resolution
├── components/
│   ├── robot/AudioSettingSection.tsx      − Volume LFO frame, − volumeLfo/onVolumeLfoChange/volumeLfoHeldOff props, − useLfoTargetGroup
│   ├── panels/screen/console/RobotOptionsTab.tsx   − volumeLfo wiring/held-off selector
│   └── company/CompanyOptionsSection.tsx           − volumeLfo handler/snapshot patch
docs/
├── AUDIO_SYSTEM.md                        Seeding paragraph corrected; priming documented next to the global loop; target list 13 → 9; odds 25%
├── reference/ROBOT_DATA_GRID.md           Has LFO column: Volume and Interval → No
├── PERFORMANCE.md                         dated section: priming measurement (before/after, pinned worlds, Full/Standard/Light)
├── specs/archive/AUDIO_LOAD_BUDGET.md     one dated note on the survey line (condition fixed; targets reduced)
├── specs/FREE_SYNC_TOGGLE.md              one dated note: robot target counts now 9 / 3 panels
├── todo/roadmap.md                        new phase entry
└── specs/LFO_LOAD_FIX.md                  this file
```

Not touched: `lfoDrift.ts`, `audioBudget.ts`/`audioBudgetSystem.ts` (caps unchanged), `audioSwell*` (swell attributes are a separate system), `globalAudioSeed.ts`, the global priming loop, `Lfo.tsx`/`LfoTargetGroup.tsx`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Inside the seeder only `LFO_QUIET_THRESHOLD` moves; inside `lfoEngine` only the two removed-target rows and their regex. The global-chain odds, the budget caps and the Audio Swells attribute lists are off limits — a finding there is a note in §7, not a change.
- **Every engine touch happens after audio is running and after the voice is reserved.** No priming from store subscriptions, module scope, or render. The call sites in §1.3 are the complete list.
- **No bypass of the budget.** Priming calls `connectLfoTarget` like a user edit; it never calls `connectOne` internals, never edits `requested`/`heldOff`, never changes the policy.
- **No timers.** Priming is synchronous at each call site. (The budget-era measurement variant connected LFOs "a few seconds after power-on" via a throwaway timer; the product code must not.)
- **State stays serialisable and unchanged** — this phase writes nothing new to Zustand.
- **Perf measurement hygiene** (`docs/PERFORMANCE.md`, memory): foreground, one call at a time, check for orphaned Chrome, same-session A/B, pinned worlds `charlie:200:-30` and `bravo:-150:90`.
- **Ask before** changing any `ROBOT_LFO_CAP_*`, moving the odds anywhere but 0.75, or removing a third target — all Crawford-decided numbers (2026-09-30).
- **Never** commit throwaway measurement variants (budget-plan rule); never push or open a PR unless asked.

---

## 4. Code Style & Architecture Conventions

The shared apply helper — `applyLayerLfo` and `primeRobotLfos` both call it, so the connect/disconnect rule exists once:

```ts
// src/systems/robotLfoPriming.ts
import { lfoEngine } from '@/engine/lfoEngine';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId, type LfoSettings } from '@/types/lfo';
import type { Robot } from '@/types/Robot';

/** Push one target's settings to the engine and connect/start or disconnect/stop on rate. The single
 *  source of the "rate > 0 means requested" rule for robot LFOs (mirrors audioStore.setGlobalLfo). */
export function applyRobotLfoToEngine(robotId: string, target: RobotLfoTargetId, value: LfoSettings): void {
  lfoEngine.setLfoShape(target, value.shape, robotId);
  lfoEngine.setLfoRate(target, value.rate, robotId);
  lfoEngine.setLfoDepth(target, value.depth, robotId);
  if (value.rate > 0) {
    if (lfoEngine.connectLfoTarget(target, robotId)) lfoEngine.start(target, robotId);
  } else {
    lfoEngine.disconnectLfoTarget(target, robotId);
    lfoEngine.stop(target, robotId);
  }
}

export function primeRobotLfos(robot: Robot, targets: readonly RobotLfoTargetId[] = ROBOT_LFO_TARGET_IDS): void {
  const settings = robot.lfoSettings;
  if (!settings) return;
  for (const target of targets) {
    const value = settings[target];
    if (value) applyRobotLfoToEngine(robot.id, target, value);
  }
}

/** Round-robin across the roster (spec §1.2): request order is the Load Budget's priority order. */
export function primeRosterLfos(robots: readonly Robot[]): void {
  for (let i = 0; i < ROBOT_LFO_TARGET_IDS.length; i++) {
    const target = ROBOT_LFO_TARGET_IDS[i];
    for (const robot of robots) {
      const value = robot.lfoSettings?.[target];
      if (value) applyRobotLfoToEngine(robot.id, target, value);
    }
  }
}
```

Conventions as elsewhere: section-banner comments, doc comments that say *why* and cite the spec section, `devWarn` + swallow at call sites that already try/catch reservation (`spawnRobot`, `reRegisterAllRobotsAudio`, the post-load pass) so a priming failure never blocks a melody registration.

---

## 5. Testing & Verification Requirements

Framework: Vitest + Testing Library, co-located; `lfoEngine` mocked at the module boundary in systems tests (the existing `robotOptionsActions.test.ts` pattern). House TDD rhythm, one commit per task.

**`robotLfoPriming.test.ts`** — for a robot with 3 targets on and 10 off: exactly 3 `connectLfoTarget` calls, each followed by `start`, and 10 `disconnectLfoTarget`+`stop`; shape/rate/depth setters called for all 13 with the stored values; a robot with no `lfoSettings` makes no calls; `primeRosterLfos` of 3 robots emits requests in round-robin order (assert the `connectLfoTarget` call sequence is `[r1.volume, r2.volume, r3.volume, r1.layer0.gain, …]` for a fixture where those are on); a `connectLfoTarget` returning false (budget declined) skips `start` for that target only.

**Call-site tests** — `spawnSystem.test.ts`: `spawnRobot` primes after a successful reserve and not after a failed one; `reRegisterAllRobotsAudio` primes the roster once, after all reserves. `robotOptionsActions.test.ts`: `applyLayersStructural` primes the robot after `reReserveVoice`; `applyLayerLfo` behaviour unchanged (existing tests) and now routed through `applyRobotLfoToEngine` (spy). `AudioEngine.test.ts`: `start()` primes the roster after the post-load reservation pass, after the global loop. `sessionDiff.test.ts`: a payload with one robot's `lfoSettings` override primes exactly those targets after `updateRobot`; a payload without any LFO override primes nothing extra.

**Target removal** — `lfo.test.ts`: `ROBOT_LFO_TARGET_IDS` is exactly the 9 `layer{0,1,2}.{gain,detune,phase}` members. `AudioEngine.test.ts`: `getRobotModulationTarget('volume', …)` and `(…pulseWidth)` are not representable (type) — a runtime call with the stale string returns null and warns, never throws. `AudioSettingSection.test.tsx`: renders Mode + Volume and no `Lfo`; the `volumeLfo` props are gone (type). `SignatureArrayDrawer.test.tsx`: each layer's LFO group has 3 fields (gain/detune/phase), and the pulse-width slider still renders and edits. `CompanyOptionsSection.test.tsx`: no volume-LFO broadcast handler; layer LFO broadcast unchanged. `sessionDiff.test.ts` + `sessionShareUtils.test.ts`: a payload / compact map carrying `volume` and `layer1.pulseWidth` keys loads with those keys dropped and the known ones intact; a user-created company carrying `options.volumeLfo` loads without error.

**Seed odds** — `spawnSystem.test.ts`: for a fixed noise map, every target's `shape`/`depth` and every non-quiet `rate` equal the pre-change values (captured inline before the threshold moves — the Free | Sync plan's Task 3 pattern); over 50 seeded robots the on-rate per audio-rate target is within [15%, 35%]; a target quiet at 0.5 is still quiet at 0.75 (monotone).

**Engine integration (real `lfoEngine`, mocked Tone as in `lfoEngine.test.ts`)** — after priming a 2-robot roster under a policy allowing 3, `getHeldOffLfoKeys()` lists the 4th-and-later requests in round-robin order; raising the policy admits them in that order; a second `primeRobotLfos` of the same robot adds no new `requested` entries and no second `.connect()` (idempotence); after simulating a rebuilt voice (new signal object for the same target), one `primeRobotLfos` re-wires it (the stale-signal branch).

**Perf measurement (its own task, the decision gate for assumption 3):** `npm run perf` on `charlie` and `bravo`, same session, A/B of pre-phase vs post-phase at Full, plus Standard and Light once each; record the primed-LFO count per run from the `?debug` overlay. Record a dated table in `docs/PERFORMANCE.md`. **Gate:** at Full, peak render capacity on `bravo` stays below 0.9 and no interval doubling — the budget's own "stress at the caps" bar. **If the gate fails, stop and report**: the fallback is a finite Full cap (assumption 3), which is Crawford's decision, not a tuning knob.

**Lint/type/build** — `npm run lint`, `npm run build:types`, `npm run build` clean at every checkpoint.

**Manual (Crawford):** power on a fresh world at Full on desktop and hear robot modulation without touching anything; drop the dial to Light and watch robot LFO panels grey to held-off in round-robin order (each robot keeps its first-seeded target before any robot gets a second); change a layer's waveform type on a robot whose LFO is running and confirm the modulation survives the rebuild; load a session with an LFO override and hear it immediately; confirm the robot Output section shows Mode + Volume with no LFO frame and each Signature Array layer's LFO group offers three targets; a Pixel run at Light after everything else, since Light's cap of 4 is now actually reached on load.

---

## 6. Git & Workflow Context

- Branch: `bug/LFO-load` (already checked out), off `main` at 3816b20c (the Free | Sync docs merge, PR #519). The Free | Sync *code* has not started; whichever phase merges second adapts `primeRobotLfos`'s rate read in one line (assumption 8).
- One commit per task; imperative subject; body cites the spec section; co-author trailer per the session reminder. Crawford merges.
- Roadmap: a new entry under the performance series (sibling of 17.2.6, which shipped the budget) — "17.2.7 Robot LFO Priming" — or a standalone phase number if Crawford prefers; "Not Doing" lists the quiet-odds retune and any change to Light/Standard caps.
- Docs land in the last task; the `AUDIO_SYSTEM.md` correction and the archived budget spec's dated note go in the same commit.

---

## 7. Open Questions & Risks

**Decided by Crawford, 2026-09-30** (recorded here so they are not re-litigated):

1. **Full's cap stays unlimited for now.** Load is cut at the source instead (targets removed, odds lowered). The §5 perf gate decides whether a finite cap is still needed; if it is, that is a new decision.
2. **Seed odds lowered to 25% on.** Volume and pulse-width LFO targets removed. Volume because it wasn't impactful; pulse width because it is the cost outlier.
3. **Roadmap placement** — "ASAP"; the number is cosmetic. The plan uses 17.2.7 (sibling of the budget work) unless told otherwise.

**Still open:**

- Nothing blocking. A control-rate (polled, ramped) robot LFO path was discussed as the long-term performant alternative if many more robot LFOs are ever wanted; it is an engine change with a fidelity trade-off above ≈ 1–2 Hz and is explicitly *not* part of this phase.

**Risks:**

4. **Every world sounds different on load.** By design, and the whole point, but it is the first time the seeded robot modulation has been heard — and with two targets gone and the odds lowered, a user-edited world's saved Volume/pulse-width LFOs are silently dropped on load. Budget the manual listening pass as real work, not a checkbox; keep the pre-phase build around for A/B by ear (`git stash`/worktree).
5. **Phone load at Light.** Light's cap of 4 was measured but never *reached* on load until now. One Pixel run at Light is in §5; the budget's `playback` latency hint should absorb it.
6. **Request-order coupling.** Round-robin priority is decided by `ROBOT_LFO_TARGET_IDS` order (`volume` first). If a later phase reorders that array for unrelated reasons, the audible priority changes silently — the priming test pins the sequence, so it would at least fail loudly.
7. **Dynamic import in `AudioEngine.start()`** adds a second lazily-loaded systems module next to `audioStore`; same pattern, same test seam. Low.
8. **Free | Sync overlap.** Both phases edit `applyLayerLfo` and `AudioEngine.start()`. Land this one first (it is smaller and the other's plan assumes the gap); if the order flips, the merge is two one-line conflicts in known places.
