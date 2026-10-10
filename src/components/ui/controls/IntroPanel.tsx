import { memo, useCallback, useId, useState } from 'react';
import DOMPurify from 'dompurify';
import type { Trait } from '../../../types/traits';
import { Button } from './Button';
import { getTraitColorStyle } from '@/utils/traitColors';
import { fill, labels } from '@/content';
import type { ButtonSchema } from '@/types/controls';

import './IntroPanel.css';

/** IntroPanel's own props: the content layer's intro block reshaped to the loreLabel/
 *  loreDescription/humanDescription names this primitive always had — see introProps() in
 *  src/content (docs/specs/CONTENT_LAYER.md). All optional below: an absent part isn't rendered. */
export type IntroContent = { loreLabel: string; loreDescription: string; humanDescription: string };

interface IntroPanelProps extends Partial<IntroContent> {
    trait?: Trait;
    /** An expander, not an accordion (Crawford, 2026-10-10; docs/specs/LAYOUT_REWORK.md §1.3): the
     *  headline always shows, and a More / Less button beside it reveals or folds the descriptions in
     *  place. Starts collapsed. Without it the whole intro shows, as it always has. */
    collapsible?: boolean;
    /** The intro's concept name (its entry's human label), which names the More / Less button apart
     *  from any other on the screen. */
    name?: string;
}

// One id for both faces, so the button keeps its CabinetBox (and its timeline key) as it flips.
const MORE_SCHEMA: ButtonSchema = { id: 'intro.toggle', type: 'button', ...labels('ui.intro.more') };
const LESS_SCHEMA: ButtonSchema = { id: 'intro.toggle', type: 'button', ...labels('ui.intro.less') };

function IntroPanelInner({ loreLabel, loreDescription, humanDescription, trait = 'header', collapsible = false, name }: IntroPanelProps) {
    const [expanded, setExpanded] = useState(false);
    const toggle = useCallback(() => setExpanded((open) => !open), []);
    const bodyId = useId();

    const sanitizedLoreDescription = loreDescription && DOMPurify.sanitize(loreDescription);

    const loreDescriptionHTML = sanitizedLoreDescription && (
        <div className="sc-intro-panel__content lore" dangerouslySetInnerHTML={{ __html: sanitizedLoreDescription }} />
    );

    const sanitizedHumanDescription = humanDescription && DOMPurify.sanitize(humanDescription);

    const humanDescriptionHTML = sanitizedHumanDescription && (
        <div className="sc-intro-panel__content human" dangerouslySetInnerHTML={{ __html: sanitizedHumanDescription }} />
    );

    const headline = loreLabel && <h2 className='loreLabel'>{loreLabel}</h2>;

    // Nothing to fold away: a plain panel, no button.
    if (!collapsible || (!loreDescriptionHTML && !humanDescriptionHTML)) {
        return (
            <div className='sc-intro-panel' style={getTraitColorStyle(trait)}>
                {headline}
                {loreDescriptionHTML}
                {humanDescriptionHTML}
            </div>
        );
    }

    const schema = expanded ? LESS_SCHEMA : MORE_SCHEMA;
    const buttonName = name ? fill(expanded ? 'ui.intro.less' : 'ui.intro.more', { name }) : undefined;
    return (
        <div className='sc-intro-panel sc-intro-panel--collapsible' style={getTraitColorStyle(trait)}>
            {headline}
            <div className='sc-intro-panel__toggle'>
                <Button schema={schema} face="single" onClick={toggle} expanded={expanded} controls={bodyId} accessibleName={buttonName} />
            </div>
            <div id={bodyId} className='sc-intro-panel__body' hidden={!expanded}>
                {loreDescriptionHTML}
                {humanDescriptionHTML}
            </div>
        </div>
    );
}

export const IntroPanel = memo(IntroPanelInner);
