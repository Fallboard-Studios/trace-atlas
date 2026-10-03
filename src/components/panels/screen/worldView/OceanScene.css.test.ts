import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// Roadmap 17.2.5. jsdom computes no layout and no compositing, so the scene's layer contract is
// pinned at the source (the LfoLink.css.test.ts / tempoSyncSliderLayout.test.ts way). The point of
// the four stacked <svg> layers is that the two that move (robots, bubbles) are compositor layers of
// their own, so a robot's transform write no longer repaints the sixty static factories behind it —
// which only holds if the moving layers are actually promoted (`will-change: transform`) and every
// layer covers the same box as the old single <svg> did.

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'OceanScene.css'), 'utf-8');

describe('OceanScene.css scene layers', () => {
  it('the scene is a positioned box its layers stack inside', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toContain('inset: 0;');
  });

  it('every layer fills the scene box exactly, so the four viewBoxes map to the same pixels', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene__layer');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toContain('inset: 0;');
    expect(body).toContain('width: 100%;');
    expect(body).toContain('height: 100%;');
    expect(body).toContain('display: block;');
    // The static front layer sits above the robots and must not swallow their clicks.
    expect(body).toContain('pointer-events: none;');
  });

  it('a moving layer is promoted to its own compositor layer', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene__layer--moving');
    expect(body).not.toBeNull();
    expect(body).toContain('will-change: transform;');
  });

  it('the robots layer is the one that takes pointer events', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene__layer--robots');
    expect(body).not.toBeNull();
    expect(body).toContain('pointer-events: auto;');
  });
});
