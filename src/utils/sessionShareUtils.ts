// ========================================
// IMPORTS
// ========================================
import type { SessionPayload } from '../types/session';
import { withGlobalAudioDefaults } from '../types/globalAudio';
import { LFO_LANE_IDS, GLOBAL_LFO_TARGET_IDS, type LfoLaneId, type GlobalLfoTargetId, type LfoLink, type BankLfoSettings } from '../types/lfo';
import { DEFAULT_BANK_LFO, DEFAULT_LFO_LINK } from '../data/lfoConfig';
import { devWarn } from './helpers';
import {
  toCompactBankLfoSettings,
  fromCompactBankLfoSettings,
  toCompactLfoLink,
  fromCompactLfoLink,
  toCompactRobotOverrideDiff,
  fromCompactRobotOverrideDiff,
  toCompactCompanyDiff,
  fromCompactCompanyDiff,
  isPlainObject,
  type CompactBankLfoSettings,
  type CompactLfoLink,
  type CompactRobotOverrideDiff,
  type CompactCompanyDiff,
} from './worldDiffCodec';

// ========================================
// CONSTANTS
// ========================================

const SESSION_PARAM = 'session';

// ========================================
// TYPES
// ========================================

/** The wire shape actually put in the URL -- abbreviated keys (every byte in a URL param is
 *  copy-pasted/typed by a human, or eats into practical link-sharing limits), and `r`/`d`/`u`
 *  omitted entirely when empty rather than sent as `{}`/`[]`. Only what changed travels; the app
 *  can already reconstruct "untouched" from the seed data (attenuationStyleName/coordinates)
 *  alone, the same "no key if untouched" contract buildSessionPayload already applies one level
 *  down (per-robot/per-company diffs) -- this just extends it to the top level.
 *
 *  `r`/`d`'s VALUES are also abbreviated (CompactRobotOverrideDiff/CompactCompanyDiff below), not
 *  just the outer container -- up to 12 robots can each carry a diff, so per-field savings there
 *  multiply the same way the top-level omission does. `userCreatedCompanies` (`u`) is
 *  deliberately NOT abbreviated field-by-field -- typically far fewer than 12 entries, and
 *  Company/CompanyOptionsSnapshot is a large enough separate type surface that the payoff doesn't
 *  clear the added maintenance risk the way the per-robot fields do. */
interface CompactSessionPayload {
  v: SessionPayload['version'];
  n: SessionPayload['attenuationStyleName'];
  c: SessionPayload['coordinates'];
  g: SessionPayload['globalAudio'];
  /** Pacing fields (SessionPayload's own bpm/swellFrequency/swellDuration/pingVarianceAutomation)
   *  -- each omitted from the wire when absent, same "no key if untouched" contract as r/d/u. */
  b?: SessionPayload['bpm'];
  sf?: SessionPayload['swellFrequency'];
  sd?: SessionPayload['swellDuration'];
  /** Humanize, ms (SessionPayload.humanize; docs/specs/ROBOT_PERFORMANCE.md §1.7) -- omitted when absent, like sd. */
  hm?: SessionPayload['humanize'];
  pv?: SessionPayload['pingVarianceAutomation'];
  /** LFO Bank (docs/tasks/LFO_BANK.md Task 18) -- `lb`/`gll` mirror `lfoBank`/`globalLfoLinks`'s
   *  own "always whole, never diffed" treatment (undefined only for a pre-Task-18, version-1 blob). */
  lb?: Record<LfoLaneId, CompactBankLfoSettings>;
  gll?: Record<GlobalLfoTargetId, CompactLfoLink>;
  r?: Record<string, CompactRobotOverrideDiff>;
  d?: Record<string, CompactCompanyDiff>;
  u?: SessionPayload['userCreatedCompanies'];
}

// ========================================
// PRIVATE HELPERS
// ========================================

/** UTF-8-safe base64 encode/decode -- plain btoa/atob only handle Latin1, and robot/company
 *  names (TextInput fields, maxLength-bounded but not charset-restricted) can contain
 *  non-Latin1 characters. TextEncoder/TextDecoder, not the deprecated escape/unescape trick. */
