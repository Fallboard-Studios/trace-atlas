# Phase Spec: Robot Articulation — Portamento, Envelope Curves, Bus Filter

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Main-thread check (§5): `npm run perf`
> - Phone gate (§5): the `?debug` HUD on the Pixel, seed `alpha` session from
>   [scratchy-audio-phones.md](../todo/scratchy-audio-phones.md#baseline-for-the-audio-palette-series-roadmap-50--crawfords-run-2026-10-13)

Source of intent: [docs/intent/robot-articulation.md](../intent/robot-articulation.md) (confirmed 2026-10-13,
six questions, every guess confirmed). Roadmap slot: **50.1**
([roadmap.md](../todo/roadmap.md#501-robot-articulation-portamento-envelope-curves-bus-filter)), first
sub-phase of the Audio Palette series (50). Branch `feature/palette-articulation`, off `main` at `450bf2ad`.
Where this spec differs from the roadmap's 50.1 paragraph (notably: two contour radios, not one; a
re-seeded cutoff range; the LFO target ships here) this spec wins and the last task records the deltas.

Survey basis (2026-10-13, against the current tree):

- **Every robot already owns the three nodes.** `createCompositeVoice` builds one `Tone.Synth` per layer
  (`src/engine/audioEngine/compositeVoice.ts:143`) with `oscillator` and `envelope: { attack, decay,
  sustain, release }` only — no `portamento`, no curve. `Tone.Synth` extends `Monophonic`
  (`portamento: Seconds`, `node_modules/tone/build/esm/instrument/Monophonic.d.ts:7`) and its envelope
  options accept `attackCurve` / `releaseCurve: EnvelopeCurve` and `decayCurve: 'linear' | 'exponential'`
  (`component/envelope/Envelope.d.ts:12–14`). `reserveVoice` (`src/engine/AudioEngine.ts:669`) builds the
  bus `composite.output → panner → busGain → busFilter → chain` with
  `new Filter({ frequency: busCutoff, Q: ROBOT_BUS_FILTER_Q })` (`:691`), `ROBOT_BUS_FILTER_Q = 1` (`:172`),
  cutoff from `resolveBusFilterCutoff(filterFreq)` (`:175`: `undefined` → 1200 Hz legacy, `≤ 0` → 20 kHz
  open). `Tone.Filter` exposes `frequency` and `Q` as Signals (`rampTo` available) and `type` as a plain
  setter. `AUDIO_SYSTEM.md:233` still says the bus filter has "no live update path or UI control" — that
  sentence goes.
- **The live-edit paths this extends.** `composite.set({ layers })` (`compositeVoice.ts:87`, body `:218`)
  patches gain / detune / phase / width per layer and applies `p.adsr` via `synth.set({ envelope })`;
  `AudioEngine.updateVoiceEnvelope` (`:880`) maps every layer to `{ ...layer, adsr }` and calls it;
  `applyAdsr` (`src/systems/robotOptionsActions.ts:130`) is `updateRobot` + `updateVoiceEnvelope`, never a
  rebuild. `updateRobotMasterVolume` (`:910`) is the ramp-or-set template (`rampTo` over
  `VOLUME_RAMP_SECONDS = 0.05`, `:85`; `PAN_RAMP_SECONDS` `:89` the same value in its own constant).
- **Seeding.** `generateAudioAttributes` (`src/systems/spawnSystem.ts:283`) draws `robot.audio.*` dataIds at
  the spawn `offset`; `filterFreq` is `getSeededVal(noiseMap, 'robot.audio.filterFreq', offset, 400, 2500)`
  (`:297`, `FILTER_FREQ_RANGE` `:82`). Minority-trait precedents: `LAYER_QUIET_THRESHOLD = 0.5` (`:63`),
  `LFO_QUIET_THRESHOLD = 0.7` (`:351`), `seedToggleValue` (`:112`), `quantizeToStep`. The copy branch
  (`generateRobotAudioBaseline` `:448`, 30 % `robot.copyChance`) copies `audioAttributes` wholesale, so new
  fields ride it. `RobotAudioBaseline.audioAttributes` (`:420`) is the diff baseline.
- **LFO targets.** `RobotLfoTargetId` is the six `layerN.gain|detune` ids (`src/types/lfo.ts:44`);
  `AudioEngine.getRobotModulationTarget` (`:775`) resolves them by regex; `lfoEngine.linkTarget`
  (`src/engine/lfoEngine.ts`) builds one `Tone.Gain` per link off the lane trunk, swing from
  `resolveLfoOutputRange` (`ROBOT_LFO_FIELD_RANGE` gain 0–2 / detune ±50, `:108`; global targets read
  `GLOBAL_AUDIO_SEED_RANGES`, LPF frequency 20–20000 log, Q 0.1–20 log,
  `src/data/globalAudioSeedRanges.ts:66–67`). `isFilterTarget` is `/^(lpf|hpf)\./` (`:102`) and is the only
  thing `setFilterLinksEnabled` suspends; `audioBudgetSystem.ts:107–109` drives it from
  `limits.filterLfosEnabled` (`load >= LOAD_FILTER_LFOS_MIN = 0.4`, `src/constants/index.ts:46`) and
  mirrors it to `audioStore.filterLinksHeldOff` (`:437`), which `AudioRigDrawer` feeds to `LfoLink.heldOff`.
  Seeded links: `generateRobotLfoLinks` (`spawnSystem.ts:384`) loops `ROBOT_LFO_TARGET_IDS` with a quiet
  roll, roster-aware lane pick and a per-field depth window (`:369–373`). Enumerators of the id list that
  get a seventh member for free: `DEFAULT_LFO_LINK` (`lfoConfig.ts:32`), `sessionDiff.ts:277`,
  `sessionShareUtils.ts:249`, `primeRobotLinks`, `audioDiagnostics.linksTotal` (`:171`). Fixed-record
  consumers that must **not** change: `bodyLineDials.LINE_TARGETS` (`src/components/robot/gem/
  bodyLineDials.ts:38`, the three gain targets → body line widths). **Coupling:** `audioSwell.test.ts:56`
  asserts `SWELL_ROBOT_ATTRIBUTE_IDS ⊇ ROBOT_LFO_TARGET_IDS` and `:78` asserts exactly six targets.
- **UI hosts.** Envelope section = one subsection `pingContour` → `PingContourDrawer` (`value: ADSREnvelope`,
  two `responsive` rows of `SliderLog`/`SliderLinear`, memoised handlers over a `latestAdsr` ref). Source
  section = its own accordion with three oscillator subsections (`ROBOT_SECTIONS_CONFIG`,
  `src/data/robotSubsectionConfig.ts:76`; `SOURCE_OSCILLATOR_SUBSECTIONS` `:92`); the `RobotSubsection`
  union lives in `src/stores/uiStore.ts:44`; `RobotScreen.useRobotSubsectionRenderer` (`:190`, switch
  `:272–318`) and `useCompanySubsectionRenderer` (`CompanyOptionsSection.tsx:54`) each switch on it. A
  layer block hosts its `LfoLink` directly under the slider it modulates (`SignatureArrayDrawer.tsx:193`),
  schema built by `makeLayerBlock` with `lfoTarget` per param (`robotOptionsConfig.ts:398`). Radio options
  come from a content `options` record (`WAVEFORMS`, `probe.ts:15`; `options(key)` in the schema).
- **Persistence.** `RobotAudioOverrideDiff` (`src/types/session.ts:17`) already carries `adsr` (whole
  envelope) and `filterFreq`; `computeRobotAudioOverrideDiff` (`sessionDiff.ts:232`) diffs `adsrToCapture`
  with swell-base substitution and `filterFreq` by `deepEqual` (`:261`); the apply loop merges
  `adsr | layers | filterFreq` into `audioAttributes` (`:377`). Share codec: `CompactRobotOverrideDiff`
  (`sessionShareUtils.ts:98`) with `a` (compact ADSR), `f` (filterFreq), `p`, `ll`…; free letters are
  plentiful.
- **Companies.** `CompanyOptionsSnapshot` (`src/types/Company.ts:16`) has `adsr`, `layers`, `lfoLinks` and
  no filter fields; `useCompanyOptions.onAdsrChange` (`:328`) broadcasts via `applyAdsr` with
  `diffCompoundField` + swell cancel; `onVolumeChange` (`:266`) is the scalar-broadcast template.
- **Content.** `probe.envelope.*` (`probe.ts:221–254`) and `probe.source.*` (`:257–350`) carry `human`,
  `lore`, `unit`, `help`; the Envelope intro's `humanDescription` names the four ADSR controls and will
  name the new ones.
- **Tests that pin today's behaviour.** `compositeVoice.test.ts` (ADSR at construction and via `set`);
  `AudioEngine.test.ts:249` "per-robot bus filter cutoff" (1850 Hz builds, legacy 1200 default).

ASSUMPTIONS I'm making beyond the intent's six decisions (correct now or I'll proceed with these):

1. **Field shapes.** `AudioAttributes.portamento?: number` (seconds, absent = 0 = today),
   `AudioAttributes.filterQ?: number` (absent = 1), `AudioAttributes.filterType?: RobotFilterType`
   (`'lowpass' | 'bandpass' | 'highpass'`, absent = `'lowpass'`); `ADSREnvelope.attackCurve?` and
   `releaseCurve?: EnvelopeCurveName` (absent = `'linear'`, Tone's default). All **optional** so the
   hundreds of existing fixtures type-check unchanged and a pre-phase payload decodes to today's sound.
   Spawn always writes all five. `filterFreq` stays required.
2. **Two contour radios, not one.** Attack Shape and Release Shape, each the full seven, seeded
   independently — the roadmap's "a single-line radio" collapses two Tone fields into one control and
   loses half the variety. (Veto point: one radio that writes both fields is a two-line change.)
3. **The cutoff range is re-seeded, in two tiers.** Common robots draw `filterFreq` in
   `OPEN_FILTER_FREQ_RANGE = 2000–8000 Hz`, Q 1, lowpass — "most near open". Accent robots
   (`FILTER_ACCENT_THRESHOLD = 0.2`, dataId `robot.audio.filter.accent`) draw today's 400–2500 Hz, Q in
   `3–8`, and lowpass or bandpass (`robot.audio.filter.type`, 60/40). Highpass is never seeded (it thins the
   robot; a user choice). `filterFreq = 0` is never seeded any more; the resolver keeps honouring it for
   old payloads.
4. **Seeded odds for the other accents.** Glider: `GLIDER_THRESHOLD = 0.12` (≈ 1.4 in 12), portamento
   `0.05–0.20 s` quantised to 0.01 (0.30 s until the §1.10 amendment). Shaped attack / shaped release: `ATTACK_CURVE_SHAPED_THRESHOLD` and `RELEASE_CURVE_SHAPED_THRESHOLD` (nominally 0.15, calibrated in T5 to the measured ≈ 15 %),
   then a uniform pick among the six non-linear names. Bus-filter LFO link: its own
   `BUS_LFO_QUIET_THRESHOLD = 0.85` (≈ 15 % lit, versus 30 % for the layer targets) with depth window
   `1–40`, so the budget sees ≈ 2 extra audio-rate links per world.
5. **`reserveVoice` gains one optional trailing object**, `articulation?: { portamento?; filterQ?;
   filterType? }`, after `filterFreq`. Existing call sites and tests stay valid; the three reservation sites
   (`spawnSystem.ts:735`, `:889`, `AudioEngine.loadInstruments`) and `reReserveVoice` pass it. (The Pan
   spec listed widening this signature as ask-first; this is the narrowest widening and the alternative —
   a fourth field-threading parameter — is worse. Veto point: fold `filterFreq` into the object and update
   the 3 sites + 2 tests.)
6. **Curves ride the envelope.** `ADSREnvelope` carries them, so `applyAdsr` → `updateVoiceEnvelope` →
   `synth.set({ envelope })` applies them with zero new engine code — but a helper `toToneEnvelope(adsr)`
   strips absent curve keys so `set` never receives `attackCurve: undefined`. Same helper at construction.
7. **Portamento goes through the same `set({ layers })` RPC** as a new `LayerLivePatch.portamento`
   (ephemeral, like `adsr`), applied as `synth.portamento = value`. New engine method
   `updateVoicePortamento(robotId, seconds)` on `updateVoiceEnvelope`'s shape.
8. **The bus filter gets one engine method**, `updateRobotBusFilter(robotId, { frequency?, Q?, type? })`:
   frequency and Q ramp over `FILTER_RAMP_SECONDS = 0.05` (ramp-or-set, like Volume); `type` is assigned
   directly (discrete; a possible tick on switch is accepted, §7). Writes land on the live
   `entry.busFilter`; a `reReserveVoice` rebuild re-applies them from the store, as it does cutoff today.
9. **`'bus.frequency'` joins `RobotLfoTargetId`.** `getRobotModulationTarget` returns
   `entry.busFilter.frequency`; `resolveLfoOutputRange` gives it `ROBOT_BUS_FILTER_FREQ_RANGE = 20–20000`
   (the slider's range, same as the global LPF); `isFilterTarget` becomes `/^(lpf|hpf|bus)\./` so the
   existing `setFilterLinksEnabled` suspend covers it and `filterLinksHeldOff` greys its `LfoLink` — no new
   dial, no new threshold *unless the A/B says so* (§5). Like the global LPF, a cutoff edit does **not**
   re-link; the swing stays as computed at link time.
10. **`audioSwell.test.ts` changes its two assertions**: the superset test iterates the six layer targets
    (the invariant it protects — "every id that *was* a swellable LFO target still is" — is unchanged in
    spirit), and the count test reads 7. `bus.frequency` is **not** a swell attribute (no swell apply
    path for the bus; out of scope).
11. **A fourth Source subsection, `busFilter`**, last in `ROBOT_SECTIONS_CONFIG.source.subsections`, its
    own accordion (`probe.source.filter`), rendered by a new `BusFilterDrawer` on both screens. It is
    **not** added to `SOURCE_OSCILLATOR_SUBSECTIONS`. Portamento and the two radios go **inside
    `PingContourDrawer`** as a third and fourth row; no new Envelope subsection.
12. **Control schemas.** Cutoff `SliderLog 20–20000 Hz`; Resonance `SliderLog 0.1–20` (the global LPF's
    pair, `audioRigConfig.ts:97–102`); Type `radio` (3 options); Portamento `SliderLog 0–2 s`; Attack / Release
    Shape `radio` (7 options each, `appearance` default). `CONTROL_SCHEMA_TYPES` stays 14; no primitive
    changes.
13. **Companies broadcast everything.** Snapshot gains `filterFreq`, `filterQ`, `filterType`, `portamento`
    (curves ride `adsr`; the bus link rides `lfoLinks`). Four new handlers mirror `onVolumeChange`; curves
    reuse `onAdsrChange` untouched.
14. **Session / share.** Diff gains `portamento?`, `filterQ?`, `filterType?` (`filterFreq` and `adsr`
    already there); compact keys `po`, `fq`, `ft`; compact ADSR gains `ac` / `rc` (absent when linear).
    Unknown curve or type strings decode to absent (today's sound), never throw.
15. **Lore names are placeholders until Crawford's copy pass**: Portamento / *Ping Glide*; Attack Shape /
    *Onset Profile*; Release Shape / *Fade Profile*; Filter / *Resonator*; Cutoff / *Resonator Band*;
    Resonance / *Resonator Peak*; Type / *Resonator Mode*; the seven curves and three types get lore
    words too. Keys and human words are fixed.

---

## 1. Overview & Claude Explanation

Three per-robot articulation traits, each a parameter on a node the robot already has, so the phase
adds no Tone nodes: a **portamento** glide on each layer synth, an **attack shape** and **release shape**
on the shared envelope, and the **bus filter exposed** — Cutoff, Resonance, Type — with a seventh robot
LFO target on the filter's frequency so a Bank lane can wah it. Every field is seeded at spawn as a
minority trait (about one glider in twelve, a couple of shaped contours, one or two resonant filters),
because pre-v1 there are no worlds whose sound must be preserved and a world with nothing turned on would
feel like a feature nobody uses. Edits flow store-first through `robotOptionsActions` into one of three
engine methods — the existing `updateVoiceEnvelope` for curves, a new `updateVoicePortamento`, a new
`updateRobotBusFilter` — never a rebuild, never a GSAP callback. Portamento and the two radios sit in
the Envelope section beside ADSR; the filter is a fourth Source subsection. Companies broadcast all of
it; the session diff and share link carry it; nothing reaches the gem.

### 1.1 Data shape

```ts
// src/types/Robot.ts
export type EnvelopeCurveName = 'linear' | 'exponential' | 'sine' | 'cosine' | 'bounce' | 'ripple' | 'step';
export const ENVELOPE_CURVE_NAMES: readonly EnvelopeCurveName[] = [/* the seven, linear first */];
export type RobotFilterType = 'lowpass' | 'bandpass' | 'highpass';
export const ROBOT_FILTER_TYPES: readonly RobotFilterType[] = ['lowpass', 'bandpass', 'highpass'];

export interface ADSREnvelope {
  attack: number; decay: number; sustain: number; release: number;
  /** Absent = 'linear' (Tone's default; today's sound). decayCurve is deliberately not exposed. */
  attackCurve?: EnvelopeCurveName;
  releaseCurve?: EnvelopeCurveName;
}

export interface AudioAttributes {
  // …existing…
  filterFreq: number;            // Hz; now 20–20000 from the slider, seeded in two tiers (§1.2)
  /** Bus filter resonance. Absent = ROBOT_BUS_FILTER_Q (1), today's fixed value. */
  filterQ?: number;
  /** Absent = 'lowpass', today's fixed type. */
  filterType?: RobotFilterType;
  /** Seconds each layer glides into the next note. Absent or 0 = no glide (today). */
  portamento?: number;
}

// src/types/lfo.ts
export type RobotLfoTargetId = /* six layer ids */ | 'bus.frequency';
export const ROBOT_LFO_TARGET_IDS = [/* six */, 'bus.frequency'];

// src/constants/index.ts
export const PORTAMENTO_MIN = 0, PORTAMENTO_MAX = 2;            // s, slider
export const ROBOT_BUS_FILTER_FREQ_RANGE = { min: 20, max: 20000 }; // Hz, slider + LFO swing range
export const ROBOT_BUS_FILTER_Q_RANGE = { min: 0.1, max: 20 };
```

Defaults are **absence**, and the resolvers (`resolveBusFilterCutoff`, a new `resolveBusFilterQ`,
`resolveBusFilterType`, `toToneEnvelope`) turn absence into today's values in exactly one place each.

### 1.2 Seeding — `src/systems/spawnSystem.ts`

Inside `generateAudioAttributes`, after the existing draws, all at the robot's `offset`:

```ts
const glider = getSeededVal(noiseMap, 'robot.audio.portamento.glider', offset, 0, 1) < GLIDER_THRESHOLD; // 0.12
const portamento = glider
  ? quantizeToStep(getSeededVal(noiseMap, 'robot.audio.portamento', offset, 0.05, 0.20), 0, 0.01)
  : 0;

const attackCurve  = seedCurve(noiseMap, 'robot.audio.attackCurve',  offset);   // 'linear' 85 %, else one of six
const releaseCurve = seedCurve(noiseMap, 'robot.audio.releaseCurve', offset);

const accent = getSeededVal(noiseMap, 'robot.audio.filter.accent', offset, 0, 1) < FILTER_ACCENT_THRESHOLD; // 0.2
const filterFreq = accent
  ? getSeededVal(noiseMap, 'robot.audio.filterFreq', offset, ACCENT_FILTER_FREQ_RANGE.min, ACCENT_FILTER_FREQ_RANGE.max) // 400–2500
  : getSeededVal(noiseMap, 'robot.audio.filterFreq', offset, OPEN_FILTER_FREQ_RANGE.min,   OPEN_FILTER_FREQ_RANGE.max);  // 2000–8000
const filterQ    = accent ? quantizeToStep(getSeededVal(noiseMap, 'robot.audio.filterQ', offset, 3, 8), 0, 0.1) : ROBOT_BUS_FILTER_Q;
const filterType = accent && getSeededVal(noiseMap, 'robot.audio.filter.type', offset, 0, 1) < 0.4 ? 'bandpass' : 'lowpass';
```

`seedCurve` rolls `${dataId}.shaped` against the stage's `*_CURVE_SHAPED_THRESHOLD` (nominally 0.15, calibrated in T5), then indexes the six
non-linear names with a second draw. Every constant is a named module constant with a doc comment
giving its "≈ n in 12". `generateRobotLfoLinks` gives `'bus.frequency'` its own quiet threshold and
depth window via the existing per-target lookup functions (`robotLfoDepthSeedRangeForTarget` gains a
branch; a new `robotLfoQuietThresholdForTarget` returns 0.7 for layers, 0.85 for the bus). Because
`generateRobotAudioBaseline` calls the same function, the baseline moves with it and an untouched robot
still diffs to `{}`.

### 1.3 Engine — `compositeVoice.ts` and `AudioEngine.ts`

- `createCompositeVoice(descriptor, adsr, portamento = 0)`: `new Tone.Synth({ portamento, oscillator,
  envelope: toToneEnvelope(adsr) })`. `toToneEnvelope` returns `{ attack, decay, sustain, release }` plus
  `attackCurve` / `releaseCurve` **only when present**. `LayerLivePatch` gains `portamento?: number`; the
  `set` body applies it as `synth.portamento = p.portamento` inside the usual try/devWarn; the existing
  `p.adsr` branch passes `toToneEnvelope(p.adsr)`.
- `AudioEngine.reserveVoice(…, filterFreq?, articulation?)`: passes `articulation?.portamento` to
  `createCompositeVoice`; builds the filter as `new FilterCtor({ frequency, Q: resolveBusFilterQ(filterQ),
  type: resolveBusFilterType(filterType) })`. The stub filter (`makeStubFilter`) gains `type` and a
  rampable `Q` so headless tests can assert on them.
- `updateVoicePortamento(robotId, seconds)`: `updateVoiceEnvelope`'s shape — map layers to
  `{ ...layer, portamento: seconds }`, `composite.set`, devWarn when unreserved.
- `updateRobotBusFilter(robotId, patch: { frequency?: number; Q?: number; type?: RobotFilterType })`:
  `updateRobotMasterVolume`'s shape; `frequency` and `Q` through `rampTo(value, FILTER_RAMP_SECONDS)` when
  the param has it, else `.value`; `type` assigned. Safe no-op with devWarn when unreserved — the store
  holds the truth and every reservation path re-reads it.
- `getRobotModulationTarget(robotId, 'bus.frequency')` → `compositeVoices.get(robotId)?.busFilter.frequency
  ?? null`. The layer regex path is untouched.
- Reservation sites (`spawnSystem.ts:735`, `:889`, `loadInstruments`, `reReserveVoice`) pass
  `{ portamento, filterQ, filterType }` from `robot.audioAttributes`.

### 1.4 LFO engine — `src/engine/lfoEngine.ts`, `src/systems/audioBudgetSystem.ts`

- `isFilterTarget`: `/^(lpf|hpf|bus)\./`. Nothing else in `setFilterLinksEnabled` changes: a bus link
  made while the dial is below `LOAD_FILTER_LFOS_MIN` is created suspended (`:334`), re-connected when the
  dial rises, exactly as the global filter links are.
- `resolveLfoOutputRange('bus.frequency')` → `ROBOT_BUS_FILTER_FREQ_RANGE`. `centeredSwingFromRange` then
  gives a seeded 1200 Hz accent robot a ±1180 Hz swing at depth 100 — a real wah; an open robot at 6000 Hz
  swings ±5980 Hz, which at seeded depths ≤ 40 is a gentle brightness wobble.
- `audioBudgetSystem` needs no change; `filterLinksHeldOff` already reaches the store.
- `audioDiagnostics.linksTotal` counts 7 slots per robot from the list length; the `?debug` HUD's
  "links" line therefore reads `n/84` for twelve robots — note in the HUD doc, no code change.

### 1.5 Actions — `src/systems/robotOptionsActions.ts`

```ts
export function applyPortamento(robot, localeId, seconds) {
  updateRobot(localeId, robot.id, { audioAttributes: { ...robot.audioAttributes, portamento: seconds } });
  AudioEngine.updateVoicePortamento(robot.id, seconds);
}
export function applyBusFilter(robot, localeId, patch: Partial<Pick<AudioAttributes, 'filterFreq' | 'filterQ' | 'filterType'>>) {
  updateRobot(localeId, robot.id, { audioAttributes: { ...robot.audioAttributes, ...patch } });
  AudioEngine.updateRobotBusFilter(robot.id, { frequency: patch.filterFreq, Q: patch.filterQ, type: patch.filterType });
}
```

Curves: `applyAdsr` unchanged (the envelope object now carries them). Bus LFO link: `applyLayerLfoLink`
unchanged (generic over `RobotLfoTargetId`); its name stays — renaming is churn, not scope.

### 1.6 UI

**Envelope — `PingContourDrawer.tsx`.** Props grow by `portamento: number`, `onPortamentoChange`, and the
value's `ADSREnvelope` now carries the curves. Two new `responsive` rows under the existing two:
`[Portamento SliderLog]` and `[Attack Shape radio | Release Shape radio]`. Handlers follow the
`latestAdsr` ref pattern (`onChange({ ...latestAdsr.current, attackCurve: v })`). Both screens pass the
new prop (`RobotScreen` from `robot.audioAttributes.portamento ?? 0`; `useCompanyOptions` from the
resolved snapshot). Swelling flags: none for the new controls (no swell attributes).

**Source — `BusFilterDrawer.tsx` (new), subsection `busFilter`.** One `DirectionalPanel` column:
`[Cutoff SliderLog]`, `[LfoLink for 'bus.frequency', heldOff = filterLinksHeldOff]`, `[Resonance SliderLog |
Type radio]` (responsive row). Value `{ filterFreq, filterQ, filterType, lfoLink }`; `onChange(patch)`,
`onLfoLinkChange(link)`. Pure, memoised, no store access — the screens wire it (`RobotScreen` →
`applyBusFilter` / `applyLayerLfoLink`; company → four broadcast handlers + `onLfoFieldChange`'s existing
path). The `RobotSubsection` union gains `'busFilter'`; `ROBOT_SECTIONS_CONFIG.source.subsections` gains
`{ id: 'busFilter', content: 'probe.source.filter', accordion: 'probe.source.filter' }` last, so the nav
tree, breadcrumb and both renderers pick it up from the one config. A `HeldOffNote` beside the link when
`filterLinksHeldOff`, as the Audio Rig filter panels do.

**Schemas — `robotOptionsConfig.ts`**: `PORTAMENTO_SCHEMA`, `ATTACK_CURVE_SCHEMA`, `RELEASE_CURVE_SCHEMA`,
`BUS_FILTER_PANEL_SCHEMA`, `BUS_CUTOFF_SCHEMA`, `BUS_RESONANCE_SCHEMA`, `BUS_FILTER_TYPE_SCHEMA`,
`BUS_FILTER_LINK_SCHEMA` (`lfoLink`, `lfoTarget: 'bus.frequency'`), two row panels. Every value control
gets `help` via `labels()`.

### 1.7 Persistence and sharing

- `RobotAudioOverrideDiff` gains `portamento?`, `filterQ?`, `filterType?`. `computeRobotAudioOverrideDiff`
  diffs each by `deepEqual` against the baseline; `adsr` already compares the whole object so curves are
  covered; the `lfoLinks` loop covers the bus link. The apply merge at `:377` spreads the three new keys
  into `audioAttributes`; the restore path then calls `updateVoicePortamento` / `updateRobotBusFilter` only
  when the robot is reserved (the reservation re-read covers the rest).
- `CompactRobotOverrideDiff`: `po`, `fq`, `ft`; `CompactADSR` gains `ac` / `rc`. Decoders validate: a
  non-finite number or an unlisted string → key dropped.
- `docs/SESSION_STORAGE.md` field list and the share codec table gain the fields; `filterFreq`'s "seeded
  only, no UI" parenthetical goes.

### 1.8 Companies

`CompanyOptionsSnapshot` gains `filterFreq?`, `filterQ?`, `filterType?`, `portamento?`.
`resolveCompanyOptions` falls back per field to the first member's `audioAttributes` value (absent →
the resolver default). `useCompanyOptions` adds `busFilterValue`, `portamentoValue`, `onPortamentoChange`,
`onBusFilterChange(patch)` (loop members through the action, then `patchSnapshot(patch)`), and passes the
bus link through the existing `onLfoFieldChange`. Broadcast-not-link throughout; `COMPANIES.md` lists
the new fields.

### 1.9 Content — `src/content/copy/probe.ts`

New entries (human / placeholder lore): `probe.envelope.portamento` { Portamento / Ping Glide, unit 's' },
`probe.envelope.attackShape` { Attack Shape / Onset Profile, options: CURVES },
`probe.envelope.releaseShape` { Release Shape / Fade Profile, options: CURVES },
`probe.source.filter` { Filter / Resonator, intro-free accordion heading },
`probe.source.filter.cutoff` { Cutoff / Resonator Band, unit 'Hz' },
`probe.source.filter.resonance` { Resonance / Resonator Peak },
`probe.source.filter.type` { Type / Resonator Mode, options: FILTER_TYPES }. `CURVES` is a module record
of seven `ContentOption`s (Linear / Exponential / Sine / Cosine / Bounce / Ripple / Step with lore words);
`FILTER_TYPES` three (Low-pass / Band-pass / High-pass). Each value control has `help.human` in the
copy-tone-guide's voice (what it does for someone who may not know synths; Resonance's mentions the wah).
The Envelope and Source intros' `humanDescription` gain one sentence each.

---

### 1.10 Amendment — Attack, Decay and Release run 0–2 s; glides top out at 0.2 s (Crawford, 2026-10-13)

**Why.** Live probing found the Attack/Release sliders and the new shapes sounding like no-ops. The wiring is right,
but a robot's melody is often back-to-back 16ths (0.15 s at 98 BPM), and Tone's `Envelope.triggerAttack` restarts
from the *current* level, so with an attack or release of more than about half a second the gate never closes or
finishes rising: it settles at its plateau and the robot is a held drone. Seeded robots (attack 0–5 s) were already
there, so 3.5 s → 10 s changed nothing, and a shape needs the stage to finish inside the note to be heard at all.

**What.**
- `ENVELOPE_TIME_MAX_SECONDS = 2` (`constants/index.ts`) is the one number behind the Attack, Decay and Release sliders'
  maximum, the top of their seeded ranges (`ATTACK_RANGE` / `DECAY_RANGE` / `RELEASE_RANGE`) and, for Attack and
  Release only, `BODY_NORMALISER.attack/release` (Decay does not reach the body). The sliders are logarithmic, so 0.5 s
  now sits at 82 % of the track (it was 67 %). A first cut left Decay at 0–10 s; offline renders showed it has the same
  problem: with Sustain 0.2, a 0.15 s note ends at 0.57 / 0.76 / 0.88 of its peak for Decay 1 / 3 / 10 s (0.2 if the decay
  finished), so a long Decay leaves the Sustain slider inert on short notes.
- The seeded glide (`PORTAMENTO_SEED_RANGE`) tops out at 0.2 s instead of 0.30 s, the fallback risk 5 named. Measured pitch
  reached at the end of a C4→C5 jump on 16th notes: 0.15 s glide 471 Hz of 523, 0.3 s only 357, 1–2 s barely leaves the old
  pitch (271–286). The Portamento slider keeps its 0–2 s: past the note length it is still audible, as a smear.
- A stage with a non-linear shape is seeded short, from the *same* noise sample spread over a smaller range:
  `SHAPED_ATTACK_RANGE` 0.03–0.25 s and `SHAPED_RELEASE_RANGE` 0.15–0.8 s (`spawnSystem.ts`). The curves are drawn
  first and each stage is decided on its own curve, so which robots are shaped and which curve they get are untouched.

**Consequences, all deliberate.**
- Every plain robot's attack and release are 0.4× what they were; because the normaliser scales with them, its body
  scale and lamp brightness are *unchanged*. A shaped stage is short, so those robots' bodies get a little bigger
  (snappier attack) and their lamps a little dimmer than before, through the two existing dials.
- A save or share link holding an attack or release past 2 s still plays as stored; its slider shows the value and sits
  at its end, and the next step lands inside 2 s.
- Seeded sound changes for every world (pre-v1: "there are no old worlds out there that can change sound").
- This reverses the earlier "0–10 s edit range (confirmed)" for Attack and Release only.

**Tuning.** All three numbers are constants; if 2 s is too tight or the shaped ranges too short or long, change them
there (the tests name the ranges).

## 2. Target File Structure

```text
src/
├── constants/index.ts                             + PORTAMENTO_MIN/MAX, ROBOT_BUS_FILTER_FREQ_RANGE, ROBOT_BUS_FILTER_Q_RANGE, FILTER_RAMP_SECONDS
├── types/
│   ├── Robot.ts                                   + EnvelopeCurveName, RobotFilterType (+ const lists), ADSREnvelope curves, AudioAttributes portamento/filterQ/filterType
│   ├── lfo.ts                                     + 'bus.frequency'
│   ├── audioSwell.ts / .test.ts                   comment + the two assertions (assumption 10)
│   ├── Company.ts                                 + snapshot fields
│   └── session.ts                                 + diff fields
├── engine/
│   ├── audioEngine/compositeVoice.ts / .test.ts   portamento ctor + patch, toToneEnvelope
│   ├── AudioEngine.ts / .test.ts                  reserveVoice articulation, resolvers, updateVoicePortamento, updateRobotBusFilter, bus.frequency target, stub filter
│   ├── lfoEngine.ts / .test.ts                    isFilterTarget, resolveLfoOutputRange
│   └── audioDiagnostics.ts                        untouched (count follows the list)
├── systems/
│   ├── spawnSystem.ts / .test.ts                  §1.2 draws, thresholds, link quiet/depth per target, 2 reserve sites
│   ├── robotOptionsActions.ts / .test.ts          applyPortamento, applyBusFilter
│   └── companyOptions.ts / .test.ts               fallbacks
├── utils/
│   ├── sessionDiff.ts / .test.ts                  diff / apply / re-prime
│   └── sessionShareUtils.ts / .test.ts            po/fq/ft, ac/rc
├── stores/uiStore.ts                              RobotSubsection + 'busFilter'
├── data/
│   ├── robotSubsectionConfig.ts                   Source gains busFilter
│   └── robotOptionsConfig.ts                      §1.6 schemas
├── content/copy/probe.ts                          §1.9
├── components/
│   ├── robot/PingContourDrawer.tsx / .css / .test.tsx   rows 3–4
│   ├── robot/BusFilterDrawer.tsx / .css / .test.tsx     NEW
│   ├── panels/screen/screens/RobotScreen.tsx / .test.tsx   busFilter case, portamento prop, handlers
│   ├── company/useCompanyOptions.ts / .test.ts          values + handlers
│   └── company/CompanyOptionsSection.tsx                busFilter case
└── docs/robotArticulationDocs.test.ts             NEW — cited symbols exist; gem/body source scan
docs/
├── AUDIO_SYSTEM.md                                bus filter paragraph (live path + UI now exist), portamento/curves under composite voice, bus.frequency in the LFO target list
├── SESSION_STORAGE.md, COMPANIES.md               fields
├── reference/ROBOT_DATA_GRID.md, reference/SLIDER_VALUES.md   rows (incl. Load Min/Max from §1.2)
├── ROBOT_DESIGN.md                                one line: articulation reaches the body through no dial
├── PROCEDURAL_GENERATION.md                       new dataIds
├── intent/robot-articulation.md                   shipped banner
└── todo/roadmap.md                                50.1 status + "as built" deltas
```

Not touched: `panning.ts`, `updateAllPanners`, `globalFx.ts`, `audioBudget.ts` / `LOAD_*` constants (unless
§5 fails), `bodyLineDials.ts`, anything under `components/robot/gem/`, `RobotBody.tsx`, the control
primitives, `SOURCE_OSCILLATOR_SUBSECTIONS`, `SignatureArrayDrawer.tsx`, `melodyGenerator.ts`,
`audioSwells.ts`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface, not a quiet widening.
- **Zero new Tone nodes.** The only new audio-graph objects are the per-link `Tone.Gain`s the LFO Bank
  already creates for any link, ≈ 2 per world at the seeded odds, all suspendable by the existing filter
  tier. A test counts `Filter` / `Synth` constructions per reservation and expects today's numbers.
- **Every AudioParam write lives in `AudioEngine` / `compositeVoice.ts`**, called from a store action or
  the restore path — never from a GSAP callback or a component (Strict Separation).
- **JSON-serialisable state.** New fields are numbers and string literals. Curve names and filter types
  are string unions, never Tone objects or arrays (Tone's `number[]` curve form is not exposed).
- **Absence is the default.** No code path writes `attackCurve: 'linear'`, `filterQ: 1`, `portamento: 0`
  or `filterType: 'lowpass'` into a robot except spawn and a user edit; the resolvers own the fallback.
  (Spawn writing explicit defaults is fine — the baseline carries the same values.)
- **Replayability.** Every new draw is `getSeededVal(noiseMap, dataId, offset, …)` at the spawn offset with
  a `robot.audio.*` dataId; the seeded-roster determinism oracle in `spawnSystem.test.ts` is updated, not
  loosened.
- **Nothing on the robot body reads the new fields or the bus link.** `bodyLineDials.LINE_TARGETS` is
  unchanged; `robotArticulationDocs.test.ts` greps `src/components/robot/gem/` and `RobotBody.tsx` for
  `portamento`, `filterQ`, `filterType`, `attackCurve`, `releaseCurve`, `bus.frequency` and expects none.
- **Content:** every new word in `src/content/copy/probe.ts`; no guard exemptions.
- **Primitives:** none change; `CONTROL_SCHEMA_TYPES` stays 14.
- **Ask first:** folding `filterFreq` into the articulation object (assumption 5), exposing `decayCurve`,
  a new `LOAD_*` threshold (only if §5 fails), any new dependency.
- **Never:** `.env*`, `node_modules/`, build output; relaxing a CLAUDE.md guardrail; per-robot effect nodes
  or sends (50.2+); seeding `highpass` or `filterFreq: 0`.

---

## 4. Code Style & Architecture Conventions

The envelope helper, so absence never reaches Tone:

```ts
// src/engine/audioEngine/compositeVoice.ts
export function toToneEnvelope(adsr: ADSREnvelope): ToneEnvelopeOptions {
  const env: ToneEnvelopeOptions = { attack: adsr.attack, decay: adsr.decay, sustain: adsr.sustain, release: adsr.release };
  if (adsr.attackCurve) env.attackCurve = adsr.attackCurve;
  if (adsr.releaseCurve) env.releaseCurve = adsr.releaseCurve;
  return env;
}
```

The bus method, on `updateRobotMasterVolume`'s shape:

```ts
// src/engine/AudioEngine.ts
updateRobotBusFilter(robotId: string, patch: { frequency?: number; Q?: number; type?: RobotFilterType }): void {
  const entry = compositeVoices.get(robotId);
  if (!entry) { devWarn(`[AudioEngine] updateRobotBusFilter: no composite reserved for ${robotId}`); return; }
  try {
    const f = entry.busFilter as unknown as { frequency: RampableParam; Q: RampableParam; type: string };
    if (patch.frequency !== undefined) rampOrSet(f.frequency, patch.frequency, FILTER_RAMP_SECONDS);
    if (patch.Q !== undefined) rampOrSet(f.Q, patch.Q, FILTER_RAMP_SECONDS);
    if (patch.type !== undefined) f.type = patch.type;
  } catch (err) {
    devWarn('[AudioEngine] updateRobotBusFilter failed', err);
  }
},
```

`rampOrSet` is the `rampTo`-if-present-else-`.value` three-liner `updateRobotMasterVolume` and
`updateRobotPan` each inline today, hoisted once and used by all three (a touch to two existing methods
that changes no behaviour; their tests already cover both branches).

Conventions: named module constants with "≈ n in 12" doc comments for every threshold; `satisfies` on
schemas; memoised handlers over a `latest` ref in drawers; `devWarn`, never `console`; CRLF files stay
CRLF; test titles without apostrophes.

---

## 5. Testing & Verification Requirements

Vitest + Testing Library, co-located. House rhythm: RED first, one commit per task, mutation check at the
named gates (see `docs/tasks/ROBOT_ARTICULATION.md` once written).

- **Composite voice** — ctor with `portamento 0.2` sets `synth.portamento`; absent → 0; `set({ layers:
  [{ portamento: 0.1 }] })` updates it; `toToneEnvelope` omits absent curves (`toEqual` exact keys) and
  includes present ones; ctor and the `adsr` patch both pass curves through `synth.set({ envelope })`
  (spy asserts no `attackCurve: undefined` key ever). Construction count: still one `Synth` per layer.
- **Engine** — `reserveVoice(…, 1850, { filterQ: 5, filterType: 'bandpass' })` builds the filter with
  `Q 5 / bandpass`; omitted → `Q 1 / lowpass` (the two existing cutoff tests keep passing untouched);
  `updateRobotBusFilter` ramps frequency and Q, assigns type, devWarns when unreserved;
  `updateVoicePortamento` reaches every layer; `getRobotModulationTarget(id, 'bus.frequency')` is the
  bus filter's `frequency`, `null` when unreserved, and the six layer ids still resolve as before;
  `reReserveVoice` re-applies portamento / Q / type from the store.
- **LFO engine** — `isFilterTarget('bus.frequency')` true; a bus link made under
  `setFilterLinksEnabled(false)` is created suspended and reconnects on `true`; `resolveLfoOutputRange`
  gives 20–20000; a layer link is unaffected by the filter tier (regression).
- **Spawn** — determinism: a fixed locale's roster is identical across two generations and matches an
  updated oracle; distribution: over 400 seeded robots, gliders fall in 8–16 %, shaped attacks and
  releases 10–20 % each, accent filters 15–25 %, bus links lit 10–20 %; a non-accent robot has
  `filterQ 1`, `lowpass`, cutoff in 2000–8000; an accent robot has Q in 3–8, cutoff in 400–2500, type in
  {lowpass, bandpass}; no robot ever gets `highpass` or `filterFreq 0`; `generateRobotAudioBaseline` equals
  `spawnRobot`'s fields for the same seed (the existing parity test, now covering the new fields — seed
  a distinguishing value, [[parity-test-fixture-non-default-values]]). Both reserve sites pass the
  articulation object (spy).
- **Swell types** — the two updated assertions (assumption 10).
- **Actions** — `applyPortamento` writes the field and calls `updateVoicePortamento`; `applyBusFilter({
  filterType: 'highpass' })` writes only that key and calls `updateRobotBusFilter({ type: 'highpass' })`;
  `applyAdsr` with `attackCurve: 'bounce'` reaches `updateVoiceEnvelope` unchanged.
- **Session** — a robot edited to `portamento 0.2 / filterQ 4 / filterType bandpass / attackCurve sine`
  diffs to exactly those keys (`adsr` whole, with the curve); an untouched robot diffs `{}`; restoring a
  payload with the keys sets the fields and primes the engine; a payload without them leaves absence;
  a payload with `filterType: 'notch'` or `attackCurve: 'zigzag'` drops the key. **Mutation check:**
  remove `filterQ` from the apply merge and watch the restore test go red.
- **Share** — `po`/`fq`/`ft`/`ac`/`rc` round-trip `toEqual`; absent keys stay absent; garbage decodes to
  absent.
- **Company** — fallbacks to the first member; snapshot wins; `onBusFilterChange({ filterQ: 6 })` calls
  `applyBusFilter` once per member and records `{ filterQ: 6 }`; `onPortamentoChange(0.1)` likewise;
  handler identities stable across unrelated edits (the existing identity test gains the new handlers).
- **UI** — `PingContourDrawer` renders Portamento and the two radios from `CONTENT`, each with help;
  choosing a shape calls `onChange` with the other fields spread; `BusFilterDrawer` renders Cutoff,
  Resonance, Type, the `LfoLink`, greys the link when `heldOff`; a drag calls `onChange` with one key;
  `RobotScreen` renders `busFilter` under Source and passes the portamento prop; the company screen
  renders the same subsection read-only-correct from the resolved value; the nav tree lists four Source
  rows (config-driven, one assertion).
- **Docs (`robotArticulationDocs.test.ts`)** — every backticked symbol in this spec and the updated docs
  exists; the gem/body source scan from §3; `AUDIO_SYSTEM.md` no longer contains "no live update path or
  UI control"; `SESSION_STORAGE.md` names the three new fields.
- **Content** — `content.test.ts` green; `help` present on every new value control.
- **Lint / type / build** clean at every checkpoint.

**Performance gate (Crawford, final checkpoint).** On the Pixel, the seed-`alpha` `?session=` world from the
baseline section, `?debug` HUD, 3:00 each, branch vs `main` at the branch base, **Standard then Full**:
output-underrun count expected **flat** (0 at Full on `main`). Desktop `npm run perf` before/after,
expected flat. If Standard or Full shows a rise attributable to the bus links (toggle the Effects Limit
below 0.4 to confirm the links are the cause), the bus target ships behind a new
`LOAD_BUS_FILTER_LFOS_MIN` beside `LOAD_FILTER_LFOS_MIN` — the one scope change this spec pre-authorises.
Portamento and curves have no gate: they add no graph.

**Manual (Crawford, same checkpoint).** On headphones with a fresh world: find the glider (its notes slide),
a bounced or stepped contour, and the resonant robot; drag a Cutoff with a lane linked and hear the wah
move; switch Type to bandpass and back with no dropout; set the Effects Limit to Light and see the bus
link grey with the held-off note; save, reload, share-link — all survive; a company edit lands on every
member; keyboard reaches every new control; every "?" reads right; nothing on any gem changed.

---

## 6. Git & Workflow Context

- Branch `feature/palette-articulation`, off `main` at `450bf2ad`. One commit per task, imperative
  subject, body cites the spec section, co-author trailer. Crawford merges.
- Roadmap **50.1** already exists; the last task adds a status line and the "as built" deltas (two radios;
  two-tier cutoff seeding; the articulation object on `reserveVoice`; `audioSwell.test` assertions;
  `busFilter` as a fourth Source subsection).
- Docs land in the last task; `docs/intent/robot-articulation.md` gets the shipped banner.
- `docs/todo/*.md` may be edited concurrently by another session: append-only, re-read first
  ([[audio-palette-roadmap-49]]).

---

## 7. Open Questions & Risks

**For Crawford — veto points, none blocking:** assumption 2 (two shape radios vs one), assumption 3 (the
2000–8000 Hz open tier and the 20 % accent share), assumption 5 (the trailing articulation object), and
the placeholder lore words in assumption 15.

**Risks:**

1. **Seven-option radios are the widest in the app** (today's max is five). On the phone tier two of them
   in one responsive row will stack; if a single row still overflows, the fallback is a `column` panel
   for the two radios — a schema change, no primitive change.
2. **Bandpass at Q 1 is quiet.** `Tone.Filter`'s bandpass passes less energy than a lowpass at the same
   cutoff; the seeded accent tier always pairs bandpass with Q ≥ 3, and the help copy says so. A user who
   picks bandpass at low Q hears a drop — accepted, reversible.
3. **A `type` switch is an instant graph change** on a sounding voice; a tick is possible. Volume and Pan
   ramp because they are continuous; type is not. If it clicks audibly, the fallback is to switch on the
   next transport 16n tick (an action-queued engine write, still inside `AudioEngine`).
4. **The re-seeded cutoff changes every world's brightness.** Intended (pre-v1, intent), but the Pixel
   baseline world will sound brighter than the recorded run; the A/B compares underruns, not sound, so
   the baseline stays valid.
5. **Portamento on the first note after silence** glides from the synth's last frequency, which for a
   robot returning from a long dock may be octaves away — a long swoop. Tone's `Monophonic` behaviour;
   the seeded ceiling keeps it short (0.20 s since the §1.10 amendment, which took the fallback this line named).
6. **`audioSwell.test.ts`'s superset invariant** is being narrowed (assumption 10). The protection it
   gave — removed LFO targets stay swellable — is unaffected; the new assertion says so in its title.
7. **`reserveVoice` has eight positional parameters** and now a ninth; the three sites are tested, a
   fourth future site that forgets the object gets today's sound silently (devWarn-free). The
   `reReserveVoice` and `loadInstruments` tests pin the two non-spawn sites.
