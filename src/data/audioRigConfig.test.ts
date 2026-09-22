// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  AUDIO_RIG_CONFIG,
  DECAY_MODE_SCHEMA,
  LFO_DRIFT_GROUPS,
  PING_VARIANCE_AUTOMATION_SCHEMA,
  BPM_SCHEMA,
  AUDIO_RIG_ACCORDION_GROUPS,
  TRANSPORT_COMPOSITION_ACCORDION_SCHEMA,
  SPEED_AUTOMATION_PANEL_SCHEMA,
  AUDIO_LOAD_PRESET_SCHEMA,
  AUDIO_ROBOT_LOAD_SCHEMA,
  AUDIO_EFFECTS_LOAD_SCHEMA,
  AUDIO_LOAD_PANEL_SCHEMA,
  type AudioRigEffectKey,
} from './audioRigConfig';
import { AUDIO_LOAD_PRESETS } from '../constants';
import { DRIFT_GROUP_IDS } from '../types/lfo';
import { GLOBAL_LFO_TARGET_IDS } from '../types/lfo';
import type { ControlSchema } from '@/types/controls';

// ========================================
// TESTS
// ========================================

// Effect key order matches the new V2 chain order (docs/reference/GLOBAL_CHAIN_GRID.md).
const EFFECT_KEYS = ['eq3', 'filterLPF', 'filterHPF', 'delay', 'reverb', 'compressor', 'limiter'] as const;

function findBlock(key: (typeof EFFECT_KEYS)[number]) {
  const block = AUDIO_RIG_CONFIG.find((b) => b.key === key);
  if (!block) throw new Error(`no AUDIO_RIG_CONFIG block for "${key}"`);
  return block;
}

function findParam(key: (typeof EFFECT_KEYS)[number], field: string) {
  const param = findBlock(key).params.find((p) => p.field === field);
  if (!param) throw new Error(`no param "${field}" on block "${key}"`);
  return param;
}

