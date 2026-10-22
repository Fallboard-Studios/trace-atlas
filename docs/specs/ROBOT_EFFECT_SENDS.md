# Phase Spec: Robot Effect Sends — Grit, Shimmer and Double

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Desktop audio-thread check (§5): `npm run perf:audio` against a served build, plus the real-time crossing probe
> - Phone gate (§5): the `?debug` HUD on the Pixel 8, the same `?session=` world, Standard and Full, A/B against the branch base

Source of intent: [docs/intent/robot-effect-sends.md](../intent/robot-effect-sends.md) (confirmed 2026-10-21 via
`interview-me`, six questions, five guesses confirmed, one scope item deferred: per-robot delay time). Proposed roadmap
slot **50.7**, the seventh sub-phase of the Audio Palette series, after Global Pedals (50.6, merged as PR #565). Extends
Robot Sends (50.2, [ROBOT_SENDS.md](ROBOT_SENDS.md)): the same send/return model applied to three effects that are
dry-chain bypass cells today. Grit, Shimmer and Double are working titles; the lore pass settles the words. **The number
retune the intent puts first is its own task and listen, before this phase's T1** (§6): its plan is
[docs/tasks/CLASSIC_BAND_RETUNE.md](../tasks/CLASSIC_BAND_RETUNE.md) (written 2026-10-21, sixteen rows). The bands in
this spec were first written against the chain at `0b087fec`. **Amended 2026-10-21 (plan T0) against the retune's merge,
`2dc5b4a2` (PR #567):** assumption 6 and §1.1 carry the merged Reverb band, 0.1–0.6 (the retune's row 15; Delay is
unchanged at 0–0.3); the room depths start from the merged colour Mix, **one shared band of 0.1–0.2 under
`COLOUR_LOAD_MIX_MAX` 0.25** (`src/data/globalAudioLoadingRanges.ts:33`, `:80`–`:84`), not the retune's Decision 1 B
ceiling of 0.35, which its Checkpoint B listen reversed ("much more subtle", `277eb4a9`). The Chorus and Shifter Mixes
merged at 0.3–0.4 and 0.25–0.35 (`:120`, `:132`); this phase makes both unseeded Returns at 1 (assumption 4).

**Amended 2026-10-21 (after T17): the Colour room has no master Return** (Crawford, choosing option 5 of five drawer
layouts; the Room sub-tab T17 built at `b1a0151c` is removed). Each colour Mix already is a wet-only level on its own
branch (`branchGains`), so each colour effect behaves like the Reverb or the Delay: one level, as heard from every
probe, 0 silences it. The one difference is that one send (Grit) feeds three of them. The room keeps the Return of 1 it
is built with; the settings block that drove it, its seed-range key, its setter, its drawer block and its two content
keys are gone. The Colour section keeps its three sub-tabs and opens on Distortion. Assumptions 3, 4, 5, 13, 14 and 15,
§1.1, §1.2, §1.6–§1.8, §2, §3 and §5 below are re-stated to match; the engine machinery (`setRoomReturn`,
`returnLevel`, the liveness rule) is unchanged and still serves the Shimmer and Double rooms.

Survey basis (2026-10-21, against `main` at `0b087fec`; every citation below was read, not recalled):

- **The chain today.** `buildGlobalFxChain` (`src/engine/audioEngine/globalFx.ts:169`) builds the Reverb and Delay rooms
  at `wet: 1` (`:198–211`), the ten effects pinned fully wet (`:225–324`), then `clearCells()` and one `buildCell` per
  effect (`:329–345`), then the two return gains and the master (`:364–380`), then `wireGlobalFxChain(false)`.
  `wireGlobalFxChain` (`:459`) builds the dry chain from spans — `[_entryCut, EQ, LPF, HPF, _filterCut,
  cellSpan('distortion'), cellSpan('chebyshev'), cellSpan('bitCrusher'), cellSpan('autoWah'), cellSpan('phaser'),
  cellSpan('chorus'), cellSpan('tremolo'), cellSpan('vibrato'), cellSpan('frequencyShifter'), Compressor,
  cellSpan('stereoWidener'), Limiter]` (`:462–480`) — calls `wireCells()` (`:493`), and joins both rooms' returns at
  `join = (controlledDecay ? getCell('stereoWidener')?.in : _globalCompressor) ?? _globalLimiter ?? _globalCompressor`
  (`:513`). `disconnectAllFxNodes` (`:391`) is a literal node list with `cellNodes(key)` spread in, walked downstream
  first. `getGlobalReverbRoom` / `getGlobalDelayRoom` (`:541` / `:546`) hand the rooms to `reserveVoice`.
- **The cell** (`src/engine/audioEngine/bypassCell.ts`, Dark-Effect Bypass §8.0). `BYPASS_KEYS` is the ten effect keys;
  `Cell = { in, dry, wet, cut, effect, connected, mix, darken }`; `cellGains(w)` is Tone's CrossFade law, `widthCellGains`
  the linear one; `buildCell(key, effect, GainCtor, DelayCtor)` builds every cell dark; `wireCells()` makes `in → dry →
  cut`, `wet → cut` and, while `connected`, `in → effect → wet`; `writeCellMix(key, mix)` is the one crossing (light:
  cancel a pending darken, `connectEffect` while the wet gain is 0, `rampCell`; darken: ramp to dry, arm one
  `Tone.getContext().setTimeout` at `lookAhead + COLOUR_RAMP_SECONDS + BYPASS_DISCONNECT_MARGIN_SECONDS`, disconnect at
  the fire if still dark); the re-sent rule is `w === cell.mix && (cell.darken !== null || w > 0 === cell.connected)`;
  `duckCell` / `needsDuck` carry the Spread and Stages changes; `getConnectedEffectCount()` feeds the HUD's
  ` · fx in n/10` (`src/components/debug/hudLines.ts:48`, denominator `BYPASS_KEYS.length`). Every cell ends in its own
  zero-delay cut (`CHAIN_CUT_OPTIONS`), which bounds every cycle search to one cell (`chainCycleSearch.test.ts`).
- **The setters.** `setGlobalDistortion` / `setGlobalChebyshev` / `setGlobalBitCrusher` (`globalFx.ts:776` / `:789` /
  `:802`) write the shape value and `writeCellMix(key, wet)`; `setGlobalChorus` (`:1022`) ramps `frequency` and
  `feedback`, `rampChorusSweep`s `delayTime` / `depth`, ducks `spread` through `writeSpread`, and ends in
  `writeCellMix('chorus', wet)`; `setGlobalFrequencyShifter` (`:1086`) ramps `frequency` and `writeCellMix`s. `setGlobalReverb`
  / `setGlobalDelay` (`:724` / `:741`) write `wet` straight to the return gain's `.value`. `setGlobalVibrato` (`:1065`) is
  untouched by this phase.
- **The robot bus.** `reserveVoice` (`src/engine/AudioEngine.ts`) builds two send gains at 0 (`:781–782`), wires
  `busFilter → send → room` for each room that exists (`:804–815`), and stores `{ composite, panner, busGain, busFilter,
  reverbSend, delaySend }` (`:819`, the `VoiceEntry` of `audioEngine/voiceEntry.ts:11–20`, torn down by
  `disposeVoiceNodes`). `updateRobotSends(robotId, { reverb?, delay? })` (`:1098`) clamps through `clampSend`
  (`src/utils/clampSend.ts`) and ramps over `SEND_RAMP_SECONDS`. Priming sites: `loadInstruments`' post-load pass (`:316`),
  `reReserveVoice` (`:954`), `spawnSystem.ts`' two reserve sites, and `sessionDiff.ts`' restore (`:644–649`, gated on the diff
  carrying a send). `releaseVoice` (`:860`) disposes the entry and clears the pan maps. `robotSendsDocs.test.ts:206` is
  the source-scan that every `reserveVoice(` caller also calls `updateRobotSends(`.
- **Seeding today.** `generateRobotSends` (`src/systems/spawnSystem.ts:556`) reads `GLOBAL_AUDIO_LOADING_RANGES['reverb.wet']`
  (0.1–0.4, `src/data/globalAudioLoadingRanges.ts:47`) and `['delay.wet']` (0–0.3, `:43`), draws `robot.send.reverb`,
  `robot.send.delay` and `robot.send.delay.quiet` with `getSeededVal` at `offset = spawnCount`, and composes them through
  `composeSends` (`:542`, the quiet roll under `SEND_DELAY_QUIET_THRESHOLD` 0.25, `src/constants/index.ts:166`) and
  `quantizeSend` (`:536`, the 1 % grid). `generateRobotSendsFallback` (`:568`) mirrors it with `alea`.
  `RobotAudioBaseline` carries both (`:602–603`) and `generateRobotAudioBaseline` (`:619`) draws them outside the copy branch
  (`:629`, `:638`). The loading table is typed `Record<GlobalAudioSeedFieldKey, LoadingRange>` (`:31`), so every seed key
  must have a row, including the two returns it no longer seeds (the comment at `:18–20` says so).
- **The global seeder** (`src/utils/globalAudioSeed.ts`). `COLOUR_CHARACTER_BANDS` (`:118`) and `pickColourCharacter`
  light at most one colour node; the three colour `wet`s are read on every style and forced 0 when dark (`:222–225`,
  `:302–313`). `PEDAL_LIT_EDGE` (`:140`) carries six edges; `MOTION_PEDALS` (`:152`) is `['chorus', 'tremolo', 'vibrato',
  'frequencyShifter']`; the sequential cap loop (`:236–242`) counts the AutoWah and Phaser first and stops at
  `MAX_LIT_PEDALS` (`:166`, 2); a sync pair per `SYNCED_RATE_KEYS` block rolls Sync only when lit (`:246–255`,
  `PEDAL_SYNC_ODDS` `:174`); the shifter's sign is its own draw (`:257`); `pedalWet` (`:258`) zeroes a dark pedal's Mix.
  `reverb.wet` / `delay.wet` come from the defaults, not the map (`:293`, `:300`). The oracles in
  `globalAudioSeed.test.ts` are amended by hand, never re-recorded.
- **Settings and ranges.** `ReverbSettings.wet` / `DelaySettings.wet` are documented as return levels
  (`src/types/globalAudio.ts:13–15`, `:30–31`); `DistortionSettings.wet` says "a true wet/dry mix of this node (it sits in the
  dry chain, not on a send)" (`:73–74`); `ChorusSettings.wet` and `FrequencyShifterSettings.wet` are slider positions the
  node gets squared (`:153–154`, `:190–191`). `GlobalAudioSettings` (`:208`) and `DEFAULT_GLOBAL_AUDIO_SETTINGS` (`:251`,
  `reverb.wet` / `delay.wet` 1, every other `wet` 0). `GlobalAudioSeedFieldKey` (`src/data/globalAudioSeedRanges.ts:27`)
  lists `delay.wet` (`:43`), `reverb.wet` (`:46`), `chorus.wet` (`:71`) and `frequencyShifter.wet` (`:80`), each 0–1 step
  0.01 (`:108`, `:112`, `:151`, `:160`); the drawer blocks take their slider bounds from the same numbers
  (`src/data/audioRigConfig.ts:133`, `:194`, `:221`, `:233`, `:244`), `clampColour` clamps through them, and
  `sessionDiff.ts` quantises the two rooms' `wet` against them (`:245`, `:251`). `EffectKey` is
  `Exclude<keyof GlobalAudioSettings, 'compressorBeforeDelay'>` (`src/stores/audioStore.ts:60`); `GLOBAL_SETTER` (`:132`)
  and `applyGlobalAudioToEngine` (`:166`) route each block.
