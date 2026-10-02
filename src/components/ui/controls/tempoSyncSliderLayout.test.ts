import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// docs/specs/FREE_SYNC_TOGGLE.md §1.4. jsdom computes no layout, so the row's sizing contract is
// pinned at the source, the same way accentGradientFill.test.ts pins its fills.
//
// The bug this guards (found live in Chrome, 2026-10-03): Toggle.css gives `.sc-toggle`
// `width: 100%` and `container-type: inline-size`. Dropped into the flex row beside the slider, that
// 100% flex-basis claimed the whole row, and because the slider's own root is also a size container
// (no intrinsic width), the slider wrapper measured 0px at every container width — the voxel track
// spilled out of it at its 156px three-box floor with the toggle painted over the top, while the Drift
// sliders beneath the same row measured the full width.

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'TempoSyncSlider.css'), 'utf-8');

describe('TempoSyncSlider.css row layout', () => {
  it("sizes the Toggle to its own content instead of Toggle.css's width: 100%", () => {
    const body = getCssRuleBody(cssSource, '.sc-tempo-sync > .sc-toggle');
    expect(body).not.toBeNull();
    expect(body).toContain('width: auto;');
    expect(body).toContain('flex: 0 0 auto;');
  });

  it("drops the Toggle's size containment here — a shrink-to-fit flex item under inline-size containment collapses to 0px", () => {
    const body = getCssRuleBody(cssSource, '.sc-tempo-sync > .sc-toggle');
    expect(body).toContain('container-type: normal;');
  });

  it('gives the slider wrapper every pixel the Toggle leaves, and lets it shrink below its content', () => {
    const body = getCssRuleBody(cssSource, '.sc-tempo-sync__slider');
    expect(body).not.toBeNull();
    expect(body).toContain('flex: 1 1 0;');
    expect(body).toContain('min-width: 0;');
  });
});

// A control whose content changes holds the size of its LARGEST content (Crawford, 2026-10-03).
// Measured live before this: the facade was 72.8px as "Float" and 111.3px as "Anchored", so flipping
// the switch resized it and shifted the slider beside it. The fix stacks the current word and both
// sizers (the two words, from data attributes) in ONE grid cell: the cell is as wide as the widest,
// and the sizers are invisible and take no height.
describe('TempoSyncSlider.css facade sizing', () => {
  it('stacks everything in a single grid cell, so the box is as wide as the widest word', () => {
    const mode = getCssRuleBody(cssSource, '.sc-tempo-sync__mode');
    expect(mode).not.toBeNull();
    expect(mode).toContain('display: inline-grid;');
    const current = getCssRuleBody(cssSource, '.sc-tempo-sync__mode-current');
    expect(current).not.toBeNull();
    expect(current).toContain('grid-area: 1 / 1;');
  });

  it.each(['::before', '::after'])('%s is an invisible, heightless sizer in the same cell', (pseudo) => {
    // One shared rule for both pseudo-elements (getCssRuleBody resolves either selector to it).
    const body = getCssRuleBody(cssSource, `.sc-tempo-sync__mode${pseudo}`);
    expect(body, `${pseudo} rule`).not.toBeNull();
    expect(body).toContain('grid-area: 1 / 1;');
    expect(body).toContain('visibility: hidden;');
    expect(body).toContain('height: 0;');
  });

  it.each([
    ['::before', 'data-free-word'],
    ['::after', 'data-sync-word'],
  ])('%s sizes to the %s attribute — a different word on each, so the cell fits both', (pseudo, attribute) => {
    const rule = new RegExp(`\\.sc-tempo-sync__mode${pseudo}\\s*\\{[^}]*content:\\s*attr\\(${attribute}\\);`);
    expect(cssSource.replace(/\r\n/g, '\n')).toMatch(rule);
  });
});
