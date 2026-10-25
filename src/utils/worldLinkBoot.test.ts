// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, afterEach } from 'vitest';

// As sessionDiff.test.ts: initializeLocale and applySessionPayload start the lifecycle and swell ticks, which subscribe
// to BeatClock, and BeatClock needs a real AudioContext this jsdom environment does not have.
vi.mock('../engine/beatClock', () => ({
  subscribeToMeasure: vi.fn(() => vi.fn()),
  getCurrentMeasure: vi.fn(() => 0),
  scheduleRepeat: vi.fn(() => 'schedule-id'),
  cancelSchedule: vi.fn(),
  getCurrentMeasurePrecise: vi.fn(() => 0),
}));

// ========================================
// HELPERS
// ========================================

/**
 * A page load with `search` in the address bar, through the app's own boot: fresh modules (the stores read the world
 * link at their load), then OceanScene's mount effect (initializeLocale, then the link's payload applied once with
 * skipLocaleRebuild). Returns the live world as the share buttons see it, `buildSessionPayload()`, and the encoder.
 */
async function bootWith(search: string, freshName?: string) {
  window.history.replaceState({}, '', `/${search}`);
  vi.resetModules();
  // A world with no link draws its name at random; pin it, so a failure names a world that reproduces.
  if (freshName !== undefined) {
    const seedUtils = await import('./seedUtils');
    vi.spyOn(seedUtils, 'generateRandomAttenuationStyleName').mockReturnValue(freshName);
  }
  const { consumeSessionSharePayload } = await import('./sessionShareUtils');
  const { useAttenuationStyleStore, selectCurrentAttenuationStyle } =
    await import('../stores/attenuationStyleStore');
  const { useLocaleStore } = await import('../stores/localeStore');
  await import('../stores/audioStore');
  const { initializeLocale } = await import('../systems/worldTransition');
  const { buildSessionPayload, applySessionPayload } = await import('./sessionDiff');
  const { encodeWorldLinkParams, decodeBlob } = await import('./worldLink');
  const localeId = selectCurrentAttenuationStyle(
    useAttenuationStyleStore.getState()
  )!.currentLocaleId!;
  initializeLocale(localeId, { startSystems: false });
  const sharePayload = consumeSessionSharePayload();
  if (sharePayload) applySessionPayload(sharePayload, { skipLocaleRebuild: true });
  const robotIds = useLocaleStore
    .getState()
    .getLocaleById(localeId)!
    .robots.map((r) => r.id);
  return { live: buildSessionPayload(), encodeWorldLinkParams, decodeBlob, robotIds };
}

/** The bare triple a world's own name and coordinates make, in the encoder's param order. */
function bareTriple(name: string, x: number, y: number): string {
  return new URLSearchParams({ seed: name, x: String(x), y: String(y) }).toString();
}

// ========================================
// TESTS
// ========================================

afterEach(async () => {
  const { stopRobotLifecycle } = await import('../systems/robotSystems');
  const { stopAudioSwells } = await import('../systems/audioSwells');
  stopRobotLifecycle();
  stopAudioSwells();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
  vi.resetModules();
});

describe('the world link through the real boot (docs/specs/SHORT_WORLD_LINK.md: an untouched world is its bare triple)', () => {
  // Fresh worlds whose seeded rig lands off the sliders' steps (every one of these did, before the fix), and whose
  // lanes include drifts off the 2-decimal grid: the payload a share button encodes snaps the rig to those steps and
  // rounds the drifts, and the baseline must agree with it.
  it.each(['3jnirdqn', '8yrwvr5w', 'xs1cct2n', 'rig8sul5', 'uvwryvlg', '21ivve9l'])(
    'a fresh world with no link (%s) copies its bare triple',
    async (name) => {
      const { live, encodeWorldLinkParams } = await bootWith('', name);
      expect(live.attenuationStyleName).toBe(name); // precondition: the pin took
      const params = encodeWorldLinkParams(live);
      expect(params.get('s')).toBeNull();
      expect(params.toString()).toBe(
        bareTriple(live.attenuationStyleName, live.coordinates.x, live.coordinates.y)
      );
    }
  );

  it.each([
    ['n40dh8p8', 29, -14],
    ['bravo', -150, 90],
    ['Pelagos 7!', 12, 68],
    ['a b&c=d+e%f', 0, -7],
  ])('opening the bare triple of %s copies the same bare triple back', async (name, x, y) => {
    const link = bareTriple(name, x, y);
    const { live, encodeWorldLinkParams } = await bootWith(`?${link}`);
    expect(encodeWorldLinkParams(live).toString()).toBe(link);
  });

  it('opening a tweaked link copies the same diff back', async () => {
    const first = await bootWith('?seed=bravo&x=-150&y=90');
    const robotId = first.robotIds[3];
    expect(robotId).toBeDefined(); // precondition: the roster spawned
    const tweaked = {
      ...first.live,
      globalAudio: {
        ...first.live.globalAudio,
        reverb: { ...first.live.globalAudio.reverb, decay: 4.4 },
      },
      robotOverrides: { [robotId]: { reverbSend: 0.77 } },
    };
    const link = first.encodeWorldLinkParams(tweaked);
    expect(link.get('s')).not.toBeNull(); // precondition: the tweak travels in a blob
    const second = await bootWith(`?${link.toString()}`);
    const again = second.encodeWorldLinkParams(second.live);
    expect(second.decodeBlob(again.get('s')!)).toEqual(second.decodeBlob(link.get('s')!));
  });
});
