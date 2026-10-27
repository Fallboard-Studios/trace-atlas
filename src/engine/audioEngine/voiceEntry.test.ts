import type * as Tone from 'tone';
import { beforeEach, describe, it, expect, vi } from 'vitest';

// One tick's length (docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §8.2), a value no ramp constant has, so a glide over it
// cannot pass by matching a caller's rampSeconds.
// `askedAt` records the time each read was for (plan Task 13: a tick reads its length once, keyed by its time).
const tick = vi.hoisted(() => ({ seconds: 0.137 as number | undefined, askedAt: [] as Array<number | undefined> }));
vi.mock('../beatClock', () => ({
  getTickSeconds: (time?: number) => {
    tick.askedAt.push(time);
    return tick.seconds;
  },
}));

import { disposeVoiceNodes, rampOrSet, setOrGlide, type VoiceEntry } from './voiceEntry';
import type { CompositeVoice } from './compositeVoice';
import type { SendEngineKey } from '../../data/robotSends';

// Robot Send Table T3 (docs/specs/ROBOT_SEND_TABLE.md §1.2): the voice entry holds its five send gains as one record keyed
// by engine key, and comes down in today's order: the composite, the sends in table order, then panner, busGain, busFilter.

const SEND_KEYS: readonly SendEngineKey[] = ['reverb', 'delay', 'grit', 'shimmer', 'double'];

/** An entry whose every node logs `<name>.disconnect` / `<name>.dispose` into one shared list. */
function loggingEntry() {
  const log: string[] = [];
  const node = (name: string) => ({
    disconnect: vi.fn(() => { log.push(`${name}.disconnect`); }),
    dispose: vi.fn(() => { log.push(`${name}.dispose`); }),
  });
  const sends = Object.fromEntries(SEND_KEYS.map((key) => [key, node(key)])) as unknown as Record<SendEngineKey, Tone.Gain>;
  const entry: VoiceEntry = {
    composite: { dispose: vi.fn(() => { log.push('composite.dispose'); }) } as unknown as CompositeVoice,
    panner: node('panner') as unknown as Tone.Panner,
    busGain: node('busGain') as unknown as Tone.Gain,
    busFilter: node('busFilter') as unknown as Tone.Filter,
    sends,
  };
  return { entry, log, sends: sends as unknown as Record<SendEngineKey, ReturnType<typeof node>> };
}

describe('disposeVoiceNodes', () => {
  it('disposes the composite, then disconnects and disposes the five sends in table order, then panner, busGain, busFilter', () => {
    const { entry, log } = loggingEntry();
    disposeVoiceNodes(entry);
    const order = ['reverb', 'delay', 'grit', 'shimmer', 'double', 'panner', 'busGain', 'busFilter'];
    expect(log).toEqual([
      'composite.dispose',
      ...order.map((name) => `${name}.disconnect`),
      ...order.map((name) => `${name}.dispose`),
    ]);
  });

  it('a send that throws on disconnect is still disposed, and every node after it still comes down', () => {
    const { entry, log, sends } = loggingEntry();
    sends.grit.disconnect.mockImplementation(() => { throw new Error('disconnect failed'); });
    expect(() => disposeVoiceNodes(entry)).not.toThrow();
    expect(sends.grit.dispose).toHaveBeenCalledTimes(1);
    for (const key of SEND_KEYS.filter((k) => k !== 'grit')) {
      expect(sends[key].disconnect, key).toHaveBeenCalledTimes(1);
      expect(sends[key].dispose, key).toHaveBeenCalledTimes(1);
    }
    expect(log).toContain('busFilter.dispose');
  });

  it('a send that throws on dispose stops none of the disposals after it', () => {
    const { entry, log, sends } = loggingEntry();
    sends.reverb.dispose.mockImplementation(() => { throw new Error('dispose failed'); });
    expect(() => disposeVoiceNodes(entry)).not.toThrow();
    expect(log.filter((step) => step.endsWith('.dispose'))).toEqual([
      'composite.dispose', 'delay.dispose', 'grit.dispose', 'shimmer.dispose', 'double.dispose',
      'panner.dispose', 'busGain.dispose', 'busFilter.dispose',
    ]);
  });

  it('tolerates nodes with no dispose (Tone nodes may or may not implement it)', () => {
    const { entry, sends } = loggingEntry();
    for (const key of SEND_KEYS) (sends[key] as { dispose?: unknown }).dispose = undefined;
    expect(() => disposeVoiceNodes(entry)).not.toThrow();
    for (const key of SEND_KEYS) expect(sends[key].disconnect, key).toHaveBeenCalledTimes(1);
  });
});

