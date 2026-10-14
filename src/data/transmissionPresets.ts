// ========================================
// IMPORTS
// ========================================
import type { SessionPayload } from '../types/session';
import type { ContentKey } from '@/content';

// ========================================
// TYPES
// ========================================

export interface TransmissionPreset {
  /** Stable across releases: the off screen's picker keys its options on it. */
  id: string;
  /** The content key (`home.off.presets.*`) that names the preset; the name is copy, never a field here. */
  nameKey: ContentKey;
  payload: SessionPayload;
}

// ========================================
// CONSTANTS
// ========================================

/**
 * Transmission presets (docs/specs/LAYOUT_REWORK.md §1.9, §7 Q4; docs/tasks/LAYOUT_REWORK.md Task 25):
 * the three factory worlds the off screen offers beside the user's saves. A preset is a plain
 * `SessionPayload`, applied through the same `applySessionPayload` a saved session uses.
 *
 * PLACEHOLDERS. Each payload below was captured with `buildSessionPayload()` on a freshly booted
 * default world (no robot or company edits, so those maps are empty) and then given a distinct
 * Attenuation Style name and locale coordinates, so the three picks differ on the faint backdrop.
 * The names are the sketch's stand-ins (docs/sketches/layout-rework.html). Crawford curates the real
 * three; replacing a payload here, or its copy in `src/content/copy/home.ts`, is the whole change.
 */
const PRESET_A_PAYLOAD: SessionPayload = {
  version: 2,
  attenuationStyleName: 'kr1nd4ra',
  coordinates: {
    x: 12,
    y: 68,
  },
  globalAudio: {
    compressorBeforeDelay: false,
    compressor: {
      threshold: -47,
      ratio: 18,
      attack: 0.012,
      release: 0.218,
      knee: 8,
    },
    eq3: {
      low: 0,
      mid: 0,
      high: 0,
    },
    filterLPF: {
      type: 'lowpass',
      frequency: 12488,
      Q: 0.71,
    },
    filterHPF: {
      type: 'highpass',
      frequency: 268,
      Q: 1.12,
    },
    delay: {
      delayTime: 0.275,
      feedback: 0.27,
      wet: 1,
    },
    reverb: {
      decay: 1.51,
      preDelay: 0.06,
      wet: 1,
    },
    limiter: {
      threshold: -1,
    },
  },
  bpm: 85,
  swellFrequency: 8,
  swellDuration: 5,
  pingVarianceAutomation: 0.35,
  lfoBank: {
    a: {
      shape: 'triangle',
      rate: 0.3,
      rateDrift: 0.42,
      depthDrift: 0.14,
      sync: {
        division: '2',
        modifier: 'straight',
      },
    },
    b: {
      shape: 'square',
      rate: 0.8,
      rateDrift: 0,
      depthDrift: 0.44,
    },
    c: {
      shape: 'sawtooth',
      rate: 2.45,
      rateDrift: 0,
      depthDrift: 0.32,
    },
    d: {
      shape: 'square',
      rate: 5.9,
      rateDrift: 0.01,
      depthDrift: 0,
    },
  },
  globalLfoLinks: {
    'eq3.low': {
      lane: 'c',
      depth: 18,
    },
    'eq3.mid': {
      lane: 'b',
      depth: 18,
    },
    'eq3.high': {
      lane: 'b',
      depth: 18,
    },
    'lpf.frequency': {
      lane: 'd',
      depth: 34,
    },
    'lpf.Q': {
      lane: 'c',
      depth: 30,
    },
    'hpf.frequency': {
      lane: 'c',
      depth: 44,
    },
    'hpf.Q': {
      lane: 'a',
      depth: 34,
    },
  },
  robotOverrides: {},
  companyDiffs: {},
  userCreatedCompanies: [],
};

