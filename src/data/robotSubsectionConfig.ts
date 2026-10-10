/**
 * Canonical section/subsection shape for a robot/company's Levels/Composition/Envelope/Source
 * stacked view (docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md) — one source of truth for
 * RobotScreen.tsx (its section tabs, docs/tasks/LAYOUT_REWORK.md Task 16), the breadcrumb
 * (navActions.ts) and CompanyOptionsSection.tsx (its stacked accordion view, until Task 23), which
 * otherwise each hand-duplicate the exact same id/label/trait table and risk
 * drifting apart (e.g. a future label rename landing in only one of the several places it used to
 * be typed out).
 *
 * Every literal id/label/trait below is transcribed from current shipped source, not invented —
 * see docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md §1.3/§2 for the citations this was checked
 * against.
 */
import type { RobotSection, RobotSubsection } from '@/stores/uiStore';
import type { Trait } from '@/types/traits';
import type { ContentKey } from '@/content';

export interface RobotSubsectionEntry {
  id: RobotSubsection;
  /** The nav row's concept — its human/lore pair comes from CONTENT (docs/specs/CONTENT_LAYER.md).
   *  E.g. 'rhythm' reads probe.composition.rhythm ("Rhythm") in the tree. */
  content: ContentKey;
  /** This subsection's own AccordionContainer's concept — present exactly when it has an
   *  accordion (absent exactly when `mergedInto` is set). May differ from `content`: 'rhythm's
   *  accordion is probe.composition ("Composition"), a different concept from its row. */
  accordion?: ContentKey;
  /** Set only for a subsection with no accordion of its own — the sibling subsection id whose
   *  accordion it scrolls into instead ('frequency' -> 'rhythm': Rhythm/Pitches merged into one
   *  "Composition" accordion). Absent for every subsection that owns its own accordion. */
  mergedInto?: RobotSubsection;
}

/** The only 4 Trait values ROBOT_SECTIONS_CONFIG ever uses — narrower than Trait itself (which
 *  also covers company/seed/header, used elsewhere in the app) so a consumer's own trait->style
 *  mapping (RobotScreen.tsx/CompanyOptionsSection.tsx) can be a Record<RobotOptionsTrait, ...>
 *  literal instead of a switch with a silent default — TypeScript then refuses to compile if a
 *  new section here ever uses a trait neither mapping handles, rather than silently rendering an
 *  unstyled accordion at runtime. */
export type RobotOptionsTrait = Extract<Trait, 'output' | 'composition' | 'timeSpace' | 'spectral'>;

export interface RobotSectionEntry {
  id: RobotSection;
  /** The nav row's concept (human/lore from CONTENT), e.g. 'volume' reads probe.dynamics. */
  content: ContentKey;
  trait: RobotOptionsTrait;
  /** Present only for a section that wraps its subsections in its OWN accordion ('source') —
   *  that wrapping accordion's concept. Absent for volume/melody/envelope, whose single
   *  accordion-bearing subsection's own accordion is that section's only chrome. */
  accordion?: ContentKey;
  subsections: RobotSubsectionEntry[];
}

/** Render order, for the robot screen's tabs (RobotScreen.tsx) and the stacked company view
 *  (CompanyOptionsSection.tsx) — one array, both consumers iterate it directly instead of each
 *  hand-declaring their own order. */
export const ROBOT_SECTIONS_CONFIG: RobotSectionEntry[] = [
  {
    id: 'volume', content: 'probe.dynamics', trait: 'output',
    subsections: [
      { id: 'audioSettings', content: 'probe.dynamics.levelControl', accordion: 'probe.levels' },
    ],
  },
  {
    id: 'melody', content: 'probe.composition', trait: 'composition',
    subsections: [
      { id: 'rhythm', content: 'probe.composition.rhythm', accordion: 'probe.composition' },
      { id: 'frequency', content: 'probe.composition.pitches', mergedInto: 'rhythm' },
    ],
  },
  {
    id: 'envelope', content: 'probe.envelope', trait: 'timeSpace',
    subsections: [
      { id: 'pingContour', content: 'probe.envelope.contour', accordion: 'probe.envelope' },
    ],
  },
  {
    id: 'source', content: 'probe.source', trait: 'spectral', accordion: 'probe.source',
    subsections: [
      // navLabel/accordionLabel renamed together (docs/reference/text-content-tables.md:
      // Baseline/Coaxial/Harmonic Oscillator -> Core/Companion/Accent Oscillator) — unlike
      // Rhythm/Composition or Contour/Envelope above, these 2 fields were always identical for
      // each of these 3 subsections, not a deliberate divergence, so both move together.
      { id: 'baselineOscillator', content: 'probe.source.core', accordion: 'probe.source.core' },
      { id: 'coaxialOscillator', content: 'probe.source.companion', accordion: 'probe.source.companion' },
      { id: 'harmonicOscillator', content: 'probe.source.accent', accordion: 'probe.source.accent' },
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

// ========================================
// THE ROBOT SCREEN'S TABS (docs/tasks/LAYOUT_REWORK.md Task 16)
// ========================================
// Read by RobotScreen and the breadcrumb alike, so the two always name the same tab.

/** The section the robot screen opens on when none is stored (the plan: Source, Core Oscillator). */
export const DEFAULT_ROBOT_SECTION: RobotSection = 'source';

/** A section's own panels: its subsections with an accordion of their own (a merged one, Pitches,
 *  lives inside Composition's panel). */
function ownPanels(section: RobotSectionEntry): RobotSubsectionEntry[] {
  return section.subsections.filter((sub) => !sub.mergedInto);
}

/** A section's tab is named after the panel it shows, as its accordion was: Source's own wrapper, else
 *  its one panel's (Levels, not the tree's old "Dynamics" row). */
export function sectionTabContent(section: RobotSectionEntry): ContentKey {
  return section.accordion ?? ownPanels(section)[0].accordion!;
}

/** The sub-tab row: a section's panels when it has more than one (Source's three oscillators); a
 *  section with one panel shows it with no sub row. */
export function sectionSubTabs(section: RobotSectionEntry): RobotSubsectionEntry[] {
  const panels = ownPanels(section);
  return panels.length > 1 ? panels : [];
}

/** The open section: the stored one, else Source. */
export function activeRobotSection(stored: RobotSection | null): RobotSection {
  return stored ?? DEFAULT_ROBOT_SECTION;
}

/** The panel a section shows: the stored sub-tab when it is one of this section's, else its first —
 *  SectionTabs' own stale-value rule. A section with one panel always shows that one. */
export function activeRobotSubsection(sectionId: RobotSection, stored: RobotSubsection | null): RobotSubsection {
  const panels = ownPanels(ROBOT_SECTIONS_CONFIG.find((s) => s.id === sectionId)!);
  return panels.find((sub) => sub.id === stored)?.id ?? panels[0].id;
}
