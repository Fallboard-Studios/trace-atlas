import type { CSSProperties, ReactNode } from 'react';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { IntroPanel, type IntroContent } from '@/components/ui/controls/IntroPanel';
import { ROBOT_SECTIONS_CONFIG, type RobotOptionsTrait } from '@/data/robotSubsectionConfig';
import type { RobotSection, RobotSubsection } from '@/stores/uiStore';
import type { AccordionSchema } from '@/types/controls';

// Which accordion-bearing subsections open with their own intro block, ahead of the
// existing controls — Core/Companion/Accent Oscillator (Source's 3 layer slots)
// aren't in this set; only Source's own wrapping accordion (below) intros Source itself.
const SUBSECTIONS_WITH_INTRO = new Set<RobotSubsection>(['audioSettings', 'rhythm', 'pingContour']);

/** One entry per subsection in SUBSECTIONS_WITH_INTRO above (docs/reference/
 *  text-content-tables.md's content pass). */
const SUBSECTION_INTRO: Partial<Record<RobotSubsection, IntroContent>> = {
  audioSettings: {
    loreLabel: 'Levels — this probe’s signal strength.',
    loreDescription: 'Fine-tune how loudly this probe transmits, or silence it from the mesh entirely.',
    humanDescription: 'Monitor Mode lets you Mute, Solo, or Highlight this probe for quick comparison against the rest of the fleet — Auto leaves it playing normally. Volume sets how loud this probe’s own melody plays.',
  },
  rhythm: {
    loreLabel: 'Composition — how this probe builds its melody.',
    loreDescription: 'Each probe draws its own melody from a curated set of notes, shaped by the settings below.',
    humanDescription: '<p><strong>Rhythm</strong>: Note Density controls how many notes play versus rest. Phrase Length sets how many notes repeat together as one phrase before moving on. Pitch Repeat Chance controls how likely a repeated phrase is to reuse the same pitches instead of picking new ones.</p>'
      + '<p><strong>Pitches</strong>: Note Variance controls how far notes can wander from the probe’s core pitch set. Lowest/Highest Octave set the pitch range notes are drawn from.</p>',
  },
  pingContour: {
    loreLabel: 'Envelope — the shape of a single note.',
    loreDescription: 'Every ping this probe emits rises, holds, and fades in its own signature shape.',
    humanDescription: 'An ADSR envelope shapes the volume of every note this probe plays, over its lifetime. Attack Time: how quickly a note reaches full volume. Decay Time: how quickly it settles from that peak down to its sustained level. Sustain Level: the volume it holds at while a note continues. Release Time: how quickly it fades out once the note ends.',
  },
};

const SOURCE_INTRO: IntroContent = {
  loreLabel: 'Source — the raw signal, layered three ways.',
  loreDescription: 'Three synchronized oscillators, each contributing its own layer to this probe’s core signature.',
  humanDescription: 'A probe’s sound comes from 3 oscillator layers mixed together — Core, Companion, and Accent — each with identical controls. Type picks the layer’s waveform shape. Gain sets how loud that layer is in the mix — turn it down to 0 to effectively mute it. Detune shifts its pitch slightly, in cents, for a thicker or more dissonant blend. Phase offsets where in its own wave cycle the layer starts. Interval (Pulse-type layers only) narrows or widens the pulse itself.',
};

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
                      loreLabel={SUBSECTION_INTRO[sub.id]!.loreLabel}
                      loreDescription={SUBSECTION_INTRO[sub.id]!.loreDescription}
                      humanDescription={SUBSECTION_INTRO[sub.id]!.humanDescription}
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
                  loreLabel={SOURCE_INTRO.loreLabel}
                  loreDescription={SOURCE_INTRO.loreDescription}
                  humanDescription={SOURCE_INTRO.humanDescription}
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
