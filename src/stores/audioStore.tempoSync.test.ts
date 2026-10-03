// Free | Sync (docs/specs/FREE_SYNC_TOGGLE.md) store tests: the tempo re-apply (§1.6), lane Sync
// (§1.3/§1.5), Delay Sync (§1.3/§1.5/§1.6) and the BPM move to the Attenuation Style (§1.7).
// Split out of audioStore.test.ts in the post-ship code review (2026-10-03): every test here
// re-imports the store after vi.resetModules(), so one file of ~160 tests took ~18 s under the
// parallel run and tripped the 5 s per-test timeout at random. Same mocks as audioStore.test.ts —
// keep the two in step.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { LFO_LANE_IDS } from '../types/lfo';

// Ensure AudioEngine is mocked before importing the store so the module's
// import of AudioEngine receives the mock. The store now calls the full
// global-FX setter surface (Task 6), not just setBPM — keep this mock's
// shape matching what audioStore.ts actually depends on.
vi.mock('../engine/AudioEngine', () => ({
  AudioEngine: {
    setBPM: vi.fn(),
    setGlobalCompressor: vi.fn(),
    setGlobalEQ: vi.fn(),
    setGlobalFilterLPF: vi.fn(),
    setGlobalFilterHPF: vi.fn(),
    setGlobalLimiter: vi.fn(),
    setGlobalDelay: vi.fn(),
    setGlobalReverb: vi.fn(),
    setMasterVolume: vi.fn(),
  },
}));

// audioStore.ts imports wireGlobalFxChain directly from globalFx.ts (Task 9) —
// no circular-import risk here since globalFx.ts has zero store-layer imports.
vi.mock('../engine/audioEngine/globalFx', () => ({
  wireGlobalFxChain: vi.fn(),
}));

// The LFO Bank engine (docs/tasks/LFO_BANK.md Task 7).
vi.mock('../engine/lfoEngine', () => ({
  lfoEngine: {
    primeLfoBank: vi.fn(),
    setBankShape: vi.fn(),
    setBankRate: vi.fn(),
    setBankRateDrift: vi.fn(),
    setBankDepthDrift: vi.fn(),
    getBankSettings: vi.fn(),
    linkTarget: vi.fn(() => true),
    unlinkTarget: vi.fn(),
    disposeRobotLinks: vi.fn(),
    setDriftEnabled: vi.fn(),
    setFilterLinksEnabled: vi.fn(),
  },
}));

