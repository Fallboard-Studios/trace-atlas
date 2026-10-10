/**
 * The content guard (docs/specs/CONTENT_LAYER.md §1.7, Task 18) — what keeps the content module
 * honest after the migration:
 *   - every key is referenced from somewhere in src/ outside src/content/ (dead copy is a smell:
 *     either a consumer was lost, or the key was never wired);
 *   - every entry has a non-empty human name;
 *   - keys follow the grammar and start with an area from the closed list;
 *   - two entries in the same area never carry an identical human+lore pair (a duplicate concept).
 * The "no `[c]` placeholder anywhere" assertion lands with Task 17, the review gate that removes
 * them — until then the placeholders sit verbatim in src/content on purpose.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CONTENT, CONTENT_AREAS, labels, type ContentKey } from './index';
import type { ContentEntry } from './types';
import * as audioRigConfig from '@/data/audioRigConfig';
import * as sectorSettingsConfig from '@/data/sectorSettingsConfig';
import * as sessionConfig from '@/data/sessionConfig';
import type { ControlSchema } from '@/types/controls';

const SRC = resolve(__dirname, '..');
const CONTENT_DIR = resolve(__dirname);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Every source file outside src/content (tests included — a key used only by a test is still a smell, but
 *  the guard is about app reachability, so tests are excluded here). */
const consumerSource = walk(SRC)
  .filter((p) => !p.startsWith(CONTENT_DIR) && !/\.test\.(ts|tsx)$/.test(p))
  .map((p) => ({ rel: relative(SRC, p), text: readFileSync(p, 'utf8') }));
const allConsumerText = consumerSource.map((f) => f.text).join('\n');

const keys = Object.keys(CONTENT) as ContentKey[];

const isReferenced = (k: string) => allConsumerText.includes(`'${k}'`) || allConsumerText.includes(`"${k}"`);

/** Keys a task plan adds ahead of the component that reads them, each naming the task that wires it.
 *  Exempt from the unreferenced check only while they are still unreferenced: the moment a consumer
 *  lands, the self-cleaning test below fails until the key leaves this list. Empty between plans
 *  (docs/tasks/LAYOUT_REWORK.md: empty again by Checkpoint A). */
const AWAITING_CONSUMER: Partial<Record<ContentKey, string>> = {};

describe('content guard', () => {
  it('every key is referenced from src/ outside src/content', () => {
    const unreferenced = keys.filter((k) => !isReferenced(k) && !(k in AWAITING_CONSUMER)).sort();
    expect(unreferenced, `unreferenced content keys:\n  ${unreferenced.join('\n  ')}`).toEqual([]);
  });

  it('every key awaiting a consumer exists and is still unreferenced (remove it once wired)', () => {
    const pending = Object.keys(AWAITING_CONSUMER);
    expect(pending.filter((k) => !(k in CONTENT)), 'awaiting-consumer keys missing from CONTENT').toEqual([]);
    expect(pending.filter(isReferenced), 'now referenced — remove from AWAITING_CONSUMER').toEqual([]);
  });

  it('every entry has a non-empty human name', () => {
    const empty = keys.filter((k) => !CONTENT[k].human || CONTENT[k].human.trim() === '');
    expect(empty).toEqual([]);
  });

  it('keys follow the grammar and start with an area from the closed list', () => {
    const grammar = /^[a-z]+(\.[a-zA-Z0-9]+){1,3}$/;
    const bad = keys.filter((k) => !grammar.test(k) || !(CONTENT_AREAS as readonly string[]).includes(k.split('.')[0]));
    expect(bad).toEqual([]);
  });

  it('keys are never surface-named (…Row / …Heading / …Accordion / …Panel)', () => {
    const surfaceNamed = keys.filter((k) => /\.(row|heading|accordion|panel)$/i.test(k));
    expect(surfaceNamed).toEqual([]);
  });

  it('no two entries in the same area carry an identical human + lore pair (duplicate concept)', () => {
    // Known, deliberate exceptions — parallel controls whose copy happens to match today. Listed in
    // the inventory's conflicts table so the review gate (Task 17) can give them distinct lore.
    const ALLOWED = new Set(['fleet.hpf.resonance ≡ fleet.lpf.resonance', 'fleet.lpf.resonance ≡ fleet.hpf.resonance']);
    const seen = new Map<string, ContentKey>();
    const dupes: string[] = [];
    for (const k of keys) {
      const e = CONTENT[k] as { human: string; lore?: string };
      if (e.lore === undefined) continue; // a bare human word (e.g. "Cutoff" on two filters) is allowed to recur
      const sig = `${k.split('.')[0]}|${e.human}|${e.lore}`;
      const prior = seen.get(sig);
      if (prior && !ALLOWED.has(`${prior} ≡ ${k}`)) dupes.push(`${prior} ≡ ${k}`);
      else if (!prior) seen.set(sig, k);
    }
    expect(dupes).toEqual([]);
  });

  it('help copy is plain text — the popover renders it as text, never as markup', () => {
    const marked = keys.filter((k) => {
      const help = (CONTENT[k] as ContentEntry).help;
      return help !== undefined && /[<>]/.test(`${help.human}${help.lore ?? ''}`);
    });
    expect(marked).toEqual([]);
  });

  it('every help has a non-empty human description', () => {
    const empty = keys.filter((k) => {
      const help = (CONTENT[k] as ContentEntry).help;
      return help !== undefined && help.human.trim() === '';
    });
    expect(empty).toEqual([]);
  });
});

