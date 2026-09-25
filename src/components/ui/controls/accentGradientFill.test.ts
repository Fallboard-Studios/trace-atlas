import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.2/§4, Task 5) — the 3 flat-
// rectangle fill rules that switch from the solid --color-accent to the literal 2-tone
// --color-accent-gradient. Every OTHER --color-accent consumer in these same files (outlines,
// color-mix() face tints, drop-shadow glow) is untouched — those require a single solid <color>,
// which a linear-gradient() isn't.

const controlsDir = dirname(fileURLToPath(import.meta.url));

describe('CabinetBox.css .sc-cabinet-box__backing', () => {
  const cssSource = readFileSync(resolve(controlsDir, 'CabinetBox.css'), 'utf-8');

  it('fills with the 2-tone gradient by default, not a solid background-color', () => {
    // docs/specs/NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §5.1 wrapped this in a
    // var(--cabinet-box-color, ...) fallback (an optional per-instance solid-color override) —
    // the literal string changed, but the DEFAULT (no override) still resolves to the same
    // 2-tone gradient as before, which is what this test actually guards.
    const body = getCssRuleBody(cssSource, '.sc-cabinet-box__backing');
    expect(body).not.toBeNull();
    expect(body).toContain('background: var(--cabinet-box-color, var(--color-accent-gradient));');
    expect(body).not.toContain('background-color: var(--color-accent);');
  });

  it('leaves the top-face/left-face color-mix() tints and the walls\' drop-shadow glow untouched', () => {
    // Both require a single solid <color> — a gradient is invalid there. Also wrapped in the same
    // var(--cabinet-box-color, ...) fallback as the backing above — the default (no override)
    // still resolves to --color-accent exactly as before.
    expect(cssSource).toContain('color-mix(in srgb, var(--cabinet-box-color, var(--color-accent)) 100%, white 20%)');
    expect(cssSource).toContain('color-mix(in srgb, var(--cabinet-box-color, var(--color-accent)) 100%, black 25%)');
    expect(cssSource).toContain('drop-shadow(0 0 calc(var(--cabinet-glow, 0) * 20px) var(--color-accent))');
  });
});

describe("Button.css .sc-button .sc-cabinet-box__front", () => {
  const cssSource = readFileSync(resolve(controlsDir, 'Button.css'), 'utf-8');

  it('fills with the 2-tone gradient, not a solid background-color', () => {
    const body = getCssRuleBody(cssSource, '.sc-button .sc-cabinet-box__front');
    expect(body).not.toBeNull();
    expect(body).toContain('background: var(--color-accent-gradient);');
    expect(body).not.toContain('background-color: var(--color-accent);');
  });

  it('leaves the focus-visible outline on the solid --color-accent (a gradient is invalid there)', () => {
    expect(cssSource).toContain('outline: 2px solid var(--color-accent);');
  });
});

describe("RadioButton.css .sc-radio-button__item[data-state='on'] .sc-cabinet-box__front", () => {
  const cssSource = readFileSync(resolve(controlsDir, 'RadioButton.css'), 'utf-8');

  it('fills with the 2-tone gradient, not a solid background-color', () => {
    const body = getCssRuleBody(cssSource, ".sc-radio-button__item[data-state='on'] .sc-cabinet-box__front");
    expect(body).not.toBeNull();
    expect(body).toContain('background: var(--color-accent-gradient);');
    expect(body).not.toContain('background-color: var(--color-accent);');
  });

  it('leaves the focus-visible outline on the solid --color-accent (a gradient is invalid there)', () => {
    expect(cssSource).toContain('outline: 2px solid var(--color-accent);');
  });
});

describe("Toggle.css .sc-toggle__root[data-state='checked'] .sc-cabinet-box__front", () => {
  const cssSource = readFileSync(resolve(controlsDir, 'Toggle.css'), 'utf-8');

  // Crawford's own request, 2026-09-13 — once activated, the switch gets
  // the same accent-gradient facade Button's own always-live surface uses,
  // identical mechanism to RadioButton's own [data-state='on'] rule above,
  // just keyed off Radix Switch's 'checked'/'unchecked' state names.
  it('fills with the 2-tone gradient, not a solid background-color', () => {
    const body = getCssRuleBody(cssSource, ".sc-toggle__root[data-state='checked'] .sc-cabinet-box__front");
    expect(body).not.toBeNull();
    expect(body).toContain('background: var(--color-accent-gradient);');
    expect(body).not.toContain('background-color: var(--color-accent);');
  });

  it('leaves the unchecked state on CabinetBox.css\'s own --color-surface default (no rule overriding it here)', () => {
    expect(cssSource).not.toMatch(/\[data-state=['"]unchecked['"]\][^{]*\.sc-cabinet-box__front/);
  });

  it('leaves the focus-visible outline on the solid --color-accent (a gradient is invalid there)', () => {
    expect(cssSource).toContain('outline: 2px solid var(--color-accent);');
  });
});
