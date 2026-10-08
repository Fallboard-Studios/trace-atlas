import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// Phase 43 Task 25: the status line's docking and activity words hold their LARGEST label (project
// rule: controls hold their largest content size), so the words after them never shift as the
// lifecycle moves on. Same one-grid-cell technique as ToggleFacade.css — every label is a real
// child, stacked, all but the current one `visibility: hidden`. jsdom computes no layout, so the
// contract is pinned at the source (the ToggleFacade.css.test.ts convention).

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'RobotSelectionCard.css'), 'utf-8');

describe('RobotSelectionCard.css held status words', () => {
  it('a held cell is an inline grid that never wraps, so it is as wide as its widest label', () => {
    const body = getCssRuleBody(cssSource, '.robot-selection-card__held');
    expect(body).not.toBeNull();
    expect(body).toContain('display: inline-grid;');
    expect(body).toContain('white-space: nowrap;');
    // The visible word sits right after the separator before it; the slack trails it.
    expect(body).toContain('justify-items: start;');
  });

  it('stacks every label in the single cell', () => {
    const body = getCssRuleBody(cssSource, '.robot-selection-card__held-word');
    expect(body).not.toBeNull();
    expect(body).toContain('grid-area: 1 / 1;');
  });

  it('hides every label but the current one with visibility, which keeps its size', () => {
    const body = getCssRuleBody(cssSource, '.robot-selection-card__held-word:not([data-current])');
    expect(body).not.toBeNull();
    expect(body).toContain('visibility: hidden;');
    expect(body).not.toMatch(/display:\s*none|overflow/);
  });
});
