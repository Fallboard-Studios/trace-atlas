# Implementation Plan: Output Headroom — No Clipping Out of the Box

Spec: [docs/specs/OUTPUT_HEADROOM.md](../specs/OUTPUT_HEADROOM.md). Intent:
[docs/intent/output-headroom.md](../intent/output-headroom.md). Roadmap
[54](../todo/roadmap.md#54-output-headroom-no-clipping-out-of-the-box), Stage 1 of [plan.md](../todo/plan.md). Build
branch `feature/output-headroom` off `main` at or after `5307a0cf`, nothing else on it.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`,
`npm run build && npx vite preview --port 4173` (the served build the probes drive), `npm run perf:level` (new, T2),
`npm run perf:audio`; the phone gate is the `?debug` HUD on the Pixel 8 (spec §5.4).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status (2026-10-23): T0 passed** (Crawford: "for phase 0 your assumptions are fine", all five as written). Building
> on `feature/output-headroom`. **Phase 1 (T1–T3) done**: the probe, the seven links and the `main` measurement are in
> PERFORMANCE.md, "Output level series". H1 and H2 get their robot Volume push from the probe's `--robot-volume-full`
> (session links never carry `masterVolume`; Crawford's choice, spec §7). **Phase 2 (T4–T6) done** (`f3518293`,
> `17546ac4`, `12776551`) and **Checkpoint A1 passed**. **T7 stopped** on an `out` miss (H1 +2.7 dB): the ceiling had
> no curve (Tone's `WaveShaper` reads `mapping`, not `curve`). Crawford, 2026-10-23: fix it as **T5.1**, then re-run
> T7 in full; hold `HEADROOM_TRIM_DB` at −12 and record `pre` rather than gate it (spec assumption 3 and §7).
> **T5.1 done** (`993217fc`); **T7 done**: every gate met on all seven variants (PERFORMANCE.md, "The branch"). **T8
> done**: the ceiling's audio-thread cost is below the method's resolution. **Checkpoint A** heard one world crunch
> with every robot at 100 % (`6j0mgo5z`): the seeded Compressor's 70 ms release, not the ceiling; Crawford: raise the
> seeded release floor to 0.25 s (spec §7). **T9 done** (`1c13470d`, the gate re-run in PERFORMANCE.md "After T9").
> **Phase 3 complete.** Crawford's re-listen after T9: "desktop sounds good" (Checkpoint A closed). **T10 next: the
> phone (Checkpoint B, Crawford's device).**

## Overview

Two engine constants and one measuring instrument. A fixed **trim** folded into every robot's bus gain
(`robotBusGain = volumePositionToGain × HEADROOM_TRIM_GAIN`, starting at −12 dB) brings the fleet's sum under 0 dBFS
with room for the EQ; a **soft ceiling** (`Tone.WaveShaper`, identity below a 0.7 knee, tanh above it, never full
scale) after the Limiter and before the master gain makes sure nothing leaves above it. Nothing is stored, seeded,
shown or shared. The work is: the probe first, so `main` is measured before a line of engine code changes → the pure
parts → the ceiling node → the trim → the gate runs, tuning the trim → Crawford's listen → the phone → the docs. Every
task names its **Proof** (TASK_TEMPLATE.md): a RED test for the five that change behaviour (T1, T4, T5, T6 and a
conditional T9), mutation-checked; a Look for the probe's live run (T2); a Read for the measurement and docs tasks.
One commit per task, suite / types / lint / build green. No docs guards, no source scans (CLAUDE.md, 2026-10-23).

## Architecture Decisions

- **The probe comes first (T1–T3) and is checked in.** The roadmap's "measure `main` in the same sitting" question is
  answered before any engine change, with the instrument that later gates the branch, so the before and after share
  one method. Its pure parsing is unit-tested like `audio-load-lib.mjs`; the CDP plumbing is mirrored, not shared
  (the two scripts poll different things and `audio-load.mjs` is not refactored here).
- **Worlds are pinned by `?session=` links, made once (T3) and recorded.** `?seed=&x=&y=` is dead
  (`docs/PERFORMANCE.md:52`); a session link carries the world and any override, so the "pushed hot" variants are
  links too. The links go in PERFORMANCE.md's table; the gate is reproducible from the docs alone.
- **Pure parts before nodes (T4).** `softCeiling`, `softCeilingCurve`, `robotBusGain` and the constants are tested by
  property (identity below the knee, monotonic, odd, bounded) before anything is wired.
- **The ceiling lands before the trim (T5 before T6).** With the ceiling in and the trim not yet, the app sounds as
  today except that nothing clips: a build whose only change is the ceiling is the one to compare against `main`
  if the ceiling colours anything. The trim then lowers everything by one constant.
- **The trim goes in through one helper at three call sites (T6).** `volumePositionToGain` is untouched: the master
  slider shares it and must keep unity at 1 (spec assumption 2 and 6).
- **The trim value is tuned by the gate, not by ear (T7).** Spec §5.2's `pre ≤ −6 dBFS` on five worlds picks
  `HEADROOM_TRIM_DB`; Crawford's ear (Checkpoint A) picks the ceiling's knee and oversample and whether the deep
  Compressor band narrows. Two different questions, two different judges. *(Superseded at T7, 2026-10-23: the `pre`
  target would have taken the trim near −22 dB; Crawford held −12 dB and `pre` is recorded, spec assumption 3.)*
- **Numbers live in PERFORMANCE.md, phone reports in scratchy-audio-phones.md**, as every audio phase before.

## Dependency Graph

```
T0 Crawford confirms the five open questions (spec §7) ─────────────── STOP ──────────────┐
                                                                                          │
T1 output-level-lib.mjs: parseOutputFromHud, summarizeLevels (pure, tested)               │
 └─► T2 output-level.mjs: the CDP probe + "perf:level" script                             │
      └─► T3 the seven session links; the `main` measurement (D1 ×3, D5); PERFORMANCE.md  │
                                                                                          │
T4 headroom.ts: constants, softCeiling, softCeilingCurve, robotBusGain (pure) ◄───────────┘ (needs T0)
 ├─► T5 the ceiling node in globalFx: build, chain slot, disconnect list, absent/throw, headless mock
 └─► T6 the trim at the three bus-gain write sites in AudioEngine
                      Checkpoint A1: all automated (after T1–T6)
T7 the gate: trim-alone run, complete run, tune HEADROOM_TRIM_DB; the table (needs T3, T5, T6) — STOP on an `out` miss
T8 perf:audio A/B on D5 (needs T7)
                      Checkpoint A: Crawford's desktop listen — STOP
T9 (conditional) apply Checkpoint A's decisions; re-run T7's table
T10 phone gate — Checkpoint B (Crawford's device) — STOP
T11 docs: AUDIO_SYSTEM, the grid, roadmap 54 as-built, backlog 23, plan.md, memory
                      Checkpoint: Complete — PR is Crawford's
```

T1–T3 do not depend on T0 and may run while the open questions wait; T4 onward need T0's answers (assumption 2 decides
where the trim goes, assumption 6 whether it goes at all as specified). T5 and T6 are independent of each other after
T4 and may run in either order.

---

## Phase 0: Before the build

### Task 0: Crawford confirms the open questions — **STOP**

**Description:** The five veto points in spec §7, put to Crawford one at a time with the spec's default: (1) the trim
on the robot bus, not at the chain entry (the rooms argument); (2) "quieter" is made up on the device, the header
slider cannot boost; (3) the knee and oversample are Checkpoint A's by ear, starting 0.7 and `'none'`; (4) the deep
Compressor band is narrowed only if Checkpoint A hears it; (5) backlog 23 deferred with one line, not built. Any
"no" is written into the spec (an assumption rewritten, a §7 answer recorded) before T4.

**Proof:** Read — Crawford's answers in spec §7. No test file.

**Acceptance criteria:**
- [x] Each of the five has a recorded answer in spec §7 (a line each, dated). — all five "yes", 2026-10-23.
- [x] A "no" on (1) or (2) has its replacement assumption written before T4 starts. — none.

**Verification:** a human read of spec §7. **Dependencies:** None. **Files:** `docs/specs/OUTPUT_HEADROOM.md`.
**Scope:** XS (no code).

---

## Phase 1: The instrument

### Task 1: `output-level-lib.mjs` — the pure parsing and summary

**Description:** `scripts/perf/output-level-lib.mjs` exports `parseOutputFromHud(text)`, which finds the HUD's
output line `out <peak> rms <rms>  pre <peak>  fin <token>` (`hudLines.ts:86`) and returns
`{ outPeakDb, outRmsDb, prePeakDb, fin }` with `-` as `null`, `-inf` as `-Infinity` and `1.2dB` as `1.2`; `null` when
the line is absent. `summarizeLevels(samples)` takes `{ t, outPeakDb, outRmsDb, prePeakDb }[]` and returns per tap the
peak max, peak mean, RMS mean (out only), the count and fraction of readings with peak ≥ 0 dB, and `n`; readings with
a `null` peak are dropped from that tap's statistics and counted separately. Both are pure.

**Proof:** RED test — `scripts/perf/output-level-lib.test.mjs`: the four token forms parse to the expected numbers
and the summary's ≥ 0 dB fraction is right; both fail before the lib exists.

**Acceptance criteria:**
- [x] `parseOutputFromHud` handles the four token forms (number, `-`, `-inf`, `NaN!`), a HUD with other lines around
  it, and an empty string; the mutation gate kills a swapped `out`/`pre` group and a dropped sign. — `315f7884`; also
  rows run together (the overlay's `textContent`) and a rounded `-0.0dB` read as 0.
- [x] `summarizeLevels` on a hand-built sample set gives the expected max, mean, the ≥ 0 dB fraction (a reading at
  exactly 0.0 counts), and drops `null`s without skewing the mean. — silent (`-inf`) readings count in N but not in the
  means, and are reported; `fin` tokens counted. 17 tests; 14 mutants killed (one survivor closed by a tighter test).

**Verification:** `npx vitest run scripts/perf/output-level-lib.test.mjs` (vitest includes `scripts/**/*.test.mjs`).
**Dependencies:** None. **Files:** `scripts/perf/output-level-lib.mjs`, `output-level-lib.test.mjs`. **Scope:** S.

---

### Task 2: `output-level.mjs` — the probe, and `npm run perf:level`

**Description:** `scripts/perf/output-level.mjs`, the CDP plumbing mirrored from `audio-load.mjs` (fresh Chrome and
profile, `Page.navigate`, wait for and click `button[aria-label="Power on"]`, warm-up, poll every 500 ms): for each
`--url` (comma-separated, full page URLs that already carry `?debug` and `?session=`), read the HUD text for
`--seconds` (default 120) after `--warmup` (default 8), parse with T1, and print a table per URL (peak max / mean, RMS
mean, ≥ 0 dB count of N, `fin`), with `--json <path>` for the raw samples. Fails the run with a non-zero exit when
`fin` reads `NaN!` or when the HUD never appears. `--help` documents it; `--chrome` and `--port` as the template.
`package.json` gains `"perf:level": "node scripts/perf/output-level.mjs"`.

**Proof:** Look — one foreground run against `vite preview` prints the table and exits 0; a HUD-less URL exits
non-zero. The script is CDP plumbing with no pure part of its own (T1 holds that), so no test file.

**Acceptance criteria:**
- [x] Against a served build and any `?debug` link, the script prints the table and exits 0; with a URL whose page
  has no HUD it exits non-zero with a message naming the URL. — `57a16ba2`.
- [x] No new dependency; the only imports are `node:` modules and T1's lib.
- [x] `npm run perf:level -- --help` prints the usage block.

**Verification:** one foreground run against `vite preview` (a random world is fine here), the orphaned-Chrome check
before and after. **Dependencies:** T1. **Files:** `scripts/perf/output-level.mjs`, `package.json`. **Scope:** S.

---

### Task 3: The seven links and the `main` measurement

**Description:** Build the spec §5.2 variants as `?session=` links on `main`: on `npm run dev`, over CDP
`Runtime.evaluate` with dynamic imports of `/src/systems/worldTransition.ts` (`retransmitWorld` to the five worlds'
seed and coordinates) and `/src/utils/sessionShareUtils.ts` (`buildShareUrl(getSessionSharePayload())`), and for H1
and H2 the robot Volumes at 1, the EQ bands at +12 and the Limiter at 0 set through the stores before the payload is
read. Then on the served production build of `main`: `perf:level` on D1 three times and D5 once, 120 s each,
foreground, one at a time. Start a new section in `docs/PERFORMANCE.md`, "Output level series — `npm run perf:level`":
the method, the hygiene, the seven links in a table (variant, world, settings, link) and the `main` numbers with the
commit hash.

**Proof:** Read — the PERFORMANCE.md section, every number from a run in this task. No test file.

**Acceptance criteria:**
- [x] Seven links that each load their world and settings (D1 opens `56c2t2t8` at (−116, −2); H1's drawer shows the
  pushed values). — read back from the stores after a reload, not the drawer. **Deviation:** H1 and H2's links carry
  the EQ and Limiter push but not "every robot Volume 100 %" (`masterVolume` is never in a session payload); the probe
  gained `--robot-volume-full`, which sets it through the All Probes form (Crawford, 2026-10-23). Recipe corrections:
  modules under `/trace-atlas/src/`, and `buildSessionPayload()`, not `getSessionSharePayload()`.
- [x] `main`'s D1 numbers reproduce the roadmap's reading within its own band (`out` peak +2 to +4 dB, over 0 dBFS in
  10–25 % of readings) or the discrepancy is written down; D5 recorded. — runs 2 and 3 inside; run 1 just outside
  (+4.6 dB, 25.1 %), written down.
- [x] The PERFORMANCE.md section exists with every link and number from this task.

**Verification:** the section and a human read. **Dependencies:** T2. **Files:** `docs/PERFORMANCE.md`. **Scope:** S
(measurement, no code).

---

## Phase 2: The engine

### Task 4: `headroom.ts` — the pure parts

**Description:** `src/engine/audioEngine/headroom.ts` exports `HEADROOM_TRIM_DB = -12`, `HEADROOM_TRIM_GAIN`,
`robotBusGain(position)`, `CEILING_KNEE = 0.7`, `CEILING_CURVE_LENGTH = 4097`, `softCeiling(x, knee)` and
`softCeilingCurve(length, knee)` exactly as spec §1.2, each constant with its one-paragraph comment. Nothing uses them
yet (exported, so `noUnusedLocals` is content).

**Proof:** RED test — `src/engine/audioEngine/headroom.test.ts`: the curve's identity-below-the-knee, bound and
symmetry properties and `robotBusGain`'s taper-times-trim identity; all fail before the module exists.

**Acceptance criteria:**
- [x] `softCeiling`: identity for `|x| ≤ knee`; strictly increasing over 401 points on [−1, 1]; odd; `f(knee) === knee`
  and `f(knee + 1e-6) − knee < 1e-6`; `|f(x)| < 1` everywhere; `f(1) ≈ knee + (1 − knee)·tanh(1)` within 1e-12. The
  mutation gate kills a `≥` for `≤` at the knee, a dropped `Math.sign`, a `tanh` replaced by its argument. — **Deviation:**
  in doubles `(0.7 + 1e-6) − 0.7` is 1.0000000000287e-6, so the literal `< 1e-6` cannot hold; tested against that real
  offset (`> 0`, `≤ dx`, slope 1 to six places). 11 of 12 mutants killed; the survivor, `<` for `≤` at the knee, is
  equivalent (at `|x| = knee` the tanh branch returns `knee + room·tanh(0)`, exactly `x`).
- [x] `softCeilingCurve`: a `Float32Array` of `length`, `curve[(length − 1) / 2] === 0`, ends at `±f(1)`, monotonic. —
  also every entry at or below the knee is `Math.fround(x)` exactly, and a custom length and knee are honoured.
- [x] `robotBusGain(1) === HEADROOM_TRIM_GAIN`, `robotBusGain(0) === 0`, and equals
  `volumePositionToGain(p) × HEADROOM_TRIM_GAIN` at `p` 0.25, 0.5, 0.8; `HEADROOM_TRIM_GAIN === 10 ** (−12 / 20)` and
  is below 1. — tested as `10 ** (HEADROOM_TRIM_DB / 20)` so T7 can move the constant; out-of-range positions clamp.

**Verification:** `npx vitest run src/engine/audioEngine/headroom.test.ts`; `npm run build:types`.
**Dependencies:** T0. **Files:** `headroom.ts`, `headroom.test.ts`. **Scope:** S.

---

### Task 5: The ceiling node in `globalFx.ts`

**Description:** A module-scope `_ceiling: Tone.WaveShaper | null` beside `_globalLimiter`, reset to `null` where the
others are; built in `buildGlobalFxChain` after the Limiter from `getToneCtor('WaveShaper')` with
`{ curve: softCeilingCurve(), oversample: 'none' }` inside the spec §4 try/catch (one `devWarn` on a throw);
`nodeSpan(_ceiling)` after `nodeSpan(_globalLimiter)` in `wireGlobalFxChain`'s `chainNodes`; listed between
`_globalLimiter` and `_masterGain` in `disconnectAllFxNodes`. The join, the cells, the taps, every setter and
`getGlobalChainEntry` are untouched. Tests: the `vi.mock('tone')` factory in `globalFx.test.ts` gains a `WaveShaper`
spy (`connect`/`disconnect`/`toDestination`, records its options) behind a `toneFlags.shaperAbsent` /
`shaperThrows` pair in the existing style; the headless mock gains `WaveShaper: undefined`.

**Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts`: the chain-order cases assert
`Limiter → ceiling → masterGain` and the constructor's options; they fail while the Limiter still feeds the master
gain directly.

**Acceptance criteria:**
- [x] The dry-chain order cases (`globalFx.test.ts:4706`, `:4783`, `:772`'s `it.each`) assert
  `Limiter → ceiling → masterGain` in both Decay Modes; the Controlled join still lands on the Width cell's `in`, never
  the ceiling; the constructor was called once with a `curve` of length `CEILING_CURVE_LENGTH` whose middle entry is 0
  and `oversample: 'none'`. — options read back by key (`toStrictEqual`), the curve equal to `softCeilingCurve()`;
  in both Decay Modes the Limiter is the only node of any constructor that feeds the ceiling.
- [x] The disconnect-order case (`:533`) lists the ceiling between master and Limiter; a Decay flip disconnects and
  reconnects it exactly once; the `out` tap still hangs off `_masterGain` (`:4954`'s neighbours unchanged). — also no
  tap hangs off the ceiling; the Limiter-absent case (`:827`) now runs Width cell cut → ceiling → master, and with no
  master gain the ceiling goes to the destination itself.
- [x] Constructor absent → `Limiter → masterGain`, no warn; constructor throws → the same with one `devWarn`; the
  headless file's "builds and rewires both ways" still passes. The mutation gate kills a ceiling placed before the
  Limiter and a ceiling left out of the disconnect list. — also a second build that finds the constructor absent or
  throwing drops the first ceiling. 8 of 8 mutants killed (before the Limiter, out of the disconnect list, after the
  master in it, no `_ceiling = null` reset, `'2x'`, a 9-entry curve, no warning, never built). `AudioEngine.test.ts`'s
  Tone mock gains a `WaveShaper` spy (vitest throws on an export the factory does not list). The `npm run dev` look is
  folded into Checkpoint A1.

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/audioEngine/globalFx.headless.test.ts`;
`npm run build:types`; `npm run dev` powers on with no console warning from the chain. **Dependencies:** T4.
**Files:** `globalFx.ts`, `globalFx.test.ts`, `globalFx.headless.test.ts`. **Scope:** M.

---

### Task 6: The trim at the three bus-gain write sites

**Description:** `AudioEngine.ts` imports `robotBusGain` from `./audioEngine/headroom` and calls it where
`volumePositionToGain(masterVolume ?? 1)` is called today: the real bus at `:822`, the stub-bus fallback at `:893`,
and `updateRobotMasterVolume`'s ramp target at `:1126`. The `volumePositionToGain` import leaves the file. The
docblocks at `:787` and `:1108` say "through `robotBusGain` (the shared taper, then the headroom trim,
docs/specs/OUTPUT_HEADROOM.md)".

**Proof:** RED test — `src/engine/AudioEngine.test.ts`: `reserveVoice` at Volume 0.8 constructs the bus gain at
`robotBusGain(0.8)` and `updateRobotMasterVolume(id, 1)` ramps to `HEADROOM_TRIM_GAIN`; both fail on the bare taper.

**Acceptance criteria:**
- [x] `reserveVoice` with `masterVolume: 0.8` (a non-default value, per the parity-fixture rule) constructs the bus
  `Gain` at `robotBusGain(0.8)`, not `volumePositionToGain(0.8)`; the stub path (no `Gain` constructor) the same. —
  both stub paths: no `Gain` constructor (`getToneCtor` spied) and the composite-failure fallback at `:894`; an
  omitted Volume now starts the bus at `HEADROOM_TRIM_GAIN`, not 1 (the existing default case re-pinned).
- [x] `updateRobotMasterVolume(id, 1)` ramps to `HEADROOM_TRIM_GAIN`; `(id, 0)` to 0; the ramp duration is
  `VOLUME_RAMP_SECONDS` as before. — the existing 0.2 case re-pinned to `robotBusGain(0.2)`.
- [x] `setMasterVolume(1)` still writes `1` to the master gain (the master slider keeps unity); the mutation gate
  kills a trim applied to the master gain and a site left on the bare taper. — 5 of 5 killed (each of the three sites
  on the bare taper, the ramp duration moved, a trim on the master gain). 6 RED first.

**Verification:** `npx vitest run src/engine/AudioEngine.test.ts`; `npm run build:types`; `npm run lint`.
**Dependencies:** T4. **Files:** `AudioEngine.ts`, `AudioEngine.test.ts`. **Scope:** S.

---

### Checkpoint A1: All automated

- [x] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` all green on the branch. — 2026-10-23 at
  `12776551`: 326 files / 11 977 tests; lint 0 errors (4 warnings, all in scenery components this branch does not
  touch); the build passes.
- [x] `npm run dev`: power on, a fresh world plays, no engine `devWarn` in the console; the drawer's Output tab is
  unchanged (three sub-tabs, same rows). — a dev server of the branch, fresh headless Chrome over CDP, `?debug`, 25 s
  after power-on: no `[AudioEngine]` warning, no page exception, HUD `out` −12.2 to −19.3 dB, `fin ok` throughout. Two
  other console warnings, not the chain's: `[sessionShareUtils] malformed ?session= param` before power-on, and Tone's
  "Events scheduled inside of scheduled callbacks" notice; not checked against `main`. The Output tab is a Read, not a
  look: `git diff main --stat -- src/components src/content src/stores` is empty.
- [x] One commit per task so far (T1, T2, T3 docs, T4, T5, T6), the intent, spec and this plan committed first. —
  plus `3315abb2` (`--robot-volume-full`, the T3 decision).

---

## Phase 3: The gate

### Task 5.1: The ceiling gets its curve (added at T7's stop)

**Description:** T7's first complete run read H1's `out` at +2.7 dB, 40 of 239 readings at or over 0 dBFS, the same
as the trim-alone build. Tone 15.1.22's `WaveShaper` constructor reads its curve from `mapping` (positional or option)
and ignores a `curve` option, so `new WaveShaperCtor({ curve: softCeilingCurve(), oversample: 'none' })` built a native
`WaveShaperNode` with no curve, which passes its input unchanged; headless Chrome confirmed it (as built `.curve` is
`null` and a constant 2.0 leaves as 2.0; with `{ mapping }` the 4097-entry curve, and 2.0 leaves as 0.928). The T5
mock recorded `curve` and accepted it. Fix: `new WaveShaperCtor({ mapping: softCeilingCurve() })`; `oversample` is
not a Tone constructor option either, and the node's default is the spec's `'none'`, so it is left at the default (T9
sets the property if Checkpoint A asks for `'2x'`). The spec's §1.3, §4 and §5.1 passages name `mapping`.

**Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts`: the `WaveShaper` mock models Tone's constructor (the
curve from `mapping`, nothing from `curve`) and the case asserts the built node's `curve`; and the arguments the build
passed are replayed into Tone's own `WaveShaper` (`vi.importActual('tone')`, whose dummy context stands in for an
`AudioContext` under jsdom), which must hold the ceiling curve. Both fail on `{ curve }`.

**Acceptance criteria:**
- [x] The built ceiling's `curve` equals `softCeilingCurve()` and its `oversample` reads `'none'`, in the mock that
  follows Tone. — `993217fc`; both cases RED first (the mock's node had no curve; Tone's own read `undefined`).
- [x] Tone's real `WaveShaper`, given the recorded constructor arguments, holds the same curve: the guard against the
  mock drifting from Tone again. — `vi.importActual('tone')` constructs under jsdom; its `dispose()` cannot run on the
  dummy context's plain-object shaper, so the case does not call it.
- [x] The mutation gate kills `curve` for `mapping` and a 9-entry curve. — 3 of 3 killed, plus an `oversample` of
  `'2x'` set on the node. Suite 326 files / 11 978 tests green.

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/audioEngine/globalFx.headless.test.ts`;
`npm run build:types`; `npm run lint`. **Dependencies:** T5. **Files:** `globalFx.ts`, `globalFx.test.ts`,
`docs/specs/OUTPUT_HEADROOM.md`. **Scope:** XS.

---

### Task 7: The level gate — trim-alone, complete, tune the trim — **STOP on an `out` miss**

**Description:** On the served production build of the branch, foreground, one run at a time, with T3's links:
(1) **trim alone** — a one-line local edit that makes `getToneCtor('WaveShaper')` return `undefined` (not committed,
reverted after): D1 once; `pre` should have dropped by about the trim and `out` should still touch or pass 0 dBFS on
D1, which is the evidence the ceiling is needed. (2) **complete** — D1 three times, D2–D5, H1, H2 once each, 120 s (H1 and H2 in their
own call, with `--robot-volume-full`).
(3) ~~If `pre` peak max on any of D1–D5 is above −6 dBFS, step `HEADROOM_TRIM_DB` down by 2, commit the constant, and
re-run (2) in full~~ (dropped 2026-10-23, spec assumption 3: −12 dB held, `pre` recorded); if `out` peak max is above
−0.5 dBFS or any reading is ≥ 0 dBFS on any variant, **stop**: the
ceiling is not last in the graph, or the taps are not where the survey says; report with the numbers and the chain
dump. (4) Add the branch table to T3's PERFORMANCE.md section, with the final `HEADROOM_TRIM_DB`, the commit hash
and the trim-alone row, and the spec's §5.2 gate thresholds beside each number.

**Proof:** Read — the branch table in PERFORMANCE.md against spec §5.2's thresholds. A constant may move; its T4
test follows the constant, so no new test file.

**Acceptance criteria:**
- [x] Every spec §5.2 threshold is met in the final table: `out` peak max ≤ −0.5 dBFS and zero readings ≥ 0 dBFS on
  all seven variants; `pre` peak max recorded on every variant (no longer gated, spec assumption 3); `fin ok`
  throughout. — at `993217fc`: `out` peak max −0.6 (H1, the ceiling's top) to −12.9 dB (D2), none at 0 dBFS, `fin ok`
  239 of 239 everywhere. The first complete run (`ab3d0616`) stopped on H1 (+2.7 dB): the empty ceiling, T5.1.
- [x] The trim-alone row exists and says what it showed. — D1 alone does not reach 0 dBFS (−2.2 dB; the plan expected
  it would); an extra H1 trim-alone run (+2.3 dB, 38 of 239 at or over 0) shows the ceiling is what holds a hand push.
- [x] The final `HEADROOM_TRIM_DB` in `headroom.ts` is the one in the table. — −12, unchanged.

**Verification:** the table; the hygiene stated. **Dependencies:** T3, T5, T6. **Files:** `docs/PERFORMANCE.md`,
`headroom.ts` (the constant only). **Scope:** S (measurement, at most one constant).

---

### Task 8: Audio-thread cost on the desktop

**Description:** `npm run perf:audio` on D5's link, 240 s, `main` and the branch served side by side (the `@page`
form, as the Dark-Effect Bypass baselines did), interleaved, one foreground run each, orphan check before and after.
Recorded in T3's PERFORMANCE.md section: overall mean capacity and the peak window per build.

**Proof:** Read — the two builds' numbers in the section. No test file.

**Acceptance criteria:**
- [x] The branch's overall mean is within +0.02 of `main`'s, or the excess is written down with the oversample value
  confirmed `'none'` and the next suspect named. — `main` 0.558, branch 0.545 (peak windows 0.687 / 0.650): the branch
  read 0.013 lower, the run-to-run spread; one run each, as planned.

**Verification:** the numbers in the section. **Dependencies:** T7. **Files:** `docs/PERFORMANCE.md`. **Scope:** XS.

---

### Checkpoint A: Crawford's desktop listen — **STOP**

- [x] D1 and H1 on the branch, then D1 on `main` for the before: is the crunch gone, and does the quieter level read
  as a clean world rather than a dull one? — Crawford, 2026-10-23: "most worked fine".
- [x] The loudest moments of H1: any colour from the ceiling? If so, a local edit to `CEILING_KNEE` 0.6 and 0.8, and
  `oversample: '2x'`, each listened to once; the choice recorded. — no change asked; knee 0.7 and `'none'` stay.
- [x] A deep-seeded world (find one whose Output tab shows a Compressor threshold near −36 dB and a ratio near 6):
  does it pump against the ceiling? If so, spec assumption 5's remedy is invoked in T9. — the world that crunched,
  `6j0mgo5z` (−33 dB, 3:1) with every robot at 100 %, was the Compressor's 70 ms release, not the ceiling (measured:
  13.6–16.5 dB mean gain reduction, master never at the ceiling's top); a 0.25 s release fixed it by ear. Assumption 5's
  threshold/ratio narrowing is not invoked; the seeded release floor rises instead (T9).
- [x] Decisions written into spec §7 as dated answers; "no change" is an answer.

---

### Task 9 (conditional): Apply Checkpoint A's decisions

**Description:** Only what Checkpoint A asked for: a new `CEILING_KNEE` or `oversample` value in `headroom.ts` /
`globalFx.ts` (the T4 and T5 tests follow the constants, so only `'2x'` needs a test change: the built ceiling's
`oversample` property, which Tone does not take as a constructor option, T5.1); or the Compressor's two rows in `GLOBAL_AUDIO_LOADING_RANGES` narrowed (e.g. threshold −30 to −18, ratio 2 to
4) with `globalAudioSeed`'s oracle cases re-pinned to the new band and `GLOBAL_CHAIN_GRID.md`'s two Loading Range
cells updated. Then T7's complete run (2) is repeated and the table replaced. **As decided at Checkpoint A (spec §7):**
the one change is the Compressor's *release* row, 0.05–0.3 s → 0.25–0.3 s, with the loading-range test, the two seed
oracles' release values (re-derived by hand from the same draw) and the grid's Release cell. The seven T3 links carry
the whole `globalAudio`, release included, so they pin the old seeded release; the re-run uses links rebuilt by T3's
recipe on this branch, and the T3 links stay as `main`'s.

**Proof:** RED test for a behaviour change — the built ceiling's `oversample` case in `globalFx.test.ts` for `'2x'`, or the
oracle cases in `src/utils/globalAudioSeed.test.ts` for a narrowed band, re-pinned by value and failing first. A
knee-only change moves a constant its T4 test already follows and needs no new test.

**Acceptance criteria:**
- [x] Exactly the decided change, nothing else; the affected tests re-pinned by value, not loosened. — `1c13470d`: the
  release row 0.05–0.3 → 0.25–0.3 s; its pin, the two oracles (re-derived by hand from the same log draw, within 1e-16
  of the seeder) and a new behaviour case (no seeded release below 0.25 s on `6j0mgo5z`, which seeded 0.0695 s, or 300
  other worlds), all RED first; mutants floor 0.24 and ceiling 0.5 killed; the grid's cell and Compressor note.
- [x] T7's table re-run and still meeting every threshold. — on links rebuilt with only the release changed, plus X1
  (`6j0mgo5z`, every robot 100 %): `out` peak max −0.6 to −12.9 dB, none at 0 dBFS, `fin ok` throughout. The first
  table is kept above it, not replaced, so the before stays visible (the file's own rule).

**Verification:** the focused test files; `npm test`; the table. **Dependencies:** Checkpoint A.
**Files:** at most `headroom.ts`, `globalFx.ts`, `globalFx.test.ts`, `globalAudioLoadingRanges.ts`,
`globalAudioSeed.test.ts`, `GLOBAL_CHAIN_GRID.md`, `PERFORMANCE.md`. **Scope:** S (or skipped).

---

## Phase 4: The phone

### Task 10: Phone gate — Checkpoint B — **STOP for Crawford**

**Description:** Pixel 8, Full, 3:00 hands off, the `?debug` HUD, D5's link (the heavy world): `main` first, then
the branch, both served on the LAN in the same sitting, HUD `underruns` at 3:00 written down for each, and Crawford's
word on the loudest moments. A miss on underruns is bisected by the one node this phase adds: the ceiling absent
(T7's local edit) on the phone. A new section in `docs/todo/scratchy-audio-phones.md`, "Output Headroom (roadmap 54)
on the Pixel — Checkpoint B, Crawford's runs", in the shape of the Robot Effect Sends T21 section.

**Proof:** Read — the phone section with both counts and Crawford's word. No test file.

**Acceptance criteria:**
- [ ] Both counts and both hashes in the section; the branch's count within the baseline's band; the crunch gone.
- [ ] A miss has its bisection row and stops the phase.

**Verification:** the section. **Dependencies:** T8 (and T9 if it ran). **Files:** `docs/todo/scratchy-audio-phones.md`.
**Scope:** XS (Crawford's device).

---

## Phase 5: Docs

### Task 11: The docs

**Description:** `docs/AUDIO_SYSTEM.md`: the Signal Graph diagram gains `→ ceiling (WaveShaper)` before `masterGain`
and `busGain (= taper × trim)` on the per-robot line, and a short "**Headroom (roadmap 54;
[OUTPUT_HEADROOM.md](specs/OUTPUT_HEADROOM.md))**" paragraph in the chain's family style (the trim, the ceiling, why
on the bus, the makeup-gain fact, not a setting, not seeded, not saved); the "Global volume vs. robot volume" note
says the robot side now goes through `robotBusGain`. `docs/reference/GLOBAL_CHAIN_GRID.md`: the chain-order line
gains `→ ceiling` and a footnote ⁶ for the trim and the ceiling as non-rows. `docs/todo/roadmap.md` 54: an as-built
paragraph (the design, the final trim, the gate numbers by link to PERFORMANCE.md, Checkpoint A's and B's dates) and
the four Open items closed as spec §6 says. `docs/todo/backlog.md` 23: assumption 9's one line. `docs/todo/plan.md`:
54's line reads built-awaiting-PR (deleted when it merges, per the file's own rule) and 23's says interviewed and
deferred. The memory file for 54 updated. Spec §7's answers are already in from T0 and Checkpoint A.

**Proof:** Read — human review of each file against the shipped code. No test file.

**Acceptance criteria:**
- [ ] Every file above reads true against the code on the branch (a human read; no docs guards).
- [ ] No display string, no `src/content/` change, no test asserting on doc text.

**Verification:** `npm test`, `npm run lint`, a read. **Dependencies:** T10. **Files:** the six docs and the memory.
**Scope:** M (docs only).

---

### Checkpoint: Complete

- [ ] T0–T11 committed on `feature/output-headroom`, one commit per task; the suite, types, lint and build green.
- [ ] The PERFORMANCE.md table meets every spec §5.2 threshold at the committed `HEADROOM_TRIM_DB`.
- [ ] Checkpoints A and B signed off by Crawford, in writing, in the spec and the phone section.
- [ ] Crawford opens the PR; the description links the table and the phone section.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The trim drops `pre` but `out` still clips (the Compressor's makeup lifts transients past the ceiling's input range) | Medium | The ceiling clamps any input to its curve's ends, so `out` cannot exceed −0.65 dBFS whatever enters; T7's trim-alone run shows how much the ceiling is working, and Checkpoint A's deep-world listen decides assumption 5's remedy |
| The ceiling colours the loudest peaks audibly | Medium | Identity below 0.7 so normal signal is bit-exact; Checkpoint A listens to the knee at 0.6 / 0.8 and `'2x'`; T9 applies one change |
| The session links do not pin what T3 thinks (an override dropped by `sessionDiff`'s quantiser) | Medium | T3's acceptance opens each link and checks the drawer; the Limiter at 0 and EQ at +12 are on the grid's step, so they survive the quantiser |
| `perf:level` readings are 500 ms windows of 0.68 s: a peak between windows is missed | Low | Window ≥ sampler interval by design (`OUTPUT_TAP_SIZE`), so no gap; 240 readings a run, three runs on D1 |
| A rounding path: the `WaveShaper` mock in `globalFx.test.ts` masks a wrong option name (`curve` vs `mapping`) | Low | T5 asserts the recorded options by key; T7's real-browser run would show an unshaped output as an `out` over −0.5 dBFS and stop |
| The phone pays for the shaper | Low | One table lookup per sample at `'none'`; T8 prices it on the desktop first; T10 bisects with the ceiling absent |
| The trim makes the whole app feel quiet on a laptop at full device volume | Medium (taste) | Spec assumption 6 is a T0 veto; Checkpoint A asks the question in words ("clean, or dull?"); the trim is one constant to move |

## Open Questions

- Spec §7's five, answered at T0 and Checkpoint A; none are the plan's own.
- T3's link-building recipe assumes the dev server's module graph is reachable from `Runtime.evaluate` dynamic
  imports (Vite serves `/src/...` as ES modules). If it is not, the links are made by hand in the app's Share UI, one
  per variant, and the recipe line in PERFORMANCE.md says so.
