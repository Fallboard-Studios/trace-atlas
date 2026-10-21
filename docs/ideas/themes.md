# Idea: Themes — one named set of loading bands, system-wide

**Status:** idea, 2026-10-09. Not interviewed, not specced. Came out of the layout-rework sketching session (docs/sketches/layout-rework.html, Off tab) the moment the powered-off screen was approved with the world faintly visible behind the glass: if the world is built before power-on, the splash becomes a place to choose things before any sound plays.

## What

A **theme** is a named set of min / max **loading bands** applied system-wide at generation time. Picking one changes what a fresh seed is allowed to roll for every seeded attribute, not what the UI can reach afterwards. Three to start:

| Theme | Intent | Illustrative bands (placeholders, not tuned) |
|---|---|---|
| **Calm** | slow tempos, long delays and reverb, longer robot tones | 60–78 BPM · reverb decay 4–8 s · delay ½–1 bar · attack / release toward the long end |
| **Classic** | the default; exactly what is already built | today's bands, byte-for-byte |
| **Active** | faster BPM and settings to match | 118–150 BPM · reverb 0.4–1.2 s · delay 1/16 · short envelopes, higher density |

Crawford's framing: "a theme adjusts the min load and max load attributes system wide."

## Why now

- The off screen with the faint world is approved (layout rework, 2026-10-09). The app will build the world before power-on, so the splash can carry a **Transmission** row — Crawford: "three presets and then the user's saves if they have any" (a preset is a factory transmission, i.e. a curated session; a save is one of the user's own from the Sessions list) — and a **Theme** row. Picking either retransmits the faint world as a silent preview; the rocker stays the only way to start sound.
- The "loading band" concept already exists in code, so a theme is a table swap, not a new mechanism (see below).

## What already exists (verified 2026-10-09)

- `src/data/globalAudioLoadingRanges.ts` — `GLOBAL_AUDIO_LOADING_RANGES`: the narrower per-field sub-ranges a fresh seed may roll within, for the global chain (EQ, filters, delay, reverb, compressor …). Its header says it mirrors the **"Loading Range" column of `docs/reference/GLOBAL_CHAIN_GRID.md`**, which is the source of truth. The full/UI ranges are a separate table (`GLOBAL_AUDIO_SEED_RANGES`) that LFOs and sliders keep using — a theme must not touch those.
- `src/utils/globalAudioSeed.ts` is the main reader of the loading table (16 `getSeededVal` calls). Since Robot Sends (roadmap 50.2) the table's two `wet` rows (`delay.wet` `0–0.3`, `reverb.wet` `0.1–0.4`) are no longer rolled for the global rooms, which now load a fixed return of `1`; `generateRobotSends` in `src/systems/spawnSystem.ts` reads them instead, as the bands each robot's own Reverb and Delay send is seeded from. A theme that swaps those two rows therefore changes how deep into the echo each robot sits, not how loud the room is.
- **Global Colour (roadmap 50.3, built 2026-10-15) adds two more tables a theme may swap:** `COLOUR_CHARACTER_BANDS` in `src/utils/globalAudioSeed.ts` (the clean / drive / fold / crush shares, about 25 % each today, fitted to a bell-curved, discrete draw, so a theme that moves the shares needs the edges refitted) and the three colour Mix rows of `GLOBAL_AUDIO_LOADING_RANGES` (Distortion 0.2–0.3, Chebyshev and Bit Crusher 0.25–0.35, under the 0.35 load ceiling `COLOUR_LOAD_MIX_MAX`; the Classic Band Retune, 2026-10-21, is this table's Classic column).
- **Global Modulation (roadmap 50.4, built 2026-10-15) adds a third pair:** `PEDAL_LIT_EDGE` in `src/utils/globalAudioSeed.ts` (each pedal lit in about a third of fresh worlds, independently of the other and of Colour; `PEDAL_SYNC_ODDS` is a per-pedal record, the share of each lit LFO pedal that seeds Sync: 0.75 for the Tremolo, 0.5 for the others) and the thirteen pedal rows of `GLOBAL_AUDIO_LOADING_RANGES` (the AutoWah and Phaser bands, with Mix 0.2–0.5 and 0.15–0.4, which no longer share the 0.25 colour ceiling). The draws are uniform, so a theme that moves an edge needs no refitting, only the calibration test's target.
- **Global Pedals (roadmap 50.6, built 2026-10-18 to 2026-10-21) widens that pair:** `PEDAL_LIT_EDGE` gains four nominal edges (Chorus, Tremolo, Vibrato 0.25, shifter 0.15), rolled in chain order after the AutoWah and Phaser under a sequential cap of two lit Modulation pedals per world (`MAX_LIT_PEDALS`), and `GLOBAL_AUDIO_LOADING_RANGES` gains sixteen rows (Width seeds 0.4–0.65 in every world, with no roll). The cap makes the realised shares lower than the edges (measured 22.68 / 19.33 / 16.75 / 8.20 %), so a theme that wants more pedals moves an edge or the cap, then updates the calibration test's measured figures.
- Robot-side bands are constants in `src/systems/spawnSystem.ts` (`ATTACK_RANGE`, `DECAY_RANGE`, `SUSTAIN_RANGE`, `RELEASE_RANGE`, `FILTER_FREQ_RANGE`, master volume min/max, …; 51 `getSeededVal` calls in that file), with `docs/reference/ROBOT_DATA_GRID.md` as their grid. Density / motif length / octave bands live there too.
- Tempo: `src/utils/bpmSeed.ts` — `BPM_SEED_RANGE = { min: 40, max: 100 }`, seeded by the Attenuation Style (Free | Sync toggle work moved BPM there).
- The session payload (`docs/SESSION_STORAGE.md`) and the share link carry the Attenuation Style name and coordinates; **neither carries a theme yet**, so a theme would be a new payload field (and a compact wire code on the link), the same way the cue measure would be.

So "Classic = today" is literally the current tables; Calm and Active are two more columns in the same grids.

## How it might work

1. A `Theme` = `{ id, bands: { global: Partial<Record<GlobalAudioSeedFieldKey, LoadingRange>>, robot: Partial<Record<RobotBandKey, LoadingRange>>, bpm: LoadingRange } }`; a missing key falls back to Classic's band. Classic's tables are the ones that exist today, moved under a name.
2. A `themeStore` (JSON: just the id) read by `globalAudioSeed.ts`, `bpmSeed.ts` and `spawnSystem.ts` where they currently read the constants. Changing the theme = `retransmitWorld` (the world is regenerated inside the new bands), exactly as changing the Attenuation Style does.
3. Splash: two single-line cabinetry radio rows under the etched label (Transmission preset, Theme) and a well readout naming the pick. Also reachable later in Settings → Audio Seeds beside the Attenuation Style radio.
4. Payload + link: `theme: 'calm' | 'classic' | 'active'`, absent = classic, so every existing save and link keeps meaning what it meant.
5. The grids (`GLOBAL_CHAIN_GRID.md`, `ROBOT_DATA_GRID.md`) gain one Loading Range column per theme, and the tables mirror them, keeping the existing "the grid is right, the file has drifted" rule.

## Decided (Crawford, 2026-10-09)

- **Themes only impact generation.** They set the loading bands a fresh seed rolls within; they never change a slider's range, never clamp an edit, and never touch the LFO swing ranges (`GLOBAL_AUDIO_SEED_RANGES` stays as is).
- **Switching a theme has the same result as changing coordinates or loading a new session:** the world is retransmitted inside the new bands and live tweaks are discarded. No override-preserving merge.

## Open questions (for an /interview-me pass)

- **Does the theme tint anything visible?** A theme could change nothing but sound; or the splash readout; or, later, the world's pacing (robot activity speed is wall-clock, Phase 43). Lean: sound only, v1.
- **Audio Load Budget interaction:** Active (faster, denser) costs more on phones. Does Active imply a floor on Robot / Effects Load, or stay independent? Lean: independent, documented.
- **How many themes, and are they fixed or user-authored?** Three fixed to start. A user-authored theme is a band editor — out of scope.
- **Where the tuning happens:** the bands need real listening, per theme, per grid row. That is the bulk of the work, not the plumbing.

## Not doing (and why)

- **Themes as full presets of exact values** — that is what a saved session already is. A theme is bands, not values; the seed still rolls inside them.
- **Changing UI ranges or LFO swing ranges** — `GLOBAL_AUDIO_SEED_RANGES` stays as is; see the loading-ranges header comment for why LFOs need the full range.
- **Building this inside the layout rework** — the splash pickers are layout; the theme engine is its own phase after the rework ships. The sketch shows the pickers with placeholder band figures only.
