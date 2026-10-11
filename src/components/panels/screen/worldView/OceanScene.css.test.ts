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
  // Mobile Deck Camera (spec assumption 2): the stage is sized by aspect ratio, not inset: 0, so
  // a box at or wider than 16:9 is pixel-identical to the old fixed box (min-width: 100% wins)
  // and a narrower box overflows horizontally for the scroller (WorldView.css) to pan.
  it('the scene is a 16:9 stage box its layers stack inside', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene');
    expect(body).not.toBeNull();
    expect(body).toContain('position: relative;');
    expect(body).toContain('height: 100%;');
    expect(body).toContain('min-width: 100%;');
    expect(body).toContain('aspect-ratio: 16 / 9;');
    expect(body).not.toContain('inset: 0;');
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

  // Mobile Deck Camera (spec assumption 10, Task 5): quarter-stage proximity snap marks, so a
  // camera pan that lands between marks stays put and a swipe that stops near one settles there.
  it('a snap mark takes no clicks, has no width, and spans the full stage height', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene__snap');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toContain('width: 0;');
    expect(body).toContain('height: 100%;');
    expect(body).toContain('scroll-snap-align: start;');
    expect(body).toContain('pointer-events: none;');
  });

  it('a moving layer is promoted to its own compositor layer', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene__layer--moving');
    expect(body).not.toBeNull();
    expect(body).toContain('will-change: transform;');
  });

  // Phase 43 Task 33 (spec §1.10): with two robot rows, a layer that took clicks would block every
  // layer under it — the front robots svg would swallow every click meant for a back-row robot. So
  // no layer takes them; the robots themselves do.
  it('no layer takes pointer events; the robots themselves do', () => {
    expect(getCssRuleBody(cssSource, '.ocean-scene__layer--robots')).toBeNull();
    expect(cssSource).not.toMatch(/ocean-scene__layer[^{]*\{[^}]*pointer-events:\s*(auto|all|visible)/);
    const body = getCssRuleBody(cssSource, '.robot');
    expect(body).not.toBeNull();
    expect(body).toContain('pointer-events: auto;');
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 24 (spec §1.7): selection is a halo whose colour is the robot's
// (selected) or the company's (member), set as --halo on the robot group (Robot.tsx). The CSS reads it for
// both drop-shadows, and a robot with none keeps the old cyan.
describe('OceanScene.css selection halo', () => {
  const selected = getCssRuleBody(cssSource, '.robot.selected');
  const member = getCssRuleBody(cssSource, '.robot.isCompanyMember');

  it('selected and company-member robots share one halo declaration', () => {
    expect(selected).not.toBeNull();
    expect(member).toBe(selected);
  });

  it('both drop-shadows take their colour from --halo, at the old strengths (80% and 40%)', () => {
    const shadows = (selected ?? '').match(/drop-shadow\([^;]*?\)\)/g) ?? [];
    expect(shadows).toHaveLength(2);
    expect(shadows[0]).toMatch(/0 0 8px color-mix\(in srgb, var\(--halo, #00ffff\) 80%, transparent\)/);
    expect(shadows[1]).toMatch(/0 0 16px color-mix\(in srgb, var\(--halo, #00ffff\) 40%, transparent\)/);
  });

  it('keeps no fixed cyan of its own outside the --halo fallback', () => {
    expect(selected).not.toMatch(/rgba?\(\s*0,\s*255,\s*255/);
    expect((selected ?? '').replace(/var\(--halo, #00ffff\)/g, '')).not.toMatch(/#0ff|#00ffff|cyan/i);
  });
});
