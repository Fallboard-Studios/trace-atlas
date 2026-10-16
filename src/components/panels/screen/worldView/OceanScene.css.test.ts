import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SCENE_SLOTS } from './sceneStack';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// Roadmap 17.2.5, reshaped by Phase 53 Task 9 (docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.1-1.3).
// jsdom computes no layout and no compositing, so the scene's layer contract is pinned at the source
// (the LfoLink.css.test.ts / tempoSyncSliderLayout.test.ts way). The scene is one scaled stage
// holding the sheets (and, as the phase goes on, the movers): the stage's CSS scale and offset are
// the old viewBox fit, every sheet fills the stage, the sheets that move are compositor layers of
// their own, and one z-index table orders every slot.

const here = dirname(fileURLToPath(import.meta.url));
const cssSource = readFileSync(resolve(here, 'OceanScene.css'), 'utf-8');

describe('OceanScene.css scene stage', () => {
  // Mobile Deck Camera (spec assumption 2): the box is sized by aspect ratio, not inset: 0, so
  // a box at or wider than 16:9 is pixel-identical to the old fixed box (min-width: 100% wins)
  // and a narrower box overflows horizontally for the scroller (WorldView.css) to pan.
  it('the scene is a 16:9 box the stage fits into', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene');
    expect(body).not.toBeNull();
    expect(body).toContain('position: relative;');
    expect(body).toContain('height: 100%;');
    expect(body).toContain('min-width: 100%;');
    expect(body).toContain('aspect-ratio: 16 / 9;');
    expect(body).not.toContain('inset: 0;');
  });

  // The scroller measures its scrollWidth when the camera registers and the world view centres its
  // scrollLeft, both in the commit that mounts the scene, one frame before useStageFit's first
  // observation lands. An unfitted stage is 1920 px wide whatever the box is, so unless the scene
  // clips it, scrollWidth is 1920 at that moment: the camera caches a wrong scale and a portrait
  // phone is centred for the wrong width. Clipping makes the scroll extent the box's own, fitted or
  // not. `clip`, not `hidden`: no scroll container, so nothing inside can scroll the world in its box.
  it('the scene clips the stage at its own box, so the scroll extent is the box width before and after the fit', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene');
    expect(body).not.toBeNull();
    expect(body).toContain('overflow: clip;');
    expect(body).not.toMatch(/overflow(-[xy])?:\s*(hidden|auto|scroll)/);
  });

  it('the stage is the world in pixels, scaled from its top-left corner by the three fit properties', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene__stage');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toContain('left: 0;');
    expect(body).toContain('top: 0;');
    expect(body).toContain('transform-origin: 0 0;');
    // translate first, so the offset is in the box's pixels and the scale applies to the stage alone.
    expect(body).toContain(
      'transform: translate(var(--stage-x, 0px), var(--stage-y, 0px)) scale(var(--stage-scale, 1));'
    );
  });

  // OceanScene.tsx sizes the stage inline, from the same width and height as the sheets' viewBox,
  // so no stylesheet fixes a width wider than the 320 px phone shell (shell320.css.test.ts walks
  // every sheet under panels/screen/ for exactly that) and the stage and its sheets cannot drift.
  it('the stage fixes no width or height in CSS: its size is the sheets viewBox, set inline', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene__stage');
    expect(body).not.toMatch(/(^|[\s;])(min-|max-)?(width|height)\s*:/);
  });

  it('the stage takes no clicks, like everything in the scene but a robot', () => {
    expect(getCssRuleBody(cssSource, '.ocean-scene__stage')).toContain('pointer-events: none;');
  });

  it('every sheet fills the stage exactly, so the world viewBoxes map to the same pixels', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene__sheet');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toContain('inset: 0;');
    expect(body).toContain('width: 100%;');
    expect(body).toContain('height: 100%;');
    expect(body).toContain('display: block;');
    // The static front sheet sits above the robots and must not swallow their clicks.
    expect(body).toContain('pointer-events: none;');
  });

  it('a moving sheet is promoted to its own compositor layer', () => {
    const body = getCssRuleBody(cssSource, '.ocean-scene__sheet--moving');
    expect(body).not.toBeNull();
    expect(body).toContain('will-change: transform;');
  });

  it('a static sheet is not promoted: it repaints once a second, on the lighting tick', () => {
    expect(getCssRuleBody(cssSource, '.ocean-scene__sheet')).not.toContain('will-change');
  });

  it('a mover is an invisible absolutely positioned box on its own compositor layer', () => {
    const body = getCssRuleBody(cssSource, '.mover');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toContain('left: 0;');
    expect(body).toContain('top: 0;');
    expect(body).toContain('will-change: transform;');
    expect(body).toContain('pointer-events: none;');
    // No cabinetry or container styling on a wrapper (spec §3).
    expect(body).not.toMatch(/border|background|box-shadow|filter/);
  });

  describe('the slot order', () => {
    const zIndexOf = (slot: string): number => {
      const body = getCssRuleBody(cssSource, `[data-scene-slot='${slot}']`);
      expect(body, `a rule for slot ${slot}`).not.toBeNull();
      const match = /z-index:\s*(-?\d+);/.exec(body!);
      expect(match, `a z-index for slot ${slot}`).not.toBeNull();
      return Number(match![1]);
    };

    it('gives every SCENE_SLOTS entry a z-index', () => {
      for (const slot of SCENE_SLOTS) expect(Number.isInteger(zIndexOf(slot))).toBe(true);
    });

    it('increases strictly in SCENE_SLOTS order, so a row switch is a slot write', () => {
      const zs = SCENE_SLOTS.map(zIndexOf);
      for (let i = 1; i < zs.length; i++) {
        expect(zs[i], `${SCENE_SLOTS[i]} above ${SCENE_SLOTS[i - 1]}`).toBeGreaterThan(zs[i - 1]);
      }
    });

    it('names no slot the order does not know', () => {
      const named = [...cssSource.matchAll(/\[data-scene-slot=['"]([a-z-]+)['"]\]/g)].map(
        (m) => m[1]
      );
      expect(named.length).toBeGreaterThan(0);
      for (const slot of named) expect(SCENE_SLOTS as readonly string[]).toContain(slot);
    });
  });

  // Phase 43 Task 33 (spec §1.10): with two robot rows, a sheet that took clicks would block every
  // sheet under it — the front robots svg would swallow every click meant for a back-row robot. So
  // nothing in the stack takes them; the robots themselves do.
  it('nothing in the stack takes pointer events; the robots themselves do', () => {
    expect(getCssRuleBody(cssSource, '.ocean-scene__sheet--robots')).toBeNull();
    expect(cssSource).not.toMatch(
      /(ocean-scene__(sheet|stage)|\.mover|data-scene-slot)[^{]*\{[^}]*pointer-events:\s*(auto|all|visible)/
    );
    const body = getCssRuleBody(cssSource, '.robot');
    expect(body).not.toBeNull();
    expect(body).toContain('pointer-events: auto;');
  });

  it('keeps no trace of the old layer names', () => {
    expect(cssSource).not.toContain('ocean-scene__layer');
    const scene = readFileSync(resolve(here, 'OceanScene.tsx'), 'utf-8');
    expect(scene).not.toContain('ocean-scene__layer');
    expect(scene).not.toContain('data-scene-layer');
    expect(readFileSync(resolve(here, 'WorldView.css'), 'utf-8')).not.toContain(
      'ocean-scene__layer'
    );
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
