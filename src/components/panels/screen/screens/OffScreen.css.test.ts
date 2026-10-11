import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import { findFixedWidthsOver } from '@/testUtils/fixedWidths';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 28 (the sketch's `.phone .splash`, `.phone .etch.withsplash`): on the
 * phone shell the label sits higher, the picker is centred and wraps, and the readout wraps onto a second
 * line rather than running past the glass. jsdom computes no layout, so these are pinned at the source, as
 * RadioButton.css.test.ts does. The shell reaches CSS from ScreenViewport's data-shell (useShell), so no
 * media query of its own is needed (spec Assumption 1).
 */
const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(dir, 'OffScreen.css'), 'utf-8');
const PHONE = "#screen-viewport[data-shell='phone']";

describe('OffScreen.css — the phone shell', () => {
  it('lifts the label: the column starts at the top instead of centring, with room above it', () => {
    const body = getCssRuleBody(css, `${PHONE} .off-screen`);
    expect(body).not.toBeNull();
    expect(body).toContain('justify-content: flex-start;');
    expect(body).toMatch(/padding-top:/);
  });

  it('scrolls a short screen (a phone on its side) instead of clipping the picker, never sideways', () => {
    const body = getCssRuleBody(css, `${PHONE} .off-screen`);
    expect(body).toContain('overflow-y: auto;');
    expect(body).toContain('overflow-x: hidden;');
  });

  it('sizes the label to fit 320 px, and lets a long word break rather than run past the glass', () => {
    const body = getCssRuleBody(css, `${PHONE} .off-screen__label`);
    expect(body).not.toBeNull();
    expect(body).toMatch(/font-size:/);
    expect(body).toContain('overflow-wrap: anywhere;');
  });

  it('centres the picker and lets its options wrap inside the screen', () => {
    const picker = getCssRuleBody(css, `${PHONE} .off-screen__picker`);
    expect(picker).not.toBeNull();
    expect(picker).toContain('width: 100%;');
    const root = getCssRuleBody(css, '.off-screen__picker .sc-radio-button__root');
    expect(root).toContain('justify-content: center;');
  });

  it('tightens the options as the sketch does: 10px side padding', () => {
    const body = getCssRuleBody(css, `${PHONE} .off-screen__picker .sc-radio-button__flat`);
    expect(body).not.toBeNull();
    expect(body).toContain('padding: 0 10px;');
  });

  it('wraps the readout onto a second line, centred, instead of ending it in an ellipsis or running over', () => {
    const base = getCssRuleBody(css, '.off-screen__readout');
    expect(base).not.toBeNull();
    expect(base).toContain('text-align: center;');
    expect(base).not.toContain('white-space: nowrap');
    expect(base).not.toContain('text-overflow');
    const phone = getCssRuleBody(css, `${PHONE} .off-screen__readout`);
    expect(phone).not.toBeNull();
    expect(phone).toContain('overflow-wrap: anywhere;');
    expect(phone).toMatch(/font-size:/);
    expect(phone).not.toContain('white-space: nowrap');
  });

  it('fixes no width or min-width wider than 320 px', () => {
    expect(findFixedWidthsOver(320, [css], [readFileSync(resolve(dir, '../../../../index.css'), 'utf-8')])).toEqual([]);
  });
});
