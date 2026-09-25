import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import AttenuationStyleView from './AttenuationStyleView';
import { useAttenuationStyleStore } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import * as localeTemperature from '@/utils/localeTemperature';
import * as localeTemperatureStep from '@/utils/localeTemperatureStep';
import type { AttenuationStyle } from '@/types/attenuationStyle';
import type { Locale } from '@/types/locale';

// LocaleView renders the full world-view stack (robots, actors, ...) — out
// of scope for this file, which only exercises AttenuationStyleView's own
// tick/store-wiring logic (docs/specs/HEADER_HUB_CONSOLIDATION.md §1.3).
vi.mock('./LocaleView', () => ({ default: () => null }));

const TEST_ATTENUATION_STYLE: AttenuationStyle = {
  id: 'test-attenuation-style',
  name: 'Glaxos',
  locales: ['test-locale'],
  currentLocaleId: 'test-locale',
};

const TEST_LOCALE: Locale = {
  id: 'test-locale',
  attenuationStyleId: 'test-attenuation-style',
  name: 'Test Locale',
  coordinates: { x: -17.4, y: 30.2 },
  dayStartTimestamp: Date.now() - 60_000,
  robots: [],
  actors: [],
  companies: [],
  currentMeasure: 5,
};

function setStoreFixtures() {
  useAttenuationStyleStore.setState({ attenuationStyles: [TEST_ATTENUATION_STYLE], currentAttenuationStyleId: TEST_ATTENUATION_STYLE.id });
  useLocaleStore.setState({ locales: { [TEST_LOCALE.id]: TEST_LOCALE } });
  useUIStore.setState({ activeLocaleLocalTime: null, activeLocaleTemperature: null });
}

