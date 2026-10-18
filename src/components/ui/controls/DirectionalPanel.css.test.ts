import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// The top-level panel's facade is the tab content's background (Crawford, 2026-10-18): a faint wash of the
// section's darker trait tone instead of the opaque --color-surface, so the content pane's translucency carries
// through. jsdom resolves no color-mix() or cascaded custom properties, so the rule is pinned at the source, the
// WorldView.css.test.ts way.

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'DirectionalPanel.css'), 'utf-8');

describe('DirectionalPanel.css — the facade', () => {
  it("tints the facade's cabinet box with the darker trait tone at 5 % alpha", () => {
    const body = getCssRuleBody(cssSource, '.sc-directional-panel-facade>.sc-cabinet-box');
    expect(body).not.toBeNull();
    expect(body).toContain('--cabinet-box-color: color-mix(in srgb, var(--color-accent-dark) 5%, transparent);');
  });

  // A custom property inherits, so without the reset every control's cabinet box inside the panel (a radio
  // option, a voxel cell) read the 5 % wash too and lost its trait-coloured faces (seen in Chrome).
  it('keeps it on the facade only: every cabinet box inside it is reset to its own default', () => {
    const body = getCssRuleBody(cssSource, '.sc-directional-panel-facade>.sc-cabinet-box .sc-cabinet-box');
    expect(body).not.toBeNull();
    expect(body).toContain('--cabinet-box-color: initial;');
    const declarations = cssSource.match(/--cabinet-box-color\s*:[^;]+;/g) ?? [];
    expect(declarations.filter((d) => !/initial;$/.test(d))).toHaveLength(1);
  });
});
