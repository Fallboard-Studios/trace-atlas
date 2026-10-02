import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// Toggle.css is written for a toggle in its own labelled row: `.sc-toggle` is `width: 100%` and an
// inline-size container. Placed in ANY flex row (beside the Rate slider, beside the Mutation Type
// options), that 100% flex-basis claims the whole row and starves its neighbour — measured live, the
// slider wrapper next to it was 0px wide. The wrapper's own CSS makes the toggle just its facade box,
// wherever it is placed. jsdom computes no layout, so this is pinned at the source.

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'TempoSyncToggle.css'), 'utf-8');

describe('TempoSyncToggle.css', () => {
  it('never grows or shrinks in a flex row: it is exactly its own content', () => {
    const body = getCssRuleBody(cssSource, '.sc-tempo-sync-toggle');
    expect(body).not.toBeNull();
    expect(body).toContain('flex: 0 0 auto;');
  });

  it("sizes the Toggle to its own content instead of Toggle.css's width: 100%", () => {
    const body = getCssRuleBody(cssSource, '.sc-tempo-sync-toggle > .sc-toggle');
    expect(body).not.toBeNull();
    expect(body).toContain('width: auto;');
  });

  it("drops the Toggle's size containment — a shrink-to-fit flex item under inline-size containment collapses to 0px", () => {
    const body = getCssRuleBody(cssSource, '.sc-tempo-sync-toggle > .sc-toggle');
    expect(body).toContain('container-type: normal;');
  });
});
