# Implementation Plan: Global Colour — Distortion, Chebyshev and BitCrusher on the Global Chain

Spec: [docs/specs/GLOBAL_COLOUR.md](../specs/GLOBAL_COLOUR.md). Intent:
[docs/intent/global-colour.md](../intent/global-colour.md). Roadmap **50.3**. Branch `feature/palette-colour`
(a proposed name; Crawford creates it), off `main` at `afdcb2d8` or later.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `npm run perf`; the phone gate is the `?debug` HUD on the Pixel (spec §5).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo
convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status (2026-10-15): BUILT on `feature/palette-colour`, PR pending.** T1–T11, T14 and T15 committed; T12 is
> partial (one Full 3:00 Pixel run, verbal, no HUD numbers) and T0 (the re-baseline) and T13b (no threshold needed)
> were not done. Checkpoints A–C passed (Crawford). The guard test `src/docs/globalColourDocs.test.ts` is fully green.
> What shipped differs from the tasks below in four ways Crawford chose after hearing it: the Mix is tapered
> (`wet = mix²` at the node, `colourWetGain`), no seeded Mix is above 0.25 with Chebyshev and Bit Crusher lower
> (0.05–0.15, Distortion 0.10–0.25), at most one effect is on per world (four characters, about 25 % each; the pair
> characters T5 built are gone), and the trait stays red + tangerine. The spec's §7 answers and §8 "As Built" and
> roadmap 50.3 "As built" are the record; the task text below is the plan as written. Earlier status, for the record:
> **NOT STARTED (2026-10-14).** The spec is written but not yet approved; its veto points (spec §7)
> are: the new `colour` trait vs reusing `output` (assumption 9), the character shares and lit bands
> (2, 7), the Chebyshev cap (6), uncoloured tails (4), presets clean (8), the lore words (14). None blocks
> T1–T4; T5 needs the share targets (it is calibrated against them); T7 needs the trait answer; T8 needs the
> words (placeholders are fine until T15). T0 can run today, on `main`, before any of it.

## Overview

Sixteen tasks in five phases, plus a device task that runs first. **Phase 0** re-baselines the Pixel on
current `main`, because the series baseline predates the Sends chain. **Phase 1** is data and engine,
nothing visible: the three settings blocks and their ranges (with the grid rows the range tests parse),
the three nodes in the chain slot with their setters, the store rail, and the seeded character draw —
audible from a fresh seed at Checkpoint A with no UI. **Phase 2** is the Colour tab as one vertical slice:
trait, content, rig blocks, the tab itself, usable at Checkpoint B. **Phase 3** makes old payloads load
with defaults. **Phase 4** is the guard test, the phone A/B, the conditional threshold and Crawford's
listen (where the bands get tuned). **Phase 5** is docs. Every task leaves types, lint and the suite green;
RED first; one commit per task; the mutation harness at the named gates.

## Architecture Decisions

- **The grid rows land with the range tables, not with docs (T2).**
  `globalAudioLoadingRanges.test.ts:45` and `globalAudioSeedRanges.test.ts:51` parse
  `docs/reference/GLOBAL_CHAIN_GRID.md` field by field, so the six rows are part of T2's green, and the
  docs task (T15) owns only the grid's prose.
- **Types and presets in one commit (T1).** `GlobalAudioSettings` gaining three required keys breaks every
  full literal: `transmissionPresets.ts` (three), `AudioEngine.test.ts` (one fixture) and
  `globalAudioSeed.test.ts` (the two oracles). T1 carries the presets and the fixture; T5 carries the
  oracles, by hand, because that edit is a seeding claim and belongs beside the seeder.
- **Nodes before the store (T3 before T4), store before the seeder (T4 before T5).** The setters exist
  before anything routes to them; the seeder's values reach the engine only through
  `applyGlobalAudioToEngine`, so Checkpoint A can be heard.
- **One character draw (spec assumption 1), calibrated by measurement, in its own task (T5).** The nominal
  band edges are a starting point; the calibration test pins realised shares over 3 000 seeds. T14 is where
  Crawford moves the targets and T5's test moves with them.
