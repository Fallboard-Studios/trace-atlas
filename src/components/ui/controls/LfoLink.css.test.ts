import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.5. jsdom computes no layout, so the layout contract
// is pinned at the source, the tempoSyncSliderLayout.test.ts way. LfoLink.tsx sets
// data-orientation from the viewport tier; this file is what that attribute keys off.
//
// Why `flex: 1 1 0` + `min-width: 0` on the row's children, restated from DirectionalPanel.css: a
// zero flex-basis gives each child an equal, content-independent half (no voxel-track box-count
// feedback loop), and it is what stops RadioButton's own `width: 100%` from claiming the whole row —
// the same trap the Tempo Sync toggle hit beside a slider (TempoSyncToggle.css).

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'LfoLink.css'), 'utf-8');

describe('LfoLink.css layout', () => {
  it('stays a column by default, and keeps its sc-control container (the Depth readout queries it)', () => {
    const body = getCssRuleBody(cssSource, '.sc-lfo-link');
    expect(body).not.toBeNull();
    expect(body).toContain('display: flex;');
    expect(body).toContain('flex-direction: column;');
    expect(body).toContain('container-type: inline-size;');
    expect(body).toContain('container-name: sc-control;');
  });

  // docs/tasks/LAYOUT_REWORK.md Task 14 (Crawford, 2026-10-10: "App sizes, wrap"): the lane row and the
  // 8-box depth strip share one row where both fit, and the strip wraps under the lane row where they do
  // not; each line is one cabinet row. Each declaration pinned here was removed one at a time in Chrome and
  // changed the layout; four that changed nothing were deleted instead (see LfoLink.css).
  it('lays the lane row and the depth strip out in one wrapping row', () => {
    const body = getCssRuleBody(cssSource, '.sc-lfo-link__row');
    expect(body).not.toBeNull();
    expect(body).toContain('display: flex;');
    expect(body).toContain('flex-wrap: wrap;');
  });

  // RadioButton's root is a full-width sc-control size container (RadioButton.css), and inline-size
  // containment collapses an element whose width comes from its content (leafControlContainerQuery.test.ts's
  // documented bug — 0 px here, in Chrome). In this row the lane radio's width comes from its options, so it
  // drops both; at full width the strip could never share its line.
  it('sizes the lane radio by its options, with no containment of its own', () => {
    const body = getCssRuleBody(cssSource, '.sc-lfo-link__row > .sc-radio-button');
    expect(body).not.toBeNull();
    expect(body).toContain('container-type: normal;');
    expect(body).toContain('width: auto;');
  });

  // The depth slider fits its box count to its own width. LfoLink.tsx sets --lfo-link-depth-length to an
  // 8-box track at the tier's sizes: as its flex-basis the line breaks as if the strip were 8 boxes long;
  // it never grows past it, and it shrinks with a narrower line (the 320 px phone fits 7). Without the basis
  // the strip collapses to 0 px. It keeps its own containment, which is what lets it shrink.
  it('offers the depth strip an 8-box basis, and keeps its own containment', () => {
    const body = getCssRuleBody(cssSource, ".sc-lfo-link__row > .sc-slider-linear[data-orientation='horizontal']");
    expect(body).not.toBeNull();
    expect(body).toContain('flex-basis: var(--lfo-link-depth-length);');
    expect(body).not.toContain('container-type');
  });

  it('switches nothing by tier any more — no data-orientation rule is left', () => {
    expect(cssSource).not.toContain('data-orientation=\'row\'');
    expect(cssSource).not.toContain('data-orientation=\'column\'');
  });
});
