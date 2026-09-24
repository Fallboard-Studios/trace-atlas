import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from './testUtils/cssRuleBody';
import { ACCENT_COLORS } from './constants/accentColors';

// TYPE_SCALE.md Task 2 — index.css's new type-scale tokens. Vitest's default
// config treats CSS imports as a no-op (no `css: true` in vitest.config.ts),
// so no existing component test ever exercises real computed styles; these
// are text-contract assertions against the real source file instead, the
// same class of test main.fonts.test.ts already uses for main.tsx.

const cssSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'index.css'),
  'utf-8',
);

describe('index.css type-scale tokens', () => {
  it('defines --font-controls falling back to Rajdhani then the system stack', () => {
    expect(cssSource).toContain(
      "--font-controls: 'Titillium Web', 'Rajdhani', system-ui, Avenir, Helvetica, Arial, sans-serif;",
    );
  });

  it('defines all 7 semantic font-size tokens with the spec-mandated rem values', () => {
    const expectedSizeTokens = [
      '--font-size-label-compact: 0.6875rem;',
      '--font-size-label-lore: 0.75rem;',
      '--font-size-label: 0.9375rem;',
      '--font-size-body: 1rem;',
      '--font-size-heading-sm: 1.125rem;',
      '--font-size-heading-md: 1.375rem;',
      '--font-size-heading-lg: 1.75rem;',
    ];
    for (const token of expectedSizeTokens) {
      expect(cssSource).toContain(token);
    }
  });

  it('defines all 4 font-weight tokens with the spec-mandated numeric values', () => {
    const expectedWeightTokens = [
      '--font-weight-control: 400;',
      '--font-weight-regular: 500;',
      '--font-weight-medium: 600;',
      '--font-weight-bold: 700;',
    ];
    for (const token of expectedWeightTokens) {
      expect(cssSource).toContain(token);
    }
  });

  it(":root's document-wide font-weight reads var(--font-weight-regular), not a bare 400", () => {
    expect(cssSource).toContain('font-weight: var(--font-weight-regular);');
    expect(cssSource).not.toMatch(/\n\s*font-weight:\s*400;/);
  });

  it('removes the old --font-size-sm/md/lg tokens (TYPE_SCALE.md Task 10 — every consumer has migrated)', () => {
    // Not a plain .not.toContain() on the value alone (e.g. "12px") — that
    // would also incidentally match an unrelated future 12px value
    // elsewhere in the file. Match the exact old declaration lines.
    expect(cssSource).not.toContain('--font-size-sm: 12px;');
    expect(cssSource).not.toContain('--font-size-md: 16px;');
    expect(cssSource).not.toContain('--font-size-lg: 20px;');
    // Belt-and-suspenders: the custom property NAMES themselves must not
    // appear anywhere in the file at all, not just those exact declarations
    // (guards against, say, a leftover reference via var(--font-size-sm)
    // that this rewrite forgot to also remove).
    expect(cssSource).not.toContain('--font-size-sm');
    expect(cssSource).not.toContain('--font-size-md');
    expect(cssSource).not.toContain('--font-size-lg');
  });

  it('removes the dead Vite-scaffold h1 font-size rule (zero real <h1> consumers)', () => {
    expect(cssSource).not.toContain('font-size: 3.2em;');
  });

  it('removes the dead Vite-scaffold bare button rule (zero real bare <button> consumers)', () => {
    expect(cssSource).not.toContain('padding: 0.6em 1.2em;');
  });

  it('leaves button:hover/:focus and the light-scheme media query untouched (out of this task\'s scope)', () => {
    expect(cssSource).toContain('button:hover {');
    expect(cssSource).toContain('button:focus,');
    expect(cssSource).toContain('@media (prefers-color-scheme: light)');
  });

  it('restores font inheritance for native form controls (regression, found live: "I see Arial on buttons")', () => {
    // Task 2 deleted the whole old `button {...}` rule as "dead Vite
    // boilerplate," including its `font-family: inherit;` line — but
    // browsers' UA stylesheets give button/input/select/textarea their own
    // NON-inheriting default font, so that line was the only thing letting
    // real native buttons throughout the app (RadioButton's own option
    // buttons, NavTreeNode's expand/collapse trigger, Toggle's switch, Stepper's
    // +/- buttons, PowerRockerSwitch's confirm dialog) pick up the page's
    // set font at all. Without it, every one of those falls back to the
    // browser's own default UI font (Arial, on Windows Chrome) instead of
    // Rajdhani/Titillium Web — a real, user-reported regression, not a
    // hypothetical one. Restored as a standard, generic reset (inherit,
    // not a hardcoded family/size/weight) so each control's own ancestor
    // rule (e.g. .sc-radio-button's font-family: var(--font-controls))
    // correctly reaches its own native <button>/<input> descendants.
    const body = getCssRuleBody(cssSource, 'button,\ninput,\nselect,\ntextarea');
    expect(body).not.toBeNull();
    expect(body).toContain('font-family: inherit;');
    expect(body).toContain('font-size: inherit;');
    expect(body).toContain('font-weight: inherit;');
  });

  it('no longer claims "no real bare <button> exists in the app" (Task 2\'s own comment was wrong)', () => {
    expect(cssSource).not.toContain('no real <h1> or bare <button> exists in');
  });
});

// Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.2) — the trait-theming CSS
// mechanism. Same text-contract-against-the-real-source approach as the type-scale tests above,
// for the same reason (no `css: true` in vitest.config.ts, so no computed color-mix()/gradient
// value is ever actually resolved in jsdom).
describe(':root color-accent-a/-b mechanism (Task 4)', () => {
  const rootBody = getCssRuleBody(cssSource, ':root');
  // Derived from ACCENT_COLORS (src/constants/accentColors.ts) rather than re-hardcoded here —
  // index.css's own values are the Header trait's pair (traitColors.ts's single source of truth),
  // and a CSS file can't itself `import` that constant. Building the expectation from the same
  // constant these values are supposed to match means a future repaint of ACCENT_COLORS.teal/
  // .green that forgets to update index.css's literal fallback fails this test, instead of the
  // test silently keeping its own stale, independently-typed copy of the old value forever (the
  // "simple swap" success criterion in docs/intent/color-scheme-trait-theming.md is what this
  // guards — a repaint should be a small, localized edit that visibly breaks if a spot is missed).
  const { teal, green } = ACCENT_COLORS;

  it('defines --color-accent-a/-b with the Header trait pair (teal/green) as the ambient default', () => {
    expect(rootBody).not.toBeNull();
    expect(rootBody).toContain(`--color-accent-a: ${teal};`);
    expect(rootBody).toContain(`--color-accent-b: ${green};`);
  });

  it('defines --color-accent as a color-mix() of literal colors, not a literal hex', () => {
    expect(rootBody).toContain(`--color-accent: color-mix(in srgb, ${teal} 50%, ${green} 50%);`);
  });

  it('defines --color-accent-gradient as a linear-gradient() of literal colors', () => {
    expect(rootBody).toContain(`--color-accent-gradient: linear-gradient(135deg, ${teal}, ${green});`);
  });

  // Bug fix, found live via browser DevTools — jsdom never resolves real CSS cascade, so this was
  // invisible until checked against a real browser. See traitColors.ts's own comment for the full
  // explanation: a custom property whose specified value nests var() references to OTHER custom
  // properties does not correctly re-substitute using a descendant's overridden values.
  it('never nests var(--color-accent-a)/var(--color-accent-b) inside --color-accent or --color-accent-gradient\'s own value', () => {
    expect(rootBody).not.toContain('color-mix(in srgb, var(--color-accent-a)');
    expect(rootBody).not.toContain('linear-gradient(135deg, var(--color-accent-a)');
  });

  it('removes the old literal --color-accent hex value entirely', () => {
    expect(cssSource).not.toContain('--color-accent: #5fc9dc;');
  });

  it('leaves --color-bg/--color-surface/--color-border/text tokens byte-for-byte unchanged', () => {
    expect(rootBody).toContain('--color-bg: #12161a;');
    expect(rootBody).toContain('--color-surface: #1a2027;');
    expect(rootBody).toContain('--color-border: rgba(140, 190, 210, 0.14);');
    expect(rootBody).toContain('--color-text-primary: rgba(255, 255, 255, 0.87);');
    expect(rootBody).toContain('--color-text-muted: rgba(255, 255, 255, 0.6);');
  });

  it('removes the stale assets/color-theme.json comment reference (predates this phase, unrelated)', () => {
    expect(cssSource).not.toContain('assets/color-theme.json');
  });
});