describe('AttenuationStyleView — temperature wiring (docs/specs/HEADER_HUB_CONSOLIDATION.md §1.3)', () => {
  beforeEach(() => {
    setStoreFixtures();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sets activeLocaleTemperature on mount, matching computeLocaleTemperature for the same hour activeLocaleLocalTime received', () => {
    render(<AttenuationStyleView attenuationStyleId={TEST_ATTENUATION_STYLE.id} />);

    const hour = useUIStore.getState().activeLocaleLocalTime;
    expect(hour).not.toBeNull();
    const expected = localeTemperature.computeLocaleTemperature(
      TEST_LOCALE.id,
      TEST_LOCALE.coordinates.x,
      TEST_LOCALE.coordinates.y,
      hour!,
    );
    expect(useUIStore.getState().activeLocaleTemperature).toBe(expected);
  });

  it('calls computeLocaleTemperature with the exact same hour value setActiveLocaleLocalTime received (no drift between the two readouts)', () => {
    const spy = vi.spyOn(localeTemperature, 'computeLocaleTemperature');

    render(<AttenuationStyleView attenuationStyleId={TEST_ATTENUATION_STYLE.id} />);

    const hour = useUIStore.getState().activeLocaleLocalTime;
    expect(spy).toHaveBeenCalledWith(TEST_LOCALE.id, TEST_LOCALE.coordinates.x, TEST_LOCALE.coordinates.y, hour);
  });

  // DAY_DURATION_MS is 360_000ms for a 24h in-world day, so 1 in-world hour
  // = 15_000ms real time and one half-hour slot = 7_500ms real time.
  it('does not step temperature while the in-world clock stays within the same half-hour slot', async () => {
    vi.useFakeTimers({ now: Date.now() });
    // dayStartTimestamp chosen so mount lands at hour 1.0 (slot 2), well
    // clear of the next boundary at hour 1.5.
    useAttenuationStyleStore.setState({ attenuationStyles: [TEST_ATTENUATION_STYLE], currentAttenuationStyleId: TEST_ATTENUATION_STYLE.id });
    useLocaleStore.setState({ locales: { [TEST_LOCALE.id]: { ...TEST_LOCALE, dayStartTimestamp: Date.now() - 15_000 } } });
    useUIStore.setState({ activeLocaleLocalTime: null, activeLocaleTemperature: null });
    const computeSpy = vi.spyOn(localeTemperature, 'computeLocaleTemperature');
    const stepSpy = vi.spyOn(localeTemperatureStep, 'stepLocaleTemperature');

    render(<AttenuationStyleView attenuationStyleId={TEST_ATTENUATION_STYLE.id} />);
    expect(computeSpy.mock.calls.length).toBe(1); // the immediate tick() call on mount

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000); // hour advances to ~1.2 — still slot 2
    });
    expect(computeSpy.mock.calls.length).toBe(1); // no re-sample
    expect(stepSpy.mock.calls.length).toBe(0); // no boundary crossed yet
  });

  it('steps temperature by one random-walk step exactly when the in-world clock crosses a half-hour boundary, without a second timer', async () => {
    vi.useFakeTimers({ now: Date.now() });
    // dayStartTimestamp chosen so mount lands just before hour 1.5 (slot 2);
    // the next 1s wall-clock tick pushes it past the boundary into slot 3.
    useAttenuationStyleStore.setState({ attenuationStyles: [TEST_ATTENUATION_STYLE], currentAttenuationStyleId: TEST_ATTENUATION_STYLE.id });
    useLocaleStore.setState({ locales: { [TEST_LOCALE.id]: { ...TEST_LOCALE, dayStartTimestamp: Date.now() - 22_350 } } });
    useUIStore.setState({ activeLocaleLocalTime: null, activeLocaleTemperature: null });
    const computeSpy = vi.spyOn(localeTemperature, 'computeLocaleTemperature');
    const stepSpy = vi.spyOn(localeTemperatureStep, 'stepLocaleTemperature');

    render(<AttenuationStyleView attenuationStyleId={TEST_ATTENUATION_STYLE.id} />);
    const seeded = useUIStore.getState().activeLocaleTemperature;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(stepSpy.mock.calls.length).toBe(1); // exactly one step, on the tick that crosses the boundary
    expect(stepSpy).toHaveBeenCalledWith(TEST_LOCALE.id, TEST_LOCALE.coordinates.x, TEST_LOCALE.coordinates.y, 3, seeded);
    expect(computeSpy.mock.calls.length).toBe(1); // never re-sampled from noise after the initial seed
  });

  it('does not set temperature to a stale/garbage value when the locale is not found (early-return branch)', () => {
    useLocaleStore.setState({ locales: {} });

    render(<AttenuationStyleView attenuationStyleId={TEST_ATTENUATION_STYLE.id} />);

    expect(useUIStore.getState().activeLocaleTemperature).toBeNull();
    expect(useUIStore.getState().activeLocaleLocalTime).toBeNull();
  });

  it('introduces no second setInterval/timer for temperature (source-scan regression guard)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'AttenuationStyleView.tsx'), 'utf-8');
    const intervalMatches = source.match(/setInterval\(/g) ?? [];
    expect(intervalMatches.length).toBe(1);
  });

  // Found live-verifying items 21/23/24 (2026-09-15, Crawford + React DevTools Profiler):
  // every FactoryInner/RobotBody subscribed to activeLocaleLocalTime re-renders in one
  // synchronized React commit every tick, by design (avoids visual tearing between
  // buildings) -- but that means one uninterruptible ~43ms (measured, jsdom) block on the
  // main thread every second, even with 21/23/24's fixes landed. startTransition doesn't
  // reduce that work; it marks it low-priority so React can interrupt/spread it instead of
  // blocking. React scheduling priority itself isn't directly observable in a synchronous
  // jsdom test (act() flushes transitions before returning either way), so this is a
  // source-scan regression guard, matching this file's own existing pattern for the
  // setInterval count above -- the 5 tests above already prove no behavioral regression
  // (same final values, same call counts) regardless of scheduling priority.
  it('wraps the tick\'s store updates in React.startTransition (docs/todo/backlog.md item 25)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'AttenuationStyleView.tsx'), 'utf-8');
    expect(source).toMatch(/startTransition\(\(\) => \{/);
    // Both store updates (localTime + temperature), not just one, must be inside the transition.
    const transitionBody = source.match(/startTransition\(\(\) => \{([\s\S]*?)\}\);/)?.[1] ?? '';
    expect(transitionBody).toContain('setActiveLocaleLocalTime');
    expect(transitionBody).toContain('setActiveLocaleTemperature');
  });
});
