import { describe, it, expect } from 'vitest';
import { SLOT_COUNT, GREEBLE_SLOTS, FIXTURE_BOXES, SOCKET_POSITIONS, type GreebleSlot } from './greebleSlots';
import type { WaveformType } from '../../types/Robot';

const WAVEFORMS: WaveformType[] = ['sine', 'square', 'triangle', 'sawtooth', 'pulse'];

// Loose per-shape bounding rectangles (the real SVG outline's own bounding box, from the Phase 36
// shapes' hull paths) — "inside the shape's outline bounds" is a bounding-box check, not exact
// polygon containment; the collision test below is what actually guards precision.
const OUTLINE_BOUNDS: Record<WaveformType, { x1: number; x2: number; y1: number; y2: number }> = {
  sine: { x1: 8, x2: 80, y1: 12, y2: 60 },
  square: { x1: 16, x2: 80, y1: 12, y2: 60 },
  triangle: { x1: 12, x2: 84, y1: 8, y2: 64 },
  sawtooth: { x1: 8, x2: 92, y1: 8, y2: 64 },
  pulse: { x1: 8, x2: 80, y1: 12, y2: 60 },
};

function boxOf(b: { x: number; y: number; w: number; h: number }) {
  return { x1: b.x - b.w / 2, x2: b.x + b.w / 2, y1: b.y - b.h / 2, y2: b.y + b.h / 2 };
}

