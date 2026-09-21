/**
 * The drift subsystem: per-group shared secondary LFO pools that impose a
 * slow, seeded wobble on every connected primary's own rate and depth, so a
 * Attenuation Style doesn't sound perfectly identical forever. Attached to (and torn
 * down with) primaries owned by lfoEngine.ts's connectLfoTarget/
 * disconnectLfoTarget — this module never constructs a primary Tone.LFO
 * itself, only the drift pools and the Gain pair wiring each primary to its
 * group's pool. See docs/specs/LFO_DRIFT.md and
 * docs/specs/LFO_DRIFT_GROUPS.md (the 4-group reshape of that original
 * single-pool design).
 */

// ========================================
// IMPORTS
// ========================================
import * as Tone from 'tone';
import alea from 'alea';

import type { DriftGroupId, LfoTargetId } from '../types/lfo';
import { LFO_RATE_MIN, LFO_RATE_MAX } from '../types/lfo';
import { devWarn } from '../utils/helpers';
import { clamp, isAudioContextRunning, centeredSwingFromRange, connectAdditively } from './lfoShared';

// ========================================
// STATE (module-scoped, runtime-only — never put these in Zustand)
// ========================================

/**
 * Per-group shared secondary Tone.LFO pools, phase-spread evenly across each
 * group's own pool — fixed and deterministic, not seeded per-Attenuation-Style (only
 * the drift AMOUNT, rateDrift/depthDrift, is seeded; a pool's own relative
 * phases are a structural implementation detail, the same for every
 * session). Each group's pool is constructed lazily, once, on that group's
 * own first successful connectLfoTarget call — never per-robot, never
 * per-target, and never shared across groups. See
 * docs/specs/LFO_DRIFT_GROUPS.md §1.2 (reshaped from docs/specs/LFO_DRIFT.md's
 * single shared pool).
 */
const driftPools: Partial<Record<DriftGroupId, Tone.LFO[]>> = {};

/**
 * One rate-drift + depth-drift Gain pair per currently-connected primary,
 * keyed the same as lfoEngine.ts's activeLfos/connectedSignals. Both Gains
 * start at 0 — setGlobalRateDrift/setGlobalDepthDrift are what make drift
 * audible; this wiring alone is deliberately inert.
 */
interface DriftLink {
  /** Set once at attachDrift time from the target the link was created for
   *  — never reassigned. Determines which group's global rate/depth drift
   *  amount this link's Gains read (docs/specs/LFO_DRIFT_GROUPS.md §1.3). */
  group: DriftGroupId;
  /** The primary Tone.LFO this link drifts — the same instance attachDrift
   *  was called with. Held directly rather than looked up by key from
   *  lfoEngine.ts's activeLfos each time: a link can't exist without a
   *  primary (attachDrift's own first argument), and lfoEngine.ts never
   *  replaces a key's primary instance once created, so the reference stays
   *  valid for the link's whole lifetime — one less cross-module lookup, and
   *  one less thing tying this module to lfoEngine.ts's internal state. */
  lfo: Tone.LFO;
  rateDriftGain: Tone.Gain;
  depthDriftGain: Tone.Gain;
  /** Whether depthDriftGain is currently wired into the primary's amplitude.
   *  False whenever this primary's own depth is 0 — see refreshDepthDriftGain's
   *  silence guard (docs/specs/LFO_DRIFT.md §1.3). Rate has no equivalent
   *  field: it has no "off" state (LFO_RATE_MIN is 0.1, never 0), so
   *  rateDriftGain stays connected unconditionally from attachDrift on. */
  depthDriftConnected: boolean;
}
const driftLinks = new Map<string, DriftLink>();

/** One Rate/Depth Drift amount pair per group, all starting at 0, pushed by
 *  setGlobalRateDrift/setGlobalDepthDrift (both now group-scoped) — read by
 *  refreshRateDriftGain/refreshDepthDriftGain via each link's own `group`.
 *  Replaces the single shared pair docs/specs/LFO_DRIFT.md originally
 *  shipped — see docs/specs/LFO_DRIFT_GROUPS.md §1.3. */
const globalRateDriftByGroup: Record<DriftGroupId, number> = { eq3: 0, filterLPF: 0, filterHPF: 0, robots: 0 };
const globalDepthDriftByGroup: Record<DriftGroupId, number> = { eq3: 0, filterLPF: 0, filterHPF: 0, robots: 0 };

/** Per-group pool size — sized to each group's own real target ceiling, not
 *  a uniform constant. eq3/filterLPF/filterHPF only ever have 3/2/2 possible
 *  LFO targets in the entire app; robots can have dozens of simultaneously
 *  active primaries across every robot/layer/field, the same "70-100+
 *  primaries, a handful of buckets is enough" reasoning
 *  docs/specs/LFO_DRIFT.md §1.2 already established for its own flat 8.
 *  See docs/specs/LFO_DRIFT_GROUPS.md §1.2. */