- **The per-robot plumbing this mirrors.** `Robot.reverbSend` / `delaySend` (`src/types/Robot.ts:205–207`);
  `CompanyOptionsSnapshot` (`src/types/Company.ts:24–26`); `RobotAudioOverrideDiff` (`src/types/session.ts:45–46`); the diff
  at two decimals (`sessionDiff.ts:325–327`), the restore's in-range check (`:469–473`) and the engine prime (`:644–649`);
  the share codec `rs` / `ds` (`src/utils/sessionShareUtils.ts:120`, `:264–265`, `:295–296`, `isSendFraction` `:180`); the
  actions `applyReverbSend` / `applyDelaySend` and their `*Value` forms (`src/systems/robotOptionsActions.ts:58–80`);
  `REVERB_SEND_SCHEMA` / `DELAY_SEND_SCHEMA` (`src/data/robotOptionsConfig.ts:137` / `:148`); the two rows in
  `AudioSettingSection.tsx:156–163`; `useCompanyOptions.ts` (`DISABLED_AUDIO_SETTING` `:39–40`, swell flags `:208–209`,
  handlers `:360–375`); `resolveCompanyOptions` (`src/systems/companyOptions.ts:43–44`); `CompanyOptionsSection.tsx:69–74`;
  the swell pool (`src/types/audioSwell.ts:58`, `:66`, 19 ids with the sends last; `src/data/audioSwellRanges.ts:26`;
  `audioSwells.ts` live `:183–184`, read `:196–197`, write `:225–230`); the copy `probe.reverbSend` / `probe.delaySend`
  (`src/content/copy/probe.ts:188–199`, lore placeholders).
- **The drawer.** `FLEET_PARAMS_SUBSECTIONS.colour` is the three colour blocks and `.modulation` the six pedals
  (`src/components/panels/screen/nav/navActions.ts:92–106`); the Width block is a one-slider sub-tab (the precedent for
  a one-row block). `AudioRigEffectKey` (`audioRigConfig.ts:30`). Copy: `fleet.colour` (`src/content/copy/fleet.ts:228`),
  `fleet.distortion.mix` / `fleet.chebyshev.mix` / `fleet.bitCrusher.mix` (`:248` / `:259` / `:271`), `fleet.chorus.mix`
  (`:403`), `fleet.frequencyShifter.mix` (`:455`), `fleet.reverb.amount` / `fleet.delay.amount` (`:202` / `:219`, the
  return-level wording from 50.2).
- **Docs guards that pin the chain.** `globalPedalsDocs.test.ts:153–154` pin the `chainNodes` span list from
  `cellSpan('phaser')` to `nodeSpan(_globalLimiter)` and the `join` line by regex; `globalColourDocs.test.ts:144` pins the
  grid's colour rows "in chain order after the HPF rows"; `robotSendsDocs.test.ts` scans the gem folder, the reserve
  sites and the spec's symbols. `GLOBAL_CHAIN_GRID.md:3` is the chain-order line; `AUDIO_SYSTEM.md:232` the Signal Graph.
- **The draws.** `getSeededVal(noiseMap, dataId, offset, min, max)` is one bell-curved simplex sample;
  `getUniformSeededVal(noiseMap, dataId, offset = 0)` (`src/utils/getSeededVal.ts:71`) hashes three samples into a uniform
  draw and takes an offset, so it serves per-robot rolls at `offset = spawnCount` (the memory rule: rolls and bands that
  must fill use the uniform draw; pre-existing fields keep theirs).
- **Tone 15.1.22.** `Effect.wet` is a CrossFade (`cos` / `sin`), so a Mix below 1 passes a share of the input around
  the effect — which is why a room's effect is pinned at `wet: 1` and the level lives in a Gain (ROBOT_SENDS.md
  assumption 3). The shifter's sine branch is downmixed (GLOBAL_PEDALS.md §8), so a hard-panned voice sent to it leaks
  the other sideband into the far channel; the intent accepts this.