- **The Tone mocks are inline per test file** (`AudioEngine.test.ts:11`, `globalFx.test.ts:10`): T3 adds
  `Distortion`, `Chebyshev` and `BitCrusher` to both, each returning a `wet` with `rampTo`, plus `bits` on
  the crusher, and a `BitCrusher` variant that throws so the skip path is tested.
- **The Colour tab is a vertical slice (T6–T9)** and nothing in it is reachable until T9 wires the group:
  T6 (trait) and T7 (content) are independent and may land in parallel with Phase 1; T8 (rig blocks) needs
  T1 and T7; T9 needs all three.
- **Persistence changes only on the way in (T10).** `withGlobalAudioDefaults` is written in T1 beside the
  defaults it reads; T10 calls it from `applySessionPayload` and `fromCompactSessionPayload`. Nothing is
  encoded or versioned.
- **The Effects Limit threshold is conditional (T13b)** and fixed in shape by spec assumption 12, so a rise
  on the Pixel is one task, not a redesign.
- **Order.** T0 first (device, independent). T1 → T2 → T3 → T4 → T5 → Checkpoint A. T6, T7 any time after
  T1. T8 after T1 + T7. T9 after T6 + T8 + T4 → Checkpoint B. T10 after T1 → Checkpoint C (needs T9 too).
  T11 after C. T12 (A/B) after C and T0. T13b only if T12 says so. T14 after T12. T15 last.

## Dependency Graph

```
T0 re-baseline on main (STOP, device) ─────────────────────────────────────────────────┐
                                                                                        │
T1 types + defaults + withGlobalAudioDefaults + presets                                 │
 ├─► T2 seed keys + both range tables + grid rows                                       │
 │    └─► T3 three nodes, chain slot, setters ─► T4 store rail ─► T5 character draw + oracles + calibration
 │                                                                     │                │
 ├─► T7 content ─┐                                           Checkpoint A              │
 │               ├─► T8 rig blocks + effect key + trait map ─┐        │                │
 └─► T6 trait ───┴───────────────────────────────────────────┴─► T9 the Colour tab ─► Checkpoint B
 └─► T10 defaults at restore + share decode ──────────────────────────────┘             │
                                                                   Checkpoint C         │
                                                                        │               │
                       T11 docs/symbol guard ─► T12 phone A/B (STOP) ◄──┴───────────────┘
                                                      │
                                            T13b threshold (only if T12 rises) ─► T12 again
                                                      │
                                            T14 Crawford's listen + band tuning (STOP)
                                                      │
                                            T15 docs ─► Complete
```

T6 and T7 are independent of everything but T1 and may run in parallel sessions; never share a file in one
commit (`traitColors.ts` is T6's, `fleet.ts` is T7's).

## Phase 0: The device baseline

### Task 0: Re-baseline the Pixel on current `main` — **STOP for Crawford**

