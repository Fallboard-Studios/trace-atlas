import { memo } from 'react';
import DOMPurify from 'dompurify';
import type { Trait } from '../../../types/traits';
import { getTraitColorStyle } from '@/utils/traitColors';

import './IntroPanel.css';

interface IntroPanelProps {
    loreLabel?: string;
    loreDescription?: string;
    humanDescription?: string;
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