**Assumptions** (each a veto point; the plan's T0 confirms them with Crawford before T1):

1. **Field names are the intent's.** `Robot.gritSend`, `Robot.shimmerSend`, `Robot.doubleSend`; the engine's room keys
   are `'grit' | 'shimmer' | 'double'`; `updateRobotSends` takes `{ reverb?, delay?, grit?, shimmer?, double? }`; the
   share codes are `gr`, `sm`, `db` (`ds` is the Delay send's). The lore pass changes words in `src/content/` only.
   (The draft also named a Colour room settings block and sub-tab here; both were removed by the amendment above.) **Answered 2026-10-21: Crawford, "intent names are fine"** (the draft
   proposed naming the fields for the room, `colourSend` / `shifterSend` / `chorusSend`).
2. **A room is the existing cell machinery with the dry branch removed, and the crossing unit is the branch.** A
   `Room` is three fixed nodes — `in` (Gain, every robot's send for this room connects here for the voice's life), `cut`
   (zero-delay Delay) and `return` (Gain, the global slider) — and one or more **branches**, each a `Cell` with `dry:
   null`: `in → effect → wet → cut`, the two effect edges present only while lit, `wet` a wet-only gain (`branchGains(w)
   = { dry: 0, wet: w }`; no cos / sin, since a room has no dry path to keep equal power against). `writeCellMix` and the
   darken timer are the same code; `wireCells` makes no dry edge for a branch. The Colour room has three branches in
   **parallel** (`distortion`, `chebyshev`, `bitCrusher`, each with its own Mix as its depth), the Shimmer and Double
   rooms one branch each, pinned at Mix 1. *Why parallel, not the intent's series:* inside a send/return room the chain
   cell's crossfade law is wrong — a dark or lightly lit node's `dry` path would carry the robot's **dry** signal into
   the return, so a Grit send would mostly make a robot louder; the fix for series (a second law, wet-only when lit,
   dry-pass when dark) costs more than parallel buys, and with the seeder lighting at most one colour node the two are
   identical in every fresh world. By hand, two lit nodes sum rather than stack. **Veto point.** **Answered 2026-10-21
   (plan T0): Crawford, parallel.**
3. **Room liveness has two drivers: fed and returned.** A branch is wanted lit when `room.fed && room.returnLevel > 0
   && branchMix > 0`. `fed` is true while at least one **reserved** robot's send into the room is above 0 (the engine
   keeps a set of feeding robot ids per room and tells the room when the set becomes empty or non-empty);
   `returnLevel` is the last Return written. Either crossing 0 re-targets every branch through the one crossing protocol
   (a lighting connects while the branch's `wet` is 0, then ramps; a darkening ramps to 0, arms the one timer,
   disconnects). A reserved robot that is silent (standing by, or between notes) with a send above 0 keeps its room
   lit — today's rule for the Reverb and Delay rooms, recorded in §7. *Alternative:* sends alone drive the crossing and a
   Return of 0 merely silences a lit room. **Answered 2026-10-21 (plan T0): Crawford, fed AND Return > 0.** Since the
   amendment the Colour room's Return is fixed at 1, so for it the rule reads fed AND that branch's Mix > 0.
4. **The moved Mixes become Returns; the Colour room has none.** `ChorusSettings.wet` and
   `FrequencyShifterSettings.wet` keep their names and ranges, default `1`, are not seeded, and drive
   `room.return` (`rampOrSet` over `COLOUR_RAMP_SECONDS`, unlike the Reverb and Delay returns, which keep their direct
   writes). The Colour room's `return` stays at the 1 `buildRoom` gives it, with no setting; the three colour `wet`s keep
   their meaning (the level of each branch, `colourWetGain` taper, `COLOUR_LOAD_MIX_MAX` ceiling) and their
   character-draw seeding, so each one is its effect's return level. *Superseded:* a Colour room settings block
   as the Colour room's master Return (built in T2/T4, removed by the amendment above).
5. **The loading table loses its return rows by type.** `GLOBAL_AUDIO_LOADING_RANGES` becomes
   `Record<LoadingRangeKey, LoadingRange>` with `LoadingRangeKey = Exclude<GlobalAudioSeedFieldKey, ReturnFieldKey>` and
   `RETURN_FIELD_KEYS = ['reverb.wet', 'delay.wet', 'chorus.wet', 'frequencyShifter.wet']`;
   `sampleField` takes a `LoadingRangeKey`, so a return can never be seeded, by type. The intent said the keys leave
   `GlobalAudioSeedFieldKey`; they cannot, because the drawer, the clamp and the quantiser read the full range by those
   keys (survey above) — this is the correction.
6. **One per-robot send band table, in `src/data/robotSendLoadingRanges.ts`.** `ROBOT_SEND_FIELDS = ['reverbSend',
   'delaySend', 'gritSend', 'shimmerSend', 'doubleSend']`; `ROBOT_SEND_LOADING_RANGES: Record<RobotSendField, { min,
   max, lit }>` where `lit` is the nominal share of fresh robots that carry the send at all (the rest seed exactly 0).
   Reverb `{ 0.1, 0.6, lit: 1 }` (the retune's row 15, merged at `2dc5b4a2`; it was 0.1–0.4 at `0b087fec`) and Delay
   `{ 0, 0.3, lit: 0.75 }` reproduce today's draws exactly (the Delay's quiet roll
   is `quietRoll < 1 − lit`, which is `< 0.25`, the same bell draw under the same dataId; a parity test pins both to the
   values `main` at `2dc5b4a2` seeds). The three new rows are **placeholders for the listen**: Grit `{ 0.4, 0.8, lit: 0.21 }`, Shimmer
   `{ 0.2, 0.5, lit: 0.16 }`, Double `{ 0.3, 0.6, lit: 0.19 }`. `SEND_DELAY_QUIET_THRESHOLD` is deleted (its value lives
   in the Delay row). A theme overrides this table and nothing else about the sends.
7. **The new rolls and values are uniform draws, per robot, in a fixed order with a one-of-three cap.** For each robot,
   in the order Grit → Shimmer → Double: `getUniformSeededVal(noiseMap, 'robot.send.<room>.lit', spawnCount) < lit` lands
   the send, unless an earlier one of the three already landed; a landed send's value is a uniform draw in its band,
   quantised to the 1 % grid. Every roll and value key is read on every robot, landed or not, so the draw set never
   depends on the outcome. Expected per fresh fleet of twelve at the placeholder edges: Grit 2.5, Shimmer 1.5, Double 1.4
   (each later edge is lifted for the robots the earlier ones took); the calibration test pins the **measured** means and
   records the share of fleets with no Grit at all. Independent per-robot rolls give a binomial spread (some fleets 0,
   some 5); a roster-aware cap (the `priorLaneCounts` precedent) is the follow-up if the listen wants tighter counts,
   not this phase. Reverb and Delay keep their bell draws and dataIds untouched. **Answered 2026-10-21 (plan T0):
   Crawford, accept as specced (independent rolls, one-of-three cap; a roster-aware count stays the follow-up).**
8. **The sends are drawn unconditionally, outside the copy branch** (as the existing two): one `generateRobotSends`
   returning all five, used by `spawnRobot` and `generateRobotAudioBaseline`, with the `alea` fallback mirrored; a copied
   robot gets its own depths.
9. **Chorus and Shifter leave the lit cap; the cap stays 2 over four.** `PEDAL_LIT_EDGE` loses `chorus` and
   `frequencyShifter`; `MOTION_PEDALS` becomes `['tremolo', 'vibrato']`; `MAX_LIT_PEDALS` stays 2 counting the AutoWah,
   Phaser, Tremolo and Vibrato; the `globalAudio.chorus.lit` and `globalAudio.frequencyShifter.lit` rolls are no longer
   read (each key is its own noise row, so no other draw moves). The Tremolo's and Vibrato's realised shares rise
   (expected 22.2 % and 19.4 %); the calibration test re-pins them. **The Chorus rolls Sync in every world** under
   `PEDAL_SYNC_ODDS`, since a room's rate is heard whenever any robot sends into it; the shifter's shift keeps its
   magnitude-plus-sign draw in every world. **Answered 2026-10-21 (plan T0): Crawford, accept as specced.**
10. **Seeded as minority traits; the seeded shares are the theme knob.** The three `lit` shares and bands in assumption
    6 are what a theme swaps. Nothing else changes in the global seeder.
11. **Sends tap where the existing two tap** (post-Volume, post-bus-filter, post-pan) and the rooms' returns rejoin where
    Reverb's and Delay's do (`join`), so the Colour, Shimmer and Double returns are compressed under Natural Decay and
    pass Width under Controlled. The dry chain becomes `entryCut → EQ → LPF → HPF → filterCut → AutoWah → Phaser → Tremolo
    → Vibrato → Compressor → Width → Limiter`.
12. **The three sends are robot swell attributes** (`SWELL_ROBOT_ATTRIBUTE_IDS` 19 → 22, listed last), eligible only above
    0, with no ceiling: a rare swell on a Grit send is a roar, which the intent wants.
13. **Old payloads load their numbers as they are; no upgrade path.** A pre-50.7 session or link carries `chorus.wet` and
    `frequencyShifter.wet` as the Mixes they were (0 in most worlds), and restores them as Returns. A payload saved
    between T2 and the amendment may carry a Colour room block; it is ignored on load, never an error. **Answered
    2026-10-21: Crawford — no real saved sessions exist beyond his test ones, "we can write whatever we want still"**;
    the draft proposed resetting the two moved returns to 1 when the Colour room block is absent, and that helper is
    dropped.
14. **UI placement: the Chorus and Shifter blocks stay sub-tabs of Modulation, their Mix row relabelled Return; the
    Colour section keeps its three sub-tabs**, whose Mix rows read as each effect's return level. No new section tab,
    no new primitive. *Alternative:* move the two rooms under Time & Space beside Reverb and Delay — a layout call.
    **Answered 2026-10-21 (plan T0): Crawford, stay put** (with a Colour Room sub-tab for a master Return; **re-answered
    2026-10-21 after T17: Crawford, no master Return at all**, over a section-header Return, a Return row repeated in
    each colour panel, and one Returns panel for all five rooms).
15. **Lore words are placeholders** until the copy pass: `probe.gritSend` { Grit / **Carrier Bleed Send** },
    `probe.shimmerSend` { Shimmer / **Band Slip Send** }, `probe.doubleSend` { Double / **Twin Current Send** }. Keys and
    human words are fixed.
16. **The phone gate has no threshold and no Effects Load gate for sends** (intent): the `?debug` HUD on the Pixel,
    Standard and Full, the same `?session=` world, A/B against the branch base, plus `npm run perf:audio` on the desktop.
    The late-sitting collapse `main` shares (backlog 27) does not fail the gate. A dark room (no feeder, or Return 0)
    must read as today's dark effect does; a lit room's cost is the effect's, priced by 50.6.
17. **Roadmap: a 50.7 entry.** The series header is updated to seven; the retune task gets a line of its own in the
    entry, before the build.

---

## 1. Overview & Claude Explanation

Three of the ten global effects stop being stages the whole fleet passes through and become **rooms** beside the chain,
fed only by per-robot sends: the Colour trio (Distortion, Chebyshev, BitCrusher) as one **Colour room**, the Frequency
Shifter as the **Shimmer room**, the Chorus as the **Double room**. Each room is the existing bypass-cell machinery with
its dry branch removed: a shared `in` every robot's send gain feeds, one branch per effect (the effect pinned fully wet
behind a wet-only gain that carries its depth), a zero-delay cut, and a return gain the global slider drives. A branch
is in the signal path only while some reserved robot sends into the room, the Return is above 0 and the branch's own
Mix is above 0 — the same light / darken crossing the Dark-Effect Bypass built, so every graph edit is silent. Each
robot gets three more send gains tapped off its bus filter, three more `0–100 %` sliders under Delay in the Levels block
on the robot and company screens, three more seeded fields that save, share and bulk-edit exactly as Reverb and Delay
do, and three more swell attributes. A fresh Classic world lands Grit on two or three robots and Shimmer and Double on
one or two each, no robot carrying two of the three; everyone else sits at exactly 0 and the rooms they would feed are
dark. The five send bands move into one table a theme can override. The dry chain shrinks by three stages; the Vibrato
stays an insert. No new effect nodes: the three rooms are the existing nodes moved, plus 36 send gains at twelve robots,
three returns, three cuts and three room inputs.

