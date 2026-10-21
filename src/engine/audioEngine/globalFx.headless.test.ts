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
  // Global Colour T3: the colour slot is skipped the same way when none of its constructors exist.
  Distortion: undefined,
  Chebyshev: undefined,
  BitCrusher: undefined,
  // Global Modulation T4: the modulation slot is skipped the same way.
  AutoWah: undefined,
  Phaser: undefined,
  // Global Pedals T4: the Chorus and the Tremolo are skipped the same way.
  Chorus: undefined,
  Tremolo: undefined,
  // Global Pedals T5.
  Vibrato: undefined,
  FrequencyShifter: undefined,
  // Global Pedals T6.
  StereoWidener: undefined,
  // The cycle-search cuts are skipped the same way.
  Delay: undefined,
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

  it('sets every colour field without throwing when no colour node exists', async () => {
    const globalFx = await import('./globalFx');
    globalFx.buildGlobalFxChain();
    expect(() => globalFx.setGlobalDistortion({ amount: 0.5, wet: 0.5 })).not.toThrow();
    expect(() => globalFx.setGlobalChebyshev({ order: 4, wet: 0.5 })).not.toThrow();
    expect(() => globalFx.setGlobalBitCrusher({ bits: 4, wet: 0.5 })).not.toThrow();
  });

  it('sets every Phaser field, including a stages change, without throwing when no Phaser exists', async () => {
    const globalFx = await import('./globalFx');
    globalFx.buildGlobalFxChain();
    expect(() =>
      globalFx.setGlobalPhaser({ rate: 2, octaves: 4, baseFrequency: 500, stages: 4, Q: 5, wet: 0.5 }),
    ).not.toThrow();
  });

  it('sets every Chorus and Tremolo field without throwing when neither node exists', async () => {
    const globalFx = await import('./globalFx');
    globalFx.buildGlobalFxChain();
    expect(() =>
      globalFx.setGlobalChorus({ rate: 2, delayTime: 5, depth: 0.5, spread: 90, feedback: 0.2, wet: 0.5 }),
    ).not.toThrow();
    expect(() => globalFx.setGlobalTremolo({ rate: 2, depth: 0.5, spread: 90, wet: 0.5 })).not.toThrow();
    expect(() => globalFx.setGlobalVibrato({ rate: 3, depth: 0.2, wet: 0.5 })).not.toThrow();
    expect(() => globalFx.setGlobalFrequencyShifter({ shift: -12, wet: 0.5 })).not.toThrow();
    expect(() => globalFx.setGlobalStereoWidener({ width: 0 })).not.toThrow();
  });

  it('sets every AutoWah field without throwing when no AutoWah exists', async () => {
    const globalFx = await import('./globalFx');
    globalFx.buildGlobalFxChain();
    expect(() =>
      globalFx.setGlobalAutoWah({ baseFrequency: 200, octaves: 4, sensitivity: -12, Q: 3, gain: 6, follower: 0.2, wet: 0.5 }),
    ).not.toThrow();
  });

  // Dark-Effect Bypass T2: with no Gain and no Delay constructor no bypass cell can exist, and with no effect constructor
  // either there is nothing to leave out, so nothing warns about the cells and every effect setter no-ops.
  it('builds no bypass cell, warns about none, and no-ops every effect setter', async () => {
    const { devWarn } = await import('@/utils/helpers');
    const globalFx = await import('./globalFx');
    vi.mocked(devWarn).mockClear();
    globalFx.buildGlobalFxChain();
    expect(vi.mocked(devWarn).mock.calls.filter(([message]) => String(message).includes('bypass'))).toHaveLength(0);
    expect(() => {
      globalFx.setGlobalDistortion({ amount: 0.5, wet: 0.5 });
      globalFx.setGlobalChebyshev({ order: 4, wet: 0.5 });
      globalFx.setGlobalBitCrusher({ bits: 4, wet: 0.5 });
      globalFx.setGlobalAutoWah({ Q: 3, wet: 0.5 });
      globalFx.setGlobalPhaser({ stages: 4, wet: 0.5 });
      globalFx.setGlobalChorus({ spread: 90, wet: 0.5 });
      globalFx.setGlobalTremolo({ spread: 90, wet: 0.5 });
      globalFx.setGlobalVibrato({ depth: 0.2, wet: 0.5 });
      globalFx.setGlobalFrequencyShifter({ shift: -12, wet: 0.5 });
      globalFx.setGlobalStereoWidener({ width: 0.8 });
      globalFx.wireGlobalFxChain(true);
    }).not.toThrow();
  });

  it('reports no rooms, so reserveVoice connects no send to anything', async () => {
    const globalFx = await import('./globalFx');
    globalFx.buildGlobalFxChain();
    expect(globalFx.getGlobalReverbRoom()).toBeNull();
    expect(globalFx.getGlobalDelayRoom()).toBeNull();
    // Robot Effect Sends T4: nor any of the three effect rooms.
    expect(globalFx.getGlobalRoomInput('grit')).toBeNull();
    expect(globalFx.getGlobalRoomInput('shimmer')).toBeNull();
    expect(globalFx.getGlobalRoomInput('double')).toBeNull();
  });

  it('no-ops the three effect room Returns without throwing when no room exists', async () => {
    const globalFx = await import('./globalFx');
    globalFx.buildGlobalFxChain();
    expect(() => {
      globalFx.setGlobalColourRoom({ wet: 0.5 });
      globalFx.setGlobalChorus({ wet: 0 });
      globalFx.setGlobalFrequencyShifter({ wet: 1 });
    }).not.toThrow();
  });
});
