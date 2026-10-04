import type { WaveformType } from './Robot'

/**
 * Canonical descriptor for a single oscillator layer. Roadmap Phase 9 collapsed per-layer ADSR
 * overrides down to one shared envelope per robot (Robot.audioAttributes.adsr) — there is no
 * per-layer `adsr` field anymore, and `'noise'` is no longer a selectable layer type (see
 * docs/specs/ROBOT_OPTIONS.md §7). There is no separate `active` flag either — `gain: 0` is the
 * "muted" state for Coaxial/Harmonic (layers[1]/[2]), replacing the old boolean without
 * discarding the layer's other config; `AudioEngine.ts`'s `filterAudibleLayers` still excludes a
 * muted layer from the composite voice it builds.
 */
export interface OscillatorLayer {
  type: WaveformType
  gain: number // required: default 1.0 at creation; 0 mutes the layer (excluded from the composite voice)
  detune: number // cents (required; default 0)
  phase: number // degrees (required; default 0)
  pulseWidth?: number // 0..1, meaningful for pulse/square oscillators
}

