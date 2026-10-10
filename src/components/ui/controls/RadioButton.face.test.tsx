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

// Crawford, 2026-10-10 (spec §1.4 amended): an option with a lore name shows it again, small above its
// human label inside the same box (the face options had before Task 13); one without stays one line.
describe('RadioButton — the option face: lore above human when the option has one', () => {
  it('an option with a loreLabel shows two lines, lore first, inside its box', () => {
    render(<RadioButton schema={schema} value="natural" onChange={() => {}} />);
    const radio = screen.getByRole('radio', { name: 'Natural Decay' });
    const face = radio.querySelector('.sc-radio-button__face')!;
    expect([...face.children].map((line) => [line.className, line.textContent])).toEqual([
      ['sc-radio-button__lore', 'Dissipation'],
      ['sc-radio-button__label', 'Natural Decay'],
    ]);
  });

  it('an option without one shows its human label alone, one line', () => {
    render(<RadioButton schema={schema} value="natural" onChange={() => {}} />);
    const radio = screen.getByRole('radio', { name: 'Controlled Decay' });
    expect(radio.querySelector('.sc-radio-button__lore')).toBeNull();
    expect(radio.querySelectorAll('.sc-radio-button__label')).toHaveLength(1);
    expect(radio.textContent).toBe('Controlled Decay');
  });

  it('the accessible name stays the human label alone, lore or not', () => {
    render(<RadioButton schema={schema} value="natural" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Natural Decay' }).getAttribute('aria-label')).toBe('Natural Decay');
  });

  it('draws the face itself, never a DualLabel (no help "?" can land inside an option)', () => {
    render(<RadioButton schema={schema} value="natural" onChange={() => {}} />);
    for (const radio of screen.getAllByRole('radio')) expect(radio.querySelector('.sc-dual-label')).toBeNull();
  });

  it('an empty loreLabel counts as none', () => {
    const blank: RadioButtonSchema = { ...schema, options: [{ value: 'natural', humanLabel: 'Natural Decay', loreLabel: '' }] };
    render(<RadioButton schema={blank} value="natural" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Natural Decay' }).querySelector('.sc-radio-button__lore')).toBeNull();
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
