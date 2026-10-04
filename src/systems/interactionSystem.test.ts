// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { triggerInteraction } from './interactionSystem';
import { RobotState } from '../types/Robot';
import type { Robot } from '../types/Robot';
import { useLocaleStore } from '../stores/localeStore';
import { useUIStore } from '../stores/uiStore';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import * as TimelineMap from '../animation/timelineMap';
import * as AudioEngineModule from '../engine/AudioEngine';

// ========================================
// MOCKS
// ========================================

let delayedCallbacks: Array<() => void> = [];

// Mock BeatClock
vi.mock('../engine/beatClock', () => ({
  getCurrentMeasure: vi.fn(() => 100),
}));

// Mock GSAP
vi.mock('gsap', () => ({
  default: {
    to: vi.fn(),
    delayedCall: vi.fn((_delay, callback) => {
      // Store callback instead of executing immediately
      // Tests can control when callbacks execute via flushDelayedCalls()
      delayedCallbacks.push(callback);
    }),
    getProperty: vi.fn(() => 0),
  },
}));

// Mock audio engine
vi.mock('../engine/AudioEngine', () => ({
  AudioEngine: {
    scheduleNote: vi.fn(),
    unregisterRobotMelody: vi.fn(),
    now: vi.fn(() => 0),
  },
}));

// Mock harmony system
vi.mock('../engine/harmonySystem', () => ({
  getAvailableNotes: vi.fn(() => ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']),
}));

// Mock animation/timeline
vi.mock('../animation/timelineMap', () => ({
  killTimeline: vi.fn(),
}));

// Mock refs
vi.mock('../utils/refs', () => ({
  getRef: vi.fn(() => ({})), // Return valid ref object for state updates
}));

// Mock idle system
vi.mock('./idleSystem', () => ({
  handleRobotIdle: vi.fn(),
}));

// ========================================
// SETUP
// ========================================

const createTestRobot = (id: string, state = RobotState.Idle): Robot => ({
  id,
  compositionSeed: 0.5,
  identityColor: '#428d95',
  greebles: [],
  state,
  position: { x: 0, y: 0 },
  destination: null,
  melody: [
    {
      id: 'melody-1',
      startStep: 1,
      length: '16n',
      noteIndex: 0,
      octave: 4,
    },
    {
      id: 'melody-2',
      startStep: 3,
      length: '16n',
      noteIndex: 1,
      octave: 4,
    },
  ],
  audioAttributes: {
    adsr: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 },
    filterFreq: 1000,
    waveform: 'sine' as const,
  },
  direction: 'right',
  createdAt: Date.now(),
  octaveRange: [3, 5] as [number, number],
  masterVolume: 1,
  docking: 'active',
  batteryLevel: 100,
});

beforeEach(() => {
  // Reset store state
  useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [] });
  useUIStore.getState().selectRobot(null);

  // Clear all mocks and delayed callbacks
  vi.clearAllMocks();
  delayedCallbacks = [];
});

afterEach(() => {
  vi.clearAllMocks();
  delayedCallbacks = [];
});

// ========================================
// TESTS
// ========================================

