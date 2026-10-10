import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// docs/tasks/LAYOUT_REWORK.md Task 13. jsdom computes no layout, so the single-line face is pinned at the
// source, the LfoLink.css.test.ts way: the option's label never wraps, it keeps the human label's face, and
// nothing in this file turns an option box into a content-sized one.

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'RadioButton.css'), 'utf-8');

describe('RadioButton.css — the single-line option label', () => {
  it('sets the label on one line, in the human label\'s face, fixed white', () => {
    const body = getCssRuleBody(cssSource, '.sc-radio-button__label');
    expect(body).not.toBeNull();
    expect(body).toContain('white-space: nowrap;');
    expect(body).toContain('font-family: var(--font-mono);');
    expect(body).toContain('font-size: var(--font-size-label);');
    expect(body).toContain('color: var(--color-text-primary-fixed);');
  });

  // A company name is user-typed, up to 128 characters (companyConfig.ts). On one line it cannot wrap, so
  // without a cap it ran 627 px past the control at 375 px in Chrome and scrolled the page sideways. Each
  // link in the chain (item → cabinet box → front face, border-box so its padding counts → label) is
  // capped at its container and the label ends in an ellipsis; the radio's accessible name stays the full
  // name. Each link was removed one at a time in Chrome at 375 px: without any one of them the option ran
  // 14–627 px past the control and the page scrolled sideways.
  it('caps a too-long option at the control\'s width and ends its label in an ellipsis', () => {
    const label = getCssRuleBody(cssSource, '.sc-radio-button__label');
    expect(label).toContain('overflow: hidden;');
    expect(label).toContain('text-overflow: ellipsis;');
    expect(getCssRuleBody(cssSource, '.sc-radio-button__item')).toContain('max-width: 100%;');
    expect(getCssRuleBody(cssSource, '.sc-radio-button__item .sc-cabinet-box')).toContain('max-width: 100%;');
    const front = getCssRuleBody(cssSource, '.sc-radio-button__root .sc-cabinet-box__front');
    expect(front).toContain('max-width: 100%;');
    expect(front).toContain('box-sizing: border-box;');
  });

  it('opts the selected option\'s label back into the dynamic text colour over its tinted face', () => {
    const body = getCssRuleBody(cssSource, ".sc-radio-button__item[data-state='on'] .sc-radio-button__label");
    expect(body).not.toBeNull();
    expect(body).toContain('color: var(--color-text-primary);');
  });

  it('shrinks the label in a cramped control, as DualLabel\'s compact fallback did for the old face', () => {
    const body = getCssRuleBody(cssSource, '@container sc-control (max-width: 120px)');
    expect(body).not.toBeNull();
    expect(body).toContain('.sc-radio-button__label');
    expect(body).toContain('font-size: var(--font-size-label-compact);');
  });

  // Crawford, 2026-10-10: the lore name is back on the face, small above the label, in DualLabel's lore
  // face; both lines stay single lines and stop at the control's width.
  it('stacks the face\'s two lines, lore over label, and lets the face shrink to the cap', () => {
    const face = getCssRuleBody(cssSource, '.sc-radio-button__face');
    expect(face).not.toBeNull();
    expect(face).toContain('display: flex;');
    expect(face).toContain('flex-direction: column;');
    expect(face).toContain('max-width: 100%;');
  });

  it('sets the lore line in DualLabel\'s lore face, on one line, ending in an ellipsis', () => {
    const lore = getCssRuleBody(cssSource, '.sc-radio-button__lore');
    expect(lore).not.toBeNull();
    for (const decl of [
      'font-family: var(--font-controls);', 'font-size: var(--font-size-label-lore);', 'text-transform: uppercase;',
      'color: var(--color-text-muted);', 'white-space: nowrap;', 'overflow: hidden;', 'text-overflow: ellipsis;',
    ]) expect(lore).toContain(decl);
  });

  it('shrinks the lore line too in a cramped control', () => {
    expect(getCssRuleBody(cssSource, '@container sc-control (max-width: 120px)')).toContain('.sc-radio-button__lore');
  });

  it('no rule reaches into a DualLabel inside an option any more', () => {
    expect(cssSource.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\.sc-radio-button__item[^{}]*\.sc-dual-label/);
  });

  it('never overrides the front face\'s height — every option box stays one cabinet row', () => {
    const body = getCssRuleBody(cssSource, '.sc-radio-button__root .sc-cabinet-box__front');
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/height\s*:/);
  });
});
