/* global document -- vitest runs this file under jsdom; the lint config gives scripts/ Node globals only */
// Tests for the pure scene-markup helpers behind `npm run perf:idle` (scripts/perf/idle-paint.mjs).
// The harness runs against the branch under test AND a `main` build in the same session, so its
// selectors must read the stage markup (roadmap Phase 53) and the markup before it. The Chrome/CDP
// plumbing is not unit-tested; it is verified by a real run (see docs/PERFORMANCE.md).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import { SCENE_SLOTS } from '../../src/components/panels/screen/worldView/sceneStack';
import {
  BACK_ROBOT_ELEMENTS,
  BACK_ROBOT_GROUPS,
  BUBBLE_CIRCLES,
  FRONT_ROBOT_ELEMENTS,
  ROBOT_CONTAINERS,
  ROBOT_DETACH,
  ROBOT_GROUPS,
  SCENE_SLOT_NAMES,
  SHEET_SELECTOR,
  isMoverNode,
  sceneSlotSelector,
  slotNameOf,
} from './scene-markup-lib.mjs';

// ========================================
// FIXTURES
// ========================================

/** The scene before the stage: seven svg layers straight under `.ocean-scene`, named `data-scene-layer`. */
const OLD_SCENE = `
  <div class="ocean-scene">
    <svg class="ocean-scene__layer" data-scene-layer="back"><g id="factory-background-layer"><circle id="old-bg-circle" /></g></svg>
    <svg class="ocean-scene__layer ocean-scene__layer--moving" data-scene-layer="robots-back"><g id="robot-back-layer"><g class="robot" id="old-back-robot"><circle id="old-back-robot-circle" /></g></g></svg>
    <svg class="ocean-scene__layer" data-scene-layer="mid"><g id="factory-midground-layer"><circle id="old-mid-circle" /></g><circle id="old-mid-stray" /></svg>
    <svg class="ocean-scene__layer ocean-scene__layer--moving" data-scene-layer="bubbles"><circle id="old-bubble-1" /><circle id="old-bubble-2" /></svg>
    <svg class="ocean-scene__layer ocean-scene__layer--moving" data-scene-layer="robots"><g id="robot-layer"><g class="robot" id="old-robot"><circle id="old-robot-circle" /></g></g></svg>
    <svg class="ocean-scene__layer" data-scene-layer="front"><g id="factory-foreground-layer"><circle id="old-fg-circle" /></g></svg>
    <svg class="ocean-scene__layer ocean-scene__layer--moving" data-scene-layer="marker"></svg>
  </div>`;

/** The scene after Task 9: the same seven sheets inside the stage, named `data-scene-slot`. */
const NEW_SCENE = `
  <div class="ocean-scene">
    <div class="ocean-scene__stage">
      <svg class="ocean-scene__sheet" data-scene-slot="back"><g id="factory-background-layer"><circle id="new-bg-circle" /></g></svg>
      <svg class="ocean-scene__sheet ocean-scene__sheet--moving" data-scene-slot="robots-back"><g id="robot-back-layer"><g class="robot" id="new-back-robot"><circle id="new-back-robot-circle" /></g></g></svg>
      <svg class="ocean-scene__sheet" data-scene-slot="mid"><g id="factory-midground-layer"><circle id="new-mid-circle" /></g><circle id="new-mid-stray" /></svg>
      <svg class="ocean-scene__sheet ocean-scene__sheet--moving" data-scene-slot="bubbles"><circle id="new-bubble-1" /><circle id="new-bubble-2" /></svg>
      <svg class="ocean-scene__sheet ocean-scene__sheet--moving" data-scene-slot="robots"><g id="robot-layer"><g class="robot" id="new-robot"><circle id="new-robot-circle" /></g></g></svg>
      <svg class="ocean-scene__sheet" data-scene-slot="front"><g id="factory-foreground-layer"><circle id="new-fg-circle" /></g></svg>
      <svg class="ocean-scene__sheet ocean-scene__sheet--moving" data-scene-slot="marker"></svg>
    </div>
  </div>`;

/** A later build: movers, which wear the same attribute as the sheets but are not sheets. Robots are
 *  movers in the stage (Phase 53 Task 13), a front and a back one, plus a dissolve copy that is a mover
 *  too but no robot. */
