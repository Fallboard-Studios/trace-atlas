import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// Mobile Deck Camera (spec §1.1, assumptions 1, 11): the scroller is the one thing in the Deck
// that pans. jsdom computes no layout, so the scroll-snap/overflow/overscroll contract is pinned
// at the source, the OceanScene.css.test.ts way.

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'WorldView.css'), 'utf-8');

describe('WorldView.css — the scroller', () => {
  it('fills .world-view and scrolls horizontally only, with a contained overscroll', () => {
    const body = getCssRuleBody(cssSource, '.world-view__scroller');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toContain('inset: 0;');
    expect(body).toContain('overflow-x: auto;');
    expect(body).toContain('overflow-y: hidden;');
    expect(body).not.toMatch(/scroll-snap/);
    expect(body).toContain('overscroll-behavior-x: contain;');
    expect(body).toContain('scrollbar-width: none;');
  });

  // Deck scroller compositing, Gate 2 (docs/tasks/DECK_SCROLLER_COMPOSITING.md): below DPR 1.5 on a desktop Chrome does
  // not composite the scroller, so every camera pan re-rastered the shell layer. A composited scroller pans on the
  // compositor instead. `contain: paint` was measured and did nothing, so it is not here.
  it('is a composited scroller (will-change: scroll-position), so a camera pan does not re-raster the shell', () => {
    const body = getCssRuleBody(cssSource, '.world-view__scroller');
    expect(body).toContain('will-change: scroll-position;');
    expect(body).not.toMatch(/contain:/);
  });

  it('hides the webkit scrollbar too — the world is not a document', () => {
    const body = getCssRuleBody(cssSource, '.world-view__scroller::-webkit-scrollbar');
    expect(body).not.toBeNull();
    expect(body).toContain('display: none;');
  });

  it('leaves .world-view itself as the non-scrolling outer box (overflow: hidden, no scroll-snap)', () => {
    const body = getCssRuleBody(cssSource, '.world-view');
    expect(body).not.toBeNull();
    expect(body).toContain('overflow: hidden;');
    expect(body).not.toContain('overflow-x');
    expect(body).not.toMatch(/scroll-snap/);
  });
});
