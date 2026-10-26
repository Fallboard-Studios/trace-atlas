// ========================================
// IMPORTS
// ========================================
import { Profiler } from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { initDiagState } from '../../utils/audioHealth';
import type { DiagSnapshot } from '../../engine/audioDiagnostics';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '../../stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '../../stores/localeStore';

// ========================================
// MOCKS
// ========================================
const stop = vi.fn();
const start = vi.fn(() => stop);

let currentSnapshot: DiagSnapshot;

vi.mock('../../engine/audioDiagnostics', () => ({
  startAudioDiagnostics: () => start(),
  subscribeDiagnostics: () => () => {},
  getDiagnosticsSnapshot: () => currentSnapshot,
}));

import { AudioDebugHud } from './AudioDebugHud';

// ========================================
// HELPERS
// ========================================
const makeSnapshot = (ctxState = 'running'): DiagSnapshot => ({
  timing: { ...initDiagState(0), ctxState, clockRate: 1, fps: 60, lagMs: 0, maxLagMs: 0 },
  info: {
    latencyHint: 'playback',
    lookAheadMs: 100,
    baseLatencyMs: 10,
    voices: 2,
    maxVoices: 16,
    transport: 'started',
    linksOn: 5,
    linksTotal: 7,
    bankRunning: 2,
    audibleRobots: 4,
    totalRobots: 12,
    robotLoad: 1,
    effectsLoad: 1,
    soundingRobots: 4,
    maxAudibleRobots: 12,
    fxConnected: 2,
    transportEvents: 37,
  },
});

// ========================================
// TESTS
// ========================================

describe('AudioDebugHud', () => {
  beforeEach(() => {
    start.mockClear();
    stop.mockClear();
    currentSnapshot = makeSnapshot();
  });

  it('renders the diagnostics readout', () => {
    const { container } = render(<AudioDebugHud />);
    const hud = container.querySelector('.audio-debug-hud');
    expect(hud).not.toBeNull();
    expect(hud!.textContent).toContain('ctx running');
    expect(hud!.textContent).toContain('latency playback');
    expect(hud!.textContent).toContain('voices 2/16');
  });

  it('is a passive overlay: hidden from assistive tech and not focusable', () => {
    const { container } = render(<AudioDebugHud />);
    const hud = container.querySelector('.audio-debug-hud')!;
    expect(hud.getAttribute('aria-hidden')).toBe('true');
    expect(hud.querySelector('button, a, input, [tabindex]')).toBeNull();
  });

  it('flags a bad state so it is visible at a glance', () => {
    currentSnapshot = makeSnapshot('suspended');
    const { container } = render(<AudioDebugHud />);
    expect(container.querySelector('.audio-debug-hud--bad')).not.toBeNull();
  });

  it('is not flagged bad while healthy', () => {
    const { container } = render(<AudioDebugHud />);
    expect(container.querySelector('.audio-debug-hud--bad')).toBeNull();
  });

  it('starts diagnostics on mount and stops them on unmount', () => {
    const { unmount } = render(<AudioDebugHud />);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('renders nothing visible to screen readers: no live region', () => {
    render(<AudioDebugHud />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  // docs/specs/SHORT_WORLD_LINK.md Task 10: the world line names the live Attenuation Style, read from the store,
  // not from the deleted seed override (which nothing in the app set any more, so every world read "random").
  describe('the world line', () => {
    const firstLine = (container: HTMLElement) => container.querySelector('.audio-debug-hud')!.firstElementChild!.textContent!;

    beforeEach(() => {
      useAttenuationStyleStore.setState({
        attenuationStyles: [{ ...DEFAULT_PELAGOS, name: 'n40dh8p8' }],
        currentAttenuationStyleId: DEFAULT_PELAGOS.id,
      });
      useLocaleStore.setState({
        locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, coordinates: { x: 29, y: -14 } } },
      });
    });

    it('starts with the current style name and the locale coordinates', () => {
      const { container } = render(<AudioDebugHud />);
      expect(firstLine(container)).toMatch(/^n40dh8p8 @ 29,-14 /);
    });

    it('follows a retransmit to a new style name', () => {
      const { container } = render(<AudioDebugHud />);
      act(() => {
        useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS, name: 'Kryndara' }] });
      });
      expect(firstLine(container)).toMatch(/^Kryndara @ 29,-14 /);
    });

    it('prints random only when there is no current style at all', () => {
      useAttenuationStyleStore.setState({ attenuationStyles: [], currentAttenuationStyleId: 'gone' });
      const { container } = render(<AudioDebugHud />);
      expect(firstLine(container)).toMatch(/^random @ /);
    });

    it('does not re-render when the style object changes but its name does not', () => {
      let commits = 0;
      render(
        <Profiler id="hud" onRender={() => commits++}>
          <AudioDebugHud />
        </Profiler>,
      );
      const before = commits;
      act(() => {
        useAttenuationStyleStore.setState({
          attenuationStyles: [{ ...DEFAULT_PELAGOS, name: 'n40dh8p8', locales: [DEFAULT_LOCALE_ID, 'another'] }],
        });
      });
      expect(commits).toBe(before);
    });
  });
});