**Description:** The series baseline in `docs/todo/scratchy-audio-phones.md` ("Baseline for the Audio
Palette series") was measured on `ca2b6868`, before Robot Sends moved the rooms off the chain. Run the
same world (`?debug&session=` + the recorded payload: seed `alpha`, camera 0/50, defaults) on `main` at
`afdcb2d8` or later: Pixel 8, Chrome, the Vite preview build, **Full 3:00** and **Standard 3:00**, and
record the HUD `underruns` start → end for each.

**Acceptance criteria:**
- [ ] A new dated section in `scratchy-audio-phones.md` with the commit hash, both runs and both counts.
- [ ] The old section is marked retired and points at the new one.

**Verification:** Crawford's runs; the numbers are written by whoever runs them. No code.

**Dependencies:** None. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** XS (gated on a device).

---

## Phase 1: Data and engine (nothing visible)

### Task 1: Types, defaults, `withGlobalAudioDefaults`, presets

**Description:** `src/types/globalAudio.ts` gains `DistortionSettings { amount, wet }`,
`ChebyshevSettings { order, wet }`, `BitCrusherSettings { bits, wet }`, the three keys on
`GlobalAudioSettings` between `filterHPF` and `limiter`, their defaults (`{0.3, 0}`, `{2, 0}`, `{8, 0}`)
and `withGlobalAudioDefaults(partial)`, which fills any missing effect key from the defaults and nothing
else. `transmissionPresets.ts`'s three literals and `AudioEngine.test.ts`'s one full fixture gain the
default blocks so the tree compiles. The seed oracles are left red-free by **not** touching the seeder yet
(it still returns the old shape; T1's type change makes `generateGlobalAudioSettings` a type error that T2
does not fix either — so T1 adds the three default blocks to the seeder's return literal as a placeholder,
and T5 replaces them with draws).

**Acceptance criteria:**
- [ ] `DEFAULT_GLOBAL_AUDIO_SETTINGS` carries the three blocks with every `wet` at `0`.
- [ ] `withGlobalAudioDefaults({})` returns a full `GlobalAudioSettings` equal to the defaults; a partial with
  `bitCrusher` present and `distortion` absent keeps the given `bitCrusher` byte-for-byte and fills
  `distortion`; an unknown key is dropped. **Mutation:** return `{ ...defaults, ...partial }` without the
  per-key fill and the "present block kept, missing block filled" case still passes — so the test must
  also prove a *nested* partial (`{ delay: { wet: 0.5 } }`) is not deep-merged (it is kept as given,
  which is the existing whole-block convention) — document this in the test name.
- [ ] Every transmission preset's `globalAudio` has the three blocks at the defaults.
- [ ] `npm run build:types` clean; every existing test passes unmodified except the one fixture.

**Verification:**
- [ ] `npx vitest run src/types/globalAudio.test.ts src/data/transmissionPresets.test.ts src/engine/AudioEngine.test.ts`
- [ ] `npm run build:types`, `npm run lint`.

**Dependencies:** None. **Files:** `src/types/globalAudio.ts`, `.test.ts`, `src/data/transmissionPresets.ts`,
`src/utils/globalAudioSeed.ts` (placeholder literal only), `src/engine/AudioEngine.test.ts`. **Scope:** M.

### Task 2: Seed field keys, both range tables, the grid rows

**Description:** `GlobalAudioSeedFieldKey` gains `distortion.amount`, `distortion.wet`, `chebyshev.order`,
`chebyshev.wet`, `bitCrusher.bits`, `bitCrusher.wet`. `GLOBAL_AUDIO_SEED_RANGES` gains the full ranges
(spec assumption 6: amount 0–1 step 0.01 linear; order 1–8 step 1 linear; bits 1–16 step 1 linear; wet
0–1 step 0.01 linear). `GLOBAL_AUDIO_LOADING_RANGES` gains the lit bands (assumption 7: amount 0.1–0.35,
distortion wet 0.25–0.5, order 2–5, chebyshev wet 0.15–0.4, bits 6–10, bitCrusher wet 0.15–0.4).
`docs/reference/GLOBAL_CHAIN_GRID.md` gains six table rows in chain order after the HPF rows (Effect,
Setter, Param with the Tone name beside `amount`, both ranges, placeholder labels, `SLIDER`, `–`, `–`),
because the two range tests parse that column.

**Acceptance criteria:**
- [ ] Both range tests pass against the edited grid, field by field, with the six new keys.
- [ ] Every loading band sits inside its full range; every integer field has `step: 1`.
- [ ] `lfoEngine`'s `resolveLfoOutputRange` still compiles against the widened key (no colour target exists;
  the key union is wider than the target union, as it already is for `limiter.threshold`).

**Verification:**
- [ ] `npx vitest run src/data/globalAudioSeedRanges.test.ts src/data/globalAudioLoadingRanges.test.ts`

**Dependencies:** T1. **Files:** `src/data/globalAudioSeedRanges.ts`, `.test.ts`,
`src/data/globalAudioLoadingRanges.ts`, `.test.ts`, `docs/reference/GLOBAL_CHAIN_GRID.md`. **Scope:** M.

### Task 3: Three nodes in the chain slot, three setters