// docs/specs/FREE_SYNC_TOGGLE.md §1.6, Task 6: a tempo change re-pushes the resolved Hz of every
// synced lane (never a Free one), after the transport has the new tempo. Delay joins in Task 11.
describe('useAudioStore - setBPM re-applies tempo-synced lanes', () => {
  const QUARTER = { division: '1/4', modifier: 'straight' } as const;
  const EIGHTH_DOTTED = { division: '1/8', modifier: 'dotted' } as const;
  const FREE_LANE = { shape: 'sine', rate: 1.5, rateDrift: 0, depthDrift: 0 } as const;

  beforeEach(() => {
    vi.resetModules();
  });

  /** A fresh store with each given lane set (the rest left as seeded), bpm pinned, mocks cleared. */
  async function setup(lanes: Partial<Record<'a' | 'b' | 'c' | 'd', Record<string, unknown>>>, bpm = 60) {
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const { lfoEngine } = await import('../engine/lfoEngine');
    const lfoBank = { ...useAudioStore.getState().lfoBank } as Record<string, unknown>;
    // Every lane Free first, so the module-load seed can't leak a synced lane into a "none synced" case.
    for (const lane of LFO_LANE_IDS) lfoBank[lane] = { ...FREE_LANE };
    Object.assign(lfoBank, lanes);
    useAudioStore.setState({ bpm, lfoBank: lfoBank as never });
    vi.clearAllMocks();
    return { useAudioStore, AudioEngine, lfoEngine };
  }

  it('re-pushes a synced lane at the new tempo — 1/4 is 1 Hz at 60 BPM and 2 Hz at 120', async () => {
    const { useAudioStore, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).toHaveBeenCalledTimes(1);
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 2);
  });

  it('pushes the resolved Hz, not the stored Free rate underneath the sync', async () => {
    const { useAudioStore, lfoEngine } = await setup({ c: { ...FREE_LANE, rate: 7, sync: EIGHTH_DOTTED } }, 60);

    useAudioStore.getState().setBPM(90);

    // 1/8 dotted = 0.75 beats; at 90 BPM that is 0.5 s => 2 Hz
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('c', 1 / (0.75 * (60 / 90)));
  });

  it('never touches a Free lane — no rate, shape or drift push', async () => {
    const { useAudioStore, lfoEngine } = await setup({}, 60);

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    expect(lfoEngine.setBankShape).not.toHaveBeenCalled();
    expect(lfoEngine.setBankRateDrift).not.toHaveBeenCalled();
    expect(lfoEngine.setBankDepthDrift).not.toHaveBeenCalled();
  });

  it('re-pushes only the synced lanes in a mixed bank — each at its own note, the Free ones left alone', async () => {
    const { useAudioStore, lfoEngine } = await setup(
      { a: { ...FREE_LANE, sync: QUARTER }, c: { ...FREE_LANE, sync: EIGHTH_DOTTED } },
      60,
    );

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).toHaveBeenCalledTimes(2);
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('a', 2);
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('c', 1 / 0.375);
    expect(lfoEngine.setBankRate).not.toHaveBeenCalledWith('b', expect.anything());
    expect(lfoEngine.setBankRate).not.toHaveBeenCalledWith('d', expect.anything());
  });

  it('re-pushes all four lanes when all four are synced', async () => {
    const synced = { ...FREE_LANE, sync: QUARTER };
    const { useAudioStore, lfoEngine } = await setup({ a: synced, b: synced, c: synced, d: synced }, 60);

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).toHaveBeenCalledTimes(4);
    for (const lane of LFO_LANE_IDS) expect(lfoEngine.setBankRate).toHaveBeenCalledWith(lane, 2);
  });

  it('writes state, then the transport, then the lanes — the lanes resolve against the tempo the transport already has', async () => {
    const { useAudioStore, AudioEngine, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);
    let bpmInStateAtTransportCall: number | undefined;
    vi.mocked(AudioEngine.setBPM).mockImplementation(() => {
      bpmInStateAtTransportCall = useAudioStore.getState().bpm;
    });

    useAudioStore.getState().setBPM(120);

    expect(bpmInStateAtTransportCall).toBe(120);
    const transportOrder = vi.mocked(AudioEngine.setBPM).mock.invocationCallOrder[0];
    const laneOrder = vi.mocked(lfoEngine.setBankRate).mock.invocationCallOrder[0];
    expect(transportOrder).toBeLessThan(laneOrder);
  });

  it('a note that would outrun the lane cap at the new tempo clamps to 20 Hz, never more', async () => {
    const { useAudioStore, lfoEngine } = await setup({ d: { ...FREE_LANE, sync: { division: '1/32', modifier: 'triplet' } } }, 60);

    useAudioStore.getState().setBPM(200);

    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('d', 20);
  });

  it('a note too slow for the lane at the new tempo clamps to the floor — it does not push 0 and stop the lane', async () => {
    const { useAudioStore, lfoEngine } = await setup({ a: { ...FREE_LANE, sync: { division: '4', modifier: 'straight' } } }, 60);

    useAudioStore.getState().setBPM(20); // 4 bars at 20 BPM = 48 s per cycle, ~0.021 Hz

    const pushed = vi.mocked(lfoEngine.setBankRate).mock.calls.at(-1)![1];
    expect(pushed).toBeGreaterThan(0);
    expect(pushed).toBeCloseTo(1 / 48, 6);
  });

  it('an unrecognised sync value counts as Free — it is not re-pushed', async () => {
    const { useAudioStore, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: { division: '1/3', modifier: 'straight' } } }, 60);

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
  });

  it('every tick of a tempo drag re-pushes at that tick\'s tempo', async () => {
    const { useAudioStore, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);

    useAudioStore.getState().setBPM(90);
    useAudioStore.getState().setBPM(120);
    useAudioStore.getState().setBPM(150);

    expect(vi.mocked(lfoEngine.setBankRate).mock.calls).toEqual([
      ['b', 1.5],
      ['b', 2],
      ['b', 2.5],
    ]);
  });

  it('does not alter lane state — the stored note and Free rate are untouched by a tempo change', async () => {
    const { useAudioStore } = await setup({ b: { ...FREE_LANE, rate: 3, sync: QUARTER } }, 60);

    useAudioStore.getState().setBPM(120);

    expect(useAudioStore.getState().lfoBank.b).toStrictEqual({ ...FREE_LANE, rate: 3, sync: QUARTER });
  });

  it('regenerateBpmFromSeed (the Attenuation Style reseed) goes through the same re-apply', async () => {
    const { useAudioStore, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);

    useAudioStore.getState().regenerateBpmFromSeed('att-style-id', 'att-style-name');

    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');
    const seeded = generateAttenuationStyleBpm('att-style-id', 'att-style-name');
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', seeded / 60);
  });

  it('is safe before audio has started — no throw when AudioEngine is not initialised', async () => {
    const { useAudioStore, AudioEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);
    // AudioEngine.setBPM no-ops pre-start (its own guard); the lane push must not need an engine check either.
    vi.mocked(AudioEngine.setBPM).mockImplementation(() => undefined);

    expect(() => useAudioStore.getState().setBPM(100)).not.toThrow();
    expect(useAudioStore.getState().bpm).toBe(100);
  });
});

