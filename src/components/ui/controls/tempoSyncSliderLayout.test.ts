import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// docs/specs/FREE_SYNC_TOGGLE.md §1.4. jsdom computes no layout, so the layout contract is pinned at
// the source, the same way accentGradientFill.test.ts pins its fills.
//
// The toggle sits in its own row UNDER the slider it affects (Crawford, 2026-10-03), so the slider has
// the whole width like every other slider in the panel. History worth keeping: placed BESIDE the slider,
// the toggle's `width: 100%` (Toggle.css) claimed the whole flex row and the slider wrapper measured 0px
// at every container width — found live in Chrome. Stacked, that cannot recur, but the slider wrapper
// must still not be a `flex: 1 1 0` item: in a COLUMN that basis is the HEIGHT axis and collapses the
// slider to nothing (DirectionalPanel.css documents the same trap).

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'TempoSyncSlider.css'), 'utf-8');

describe('TempoSyncSlider.css layout', () => {
  it('stacks the slider and its toggle in a column, the toggle left-aligned under the slider', () => {
    const body = getCssRuleBody(cssSource, '.sc-tempo-sync');
    expect(body).not.toBeNull();
    expect(body).toContain('display: flex;');
    expect(body).toContain('flex-direction: column;');
    expect(body).toContain('align-items: flex-start;');
    expect(body).toMatch(/gap:\s*\d+px;/);
  });

  it('gives the slider wrapper the full width of the column, and lets it shrink below its content', () => {
    const body = getCssRuleBody(cssSource, '.sc-tempo-sync__slider');
    expect(body).not.toBeNull();
    expect(body).toContain('align-self: stretch;');
    expect(body).toContain('min-width: 0;');
  });

  it('does NOT use a zero flex-basis on the slider wrapper — in a column that collapses its height', () => {
    const body = getCssRuleBody(cssSource, '.sc-tempo-sync__slider');
    expect(body).not.toMatch(/flex:\s*1 1 0/);
    expect(body).not.toContain('flex-basis: 0');
  });
});