**Description:** `globalFx.ts` per spec §1.3: `_globalDistortion`, `_globalChebyshev`, `_globalBitCrusher`
constructed in `buildGlobalFxChain` behind `getToneCtor`, the crusher in a `try` that leaves it `null`
on throw; `oversample: 'none'` explicit on both shapers; the three added to `disconnectAllFxNodes`'
list and to `chainNodes` between `_globalHPF` and `_globalCompressor`; `setGlobalDistortion`,
`setGlobalChebyshev`, `setGlobalBitCrusher` (null-guarded, try/caught; `amount` → `node.distortion`,
`order` → `node.order = Math.round(v)`, `wet` and `bits` → `rampOrSet(…, COLOUR_RAMP_SECONDS = 0.05)`),
exported through `AudioEngine`. Both inline Tone mocks gain the three constructors.

**Acceptance criteria:**
- [ ] `buildGlobalFxChain` constructs exactly one of each (constructor-call count), with `wet: 0`,
  `oversample: 'none'` on Distortion and Chebyshev, `bits: 8` on the crusher.
- [ ] Natural and Controlled: the dry chain is `EQ3 → LPF → HPF → Distortion → Chebyshev → BitCrusher →
  Compressor → Limiter → masterGain` (the existing connection-order tests extended), the returns still join
  at the Compressor or the Limiter, and no colour node connects to a room.
- [ ] With `BitCrusher` absent from the mock, or throwing, the chain wires `HPF → Distortion → Chebyshev →
  Compressor` and nothing warns beyond the existing `devWarn`. **Mutation:** drop the `try` and the throwing
  case fails.
- [ ] Each setter writes only the fields given, no-ops without its node, never throws; `order` 3.6 → 4;
  `wet` goes through `rampTo` when present and `.value` when not.