// BeatClock Transport time T1 (docs/specs/BEATCLOCK_TRANSPORT_TIME.md §5.1 item 2): a Transport tick hands its own
// time down, and with no time rampOrSet does exactly what it did before. Since docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md
// §8.2, a timed ramp lasts one tick (getTickSeconds), so a per-tick write glides into the next tick.
describe('rampOrSet', () => {
  beforeEach(() => {
    tick.seconds = 0.137;
    tick.askedAt.length = 0;
  });

  it('asks for the tick length at its own write time, so writes in one tick share one read', () => {
    const param = { rampTo: vi.fn(), value: 0 };
    rampOrSet(param, 0.5, 0.1, 12.25);
    rampOrSet(param, 0.5, 0.1, 0);
    expect(tick.askedAt).toEqual([12.25, 0]);
  });

  it('a param with rampTo, given a time, glides one tick from that time', () => {
    const param = { rampTo: vi.fn(), setValueAtTime: vi.fn(), value: 0 };
    rampOrSet(param, 0.5, 0.1, 12.25);
    expect(param.rampTo).toHaveBeenCalledTimes(1);
    expect(param.rampTo).toHaveBeenCalledWith(0.5, 0.137, 12.25);
    expect(param.setValueAtTime).not.toHaveBeenCalled();
    expect(param.value).toBe(0);
  });

  it('a timed ramp reads the tick length at write time, so a tempo change reaches the next write', () => {
    const param = { rampTo: vi.fn(), value: 0 };
    rampOrSet(param, 0.5, 0.1, 12.25);
    tick.seconds = 0.25;
    rampOrSet(param, 0.6, 0.1, 12.5);
    expect(param.rampTo.mock.calls).toEqual([[0.5, 0.137, 12.25], [0.6, 0.25, 12.5]]);
  });

  it('a timed ramp with no tick length (no transport) keeps its own rampSeconds', () => {
    tick.seconds = undefined;
    const param = { rampTo: vi.fn(), value: 0 };
    rampOrSet(param, 0.5, 0.1, 12.25);
    expect(param.rampTo).toHaveBeenCalledWith(0.5, 0.1, 12.25);
  });

  it('a param with rampTo and no time gets exactly two arguments and its own rampSeconds, as before', () => {
    const param = { rampTo: vi.fn(), value: 0 };
    rampOrSet(param, 0.5, 0.1);
    expect(param.rampTo).toHaveBeenCalledWith(0.5, 0.1);
    expect(param.rampTo.mock.calls[0]).toHaveLength(2);
  });

  it('an explicit undefined time is the same as no time', () => {
    const param = { rampTo: vi.fn(), value: 0 };
    rampOrSet(param, 0.5, 0.1, undefined);
    expect(param.rampTo.mock.calls[0]).toEqual([0.5, 0.1]);
  });

  it('a time of 0 is a time, not a missing one', () => {
    const param = { rampTo: vi.fn(), value: 0 };
    rampOrSet(param, 0.5, 0.1, 0);
    expect(param.rampTo).toHaveBeenCalledWith(0.5, 0.137, 0);
  });

  it('a param with setValueAtTime but no rampTo, given a time, gets a timed point and its value is untouched', () => {
    const param = { setValueAtTime: vi.fn(), value: 0 };
    rampOrSet(param, 0.5, 0.1, 12.25);
    expect(param.setValueAtTime).toHaveBeenCalledTimes(1);
    expect(param.setValueAtTime).toHaveBeenCalledWith(0.5, 12.25);
    expect(param.value).toBe(0);
  });

  it('a param with setValueAtTime but no rampTo, given no time, is assigned', () => {
    const param = { setValueAtTime: vi.fn(), value: 0 };
    rampOrSet(param, 0.5, 0.1);
    expect(param.setValueAtTime).not.toHaveBeenCalled();
    expect(param.value).toBe(0.5);
  });

  it('a param with neither is assigned, with or without a time (headless stubs)', () => {
    const timed = { value: 0 };
    rampOrSet(timed, 0.5, 0.1, 12.25);
    expect(timed.value).toBe(0.5);
    const untimed = { value: 0 };
    rampOrSet(untimed, 0.75, 0.1);
    expect(untimed.value).toBe(0.75);
  });
});