// ----------------------------------------
// HELP COVERAGE (docs/specs/LAYOUT_REWORK.md §1.4, §7 Q7; docs/tasks/LAYOUT_REWORK.md Task 10)
// ----------------------------------------
// Every control the user sets a value on carries help — the "?" on its label. Buttons are not on the
// list: a button's labels sit inside its own face, so it has no label row for a "?" to stand on (a
// button inside a button). Panels, headings and accordions are not controls.

const VALUE_CONTROL_TYPES: ReadonlySet<ControlSchema['type']> = new Set([
  'stepper', 'stepperToggle', 'sliderLinear', 'sliderLog', 'sliderCenteredZero', 'radio', 'toggle', 'textInput', 'coordsInput', 'lfoLink',
]);

/** Every value-control schema reachable from a module's exports — the config arrays and lane records nest them. */
function valueControlSchemas(...modules: object[]): ControlSchema[] {
  const found: ControlSchema[] = [];
  const seen = new Set<object>();
  const visit = (v: unknown) => {
    if (v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (typeof o.id === 'string' && typeof o.type === 'string') {
      if (VALUE_CONTROL_TYPES.has(o.type as ControlSchema['type'])) found.push(o as unknown as ControlSchema);
      return;
    }
    Object.values(o).forEach(visit);
  };
  modules.forEach((m) => Object.values(m).forEach(visit));
  return found;
}

/** Fleet Params and Settings controls whose schema a shared primitive builds itself, from its own key. */
const PRIMITIVE_OWNED_KEYS: readonly ContentKey[] = ['ui.lfoLane', 'ui.lfo.depth', 'ui.tempoSync'];

describe('help coverage — Fleet Params and Settings', () => {
  const schemas = valueControlSchemas(audioRigConfig, sectorSettingsConfig, sessionConfig);

  it('the walk reaches every config, nested lane schemas included (never passes on an empty list)', () => {
    const ids = schemas.map((s) => s.id);
    for (const id of ['eq3.low', 'compressor.knee', 'audioRig.compressorBeforeDelay', 'audioRig.lfoBank.d.shape', 'audioRig.lfoBank.a.depthDrift',
      'audioRig.bpm', 'audioRig.swellFrequency', 'audioRig.audioLoadPreset', 'audioRig.effectsLoad', 'sectorSettings.planetName',
      'sectorSettings.coordinates', 'session.name']) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain('session.save'); // a button
    expect(ids).not.toContain('audioRig.eq3'); // a panel
  });

  it('every value control has help.human', () => {
    const missing = schemas.filter((s) => !s.help?.human.trim()).map((s) => s.id);
    expect(missing, `controls without help:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it.each(PRIMITIVE_OWNED_KEYS)('%s (built inside its primitive) has help.human', (key) => {
    expect(labels(key).help?.human.trim()).toBeTruthy();
  });
});
