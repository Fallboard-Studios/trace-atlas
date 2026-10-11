import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import { SHELL_MIN_WIDTH } from './useShell';
import { findFixedWidthsOver } from '@/testUtils/fixedWidths';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 28 (spec §1.1: the phone shell holds down to 320 px). jsdom computes no
 * layout, so the 320 px pass is pinned at the source: no shell stylesheet fixes a `width` or `min-width`
 * wider than SHELL_MIN_WIDTH outside a desk-only rule. A width that bends to the viewport (%, vw, min(…,100%))
 * is fine; a width that cannot is a horizontal scrollbar at 320 px.
 */
const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '../../..');

function cssFilesUnder(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith('.css')).map((f) => join(dir, f));
}
const read = (file: string) => readFileSync(file, 'utf-8');

// Every shell piece: the screen's own (header, bar, sheet, breadcrumb, content surface, roster tile, every
// screen, the off screen, the console panels the sheets open), the viewport that hosts them, and the controls the phone shell composes.
const SHELL_SHEETS = [
  ...cssFilesUnder(here),
  join(srcRoot, 'components/panels/physical/ScreenViewport.css'),
  join(srcRoot, 'components/ui/controls/SectionTabs.css'),
  join(srcRoot, 'components/ui/controls/RadioButton.css'),
  join(srcRoot, 'components/ui/controls/IntroPanel.css'),
];
const TOKENS = [read(join(srcRoot, 'index.css'))];

describe('the phone shell at 320 px', () => {
  it('reads SHELL_MIN_WIDTH as 320 and covers the header, bar, sheet, roster tile, tab row and off screen', () => {
    expect(SHELL_MIN_WIDTH).toBe(320);
    const names = SHELL_SHEETS.map((f) => f.split(/[\\/]/).pop());
    for (const sheet of ['Header.css', 'PhoneBar.css', 'NavPanel.css', 'RosterTile.css', 'SectionTabs.css', 'OffScreen.css', 'ContentPane.css']) {
      expect(names, sheet).toContain(sheet);
    }
  });

  it('no shell stylesheet fixes a width or min-width wider than SHELL_MIN_WIDTH', () => {
    const offenders = SHELL_SHEETS.flatMap((file) =>
      findFixedWidthsOver(SHELL_MIN_WIDTH, [read(file)], TOKENS).map((w) => `${file.split(/[\\/]/).pop()}: ${w.selector} { ${w.property}: ${w.value} } = ${w.px}px`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('findFixedWidthsOver — the scanner the walk above stands on', () => {
  const over = (css: string, tokens: string[] = []) => findFixedWidthsOver(320, [css], tokens);

  it('flags a fixed width and a fixed min-width over the viewport, in px and in rem', () => {
    expect(over('.a { width: 400px; }').map((w) => w.px)).toEqual([400]);
    expect(over('.a { min-width: 21rem; }').map((w) => w.px)).toEqual([336]);
  });

  it('allows a width at the viewport and below it', () => {
    expect(over('.a { width: 320px; } .b { min-width: 44px; } .c { width: 2ch; }')).toEqual([]);
  });

  it('never reads max-width: a cap is not a floor', () => {
    expect(over('.a { max-width: 900px; }')).toEqual([]);
  });

  it('allows a width that bends to the viewport', () => {
    expect(over('.a { width: 100%; } .b { width: min(420px, calc(100% - 32px)); } .c { width: 90vw; }')).toEqual([]);
  });

  it('flags min() and max() over fixed values', () => {
    expect(over('.a { width: max(400px, 200px); }').map((w) => w.px)).toEqual([400]);
    expect(over('.a { width: min(400px, 500px); }').map((w) => w.px)).toEqual([400]);
    expect(over('.a { width: min(300px, 500px); }')).toEqual([]);
  });

  it('resolves var() against custom properties in the sheet and in the token sheets, including a fallback', () => {
    expect(over(':root { --w: 500px; } .a { width: var(--w); }').map((w) => w.px)).toEqual([500]);
    expect(over('.a { width: var(--w); }', [':root { --w: 500px; }']).map((w) => w.px)).toEqual([500]);
    expect(over('.a { width: var(--missing, 450px); }').map((w) => w.px)).toEqual([450]);
    expect(over(':root { --a: 200px; --b: calc(var(--a) * 2); } .x { width: var(--b); }').map((w) => w.px)).toEqual([400]);
  });

  it('evaluates calc() with fixed operands', () => {
    expect(over('.a { width: calc(300px + 40px); }').map((w) => w.px)).toEqual([340]);
    expect(over('.a { width: calc(100% - 32px); }')).toEqual([]);
  });

  it('leaves a value it cannot evaluate alone rather than guessing', () => {
    expect(over('.a { width: var(--unknown); } .b { width: auto; } .c { width: fit-content; }')).toEqual([]);
  });

  it('skips a rule inside a min-width media query wider than the viewport, but not a narrower or max-width one', () => {
    expect(over('@media (min-width: 768px) { .a { width: 400px; } }')).toEqual([]);
    expect(over('@media (min-width: 48em) { .a { width: 400px; } }')).toEqual([]);
    expect(over('@media (min-width: 320px) { .a { width: 400px; } }').map((w) => w.px)).toEqual([400]);
    expect(over('@media (max-width: 479px) { .a { width: 400px; } }').map((w) => w.px)).toEqual([400]);
  });

  it('skips a rule whose selector names the desk shell, but not the phone shell', () => {
    expect(over("#screen-viewport[data-shell='desk'] .a { width: 400px; }")).toEqual([]);
    expect(over("#screen-viewport[data-shell='phone'] .a { width: 400px; }").map((w) => w.px)).toEqual([400]);
  });

  it('ignores comments, and reads both rules of a CRLF file', () => {
    expect(over('/* .a { width: 999px; } */ .b { width: 10px; }')).toEqual([]);
    expect(over('.a {\r\n  width: 400px;\r\n}\r\n.b {\r\n  min-width: 500px;\r\n}').map((w) => w.px)).toEqual([400, 500]);
  });

  it('reads a rule after a keyframes block', () => {
    expect(over('@keyframes k { from { width: 999px; } to { width: 1px; } } .a { width: 400px; }').map((w) => w.px)).toEqual([400]);
  });
});
