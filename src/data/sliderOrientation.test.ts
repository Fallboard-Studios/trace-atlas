import { describe, it, expect } from 'vitest';

import { AUDIO_RIG_CONFIG, LFO_BANK_LANE_SCHEMAS } from './audioRigConfig';
import { SIGNATURE_ARRAY_CONFIG } from './robotOptionsConfig';
import { LFO_LANE_IDS } from '@/types/lfo';
import type { ControlSchema } from '@/types/controls';

// docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md (survey basis, §1.2, §1.4): after that pass no slider
// schema in the app is vertical. The EQ/filter params and the probe-layer params were the only
// vertical ones; both configs now declare every slider horizontal. The primitives keep their vertical
// mode (roadmap 11.1.5.x, 13) but nothing consumes it — this file pins that fact, so a schema quietly
// going vertical again is a deliberate decision, not drift. Spec assumption 13: a change here is an
// "ask first", not a quiet fix.

type SliderLike = { orientation?: string; verticalHeight?: number };

function everySliderSchema(): Array<{ where: string; schema: SliderLike }> {
  const out: Array<{ where: string; schema: SliderLike }> = [];
  const isSlider = (s: ControlSchema) => s.type === 'sliderLinear' || s.type === 'sliderLog' || s.type === 'sliderCenteredZero';

  for (const block of AUDIO_RIG_CONFIG) {
    for (const p of block.params) if (isSlider(p.schema)) out.push({ where: `audioRig.${block.key}.${p.field}`, schema: p.schema as SliderLike });
  }
  for (const lane of LFO_LANE_IDS) {
    const s = LFO_BANK_LANE_SCHEMAS[lane];
    out.push({ where: `lfoBank.${lane}.rate`, schema: s.rate }, { where: `lfoBank.${lane}.rateDrift`, schema: s.rateDrift }, { where: `lfoBank.${lane}.depthDrift`, schema: s.depthDrift });
  }
  for (const block of SIGNATURE_ARRAY_CONFIG) {
    for (const p of block.params) if (isSlider(p.schema)) out.push({ where: `robotOptions.${block.key}.${p.field}`, schema: p.schema as SliderLike });
  }
  return out;
}

describe('no slider schema is vertical any more (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md)', () => {
  it('walks every Audio Rig, LFO Bank lane and probe-layer slider schema (a real, non-empty set)', () => {
    const all = everySliderSchema();
    // 7 EQ/filter + 3 delay + 3 reverb + 5 compressor + 1 limiter, 12 lane sliders, 12 probe-layer sliders.
    expect(all.length).toBeGreaterThanOrEqual(43);
  });

  it("every one of them is 'horizontal' — never 'vertical', never 'auto'", () => {
    for (const { where, schema } of everySliderSchema()) {
      expect(schema.orientation, where).toBe('horizontal');
    }
  });

  it('none of them carries a verticalHeight', () => {
    for (const { where, schema } of everySliderSchema()) {
      expect(schema.verticalHeight, where).toBeUndefined();
      expect('verticalHeight' in schema, where).toBe(false);
    }
  });
});