### 1.1 Data shape

```ts
// src/types/Robot.ts, after delaySend
/** Colour send, 0…1 — how much of this robot's post-Volume signal enters the Colour room (Grit).
 *  Seeded at spawn (ROBOT_SEND_LOADING_RANGES, §1.2); the Grit slider edits it. 0 = this probe is never coloured. */
gritSend: number;
/** Shimmer: the Frequency Shifter room. */
shimmerSend: number;
/** Double: the Chorus room. */
doubleSend: number;

// src/types/Company.ts
export interface CompanyOptionsSnapshot { /* … */ gritSend?: number; shimmerSend?: number; doubleSend?: number; }

// src/types/session.ts
export interface RobotAudioOverrideDiff { /* … */ gritSend?: number; shimmerSend?: number; doubleSend?: number; }

// src/systems/spawnSystem.ts
export interface RobotAudioBaseline { /* … */ gritSend: number; shimmerSend: number; doubleSend: number; }

// src/types/globalAudio.ts
// DEFAULT_GLOBAL_AUDIO_SETTINGS: chorus.wet: 1; frequencyShifter.wet: 1. No Colour room block (the amendment above).
// ChorusSettings.wet / FrequencyShifterSettings.wet doc comments: "the room's RETURN level, see ReverbSettings.wet".
// DistortionSettings.wet (and the other two): "0–1, a slider position; the branch's level inside the Colour room, its
// return level as heard from every probe".

// src/data/globalAudioSeedRanges.ts
export const RETURN_FIELD_KEYS = ['reverb.wet', 'delay.wet', 'chorus.wet', 'frequencyShifter.wet'] as const;
export type ReturnFieldKey = (typeof RETURN_FIELD_KEYS)[number];
export type LoadingRangeKey = Exclude<GlobalAudioSeedFieldKey, ReturnFieldKey>;

// src/data/globalAudioLoadingRanges.ts — typed Record<LoadingRangeKey, LoadingRange>; the 'delay.wet' / 'reverb.wet' rows go.

// src/data/robotSendLoadingRanges.ts (NEW)
export const ROBOT_SEND_FIELDS = ['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const;
export type RobotSendField = (typeof ROBOT_SEND_FIELDS)[number];
export interface SendLoadingRange {
  min: number; max: number;
  /** The nominal share of fresh robots that carry this send at all; the rest seed exactly 0. 1 = everyone. */
  lit: number;
}
export const ROBOT_SEND_LOADING_RANGES: Record<RobotSendField, SendLoadingRange> = {
  reverbSend:  { min: 0.1, max: 0.6, lit: 1 },      // the old GLOBAL_AUDIO_LOADING_RANGES['reverb.wet'] row (retune row 15)
  delaySend:   { min: 0,   max: 0.3, lit: 0.75 },   // the old 'delay.wet' row; 1 − lit is the old quiet threshold (0.25)
  gritSend:  { min: 0.4, max: 0.8, lit: 0.21 },   // placeholders, assumption 6; tuned at the listen task (§5)
  shimmerSend: { min: 0.2, max: 0.5, lit: 0.16 },
  doubleSend:  { min: 0.3, max: 0.6, lit: 0.19 },
};
/** The three sends a fresh robot may carry at most one of, in the order they roll (assumption 7). */
export const EXCLUSIVE_SEND_FIELDS = ['gritSend', 'shimmerSend', 'doubleSend'] as const;
```

`SEND_MIN` / `SEND_MAX` / `SEND_DISPLAY_SCALE` / `SEND_STEP_PERCENT` are reused; `SEND_DELAY_QUIET_THRESHOLD` is deleted.
`AudioRigEffectKey` is unchanged (the Colour room has no block of its own). Test fixtures that build a `Robot` by hand
gain the three fields (the compiler finds them).

### 1.2 Seeding — `spawnSystem.ts` and `globalAudioSeed.ts`

```ts
// spawnSystem.ts — one helper for spawnRobot and generateRobotAudioBaseline, outside the copy branch in both
export function generateRobotSends(noiseMap: NoiseFunction2D, offset: number): Record<RobotSendField, number> {
  const band = ROBOT_SEND_LOADING_RANGES;
  // Reverb and Delay: the bell draws and dataIds 50.2 shipped, byte for byte (the parity test).
  const reverbSend = quantizeSend(getSeededVal(noiseMap, 'robot.send.reverb', offset, band.reverbSend.min, band.reverbSend.max));
  const delayQuiet = getSeededVal(noiseMap, 'robot.send.delay.quiet', offset, 0, 1) < 1 - band.delaySend.lit;
  const delaySend = delayQuiet ? 0 : quantizeSend(getSeededVal(noiseMap, 'robot.send.delay', offset, band.delaySend.min, band.delaySend.max));
  // The exclusive three: uniform rolls in a fixed order; every key read, at most one lands (assumption 7).
  const exclusive = { gritSend: 0, shimmerSend: 0, doubleSend: 0 };
  let taken = false;
  for (const field of EXCLUSIVE_SEND_FIELDS) {
    const room = SEND_FIELD_ROOM[field];                                   // 'grit' | 'shimmer' | 'double'
    const lands = getUniformSeededVal(noiseMap, `robot.send.${room}.lit`, offset) < band[field].lit;
    const t = getUniformSeededVal(noiseMap, `robot.send.${room}`, offset);
    if (lands && !taken) {
      exclusive[field] = quantizeSend(band[field].min + t * (band[field].max - band[field].min));
      taken = true;
    }
  }
  return { reverbSend, delaySend, ...exclusive };
}
```

`generateRobotSendsFallback` mirrors it with `alea` keys `send<Name>Lit` and `send<Name>` for Grit, Shimmer and Double
(the draft named them for the colour room; corrected at T18 to the shipped keys). The robot literal spreads all
five; `generateRobotAudioBaseline` returns `{ ...priorBaselines[srcIdx], name, ...sends }` on the copy path, as today.
`localeStore.updateRobot` clamps the three new fields where it clamps the first two.

Global side (`globalAudioSeed.ts`): `PEDAL_LIT_EDGE` becomes `Record<'autoWah' | 'phaser' | MotionPedal, number>` with
`MOTION_PEDALS = ['tremolo', 'vibrato']`; the cap loop runs over the two; `rateLit` becomes `{ phaser: phaserLit, chorus:
true, tremolo, vibrato }` so the Chorus rolls Sync in every world; `chorus.wet` and `frequencyShifter.wet` come from the
defaults (1), and the three colour `wet`s keep the character draw.
`pedalWet` serves the Tremolo and Vibrato only. The two oracles are amended **by hand**: `chorus.wet` and
`frequencyShifter.wet` → 1, and the Chorus's `sync` key added where the existing `syncMode` /
`syncNote` draws now produce one (the value the code gives, recorded with the reason); every other field byte-identical.
`transmissionPresets.ts` sets the two moved `wet`s to 1.

### 1.3 Engine — the rooms (`bypassCell.ts`, `globalFx.ts`)

```text
Dry chain (both Decay Modes):
  robot busFilter ─► entryCut → EQ → LPF → HPF → filterCut → [AutoWah] → [Phaser] → [Tremolo] → [Vibrato] → Compressor → [Width] → Limiter → master

Rooms (each fed only by sends; returns rejoin at `join`: the Compressor's input under Natural, the Width cell's `in` under Controlled):
  busFilter ─► reverbSend  ─► Reverb (wet 1) ──────────────────────────────────────────► reverbReturn ─┐
  busFilter ─► delaySend   ─► Delay  (wet 1) ──────────────────────────────────────────► delayReturn  ─┤
  busFilter ─► gritSend  ─► grit.in ─┬─► [Distortion] ─► wet(mix²) ─┐                                │
                                         ├─► [Chebyshev]  ─► wet(mix²) ─┼─► grit.cut ─► grit.return ─┤─► join
                                         └─► [BitCrusher] ─► wet(mix²) ─┘                                │
  busFilter ─► shimmerSend ─► shimmer.in ──► [FrequencyShifter] ─► wet(1) ─► shimmer.cut ─► shimmer.return ─┤
  busFilter ─► doubleSend  ─► double.in ───► [Chorus] ─────────────► wet(1) ─► double.cut ─► double.return ─┘
  [ ] = the two effect edges exist only while the branch is lit (fed ∧ return > 0 ∧ mix > 0)
```