// BeatClock Transport time T2: the twin for writes that were `.value =` (layer gain, detune, filter Q, EQ bands). With
// a time it glides one tick when the param can ramp (docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §8.2), else a point.
describe('setOrGlide', () => {
  beforeEach(() => {
    tick.seconds = 0.137;
    tick.askedAt.length = 0;
  });

  it('asks for the tick length at its own write time, so writes in one tick share one read', () => {
    const param = { rampTo: vi.fn(), value: 0 };
    setOrGlide(param, 0.25, 4.5);
    setOrGlide(param, 0.25, 0);
    expect(tick.askedAt).toEqual([4.5, 0]);
  });

  it('given a time and a rampTo, glides one tick from that time and places no point', () => {
    const param = { rampTo: vi.fn(), setValueAtTime: vi.fn(), value: 1 };
    setOrGlide(param, 0.25, 4.5);
    expect(param.rampTo.mock.calls).toEqual([[0.25, 0.137, 4.5]]);
    expect(param.setValueAtTime).not.toHaveBeenCalled();
    expect(param.value).toBe(1);
  });

  it('given a time and a rampTo but no tick length, places a point there (the headless path)', () => {
    tick.seconds = undefined;
    const param = { rampTo: vi.fn(), setValueAtTime: vi.fn(), value: 1 };
    setOrGlide(param, 0.25, 4.5);
    expect(param.setValueAtTime).toHaveBeenCalledWith(0.25, 4.5);
    expect(param.rampTo).not.toHaveBeenCalled();
    expect(param.value).toBe(1);
  });

  it('given a time and only a setValueAtTime, places a point there and leaves value alone', () => {
    const param = { setValueAtTime: vi.fn(), value: 1 };
    setOrGlide(param, 0.25, 4.5);
    expect(param.setValueAtTime).toHaveBeenCalledWith(0.25, 4.5);
    expect(param.value).toBe(1);
  });

  it('given no time (or an explicit undefined), assigns, even on a param that can ramp', () => {
    const param = { rampTo: vi.fn(), setValueAtTime: vi.fn(), value: 1 };
    setOrGlide(param, 0.25);
    setOrGlide(param, 0.5, undefined);
    expect(param.rampTo).not.toHaveBeenCalled();
    expect(param.setValueAtTime).not.toHaveBeenCalled();
    expect(param.value).toBe(0.5);
  });

  it('given a time of 0, glides from 0', () => {
    const param = { rampTo: vi.fn(), value: 1 };
    setOrGlide(param, 0.25, 0);
    expect(param.rampTo).toHaveBeenCalledWith(0.25, 0.137, 0);
  });

  it('a stub with neither is assigned even with a time', () => {
    const param = { value: 1 };
    setOrGlide(param, 0.25, 4.5);
    expect(param.value).toBe(0.25);
  });
});
