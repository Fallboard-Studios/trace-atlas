# Intent: Log Sliders That Read Cleanly — pedal-marking readouts for the twelve log fields

Confirmed via `interview-me` on 2026-11-07 (4 questions, every guess confirmed), ahead of a `spec-driven-development`
pass. Backlog [33](../todo/backlog.md#33-audio-rig-exact-stepped-values-and-log-sliders-that-read-cleanly) piece 2,
first item of plan.md's Stage 2. Piece 1 (`quantizeToStep` returns exact numbers) shipped 2026-10-25 on
`feature/short-world-link`; piece 2 waited for roadmap 56 to merge (PR #581, 2026-10-26).

**A correction to the backlog entry, found at the interview.** The entry says none of the twelve `sliderLog` schemas
has a unit. Eight do, through `labels()` from `src/content/copy/fleet.ts`: `Hz` on the four frequencies (LPF and HPF
cutoff, AutoWah and Phaser base frequency) and `s` on compressor attack and release, reverb length and the AutoWah
follower. Only the four Q fields (LPF, HPF, AutoWah, Phaser resonance) are bare. So the live problem is the decimals,
not missing units: a cutoff reads `3152.859Hz`, attack reads `0.012s`, Q reads `3.153`.

## Outcome

The twelve log sliders in the Audio Rig (`src/data/audioRigConfig.ts`, rendered by `SliderLog`) read like the markings
on a pedal: frequencies in whole hertz, compressor attack and release in whole milliseconds, and the four Qs, reverb
length and follower at a fixed two decimals. Nothing but the label text changes.

## Behavior

- **Frequencies read in whole hertz, always.** `3153Hz`, `20Hz`, `20000Hz`. No switch to kHz above 1000: a unit that
  changes mid-drag is the content flip the controls are not allowed to make (a control holds its largest-content size
  and never resizes on a content flip). Fields: `filterLPF.frequency`, `filterHPF.frequency`, `autoWah.baseFrequency`,
  `phaser.baseFrequency`.
- **Compressor attack and release read in whole milliseconds.** `12ms`, `350ms`. The stored value stays in seconds
  (Tone's unit); only the readout multiplies by 1000. The two content entries' `unit` changes from `s` to `ms`; their
  help copy names no unit and stays. Fields: `compressor.attack` (0.001–0.2 s), `compressor.release` (0.01–1 s).
- **The six remaining fields read at a fixed two decimals.** `3.15`, `0.50`, `2.40s`, `0.08s`. Trailing zeros are
  kept, unlike `formatDisplayValue`'s drop-the-zeros rounding, so the label does not jitter between `2.4s` and `2.45s`
  under the thumb. Fields: the four Qs (unitless), `reverb.decay` (0.1–10 s) and `autoWah.follower` (0.01–1 s), both
  keeping `s`.
- **Display only.** The value passed to `onChange`, the Zustand store, the sound, saves, the world link and the capture
  step's rounding (`quantizeGlobalAudioForCapture`, `src/utils/sessionCapture.ts`) are untouched. A cutoff still stores
  `3152.859…`.
- **Drag and keyboard stepping are unchanged.** `sliderLogMath`'s step logic is not touched; only what the label shows.

## Style / constraint

- **The existing `formatValue` hook on `SliderLogSchema`** (`src/types/controls.ts`) is the mechanism: when present it
  replaces the `formatDisplayValue(value) + unit` readout entirely. Automation Rate (`formatSwellFrequency`) is the one
  precedent. Prefer one shared formatter per kind (whole-with-unit, ms-from-seconds, two-decimals-with-unit) over
  twelve closures.
- **Unit text goes through `src/content/`**, as every label does; the formatter reads the entry's `unit`, never a
  literal in the config. ESLint and `src/content/content.test.ts` enforce this.
- **The default readout for every other slider is untouched.** `formatDisplayValue` keeps its three-decimal
  drop-the-zeros behaviour for the linear sliders and steppers.

## Out of scope

- **The parked value grid for the log sliders** (a step at load, `SliderLog` snapping, deleting `sessionCapture.ts`).
  Stays parked at the end of backlog 33, judged after this lands: the entry's revisit trigger is "if piece 2 leaves
  the decimals still bothering Crawford", and that cannot be known before piece 2 is in.
- **kHz switching** for the frequency fields. Considered and rejected at the interview (the content-flip rule).
- **Changing any linear slider's readout**, or `formatDisplayValue` itself.
- **Any change to the stored precision, the save or the link.** Piece 1 already made saves and links agree.
- **The robot side of `sessionDiff.ts`** (layer gain and the five sends rounded to 2 decimals); named by the backlog
  entry as the same question as the grid, and parked with it.

## Known implementation note (not yet spec'd)

Where the three formatters live (next to `formatDisplayValue` in `src/components/ui/controls/`, or in
`audioRigConfig.ts` beside `formatSwellFrequency`), and whether `SliderLog`'s aria value text should follow the
formatted readout or keep the raw number, are left for the spec. `src/content/content.test.ts` pins no unit for the
compressor fields today (checked 2026-11-07), but `src/data/audioRigConfig.test.ts` pins `unit: 's'` on both the
attack and release schemas, so the `s` to `ms` change amends those two cases. Spec:
[docs/specs/LOG_SLIDER_READOUTS.md](../specs/LOG_SLIDER_READOUTS.md).