describe('AUDIO_RIG_CONFIG', () => {
  it('has exactly one block per effect, in GLOBAL_CHAIN_GRID.md row order', () => {
    expect(AUDIO_RIG_CONFIG.map((b) => b.key)).toEqual([...EFFECT_KEYS]);
  });

  it('every block has its own panel schema — no separate accordion field (removed, DirectionalPanel wiring Task 2) or enabled toggle schema (removed; a slider-only off state)', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      expect(block.panel).toMatchObject({ id: `audioRig.${block.key}`, type: 'directionalPanel' });
      expect('accordion' in block).toBe(false);
      expect('enabledSchema' in block).toBe(false);
    }
  });

  it('every param schema id matches GlobalAudioSettings\' own field path — never the GlobalLfoTargetId short form', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      for (const param of block.params) {
        expect(param.schema.id).toBe(`${block.key}.${param.field}`);
      }
    }
  });

  describe('Compressor', () => {
    it('has all 5 params, matching GLOBAL_CHAIN_GRID.md exactly', () => {
      expect(findBlock('compressor').params.map((p) => p.field)).toEqual([
        'threshold', 'ratio', 'attack', 'release', 'knee',
      ]);
    });

    it('threshold is a linear slider, dB, -60 to 0', () => {
      expect(findParam('compressor', 'threshold').schema).toMatchObject({
        type: 'sliderLinear', loreLabel: 'ATTENUATION THRESHOLD', min: -60, max: 0, unit: 'dB',
      });
    });

    it('ratio is a sliderLinear, step 1, 1 to 20 (STEPPER_TO_SLIDER Task 8)', () => {
      expect(findParam('compressor', 'ratio').schema).toMatchObject({
        type: 'sliderLinear', loreLabel: 'COMPRESSION RATIO', min: 1, max: 20, step: 1,
      });
    });

    it('attack is a log slider, seconds, 0.001 to 0.2', () => {
      expect(findParam('compressor', 'attack').schema).toMatchObject({
        type: 'sliderLog', loreLabel: 'COMPRESSION RATE', min: 0.001, max: 0.2, unit: 's',
      });
    });

    it('release is a log slider, seconds, 0.01 to 1', () => {
      expect(findParam('compressor', 'release').schema).toMatchObject({
        type: 'sliderLog', loreLabel: 'RAREFACTION RATE', min: 0.01, max: 1, unit: 's',
      });
    });

    it('knee is a linear slider, dB, 0 to 40', () => {
      expect(findParam('compressor', 'knee').schema).toMatchObject({
        type: 'sliderLinear', loreLabel: 'CURVATURE DAMPING', min: 0, max: 40, unit: 'dB',
      });
    });

    it('has no LFO-flagged params — GLOBAL_CHAIN_GRID.md marks every compressor row "–"', () => {
      for (const param of findBlock('compressor').params) {
        expect(param.lfoTarget).toBeUndefined();
      }
    });
  });

  describe('3-Band EQ', () => {
    it('has all 3 bands as center-zero sliders, dB, -12 to 12, step 0.5', () => {
      for (const field of ['low', 'mid', 'high']) {
        expect(findParam('eq3', field).schema).toMatchObject({
          type: 'sliderCenteredZero', min: -12, max: 12, step: 0.5, unit: 'dB',
        });
      }
    });

    it('has the band lore labels, trimmed from the grid\'s own copy ("DENSITY" dropped)', () => {
      // GLOBAL_CHAIN_GRID.md still literally reads "SUB-BAND DENSITY" etc. — deliberately
      // shortened here during the DirectionalPanel layout pass, not a drift from the grid.
      expect(findParam('eq3', 'low').schema.loreLabel).toBe('SUB-BAND');
      expect(findParam('eq3', 'mid').schema.loreLabel).toBe('MEDIAL-BAND');
      expect(findParam('eq3', 'high').schema.loreLabel).toBe('APICAL-BAND');
    });

    it('all 3 bands are LFO-flagged, mapping to their eq3.* GlobalLfoTargetId', () => {
      expect(findParam('eq3', 'low').lfoTarget).toBe('eq3.low');
      expect(findParam('eq3', 'mid').lfoTarget).toBe('eq3.mid');
      expect(findParam('eq3', 'high').lfoTarget).toBe('eq3.high');
    });
  });

  describe('Low-Pass Filter', () => {
    it('frequency is a log slider, Hz, 20 to 20000, LFO-flagged as lpf.frequency', () => {
      const param = findParam('filterLPF', 'frequency');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: 'CUTOFF FREQUENCY', min: 20, max: 20000, unit: 'Hz' });
      expect(param.lfoTarget).toBe('lpf.frequency');
    });

    it('Q is a log slider, 0.1 to 20, LFO-flagged as lpf.Q', () => {
      const param = findParam('filterLPF', 'Q');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: 'BOUNDARY RESONANCE', min: 0.1, max: 20 });
      expect(param.lfoTarget).toBe('lpf.Q');
    });
  });

  describe('High-Pass Filter', () => {
    it('frequency is a log slider, Hz, 20 to 20000, LFO-flagged as hpf.frequency', () => {
      const param = findParam('filterHPF', 'frequency');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: 'CUTOFF FREQUENCY', min: 20, max: 20000, unit: 'Hz' });
      expect(param.lfoTarget).toBe('hpf.frequency');
    });

    it('Q is a log slider, 0.1 to 20, LFO-flagged as hpf.Q', () => {
      const param = findParam('filterHPF', 'Q');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: 'BOUNDARY RESONANCE', min: 0.1, max: 20 });
      expect(param.lfoTarget).toBe('hpf.Q');
    });
  });

  describe('Delay', () => {
    it('has all 3 params, matching GLOBAL_CHAIN_GRID.md exactly', () => {
      expect(findBlock('delay').params.map((p) => p.field)).toEqual(['delayTime', 'feedback', 'wet']);
    });

    it('every sliderLinear param carries an explicit fine-grained step — bug repro: a full range <= 1 with no explicit step defaults to step=1 in SliderLinear, collapsing the whole slider into just min/max (reported: "acting as a toggle")', () => {
      for (const field of ['delayTime', 'feedback', 'wet']) {
        const schema = findParam('delay', field).schema as { step?: number; min: number; max: number };
        expect(schema.step, `delay.${field}.step`).toBeDefined();
        expect(schema.step!, `delay.${field}.step should be well under its own range`).toBeLessThan(schema.max - schema.min);
      }
    });

    it('delayTime is a linear slider, seconds, 0 to 10, step 0.001, not LFO-flagged — LFO removed from Delay\'s delayTime', () => {
      const param = findParam('delay', 'delayTime');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: 'PROPAGATION LAG', min: 0, max: 10, step: 0.001, unit: 's' });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('feedback is a linear slider, 0 to 0.95, not LFO-flagged', () => {
      const param = findParam('delay', 'feedback');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: 'RECIRCULATION RATE', min: 0, max: 0.95 });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('wet is a linear slider, 0 to 1, not LFO-flagged', () => {
      const param = findParam('delay', 'wet');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: 'REFLECTED SIGNAL BALANCE', min: 0, max: 1 });
      expect(param.lfoTarget).toBeUndefined();
    });
  });

  describe('Reverb', () => {
    it('has all 3 params, matching GLOBAL_CHAIN_GRID.md exactly — no dampening (dead, Tone.Reverb has no such property)', () => {
      expect(findBlock('reverb').params.map((p) => p.field)).toEqual(['decay', 'preDelay', 'wet']);
    });

    it('decay is a log slider, seconds, 0.1 to 10, not LFO-flagged', () => {
      const param = findParam('reverb', 'decay');
      expect(param.schema).toMatchObject({ type: 'sliderLog', loreLabel: 'DISSIPATION DURATION', min: 0.1, max: 10, unit: 's' });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('preDelay is a linear slider, seconds, 0 to 1, not LFO-flagged', () => {
      const param = findParam('reverb', 'preDelay');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: 'INITIAL LAG', min: 0, max: 1, unit: 's' });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('wet is a linear slider, 0 to 1, not LFO-flagged', () => {
      const param = findParam('reverb', 'wet');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: 'DIFFUSED SIGNAL BALANCE', min: 0, max: 1 });
      expect(param.lfoTarget).toBeUndefined();
    });

    it('preDelay and wet (both sliderLinear, full range <= 1) carry an explicit fine-grained step — same toggle-collapse bug as Delay\'s params', () => {
      for (const field of ['preDelay', 'wet']) {
        const schema = findParam('reverb', field).schema as { step?: number; min: number; max: number };
        expect(schema.step, `reverb.${field}.step`).toBeDefined();
        expect(schema.step!, `reverb.${field}.step should be well under its own range`).toBeLessThan(schema.max - schema.min);
      }
    });
  });

  describe('Limiter', () => {
    it('has exactly one param, threshold', () => {
      expect(findBlock('limiter').params.map((p) => p.field)).toEqual(['threshold']);
    });

    it('threshold is a linear slider, dB, -20 to 0, not LFO-flagged — Limiter never gets an LFO', () => {
      const param = findParam('limiter', 'threshold');
      expect(param.schema).toMatchObject({ type: 'sliderLinear', loreLabel: 'OUTPUT CEILING', min: -20, max: 0, unit: 'dB' });
      expect(param.lfoTarget).toBeUndefined();
    });
  });

  it('has no chorus block at all', () => {
    expect(AUDIO_RIG_CONFIG.map((b) => b.key as string)).not.toContain('chorus');
  });

  it('flags exactly the 7 GlobalLfoTargetId params — no more, no fewer', () => {
    const lfoTargets = AUDIO_RIG_CONFIG.flatMap((b) => b.params.map((p) => p.lfoTarget).filter(Boolean));
    expect([...lfoTargets].sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(AUDIO_RIG_CONFIG)).not.toThrow();
  });
});