// docs/specs/FREE_SYNC_TOGGLE.md §1.3/§1.5, Task 5: a lane's Rate reaches the engine only as a
// resolved Hz, never as the note value; a Free lane behaves exactly as before.
describe('useAudioStore - lane Sync: setLfoBank resolves, replaceLfoBankLane / setLfoBankLaneSyncMode', () => {
  const QUARTER = { division: '1/4', modifier: 'straight' } as const;
  const EIGHTH_DOTTED = { division: '1/8', modifier: 'dotted' } as const;
  const FREE_LANE = { shape: 'sine', rate: 1.5, rateDrift: 0, depthDrift: 0 } as const;

  beforeEach(() => {
    vi.resetModules();
  });

  /** A fresh store with lane `lane` set to `settings`, the others left as seeded, bpm pinned, mocks cleared. */
  async function setup(lane: 'a' | 'b' | 'c' | 'd', settings: Record<string, unknown>, bpm = 60) {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    useAudioStore.setState({ bpm, lfoBank: { ...useAudioStore.getState().lfoBank, [lane]: settings as never } });
    vi.clearAllMocks();
    return { useAudioStore, lfoEngine };
  }

  describe('setLfoBank', () => {
    it('{ sync } pushes the note\'s resolved Hz, not the stored Free rate — 1/4 at 120 BPM is 2 Hz', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { sync: QUARTER });

      expect(lfoEngine.setBankRate).toHaveBeenCalledTimes(1);
      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 2);
      expect(useAudioStore.getState().lfoBank.b.sync).toEqual(QUARTER);
    });

    it('{ sync } at a different tempo resolves at that tempo — 1/4 at 60 BPM is 1 Hz', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 60);

      useAudioStore.getState().setLfoBank('b', { sync: QUARTER });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 1);
    });

    it('{ sync } whose note is faster than the lane cap clamps into range — 1/32 triplet at 200 BPM pushes 20 Hz, never more', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 200);

      useAudioStore.getState().setLfoBank('b', { sync: { division: '1/32', modifier: 'triplet' } });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 20);
    });

    it('a Free-rate edit on an already-synced lane keeps pushing the synced Hz — the stored rate is ignored while sync is present', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', { ...FREE_LANE, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setLfoBank('b', { rate: 9 });

      expect(useAudioStore.getState().lfoBank.b.rate).toBe(9); // the Free value is still stored underneath
      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 1 / 0.75);
    });

    it('a Free lane\'s { rate } edit pushes the typed rate exactly as before', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { rate: 3.25 });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 3.25);
    });

    it('a { rate: 0 } edit on a Free lane still pushes 0 (the lane stops) — only a synced lane is "always running"', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { rate: 0 });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 0);
    });

    it('{ shape } alone pushes no rate — a sync lane\'s rate is not re-sent on an unrelated edit', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', { ...FREE_LANE, sync: QUARTER }, 60);

      useAudioStore.getState().setLfoBank('b', { shape: 'square' });

      expect(lfoEngine.setBankShape).toHaveBeenCalledWith('b', 'square');
      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });

    it('{ rateDrift } on a synced lane still reaches the engine while drift applies to synced lanes (the shipped constant)', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', { ...FREE_LANE, sync: QUARTER }, 60);

      useAudioStore.getState().setLfoBank('b', { rateDrift: 0.5 });

      expect(lfoEngine.setBankRateDrift).toHaveBeenCalledWith('b', 0.5);
      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });

    it('{ sync: undefined } is a no-op: a merge can never delete a key, so the lane stays synced, no `undefined` lands in state, and nothing is pushed', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', { ...FREE_LANE, sync: QUARTER }, 120);

      useAudioStore.getState().setLfoBank('b', { sync: undefined });

      expect(useAudioStore.getState().lfoBank.b.sync).toEqual(QUARTER);
      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });

    it('an undefined-valued key never lands in state through the merge (spec §3: a Free result has no `sync` key, never `sync: undefined`)', async () => {
      const { useAudioStore } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { sync: undefined, rateDrift: 0.3 });

      expect('sync' in useAudioStore.getState().lfoBank.b).toBe(false);
      expect(useAudioStore.getState().lfoBank.b.rateDrift).toBe(0.3);
    });

    it('an unrecognised sync value resolves as Free — the stored rate is pushed, not NaN from a bogus note', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { sync: { division: '1/3', modifier: 'straight' } as never });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 1.5);
    });
  });

  describe('replaceLfoBankLane', () => {
    it('writes the lane whole — a Free lane over a synced one leaves no `sync` key at all', async () => {
      const { useAudioStore } = await setup('c', { ...FREE_LANE, sync: QUARTER });

      useAudioStore.getState().replaceLfoBankLane('c', { ...FREE_LANE });

      expect('sync' in useAudioStore.getState().lfoBank.c).toBe(false);
      expect(useAudioStore.getState().lfoBank.c).toEqual(FREE_LANE);
    });

    it('is a replace, not a merge — a field the new settings omit does not survive from the old lane', async () => {
      const { useAudioStore } = await setup('c', { shape: 'square', rate: 4, rateDrift: 0.3, depthDrift: 0.4, sync: QUARTER });

      useAudioStore.getState().replaceLfoBankLane('c', { shape: 'sine', rate: 1, rateDrift: 0, depthDrift: 0 });

      expect(useAudioStore.getState().lfoBank.c).toStrictEqual({ shape: 'sine', rate: 1, rateDrift: 0, depthDrift: 0 });
    });

    it('pushes the whole lane to the engine: shape, the resolved Hz, and both drifts', async () => {
      const { useAudioStore, lfoEngine } = await setup('c', FREE_LANE, 120);

      useAudioStore.getState().replaceLfoBankLane('c', { shape: 'triangle', rate: 7, rateDrift: 0.25, depthDrift: 0.5, sync: QUARTER });

      expect(lfoEngine.setBankShape).toHaveBeenCalledWith('c', 'triangle');
      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('c', 2); // 1/4 at 120, not the stored 7
      expect(lfoEngine.setBankRateDrift).toHaveBeenCalledWith('c', 0.25);
      expect(lfoEngine.setBankDepthDrift).toHaveBeenCalledWith('c', 0.5);
    });

    it('pushes a Free lane\'s stored rate unchanged, including 0', async () => {
      const { useAudioStore, lfoEngine } = await setup('c', { ...FREE_LANE, sync: QUARTER }, 120);

      useAudioStore.getState().replaceLfoBankLane('c', { shape: 'sine', rate: 0, rateDrift: 0, depthDrift: 0 });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('c', 0);
    });

    it('touches only the named lane', async () => {
      const { useAudioStore } = await setup('c', FREE_LANE);
      const before = useAudioStore.getState().lfoBank;

      useAudioStore.getState().replaceLfoBankLane('c', { shape: 'square', rate: 2, rateDrift: 0, depthDrift: 0 });

      expect(useAudioStore.getState().lfoBank.a).toBe(before.a);
      expect(useAudioStore.getState().lfoBank.b).toBe(before.b);
      expect(useAudioStore.getState().lfoBank.d).toBe(before.d);
    });

    it('is a safe no-op for undefined settings, same defence as setLfoBank', async () => {
      const { useAudioStore, lfoEngine } = await setup('c', FREE_LANE);
      const before = useAudioStore.getState().lfoBank;

      expect(() => useAudioStore.getState().replaceLfoBankLane('c', undefined as never)).not.toThrow();

      expect(useAudioStore.getState().lfoBank).toBe(before);
      expect(lfoEngine.setBankShape).not.toHaveBeenCalled();
      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });
  });

  describe('setLfoBankLaneSyncMode', () => {
    it('Free -> Sync snaps to the nearest allowed note and pushes its Hz — 1.5 Hz at 60 BPM is a 1/4 triplet (1.5 Hz exactly)', async () => {
      const { useAudioStore, lfoEngine } = await setup('a', FREE_LANE, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);

      expect(useAudioStore.getState().lfoBank.a.sync).toEqual({ division: '1/4', modifier: 'triplet' });
      expect(useAudioStore.getState().lfoBank.a.rate).toBe(1.5); // the Free value is kept underneath
      expect(lfoEngine.setBankRate).toHaveBeenLastCalledWith('a', 1.5);
    });

    it('Free -> Sync from a held 0 Hz lands on the slowest allowed note, not a crash and not 0', async () => {
      const { useAudioStore, lfoEngine } = await setup('a', { ...FREE_LANE, rate: 0 }, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);

      const lane = useAudioStore.getState().lfoBank.a;
      expect(lane.sync).toBeDefined();
      const pushed = vi.mocked(lfoEngine.setBankRate).mock.calls.at(-1)![1];
      expect(pushed).toBeGreaterThan(0);
      expect(pushed).toBeLessThan(0.1); // 4 bars at 60 BPM = 0.0625 Hz, the slowest note that fits
    });

    it('Sync -> Free keeps what the user hears: the resolved Hz becomes the Free rate, and the `sync` key is gone', async () => {
      const { useAudioStore, lfoEngine } = await setup('a', { ...FREE_LANE, rate: 9, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);

      const lane = useAudioStore.getState().lfoBank.a;
      expect('sync' in lane).toBe(false);
      expect(lane.rate).toBeCloseTo(1.35, 10); // 1/8 dotted at 60 BPM = 0.75 s
      expect(lfoEngine.setBankRate).toHaveBeenLastCalledWith('a', lane.rate);
    });

    it('a Free -> Sync -> Free round trip leaves no `sync` key and the lane within one slider step of where it started', async () => {
      const { useAudioStore } = await setup('a', FREE_LANE, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);
      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);

      const lane = useAudioStore.getState().lfoBank.a;
      expect('sync' in lane).toBe(false);
      expect(lane.rate).toBeCloseTo(1.5, 10);
      expect(lane.shape).toBe('sine');
    });

    it('Sync -> Free at a tempo where the note is slower than one slider step floors at one step, never 0 (a running lane must not stop)', async () => {
      const { useAudioStore, lfoEngine } = await setup('a', { ...FREE_LANE, sync: { division: '4', modifier: 'straight' } }, 20);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);

      expect(useAudioStore.getState().lfoBank.a.rate).toBeGreaterThan(0);
      expect(vi.mocked(lfoEngine.setBankRate).mock.calls.at(-1)![1]).toBeGreaterThan(0);
    });

    it('setting Free on an already-Free lane changes nothing but still carries no `sync` key — a held 0 Hz stays 0', async () => {
      const { useAudioStore } = await setup('a', { ...FREE_LANE, rate: 0 }, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);

      expect(useAudioStore.getState().lfoBank.a).toStrictEqual({ ...FREE_LANE, rate: 0 });
    });

    it('setting Sync on an already-synced lane keeps its note — a stale Free rate is not a request to re-snap', async () => {
      const { useAudioStore } = await setup('a', { ...FREE_LANE, rate: 9, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);

      expect(useAudioStore.getState().lfoBank.a.sync).toEqual(EIGHTH_DOTTED);
    });

    it('touches only the named lane', async () => {
      const { useAudioStore } = await setup('a', FREE_LANE, 60);
      const before = useAudioStore.getState().lfoBank;

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);

      expect(useAudioStore.getState().lfoBank.b).toBe(before.b);
      expect(useAudioStore.getState().lfoBank.c).toBe(before.c);
      expect(useAudioStore.getState().lfoBank.d).toBe(before.d);
    });

    it('keeps the lane JSON-serialisable in both modes (state rule — no undefined `sync` key, no functions)', async () => {
      const { useAudioStore } = await setup('a', FREE_LANE, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);
      expect(JSON.parse(JSON.stringify(useAudioStore.getState().lfoBank.a))).toEqual(useAudioStore.getState().lfoBank.a);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);
      expect(JSON.stringify(useAudioStore.getState().lfoBank.a)).not.toContain('sync');
    });
  });
});

