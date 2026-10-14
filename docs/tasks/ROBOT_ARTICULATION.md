# Implementation Plan: Robot Articulation — Portamento, Envelope Curves, Bus Filter

Spec: [docs/specs/ROBOT_ARTICULATION.md](../specs/ROBOT_ARTICULATION.md). Intent:
[docs/intent/robot-articulation.md](../intent/robot-articulation.md). Roadmap **50.1**. Branch
`feature/palette-articulation`, off `main` at `450bf2ad`.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `npm run perf`; the Pixel `?debug` HUD A/B (spec §5) at T14.

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo
convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status: BUILT 2026-10-13 (T1–T15 incl. T14b); T14 open, see below.** Originally PLANNED 2026-10-13. Spec assumptions 1–15 not yet reviewed by Crawford; the four veto points
> (2: two shape radios; 3: two-tier cutoff seeding; 5: the trailing articulation object on `reserveVoice`;
> 15: placeholder lore words) are isolated to T1/T5/T3/T7 respectively so a late veto is a one-task change.
>
> **T15 built (docs):** the four doc-text cases T13 left red are green, `robotArticulationDocs.test.ts` passes in full, and
> the roadmap 50.1 "As built", the intent banner and the nine reference docs are written. T14 is **not closed**: the Pixel
> report gave "no distortion at 3:00" with no mode, no underrun counts and no Effects Limit check, and the manual list and
> desktop `npm run perf` were not reported; `scratchy-audio-phones.md` records exactly that and no more. Open for Crawford:
> keep or remove the T14b tier (built before any rise), the lore words, and the unreported T14 lines. The intent, spec and
> this plan were committed with T15 because the guard test reads the spec.
>
> **T14b built (on Crawford's instruction, before T14's Pixel numbers were in):** `LOAD_BUS_FILTER_LFOS_MIN = 0.8`
> (the value is a guess, set equal to `LOAD_DRIFT_MIN`: Standard holds the robot bus links off, Full runs them; it is one
> constant to retune once T14 reports). `effectsLoadToLimits` gains an *effective* `busFilterLfosEnabled` (false whenever
> the global filter tier is); `lfoEngine.setBusFilterLinksEnabled` is a second suspend tier, and a `bus.` link is held off
> when either switch is off; `audioStore.busFilterLinksHeldOff` is what the Filter subsection (robot and company) greys
> from, while the Audio Rig's global filter panels keep `filterLinksHeldOff`; the `?debug` HUD gains an
> `lfo drift · filter · bus` line under the bank line; `describeLimits` says "robot filter LFOs". If Full is the mode that
> rose, 0.8 does nothing and the threshold would have to exceed 1 (links off everywhere): that is a decision, not a retune.
>
> **T13 built:** `src/docs/robotArticulationDocs.test.ts` is green except two doc-text cases that are red by design
> until T15: `AUDIO_SYSTEM.md` still contains "no live update path or UI control", and `SESSION_STORAGE.md` does not
> yet name `portamento`, `filterQ` and `filterType` (four failing `it`s in total: one, then three). The zero-new-nodes
> count is in `AudioEngine.test.ts` and green. The symbol walk caught one stale name in this spec and plan:
> `CURVE_SHAPED_THRESHOLD`, which T5 split into `ATTACK_CURVE_SHAPED_THRESHOLD` and `RELEASE_CURVE_SHAPED_THRESHOLD`
> when it calibrated the odds; both documents now say so.

## Overview

Fifteen tasks in four phases. **Phase 1** is the foundation nothing can see: the new types and constants,
the composite voice's portamento and curve plumbing, the engine's bus-filter method and seventh LFO target,
the LFO engine's filter-tier extension, and the seeded draws. **Phase 2** is the robot-screen vertical
slice: two actions, content and schemas, the Envelope drawer's two new rows, and the new Source
subsection — visible and audible on one robot at Checkpoint B. **Phase 3** widens it to companies and
makes it persist (session diff, share link). **Phase 4** is the guard test, Crawford's listen and Pixel
A/B (the series gate), and docs. Every task leaves types, lint and the suite green; RED first; one commit
per task; mutation-check at the named gates ([[tdd-incremental-workflow]]).

## Architecture Decisions

- **Absence is the default; resolvers own the fallback (spec assumption 1).** Every new field is optional
  on its type and absent means today's sound. `toToneEnvelope`, `resolveBusFilterQ` and
  `resolveBusFilterType` are the only places absence becomes a value, so fixtures, old payloads and
  pre-phase share links need no migration.
- **Curves ride the envelope; portamento rides the layer patch (assumptions 6–7).** `ADSREnvelope` carries
  `attackCurve` / `releaseCurve`, so `applyAdsr` → `updateVoiceEnvelope` → `synth.set({ envelope })` applies
  them with no new engine method — once `toToneEnvelope` strips absent keys. Portamento is a new ephemeral
  `LayerLivePatch` field through the same `set({ layers })` RPC, applied as `synth.portamento = v`.
