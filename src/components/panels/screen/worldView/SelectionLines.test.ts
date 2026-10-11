import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { nextSelectionOrder, type SelectionIds } from './useSelectionLines';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// docs/tasks/LAYOUT_REWORK.md Task 24 (spec §1.7): the meta box shows a selected robot's line and a
// selected company's line, the latest selection on top. The store holds the two ids but not which was
// picked last, so the order is derived from how they change.

const none: SelectionIds = { robotId: null, companyId: null };

describe('nextSelectionOrder', () => {
  it('is empty with nothing selected', () => {
    expect(nextSelectionOrder([], none, none)).toEqual([]);
  });

  it('a robot picked is the only line', () => {
    expect(nextSelectionOrder([], none, { robotId: 'r1', companyId: null })).toEqual(['robot']);
  });

  it('a company picked is the only line', () => {
    expect(nextSelectionOrder([], none, { robotId: null, companyId: 'c1' })).toEqual(['company']);
  });

  it('a company picked after a robot goes on top', () => {
    expect(nextSelectionOrder(['robot'], { robotId: 'r1', companyId: null }, { robotId: 'r1', companyId: 'c1' })).toEqual(['company', 'robot']);
  });

  it('a robot picked after a company goes on top', () => {
    expect(nextSelectionOrder(['company'], { robotId: null, companyId: 'c1' }, { robotId: 'r1', companyId: 'c1' })).toEqual(['robot', 'company']);
  });

  it('picking a different robot while the company is on top puts the robot back on top', () => {
    expect(nextSelectionOrder(['company', 'robot'], { robotId: 'r1', companyId: 'c1' }, { robotId: 'r2', companyId: 'c1' })).toEqual(['robot', 'company']);
  });

  it('picking a different company while the robot is on top puts the company on top', () => {
    expect(nextSelectionOrder(['robot', 'company'], { robotId: 'r1', companyId: 'c1' }, { robotId: 'r1', companyId: 'c2' })).toEqual(['company', 'robot']);
  });

  it('an unchanged selection keeps its order', () => {
    const sel = { robotId: 'r1', companyId: 'c1' };
    expect(nextSelectionOrder(['company', 'robot'], sel, sel)).toEqual(['company', 'robot']);
    expect(nextSelectionOrder(['robot', 'company'], sel, sel)).toEqual(['robot', 'company']);
  });

  it('clearing one leaves the other', () => {
    expect(nextSelectionOrder(['company', 'robot'], { robotId: 'r1', companyId: 'c1' }, { robotId: null, companyId: 'c1' })).toEqual(['company']);
    expect(nextSelectionOrder(['company', 'robot'], { robotId: 'r1', companyId: 'c1' }, { robotId: 'r1', companyId: null })).toEqual(['robot']);
  });

  it('clearing both empties it', () => {
    expect(nextSelectionOrder(['robot', 'company'], { robotId: 'r1', companyId: 'c1' }, none)).toEqual([]);
  });

  it('both appearing at once (a screen that mounts with both set) puts the robot on top', () => {
    expect(nextSelectionOrder([], none, { robotId: 'r1', companyId: 'c1' })).toEqual(['robot', 'company']);
  });

  it('re-picking after a clear counts as new: the order forgets what was cleared', () => {
    const afterClear = nextSelectionOrder(['company', 'robot'], { robotId: 'r1', companyId: 'c1' }, { robotId: 'r1', companyId: null });
    expect(nextSelectionOrder(afterClear, { robotId: 'r1', companyId: null }, { robotId: 'r1', companyId: 'c1' })).toEqual(['company', 'robot']);
  });

  it('never lists a kind twice', () => {
    expect(nextSelectionOrder(['robot'], { robotId: 'r1', companyId: null }, { robotId: 'r2', companyId: null })).toEqual(['robot']);
  });
});

// The CSS is pinned at the source: jsdom computes no layout.
describe('SelectionLines.css and MetaBox.css — the lines in the well', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)));
  const lineCss = readFileSync(resolve(dir, 'SelectionLines.css'), 'utf8');
  const metaCss = readFileSync(resolve(dir, 'MetaBox.css'), 'utf8');

  it('a line holds one line, cut short with an ellipsis, in its own accent lightened for the dark glass', () => {
    const body = getCssRuleBody(lineCss, '.selection-line');
    for (const d of ['white-space: nowrap;', 'overflow: hidden;', 'text-overflow: ellipsis;', 'max-width: 100%;']) expect(body).toContain(d);
    expect(body).toMatch(/color: color-mix\(in srgb, var\(--color-accent\) \d+%, white\);/);
  });

  it('the caption is the small tracked-out kind label, without the line\'s glow', () => {
    const body = getCssRuleBody(lineCss, '.selection-line__caption');
    expect(body).toContain('text-transform: uppercase;');
    expect(body).toContain('text-shadow: none;');
    expect(body).toContain('var(--font-size-label-compact)');
  });

  it('under the world line a selection line is a block with a hairline in its own colour', () => {
    const body = getCssRuleBody(lineCss, '.meta-box > .selection-line');
    expect(body).toContain('display: block;');
    expect(body).toMatch(/border-top: 1px solid color-mix\(in srgb, var\(--color-accent\) \d+%, transparent\);/);
  });

  it('the world line, now in a block of its own, still holds one line cut short with an ellipsis', () => {
    const body = getCssRuleBody(metaCss, '.meta-box__line');
    for (const d of ['white-space: nowrap;', 'overflow: hidden;', 'text-overflow: ellipsis;']) expect(body).toContain(d);
  });

  it('the phone cycle button is bare: it inherits the well\'s type and fills it', () => {
    const body = getCssRuleBody(lineCss, '.selection-cycle');
    for (const d of ['background: none;', 'border: 0;', 'color: inherit;', 'font: inherit;', 'width: 100%;', 'cursor: pointer;']) expect(body).toContain(d);
  });
});
