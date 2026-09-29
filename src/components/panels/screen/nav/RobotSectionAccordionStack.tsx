import type { CSSProperties, ReactNode } from 'react';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { ROBOT_SECTIONS_CONFIG, type RobotOptionsTrait } from '@/data/robotSubsectionConfig';
import type { RobotSection, RobotSubsection } from '@/stores/uiStore';
import type { AccordionSchema } from '@/types/controls';

const PLACEHOLDER_LORE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.';
const PLACEHOLDER_HUMAN = 'Placeholder copy — real lore/human descriptions land in a later pass.';

// Which accordion-bearing subsections open with their own intro block, ahead of the
// existing controls — Baseline/Coaxial/Harmonic Oscillator (Source's 3 layer slots)
// aren't in this set; only Source's own wrapping accordion (below) intros Source itself.
const SUBSECTIONS_WITH_INTRO = new Set<RobotSubsection>(['audioSettings', 'rhythm', 'pingContour', 'probeDrift']);

export interface RobotSectionAccordionStackProps {
  /** e.g. `probes.${robot.id}`, `probes.all`, `companies.${id}` — every id this stack renders is
   *  built from this plus ROBOT_SECTIONS_CONFIG's own section/subsection ids. */
  prefix: string;
  isOpen: (id: string) => boolean;
  setOpen: (id: string, open: boolean) => void;
  /** Lazy-mount gate (useSectionObserver) — a subsection's renderSubsection() result is only
   *  rendered once its id has approached. */
  hasApproached: (id: string) => boolean;
  sectionAnchorRef: (id: string) => (el: HTMLDivElement | null) => void;
  /** Resolves an accordion's style from its owning section's trait — RobotOptionsTab passes a
   *  fixed per-trait style, CompanyOptionsSection's own active/disabled variant. Narrower than the
   *  app-wide Trait type — RobotOptionsTrait is exactly the 4 values ROBOT_SECTIONS_CONFIG can
   *  produce, so a caller's own Record<RobotOptionsTrait, ...> mapping is compiler-enforced
   *  exhaustive rather than needing a silent default case. */
  resolveStyle: (trait: RobotOptionsTrait) => CSSProperties;
  renderSubsection: (subsectionId: RobotSubsection, sectionId: RobotSection) => ReactNode;
}

/**
 * Shared shell for the Probes/Companies stacked-accordion view (docs/specs/
 * ROBOT_SECTION_CONFIG_CONSOLIDATION.md) — both RobotOptionsTab.tsx (robot mode) and
 * CompanyOptionsSection.tsx (company/All-Probes broadcast mode) render through this instead of
 * each hand-authoring the same accordion/anchor/nesting shell. Renders ROBOT_SECTIONS_CONFIG
 * directly: a section with its own wrapping accordion (`ownAccordionLabel` set — only 'source'
 * today) nests its subsections' own accordions inside one additional outer AccordionContainer;
 * every other section renders its single accordion-bearing subsection with no section-level
 * wrapping accordion at all, matching today's shipped shape exactly (spec §1.3). Callers own all
 * value/handler/disabled-state logic — this component only decides which accordions exist, their
 * ids/labels/nesting, and when their content mounts.
 */
export function RobotSectionAccordionStack({
  prefix, isOpen, setOpen, hasApproached, sectionAnchorRef, resolveStyle, renderSubsection,
}: RobotSectionAccordionStackProps) {
  return (
    <>
      {ROBOT_SECTIONS_CONFIG.map((section) => {
        const sectionId = `${prefix}.${section.id}`;
        const style = resolveStyle(section.trait);

        const subsectionAccordions = section.subsections
          .filter((sub) => !sub.mergedInto)
          .map((sub) => {
            const id = `${sectionId}.${sub.id}`;
            const schema: AccordionSchema = { id, type: 'accordion', humanLabel: sub.accordionLabel! };
            return (
              <div key={sub.id} ref={sectionAnchorRef(id)}>
                <AccordionContainer
                  schema={schema}
                  open={isOpen(id)}
                  onOpenChange={(open) => setOpen(id, open)}
                  style={style}
                >
                  {SUBSECTIONS_WITH_INTRO.has(sub.id) && (
                    <IntroPanel
                      loreLabel={`${sub.accordionLabel} LORE TITLE`}
                      loreDescription={PLACEHOLDER_LORE}
                      humanDescription={PLACEHOLDER_HUMAN}
                      trait={section.trait}
                    />
                  )}
                  {hasApproached(id) ? renderSubsection(sub.id, section.id) : null}
                </AccordionContainer>
              </div>
            );
          });

        return (
          <div key={section.id} ref={sectionAnchorRef(sectionId)}>
            {section.ownAccordionLabel ? (
              <AccordionContainer
                schema={{ id: sectionId, type: 'accordion', humanLabel: section.ownAccordionLabel } satisfies AccordionSchema}
                open={isOpen(sectionId)}
                onOpenChange={(open) => setOpen(sectionId, open)}
                style={style}
              >
                <IntroPanel
                  loreLabel={`${section.ownAccordionLabel} LORE TITLE`}
                  loreDescription={PLACEHOLDER_LORE}
                  humanDescription={PLACEHOLDER_HUMAN}
                  trait={section.trait}
                />
                {subsectionAccordions}
              </AccordionContainer>
            ) : subsectionAccordions}
          </div>
        );
      })}
    </>
  );
}