- **One engine method for the bus, ramp-or-set (assumption 8).** `updateRobotBusFilter({ frequency?, Q?,
  type? })` on `updateRobotMasterVolume`'s shape; a hoisted `rampOrSet` replaces the three inline copies.
- **`'bus.frequency'` is a filter-tier target (assumption 9).** `isFilterTarget` widens to `bus.`, so the
  existing `setFilterLinksEnabled` suspend, the `filterLinksHeldOff` store flag and the `LfoLink.heldOff`
  rendering all cover it with no new dial. A new `LOAD_*` threshold exists only if T14's A/B demands it.
- **Seeding is a minority trait in two tiers (assumptions 3–4).** Common robots: open lowpass, no glide,
  linear curves. Accent rolls per trait: glider 12 %, shaped attack / release 15 % each, resonant filter
  20 % (lowpass or bandpass, never highpass), lit bus link 15 %. `generateRobotAudioBaseline` calls the same
  function, so an untouched robot still diffs to `{}`.
- **`reserveVoice` grows one optional trailing object (assumption 5)**, not three parameters, so the
  existing call sites and tests compile unchanged; the four reservation paths pass it from the store.
- **Ordering.** Types (T1) before everything; voice (T2) and engine (T3) before actions (T6) before UI
  (T8–T9): each layer's tests mock the one below. Content and schemas (T7) depend only on T1 and can land
  in parallel with T2–T5. Persistence (T11–T12) waits for T3 so the restore test can assert the prime.

## Dependency Graph

```
T1 types + constants + lfo id + swell test ─┬─► T2 compositeVoice (portamento, toToneEnvelope) ─► T3 AudioEngine (articulation object, resolvers, bus method, bus target) ─┐
                                            ├─► T4 lfoEngine (filter tier, range) ◄────────────────────────────────────────────────────────────────────────────────────────┤
                                            └─► T5 spawn seeding + baseline + 2 reserve sites ◄───────────────────────────────────────────────────────────────────────────┘
                                                                                                                                                     Checkpoint A
T7 content + schemas + subsection id ─┐                 T6 applyPortamento / applyBusFilter (needs T3)
                                      ├─► T8 PingContourDrawer rows 3–4 + RobotScreen envelope wiring ─┐
                                      └─► T9 BusFilterDrawer + RobotScreen busFilter case ─────────────┴─► Checkpoint B
                                                                                                             │
                                  T10 company (snapshot, resolve, handlers, busFilter case) ◄────────────────┤
                                  T11 session diff / apply / prime ◄─────────────────────────────────────────┘ (needs T1, T3)
                                  T12 share-link codec ◄── T11
                                                                      │
                                                              Checkpoint C ─► T13 guard tests ─► T14 Crawford's listen + Pixel A/B (STOP) ─► T15 docs ─► Complete
```

T2, T4 and T7 are independent of each other once T1 lands; T10 and T11 may run in parallel sessions after
T9.

## Phase 1: Foundations (nothing visible)

### Task 1: Types, constants, the seventh LFO target id, swell-test assertions

**Description:** `src/types/Robot.ts` gains `EnvelopeCurveName` + `ENVELOPE_CURVE_NAMES` (linear first,
seven), `RobotFilterType` + `ROBOT_FILTER_TYPES`, `ADSREnvelope.attackCurve?` / `releaseCurve?`,
`AudioAttributes.portamento?` / `filterQ?` / `filterType?` with the spec §1.1 doc comments. `src/types/lfo.ts`
adds `'bus.frequency'` to `RobotLfoTargetId` and `ROBOT_LFO_TARGET_IDS` (the doc comment's history
paragraph gains one line). `src/constants/index.ts` gains `PORTAMENTO_MIN/MAX`,
`ROBOT_BUS_FILTER_FREQ_RANGE`, `ROBOT_BUS_FILTER_Q_RANGE`, `FILTER_RAMP_SECONDS`. `src/types/audioSwell.ts`'s
"every RobotLfoTargetId is still a member" comment is corrected and `audioSwell.test.ts`'s two assertions
change per spec assumption 10 (superset over the six layer ids; count 7, title naming `bus.frequency` as
the non-swell target).

**Acceptance criteria:**
- [ ] `ENVELOPE_CURVE_NAMES` has 7 entries with `'linear'` first; `ROBOT_FILTER_TYPES` has 3 with `'lowpass'` first; `ROBOT_LFO_TARGET_IDS` has 7 with `'bus.frequency'` last (type-level test files pin all three).
- [ ] `audioSwell.test.ts` green with the two reworded assertions; `bodyLineDials.LINE_TARGETS` untouched (its test still green).
- [ ] `npm run build:types` green with **no fixture edits** — every new field is optional.

