// ========================================
// IMPORTS
// ========================================
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { initDiagState } from '../../utils/audioHealth';
import type { DiagSnapshot } from '../../engine/audioDiagnostics';

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
    globalLfosOn: 5,
    globalLfosTotal: 7,
    audibleRobots: 4,
    totalRobots: 12,
    audioLoad: 1,
    soundingRobots: 4,
    maxAudibleRobots: 12,
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
});