describe('DECAY_MODE_SCHEMA', () => {
  it('is a radio schema bound to compressorBeforeDelay', () => {
    expect(DECAY_MODE_SCHEMA.id).toBe('audioRig.compressorBeforeDelay');
    expect(DECAY_MODE_SCHEMA.type).toBe('radio');
  });

  it('has exactly two options — Natural Decay and Controlled Decay, in that order', () => {
    expect(DECAY_MODE_SCHEMA.options).toEqual([
      { value: 'natural', label: 'Natural Decay' },
      { value: 'controlled', label: 'Controlled Decay' },
    ]);
  });
});

describe('LFO_DRIFT_GROUPS', () => {
  it('has exactly 4 entries, one per DriftGroupId', () => {
    expect(LFO_DRIFT_GROUPS.map((g) => g.group).sort()).toEqual([...DRIFT_GROUP_IDS].sort());
  });

  it('every entry has a valid, global chain-level panel — no separate accordion field (removed, DirectionalPanel wiring Task 2)', () => {
    for (const driftGroup of LFO_DRIFT_GROUPS) {
      expect(driftGroup.panel).toMatchObject({ id: `audioRig.lfoDrift.${driftGroup.group}`, type: 'directionalPanel' });
      expect('accordion' in driftGroup).toBe(false);
    }
  });

  it('every entry\'s rate/depth schemas are sliderCenteredZero, -100 to 100, percent — matching the UI-facing bipolar percent, not lfoEngine\'s internal -1..1 fraction', () => {
    for (const driftGroup of LFO_DRIFT_GROUPS) {
      expect(driftGroup.rateSchema, driftGroup.group).toMatchObject({ type: 'sliderCenteredZero', min: -100, max: 100, unit: '%' });
      expect(driftGroup.depthSchema, driftGroup.group).toMatchObject({ type: 'sliderCenteredZero', min: -100, max: 100, unit: '%' });
    }
  });

  it('every id across all 4 entries (4 panels + 8 sliders) is unique', () => {
    const allIds = LFO_DRIFT_GROUPS.flatMap((g) => [g.panel.id, g.rateSchema.id, g.depthSchema.id]);
    expect(allIds).toHaveLength(12);
    expect(new Set(allIds).size).toBe(12);
  });

  it('every entry\'s rate and depth schemas have distinct human labels — never a shared generic "Drift" indistinguishable to a screen reader', () => {
    for (const driftGroup of LFO_DRIFT_GROUPS) {
      expect(driftGroup.rateSchema.humanLabel, driftGroup.group).not.toBe(driftGroup.depthSchema.humanLabel);
      expect(driftGroup.rateSchema.humanLabel, driftGroup.group).toBeTruthy();
      expect(driftGroup.depthSchema.humanLabel, driftGroup.group).toBeTruthy();
    }
  });

  it('none of LFO_DRIFT_GROUPS\' schema ids appear anywhere inside AUDIO_RIG_CONFIG\'s array — lfoDrift is a top-level GlobalAudioSettings flag, not a matching AudioRigEffectBlock key', () => {
    expect(AUDIO_RIG_CONFIG.map((b) => b.key as string)).not.toContain('lfoDrift');
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [
      b.panel.id,
      ...b.params.map((p) => p.schema.id),
    ]);
    const driftSchemaIds = LFO_DRIFT_GROUPS.flatMap((g) => [g.panel.id, g.rateSchema.id, g.depthSchema.id]);
    for (const id of driftSchemaIds) {
      expect(allConfigSchemaIds, id).not.toContain(id);
    }
  });

  it('the closed-set coverage assertion over AUDIO_RIG_CONFIG\'s own param schema types is unaffected — LFO_DRIFT_GROUPS is a standalone export, not part of that array', () => {
    expect(AUDIO_RIG_CONFIG.length).toBe(7); // still exactly the 7 GLOBAL_CHAIN_GRID.md effect blocks
  });
});