function intersects(a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

describe('greebleSlots', () => {
  it('SLOT_COUNT is 8', () => {
    expect(SLOT_COUNT).toBe(8);
  });

  describe.each(WAVEFORMS)('%s', (waveform) => {
    it(`has exactly ${8} slots`, () => {
      expect(GREEBLE_SLOTS[waveform]).toHaveLength(SLOT_COUNT);
    });

    it('every slot box lies inside the shape\'s outline bounding region', () => {
      const bounds = OUTLINE_BOUNDS[waveform];
      GREEBLE_SLOTS[waveform].forEach((slot: GreebleSlot, i) => {
        const box = boxOf(slot);
        expect(box.x1, `slot ${i} left edge`).toBeGreaterThanOrEqual(bounds.x1);
        expect(box.x2, `slot ${i} right edge`).toBeLessThanOrEqual(bounds.x2);
        expect(box.y1, `slot ${i} top edge`).toBeGreaterThanOrEqual(bounds.y1);
        expect(box.y2, `slot ${i} bottom edge`).toBeLessThanOrEqual(bounds.y2);
      });
    });

    it('no slot box intersects any fixture box for this shape (window, lamp, vent, reserved sockets)', () => {
      const slots = GREEBLE_SLOTS[waveform].map(boxOf);
      const fixtures = FIXTURE_BOXES[waveform].map(boxOf);
      slots.forEach((slot, i) => {
        fixtures.forEach((fixture, j) => {
          expect(intersects(slot, fixture), `slot ${i} vs fixture ${j}`).toBe(false);
        });
      });
    });

    it('no two slots in this shape\'s table overlap each other', () => {
      const slots = GREEBLE_SLOTS[waveform].map(boxOf);
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          expect(intersects(slots[i], slots[j]), `slot ${i} vs slot ${j}`).toBe(false);
        }
      }
    });
  });

  it('pulse uses sine\'s table (pulse = sine, per the spec)', () => {
    expect(GREEBLE_SLOTS.pulse).toBe(GREEBLE_SLOTS.sine);
    expect(FIXTURE_BOXES.pulse).toBe(FIXTURE_BOXES.sine);
  });

  describe('SOCKET_POSITIONS', () => {
    it.each(WAVEFORMS)('%s has exactly two positions (coaxial, harmonic)', (waveform) => {
      expect(SOCKET_POSITIONS[waveform]).toHaveLength(2);
    });

    it('pulse uses sine\'s positions (pulse = sine)', () => {
      expect(SOCKET_POSITIONS.pulse).toBe(SOCKET_POSITIONS.sine);
    });

    describe.each(WAVEFORMS)('%s', (waveform) => {
      it('each socket position sits exactly on that shape\'s reserved fixture box (the tail two entries of FIXTURE_BOXES)', () => {
        const fixtures = FIXTURE_BOXES[waveform];
        const reserved = fixtures.slice(-2); // [coaxial, harmonic] — reserved for this phase at Phase 37 Task 2/3
        SOCKET_POSITIONS[waveform].forEach((pos, i) => {
          // The socket's own footprint IS that reserved box, hand-measured per shape (not a
          // uniform radius — Organic's coaxial socket has only ~4 units of clearance between
          // the window and vent, so its reserved box is narrower than Sleek's).
          const socketBox = boxOf({ x: pos.x, y: pos.y, w: reserved[i].w, h: reserved[i].h });
          const reservedBox = boxOf(reserved[i]);
          expect(socketBox, `socket ${i}`).toEqual(reservedBox);
        });
      });

      it('no socket\'s footprint intersects the window, lamp, vent or stripe fixtures (every fixture but the reserved tail two)', () => {
        const fixtures = FIXTURE_BOXES[waveform];
        const reserved = fixtures.slice(-2);
        const nonReserved = fixtures.slice(0, -2).map(boxOf);
        SOCKET_POSITIONS[waveform].forEach((pos, i) => {
          const socketBox = boxOf({ x: pos.x, y: pos.y, w: reserved[i].w, h: reserved[i].h });
          nonReserved.forEach((fixture, j) => {
            expect(intersects(socketBox, fixture), `socket ${i} vs fixture ${j}`).toBe(false);
          });
        });
      });
    });

    // Spot-check against the Phase 37 sketch header's reserved coordinates
    // (docs/sketches/robot-greebles.html), per this task's own acceptance criterion.
    it('sine (Sleek) positions match the sketch', () => {
      expect(SOCKET_POSITIONS.sine).toEqual([{ x: 36.5, y: 36 }, { x: 63.4, y: 36 }]);
    });

    it('square (Angular) positions match the sketch', () => {
      expect(SOCKET_POSITIONS.square).toEqual([{ x: 32, y: 36 }, { x: 48.5, y: 21 }]);
    });

    it('triangle (Organic) positions match the sketch', () => {
      expect(SOCKET_POSITIONS.triangle).toEqual([{ x: 47, y: 36 }, { x: 72, y: 48 }]);
    });

    it('sawtooth (Industrial) positions match the sketch', () => {
      expect(SOCKET_POSITIONS.sawtooth).toEqual([{ x: 40, y: 50 }, { x: 60, y: 55 }]);
    });
  });

  // Spot-check three slots per shape against the signed-off sketch header
  // (docs/sketches/robot-greebles.html), per the task's own acceptance criterion.
  it('sine (Sleek) slots 0, 3 and 7 match the sketch', () => {
    expect(GREEBLE_SLOTS.sine[0]).toEqual({ x: 21, y: 19, w: 6, h: 6 });
    expect(GREEBLE_SLOTS.sine[3]).toEqual({ x: 64.5, y: 18, w: 5, h: 6 });
    expect(GREEBLE_SLOTS.sine[7]).toEqual({ x: 64.5, y: 53, w: 5, h: 6 });
  });

  it('square (Angular) slots 0, 2 and 6 match the sketch', () => {
    expect(GREEBLE_SLOTS.square[0]).toEqual({ x: 32, y: 26, w: 6, h: 14 });
    expect(GREEBLE_SLOTS.square[2]).toEqual({ x: 52.5, y: 20, w: 5, h: 6 });
    expect(GREEBLE_SLOTS.square[6]).toEqual({ x: 52.5, y: 52, w: 5, h: 6 });
  });

  it('triangle (Organic) slots 0, 4 and 6 match the sketch', () => {
    expect(GREEBLE_SLOTS.triangle[0]).toEqual({ x: 28, y: 15, w: 8, h: 5 });
    expect(GREEBLE_SLOTS.triangle[4]).toEqual({ x: 48, y: 59, w: 14, h: 5 });
    expect(GREEBLE_SLOTS.triangle[6]).toEqual({ x: 72, y: 36, w: 10, h: 10 });
  });

  it('sawtooth (Industrial) slots 0, 4 and 7 match the sketch', () => {
    expect(GREEBLE_SLOTS.sawtooth[0]).toEqual({ x: 40, y: 20, w: 8, h: 12 });
    expect(GREEBLE_SLOTS.sawtooth[4]).toEqual({ x: 72, y: 22, w: 14, h: 8 });
    expect(GREEBLE_SLOTS.sawtooth[7]).toEqual({ x: 88.5, y: 36, w: 5, h: 14 });
  });
});
