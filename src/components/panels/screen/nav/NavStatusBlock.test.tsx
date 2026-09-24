import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { NavStatusBlock } from './NavStatusBlock';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAttenuationStyleStore, DEFAULT_LOCALE_ID } from '@/stores/attenuationStyleStore';
import type { Robot } from '@/types/Robot';

const UI_INITIAL_STATE = useUIStore.getState();
const AUDIO_INITIAL_STATE = useAudioStore.getState();
const LOCALE_INITIAL_STATE = useLocaleStore.getState();
const ATTENUATION_STYLE_INITIAL_STATE = useAttenuationStyleStore.getState();

function makeRobot(id: string, overrides: Partial<Robot> = {}): Robot {
  return { id, audioMode: 'none', ...overrides } as Robot;
}

function resetStores() {
  useUIStore.setState(UI_INITIAL_STATE, true);
  useAudioStore.setState(AUDIO_INITIAL_STATE, true);
  useLocaleStore.setState(LOCALE_INITIAL_STATE, true);
  useAttenuationStyleStore.setState(ATTENUATION_STYLE_INITIAL_STATE, true);
}

describe('NavStatusBlock', () => {
  beforeEach(() => {
    resetStores();
    // The default Attenuation Style's own name is randomized/seed-derived (seedUtils.ts) unless
    // overridden — pin it to a known value so the seed-row assertions below aren't flaky.
    useAttenuationStyleStore.setState((s) => ({
      attenuationStyles: s.attenuationStyles.map((p) =>
        p.id === s.currentAttenuationStyleId ? { ...p, name: 'Pelagos' } : p,
      ),
    }));
    useLocaleStore.setState((s) => ({
      locales: {
        ...s.locales,
        [DEFAULT_LOCALE_ID]: {
          ...s.locales[DEFAULT_LOCALE_ID],
          coordinates: { x: 12, y: 68 },
          robots: [
            makeRobot('r1'),
            makeRobot('r2'),
            makeRobot('r3', { audioMode: 'mute' }),
          ],
        },
      },
    }));
    useAudioStore.setState({ soundingRobotIds: ['r1'], robotLoad: 1 });
    useUIStore.setState({ activeLocaleLocalTime: 14.5, activeLocaleTemperature: -45 });
  });

  it('renders the seed row as "{AttenuationStyle} @ {x}, {y}."', () => {
    render(<NavStatusBlock />);
    expect(screen.getByText('Pelagos @ 12, 68.')).toBeTruthy();
  });

  it('renders the robot-count row as "{emitting} of {maxAudible} Probes active."', () => {
    render(<NavStatusBlock />);
    // r1 is sounding+audible ("emitting"); r2 is audible but outside soundingRobotIds ("limited");
    // r3 is muted ("disabled") — only r1 counts. robotLoad: 1 (Full) -> maxAudibleRobots = MAX_ROBOTS.
    expect(screen.getByText(/^1 of \d+ Probes active\.$/)).toBeTruthy();
  });

  it('renders the time/temp row as "{HH}:{MM} {temp}°C"', () => {
    render(<NavStatusBlock />);
    expect(screen.getByText('14:30 -45°C')).toBeTruthy();
  });

  it('falls back to "CORRUPT TEMPERATURE" when temperature is null', () => {
    useUIStore.setState({ activeLocaleTemperature: null });
    render(<NavStatusBlock />);
    expect(screen.getByText('14:30 CORRUPT TEMPERATURE')).toBeTruthy();
  });

  it('counts every robot as emitting when the Audio Load budget system is not running (soundingRobotIds empty)', () => {
    useAudioStore.setState({ soundingRobotIds: [] });
    render(<NavStatusBlock />);
    // r1 and r2 are audible (not muted, no solo active); r3 stays disabled (muted).
    expect(screen.getByText(/^2 of \d+ Probes active\.$/)).toBeTruthy();
  });

  it('respects solo: only the soloed robot is audible, regardless of soundingRobotIds', () => {
    useLocaleStore.setState((s) => ({
      locales: {
        ...s.locales,
        [DEFAULT_LOCALE_ID]: {
          ...s.locales[DEFAULT_LOCALE_ID],
          robots: [makeRobot('r1', { audioMode: 'solo' }), makeRobot('r2')],
        },
      },
    }));
    useAudioStore.setState({ soundingRobotIds: ['r1', 'r2'] });
    render(<NavStatusBlock />);
    expect(screen.getByText(/^1 of \d+ Probes active\.$/)).toBeTruthy();
  });
});
