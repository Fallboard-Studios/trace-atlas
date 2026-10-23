import type * as Tone from 'tone';
import { describe, it, expect, vi } from 'vitest';

import { disposeVoiceNodes, type VoiceEntry } from './voiceEntry';
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