- [ ] A flip of Decay Mode disconnects and reconnects the three exactly once (the "every connection exactly
  once per flip" test extended).

**Verification:**
- [ ] `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/AudioEngine.test.ts`
- [ ] Mutation harness on the setters and the chain array.

**Dependencies:** T1. **Files:** `src/engine/audioEngine/globalFx.ts`, `.test.ts`, `src/engine/AudioEngine.ts`
(export block), `src/engine/AudioEngine.test.ts` (mock). **Scope:** M.

### Task 4: The store rail

**Description:** `audioStore.ts`: `GLOBAL_SETTER` gains the three setters; `applyGlobalAudioToEngine`
pushes the three blocks after the filters. `EffectKey` follows the type. Nothing else in the store changes.

**Acceptance criteria:**
- [ ] `setGlobalAudio('bitCrusher', { wet: 0.4 })` updates state and calls `AudioEngine.setGlobalBitCrusher`
  with exactly `{ wet: 0.4 }`; likewise the other two.
- [ ] `applyGlobalAudioToEngine(settings, bpm)` calls all three setters with the full block. **Mutation:**
  remove one call and its test goes red.
- [ ] Existing store tests pass unmodified.

**Verification:**
- [ ] `npx vitest run src/stores/audioStore.test.ts`

**Dependencies:** T3. **Files:** `src/stores/audioStore.ts`, `.test.ts`. **Scope:** S.

### Task 5: The character draw, the six value draws, the oracles by hand, calibration

**Description:** `globalAudioSeed.ts` per spec §1.2: `COLOUR_CHARACTERS`, `COLOUR_CHARACTER_NODES`,
`COLOUR_CHARACTER_BANDS` (cumulative edges, nominal 0.25 / 0.45 / 0.65 / 0.85 / 0.90 / 0.95 / 1),
`pickColourCharacter(t)`; one `getSeededVal(noiseMap, 'globalAudio.colour.character', 0, 0, 1)`; six
`sampleField` draws; an unlit node's `wet` forced to `0`. T1's placeholder literal is replaced. The two
seed oracles gain the three blocks **by hand**, with a comment block recording the amendment in the Sends
one's style; no other value changes and the oracle is not re-recorded.

**Acceptance criteria:**
- [ ] Both oracles pass with the three new blocks added and every pre-existing value byte-identical
  (`toStrictEqual` proves it).
- [ ] Determinism: the same style twice gives the same character and values; two styles differ.
- [ ] Every seed: `order` and `bits` integers in their full ranges; a lit node's `wet` inside its loading
  band; an unlit node's `wet` exactly `0`; its shape value still inside its band.
- [ ] **Calibration** over 3 000 Attenuation Styles: realised shares within ±3 points of the targets
  (clean 25, each single 20, each pair 5), and the three-node combination never. The band edges are tuned
  until this passes and the edges used are recorded in the constant's doc comment with the measured
  shares. **Mutation:** swap two band edges and the test goes red.
- [ ] `getSeededVal` is called with exactly seven new keys and no existing key is renamed (a source-scan
  assertion on the key strings, or a spy count).

**Verification:**
- [ ] `npx vitest run src/utils/globalAudioSeed.test.ts`
- [ ] Mutation harness on `pickColourCharacter` and the unlit-wet rule.

**Dependencies:** T2, T4. **Files:** `src/utils/globalAudioSeed.ts`, `.test.ts`. **Scope:** S.

### Checkpoint A: Data and engine
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Proves: the three nodes sit in the slot in both Decay Modes (T3); the store reaches them (T4); a fresh
  world draws one character and its values (T5); old presets and fixtures still load (T1).
- [ ] **Manual (Crawford, `npm run dev`):** cycle a few seeds (the HUD's first line shows the seed): some
  worlds are clean, some a little driven, folded or crushed; nothing clicks on power-on or a Decay flip.
  There is no UI yet — this is a listen, not a tuning pass; T14 tunes.
- [ ] Reviewed with Crawford before Phase 2.

---

## Phase 2: The Colour tab (one vertical slice)

### Task 6: The `colour` trait

**Description:** `Trait` gains `'colour'`; `TRAIT_IDS` 8; `TRAIT_COLORS.colour = [ACCENT_COLORS.red,
ACCENT_COLORS.tangerine]` (spec assumption 9 — if Crawford says reuse `output`, this task is skipped and
T8/T9 map to `'output'`). The compiler finds every `Record<Trait, …>`.

**Acceptance criteria:**
- [ ] `traits.test.ts`: exactly 8 ids, no duplicates. `traitColors.test.ts`: the new pair, both hex strings
  from `ACCENT_COLORS`, and `getTraitColorStyle('colour')` sets the four custom properties.
- [ ] Existing tests pass unmodified apart from the count.

**Verification:**
- [ ] `npx vitest run src/types/traits.test.ts src/utils/traitColors.test.ts`

**Dependencies:** None (T1 for the branch). **Files:** `src/types/traits.ts`, `.test.ts`,
`src/utils/traitColors.ts`, `.test.ts`. **Scope:** S.

### Task 7: Content entries

**Description:** `src/content/copy/fleet.ts` gains `fleet.colour` (human "Colour", lore placeholder, an
`intro` in both voices with an HTML human description covering the three effects in the `fleet.eqFilters`
shape), `fleet.distortion` / `fleet.chebyshev` / `fleet.bitCrusher` (heading entries), and the six
parameter entries with `unit` where one applies (`bits`) and a `help.human` each, placeholders per spec
assumption 14. Nothing in a component.

**Acceptance criteria:**
- [ ] `content.test.ts` passes (shape, no orphan keys, descriptions present where the help popover needs them).
- [ ] `labels('fleet.bitCrusher.mix')` and `introProps('fleet.colour')` return the new entries.

**Verification:**
- [ ] `npx vitest run src/content`

**Dependencies:** None. **Files:** `src/content/copy/fleet.ts`, `src/content/content.test.ts` (if it lists
keys). **Scope:** S.

### Task 8: Rig blocks, effect key, trait map

**Description:** `AudioRigEffectKey` gains the three keys; `AUDIO_RIG_CONFIG` gains three blocks after
`filterHPF` and before `compressor` (Drive 0–1 step 0.01 + Mix; Harmonics 1–8 step 1 + Mix; Bit Crush
1–16 step 1 + Mix; no `lfoTarget`); `AUDIO_RIG_EFFECT_TRAIT` maps all three to `'colour'`.
`audioRigConfig.test.ts`'s `EFFECT_KEYS` grows to ten in grid order. `AudioRigEffectPanel` renders them
unchanged (it switches on `isFilterBlock` / `isDelay` / `compressor` only).

**Acceptance criteria:**
- [ ] Ten blocks in grid order; each colour block has exactly two params with the spec's ids, types, ranges
  and steps; none carries `lfoTarget`.
- [ ] Rendering `<AudioRigEffectPanel effectKey="bitCrusher" />` shows two sliders with the content labels,
  the trait's accent on the panel, and a slider move calls `setGlobalAudio('bitCrusher', { wet })`.
- [ ] `SelectedFleetParamsEffect` accepts the three keys (type-level; no code change).

**Verification:**
- [ ] `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console/AudioRigDrawer.test.tsx`

**Dependencies:** T1, T6 (or the reuse decision), T7. **Files:** `src/data/audioRigConfig.ts`, `.test.ts`,
`src/components/panels/screen/console/AudioRigDrawer.tsx`, `.test.tsx`. **Scope:** M.

### Task 9: The Colour section tab

**Description:** `FleetParamsGroup` gains `'colour'` between `'timeSpace'` and `'output'` (`uiStore.ts`);
`FLEET_PARAMS_SUBSECTIONS.colour = [distortion, chebyshev, bitCrusher]` and
`FLEET_PARAMS_GROUP_CONTENT.colour = 'fleet.colour'` (`navActions.ts`); `SECTIONS` gains `['colour',
'colour']` and `SUB_TABBED` gains it (`FleetParamsScreen.tsx`). `DEFAULT_FLEET_PARAMS_SECTION` stays
`'lfoBank'`. The nav tree and breadcrumb follow the two maps.

**Acceptance criteria:**
- [ ] The section row is six groups in order, each trigger in its trait colour (the existing test, with
  Colour added at index 4).
- [ ] Colour's sub-row is the three effects in order; picking one renders its panel; the breadcrumb reads
  "Fleet Params › Colour › Bit Crush".
- [ ] The nav panel lists Colour under Fleet Params with its three leaves, and `setFleetParamsSection('colour')`
  clears the sub-tab like every other group.
- [ ] Existing nav and screen tests pass unmodified apart from the group count.

**Verification:**
- [ ] `npx vitest run src/stores/uiStore.test.ts src/components/panels/screen/nav/navActions.test.ts src/components/panels/screen/screens/FleetParamsScreen.test.tsx src/components/panels/screen/nav/NavBreadcrumb.test.tsx`

**Dependencies:** T4, T6, T8. **Files:** `src/stores/uiStore.ts`, `.test.ts`,
`src/components/panels/screen/nav/navActions.ts`, `.test.ts`,
`src/components/panels/screen/screens/FleetParamsScreen.tsx`, `.test.tsx`. **Scope:** M.

### Checkpoint B: The tab, end to end
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] **Manual (Crawford):** Fleet Params shows Colour between Time & Space and Output in its own colour;
  each of the three panels has two sliders with a "?"; dragging Mix from 0 to full on each node is audible
  with no click; Harmonics steps through 1–8; Bit Crush through 1–16; a Decay flip keeps the colour; the
  phone shell fits the sixth tab.
- [ ] Reviewed with Crawford before Phase 3.

---

## Phase 3: Persistence

### Task 10: Old payloads load with defaults

**Description:** `applySessionPayload` (`sessionDiff.ts`) and `fromCompactSessionPayload`
(`sessionShareUtils.ts`) pass `globalAudio` through `withGlobalAudioDefaults` before anything reads it.
No encoding change, `version` stays 2, `isValidCompactSessionPayload` untouched.

**Acceptance criteria:**
- [ ] A version-2 payload whose `globalAudio` lacks the three blocks restores with them at the defaults and
  `applyGlobalAudioToEngine` receives full blocks (spy). The same through the share decoder, using the
  50.2 baseline payload string from `scratchy-audio-phones.md` as the fixture.
- [ ] A payload that carries them round-trips byte-for-byte through save → diff → restore and through
  encode → decode.
- [ ] **Mutation:** remove the call in either place and its test goes red.

**Verification:**
- [ ] `npx vitest run src/utils/sessionDiff.test.ts src/utils/sessionShareUtils.test.ts`

**Dependencies:** T1. **Files:** `src/utils/sessionDiff.ts`, `.test.ts`, `src/utils/sessionShareUtils.ts`,
`.test.ts`. **Scope:** S.

### Checkpoint C: The whole feature, automated
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] **Manual (Crawford):** set a loud colour, save, reload, share the link into a fresh tab: it comes back;
  paste the old baseline `?session=` link: it loads clean.
