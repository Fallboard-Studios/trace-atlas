# Phase Spec: Log Sliders That Read Cleanly

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - One file: `npx vitest run src/components/ui/controls/formatReadout.test.ts`
> - The look (§5.3): `npm run dev`, Fleet Params, the Filters, Modulation, Reverb and Compressor blocks

**Status:** spec written 2026-11-07, from the confirmed intent
[docs/intent/log-slider-readouts.md](../intent/log-slider-readouts.md) (4 questions, every guess confirmed). Backlog
[33](../todo/backlog.md#33-audio-rig-exact-stepped-values-and-log-sliders-that-read-cleanly) piece 2, the first line of
plan.md's Stage 2. Piece 1 shipped 2026-10-25. The parked value grid at the end of the backlog entry stays parked.
Plan: [docs/tasks/LOG_SLIDER_READOUTS.md](../tasks/LOG_SLIDER_READOUTS.md).

**§7 is resolved** (Crawford, 2026-11-07): Q1 the space stays, `' ms'` like the chorus Delay, so attack reads `12 ms`;
Q2 yes, one content pin; Q3 no special case for Automation Rate.

---

## 1. Overview & Claude Explanation

Twelve `sliderLog` schemas in the Audio Rig ([audioRigConfig.ts](../../src/data/audioRigConfig.ts)) have no step
anywhere, so their value is whatever the seed or the drag produced, and `SliderLog`'s default readout shows it through
`formatDisplayValue` (at most three decimals, zeros dropped) plus the content entry's `unit`. A cutoff reads
`3152.859Hz`, attack reads `0.012s`, a Q reads `3.153`, and a reverb length flickers between `2.4s` and `2.45s` under
the thumb. This item gives each of the twelve a readout like the marking on a pedal. Nothing but the label text, and
what a screen reader hears for it, changes.

**A correction to the backlog entry (found at the interview).** It says none of the twelve has a unit. Eight do,
through `labels()` from [fleet.ts](../../src/content/copy/fleet.ts): `Hz` on the four frequencies and `s` on attack,
release, reverb length and the AutoWah follower. Only the four Q fields are bare. The live problem is the decimals.

**The three readouts.** Each field gets one of three shapes, chosen at the interview:

| Shape | Fields | Reads |
|---|---|---|
| Whole number, unit | `filterLPF.frequency`, `filterHPF.frequency`, `autoWah.baseFrequency`, `phaser.baseFrequency` | `3153Hz`, `20Hz`, `20000Hz` |
| Whole milliseconds from a seconds value | `compressor.attack` (0.001–0.2 s), `compressor.release` (0.01–1 s) | `12 ms`, `350 ms`, `1 ms`, `1000 ms` (the space is the content unit's, §7 Q1) |
| Fixed two decimals, unit if any | `filterLPF.Q`, `filterHPF.Q`, `autoWah.Q`, `phaser.Q` (unitless); `reverb.decay`, `autoWah.follower` (`s`) | `3.15`, `0.50`, `2.40s`, `0.08s` |

Three rules behind the table:

- **No kHz switching.** A unit that changes mid-drag is the content flip the controls are not allowed to make: a
  control holds its largest-content size and never resizes on a content flip. Whole hertz also keeps the low end
  honest, where `20Hz` to `200Hz` is most of the audible action.
- **Trailing zeros are kept.** `2.40s`, not `2.4s`. `formatDisplayValue` drops zeros, which is right for a stepped
  linear slider and wrong here, where every value is off-grid and the label would jitter as the last digit comes and
  goes. The two-decimal fields are the only ones this applies to; a whole number has no zeros to keep.
- **No thousands separator.** `20000Hz`, not `20,000Hz`. Plain `toFixed`, not `Intl.NumberFormat`, so the readout is
  the same in every locale and never grows a character.

**The mechanism is the hook that already exists.** `SliderLogSchema.formatValue` ([controls.ts](../../src/types/controls.ts))
replaces the default `formatDisplayValue(value) + unit` readout entirely when present. Automation Rate's
`formatSwellFrequency` is the one user today. This item adds one small formatter factory beside `formatDisplayValue`
and gives each of the twelve schemas a `formatValue` built from it, with the unit still read from the content entry.
No new schema field, no change to `SliderLog`'s curve, drag, keyboard or `onChange`.

**One `SliderLog` change rides along: `aria-valuetext`.** `SliderLinear` already sets the thumb's `aria-valuetext` to
the formatted readout whenever `formatValue` is present, computed once so the visible text and what a screen reader
hears cannot disagree ([COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md), "`SliderLinear`'s `formatValue`"). `SliderLog`
never did. Its `aria-valuenow` is the track position `t` (0..1), not the value, so a screen reader today hears a
cutoff as "0.63". `SliderLog` follows `SliderLinear`'s precedent exactly: `aria-valuetext` when `formatValue` is
present, no attribute otherwise. Automation Rate gains it too, for free.

**What a seeded world shows.** Nothing moves. A cutoff still stores `3152.859…`; the seed, the save, the world link
and the capture step's rounding (`quantizeGlobalAudioForCapture`, [sessionCapture.ts](../../src/utils/sessionCapture.ts))
are untouched. Saves and links already agree since piece 1.

**What stays.** The default readout for every other slider and stepper, `formatDisplayValue` itself and its test,
`sliderLogMath`, and the six `sliderLog` schemas on the robot side ([robotOptionsConfig.ts](../../src/data/robotOptionsConfig.ts):
the envelope's attack, decay and release, portamento, and the bus filter's cutoff and Q). Those six read through the
default today and are named in §3 as out of scope, not forgotten.

---

## 2. Target File Structure

```text
src/
├── components/ui/controls/
│   ├── formatReadout.ts              # NEW: fixedReadout(decimals, unit?, scale?) → (value) => string
│   ├── formatReadout.test.ts         # NEW, RED first: the three shapes at min, max, mid, float noise, eased fraction
│   ├── SliderLog.tsx                 # formattedValue computed once; aria-valuetext on the thumb when formatValue is present
│   └── SliderLog.test.tsx            # RED first: aria-valuetext present with formatValue, absent without
├── data/
│   ├── audioRigConfig.ts             # the twelve schemas gain formatValue via a local logReadout(key, decimals, scale) helper
│   └── audioRigConfig.test.ts        # RED first: each of the twelve reads as the table says; attack/release unit pins 's' → 'ms'
├── content/copy/
│   └── fleet.ts                      # fleet.compressor.attack and .release: unit 's' → 'ms' (spacing per §7 Q1)
└── types/
    └── controls.ts                   # SliderLogSchema.formatValue doc comment: also the thumb's aria-valuetext
docs/
├── COMPONENT_LIBRARY.md              # the readout paragraph: SliderLog's formatValue sets aria-valuetext like SliderLinear's; the twelve
├── AUDIO_SYSTEM.md                   # only if it names the compressor's attack/release unit (check; probably no change)
└── todo/
    ├── backlog.md                    # 33: Built line for piece 2, the "no unit" claim corrected, the grid still parked
    └── plan.md                       # the Stage 2 line goes at merge
```

No file is deleted. `sessionCapture.ts` and the capture step are not touched.

---

## 3. Implementation Boundaries & Constraints

- **Display only.** `formatValue` returns a string for the label and `aria-valuetext`. It never rounds, snaps or
  otherwise touches the value handed to `onChange`, the store, the seed, the save or the link. A test that reads a
  stored value before and after a drag must see no difference from today.
- **One factory, three uses.** `fixedReadout(decimals, unit = '', scale = 1)` returns
  `(value) => \`${(value * scale).toFixed(decimals)}${unit}\``. Whole hertz is `fixedReadout(0, 'Hz')`, milliseconds
  is `fixedReadout(0, unit, 1000)`, two decimals is `fixedReadout(2, unit)`. No per-field closures in the config
  beyond the one-line helper that pairs `labels(key)` with the factory. Do not add `decimals` or `scale` fields to
  `SliderLogSchema`: the hook is enough, and a new field would be a contract change for a twelve-schema need.
- **The unit comes from content.** The factory is handed `labels(key).unit`; the schema keeps its `unit` property as
  today, so the existing "every pedal param reads its label, lore and unit from its own content entry" case in
  `audioRigConfig.test.ts` still holds. No unit literal appears in `audioRigConfig.ts` or the formatter; the ESLint
  content guard would catch one on a `unit:` property, but the factory's argument is not a property, so this is a
  rule to follow, not one the lint enforces.
- **The stored unit stays seconds.** Tone's compressor takes attack and release in seconds. The content entry's
  `unit` becomes milliseconds because the content layer's `unit` is "the value suffix a slider renders", and the
  slider now renders milliseconds. The help copy for both names no unit and stays.
- **`aria-valuetext` follows `SliderLinear` exactly.** Computed once as `formattedValue`, used for both the label
  and the thumb; `undefined` when `formatValue` is absent, so every schema without one renders no attribute and is
  unchanged. `aria-valuenow` stays `t`.
- **`formatDisplayValue` is untouched.** Its three-decimal drop-the-zeros behaviour is right for the linear sliders
  and the steppers. This item does not generalise it.
- **Eased values.** `formatValue` is handed the eased display value, which is fractional mid-ease
  (`useEasedControlValue`). `toFixed` handles that; nothing rounds its argument first.
- **CLAUDE.md rules stand.** No text literal in a component or data config; tests exercise code, not text; no RED
  test for a docs or copy change.
- **Not in scope:**
  - the parked value grid for the log sliders (a step at load, `SliderLog` snapping, deleting `sessionCapture.ts`),
    judged after this lands per the backlog entry's revisit line;
  - kHz switching, or any readout whose unit or digit count depends on the value;
  - the six robot-side `sliderLog` schemas in `robotOptionsConfig.ts`, and the robot side of `sessionDiff.ts`;
  - any linear slider's or stepper's readout;
  - `SliderLog`'s drag, keyboard stepping or `steps` behaviour;
  - the stored precision, the seed, saves, links or the capture step.

---

## 4. Code Style & Architecture Conventions

```typescript
// src/components/ui/controls/formatReadout.ts — shape, not final code
/**
 * A fixed-width readout for a log slider's value: `decimals` places, trailing zeros kept, `unit`
 * appended, the value multiplied by `scale` first (1000 for a seconds value shown in milliseconds).
 * Display only; the value handed to onChange and the store is never touched (docs/specs/LOG_SLIDER_READOUTS.md).
 */
export function fixedReadout(decimals: number, unit = '', scale = 1): (value: number) => string {
  return (value) => `${(value * scale).toFixed(decimals)}${unit}`;
}

// src/data/audioRigConfig.ts — the helper that pairs the content entry with its readout
function logReadout(key: ContentKey, decimals: number, scale = 1) {
  const l = labels(key);
  return { ...l, formatValue: fixedReadout(decimals, l.unit, scale) };
}

// a schema, after
{ field: 'attack', schema: { id: 'compressor.attack', type: 'sliderLog', ...logReadout('fleet.compressor.attack', 0, 1000), min: 0.001, max: 0.2, orientation: 'horizontal' } },
```

```tsx
// src/components/ui/controls/SliderLog.tsx — SliderLinear's lines, carried over
// Computed once and shared: the visible readout and the thumb's aria-valuetext must never disagree.
const formattedValue = schema.formatValue?.(displayValue);
…
<Slider.Thumb className="sc-slider-log__thumb" aria-label={resolveAccessibleName(schema)} aria-valuetext={formattedValue} />
```

- `ContentKey` is whatever type `labels()`'s parameter already has in `audioRigConfig.ts`; do not widen it.
- Doc comments say what the readout is and point here. They do not narrate the change: no "used to read", no "since
  backlog 33". The history is the backlog archive.
- Tests are colocated, as today. Each test calls the code it checks; none reads source, CSS or doc text.
- Prettier: `printWidth` 100, single quotes, trailing commas `es5`. The config's one-line schema objects already run
  past 100 and are kept as the file keeps them.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first where there is behaviour)

1. **The factory** (`formatReadout.test.ts`, RED against a missing module). One `it` per shape plus the edges:
   - `fixedReadout(0, 'Hz')`: `3152.859 → '3153Hz'`, `20 → '20Hz'`, `19999.9999 → '20000Hz'` (float noise),
     `4999.999999999999 → '5000Hz'`.
   - `fixedReadout(0, 'ms', 1000)`: `0.012 → '12ms'`, `0.001 → '1ms'`, `0.2 → '200ms'`, `0.35 → '350ms'`,
     `1 → '1000ms'`; and `0.0005 → '1ms'` (half rounds up, the slider's minimum is never shown as `0ms`).
   - `fixedReadout(2, 's')`: `2.4 → '2.40s'` (zero kept), `0.1 → '0.10s'`, `10 → '10.00s'`, `0.07999 → '0.08s'`.
   - `fixedReadout(2)`: `3.15278 → '3.15'`, `0.5 → '0.50'`, `20 → '20.00'`; no unit appended.
   - An eased fractional argument formats like any other: `fixedReadout(0, 'Hz')(3152.4) → '3152Hz'`.
   - **Mutation check:** change `toFixed` to `formatDisplayValue` and the zero-kept cases fail; drop `scale` and the
     millisecond cases fail.
2. **The twelve schemas** (`audioRigConfig.test.ts`, RED against today's schemas, which have no `formatValue`). One
   `it.each` over `[block, field, sample, expected]` using the file's `findParam`:
   - `filterLPF.frequency 3152.859 → '3153Hz'`, `filterHPF.frequency 20 → '20Hz'`,
     `autoWah.baseFrequency 999.6 → '1000Hz'`, `phaser.baseFrequency 50 → '50Hz'`;
   - `compressor.attack 0.012 → '12 ms'`, `compressor.release 0.35 → '350 ms'` (the unit, with its space, from content);
   - `filterLPF.Q 3.15278 → '3.15'`, `filterHPF.Q 0.1 → '0.10'`, `autoWah.Q 0.5 → '0.50'`, `phaser.Q 20 → '20.00'`;
   - `reverb.decay 2.4 → '2.40s'`, `autoWah.follower 0.08 → '0.08s'`.
   - **Also:** every `sliderLog` schema in `AUDIO_RIG_CONFIG` has a `formatValue` (Automation Rate already does), so
     a thirteenth log slider added later without one fails here.
   - **Existing pins amended, not new RED:** the attack and release cases (`unit: 's'` → `unit: 'ms'`, and their
     titles say milliseconds). The four `unit: 'Hz'`/`unit: 's'` pins on the filters and reverb stay as they are.
3. **`aria-valuetext`** (`SliderLog.test.tsx`, RED against today's thumb, which has no such attribute):
   - with `formatValue`, the thumb's `aria-valuetext` equals the rendered label text;
   - without it, the thumb has no `aria-valuetext` attribute;
   - the existing `formatValue` block's three cases and the `{value}{unit}` fallback case stay unchanged and pass.
   - **Mutation check:** pass a constant to `aria-valuetext` and the first case fails.
4. **The content entry.** `content.test.ts` pins no unit for the compressor fields today. A new `it` is optional and
   would say only that attack and release carry the same unit as each other and that it is the milliseconds one; if
   written, it reads `CONTENT['fleet.compressor.attack'].unit`, not the file.

Not tested, by CLAUDE.md's "no RED test for a task with no behaviour":

- the content entry's `unit` change on its own (test 2's amended pins cover its effect on the schema);
- the doc comments, COMPONENT_LIBRARY.md and the backlog entry, whose proof is a read.

### 5.2 Store parity (a check inside test 2, not a new file)

One case: render nothing, call `findParam('filterLPF', 'frequency').schema.formatValue(3152.859)` and assert the
schema has no `step` and the result is a string. This is a guard that the readout did not grow a snapping path;
`SliderLog.test.tsx`'s existing "passes the raw (unrounded) value to formatValue" case is the other half.

### 5.3 The look (Crawford, a browser read, not a test)

`npm run dev`, Fleet Params. Drag each of the twelve across its range and read the label:

- the frequencies never show a decimal or a `k`;
- attack and release read in milliseconds, whole, and the content's unit text sits as §7 Q1 decided;
- the two-decimal fields never lose their second digit mid-drag;
- no label's width jumps on a content flip (the range's own width change, `20Hz` to `20000Hz`, is expected);
- Automation Rate reads as before.

With a screen reader or the accessibility tree open: a log slider's thumb announces the readout, not a fraction.

### 5.4 Checks

`npm run build:types`, `npm run lint`, `npm test` and `npm run build` all clean. Full suite at the checkpoint; types
and lint after each task.

### 5.5 Done when

- [ ] `fixedReadout` exists with §5.1 test 1 green and both mutations red.
- [ ] All twelve schemas read as §1's table says, pinned by test 2, and every rig `sliderLog` has a `formatValue`.
- [ ] `SliderLog`'s thumb carries `aria-valuetext` exactly when `formatValue` is present (test 3).
- [ ] The compressor's attack and release content entries carry the milliseconds unit; their help copy is unchanged.
- [ ] No change to any stored value, seed, save or link: the capture step and `sessionCapture.ts` are untouched in
      the diff.
- [ ] Crawford's look (§5.3) passed.
- [ ] COMPONENT_LIBRARY.md's readout paragraph describes `SliderLog`'s `aria-valuetext` and names the twelve.
- [ ] Backlog 33 carries a Built line for piece 2, its "no unit" sentence is corrected, and the parked grid paragraph
      is unchanged.
- [ ] Every check in §5.4 is clean.

---

## 6. Git & Workflow Context

- **Branch:** `feature/log-slider-readouts`, off `main` at `9fdb6919` (PR #608 merged). The intent file is on `main`
  uncommitted and moves to this branch as its first commit with this spec.
- **Tasks:** in order, one commit each, RED first where there is behaviour. The plan fixes the exact list.
  1. Docs: the intent file and this spec.
  2. `fixedReadout` RED, then green (§5.1 test 1).
  3. `SliderLog` `aria-valuetext` RED, then green (test 3).
  4. The twelve schemas RED, then green, with the `logReadout` helper and the attack/release content unit and pin
     amendments in the same commit, since the compiler and test 2 tie them together (test 2, §5.2).
  5. Checkpoint: Crawford's look (§5.3).
  6. Docs: COMPONENT_LIBRARY.md, the `formatValue` doc comment in `controls.ts`, the backlog entry's Built line and
     correction. At merge, 33 goes to the archive in the usual way and its plan.md line is deleted.
- **Type safety per commit:** each commit type-checks. The content unit change and its test pins land together.
- **Commit messages:** short and imperative, naming the proof ("RED then green: …", "a read"). The PR is Crawford's.

---

## 7. Open Questions

1. **`12ms` or `12 ms`?** The interview confirmed `12ms`, but the app's one existing milliseconds readout, the
   chorus Delay (`fleet.chorus.delay`), carries `unit: ' ms'` with a leading space, and `content.test.ts` has a
   "word unit has room before it" rule for ` measures`, ` bits` and ` oct`. `Hz`, `s` and `dB` have no space.
   **Recommend `' ms'`,** matching the chorus Delay so the two millisecond readouts in the Rig agree; the compressor
   then reads `12 ms` beside `-24dB`, which is what the chorus block already does with `5 ms` beside `1.5Hz`. If
   Crawford prefers `12ms`, the chorus Delay's unit should lose its space in the same commit so they still agree.
2. **A content pin for the compressor unit?** §5.1 test 4 is optional. Recommend writing it, one `it`, since the unit
   now carries meaning (a wrong `s` would show `12s` for a 12 ms attack) and the content test is where unit pins live.
3. **Automation Rate's `aria-valuetext`.** It gains one as a side effect of task 3. Its readout is a sentence
   ("every 4 measures"), which is a fine announcement. Recommend no special case; noted so it is a decision, not drift.
