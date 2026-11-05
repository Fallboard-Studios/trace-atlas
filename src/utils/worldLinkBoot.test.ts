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

// band-table T24 (docs/specs/OFF_SCREEN.md assumptions 9 and 11): a link's theme must be in the loading store before the
// locale is built. The direction is proved on injected columns, whatever the real placeholders hold (plan Task 34 filled
// them, Task 35 tunes them): a Calm column moving the density band, so a robot built under it has a density of 90 or
// more, and an EMPTY Hypnotic option, so the link's pick rides along without moving that density. Over the spread
// originals; the mocks survive vi.resetModules.
vi.mock('../data/bands/themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/bands/themes')>();
  // With attacks the attack rail never narrows the 90-100 under (audibleDensityBand).
  const float = {
    'robot.rhythmicDensity': { min: 90, max: 100 },
    'robot.attack': { min: 0.015, max: 0.015 },
    'robot.shapedAttack': { min: 0.015, max: 0.015, lit: 0.155 },
  };
  return { ...actual, THEMES: { ...actual.THEMES, float } };
});
vi.mock('../data/bands/aspects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/bands/aspects')>();
  const melody = actual.ASPECT_FAMILIES.melody;
  return {
    ...actual,
    ASPECT_FAMILIES: { ...actual.ASPECT_FAMILIES, melody: { ...melody, options: { ...melody.options, hypnotic: {} } } },
  };
});

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
  const { useLoadingStore } = await import('../stores/loadingStore');
  const { encodeWorldLinkParams, decodeBlob } = await import('./worldLink');
  const localeId = selectCurrentAttenuationStyle(
    useAttenuationStyleStore.getState()
  )!.currentLocaleId!;
  initializeLocale(localeId, { startSystems: false });
  const sharePayload = consumeSessionSharePayload();
  if (sharePayload) applySessionPayload(sharePayload, { skipLocaleRebuild: true });
  const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
  const robotIds = robots.map((r) => r.id);
  const densities = robots.map((r) => r.rhythmicDensity ?? -1);
  const { theme, aspects } = useLoadingStore.getState();
  return { live: buildSessionPayload(), encodeWorldLinkParams, decodeBlob, robotIds, densities, loading: { theme, aspects } };
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

describe('the loading identity through the real boot (band-table T24, docs/specs/OFF_SCREEN.md assumptions 9 and 11)', () => {
  it('a link with theme and melody has the store set before the locale builds: the robots draw under Calm, the live payload carries both, and the same link copies back untweaked', async () => {
    const link = new URLSearchParams({ seed: 'n40dh8p8', x: '29', y: '-14', theme: 'float', melody: 'hypnotic' }).toString();
    const { live, encodeWorldLinkParams, densities, loading } = await bootWith(`?${link}`);
    expect(loading).toEqual({ theme: 'float', aspects: { melody: ['hypnotic'] } });
    expect(live.theme).toBe('float');
    expect(live.aspects).toEqual({ melody: ['hypnotic'] });
    expect(densities.length).toBeGreaterThan(0);
    for (const density of densities) expect(density).toBeGreaterThanOrEqual(90);
    const params = encodeWorldLinkParams(live);
    expect(params.get('s')).toBeNull();
    expect(params.toString()).toBe(link);
  });

  it('a bare boot is Classic with no picks, and its robots draw under Classic', async () => {
    const { live, loading, densities } = await bootWith('', '3jnirdqn');
    expect(loading).toEqual({ theme: 'classic', aspects: {} });
    expect(live.theme).toBe('classic');
    expect(live.aspects).toEqual({});
    expect(densities.some((density) => density < 90)).toBe(true);
  });
});