- [ ] Reviewed with Crawford before Phase 4.

---

## Phase 4: Guard, gate, listen

### Task 11: The docs/symbol guard test

**Description:** `src/docs/globalColourDocs.test.ts` in the `robotSendsDocs.test.ts` shape: (a) no file
under `src/components/robot/gem` or `RobotBody.tsx` reads `distortion`, `chebyshev` or `bitCrusher`
(comment-stripped scan); (b) the named symbols are declared where the spec says (`DistortionSettings`,
`withGlobalAudioDefaults`, the six seed keys, `COLOUR_CHARACTER_BANDS`, `_globalBitCrusher`,
`setGlobalBitCrusher`, `AUDIO_RIG_EFFECT_TRAIT.bitCrusher`, `'colour'` in `FleetParamsGroup`);
(c) the living docs (`AUDIO_SYSTEM.md`, `GLOBAL_CHAIN_GRID.md`, `SESSION_STORAGE.md`) name the six fields
— **known red until T15**, stated in the plan status line.

**Acceptance criteria:**
- [ ] (a) and (b) green; (c) red for exactly the docs cases, listed by name.
- [ ] A deliberate gem read (a temporary import in a scratch copy) turns (a) red.

**Verification:**
- [ ] `npx vitest run src/docs/globalColourDocs.test.ts`

