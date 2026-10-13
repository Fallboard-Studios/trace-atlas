import * as Tone from 'tone';

/** Minimal shape used for test/runtime fallbacks where Tone classes may be absent. */
export interface MinimalToneNode {
  connect: (target?: unknown) => unknown;
  disconnect?: () => void;
  toDestination?: () => void;
  gain?: { value: number };
  pan?: { value: number };
  frequency?: { value: number };
  Q?: { value: number };
  type?: string;
}

/** Lightweight synth shape used for safe typed access to set/oscillator fields. */
export interface SynthWithOscillator {
  set?: (props: unknown) => void;
  oscillator?: {
    detune?: { value: number } | number;
    phase?: { value?: number } | number;
  };
  triggerAttackRelease?: (note: string, dur: string, time?: number, v?: number) => void;
  triggerAttack?: (note: string, time?: number, v?: number) => void;
  triggerRelease?: (time?: number) => void;
  dispose?: () => void;
  connect?: (t?: unknown) => unknown;
}

// Lightweight record view of Tone to access constructors safely in test/runtime.
const toneRecord = Tone as unknown as Record<string, unknown>;

/** Look up a Tone constructor by name, returning undefined when absent (test/headless envs). */
export function getToneCtor<T>(name: string): (new (...args: unknown[]) => T) | undefined {
  const ctor = toneRecord[name];
  return typeof ctor === 'function' ? (ctor as new (...args: unknown[]) => T) : undefined;
}

/**
 * Stub panner/gain/filter nodes used by AudioEngine.reserveVoice's two fallback paths — when a
 * Tone constructor is unavailable (test/headless envs), and in reserveVoice's own catch-all when
 * composite voice construction throws. Previously two near-identical inline object literals per
 * node type (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 5); collapsed here into one shared shape
 * per node type, used by both fallback paths.
 */
export function makeStubPanner(): MinimalToneNode {
  return { connect: () => undefined, pan: { value: 0 }, disconnect: () => { } };
}

export function makeStubGain(initialValue: number): MinimalToneNode {
  return { connect: () => ({}), disconnect: () => { }, gain: { value: initialValue }, toDestination: () => { } };
}

export function makeStubFilter(): MinimalToneNode {
  return {
    connect: () => ({}),
    disconnect: () => { },
    toDestination: () => { },
    frequency: { value: 1200 },
    Q: { value: 1 },
    type: 'lowpass',
  };
}

/**
 * A live, connectable Tone Signal or Param of any unit type — the return type
 * of AudioEngine.getRobotModulationTarget and getGlobalModulationTarget
 * (docs/tasks/LFO_INTEGRATION_PLAN.md Tasks 9-10). `any` is unavoidable here,
 * not a shortcut: Tone.Signal/Param's real generic bound, UnitName, is
 * defined in tone's internal build path (core/type/Units.d.ts) and is not
 * re-exported from the public `tone` package — importing it would mean
 * depending on an unsupported, version-fragile internal path. Declared once
 * here so the `any` exists at exactly one site instead of being repeated at
 * every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ModulationTarget = Tone.Signal<any> | Tone.Param<any>;