describe('InteractionSystem', () => {
  describe('triggerInteraction', () => {
    it('sets both robots to interacting state', () => {
      const robotA = createTestRobot('robot-a');
      const robotB = createTestRobot('robot-b');

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA, robotB] });

      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-b');

      const state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      const updatedA = state?.robots.find(r => r.id === 'robot-a');
      const updatedB = state?.robots.find(r => r.id === 'robot-b');

      expect(updatedA?.state).toBe(RobotState.Interacting);
      expect(updatedB?.state).toBe(RobotState.Interacting);
    });

    it('applies cooldown to both robots', () => {
      const robotA = createTestRobot('robot-a');
      const robotB = createTestRobot('robot-b');

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA, robotB] });

      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-b');

      const state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      const updatedA = state?.robots.find(r => r.id === 'robot-a');
      const updatedB = state?.robots.find(r => r.id === 'robot-b');

      // Both should have cooldown set to current measure (100)
      expect(updatedA?.lastInteractionMeasure).toBe(100);
      expect(updatedB?.lastInteractionMeasure).toBe(100);
    });

    it('increments total interaction counter', () => {
      const robotA = createTestRobot('robot-a');
      const robotB = createTestRobot('robot-b');

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA, robotB] });

      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-b');

      // totalInteractions not tracked in localeStore (removed from production code)
    });

    it('kills swim timelines for both robots', () => {
      const robotA = createTestRobot('robot-a');
      const robotB = createTestRobot('robot-b');

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA, robotB] });

      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-b');

      const killTimeline = vi.mocked(TimelineMap.killTimeline);

      expect(killTimeline).toHaveBeenCalledWith('swim-robot-a');
      expect(killTimeline).toHaveBeenCalledWith('swim-robot-b');
    });

    it('plays interaction flurry for both robots', () => {
      const robotA = createTestRobot('robot-a');
      const robotB = createTestRobot('robot-b');

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA, robotB] });

      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-b');

      // Execute delayed callbacks (flurry scheduling happens in delayedCall)
      delayedCallbacks.forEach(cb => cb());

      const MockedAudioEngine = vi.mocked(AudioEngineModule.AudioEngine);

      // Should call scheduleNote for flurry from both robots
      expect(MockedAudioEngine.scheduleNote).toHaveBeenCalled();
      // We expect multiple calls (FLURRY_NOTE_COUNT = 4 per robot with stagger)
      const callCount = MockedAudioEngine.scheduleNote.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(4);
    });

    it('returns robots to idle state after interaction duration', () => {
      const robotA = createTestRobot('robot-a');
      const robotB = createTestRobot('robot-b');

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA, robotB] });

      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-b');

      // Initially both should be in Interacting state
      let state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      expect(state?.robots.find(r => r.id === 'robot-a')?.state).toBe(RobotState.Interacting);
      expect(state?.robots.find(r => r.id === 'robot-b')?.state).toBe(RobotState.Interacting);

      // Execute delayed callbacks (simulates time passing)
      delayedCallbacks.forEach(cb => cb());

      // After callbacks, both should be back to Idle
      state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      const updatedA = state?.robots.find(r => r.id === 'robot-a');
      const updatedB = state?.robots.find(r => r.id === 'robot-b');

      expect(updatedA?.state).toBe(RobotState.Idle);
      expect(updatedB?.state).toBe(RobotState.Idle);
    });

    it('handles interaction with non-existent robots gracefully', () => {
      const robotA = createTestRobot('robot-a');

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA] });

      // Should not throw error
      expect(() => {
        triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-nonexistent');
      }).not.toThrow();
    });

    it('handles interaction with empty melody gracefully', () => {
      const robotA = createTestRobot('robot-a');
      robotA.melody = [];
      const robotB = createTestRobot('robot-b');
      robotB.melody = [];

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA, robotB] });

      // Should not throw error (playInteractionFlurry checks for empty melody)
      expect(() => {
        triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-b');
      }).not.toThrow();

      // Execute delayed callbacks
      delayedCallbacks.forEach(cb => cb());

      const state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      const updatedA = state?.robots.find(r => r.id === 'robot-a');
      const updatedB = state?.robots.find(r => r.id === 'robot-b');

      // State should still update despite no audio
      expect(updatedA?.state).toBe(RobotState.Idle);
      expect(updatedB?.state).toBe(RobotState.Idle);
    });

    it('supports multiple simultaneous interactions', () => {
      const robotA = createTestRobot('robot-a');
      const robotB = createTestRobot('robot-b');
      const robotC = createTestRobot('robot-c');
      const robotD = createTestRobot('robot-d');

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA, robotB, robotC, robotD] });

      // Two interactions happen simultaneously (or in rapid succession)
      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-b');
      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-c', 'robot-d');

      // Before callbacks execute: all robots should be Interacting
      let state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      expect(state?.robots.find(r => r.id === 'robot-a')?.state).toBe(RobotState.Interacting);
      expect(state?.robots.find(r => r.id === 'robot-b')?.state).toBe(RobotState.Interacting);
      expect(state?.robots.find(r => r.id === 'robot-c')?.state).toBe(RobotState.Interacting);
      expect(state?.robots.find(r => r.id === 'robot-d')?.state).toBe(RobotState.Interacting);

      // Execute delayed callbacks
      delayedCallbacks.forEach(cb => cb());

      state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];

      // All robots should be Idle after callbacks execute
      const countByState = {
        [RobotState.Idle]: state?.robots.filter(r => r.state === RobotState.Idle).length,
        [RobotState.Interacting]: state?.robots.filter(
          r => r.state === RobotState.Interacting
        ).length,
      };

      expect(countByState[RobotState.Idle]).toBe(4);
      expect(countByState[RobotState.Interacting]).toBe(0);

      // Interaction counter should increment twice
      // totalInteractions not tracked in localeStore (removed from production code)
    });

    it('maintains interaction counter across multiple interactions', () => {
      const robotA = createTestRobot('robot-a');
      const robotB = createTestRobot('robot-b');
      const robotC = createTestRobot('robot-c');

      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { robots: [robotA, robotB, robotC] });

      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-b');
      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-b', 'robot-c');
      triggerInteraction(DEFAULT_LOCALE_ID, 'robot-a', 'robot-c');

      // totalInteractions not tracked in localeStore (removed from production code)
    });
  });
});
