import { memo } from 'react';
import DOMPurify from 'dompurify';
import type { Trait } from '../../../types/traits';
import { getTraitColorStyle } from '@/utils/traitColors';

import './IntroPanel.css';

/** The content shape every screen's own intro-copy table (FleetParamsContent.tsx,
 *  SettingsContent.tsx, RobotSectionAccordionStack.tsx) fills in — one shared type instead of
 *  each file re-declaring it, so the 3 fields below can't drift out of sync with IntroPanel's
 *  own props. All 3 are required here, unlike IntroPanelProps' own optional versions below,
 *  since a content-table entry with a missing field is a content bug, not a legal "no intro"
 *  state (that's expressed by not rendering an IntroPanel at all, not by an empty field). */
export interface IntroContent {
    loreLabel: string;
    loreDescription: string;
    humanDescription: string;
}

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
