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
  /** Nav-tree row's own lore-styled caption (docs/reference/text-content-tables.md), paired with
   *  navLabel below the same way NavTreeNodeSchema's own loreLabel/humanLabel pair works
   *  elsewhere in the tree. Optional only because not every subsection has confirmed lore copy
   *  yet. */
  loreLabel?: string;
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

/** The only 4 Trait values ROBOT_SECTIONS_CONFIG ever uses — narrower than Trait itself (which
 *  also covers company/seed/header, used elsewhere in the app) so a consumer's own trait->style
 *  mapping (RobotOptionsTab.tsx/CompanyOptionsSection.tsx) can be a Record<RobotOptionsTrait, ...>
 *  literal instead of a switch with a silent default — TypeScript then refuses to compile if a
 *  new section here ever uses a trait neither mapping handles, rather than silently rendering an
 *  unstyled accordion at runtime. */
export type RobotOptionsTrait = Extract<Trait, 'output' | 'composition' | 'timeSpace' | 'spectral'>;

export interface RobotSectionEntry {
  id: RobotSection;
  /** Same lore/human pairing as RobotSubsectionEntry's own loreLabel/navLabel above. */
  loreLabel?: string;
  navLabel: string;
  trait: RobotOptionsTrait;
  /** Present only for a section that wraps its subsections in its OWN accordion ('source') — its
   *  value is that wrapping accordion's trigger label. Absent for volume/melody/envelope,
   *  whose single accordion-bearing subsection's own accordion is that section's only chrome. */
  ownAccordionLabel?: string;
  subsections: RobotSubsectionEntry[];
}

/** Tree order == render order, for both the nav tree (useNavTree.ts) and the stacked content
 *  views (RobotOptionsTab.tsx/CompanyOptionsSection.tsx) — one array, both consumers iterate it
 *  directly instead of each hand-declaring their own order. */
export const ROBOT_SECTIONS_CONFIG: RobotSectionEntry[] = [
  {
    id: 'volume', loreLabel: 'Output', navLabel: 'Dynamics', trait: 'output',
    subsections: [
      { id: 'audioSettings', loreLabel: 'Ops Clarity', navLabel: 'Level Control', accordionLabel: 'Levels' },
    ],
  },
  {
    id: 'melody', loreLabel: 'Payload Registrar', navLabel: 'Composition', trait: 'composition',
    subsections: [
      { id: 'rhythm', loreLabel: 'Payload Map', navLabel: 'Rhythm', accordionLabel: 'Composition' },
      { id: 'frequency', loreLabel: 'Payload Allocation', navLabel: 'Pitches', mergedInto: 'rhythm' },
    ],
  },
  {
    id: 'envelope', loreLabel: 'Ping Shell', navLabel: 'Envelope', trait: 'timeSpace',
    subsections: [
      { id: 'pingContour', loreLabel: 'Ping Profile', navLabel: 'Contour', accordionLabel: 'Envelope' },
    ],
  },
  {
    id: 'source', loreLabel: 'Telemetry', navLabel: 'Source', trait: 'spectral', ownAccordionLabel: 'Source',
    subsections: [
      // navLabel/accordionLabel renamed together (docs/reference/text-content-tables.md:
      // Baseline/Coaxial/Harmonic Oscillator -> Core/Companion/Accent Oscillator) — unlike
      // Rhythm/Composition or Contour/Envelope above, these 2 fields were always identical for
      // each of these 3 subsections, not a deliberate divergence, so both move together.
      { id: 'baselineOscillator', loreLabel: 'Baseline Feed', navLabel: 'Core Oscillator', accordionLabel: 'Core Oscillator' },
      { id: 'coaxialOscillator', loreLabel: 'Coaxial Effect', navLabel: 'Companion Oscillator', accordionLabel: 'Companion Oscillator' },
      { id: 'harmonicOscillator', loreLabel: 'Offset Matrix', navLabel: 'Accent Oscillator', accordionLabel: 'Accent Oscillator' },
    ],
  },
];

/**
 * Source's 3 fixed oscillator layer slots, in SIGNATURE_ARRAY_CONFIG order. Kept as its own small
 * literal rather than derived by filtering ROBOT_SECTIONS_CONFIG: this is a structural fact about
 * which RobotSubsection ids are oscillator layers (fixed by the domain model — a new layer would
 * require a RobotSubsection type change touching many files, not just this one).
 */
export const SOURCE_OSCILLATOR_SUBSECTIONS = ['baselineOscillator', 'coaxialOscillator', 'harmonicOscillator'] as const;

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
