# Phase Spec: Robot Sends — Per-Robot Reverb and Delay Depth

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Main-thread check (§5): `npm run perf`
> - Phone gate (§5): the `?debug` HUD on the Pixel, seed `alpha`, Standard and Full

Source of intent: [docs/intent/robot-sends.md](../intent/robot-sends.md) (confirmed 2026-10-14, seven
questions, every guess confirmed). Roadmap slot: **50.2**
([roadmap.md](../todo/roadmap.md#502-robot-sends-per-robot-reverb-and-delay-depth)); its text is superseded
wherever this spec differs (notably: the seeded default is no longer "today's depth", and the topology
question is settled as true send/return). Branch: `feature/palette-sends`, off `main` (name is a proposal;
Crawford creates it). Robot Pan (roadmap 49) is merged, so the Levels block already carries Volume and Pan.

**Refactored 2026-10-22 by roadmap 55 ([ROBOT_SEND_TABLE.md](ROBOT_SEND_TABLE.md)), with no change in behaviour.** The
five per-robot sends are one table, `ROBOT_SENDS` (`src/data/robotSends.ts`), and the code this spec describes now
iterates it, so several names below no longer exist in `src/`: `applyReverbSend` / `applyDelaySend` and their `*Value`
forms are `applySend` / `applySendValue(robot, localeId, field, …)`; `REVERB_SEND_SCHEMA` and `DELAY_SEND_SCHEMA` are rows
of `ROBOT_SEND_SCHEMAS`; the robot screen's per-send handlers and the company's `on*SendChange` are one
`onSendChange(field, pct)` each, and the per-send swelling flags one `sendSwelling` record; the voice's send gains are one
`sends` record keyed by engine key; and the source scan that pinned the reservation sites is gone, since every site primes
with `robotSendLevels(robot)`. §1 to §4 are left as written, the record of what this phase built; the refactor spec has the
current names.

Survey basis (2026-10-14, against `main` at `450bf2ad`; every citation below was read, not recalled):

- **The chain today.** `buildGlobalFxChain` (`src/engine/audioEngine/globalFx.ts:52`) builds EQ3, LPF, HPF,
  `FeedbackDelay` (`wet: 0`, `maxDelay: 10`, `:78`), `Reverb` (`wet: 0.3`, `:68`), Compressor, Limiter and
  `masterGain`, then calls `wireGlobalFxChain(false)` (`:99`). `wireGlobalFxChain` (`:144`) calls
  `disconnectAllFxNodes` (`:108`) and wires one of two serial orders: Natural `EQ3 → LPF → HPF → Delay →
  Reverb → Compressor → Limiter` or Controlled `EQ3 → LPF → HPF → Compressor → Delay → Reverb → Limiter`,
  then `masterGain → Destination`, then `connectTapsIfWanted()` (`:187`). `getGlobalChainEntry()` (`:196`)
  returns EQ3, the node every robot bus feeds.
- **The robot bus today.** `reserveVoice` (`src/engine/AudioEngine.ts:669`) builds `composite.output →
  panner → busGain → busFilter → getGlobalChainEntry()` (`:683–708`), stores `{ composite, panner, busGain,
  busFilter }` in the module map `compositeVoices` (`:130`) through `storeVoice` (`:154`), and
  `disposeVoiceNodes` (`:138`) tears the four down. `releaseVoice` (`:747`) also clears `lastPanByRobot`,
  `manualPanByRobot` and the pan readout.
- **The global wet sliders today.** `GlobalAudioSettings.reverb.wet` / `delay.wet` (`src/types/globalAudio.ts`,
  defaults `0.3` / `0.15` at `:94–95`) reach the nodes through `AudioEngine.setGlobalReverb` /
  `setGlobalDelay` (`globalFx.ts:371` / `:387`), which write `reverb.wet.value` / `delay.wet.value`. The store
  routes there from `GLOBAL_SETTER` and `applyGlobalAudioToEngine` (`src/stores/audioStore.ts:84–114`).
  Slider bounds are `0…1` (`audioRigConfig.ts:132/:143`, `GLOBAL_AUDIO_SEED_RANGES` `:73/:77`).
- **How they are seeded today.** `generateGlobalAudioSettings` (`src/utils/globalAudioSeed.ts`) draws
  `reverb.wet` from `GLOBAL_AUDIO_LOADING_RANGES['reverb.wet']` = `0.1…0.4` (`:154`,
  `globalAudioLoadingRanges.ts:38`) and `delay.wet` from `0…0.3` (`:34`), with a `globalAudio.delay.quiet`
  draw below `DELAY_QUIET_THRESHOLD = 0.25` (`globalAudioSeed.ts:77`) forcing delay to `0` (`:147`).
  `transmissionPresets.ts` carries explicit `wet` values for three presets (`:65–70`, `:179–188`, `:309–318`).
- **Swells.** Two pools. The global pool (`SWELL_GLOBAL_TARGET_IDS`, `src/types/audioSwell.ts:26`) is the 7
  `GlobalLfoTargetId`s plus `delay.wet` / `reverb.wet`, mapped to the global settings in `GLOBAL_TARGET_META`
  (`audioSwells.ts:151–152`) with `wet === 0` as the off-equivalent (`:507–508`, also consulted mid-swell in
  `advanceGlobalSwell`). The robot pool (`SWELL_ROBOT_ATTRIBUTE_IDS`, `audioSwell.ts:52`) is `volume`, the
  per-layer `gain`/`detune`/`phase`/`pulseWidth` and the 4 ADSR fields, with bounds in
  `ROBOT_SWELL_FIELD_RANGE` (`src/data/audioSwellRanges.ts`), a read/write pair (`readRobotValue` `:191`,
  `writeRobotValue` `:211`, which calls the same `apply*` a hand edit would), an eligibility check
  (`isRobotAttributeEligible` `:567`, with `isRobotAttributeStructurallyLive` `:181` as the parent-mute
  gate, evaluated at selection only), and single-robot plus company-wide variants. A swell ramps a value out
  and back; the peak is drawn across at least half the field's range (`SWELL_MIN_RANGE_FRACTION`, `:100`).
  Screens pass a `swelling` flag from `isRobotAttributeSwelling` (`:814`) to the slider so a swell's own ramp
  isn't eased twice, and cancel a swell on a hand edit with `cancelSwellForRobotAttribute` (`:804`,
  e.g. `RobotScreen.tsx:232`). `computeRobotAudioOverrideDiff` saves a swell's `baseValue`, not the
  mid-ramp value (`extractSwellBaseValueIfActive`, `sessionDiff.ts:103`).
- **The Pan plumbing this mirrors.** `Robot.pan` / `panAuto` (`src/types/Robot.ts:149/:153`), spawn defaults
  (`spawnSystem.ts:709–710`), the actions `applyPan` / `applyPanAuto` (`robotOptionsActions.ts:46/:56`),
  `AudioEngine.updateRobotPan` (`AudioEngine.ts:940`) primed at every reservation site (`:292`, `:834`,
  `spawnSystem.ts:892`, `sessionDiff.ts:560`), `CompanyOptionsSnapshot.pan` (`Company.ts:20–22`),
  `resolveCompanyOptions` (`companyOptions.ts:33–38`), `useCompanyOptions` handlers, the diff / restore pair
  (`sessionDiff.ts:272`, `:395`), the share codec `p` (`sessionShareUtils.ts:99–107`, `:221`, `:240`), and the Pan row
  in `AudioSettingSection.tsx`.
- **Seeded per-robot fields live in a baseline.** `RobotAudioBaseline` / `generateRobotAudioBaseline`
  (`spawnSystem.ts:420/:448`) replay the spawn draws so `computeRobotAudioOverrideDiff` (`sessionDiff.ts:232`)
  can diff the live robot against its seed. A copied robot (`robot.copyChance` < 0.30) inherits a sibling's
  audio fields but keeps its own name. `masterVolume` and `pan` are not in the baseline (volume is
  never persisted; pan's baseline is a constant). A seeded, saved field must be.
- **Loading order.** `loadInstruments` (`AudioEngine.ts:264`) calls `buildGlobalFxChain()` before its
  post-load reservation pass, so the rooms exist when voices are reserved. `findActiveRobot` (`:205`) only
  sees the active locale, which is why Pan primes explicitly at each site instead of looking the robot up
  inside `reserveVoice`.
- **Copy.** `probe.levels` intro (`src/content/copy/probe.ts:131`), `probe.volume` (`:150`), `probe.pan`
  (`:157`), `probe.pan.auto` (`:162`); global sliders `fleet.reverb.amount` / `fleet.delay.amount`
  (`fleet.ts:194/:211`); Decay Mode copy `fleet.output.decayMode` (`:266–273`).

ASSUMPTIONS I'm making beyond the intent's seven decisions (correct now or I'll proceed with these):

1. **The rooms run in parallel, not in series.** Today Delay feeds Reverb, so a delay echo is reverberated.
   With sends, a robot at Reverb 0 must have *no* reverb at all (intent), so the Delay room's return does
   **not** feed the Reverb room: two parallel rooms, each fed only by robot sends. Delay echoes are no
   longer reverberated. This is a sound change, accepted under the pre-v1 rule. **(Veto point.)**
2. **The returns rejoin where the rooms sat in the old order**, so each Decay Mode keeps its wiring-level
   meaning (§1.3). Natural: returns join at the Compressor's input (echoes compressed, not filtered —
   today's wiring). Controlled: returns join at the Limiter's input (echoes uncompressed, not filtered —
   today's wiring). The dry chain becomes `EQ3 → LPF → HPF → Compressor → Limiter` in **both** modes; the
   toggle now only moves where the returns join. **(Veto point.)**
3. **Rooms are `wet = 1` forever; the global Reverb / Delay sliders drive a new `Gain` per room — the
   return** (`_globalReverbReturn`, `_globalDelayReturn`). Writing the slider to `Effect.wet` would be wrong:
   at `wet < 1` Tone's crossfade passes a share of the sent signal around the effect, so a "dry" robot's
   send would leak through. Two new global `Gain`s, within the roadmap's "global chain, one instance" rule.
4. **`GlobalAudioSettings.reverb.wet` / `delay.wet` keep their names and ranges**, and mean "return level"
   from now on. Default `1`, not seeded, not drawn. They are **no longer swell targets** (assumption 13):
   at full a swell could only dip. The user-facing words change ("Amount" → a return word, §1.8).
5. **The send is a linear gain of the stored fraction** (`0…1`, no perceptual taper — the seed bands
   `0.1…0.4` / `0…0.3` were wet-mix fractions and map onto send gain directly). Slider display `0…100 %`,
   step 1. Because the dry path now plays at unity (before: equal-power crossfaded under wet) the overall
   level shifts a little; the limiter is untouched and the manual listen covers it.
6. **Each robot's two sends are drawn unconditionally, even on the copy branch** (like `name`), under new
   dataIds `robot.send.reverb`, `robot.send.delay`, `robot.send.delay.quiet`, in the same `offset =
   spawnCount` convention. A copied robot shares its sibling's voice but gets its own depth, so a copy is
   not a clone in the mix. The delay "quiet" chance (25 %) is now per robot: about a quarter of the fleet
   starts with no delay. **(Veto point: copy-inherit instead of own-draw is a one-line change.)**
7. **The two draws read the existing global rows** `GLOBAL_AUDIO_LOADING_RANGES['reverb.wet']` and
   `['delay.wet']` (and their step 0.01 / quantization), so "the same spread" is literally the same table,
   not a copy. The rows keep their key names and gain a comment that they are now the per-robot send bands;
   `generateGlobalAudioSettings` stops sampling them. `DELAY_QUIET_THRESHOLD` moves to
   `src/constants/index.ts` as `SEND_DELAY_QUIET_THRESHOLD` (same `0.25`) because `spawnSystem.ts` now owns
   the draw.
8. **Sends are primed explicitly at every reservation site**, the Pan pattern, not looked up inside
   `reserveVoice` (`findActiveRobot` is active-locale only) and **without widening `reserveVoice`'s
   signature** — which also keeps this branch clear of roadmap 50.1's proposed `articulation` parameter, so
   the two sub-phases do not collide. The engine creates both send gains at `0`; `updateRobotSends` ramps
   them to the stored values at each site. A source-scan test guards against a fifth site that forgets.
9. **The send takes its signal after the bus Volume and the bus filter** (it connects from `busFilter`), so
   turning a robot down fades its echo with it (intent). It is post-pan, so the room input is the same
   stereo image the dry path has.
10. **`reverbSend` / `delaySend` are required `number` fields on `Robot`** (like `masterVolume`), optional on
    `CompanyOptionsSnapshot`, optional on `RobotAudioOverrideDiff` as the same names, and in the share codec
    as `rs` / `ds`. They join `RobotAudioBaseline` so the diff is "live differs from seed".
11. **Lore words are placeholders until Crawford's copy pass:** `probe.reverbSend` { Reverb / **Remoteness** }
    and `probe.delaySend` { Delay / **Retrace Depth** }. Keys and human words are fixed.
12. **The phone gate has no threshold and no escape hatch** (intent). It is a pass / fail check; a fail is a
    wiring bug to fix or a reason to back out.
13. **Swells move from the global returns to the individual robots** (Crawford, 2026-10-14). `reverbSend` and
    `delaySend` join `SWELL_ROBOT_ATTRIBUTE_IDS` (17 → 19); `delay.wet` and `reverb.wet` leave
    `SWELL_GLOBAL_TARGET_IDS` (9 → 7). I read "put them on the individual robots" as a move, not a copy; if
    you meant both, the global rows stay and §1.9's removal steps are skipped. **Confirmed as a move by Crawford,
    2026-10-14** (global rows removed in Task 11). The details
    (§1.9): bounds `0…1` like `volume`; no clamp on the swing, so a quiet send can swell nearly to full;
    a send of exactly `0` is ineligible (an off stays off, the global `wet === 0` rule and the layer-gain-0
    rule's analogue); a hand edit cancels the swell exactly as Volume's does; a saved session stores the
    swell's base value.

---

## 1. Overview & Claude Explanation

Each robot gets two send `Gain`s tapped from its bus after Volume and the bus filter: one into a global
**Reverb room**, one into a global **Delay room**. The rooms are the existing `Tone.Reverb` and
`Tone.FeedbackDelay`, now permanently fully wet and fed only by sends, each followed by a **return** `Gain`
that the existing global "wet" sliders drive. The dry path no longer passes through the rooms at all, so a
robot whose sends are zero is truly dry. Both Decay Modes keep the wiring-level meaning they have today
by changing only where the returns rejoin the dry chain. Each robot's depth is seeded at spawn from the same
bands the global wet sliders used to be seeded from, edited by two plain `0–100 %` sliders under Pan in the
Levels block on the robot and company screens, ramped on change, saved with sessions and share links,
and broadcast by companies. No new Tone node types and no per-robot effects: 24 send gains and 2 return gains
in total. The two sends are robot **swell attributes**, so an Audio Swell can briefly push one robot (or a
whole company) further into the echo and back; the global swell pool loses its two `wet` targets. Nothing on
the robot body moves with a send, and nothing about LFOs or the Audio Load Budget changes.

### 1.1 Data shape

```ts
// src/types/Robot.ts
export interface Robot {
  // …
  pan: number;
  panAuto: boolean;
  /** Reverb send, 0…1 — how much of this robot's post-Volume signal enters the global Reverb room.
   *  Seeded at spawn (SEND_* bands, §1.5); the Reverb slider edits it. 0 = no reverb for this probe. */
  reverbSend: number;
  /** Delay send, 0…1 — as reverbSend, into the Delay room. */
  delaySend: number;
}

// src/constants/index.ts, beside PAN_*
export const SEND_MIN = 0;
export const SEND_MAX = 1;
export const SEND_DISPLAY_SCALE = 100;            // slider shows 0…100 %, stores 0…1 (same split as Volume)
export const SEND_STEP_PERCENT = 1;
/** Chance a robot's own Delay send seeds to exactly 0 (was DELAY_QUIET_THRESHOLD, the global Delay's roll). */
export const SEND_DELAY_QUIET_THRESHOLD = 0.25;

// src/types/Company.ts
export interface CompanyOptionsSnapshot { /* … */ reverbSend?: number; delaySend?: number; }

// src/types/session.ts
export interface RobotAudioOverrideDiff {
  // …
  /** Present ⇒ differs from the seeded send (0…1, two decimals). Absent ⇒ the seeded value. */
  reverbSend?: number;
  delaySend?: number;
}

// src/systems/spawnSystem.ts
export interface RobotAudioBaseline { /* … */ reverbSend: number; delaySend: number; }
```

`GlobalAudioSettings` keeps its shape. `DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb.wet` and `.delay.wet` become `1`
(`globalAudio.ts:94–95`) and their doc comments say "return level". `ReverbSettings.wet` /
`DelaySettings.wet` doc comments likewise. Test fixtures that build a `Robot` by hand gain the two fields
(the compiler finds them).

### 1.2 Seeding — `spawnSystem.ts` and `globalAudioSeed.ts`

```ts
// spawnSystem.ts — one helper, used by BOTH spawnRobot and generateRobotAudioBaseline so the two cannot drift
function generateRobotSends(noiseMap: NoiseFunction2D, offset: number): { reverbSend: number; delaySend: number } {
  const reverb = GLOBAL_AUDIO_LOADING_RANGES['reverb.wet'];
  const delay = GLOBAL_AUDIO_LOADING_RANGES['delay.wet'];
  const quiet = getSeededVal(noiseMap, 'robot.send.delay.quiet', offset, 0, 1) < SEND_DELAY_QUIET_THRESHOLD;
  return {
    reverbSend: quantizeSend(getSeededVal(noiseMap, 'robot.send.reverb', offset, reverb.min, reverb.max)),
    delaySend: quiet ? 0 : quantizeSend(getSeededVal(noiseMap, 'robot.send.delay', offset, delay.min, delay.max)),
  };
}
```

`quantizeSend` = `quantizeToStep(raw * 100, 0, SEND_STEP_PERCENT) / 100` (the Volume quantization shape).
The no-noise-map fallback in `spawnRobot` (the `alea(...)` path) mirrors Volume's: two `alea` draws over the
same bands. The robot literal gains `...generateRobotSends(...)` after `panAuto`; `generateRobotAudioBaseline`
calls the same helper **outside** the copy branch and returns `{ ...priorBaselines[srcIdx], name, reverbSend,
delaySend }` on the copy path, matching assumption 6. Existing keys and draw order are untouched (each
dataId is its own noise-map row).

Global side: `generateGlobalAudioSettings` sets `reverb.wet` and `delay.wet` to
`DEFAULT_GLOBAL_AUDIO_SETTINGS.*.wet` (1) instead of sampling, and its `globalAudio.delay.quiet` draw and the
local `DELAY_QUIET_THRESHOLD` are deleted. `GLOBAL_AUDIO_LOADING_RANGES`' two wet rows stay, with a comment
saying they are the per-robot send bands (§2). `transmissionPresets.ts`' three presets set both `wet` values
to `1`. Old `?session=` payloads with a smaller `wet` simply load that return level; no migration.

### 1.3 Engine — `globalFx.ts` (the topology)

```text
Natural Decay (default):
  robot busFilter ──► EQ3 → LPF → HPF → Compressor ───────────────► Limiter → masterGain → Destination
  robot busFilter ──► reverbSend ─► ReverbRoom (wet 1) ─► reverbReturn ─┐
  robot busFilter ──► delaySend  ─► DelayRoom  (wet 1) ─► delayReturn  ─┴─► Compressor input

Controlled Decay:
  robot busFilter ──► EQ3 → LPF → HPF → Compressor ───────────────► Limiter → masterGain → Destination
  … same sends and rooms …                         both returns ────────────► Limiter input
```

```ts
// globalFx.ts
let _globalReverbReturn: Tone.Gain | null = null;
let _globalDelayReturn: Tone.Gain | null = null;

// buildGlobalFxChain: rooms construct with wet: 1 (Reverb, FeedbackDelay), returns with Gain(1).

export function wireGlobalFxChain(controlledDecay: boolean): void {
  disconnectAllFxNodes();                       // now also lists the two rooms' outputs and both returns
  const dry = [_globalEQ, _globalLPF, _globalHPF, _globalCompressor, _globalLimiter].filter(Boolean);
  // …connect dry in order, last → masterGain → destination, exactly as today…
  const join = controlledDecay ? _globalLimiter : _globalCompressor ?? _globalLimiter;
  _globalReverb?.connect(_globalReverbReturn); _globalReverbReturn?.connect(join);
  _globalDelay?.connect(_globalDelayReturn);   _globalDelayReturn?.connect(join);
  connectTapsIfWanted();
}

/** The two rooms' inputs, read by reserveVoice to connect each robot's send gains. Null until built. */
export function getGlobalReverbRoom(): Tone.Reverb | null;
export function getGlobalDelayRoom(): Tone.FeedbackDelay | null;

export function setGlobalReverb(params: Partial<ReverbSettings>): void {
  // wet now drives the RETURN gain (assumption 3); decay / preDelay unchanged (coalesced IR regeneration)
  if (params.wet !== undefined && _globalReverbReturn) _globalReverbReturn.gain.value = params.wet;
  // …
}
// setGlobalDelay likewise: wet → _globalDelayReturn.gain.value; delayTime / feedback unchanged.
```

`disconnectAllFxNodes` calling `disconnect()` on a room drops only its *outputs*; the robots' send gains stay
connected to the room's input across every Decay flip (a test pins this). The previous "Controlled" ordering
no longer exists as a serial order; `wireGlobalFxChain`'s doc comment, `AUDIO_SYSTEM.md`'s topology block
and `GLOBAL_CHAIN_GRID.md` are rewritten (§2). The `?debug` taps are unchanged in code: the pre-tap still
reads EQ3's output (the dry signal plus nothing from the rooms, which now join later), the master tap reads
`masterGain`; the diagnostic doc gains a note that the chain changed. *(Corrected at T20: the draft said the pre-tap "no
longer includes echoes", but it never did, since the Delay and Reverb followed EQ3 in the old serial chain too; only the
chain named in the diagnostic's reading table changed.)*

### 1.4 Engine — `AudioEngine.ts` (per-robot sends)

```ts
const SEND_RAMP_SECONDS = 0.05;      // same value as VOLUME_RAMP_SECONDS / PAN_RAMP_SECONDS, own constant

// compositeVoices entry (and storeVoice / disposeVoiceNodes) gain two nodes:
//   { composite, panner, busGain, busFilter, reverbSend: Tone.Gain, delaySend: Tone.Gain }

// reserveVoice, after busFilter is connected:
const reverbSendNode = GainCtorLocal ? new GainCtorLocal(0) : makeStubGain(0);
const delaySendNode  = GainCtorLocal ? new GainCtorLocal(0) : makeStubGain(0);
busFilter.connect(reverbSendNode); busFilter.connect(delaySendNode);
const reverbRoom = getGlobalReverbRoom(); if (reverbRoom) reverbSendNode.connect(reverbRoom);
const delayRoom  = getGlobalDelayRoom();  if (delayRoom)  delaySendNode.connect(delayRoom);
// the busFilter → chain entry (dry) connection is unchanged.

export const AudioEngine = {
  /** Ramp a robot's send gains. Either key may be omitted. A safe no-op with a devWarn when no composite is
   *  reserved (updateRobotMasterVolume's pattern) — the store holds the value and every reservation site
   *  re-primes it. Values are clamped to [SEND_MIN, SEND_MAX]. */
  updateRobotSends(robotId: string, sends: { reverb?: number; delay?: number }): void;
};
```

`disposeVoiceNodes` disconnects and disposes both send gains with the rest. The stub-fallback voice in
`reserveVoice`'s catch path gets two `makeStubGain(0)`s. **Priming**, after each reservation, unconditionally
(unlike Pan, a send is never "default"): `AudioEngine.updateRobotSends(robot.id, { reverb: robot.reverbSend,
delay: robot.delaySend })` at `loadInstruments`' post-load pass (`:281`), `reReserveVoice` (`:822`, done inside,
like Pan's), `spawnSystem.ts:735` and `:889`, and `sessionDiff.ts`' restore (gated on the diff carrying a
send, like the Pan prime at `:560`). `reserveVoice`'s signature is **not** widened. `updateRobotSends` ramps
`gain.rampTo(v, SEND_RAMP_SECONDS)` when available, else sets `.value`.

Nothing else in the engine changes: the melody loop, `scheduleNote`, `updateAllPanners`, the bus filter and
volume are untouched. No GSAP callback is involved (Strict Separation holds).

### 1.5 Actions — `src/systems/robotOptionsActions.ts`

```ts
// Sends display 0-100 % but store 0..1, the Volume split. A hand edit cancels a swell on the same robot at
// the CALLER (RobotScreen / useCompanyOptions), exactly where handleVolumeChange does; the swell tick itself
// calls these two (via writeRobotValue), so the cancel cannot live in the action (it would cancel itself).
export function applyReverbSend(robot: Robot, localeId: string, pct: number): void {
  const value = clampSend(pct / SEND_DISPLAY_SCALE);
  useLocaleStore.getState().updateRobot(localeId, robot.id, { reverbSend: value });
  AudioEngine.updateRobotSends(robot.id, { reverb: value });
}
export function applyDelaySend(robot: Robot, localeId: string, pct: number): void { /* same, delaySend / delay */ }
```

`localeStore.updateRobot` clamps both fields into `[SEND_MIN, SEND_MAX]` where it already clamps `pan` so a
hand-edited payload cannot store `7`.

### 1.6 UI — `AudioSettingSection` and its schemas

```ts
// src/data/robotOptionsConfig.ts, beside VOLUME_SCHEMA / PAN_SCHEMA
export const REVERB_SEND_SCHEMA: SliderLinearSchema = {
  id: 'robotOptions.reverbSend', type: 'sliderLinear', ...labels('probe.reverbSend'),
  min: 0, max: 100, step: 1, orientation: 'horizontal',
};
export const DELAY_SEND_SCHEMA: SliderLinearSchema = { /* 'robotOptions.delaySend', labels('probe.delaySend') */ };
```

```ts
// AudioSettingSection.tsx
export interface AudioSettingValue {
  audioMode: NonNullable<Robot['audioMode']>;
  masterVolume: number;
  pan: number;
  panAuto: boolean;
  /** 0…1 stored; displayed ×SEND_DISPLAY_SCALE. */
  reverbSend: number;
  delaySend: number;
}
// props gain: onReverbSendChange: (pct: number) => void;  onDelaySendChange: (pct: number) => void;
//             reverbSendSwelling?: boolean;  delaySendSwelling?: boolean;   (forwarded to each slider's `swelling`, §1.9)
```

Rendering: two more rows in `VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA`, after the Pan row — each a plain
`SliderLinear` (`value={value.reverbSend * SEND_DISPLAY_SCALE}`) inside a wrapper div that carries **no**
`display:flex` for the same `useVoxelTrackSlider` reason the Volume row documents. The handlers are
already-stable props (memo contract unchanged). **`RobotScreen.tsx`**: the `audioSettingValue` memo gains the
two fields and deps; `handleReverbSendChange` / `handleDelaySendChange` → `applyReverbSend` / `applyDelaySend`,
both `useCallback([localeId])` like the volume handler. **Company** (`useCompanyOptions.ts`):
`DISABLED_AUDIO_SETTING` gains `reverbSend: 0, delaySend: 0`; `resolveCompanyOptions` gains
`reverbSend: firstMember.reverbSend ?? 0, delaySend: firstMember.delaySend ?? 0`; the `audioSettingValue` memo
adds the two resolved locals; two handlers mirror `onVolumeChange`:

```ts
const onReverbSendChange = useCallback((pct: number) => {
  latest.current.members.forEach((m) => applyReverbSend(m, localeId, pct));
  patchSnapshot({ reverbSend: clampSend(pct / SEND_DISPLAY_SCALE) });
}, [localeId, patchSnapshot]);
```

(`onDelaySendChange` likewise.) `CompanyOptionsSection` passes the two handlers. Broadcast-not-link as every other
field: members disagree until a slider is touched, after which every member sits at one value.

### 1.7 Persistence and sharing

- **Diff** (`computeRobotAudioOverrideDiff`): `if (roundToDecimals(live.reverbSend, 2) !==
  roundToDecimals(baseline.reverbSend, 2)) diff.reverbSend = roundToDecimals(live.reverbSend, 2)`, and the
  same for `delaySend`. Two decimals matches the slider's 1/100 step and the seed quantization, so an
  untouched robot diffs to nothing and a one-step move survives.
- **Restore** (`buildRobotUpdates`): a finite `diff.reverbSend` / `diff.delaySend` becomes
  `updates.reverbSend` / `delaySend`; a non-finite or out-of-range value is ignored whole (the robot keeps
  its seeded send), the `pan` precedent. In the apply loop the engine prime reads the **stored, clamped**
  `updatedRobot` values, not the raw diff, and runs only when the diff carried a send.
- **Share link** (`sessionShareUtils.ts`): `CompactRobotOverrideDiff.rs?` / `ds?` with `to` / `from` mirroring
  `p`; a non-numeric or out-of-`[0,1]` value is dropped at decode. Payload `version` stays 2.
- **Globals**: `reverb.wet` / `delay.wet` persist as today (their meaning is "return level", their baseline in
  the diff is now `1`). No payload shape changes.
- **`docs/SESSION_STORAGE.md`**: the two sends are persisted (composition choice), `masterVolume` and
  `audioMode` stay on the never-persisted list.

### 1.8 Content — `src/content/copy/probe.ts` and `fleet.ts`

```ts
'probe.reverbSend': {
  human: 'Reverb', lore: 'Remoteness',                  // lore = placeholder, assumption 11
  unit: '%',
  help: { human: 'How much of this probe’s sound is sent into the shared Reverb. 0% keeps it completely dry and close; higher settings push it further away into the echo.' },
},
'probe.delaySend': {
  human: 'Delay', lore: 'Retrace Depth',                 // placeholder
  unit: '%',
  help: { human: 'How much of this probe’s sound is sent into the shared Delay. 0% gives it no repeats at all; higher settings give it louder, longer-trailing repeats.' },
},
```

`probe.levels.intro.humanDescription` gains a sentence on Reverb and Delay. The global sliders are relabelled
as the master returns: `fleet.reverb.amount` / `fleet.delay.amount` keep their keys, and their `human` / `lore`
/ `help` change to say "how loud the whole Reverb / Delay is, as heard from every probe; each probe's own
Reverb and Delay sliders decide how much of it each one sends in; 0 silences the room" (exact words are a
copy-pass item; keys and semantics are fixed). The `fleet.reverb` / `fleet.delay` section intros that say
"how much of that echo you hear blended in with the original sound" (`fleet.ts:174`) get the same
correction. Every key is referenced from `robotOptionsConfig.ts` / `audioRigConfig.ts`, so `content.test.ts` and
the ESLint literal guard stay green with no exemptions. `ROBOT_DATA_GRID.md` and `SLIDER_VALUES.md` get a Reverb
and a Delay row (Linear, 0–100 %, step 1, stored 0–1, seeded `0.1–0.4` / `0–0.3` with a 25 % zero roll).

### 1.9 Swells — the sends become robot swell attributes

```ts
// src/types/audioSwell.ts
export type SwellGlobalTargetId = GlobalLfoTargetId;                 // 'delay.wet' | 'reverb.wet' removed
export const SWELL_GLOBAL_TARGET_IDS = [ /* the 7 GlobalLfoTargetIds */ ];
export type SwellRobotAttributeId = /* …existing 17… */ | 'reverbSend' | 'delaySend';
export const SWELL_ROBOT_ATTRIBUTE_IDS = [ /* …17… */, 'reverbSend', 'delaySend' ];   // 19

// src/data/audioSwellRanges.ts — the stored 0…1 fraction, like volume (not the 0-100 display)
reverbSend: { min: SEND_MIN, max: SEND_MAX }, delaySend: { min: SEND_MIN, max: SEND_MAX },

// src/systems/audioSwells.ts
readRobotValue:  if (attribute === 'reverbSend') return robot.reverbSend;  (delaySend likewise)
writeRobotValue: if (attribute === 'reverbSend') { applyReverbSend(robot, localeId, value * SEND_DISPLAY_SCALE); return; }
isRobotAttributeStructurallyLive: a send attribute is live only while its stored value is > 0.
```

- **Global pool shrinks.** `GLOBAL_TARGET_META` loses its `delay.wet` / `reverb.wet` rows;
  `GlobalSwellEffectKey` loses `'delay'` and `'reverb'`; `isGlobalTargetAtOffEquivalent` and its two uses
  (`isGlobalTargetEligible`, `advanceGlobalSwell`'s mid-swell cancel) are deleted, since no remaining global
  target has an off-equivalent. `sessionDiff.ts`' `applyGlobalSwellBasesToAudio` loses its Delay and Reverb
  blocks (`:167–177`). Nothing else in the global pool changes. `isGlobalTargetSwelling('delay'|'reverb',
  'wet')` simply returns `false` from then on, so the Fleet Params sliders need no edit.
- **Eligibility.** A send at exactly `0` is not eligible at selection (`isRobotAttributeStructurallyLive`),
  so a robot seeded with no delay never has one swell in, mirroring the old global rule and the layer-gain
  rule. As with every robot attribute, it is checked at selection only, not mid-swell.
- **Swing.** No new clamp: the default draw (at least half the 0…1 range, either direction) means a robot
  sitting at 0.25 swells to between 0.75 and 1.0 and back — a wash of echo that returns exactly to base. If
  the manual listen finds that too heavy, the follow-up is a `SEND_SWELL_UPWARD_CEILING` through the existing
  `clampSwellCeiling` (the HPF precedent); not in this phase unless Crawford asks.
- **Both paths.** The single-robot and company-wide swell paths already iterate
  `ROBOT_SWELL_FIELD_RANGE` / `isRobotAttributeEligible`, so they pick the new attributes up with no extra
  branch; a company-wide swell moves every eligible member's send in lock-step in time, not in magnitude.
- **UI.** `RobotScreen.tsx` computes `reverbSendSwelling` / `delaySendSwelling` with
  `isRobotAttributeSwelling` next to `volumeSwelling` (`:200`) and passes them down; its two send handlers call
  `cancelSwellForRobotAttribute(id, 'reverbSend' | 'delaySend')` before `applyReverbSend` / `applyDelaySend`
  (the `handleVolumeChange` shape, `:232`). `useCompanyOptions.ts` does the same: flags from the first
  member (`:173`), cancel for every member in its two handlers.
- **Persistence.** `computeRobotAudioOverrideDiff` captures `extractSwellBaseValueIfActive(live.id,
  'reverbSend') ?? live.reverbSend` (and delay) before comparing with the baseline, the `layerN.gain`
  precedent, so a session saved mid-swell stores the base value and an untouched robot still diffs to `{}`.
- **Docs.** `AUDIO_SYSTEM.md`'s swell section (the "9 targets" global-pool sentence and the "17 robot
  attributes" one) and `SwellRobotAttributeId`'s doc comment are corrected to 7 and 19.

---

## 2. Target File Structure

```text
src/
├── constants/index.ts                             + SEND_MIN, SEND_MAX, SEND_DISPLAY_SCALE, SEND_STEP_PERCENT, SEND_DELAY_QUIET_THRESHOLD
├── types/
│   ├── Robot.ts                                   + reverbSend, delaySend
│   ├── Company.ts                                 + CompanyOptionsSnapshot.reverbSend / delaySend
│   ├── session.ts                                 + RobotAudioOverrideDiff.reverbSend / delaySend
│   ├── globalAudio.ts / .test.ts                  defaults reverb.wet / delay.wet = 1; "return level" docs
│   └── audioSwell.ts / .test.ts                   global ids 9 → 7, robot ids 17 → 19
├── engine/
│   ├── audioEngine/globalFx.ts / .test.ts         return gains, rooms wet 1, new wiring, room getters, wet → return, disconnect list
│   └── AudioEngine.ts / .test.ts                  send gains in compositeVoices, reserveVoice wiring, updateRobotSends, dispose, loadInstruments + reReserveVoice primes
├── stores/localeStore.ts / .test.ts               updateRobot clamps both sends
├── systems/
│   ├── spawnSystem.ts / .test.ts                  generateRobotSends, robot literal, baseline, two reserve-site primes
│   ├── robotOptionsActions.ts / .test.ts          applyReverbSend, applyDelaySend
│   ├── audioSwells.ts / .test.ts                  robot pool read/write/eligibility for the sends; global pool loses delay.wet / reverb.wet
│   └── companyOptions.ts / .test.ts               resolveCompanyOptions fallbacks
├── utils/
│   ├── globalAudioSeed.ts / .test.ts              wet = default 1, delay.quiet draw + DELAY_QUIET_THRESHOLD removed
│   ├── sessionDiff.ts / .test.ts                  diff / restore / prime
│   └── sessionShareUtils.ts / .test.ts            `rs` / `ds` codec
├── data/
│   ├── robotOptionsConfig.ts                      REVERB_SEND_SCHEMA, DELAY_SEND_SCHEMA
│   ├── globalAudioLoadingRanges.ts                comment only: the wet rows are the per-robot send bands
│   ├── transmissionPresets.ts / .test.ts          both wet values = 1 in the three presets
│   ├── audioSwellRanges.ts                        + reverbSend, delaySend (0…1)
│   └── audioRigConfig.ts                          (labels only via content; no schema change expected)
├── content/copy/probe.ts, fleet.ts                §1.8
├── components/
│   ├── robot/AudioSettingSection.tsx / .css / .test.tsx        two rows, two handlers
│   ├── panels/screen/screens/RobotScreen.tsx / .test.tsx       value + handlers
│   ├── company/useCompanyOptions.ts / .test.ts                 resolved fields, two broadcast handlers
│   └── company/CompanyOptionsSection.tsx                       passes the two handlers
└── docs/robotSendsDocs.test.ts                    NEW — cited symbols exist; reserve-site scan; body scan
docs/
├── AUDIO_SYSTEM.md                                topology block, Decay Mode paragraph, swell note, bus diagram
├── SESSION_STORAGE.md                             §1.7
├── COMPANIES.md                                   snapshot fields
├── ROBOT_DESIGN.md                                one line: sends reach the body through no dial
├── reference/GLOBAL_CHAIN_GRID.md                 wet rows = return level; topology
├── reference/ROBOT_DATA_GRID.md, reference/SLIDER_VALUES.md   Reverb / Delay send rows
├── specs/archive/AUDIO_OUTPUT_DIAGNOSTIC.md             one line: the pre-tap no longer includes echoes
├── ideas/themes.md                                the global wet bands move to the per-robot sends
├── intent/robot-sends.md                          status banner on ship
└── todo/roadmap.md                                50.2: status + "as built" deltas
```

Not touched: `compositeVoice.ts`, `panning.ts`,
`lfoEngine.ts`, `src/types/lfo.ts` (no send target), the Audio Load Budget (`LOAD_*` constants), any
gem / robot-body file, `reserveVoice`'s signature, `SliderLinear.tsx`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface, not a quiet widening.
- **Dry is truly dry.** With both sends at 0 the engine adds nothing from the rooms for that robot; a test
  asserts the robot's bus has no path to a room except through its send gains.
- **Audio writes stay in `AudioEngine` / `globalFx.ts`** (`updateRobotSends`, `setGlobalReverb/Delay`), from
  an action or the store's setter — never from a GSAP callback, never from a component.
- **Nodes added:** one `Gain` per robot per effect, and one return `Gain` per room. No per-robot effect, no new
  Tone class. The Audio Load Budget tables and `LOAD_*` thresholds are untouched; **no `LOAD_*_MIN` is added.**
- **JSON-serialisable state.** The sends are primitives on `Robot`; the gains live in `compositeVoices`, never in
  a store.
- **Swells, LFOs, the Bank:** the sends are robot swell attributes (§1.9) and the two `wet` targets leave the global swell pool; nothing else about swells changes. The sends are not LFO or Bank targets.
- **Replayability:** every new draw keys off `getSeededVal(noiseMap, dataId, spawnCount, …)`; no `Math.random`.
- **Nothing on the robot body reads `reverbSend` or `delaySend`.** ROBOT_DESIGN.md's dial list is unchanged; a
  source-scan test greps the gem files and `RobotBody.tsx` for the two identifiers and expects none.
- **Content:** every new word in `src/content/copy/`; no guard exemptions.
- **Primitives:** `SliderLinear` only; `CONTROL_SCHEMA_TYPES` stays 14.
- **Ask first:** widening `reserveVoice`'s signature, a perceptual taper on the send, any `LOAD_*` threshold,
  an LFO target, a swell ceiling on the sends, any new dependency, or changing the Decay toggle's UI.
- **Never:** `.env*`, `node_modules/`, build output; relaxing a CLAUDE.md guardrail; a "keep existing worlds'
  sound" shim (the pre-v1 rule).

---

## 4. Code Style & Architecture Conventions

The engine method, on `updateRobotMasterVolume`'s shape (safe no-op, ramp-or-set, devWarn):

```ts
// src/engine/AudioEngine.ts
updateRobotSends(robotId: string, sends: { reverb?: number; delay?: number }): void {
  const entry = compositeVoices.get(robotId);
  if (!entry) { devWarn(`[AudioEngine] updateRobotSends: no composite reserved for ${robotId}`); return; }
  try {
    const write = (node: Tone.Gain, value: number | undefined): void => {
      if (value === undefined) return;
      const target = Math.max(SEND_MIN, Math.min(SEND_MAX, value));
      const gain = node.gain as unknown as { rampTo?: (v: number, t: number) => void; value: number };
      if (typeof gain.rampTo === 'function') gain.rampTo(target, SEND_RAMP_SECONDS); else gain.value = target;
    };
    write(entry.reverbSend, sends.reverb);
    write(entry.delaySend, sends.delay);
  } catch (err) {
    devWarn('[AudioEngine] updateRobotSends failed', err);
  }
},
```

The section's new rows, in the house value/onChange style — no store, no literals:

```tsx
<div className="audio-setting-section__send-row">
  <SliderLinear schema={REVERB_SEND_SCHEMA} value={value.reverbSend * SEND_DISPLAY_SCALE} onChange={onReverbSendChange} disabled={disabled} swelling={reverbSendSwelling} />
</div>
<div className="audio-setting-section__send-row">
  <SliderLinear schema={DELAY_SEND_SCHEMA} value={value.delaySend * SEND_DISPLAY_SCALE} onChange={onDelaySendChange} disabled={disabled} swelling={delaySendSwelling} />
</div>
```

Conventions: named exports, `memo`-wrapped function components, co-located CSS and tests, doc comments that say
*why* and cite this spec's section, constants in `src/constants/index.ts` beside `PAN_*`, CRLF files stay
CRLF, new `.ts` files named after their export.

---

## 5. Testing & Verification Requirements

Vitest + Testing Library, co-located. House rhythm: RED first, one commit per task, mutation check at the named
gates (the plan at `docs/tasks/ROBOT_SENDS.md` once written).

- **Global chain (`globalFx.test.ts`)** — rooms construct with `wet: 1`; `setGlobalReverb({ wet: 0.4 })` writes
  the **return gain**, not `reverb.wet` (mutation check: write `reverb.wet` and watch it go red); likewise
  Delay. `wireGlobalFxChain(false)` connects `EQ3→LPF→HPF→Compressor→Limiter→master` and both returns to the
  Compressor; `(true)` connects both returns to the Limiter and nothing from a return to the Compressor; neither
  mode connects a room to the other room. Flipping the mode twice leaves a stub send's connection to the room
  intact. `disconnectAllFxNodes` includes the returns. Absent nodes (headless) never throw.
- **Engine (`AudioEngine.test.ts`)** — `reserveVoice` creates two send gains at `0`, connects `busFilter →
  sendGain → room` only when the room exists, and still connects `busFilter → chain entry`;
  `updateRobotSends(id, { reverb: 0.3 })` ramps only the reverb gain; clamps `7` to `1`; no composite →
  devWarn, no throw; `releaseVoice` disposes both; the stub-fallback voice has both. A dry robot (sends 0) has
  no signal path to a room except through its gains. `loadInstruments`' post-load pass primes every store robot
  and `reReserveVoice` re-primes. **Source scan:** every non-test file that calls `AudioEngine.reserveVoice(`
  also contains `updateRobotSends(` (guards a fifth site).
- **Spawn (`spawnSystem.test.ts`)** — every spawned robot's `reverbSend ∈ [0.1, 0.4]` and `delaySend` is `0` or in
  `[0, 0.3]`, both multiples of 0.01; the same locale spawns the same sends twice (determinism); roughly a
  quarter of a large sample has `delaySend === 0` (a loose statistical bound, not an exact count);
  `generateRobotAudioBaseline` equals the spawned robot's sends for every index (**the guard against drift**),
  including copy-branch robots, which differ from their sibling's sends where the draws differ.
- **Seed (`globalAudioSeed.test.ts`)** — `generateGlobalAudioSettings` returns `reverb.wet === 1` and
  `delay.wet === 1` for several styles; the old quiet-delay tests are replaced, not duplicated. **The seed
  oracle block (`:812`, "DO NOT REGENERATE THESE EXPECTATIONS") must change here, and only here:** the
  `oracle-alpha` and `oracle-theta` expectations change in exactly their `reverb.wet` and `delay.wet` values
  (both to `1`) and in nothing else; every other field in both oracles stays byte-identical, which is the
  guard that no other draw moved. That header was written under the "existing worlds keep their sound" rule
  the pre-v1 decision lifts; the edit is made by hand to those two fields, not by re-recording the whole
  oracle, and the header comment is updated to say why.
- **Actions (`robotOptionsActions.test.ts`)** — `applyReverbSend(robot, l, 40)` writes `reverbSend: 0.4` and calls
  `updateRobotSends(id, { reverb: 0.4 })`; `150` clamps to `1`; `applyDelaySend` mirrors; neither cancels a swell (the callers do, §1.9).
- **Swells (`audioSwell.test.ts`, `audioSwells.test.ts`, `audioSwellRanges` test)** — `SWELL_GLOBAL_TARGET_IDS`
  is exactly the 7 `GlobalLfoTargetId`s (length 7, no `delay.wet` / `reverb.wet`; the existing "9" assertions
  are rewritten, not duplicated); `SWELL_ROBOT_ATTRIBUTE_IDS` has 19 entries including `reverbSend` /
  `delaySend`, each with a `ROBOT_SWELL_FIELD_RANGE` row of `0…1`. A robot swell on `reverbSend` ramps the
  stored field out and back, writes through `applyReverbSend` (spy), lands **exactly** on its base value, and
  makes `isRobotAttributeSwelling(id, 'reverbSend')` true while active. A send of `0` is never picked
  (`isRobotAttributeEligible` false), a send of `0.25` is. A company-wide swell moves each eligible member's
  send from its own base. Global swells never pick `delay.wet` / `reverb.wet` over many seeded ticks; the old
  global `wet` swell and off-equivalent tests are deleted with the code they covered. **Mutation check:** make
  `writeRobotValue` skip the send branch and watch the "writes through applyReverbSend" test go red.
  `sessionDiff`: a session saved mid-swell stores the base send, not the interpolated one, and an untouched
  robot with an active swell diffs to `{}`.
- **Session (`sessionDiff.test.ts`)** — an untouched robot diffs to `{}`; a robot moved one step diffs to
  `{ reverbSend: 0.35 }` (two decimals); a send equal to the seed after a round trip diffs to nothing;
  restoring `{ delaySend: 0 }` sets the field and primes the engine; a non-finite or out-of-range value is
  ignored whole; the engine prime uses the stored, clamped value (`7` primes `1`).
  **Mutation check:** drop the baseline fields from `generateRobotAudioBaseline` and watch the "untouched robot
  diffs to {}" test go red. `localeStore.updateRobot` clamps `reverbSend: 7`.
- **Share (`sessionShareUtils.test.ts`)** — `reverbSend` / `delaySend` round-trip through `rs` / `ds` `toEqual`;
  absent keys stay absent; `rs: 'x'` and `rs: 3` decode to no key.
- **Company (`companyOptions.test.ts`, `useCompanyOptions.test.ts`)** — `resolveCompanyOptions` falls back to the
  first member's sends and a snapshot wins; `audioSettingValue` `toEqual`s include the two fields (existing
  assertions updated, not duplicated); `onReverbSendChange(40)` calls `applyReverbSend` once per member with 40
  and records `{ reverbSend: 0.4 }`; handler identities are stable across an unrelated edit.
- **UI** — `AudioSettingSection` renders Volume, Pan, Reverb, Delay in that order; each slider shows `send ×
  100`; a drag calls the matching handler with the display number; labels come from `CONTENT` (no literal).
  `RobotScreen` and the company screen pass the new fields.
- **Docs (`robotSendsDocs.test.ts`)** — every backticked symbol this spec and the updated docs cite exists in
  non-test `src/`; the gem / body scan from §3 finds neither identifier; `docs/SESSION_STORAGE.md` names the
  sends as persisted and `masterVolume` as never persisted.
- **Content** — `content.test.ts` green unchanged; `help` present on both new entries and on the relabelled
  global amounts.
- **Lint / type / build** clean at every checkpoint.

**Phone gate (Crawford, before merge — intent constraint):** the series baseline in
[scratchy-audio-phones.md](../todo/scratchy-audio-phones.md#baseline-for-the-audio-palette-series-roadmap-50--crawfords-run-2026-10-13)
(seed `alpha`, camera 0/50, all global defaults, Full: **0 underruns in 3:00** on `main` at `ca2b6868`).
Re-baseline first if `main` has moved the chain since. Then, on this branch with the same `?session=` world:
Full for 3:00 and Standard for 3:00 on the `?debug` HUD, plus a before / after `npm run perf` run on the desktop.
Any rise in underruns is a wiring bug to find or a reason to back out (no `LOAD_*_MIN`). Record both runs in
`scratchy-audio-phones.md`.

**Manual (Crawford, final checkpoint):** a fresh world has an audible spread of near and far robots; one robot
at Reverb 0 and Delay 0 is completely dry beside a drenched neighbour; the robot's Volume slider fades its
echo with it; the global Reverb and Delay sliders now sweep every robot's echo together, and at 0 silence the
room; flipping Decay Mode mid-play does not drop a send; a click-free drag on both sliders; save a session
with one moved robot, reload, it is where you left it and every untouched robot is back at its seed; share
link the same; a company move puts every member at one value; keyboard reaches both sliders; the "?"
popovers read right; leave the fleet running and a robot's Reverb or Delay slider visibly crawls out and back
(a swell), landing exactly where it started, with no click; dragging it mid-swell cancels the swell; the
swell is not too heavy a wash (§7 risk 2); Fleet Params no longer shows a swell on Reverb / Delay Amount.

---

## 6. Git & Workflow Context

- Branch `feature/palette-sends` off `main` (Crawford creates it; each Audio Palette sub-phase gets its own).
  One commit per task, imperative subject, body cites the spec section, co-author trailer. Crawford merges.
- Roadmap **50.2** already exists; the last task adds a status line and records the "as built" deltas: the
  seeded default (no longer "today's depth"), the return gains, parallel rooms, the explicit prime, and the
  relabelled global amounts. Roadmap 50's "Seeded and saved" paragraph already carries the pre-v1 note.
- Docs land in the last task; `docs/intent/robot-sends.md` gets the shipped banner the other intent files carry.
- **Coordination with 50.1** (`feature/palette-articulation`): both add fields to `Robot`, `RobotAudioOverrideDiff`,
  the share codec and `AudioSettingSection`. They do not share a code path, and 50.2 does not touch
  `reserveVoice`'s signature. Whichever merges second resolves plain textual conflicts in those four files;
  the `spawnSystem.ts` draws are separate dataIds, so no draw order changes.

---

## 7. Open Questions & Risks

**For Crawford — please confirm before the plan:**

1. **Assumption 1 (parallel rooms).** Delay echoes stop being reverberated. If you want them reverberated
   (today's character), the Delay return must also feed the Reverb room, and then a robot at Reverb 0 with a
   Delay send still gets reverberated echoes — which contradicts "0 means no reverb at all". I chose the
   contradiction-free version.
2. **Assumption 2 (where returns rejoin).** Preserves the wiring-level behaviour of both Decay Modes. Note the
   in-app Decay Mode copy (`fleet.ts:231`, `:273`) describes the *opposite* of what the wiring does today
   (the wiring has Natural's echoes pass through the Compressor, Controlled's bypass it; the copy says Natural
   leaves them uncompressed). This is a pre-existing mismatch, not introduced here, and this phase keeps the
   wiring as it is. Do you want the copy fixed in this phase, fixed separately, or the wiring flipped to match
   the copy?
3. **Assumption 6 (own draw on copy-branch robots).** A copy gets its own depth.
4. **Assumption 13 (swells move, not copy).** The two sends become robot swell attributes and `delay.wet` /
   `reverb.wet` leave the global swell pool. **Answered 2026-10-14: move.**
5. **The seed-oracle test says "DO NOT REGENERATE".** `globalAudioSeed.test.ts:812` pins the global seeder's
   output so no existing world's sound changes. This phase must change two values in it on purpose
   (`reverb.wet`, `delay.wet` → 1). §5 specifies the narrow hand-edit. You have said existing sounds need not
   hold, but that header is a written guard, so I am surfacing it rather than editing it silently.

**Risks:**

1. **The sound changes more than the sliders suggest.** Echoes no longer pass through (or around) the dry
   signal's crossfade; the dry level rises slightly; Delay no longer feeds Reverb; and the rooms' input is the
   robot signal *before* the global EQ / LPF / HPF (today the rooms see the shaped signal), so a closed global
   LPF no longer darkens what the rooms hear. Each is accepted under the pre-v1 rule, but together they are an
   audible mix change, which the manual listen exists to judge.
2. **A send swell can be a big wash.** The default swing is at least half the 0…1 range, so a robot at 0.25
   swells to 0.75–1.0 and back, which may be a lot of echo on one voice. It returns exactly to base, but if
   the listen finds it too much, add a `SEND_SWELL_UPWARD_CEILING` through `clampSwellCeiling` (§1.9) as a
   follow-up. (This replaces the earlier risk that a swell on a return at full could only dip, which is why
   swells moved to the robots.)
3. **A fifth reservation site forgetting the prime leaves a robot dry** (the Pan precedent). Four sites exist
   today; the source-scan test fails the build on a new unprimed one, and the symptom is loud (no echo at all).
4. **`Reverb` regeneration.** `decay` / `preDelay` edits still regenerate the impulse response (coalesced,
   `REVERB_IR_COALESCE_MS`); sends feed the same convolver, so a regeneration glitch is audible on every robot's
   send at once, as it was on the mix before. No change from today.
5. **The phone gate is a topology measurement.** Gains are cheap, but the Delay and Reverb were already running
   on the summed mix and still are. Expected flat; measured regardless.
6. **Stale `?session=` links.** An old payload's smaller `reverb.wet` loads as a quieter return and the
   robots then use their seeded sends: a worse-sounding old link, not a broken one. Pre-v1, accepted.