const DRIFT_POOL_SIZE: Record<DriftGroupId, number> = {
  eq3: 3,
  filterLPF: 2,
  filterHPF: 2,
  robots: 8,
};
/** ~33-second cycle for the shared drift oscillators — fixed, never exposed
 *  in the UI (only the drift AMOUNT, rateDrift/depthDrift, is user-facing). */
const DRIFT_RATE_HZ = 0.03;

/**
 * Audio Load Budget (docs/specs/AUDIO_LOAD_BUDGET.md §1.4): drift is the first tier to go. While suppressed, attachDrift is a
 * no-op (so no link, no attenuator pair and no lazily-built pool) and every existing link has been torn down. Only the
 * LINKS are suspended — the seeded/edited drift AMOUNTS (globalRateDriftByGroup/globalDepthDriftByGroup) are untouched.
 */
let driftSuppressed = false;

// ========================================
// FUNCTIONS
// ========================================

/**
 * Which drift group a target belongs to — the three global-chain groups
 * that ever carry an lfoTarget map one-to-one by their own short-form
 * prefix (mirrors lfoEngine.ts's globalSeedRangeKey's own 'lpf.'/'hpf.'
 * prefix-matching style); every RobotLfoTargetId shares 'robots' regardless
 * of field or robotId. See docs/specs/LFO_DRIFT_GROUPS.md §1.1.
 */
export function driftGroupForTarget(target: LfoTargetId): DriftGroupId {
  if (target.startsWith('eq3.')) return 'eq3';
  if (target.startsWith('lpf.')) return 'filterLPF';
  if (target.startsWith('hpf.')) return 'filterHPF';
  return 'robots';
}

/**
 * Lazily construct (or return the existing) drift-oscillator pool for one
 * group — sized to that group's own DRIFT_POOL_SIZE entry, phase-spread
 * evenly across it. Started immediately if the AudioContext is already
 * running, matching every other LFO construction path in this file. Never
 * shared across groups.
 */
function getOrCreateDriftPool(group: DriftGroupId): Tone.LFO[] {
  const existing = driftPools[group];
  if (existing) return existing;
  const size = DRIFT_POOL_SIZE[group];
  const pool: Tone.LFO[] = [];
  for (let i = 0; i < size; i++) {
    const lfo = new Tone.LFO({ frequency: DRIFT_RATE_HZ, type: 'sine', phase: (360 / size) * i });
    if (isAudioContextRunning()) lfo.start();
    pool.push(lfo);
  }
  driftPools[group] = pool;
  return pool;
}

/**
 * Wire a successfully-connected primary into the shared drift pool — called
 * once from connectLfoTarget, right after the primary's own connection to
 * its target succeeds. Idempotent (checked via driftLinks), matching the
 * pattern connectedSignals already uses for the primary's own connection.
 * Both Gains start at 0 — setGlobalRateDrift/setGlobalDepthDrift are what
 * make drift audible; this wiring alone is deliberately inert.
 */
export function attachDrift(key: string, lfo: Tone.LFO, group: DriftGroupId): void {
  if (driftSuppressed) return;
  if (driftLinks.has(key)) return;
  const pool = getOrCreateDriftPool(group);
  const poolLfo = pool[Math.floor(alea(key)() * pool.length)];

  const rateDriftGain = new Tone.Gain(0);
  const depthDriftGain = new Tone.Gain(0);
  poolLfo.connect(rateDriftGain);
  poolLfo.connect(depthDriftGain);

  // Rate has no "off" state (LFO_RATE_MIN is 0.1, never 0), so rateDriftGain
  // connects unconditionally here and stays connected for the primary's
  // whole lifetime. connectAdditively applies the same Signal.override fix
  // lfoEngine.ts's own connectLfoTarget needs (docs/specs/LFO_DRIFT.md
  // §1.4) — shared, not re-derived.
  connectAdditively(rateDriftGain, lfo.frequency);

  // depthDriftGain's own connection is deliberately NOT made here — it's
  // conditional on this primary's own current depth, per the "never revive
  // a silenced target" guard (§1.3). refreshDepthDriftGain below owns it.
  driftLinks.set(key, { group, lfo, rateDriftGain, depthDriftGain, depthDriftConnected: false });
  refreshRateDriftGain(key);
  refreshDepthDriftGain(key);
}

/**
 * Recompute one primary's rate-drift Gain value from its OWN current rate
 * (bounded via centeredSwingFromRange, the same "swing bounded by distance
 * to the nearer edge" math connectLfoTarget already uses for primary-to-
 * target swings) and the current global rateDrift amount. Called after
 * attachDrift, after lfoEngine.ts's setLfoRate, and from setGlobalRateDrift
 * for every linked key. A no-op if this key has no drift link (yet, or
 * ever).
 */
