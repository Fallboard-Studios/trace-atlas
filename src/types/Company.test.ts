// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import type { Company, CompanyOptionsSnapshot } from './Company';

// ========================================
// TESTS
// ========================================

describe('CompanyOptionsSnapshot', () => {
  it('accepts an empty object — every field is optional', () => {
    const empty: CompanyOptionsSnapshot = {};
    expect(empty.audioMode).toBeUndefined();
    expect(empty.masterVolume).toBeUndefined();
    expect(empty.rhythmicDensity).toBeUndefined();
    expect(empty.rhythmicMotifLength).toBeUndefined();
    expect(empty.noteVariance).toBeUndefined();
    expect(empty.octaveRange).toBeUndefined();
    expect(empty.adsr).toBeUndefined();
    expect(empty.layers).toBeUndefined();
    expect(empty.lfoSettings).toBeUndefined();
  });

  it('accepts every field populated', () => {
    const full: CompanyOptionsSnapshot = {
      audioMode: 'solo',
      masterVolume: 0.75,
      rhythmicDensity: 60,
      rhythmicMotifLength: { active: true, value: 4 },
      noteVariance: { active: false, value: 0 },
      octaveRange: [3, 5],
      adsr: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 0.5 },
      layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
      lfoSettings: { 'layer0.gain': { shape: 'triangle', rate: 1, depth: 20 } },
    };
    expect(full.audioMode).toBe('solo');
    expect(full.masterVolume).toBe(0.75);
    expect(full.octaveRange).toEqual([3, 5]);
    expect(full.layers).toHaveLength(1);
  });

  it('rejects a volumeLfo field at the type level — the Volume LFO target was removed (docs/specs/LFO_LOAD_FIX.md assumption 9)', () => {
    // @ts-expect-error volumeLfo no longer exists on CompanyOptionsSnapshot
    const stale: CompanyOptionsSnapshot = { volumeLfo: { shape: 'sine', rate: 2, depth: 40 } };
    expect(stale).toBeDefined();
  });

  it('accepts a partially populated object — only some fields set', () => {
    const partial: CompanyOptionsSnapshot = { masterVolume: 0.5 };
    expect(partial.masterVolume).toBe(0.5);
    expect(partial.audioMode).toBeUndefined();
  });
});

describe('Company', () => {
  it('requires id, name, color, and robotIds; lastEditedOptions is optional', () => {
    const fresh: Company = { id: 'company-0-abc', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] };
    expect(fresh.lastEditedOptions).toBeUndefined();

    const edited: Company = {
      id: 'company-1-def',
      name: 'Null Syndicate',
      color: '#65617f',
      robotIds: ['robot-0-xyz', 'robot-1-uvw'],
      lastEditedOptions: { masterVolume: 0.9 },
    };
    expect(edited.robotIds).toEqual(['robot-0-xyz', 'robot-1-uvw']);
    expect(edited.lastEditedOptions?.masterVolume).toBe(0.9);
  });

  it('rejects a Company literal missing color at the type level — required, not optional', () => {
    // @ts-expect-error — color is required (docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.2)
    const withoutColor: Company = { id: 'company-2-ghi', name: 'Rust Cartel', robotIds: [] };
    expect(withoutColor.id).toBe('company-2-ghi');
  });
});
