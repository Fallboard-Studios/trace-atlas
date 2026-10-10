import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RadioButton } from './RadioButton';
import { CABINET_BOX_HEIGHT, CABINET_BREAKPOINT_MOBILE_MAX, CABINET_BREAKPOINT_TABLET_MAX, type CabinetTier } from '@/utils/cabinetBreakpoints';
import type { RadioButtonSchema } from '@/types/controls';

// docs/tasks/LAYOUT_REWORK.md Task 13 (spec §1.4): each option is one line of its human label, and the
// lore names live on the control's own label row, whose "?" opens the help popover. The real CabinetBox
// renders here (RadioButton.test.tsx mocks it), so the face and the row height are the shipped ones.

const schema: RadioButtonSchema = {
  id: 'decayMode',
  type: 'radio',
  humanLabel: 'Decay Mode',
  loreLabel: 'Echo Governance',
  help: { human: 'Whether the compressor also evens out the echoes.' },
  options: [
    { value: 'natural', humanLabel: 'Natural Decay', loreLabel: 'Dissipation' },
    { value: 'controlled', humanLabel: 'Controlled Decay' },
  ],
};

/** A matchMedia that evaluates `(min|max-width: Npx)` against a simulated viewport width (useShell.test.ts's
 *  way). Any other query (CabinetBox asks for `prefers-reduced-motion`) does not match. */
function stubViewport(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const m = /\((min|max)-width:\s*(\d+)px\)/.exec(query);
      const n = m ? Number(m[2]) : 0;
      return {
        matches: m ? (m[1] === 'min' ? width >= n : width <= n) : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    },
  });
}

const realMatchMedia = window.matchMedia;
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
});

describe('RadioButton — the single-line option face', () => {
  it('shows each option as one line of its humanLabel, with no DualLabel inside the box', () => {
    render(<RadioButton schema={schema} value="natural" onChange={() => {}} />);
    for (const option of schema.options) {
      const radio = screen.getByRole('radio', { name: option.humanLabel });
      expect(radio.querySelector('.sc-dual-label')).toBeNull();
      const lines = radio.querySelectorAll('.sc-radio-button__label');
      expect(lines).toHaveLength(1);
      expect(lines[0].textContent).toBe(option.humanLabel);
      expect(radio.textContent).toBe(option.humanLabel);
    }
  });

  it('never shows an option\'s loreLabel', () => {
    render(<RadioButton schema={schema} value="controlled" onChange={() => {}} />);
    expect(screen.queryByText('Dissipation')).toBeNull();
  });

  it('keeps the control\'s own label row: its lore, its human name, and the one help "?" outside every option', () => {
    const { container } = render(<RadioButton schema={schema} value="natural" onChange={() => {}} />);
    const labelRow = container.querySelector('.sc-radio-button > .sc-dual-label');
    expect(labelRow?.textContent).toContain('Echo Governance');
    expect(labelRow?.textContent).toContain('Decay Mode');

    const helps = container.querySelectorAll('.sc-help__trigger');
    expect(helps).toHaveLength(1);
    expect(labelRow?.contains(helps[0])).toBe(true);
    for (const radio of screen.getAllByRole('radio')) expect(radio.contains(helps[0])).toBe(false);
  });

  it('a control without help has no "?" at all', () => {
    const { container } = render(<RadioButton schema={{ ...schema, help: undefined }} value="natural" onChange={() => {}} />);
    expect(container.querySelector('.sc-help__trigger')).toBeNull();
  });
});

describe('RadioButton — every option box is one cabinet row at its tier', () => {
  const TIERS: [CabinetTier, number][] = [
    ['mobile', CABINET_BREAKPOINT_MOBILE_MAX],
    ['tablet', CABINET_BREAKPOINT_TABLET_MAX],
    ['desktop', CABINET_BREAKPOINT_TABLET_MAX + 1],
  ];

  it.each(TIERS)('%s (viewport %ipx): the tier height with the 44 px touch floor, never a content-sized box', (tier, width) => {
    stubViewport(width);
    const { container } = render(<RadioButton schema={schema} value="natural" onChange={() => {}} />);
    const boxes = container.querySelectorAll<HTMLElement>('.sc-cabinet-box');
    expect(boxes).toHaveLength(schema.options.length);
    for (const box of boxes) {
      expect(box.style.getPropertyValue('--cabinet-box-height')).toBe(`${Math.max(CABINET_BOX_HEIGHT[tier], 44)}px`);
      // A content-sized (autoHeight) box would stretch its left face to 100%; a row-height one pins it.
      expect(box.querySelector<HTMLElement>('.sc-cabinet-box__left-face')?.style.height).toBe(`${CABINET_BOX_HEIGHT[tier]}px`);
      expect(box.querySelector<HTMLElement>('.sc-cabinet-box__front')?.style.height).toBe('');
    }
  });
});
