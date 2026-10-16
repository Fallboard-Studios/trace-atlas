# Phase Spec: Robot Performance — Dynamics, Rests, Accents, Humanize

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Main-thread check (§5): `npm run perf`
> - Phone gate (§5): the `?debug` HUD on the Pixel, seed `alpha` session from
>   [scratchy-audio-phones.md](../todo/scratchy-audio-phones.md#baseline-for-the-audio-palette-series-roadmap-50--crawfords-run-2026-10-13)

Source of intent: [docs/intent/robot-performance.md](../intent/robot-performance.md) (confirmed 2026-10-15,
nine questions, three guesses corrected). Roadmap slot: **50.5**, proposed — the entry does not exist yet and
the last task writes it under roadmap 50 ([roadmap.md](../todo/roadmap.md#50-audio-palette-new-attributes-without-new-libraries)),
moving backlog item 21 to the archive with a pointer here. Branch `feature/palette-performance`, off `main` at
`2ec52f2f`. Where this spec differs from backlog 21's paragraphs (it does, on every line: see the intent's
"What changed from the backlog") this spec wins.

Survey basis (2026-10-15, against `main` at `2ec52f2f`):

- **Velocity today.** `computeNoteVelocitySeeded` (`src/engine/AudioEngine.ts:474`) rolls the locale noise map at
  `VELOCITY_ROLL_X` / `VELOCITY_VARIANCE_X` (`:105–106`) with a per-robot **live counter** `robotNoteIndex` (`:153`,
  mod 97, advanced per scheduled note, cleared by `unregisterRobotMelody`): 15 % of notes (`VELOCITY_VARIANCE_RATE`,
  `:81`) get a signed offset of up to ±0.25 (`VELOCITY_VARIANCE_AMOUNT`, `:83`) around `NOTE_VELOCITY_BASELINE = 1`
  (`:466`), clamped to `[VELOCITY_MIN = 0.05, 1]`. `scheduleNote` (`:591`) then applies `accentMultiplier`
  (`NoteParams`, `:65`) and the Highlight attenuation, and `triggerWithCap` (`:424`) hands velocity to the composite
  voice. **The baseline is already at the ceiling**, so the existing motif-group accent
  (`GROUP_ACCENT_MULTIPLIER = 1.25`, `:92`, set per entry in `registerRobotMelody` `:1107–1124`, applied in
  `processMelodyStep` `:1195`) only ever lifts a note the variance had first pushed down. Any "louder" mark needs
  headroom (§1.3).
- **The playback hot path.** `startMelodyPlayback` (`:438`) runs `processMelodyStep(step, time)` (`:1173`) on the
  `16n` transport tick; it resolves the pitch from `event.noteIndex` and calls `scheduleNote({ robotId, note,
  duration: event.length, time: time + MIN_LEAD, accentMultiplier })`. `MIN_LEAD = 0.1` (`src/constants/index.ts:20`).
  `NoteParams.duration` is `NoteDuration` (`src/types/Robot.ts:9`, the eight note-value strings); both consumers of
  it — `scheduleVoiceRelease` (`:303`, `Tone.Time(duration).toSeconds()`) and the composite voice's
  `triggerAttackRelease` (`src/engine/audioEngine/compositeVoice.ts:191`, `String(dur)`) — accept a seconds number
  through `Tone.Time`, so a scaled duration needs no new conversion path. The composite voice already enforces
  strictly increasing trigger times per layer (`:196`, +1 ms), so an early-shifted note never collides with the
  previous one. `stepCounter` (`:136`) counts ticks since playback start and resets in `stop()` (`:581`).
- **Melody generation.** `generateMelodyForRobot` (`src/engine/melodyGenerator.ts:410`) builds `MelodyEvent[]`
  (`src/types/Robot.ts:107`: `id`, `startStep` 1–16, `length: NoteDuration`, `noteIndex`, `octave`,
  `pitchLocked?`) from one seeded `rand` — `buildSeededComposition(compositionSeed, attrs)` (`:95`), an `alea` over a
  colon-joined key of the five composition inputs. Both call sites, `spawnSystem.ts:800–816` and
  `regenerateMelody.ts:38–54`, build the same stream so an edit reverted reproduces the spawn melody exactly
  (`spawnSystem.test.ts`'s capstone test). `reRollMelodyPitches` (`:581`, the docking pitch drift via
  `robotSystems.ts:131`) spreads `...event`, so extra event fields survive a dock. `registerRobotMelody`
  substitutes the click track (`buildClickTrackMelody`) when `clickTrackActive`.
- **Composition fields.** `Robot.rhythmicDensity` / `rhythmicMotifLength` / `noteVariance` / `pitchRepeat`
  (`Robot.ts:221–245`, all optional, `DEFAULT_*` in `melodyGenerator.ts:128–147`); seeded in `spawnRobot`
  (`spawnSystem.ts:768–793`, plus an `alea` fallback when no noise map) and mirrored in
  `generateRobotAudioBaseline` (`:595`, `RobotAudioBaseline` `:564`); the copy branch (`:713–756`, 30 %
  `robot.copyChance`) inherits them. Actions: `applyDensity` / `applyPitchRepeat` (`robotOptionsActions.ts:102–110`):
  `updateRobot` then `regenerateMelody`. Diff: `sessionDiff.ts:292–295` (`deepEqual`), apply `:429–432`; share
  codec `rd` / `pr` (`sessionShareUtils.ts:112–115`); company snapshot `rhythmicDensity?` (`Company.ts:27`),
  broadcast `onDensityChange` (`useCompanyOptions.ts:366`: loop members through the action, then
  `patchSnapshot`), fallback `companyOptions.ts:42`. UI: `PingControlsDrawer` (`src/components/robot/PingControlsDrawer.tsx`)
  — `PHRASING_PANEL_SCHEMA` (column) wrapping `RHYTHM_PANEL_SCHEMA` (responsive: Density, Motif Length, Pitch
  Repeat), then `FREQUENCY_PANEL_SCHEMA`; `generationDisabled` greys every generator slider while the click track plays.
- **Levels.** `AudioSettingSection` (`src/components/robot/AudioSettingSection.tsx:99`): Monitor Mode radio, Volume,
  Pan + Auto, Reverb, Delay, each slider in a wrapper `div` with no display rule (the voxel-track hook needs a block
  box). Value type `AudioSettingValue` (`:25`). Robot-level scalar precedents: `masterVolume`, `pan`, `reverbSend`.
- **Pacing.** `FleetParamsScreen.tsx:59` `PacingPanel`: two responsive rows — Tempo | Automation Rate, Automation
  Length | the intensity drawer — over `audioStore.bpm` / `swellFrequency` / `swellDuration`. Pacing scalars live on
  `audioStore` (not `GlobalAudioSettings`), seed once per session from the Attenuation Style's noise map and carry
  forward across style switches (`regenerateGlobalAudioFromSeed`, `audioStore.ts:501–548`, the `*_UNSEEDED`
  sentinel; `generateSwellDuration`, `globalAudioSeed.ts:360`, quantised to the slider's step), and travel as
  optional top-level `SessionPayload` fields (`session.ts:82–91`; compact `b` / `sf` / `sd` / `pv`,
  `sessionShareUtils.ts:42–46`; captured `sessionDiff.ts:396–398`, applied `:549–552`). `bpm` alone reseeds per style.
- **Gem.** `orbiterDials.ts` (`src/components/robot/gem/`) reads the four composition fields (`OrbiterDialsInput`,
  `:36`) — the Visual Mapping dials. It must not read the three new ones; `robotArticulationDocs.test.ts` is the
  source-scan pattern.
- **Docs that list event fields / sliders:** `MELODY_SYSTEM.md:19–26` (the `MelodyEvent` block), `ROBOT_DATA_GRID.md`,
  `SLIDER_VALUES.md` (Tempo row `:132`), `SESSION_STORAGE.md`, `COMPANIES.md`, `PROCEDURAL_GENERATION.md` (dataIds),
  `AUDIO_SYSTEM.md` (playback loop, velocity).

ASSUMPTIONS I'm making beyond the intent's decisions (correct now or I'll proceed with these):

1. **Three new robot fields, top-level and optional, like `pitchRepeat`:** `Robot.dynamics?: number`,
   `Robot.rests?: number`, `Robot.accents?: number`, each 0–100 as displayed and stored (no display/storage split).
   Absent = `DEFAULT_DYNAMICS = 50` (today's variance exactly), `DEFAULT_RESTS = 0`, `DEFAULT_ACCENTS = 0` — so every
   existing fixture, saved session and share link decodes to today's sound. Spawn always writes all three.
2. **Rests and Accents are a post-pass over the generated melody, from their own seeded stream.** The five
   composition inputs and `buildSeededComposition` are untouched, so notes and rhythm do not change when Rests or
   Accents move — only the marks are redrawn. `applyPerformanceMarks(melody, { rests, accents }, rand)` with
   `rand = buildSeededPerformance(compositionSeed)` (an `alea` over `` `${compositionSeed}:performance` ``), called by
   both `spawnRobot` and `regenerateMelody` straight after `generateMelodyForRobot`. **The key is the seed alone, not
   the slider values** (as built, T3): with the values in the key every slider tick would re-seed the stream and
   reshuffle which events are marked, defeating the four-draw contract of §1.2; keyed on the seed, raising Rests only
   adds rested events and raising Accents only adds marked ones. Marks are drawn **per event, independently**, in event order.
   (Veto point: copy marks across a tiled motif's repeats the way Pitch Repeat copies pitches — fewer, more
   regular accents.)
3. **Event fields.** `MelodyEvent.rest?: number` — the fraction of the event's length that is **silent**, in
   `[0.25, 0.75]`, present only on a rested event; `MelodyEvent.mark?: ArticulationMark` with
   `ArticulationMark = 'accent' | 'marcato' | 'staccato' | 'staccatissimo' | 'tenuto'`, present only on a marked
   event. Absent, never `0` / `'none'` (the `pitchLocked` convention). The click-track melody carries neither.
4. **Rests slider semantics.** `v` in 0–100: each event is rested with chance `v / 100`; a rested event's silent
   fraction is uniform in `[REST_MIN_FRACTION = 0.25, 0.25 + 0.5 · v / 100]` — at 100 every note is cut by a quarter
   to three quarters. "Higher = more notes cut, and cut shorter", the intent's words.
5. **Accents slider semantics.** `v` in 0–100: each event is marked with chance `v / 100`, the mark drawn uniformly
   from the kinds unlocked at `v`: `1–33` → accent, tenuto; `34–66` adds staccato, marcato; `67–100` adds
   staccatissimo. One table (`ARTICULATION_MARKS`, `src/engine/articulation.ts`, new) holds each mark's velocity
   multiplier and sounding-length factor:

   | mark | velocity × | length × |
   |---|---|---|
   | accent | 1.25 | 1 |
   | marcato | 1.4 | 0.75 |
   | staccato | 1 | 0.5 |
   | staccatissimo | 1 | 0.25 |
   | tenuto | 1.1 | 1 (and cancels a rest on the same event) |

   Combination with a rest on the same event: **the shorter wins** — `lengthFactor = min(1 − rest, mark.length)`,
   except tenuto, whose "minimal gap" meaning overrides the rest. Velocity multipliers stack with the existing
   motif-group accent (`× 1.25`) and then clamp to 1.
6. **Velocity headroom: `NOTE_VELOCITY_BASELINE` drops from 1 to 0.8.** With the baseline at the ceiling every
   "louder" mark clamps away, as the motif-group accent does today. 0.8 gives accents their 25 %, costs about 2 dB
   of level fleet-wide (Volume is a separate bus gain and untouched), and makes the existing group accent audible
   for the first time. Pre-v1, so the world changing sound is accepted. (Veto point: keep 1 and make marks *attenuate
   the unmarked* instead — more code, same result, inverted mental model; or compensate with a +2 dB master trim.)
7. **Dynamics mapping.** `s = v / 50`: variance rate `0.15 · s`, variance width `0.25 · s`. At 50 both are
   today's constants to the digit; at 0 every note is the baseline (flat); at 100 three notes in ten move by up to
   ±0.5. One per-robot number read at trigger time from the store robot `scheduleNote` already looks up and hands to
   the roll (`:607`, hoisted). The engine clamps `v` to 0–100 and reads an absent or non-finite value as 50 (as built,
   T5), so the rate tops out at 0.3 and the spec's earlier `min(1, …)` cap is unreachable and gone.
8. **Velocity and humanize rolls key off the playback position, not the live counter.** `processMelodyStep` passes
   `position = stepCounter` into `scheduleNote` (new optional `NoteParams.position`); each roll is
   `performanceRoll(compositionSeed, purpose, position)` — a uniform draw from `alea` over `seed:purpose:position`
   (T20; the first build sampled the noise map at `(compositionSeed + position) % VELOCITY_PERIOD`, but
   `compositionSeed` is a 0–1 fraction, so every robot sat within one unit of the others on a smooth field and a
   unison rolled together) — so two robots at the same tick differ and a replay from power-on repeats the pattern. `robotNoteIndex` stays only as the fallback for callers that pass no
   `position` (tests, the click track test helper) and is otherwise dead. (As built, T5: no existing test exercised
   the variance maths, so none needed updating; the new oracle is a hand-checkable noise map. The one assertion that
   moved is the masterVolume-0 trigger, 1 to 0.8.) This is the intent's "key off the event's position" option, taken.
9. **Humanize is a Pacing scalar in milliseconds**: `audioStore.humanize: number`, slider `0–20 ms` step 1
   (`HUMANIZE_MAX_MS = 20`), seeded once per session in `[2, 6]` ms (`globalAudio.humanize` on the style's noise
   map, quantised to 1 ms, `generateHumanize` beside `generateSwellDuration`), carried forward across style switches
   like the swell fields, optional `SessionPayload.humanize` (compact `hm`). At trigger: `offset = (2 · draw − 1) ·
   humanize / 1000` with `draw = performanceRoll(compositionSeed, 'humanize', position)` in `[0, 1)` (T20; no
   `audio.humanize` dataId is read any more), added to `time + MIN_LEAD`. `MIN_LEAD − HUMANIZE_MAX_MS / 1000 = 80 ms`, inside CLAUDE.md's 50–100 ms rule; a test pins the
   inequality. **Click-track notes are exempt** (a humanized tempo reference is no reference): the registry entry
   carries `clickTrack: true`, set in `registerRobotMelody`, the one funnel. **The engine does not read the store**
   (as built, T6): `audioStore.setHumanize` and the seed-once branch in `regenerateGlobalAudioFromSeed` PUSH the value
   with `AudioEngine.setHumanize(ms)` (clamped 0–20, NaN reads as 0, survives `killAll()`), the Audio Load Budget
   precedent (`setSoundingRobots` / `setPolyphonyCap`). `audioStore` imports `AudioEngine`, so reading it back would
   be a cycle, and a push costs no store read on the phone tick.
10. **UI placement.** Dynamics: a sixth slider row in `AudioSettingSection`, after Delay. Rests and Accents: a new
    responsive row `ARTICULATION_PANEL_SCHEMA` after the three rows of `PingControlsCompositionSection`, both greyed by
    `disabled` (as built, T10: the screens render that section; `PHRASING_PANEL_SCHEMA` and `generationDisabled` belong to the
    retired combined drawer, and the section has no click-track gate). Humanize: the Pacing top row becomes Tempo | Humanize | Automation Rate (three wide, as
    the Rhythm row is). All `SliderLinear`, `0–100` step 1 except Humanize `0–20` step 1. `CONTROL_SCHEMA_TYPES`
    stays 14. (Veto point: a third Pacing row for Humanize instead.)
11. **Persistence and sharing.** `RobotAudioOverrideDiff` gains `dynamics?`, `rests?`, `accents?` (diffed by
    `deepEqual` against the baseline like `rhythmicDensity`); compact keys `dy`, `rt`, `ax`. The restore path's
    melody regeneration for a restored composition field (`sessionDiff.ts` apply, `:429` onward — verify the call)
    covers `rests` / `accents` for free once they are inputs to `regenerateMelody`; `dynamics` needs no engine call.
    `SessionPayload.humanize?`; absent = the seeded value, the pacing convention. Non-finite or out-of-range numbers
    decode to absent, never throw.
12. **Companies broadcast all three** per field (`CompanyOptionsSnapshot.dynamics? / rests? / accents?`,
    `onDynamicsChange` / `onRestsChange` / `onAccentsChange` on `onDensityChange`'s plain-number pattern,
    `resolveCompanyOptions` falling back to the first member then the `DEFAULT_*`). Humanize is global, so no
    company field.
13. **Seeded fleet-wide.** `robot.dynamics` in `[25, 75]`, `robot.rests` in `[10, 60]`, `robot.accents` in
    `[20, 80]`, all `Math.round(getSeededVal(noiseMap, dataId, spawnCount, min, max))` at the spawn offset, plus the
    `alea` no-noise-map fallback each composition field has. Bell-curved draws are fine here: the intent wants most
    robots moderate and a few at the edges. The copy branch inherits all three; the baseline mirrors it. Humanize
    `[2, 6]` ms as in 9.
14. **Lore names are placeholders until Crawford's copy pass:** Dynamics / *Pressure Swing*; Rests / *Payload Gaps*;
    Accents / *Payload Stress*; Humanize / *Ping Jitter*. Keys and human words are fixed. The Levels nav row is already
    "Dynamics / Output" (`probe.dynamics`), so the slider's key is `probe.levels.dynamics` and §7 flags the
    word clash.

---

## 1. Overview & Claude Explanation

Four performance controls that make the fleet sound played rather than sequenced, with no new audio nodes.
**Rests** and **Accents** are composition: a seeded post-pass stamps each melody event with an optional silent
fraction and an optional articulation mark, drawn from the robot's own `compositionSeed` so the pattern repeats with
the loop and survives a save, a share and a dock. **Dynamics** and **Humanize** are performance: at trigger time
the playback loop turns the event's mark and rest into a velocity multiplier and a sounding length, widens or
flattens the velocity variance by the robot's Dynamics, and shifts the schedule time by a few seeded milliseconds
under the fleet's Humanize. Every roll keys off the playback position and a seed, never a live counter or
`Math.random`. The three per-robot numbers sit on the robot like `pitchRepeat`; Humanize sits on `audioStore` like
`swellDuration` and is pushed to the engine (§1.3). Edits flow store-first through `robotOptionsActions`; the two composition sliders regenerate the
marks only, not the notes. Companies broadcast the robot fields; the session diff and share link carry all four;
nothing reaches the gem.

### 1.1 Data shape

```ts
// src/types/Robot.ts
export type ArticulationMark = 'accent' | 'marcato' | 'staccato' | 'staccatissimo' | 'tenuto';
export const ARTICULATION_MARK_NAMES: readonly ArticulationMark[] = ['accent', 'marcato', 'staccato', 'staccatissimo', 'tenuto'];

export interface MelodyEvent {
  // …existing…
  /** Rests (docs/specs/ROBOT_PERFORMANCE.md §1.2): the fraction of `length` that is silent, 0.25–0.75.
   *  Present only on a rested event; absent otherwise, never 0. */
  rest?: number;
  /** Accents: the articulation mark. Present only on a marked event; absent otherwise. */
  mark?: ArticulationMark;
}

export interface Robot {
  // …existing…
  /** 0–100. Scales the per-note velocity variance; 50 = today's fixed variance exactly. Absent = 50. */
  dynamics?: number;
  /** 0–100. Chance per event of a rest, and how deep it cuts. Absent = 0 (no rests). */
  rests?: number;
  /** 0–100. Chance per event of an articulation mark, and how many kinds are in play. Absent = 0. */
  accents?: number;
}

// src/engine/melodyGenerator.ts
export const DEFAULT_DYNAMICS = 50;
export const DEFAULT_RESTS = 0;
export const DEFAULT_ACCENTS = 0;

// src/constants/index.ts
export const PERFORMANCE_MIN = 0, PERFORMANCE_MAX = 100;   // the three robot sliders
export const HUMANIZE_MIN_MS = 0, HUMANIZE_MAX_MS = 20;    // the Pacing slider
export const MIN_SOUNDING_SECONDS = 0.03;                  // a rest or a staccatissimo never leaves less than this

// src/stores/audioStore.ts
humanize: number;            // ms; HUMANIZE_UNSEEDED sentinel until the first seed, like swellDuration
setHumanize(ms: number): void;   // clamps, truncates, writes, and pushes AudioEngine.setHumanize(ms) (§1.3)

// src/engine/AudioEngine.ts
AudioEngine.setHumanize(ms: number): void;   // clamped 0–20, NaN reads as 0, survives killAll()

// src/types/session.ts
export interface RobotAudioOverrideDiff { /* … */ dynamics?: number; rests?: number; accents?: number; }
export interface SessionPayload { /* … */ humanize?: number; }
```

Defaults are **absence**; `regenerateMelody`, `resolveCompanyOptions` and the trigger path each turn absence into
the `DEFAULT_*` value in one place.

### 1.2 The post-pass — `src/engine/melodyGenerator.ts`

```ts
/** The marks' own stream: notes and rhythm come from buildSeededComposition and do not move when these two sliders do.
 *  Keyed on the seed ALONE so the stream starts from the same place whatever the sliders say (see assumption 2). */
export function buildSeededPerformance(compositionSeed: number): () => number {
  return alea(`${compositionSeed}:performance`);
}

/** Stamp rests and marks onto a generated melody. Pure; returns new event objects only where something was stamped. */
export function applyPerformanceMarks(melody: MelodyEvent[], perf: { rests: number; accents: number }, rand: () => number): MelodyEvent[] {
  const restChance = clamp(perf.rests, 0, 100) / 100;
  const restDepth = REST_MIN_FRACTION + REST_SPAN * restChance;            // 0.25 … 0.75
  const markChance = perf.accents / 100;                                     // no clamp needed: unlockedMarks handles <= 0, NaN and > 100
  const kinds = unlockedMarks(perf.accents);                                 // §assumption 5 tiers
  return melody.map((event) => {
    // Four draws per event, always, so a slider change re-stamps this event without shifting any later one.
    const restRoll = rand(), restDepthRoll = rand(), markRoll = rand(), markPickRoll = rand();
    const rest = restRoll < restChance ? REST_MIN_FRACTION + restDepthRoll * (restDepth - REST_MIN_FRACTION) : undefined;
    const mark = kinds.length > 0 && markRoll < markChance ? kinds[Math.floor(markPickRoll * kinds.length)] : undefined;
    if (rest === undefined && mark === undefined) return event;
    return { ...event, ...(rest !== undefined ? { rest } : {}), ...(mark !== undefined ? { mark } : {}) };
  });
}
```

Every event consumes exactly four `rand()` calls whether or not it is stamped, so the stream is stable under a
slider change: dragging Rests re-decides each event's rest without moving which events are marked, and raising either
slider only adds stamps (every event rested or marked at 30 still is at 80). Both call sites apply it:

```ts
// spawnSystem.ts, after generateMelodyForRobot; regenerateMelody.ts likewise
const spawnMelody = applyPerformanceMarks(
  generateMelodyForRobot({ /* unchanged */ }),
  { rests: spawnRests, accents: spawnAccents },
  buildSeededPerformance(compositionSeed),
);
```

`regenerateMelody` reads `robot.rests ?? DEFAULT_RESTS` / `robot.accents ?? DEFAULT_ACCENTS`. `reRollMelodyPitches`
is untouched (it spreads events). `buildClickTrackMelody` is untouched (no marks).

### 1.3 Trigger time — `src/engine/AudioEngine.ts` and `src/engine/articulation.ts` (new)

`articulation.ts` is a pure module: the `ARTICULATION_MARKS` table (assumption 5), `unlockedMarks(accents)`, and

```ts
/** What the playback loop needs from an event's stamps: a velocity multiplier and a sounding-length factor. */
export function resolveArticulation(event: Pick<MelodyEvent, 'rest' | 'mark'>): { velocity: number; length: number } {
  const mark = event.mark ? ARTICULATION_MARKS[event.mark] : { velocity: 1, length: 1 };
  const restFactor = event.rest !== undefined && event.mark !== 'tenuto' ? 1 - event.rest : 1;
  return { velocity: mark.velocity, length: Math.min(restFactor, mark.length) };
}
```

`processMelodyStep` becomes:

```ts
const art = resolveArticulation(event);
const writtenSeconds = Tone.Time(event.length).toSeconds();                 // at the live BPM
const duration = art.length < 1
  ? Math.min(writtenSeconds, Math.max(MIN_SOUNDING_SECONDS, writtenSeconds * art.length))   // floored, never past the written length
  : event.length;
const groupAccent = isGroupAccent ? GROUP_ACCENT_MULTIPLIER : 1;
const accentMultiplier = groupAccent * art.velocity;                         // passed as undefined when exactly 1, as today
AudioEngine.scheduleNote({
  robotId, note, duration,
  time: time + MIN_LEAD + (clickTrack ? 0 : humanizeOffset(robotId)),       // humanizeOffset: fetched once per step, below
  accentMultiplier: accentMultiplier === 1 ? undefined : accentMultiplier,
  position: stepCounter,
});
```

- `NoteParams.duration: NoteDuration | number` (seconds). `scheduleVoiceRelease` takes either through `Tone.Time`;
  `triggerWithCap` hands the composite voice `String(seconds)`, which Tone reads as seconds (pinned against the REAL
  Tone in `audioEngine/numericDuration.test.ts`, since every engine test mocks `Tone.Time`). The composite voice is
  untouched. An unstamped event passes its `NoteDuration` string exactly as today.
- `NoteParams.position?: number`. `computeNoteVelocitySeeded(robotId?, position?, robot?)` (exported for tests):
  with a position the roll is `performanceRoll(seed, 'velocityRoll', position)` and the signed variance
  `performanceRoll(seed, 'velocityVariance', position) · 2 − 1` (T20); without one, the legacy `robotNoteIndex`
  counter samples the noise map at `VELOCITY_ROLL_X` / `VELOCITY_VARIANCE_X` as before; rate and
  width scaled by the robot's Dynamics (assumption 7) from the store robot, which `scheduleNote` looks up once per note
  (with the roster the audioMode policy needs) and hands in; with no `robot` argument the function looks it up itself.
  `NOTE_VELOCITY_BASELINE = 0.8` (assumption 6). Clamp stays `[VELOCITY_MIN, 1]`.
- `humanizeOffsetFor(position)`: a function from robot id to seconds, built **once per `processMelodyStep` call**. It is
  `() => 0`, fetching nothing, when `humanizeMs` is 0 or there is no noise map (no active locale); otherwise it
  captures the roster once, and each robot's offset is `(performanceRoll(compositionSeed, 'humanize', position) · 2 − 1)
  · humanizeMs / 1000` (T20). `performanceRoll(seed, purpose, position)` (exported) is `alea` over
  `seed:purpose:position`, `purpose` one of `PerformanceRollPurpose`.
  `humanizeMs` is **engine state pushed in by `AudioEngine.setHumanize(ms)`** (assumption 9), not a store read.
- `MelodyEventEntry.clickTrack?: boolean`, set in `registerRobotMelody` when the click track is substituted.
- The Highlight attenuation and the mute/solo policy are untouched and still run after the multipliers.

### 1.4 Seeding — `src/systems/spawnSystem.ts`

In `spawnRobot`'s fresh branch, beside `spawnPitchRepeat` (`:789`), and mirrored in `generateRobotAudioBaseline`
(`:624`) and `RobotAudioBaseline`:

```ts
spawnDynamics = Math.round(noiseMap ? getSeededVal(noiseMap, 'robot.dynamics', spawnCount, DYNAMICS_SEED_RANGE.min, DYNAMICS_SEED_RANGE.max)
                                    : DYNAMICS_SEED_RANGE.min + alea(`${localeId}:${spawnCount}:dynamics`)() * (DYNAMICS_SEED_RANGE.max - DYNAMICS_SEED_RANGE.min));
spawnRests    = …'robot.rests'   in RESTS_SEED_RANGE    [10, 60]
spawnAccents  = …'robot.accents' in ACCENTS_SEED_RANGE  [20, 80]
```

`DYNAMICS_SEED_RANGE = [25, 75]`. The copy branch copies `source.dynamics ?? DEFAULT_DYNAMICS` etc. with the other
composition fields. The robot literal and the baseline return all three. Humanize: `generateHumanize(styleId,
styleName)` in `globalAudioSeed.ts` (as built, T12: a `getUniformSeededVal` draw, because one plain draw at offset 0 gave 3
distinct values over 300 styles) on `generateSwellDuration`'s shape (`HUMANIZE_SEED_RANGE = [2, 6]` ms,
`quantizeToStep(raw, 0, 1)`), wired into `regenerateGlobalAudioFromSeed` with a `HUMANIZE_UNSEEDED` sentinel.

### 1.5 Actions — `src/systems/robotOptionsActions.ts`

```ts
export function applyDynamics(robot, localeId, value) { updateRobot(localeId, robot.id, { dynamics: value }); }   // read at trigger time; no engine call
export function applyRests(robot, localeId, value)    { updateRobot(localeId, robot.id, { rests: value });   regenerateMelody({ ...robot, rests: value }, localeId); }
export function applyAccents(robot, localeId, value)  { updateRobot(localeId, robot.id, { accents: value }); regenerateMelody({ ...robot, accents: value }, localeId); }
```

Humanize: `useAudioStore.getState().setHumanize(ms)` directly from the Pacing slider, like `setSwellDuration`. The store
action (and the seed-once branch of `regenerateGlobalAudioFromSeed`, and so a session restore, which goes through
`setHumanize`) also calls `AudioEngine.setHumanize(ms)`; that push is the only way the value reaches the playback loop.

### 1.6 UI

- **Levels — `AudioSettingSection.tsx`.** `AudioSettingValue.dynamics: number` (0–100, no conversion),
  `onDynamicsChange(value)`. A sixth wrapper row after Delay: `<SliderLinear schema={DYNAMICS_SCHEMA} …>`. Both
  screens pass it (`RobotScreen` from `robot.dynamics ?? DEFAULT_DYNAMICS`; the company screen from the resolved
  snapshot). No `swelling` (not a swell attribute).
- **Composition — `PingControlsDrawer.tsx`.** `PingControlsValue.rests` / `.accents`, `onRestsChange` /
  `onAccentsChange`. (As built, T10: in `PingControlsCompositionSection`, after the Octave row, gated by `disabled` alone; the
  next sentence's `PHRASING_PANEL_SCHEMA` / `generationDisabled` are the retired drawer's.) Inside `PHRASING_PANEL_SCHEMA`, after the Rhythm row: `<DirectionalPanel
  schema={ARTICULATION_PANEL_SCHEMA}>` (responsive, heading `probe.composition.articulation`) holding the two
  sliders, both `disabled={generationDisabled}`.
- **Pacing — `FleetParamsScreen.tsx`.** `PacingPanel` subscribes to `humanize` too; the top row gains a third
  `audio-rig-drawer__param-row` with `<SliderLinear schema={HUMANIZE_SCHEMA} value={humanize} onChange={setHumanize} />`
  between Tempo and Automation Rate.
- **Schemas.** `DYNAMICS_SCHEMA`, `RESTS_SCHEMA`, `ACCENTS_SCHEMA`, `ARTICULATION_PANEL_SCHEMA` in
  `robotOptionsConfig.ts`; `HUMANIZE_SCHEMA` in `audioRigConfig.ts` beside `BPM_SCHEMA` (a bare Pacing meta-setting,
  never in `AUDIO_RIG_CONFIG`'s array). Every value control gets `help` via `labels()`.

### 1.7 Persistence and sharing

- `computeRobotAudioOverrideDiff`: three `deepEqual` lines beside `rhythmicDensity`'s; the apply loop merges them
  into `updates`; whatever regenerates the melody for a restored `rhythmicDensity` runs for a restored `rests` /
  `accents` (the task verifies the exact call site; if the restore path re-registers the stored melody instead of
  regenerating, it must regenerate when either of these keys is present).
- `CompactRobotOverrideDiff`: `dy`, `rt`, `ax`. `SessionPayload.humanize` ↔ compact `hm`; captured beside
  `swellDuration` (`sessionDiff.ts:398`), applied beside it (`:551`) through `setHumanize`. The share decoder's
  type check (`sessionShareUtils.ts:358–364`) gains `hm`.
- `docs/SESSION_STORAGE.md`'s field list and codec table gain the four fields.

### 1.8 Companies

`CompanyOptionsSnapshot.dynamics? / rests? / accents?`; `resolveCompanyOptions` falls back per field to the first
member then the default; `useCompanyOptions` adds the three values and handlers on `onDensityChange`'s pattern and
threads them to the two drawers. `COMPANIES.md` lists them.

### 1.9 Content

`src/content/copy/probe.ts`: `probe.levels.dynamics` { Dynamics / Pressure Swing, unit '%' },
`probe.composition.articulation` { Articulation, heading },
`probe.composition.rests` { Rests / Payload Gaps, unit '%' },
`probe.composition.accents` { Accents / Payload Stress, unit '%' }.
`src/content/copy/fleet.ts`: `fleet.pacing.humanize` { Humanize / Ping Jitter, unit ' ms' }. Each has `help.human` in
the copy-tone-guide's voice (Dynamics: "how much louder and softer this probe's notes vary from one to the next";
Rests: "how often a note stops early and leaves a gap before the next"; Accents: "how often a note is struck
differently — pushed, clipped short, or leaned on — and how many of those ways are used"; Humanize: "how far off
the grid, in milliseconds, every probe's notes may land — 0 is machine-exact"). The Levels, Composition and Pacing
intros gain one sentence / one `<li>` each.

---

## 2. Target File Structure

```text
src/
├── constants/index.ts                             + PERFORMANCE_MIN/MAX, HUMANIZE_MIN/MAX_MS, MIN_SOUNDING_SECONDS
├── types/
│   ├── Robot.ts                                   + ArticulationMark (+ names), MelodyEvent rest/mark, Robot dynamics/rests/accents
│   ├── Company.ts                                 + snapshot fields
│   └── session.ts                                 + diff fields, payload humanize
├── engine/
│   ├── articulation.ts / .test.ts                 NEW — ARTICULATION_MARKS, unlockedMarks, resolveArticulation
│   ├── melodyGenerator.ts / .test.ts              buildSeededPerformance, applyPerformanceMarks, DEFAULT_DYNAMICS/RESTS/ACCENTS
│   ├── regenerateMelody.ts / .test.ts             post-pass
│   └── AudioEngine.ts / .test.ts                  §1.3: NoteParams duration|position, velocity by position + dynamics, baseline 0.8, humanize, clickTrack entry
├── systems/
│   ├── spawnSystem.ts / .test.ts                  §1.4 draws, baseline, copy branch, post-pass
│   ├── robotOptionsActions.ts / .test.ts          applyDynamics, applyRests, applyAccents
│   └── companyOptions.ts / .test.ts               fallbacks
├── stores/audioStore.ts / .test.ts                humanize, setHumanize, HUMANIZE_UNSEEDED, regenerate wiring
├── utils/
│   ├── globalAudioSeed.ts / .test.ts              generateHumanize
│   ├── sessionDiff.ts / .test.ts                  diff / apply / capture / restore
│   └── sessionShareUtils.ts / .test.ts            dy/rt/ax, hm
├── data/
│   ├── robotOptionsConfig.ts                      DYNAMICS_SCHEMA, RESTS_SCHEMA, ACCENTS_SCHEMA, ARTICULATION_PANEL_SCHEMA
│   └── audioRigConfig.ts                          HUMANIZE_SCHEMA
├── content/copy/probe.ts, fleet.ts                §1.9
├── components/
│   ├── robot/AudioSettingSection.tsx / .test.tsx         Dynamics row
│   ├── robot/PingControlsDrawer.tsx / .test.tsx          Articulation row
│   ├── panels/screen/screens/RobotScreen.tsx / .test.tsx values + handlers
│   ├── panels/screen/screens/FleetParamsScreen.tsx / .test.tsx   Humanize
│   ├── company/useCompanyOptions.ts / .test.ts           values + handlers
│   └── company/CompanyOptionsSection.tsx                 pass-through
└── docs/robotPerformanceDocs.test.ts              NEW — cited symbols exist; gem source scan; MIN_LEAD − humanize ≥ 0.05
docs/
├── MELODY_SYSTEM.md                               MelodyEvent block, the post-pass, the two streams
├── AUDIO_SYSTEM.md                                playback loop: articulation, dynamics, humanize, baseline 0.8, position-keyed rolls
├── SESSION_STORAGE.md, COMPANIES.md               fields
├── reference/ROBOT_DATA_GRID.md, reference/SLIDER_VALUES.md   rows (incl. Load Min/Max)
├── PROCEDURAL_GENERATION.md                       dataIds robot.dynamics / robot.rests / robot.accents / globalAudio.humanize (audio.humanize was dropped in T20)
├── ROBOT_DESIGN.md                                one line: performance reaches the body through no dial
├── intent/robot-performance.md                    shipped banner
└── todo/roadmap.md, todo/backlog.md, todo/archive/backlog-archive.md   50.5 entry; item 21 archived
```

Not touched: `compositeVoice.ts` (it already accepts a seconds duration), `globalFx.ts`, `lfoEngine.ts`,
`audioSwells.ts`, `audioBudget*.ts` / `LOAD_*` constants, anything under `components/robot/gem/`, `RobotBody.tsx`,
`orbiterDials.ts`, the control primitives, `clickTrack.ts`, `harmonySystem.ts`, `transmissionPresets.ts` (an absent
`humanize` means the seeded value), `buildSeededComposition` and its key.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface, not a quiet widening.
- **Zero new Tone nodes.** The construction-count test in `AudioEngine.test.ts` stays at today's numbers. No new
  node, no new `Tone.*` import outside the existing `Tone.Time` use.
- **Trigger-time arithmetic only on the transport tick.** Every velocity, duration and time write stays inside
  `processMelodyStep` → `scheduleNote` → `triggerWithCap`; nothing touches a GSAP callback or a component (Strict
  Separation). `MIN_LEAD` is still applied to every note, and `MIN_LEAD − HUMANIZE_MAX_MS/1000 ≥ 0.05` is pinned by
  a test so the slider's range can never breach CLAUDE.md's lead rule.
- **JSON-serialisable state.** New fields are numbers and string literals on `Robot`, `MelodyEvent`,
  `audioStore`. `rest` and `mark` are absent, never `0` / `'none'`.
- **Melodies still store note indices**; nothing here writes a pitch string.
- **Replayability.** Every roll is a pure function of (`compositionSeed`, slider values, playback position) or
  (noise map, dataId, spawn offset). No `Math.random`, no `Date.now()`, no live counter on the playback path
  (assumption 8). Expectations that rebuilt a melody without the post-pass (the spawn capstone, `sessionDiff.test.ts`)
  gain it; none is loosened. (There was no standalone seeded-roster oracle to re-record; the survey had assumed one.)
- **Nothing on the robot body reads the new fields.** `robotPerformanceDocs.test.ts` greps
  `src/components/robot/gem/` and `RobotBody.tsx` for `\bdynamics\b`, `\brests\b`, `\baccents\b`, `\.rest\b`,
  `\.mark\b`, `humanize` and expects none; `OrbiterDialsInput` is unchanged.
- **Content:** every new word in `src/content/`; no guard exemptions.
- **Primitives:** none change; `CONTROL_SCHEMA_TYPES` stays 14.
- **Ask first:** copying marks across motif repeats (assumption 2 veto), keeping the baseline at 1 (assumption 6
  veto), a per-robot Humanize, any accent *placement* logic, any new dependency.
- **Never:** `.env*`, `node_modules/`, build output; relaxing a CLAUDE.md guardrail; skipping notes (the rejected
  "rests"); a gate multiplier on every note; anything that reaches the gem.

---

## 4. Code Style & Architecture Conventions

The articulation table, one place for every number a mark means:

```ts
// src/engine/articulation.ts
export const ARTICULATION_MARKS: Record<ArticulationMark, { velocity: number; length: number }> = {
  accent:        { velocity: 1.25, length: 1 },
  marcato:       { velocity: 1.4,  length: 0.75 },
  staccato:      { velocity: 1,    length: 0.5 },
  staccatissimo: { velocity: 1,    length: 0.25 },
  tenuto:        { velocity: 1.1,  length: 1 },
};

/** The kinds in play at an Accents value: 1–33 accent/tenuto, 34–66 + staccato/marcato, 67–100 + staccatissimo. */
export function unlockedMarks(accents: number): readonly ArticulationMark[] {
  if (accents <= 0) return [];
  if (accents < ACCENT_TIER_2) return ['accent', 'tenuto'];
  if (accents < ACCENT_TIER_3) return ['accent', 'tenuto', 'staccato', 'marcato'];
  return ARTICULATION_MARK_NAMES;
}
```

The velocity function, now position-keyed and dynamics-scaled:

```ts
// src/engine/AudioEngine.ts
export function computeNoteVelocitySeeded(robotId?: string, position?: number, robotArg?: Robot): number {
  const noiseMap = tryGetLocaleNoiseMap(getActiveLocaleId());
  if (!noiseMap) return clampVelocity(NOTE_VELOCITY_BASELINE);
  const robot = robotArg ?? (robotId ? findActiveRobot(robotId) : undefined);   // scheduleNote passes it in: one lookup per note
  // T20: with a position, roll = performanceRoll(seed, 'velocityRoll', position) and
  // variance = performanceRoll(seed, 'velocityVariance', position) * 2 - 1 (independent per robot and tick);
  // without one, the old robotNoteIndex path samples the noise map at (idx % VELOCITY_PERIOD), tests only.
  const s = resolveDynamics(robot) / DYNAMICS_NEUTRAL;                 // clamped 0–100, absent or NaN → 50; 50 → 1
  const rate = VELOCITY_VARIANCE_RATE * s;                             // at most 0.3
  const width = VELOCITY_VARIANCE_AMOUNT * s;
  const roll = (noiseMap(VELOCITY_ROLL_X, offset) + 1) / 2;
  if (roll >= rate) return clampVelocity(NOTE_VELOCITY_BASELINE);
  return clampVelocity(NOTE_VELOCITY_BASELINE + noiseMap(VELOCITY_VARIANCE_X, offset) * width);
}
```

Conventions: named module constants with a doc comment giving the audible meaning of each number; `satisfies` on
schemas; memoised handlers in drawers; `devWarn`, never `console`; CRLF files stay CRLF; test titles without
apostrophes; one commit per task with the spec section in the body.

---

## 5. Testing & Verification Requirements

Vitest + Testing Library, co-located. House rhythm: RED first, one commit per task, mutation check at the named
gates (see `docs/tasks/ROBOT_PERFORMANCE.md` once written).

- **articulation** — the table has the five names and nothing else; `unlockedMarks(0)` is empty, `(1)` and `(33)`
  two kinds, `(34)` four, `(67)` and `(100)` five; `resolveArticulation`: plain → `{1, 1}`; staccato → length 0.5;
  rest 0.6 alone → 0.4; rest 0.6 + staccato → 0.4 (the shorter wins); rest 0.6 + staccatissimo → 0.25; rest 0.6 +
  tenuto → 1 (tenuto cancels the rest), velocity 1.1.
- **melodyGenerator** — `applyPerformanceMarks`: determinism (same seed and values → identical stamps);
  `{ rests: 0, accents: 0 }` returns the input array's events untouched (`toBe` per event); at `rests: 100` every
  event has `rest` in `[0.25, 0.75]`; at `accents: 100` over 400 events all five marks occur; at `accents: 20` only
  accent and tenuto occur; the event count, `startStep`s, `length`s, `noteIndex`es and `pitchLocked` flags are
  identical before and after (Rests never changes density); changing `rests` does not change which events are
  marked (the four-draws-per-event stream contract, checked both with one shared `rand` and through
  `regenerateMelody`, where the seed-only key makes it true end to end); raising a slider only adds stamps;
  `buildSeededPerformance` differs from `buildSeededComposition` for the same seed; a `Math.random` spy sees nothing.
- **regenerateMelody / spawn** — a spawned robot's melody equals `applyPerformanceMarks(generateMelodyForRobot(…))`
  with the baseline's `rests` / `accents` (the capstone test gains the post-pass); `regenerateMelody` on an unedited
  robot reproduces the spawn melody, stamps included; editing `rests` regenerates stamps but not notes; the
  stale roster expectation (`sessionDiff.test.ts`'s NORMALIZED regenerate case) gains the post-pass; distribution over 400 seeded robots: `dynamics` in 25–75, `rests` in 10–60,
  `accents` in 20–80, each with at least 20 distinct values; the baseline equals the spawn for the same seed with a
  distinguishing value seeded ([[parity-test-fixture-non-default-values]]); the copy branch inherits all three.
- **AudioEngine** — `processMelodyStep` passes a seconds `duration` of `lengthSec × 0.5` for a staccato event and the
  original `NoteDuration` string for a plain one; never below `MIN_SOUNDING_SECONDS` and never above the written
  length; `accentMultiplier` is `1.25 × 1.4` for a marcato group-accent event and `undefined` for a plain one;
  `position` equals the step counter and keeps counting past 16; velocity at `dynamics: 50` follows a hand-checkable
  noise map scaled to the 0.8 baseline (a new oracle, its title naming the baseline change); `dynamics: 0` gives the
  baseline on every note; `dynamics: 100` doubles the rate and width; an out-of-range or NaN Dynamics is clamped or
  read as 50; two robots at the same position differ; the same robot at the same position repeats after
  `stop()` / `start()`; humanize (via `AudioEngine.setHumanize`): `0` → `time + MIN_LEAD` exactly; `20` → within
  `±0.020` of it, deterministic by position; click-track entries get no offset; the roster is read once per step and
  not at all at 0 ms; the setter clamps and survives `killAll()`; the construction count is unchanged; the legacy
  counter path still works when `position` is omitted; a seconds duration reaches the synth as its string, and
  `audioEngine/numericDuration.test.ts` pins against the real Tone that such a string reads as seconds.
- **Store** — `setHumanize` writes **and pushes `AudioEngine.setHumanize`** (as does the seed-once branch);
  `regenerateGlobalAudioFromSeed` seeds once and carries forward (the swell test, cloned); `generateHumanize` lands in
  2–6 ms, integer, distinct across styles.
- **Actions** — `applyDynamics` writes only the field and calls no engine method; `applyRests` / `applyAccents`
  write and call `regenerateMelody` with the new value.
- **Session** — a robot edited to `dynamics 70 / rests 30 / accents 60` diffs to exactly those keys; an untouched
  robot diffs `{}`; restoring regenerates a melody whose stamps match a fresh regeneration; a payload without the
  keys leaves absence; `humanize` captured and restored, absent leaves the seed. **Mutation check:** remove `accents`
  from the apply merge and watch the restore test go red.
- **Share** — `dy` / `rt` / `ax` / `hm` round-trip `toEqual`; garbage decodes to absent.
- **Company** — fallbacks, snapshot wins, each handler calls its action once per member and records the field;
  handler identities stable.
- **UI** — `AudioSettingSection` renders Dynamics with help and emits the value; `PingControlsDrawer` renders Rests
  and Accents, greyed while the click track plays; `FleetParamsScreen` renders Humanize in Pacing and writes the
  store; the company screen renders the same controls from the resolved value.
- **Docs (`robotPerformanceDocs.test.ts`)** — every backticked symbol in this spec and the updated docs exists; the
  gem scan from §3; `MIN_LEAD − HUMANIZE_MAX_MS / 1000 ≥ 0.05`; `MELODY_SYSTEM.md`'s `MelodyEvent` block names
  `rest` and `mark`; `SESSION_STORAGE.md` names the four fields.
- **Content** — `content.test.ts` green; `help` on every new value control.
- **Lint / type / build** clean at every checkpoint.

**Performance gate (Crawford, final checkpoint).** On the Pixel, the seed-`alpha` `?session=` world from the
baseline section, `?debug` HUD, 3:00 each, branch vs `main` at the branch base, **Standard then Full**:
output-underrun count expected **flat** (0 at Full on `main`). Desktop `npm run perf` before/after, expected flat.
There is no node to put behind a `LOAD_*` threshold; a rise here would point at the once-per-step roster fetch for
Humanize or the `Tone.Time` conversion for stamped events (there is no per-step store read: Humanize is pushed), the
latter of which has a cheaper form (cache the seconds per `NoteDuration` per BPM).

**Listen checkpoints (Crawford, one per control, in build order).** Dynamics: at 0 a robot is metronomic, at 100 it
breathes; at 50 nothing has changed except the fleet is a touch quieter (baseline 0.8). Rests: drag one robot to 100
and hear its line open up; density is unchanged (count the onsets). Accents: at 100 the five marks are all
distinguishable on a slow robot — pushed, hard-and-short, clipped, very clipped, leaned-on. Humanize: at 20 ms the
fleet loosens; at 0 it locks; if 20 is inaudible against twelve robots, Humanize is cut (intent). Then: save,
reload, share-link, company broadcast, keyboard, every "?", nothing on any gem changed.

---

## 6. Git & Workflow Context

- Branch `feature/palette-performance`, off `main` at `2ec52f2f`. One commit per task, imperative subject, body
  cites the spec section, co-author trailer. Crawford merges.
- Roadmap **50.5** is new: the last task writes it under roadmap 50 with a status line and the "as built" deltas,
  and moves backlog 21 to `docs/todo/archive/backlog-archive.md` with a pointer to this spec and the intent.
- Docs land in the last task; `docs/intent/robot-performance.md` gets the shipped banner.
- `docs/todo/*.md` may be edited concurrently by another session: append-only, re-read first
  ([[audio-palette-roadmap-49]]).

---

## 7. Open Questions & Risks

**As built, Phase 1 (T1–T6, 2026-10-15).** Four places where the code departs from this spec's first draft, all
reflected above: (1) the marks' stream is keyed on `compositionSeed` alone (assumption 2); (2) Humanize reaches the
engine by push, `AudioEngine.setHumanize`, not a store read (assumption 9), so T11's store action must call it;
(3) the engine clamps Dynamics and the `min(1, rate)` cap is gone (assumption 7); (4) there was no determinism oracle
to re-record. The `CompanyOptionsSnapshot` fields land in T14, not T1 (`resolveCompanyOptions` returns
`Required<CompanyOptionsSnapshot>`, so adding them earlier forces resolver behaviour into a types-only task).

**For Crawford — veto points, none blocking:** assumption 2 (marks per event vs copied across motif repeats),
assumption 6 (the 0.8 velocity baseline), assumption 10 (Humanize in the Pacing top row), the tier boundaries and
multipliers in assumption 5, the seed ranges in assumption 13, and the placeholder lore words. One naming clash: the
Levels nav row is already "Dynamics / Output" (`probe.dynamics`), so a slider called Dynamics sits inside a section
the tree calls Dynamics; "Expression" or "Swing" would avoid it — the human word is Crawford's call.

**Risks:**

1. **The baseline drop changes every world's level by about 2 dB.** Intended, but the Pixel baseline world will sound
   quieter than the recorded run; the A/B compares underruns, not loudness, so the baseline stays valid. If the drop
   is felt, a +2 dB trim on the master gain is a one-line follow-up.
2. **Position-keyed velocity changes today's velocity pattern** for every robot (assumption 8). Pre-v1 and intended;
   no existing test pinned the variance maths, so the new hand-checkable oracle names the baseline change in its title.
3. **A rest on a 16th at 98 BPM leaves 0.04–0.11 s of sound**; with a long attack the note may never reach its peak.
   `MIN_SOUNDING_SECONDS` floors it; the shaped-attack ranges from 50.1 (0.03–0.25 s) keep most robots audible. If
   rested 16ths read as clicks, raise the floor or exempt `16n` events from rests (a one-line change in the
   post-pass).
4. **Humanize at the composite voice.** A note shifted early by up to 20 ms still lands after the previous layer
   trigger (+1 ms rule) and after `Tone.now()`; a note shifted late by 20 ms on a `16n` is 13 % of the note — audible
   as feel, not as a wrong note. If the fleet smears at 20, lower `HUMANIZE_MAX_MS`.
5. **Four draws per event, always**, so a slider change re-stamps without shifting later events' rolls. If a future
   mark needs a fifth draw, add it for every event or the stream contract breaks; the test pins it.
6. **The restore path and melodies.** If `applySessionPayload` re-registers the stored melody for a robot with
   composition overrides instead of regenerating, restored `rests` / `accents` would be inert until the next edit.
   The session task verifies the call and adds the regeneration if missing.
7. **`accentMultiplier` now carries two meanings** (group accent × mark). Fine while both are multipliers; if a
   future phase needs them apart, split the parameter then.
