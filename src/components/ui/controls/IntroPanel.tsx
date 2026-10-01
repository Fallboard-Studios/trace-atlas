import { memo } from 'react';
import DOMPurify from 'dompurify';
import type { Trait } from '../../../types/traits';
import { getTraitColorStyle } from '@/utils/traitColors';

import './IntroPanel.css';

/** IntroPanel's own props: the content layer's intro block reshaped to the loreLabel/
 *  loreDescription/humanDescription names this primitive always had — see introProps() in
 *  src/content (docs/specs/CONTENT_LAYER.md). All optional below: an absent part isn't rendered. */
export type IntroContent = { loreLabel: string; loreDescription: string; humanDescription: string };

interface IntroPanelProps extends Partial<IntroContent> {
    trait?: Trait;
}

function IntroPanelInner({ loreLabel, loreDescription, humanDescription, trait = 'header' }: IntroPanelProps) {

    const sanitizedLoreDescription = loreDescription && DOMPurify.sanitize(loreDescription);

    const loreDescriptionHTML = sanitizedLoreDescription && (
        <div className="sc-intro-panel__content lore" dangerouslySetInnerHTML={{ __html: sanitizedLoreDescription }} />
    );

    const sanitizedHumanDescription = humanDescription && DOMPurify.sanitize(humanDescription);

    const humanDescriptionHTML = sanitizedHumanDescription && (
        <div className="sc-intro-panel__content human" dangerouslySetInnerHTML={{ __html: sanitizedHumanDescription }} />
    );

    return (
        <div className='sc-intro-panel' style={getTraitColorStyle(trait)}>
            {loreLabel && (
                <h2 className='loreLabel'>{loreLabel}</h2>
            )}
            {loreDescriptionHTML}
            {humanDescriptionHTML}

        </div>
    );
}

export const IntroPanel = memo(IntroPanelInner);
