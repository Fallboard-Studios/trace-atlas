// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// toneHasWebAudio() tells AudioEngine.reserveVoice whether a failed composite voice is worth a warning. The real
// Tone with no AudioContext (jsdom, Node, a browser without WebAudio) runs on its DummyContext, whose createGain()
// returns a bare object that `new Tone.Gain()` rejects with "param must be an AudioParam": every robot spawned
// against the real engine in a test logged that, 652 times in a full run on 2026-11-10. The check must be false
// there, true on a real Tone.Context, and true for a mocked Tone that exposes no context at all (the engine tests'
// mocks build their nodes fine, and are trusted as they are).
describe('toneHasWebAudio', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('tone');
  });

  it('is false under jsdom, where the real Tone runs on its DummyContext', async () => {
    const { toneHasWebAudio } = await import('./toneHelpers');
    expect(toneHasWebAudio()).toBe(false);
  });

  it('is true when getContext() hands back a Tone.Context', async () => {
    class FakeContext {}
    vi.doMock('tone', () => ({ Context: FakeContext, getContext: () => new FakeContext() }));
    const { toneHasWebAudio } = await import('./toneHelpers');
    expect(toneHasWebAudio()).toBe(true);
  });

  it('is false when getContext() hands back something that is not a Tone.Context', async () => {
    class FakeContext {}
    vi.doMock('tone', () => ({ Context: FakeContext, getContext: () => ({}) }));
    const { toneHasWebAudio } = await import('./toneHelpers');
    expect(toneHasWebAudio()).toBe(false);
  });

  it('trusts a mocked Tone that exposes no context at all', async () => {
    vi.doMock('tone', () => ({ Gain: class {} }));
    const { toneHasWebAudio } = await import('./toneHelpers');
    expect(toneHasWebAudio()).toBe(true);
  });

  it('trusts a mocked Tone whose getContext() throws', async () => {
    class FakeContext {}
    vi.doMock('tone', () => ({
      Context: FakeContext,
      getContext: () => {
        throw new Error('no context here');
      },
    }));
    const { toneHasWebAudio } = await import('./toneHelpers');
    expect(toneHasWebAudio()).toBe(true);
  });
});
