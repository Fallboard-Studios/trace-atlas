/**
 * Canonical section/subsection shape for a robot/company's Levels/Composition/Envelope/Source
 * stacked view (docs/specs/archive/ROBOT_SECTION_CONFIG_CONSOLIDATION.md) — one source of truth for
 * RobotScreen.tsx and CompanyScreen.tsx (their section tabs, docs/tasks/LAYOUT_REWORK.md Tasks 16 and 23)
 * and the breadcrumb (navActions.ts), which
 * otherwise each hand-duplicate the exact same id/label/trait table and risk
 * drifting apart (e.g. a future label rename landing in only one of the several places it used to
 * be typed out).
 *
 * Every literal id/label/trait below is transcribed from current shipped source, not invented —
 * see docs/specs/archive/ROBOT_SECTION_CONFIG_CONSOLIDATION.md §1.3/§2 for the citations this was checked
 * against.
 */
import type { RobotSection, RobotSubsection } from '@/stores/uiStore';
import type { Trait } from '@/types/traits';
import type { ContentKey } from '@/content';

export interface RobotSubsectionEntry {
  id: RobotSubsection;
  /** The sub-tab's name, a content key (docs/specs/CONTENT_LAYOUT.md §1.3), e.g. 'busFilter' reads
   *  probe.source.filter ("Filter"). */
  content: ContentKey;
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
  /** The tab's name, a content key (docs/specs/CONTENT_LAYOUT.md §1.3), e.g. 'volume' reads probe.levels. */
  content: ContentKey;
  trait: RobotOptionsTrait;
  subsections: RobotSubsectionEntry[];
}

/** Render order, for the robot and company screens' tabs (RobotScreen.tsx, CompanyScreen.tsx) — one
 *  array, both consumers iterate it directly instead of each hand-declaring their own order. Every section
 *  shows its subsections as a sub-tab row, the first open by default (docs/specs/CONTENT_LAYOUT.md §1.3). */
export const ROBOT_SECTIONS_CONFIG: RobotSectionEntry[] = [
  {
    id: 'volume', content: 'probe.levels', trait: 'output',
    subsections: [
      { id: 'mix', content: 'probe.levels.mix' },
      { id: 'sends', content: 'probe.levels.sends' },
    ],
  },
  {
    id: 'melody', content: 'probe.composition', trait: 'composition',
    subsections: [
      { id: 'rhythmMelody', content: 'probe.composition.rhythmMelody' },
      { id: 'details', content: 'probe.composition.details' },
    ],
  },
  {
    id: 'envelope', content: 'probe.envelope', trait: 'timeSpace',
    subsections: [
      { id: 'envelopeContour', content: 'probe.envelope.contour' },
      { id: 'envelopeCharacter', content: 'probe.envelope.character' },
    ],
  },
  {
    id: 'source', content: 'probe.source', trait: 'spectral',
    subsections: [
      { id: 'baselineOscillator', content: 'probe.source.core' },
      { id: 'coaxialOscillator', content: 'probe.source.companion' },
      { id: 'harmonicOscillator', content: 'probe.source.accent' },
      // Not an oscillator layer: the robot's bus filter, after the three layers mix (docs/specs/ROBOT_ARTICULATION.md §1.6).
      { id: 'busFilter', content: 'probe.source.filter' },
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

/** The open section: the stored one, else Source. */
export function activeRobotSection(stored: RobotSection | null): RobotSection {
  return stored ?? DEFAULT_ROBOT_SECTION;
}

/** The sub-tab a section shows: the stored one when it is one of this section's, else its first —
 *  SectionTabs' own stale-value rule. */
export function activeRobotSubsection(sectionId: RobotSection, stored: RobotSubsection | null): RobotSubsection {
  const { subsections } = ROBOT_SECTIONS_CONFIG.find((s) => s.id === sectionId)!;
  return subsections.find((sub) => sub.id === stored)?.id ?? subsections[0].id;
}