function encodeBase64Utf8(json: string): string {
  const bytes = new TextEncoder().encode(json);
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64Utf8(encoded: string): string {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toCompactSessionPayload(payload: SessionPayload): CompactSessionPayload {
  const compact: CompactSessionPayload = {
    v: payload.version,
    n: payload.attenuationStyleName,
    c: payload.coordinates,
    g: payload.globalAudio,
  };
  if (payload.bpm !== undefined) compact.b = payload.bpm;
  if (payload.swellFrequency !== undefined) compact.sf = payload.swellFrequency;
  if (payload.swellDuration !== undefined) compact.sd = payload.swellDuration;
  if (payload.humanize !== undefined) compact.hm = payload.humanize;
  if (payload.pingVarianceAutomation !== undefined) compact.pv = payload.pingVarianceAutomation;
  if (payload.lfoBank !== undefined) {
    compact.lb = Object.fromEntries(Object.entries(payload.lfoBank).map(([lane, b]) => [lane, toCompactBankLfoSettings(b)])) as Record<LfoLaneId, CompactBankLfoSettings>;
  }
  if (payload.globalLfoLinks !== undefined) {
    compact.gll = Object.fromEntries(Object.entries(payload.globalLfoLinks).map(([target, link]) => [target, toCompactLfoLink(link)])) as Record<GlobalLfoTargetId, CompactLfoLink>;
  }
  if (Object.keys(payload.robotOverrides).length > 0) {
    compact.r = Object.fromEntries(Object.entries(payload.robotOverrides).map(([id, diff]) => [id, toCompactRobotOverrideDiff(diff)]));
  }
  if (Object.keys(payload.companyDiffs).length > 0) {
    compact.d = Object.fromEntries(Object.entries(payload.companyDiffs).map(([id, diff]) => [id, toCompactCompanyDiff(diff)]));
  }
  if (payload.userCreatedCompanies.length > 0) compact.u = payload.userCreatedCompanies;
  return compact;
}

/** Validates a decoded `?session=` value is at least structurally sound before it's trusted --
 *  a URL param is untrusted external input (hand-editable, corruptible, or just from an
 *  incompatible future/past wire format), and every field downstream is used without its own
 *  guard (e.g. applyGlobalAudioToEngine dereferences `globalAudio.compressor` etc. directly).
 *  Checks every required top-level field's basic shape, not just `n`/`c`'s presence -- a payload
 *  missing `g` (globalAudio) used to pass validation and crash the boot effect later. Does NOT
 *  validate deeper into r/d/u's own entries -- CompactRobotOverrideDiff/CompactCompanyDiff/
 *  Company's nested fields are all optional or already narrow enough that a wrong-shaped entry
 *  degrades to a harmless no-op override rather than a crash. */
function isValidCompactSessionPayload(parsed: unknown): parsed is CompactSessionPayload {
  if (!isPlainObject(parsed)) return false;
  const { n, c, g, b, sf, sd, hm, pv, lb, gll, r, d, u } = parsed;
  if (typeof n !== 'string') return false;
  if (!isPlainObject(c) || typeof c.x !== 'number' || typeof c.y !== 'number') return false;
  if (!isPlainObject(g)) return false;
  if (b !== undefined && typeof b !== 'number') return false;
  if (sf !== undefined && typeof sf !== 'number') return false;
  if (sd !== undefined && typeof sd !== 'number') return false;
  if (hm !== undefined && typeof hm !== 'number') return false;
  if (pv !== undefined && typeof pv !== 'number') return false;
  if (lb !== undefined && !isPlainObject(lb)) return false;
  if (gll !== undefined && !isPlainObject(gll)) return false;
  if (r !== undefined && !isPlainObject(r)) return false;
  if (d !== undefined && !isPlainObject(d)) return false;
  if (u !== undefined && !Array.isArray(u)) return false;
  return true;
}

function fromCompactSessionPayload(compact: CompactSessionPayload): SessionPayload {
  return {
    version: compact.v,
    attenuationStyleName: compact.n,
    coordinates: compact.c,
    // A link written before a block existed (the colour blocks, docs/specs/GLOBAL_COLOUR.md assumption 11)
    // lacks it: defaulted here so the payload is never partial. Nothing is encoded for it.
    globalAudio: withGlobalAudioDefaults(compact.g),
    bpm: compact.b,
    swellFrequency: compact.sf,
    swellDuration: compact.sd,
    humanize: compact.hm,
    pingVarianceAutomation: compact.pv,
    // Iterate the canonical id lists, not Object.keys(compact.lb/gll) -- this both drops any
    // unknown/stale key (same treatment ll already gets below) AND backfills any lane/target a
    // hand-trimmed or corrupted wire blob is missing with its default, so lfoBank/globalLfoLinks
    // are never partial. A hole here used to reach audioStore's setLfoBank/setGlobalLfoLink as
    // `undefined` and throw -- see docs/tasks/LFO_BANK.md Task 20's code-review fixup.
    lfoBank: compact.lb
      ? (Object.fromEntries(
          LFO_LANE_IDS.map((lane) => [lane, compact.lb![lane] ? fromCompactBankLfoSettings(compact.lb![lane]) : DEFAULT_BANK_LFO]),
        ) as Record<LfoLaneId, BankLfoSettings>)
      : undefined,
    globalLfoLinks: compact.gll
      ? (Object.fromEntries(
          GLOBAL_LFO_TARGET_IDS.map((target) => [target, compact.gll![target] ? fromCompactLfoLink(compact.gll![target]) : DEFAULT_LFO_LINK[target]]),
        ) as Record<GlobalLfoTargetId, LfoLink>)
      : undefined,
    robotOverrides: compact.r
      ? Object.fromEntries(Object.entries(compact.r).map(([id, diff]) => [id, fromCompactRobotOverrideDiff(diff)]))
      : {},
    companyDiffs: compact.d
      ? Object.fromEntries(Object.entries(compact.d).map(([id, diff]) => [id, fromCompactCompanyDiff(diff)]))
      : {},
    userCreatedCompanies: compact.u ?? [],
  };
}

// ========================================
// FUNCTIONS
// ========================================

/** Encodes a SessionPayload for a URL query param -- via the abbreviated, empty-fields-omitted
 *  CompactSessionPayload wire shape, never the full field names. */
export function encodeSessionPayload(payload: SessionPayload): string {
  return encodeBase64Utf8(JSON.stringify(toCompactSessionPayload(payload)));
}

/** Decodes a `?session=` param value. Fails soft -- malformed base64, malformed JSON, or a shape
 *  that doesn't look like a CompactSessionPayload all return null, never throw. Same convention
 *  as sessionStorageEngine.ts's readStorage: a corrupted/tampered link degrades to "no share
 *  param present," not a crash. */
export function decodeSessionPayload(encoded: string): SessionPayload | null {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Utf8(encoded));
    if (!isValidCompactSessionPayload(parsed)) return null;
    return fromCompactSessionPayload(parsed);
  } catch (err) {
    devWarn('[sessionShareUtils] malformed ?session= param, ignoring', err);
    return null;
  }
}

