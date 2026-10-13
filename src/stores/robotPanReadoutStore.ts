// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';

// ========================================
// TYPES
// ========================================

/**
 * The live pan readout behind the Pan slider while a robot's Auto is on (docs/specs/ROBOT_PAN.md
 * §1.4). Deliberately not part of localeStore: a per-tick `updateRobot` would churn the `robots`
 * array every roster/card/world subscriber keys on. Never persisted, never shared, never read by
 * the engine (which keeps its own `lastPanByRobot`).
 */
export interface RobotPanReadoutState {
  /** Last pan the engine wrote for a robot under Auto, −0.5…0.5. Absent until its first write. */
  pan: Record<string, number>;
  /** No-op (same state object) for an equal or non-finite value, so a subscriber never re-renders for it. */
  setPan: (robotId: string, value: number) => void;
  /** No-op (same state object) for a robot with no entry. */
  clearPan: (robotId: string) => void;
}

// ========================================
// STORE
// ========================================
export const useRobotPanReadoutStore = create<RobotPanReadoutState>((set) => ({
  pan: {},

  setPan: (robotId, value) =>
    set((state) => {
      if (!Number.isFinite(value) || state.pan[robotId] === value) return state;
      return { pan: { ...state.pan, [robotId]: value } };
    }),

  clearPan: (robotId) =>
    set((state) => {
      if (!(robotId in state.pan)) return state;
      const { [robotId]: _removed, ...rest } = state.pan;
      return { pan: rest };
    }),
}));