```ts
// src/engine/audioEngine/bypassCell.ts
export const ROOM_KEYS = ['grit', 'shimmer', 'double'] as const;
export type RoomKey = (typeof ROOM_KEYS)[number];
/** Which bypass keys are branches of which room; the other five BYPASS_KEYS are chain cells. */
export const ROOM_BRANCHES: Record<RoomKey, readonly BypassKey[]> = {
  grit: ['distortion', 'chebyshev', 'bitCrusher'],
  shimmer: ['frequencyShifter'],
  double: ['chorus'],
};
export type Room = {
  in: Tone.Gain;          // every robot's send gain for this room connects here (AudioEngine.reserveVoice)
  cut: Tone.Delay;        // every branch's wet → cut → return; bounds the cycle search to this room
  return: Tone.Gain;      // the global Return slider (Shimmer, Double; the Colour room's stays at 1); → join (wireGlobalFxChain)
  fed: boolean;           // some reserved robot's send into this room is > 0 (setRoomFed)
  returnLevel: number;    // the last Return written (setRoomReturn)
};
/** A branch is a Cell with dry null and room set; `depth` is its own Mix (the law input while the room is live). */
export type Cell = { /* as today */ dry: Tone.Gain | null; room: RoomKey | null; depth: number; };
export function branchGains(w: number): { dry: number; wet: number } { return { dry: 0, wet: w }; }
export function buildRoom(key: RoomKey, GainCtor, DelayCtor): void;                     // in, cut, return; fed false, returnLevel 1
export function buildBranch(key: BypassKey, room: RoomKey, effect, GainCtor): void;     // a Cell sharing the room's in and cut
export function getRoom(key: RoomKey): Room | undefined;
export function roomNodes(key: RoomKey): Array<Tone.ToneAudioNode | null>;             // in, each branch's effect + wet, cut, return
/** The engine's word on whether anyone sends into the room; re-targets every branch (assumption 3). */
export function setRoomFed(key: RoomKey, fed: boolean): void;
/** The Return: ramps room.return over COLOUR_RAMP_SECONDS and re-targets the branches when it crosses 0. */
export function setRoomReturn(key: RoomKey, level: number): void;
```

- `writeCellMix(key, mix)` for a branch key records `mix` as the branch's depth and targets `w = roomLive(room) ?
  colourWetGain(mix) : 0` (Shimmer and Double branches are written `1` once at build and never by a setter); the
  protocol, the re-sent rule, the timer and `connectEffect` / `disconnectEffect` are unchanged. `rampCell` picks
  `branchGains` for a branch. `syncRoom(key)` (private) re-runs the write for each branch at its recorded depth when
  `fed` or `returnLevel` crosses 0. `wireCells` makes `wet → cut` and, while connected, `in → effect → wet` for a branch,
  and no dry edge. `getConnectedEffectCount` counts branches like cells, so ` · fx in n/10` keeps meaning "effects in the
  signal path".
- `buildGlobalFxChain`: after the effects are built, `buildRoom` ×3 (needs the Gain and Delay constructors, as the cells
  do; without them the three rooms are left out and their effects released, with one `devWarn`), `buildBranch` for the
  five room effects, `buildCell` for the five chain effects. `clearCells` also drops the rooms.
- `wireGlobalFxChain`: `chainNodes` loses the five spans (`cellSpan('autoWah')` follows `nodeSpan(_filterCut)` directly);
  after the rooms-to-join block, `for (const key of ROOM_KEYS) getRoom(key)?.return.connect(join)`. `disconnectAllFxNodes`
  lists `...roomNodes(key)` for the three rooms beside the Reverb and Delay rooms, still downstream first; a room's `in`
  is dropped and re-made like a cell's, and the sends' edges into it are the sends' outputs, untouched by any flip.
- `getGlobalRoomInput(key: RoomKey): Tone.Gain | null` beside `getGlobalReverbRoom`.
- Setters: `setGlobalChorus` and `setGlobalFrequencyShifter` replace their `writeCellMix(key, wet)` line with
  `setRoomReturn(room, wet)`; nothing writes `'grit'`'s Return, which stays at the 1 `buildRoom` gives it (the
  amendment above); the three colour setters are unchanged in text (their `writeCellMix` is now a branch write, and each
  branch's level is its return level). The Spread duck and `rampChorusSweep` ride the Chorus branch exactly as they rode
  its cell (`needsDuck` reads `connected`).

### 1.4 Engine — `AudioEngine.ts` (per-robot sends)

```ts
// VoiceEntry (voiceEntry.ts) gains gritSend, shimmerSend, doubleSend: Tone.Gain; disposeVoiceNodes lists them.
// reserveVoice: three more GainCtorLocal(0) (stubs on the fallback path); busFilter.connect(each);
//   const input = getGlobalRoomInput(key); if (input) send.connect(input);   // a room that does not exist gets no edge
// The feeding sets: module state, never in a store.
const roomFeeders: Record<RoomKey, Set<string>> = { grit: new Set(), shimmer: new Set(), double: new Set() };