const PRESET_B_PAYLOAD: SessionPayload = {
  version: 2,
  attenuationStyleName: 'qb9mezm3',
  coordinates: {
    x: -84,
    y: 131,
  },
  globalAudio: {
    compressorBeforeDelay: false,
    compressor: {
      threshold: -53,
      ratio: 12,
      attack: 0.005,
      release: 0.069,
      knee: 6,
    },
    eq3: {
      low: -3.5,
      mid: -3.5,
      high: -3.5,
    },
    filterLPF: {
      type: 'lowpass',
      frequency: 3214,
      Q: 0.22,
    },
    filterHPF: {
      type: 'highpass',
      frequency: 38,
      Q: 0.28,
    },
    delay: {
      delayTime: 0.138,
      feedback: 0.11,
      wet: 1,
      sync: {
        division: '1/32',
        modifier: 'straight',
      },
    },
    reverb: {
      decay: 0.76,
      preDelay: 0.03,
      wet: 1,
    },
    limiter: {
      threshold: -3,
    },
  },
  bpm: 55,
  swellFrequency: 3,
  swellDuration: 3,
  pingVarianceAutomation: 0.3,
  lfoBank: {
    a: {
      shape: 'sine',
      rate: 0.15,
      rateDrift: -0.41,
      depthDrift: -0.34,
      sync: {
        division: '1',
        modifier: 'triplet',
      },
    },
    b: {
      shape: 'triangle',
      rate: 0.55,
      rateDrift: -0.15,
      depthDrift: -0.43,
      sync: {
        division: '1/8',
        modifier: 'dotted',
      },
    },
    c: {
      shape: 'sawtooth',
      rate: 1.8,
      rateDrift: -0.19,
      depthDrift: -0.31,
      sync: {
        division: '1/16',
        modifier: 'straight',
      },
    },
    d: {
      shape: 'square',
      rate: 4.7,
      rateDrift: -0.46,
      depthDrift: -0.08,
      sync: {
        division: '1/32',
        modifier: 'straight',
      },
    },
  },
  globalLfoLinks: {
    'eq3.low': {
      lane: null,
      depth: 0,
    },
    'eq3.mid': {
      lane: null,
      depth: 0,
    },
    'eq3.high': {
      lane: null,
      depth: 0,
    },
    'lpf.frequency': {
      lane: null,
      depth: 0,
    },
    'lpf.Q': {
      lane: null,
      depth: 0,
    },
    'hpf.frequency': {
      lane: null,
      depth: 0,
    },
    'hpf.Q': {
      lane: 'a',
      depth: 11,
    },
  },
  robotOverrides: {},
  companyDiffs: {},
  userCreatedCompanies: [],
};

const PRESET_C_PAYLOAD: SessionPayload = {
  version: 2,
  attenuationStyleName: 'h4lcy0n',
  coordinates: {
    x: 143,
    y: -57,
  },
  globalAudio: {
    compressorBeforeDelay: false,
    compressor: {
      threshold: -54,
      ratio: 11,
      attack: 0.005,
      release: 0.07,
      knee: 6,
    },
    eq3: {
      low: -3.5,
      mid: -3.5,
      high: -3.5,
    },
    filterLPF: {
      type: 'lowpass',
      frequency: 2383,
      Q: 0.22,
    },
    filterHPF: {
      type: 'highpass',
      frequency: 56,
      Q: 0.55,
    },
    delay: {
      delayTime: 0.139,
      feedback: 0.19,
      wet: 1,
      sync: {
        division: '1/16',
        modifier: 'triplet',
      },
    },
    reverb: {
      decay: 0.87,
      preDelay: 0.04,
      wet: 1,
    },
    limiter: {
      threshold: -3,
    },
  },
  bpm: 42,
  swellFrequency: 3,
  swellDuration: 3,
  pingVarianceAutomation: 0.3,
  lfoBank: {
    a: {
      shape: 'sine',
      rate: 0.15,
      rateDrift: -0.21,
      depthDrift: -0.13,
      sync: {
        division: '1',
        modifier: 'triplet',
      },
    },
    b: {
      shape: 'triangle',
      rate: 0.6,
      rateDrift: -0.15,
      depthDrift: -0.28,
      sync: {
        division: '1/8',
        modifier: 'straight',
      },
    },
    c: {
      shape: 'sawtooth',
      rate: 1.8,
      rateDrift: -0.19,
      depthDrift: -0.65,
      sync: {
        division: '1/16',
        modifier: 'straight',
      },
    },
    d: {
      shape: 'square',
      rate: 5,
      rateDrift: -0.43,
      depthDrift: -0.08,
    },
  },
  globalLfoLinks: {
    'eq3.low': {
      lane: 'a',
      depth: 17,
    },
    'eq3.mid': {
      lane: null,
      depth: 0,
    },
    'eq3.high': {
      lane: 'b',
      depth: 13,
    },
    'lpf.frequency': {
      lane: null,
      depth: 0,
    },
    'lpf.Q': {
      lane: null,
      depth: 0,
    },
    'hpf.frequency': {
      lane: null,
      depth: 0,
    },
    'hpf.Q': {
      lane: 'b',
      depth: 10,
    },
  },
  robotOverrides: {},
  companyDiffs: {},
  userCreatedCompanies: [],
};

export const TRANSMISSION_PRESETS: readonly TransmissionPreset[] = [
  { id: 'a', nameKey: 'home.off.presets.a', payload: PRESET_A_PAYLOAD },
  { id: 'b', nameKey: 'home.off.presets.b', payload: PRESET_B_PAYLOAD },
  { id: 'c', nameKey: 'home.off.presets.c', payload: PRESET_C_PAYLOAD },
];
