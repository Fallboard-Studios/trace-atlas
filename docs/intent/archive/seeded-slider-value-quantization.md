# Intent: Seeded Slider Value Quantization

Confirmed via `/interview-me`, 2026-09-16. Covers [Roadmap Phase 22](../todo/roadmap.md#22-bug-seeded-values-not-quantized-to-their-sliders-step). Source of investigation: [docs/reference/SLIDER_VALUES.md](../reference/SLIDER_VALUES.md), a full audit of every slider-controlled attribute in the Global Audio Rig and Robot Detail views, built specifically to surface this bug class — found live when a robot loaded its per-target LFO Rate at `4.236 Hz`, a value the Rate slider's own step can never produce by dragging.

## Outcome

Two things land together:

1. **A shared quantization helper** (name/location TBD at spec time — e.g. `src/utils/quantizeToStep.ts`), applied at every generation call site that has a real, declared step, so a seeded/spawned value always lands exactly on that field's step grid. Confirmed as one shared helper, not per-call-site inline rounding (the current `Math.round()`-only-for-BPM pattern is exactly the inconsistency that let this drift for every other field).
2. **Six concrete schema/constant value changes**, already decided and recorded as edits directly in `SLIDER_VALUES.md` (not just documentation — these are real changes to apply to the actual source):
   - **EQ3 Low/Mid/High** (`audioRigConfig.ts`, `SliderCenteredZero`): gain a `step: 0.5` (dB). Requires adding a new, optional `step?: number` field to `SliderCenteredZeroSchema` (`src/types/controls.ts` — the type has no `step` field at all today) and wiring `SliderCenteredZero.tsx` to read `schema.step ?? 1` instead of its current hardcoded `step={1}`. **EQ3-only** — every other `SliderCenteredZero` consumer (Detune, Rate Drift, Depth Drift) keeps the hardcoded `1` default, confirmed directly rather than assumed.
   - **Delay Time** (`audioRigConfig.ts`, `SliderLinear`): step `0.01 → 0.001`, **and** max `1 → 10` (seconds).
   - **Reverb Pre-Delay** (`audioRigConfig.ts`, `SliderLinear`): max `0.5 → 1` (seconds).
   - **Compressor Attack** (`audioRigConfig.ts`/`globalAudioSeedRanges.ts`/`globalAudioLoadingRanges.ts`, `SliderLog`): max `1 → 0.2` (seconds) — a real range change, not just a step, propagating to both the UI schema and the seed/loading ranges that sample within it.
   - **LFO Rate** (`Lfo.tsx`'s `rateSchema`, `src/types/lfo.ts`'s `LFO_RATE_MIN`/`MAX`): range `0–10 → 0–20` Hz, step `0.25 → 0.05`.

## User

Crawford (solo dev), auditing/tuning the Audio Rig and Robot Options sliders.

## Why now

Found live while manually testing after the Robot Detail Top Card work (15.3) — building `SLIDER_VALUES.md` to see the full picture turned one reported bug into a visible systemic pattern across roughly 10 generation call sites.

## Success

- A shared quantization helper exists and is applied wherever a field has a real, *explicitly declared* `step` in its schema — verified by a full sweep of every schema file, not assumed. That set is: robot-level and global-chain LFO Rate (`spawnSystem.ts`'s `generateRobotLfoSettings`, `globalAudioSeed.ts`'s `generateGlobalLfoSettings`), EQ3 Low/Mid/High (now that they have a real step), Delay Time, Delay Feedback, Delay Wet, Reverb Pre-Delay, Reverb Wet, Compressor Ratio, **Volume** (`VOLUME_SCHEMA`, `robotOptionsConfig.ts` — has an explicit `step: 1`, corrected mid-Specify from an earlier mistaken exclusion), **Ping Variance Automation** (`audioRigConfig.ts` — also an explicit `step: 1`, same correction), and Signature Array Gain (×3 layers). Motif Length/Octave Range Min/Max/Note Variance/BPM also carry an explicit `step: 1` and are included for completeness, though their existing generation logic (`seedToggleValue`, `OCTAVE_REGISTERS`, `Math.round`) already produces step-aligned integers — applying the shared helper to them is a no-op/safety-net, not a behavior change.
- LFO Depth (robot and global-chain) is confirmed **not** in scope — `Lfo.tsx`'s `depthSchema` has no `step` field at all (implicit default `1`, same exclusion class as Density/Sustain/Pitch Repeat/Compressor Threshold/Knee/Limiter Threshold).
- A freshly seeded/spawned value for every quantized field, checked at generation time, always equals `min + n * step` for some integer `n` — never something like `4.236` against a `0.25` step.
- `SliderCenteredZeroSchema` gains an optional `step?: number`; `SliderCenteredZero.tsx` uses `schema.step ?? 1`. Only EQ3's schema entries set it to `0.5`; every other `SliderCenteredZero` consumer is unaffected (still defaults to `1`).
- Delay Time's schema step is `0.001` and max is `10`; Reverb Pre-Delay's max is `1`; Compressor Attack's schema max (and its `GLOBAL_AUDIO_SEED_RANGES`/`GLOBAL_AUDIO_LOADING_RANGES` entries) is `0.2`; LFO Rate's `LFO_RATE_MIN`/`MAX` are `0`/`20` with the `Lfo.tsx` `rateSchema`'s step at `0.05`.
- `npm run build:types`, `npm run lint`, and `npm test` all pass clean.

## Constraint

- **Only fields with a real, *explicitly declared* `step` get quantized** — not fields whose schema omits `step` and silently falls back to `SliderLinear`'s default of `1` (Density, Sustain, Compressor Threshold/Knee, Limiter Threshold, Pitch Repeat, Signature Array Phase, LFO Depth). Those default-of-1 cases were never a deliberate design decision anyone made; quantizing them now would be inventing a requirement, not fixing a bug. **Volume and Ping Variance Automation were initially misclassified into this excluded group during the interview** — both actually declare `step: 1` explicitly and are correctly in scope; corrected via a full schema sweep before this spec was written, confirmed directly with Crawford.
- `SliderLog`'s own hardcoded `step={0.001}` (in normalized `t`-space, not real units) is untouched — no `SliderLog` row was edited in `SLIDER_VALUES.md`, so it's out of scope for this phase.
- Robot-level LFO Rate/Depth's loading behavior (sampling the *entire* full/UI range with no narrower loading sub-window, unlike every global-chain field) is unchanged — this phase quantizes what's sampled, it doesn't narrow the range being sampled from. The full range simply becomes `0–20` instead of `0–10` per the LFO Rate range change above.
- `SLIDER_VALUES.md`'s rows beyond the 6 edited ones (EQ3 step, Delay Time step+max, Reverb Pre-Delay max, Compressor Attack max, LFO Rate range/step) are **not** a change order for their *range/min/max values* — they document current behavior as audited, not yet reviewed/approved row-by-row by Crawford. This is separate from the quantization fix itself, which does apply to every field with an explicit `step`, edited or not (see Success above) — the distinction is between changing a field's *range* (only the 6 edits) and *rounding what's sampled within its existing, unchanged range* (every explicit-step field).

## Out of scope

- Fields with no explicit `step` in their schema (Density, Sustain, Compressor Threshold/Knee, Limiter Threshold, Pitch Repeat, Signature Array Phase, LFO Depth) — see Constraint above.
- `SliderLog`'s hardcoded step.
- Narrowing robot-level LFO's loading range to match the global-chain's narrower window — not requested.
- Revisiting `SLIDER_VALUES.md`'s own un-edited rows as part of this phase; a future pass may confirm/edit more of them, but that's separate work.
- A follow-up doc pass on `SLIDER_VALUES.md` itself (updating its footnotes once the fix ships) — noted in the roadmap item's own Docs section, not part of this intent's Success criteria.
