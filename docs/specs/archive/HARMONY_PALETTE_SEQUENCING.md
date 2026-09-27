# Phase Spec: Harmony Palette Sequencing

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/harmony-palette-sequencing.md](../intent/harmony-palette-sequencing.md)
(confirmed via `/interview-me`, 2026-09-02). Prior art reused directly rather than re-derived:
`beatClock.ts`'s own `scheduleRepeat`/`cancelSchedule` exports (the pattern every other app-facing
recurring schedule already follows — `robotSystems.ts`, `powerController.ts` — that `harmonySystem.ts`
alone bypassed via a locally-duplicated `TransportLike` interface), and item 3/5's "import the constant,
don't restate the literal" precedent from `docs/DUPLICATE_VALUE_AUDIT.md`.

---

## 1. Overview & Claude Explanation

`harmonySystem.ts`'s palette switching currently derives from `getCurrentHour()` — a 96-measure,
24-"hour" day cycle borrowed from `beatClock.ts` — looking up `TIME_PITCHES[hour]`, a
`Record<number, EighthNotes>` keyed 0-23 in which hours 12-23 are byte-for-byte duplicates of hours
0-11 (the map only ever holds 12 structurally-unique palettes, doubled to fake a "repeats twice a day"
shape). This spec replaces that entirely: `TIME_PITCHES` becomes `HARMONY_PALETTES`, a plain
`EighthNotes[]` holding just the 12 unique entries, and the module free-runs through it sequentially —
`MEASURES_PER_PALETTE_ENTRY` (2) transport measures per entry, then advance to the next index, wrapping
via `% HARMONY_PALETTES.length` — with no reference to hour-of-day, `getCurrentHour()`, or the
96-measure day cycle anywhere in the module. The index is derived fresh every tick from
`getCurrentMeasure()` (self-correcting, not an accumulating counter), and the module's own scheduling
plumbing switches from a locally-owned `TransportLike`/`transport.scheduleRepeat` shape to `beatClock.ts`'s
own `scheduleRepeat`/`cancelSchedule` exports, dropping `scheduleHarmonyCycle`'s `transport` parameter
entirely.

This is a **pure behavior change to how the palette index is chosen and scheduled** — the 12 palettes'
actual note content, `EighthNotes`'s 8-note-tuple shape, `getAvailableNotes()`/`resetHarmony()`/
`setAvailableNotes()`'s public signatures, and every downstream melody-playback consumer are unchanged.

### 1.1 What's reused vs. what's new

Reused, unchanged: the 12 unique note-content tuples themselves (copied verbatim from
`TIME_PITCHES[0..11]`, just re-homed into an array — no note re-composition), the `EighthNotes` type,
`getAvailableNotes()`/`resetHarmony()`/`setAvailableNotes()`'s existing bodies and signatures, the
"only reassign `availableNotes` when the computed index actually changed" guard (`lastPaletteIndex`),
the `try/catch`-wrapped callback shape, and every melody-playback call site (`AudioEngine.ts`'s
`processMelodyStep`/`playRegisteredEvents` — neither reads `TIME_PITCHES`/`HARMONY_PALETTES` directly,
only `getAvailableNotes()`).

New: `HARMONY_PALETTES: EighthNotes[]` (replacing `TIME_PITCHES`), `MEASURES_PER_PALETTE_ENTRY = 2`
(local `const`, not centralized — §1.4), the stateless `Math.floor(getCurrentMeasure() /
MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length` index derivation (replacing
`Math.floor(getCurrentHour()) % Object.keys(TIME_PITCHES).length`), and `scheduleHarmonyCycle()`/
`stopHarmonyCycle()`'s new beatClock-backed scheduling (replacing the local `TransportLike` interface
and `transportInstance` module state).

### 1.2 Why array, not `Record`; why 12 entries, not 24

Confirmed in the intake interview: the `Record<number, EighthNotes>` shape existed only to support
hour-keyed lookup. Once selection is purely sequential, an array is the natural fit, and it removes the
literal duplication at indices 12-23 outright (a natural side effect of the new model, not a separate
dedup pass) — `HARMONY_PALETTES.length` (12 today) drives the wrap, with no hardcoded assumption about
that count anywhere in `scheduleHarmonyCycle`'s callback, so a future palette array of any length works
unchanged.

### 1.3 Index derivation: stateless, not an accumulating counter

```typescript
const paletteIndex = Math.floor(getCurrentMeasure() / MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length;
```

