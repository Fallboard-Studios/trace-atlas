# Tone.js Effects Inventory

Every Tone.js effect node the app builds, one row per controllable parameter, with its scope, default, full range, seed band, control type and seeding rule. Compiled 2026-10-19 on `feature/pedals` from the code, not the docs: `src/data/audioRigConfig.ts`, `src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioLoadingRanges.ts`, `src/types/globalAudio.ts`, `src/engine/audioEngine/globalFx.ts`, `src/engine/AudioEngine.ts`, `src/engine/lfoEngine.ts`, `src/utils/globalAudioSeed.ts`, `src/systems/spawnSystem.ts`, `src/data/robotOptionsConfig.ts`, `src/constants/index.ts`.

`docs/reference/GLOBAL_CHAIN_GRID.md` remains the source of truth for the global chain's ranges and labels. This file is the wider inventory: it adds the per-robot nodes, the rooms and returns, the LFO Bank, the master gain, and the seeding rule for every row. Where the two disagree, see **Discrepancies** at the end.

## Columns

- **name** — the effect as the UI names it, with the Tone class in brackets.
- **param** — the stored field, with Tone's own name where it differs, and the unit.
- **global / per robot** — one node for the fleet, or one per reserved robot.
- **role** — `dry stage` (in the global chain), `room`, `return`, `send`, `bus` (per-robot sub-bus), `master`, `routing`, `modulator`.
- **default** — `DEFAULT_GLOBAL_AUDIO_SETTINGS` or the spawn default. `seeded` means every fresh value comes from the seed band.
- **min / max** — the full range: what the slider exposes and what the app supports.
- **seedMin / seedMax** — the band a fresh seed may land in. Blank means the field is not seeded.
- **input type** — the control primitive and its scale or step.
- **options** — for radios, toggles and Free | Sync rows.
- **loading rules** — how a fresh world seeds the row: the draw kind (`bell` is one `getSeededVal` sample, `uniform` is `getUniformSeededVal`), any lit/dark roll, and anything not seeded.
- **notes** — stored-versus-node conversions, ramps, rebuilds, LFO and swell eligibility, and Audio Load gates.

Three conversions recur. Every Mix (`wet`) on Colour, Modulation and the motion pedals is stored as the slider position and reaches the node **squared** (`colourWetGain`), and the bypass cell's wet layer is `sin(π/2 · mix²)`: about −48 dB at a slider of 0.05, −29 dB at 0.15, −20 dB at 0.25, −14 dB at 0.35, −8 dB at 0.5. The bottom third of every Mix slider is near silence, which is why the seed bands' floors sit at or above 0.2 (the Classic Band Retune, 2026-10-21). Robot Volume and the master gain go through a 40 dB perceptual taper (`volumePositionToGain`). Sends, pan and volume are stored 0–1 (pan −1..1) and displayed ×100.

"Lit" and "dark" are the seeder's own terms: a lit node seeds its Mix inside the band; a dark node seeds Mix 0 but still draws every other field from its band, so a hand nudge of Mix hears something at once.

## Global dry chain, in chain order

EQ → LPF → HPF → Distortion → Chebyshev → BitCrusher → AutoWah → Phaser → Chorus → Tremolo → Vibrato → FrequencyShifter → Compressor → Width → Limiter → master gain → Destination. The Reverb and Delay rooms sit beside the chain; their returns rejoin at the Compressor's input (Natural Decay) or at Width's input (Controlled Decay).