**Dependencies:** Checkpoint C. **Files:** `src/docs/globalColourDocs.test.ts`. **Scope:** S.

### Task 12: Phone gate — **STOP for Crawford**

**Description:** Spec §5. Against T0's baseline, same world, same lengths, on this branch: (a) the seeded
character; (b) BitCrusher alone at full Mix, 4 bits; (c) all three at full Mix. Each at **Full 3:00** and
**Standard 3:00** with the HUD `underruns` recorded, plus `npm run perf` before and after on the desktop.
Everything into `scratchy-audio-phones.md` as counts.

**Acceptance criteria:**
- [ ] Full: 0 underruns in every run; Standard: no more than T0's count.
- [ ] `npm run perf`: no long-task regression against `PERFORMANCE.md`'s table.
- [ ] Any rise → T13b, then this task again; BitCrusher withdrawn if it still fails behind the tier.

**Verification:** Crawford's runs; numbers written by whoever runs them.

**Dependencies:** T0, Checkpoint C. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** XS (device).

### Task 13b (conditional): `LOAD_COLOUR_MIN`

**Description:** Only if T12 rose. Spec assumption 12: `LOAD_COLOUR_MIN` in `constants/index.ts` (placeholder
0.8), `colourEnabled` on `EffectsLoadLimits` from `effectsLoadToLimits`, `globalFx.setColourEnabled(enabled)`
holding the crusher's `wet` at 0 while off and restoring the stored value when on (the two shapers stay),
`audioBudgetSystem.applyLfoTiers` calling it, a `colour` word on the HUD tier line, and the BitCrusher Mix
slider greyed with the existing held-off note while `audioStore.colourHeldOff`.

