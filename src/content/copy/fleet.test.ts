/**
 * Parity test (docs/tasks/CONTENT_LAYER.md Task 3): the fleet area is a byte-for-byte copy of
 * the literals it replaces. Each half is deleted when its source migrates to read from content
 * (audioRig half → Task 7, nav half → Task 10, intro half → Task 12), since the comparison
 * becomes circular at that point.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { fleet } from './fleet';
import { NAV_TREE_SCHEMA, type NavTreeNodeSchema } from '@/data/navTreeConfig';
import {
  AUDIO_RIG_CONFIG, DECAY_MODE_SCHEMA, LFO_DRIFT_GROUPS, PING_VARIANCE_AUTOMATION_SCHEMA,
  SWELL_FREQUENCY_SCHEMA, SWELL_DURATION_SCHEMA, BPM_SCHEMA,
} from '@/data/audioRigConfig';
import type { ControlSchema } from '@/types/controls';

type FleetKey = keyof typeof fleet;

function findNode(id: string, nodes: NavTreeNodeSchema[] = NAV_TREE_SCHEMA): NavTreeNodeSchema | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children && findNode(id, n.children);
    if (hit) return hit;
  }
  return undefined;
}

describe('fleet content parity — nav tree', () => {
  const NAV: Record<string, FleetKey> = {
    'fleetParams': 'fleet.root',
    'fleetParams.pacing': 'fleet.pacing',
    'fleetParams.pacing.tempo': 'fleet.pacing.tempo',
    'fleetParams.pacing.frequency': 'fleet.pacing.automationRate',
    'fleetParams.pacing.duration': 'fleet.pacing.automationLength',
    'fleetParams.pacing.automaticEffects': 'fleet.pacing.automationRange',
    'fleetParams.eqFilters': 'fleet.eqFilters',
    'fleetParams.eqFilters.eq': 'fleet.eq',
    'fleetParams.eqFilters.hpf': 'fleet.hpf',
    'fleetParams.eqFilters.lpf': 'fleet.lpf',
    'fleetParams.fleetDrift': 'fleet.drift',
    'fleetParams.fleetDrift.drift': 'fleet.drift.environmental',
    'fleetParams.fleetDrift.robots': 'fleet.drift.voice',
    'fleetParams.timeSpace': 'fleet.timeSpace',
    'fleetParams.timeSpace.reverb': 'fleet.reverb',
    'fleetParams.timeSpace.delay': 'fleet.delay',
    'fleetParams.output': 'fleet.output',
    'fleetParams.output.compression': 'fleet.compressor',
    'fleetParams.output.limiter': 'fleet.limiter',
  };

  it.each(Object.entries(NAV))('%s ↔ %s', (navId, key) => {
    const node = findNode(navId);
    expect(node, navId).toBeDefined();
    expect(fleet[key].human).toBe(node!.humanLabel);
    expect((fleet[key] as { lore?: string }).lore).toBe(node!.loreLabel);
  });

  it('covers every fleetParams nav node', () => {
    const ids: string[] = [];
    const walk = (n: NavTreeNodeSchema) => { ids.push(n.id); n.children?.forEach(walk); };
    walk(findNode('fleetParams')!);
    expect(ids.sort()).toEqual(Object.keys(NAV).sort());
  });
});

describe('fleet content parity — audioRigConfig', () => {
  const schemasById = new Map<string, ControlSchema>();
  for (const block of AUDIO_RIG_CONFIG) for (const p of block.params) schemasById.set(p.schema.id, p.schema);
  for (const s of [DECAY_MODE_SCHEMA, PING_VARIANCE_AUTOMATION_SCHEMA, SWELL_FREQUENCY_SCHEMA, SWELL_DURATION_SCHEMA, BPM_SCHEMA]) schemasById.set(s.id, s);
  for (const g of LFO_DRIFT_GROUPS) { schemasById.set(g.rateSchema.id, g.rateSchema); schemasById.set(g.depthSchema.id, g.depthSchema); }

  const PARAMS: Record<string, FleetKey> = {
    'eq3.low': 'fleet.eq.bass', 'eq3.mid': 'fleet.eq.mid', 'eq3.high': 'fleet.eq.treble',
    'filterLPF.frequency': 'fleet.lpf.cutoff', 'filterLPF.Q': 'fleet.lpf.resonance',
    'filterHPF.frequency': 'fleet.hpf.cutoff', 'filterHPF.Q': 'fleet.hpf.resonance',
    'delay.delayTime': 'fleet.delay.time', 'delay.feedback': 'fleet.delay.repeats', 'delay.wet': 'fleet.delay.amount',
    'reverb.decay': 'fleet.reverb.length', 'reverb.preDelay': 'fleet.reverb.preDelay', 'reverb.wet': 'fleet.reverb.amount',
    'compressor.threshold': 'fleet.compressor.threshold', 'compressor.ratio': 'fleet.compressor.ratio',
    'compressor.attack': 'fleet.compressor.attack', 'compressor.release': 'fleet.compressor.release', 'compressor.knee': 'fleet.compressor.knee',
    'limiter.threshold': 'fleet.limiter.ceiling',
    'audioRig.compressorBeforeDelay': 'fleet.output.decayMode',
    'audioRig.pingVarianceAutomation': 'fleet.pacing.automationRange',
    'audioRig.swellFrequency': 'fleet.pacing.automationRate',
    'audioRig.swellDuration': 'fleet.pacing.automationLength',
    'audioRig.bpm': 'fleet.pacing.tempo',
    'audioRig.lfoDrift.globalFx.rateDrift': 'fleet.drift.environmental.rate',
    'audioRig.lfoDrift.globalFx.depthDrift': 'fleet.drift.environmental.depth',
    'audioRig.lfoDrift.robots.rateDrift': 'fleet.drift.voice.rate',
    'audioRig.lfoDrift.robots.depthDrift': 'fleet.drift.voice.depth',
  };

  it.each(Object.entries(PARAMS))('%s ↔ %s (labels + unit)', (schemaId, key) => {
    const s = schemasById.get(schemaId) as (ControlSchema & { unit?: string }) | undefined;
    expect(s, schemaId).toBeDefined();
    const e = fleet[key] as { human: string; lore?: string; unit?: string };
    expect(e.human).toBe(s!.humanLabel);
    expect(e.lore).toBe(s!.loreLabel);
    expect(e.unit).toBe(s!.unit);
  });

  it('covers every audioRig param schema', () => {
    expect([...schemasById.keys()].sort()).toEqual(Object.keys(PARAMS).sort());
  });

  it.each([
    ['eq3', 'fleet.eq'], ['filterLPF', 'fleet.lpf'], ['filterHPF', 'fleet.hpf'],
    ['delay', 'fleet.delay'], ['reverb', 'fleet.reverb'], ['compressor', 'fleet.compressor'], ['limiter', 'fleet.limiter'],
  ] as const)('panel %s heading/human ↔ %s', (blockKey, key) => {
    const block = AUDIO_RIG_CONFIG.find((b) => b.key === blockKey)!;
    const e = fleet[key] as { human: string; heading?: string };
    expect(e.human).toBe(block.panel.humanLabel);
    expect(e.heading).toBe(block.panel.loreLabel);
  });

  it('decay mode options match', () => {
    const e = fleet['fleet.output.decayMode'];
    expect(DECAY_MODE_SCHEMA.options.map((o) => [o.value, o.humanLabel, o.loreLabel])).toEqual(
      Object.entries(e.options).map(([v, o]) => [v, o.human, o.lore]),
    );
  });

  it('drift group panels match', () => {
    const [env, voice] = LFO_DRIFT_GROUPS;
    expect([fleet['fleet.drift.environmental'].human, fleet['fleet.drift.environmental'].lore]).toEqual([env.panel.humanLabel, env.panel.loreLabel]);
    expect([fleet['fleet.drift.voice'].human, fleet['fleet.drift.voice'].lore]).toEqual([voice.panel.humanLabel, voice.panel.loreLabel]);
  });
});

describe('fleet content parity — FleetParamsContent intros (source text)', () => {
  // The intro tables are module-private, so compare against the component's source with the
  // `' + '` string-concatenation line breaks collapsed.
  const src = readFileSync(resolve(__dirname, '../../components/panels/screen/nav/content/FleetParamsContent.tsx'), 'utf8')
    .replace(/'\s*\n\s*\+\s*'/g, '');

  it.each(['fleet.root', 'fleet.pacing', 'fleet.eqFilters', 'fleet.drift', 'fleet.timeSpace', 'fleet.output'] as const)('%s intro is in the component verbatim', (key) => {
    const { lore, loreDescription, humanDescription } = fleet[key].intro;
    expect(src).toContain(lore);
    expect(src).toContain(loreDescription);
    expect(src).toContain(humanDescription);
  });
});