| name | param | global / per robot | role | default | min | max | seedMin | seedMax | input type | options | loading rules | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EQ (Tone.EQ3) | low (dB) | global | dry stage | 0 | −12 | 12 | −6 | 6 | slider centred-zero, step 0.5 | | bell draw in band | LFO link + swell target |
| EQ | mid (dB) | global | dry stage | 0 | −12 | 12 | −6 | 6 | slider centred-zero, step 0.5 | | bell draw in band | LFO link + swell target |
| EQ | high (dB) | global | dry stage | 0 | −12 | 12 | −6 | 6 | slider centred-zero, step 0.5 | | bell draw in band | LFO link + swell target |
| Low-Pass Filter (Tone.Filter, lowpass) | frequency (Hz) | global | dry stage | 20000 | 20 | 20000 | 2000 | 20000 | slider log | | bell draw | LFO link + swell target; ramps 50 ms; LFO link held off below Effects Load 0.4 |
| Low-Pass Filter | Q | global | dry stage | 1 | 0.1 | 20 | 0.1 | 5 | slider log | | bell draw | LFO link + swell target; same gate |
| High-Pass Filter (Tone.Filter, highpass) | frequency (Hz) | global | dry stage | 20 | 20 | 20000 | 20 | 120 | slider log | | bell draw | LFO link + swell target; ramps 50 ms; same gate |
| High-Pass Filter | Q | global | dry stage | 1 | 0.1 | 20 | 0.1 | 5 | slider log | | bell draw | LFO link + swell target; same gate |
| Distortion (Tone.Distortion) | amount, Tone `distortion` | global | dry stage | 0.3 | 0 | 1 | 0.1 | 0.35 | slider, step 0.01 | | always drawn | direct write (rebuilds the shaper map); `oversample` fixed at `'none'` |
| Distortion | wet (Mix) | global | dry stage | 0 | 0 | 1 | 0.2 | 0.3 | slider, step 0.01 | | one Colour character draw: clean / drive / fold / crush, ≈25 % each (`COLOUR_CHARACTER_BANDS`); at most one colour lit; dark seeds 0 | node gets wet²; ramps 50 ms; seeded ceiling `COLOUR_LOAD_MIX_MAX` 0.35 |
| Chebyshev (Tone.Chebyshev) | order | global | dry stage | 2 | 1 | 8 | 2 | 5 | slider, step 1 | | always drawn | direct write; 1 passes unchanged; Tone allows 100, capped at 8 |
| Chebyshev | wet (Mix) | global | dry stage | 0 | 0 | 1 | 0.25 | 0.35 | slider, step 0.01 | | lit only when the character is `fold` | node gets wet²; ramps 50 ms |
| BitCrusher (Tone.BitCrusher, AudioWorklet) | bits | global | dry stage | 8 | 1 | 16 | 6 | 10 | slider, step 1 | | always drawn | ramps 50 ms; if the browser refuses the worklet the slot is skipped |
| BitCrusher | wet (Mix) | global | dry stage | 0 | 0 | 1 | 0.25 | 0.35 | slider, step 0.01 | | lit only when the character is `crush` | node gets wet²; ramps 50 ms |
| AutoWah (Tone.AutoWah) | baseFrequency (Hz) | global | dry stage | 100 | 50 | 1000 | 50 | 250 | slider log | | always drawn, uniform | plain property in Tone 15 |
| AutoWah | octaves | global | dry stage | 6 | 1 | 8 | 2.5 | 5 | slider, step 0.5 | | uniform | plain property |
| AutoWah | sensitivity (dB) | global | dry stage | 0 | −40 | 0 | −20 | −5 | slider, step 1 | | uniform | plain property |
| AutoWah | Q | global | dry stage | 2 | 0.5 | 10 | 2 | 6 | slider log | | uniform | Signal; ramps 50 ms |
| AutoWah | gain (dB) | global | dry stage | 2 | 0 | 20 | 2 | 6 | slider, step 0.5 | | uniform | Signal; ramps 50 ms |
| AutoWah | follower (s) | global | dry stage | 0.2 | 0.01 | 1 | 0.1 | 0.4 | slider log | | uniform | plain property |
| AutoWah | wet (Mix) | global | dry stage | 0 | 0 | 1 | 0.35 | 0.5 | slider, step 0.01 | | lit in ≈1/3 of worlds (`PEDAL_LIT_EDGE`, uniform draw, independent of Colour and of the Phaser); dark seeds 0 | node gets wet²; ramps 50 ms |
| Phaser (Tone.Phaser) | rate, Tone `frequency` (Hz) | global | dry stage | 0.5 | 0.05 | 10 | 0.1 | 2.5 | slider Free \| Sync, step 0.05 | Sync: a note value (`PhaserSettings.sync`) | a lit Phaser seeds Sync ≈50 % (`PEDAL_SYNC_ODDS.phaser`); a dark one is always Free | wall-clock LFO; ramps 50 ms; range is `PEDAL_RATE_RANGE_HZ` |
| Phaser | octaves | global | dry stage | 3 | 0.5 | 6 | 2 | 5 | slider, step 0.5 | | uniform | |
| Phaser | baseFrequency (Hz) | global | dry stage | 350 | 50 | 2000 | 200 | 800 | slider log | | uniform | |
| Phaser | stages | global | dry stage | 10 | 1 | 12 | 4 | 12 | slider, step 1 | | uniform | constructor-only in Tone: a change rebuilds the node from the last-written values and re-wires the chain in the last Decay Mode |
| Phaser | Q | global | dry stage | 10 | 0.5 | 20 | 1 | 10 | slider log | | uniform | ramps 50 ms |
| Phaser | wet (Mix) | global | dry stage | 0 | 0 | 1 | 0.3 | 0.4 | slider, step 0.01 | | lit ≈1/3, independent of the AutoWah | node gets wet²; ramps 50 ms |
| Chorus (Tone.Chorus) | rate, Tone `frequency` (Hz) | global | dry stage | 1.5 | 0.05 | 10 | 0.2 | 2 | slider Free \| Sync, step 0.05 | Sync: a note value | a lit Chorus seeds Sync ≈50 % | LFO started once at build and never stopped: a dark pedal is Mix 0, not a stopped LFO |
| Chorus | delayTime (ms) | global | dry stage | 3.5 | 1 | 20 | 6 | 15 | slider, step 0.5 | | uniform | ramped together with depth over 50 ms, not stepped |
| Chorus | depth | global | dry stage | 0.7 | 0 | 1 | 0.3 | 0.7 | slider, step 0.01 | | uniform | ramped with delayTime |
| Chorus | spread (°) | global | dry stage | 180 | 0 | 180 | 90 | 180 | slider, step 5 | | uniform | plain property; a lit pedal ducks its Mix for 20 ms to write it, a re-sent Spread never ducks |
| Chorus | feedback | global | dry stage | 0 | 0 | 0.9 | 0 | 0.2 | slider, step 0.01 | | uniform | Signal; above 0 the chorus is a flanger |
| Chorus | wet (Mix) | global | dry stage | 0 | 0 | 1 | 0.3 | 0.4 | slider, step 0.01 | | the four motion pedals each roll ≈1/3 (`PEDAL_LIT_EDGE`) in chain order after the AutoWah and Phaser rolls, and are forced dark once two of the six Modulation pedals are lit (`MAX_LIT_PEDALS`) | node gets wet²; ramps 50 ms |
| Tremolo (Tone.Tremolo) | rate, Tone `frequency` (Hz) | global | dry stage | 10 | 0.05 | 10 | 0.5 | 6 | slider Free \| Sync, step 0.05 | Sync: a note value | a lit Tremolo seeds Sync ≈75 % (`PEDAL_SYNC_ODDS.tremolo`: a Free tremolo beats against the 16th grid) | LFO started once at build |
| Tremolo | depth | global | dry stage | 0.5 | 0 | 1 | 0.3 | 0.7 | slider, step 0.01 | | uniform | ramps 50 ms |
| Tremolo | spread (°) | global | dry stage | 180 | 0 | 180 | 90 | 180 | slider, step 5 | | uniform | ducked write, as Chorus |
| Tremolo | wet (Mix) | global | dry stage | 0 | 0 | 1 | 0.35 | 0.5 | slider, step 0.01 | | same cap rule as Chorus | node gets wet²; ramps 50 ms |
| Vibrato (Tone.Vibrato) | rate, Tone `frequency` (Hz) | global | dry stage | 5 | 0.05 | 10 | 2 | 7 | slider Free \| Sync, step 0.05 | Sync: a note value | a lit Vibrato seeds Sync ≈50 % | starts its own LFO in the constructor; one delay moves both channels |
| Vibrato | depth | global | dry stage | 0.1 | 0 | 1 | 0.03 | 0.12 | slider, step 0.01 | | uniform | a fraction of `maxDelay` 0.005 s, which is constructor-only and left at Tone's default |
| Vibrato | wet (Mix) | global | dry stage | 0 | 0 | 1 | 0.85 | 1 | slider, step 0.01 | | same cap rule as Chorus | node gets wet²; ramps 50 ms |
| FrequencyShifter (Tone.FrequencyShifter) | shift, Tone `frequency` (Hz) | global | dry stage | 0 | −1000 | 1000 | ±2 | ±20 | slider centred-zero, step 1 | | a magnitude band plus a separate sign draw (`globalAudio.frequencyShifter.sign`), so a seeded shift is never inside ±2 Hz | the sine branch is downmixed to mono, so a panned voice leaks the other sideband into the far channel |
| FrequencyShifter | wet (Mix) | global | dry stage | 0 | 0 | 1 | 0.25 | 0.35 | slider, step 0.01 | | same cap rule as Chorus | node gets wet²; ramps 50 ms |
| Compressor (Tone.Compressor) | threshold (dB) | global | dry stage | −24 | −60 | 0 | −36 | −18 | slider, step 1 | | bell draw; retuned from −55 to −45 at the Classic Band Retune: the Web Audio compressor adds automatic makeup gain, so the old deep band swung fleet loudness by about 11 dB between seeds | the node is built at −18 / ratio 6 / attack 0.003 / release 0.15, then the store pushes the defaults or the seed |
| Compressor | ratio | global | dry stage | 2 | 1 | 20 | 2 | 6 | slider, step 1 | | bell draw | |
| Compressor | attack (s) | global | dry stage | 0.003 | 0.001 | 0.2 | 0.003 | 0.05 | slider log | | bell draw | |
| Compressor | release (s) | global | dry stage | 0.25 | 0.01 | 1 | 0.05 | 0.3 | slider log | | bell draw | |
| Compressor | knee (dB) | global | dry stage | 6 | 0 | 40 | 1 | 15 | slider, step 1 | | bell draw | |
| Width (Tone.StereoWidener) | width | global | dry stage | 0.5 | 0 | 1 | 0.4 | 0.65 | slider, step 0.01 | | always drawn; no dark state | never tapered; the node's wet is held at 1; 0.5 is unity, 0 mono, 1 all side; the rooms' returns join at its input under Controlled Decay |
| Limiter (Tone.Limiter) | threshold (dB) | global | dry stage | −12 | −20 | 0 | −3 | −1 | slider, step 1 | | bell draw | wraps a fixed ratio 20 / attack 0.003 / release 0.01 compressor; no LFO by design |
| Master gain (Tone.Gain) | `audioStore.volume` | global | master | 1 | 0 | 1 | | | slider 0–100 % in TransportBar | | not seeded; never persisted | 40 dB taper; mute writes 0 without touching the stored volume |

