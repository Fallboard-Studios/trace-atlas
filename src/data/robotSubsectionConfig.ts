/**
 * Canonical section/subsection shape for a robot/company's Levels/Composition/Envelope/Source
 * stacked view (docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md) — one source of truth for
 * useNavTree.ts (which reads it to build the probes/companies per-entity nav-tree nodes) and for
 * RobotOptionsTab.tsx/CompanyOptionsSection.tsx (which read it to build their stacked accordion
 * views), which otherwise each hand-duplicate the exact same id/label/trait table and risk
 * drifting apart (e.g. a future label rename landing in only one of the several places it used to
 * be typed out).
 *
 * Every literal id/label/trait below is transcribed from current shipped source, not invented —
 * see docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md §1.3/§2 for the citations this was checked
 * against.
 */
import type { RobotSection, RobotSubsection } from '@/stores/uiStore';
import type { Trait } from '@/types/traits';

export interface RobotSubsectionEntry {
  id: RobotSubsection;
  /** Nav-tree row label (NavCabinetRow/NavTreeNode). May differ from accordionLabel — e.g.
   *  'rhythm's nav label is 'Rhythm', its accordion trigger reads 'Composition' — both surfaces
   *  read this table instead of each hand-typing their own copy. */
  navLabel: string;
  /** This subsection's own AccordionContainer trigger label. Absent exactly when mergedInto is
   *  set — a subsection with no accordion of its own. */
  accordionLabel?: string;
  /** Set only for a subsection with no accordion of its own — the sibling subsection id whose
   *  accordion it scrolls into instead ('frequency' -> 'rhythm': Rhythm/Pitches merged into one
   *  "Composition" accordion). Absent for every subsection that owns its own accordion. */
  mergedInto?: RobotSubsection;
}

export interface RobotSectionEntry {
  id: RobotSection;
  navLabel: string;
  trait: Trait;
  /** Present only for a section that wraps its subsections in its OWN accordion ('source') — its
   *  value is that wrapping accordion's trigger label. Absent for volume/melody/envelope, whose
   *  single accordion-bearing subsection's own accordion is that section's only chrome. */
  ownAccordionLabel?: string;
  subsections: RobotSubsectionEntry[];
}

/** Tree order == render order, for both the nav tree (useNavTree.ts) and the stacked content
 *  views (RobotOptionsTab.tsx/CompanyOptionsSection.tsx) — one array, both consumers iterate it
 *  directly instead of each hand-declaring their own order. */
export const ROBOT_SECTIONS_CONFIG: RobotSectionEntry[] = [
  {
    id: 'volume', navLabel: 'Levels', trait: 'output',
    subsections: [
      { id: 'audioSettings', navLabel: 'Dynamics', accordionLabel: 'Levels' },
    ],
  },
  {
    id: 'melody', navLabel: 'Composition', trait: 'composition',
    subsections: [
      { id: 'rhythm', navLabel: 'Rhythm', accordionLabel: 'Composition' },
      { id: 'frequency', navLabel: 'Pitches', mergedInto: 'rhythm' },
    ],
  },
  {
    id: 'envelope', navLabel: 'Envelope', trait: 'timeSpace',
    subsections: [
      { id: 'pingContour', navLabel: 'Contour', accordionLabel: 'Envelope' },
    ],
  },
  {
    id: 'source', navLabel: 'Source', trait: 'spectral', ownAccordionLabel: 'Source',
    subsections: [
      { id: 'baselineOscillator', navLabel: 'Baseline Oscillator', accordionLabel: 'Baseline Oscillator' },
      { id: 'coaxialOscillator', navLabel: 'Coaxial Oscillator', accordionLabel: 'Coaxial Oscillator' },
      { id: 'harmonicOscillator', navLabel: 'Harmonic Oscillator', accordionLabel: 'Harmonic Oscillator' },
      { id: 'probeDrift', navLabel: 'Probe Drift', accordionLabel: 'Probe Drift' },
    ],
  },
];

/** Each section's own first child, in tree order — derived from ROBOT_SECTIONS_CONFIG rather than
 *  a second hand-typed table. Kept as a Record (not a function) so no existing/future call site
 *  needs to change shape. */
export const FIRST_SUBSECTION_OF: Record<RobotSection, RobotSubsection> = Object.fromEntries(
  ROBOT_SECTIONS_CONFIG.map((section) => [section.id, section.subsections[0].id]),
) as Record<RobotSection, RobotSubsection>;

/**
 * Source's 3 fixed oscillator layer slots, in SIGNATURE_ARRAY_CONFIG order — Probe Drift is
 * handled separately (it isn't a layer index). Kept as its own small literal rather than derived
 * by filtering ROBOT_SECTIONS_CONFIG: this is a structural fact about which RobotSubsection ids
 * are oscillator layers (fixed by the domain model — a new layer would require a RobotSubsection
 * type change touching many files, not just this one), distinct from the display-label
 * duplication OSCILLATOR_LABELS below actually fixes.
 */
export const SOURCE_OSCILLATOR_SUBSECTIONS = ['baselineOscillator', 'coaxialOscillator', 'harmonicOscillator'] as const;

function accordionLabelOf(id: RobotSubsection): string {
  for (const section of ROBOT_SECTIONS_CONFIG) {
    const sub = section.subsections.find((s) => s.id === id);
    if (sub?.accordionLabel) return sub.accordionLabel;
  }
  throw new Error(`No accordion label registered for subsection "${id}"`);
}

/** Values now come from ROBOT_SECTIONS_CONFIG itself — previously a second, independently-typed
 *  literal that had drifted into an exact word-for-word duplicate of useNavTree.ts's own copy
 *  (docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md §1.1). */
export const OSCILLATOR_LABELS: Record<(typeof SOURCE_OSCILLATOR_SUBSECTIONS)[number], string> = {
  baselineOscillator: accordionLabelOf('baselineOscillator'),
  coaxialOscillator: accordionLabelOf('coaxialOscillator'),
  harmonicOscillator: accordionLabelOf('harmonicOscillator'),
};

/** Every accordion-bearing subsection id RobotSectionAccordionStack renders for `prefix`, in tree
 *  order — excludes a subsection merged into a sibling (mergedInto set, e.g. 'frequency'/Pitches,
 *  which has no accordion of its own). Lives alongside ROBOT_SECTIONS_CONFIG (not in
 *  RobotSectionAccordionStack.tsx) since it's a pure derivation of this table, not
 *  component-specific logic — also keeps that file component-only for React Fast Refresh. */
export function subsectionIds(prefix: string): string[] {
  return ROBOT_SECTIONS_CONFIG.flatMap((section) => section.subsections
    .filter((sub) => !sub.mergedInto)
    .map((sub) => `${prefix}.${section.id}.${sub.id}`));
}

/** Every real AccordionContainer id RobotSectionAccordionStack renders for `prefix` —
 *  subsectionIds() plus each section's own wrapping accordion id, for a section that has one
 *  (only 'source' today). */
export function accordionIds(prefix: string): string[] {
  const wrapping = ROBOT_SECTIONS_CONFIG
    .filter((section) => section.ownAccordionLabel)
    .map((section) => `${prefix}.${section.id}`);
  return [...subsectionIds(prefix), ...wrapping];
}
