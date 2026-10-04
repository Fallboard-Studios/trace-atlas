import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/ROBOT_LAYER_MARKERS.md Tasks 6-7. A docs-only task has no behaviour to test, so this
// makes its acceptance criteria executable: (1) the third guardrail carve-out lands identically
// in both instruction files and documents exactly the three non-audio carriers (identity colour
// on window glass + lamp, and the two layer sockets), (2) ROBOT_DESIGN.md states a socket's lit
// state is audio (gain) and only its hue is identity, (3) the live docs name real code, and
// (4) the roadmap records Phase 38.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

describe('the third guardrail carve-out (Task 6)', () => {
  const claudeMd = read('CLAUDE.md');
  const copilotMd = read('.github/copilot-instructions.md');

  function visualMappingLine(text: string): string {
    const line = text.split('\n').find((l) => l.trimStart().startsWith('- Visual Mapping:'));
    expect(line, 'a Visual Mapping guardrail line exists').toBeDefined();
    return line!;
  }

  it('CLAUDE.md and .github/copilot-instructions.md carry an identical Visual Mapping guardrail line', () => {
    expect(visualMappingLine(claudeMd)).toBe(visualMappingLine(copilotMd));
  });

  it('the guardrail names all three non-audio carriers: identityColor (window + lamp) and the two layer sockets', () => {
    const line = visualMappingLine(claudeMd);
    expect(line).toContain('identityColor');
    expect(line).toContain('window');
    expect(line).toContain('lamp');
    expect(line).toContain('socket');
    expect(line).toContain('greebles');
    expect(line).toContain('Non-audio layers');
  });

  it('ROBOT_DESIGN.md\'s "Non-audio layers" section names exactly three carriers, including the layer sockets', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    const at = doc.indexOf('## Non-audio layers');
    expect(at, 'Non-audio layers section exists').toBeGreaterThan(-1);
    const nextHeading = doc.indexOf('\n## ', at + 1);
    const section = doc.slice(at, nextHeading === -1 ? undefined : nextHeading);
    expect(section).toContain('window glass');
    expect(section).toContain('lamp');
    expect(section).toContain('greeble');
    expect(section).toMatch(/socket/i);
  });

  it('ROBOT_DESIGN.md states a socket\'s lit state is audio (gain) and only its hue is identity', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    const at = doc.indexOf('## Non-audio layers');
    const nextHeading = doc.indexOf('\n## ', at + 1);
    const section = doc.slice(at, nextHeading === -1 ? undefined : nextHeading);
    expect(section).toMatch(/lit state.*(is|are).*(audio|gain)/i);
    expect(section).toMatch(/only.*hue.*identity/i);
  });

  it('the Forbidden Patterns section still names both non-audio exceptions (colour and shape/placement)', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    const at = doc.indexOf('## Forbidden Patterns');
    expect(at).toBeGreaterThan(-1);
    const section = doc.slice(at);
    expect(section).toMatch(/identityColor/);
    expect(section).toMatch(/greeble/i);
    expect(section).toContain('Non-audio layers');
  });

  it('Robot.ts\'s identityColor comment lists the three carriers: window glass, lamp and layer sockets', () => {
    const file = read('src/types/Robot.ts');
    const at = file.indexOf('identityColor: string;');
    const commentStart = file.lastIndexOf('/**', at);
    const comment = file.slice(commentStart, at);
    expect(comment).toContain('window glass');
    expect(comment).toContain('lamp');
    expect(comment).toMatch(/socket/i);
  });
});

describe('the live docs name real code (Task 7)', () => {
  const symbols: Array<[symbol: string, file: string]> = [
    ['socketLitOpacity', 'src/components/robot/robotVisualHelpers.ts'],
    ['SOCKET_DARK', 'src/components/robot/robotVisualHelpers.ts'],
    ['SOCKET_MIN', 'src/components/robot/robotVisualHelpers.ts'],
    ['SOCKET_GAIN_MAX', 'src/components/robot/robotVisualHelpers.ts'],
    ['SOCKET_POSITIONS', 'src/components/robot/greebleSlots.ts'],
    ['RobotLayerSockets', 'src/components/robot/RobotLayerSockets.tsx'],
  ];

  it.each(symbols)('%s exists in %s', (symbol, file) => {
    expect(existsSync(resolve(repoRoot, file)), `${file} exists`).toBe(true);
    expect(read(file), `${file} defines ${symbol}`).toMatch(new RegExp(`\\b${symbol}\\b`));
  });

  it('docs/ROBOT_DESIGN.md names every one of the live socket symbols above', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    for (const [symbol] of symbols) expect(doc, `ROBOT_DESIGN.md names ${symbol}`).toContain(symbol);
  });
});

describe('the roadmap records Phase 38 (Task 7)', () => {
  it('has a Phase 38 — Robot Layer Markers entry linking intent, spec and plan', () => {
    const roadmap = read('docs/todo/roadmap.md');
    expect(roadmap).toMatch(/^## 38\. Robot Layer Markers$/m);
    const phase = roadmap.slice(roadmap.indexOf('## 38. Robot Layer Markers'));
    expect(phase).toContain('docs/intent/robot-layer-markers.md');
    expect(phase).toContain('docs/specs/ROBOT_LAYER_MARKERS.md');
    expect(phase).toContain('docs/tasks/ROBOT_LAYER_MARKERS.md');
    expect(phase).toContain('### About');
    expect(phase).toContain('### Not Doing');
  });
});

describe('intent and spec carry Shipped headers (Task 7)', () => {
  it('docs/intent/robot-layer-markers.md is marked Shipped, linking the spec and plan', () => {
    const doc = read('docs/intent/robot-layer-markers.md');
    expect(doc).toMatch(/^> \*\*Shipped \(roadmap Phase 38/m);
    expect(doc).toContain('docs/specs/ROBOT_LAYER_MARKERS.md');
    expect(doc).toContain('docs/tasks/ROBOT_LAYER_MARKERS.md');
  });

  it('docs/specs/ROBOT_LAYER_MARKERS.md is marked Shipped', () => {
    const doc = read('docs/specs/ROBOT_LAYER_MARKERS.md');
    expect(doc).toMatch(/\*\*Shipped \(roadmap Phase 38/);
  });

  it('the pods one-pager\'s header records the static half as shipped (Phase 38), motion remaining', () => {
    const doc = read('docs/ideas/layer-pods-and-follow-through.md');
    expect(doc).toMatch(/static half shipped \(Phase 38\)/i);
    expect(doc).toMatch(/motion remains/i);
  });

  it('the series one-pager ticks branch 3 (layer markers) as shipped', () => {
    const doc = read('docs/ideas/robot-visual-rework.md');
    const at = doc.indexOf('**Layer markers**');
    expect(at, 'branch 3 entry exists').toBeGreaterThan(-1);
    const entry = doc.slice(at, doc.indexOf('\n\n## ', at));
    expect(entry).toMatch(/shipped/i);
  });
});
