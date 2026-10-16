/**
 * Articulation (Robot Performance, docs/specs/ROBOT_PERFORMANCE.md assumption 5 and §1.3) — the one
 * place every number a mark means lives. The Accents slider stamps marks onto melody events
 * (melodyGenerator.ts's applyPerformanceMarks); the playback loop turns an event's stamps into a
 * velocity multiplier and a sounding-length factor here (AudioEngine.ts's processMelodyStep).
 * Nothing else computes a multiplier, so retuning a mark or a tier is one line in this file.
 *
 * Pure: no store, no Tone, no randomness.
 */
import { ARTICULATION_MARK_NAMES, type ArticulationMark, type MelodyEvent } from '../types/Robot';

/**
 * What each mark does to the note it sits on. `velocity` multiplies the note's loudness (stacking
 * with the motif-group accent, then clamped to 1 downstream); `length` is the fraction of the
 * event's written length that actually sounds.
 *
 * - accent: pushed — 25 % louder, full length.
 * - marcato: hard and short — 40 % louder, cut to three quarters.
 * - staccato: clipped — half length.
 * - staccatissimo: very clipped — a quarter length.
 * - tenuto: leaned on — a touch louder, held to the full length, and it cancels any rest on the
 *   same event (its "minimal gap" meaning wins).
 */
export const ARTICULATION_MARKS: Record<ArticulationMark, { velocity: number; length: number }> = {
  accent: { velocity: 1.25, length: 1 },
  marcato: { velocity: 1.4, length: 0.75 },
  staccato: { velocity: 1, length: 0.5 },
  staccatissimo: { velocity: 1, length: 0.25 },
  tenuto: { velocity: 1.1, length: 1 },
};

/** Accents value at which staccato and marcato join accent and tenuto. */
export const ACCENT_TIER_2 = 34;
/** Accents value at which staccatissimo joins the other four. */
export const ACCENT_TIER_3 = 67;

/**
 * The kinds in play at an Accents value: 1–33 accent and tenuto, 34–66 add staccato and marcato,
 * 67–100 add staccatissimo. Nothing at 0, and nothing for a negative or NaN value (a NaN must not
 * fall through every comparison into the top tier).
 */
export function unlockedMarks(accents: number): readonly ArticulationMark[] {
  if (!(accents > 0)) return [];
  if (accents < ACCENT_TIER_2) return ['accent', 'tenuto'];
  if (accents < ACCENT_TIER_3) return ['accent', 'tenuto', 'staccato', 'marcato'];
  return ARTICULATION_MARK_NAMES;
}

/**
 * What the playback loop needs from an event's stamps: a velocity multiplier and a sounding-length
 * factor. A rest and a mark on the same event: the shorter wins, except tenuto, which overrides the
 * rest and keeps the full length.
 */
export function resolveArticulation(event: Pick<MelodyEvent, 'rest' | 'mark'>): {
  velocity: number;
  length: number;
} {
  const mark = event.mark ? ARTICULATION_MARKS[event.mark] : { velocity: 1, length: 1 };
  const restFactor = event.rest !== undefined && event.mark !== 'tenuto' ? 1 - event.rest : 1;
  return { velocity: mark.velocity, length: Math.min(restFactor, mark.length) };
}
