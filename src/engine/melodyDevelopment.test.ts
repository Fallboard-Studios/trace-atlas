// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import { developmentFloor, eventSixteenths } from './melodyDevelopment';
import type { MelodyEvent, NoteDuration } from '../types/Robot';

// ========================================
// HELPERS
// ========================================
function ev(startStep: number, length: NoteDuration, extra: Partial<MelodyEvent> = {}): MelodyEvent {
  return { id: `e${startStep}`, startStep, length, noteIndex: 0, octave: 4, ...extra };
}

// ========================================
// TESTS
// ========================================
describe('eventSixteenths (spec §1.4)', () => {
  it('reads the four home lengths as 1, 2, 4 and 8 sixteenths', () => {
    expect(eventSixteenths(ev(1, '16n'))).toBe(1);
    expect(eventSixteenths(ev(1, '8n'))).toBe(2);
    expect(eventSixteenths(ev(1, '4n'))).toBe(4);
    expect(eventSixteenths(ev(1, '2n'))).toBe(8);
  });

  it('reads anything a bar or longer as 16, and a thirty-second as 1', () => {
    expect(eventSixteenths(ev(1, '1n'))).toBe(16);
    expect(eventSixteenths(ev(1, '2m'))).toBe(16);
    expect(eventSixteenths(ev(1, '4m'))).toBe(16);
    expect(eventSixteenths(ev(1, '32n'))).toBe(1);
  });

  it('prefers the sixteenths field when it is set', () => {
    expect(eventSixteenths(ev(1, '4n', { sixteenths: 3 }))).toBe(3);
    expect(eventSixteenths(ev(1, '16n', { sixteenths: 7 }))).toBe(7);
    expect(eventSixteenths(ev(1, '2n', { sixteenths: 1 }))).toBe(1);
  });
});

describe('developmentFloor (spec §1.8)', () => {
  it('is 1 for attacks up to 0.3 s at a band top of 100 BPM', () => {
    for (const attack of [0.015, 0.1, 0.2, 0.29, 0.3]) expect(developmentFloor(attack, 100)).toBe(1);
  });

  it('rises past 0.3 s, and is 4 (a quarter note) at 1.14 s', () => {
    expect(developmentFloor(0.31, 100)).toBe(2);
    expect(developmentFloor(0.6, 100)).toBe(2);
    expect(developmentFloor(0.61, 100)).toBe(3);
    expect(developmentFloor(1.14, 100)).toBe(4);
  });

  it('follows the band top: a faster top raises the floor', () => {
    expect(developmentFloor(0.3, 200)).toBe(2);
    expect(developmentFloor(1.14, 50)).toBe(2);
  });

  it('is never below 1', () => {
    expect(developmentFloor(0, 100)).toBe(1);
    expect(developmentFloor(-1, 100)).toBe(1);
    expect(developmentFloor(Number.NaN, 100)).toBe(1);
    expect(developmentFloor(0.5, 0)).toBe(1);
    expect(developmentFloor(0.5, Number.NaN)).toBe(1);
  });
});