describe('PING_VARIANCE_AUTOMATION_SCHEMA', () => {
  it('is a linear slider, 0-100%, id audioRig.pingVarianceAutomation', () => {
    expect(PING_VARIANCE_AUTOMATION_SCHEMA).toMatchObject({
      id: 'audioRig.pingVarianceAutomation',
      type: 'sliderLinear',
      min: 0,
      max: 100,
      unit: '%',
    });
  });

  it('carries the confirmed lore label and human label', () => {
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.loreLabel).toBe('PING VARIANCE AUTOMATION');
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.humanLabel).toBe('Automatic Effects');
  });

  it('carries an explicit fine-grained step, same regression guard as every other sliderLinear schema in this file', () => {
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.step).toBeDefined();
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.step!).toBeLessThan(PING_VARIANCE_AUTOMATION_SCHEMA.max - PING_VARIANCE_AUTOMATION_SCHEMA.min);
  });

  it('is not part of AUDIO_RIG_CONFIG\'s per-effect array — it is a bare, Rig-wide meta-setting, not an effect param', () => {
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [
      b.panel.id,
      ...b.params.map((p) => p.schema.id),
    ]);
    expect(allConfigSchemaIds).not.toContain(PING_VARIANCE_AUTOMATION_SCHEMA.id);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(PING_VARIANCE_AUTOMATION_SCHEMA)).not.toThrow();
  });
});

describe('BPM_SCHEMA (docs/specs/BPM_CONTROL.md §1.4-§1.5)', () => {
  it('is a linear slider, 20-200 BPM, id audioRig.bpm', () => {
    expect(BPM_SCHEMA).toMatchObject({
      id: 'audioRig.bpm',
      type: 'sliderLinear',
      min: 20,
      max: 200,
      step: 1,
      unit: 'BPM',
    });
  });

  it('carries the confirmed lore label and human label', () => {
    expect(BPM_SCHEMA.loreLabel).toBe('RESONANCE CADENCE');
    expect(BPM_SCHEMA.humanLabel).toBe('Tempo');
  });

  it('is wider than the [40, 100] locale seed range on both ends — freely draggable beyond anything a locale would seed', () => {
    expect(BPM_SCHEMA.min).toBeLessThan(40);
    expect(BPM_SCHEMA.max).toBeGreaterThan(100);
  });

  it('is not part of AUDIO_RIG_CONFIG\'s per-effect array — it is a bare, Rig-wide meta-setting, not an effect param', () => {
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [
      b.panel.id,
      ...b.params.map((p) => p.schema.id),
    ]);
    expect(allConfigSchemaIds).not.toContain(BPM_SCHEMA.id);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(BPM_SCHEMA)).not.toThrow();
  });
});

// param.schema is typed as ControlSchema (the full 14-variant union) — orientation only exists
// on the 3 slider variants, so every lookup below narrows through this helper rather than
// asserting directly on the union type.
function orientationOf(schema: ControlSchema): string | undefined {
  return (schema as { orientation?: string }).orientation;
}