**Verification:**
- [ ] `npx vitest run src/types/`
- [ ] `npm run build:types && npm run lint`

**Dependencies:** None. **Files:** `src/types/Robot.ts`, `src/types/lfo.ts`, `src/types/audioSwell.ts` (+ test),
`src/constants/index.ts`. **Scope:** S.

### Task 2: Composite voice — `toToneEnvelope`, portamento at construction and via `set`

**Description:** `src/engine/audioEngine/compositeVoice.ts`: export `toToneEnvelope(adsr)` (spec §4);
`createCompositeVoice(descriptor, adsr, portamento = 0)` passes `portamento` and `envelope:
toToneEnvelope(adsr)` to `new Tone.Synth`; `LayerLivePatch` gains `portamento?: number`; the `set` body
applies `synth.portamento = p.portamento` inside try/devWarn and passes `toToneEnvelope(p.adsr)` in the
existing `adsr` branch. `AudioEngine.createCompositeVoice`'s pass-through gains the third argument.

**Acceptance criteria:**
- [ ] Ctor with `portamento 0.2` sets `synth.portamento` on every layer; omitted → 0.
- [ ] `toToneEnvelope({ a, d, s, r })` `toEqual`s exactly four keys; with `attackCurve: 'bounce'` exactly five; the ctor's `Tone.Synth` spy and the `set({ layers: [{ adsr }] })` spy both receive envelopes with **no `undefined`-valued key**.
- [ ] `set({ layers: [{ portamento: 0.1 }] })` updates layer 0 only when one entry is given, all layers when every entry carries it; the existing ADSR, detune, phase and width tests pass unmodified.

