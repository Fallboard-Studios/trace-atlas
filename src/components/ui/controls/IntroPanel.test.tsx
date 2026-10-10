import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { IntroPanel } from './IntroPanel';
import { CONTENT, fill } from '@/content';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// Crawford, 2026-10-10 (docs/specs/LAYOUT_REWORK.md §1.3 amended): the intros come back on every section
// tab, and a collapsible intro is an expander, not an accordion — the headline always shows, and a
// "More" button beside it reveals the descriptions in place.

const INTRO = {
  loreLabel: 'EQ & Filters — shape the signal every probe shares.',
  loreDescription: 'The mesh carries every probe’s signal.',
  humanDescription: '<p>Three filters.</p>',
};
const MORE = CONTENT['ui.intro.more'].human;
const LESS = CONTENT['ui.intro.less'].human;
const moreName = (name: string) => fill('ui.intro.more', { name });
const lessName = (name: string) => fill('ui.intro.less', { name });

describe('IntroPanel — not collapsible (the default, unchanged)', () => {
  it('shows the headline and both descriptions, and no button', () => {
    const { container } = render(<IntroPanel {...INTRO} />);
    expect(screen.getByText(INTRO.loreLabel)).toBeTruthy();
    expect(screen.getByText('The mesh carries every probe’s signal.')).toBeTruthy();
    expect(screen.getByText('Three filters.')).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('IntroPanel — collapsible: the headline and a More button', () => {
  const renderCollapsible = () => render(<IntroPanel {...INTRO} name="EQ & Filters" collapsible />);
  const toggle = () => screen.getByRole('button');

  it('starts collapsed: the headline shows, the descriptions are hidden', () => {
    const { container } = renderCollapsible();
    expect(screen.getByText(INTRO.loreLabel)).toBeTruthy();
    const body = container.querySelector('.sc-intro-panel__body') as HTMLElement;
    expect(body.hidden).toBe(true);
    expect(within(body).getByText('Three filters.')).toBeTruthy();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe(body.id);
  });

  it('the button reads More, named for its intro, and is a cabinet Button', () => {
    renderCollapsible();
    expect(toggle().textContent).toBe(MORE);
    expect(toggle().getAttribute('aria-label')).toBe(moreName('EQ & Filters'));
    expect(toggle().classList.contains('sc-button')).toBe(true);
    expect(toggle().querySelector('.sc-cabinet-box')).not.toBeNull();
  });

  it('pressing it reveals the descriptions and turns it to Less; pressing again folds them', () => {
    const { container } = renderCollapsible();
    const body = container.querySelector('.sc-intro-panel__body') as HTMLElement;
    fireEvent.click(toggle());
    expect(body.hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().textContent).toBe(LESS);
    expect(toggle().getAttribute('aria-label')).toBe(lessName('EQ & Filters'));
    fireEvent.click(toggle());
    expect(body.hidden).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('the headline stays visible in both states', () => {
    renderCollapsible();
    fireEvent.click(toggle());
    expect(screen.getByText(INTRO.loreLabel)).toBeTruthy();
    fireEvent.click(toggle());
    expect(screen.getByText(INTRO.loreLabel)).toBeTruthy();
  });

  it('with nothing to expand it shows no button', () => {
    const { container } = render(<IntroPanel loreLabel={INTRO.loreLabel} name="EQ & Filters" collapsible />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('.sc-intro-panel__body')).toBeNull();
  });

  it('two on one page control their own bodies', () => {
    const { container } = render(
      <>
        <IntroPanel {...INTRO} name="Fleet Params" collapsible />
        <IntroPanel {...INTRO} name="EQ & Filters" collapsible />
      </>,
    );
    const bodies = [...container.querySelectorAll<HTMLElement>('.sc-intro-panel__body')];
    expect(new Set(bodies.map((b) => b.id)).size).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: moreName('EQ & Filters') }));
    expect(bodies.map((b) => b.hidden)).toEqual([true, false]);
  });

  it('without a name the button is named by its face', () => {
    render(<IntroPanel {...INTRO} collapsible />);
    expect(toggle().getAttribute('aria-label')).toBe(MORE);
  });
});

describe('IntroPanel.css — the expander layout', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'IntroPanel.css'), 'utf-8');

  it('puts the headline and the button on one row, the body under both', () => {
    const body = getCssRuleBody(css, '.sc-intro-panel--collapsible');
    expect(body).toContain('display: grid;');
    expect(body).toMatch(/grid-template-areas:\s*"head toggle"\s*"body body";/);
  });

  // Crawford, 2026-10-10 (option a): beside a 70 px button the phone's headline wrapped to 135–270 px. On
  // the phone shell the headline takes the full width at a smaller size, and the button gets its own line.
  describe('on the phone shell', () => {
    const PHONE = "#screen-viewport[data-shell='phone'] .sc-intro-panel--collapsible";

    it('stacks headline, button, body, one column', () => {
      const body = getCssRuleBody(css, PHONE);
      expect(body).not.toBeNull();
      expect(body).toContain('grid-template-columns: minmax(0, 1fr);');
      expect(body).toMatch(/grid-template-areas:\s*"head"\s*"toggle"\s*"body";/);
    });

    it('sets the headline smaller than the desk h2', () => {
      expect(getCssRuleBody(css, `${PHONE} > .loreLabel`)).toContain('font-size: var(--font-size-heading-sm);');
    });

    it('gives the text more of the pane: tighter margin and padding than the desk\'s 16 px', () => {
      const body = getCssRuleBody(css, PHONE);
      expect(body).toContain('margin: 8px 0;');
      expect(body).toContain('padding: 12px;');
    });

    it('the desk rule does not carry the phone\'s headline size', () => {
      expect(getCssRuleBody(css, '.sc-intro-panel--collapsible > .loreLabel')).not.toContain('font-size');
    });
  });
});