**Acceptance criteria:**
- [ ] `effectsLoadToLimits` tests extended (Full on, Light off, the threshold edge); `describeLimits` names it.
- [ ] Suspend never touches stored state; restore is exact (the LFO-tier tests' shape).
- [ ] The slider greys and un-greys with the flag.

**Verification:**
- [ ] `npx vitest run src/utils/audioBudget.test.ts src/systems/audioBudgetSystem.test.ts src/engine/audioEngine/globalFx.test.ts src/components/debug/hudLines.test.ts`

**Dependencies:** T12 (a rise). **Files:** `src/constants/index.ts`, `src/utils/audioBudget.ts`,
`src/systems/audioBudgetSystem.ts`, `src/engine/audioEngine/globalFx.ts`, `src/components/debug/hudLines.ts`,
plus the slider's panel. **Scope:** M (L if the slider greying needs a new prop path — split then).

### Task 14: Crawford's listen and band tuning — **STOP**

**Description:** Spec §5's manual list: a clean, a drive, a fold, a crush and a two-node seed; each node 0
to full by hand; Chebyshev 1–8 at mid Mix for harshness (cap drops if so); Decay flips; save / reload /
share; the old link loads clean; keyboard and every "?". Then the tuning: Crawford sets the character
shares and the lit bands; T5's calibration targets and T2's loading rows (and grid rows) move with them in
this task's commit.

**Acceptance criteria:**
- [ ] Every line signed off or recorded as not checked.
- [ ] The final shares and bands are in the constants' doc comments and the calibration test passes at them.

**Verification:** Crawford's listen; `npx vitest run src/utils/globalAudioSeed.test.ts
src/data/globalAudioLoadingRanges.test.ts` after any tuning.

**Dependencies:** T12. **Files:** `src/utils/globalAudioSeed.ts`, `.test.ts`, `src/data/globalAudioLoadingRanges.ts`,
`docs/reference/GLOBAL_CHAIN_GRID.md`. **Scope:** S (tuning).

---

## Phase 5: Docs

### Task 15: Docs

**Description:** `AUDIO_SYSTEM.md` (Signal Graph line and a Colour paragraph: the slot, the character draw,
the worklet note, no LFO/swell targets); `GLOBAL_CHAIN_GRID.md` (chain-order line, a Colour note beside
the Sends one; the rows landed in T2 / T14); `SESSION_STORAGE.md` (absent colour keys load as defaults);
`ideas/themes.md` (one sentence: a theme may swap the character bands and lit bands); `roadmap.md` (50.3
status + as-built deltas; 50.4 "ships both"); the intent banner; the spec's §7 answers. Turns T11's (c)
green.

**Acceptance criteria:**
- [ ] `npx vitest run src/docs/globalColourDocs.test.ts` fully green.
- [ ] Every doc edit keeps the file's own line endings (see the Sends plan's EOL note).

**Verification:**
- [ ] `npm test` green; `git diff --stat` shows only docs.

**Dependencies:** T14. **Files:** the docs above. **Scope:** M (docs only).

### Checkpoint: Complete
- [ ] All acceptance criteria met; `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Phone counts and the listen recorded, not paraphrased.
- [ ] Crawford opens the PR from `feature/palette-colour`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| BitCrusher's worklet costs the Pixel underruns | High | T0 baseline, T12 isolates it (run b), T13b holds its wet at 0 on lighter loads, withdrawal is the last step |
| Worklet fails to construct in some browser | Med | Guarded `try`, chain wires without it (T3 test) |
| The character draw's bell-curved noise defeats nominal edges | Med | T5 calibrates by measurement over 3 000 seeds, not by fraction |
| Red/tangerine reads too hot (the Seed precedent) | Low | T6 is swappable for `output` reuse; Checkpoint B looks at it |
| Uncoloured reverb tails sound wrong | Med | Listening item at Checkpoint A and T14; a second join is a 50.2 change and would be its own spec |
| Six tabs do not fit the phone shell | Low | Checkpoint B's phone look; the tab row already scrolls |
| Grid parse tests break on a row typo | Low | T2 runs both parsers; rows copied from the loading table |

## Open Questions
- Spec §7: trait choice (T6), shares and bands (T5/T14), Chebyshev cap (T14), presets (T1 defaults clean),
  lore words (T7 placeholders, T15 copy pass).