describe('slider orientation classification (docs/specs/VERTICAL_SLIDERS.md §1.1)', () => {
  it('3-Band EQ (Low/Mid/High) is vertical', () => {
    for (const field of ['low', 'mid', 'high']) {
      expect(orientationOf(findParam('eq3', field).schema), field).toBe('vertical');
    }
  });

  it('Low-Pass/High-Pass Filter (Frequency/Resonance) is vertical (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3 — reverses the earlier auto classification)', () => {
    for (const key of ['filterLPF', 'filterHPF'] as const) {
      for (const field of ['frequency', 'Q']) {
        expect(orientationOf(findParam(key, field).schema), `${key}.${field}`).toBe('vertical');
      }
    }
  });

  it('Delay (Time/Feedback/Mix) is horizontal', () => {
    for (const field of ['delayTime', 'feedback', 'wet']) {
      expect(orientationOf(findParam('delay', field).schema), field).toBe('horizontal');
    }
  });

  it('Reverb (Decay/Pre-Delay/Mix) is horizontal', () => {
    for (const field of ['decay', 'preDelay', 'wet']) {
      expect(orientationOf(findParam('reverb', field).schema), field).toBe('horizontal');
    }
  });

  it('Compressor (Threshold/Ratio/Attack/Release/Knee) is horizontal (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3)', () => {
    for (const field of ['threshold', 'ratio', 'attack', 'release', 'knee']) {
      expect(orientationOf(findParam('compressor', field).schema), field).toBe('horizontal');
    }
  });

  it('Limiter (Threshold) is horizontal (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3)', () => {
    expect(orientationOf(findParam('limiter', 'threshold').schema)).toBe('horizontal');
  });

  it('all 4 LFO_DRIFT_GROUPS (Rate Drift/Depth Drift), including "robots", are horizontal (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.3)', () => {
    for (const group of LFO_DRIFT_GROUPS) {
      expect(group.rateSchema.orientation, `${group.group}.rateDrift`).toBe('horizontal');
      expect(group.depthSchema.orientation, `${group.group}.depthDrift`).toBe('horizontal');
    }
  });

  it('Automatic Effects (PING_VARIANCE_AUTOMATION_SCHEMA) and Tempo (BPM_SCHEMA) are horizontal', () => {
    expect(PING_VARIANCE_AUTOMATION_SCHEMA.orientation).toBe('horizontal');
    expect(BPM_SCHEMA.orientation).toBe('horizontal');
  });
});

// param.schema is typed as ControlSchema — verticalHeight only exists on the 3 slider variants,
// same narrowing reasoning orientationOf() above already uses.
function verticalHeightOf(schema: ControlSchema): number | undefined {
  return (schema as { verticalHeight?: number }).verticalHeight;
}

describe('vertical slider verticalHeight budget (roadmap 13 — "Vertical Slider Label Overflow")', () => {
  // Regression guard: every real vertical slider used to fall through to the same *implicit*
  // VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT default regardless of how much room its own panel
  // actually had, which is what let some (not all) vertical sliders overflow their panel and
  // show a native scrollbar (found live, roadmap 13) while others happened to fit by luck.
  // Every vertical schema below must now declare its own explicit verticalHeight, so the budget
  // is visibly tunable per-panel instead of a silent, one-size-fits-all fallback.
  it('3-Band EQ (Low/Mid/High) declares an explicit verticalHeight', () => {
    for (const field of ['low', 'mid', 'high']) {
      expect(verticalHeightOf(findParam('eq3', field).schema), field).toBe(256);
    }
  });

  it('Low-Pass/High-Pass Filter (Frequency/Resonance) declares an explicit verticalHeight', () => {
    for (const key of ['filterLPF', 'filterHPF'] as const) {
      for (const field of ['frequency', 'Q']) {
        expect(verticalHeightOf(findParam(key, field).schema), `${key}.${field}`).toBe(256);
      }
    }
  });
});

// ========================================
// DirectionalPanel wiring — additive schema work
// (docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 1)
// ========================================

