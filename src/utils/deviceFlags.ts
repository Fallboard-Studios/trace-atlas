// ========================================
// CONSTANTS
// ========================================

/**
 * The device's own flags, beside the sessions' `trace-atlas.sessions.v1` (sessionStorageEngine.ts): one JSON object
 * under one key, cleared with everything else by Factory Reset's `localStorage.clear()`. Not a session, not a
 * preference that travels with a world — a fact about this tablet (docs/specs/OFF_SCREEN.md assumption 7).
 */
export const DEVICE_FLAGS_KEY = 'trace-atlas.device.v1';

interface DeviceFlags {
  /** Set at the first power-on. The off screen shows the chooser only once this is true; before it, the hint alone. */
  heardWorld?: boolean;
}

// ========================================
// FUNCTIONS
// ========================================

/** The stored flags, or an empty object on absence, bad JSON, a non-object value or a throwing storage. */
function readFlags(): DeviceFlags {
  try {
    const raw = localStorage.getItem(DEVICE_FLAGS_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as DeviceFlags) : {};
  } catch {
    return {};
  }
}

/** Has this device ever heard a world? False on any failure to read — a first visit is the safe answer. */
export function hasHeardWorld(): boolean {
  return readFlags().heardWorld === true;
}

/** Record that this device has heard a world. Idempotent; a throwing storage (private mode, a blocked origin) is ignored —
 *  the device then stays a first visit, which costs the user one hint-only screen, nothing more. */
export function markHeardWorld(): void {
  try {
    const flags = readFlags();
    if (flags.heardWorld === true) return;
    localStorage.setItem(DEVICE_FLAGS_KEY, JSON.stringify({ ...flags, heardWorld: true }));
  } catch {
    /* storage unavailable — see above */
  }
}