// docs/specs/FREE_SYNC_TOGGLE.md §1.3 (delay rows), §1.5, §1.6, Task 11: the engine only ever hears
// plain seconds. A synced Delay resolves from the store's bpm at every push site; a Free one — and any
// partial that carries neither `delayTime` nor `sync`, i.e. an Audio Swell's `{ wet }` — is untouched.
describe('useAudioStore - Delay Sync (docs/specs/FREE_SYNC_TOGGLE.md Task 11)', () => {
  const QUARTER = { division: '1/4', modifier: 'straight' } as const;
  const EIGHTH_DOTTED = { division: '1/8', modifier: 'dotted' } as const;
  const QUARTER_TRIPLET = { division: '1/4', modifier: 'triplet' } as const;
  const FOUR_BARS = { division: '4', modifier: 'straight' } as const;
  const FREE_DELAY = { delayTime: 0.9, feedback: 0.3, wet: 0.25 } as const;

  beforeEach(() => {
    vi.resetModules();
  });

  /** A fresh store with the given delay and bpm installed, every mock cleared. */
  async function setup(delay: Record<string, unknown>, bpm = 60) {
    const { useAudioStore, applyGlobalAudioToEngine } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const { lfoEngine } = await import('../engine/lfoEngine');
    useAudioStore.setState({
      bpm,
      globalAudio: { ...useAudioStore.getState().globalAudio, delay: delay as never },
    });
    vi.clearAllMocks();
    return { useAudioStore, applyGlobalAudioToEngine, AudioEngine, lfoEngine };
  }

  /** The single argument of the last AudioEngine.setGlobalDelay call. */
  function lastDelayPush(AudioEngine: { setGlobalDelay: unknown }): Record<string, unknown> {
    return vi.mocked(AudioEngine.setGlobalDelay as (p: unknown) => void).mock.calls.at(-1)![0] as Record<string, unknown>;
  }

  describe('setGlobalAudio(\'delay\', …)', () => {
    it('a `sync` partial pushes the resolved seconds — 1/4 is 1 s at 60 BPM — and no `sync` key', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: QUARTER });

      expect(AudioEngine.setGlobalDelay).toHaveBeenCalledTimes(1);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 1 });
    });

    it('resolves against the store\'s current bpm — the same note is 0.5 s at 120 BPM', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 120);

      useAudioStore.getState().setGlobalAudio('delay', { sync: QUARTER });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.5 });
    });

    it('stores the note itself in state, not the seconds it resolves to', async () => {
      const { useAudioStore } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: EIGHTH_DOTTED });

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(EIGHTH_DOTTED);
      expect(useAudioStore.getState().globalAudio.delay.delayTime).toBe(0.9); // the Free value underneath, untouched
    });

    it('a Free `delayTime` partial is forwarded as that number', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { delayTime: 0.3 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.3 });
    });

    it('a Free `delayTime` edit on a synced Delay re-sends the synced seconds, not the number just typed', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setGlobalAudio('delay', { delayTime: 0.3 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 1 });
      expect(useAudioStore.getState().globalAudio.delay.delayTime).toBe(0.3); // still recorded underneath
    });

    it('an Audio Swell\'s `{ wet }` is forwarded exactly — no delayTime added — on a Free Delay', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { wet: 0.4 });

      expect(AudioEngine.setGlobalDelay).toHaveBeenCalledTimes(1);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ wet: 0.4 });
    });

    it('an Audio Swell\'s `{ wet }` is forwarded exactly on a SYNCED Delay too — the swell path must not re-push the time every tick', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setGlobalAudio('delay', { wet: 0.4 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ wet: 0.4 });
    });

    it('`{ feedback }` alone is forwarded exactly, on a synced Delay as well', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setGlobalAudio('delay', { feedback: 0.45 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ feedback: 0.45 });
    });

    it('a partial carrying `sync` plus other keys pushes those keys alongside the resolved seconds, still with no `sync`', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: QUARTER, feedback: 0.5 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ feedback: 0.5, delayTime: 1 });
    });

    it('clamps a note longer than the node allows into 10 s — 4 bars at 40 BPM is 24 s', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 40);

      useAudioStore.getState().setGlobalAudio('delay', { sync: FOUR_BARS });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 10 });
    });

    it('an explicit `sync: undefined` is a no-op: the Delay stays synced, no `undefined` lands in state, nothing is pushed', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: undefined });

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(QUARTER);
      expect(AudioEngine.setGlobalDelay).not.toHaveBeenCalled();
    });

    it('an undefined-valued key is dropped from the merge while the rest of the partial still applies', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: undefined, feedback: 0.45 });

      expect('sync' in useAudioStore.getState().globalAudio.delay).toBe(false);
      expect(useAudioStore.getState().globalAudio.delay.feedback).toBe(0.45);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ feedback: 0.45 });
    });

    it('leaves every other effect\'s setter untouched', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: QUARTER });

      expect(AudioEngine.setGlobalReverb).not.toHaveBeenCalled();
      expect(AudioEngine.setGlobalCompressor).not.toHaveBeenCalled();
    });
  });

  describe('applyGlobalAudioToEngine(globalAudio, bpm)', () => {
    it('pushes a Free Delay as it is stored', async () => {
      const { useAudioStore, applyGlobalAudioToEngine, AudioEngine } = await setup(FREE_DELAY, 60);

      applyGlobalAudioToEngine(useAudioStore.getState().globalAudio, 60);

      expect(lastDelayPush(AudioEngine)).toStrictEqual(FREE_DELAY);
    });

    it('pushes a synced Delay with delayTime resolved at the given bpm, feedback/wet kept, and no `sync` key', async () => {
      const { useAudioStore, applyGlobalAudioToEngine, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      applyGlobalAudioToEngine(useAudioStore.getState().globalAudio, 60);

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 1, feedback: 0.3, wet: 0.25 });
    });

    it('uses the bpm it is GIVEN, not whatever the store holds — a session restore passes its own tempo', async () => {
      const { useAudioStore, applyGlobalAudioToEngine, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      applyGlobalAudioToEngine(useAudioStore.getState().globalAudio, 120);

      expect(lastDelayPush(AudioEngine).delayTime).toBe(0.5);
    });

    it('does not mutate the object it is given — the stored Delay keeps its `sync`', async () => {
      const { useAudioStore, applyGlobalAudioToEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);
      const globalAudio = useAudioStore.getState().globalAudio;

      applyGlobalAudioToEngine(globalAudio, 60);

      expect(globalAudio.delay.sync).toEqual(QUARTER);
      expect(globalAudio.delay.delayTime).toBe(0.9);
    });

    it('still pushes every other effect exactly as stored', async () => {
      const { useAudioStore, applyGlobalAudioToEngine, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);
      const { globalAudio } = useAudioStore.getState();

      applyGlobalAudioToEngine(globalAudio, 60);

      expect(AudioEngine.setGlobalCompressor).toHaveBeenCalledWith(globalAudio.compressor);
      expect(AudioEngine.setGlobalEQ).toHaveBeenCalledWith(globalAudio.eq3);
      expect(AudioEngine.setGlobalFilterLPF).toHaveBeenCalledWith(globalAudio.filterLPF);
      expect(AudioEngine.setGlobalFilterHPF).toHaveBeenCalledWith(globalAudio.filterHPF);
      expect(AudioEngine.setGlobalLimiter).toHaveBeenCalledWith(globalAudio.limiter);
      expect(AudioEngine.setGlobalReverb).toHaveBeenCalledWith(globalAudio.reverb);
    });
  });

  describe('regenerateGlobalAudioFromSeed', () => {
    afterEach(() => {
      vi.doUnmock('../utils/globalAudioSeed');
    });

    it('resolves a seeded synced Delay at the store\'s current bpm (Task 13 will seed one; the wiring must already be there)', async () => {
      vi.doMock('../utils/globalAudioSeed', async (importOriginal) => {
        const real = await importOriginal<typeof import('../utils/globalAudioSeed')>();
        return {
          ...real,
          generateGlobalAudioSettings: (...args: Parameters<typeof real.generateGlobalAudioSettings>) => {
            const generated = real.generateGlobalAudioSettings(...args);
            return { ...generated, delay: { ...generated.delay, sync: QUARTER } };
          },
        };
      });
      const { useAudioStore } = await import('./audioStore');
      const { AudioEngine } = await import('../engine/AudioEngine');
      useAudioStore.setState({ bpm: 120 });
      vi.clearAllMocks();

      useAudioStore.getState().regenerateGlobalAudioFromSeed('delay-sync-regen', 'Delay Sync Regen');

      expect(lastDelayPush(AudioEngine).delayTime).toBe(0.5);
      expect('sync' in lastDelayPush(AudioEngine)).toBe(false);
      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(QUARTER); // state keeps the note
    });
  });

  describe('setBPM re-applies a synced Delay (spec §1.6)', () => {
    it('re-pushes the resolved seconds at the new tempo — 1/4 is 1 s at 60 and 0.5 s at 120', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setBPM(120);

      expect(AudioEngine.setGlobalDelay).toHaveBeenCalledTimes(1);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.5 });
    });

    it('pushes the resolved seconds, not the Free delayTime stored underneath the sync', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 7, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setBPM(90);

      // 1/8 dotted = 0.75 beats; at 90 BPM a beat is 2/3 s
      expect(lastDelayPush(AudioEngine).delayTime).toBeCloseTo(0.75 * (60 / 90), 10);
    });

    it('never touches a Free Delay', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setBPM(120);

      expect(AudioEngine.setGlobalDelay).not.toHaveBeenCalled();
    });

    it('clamps into the node\'s range as the tempo drops — 4 bars is 16 s at 60 BPM, so the push is 10', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: FOUR_BARS }, 120);

      useAudioStore.getState().setBPM(60);

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 10 });
    });

    it('moving the tempo back restores the note\'s own seconds — the clamp is never written into state', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: FOUR_BARS }, 120);

      useAudioStore.getState().setBPM(60);
      useAudioStore.getState().setBPM(120);

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(FOUR_BARS);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 8 }); // 16 beats at 120 BPM
    });

    it('re-pushes the Delay and a synced lane together, each at its own note', async () => {
      const { useAudioStore, AudioEngine, lfoEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);
      const lfoBank = { ...useAudioStore.getState().lfoBank };
      lfoBank.a = { shape: 'sine', rate: 1.5, rateDrift: 0, depthDrift: 0, sync: EIGHTH_DOTTED };
      useAudioStore.setState({ lfoBank });
      vi.clearAllMocks();

      useAudioStore.getState().setBPM(120);

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.5 });
      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('a', 1 / 0.375);
    });

    it('runs after the transport has the new tempo', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setBPM(120);

      const bpmOrder = vi.mocked(AudioEngine.setBPM).mock.invocationCallOrder[0];
      const delayOrder = vi.mocked(AudioEngine.setGlobalDelay).mock.invocationCallOrder[0];
      expect(bpmOrder).toBeLessThan(delayOrder);
    });
  });

  describe('setDelaySyncMode', () => {
    it('Free -> Sync snaps to the nearest allowed note, keeps delayTime underneath, and pushes that note\'s seconds', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(true);

      // 0.9 s: 1/4 (1 s) is 0.1 away, 1/8 dotted (0.75 s) is 0.15 away
      expect(useAudioStore.getState().globalAudio.delay).toStrictEqual({ ...FREE_DELAY, sync: QUARTER });
      expect(AudioEngine.setGlobalDelay).toHaveBeenCalledTimes(1);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 1 });
    });

    it('Sync -> Free keeps what the user hears: delayTime becomes the resolved seconds and `sync` is DELETED', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 7, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setDelaySyncMode(false);

      const delay = useAudioStore.getState().globalAudio.delay;
      expect(delay).toStrictEqual({ delayTime: 0.75, feedback: 0.3, wet: 0.25 });
      expect('sync' in delay).toBe(false);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.75 });
    });

    it('Sync -> Free quantises to the slider step, and pushes the same number it stored (no audible jump)', async () => {
      // 1/4 triplet at 70 BPM = (2/3) * 60/70 = 0.571428… s
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER_TRIPLET }, 70);

      useAudioStore.getState().setDelaySyncMode(false);

      const stored = useAudioStore.getState().globalAudio.delay.delayTime;
      expect(stored).toBe(0.571);
      expect(lastDelayPush(AudioEngine).delayTime).toBe(stored);
    });

    it('Sync -> Free from a clamped note stores the clamped seconds — what was audible — not the raw 24 s', async () => {
      const { useAudioStore } = await setup({ ...FREE_DELAY, sync: FOUR_BARS }, 40);

      useAudioStore.getState().setDelaySyncMode(false);

      expect(useAudioStore.getState().globalAudio.delay.delayTime).toBe(10);
    });

    it('a Free -> Sync -> Free round trip leaves no `sync` key anywhere in the serialised delay', async () => {
      const { useAudioStore } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(true);
      useAudioStore.getState().setDelaySyncMode(false);

      expect(JSON.stringify(useAudioStore.getState().globalAudio.delay)).not.toContain('sync');
    });

    it('keeps the stored state JSON-serialisable while synced (no functions, no undefined keys)', async () => {
      const { useAudioStore } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(true);

      const delay = useAudioStore.getState().globalAudio.delay;
      expect(JSON.parse(JSON.stringify(delay))).toStrictEqual(delay);
    });

    it('setting Sync on an already-synced Delay keeps its note — a stale Free delayTime is not a request to re-snap', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 7, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setDelaySyncMode(true);

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(EIGHTH_DOTTED);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.75 });
    });

    it('setting Free on an already-Free Delay changes nothing and pushes its own delayTime', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(false);

      expect(useAudioStore.getState().globalAudio.delay).toStrictEqual(FREE_DELAY);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.9 });
    });

    it('a Delay at 0 s snaps to the shortest allowed note, not to NaN or a crash', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 0 }, 60);
      const { allowedDelayNoteValues } = await import('../utils/tempoSync');

      useAudioStore.getState().setDelaySyncMode(true);

      const shortest = allowedDelayNoteValues(60)[0];
      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(shortest);
      expect(lastDelayPush(AudioEngine).delayTime).toBeGreaterThan(0);
    });

    it('a Delay at the 10 s ceiling on a slow tempo snaps to a note that fits, and never pushes past 10', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 10 }, 40);
      const { allowedDelayNoteValues } = await import('../utils/tempoSync');

      useAudioStore.getState().setDelaySyncMode(true);

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(allowedDelayNoteValues(40).at(-1));
      expect(lastDelayPush(AudioEngine).delayTime as number).toBeLessThanOrEqual(10);
    });

    it('leaves feedback, wet and every other effect alone, and pushes nothing but delayTime', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);
      const before = useAudioStore.getState().globalAudio;

      useAudioStore.getState().setDelaySyncMode(true);

      const after = useAudioStore.getState().globalAudio;
      expect(after.delay.feedback).toBe(0.3);
      expect(after.delay.wet).toBe(0.25);
      expect(after.reverb).toBe(before.reverb);
      expect(after.compressor).toBe(before.compressor);
      expect(Object.keys(lastDelayPush(AudioEngine))).toEqual(['delayTime']);
      expect(AudioEngine.setGlobalReverb).not.toHaveBeenCalled();
    });

    it('does not touch the LFO Bank engine', async () => {
      const { useAudioStore, lfoEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(true);

      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });
  });
});

