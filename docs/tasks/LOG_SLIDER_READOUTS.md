# Implementation Plan: Log Sliders That Read Cleanly

Source spec: [docs/specs/LOG_SLIDER_READOUTS.md](../specs/LOG_SLIDER_READOUTS.md). Source intent:
[docs/intent/log-slider-readouts.md](../intent/log-slider-readouts.md). Backlog slot:
[33](../todo/backlog.md#33-audio-rig-exact-stepped-values-and-log-sliders-that-read-cleanly) piece 2, the first line of
plan.md's Stage 2. Build branch: `feature/log-slider-readouts` off `main` at `9fdb6919` (PR #608 merged).

**Spec §7 is resolved** (Crawford, 2026-11-07). The Architecture Decisions record each answer:

- Q1: the space stays. The compressor's unit is `' ms'`, like the chorus Delay's, so attack reads `12 ms`.
- Q2: yes, one content pin for the compressor unit.
- Q3: Automation Rate gains `aria-valuetext` with no special case.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`
(the look).

The planning skill's default output paths, `tasks/plan.md` and `tasks/todo.md`, are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".

## Overview

Twelve `sliderLog` schemas in `src/data/audioRigConfig.ts` get a `formatValue` so their readouts look like pedal
markings: whole hertz on the four frequencies, whole milliseconds on the compressor's attack and release, a fixed two
decimals on the four Qs, reverb length and the AutoWah follower. One small factory, `fixedReadout`, produces all three
shapes. `SliderLog` gains `aria-valuetext` whenever a schema formats its value, copying `SliderLinear`'s existing lines.
Nothing stored, seeded, saved or linked changes.

The work is four code tasks and one docs task, one commit each, with the suite green after every one:

- T1 the factory, new code with no caller yet (RED test);
- T2 `SliderLog`'s `aria-valuetext`, which also has no formatting caller in the Rig yet beyond Automation Rate (RED
  test);
- T3 the twelve schemas, the compressor content unit, its two amended pins and the one new content pin (RED test);
- Checkpoint A: Crawford's look in the browser;
- T4 the docs, the `formatValue` doc comment and the backlog entry (Read).

Each task names its **Proof** (TASK_TEMPLATE.md): a RED test for T1, T2 and T3; a Read for T0 and T4. No docs guards
and no source scans (CLAUDE.md, 2026-10-23).

## Architecture Decisions

- **One factory, three uses** (spec §3). `fixedReadout(decimals, unit = '', scale = 1)` in
  `src/components/ui/controls/formatReadout.ts` returns `(value) => \`${(value * scale).toFixed(decimals)}${unit}\``.
  Whole hertz is `fixedReadout(0, unit)`, milliseconds is `fixedReadout(0, unit, 1000)`, two decimals is
  `fixedReadout(2, unit)`. It sits beside `formatDisplayValue` because it is the same kind of thing: a display-only
  readout helper the primitives' consumers reach for. No `decimals` or `scale` field is added to `SliderLogSchema`.
- **The schema keeps its `unit` and the formatter is handed the same string** (spec §3). A local helper in
  `audioRigConfig.ts`, `logReadout(key: ContentKey, decimals, scale = 1)`, calls `labels(key)` once and returns
  `{ ...labels, formatValue: fixedReadout(decimals, labels.unit, scale) }`. So the existing "every pedal param reads its
  label, lore and unit from its own content entry" case keeps passing, and no unit literal appears in the config.
  `ContentKey` is already imported there.
- **Resolves spec §7 Q1: `' ms'` with the space.** The chorus Delay (`fleet.chorus.delay`) is the app's one millisecond
  readout and carries `unit: ' ms'`; `content.test.ts` has a "word unit has room before it" rule for ` measures`,
  ` bits` and ` oct`. The compressor's two entries follow it, so the Rig's two millisecond readouts agree. `toFixed`
  then produces `12` and the unit supplies ` ms`.
- **Resolves spec §7 Q2: one content pin** (T3). A new `it` in `content.test.ts` reads
  `CONTENT['fleet.compressor.attack'].unit` and `.release` and asserts both trim to `ms` and start with a space. It
  reads the content object, never the file.
- **`aria-valuetext` follows `SliderLinear` exactly** (spec §1, §3; resolves §7 Q3). `SliderLog` computes
  `const formattedValue = schema.formatValue?.(displayValue)` once, renders it in the label where today's ternary
  calls `formatValue` inline, and passes it as the thumb's `aria-valuetext`. Absent `formatValue`, the attribute is
  `undefined` and nothing renders, so every unformatted schema is byte-for-byte unchanged in the DOM. Automation Rate's
  sentence readout becomes its announcement with no special case.
- **T2 lands before T3** (ordering). T2 is independent of T3 and smaller; landing it first means T3's twelve readouts
  are announced correctly the moment they exist, and T3's one browser look (Checkpoint A) covers both.
- **The content unit change, its two amended pins and the twelve schemas land in one commit** (T3). `audioRigConfig.test.ts`
  pins `unit: 's'` on attack and release (lines near 93 and 99 today); changing the content entry without the pins
  turns the suite red, and the spec's §5.1 test 2 needs the schemas. The compiler and the suite tie them together.
- **`formatDisplayValue` is untouched** (spec §3). Its drop-the-zeros behaviour is right for the stepped linear
  sliders. The two-decimal fields need zeros kept, which is why `toFixed` is used and not `formatDisplayValue`.
- **Display only, and a test says so** (spec §5.2). T3's schema test includes a case that the twelve schemas carry
  no `step` and that `formatValue` returns a string; `SliderLog.test.tsx`'s existing "passes the raw (unrounded)
  value to formatValue" case is the other half.

## Dependency Graph

```
T0 (spec Status: Crawford's answers recorded)
        │
   ┌────┴────┐
   │         │
  T1        T2
(factory)  (SliderLog aria-valuetext)
   │         │
   └────┬────┘
        │
       T3 (the twelve schemas, the content unit, the pins)
        │
  Checkpoint A (Crawford's look)
        │
       T4 (docs, doc comment, backlog)
        │
  Checkpoint: Complete
```

T1 and T2 are independent and may land in either order; T3 needs both.

## Task List

### Phase 0: Record

- [ ] **T0: the spec's Status and §7 — record the answers**

  **Description:** Already done on `main` while planning (2026-11-07): the spec's Status block carries the three §7
  answers and the readout table and §5.1 carry the `12 ms` spacing. This task is the first commit on the branch: the
  intent file, the spec and this plan.

  **Proof:** Read — the three files on the branch.

  **Acceptance criteria:**
  - [ ] The spec's Status names the plan and the three §7 answers.
  - [ ] The intent file's last paragraph names the two `audioRigConfig.test.ts` unit pins and links the spec.

  **Verification:**
  - [ ] `npm run lint` clean (docs only).

  **Dependencies:** None.

  **Files:** `docs/intent/log-slider-readouts.md`, `docs/specs/LOG_SLIDER_READOUTS.md`,
  `docs/tasks/LOG_SLIDER_READOUTS.md`

  **Estimated scope:** XS (docs only)

---

### Phase 1: Foundation

- [ ] **T1: `formatReadout.ts` — the `fixedReadout` factory**

  **Description:** New module `src/components/ui/controls/formatReadout.ts` exporting
  `fixedReadout(decimals: number, unit = '', scale = 1): (value: number) => string`, per Architecture Decisions.
  No caller yet; T3 is the caller. Its doc comment says what the readout is and points to the spec; it does not
  narrate the change.

  **Proof:** RED test — `src/components/ui/controls/formatReadout.test.ts`: fails first because the module does not
  exist.

  **Acceptance criteria:**
  - [ ] `fixedReadout(0, 'Hz')` gives `3152.859 → '3153Hz'`, `20 → '20Hz'`, `19999.9999 → '20000Hz'`,
        `4999.999999999999 → '5000Hz'`.
  - [ ] `fixedReadout(0, ' ms', 1000)` gives `0.012 → '12 ms'`, `0.001 → '1 ms'`, `0.2 → '200 ms'`,
        `0.35 → '350 ms'`, `1 → '1000 ms'`, `0.0005 → '1 ms'` (half rounds up, never `0 ms`).
  - [ ] `fixedReadout(2, 's')` gives `2.4 → '2.40s'`, `0.1 → '0.10s'`, `10 → '10.00s'`, `0.07999 → '0.08s'`.
  - [ ] `fixedReadout(2)` gives `3.15278 → '3.15'`, `0.5 → '0.50'`, `20 → '20.00'`, with no unit appended.
  - [ ] An eased fractional argument formats like any other: `fixedReadout(0, 'Hz')(3152.4) → '3152Hz'`.
  - [ ] Mutation check, done and stated in the commit: `toFixed` swapped for `formatDisplayValue` fails the zero-kept
        cases; `scale` dropped fails the millisecond cases.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/formatReadout.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T0.

  **Files:** `src/components/ui/controls/formatReadout.ts`, `src/components/ui/controls/formatReadout.test.ts`

  **Estimated scope:** XS (one new function and its test)

- [ ] **T2: `SliderLog.tsx` — `aria-valuetext` when the schema formats its value**

  **Description:** In `src/components/ui/controls/SliderLog.tsx`, compute
  `const formattedValue = schema.formatValue?.(displayValue);` once above the label (with `SliderLinear`'s comment:
  the visible readout and the thumb's `aria-valuetext` must never disagree), render `formattedValue` in the label's
  ternary in place of the inline call, and add `aria-valuetext={formattedValue}` to `Slider.Thumb`. Nothing else in
  the file changes. Automation Rate, today's only formatting schema, gains the attribute (spec §7 Q3).

  **Proof:** RED test — `src/components/ui/controls/SliderLog.test.tsx`: fails first because today's thumb has no
  `aria-valuetext`.

  **Acceptance criteria:**
  - [ ] With a `formatValue`, `screen.getByRole('slider')`'s `aria-valuetext` equals the rendered
        `.sc-slider-log__value` text.
  - [ ] Without a `formatValue`, the thumb has no `aria-valuetext` attribute (`getAttribute` returns `null`).
  - [ ] `aria-valuenow` is still the track position `t` (the existing case near line 208 passes unchanged).
  - [ ] The existing `formatValue` block's three cases and the `{value}{unit}` fallback case pass unmodified.
  - [ ] Mutation check, stated in the commit: a constant `aria-valuetext` fails the first case.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/SliderLog.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T0. Independent of T1.

  **Files:** `src/components/ui/controls/SliderLog.tsx`, `src/components/ui/controls/SliderLog.test.tsx`

  **Estimated scope:** XS (three lines in one component, two test cases)

### Checkpoint: Foundation
- [ ] `npm run build:types`, `npm run lint` clean; the two test files pass.
- [ ] `fixedReadout` exists with both mutations proven; `SliderLog` announces a formatted readout and is unchanged
      without one.
- [ ] No consumer in the Rig has changed yet: every log slider but Automation Rate renders as before.

---

### Phase 2: The twelve readouts

- [ ] **T3: `audioRigConfig.ts` and `fleet.ts` — the twelve schemas read as the spec's table says**

  **Description:** In `src/data/audioRigConfig.ts`, add the local helper
  `logReadout(key: ContentKey, decimals: number, scale = 1)` (Architecture Decisions) and replace `...labels(key)` on
  each of the twelve `sliderLog` schemas with `...logReadout(key, …)`: `0` for the four frequencies; `0, 1000` for
  `compressor.attack` and `compressor.release`; `2` for `filterLPF.Q`, `filterHPF.Q`, `autoWah.Q`, `phaser.Q`,
  `reverb.decay` and `autoWah.follower`. In `src/content/copy/fleet.ts`, `fleet.compressor.attack` and
  `fleet.compressor.release` change `unit: 's'` to `unit: ' ms'`; their help copy is untouched. In
  `src/data/audioRigConfig.test.ts`, the attack and release pins change `unit: 's'` to `unit: ' ms'` and their titles
  say milliseconds. In `src/content/content.test.ts`, one new `it` pins the compressor unit (spec §7 Q2).

  **Proof:** RED test — `src/data/audioRigConfig.test.ts`: the new `it.each` fails first because no rig `sliderLog`
  but Automation Rate has a `formatValue`. The new `content.test.ts` case fails first because the unit is `'s'`.

  **Acceptance criteria:**
  - [ ] An `it.each` over `[block, field, sample, expected]` using the file's `findParam` passes for all twelve:
        `filterLPF.frequency 3152.859 → '3153Hz'`, `filterHPF.frequency 20 → '20Hz'`,
        `autoWah.baseFrequency 999.6 → '1000Hz'`, `phaser.baseFrequency 50 → '50Hz'`,
        `compressor.attack 0.012 → '12 ms'`, `compressor.release 0.35 → '350 ms'`,
        `filterLPF.Q 3.15278 → '3.15'`, `filterHPF.Q 0.1 → '0.10'`, `autoWah.Q 0.5 → '0.50'`, `phaser.Q 20 → '20.00'`,
        `reverb.decay 2.4 → '2.40s'`, `autoWah.follower 0.08 → '0.08s'`.
  - [ ] Every `sliderLog` schema in `AUDIO_RIG_CONFIG` (and the Automation Rate schema) has a `formatValue`, so a
        thirteenth log slider added without one fails.
  - [ ] Display only (spec §5.2): the same `it.each` asserts each schema has no `step` property and `formatValue`
        returns a string.
  - [ ] The attack and release pins pass with `unit: ' ms'`; the four `Hz`/`s` pins on the filters and reverb pass
        unchanged; "every pedal param reads its label, lore and unit from its own content entry" passes unchanged.
  - [ ] `content.test.ts`: `CONTENT['fleet.compressor.attack'].unit` and `.release` both trim to `ms` and start
        with a space; the two help strings are unchanged (not asserted; a read at the checkpoint).
  - [ ] Mutation check, stated in the commit: `scale` left off attack fails its case; `2` changed to `3` on a Q fails
        its case.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean (the content guard sees no `unit:` literal in the config).

  **Dependencies:** T1, T2.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`, `src/content/copy/fleet.ts`,
  `src/content/content.test.ts`

  **Estimated scope:** S (four files; twelve one-token schema edits, one helper, two content lines, three test edits)

### Checkpoint A: Crawford's look (spec §5.3)
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean (full suite; name any pre-existing unrelated
      failure so a new one stands out).
- [ ] `npm run dev`, Fleet Params. Drag each of the twelve across its range:
  - the frequencies never show a decimal or a `k`;
  - attack and release read whole milliseconds with the space, `12 ms`;
  - the two-decimal fields never lose their second digit mid-drag;
  - no label's width jumps on a content flip (`20Hz` to `20000Hz` is the range, not a flip);
  - Automation Rate reads as before.
- [ ] Accessibility tree or screen reader: a log slider's thumb announces the readout, not a fraction.
- [ ] Reviewed with Crawford before T4. If the look is not done this session, it is flagged here, never skipped.

---

### Phase 3: Docs

- [ ] **T4: `COMPONENT_LIBRARY.md`, `controls.ts`, backlog 33 — document the shipped behaviour**

  **Description:** `docs/COMPONENT_LIBRARY.md`: the readout paragraph (the one that names `formatDisplayValue` and
  "at most 3 decimal places") gains that `SliderLog`'s `formatValue` also sets the thumb's `aria-valuetext`, as
  `SliderLinear`'s does, and that the Rig's twelve log sliders read through `fixedReadout` (name the three shapes).
  `src/types/controls.ts`: `SliderLogSchema.formatValue`'s doc comment says it is also the thumb's `aria-valuetext`,
  matching `SliderLinearSchema.formatValue`'s. `docs/todo/backlog.md` item 33: a **Piece 2 built 2026-11-xx** line
  naming the three shapes and `aria-valuetext`; the "None of their `sliderLog` schemas has a `unit`" sentence
  corrected to say eight carry one through `labels()` and the four Qs are bare; the parked grid paragraph unchanged.
  Check `docs/AUDIO_SYSTEM.md` for a compressor attack/release unit mention and change it only if one exists.
  Spot-check every named identifier against the shipped source.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] COMPONENT_LIBRARY.md describes `SliderLog`'s `aria-valuetext` and names `fixedReadout` and the twelve.
  - [ ] The `formatValue` doc comment in `controls.ts` matches `SliderLinearSchema`'s on `aria-valuetext`.
  - [ ] Backlog 33 carries the Built line and the corrected unit sentence; the parked paragraph is byte-for-byte as
        before.

  **Verification:**
  - [ ] Manual review, every name spot-checked against the final code.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T3, Checkpoint A.

  **Files:** `docs/COMPONENT_LIBRARY.md`, `src/types/controls.ts`, `docs/todo/backlog.md`, possibly
  `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs and one doc comment)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every acceptance criterion in T1–T4 met; every mutation check stated in its commit.
- [ ] `src/utils/sessionCapture.ts` and `src/utils/globalAudioSeed.ts` are absent from the branch diff.
- [ ] Checkpoint A done, or flagged here.
- [ ] Ready for Crawford's PR. At merge: backlog 33 moves to the archive in the usual way (roadmap stubs, backlog no
      stubs; rebase links on the move), and its plan.md Stage 2 line is deleted.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A readout path quietly starts snapping the value (a "while we're here" step), moving a seeded world's sound | Medium | T3's no-`step` assertion; `SliderLog.test.tsx`'s raw-value case; the Complete checkpoint's diff check on `sessionCapture.ts` and `globalAudioSeed.ts`. |
