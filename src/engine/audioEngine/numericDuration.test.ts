// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import * as Tone from 'tone';

// Robot Performance T6 (docs/specs/ROBOT_PERFORMANCE.md section 1.3): a rested or clipped note is scheduled with a
// sounding length in seconds, not a note value. AudioEngine's triggerWithCap hands the composite voice String(seconds)
// (the voice stringifies its duration regardless), and the synth reads that through Tone.Time. This test runs against
// the REAL Tone, not the mock every engine test uses: if a Tone upgrade stopped reading a bare numeric string as
// seconds, every staccato and rest would silently misbehave and nothing else would notice.

// ========================================
// TESTS
// ========================================

describe('a seconds duration stringified for the synth', () => {
  it.each([0.03, 0.075, 0.1234567, 0.5, 1.5])('Tone.Time reads the string of %s as that many seconds', (seconds) => {
    expect(Tone.Time(String(seconds)).toSeconds()).toBeCloseTo(seconds, 10);
  });

  it('a number and its string agree', () => {
    expect(Tone.Time('0.075').toSeconds()).toBe(Tone.Time(0.075).toSeconds());
  });
});