**Verification:**
- [ ] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts`

**Dependencies:** T1. **Files:** `compositeVoice.ts` (+ test), `src/engine/AudioEngine.ts` (one pass-through line).
**Scope:** S.

### Task 3: Engine — articulation object, resolvers, `updateVoicePortamento`, `updateRobotBusFilter`, `bus.frequency` target

**Description:** `src/engine/AudioEngine.ts`: `reserveVoice(…, filterFreq?, articulation?: { portamento?;
filterQ?; filterType? })`; `resolveBusFilterQ` / `resolveBusFilterType` beside `resolveBusFilterCutoff`;
the filter built with `{ frequency, Q, type }`; `makeStubFilter` gains `type` and a rampable `Q`;
`updateVoicePortamento(robotId, seconds)` on `updateVoiceEnvelope`'s shape; `updateRobotBusFilter(robotId,
patch)` per spec §4 with `rampOrSet` hoisted and reused by `updateRobotMasterVolume` and `updateRobotPan`
(behaviour unchanged); `getRobotModulationTarget(id, 'bus.frequency')` returns `entry.busFilter.frequency`;
`reReserveVoice` and `loadInstruments`' reservation pass the articulation object from the robot.

**Acceptance criteria:**
- [ ] `reserveVoice(…, 1850, { filterQ: 5, filterType: 'bandpass' })` builds `Filter({ frequency: 1850, Q: 5, type: 'bandpass' })`; omitted object → `Q 1`, `lowpass`; the two existing "bus filter cutoff" tests pass **unmodified**.
- [ ] `updateRobotBusFilter(id, { frequency: 900 })` ramps only frequency over `FILTER_RAMP_SECONDS`; `{ Q: 4 }` ramps only Q; `{ type: 'highpass' }` assigns type; unreserved → devWarn, no throw. `updateVoicePortamento(id, 0.15)` reaches every layer via `composite.set`.
- [ ] `getRobotModulationTarget(id, 'bus.frequency')` is the reserved bus filter's `frequency`, `null` unreserved; the six layer ids resolve as before; `reReserveVoice` on a robot with `portamento 0.2 / filterQ 6 / filterType bandpass` rebuilds with all three (spy on the ctor args). Existing Volume/Pan ramp tests green after the `rampOrSet` hoist.

**Verification:**
- [ ] `npx vitest run src/engine/AudioEngine.test.ts`
- [ ] **Mutation check:** drop `type` from the `FilterCtor` options and watch the first criterion go red.

**Dependencies:** T1, T2. **Files:** `src/engine/AudioEngine.ts` (+ test). **Scope:** M (one file, several
methods).

### Task 4: LFO engine — the filter tier covers `bus.frequency`; its swing range

**Description:** `src/engine/lfoEngine.ts`: `isFilterTarget` → `/^(lpf|hpf|bus)\./`; `resolveLfoOutputRange`
returns `ROBOT_BUS_FILTER_FREQ_RANGE` for `'bus.frequency'` (before the generic robot-target `null`).
Nothing in `audioBudgetSystem.ts` changes.

**Acceptance criteria:**
- [ ] A `bus.frequency` link made while `setFilterLinksEnabled(false)` is created suspended (its Gain disconnected) and reconnects on `setFilterLinksEnabled(true)`; a `layer0.gain` link is unaffected by the tier (regression).
- [ ] `linkTarget('bus.frequency', { lane: 'a', depth: 100 }, id)` on a filter at 1200 Hz sets the link Gain to `centeredSwingFromRange({20, 20000}, 1200).max` (1180); at 6000 Hz, 5980.
- [ ] `isFilterTarget` is still false for every `layerN.*` id (loop).

**Verification:**
- [ ] `npx vitest run src/engine/lfoEngine.test.ts src/systems/audioBudgetSystem.test.ts`

**Dependencies:** T1, T3 (the mocked `getRobotModulationTarget`). **Files:** `src/engine/lfoEngine.ts` (+ test).
**Scope:** S.

### Task 5: Spawn seeding, link odds per target, baseline parity, the two reserve sites

**Description:** `src/systems/spawnSystem.ts`: the §1.2 draws inside `generateAudioAttributes` with named
constants (`GLIDER_THRESHOLD 0.12`, `PORTAMENTO_SEED_RANGE 0.05–0.20` (0.30 until the post-T10 amendment), `ATTACK_CURVE_SHAPED_THRESHOLD` / `RELEASE_CURVE_SHAPED_THRESHOLD` (nominal 0.15, calibrated),
`FILTER_ACCENT_THRESHOLD 0.2`, `OPEN_FILTER_FREQ_RANGE 2000–8000`, `ACCENT_FILTER_FREQ_RANGE 400–2500` (the
renamed `FILTER_FREQ_RANGE`), `ACCENT_FILTER_Q_RANGE 3–8`, `ACCENT_BANDPASS_SHARE 0.4`), a `seedCurve`
helper; `robotLfoQuietThresholdForTarget` (0.7 layers / 0.85 bus) and a bus branch in
`robotLfoDepthSeedRangeForTarget` (`1–40`), both used by `generateRobotLfoLinks`; the two `reserveVoice`
sites (`:735`, `:889`) pass `{ portamento, filterQ, filterType }`. Each threshold's doc comment gives its
"≈ n in 12". `docs/PROCEDURAL_GENERATION.md` is **not** edited here (T15).

**Acceptance criteria:**
- [ ] Determinism: a fixed locale's roster is identical across two generations and matches the updated oracle; `generateRobotAudioBaseline` equals `spawnRobot`'s audio fields for a seed whose robot is a glider **and** an accent (a distinguishing fixture, [[parity-test-fixture-non-default-values]]).
- [ ] Distribution over 400 seeded robots: gliders 8–16 %, shaped attacks 10–20 %, shaped releases 10–20 %, accent filters 15–25 %, lit `bus.frequency` links 10–20 %; non-accent robots have `filterQ 1 / lowpass / cutoff 2000–8000`; accent robots `Q 3–8 / cutoff 400–2500 / type ∈ {lowpass, bandpass}`; no robot has `highpass`, `filterFreq 0`, or portamento outside `{0} ∪ [0.05, 0.20]`.
- [ ] Both reserve sites pass the articulation object (spy asserts the 9th argument `toEqual`s the robot's three fields).

**Verification:**
- [ ] `npx vitest run src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts` (the existing untouched-robot-diffs-to-`{}` tests must stay green with the moved baseline).
- [ ] **Mutation check:** set `FILTER_ACCENT_THRESHOLD` to 0 and watch the distribution test go red.

**Dependencies:** T1, T3. **Files:** `src/systems/spawnSystem.ts` (+ test). **Scope:** M (one file, many
draws).

### Checkpoint A: Foundations
- [ ] `npm run build:types`, `npm run lint`, `npm test` green.
- [ ] `npm run dev`: a fresh world plays; at least one robot audibly glides or is darker/resonant (a listen, not a gate); no console devWarns on spawn.
- [ ] Review with Crawford before Phase 2 if any assumption 1–10 is in doubt.

## Phase 2: The robot-screen slice

### Task 6: `applyPortamento` / `applyBusFilter`

**Description:** `src/systems/robotOptionsActions.ts` per spec §1.5: both write `audioAttributes` through
`updateRobot` then call the engine (`updateVoicePortamento`; `updateRobotBusFilter` with the patch mapped
`filterFreq → frequency`, `filterQ → Q`, `filterType → type`, absent keys omitted). `applyAdsr` and
`applyLayerLfoLink` untouched.

**Acceptance criteria:**
- [ ] `applyPortamento(r, l, 0.2)` stores `portamento: 0.2` (other attributes spread) and calls `updateVoicePortamento(r.id, 0.2)` once.
- [ ] `applyBusFilter(r, l, { filterType: 'highpass' })` stores only that key and calls `updateRobotBusFilter(r.id, { type: 'highpass' })` — `toEqual`, no `frequency`/`Q` keys; `{ filterFreq: 900, filterQ: 4 }` maps both.
- [ ] `applyAdsr(r, l, { …, attackCurve: 'sine' })` reaches `updateVoiceEnvelope` with the curve (regression, no code change).

**Verification:**
- [ ] `npx vitest run src/systems/robotOptionsActions.test.ts`

**Dependencies:** T3. **Files:** `robotOptionsActions.ts` (+ test). **Scope:** S.

### Task 7: Content entries, control schemas, the `busFilter` subsection id

**Description:** `src/content/copy/probe.ts`: the seven entries of spec §1.9 with placeholder lore words,
`CURVES` and `FILTER_TYPES` option records, `help.human` on every value control, one sentence added to the
Envelope and Source intros. `src/data/robotOptionsConfig.ts`: `PORTAMENTO_SCHEMA` (sliderLog 0–2 s),
`ATTACK_CURVE_SCHEMA` / `RELEASE_CURVE_SCHEMA` (radio, `options(key)`), `BUS_FILTER_PANEL_SCHEMA`,
`BUS_CUTOFF_SCHEMA` (sliderLog 20–20000), `BUS_RESONANCE_SCHEMA` (sliderLog 0.1–20), `BUS_FILTER_TYPE_SCHEMA`
(radio), `BUS_FILTER_LINK_SCHEMA` (`lfoLink`, `lfoTarget: 'bus.frequency'`), two `responsive` row panels.
`src/stores/uiStore.ts` `RobotSubsection` + `'busFilter'`; `ROBOT_SECTIONS_CONFIG.source.subsections` gains
`{ id: 'busFilter', content: 'probe.source.filter', accordion: 'probe.source.filter' }` last;
`SOURCE_OSCILLATOR_SUBSECTIONS` unchanged. `content.test.ts`'s section-walk id list gains the new ids.

**Acceptance criteria:**
- [ ] `content.test.ts` green: every new entry reachable, `help` present on the six value controls, no literal in a component or config.
- [ ] Radio schemas' `options` have 7 / 7 / 3 entries whose `value`s equal `ENVELOPE_CURVE_NAMES` / `ROBOT_FILTER_TYPES` exactly (order included).
- [ ] The nav-tree config test lists four Source subsections with `busFilter` last; `SOURCE_OSCILLATOR_SUBSECTIONS` still has three; `CONTROL_SCHEMA_TYPES` still 14.

**Verification:**
- [ ] `npx vitest run src/content/ src/data/`
- [ ] `npm run build:types && npm run lint` (the union change surfaces the two renderer switches — they fall to `default: null` until T8/T9, which is acceptable here).

**Dependencies:** T1. **Files:** `probe.ts`, `robotOptionsConfig.ts`, `uiStore.ts`, `robotSubsectionConfig.ts`,
`content.test.ts`. **Scope:** M.

### Task 8: `PingContourDrawer` rows 3–4 and the robot screen's envelope wiring

**Description:** `src/components/robot/PingContourDrawer.tsx`: props `portamento: number`,
`onPortamentoChange`; row 3 `[Portamento SliderLog]`, row 4 `[Attack Shape radio | Release Shape radio]`
(`responsive`); two memoised curve handlers over `latestAdsr` (`onChange({ ...latestAdsr.current,
attackCurve: v })`); CSS for the radio row. `RobotScreen.tsx` passes `robot.audioAttributes.portamento ?? 0`
and a `handlePortamentoChange` → `applyPortamento`; the `renderSubsection` memo deps gain both. The
company screen passes placeholders (`portamento: 0`, no-op handler) so types stay green — **the company
Portamento slider is inert until T10**, as Pan's was.

**Acceptance criteria:**
- [ ] The drawer renders Portamento and the two radios from `CONTENT` (labels and help, no literal); choosing `'bounce'` for Attack Shape calls `onChange` with the other ADSR fields and `releaseCurve` spread unchanged; dragging Portamento calls `onPortamentoChange` with the value.
- [ ] A robot with no curves renders both radios at `'linear'`; the four existing slider tests pass unmodified.
- [ ] `RobotScreen`: a Portamento edit calls `applyPortamento`; a shape edit calls `applyAdsr` with the curve; an unrelated robot field change does not re-render the drawer (the existing render-count pattern).

**Verification:**
- [ ] `npx vitest run src/components/robot/PingContourDrawer.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx`

**Dependencies:** T6, T7. **Files:** `PingContourDrawer.tsx` / `.css` / `.test.tsx`, `RobotScreen.tsx` (+ test),
`CompanyOptionsSection.tsx` (placeholder props). **Scope:** M.

### Task 9: `BusFilterDrawer` and the robot screen's `busFilter` case

**Description:** New `src/components/robot/BusFilterDrawer.tsx` (+ `.css`, `.test.tsx`): pure, `memo`-wrapped;
props `value: { filterFreq; filterQ; filterType; lfoLink }`, `onChange(patch)`, `onLfoLinkChange(link)`,
`heldOff`, `disabled?`; layout `[Cutoff]`, `[LfoLink]` (+ `HeldOffNote` when `heldOff`), `[Resonance | Type]`.
`RobotScreen.tsx` case `'busFilter'`: value from `robot.audioAttributes` through the resolver defaults and
`robot.lfoLinks?.['bus.frequency'] ?? DEFAULT_LFO_LINK['bus.frequency']`; `heldOff` from
`useAudioStore(s => s.filterLinksHeldOff)`; handlers → `applyBusFilter` / `applyLayerLfoLink(robot, l,
'bus.frequency', link)`. Company screen renders the drawer disabled with the resolved first-member value
until T10.

**Acceptance criteria:**
- [ ] The drawer renders Cutoff, Resonance, Type and the `LfoLink` from `CONTENT`; a Cutoff drag calls `onChange({ filterFreq })` with exactly one key; choosing `bandpass` calls `onChange({ filterType: 'bandpass' })`; a lane change calls `onLfoLinkChange`; `heldOff` greys the link (Off/0 displayed, stored value untouched) and shows the note.
- [ ] `RobotScreen`: Source lists four rows, `busFilter` last; selecting it renders the drawer; edits reach `applyBusFilter` / `applyLayerLfoLink` with `'bus.frequency'`; a robot with absent fields shows `Q 1 / lowpass`.
- [ ] Keyboard: every control reachable and operable (Testing Library `userEvent.tab` walk).

**Verification:**
- [ ] `npx vitest run src/components/robot/BusFilterDrawer.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx`
- [ ] `npm run dev` with `?debug`: link a lane on a robot's Cutoff and read the HUD "links" line rise by one.

**Dependencies:** T6, T7. **Files:** `BusFilterDrawer.tsx` / `.css` / `.test.tsx`, `RobotScreen.tsx` (+ test),
`CompanyOptionsSection.tsx` (case). **Scope:** M.

### Checkpoint B: One robot, end to end
- [ ] `npm run build:types`, `npm run lint`, `npm test` green.
- [ ] `npm run dev`, headphones: on one robot, raise Portamento and hear the slide; pick Step for Attack Shape; open Source → Filter, drop Cutoff to 600 Hz with Resonance 6 and hear it darken and ring; link lane A and hear the wah; set the Effects Limit to Light and see the link grey with the note; nothing on the gem changed.
- [ ] Review with Crawford before Phase 3.

## Phase 3: Companies and persistence

### Task 10: Company broadcast

**Description:** `src/types/Company.ts` snapshot + `filterFreq?`, `filterQ?`, `filterType?`, `portamento?`;
`resolveCompanyOptions` falls back per field to the first member's `audioAttributes` (absent → the
resolver default). `useCompanyOptions.ts`: `portamentoValue`, `busFilterValue` (resolved, memoised),
`onPortamentoChange` and `onBusFilterChange(patch)` mirroring `onVolumeChange` (loop members through the
action, `patchSnapshot`), the bus link through the existing `onLfoFieldChange` path. `CompanyOptionsSection`
drops the T8/T9 placeholders and wires both drawers live.

**Acceptance criteria:**
- [ ] `resolveCompanyOptions` falls back to the first member's four fields; a snapshot value wins; absent everywhere → `Q 1 / lowpass / portamento 0`.
- [ ] `onBusFilterChange({ filterQ: 6 })` calls `applyBusFilter` once per member with that patch and records `{ filterQ: 6 }`; `onPortamentoChange(0.1)` likewise; a bus-link change calls `applyLayerLfoLink(m, l, 'bus.frequency', link)` per member; handler identities stable across an unrelated edit (the existing identity test gains the new handlers).
- [ ] The company screen renders both drawers enabled with the resolved values.

**Verification:**
- [ ] `npx vitest run src/systems/companyOptions.test.ts src/components/company/`

**Dependencies:** T8, T9. **Files:** `Company.ts`, `companyOptions.ts` (+ test), `useCompanyOptions.ts` (+ test),
`CompanyOptionsSection.tsx`. **Scope:** M.

### Task 11: Session diff, apply, prime

**Description:** `src/types/session.ts` diff + `portamento?`, `filterQ?`, `filterType?` (`filterFreq`'s
"seeded only, no UI" comment rewritten). `sessionDiff.ts`: `computeRobotAudioOverrideDiff` diffs the three
by `deepEqual` against `baseline.audioAttributes`; the apply merge spreads them into `audioAttributes`;
after `updateRobot`, prime a reserved robot with `updateVoicePortamento` / `updateRobotBusFilter` only for
keys present; decoders drop a non-finite number or an unlisted `filterType` / curve string (curves are
validated inside the existing `adsr` restore).

**Acceptance criteria:**
- [ ] A robot edited to `portamento 0.2 / filterQ 4 / filterType bandpass / attackCurve sine` diffs to exactly `{ adsr: {…, attackCurve: 'sine'}, portamento: 0.2, filterQ: 4, filterType: 'bandpass' }`; an untouched glider/accent robot diffs `{}`.
- [ ] Restoring that payload sets the fields and calls `updateRobotBusFilter(id, { Q: 4, type: 'bandpass' })` and `updateVoicePortamento(id, 0.2)`; a payload without the keys leaves absence; `{ filterType: 'notch' }` and `{ adsr: { …, attackCurve: 'zigzag' } }` drop the offending key and restore the rest.
- [ ] `localeStore.updateRobot` is not changed (no clamp needed: the slider bounds are the only writer).

**Verification:**
- [ ] `npx vitest run src/utils/sessionDiff.test.ts`
- [ ] **Mutation check:** remove `filterQ` from the apply merge and watch the restore test go red.

**Dependencies:** T1, T3, T5. **Files:** `session.ts`, `sessionDiff.ts` (+ test). **Scope:** S.

### Task 12: Share-link codec

**Description:** `sessionShareUtils.ts`: `CompactRobotOverrideDiff` + `po`, `fq`, `ft`; `CompactADSR` + `ac`,
`rc` (absent when the curve is absent); `to`/`from` both ways; decoders validate type and membership.

**Acceptance criteria:**
- [ ] A diff with all five new values round-trips `toEqual`; absent keys stay absent; `ft: 'notch'`, `ac: 3`, `po: 'x'` decode to no key.
- [ ] A pre-phase link (no new keys) decodes to today's diff exactly (fixture from the existing suite).

**Verification:**
- [ ] `npx vitest run src/utils/sessionShareUtils.test.ts`

**Dependencies:** T11. **Files:** `sessionShareUtils.ts` (+ test). **Scope:** S.

### Checkpoint C: Integration
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` green.
- [ ] `npm run dev`: edit one robot's glide, shapes and filter; save a session, reload, share-link into a fresh tab — all three survive; a company edit lands on every member.

