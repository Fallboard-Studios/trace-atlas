// ========================================
// TYPES
// ========================================

/**
 * Where the world is (docs/specs/OFF_SCREEN.md assumption 5): `cold` — built as a still frame, nothing has started
 * (a fresh page, or a world rebuilt while the tablet was off); `running` — its systems are live; `paused` — frozen in
 * place by the power rocker, waiting to resume. Module state, not Zustand: it mirrors the audio graph and the
 * lifecycle systems, which are runtime, and must never persist.
 *
 * Its own module so both writers can import it without a cycle: powerController (pause / resume / a start) and
 * worldTransition (initializeLocale decides whether a rebuilt world's systems start or are held — the one place that
 * knows whether a world is running or cold).
 */
export type WorldState = 'cold' | 'running' | 'paused';

// ========================================
// MODULE STATE
// ========================================
let state: WorldState = 'cold';

// ========================================
// EXPORTS
// ========================================
export function getWorldState(): WorldState {
  return state;
}

export function setWorldState(next: WorldState): void {
  state = next;
}
