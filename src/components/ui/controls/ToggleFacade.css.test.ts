import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// A control whose content changes holds the size of its LARGEST content (Crawford, 2026-10-03).
// Measured live before this: the Tempo Sync facade was 72.8px as "Float" and 111.3px as "Anchored",
// and the nav toggle 47.77px as ☰ and 45.98px as ✕. jsdom computes no layout, so the sizing contract
// is pinned at the source (the accentGradientFill.test.ts convention).
//
// Every state's content is a real child, all in ONE grid cell, so the cell is as wide AND as tall as
// the biggest; every state but the current one is merely invisible. History: an earlier version used
// ::before/::after pseudo-element sizers reading data attributes, which could only size plain text —
// and, with `overflow: hidden` on them, counted for nothing at min-content (found live on the nav
// toggle). Real in-flow children have neither limit and size a two-line DualLabel as well as a glyph.

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'ToggleFacade.css'), 'utf-8');

describe('ToggleFacade.css', () => {
  it('is a grid whose content never wraps, so min-content is the full width of the widest state', () => {
    const body = getCssRuleBody(cssSource, '.sc-toggle-facade');
    expect(body).not.toBeNull();
    expect(body).toContain('display: inline-grid;');
    expect(body).toContain('white-space: nowrap;');
  });

  it('stacks every state in the single grid cell, so the box is as big as the biggest', () => {
    const body = getCssRuleBody(cssSource, '.sc-toggle-facade__state');
    expect(body).not.toBeNull();
    expect(body).toContain('grid-area: 1 / 1;');
  });

  it('hides every state but the current one with visibility, which keeps its size in the layout', () => {
    const body = getCssRuleBody(cssSource, '.sc-toggle-facade__state:not([data-current])');
    expect(body).not.toBeNull();
    expect(body).toContain('visibility: hidden;');
  });

  it('never removes or shrinks a hidden state — display: none, height: 0 or overflow would drop its size from the cell', () => {
    for (const selector of ['.sc-toggle-facade__state', '.sc-toggle-facade__state:not([data-current])']) {
      const body = getCssRuleBody(cssSource, selector);
      expect(body, selector).not.toContain('display: none');
      expect(body, selector).not.toMatch(/\bheight:/);
      expect(body, selector).not.toContain('overflow');
    }
  });

  it('no longer uses pseudo-element sizers (they could only size plain text)', () => {
    const source = cssSource.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).not.toContain('::before');
    expect(source).not.toContain('::after');
    expect(source).not.toContain('attr(');
  });
});
