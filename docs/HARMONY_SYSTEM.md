# Harmony System Guide

The Harmony System provides dynamic musical palettes that cycle sequentially through a fixed set of
12 palettes as `Tone.Transport` measures advance, creating evolving ambient textures without requiring
manual composition. Each palette holds for `MEASURES_PER_PALETTE_ENTRY` (2) measures before the next one
takes over, wrapping back to the first after the last. **This is a distinct clock from each locale's own
visual day/night cycle** (a flat, universal `DAY_DURATION_MS` real-world duration, wall-clock-driven from
that locale's own `dayStartTimestamp`, see `src/constants/time.ts`). The two are deliberately decoupled: a
locale's visual lighting always completes a day in that fixed real-world duration regardless of tempo,
while the harmony palette moves with musical measures. See "Palette Advancement" below.

## Purpose

Robots do not store literal note strings in their melodies. Instead, they store **note indices (0-7)**
that map into an 8-note palette. The palette is worked out from the measure a note sounds in, each time a
note is scheduled (`paletteForMeasure(measure)`), so melody events stay stable while the harmony evolves,
and every note plays the chord of its own measure. Nothing holds a "current palette": there is no harmony
repeat and no module state (docs/specs/ONE_MUSIC_CLOCK.md §4.3).

## Core Concept

```
Robot Melody: [2, 0, 5, 3, ...]  (note indices, immutable)
                ↓  ↓  ↓  ↓
Palette:      ['C', 'G', 'E', 'D', 'B', 'C', 'E', 'G']  (note names, no octave — paletteForMeasure(measure), a new entry every 2 measures)
                ↓  ↓  ↓  ↓
Per-event octave: [4,  4,  4,  3,  ...]  (concrete octave stored on each MelodyEvent at spawn)
                ↓  ↓  ↓  ↓
Actual Playback: E4, C4, A3, ... (note name + event octave combined at scheduling time)
```

When the measure reaches a new palette entry, only the note names a step reads change; robot melodies
(indices + octaves) remain untouched.

## Data Structure

```typescript
// Exactly 8 note-name strings (no octave digit) per palette entry.
export type EighthNotes = [string, string, string, string, string, string, string, string];

// 12 structurally-unique palettes, cycled sequentially — no hour-of-day meaning.
const HARMONY_PALETTES: EighthNotes[] = [
  ['C',  'G',  'E',  'D',  'B',  'C',  'E',  'G' ],
  ['C',  'G',  'F',  'D',  'A',  'C',  'F',  'F' ],
  ['D',  'A',  'F',  'D',  'A',  'C',  'F',  'D' ],
  ['F',  'G',  'B',  'D',  'G',  'D',  'G',  'G' ],
  ['G',  'D',  'B',  'A',  'B',  'D',  'A',  'G' ],
  ['A',  'D',  'C',  'G',  'E',  'C',  'A',  'E' ],
  ['Bb', 'D',  'C',  'G',  'F',  'C',  'Bb', 'F' ],
  ['Bb', 'Eb', 'C',  'G',  'F',  'D',  'Bb', 'Eb'],
  ['Ab', 'Eb', 'C',  'G',  'Ab', 'D',  'Ab', 'Eb'],
  ['Db', 'F',  'C',  'Ab', 'Bb', 'Db', 'Ab', 'F' ],
  ['B',  'F#', 'D#', 'C#', 'A',  'B',  'D#', 'F#'],
  ['E',  'C',  'G#', 'D',  'Bb', 'E',  'G#', 'B' ],
];

// Measures each palette entry holds before advancing to the next.
const MEASURES_PER_PALETTE_ENTRY = 2;
```

A plain array, not an hour-keyed map — nothing in the lookup assumes this array's length, so a future
palette set of any size works unchanged (docs/specs/archive/HARMONY_PALETTE_SEQUENCING.md).

## API

**File: `src/engine/harmonySystem.ts`** — one export besides the `EighthNotes` type:

```typescript
// The palette a measure plays: entry floor(measure / MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length,
// as a copy. Pure: worked out from the measure and the table, nothing remembered.
export function paletteForMeasure(measure: number): string[];
```

The measure is the never-wrapping count from the transport's tick 0, the `measure` of a `MusicPosition`
([BEAT_CLOCK.md](BEAT_CLOCK.md#the-music-position)). There is nothing to start, stop or reset: a power-on
plays measure 0 on entry 0 because the transport starts at tick 0.

## Usage in Melody Playback

The melody tick reads its own position and hands it to `AudioEngine.processMelodyStep`, which reads the
palette for that position's measure (`src/engine/AudioEngine.ts`, abridged):

```typescript
// startMelodyPlayback: a 16n repeat on the sixteenth grid (start 0), registered before the transport starts.
transport.scheduleRepeat((time: number) => {
  const at = positionAt(time);          // { sixteenth, measure, step } of this callback's own time
  if (!at) return;
  AudioEngine.processMelodyStep(at, time);
}, '16n', 0);

// processMelodyStep(at: MusicPosition, time: number)
const events = stepRegistry.get(at.step) || [];
const notes = paletteForMeasure(at.measure);   // the chord of the measure this step sounds in
events.forEach(({ robotId, event }) => {
  const noteName = notes[event.noteIndex];     // e.g. 'C'
  const note = `${noteName}${event.octave ?? 4}`; // e.g. 'C4' — octave baked in at spawn
  AudioEngine.scheduleNote({ robotId, note, duration: event.length, time: time + MIN_LEAD /* + humanize */ });
});
```

## Critical Rules

**✅ DO:**
- Store note indices (0-7) in robot melodies
- Read the palette at playback time with `paletteForMeasure(measure)`, for the measure of the note's own
  callback time (`positionAt(time)`)
- Keep melodies immutable after spawn

**❌ DON'T:**
- Store literal pitch strings in melodies
- Keep a "current palette", or any other running count, beside the clock
- Read the measure from another tick's last value (`getCurrentMeasure()`) for a note's palette: that value
  belongs to whichever tick ran last
- Regenerate melodies or reschedule melody loops when the palette changes
- Use `setInterval` or `setTimeout` for anything musical

## Palette Advancement

```typescript
// paletteForMeasure: worked out on every call — never stored, never incremented.
HARMONY_PALETTES[Math.floor(measure / MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length]
```

**Important:** the entry is a pure function of the measure. A late or lost firing cannot leave the palette
out of step, and the palette changes on the bar's own first sixteenth: step 1 of measure 2 plays entry 1,
because the step reads measure 2 from its own time. (Until docs/specs/ONE_MUSIC_CLOCK.md, a `2m` repeat
swapped a stored palette and read BeatClock's last measure, so the chord could change two measures late;
backlog 82.)

**This is a different clock from the visual day/night cycle.** The harmony palette advances with
`Tone.Transport`'s measure position — it moves with musical tempo, not real time. Facade/window lighting
(`Factory.tsx`, `src/utils/lightingUtils.ts`) instead derives its position from real wall-clock elapsed
time (`computeLocaleHour` in `src/constants/time.ts`, scaled by a single fixed `DAY_DURATION_MS`). The
two are **not synchronized** — a BPM change shifts how quickly the harmony palette cycles but has no
effect on the visual lighting cycle, and vice versa.

## Palette Design Guidelines

When creating custom `HARMONY_PALETTES` entries:

1. **Use 8 notes exactly** (`EighthNotes` type enforces this)
2. **No octave digits:** All entries are bare note names (`'C'`, `'Bb'`, `'F#'`). Octave is a robot-level attribute, not a palette concern.
3. **Avoid extreme leaps:** Adjacent indices should be reasonably close in pitch character
4. **Smooth transitions:** Entry N and entry N+1 should share some note names for continuity
5. **Order is the only structure that matters now** — entries no longer carry a mood-to-hour mapping;
   sequencing/mood arcs are a property of the order you list entries in the array, not a fixed clock
   position.

A palette setting (backlog 7) would enter through `paletteForMeasure`, the one place the table is read. It
keeps no history: after a change, every measure, earlier ones included, plays the palettes as they are then
set.

## Index Safety

`processMelodyStep` looks the note name up with `notes[event.noteIndex]`. An index with no name (outside
0..7) is skipped with a `devWarn`, and the step's other events still play: each event is scheduled inside
its own `try/catch`.

## Testing

`paletteForMeasure` is pure: call it with a measure and compare with the table. `processMelodyStep` takes a
`MusicPosition`, so a test plays any measure and step directly, with no transport
(`src/engine/AudioEngine.test.ts`'s `atStep(step, measure)` helper builds one).

**Debug display:**
```typescript
import { getCurrentMeasure } from '../engine/beatClock';
import { paletteForMeasure } from '../engine/harmonySystem';
console.log('Current measure:', getCurrentMeasure());
console.log('Its notes:', paletteForMeasure(getCurrentMeasure()));
```

## Performance

- `paletteForMeasure` returns a copy (safe, no mutation risk): one array of 8 strings per melody step,
  negligible
- No callback of its own on the transport, and no iteration over robot arrays when the palette changes

## Integration with Melody System

Robots generate melodies at spawn. Each event stores the note index *and* a concrete octave:
```typescript
// Declared once, in types/Robot.ts.
interface MelodyEvent {
  id: string;
  startStep: number;   // 1..16
  length: NoteDuration; // '32n'|'16n'|'8n'|'4n'|'2n'|'1n'|'2m'|'4m' (types/Robot.ts) — melody generation only ever produces '16n'|'8n'|'4n'|'2n', but the field's type is the full union
  noteIndex: number;   // 0..7 ← maps into note-name palette
  octave: number;      // concrete octave assigned at spawn time
}
```

At scheduling time, `note = paletteForMeasure(measure)[event.noteIndex] + event.octave` (e.g. `"C" + 4 =
"C4"`). This means a palette change silently updates the pitch class while the octave register stays as the
robot was born with.

The melody event never changes—only the palette its measure reads.
