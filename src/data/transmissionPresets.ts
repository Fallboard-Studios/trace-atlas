// ========================================
// IMPORTS
// ========================================
import type { SessionPayload } from '../types/session';
import { decodeWorldLink } from '../utils/worldLink';
import { searchOf } from '../utils/sessionShareUtils';
import type { ContentKey } from '@/content';

// ========================================
// TYPES
// ========================================

/** A preset is a pasted link (docs/specs/OFF_SCREEN.md assumption 13): a world Crawford saved and shared. */
export interface TransmissionPreset {
  /** Stable across releases: the off screen's picker keys its options on it. */
  id: string;
  /** The content key (`home.off.presets.*`) that names the preset; the name is copy, never a field here. */
  nameKey: ContentKey;
  /** A share URL, or the bare `?seed=…&x=…&y=…[&s=…]` query — whatever Copy link / Share live produced. */
  link: string;
}

// ========================================
// CONSTANTS
// ========================================

/**
 * Transmission presets (docs/specs/LAYOUT_REWORK.md §1.9; docs/specs/OFF_SCREEN.md assumption 13): the three
 * factory worlds the off screen offers beside the user's saves. Each is a link, decoded by presetPayload below
 * through the same codec a shared link arrives by, so a preset is exactly the world its link names — tweaks and
 * all, once the link carries an `s` blob.
 *
 * PLACEHOLDERS. The three links are the bare triples of the former placeholder payloads (the same three worlds,
 * untweaked); the names are the sketch's stand-ins. Crawford curates the real three: pasting a share link over
 * each `link` here, and its name over the copy in `src/content/copy/home.ts`, is the whole change.
 */
export const TRANSMISSION_PRESETS: readonly TransmissionPreset[] = [
  { id: 'a', nameKey: 'home.off.presets.a', link: '?seed=kr1nd4ra&x=12&y=68' },
  { id: 'b', nameKey: 'home.off.presets.b', link: '?seed=qb9mezm3&x=-84&y=131' },
  { id: 'c', nameKey: 'home.off.presets.c', link: '?seed=h4lcy0n&x=143&y=-57' },
];

// ========================================
// FUNCTIONS
// ========================================

/**
 * The whole payload a preset's link decodes to — a fresh object every call — or null when the link names no
 * world at all (none of seed / x / y / s), which the off screen treats as a pick that applies nothing. A
 * malformed part is filled the way a shared link's is (a random name, a random axis): decodeWorldLink's
 * leniency, never a throw (spec assumption 13).
 */
export function presetPayload(preset: TransmissionPreset): SessionPayload | null {
  return decodeWorldLink(searchOf(preset.link));
}
