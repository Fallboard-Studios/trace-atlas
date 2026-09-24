/**
 * Shared subsection schema for a robot/company's Melody/Envelope/Source/Output stacked view
 * (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Tasks 11/13) — one source of truth for both
 * RobotOptionsTab.tsx (robot mode) and CompanyOptionsSection.tsx (company/All-Probes broadcast
 * mode), which otherwise would each hand-duplicate the exact same tree-order/label table and risk
 * drifting apart (e.g. a future label rename landing in only one of the two).
 */
import type { RobotSection, RobotSubsection } from '@/stores/uiStore';

/** Each section's own first child, in tree order — matches useNavTree.ts's SUBSECTION_CHILDREN
 *  ordering. Used both for the derived-open fallback (spec §1.5) and for "selecting a mid-level
 *  section opens its own first leaf" (spec §1.6). */
export const FIRST_SUBSECTION_OF: Record<RobotSection, RobotSubsection> = {
  volume: 'audioSettings',
  melody: 'rhythm',
  envelope: 'pingContour',
  source: 'baselineOscillator',
};

/** Source's 3 fixed oscillator layer slots, in SIGNATURE_ARRAY_CONFIG order — Probe Drift is
 *  handled separately (it isn't a layer index). */
export const SOURCE_OSCILLATOR_SUBSECTIONS = ['baselineOscillator', 'coaxialOscillator', 'harmonicOscillator'] as const;

export const OSCILLATOR_LABELS: Record<(typeof SOURCE_OSCILLATOR_SUBSECTIONS)[number], string> = {
  baselineOscillator: 'Baseline Oscillator',
  coaxialOscillator: 'Coaxial Oscillator',
  harmonicOscillator: 'Harmonic Oscillator',
};