Recomputed fresh on every `2m` tick from `beatClock.ts`'s own `getCurrentMeasure()` — never an
incrementing module-level counter. This mirrors the self-correcting property the current
`getCurrentHour()`-based lookup already has: a missed tick, or an error inside the `try/catch`, can
never leave the palette permanently offset from where the transport actually is, because the very next
tick recomputes from the transport's real position rather than continuing from wherever the counter
last landed.

### 1.4 `MEASURES_PER_PALETTE_ENTRY` — one constant, two readers, not exposed yet

```typescript
const MEASURES_PER_PALETTE_ENTRY = 2;
```

Declared **local to `harmonySystem.ts`**, not `constants/index.ts` — nothing outside this module reads
it. Both the index-derivation math (§1.3) and the schedule interval read from this single value (the
interval is built as `` `${MEASURES_PER_PALETTE_ENTRY}m` ``, not a separately-written `'2m'` string) —
introducing a second independently-written `2` here would be a fresh instance of the exact
duplicate-value failure mode `docs/DUPLICATE_VALUE_AUDIT.md` tracks. Per the confirmed intent, this
value is **not** wired into any store or UI control in this spec — the user plans to make it
user-editable once more palettes exist; today it stays a plain, easy-to-hand-edit constant.

### 1.5 Scheduling: `beatClock.ts`'s own exports, not a local transport interface

