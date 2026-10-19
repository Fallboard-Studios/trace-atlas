# Intent: Global Pedals — Chorus, Tremolo, Vibrato, Frequency Shifter and Stereo Width on the Global Chain

Confirmed via `interview-me` on 2026-10-17 (6 questions; one guess overturned — "all eight in one pass" became the
five dry-chain pedals now and the two room type radios later), ahead of a `spec-driven-development` pass. Backlog
item 22 ([docs/todo/backlog.md](../todo/backlog.md#22-audio-palette-trials-more-global-pedals-to-audition)), the next
item on the Audio Palette menu (roadmap 50) after 50.1–50.5 merged to `main` (PRs #555–#559). Not yet a roadmap
entry; the spec pass gives it a number.

## Outcome

Five more single-instance Tone 15 effects on the global chain. **Chorus**, **Tremolo**, **Vibrato** and
**FrequencyShifter** become four more sub-tabs on the Modulation section tab, beside AutoWah and Phaser, each a node
on the dry chain after the Phaser and before the Compressor. **StereoWidener** becomes a Width slider on the Output
section tab, placed after the Reverb and Delay returns rejoin and before the Limiter, so Width 0 folds the whole
output, rooms included, to mono for a phone speaker. Every parameter is on screen with a lore name; a fresh world
lights a pedal or two, quietly; by hand, any of them can be pushed hard.

- **User:** Crawford, composing a world — more motion and width in the fleet's transmission, with the full
  parameter set because the point of the series is options.
- **Why now:** the whole series is merged, `wireGlobalFxChain` is still the one wiring point, and the Phaser's
  Free | Sync rail is in place for three more rates to use.
- **Success:** every parameter is a slider, with Free | Sync on the three LFO rates; a lit world sounds moved
  or widened as a hint, not a wash, and worlds differ in which; a hand edit can take any pedal to its loudest;
  the settings survive a session save, reload and share link; the Pixel worst-case run shows no rise in
  underruns against a fresh baseline on `main`, with the HUD's counts written down this time.

## Behavior

- **Four motion pedals on the dry chain, after the Phaser.** Order: EQ3 → LPF → HPF → Distortion → Chebyshev →
  Bit Crusher → AutoWah → Phaser → **Chorus → Tremolo → Vibrato → FrequencyShifter** → Compressor → Limiter. The
  Reverb and Delay returns rejoin at the Compressor or Limiter by Decay Mode as since 50.2, so the rooms' tails are
  never chorused, wobbled or shifted. The order of the four among themselves is a spec listening call; the order
  above is the starting point.
- **The widener is last, after the join.** It sits after the Compressor (Natural Decay) or after the returns' join
  at the Limiter's input (Controlled Decay) and before the Limiter, so it is the one node that hears the rooms. Width
  0 is the phone mono fold, Width 0.5 is Tone's neutral (`Mid *= 2*(1-width)`, `Side *= 2*width`), Width 1 is all
  side. It is a stereo stage, not motion, so it lives on Output beside the Compressor and Limiter.
- **Every parameter exposed.** Chorus: Rate (`frequency`, Free | Sync), Delay Time (`delayTime`, ms), Depth,
  Spread, Feedback (a Chorus with feedback is Tone's flanger), Mix (`wet`). Tremolo: Rate (Free | Sync), Depth,
  Spread, Mix. Vibrato: Rate (Free | Sync), Depth, Mix. FrequencyShifter: Shift (`frequency`, Hz, signed), Mix.
  StereoWidener: Width only (a mid/side stage has no wet; Width is the whole control). Each pedal keeps its own
  Mix; "off" is a pedal's Mix at zero. The LFO waveform `type` on the three LFO pedals is **not** exposed (sine).
- **Three more Free | Sync rates** (roadmap 33, [FREE_SYNC_TOGGLE.md](../specs/FREE_SYNC_TOGGLE.md)), on the
  Phaser's rail: Free is a Hz slider; Sync is a note value resolved to Hz at the current tempo, re-applied on a
  tempo change. The stored shape follows the Phaser's: a `rate` plus an optional `sync` note value. The three
  internal LFOs are wall-clock, the LFO Bank's accepted class (backlog 17). The shifter and the widener have no
  clock and get no toggle.
- **Seeded lit, not dark, with lower odds and a cap.** Each motion pedal has its own independent draw, lit in
  about one fresh world in four (down from 50.4's one in three, since four more draws stack on the two existing
  ones), independent of the other pedals and of Colour, with a **cap: no fresh world lights more than two of the
  six Modulation pedals** (AutoWah, Phaser and these four). The FrequencyShifter has the lowest odds of the four and
  a small shift band, because even a low seeded shift ring-modulates the whole fleet. A lit pedal seeds its Mix in
  a low tapered band; a dark pedal seeds Mix 0 but still draws its shape values, so switching it on by hand lands
  somewhere seeded. The widener seeds in a band around 0.5 and never near 0: the mono fold is a hand setting only.
  The exact odds, the cap's mechanism and the bands are spec decisions tuned by ear at a checkpoint, as 50.4's were.
- **The Mix is tapered like Colour's and the pedals'** (`colourWetGain`, squared at the node). Seeded ceilings are
  the spec's, retuned by ear; the pedal Mix does not share `COLOUR_LOAD_MIX_MAX`.
- **Saved.** All five settings live on `GlobalAudioSettings` and travel whole in the session payload and the share
  link. A payload saved before this phase lacks them and loads dry (widener at 0.5) through
  `withGlobalAudioDefaults`, no encoding change. Presets stay clean (every pedal Mix 0, Width 0.5).
- **Seeded like the other global fields.** New draws in `globalAudioSeed.ts`, rows in `GLOBAL_AUDIO_SEED_RANGES` /
  `GLOBAL_AUDIO_LOADING_RANGES`, mirrored in `GLOBAL_CHAIN_GRID.md` and the themes idea. Uniform draws
  (`getUniformSeededVal`), as 50.4 settled.
- **Nothing per robot, nothing on the gem.** No pedal is an LFO Bank or swell target. Nothing reaches the robot's
  body (Visual Mapping guardrail).

## Style / constraint

- **UI:** four more `AUDIO_RIG_CONFIG` blocks rendered as sub-tabs of the existing Modulation `FleetParamsGroup`
  on the `spectral` trait, through the existing block → `AudioRigEffectPanel` path; one Width row on the Output
  group. No new trait, no new section tab. Existing primitives only (`TempoSyncSlider` / `TempoSyncToggle` for the
  three rates); a help popover per control; lore names in the copy-tone-guide's voice in `src/content/copy/fleet.ts`,
  placeholders until the copy pass, never a literal in a component.
- **Nodes:** five single instances on the global chain. Every AudioParam write stays in `globalFx.ts` setters called
  from `audioStore`, never from a GSAP callback (Strict Separation). State stays JSON-serialisable; nodes live in
  the engine.
- **The phone gate, done properly this time.** 50.4's gate was left half-open ("some underruns" at Full, no counts,
  no re-baseline, [scratchy-audio-phones.md](../todo/scratchy-audio-phones.md#global-modulation-roadmap-504-on-the-pixel--crawfords-report-2026-10-15)).
  So: (1) re-baseline on current `main` first — the series world (seed `alpha`, camera 0/50, defaults), Full and
  Standard, 3:00 each, HUD start and end `underruns`; (2) one worst-case run on the branch, all seven pedals at full
  Mix with the Phaser at 12 stages, Full and Standard, counts recorded; (3) bisect pedal by pedal **only if** the
  worst case raises the count — the three LFO pedals are the suspects. A pedal that fails ships behind a new
  `LOAD_*_MIN` Effects Limit threshold or goes back to backlog 22 as "tried, no". Plus `npm run perf` on the
  desktop before and after.
- **Spec work only on `perf/per-mover-layers`** (Crawford, 2026-10-17): the branch carries roadmap 53's build in
  another session. The intent, spec and plan are written there; the build gets its own branch off `main`.
- Pre-v1: every fresh world's sound changes by design; no "keep existing worlds the same" constraint.

## Out of scope

- **The two room type radios** — `PingPongDelay` on the Delay row and `Freeverb` / `JCReverb` on the Reverb row —
  stay in backlog 22 as their own later phase. They swap a room node that twelve robot send Gains are wired into (a
  different kind of change from a chain slot), and the backlog's "cheaper per sample" claim is wrong for Tone 15:
  both reverbs are AudioWorklet nodes now, which Tone's own docs flag for performance degradation. The spec pass
  amends the backlog text.
- **The LFO waveform `type`** on Chorus, Tremolo and Vibrato.
- **LFO Bank or swell targets on any pedal parameter.**
- **Per-robot sends into the pedals** — the colour-sends idea's shape; its own interview and spec.
- **A new trait, section tab or accent.**
- **Any change to AutoWah, Phaser or Colour's seeding**, beyond the shared two-of-six cap.
- **Holding existing worlds to their current sound.**

## Known implementation notes (not yet spec'd)

- **Tone facts** (15.1.22, from the `.d.ts` and `getDefaults`). `Chorus` extends `StereoFeedbackEffect`:
  `frequency` (Signal, default 1.5 Hz), `delayTime` (ms, default 3.5), `depth` (0–1, 0.7), `spread` (degrees, 180),
  `feedback` (0–1), `type`, `wet`. `Tremolo` extends `StereoEffect`: `frequency` (Signal, 10 Hz), `depth` (0.5),
  `spread` (180), `type`, `wet`; the modulation phase is inverted per channel. `Vibrato` extends `Effect`:
  `frequency` (Signal, 5 Hz), `depth` (0.1), `maxDelay` (0.005 s, constructor-only — the Depth ceiling),
  `type`, `wet`. `FrequencyShifter`: `frequency` (Signal, 0 Hz, signed, ±sampleRate/2; aliases towards the top,
  Tone suggests low-passing first — the global LPF is upstream). `StereoWidener` extends `MidSideEffect`:
  `width` (Signal, 0–1, default 0.5).
- **Three of the five must be started.** `Chorus`, `Tremolo` and `Vibrato` carry an LFO with `start()` / `stop()`
  (`LFOEffect` for the last two, Chorus has its own); a constructed-but-unstarted pedal is silent motion. The spec
  decides whether the LFO runs always (simplest; the Phaser's does) or starts when Mix leaves 0. Never `sync()` the
  LFO to the transport — Sync here means the Phaser's resolved-Hz treatment, not Tone's transport sync.
- **Chain slot.** `wireGlobalFxChain` ([globalFx.ts:293](../../src/engine/audioEngine/globalFx.ts#L293)) builds the
  dry chain from one `chainNodes` array ending `_globalPhaser, _globalCompressor, _globalLimiter`; the four motion
  pedals slot in after `_globalPhaser`. The widener is **not** in that array's dry run: it goes between the join
  and the Limiter in both Decay Modes, which means the returns' `join` target (`:336`) becomes the widener's input
  under Controlled Decay, or the Compressor's output feeds it under Natural. `disconnectAllFxNodes` must list all
  five; construction guarded with `getToneCtor` for headless tests. The Phaser rebuild re-runs the wiring, so the
  new nodes survive a Stages change for free.
- **Free | Sync rail.** `resolvePhaserRateHz`, `allowedPhaserNoteValues`, `phaserToSync`, `phaserToFree`
  ([tempoSync.ts:117–212](../../src/utils/tempoSync.ts#L117-L212)) and `setPhaserSyncMode` in `audioStore.ts` are the
  single-rate precedent; three more fields want the same four helpers or one generic rate helper the Phaser
  migrates to. Whatever re-pushes the Phaser on a tempo change must re-push these.
- **The rail every global field runs on**, unchanged since 50.3 / 50.4: `GlobalAudioSettings` +
  `DEFAULT_GLOBAL_AUDIO_SETTINGS` + `withGlobalAudioDefaults` (`src/types/globalAudio.ts`);
  `GlobalAudioSeedFieldKey` + the two range tables; `sampleField` draws in `src/utils/globalAudioSeed.ts`
  (`PEDAL_LIT_EDGE`, `PHASER_SYNC_ODDS` at `:145` are the odds precedents); `AudioRigEffectKey` + a block in
  `AUDIO_RIG_CONFIG` (`src/data/audioRigConfig.ts`, the `autoWah` block at `:156` is the template); `GLOBAL_SETTER`
  and `applyGlobalAudioToEngine` in `src/stores/audioStore.ts`; a `setGlobalX` in `globalFx.ts` with the
  colour-style clamp of every incoming value (share links are untrusted); the Modulation group's sub-tab list and
  `FLEET_PARAMS_GROUP_CONTENT`; `src/docs/globalModulationDocs.test.ts` guards the docs and the gem source scan.
- **The two-of-six cap** is new: today each pedal rolls independently. The spec picks the mechanism (an ordered
  roll where later pedals are skipped once two are lit, or a seeded pick of up to two from six) and keeps the
  AutoWah and Phaser oracles honest — any change to their roll moves the hand-amended seed oracles.
- **Effects Limit, if needed.** `effectsLoadToLimits` (`src/utils/audioBudget.ts`) is where a `LOAD_*_MIN` would
  join the existing thresholds. Only if the A/B asks for it.
- **Backlog text to amend in the spec pass:** `globalFx.ts:144` → `:293`; the Freeverb / JCReverb cost claim.
- Verify every file:line against the tree before building — the tree moves.
