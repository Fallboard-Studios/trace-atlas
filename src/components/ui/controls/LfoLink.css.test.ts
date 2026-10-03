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

  it('lays Lane and Depth out as a row when the tier says row', () => {
    const body = getCssRuleBody(cssSource, ".sc-lfo-link[data-orientation='row']");
    expect(body).not.toBeNull();
    expect(body).toContain('flex-direction: row;');
    expect(body).toContain('align-items: flex-start;');
  });

  it('gives the row\'s two children equal, content-independent halves that can shrink below their content', () => {
    const body = getCssRuleBody(cssSource, ".sc-lfo-link[data-orientation='row'] > *");
    expect(body).not.toBeNull();
    expect(body).toContain('flex: 1 1 0;');
    expect(body).toContain('min-width: 0;');
  });

  it('needs no column rule of its own — column is the base rule, not a second orientation rule', () => {
    expect(getCssRuleBody(cssSource, ".sc-lfo-link[data-orientation='column']")).toBeNull();
  });
});