export function refreshRateDriftGain(key: string): void {
  const link = driftLinks.get(key);
  if (!link) return;
  const currentRate = link.lfo.frequency.value as number;
  const swing = centeredSwingFromRange({ min: LFO_RATE_MIN, max: LFO_RATE_MAX }, currentRate);
  link.rateDriftGain.gain.value = globalRateDriftByGroup[link.group] * swing.max;
}

/**
 * Recompute one primary's depth-drift Gain — connects it lazily (via the
 * same override-disable-then-restore sequence attachDrift already uses for
 * frequency) the first time this primary's own depth rises above 0, and
 * DISCONNECTS it entirely (not just zeroes it) whenever depth is 0. A
 * primary deliberately silenced by its own Depth must stay silent
 * regardless of global drift (§1.3) — a zeroed-but-still-connected Gain
 * can't guarantee that on its own, since the shared pool oscillator's
 * output is bipolar and could still swing the amplitude UP on its upswing
 * half. Called after attachDrift, after lfoEngine.ts's setLfoDepth, and
 * from setGlobalDepthDrift for every linked key. A no-op if this key has no
 * drift link (yet, or ever).
 */
export function refreshDepthDriftGain(key: string): void {
  const link = driftLinks.get(key);
  if (!link) return;
  const currentAmp = link.lfo.amplitude.value as number;

  if (currentAmp <= 0) {
    if (link.depthDriftConnected) {
      try {
        link.depthDriftGain.disconnect();
      } catch (err) {
        devWarn('[lfoDrift] refreshDepthDriftGain: disconnect failed', err);
      }
      link.depthDriftConnected = false;
    }
    return;
  }

  if (!link.depthDriftConnected) {
    // lfo.amplitude is a Tone.Param, not a Signal — no override escape
    // hatch, always resets to 0 on connect regardless (§1.4); connectAdditively's
    // override write is harmless defensive symmetry with the frequency case
    // in attachDrift, the restore afterward is what actually matters here.
    connectAdditively(link.depthDriftGain, link.lfo.amplitude);
    link.depthDriftConnected = true;
  }

  const swing = centeredSwingFromRange({ min: 0, max: 1 }, currentAmp);
  link.depthDriftGain.gain.value = globalDepthDriftByGroup[link.group] * swing.max;
}

/** Reverse attachDrift — called from lfoEngine.ts's disconnectLfoTarget. The
 *  shared pool oscillators are never disposed here; they're app-lifetime. */
export function detachDrift(key: string): void {
  const link = driftLinks.get(key);
  if (!link) return;
  try {
    link.rateDriftGain.disconnect();
    link.rateDriftGain.dispose();
  } catch (err) {
    devWarn('[lfoDrift] detachDrift: rate-drift teardown failed', err);
  }
  try {
    link.depthDriftGain.disconnect();
    link.depthDriftGain.dispose();
  } catch (err) {
    devWarn('[lfoDrift] detachDrift: depth-drift teardown failed', err);
  }
  driftLinks.delete(key);
}

/**
 * Set one group's Rate Drift amount (-1..1, clamped) — immediately refreshes
 * every currently-linked primary belonging to THAT group's rate-drift Gain;
 * every other group's links are untouched (docs/specs/LFO_DRIFT_GROUPS.md
 * §1.3 — cross-group isolation). Safe no-op with zero primaries connected in
 * this group, even while other groups have primaries and nonzero amounts.
 */
export function isDriftSuppressed(): boolean {
  return driftSuppressed;
}

/**
 * Suppress or restore drift. Suppressing detaches every existing link (the pools are shared and app-lifetime — never
 * disposed). Restoring only clears the flag: lfoEngine, which knows what is connected, re-attaches each primary.
 */
export function setDriftSuppressed(suppressed: boolean): void {
  if (suppressed === driftSuppressed) return;
  driftSuppressed = suppressed;
  if (suppressed) for (const key of [...driftLinks.keys()]) detachDrift(key);
}

export function setGlobalRateDrift(group: DriftGroupId, value: number): void {
  globalRateDriftByGroup[group] = clamp(value, -1, 1);
  for (const [key, link] of driftLinks) {
    if (link.group === group) refreshRateDriftGain(key);
  }
}

/**
 * Set one group's Depth Drift amount (-1..1, clamped) — immediately
 * refreshes every currently-linked primary belonging to THAT group's
 * depth-drift Gain, respecting each primary's own silence guard (§1.3);
 * every other group's links are untouched. Safe no-op with zero primaries
 * connected in this group.
 */
export function setGlobalDepthDrift(group: DriftGroupId, value: number): void {
  globalDepthDriftByGroup[group] = clamp(value, -1, 1);
  for (const [key, link] of driftLinks) {
    if (link.group === group) refreshDepthDriftGain(key);
  }
}