| `aria-valuetext` and the label disagree after a later edit to one of them | Low | T2 computes `formattedValue` once and both read it; the T2 test compares the attribute to the rendered text, not to a literal. |
| `toFixed` on a float just under a half gives a surprising last digit (`0.07999 → '0.08'` is right, but `1.005.toFixed(2)` is `'1.00'`) | Low | Accepted. A log slider's values are off-grid, so no stored value sits exactly on a half; the label is display only and the next pixel of drag moves it. |
| The content guard's lint does not see the unit passed to `fixedReadout` as an argument, so a literal could slip in | Low | Architecture Decisions: `logReadout` is the only place a unit reaches the factory and it reads `labels(key).unit`. A reviewer reads the helper; T3's "every pedal param reads … unit from its own content entry" case pins the schema side. |
| The chorus Delay and the compressor disagree on spacing later | Low | Both carry `' ms'` from content; T3's content pin and the existing `fleet.chorus.delay` pin hold them. |

## Open Questions

1. `12ms` or `12 ms`? **Resolved** (Crawford, 2026-11-07): the space stays, `' ms'` like the chorus Delay.
2. A content pin for the compressor unit? **Resolved**: yes, one `it` in T3.
3. Automation Rate's `aria-valuetext`? **Resolved**: no special case; it gains the attribute in T2.
