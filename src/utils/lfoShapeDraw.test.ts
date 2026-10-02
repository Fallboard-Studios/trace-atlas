import { describe, it, expect } from 'vitest';
import { pickShape, LFO_SHAPE_SEED_ORDER, LFO_SHAPE_SEED_BIAS } from './lfoShapeDraw';
import type { LfoShape } from '../types/lfo';

describe('pickShape', () => {
  it('t=0 picks the front of the queue', () => {
    const { shape } = pickShape(0, LFO_SHAPE_SEED_ORDER);
    expect(shape).toBe('sine');
  });

  it('t just under 1 picks the back of the queue', () => {
    const { shape } = pickShape(0.999999, LFO_SHAPE_SEED_ORDER);
    expect(shape).toBe('square');
  });

  it('sends the picked shape to the back of the returned queue, others keep relative order', () => {
    const { queue } = pickShape(0, LFO_SHAPE_SEED_ORDER);
    expect(queue).toEqual(['triangle', 'sawtooth', 'square', 'sine']);
  });

  it('a picked shape can be picked again, just less likely — picking the new front twice in a row', () => {
    const first = pickShape(0, LFO_SHAPE_SEED_ORDER); // sine picked, goes to back
    const second = pickShape(0, first.queue); // front is now triangle
    expect(second.shape).toBe('triangle');
    expect(second.queue).toEqual(['sawtooth', 'square', 'sine', 'triangle']);
  });

  it('first-pick odds follow the halving bias (1 / 0.5 / 0.25 / 0.125 of total 1.875)', () => {
    const total = LFO_SHAPE_SEED_BIAS.reduce((a, b) => a + b, 0);
    const thresholds = LFO_SHAPE_SEED_BIAS.reduce<number[]>((acc, w) => {
      acc.push((acc.at(-1) ?? 0) + w / total);
      return acc;
    }, []);
    expect(thresholds[0]).toBeCloseTo(0.5333, 3); // sine
    expect(thresholds[1]).toBeCloseTo(0.8, 3); // + triangle
    expect(thresholds[2]).toBeCloseTo(0.9333, 3); // + sawtooth
    expect(thresholds[3]).toBeCloseTo(1, 3); // + square

    // A value sitting just inside each band lands on the expected shape.
    expect(pickShape(0.53, LFO_SHAPE_SEED_ORDER).shape).toBe('sine');
    expect(pickShape(0.7, LFO_SHAPE_SEED_ORDER).shape).toBe('triangle');
    expect(pickShape(0.9, LFO_SHAPE_SEED_ORDER).shape).toBe('sawtooth');
    expect(pickShape(0.98, LFO_SHAPE_SEED_ORDER).shape).toBe('square');
  });

  it('works on a queue shorter than the full bias array (defensive, not a real call shape today)', () => {
    const shortQueue: LfoShape[] = ['square', 'sine'];
    const { shape, queue } = pickShape(0, shortQueue);
    expect(shape).toBe('square');
    expect(queue).toEqual(['sine', 'square']);
  });
});
