// Robot Sends T2: with none of Tone's Reverb / FeedbackDelay / Gain constructors available (the headless
// case getToneCtor guards), the rooms and their returns are simply absent and nothing throws. Its own file
// because it needs a different Tone mock from globalFx.test.ts, and vi.doUnmock would remove that file's mock.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('tone', () => ({
  Compressor: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    threshold: { value: -18 },
  })),
  // Defined-but-absent: vitest throws on an export the factory never mentions, which is not what a headless Tone does.
  Reverb: undefined,
  FeedbackDelay: undefined,
  EQ3: undefined,
  Filter: undefined,
  Gain: undefined,
  Limiter: undefined,
}));

vi.mock('@/utils/helpers', () => ({
  devLog: vi.fn(),
  devWarn: vi.fn(),
}));

describe('globalFx without the room constructors', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('builds and rewires both ways without throwing', async () => {
    const globalFx = await import('./globalFx');
    expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
    expect(() => globalFx.wireGlobalFxChain(true)).not.toThrow();
    expect(() => globalFx.wireGlobalFxChain(false)).not.toThrow();
  });

  it('sets wet, decay and feedback without throwing', async () => {
    const globalFx = await import('./globalFx');
    globalFx.buildGlobalFxChain();
    expect(() => globalFx.setGlobalReverb({ wet: 0.5, decay: 2 })).not.toThrow();
    expect(() => globalFx.setGlobalDelay({ wet: 0.5, feedback: 0.1 })).not.toThrow();
  });

  it('reports no rooms, so reserveVoice connects no send to anything', async () => {
    const globalFx = await import('./globalFx');
    globalFx.buildGlobalFxChain();
    expect(globalFx.getGlobalReverbRoom()).toBeNull();
    expect(globalFx.getGlobalDelayRoom()).toBeNull();
  });
});
