import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// A control whose content changes holds the size of its LARGEST content (Crawford, 2026-10-03).
// Measured live before this: the Tempo Sync facade was 72.8px as "Float" and 111.3px as "Anchored",
// and the nav toggle 47.77px as ☰ and 45.98px as ✕. jsdom computes no layout, so the sizing contract
// is pinned at the source (the accentGradientFill.test.ts convention). The current content and two
// invisible sizers (both states' content, read from data attributes) share ONE grid cell, so the cell
// is as wide as the widest of the three; the sizers are never painted and take no height.

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'ToggleFacade.css'), 'utf-8');

describe('ToggleFacade.css', () => {
  it('stacks everything in a single grid cell, so the box is as wide as the widest content', () => {
    const facade = getCssRuleBody(cssSource, '.sc-toggle-facade');
    expect(facade).not.toBeNull();
    expect(facade).toContain('display: inline-grid;');
    const current = getCssRuleBody(cssSource, '.sc-toggle-facade__current');
    expect(current).not.toBeNull();
    expect(current).toContain('grid-area: 1 / 1;');
  });

  it.each(['::before', '::after'])('%s is an invisible, heightless sizer in the same cell', (pseudo) => {
    // One shared rule for both pseudo-elements (getCssRuleBody resolves either selector to it).
    const body = getCssRuleBody(cssSource, `.sc-toggle-facade${pseudo}`);
    expect(body, `${pseudo} rule`).not.toBeNull();
    expect(body).toContain('grid-area: 1 / 1;');
    expect(body).toContain('visibility: hidden;');
    expect(body).toContain('height: 0;');
  });

  // Found live in Chrome on the nav toggle: with `overflow: hidden` on the sizers, a grid item's
  // minimum contribution is 0, so inside Toggle.css's inline-size containment (which resolves the
  // switch to MIN-content) only the current glyph counted — ✕ sized to 17.98px while the hidden ☰
  // sizer measured 19.77px and overflowed its cell. The sizers must count at min-content too, and a
  // multi-word label must not wrap there.
  it('lets the sizers count at min-content: no overflow clipping on them', () => {
    const body = getCssRuleBody(cssSource, '.sc-toggle-facade::before');
    expect(body).not.toContain('overflow');
  });

  it('never wraps its content, so min-content is the full width of the widest state', () => {
    const body = getCssRuleBody(cssSource, '.sc-toggle-facade');
    expect(body).toContain('white-space: nowrap;');
  });

  it.each([
    ['::before', 'data-off'],
    ['::after', 'data-on'],
  ])('%s sizes to the %s attribute — a different state on each, so the cell fits both', (pseudo, attribute) => {
    const rule = new RegExp(`\\.sc-toggle-facade${pseudo}\\s*\\{[^}]*content:\\s*attr\\(${attribute}\\);`);
    expect(cssSource.replace(/\r\n/g, '\n')).toMatch(rule);
  });
});
