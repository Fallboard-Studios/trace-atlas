// ========================================
// IMPORTS
// ========================================
// (none — thin wrapper over the platform crypto API)

// ========================================
// FUNCTIONS
// ========================================

/**
 * A random RFC 4122 v4 UUID. Drop-in for `crypto.randomUUID()`, which the platform only exposes in
 * *secure contexts* (https or localhost): opened over plain `http://<lan-ip>` — e.g. a phone loading
 * a dev/preview server from the PC — it is `undefined`, and calling it throws. It threw inside
 * `AudioEngine.start()` (beatClock's scheduleRepeat), so the power-on sequence died and the tablet
 * never came on. `crypto.getRandomValues` IS available in insecure contexts, so use it as the
 * fallback; `Math.random` is the last resort when there is no crypto at all.
 *
 * Not for seeded generation — ids that must be reproducible use the seeded generators
 * (spawnSystem's generateRobotId etc., docs/PROCEDURAL_GENERATION.md).
 */
export function generateUUID(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
