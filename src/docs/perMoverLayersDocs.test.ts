import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SCENE_SLOTS } from '../components/panels/screen/worldView/sceneStack';

// docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md Tasks 22 and 23 (roadmap Phase 53). A docs task has no behaviour to
// test, so this makes its criteria executable, in the pattern of robotJobsJ4Docs.test.ts: ANIMATION_SYSTEM.md's
// "Scene stack" table lists SCENE_SLOTS in order and marks the mover slots, its "Layer switch" section says a row
// switch is a slot write with no re-mount and names what it uses (each name checked against its source file,
// word-bounded); the ref-registry paragraph names the widened element type; ROBOT_DESIGN.md, BUILDING_DESIGN.md
// and PERFORMANCE.md say what the shipped source says; and no current doc still names a removed identifier.
// PERFORMANCE.md is the measurement history and keeps the old names on purpose (rows about builds that had them),
// as do the intent, spec, plan and archives; the stale-name sweep covers the docs that describe how the code is.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

/** The text from a heading line to the next heading of the same or a higher level. */
function section(doc: string, heading: string): string {
  const at = doc.indexOf(`\n${heading}\n`);
  if (at === -1) return '';
  const level = heading.match(/^#+/)![0].length;
  const rest = doc.slice(at + heading.length + 2);
  const next = rest.search(new RegExp(`^#{1,${level}} `, 'm'));
  return heading + '\n' + (next === -1 ? rest : rest.slice(0, next));
}

/** A whole-word match for an identifier or id: not inside a longer word, kebab-case id or camel-case name. */
const word = (name: string) => new RegExp(`(?<![\\w-])${name.replace(/[-.]/g, '\\$&')}(?![\\w-])`);

const STAGE_DIR = 'src/components/panels/screen/worldView';
const oceanScene = read(`${STAGE_DIR}/OceanScene.tsx`);

/** The sheets OceanScene.tsx renders, in render order: the static slots. Every other slot is a mover slot. */
const STATIC_SLOTS = [...oceanScene.matchAll(/<Sheet slot="([a-z-]+)"/g)].map((m) => m[1]);

const STACK_HEADING = '### Scene stack — the stage, the sheets and the movers';

describe('ANIMATION_SYSTEM.md: the scene stack', () => {
  const doc = read('docs/ANIMATION_SYSTEM.md');
  const stack = section(doc, STACK_HEADING);
  const rows = stack.split('\n').filter((l) => /^\| `[a-z-]+` \|/.test(l));
  const cellsOf = (line: string) => line.split('|').slice(1, -1).map((c) => c.trim());

  it('has the renamed section, and the old "Scene layers" heading is gone', () => {
    expect(stack).not.toBe('');
    expect(doc).not.toMatch(/^### Scene layers/m);
  });

  it('lists every SCENE_SLOTS entry in order, one table row each', () => {
    expect(rows.map((l) => cellsOf(l)[0].replace(/`/g, ''))).toEqual([...SCENE_SLOTS]);
  });

  it('marks exactly the slots OceanScene.tsx renders as sheets as static, and every other slot as a mover', () => {
    expect(STATIC_SLOTS.length).toBeGreaterThan(0);
    for (const line of rows) {
      const [slot, kind] = cellsOf(line).map((c) => c.replace(/`/g, ''));
      const isStatic = STATIC_SLOTS.includes(slot);
      expect(kind.startsWith(isStatic ? 'static' : 'mover'), `${slot}: ${kind}`).toBe(true);
    }
  });

  it('names the stage, the fit, and each mover class as OceanScene.css and the components define them', () => {
    expect(stack).toContain('ocean-scene__stage');
    expect(stack).toMatch(word('sceneFit'));
    expect(stack).toMatch(word('useStageFit'));
    for (const cls of ['mover--robot', 'mover--bubbles', 'mover--marker', 'mover--dissolve']) {
      expect(stack, cls).toContain(cls);
    }
    expect(read(`${STAGE_DIR}/OceanScene.css`)).toContain('.ocean-scene__stage');
  });

  it('states every depth tint with its OceanScene.tsx opacity', () => {
    const tints = [...oceanScene.matchAll(/^\s+([ABCD]): \{ top: [^}]+, alpha: ([\d.]+) \}/gm)];
    expect(tints).toHaveLength(4);
    for (const [, slot, alpha] of tints) {
      expect(stack, `tint ${slot}`).toMatch(new RegExp(`\\b${slot}\\b[^.]*?${Number(alpha).toFixed(2).replace('.', '\\.')}`));
    }
  });

  it('says every moving thing is a mover and no sheet moves (the rule the sheets are for)', () => {
    expect(stack).toMatch(/no sheet (is promoted|moves)/i);
    expect(stack).toMatch(/will-change: transform/);
    expect(stack).toMatch(/Anything that moves every frame is a mover/);
  });

  it('puts each station fragment on the sheet OceanScene.tsx draws it in', () => {
    // l4 at the end of back, l3 in stations, front at the start of front.
    const sheetOf = (id: string) => {
      const at = oceanScene.indexOf(`<g id="${id}">`);
      const before = [...oceanScene.slice(0, at).matchAll(/<Sheet slot="([a-z-]+)"/g)].pop()![1];
      return before;
    };
    expect(sheetOf('station-l4-layer')).toBe('back');
    expect(sheetOf('station-l3-layer')).toBe('stations');
    expect(sheetOf('station-front-layer')).toBe('front');
    expect(stack).toMatch(/`#station-l4-layer`[^|\n]*\bback\b|\bback\b[^|\n]*`#station-l4-layer`/);
    expect(stack).toMatch(/`#station-l3-layer`/);
    expect(stack).toMatch(/`#station-front-layer`/);
  });
});

describe('ANIMATION_SYSTEM.md: the layer switch', () => {
  const doc = read('docs/ANIMATION_SYSTEM.md');
  const sw = section(doc, '### Layer switch');

  it('says a row switch is a slot write with no re-mount', () => {
    expect(sw).not.toBe('');
    expect(sw).toMatch(/slot write|write of `layer`/);
    expect(sw).toMatch(/\*\*No re-mount\.\*\*/);
  });

  it.each([
    ['dissolve', 'src/systems/workLoop.ts'],
    ['removeCopy', 'src/systems/workLoop.ts'],
    ['moveToRow', 'src/systems/workLoop.ts'],
    ['slotForLayer', `${STAGE_DIR}/sceneStack.ts`],
    ['sceneFit', `${STAGE_DIR}/sceneFit.ts`],
    ['useStageFit', `${STAGE_DIR}/useStageFit.ts`],
  ])('names %s, and %s\'s source defines it', (name, source) => {
    expect(sw, `Layer switch names ${name}`).toMatch(word(name));
    // Defined there, not just mentioned (a comment can outlive a rename).
    expect(read(source), `${source} defines ${name}`).toMatch(new RegExp(`(function|const) ${name}\\b`));
  });

  it('names the copy\'s class and the selector the sweeps use', () => {
    expect(sw).toContain('.mover--dissolve');
    expect(sw).toContain('data-dissolve-copy');
    expect(read('src/systems/workLoop.ts')).toContain('.mover--dissolve[data-dissolve-copy');
  });

  it('describes the dissolve key without a pending-mark sweep, and stopWorkLoop without layer-switch marks', () => {
    const keys = section(doc, '### Robot timeline keys');
    expect(keys).toMatch(/^\| `` `dissolve-\$\{robotId\}` `` \|[^\n]*\.mover--dissolve/m);
    expect(keys).not.toMatch(/pending layer-switch mark/);
    expect(keys).not.toMatch(/<use>` copy too/);
  });
});

describe('ANIMATION_SYSTEM.md: the ref registry', () => {
  it('names RefElement, which refs.ts exports, and says a robot ref is its mover', () => {
    const doc = read('docs/ANIMATION_SYSTEM.md');
    const registry = doc.split('\n').find((l) => l.includes('`setRef(key, element)`'));
    expect(registry, 'the ref-registry paragraph').toBeDefined();
    expect(registry).toMatch(word('RefElement'));
    expect(registry).toMatch(/mover/);
    expect(read('src/utils/refs.ts')).toMatch(/export type RefElement = SVGElement \| HTMLElement/);
  });
});

describe('ROBOT_DESIGN.md: the world render context', () => {
  const contexts = section(read('docs/ROBOT_DESIGN.md'), '## Render contexts');

  it('puts the world body in a mover the work loop and swim write, with no React transform', () => {
    expect(contexts).toContain('`.mover--robot`');
    expect(contexts).toMatch(/getRef\('robot-<id>'\)|`robot-\{id\}`|robot-\$\{id\}/);
    expect(read('src/components/robot/Robot.tsx')).toContain('className="mover mover--robot"');
  });

  it('says the swim pivots about the gem canvas centre and the halo and orbiters draw outside the box', () => {
    expect(contexts).toMatch(/The swim tilts about the gem canvas cent(re|er)/);
    expect(contexts).toMatch(/overflow="visible"|overflow: visible|overflow-visible/);
    expect(read('src/components/robot/Robot.tsx')).toContain('overflow="visible"');
  });

  it('no longer calls the root group the thing GSAP positions', () => {
    expect(contexts).not.toMatch(/owns the root `<g>` \(GSAP sets position/);
  });
});

describe('BUILDING_DESIGN.md: the station fragments', () => {
  const doc = read('docs/BUILDING_DESIGN.md');
  const fragments = section(doc, '### Station fragments and their sheets');

  it('has the section, naming the three ids and the three sheets', () => {
    expect(fragments).not.toBe('');
    for (const id of ['station-l4-layer', 'station-l3-layer', 'station-front-layer']) {
      expect(fragments, id).toContain(`#${id}`);
      expect(oceanScene, `OceanScene.tsx draws ${id}`).toContain(`id="${id}"`);
    }
    for (const slot of ['back', 'stations', 'front']) expect(fragments, slot).toContain(`\`${slot}\``);
  });

  it('says none of them is on a moving sheet, and that the ripple is the only animation', () => {
    expect(fragments).toMatch(/static/i);
    expect(fragments).toMatch(/ripple/);
  });
});

describe('PERFORMANCE.md: the localizer\'s columns', () => {
  const localizer = section(read('docs/PERFORMANCE.md'), '### The localizer — `npm run perf:idle`');

  it('names the redrawn-area columns, the clamp, the unresolved count and the mover readout', () => {
    expect(localizer).not.toBe('');
    expect(localizer).toContain('redrawn px²/frame');
    expect(localizer).toContain('screens/frame');
    expect(localizer).toMatch(/clamp/i);
    expect(localizer).toContain('unresolved Paints');
    expect(localizer).toContain('Mover layers');
  });

  it('every one of those strings is printed by the harness', () => {
    const harness = ['scripts/perf/idle-paint.mjs', 'scripts/perf/paint-area-lib.mjs']
      .map((p) => read(p))
      .join('\n');
    for (const label of ['redrawn px²/frame', 'screens/frame', 'unresolved Paints', 'Mover layers']) {
      expect(harness, label).toContain(label);
    }
  });
});

describe('no current doc still names a removed identifier', () => {
  const REMOVED = [
    'markLayerSwitching',
    'isLayerSwitching',
    'clearLayerSwitching',
    'robot-back-layer',
    'robot-layer',
    'ocean-scene__layer--moving',
    'remounts',
  ];
  // The docs that describe how the code is: the top-level guides and CLAUDE.md. Not PERFORMANCE.md (history),
  // not intent/spec/tasks/ideas/sketches/todo/archive (records of what was planned or shipped at the time).
  const current = [
    'CLAUDE.md',
    ...readdirSync(resolve(repoRoot, 'docs'))
      .filter((f) => f.endsWith('.md') && f !== 'PERFORMANCE.md')
      .map((f) => `docs/${f}`),
  ];

  it('the sweep covers the docs this phase touches', () => {
    for (const doc of ['docs/ANIMATION_SYSTEM.md', 'docs/ROBOT_DESIGN.md', 'docs/BUILDING_DESIGN.md', 'docs/ROBOT_LIFECYCLE.md']) {
      expect(current).toContain(doc);
    }
  });

  // `remounts` is also the plain English verb (CONSOLE_THEMING.md says a component "remounts"), so the removed
  // field is matched in its code forms only: backticked, or as a member (`LoopRun.remounts`).
  const asNamed = (name: string) => (name === 'remounts' ? /`remounts`|\.remounts\b/ : word(name));

  it.each(REMOVED)('%s appears in none of them', (name) => {
    const hits = current.filter((p) => asNamed(name).test(read(p)));
    expect(hits).toEqual([]);
  });

  it.each(REMOVED.filter((n) => !n.includes('-')))('%s is gone from the source too (the doc is not just ahead of the code)', (name) => {
    const src = [
      'src/systems/workLoop.ts',
      'src/systems/robotMotionRegistry.ts',
      'src/components/robot/gem/useOrbiterMotion.ts',
      `${STAGE_DIR}/OceanScene.tsx`,
    ].map((p) => (existsSync(resolve(repoRoot, p)) ? read(p) : ''));
    // A comment may explain the removal; no code line may use it. Strip line and block comments.
    const code = src.map((s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, ''));
    for (const c of code) expect(c).not.toMatch(word(name));
  });

  it('ROBOT_LIFECYCLE.md no longer says a row switch re-mounts the robot', () => {
    expect(read('docs/ROBOT_LIFECYCLE.md')).not.toMatch(/re-mounts in its new row/);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Task 23: the roadmap entry, the backlog pointer and the status headers. The outcomes are written as they
// were: the Task 20 headline criterion is a MISS (0.31 x main against 0.25) and stays one; the Pixel listen
// ran with no main count; Checkpoints B and C were never recorded as passed; the branch is not merged.
// ---------------------------------------------------------------------------------------------------------

/** Prose with its line breaks, blockquote markers and runs of spaces collapsed to single spaces. */
const flat = (text: string) => text.replace(/\n>/g, '\n').replace(/\s+/g, ' ');

/** Roadmap Phase 53, up to the next `## ` heading (or the end of the file). */
function phase53(): string {
  const roadmap = read('docs/todo/roadmap.md');
  const at = roadmap.indexOf('\n## 53. Per-Mover Compositor Layers');
  if (at === -1) return '';
  const rest = roadmap.slice(at + 1);
  const next = rest.indexOf('\n## ', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('roadmap Phase 53', () => {
  const phase = phase53();

  it('exists, after Phase 52, and is no longer proposed', () => {
    expect(phase).not.toBe('');
    const roadmap = read('docs/todo/roadmap.md');
    expect(roadmap.indexOf('\n## 53. ')).toBeGreaterThan(roadmap.indexOf('\n## 52. '));
    expect(phase).not.toMatch(/\bproposed\b/i);
  });

  it('links the intent, the spec and the plan, and every link resolves', () => {
    for (const doc of ['intent/per-mover-compositor-layers.md', 'specs/PER_MOVER_COMPOSITOR_LAYERS.md', 'tasks/PER_MOVER_COMPOSITOR_LAYERS.md']) {
      expect(phase, doc).toContain(`](../${doc})`);
    }
    const dir = resolve(repoRoot, 'docs/todo');
    const missing = [...phase.matchAll(/\]\(([^)\s]+)\)/g)]
      .map((m) => m[1].split('#')[0])
      .filter((t) => t && !/^[a-z]+:/i.test(t))
      .filter((t) => !existsSync(resolve(dir, t)));
    expect(missing).toEqual([]);
  });

  it('has the Phase 52 shape: a status paragraph, About, Not Doing and Open', () => {
    expect(phase).toContain('### About');
    expect(phase).toContain('### Not Doing (and why)');
    expect(phase).toContain('### Open');
  });

  it('states the outcomes as they were: the gate miss with its numbers, the Pixel listen, the unrecorded checkpoints, unmerged', () => {
    const status = flat(phase.slice(0, phase.indexOf('### About')));
    expect(status, 'the headline miss').toMatch(/MISS/);
    expect(status, 'its ratio and limit').toMatch(/0\.31 × `?main`?/);
    expect(status).toMatch(/0\.25/);
    expect(status, 'the criteria that passed').toMatch(/busy/i);
    expect(status).toMatch(/layer memory/i);
    expect(status, 'the Pixel listen as it ran').toMatch(/Pixel listen/i);
    expect(status).toMatch(/about 12 underruns|12 underruns/);
    expect(status, 'no main count').toMatch(/\bno `?main`? (listen|count)\b/i);
    expect(status, 'checkpoints B and C').toMatch(/Checkpoints? B and C/);
    expect(status, 'not merged').toMatch(/not (yet )?merged/i);
    expect(status, 'the gate is not described as passed').not.toMatch(/gate (passed|met)|passed the gate/i);
  });

  it('records, in Not Doing, the audio-headroom default, the machine-side fixes and the re-mount path', () => {
    const notDoing = flat(phase.slice(phase.indexOf('### Not Doing (and why)'), phase.indexOf('### Open')));
    expect(notDoing).toMatch(/audio[- ]headroom/i);
    expect(notDoing).toMatch(/machine-side/i);
    expect(notDoing).toMatch(/re-mount/i);
  });

  it('Open names the document-layer repaint and the bubble-strip memory question', () => {
    const open = flat(phase.slice(phase.indexOf('### Open')));
    expect(open).toMatch(/document layer/i);
    expect(open).toMatch(/bubble strip|bubbles/i);
    expect(open, 'the open main comparison for the listen').toMatch(/`?main`? (count|listen|comparison)/i);
  });

  it('every identifier it names exists in source', () => {
    for (const [name, source] of [
      ['SCENE_SLOTS', `${STAGE_DIR}/sceneStack.ts`],
      ['sceneFit', `${STAGE_DIR}/sceneFit.ts`],
      ['redrawnArea', 'scripts/perf/paint-area-lib.mjs'],
    ] as const) {
      if (!word(name).test(phase)) continue;
      expect(read(source), `${source} defines ${name}`).toMatch(word(name));
    }
  });
});

describe('backlog item 26', () => {
  const backlog = read('docs/todo/backlog.md');
  // Prose wraps, so the status is matched on its words with line breaks collapsed.
  const item = flat(section(backlog, '### 26. Desktop Paint: Stage-Sized Moving Layers Re-Raster Every Frame'));

  it('points at the shipped phase: candidates 1 and 2 done, 3 not taken, the document layer left open', () => {
    expect(item).not.toBe('');
    expect(item).toContain('](roadmap.md#53-per-mover-compositor-layers');
    expect(item).toMatch(/[Cc]andidate 1[^.\n]*done/);
    expect(item).toMatch(/[Cc]andidate 2[^.\n]*done/);
    expect(item).toMatch(/[Cc]andidate 3[^.\n]*not taken/);
    expect(item).toMatch(/document layer/i);
    // On the raw section: `flat` has no line starts left. Archived items (J4's item 8) open with "**Closed**".
    const raw = section(backlog, '### 26. Desktop Paint: Stage-Sized Moving Layers Re-Raster Every Frame');
    expect(raw, 'the open item is not closed').not.toMatch(/^\*\*Closed\*\*/m);
  });

  it('the anchor it links exists as a roadmap heading', () => {
    const anchor = /\(roadmap\.md#([a-z0-9-]+)\)/.exec(item)?.[1];
    expect(anchor).toBeDefined();
    const heading = /^## (53\. .+)$/m.exec(read('docs/todo/roadmap.md'))![1];
    const slug = heading.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s/g, '-');
    expect(anchor).toBe(slug);
  });
});

describe('the intent, the spec and the plan carry a status header', () => {
  const docs = [
    'docs/intent/per-mover-compositor-layers.md',
    'docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md',
    'docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md',
  ];

  /** The first `> **Status` blockquote paragraph, if it is in the first 40 lines. */
  const header = (path: string) => {
    const head = read(path).split('\n').slice(0, 40).join('\n');
    const at = head.indexOf('> **Status');
    if (at === -1) return '';
    const rest = head.slice(at);
    const end = rest.search(/\n(?!>)/);
    return flat(end === -1 ? rest : rest.slice(0, end));
  };

  it.each(docs)('%s opens with the status, naming both gates\' outcomes', (path) => {
    const status = header(path);
    expect(status, `${path} has a "> **Status" header`).not.toBe('');
    expect(status).toMatch(/Phase 53/);
    expect(status, 'the Task 20 miss').toMatch(/MISS/);
    expect(status).toMatch(/0\.31/);
    expect(status, 'the Pixel listen, including that no main count was taken').toMatch(/Pixel listen/);
    expect(status).toMatch(/\bno `?main`? (listen|count)\b/i);
    expect(status).toMatch(/not (yet )?merged/i);
  });

  it.each(docs.slice(1))('%s no longer says the roadmap entry is proposed', (path) => {
    const head = read(path).split('\n').slice(0, 40).join('\n');
    expect(head).not.toMatch(/Roadmap Phase 53 \(proposed/);
  });

  it('the plan ticks Task 23', () => {
    expect(read('docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md')).toMatch(/^- \[x\] \*\*Task 23: Roadmap 53, backlog 26, status headers\*\*/m);
  });
});

describe('every relative link in the docs this phase touches resolves', () => {
  /** Every relative markdown link target in `doc` (anchors and URLs left out). */
  const targets = (doc: string) =>
    [...doc.matchAll(/\]\(([^)\s]+)\)/g)]
      .map((m) => m[1].split('#')[0])
      .filter((t) => t && !/^[a-z]+:/i.test(t));

  it.each(['docs/ANIMATION_SYSTEM.md', 'docs/ROBOT_DESIGN.md', 'docs/BUILDING_DESIGN.md', 'docs/ROBOT_LIFECYCLE.md'])('%s', (path) => {
    const dir = dirname(resolve(repoRoot, path));
    expect(targets(read(path)).filter((t) => !existsSync(resolve(dir, t)))).toEqual([]);
  });
});