const MOVER_SCENE = `
  <div class="ocean-scene"><div class="ocean-scene__stage">
    <svg class="ocean-scene__sheet" data-scene-slot="back"></svg>
    <div class="mover mover--robot" data-scene-slot="robots-back" id="mover-back-robot"><svg><g class="robot" id="mover-back-group"><circle id="mover-back-circle" /></g></svg></div>
    <div class="mover mover--robot" data-scene-slot="robots" id="mover-front-robot"><svg><g class="robot" id="mover-front-group"><circle id="mover-circle" /></g></svg></div>
    <div class="mover mover--bubbles" data-scene-slot="bubbles"><svg><circle id="mover-bubble" /></svg></div>
    <div class="ocean-scene__dissolve" data-scene-slot="dissolve"><div class="mover mover--dissolve" data-dissolve-copy="r1"><svg><use /></svg></div></div>
  </div></div>`;

const ids = (nodes) => Array.from(nodes).map((n) => n.id);

beforeEach(() => {
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================

describe('SCENE_SLOT_NAMES', () => {
  it('is the scene stack, back to front, exactly as sceneStack.ts names it', () => {
    expect([...SCENE_SLOT_NAMES]).toEqual([...SCENE_SLOTS]);
  });
});

describe('sceneSlotSelector', () => {
  it.each([
    ['the old markup', OLD_SCENE, 'old'],
    ['the stage markup', NEW_SCENE, 'new'],
  ])('finds a slot by name in %s', (_label, html, prefix) => {
    document.body.innerHTML = html;
    for (const name of ['back', 'robots-back', 'mid', 'bubbles', 'robots', 'front', 'marker']) {
      const found = document.querySelectorAll(sceneSlotSelector(name));
      expect(found, `${prefix} ${name}`).toHaveLength(1);
    }
    const bubbles = document.querySelector(sceneSlotSelector('bubbles'));
    expect(ids(bubbles.querySelectorAll('circle'))).toEqual([`${prefix}-bubble-1`, `${prefix}-bubble-2`]);
  });

  it('matches only the slot asked for, not a slot whose name contains it', () => {
    document.body.innerHTML = NEW_SCENE;
    const robots = document.querySelectorAll(sceneSlotSelector('robots'));
    expect(robots).toHaveLength(1);
    expect(robots[0].getAttribute('data-scene-slot')).toBe('robots');
  });

  it('finds nothing for a slot the build does not have', () => {
    document.body.innerHTML = NEW_SCENE;
    expect(document.querySelectorAll(sceneSlotSelector('stations'))).toHaveLength(0);
    expect(document.querySelectorAll(sceneSlotSelector('dissolve'))).toHaveLength(0);
  });

  it('finds every mover of a slot, which share their slot name with the sheets', () => {
    document.body.innerHTML = MOVER_SCENE;
    expect(document.querySelectorAll(sceneSlotSelector('robots'))).toHaveLength(1);
    expect(document.querySelectorAll(sceneSlotSelector('robots-back'))).toHaveLength(1);
    expect(document.querySelectorAll(sceneSlotSelector('back'))).toHaveLength(1);
  });
});

describe('SHEET_SELECTOR', () => {
  it.each([
    ['the old markup', OLD_SCENE],
    ['the stage markup', NEW_SCENE],
  ])('counts the seven sheets in %s', (_label, html) => {
    document.body.innerHTML = html;
    expect(document.querySelectorAll(SHEET_SELECTOR)).toHaveLength(7);
  });

  it('is not the stage, not the dissolve div and not a mover', () => {
    document.body.innerHTML = MOVER_SCENE;
    const matched = Array.from(document.querySelectorAll(SHEET_SELECTOR));
    expect(matched).toHaveLength(1);
    expect(matched[0].getAttribute('data-scene-slot')).toBe('back');
    expect(matched.some((el) => el.classList.contains('ocean-scene__stage') || el.classList.contains('mover'))).toBe(false);
  });
});

describe('BUBBLE_CIRCLES', () => {
  it.each([
    ['the old markup', OLD_SCENE, 'old'],
    ['the stage markup', NEW_SCENE, 'new'],
  ])('finds the bubble circles, and the factory-layer circles of builds before the split, in %s', (_label, html, prefix) => {
    document.body.innerHTML = html;
    expect(ids(document.querySelectorAll(BUBBLE_CIRCLES)).sort()).toEqual(
      [`${prefix}-bg-circle`, `${prefix}-bubble-1`, `${prefix}-bubble-2`, `${prefix}-fg-circle`, `${prefix}-mid-circle`].sort(),
    );
  });

  // Phase 53 Task 18: a stream is a strip mover (`div.mover.mover--bubbles`), not circles in a sheet.
  it('finds the circles inside the strip movers, and only those (a robot mover\'s circle is not a bubble)', () => {
    document.body.innerHTML = MOVER_SCENE;
    expect(ids(document.querySelectorAll(BUBBLE_CIRCLES))).toEqual(['mover-bubble']);
  });

  it('finds every strip\'s circles when there are several streams', () => {
    document.body.innerHTML = `
      <div class="ocean-scene__stage">
        <div class="mover mover--bubbles" data-scene-slot="bubbles"><svg><circle id="s1-a" /><circle id="s1-b" /></svg></div>
        <div class="mover mover--bubbles" data-scene-slot="bubbles"><svg><circle id="s2-a" /></svg></div>
        <div class="mover mover--robot" data-scene-slot="robots"><svg><g class="robot"><circle id="not-a-bubble" /></g></svg></div>
      </div>`;
    expect(ids(document.querySelectorAll(BUBBLE_CIRCLES)).sort()).toEqual(['s1-a', 's1-b', 's2-a']);
  });

  it('leaves the robots, and circles that are neither a bubble nor in a factory layer, alone', () => {
    document.body.innerHTML = NEW_SCENE;
    const found = ids(document.querySelectorAll(BUBBLE_CIRCLES));
    for (const id of ['new-robot-circle', 'new-back-robot-circle', 'new-mid-stray']) expect(found).not.toContain(id);
  });
});

// Phase 53 Task 16: a robot is a mover in the stage, not a group inside a robots sheet; the harness
// reads both so a `main` build still ablates and counts its robots in the same session.
describe('the robot selectors', () => {
  const SCENES = [
    ['the old markup', OLD_SCENE, ['old-back-robot', 'old-robot']],
    ['the sheets markup', NEW_SCENE, ['new-back-robot', 'new-robot']],
    ['the movers markup', MOVER_SCENE, ['mover-back-group', 'mover-front-group']],
  ];

  describe('ROBOT_GROUPS (every robot, counted by its .robot group)', () => {
    it.each(SCENES)('finds both robots in %s', (_label, html, groupIds) => {
      document.body.innerHTML = html;
      expect(ids(document.querySelectorAll(ROBOT_GROUPS)).sort()).toEqual([...groupIds].sort());
    });

    it('does not count a dissolve copy or a bubble stream', () => {
      document.body.innerHTML = MOVER_SCENE;
      expect(document.querySelectorAll(ROBOT_GROUPS)).toHaveLength(2);
    });
  });

  describe('ROBOT_CONTAINERS (what the no-robots ablation hides)', () => {
    it.each([
      ['the old markup', OLD_SCENE, ['robot-back-layer', 'robot-layer']],
      ['the sheets markup', NEW_SCENE, ['robot-back-layer', 'robot-layer']],
      ['the movers markup', MOVER_SCENE, ['mover-back-robot', 'mover-front-robot']],
    ])('finds the robots\' containers in %s', (_label, html, wanted) => {
      document.body.innerHTML = html;
      expect(ids(document.querySelectorAll(ROBOT_CONTAINERS)).sort()).toEqual([...wanted].sort());
    });

    it('takes no other mover: neither the bubble streams nor the dissolve copies', () => {
      document.body.innerHTML = MOVER_SCENE;
      for (const el of document.querySelectorAll(ROBOT_CONTAINERS)) expect(el.classList.contains('mover--robot')).toBe(true);
    });
  });

  describe('ROBOT_DETACH (what the sticky detach removes)', () => {
    it('removes the movers themselves, so no robot layer is left behind', () => {
      document.body.innerHTML = MOVER_SCENE;
      document.querySelectorAll(ROBOT_DETACH).forEach((e) => e.remove());
      expect(document.querySelectorAll('.mover--robot')).toHaveLength(0);
      expect(document.querySelectorAll('.mover--bubbles, .mover--dissolve')).toHaveLength(2);
    });

    it.each([
      ['the old markup', OLD_SCENE],
      ['the sheets markup', NEW_SCENE],
    ])('removes the .robot groups and leaves the rows\' own groups in %s', (_label, html) => {
      document.body.innerHTML = html;
      document.querySelectorAll(ROBOT_DETACH).forEach((e) => e.remove());
      expect(document.querySelectorAll('.robot')).toHaveLength(0);
      expect(document.querySelectorAll('#robot-layer, #robot-back-layer')).toHaveLength(2);
    });
  });

  describe('the rows\' element counts', () => {
    it.each([
      ['the old markup', OLD_SCENE, 'old'],
      ['the sheets markup', NEW_SCENE, 'new'],
    ])('count each row\'s own elements in %s', (_label, html, prefix) => {
      document.body.innerHTML = html;
      expect(ids(document.querySelectorAll(FRONT_ROBOT_ELEMENTS))).toEqual([`${prefix}-robot`, `${prefix}-robot-circle`]);
      expect(ids(document.querySelectorAll(BACK_ROBOT_ELEMENTS))).toEqual([`${prefix}-back-robot`, `${prefix}-back-robot-circle`]);
      expect(ids(document.querySelectorAll(BACK_ROBOT_GROUPS))).toEqual([`${prefix}-back-robot`]);
    });

    it('count the movers\' contents by the slot their mover wears', () => {
      document.body.innerHTML = MOVER_SCENE;
      expect(ids(document.querySelectorAll(FRONT_ROBOT_ELEMENTS)).filter(Boolean)).toEqual(['mover-front-group', 'mover-circle']);
      expect(ids(document.querySelectorAll(BACK_ROBOT_ELEMENTS)).filter(Boolean)).toEqual(['mover-back-group', 'mover-back-circle']);
      expect(ids(document.querySelectorAll(BACK_ROBOT_GROUPS))).toEqual(['mover-back-group']);
    });
  });
});

describe('slotNameOf', () => {
  it('reads the slot from a flat CDP attribute list', () => {
    expect(slotNameOf(['class', 'ocean-scene__sheet', 'data-scene-slot', 'bubbles', 'width', '1920'])).toBe('bubbles');
  });

  it('falls back to the old layer attribute, so a main build is named too', () => {
    expect(slotNameOf(['class', 'ocean-scene__layer', 'data-scene-layer', 'robots-back'])).toBe('robots-back');
  });

  it('prefers the slot attribute when a node has both', () => {
    expect(slotNameOf(['data-scene-layer', 'old', 'data-scene-slot', 'new'])).toBe('new');
    expect(slotNameOf(['data-scene-slot', 'new', 'data-scene-layer', 'old'])).toBe('new');
  });

  it('names nothing for a node with neither attribute, or no attributes at all', () => {
    expect(slotNameOf(['class', 'sc-cabinet-box', 'id', 'x'])).toBeNull();
    expect(slotNameOf([])).toBeNull();
    expect(slotNameOf(undefined)).toBeNull();
  });

  it('reads an attribute name exactly, never as a prefix', () => {
    expect(slotNameOf(['data-scene-slot-extra', 'nope'])).toBeNull();
    expect(slotNameOf(['x-data-scene-slot', 'nope'])).toBeNull();
  });

  it('reads attribute values, never names: a value that looks like the attribute does not count', () => {
    expect(slotNameOf(['class', 'data-scene-slot'])).toBeNull();
    // Long enough that a parser stepping one entry at a time would take the value for a name and
    // return the next entry, 'id'.
    expect(slotNameOf(['class', 'data-scene-slot', 'id', 'x'])).toBeNull();
    expect(slotNameOf(['class', 'data-scene-layer', 'id', 'x'])).toBeNull();
  });

  it('ignores a trailing name with no value', () => {
    expect(slotNameOf(['class', 'sheet', 'data-scene-slot'])).toBeNull();
  });
});

describe('isMoverNode', () => {
  it('is true for a node whose class list has the mover token, with or without modifiers', () => {
    expect(isMoverNode(['class', 'mover mover--robot', 'data-scene-slot', 'robots'])).toBe(true);
    expect(isMoverNode(['data-scene-slot', 'robots', 'class', 'mover'])).toBe(true);
  });

  it('is false for a sheet, a stage or a node with no class', () => {
    expect(isMoverNode(['class', 'ocean-scene__sheet', 'data-scene-slot', 'back'])).toBe(false);
    expect(isMoverNode(['class', 'ocean-scene__layer', 'data-scene-layer', 'back'])).toBe(false);
    expect(isMoverNode(['data-scene-slot', 'robots'])).toBe(false);
    expect(isMoverNode([])).toBe(false);
    expect(isMoverNode(undefined)).toBe(false);
  });

  it('reads whole class tokens only: a modifier or a longer name alone is not a mover', () => {
    expect(isMoverNode(['class', 'mover--robot'])).toBe(false);
    expect(isMoverNode(['class', 'remover movers'])).toBe(false);
  });

  it('reads the class value, never an attribute name or another attribute value', () => {
    expect(isMoverNode(['data-x', 'mover'])).toBe(false);
    expect(isMoverNode(['class', 'sheet', 'id', 'mover'])).toBe(false);
  });
});

describe('idle-paint.mjs uses them', () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'idle-paint.mjs'), 'utf-8');

  it('imports the helpers from the lib and declares no scene selectors of its own', () => {
    expect(source).toMatch(/from '\.\/scene-markup-lib\.mjs'/);
    for (const name of ['BUBBLE_CIRCLES', 'SCENE_SLOT_NAMES', 'SHEET_SELECTOR', 'sceneSlotSelector', 'slotNameOf']) {
      expect(source, name).toContain(name);
    }
    expect(source).not.toMatch(/const SCENE_LAYERS\b/);
  });

  // Importing a helper is not using it: each is pinned where it does its work.
  it('uses the robot selectors where they count: the ablations, the detach, the scene line and the stack line', () => {
    expect(source).toContain('const ROBOTS = ROBOT_CONTAINERS;');
    expect(source).toContain("{ name: 'no-robots', css: `${ROBOTS} { display: none !important; }` }");
    expect(source).toContain('document.querySelectorAll(${JSON.stringify(ROBOT_DETACH)}).forEach((e) => e.remove())');
    expect(source).toContain('const robots = await evaluate(`document.querySelectorAll(${JSON.stringify(ROBOT_GROUPS)}).length`);');
    expect(source).toContain('JSON.stringify(FRONT_ROBOT_ELEMENTS)');
    expect(source).toContain('JSON.stringify(BACK_ROBOT_ELEMENTS)');
    expect(source).toContain('JSON.stringify(BACK_ROBOT_GROUPS)');
  });

  it('keeps no robot-row id of its own: the lib reads both markups', () => {
    expect(source).not.toContain('#robot-layer');
    expect(source).not.toContain('#robot-back-layer');
    expect(source).not.toContain('mover--robot');
  });

  it('uses each helper where it counts', () => {
    expect(source).toContain('const BUBBLES = BUBBLE_CIRCLES;');
    expect(source).toContain('SCENE_SLOT_NAMES.map((name) => [name, sceneSlotSelector(name)])');
    expect(source).toContain('document.querySelectorAll(${JSON.stringify(SHEET_SELECTOR)})');
    expect(source).toContain('const name = slotNameOf(attrs);');
    expect(source).toContain('JSON.stringify(SLOT_SELECTORS)');
    expect(source).toContain('SCENE_SLOT_NAMES.map((name) => `${name} ${perLayer[name]}`)');
  });

  it('reads the redrawn area and the mover layers where they count', () => {
    expect(source).toContain("from './paint-area-lib.mjs'");
    expect(source).toContain('redrawnArea(mainPaints, { dpr: view.dpr, frames, viewport: view.viewport })');
    expect(source).toContain("'screens/frame'");
    expect(source).toContain('mover: isMoverNode(attrs)');
    expect(source).toContain('Mover layers: ${moverLayers.length}');
  });

  it('keeps no hard-coded layer or slot attribute selector: the lib reads both markups', () => {
    expect(source).not.toContain('data-scene-layer');
    expect(source).not.toContain('data-scene-slot');
    expect(source).not.toContain('ocean-scene__layer');
    expect(source).not.toContain('ocean-scene__sheet');
  });
});
