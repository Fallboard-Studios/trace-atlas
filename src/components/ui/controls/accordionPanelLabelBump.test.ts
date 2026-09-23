import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// TYPE_SCALE.md Task 7 — the direct fix for the named "accordion/directional-
// panel labels read too small" complaint (spec §1.6). Stays --font-sans
// (Rajdhani, untouched here — confirmed by the "no container-type" guard
// below, the same signal §1.4/§1.5 use to mean "not a leaf control") but gets
// an explicit size + weight bump on its own DualLabel human label only.
//
// This file's own accordion-wrapper label-bump half was removed
// docs/tasks/NAV_LAYOUT_REWRITE.md Task 21, once the accordion wrapper's own stylesheet was
// deleted (zero consumers remained) — DirectionalPanel.css's own bump below is unaffected by
// that removal.

const controlsDir = dirname(fileURLToPath(import.meta.url));

describe('DirectionalPanel.css label bump', () => {
  const cssSource = readFileSync(resolve(controlsDir, 'DirectionalPanel.css'), 'utf-8');

  it("bumps the panel's own group label (direct child, not descendant) to heading-sm/medium weight", () => {
    // No spaces around '>' — matches this file's own existing child-combinator
    // convention (.sc-directional-panel-facade>.sc-cabinet-box, etc.).
    const body = getCssRuleBody(cssSource, '.sc-directional-panel>.sc-dual-label__human');
    expect(body).not.toBeNull();
    expect(body).toContain('font-size: var(--font-size-heading-sm);');
    expect(body).toContain('font-weight: var(--font-weight-medium);');
  });

  it('leaves the lore caption untouched — no rule targets .sc-directional-panel>.sc-dual-label__lore', () => {
    expect(getCssRuleBody(cssSource, '.sc-directional-panel>.sc-dual-label__lore')).toBeNull();
  });

  it("uses a direct-child combinator, not a descendant selector — a nested DirectionalPanel's own DualLabel (inside .sc-directional-panel__content) must not be caught", () => {
    // A descendant selector `.sc-directional-panel .sc-dual-label__human`
    // (space, no '>') would also match a DualLabel nested arbitrarily deep
    // inside .sc-directional-panel__content — e.g. a control composed
    // inside this panel's own children. Only the direct-child form should
    // exist in this file.
    expect(cssSource).not.toContain('.sc-directional-panel .sc-dual-label__human');
  });

  it('gains no container-type/container-name (out of scope per spec §1.4 — this stays chrome, not a leaf control)', () => {
    expect(cssSource).not.toContain('container-type');
    expect(cssSource).not.toContain('container-name');
  });
});