// The exact loreLabel/humanLabel text every AudioRigEffectBlock's now-removed `accordion` field
// used to carry, before the type swap to `panel` (docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 2)
// — verbatim preservation is guarded by comparing `panel`'s text against these literals directly,
// since there's no more sibling `accordion` field left to compare against at runtime.
const EXPECTED_BLOCK_LABELS: Record<(typeof EFFECT_KEYS)[number], { loreLabel: string; humanLabel: string }> = {
  eq3: { loreLabel: 'SPECTRAL FREQUENCY EQUALIZER', humanLabel: '3-Band EQ' },
  filterLPF: { loreLabel: 'HIGH-FREQUENCY MASK', humanLabel: 'Low-Pass Filter' },
  filterHPF: { loreLabel: 'LOW-FREQUENCY MASK', humanLabel: 'High-Pass Filter' },
  delay: { loreLabel: 'TEMPORAL REFLECTION MATRIX', humanLabel: 'Delay' },
  reverb: { loreLabel: 'SPATIAL DIFFUSION MATRIX', humanLabel: 'Reverb' },
  compressor: { loreLabel: 'DYNAMIC RANGE CONDENSER', humanLabel: 'Compressor' },
  limiter: { loreLabel: 'TERMINAL CEILING GATE', humanLabel: 'Limiter' },
};

describe('AudioRigEffectBlock.panel (DirectionalPanel wiring, Tasks 1-2)', () => {
  it('every block has a panel field, type directionalPanel, id audioRig.<key>', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      expect(block.panel, block.key).toMatchObject({ id: `audioRig.${block.key}`, type: 'directionalPanel' });
    }
  });

  it("every panel's loreLabel/humanLabel is byte-identical to its pre-Task-2 accordion's text — verbatim preservation across the type swap", () => {
    for (const block of AUDIO_RIG_CONFIG) {
      expect(block.panel.loreLabel, block.key).toBe(EXPECTED_BLOCK_LABELS[block.key].loreLabel);
      expect(block.panel.humanLabel, block.key).toBe(EXPECTED_BLOCK_LABELS[block.key].humanLabel);
    }
  });

  it('eq3/filterLPF/filterHPF are row-orientation panels — delay/reverb/compressor/limiter are column', () => {
    const rowBlocks: AudioRigEffectKey[] = ['eq3', 'filterLPF', 'filterHPF'];
    for (const block of AUDIO_RIG_CONFIG) {
      expect(block.panel.orientation, block.key).toBe(rowBlocks.includes(block.key) ? 'row' : 'column');
    }
  });

  it('no longer has an accordion field — superseded by panel (Task 2 cleanup)', () => {
    for (const block of AUDIO_RIG_CONFIG) {
      expect('accordion' in block, block.key).toBe(false);
    }
  });
});

describe('LfoDriftGroupSchema.panel (DirectionalPanel wiring, Tasks 1-2)', () => {
  it('every drift group has a panel field, type directionalPanel, column orientation, id audioRig.lfoDrift.<group>', () => {
    for (const group of LFO_DRIFT_GROUPS) {
      expect(group.panel, group.group).toMatchObject({
        id: `audioRig.lfoDrift.${group.group}`,
        type: 'directionalPanel',
        orientation: 'column',
      });
    }
  });

  it("every panel's loreLabel/humanLabel matches its known pre-Task-2 accordion text (LFO_DRIFT_GROUPS' own invented labels)", () => {
    const expectedLabels: Record<string, { loreLabel: string; humanLabel: string }> = {
      eq3: { loreLabel: 'SPECTRAL FLUX', humanLabel: 'EQ Drift' },
      filterLPF: { loreLabel: 'HIGH-MASK FLUX', humanLabel: 'Low-Pass Drift' },
      filterHPF: { loreLabel: 'LOW-MASK FLUX', humanLabel: 'High-Pass Drift' },
      robots: { loreLabel: 'AGENT FLUX', humanLabel: 'Robot Drift' },
    };
    for (const group of LFO_DRIFT_GROUPS) {
      expect(group.panel.loreLabel, group.group).toBe(expectedLabels[group.group].loreLabel);
      expect(group.panel.humanLabel, group.group).toBe(expectedLabels[group.group].humanLabel);
    }
  });

  it('no longer has an accordion field — superseded by panel (Task 2 cleanup)', () => {
    for (const group of LFO_DRIFT_GROUPS) {
      expect('accordion' in group, group.group).toBe(false);
    }
  });
});

