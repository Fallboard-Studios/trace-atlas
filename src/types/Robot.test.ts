// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { DockingState } from './Robot';

// ========================================
// TESTS
// ========================================

describe('DockingState (Phase 43 §1.1 — renamed so Docking no longer means leaving the dock)', () => {
  it('is exactly Docked / Undocking / Active / Recalled', () => {
    expect(DockingState).toEqual({
      Docked: 'docked',
      Undocking: 'undocking',
      Active: 'active',
      Recalled: 'recalled',
    });
  });
});