`harmonySystem.ts` currently declares its own `TransportLike` interface, holds a module-level
`transportInstance`, and calls `transport.scheduleRepeat`/`.clear` directly —
`scheduleHarmonyCycle(transport: TransportLike)` takes the transport as a parameter, and
`AudioEngine.ts` passes its own transport instance in at the one call site
([`AudioEngine.ts:611`](../../src/engine/AudioEngine.ts#L611)). This bypasses `beatClock.ts`'s own
`scheduleRepeat`/`cancelSchedule` exports, which every other app-facing recurring schedule in the
codebase already goes through (per CLAUDE.md: "Prefer `Transport.scheduleRepeat` / `scheduleOnce`" via
`BeatClock`).

This spec fixes that as part of the same rewrite (the callback body is being replaced anyway — §1.3 —
so there's no added cost to also fixing the call site, confirmed in the intake interview):

```typescript
// Before
export function scheduleHarmonyCycle(transport: TransportLike): void { /* transport.scheduleRepeat(...) */ }

// After
export function scheduleHarmonyCycle(): void { /* scheduleRepeat(`${MEASURES_PER_PALETTE_ENTRY}m`, callback) */ }
```

`scheduleHarmonyCycle()` takes **no arguments**. `AudioEngine.ts`'s one call site
([`AudioEngine.ts:611`](../../src/engine/AudioEngine.ts#L611)) drops its `transport` argument
accordingly. `stopHarmonyCycle()`'s own signature is already zero-argument today and stays that way —
only its body changes, from `transportInstance?.clear(scheduledEventId)` to
`cancelSchedule(scheduleId)`.

### 1.6 Pre-existing doc inaccuracy, corrected as part of this rewrite (not a new bug)

`docs/HARMONY_SYSTEM.md`'s current "Implementation" section claims the hour-based lookup "falls back
to a measure-driven step derived from the locale store" if `getCurrentHour()` is unavailable. No such
fallback exists anywhere in `harmonySystem.ts`'s actual source — this was already stale before this
spec. Since the whole section is being rewritten regardless, this spec's doc update simply drops the
inaccurate claim rather than preserving or extending it; flagged here so the doc diff isn't mistaken for
a behavior removal.

---

## 2. Target File Structure

```text
src/
└── engine/
    ├── harmonySystem.ts        # MODIFIED — TIME_PITCHES (Record<number, EighthNotes>, 24 keys)
    │                             #   → HARMONY_PALETTES (EighthNotes[], 12 entries); new
    │                             #   MEASURES_PER_PALETTE_ENTRY local const; index derivation
    │                             #   switches from getCurrentHour() to getCurrentMeasure()-based
    │                             #   math (§1.3); scheduleHarmonyCycle()/stopHarmonyCycle() drop
    │                             #   the local TransportLike interface + transportInstance state,
    │                             #   switch to beatClock.ts's scheduleRepeat/cancelSchedule (§1.5);
    │                             #   scheduleHarmonyCycle() loses its `transport` parameter
    ├── harmonySystem.test.ts   # MODIFIED — mock beatClock's getCurrentMeasure/scheduleRepeat/
    │                             #   cancelSchedule instead of getCurrentHour; drop the local
    │                             #   mockTransport/vi.mock('tone', ...); update assertions to
    │                             #   HARMONY_PALETTES indices instead of hour values; new
    │                             #   length-independence (wraparound) test — see §5
    └── AudioEngine.ts          # MODIFIED — single-line call site change at line 611:
                                  #   scheduleHarmonyCycle(transport) → scheduleHarmonyCycle()

docs/
├── HARMONY_SYSTEM.md           # MODIFIED — substantial rewrite: "Data Structure" section
│                                 #   (TIME_PITCHES → HARMONY_PALETTES, Record → array), "API"
│                                 #   section (scheduleHarmonyCycle() signature), "Implementation"
│                                 #   section (new scheduling shape, drops the stale locale-store
│                                 #   fallback claim — §1.6), "Hour Derivation" section (renamed/
│                                 #   rewritten — no more hour derivation at all), "Palette Design
│                                 #   Guidelines" (hour-mood-mapping guidance no longer applies),
│                                 #   "Performance" section (schedule cadence description), and the
│                                 #   file's opening paragraph (no longer "measure-based day/night
│                                 #   cycle, 96 measures = 1 cycle" — that framing was specific to
│                                 #   the removed getCurrentHour() dependency)
├── AUDIO_SYSTEM.md             # MODIFIED — "Harmony System" subsection (~lines 131-141): drops
│                                 #   "derives the current hour from measure position" framing,
│                                 #   replaced with the sequential-cycling description
└── DUPLICATE_VALUE_AUDIT.md    # MODIFIED — item 2 (MEASURES_PER_CYCLE / DAY_CYCLE_MEASURES):
                                  #   harmony's indirect coupling to beatClock's 96-measure day
                                  #   concept is gone once this ships (its only production
                                  #   consumer of getCurrentHour() no longer calls it) — rewrite
                                  #   the item to reflect that lightingUtils.ts's
                                  #   DAY_CYCLE_MEASURES is now the only real "day cycle" consumer
                                  #   outside beatClock.ts itself, and mark status accordingly
                                  #   (open/changed/closed — Plan/Implement to confirm which)
```

**Explicitly not touched, and why:** `src/engine/beatClock.ts` (unchanged — `getCurrentHour()` stays
exported, per the confirmed intent's explicit "left as-is" call-out in §1.6 of the intent doc; only its
one production caller goes away). `src/engine/AudioEngine.test.ts` (its existing `vi.mock('./harmonySystem', ...)`
already types `scheduleHarmonyCycle` as `(_transport?: unknown) => undefined` — an optional param — and
no test asserts call arguments, so a zero-arg call site continues to satisfy the mock with no change
needed). `docs/BEAT_CLOCK.md` (documents `beatClock.ts`'s own API surface, which is unchanged — it
already correctly describes `getCurrentHour()`/`getCurrentMeasure()` as general-purpose exports, not as
harmony-specific). `docs/MELODY_SYSTEM.md` (melody events/step registry are untouched — this spec only
changes which note names `getAvailableNotes()` returns and when). Every melody-playback call site in
`AudioEngine.ts` other than the one `scheduleHarmonyCycle` call (`processMelodyStep`,
`playRegisteredEvents`, etc.) — none read `TIME_PITCHES`/`HARMONY_PALETTES` directly, only
`getAvailableNotes()`, whose return shape (`string[]`, 8 entries) is unchanged.

No new dependency. No file is renamed. No file is newly created.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Note content is copied verbatim, not re-composed.** `HARMONY_PALETTES[0..11]` must be a byte-for-byte
  copy of `TIME_PITCHES[0..11]`'s existing tuples — this spec is a selection/scheduling mechanism
  change, not a musical re-tuning.
* **No hardcoded palette-count assumption anywhere in the new code.** The wraparound must read
  `HARMONY_PALETTES.length` at call time, not a literal `12` (or `24`) — this is the entire point of
  the change per the confirmed intent ("can't assume the length of TIME_PITCHES going forward").
* **`MEASURES_PER_PALETTE_ENTRY` stays a local, unexported `const` in `harmonySystem.ts`.** Do not
  centralize it into `constants/index.ts`, and do not wire it into any Zustand store or UI control —
  explicitly out of scope per the confirmed intent (§1.4).
* **Index derivation must be stateless (recomputed from `getCurrentMeasure()` every tick), not an
  accumulating counter.** Do not reintroduce a `paletteIndex += 1` shape — see §1.3 for why.
* **`getCurrentHour()` is not removed, deprecated, or modified in `beatClock.ts`.** Out of scope per the
  confirmed intent, even though this change leaves it with no remaining production caller.
* **Scheduling stays on the `AudioEngine`/`Transport`/`BeatClock` path — no `setTimeout`/`setInterval`/
  `requestAnimationFrame`/`queueMicrotask` anywhere touched by this spec**, per CLAUDE.md's
  non-negotiable rule. `scheduleRepeat`/`cancelSchedule` (from `beatClock.ts`) are the only scheduling
  primitives this change introduces.
* **`scheduleHarmonyCycle()`'s "already scheduled" guard behavior is preserved.** Calling it twice
  without an intervening `stopHarmonyCycle()` must still warn and no-op on the second call, matching
  current behavior (the guard variable changes from `scheduledEventId`/`transportInstance` to a single
  local `scheduleId`, but the observable behavior is unchanged).
* **Melody events, `EighthNotes`, and every public function signature other than
  `scheduleHarmonyCycle()` are unchanged.** `getAvailableNotes()`, `resetHarmony()`,
  `setAvailableNotes()` keep their exact current signatures and behavior.

---

## 4. Code Style & Architecture Conventions

**`src/engine/harmonySystem.ts`** (full replacement shape):

```typescript
// ========================================
// IMPORTS
// ========================================
import { getCurrentMeasure, scheduleRepeat, cancelSchedule } from './beatClock';
import { devLog, devWarn } from '../utils/helpers';

// ========================================
// TYPES
// ========================================
// Exactly 8 note-name strings (no octave digit) per palette entry.
// Octave is determined per-robot at spawn time; melody events store note index + octave separately.
export type EighthNotes = [string, string, string, string, string, string, string, string];

// ========================================
// CONSTANTS
// ========================================
// 12 structurally-unique palettes, cycled sequentially — no hour-of-day meaning. Copied verbatim
// from the old TIME_PITCHES[0..11] (hours 12-23 were byte-for-byte duplicates of 0-11 and are
// dropped, not re-derived, by this restructuring). See docs/specs/HARMONY_PALETTE_SEQUENCING.md.
const HARMONY_PALETTES: EighthNotes[] = [
  ['C', 'G', 'E', 'D', 'B', 'C', 'E', 'G'],
  ['C', 'G', 'F', 'D', 'A', 'C', 'F', 'F'],
  ['D', 'A', 'F', 'D', 'A', 'C', 'F', 'D'],
  ['F', 'G', 'B', 'D', 'G', 'D', 'G', 'G'],
  ['G', 'D', 'B', 'A', 'B', 'D', 'A', 'G'],
  ['A', 'D', 'C', 'G', 'E', 'C', 'A', 'E'],
  ['Bb', 'D', 'C', 'G', 'F', 'C', 'Bb', 'F'],
  ['Bb', 'Eb', 'C', 'G', 'F', 'D', 'Bb', 'Eb'],
  ['Ab', 'Eb', 'C', 'G', 'Ab', 'D', 'Ab', 'Eb'],
  ['Db', 'F', 'C', 'Ab', 'Bb', 'Db', 'Ab', 'F'],
  ['B', 'F#', 'D#', 'C#', 'A', 'B', 'D#', 'F#'],
  ['E', 'C', 'G#', 'D', 'Bb', 'E', 'G#', 'B'],
];

// Measures each palette entry holds before advancing to the next. One value read by both the
// index derivation and the schedule interval below — not independently restated as two literal
// `2`s. Not yet user-configurable (docs/intent/harmony-palette-sequencing.md's "Out of scope").
const MEASURES_PER_PALETTE_ENTRY = 2;

// ========================================
// MODULE STATE
// ========================================
let availableNotes: EighthNotes = HARMONY_PALETTES[0];
let lastPaletteIndex = 0;
let scheduleId: string | null = null;

// ========================================
// EXPORTS
// ========================================

/** Returns a copy of the current 8-note palette. Safe for iteration without mutation risk. */
export function getAvailableNotes(): string[] {
  return [...availableNotes];
}

/** Reset the harmony palette to the first entry. Call on power-on so music resumes from the start
 *  of the progression. */
export function resetHarmony(): void {
  availableNotes = HARMONY_PALETTES[0];
  lastPaletteIndex = 0;
}

/** Manually set the harmony palette (for testing or custom harmonies). */
export function setAvailableNotes(notes: EighthNotes): void {
  availableNotes = notes;
  devLog('[HarmonySystem] Palette manually set:', notes);
}

/**
 * Initialize automatic palette cycling. Every MEASURES_PER_PALETTE_ENTRY measures, advances to
 * the next HARMONY_PALETTES entry (wrapping via % HARMONY_PALETTES.length — no assumption about
 * the array's length). The index is derived fresh from getCurrentMeasure() on every tick, not
 * accumulated, so a missed/errored tick can never leave the palette permanently out of sync with
 * the transport. Call once after Transport starts.
 */
export function scheduleHarmonyCycle(): void {
  if (scheduleId !== null) {
    devWarn('[HarmonySystem] Harmony cycle already scheduled');
    return;
  }

  scheduleId = scheduleRepeat(`${MEASURES_PER_PALETTE_ENTRY}m`, () => {
    try {
      const paletteIndex = Math.floor(getCurrentMeasure() / MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length;

      if (paletteIndex !== lastPaletteIndex) {
        lastPaletteIndex = paletteIndex;
        availableNotes = HARMONY_PALETTES[paletteIndex] ?? HARMONY_PALETTES[0];
        devLog(`[HarmonySystem] Palette changed to index ${paletteIndex}:`, availableNotes);
      }
    } catch (err) {
      devWarn('[HarmonySystem] palette cycle callback threw', err);
    }
  });

  devLog(`[HarmonySystem] Harmony cycle scheduled (updates every ${MEASURES_PER_PALETTE_ENTRY} measures)`);
}

/** Stop the harmony cycle (for cleanup/testing). */
export function stopHarmonyCycle(): void {
  if (scheduleId !== null) {
    cancelSchedule(scheduleId);
    scheduleId = null;
    devLog('[HarmonySystem] Harmony cycle stopped');
  }
}
```

**`src/engine/AudioEngine.ts`** (diff — one line, [line 611](../../src/engine/AudioEngine.ts#L611)):

```typescript
// Before
scheduleHarmonyCycle(transport);

// After
scheduleHarmonyCycle();
```

No import changes needed in `AudioEngine.ts` — it already imports `scheduleHarmonyCycle` by name.

* **Naming Conventions:** `HARMONY_PALETTES`, `MEASURES_PER_PALETTE_ENTRY`, `scheduleId` — same
  `SCREAMING_SNAKE_CASE`/`camelCase` conventions the surrounding file already uses. `HARMONY_PALETTES`
  deliberately does not carry a `TIME_` prefix (§1.2 — no time-of-day meaning left).
* **Formatting:** Matches `harmonySystem.ts`'s existing section-comment banner style
  (`// ====...====`) exactly — no reformatting beyond the sections actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library (not applicable here — pure module, no components).
* **Test File Location:** Colocate — `src/engine/harmonySystem.test.ts` (existing file, modified).
* **`harmonySystem.test.ts` (modified):**
  1. **Mock shape changes:** replace `vi.mock('./beatClock', () => ({ getCurrentHour: () => currentHour }))`
     with a mock exposing a mutable `currentMeasure`, plus `scheduleRepeat`/`cancelSchedule` spies
     (`scheduleRepeat` captures its callback and returns a fake id string, mirroring the existing
     `mockTransport.scheduleRepeat` shape it replaces). Drop the `vi.mock('tone', ...)` and
     `mockTransport` entirely — `harmonySystem.ts` no longer touches Tone or a raw transport at all.
  2. `getAvailableNotes`/`setAvailableNotes` round-trip test — unchanged, still asserts an 8-length
     array and copy-safety.
  3. `resetHarmony` test — update the assertion's framing from "restores the hour-0 palette" to
     "restores the first palette" (`HARMONY_PALETTES[0]`); the expected value
     (`['C', 'G', 'E', 'D', 'B', 'C', 'E', 'G']`) is unchanged since it's the same tuple, just
     addressed by array index instead of hour key.
  4. **`scheduleHarmonyCycle()` takes no arguments now** — update every call site in this test file
     accordingly (`scheduleHarmonyCycle()`, not `scheduleHarmonyCycle(mockTransport)`).
  5. Replace the "updates when hour changes" test with an equivalent measure-driven version: set
     `currentMeasure = 10` (→ `Math.floor(10 / 2) % 12 = 5`) before invoking the captured callback, and
     assert `getAvailableNotes()[0]` equals `'A'` (`HARMONY_PALETTES[5][0]`) — the same expected value
     as the old hour-5 test, coincidentally, since palette index 5's content didn't move.
  6. **New test — length-independence / wraparound**, directly covering the confirmed intent's core
     requirement: set `currentMeasure` to a value at/past the end of the array (e.g. `24`, since
     `Math.floor(24 / 2) % 12 = 0`) and assert the palette wraps back to `HARMONY_PALETTES[0]` rather
     than going out of bounds or throwing — asserts against `HARMONY_PALETTES.length` behavior
     generically (e.g. by constructing the expected index as `Math.floor(measure /
     MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length` in the test itself, not a hardcoded `12`),
     so the test doesn't silently start assuming the same fixed length it's meant to guard against.
  7. `stopHarmonyCycle` test — update to assert `cancelSchedule` (the mocked beatClock export) was
     called with the id `scheduleRepeat`'s mock returned, replacing the old
     `mockTransport.clear`-was-called-with assertion.
  8. **New/updated test — interval string uses the shared constant:** assert the mocked
     `scheduleRepeat` was called with `'2m'` (i.e. `` `${MEASURES_PER_PALETTE_ENTRY}m` ``), guarding
     against the interval literal and the index-math divisor drifting apart again in the future.
* **`AudioEngine.test.ts`:** no changes required (§2) — run the full suite anyway to confirm.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** start playback and watch the dev console's
  `[HarmonySystem] Palette changed to index N` log lines — confirm `N` advances `0, 1, 2, ..., 11, 0,
  ...` monotonically, exactly every 2 measures, regardless of BPM (i.e. the wall-clock time between log
  lines should scale with tempo, but the measure count between them should not).

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** Current branch (`bugs/duplicate-value-audit`) is scoped to duplicate-value
  *fixes*; this spec introduces new behavior (palette selection mechanism), not just a fix, so a
  separate branch (e.g. `feature/harmony-palette-sequencing`) is suggested — human's call.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences. Suggested grouping, each independently reviewable: (1) `harmonySystem.ts` +
  `harmonySystem.test.ts` — the full mechanism change; (2) `AudioEngine.ts` — the one-line call site
  update; (3) `docs/HARMONY_SYSTEM.md` + `docs/AUDIO_SYSTEM.md`; (4) `docs/DUPLICATE_VALUE_AUDIT.md`
  item 2, last, once (1)-(2) are actually merged (its rewrite describes a landed fix, matching items
  1/3/4/5's existing pattern of documenting the fix alongside its status).

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, not left open):

- ~~Array vs. `Record`, and does the 12/24 duplication get collapsed?~~ **Resolved: array, collapsed
  to 12** — §1.2.
- ~~Stateless derivation vs. accumulating counter?~~ **Resolved: stateless** — §1.3.
- ~~Does `scheduleHarmonyCycle` switch to `beatClock.ts`'s own scheduling exports?~~ **Resolved: yes,
  drops its `transport` parameter entirely** — §1.5.
- ~~Rename `TIME_PITCHES`?~~ **Resolved: yes, `HARMONY_PALETTES`** — confirmed directly in the
  interview.
- ~~Named constant for the per-entry measure count, and is it user-facing yet?~~ **Resolved: yes, named
  (`MEASURES_PER_PALETTE_ENTRY`), local to the module, not wired to any UI/store** — §1.4.
- ~~Does `getCurrentHour()` get removed from `beatClock.ts` now that it has no remaining production
  caller?~~ **Resolved: no, left as-is** — §3, flagged for awareness only.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **`docs/DUPLICATE_VALUE_AUDIT.md` item 2's exact resulting status (open/changed-scope/closed) isn't
   fully pre-determined by this spec.** The spec establishes *what changes* (harmony's coupling to the
   96-measure day concept goes away), but whether that fully closes item 2 or just narrows it to
   `lightingUtils.ts` alone is a judgment call best made once the code change has actually landed and
   the doc rewrite is being drafted — not before.
2. **The manual-check log-watching step (§5) is the only verification that the *rate* (measures, not
   wall-clock) is what's actually driving palette changes across a BPM change.** No automated test
   changes tempo mid-run; if that's a concern worth codifying, a Plan/Tasks step could add one, but it's
   not required by the confirmed intent as scoped.