describe('AUDIO_RIG_ACCORDION_GROUPS (new top-level accordions, Task 1)', () => {
  it('has exactly 3 entries, in EQ & Filters / Time & Space / Output order', () => {
    expect(AUDIO_RIG_ACCORDION_GROUPS.map((g) => g.accordion.humanLabel)).toEqual([
      'EQ & Filters', 'Time & Space', 'Output',
    ]);
  });

  it('carries a stable key per entry, matching each group\'s own concept — used to special-case EQ & Filters\' own internal layout without relying on a raw accordion id string', () => {
    expect(AUDIO_RIG_ACCORDION_GROUPS.map((g) => g.key)).toEqual(['eqFilters', 'timeSpace', 'output']);
  });

  it('groups the correct block keys per accordion, in order', () => {
    expect(AUDIO_RIG_ACCORDION_GROUPS.map((g) => g.blockKeys)).toEqual([
      ['eq3', 'filterLPF', 'filterHPF'],
      ['delay', 'reverb'],
      ['compressor', 'limiter'],
    ]);
  });

  it('every accordion has type accordion and a unique id in the audioRig.* namespace', () => {
    for (const group of AUDIO_RIG_ACCORDION_GROUPS) {
      expect(group.accordion.type, group.accordion.humanLabel).toBe('accordion');
      expect(group.accordion.id, group.accordion.humanLabel).toMatch(/^audioRig\./);
    }
    const ids = AUDIO_RIG_ACCORDION_GROUPS.map((g) => g.accordion.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("blockKeys across all 3 groups cover exactly the 7 effect keys once each, minus none, no duplicates", () => {
    const allKeys = AUDIO_RIG_ACCORDION_GROUPS.flatMap((g) => g.blockKeys);
    expect([...allKeys].sort()).toEqual([...EFFECT_KEYS].sort());
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });
});

describe('TRANSPORT_COMPOSITION_ACCORDION_SCHEMA (Task 1)', () => {
  it('is an accordion schema with humanLabel Transport & Composition', () => {
    expect(TRANSPORT_COMPOSITION_ACCORDION_SCHEMA).toMatchObject({
      id: 'audioRig.transportComposition',
      type: 'accordion',
      humanLabel: 'Transport & Composition',
    });
  });

  it('has a non-empty invented loreLabel', () => {
    expect(TRANSPORT_COMPOSITION_ACCORDION_SCHEMA.loreLabel).toBeTruthy();
  });
});

describe('SPEED_AUTOMATION_PANEL_SCHEMA (Task 1)', () => {
  it('is a responsive-orientation directionalPanel with humanLabel Speed & Automation (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.9 — 2 rows on mobile/tablet, 1 row on desktop)', () => {
    expect(SPEED_AUTOMATION_PANEL_SCHEMA).toMatchObject({
      type: 'directionalPanel',
      orientation: 'responsive',
      humanLabel: 'Speed & Automation',
    });
  });

  it('has a non-empty invented loreLabel and an id in the audioRig.* namespace', () => {
    expect(SPEED_AUTOMATION_PANEL_SCHEMA.loreLabel).toBeTruthy();
    expect(SPEED_AUTOMATION_PANEL_SCHEMA.id).toMatch(/^audioRig\./);
  });

  it('is not part of AUDIO_RIG_CONFIG\'s per-effect array — it is a bare, new panel, not an effect param', () => {
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [
      b.panel.id,
      ...b.params.map((p) => p.schema.id),
    ]);
    expect(allConfigSchemaIds).not.toContain(SPEED_AUTOMATION_PANEL_SCHEMA.id);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(SPEED_AUTOMATION_PANEL_SCHEMA)).not.toThrow();
  });
});

// EQ_FILTERS_ROW_PANEL_SCHEMA / TIME_SPACE_COLUMN_PANEL_SCHEMA /
// OUTPUT_COLUMN_PANEL_SCHEMA were removed — those 3 groupings are no longer
// DirectionalPanelSchema objects at all; AudioRigDrawer.tsx wraps them in a
// plain PanelGroup (orientation prop, no schema/id/facade) instead, so each
// block keeps its own independent Cabinetry facade. See PanelGroup.test.tsx
// for that component's own coverage, and AudioRigDrawer.test.tsx for the
// "each block gets its own facade" structural assertions.

// ========================================
// AUDIO LOAD (docs/specs/AUDIO_LOAD_BUDGET.md §4.5)
// ========================================

describe('AUDIO_LOAD_PRESET_SCHEMA', () => {
  it('is a radio in the audioRig.* namespace offering exactly Light, Standard and Full', () => {
    expect(AUDIO_LOAD_PRESET_SCHEMA).toMatchObject({ type: 'radio', id: 'audioRig.audioLoadPreset' });
    expect(AUDIO_LOAD_PRESET_SCHEMA.options.map((o) => o.label)).toEqual(['Light', 'Standard', 'Full']);
  });

  it('uses the preset names audioBudget.ts parses (?load=light|standard|full) as its option values', () => {
    expect(AUDIO_LOAD_PRESET_SCHEMA.options.map((o) => o.value)).toEqual(['light', 'standard', 'full']);
    expect(Object.keys(AUDIO_LOAD_PRESETS)).toEqual(AUDIO_LOAD_PRESET_SCHEMA.options.map((o) => o.value));
  });

  it('has a non-empty invented loreLabel and a humanLabel', () => {
    expect(AUDIO_LOAD_PRESET_SCHEMA.loreLabel).toBeTruthy();
    expect(AUDIO_LOAD_PRESET_SCHEMA.humanLabel).toBeTruthy();
  });
});

describe('AUDIO_ROBOT_LOAD_SCHEMA', () => {
  it('is a horizontal linear slider, 0-100 %, whole steps, in the audioRig.* namespace', () => {
    expect(AUDIO_ROBOT_LOAD_SCHEMA).toMatchObject({
      type: 'sliderLinear',
      id: 'audioRig.robotLoad',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      orientation: 'horizontal',
    });
  });

  it('spans the whole dial: every preset lands on a whole slider step inside its range', () => {
    for (const value of Object.values(AUDIO_LOAD_PRESETS)) {
      const percent = value * 100;
      expect(percent).toBeGreaterThanOrEqual(AUDIO_ROBOT_LOAD_SCHEMA.min);
      expect(percent).toBeLessThanOrEqual(AUDIO_ROBOT_LOAD_SCHEMA.max);
      expect(Number.isInteger(percent)).toBe(true);
    }
  });

  it('has a non-empty invented loreLabel and the humanLabel Robot Load', () => {
    expect(AUDIO_ROBOT_LOAD_SCHEMA.loreLabel).toBeTruthy();
    expect(AUDIO_ROBOT_LOAD_SCHEMA.humanLabel).toBe('Robot Load');
  });
});

describe('AUDIO_EFFECTS_LOAD_SCHEMA', () => {
  it('is a horizontal linear slider, 0-100 %, whole steps, in the audioRig.* namespace', () => {
    expect(AUDIO_EFFECTS_LOAD_SCHEMA).toMatchObject({
      type: 'sliderLinear',
      id: 'audioRig.effectsLoad',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      orientation: 'horizontal',
    });
  });

  it('spans the whole dial: every preset lands on a whole slider step inside its range', () => {
    for (const value of Object.values(AUDIO_LOAD_PRESETS)) {
      const percent = value * 100;
      expect(percent).toBeGreaterThanOrEqual(AUDIO_EFFECTS_LOAD_SCHEMA.min);
      expect(percent).toBeLessThanOrEqual(AUDIO_EFFECTS_LOAD_SCHEMA.max);
      expect(Number.isInteger(percent)).toBe(true);
    }
  });

  it('has a non-empty invented loreLabel and the humanLabel Effects Load', () => {
    expect(AUDIO_EFFECTS_LOAD_SCHEMA.loreLabel).toBeTruthy();
    expect(AUDIO_EFFECTS_LOAD_SCHEMA.humanLabel).toBe('Effects Load');
  });

  it('has a distinct id and loreLabel from AUDIO_ROBOT_LOAD_SCHEMA', () => {
    expect(AUDIO_EFFECTS_LOAD_SCHEMA.id).not.toBe(AUDIO_ROBOT_LOAD_SCHEMA.id);
    expect(AUDIO_EFFECTS_LOAD_SCHEMA.loreLabel).not.toBe(AUDIO_ROBOT_LOAD_SCHEMA.loreLabel);
  });
});

describe('AUDIO_LOAD_PANEL_SCHEMA', () => {
  it('is a responsive directionalPanel named Audio Load in the audioRig.* namespace', () => {
    expect(AUDIO_LOAD_PANEL_SCHEMA).toMatchObject({
      type: 'directionalPanel',
      orientation: 'responsive',
      humanLabel: 'Audio Load',
    });
    expect(AUDIO_LOAD_PANEL_SCHEMA.id).toMatch(/^audioRig\./);
    expect(AUDIO_LOAD_PANEL_SCHEMA.loreLabel).toBeTruthy();
  });

  it('gives all four schemas distinct ids, none of which is part of AUDIO_RIG_CONFIG (bare Rig-wide meta-settings, like Tempo)', () => {
    const ids = [AUDIO_LOAD_PRESET_SCHEMA.id, AUDIO_ROBOT_LOAD_SCHEMA.id, AUDIO_EFFECTS_LOAD_SCHEMA.id, AUDIO_LOAD_PANEL_SCHEMA.id];
    expect(new Set(ids).size).toBe(4);
    const allConfigSchemaIds = AUDIO_RIG_CONFIG.flatMap((b) => [b.panel.id, ...b.params.map((p) => p.schema.id)]);
    for (const id of ids) expect(allConfigSchemaIds).not.toContain(id);
  });

  it('keeps all four JSON-serializable', () => {
    for (const schema of [AUDIO_LOAD_PRESET_SCHEMA, AUDIO_ROBOT_LOAD_SCHEMA, AUDIO_EFFECTS_LOAD_SCHEMA, AUDIO_LOAD_PANEL_SCHEMA]) {
      expect(() => JSON.stringify(schema)).not.toThrow();
    }
  });
});