updateRobotSends(robotId, sends: { reverb?: number; delay?: number; grit?: number; shimmer?: number; double?: number }): void {
  // … the existing clamp-and-ramp write for all five gains …
  for (const key of ROOM_KEYS) {
    const requested = sends[key];
    if (requested === undefined || Number.isNaN(requested)) continue;
    const was = roomFeeders[key].size > 0;
    if (clampSend(requested) > 0) roomFeeders[key].add(robotId); else roomFeeders[key].delete(robotId);
    const now = roomFeeders[key].size > 0;
    if (was !== now) setRoomFed(key, now);
  }
},
// releaseVoice: delete robotId from every set, calling setRoomFed(key, false) for a set that just emptied.
```

Priming is unchanged in shape: every reservation site passes all five stored sends (`loadInstruments`' post-load pass,
`reReserveVoice`, the two `spawnSystem.ts` sites, the `sessionDiff.ts` restore gated on any send in the diff).
`reserveVoice`'s signature is not widened. A reserved voice starts with every send at 0 and feeds nothing until primed,
so a robot the budget never reserves never lights a room. Nothing else in the engine changes; no GSAP callback is
involved.

### 1.5 Actions — `robotOptionsActions.ts`

`applyGritSend` / `applyShimmerSend` / `applyDoubleSend` (display percent) and their `*Value` forms (stored fraction,
for the swell tick), each `clampSend`, `updateRobot`, `updateRobotSends(robot.id, { <room>: value })` — the
`applyReverbSend` / `applyReverbSendValue` pair, three more times. A hand edit cancels a swell at the caller, as today.

### 1.6 UI — `AudioSettingSection` and its schemas

`GRIT_SEND_SCHEMA` / `SHIMMER_SEND_SCHEMA` / `DOUBLE_SEND_SCHEMA` beside `DELAY_SEND_SCHEMA` (`robotOptions.gritSend`
…, `labels('probe.gritSend')` …, bounds from `SEND_*`). `AudioSettingValue` gains the three stored fractions; props gain
`onGritSendChange` / `onShimmerSendChange` / `onDoubleSendChange` and `gritSendSwelling` / `shimmerSendSwelling` /
`doubleSendSwelling`; three more send rows after Delay in the same wrapper (Volume, Pan, Reverb, Delay, Grit, Shimmer,
Double). `RobotScreen.tsx`: the memo, three handlers with the swell cancel, three swelling flags. `useCompanyOptions.ts`:
`DISABLED_AUDIO_SETTING`, the resolved locals, three flags from the first member, three broadcast handlers on
`onReverbSendChange`'s shape (cancel per member, apply per member, `patchSnapshot`); `resolveCompanyOptions` falls back
to the first member's values; `CompanyOptionsSection` passes them through. Broadcast-not-link as every other field.

**Drawer.** `FLEET_PARAMS_SUBSECTIONS.colour` keeps its three effects, opening on Distortion; no block is added (the
amendment above). The Chorus and Shifter blocks keep their rows; their `wet` row's labels change to the return wording
(assumption 14). The three colour Mix rows keep their labels; their help says each is that effect's level as heard from
every probe (§1.8).

### 1.7 Persistence and sharing

- **Diff / restore / prime**: the three fields join the `['reverbSend', 'delaySend']` loops in `sessionDiff.ts` (two
  decimals; in-range or ignored whole; the prime reads the stored, clamped value and runs only for sends the diff carried).
- **Share link**: `CompactRobotOverrideDiff.gr? / sm? / db?` through `isSendFraction`, as `rs` / `ds`. Payload `version`
  stays 2.
- **Globals**: no new block (the amendment above); a payload that still carries a Colour room block loads without it.
  **Every value is saved and
  loaded** (Crawford, 2026-10-21): the two Returns travel in `globalAudio` like every block, the three sends in the
  robot override diff like Reverb's and Delay's, and a save followed by a load restores each of them to the number it
  held. An old payload's `chorus.wet` and `frequencyShifter.wet` load as the Returns they now are, whatever they hold
  (assumption 13); nothing is rewritten on the way in.
- `docs/SESSION_STORAGE.md`: the five sends are persisted; `masterVolume` and `audioMode` stay never-persisted.

### 1.8 Content — `probe.ts` and `fleet.ts`

New: `probe.gritSend`, `probe.shimmerSend`, `probe.doubleSend` (human Grit / Shimmer / Double, lore placeholders, unit
`%`, `help.human` saying what the room does to a probe that sends into it and that 0 % keeps it out of the room
entirely). Changed: `fleet.chorus.mix` and
`fleet.frequencyShifter.mix` keep their keys and say the same as `fleet.reverb.amount`; `fleet.distortion.mix`,
`fleet.chebyshev.mix` and `fleet.bitCrusher.mix` keep their keys and say the effect's level as heard from every probe,
Grit deciding how much goes in, 0 silencing the effect (no longer "blended in with the clean sound"); `fleet.colour`'s and
`fleet.modulation`'s intros say the Colour trio, the Chorus and the Shifter are rooms a probe sends into, not stages
every probe passes; `probe.levels`' intro gains a sentence on the three. Every key is read from a schema, so
`content.test.ts` and the ESLint guard stay green with no exemptions. `ROBOT_DATA_GRID.md` and `SLIDER_VALUES.md` gain three
rows (Linear, 0–100 %, step 1, stored 0–1, band and lit share from the table).

### 1.9 Swells

`SwellRobotAttributeId` gains `'gritSend' | 'shimmerSend' | 'doubleSend'` (22, listed last); `ROBOT_SWELL_FIELD_RANGE`
rows `0…1`; `isRobotAttributeStructurallyLive` is `> 0`; `readRobotValue` / `writeRobotValue` through the `*Value` actions;
`computeRobotAudioOverrideDiff` captures the swell base. No ceiling (assumption 12). The global pool is untouched.

### 1.10 Diagnostics

`fxConnected` and the HUD token are unchanged in code; their meaning is "effects in the signal path, chain cells and room
branches alike". No new token.

---

## 2. Target File Structure

```text
src/
├── constants/index.ts                             − SEND_DELAY_QUIET_THRESHOLD (moves into the send table as 1 − lit)
├── data/
│   ├── robotSendLoadingRanges.ts (+ test)         NEW — ROBOT_SEND_FIELDS, ROBOT_SEND_LOADING_RANGES, EXCLUSIVE_SEND_FIELDS, SEND_FIELD_ROOM
│   ├── globalAudioLoadingRanges.ts (+ test)       Record<LoadingRangeKey, …>; the two wet rows go
│   ├── globalAudioSeedRanges.ts (+ test)          RETURN_FIELD_KEYS (four), ReturnFieldKey, LoadingRangeKey
│   ├── robotOptionsConfig.ts (+ test)             GRIT_SEND_SCHEMA, SHIMMER_SEND_SCHEMA, DOUBLE_SEND_SCHEMA
│   ├── audioRigConfig.ts (+ test)                 unchanged: 17 blocks (no Colour room block, the amendment)
│   ├── audioSwellRanges.ts (+ test)               + three 0…1 rows
│   └── transmissionPresets.ts (+ test)            chorus.wet / frequencyShifter.wet 1
├── types/
│   ├── Robot.ts, Company.ts, session.ts           the three fields
│   ├── globalAudio.ts (+ test)                    defaults, return-level doc comments
│   └── audioSwell.ts (+ test)                     19 → 22
├── engine/
│   ├── audioEngine/bypassCell.ts (+ test)         ROOM_KEYS, ROOM_BRANCHES, Room, branchGains, buildRoom, buildBranch, getRoom,
│   │                                              roomNodes, setRoomFed, setRoomReturn, syncRoom; Cell.dry nullable, Cell.room
│   ├── audioEngine/globalFx.ts (+ test, headless test)   rooms built; chainNodes −5; returns to join; disconnect list; getGlobalRoomInput;
│   │                                              chorus / shifter wet → setRoomReturn
│   ├── audioEngine/chainCycleSearch.test.ts       one more case: a connect into a room's `in` walks that room only
│   ├── audioEngine/voiceEntry.ts                  three gains
│   ├── AudioEngine.ts (+ test)                    reserveVoice wiring, roomFeeders, updateRobotSends ×5, releaseVoice, re-export
│   └── reservationSendsPrime.test.ts              five sends primed at every site
├── stores/
│   ├── audioStore.ts (+ test)                     unchanged (no Colour room setter)
│   └── localeStore.ts (+ test)                    updateRobot clamps the three
├── systems/
│   ├── spawnSystem.ts (+ test)                    generateRobotSends ×5 + fallback; baseline; robot literal
│   ├── robotOptionsActions.ts (+ test)            six actions
│   ├── audioSwells.ts (+ test)                    live / read / write for the three
│   └── companyOptions.ts (+ test)                 fallbacks
├── utils/
│   ├── globalAudioSeed.ts (+ test)                PEDAL_LIT_EDGE −2, MOTION_PEDALS, cap over four, Chorus Sync always, returns from defaults; oracles by hand; calibration
│   ├── sessionDiff.ts (+ test)                    diff / restore / prime loops ×5
│   └── sessionShareUtils.ts (+ test)              gr / sm / db
├── content/copy/probe.ts, fleet.ts                §1.8
├── components/
│   ├── robot/AudioSettingSection.tsx (+ test)     three rows, three handlers, three flags
│   ├── panels/screen/screens/RobotScreen.tsx (+ test)
│   ├── panels/screen/nav/navActions.ts (+ test)   unchanged (Colour keeps its three sub-tabs)
│   ├── panels/screen/console/AudioRigDrawer.tsx (+ test)   unchanged
│   ├── company/useCompanyOptions.ts (+ test), company/CompanyOptionsSection.tsx
│   └── debug/hudLines.test.ts                     the token's wording only if it changes (it should not)
└── docs/
    ├── robotEffectSendsDocs.test.ts               NEW — symbols declared where this spec says; gem scan; reserve-site scan ×5; grid rows; living docs
    ├── globalPedalsDocs.test.ts                   :153–154 regexes re-pinned to the seven-stage chain; chorus / shifter rows say Return
    ├── globalColourDocs.test.ts                   the grid's colour rows are room rows; the chain-order check becomes a room check
    └── robotSendsDocs.test.ts                     the reserve-site scan reads updateRobotSends( unchanged; symbol list +3
docs/
├── intent/robot-effect-sends.md                   status banner on ship
├── specs/ROBOT_EFFECT_SENDS.md                    this file
├── tasks/ROBOT_EFFECT_SENDS.md                    the plan (next phase, after the retune task)
├── AUDIO_SYSTEM.md                                Signal Graph: five rooms, the seven-stage chain, the branch rule, the HUD token's meaning
├── reference/GLOBAL_CHAIN_GRID.md                 chain-order line; colour / chorus / shifter rows as room rows; footnote ² → the send table
├── reference/ROBOT_DATA_GRID.md, SLIDER_VALUES.md three send rows
├── reference/TONE_EFFECTS_INVENTORY.md            the moved rows' role column; the five send rows
├── SESSION_STORAGE.md, COMPANIES.md               §1.7
├── ROBOT_DESIGN.md                                one line: the three sends reach the body through no dial
├── specs/GLOBAL_COLOUR.md, GLOBAL_PEDALS.md, DARK_EFFECT_BYPASS.md   one "superseded in part by 50.7" line each, pointing here
├── ideas/themes.md                                "what exists": the send table (five rows, lit shares), the cap over four
├── todo/roadmap.md                                50.7 entry; series header "seven"
└── todo/scratchy-audio-phones.md                  the 50.7 A/B
```

Not touched: `compositeVoice.ts`, `lfoEngine.ts`, `src/types/lfo.ts` (no send target), the Audio Load Budget (`LOAD_*`),
any gem / robot-body file, `reserveVoice`'s signature, `SliderLinear.tsx`, `setGlobalVibrato` and the Vibrato's bands
(the retune task's), the Reverb and Delay rooms' nodes and returns, `tempoSync.ts`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface, not a quiet widening.
- **No new effect nodes** (intent). The three rooms are the existing nodes moved; the additions are Gains and zero-delay
  Delays: per robot three send gains, per room one `in`, one `cut`, one `return`.
- **Every graph mutation is silent at the moment it happens** (Dark-Effect Bypass assumption 2): a branch's edges are made
  and broken only while its `wet` gain is 0, through `connectEffect` / `disconnectEffect` and nothing else. A reviewer
  checks this by inspection of their call sites. The sends' edges into `room.in` are made once at reservation (the send
  gain is 0 then) and broken at release (`disposeVoiceNodes`, after the composite is disposed — today's order).
- **The cycle search stays bounded** (intent): each room's `cut` sits before its return, so a send's connect walks one
  room; `chainCycleSearch.test.ts` pins it.
- **Every AudioParam write and graph edit lives in `AudioEngine.ts` / `globalFx.ts` / `bypassCell.ts`**, from an action,
  the store's setters or `applyGlobalAudioToEngine`, never from a GSAP callback or a component. The darken timer is
  `Tone.getContext().setTimeout`, as today.
- **State stays JSON-serialisable:** five numbers on `Robot`; gains, rooms, feeder sets and timers are
  module state.
- **Replayability:** every new draw keys off `getUniformSeededVal(noiseMap, dataId, spawnCount)` or `getSeededVal`; no
  `Math.random`. Reverb's and Delay's draws are untouched (the parity test).
- **Nothing on the robot body reads a send** (Visual Mapping guardrail); the guard test scans the gem folder and
  `RobotBody.tsx` for the three identifiers. ROBOT_DESIGN.md's dial list is unchanged.
- **Content:** every new word in `src/content/copy/`; no guard exemptions. **Primitives:** `SliderLinear` only;
  `CONTROL_SCHEMA_TYPES` unchanged.
- **No Effects Load threshold for sends; no `LOAD_*_MIN`** (intent). The sends are not LFO or Bank targets.
- **Pre-v1:** new worlds sound different; existing saves load the three sends at their seeded values and their two
  moved `wet`s as Returns (assumption 13). No "keep existing sound" shim, no payload upgrade.
- **Ask first:** widening `reserveVoice`'s signature, a taper on a send, a swell ceiling, a roster-aware cap, moving the
  Reverb or Delay rooms into cells, a new section tab, any new dependency.
- **Never:** `.env*`, `node_modules/`, build output; relaxing a CLAUDE.md guardrail.

---

## 4. Code Style & Architecture Conventions

```ts
// src/engine/audioEngine/bypassCell.ts — the room's liveness, one function both drivers call
function roomLive(room: Room): boolean {
  return room.fed && room.returnLevel > 0;
}

/** The engine's word on whether anyone sends into `key`'s room (docs/specs/ROBOT_EFFECT_SENDS.md assumption 3). A change
 *  re-targets every branch at its recorded depth: lit while the room is live, dark otherwise, through the one crossing. */
export function setRoomFed(key: RoomKey, fed: boolean): void {
  const room = _rooms[key];
  if (!room || room.fed === fed) return;
  room.fed = fed;
  syncRoom(key, room);
}

function syncRoom(key: RoomKey, room: Room): void {
  for (const branch of ROOM_BRANCHES[key]) {
    const cell = _cells[branch];
    if (cell) writeCellMix(branch, cell.depth);      // depth: the branch's own Mix; writeCellMix applies roomLive()
  }
}
```

```ts
// src/engine/audioEngine/globalFx.ts — a moved setter after the change: one line moves, the rest is as it was
export function setGlobalFrequencyShifter(params: Partial<FrequencyShifterSettings>): void {
  const shifter = _globalFrequencyShifter;
  if (!shifter) return;
  try {
    const shift = clampIfGiven('frequencyShifter.shift', params.shift);
    const wet = clampIfGiven('frequencyShifter.wet', params.wet);
    if (shift !== undefined) rampOrSet(shifter.frequency, shift, COLOUR_RAMP_SECONDS);
    if (wet !== undefined) setRoomReturn('shimmer', wet);   // was: writeCellMix('frequencyShifter', wet)
  } catch (err) {
    devWarn('[AudioEngine] setGlobalFrequencyShifter failed', err);
  }
}
```

- Names: `Room`, `RoomKey`, `ROOM_KEYS`, `ROOM_BRANCHES`, `branchGains`, `buildRoom`, `buildBranch`, `getRoom`,
  `roomNodes`, `setRoomFed`, `setRoomReturn`, `getGlobalRoomInput`, `ROBOT_SEND_LOADING_RANGES`,
  `EXCLUSIVE_SEND_FIELDS`. "Lit" / "dark" stay the words for a branch; "fed" is the room's word; "connected" is the
  graph fact.
- Comments cite this spec by assumption number where a choice is not obvious: the wet-only branch law, the two liveness
  drivers, the parallel Colour room, the one-of-three roll order, the typed loading table.
- Tests colocated; TDD per task (RED first); one commit per task; the mutation harness on `branchGains`, the liveness
  logic and `generateRobotSends`' cap; Prettier on touched files; LF (the sibling specs and the intent are LF).

---

## 5. Testing & Verification Requirements

**Unit (Vitest), over the existing Tone mocks** (`globalFx.test.ts`'s spies and `setTimeout` fake):

- **Rooms are built dark and unfed:** after `buildGlobalFxChain`, three rooms each with an `in`, a `cut`
  (`CHAIN_CUT_OPTIONS`) and a `return` at 1; five branches with `dry === null`; no branch has an edge from its room's
  `in` or to its `wet`; `wet → cut` present; the chain holds fifteen Delays (two cuts, five chain cells, three rooms,
  the Delay room's own `maxDelay` node aside). The chorus and shifter branches' depth is 1, the colour branches' 0.
- **Chain order, both Decay Modes:** entry cut → EQ → LPF → HPF → filter cut → AutoWah → Phaser → Tremolo → Vibrato
  cells → Compressor → Width cell → Limiter → master; the five returns (two rooms, three new) join at the Compressor
  under Natural and at the Width cell's `in` under Controlled; no room is connected to another room; flipping twice
  leaves a stub send's edge into `room.in` intact; `disconnectAllFxNodes` lists every room node.
- **Liveness and the crossing:** with the colour branch `distortion` at depth 0.3 and the room unfed, nothing is
  connected; `setRoomFed('grit', true)` connects `in → Distortion → wet` once and ramps `wet` to
  `colourWetGain(0.3)` with no dry ramp; `setRoomFed(false)` ramps to 0, arms one timer at `lookAhead + 0.05 + 0.01`,
  disconnects at the fire; a re-feed before the fire cancels it; `setRoomReturn('grit', 0)` on a fed room darkens the
  branches and ramps the return gain; `setRoomReturn(0.4)` re-lights them; a `writeCellMix('chebyshev', 0.2)` on a live
  room lights that branch alone, on a dead room records the depth and connects nothing; a chorus Spread write while the
  Double room is live is ducked, while dead is written at once; the Phaser's duck is unaffected. `getConnectedEffectCount`
  counts lit branches.
- **Engine:** `reserveVoice` creates five send gains at 0, connects `busFilter → send → room.in` only for rooms that exist
  and still `busFilter → chain entry`; `updateRobotSends(id, { colour: 0.3 })` ramps only that gain and calls
  `setRoomFed('grit', true)` once (a second robot adds no call; both to 0 calls `setRoomFed(false)` once); `7` clamps to
  `1`; `NaN` is ignored; no composite → devWarn, no throw; `releaseVoice` disposes all five and un-feeds; the
  stub-fallback voice has five. A robot with every send 0 has no path to any room except through its gains.
  **Source scan:** every non-test `reserveVoice(` caller still calls `updateRobotSends(` and passes all five fields
  (`reservationSendsPrime.test.ts` extended).
- **Cycle search:** `chainCycleSearch.test.ts` gains a case: a connect into a room's `in` with three lit branches walks
  that room and stops at its cut, whatever is lit on the chain.
- **Spawn (`spawnSystem.test.ts`):** every robot's `gritSend` / `shimmerSend` / `doubleSend` is 0 or inside its band on
  the 1 % grid; **no robot carries two of the three**; the same locale spawns the same sends twice; the baseline equals
  the spawned robot's five sends for every index, copy-branch robots included. **Parity:** for a fixed roster,
  `reverbSend` and `delaySend` equal, value for value, the numbers `main` at `2dc5b4a2` seeds (recorded in the test from
  a run on that base, with a non-default fixture — the memory rule on parity fixtures). **Calibration** over 150 worlds ×
  12: the measured mean count of each of the three per fleet pinned within ±0.4 of the figure recorded in the test's
  comment (derived once, at the task), and the share of fleets with zero Grit recorded.
- **Seeder (`globalAudioSeed.test.ts`):** the two oracles amended by hand and `toStrictEqual`; `chorus.wet` and
  `frequencyShifter.wet` are 1 for several styles; no seeded world carries a Colour room block; the Chorus seeds Sync in about half of all
  worlds (not only lit ones); the shifter's shift is never inside ±2 Hz; the cap never lights more than two of the four
  (AutoWah, Phaser, Tremolo, Vibrato); the Tremolo and Vibrato measured shares re-pinned (expected 22.2 % / 19.4 %); the
  Colour character shares unchanged; the old chorus / shifter lit tests are rewritten, not duplicated.
- **Ranges:** `GLOBAL_AUDIO_LOADING_RANGES` has no row for any `RETURN_FIELD_KEYS` entry and compiles as
  `Record<LoadingRangeKey, …>` (a type-level test: assigning a return key is a compile error, pinned with `// @ts-expect-error`);
  `GLOBAL_AUDIO_SEED_RANGES` has no Colour room key; `ROBOT_SEND_LOADING_RANGES` has five rows, each `min ≤
  max` inside `[SEND_MIN, SEND_MAX]`, `lit` in `(0, 1]`; `EXCLUSIVE_SEND_FIELDS` is the three new fields in roll order.
- **Store / settings:** `setGlobalChorus({ wet: 0.4 })` calls
  `setRoomReturn('double', 0.4)` and never `writeCellMix` (mutation check); likewise the shifter; the three colour
  setters still `writeCellMix`; nothing calls `setRoomReturn('grit', …)`, and a fed Colour room lights a branch whose
  Mix is above 0 at its built Return of 1.
- **Actions, swells, company, session, share, UI:** the ROBOT_SENDS.md §5 cases, three more times each — `applyGritSend(robot, l, 40)`
  writes 0.4 and primes; 22 swell ids with ranges; a send of 0 is never picked and 0.25 is; a mid-swell save stores the
  base; an untouched robot diffs to `{}`; one step diffs to two decimals; a bad value is ignored whole; `gr` / `sm` / `db`
  round-trip and bad values drop; `resolveCompanyOptions` and the three broadcast handlers; the section renders seven rows
  in order with `send × 100`; `RobotScreen` and the company screen pass the fields.
- **Old payloads (assumption 13):** a version-2 session or link restores its `chorus.wet` / `frequencyShifter.wet`
  exactly as stored; nothing else is rewritten. One that still carries a Colour room block (saved between T2 and the
  amendment) loads without error and the block does not survive into the store or a re-save.
- **Docs guards:** `robotEffectSendsDocs.test.ts` — every backticked symbol in this spec's §1–§4 exists in non-test `src/`;
  the gem scan finds none of the three identifiers; the grid marks the three colour
  rows, `chorus.wet` and `frequencyShifter.wet` as room rows; `AUDIO_SYSTEM.md` names the five rooms;
  `SESSION_STORAGE.md` lists the five sends. `globalPedalsDocs.test.ts:153–154` re-pinned to the seven-stage `chainNodes`
  and the unchanged `join` line; `globalColourDocs.test.ts:144` re-pinned to the room rows.
- **Content:** `content.test.ts` green unchanged; `help` present on every new entry and the relabelled returns.
- **Lint / type / build** clean at every checkpoint.

**Desktop, headless Chrome (before the phone):**

1. **Crossings are inaudible.** The GLOBAL_PEDALS.md §8 real-time recipe (native context under `Tone.setContext`,
   `ScriptProcessor` recorder, lookAhead 0.1, metric = peak |second difference| in the 150 ms after the event over the
   steady state's): a sustained tone sent into each room at 0.5 while the room goes fed → unfed → fed (via a send ramp
   0.5 → 0 → 0.5) and while its Return goes 1 → 0 → 1, three runs each: **≤ ×1.6**, no gap of ≥ 64 near-zero samples.
   Control: the same send ramp into a room that stays lit, ×1.
2. **A dark room costs a dark effect.** `npm run perf:audio` on the same `?session=` world, branch base against the
   branch, 240 s, with every one of the three sends at 0 by hand: render capacity mean and peak recorded, branch ≤ base.
   Then with the seeded sends: recorded, not gated (the lit cost is 50.6's).
3. **Main thread.** Power-on and a Decay flip over CDP (the hang-probe recipe) with the seeded sends: power-on no slower
   than today's ~2 s; a flip ≤ 4 ms; a send crossing 0 ≤ 2 ms.

**Phone gate (Crawford, Pixel 8, `?debug`, hands off to 3:00, a fresh page per run, base and branch served side by
side):**

1. The same `?session=` world on the branch base and on the branch, Full and Standard: the HUD count at 3:00 within the
   same sitting's spread, no runaway; `fx in` on the branch reads the number of lit branches plus lit chain cells.
2. A hand world with all three sends at 100 % on every robot and every Return at 1: recorded, not gated.

Counts, `fx in` readings and Crawford's words go in `scratchy-audio-phones.md` as the 50.7 round.

**Manual listen (Crawford, desktop, after the retune's listen):** a fresh Classic world has two or three gritty robots and
one or two shimmering and doubled ones among clean ones, no robot both; a robot at every send 0 is unchanged beside a
Grit neighbour; dragging a Grit send from 0 up and back with a chord sounding, slowly and quickly, with a wiggle across
0; each colour Mix from its value to 0 and back inside a fed room (the colour goes, no click); a Shimmer room lit and
darkened several times on a sustained sound, on real speakers, listening for a tick at the lighting (T19 found a
connect sometimes loses a render quantum in headless Chrome, `main` included; backlog 29); the Shimmer room on a
hard-panned robot (the sideband leak, accepted or not); the Double room's Rate Free → Sync → Free; a Natural ↔ Controlled
flip with a fed room; a swell on a Grit send (a roar, wanted) landing exactly on its base; save, reload and a share link
with one moved send; keyboard reaches every slider; every "?" reads right.

---

## 6. Git & Workflow Context

- **Order of work (intent):** (1) the **retune task** — [docs/tasks/CLASSIC_BAND_RETUNE.md](../tasks/CLASSIC_BAND_RETUNE.md),
  whose sixteen rows are the 2026-10-20 inventory conversation written down (the Mix floors, the HPF seed, the AutoWah
  sensitivity, the Chorus delayTime, the Compressor band, the Tremolo sync odds, the Reverb preDelay range, the Vibrato's
  true-vibrato retune, the Reverb send band), its Checkpoint B listen, `GLOBAL_CHAIN_GRID.md` and the loading table
  updated together, merged to `main`; its T3 makes `PEDAL_SYNC_ODDS` a per-pedal record, which §1.2's "the Chorus rolls
  Sync under `PEDAL_SYNC_ODDS`" then reads as the Chorus's own entry; (2) this spec's placeholder bands re-stated against
  that Classic (a one-commit amendment to §1.1 and assumption 6);
  (3) `planning-and-task-breakdown` → `docs/tasks/ROBOT_EFFECT_SENDS.md`; (4) the build on **`feature/palette-effect-sends`**
  off `main` (name is a proposal; Crawford creates branches, PRs and merges).
- One commit per task, RED first, imperative subject, no conventional-commit prefix, the session's co-author line.
  Commits only when Crawford says so.
- The intent and `TONE_EFFECTS_INVENTORY.md` are untracked on `main`; they are committed with this spec (docs only) or
  carried onto the build branch — Crawford's call.
- Repo index is LF; this spec, the intent and the sibling specs are LF.

---

## 7. Open Questions & Risks

**For Crawford — please confirm before the plan:**

1. **The retune and this phase overlap on three rows.** The retune plan's rows 3–4 lift the Colour Mix floors (its
   Decision 1, B recommended: ceiling 0.35) against the dry chain; here those Mixes become depths inside a room fed at a
   send level, where two gains multiply (a Mix of 0.25 is a branch gain of 0.0625, times a send of 0.6 is under 4 % of
   the robot), so they may need lifting again as room depths — is that second look the retune's Decision 1 or this
   phase's tuning task? And the retune's rows 7 and 9 (`chorus.wet` 0.3–0.4, `frequencyShifter.wet` 0.25–0.35) seed two
   Mixes this phase turns into unseeded Returns at 1; they are worth the retune's listen against the inserts only if the
   retune ships well ahead of this phase, otherwise they are moot. **Answered in part 2026-10-21: Crawford intends to
   complete the retune plan before this phase**, so rows 7 and 9 do get their listen against the inserts and the
   amendment in §6 step 2 starts from the merged tables. **Answered in full 2026-10-21 (plan T0): the room-depth second
   look is this phase's tuning task (plan T20)**, send bands first, the room's Mix bands second, dropping the taper
   last and only after asking. The retune merged with the colour Mix at one shared 0.1–0.2 band (its Checkpoint B
   reversed Decision 1 B), so a seeded room depth is a branch gain of 0.01–0.04, which times a send of 0.6 is 0.6–2.4 %
   of the robot: Risk 1 is sharper than this question first said.
2. **Assumption 1 (field names).** **Answered 2026-10-21: the intent's names.**
3. **Assumption 2 (parallel Colour room, wet-only branches).** The intent's Outcome says "in series"; the series form
   re-adds the robot's dry signal through the cells' crossfade law, which is why this spec picks parallel. **Answered
   2026-10-21 (plan T0): parallel.**
4. **Assumption 3 (fed and Return both drive liveness).** The simpler alternative is sends only. **Answered 2026-10-21
   (plan T0): fed AND Return > 0.**
5. **Assumption 13 (old payloads).** **Answered 2026-10-21: no real saved sessions exist; load the number, no
   upgrade.**
6. **Assumption 14 (drawer placement).** Chorus and Shifter stay under Modulation with a Return row; Colour gets a Room
   sub-tab. Or the rooms move beside Reverb and Delay. **Answered 2026-10-21 (plan T0): stay put, Colour gains the Room
   sub-tab. Re-answered 2026-10-21 after T17 (Crawford): no Colour master Return, so no Room sub-tab; each colour Mix
   is its effect's return level, as Reverb's and Delay's Amounts are.**
7. **Assumptions 9 and 7 (the cap stays 2 over four; the Chorus rolls Sync in every world; independent per-robot rolls
   with a one-of-three order rather than a roster-aware count).** **Answered 2026-10-21 (plan T0): accept as specced.**

**Risks:**

1. **Grit audibility.** Send × squared depth is a small number at the seeded floors (question 1). The listen decides;
   the knobs are the send bands, the room's Mix bands and, last, dropping the taper inside the room (ask first).
2. **A silent feeder keeps a room lit.** A reserved robot standing by or resting with a send above 0 keeps its room in
   the graph (today's rule for Reverb and Delay, whose nodes are always connected anyway). The cost is the effect's lit
   cost while nothing is heard; the HUD shows it. A fix (feed on note activity) is a later lever, not this phase.
3. **Fleet-to-fleet spread.** Independent rolls give some fleets no Grit and some five; the calibration test records the
   zero-Grit share so the listen can ask for a roster-aware cap with numbers in hand.
4. **Sixty send gains at twelve robots** and five connects per reservation: each walks one room or the entry cut. Power-on
   is measured (§5), expected flat.
5. **The shifter's sideband leak** on a hard-panned Shimmer robot is now per robot rather than fleet-wide; the manual
   listen includes it and the seeded band can go centred-only if it sounds wrong (GLOBAL_PEDALS.md assumption 3's veto).
6. **Old saves and links** are not a concern (Crawford, 2026-10-21, assumption 13): they load whatever they hold, and
   nothing in this phase guards against a pre-phase payload sounding different.
7. **The Chorus's Sync in every world** moves its oracle values and its rate is heard only when a robot doubles; a Free
   Chorus in a world where nobody doubles is unheard either way.
8. **The themes idea doc still says three themes and lists the old `wet` rows as the send bands**; §2 updates its "what
   exists" list, and the six-theme question is the themes interview's, not this phase's.