## Phase 4: Guards, listen, docs

### Task 13: `robotArticulationDocs.test.ts` — docs, guardrail and zero-new-nodes guards

**Description:** New `src/docs/robotArticulationDocs.test.ts` on `robotPanDocs.test.ts`'s two-layer pattern:
a declaration table (every new symbol matched in the file the spec names) plus the generic
backtick-identifier walk over spec §1–§4 and the lines T15 edits; the gem/body source scan from spec §3
(`src/components/robot/gem/`, `RobotBody.tsx`, and `bodyLineDials.LINE_TARGETS` still exactly the three
gain ids); `AUDIO_SYSTEM.md` must not contain "no live update path or UI control"; `SESSION_STORAGE.md`
names the three new fields. Plus, in `AudioEngine.test.ts`, the **zero-new-nodes** count: one `Filter`,
one `Panner`, one bus `Gain`, one `Synth` per audible layer per reservation, same as `main`.

**Acceptance criteria:**
- [ ] Symbol and source-scan layers green at T13; the two doc-text cases red by design until T15 (recorded in the status line, as Pan's were).
- [ ] The construction-count test is green and pinned to today's numbers.

**Verification:**
- [ ] `npx vitest run src/docs/robotArticulationDocs.test.ts src/engine/AudioEngine.test.ts`

**Dependencies:** T12. **Files:** `src/docs/robotArticulationDocs.test.ts`, `AudioEngine.test.ts`. **Scope:** S.

### Task 14: Crawford's listen and the Pixel A/B — STOP and report

**Description:** Hand over for the spec §5 performance gate and manual list. **Gate:** Pixel, seed-`alpha`
`?session=` world from [scratchy-audio-phones.md](../todo/scratchy-audio-phones.md#baseline-for-the-audio-palette-series-roadmap-50--crawfords-run-2026-10-13),
`?debug` HUD, 3:00 each, **Standard then Full**, branch vs `main` at `450bf2ad`; desktop `npm run perf`
before/after. Expected flat. **Manual:** the spec §5 list (glider, shaped contour, resonant robot, wah on a
linked Cutoff, type switch without dropout, held-off link at Light, save/reload/share, company broadcast,
keyboard, every "?", gem unchanged). Record each line's result individually. **If Standard or Full rises
and the Effects-Limit toggle below 0.4 confirms the bus links are the cause:** one extra task,
**T14b**, adds `LOAD_BUS_FILTER_LFOS_MIN` beside `LOAD_FILTER_LFOS_MIN`, a `busFilterLfosEnabled` limit, a
second engine suspend tier keyed on `bus.`, and the HUD line — the one scope change the spec
pre-authorises. Lore-word verdicts (assumption 15) land here too.

**Acceptance criteria:**
- [ ] Underrun counts recorded in `scratchy-audio-phones.md` under the baseline section (branch, commit, Standard, Full, duration), per the series convention.
- [ ] Every §5 manual line has a verdict; deviations become T15 notes or a T14b decision.

**Verification:**
- [ ] Crawford's report. **STOP** here until it arrives; do not start T15.

**Dependencies:** T13. **Files:** `docs/todo/scratchy-audio-phones.md` (append-only). **Scope:** —.

### Task 15: Docs, roadmap, intent banner

**Description:** `docs/AUDIO_SYSTEM.md` (bus filter paragraph rewritten for the live path, Q, type and the
UI; portamento and curves under the composite voice; `bus.frequency` in the robot LFO target list; the
`reserveVoice` signature line); `docs/SESSION_STORAGE.md` field list; `docs/COMPANIES.md` snapshot fields;
`docs/reference/ROBOT_DATA_GRID.md` rows (Portamento, Attack/Release Shape, Cutoff, Resonance, Type, and
`bus.frequency` in the LFO LINK row); `docs/reference/SLIDER_VALUES.md` rows with Load Min/Max from §1.2;
`docs/ROBOT_DESIGN.md` one line (articulation reaches the body through no dial);
`docs/PROCEDURAL_GENERATION.md` the new `robot.audio.*` and `robot.lfo.bus.frequency.*` dataIds; roadmap
**50.1** status line + "as built" deltas (two radios; two-tier cutoff; the articulation object;
`audioSwell.test` assertions; `busFilter` as a fourth Source subsection; T14b if it happened);
`docs/intent/robot-articulation.md` shipped banner; the `audioHealth` HUD doc notes "links" now counts 7
slots per robot. Spot-check every name against the shipped source, not this plan. `docs/todo/*.md`
append-only, re-read first.

**Acceptance criteria:**
- [ ] `robotArticulationDocs.test.ts` fully green.
- [ ] Roadmap 50.1 records every "as built" delta above and the recorded Pixel numbers.

**Verification:**
- [ ] `npx vitest run src/docs/robotArticulationDocs.test.ts`; `npm run build:types && npm run lint`.

**Dependencies:** T14. **Files:** the nine docs above. **Scope:** S (docs only).

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria met; T14's results recorded line by line; deferred items flagged.
- [ ] Ready for Crawford's PR from `feature/palette-articulation`; the intent, spec and this file committed with it.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The bus links raise Pixel underruns at Standard or Full | High — the series gate | Seeded lit share 15 % (≈ 2 links/world); existing filter tier suspends them at Light; T14b pre-authorised |
| `undefined` curve keys reach `synth.set` and reset Tone's envelope | High — silent envelope breakage | T2's `toToneEnvelope` with a "no undefined-valued key" spy on both paths |
| Re-seeded cutoff changes every world's brightness | Medium (intended) | Pre-v1 per intent; the A/B compares underruns, not sound; T5's distribution test pins the tiers |
| Seven-option radios overflow the phone row | Medium | T8 uses a `responsive` row; fallback is a `column` panel schema, no primitive change (spec risk 1) |
| `type` switch clicks on a sounding voice | Low | Accepted (spec risk 3); fallback is a next-16n-tick write inside `AudioEngine` |
| A fourth reservation site forgets the articulation object | Medium | T3 pins `reReserveVoice` + `loadInstruments`, T5 the two spawn sites; spec risk 7 names the footgun |
| `audioSwell.test` superset narrowing hides a future regression | Low | T1's reworded title states the invariant it still protects |
| First note after a long dock swoops | Low | Seeded ceiling 0.20 s (the spec risk 5 fallback, taken in the post-T10 amendment) |
| Lore words vetoed late | Low | Isolated to T7 strings; T14 forces the verdict before docs |

## Amendment after T10: Attack, Decay and Release range; glide ceiling (2026-10-13)

Not one of T1–T15; recorded in the spec's §1.10. The Attack, Decay and Release sliders and their seeded ranges (and, for
Attack and Release, the body normaliser) now share `ENVELOPE_TIME_MAX_SECONDS = 2`, shaped stages are seeded short
(attack 0.03–0.25 s, release 0.15–0.8 s), and the seeded glide tops out at 0.2 s (was 0.30 s). Reason: at several seconds the gate saturates into a drone and neither the times nor the shapes
can be heard. Touches `constants/index.ts`, `robotOptionsConfig.ts`, `robotVisualHelpers.ts`, `spawnSystem.ts`
(+ their tests). **T14's Crawford listen is the real verdict** on whether 2 s and the shaped ranges feel right.

## Open Questions

1. Two shape radios vs one (spec assumption 2) — Crawford, before T7. Default: two.
2. The 2000–8000 Hz open tier and the 20 % accent share (assumption 3) — Crawford, before T5. Default: as
   written.
3. The trailing articulation object on `reserveVoice` vs folding `filterFreq` in (assumption 5) — Crawford,
   before T3. Default: trailing object.
4. Placeholder lore words (assumption 15) — Crawford, at T14. Default: ship placeholders, copy pass later.