## Rooms and returns

| name | param | global / per robot | role | default | min | max | seedMin | seedMax | input type | options | loading rules | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Reverb room (Tone.Reverb) | decay (s) | global | room | 1.5 | 0.1 | 10 | 0.5 | 4 | slider log | | bell draw | the node's own wet is pinned at 1 |
| Reverb room | preDelay (s) | global | room | 0.02 | 0 | 0.25 | 0 | 0.1 | slider, step 0.01 | | bell draw | full range 0–0.25 in the grid, the rig and the seed ranges since the Classic Band Retune (Discrepancies item 1); `setGlobalReverb` clamps into it |
| Reverb return (Tone.Gain) | `reverb.wet` | global | return | 1 | 0 | 1 | | | slider, step 0.01 | | not seeded (fixed 1) | the room's return level, not a mix; 0 silences the room for every robot; no longer a swell target |
| Delay room (Tone.FeedbackDelay, `maxDelay` 10) | delayTime (s) | global | room | 0.25 | 0 | 10 | 0.05 | 0.5 | slider Free \| Sync, step 0.001 | Sync: a note value (`DelaySettings.sync`) | ≈2/3 of styles seed Sync (`DELAY_SYNC_ODDS` 0.66), the note drawn from the band at the style's tempo; the Free value is seeded underneath | the LFO on this param was removed; `maxDelay` must stay equal to `DELAY_TIME_RANGE_SECONDS.max` |
| Delay room | feedback | global | room | 0.2 | 0 | 0.95 | 0 | 0.4 | slider, step 0.01 | | bell draw | capped under 1 against runaway |
| Delay return (Tone.Gain) | `delay.wet` | global | return | 1 | 0 | 1 | | | slider, step 0.01 | | not seeded (fixed 1) | as the Reverb return |
| Decay Mode | `compressorBeforeDelay` | global | routing | natural | | | | | radio | natural / controlled | not seeded; always starts natural | selects where both returns rejoin: the Compressor's input, or Width's input (falls back to the Limiter's without a widener) |

## LFO Bank and links

| name | param | global / per robot | role | default | min | max | seedMin | seedMax | input type | options | loading rules | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LFO Bank lane a–d (4× Tone.LFO, each with a drift Tone.LFO at 0.03 Hz and trunk/drift Tone.Gains) | shape | global | modulator | seeded | | | | | radio | triangle / sine / square / sawtooth | bell draw per lane | the lane's one oscillator, shared by every link on it |
| LFO Bank lane | rate (Hz) | global | modulator | seeded | 0 | 20 | a 0.1 / b 0.4 / c 1.5 / d 4 | a 0.4 / b 1.5 / c 4 / d 8 | slider Free \| Sync, step 0.05 | Sync: a note value (`BankLfoSettings.sync`) | log draw in the lane's own band (`LFO_BANK_RATE_BANDS`); Sync targets a 75 / b 66 / c 33 / d 25 %, calibrated odds 0.6 / 0.62 / 0.33 / 0.33 | 0 holds the lane still and is a legal hand value; the seed never emits it |
| LFO Bank lane | rateDrift, depthDrift (%) | global | modulator | seeded | −100 | 100 | −70 | 70 | slider centred-zero | | bell draw | stored −1..1 (step 0.01); both drift gains detached below Effects Load 0.8 (`LOAD_DRIFT_MIN`) |
| Global LFO links (one Tone.Gain per link) | lane + depth (%) | global | modulator | seeded | 0 | 100 | 5 | EQ 30 / filter frequency 60 / filter Q 40 | LfoLink: lane picker + depth slider | lanes a–d, or none | a quiet roll under `LFO_QUIET_THRESHOLD` 0.34 leaves no lane; otherwise a lane and a depth from the target's band | 7 targets: `eq3.low/mid/high`, `lpf.frequency`, `lpf.Q`, `hpf.frequency`, `hpf.Q`; the four filter links are held off below Effects Load 0.4 (`LOAD_FILTER_LFOS_MIN`); EQ links never are |

## Per-robot bus

Built per `reserveVoice`: `composite.output → panner → busGain → busFilter`, then dry into the chain entry and, tapped off the bus filter, one send gain into each room.

| name | param | global / per robot | role | default | min | max | seedMin | seedMax | input type | options | loading rules | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Volume (bus Tone.Gain) | `masterVolume` | per robot | bus | seeded | 0 | 1 (shown 0–100 %) | 0.65 | 0.85 | slider, step 1 % | | bell draw plus a register bias (bass louder, treble quieter), clamped 0.5–0.95 | 40 dB taper (`volumePositionToGain`); live edits reach a sounding tail; swell target |
| Pan (Tone.Panner) | `pan` | per robot | bus | 0 | −1 | 1 (shown ±100) | | | slider centred-zero, step 1 | | not seeded; every robot spawns on Auto at centre | Auto on: follows the robot's x in ±0.5, written once per 16th tick when it moved by more than 0.0005; Auto off: the slider, ramped over 50 ms |
| Pan | `panAuto` | per robot | bus | on | | | | | toggle | on / off | always on at spawn | the robot keeps moving either way; only the panner is affected |
| Reverb send (Tone.Gain) | `reverbSend` | per robot | send | seeded | 0 | 1 (shown 0–100 %) | 0.1 | 0.6 | slider, step 1 % | | bell draw in band, quantised to 1 % | tapped after the bus filter; ramps 50 ms; swell target; starts at 0 and is primed from the store on every reservation path |
| Delay send (Tone.Gain) | `delaySend` | per robot | send | seeded | 0 | 1 (shown 0–100 %) | 0 | 0.3 | slider, step 1 % | | a quiet roll under `SEND_DELAY_QUIET_THRESHOLD` 0.25 puts exactly 0 on ≈17–18 % of the fleet (the draw is bell-curved); otherwise a bell draw in band | ramps 50 ms; swell target |
| Bus filter (Tone.Filter) | cutoff, `filterFreq` (Hz) | per robot | bus | seeded | 20 | 20000 | open 2000 / accent 400 | open 8000 / accent 2500 | slider log | | an accent roll under `FILTER_ACCENT_THRESHOLD` 0.27 (measured 19.9 %) picks the accent band; the rest are open | 0 means open to 20 kHz; a caller omitting it gets 1200 Hz; LFO link on `bus.frequency`, held off below Effects Load 0.8 (`LOAD_BUS_FILTER_LFOS_MIN`) and whenever the filter tier is; ramps 50 ms |
| Bus filter | resonance, `filterQ` | per robot | bus | 1 | 0.1 | 20 | 3 | 8 | slider log | | accent robots only, step 0.1; common robots keep `ROBOT_BUS_FILTER_Q` 1 | ramps 50 ms |
| Bus filter | type, `filterType` | per robot | bus | lowpass | | | | | radio | lowpass / bandpass / highpass | accent robots are bandpass 40 % of the time (`ACCENT_BANDPASS_SHARE`); highpass is never seeded, only hand-picked | assigned outright; a type switch on a sounding voice may click |
| Robot LFO links (one Tone.Gain per link) | lane + depth (%) | per robot | modulator | seeded | 0 | 100 | 1 | gain 60 / detune 10 / bus 40 | LfoLink: lane picker + depth slider | lanes a–d, or none | a quiet roll under 0.7 (layer targets) or 0.8 (bus cutoff, ≈13.6 % lit) leaves no lane; the lane pick is roster-aware | 7 targets: layer 0–2 gain and detune, plus `bus.frequency`; no per-robot cap |

## Tone nodes that are not effects

Listed so the graph is complete; none has a row above.

- **Tone.Synth, one per audible layer, up to three per robot** (`compositeVoice.ts`). Oscillator type (sine, square, triangle, sawtooth, pulse), gain 0–2, detune ±50 cents, phase 0–360°, pulse width 0–1, one shared ADSR of 0–2 s per stage (`ENVELOPE_TIME_MAX_SECONDS`) with seven attack and release curve shapes (linear, exponential, sine, cosine, bounce, ripple, step), and portamento 0–2 s. Seeding: a layer starts muted on a 50/50 roll; ≈15 % of robots take a non-linear attack or release curve and are then seeded short (attack 0.03–0.25 s, release 0.15–0.8 s); ≈12.5 % glide, seeded 0.05–0.2 s.
- **One Tone.Gain per layer** and the composite's output Gain.
- **Two zero-delay Tone.Delay chain cuts** (`CHAIN_CUT_OPTIONS`, delayTime 0, maxDelay 0.01), one at the chain entry and one after the High-Pass Filter. They stop Tone's cycle search going exponential on every connect and never move.
- **Native AnalyserNode taps** on the master gain for the `?debug` HUD (not Tone.Analyser).
- **The Tone.Context**, whose `latencyHint` is fixed at page load from the boot-time Robot Load preset.

## Audio Load gates

The Effects Load dial holds off exactly three things: the LPF/HPF LFO links below 0.4, every robot's bus-cutoff link below 0.8 (and whenever the filter tier is off), and every lane's rate and depth drift below 0.8. No effect node, Mix or pedal is gated; no `LOAD_COLOUR_MIN` or `LOAD_PEDAL_MIN` exists. Robot Load gates which robots sound and the polyphony cap, not any effect.

## Discrepancies found while compiling (2026-10-19)

1. **Reverb preDelay range.** *Resolved 2026-10-21 (Classic Band Retune T4).* `GLOBAL_CHAIN_GRID.md` said 0–0.5 s while `audioRigConfig.ts` and `globalAudioSeedRanges.ts` both said 0–1 s; all three now say 0–0.25 s (a 1 s pre-delay is a slapback), and `setGlobalReverb` clamps `decay` into 0.1–10 s and `preDelay` into 0–0.25 s, ignoring a non-finite value.
2. **The Signal Graph diagram in `docs/AUDIO_SYSTEM.md`** still reads AutoWah → Phaser → Compressor → Limiter. It omits Chorus through FrequencyShifter and the Width stage, which the code wires (`wireGlobalFxChain`'s `chainNodes`). The prose above the diagram already names the rooms correctly.
3. **The Compressor is built at values that are not its defaults** (`buildGlobalFxChain`: threshold −18, ratio 6, release 0.15, versus −24, 2, 0.25 in `DEFAULT_GLOBAL_AUDIO_SETTINGS`). The store overwrites them at boot, so nothing is audible, but a reader of the constructor is misled.