describe('useAudioStore - regenerateBpmFromSeed (docs/specs/FREE_SYNC_TOGGLE.md §1.7)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('calls setBPM with exactly generateAttenuationStyleBpm(id, name)\'s result', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');
    const { AudioEngine } = await import('../engine/AudioEngine');
    vi.clearAllMocks();

    useAudioStore.getState().regenerateBpmFromSeed('bpm-store-test-as', 'Bpm Store Test');

    const expected = generateAttenuationStyleBpm('bpm-store-test-as', 'Bpm Store Test');
    expect(useAudioStore.getState().bpm).toBe(expected);
    expect(AudioEngine.setBPM).toHaveBeenCalledWith(expected);
  });

  it('a second call for a different Attenuation Style reflects that call\'s own fresh draw, not a stale value left by the first', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');

    useAudioStore.getState().regenerateBpmFromSeed('bpm-store-test-as-a', 'Bpm Store Alpha');
    expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm('bpm-store-test-as-a', 'Bpm Store Alpha'));

    useAudioStore.getState().regenerateBpmFromSeed('bpm-store-test-as-b', 'Bpm Store Beta');
    expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm('bpm-store-test-as-b', 'Bpm Store Beta'));
  });
});

describe('useAudioStore - BPM Attenuation Style sync (docs/specs/FREE_SYNC_TOGGLE.md §1.7)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('seeds bpm for the Attenuation Style current at boot, within BPM_SEED_RANGE', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { BPM_SEED_RANGE } = await import('../utils/bpmSeed');

    const { bpm } = useAudioStore.getState();
    expect(bpm).toBeGreaterThanOrEqual(BPM_SEED_RANGE.min);
    expect(bpm).toBeLessThanOrEqual(BPM_SEED_RANGE.max);
  });

  it('matches generateAttenuationStyleBpm for the default Attenuation Style\'s own id/name exactly', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { DEFAULT_PELAGOS } = await import('./attenuationStyleStore');
    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');

    expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm(DEFAULT_PELAGOS.id, DEFAULT_PELAGOS.name));
  });

  it('stays driven by the existing single AS subscription — audioStore.ts registers no second subscribe (source-scan regression guard)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioStore.ts'), 'utf-8');
    const subscribeCalls = source.match(/\.subscribe\(/g) ?? [];
    // Exactly the one useAttenuationStyleStore.subscribe: BPM now rides the same AS-sync that
    // reseeds globalAudio/lfoBank/globalLfoLinks, so it needs no subscription of its own.
    expect(subscribeCalls.length).toBe(1);
  });

  it('no longer reads the locale — audioStore.ts imports and calls nothing from localeStore (source-scan regression guard)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioStore.ts'), 'utf-8');
    expect(source).not.toMatch(/localeStore|useLocaleStore|getLocaleById/);
  });

  it('reseeds bpm when currentAttenuationStyleId changes', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');
    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');

    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'bpm-sync-zenith', name: 'BpmSyncZenith' });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('bpm-sync-zenith');

    expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm('bpm-sync-zenith', 'BpmSyncZenith'));
  });

  it('discards a hand-dragged bpm on an Attenuation Style change, same as Audio Rig edits', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');

    useAudioStore.getState().setBPM(190); // outside the [40, 100] seed range, so it's unambiguous
    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'bpm-sync-zenith', name: 'BpmSyncZenith' });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('bpm-sync-zenith');

    expect(useAudioStore.getState().bpm).not.toBe(190);
  });

  it('does NOT reseed bpm when currentAttenuationStyleId is set to the value it already has', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');

    useAudioStore.getState().setBPM(190);
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId(DEFAULT_PELAGOS.id);

    expect(useAudioStore.getState().bpm).toBe(190);
  });

  it('reseeds bpm BEFORE it pushes globalAudio, so a tempo-resolved push (Task 11) lands at the new tempo', async () => {
    await import('./audioStore'); // registers the AS-sync subscription under test
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    vi.clearAllMocks();

    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'bpm-order-zenith', name: 'BpmOrderZenith' });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('bpm-order-zenith');

    const bpmCall = vi.mocked(AudioEngine.setBPM).mock.invocationCallOrder[0];
    const globalAudioCall = vi.mocked(AudioEngine.setGlobalDelay).mock.invocationCallOrder[0];
    expect(bpmCall).toBeDefined();
    expect(globalAudioCall).toBeDefined();
    expect(bpmCall).toBeLessThan(globalAudioCall);
  });
});