/** Decoded once, at module load -- same timing seedUtils.ts's overrides used to read their own
 *  URL params at, so attenuationStyleStore.ts/localeStore.ts's own module-level constants can
 *  read it before the default locale is built. */
const SESSION_SHARE_PAYLOAD: SessionPayload | null =
  typeof window !== 'undefined' ? decodeSessionPayload(new URLSearchParams(window.location.search).get(SESSION_PARAM) ?? '') : null;

/** The decoded share payload from this page load's URL, or null if absent/malformed. Always
 *  returns the same value for the whole page load -- for the boot-time locale-pinning reads
 *  (attenuationStyleStore.ts/localeStore.ts), which only ever run once anyway (module load), and
 *  for anything else that just wants to inspect it. For a boot-time consumer that must apply the
 *  payload's side effects exactly once, use consumeSessionSharePayload instead. */
export function getSessionSharePayload(): SessionPayload | null {
  return SESSION_SHARE_PAYLOAD;
}

let sessionShareConsumed = false;

/** Returns the decoded share payload the FIRST time it's called, then null on every subsequent
 *  call for the rest of the page load. OceanScene.tsx's mount effect uses this (not
 *  getSessionSharePayload) so its applySessionPayload side effect (re-registering every robot's
 *  melody, reapplying company membership) fires exactly once per page load -- not again on any
 *  remount of OceanScene without a page reload (a power cycle no longer remounts it: ScreenViewport
 *  renders WorldView in both power states), which would otherwise re-run it for as long as
 *  `?session=` stays in the URL (durable/bookmarkable by design -- it's never cleared). */
export function consumeSessionSharePayload(): SessionPayload | null {
  if (sessionShareConsumed) return null;
  sessionShareConsumed = true;
  return SESSION_SHARE_PAYLOAD;
}

/** Builds a full, absolute shareable URL for a payload -- origin + pathname + exactly one
 *  `?session=` param. Deliberately drops any other query params currently in the address bar
 *  (e.g. ?debug) -- a share link is a clean, self-contained artifact, not a snapshot of whatever
 *  debug flags happened to be active when it was generated. */
export function buildShareUrl(payload: SessionPayload): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(SESSION_PARAM, encodeSessionPayload(payload));
  return url.toString();
}

/** Builds the link and writes it to the clipboard. Returns true on success, false on failure
 *  (e.g. clipboard permission denied) -- never throws. */
export async function copySessionLink(payload: SessionPayload): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildShareUrl(payload));
    return true;
  } catch (err) {
    devWarn('[sessionShareUtils] clipboard write failed', err);
    return false;
  }
}
