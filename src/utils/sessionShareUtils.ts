// ========================================
// IMPORTS
// ========================================
import type { SessionPayload, RobotAudioOverrideDiff, CompanyDiff } from '../types/session';
import type { ADSREnvelope } from '../types/Robot';
import type { OscillatorLayer } from '../types/layeredAudio';
import type { RobotLfoTargetId, GlobalLfoTargetId, LfoSettings } from '../types/lfo';
import { devWarn } from './helpers';

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
  pv?: SessionPayload['pingVarianceAutomation'];
  /** globalLfo, abbreviated per-target the same way robot lfoSettings (`lf` below) are. */
  gl?: Partial<Record<GlobalLfoTargetId, CompactLfoSettings>>;
  r?: Record<string, CompactRobotOverrideDiff>;
  d?: Record<string, CompactCompanyDiff>;
  u?: SessionPayload['userCreatedCompanies'];
}

/** ADSREnvelope, abbreviated. */
interface CompactADSR {
  at: number;
  dc: number;
  su: number;
  rl: number;
}

/** OscillatorLayer, abbreviated. `pw` optional, same as OscillatorLayer.pulseWidth. */
interface CompactLayer {
  t: OscillatorLayer['type'];
  g: number;
  dt: number;
  ph: number;
  pw?: number;
}

/** The `{ active, value }` toggle shape shared by rhythmicMotifLength/noteVariance, abbreviated. */
interface CompactToggle {
  a: boolean;
  v: number;
}

/** LfoSettings, abbreviated. Keyed by the same RobotLfoTargetId strings as the full shape (e.g.
 *  "layer0.gain") -- NOT abbreviated to an index into ROBOT_LFO_TARGET_IDS, deliberately: an
 *  ordinal mapping would silently break any already-shared link if that array's order or contents
 *  ever changed later, for a marginal saving on an already-short set of keys. */
interface CompactLfoSettings {
  s: LfoSettings['shape'];
  r: number;
  d: number;
}

/** RobotAudioOverrideDiff, abbreviated -- every field optional, same "absent if untouched"
 *  contract as the full shape. */
interface CompactRobotOverrideDiff {
  a?: CompactADSR;
  l?: CompactLayer[];
  f?: number;
  rd?: number;
  rm?: CompactToggle;
  nv?: CompactToggle;
  pr?: number;
  or?: RobotAudioOverrideDiff['octaveRange'];
  lf?: Partial<Record<RobotLfoTargetId, CompactLfoSettings>>;
  nm?: string;
}

/** CompanyDiff, abbreviated. */
interface CompactCompanyDiff {
  n?: string;
  r?: string[];
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

function toCompactADSR(a: ADSREnvelope): CompactADSR {
  return { at: a.attack, dc: a.decay, su: a.sustain, rl: a.release };
}
function fromCompactADSR(a: CompactADSR): ADSREnvelope {
  return { attack: a.at, decay: a.dc, sustain: a.su, release: a.rl };
}

function toCompactLayer(l: OscillatorLayer): CompactLayer {
  const compact: CompactLayer = { t: l.type, g: l.gain, dt: l.detune, ph: l.phase };
  if (l.pulseWidth !== undefined) compact.pw = l.pulseWidth;
  return compact;
}
function fromCompactLayer(l: CompactLayer): OscillatorLayer {
  const layer: OscillatorLayer = { type: l.t, gain: l.g, detune: l.dt, phase: l.ph };
  if (l.pw !== undefined) layer.pulseWidth = l.pw;
  return layer;
}

function toCompactToggle(t: { active: boolean; value: number }): CompactToggle {
  return { a: t.active, v: t.value };
}
function fromCompactToggle(t: CompactToggle): { active: boolean; value: number } {
  return { active: t.a, value: t.v };
}

function toCompactLfoSettings(l: LfoSettings): CompactLfoSettings {
  return { s: l.shape, r: l.rate, d: l.depth };
}
function fromCompactLfoSettings(l: CompactLfoSettings): LfoSettings {
  return { shape: l.s, rate: l.r, depth: l.d };
}

/** Generic over the target-id key type -- shared by robot lfoSettings (RobotLfoTargetId) and
 *  globalLfo (GlobalLfoTargetId); the abbreviation itself only touches shape/rate/depth. */
function toCompactLfoSettingsMap<K extends string>(map: Partial<Record<K, LfoSettings>>): Partial<Record<K, CompactLfoSettings>> {
  const compact: Partial<Record<K, CompactLfoSettings>> = {};
  for (const [key, value] of Object.entries(map) as [K, LfoSettings | undefined][]) {
    if (value !== undefined) compact[key] = toCompactLfoSettings(value);
  }
  return compact;
}
function fromCompactLfoSettingsMap<K extends string>(map: Partial<Record<K, CompactLfoSettings>>): Partial<Record<K, LfoSettings>> {
  const full: Partial<Record<K, LfoSettings>> = {};
  for (const [key, value] of Object.entries(map) as [K, CompactLfoSettings | undefined][]) {
    if (value !== undefined) full[key] = fromCompactLfoSettings(value);
  }
  return full;
}

function toCompactRobotOverrideDiff(diff: RobotAudioOverrideDiff): CompactRobotOverrideDiff {
  const compact: CompactRobotOverrideDiff = {};
  if (diff.adsr !== undefined) compact.a = toCompactADSR(diff.adsr);
  if (diff.layers !== undefined) compact.l = diff.layers.map(toCompactLayer);
  if (diff.filterFreq !== undefined) compact.f = diff.filterFreq;
  if (diff.rhythmicDensity !== undefined) compact.rd = diff.rhythmicDensity;
  if (diff.rhythmicMotifLength !== undefined) compact.rm = toCompactToggle(diff.rhythmicMotifLength);
  if (diff.noteVariance !== undefined) compact.nv = toCompactToggle(diff.noteVariance);
  if (diff.pitchRepeat !== undefined) compact.pr = diff.pitchRepeat;
  if (diff.octaveRange !== undefined) compact.or = diff.octaveRange;
  if (diff.lfoSettings !== undefined) compact.lf = toCompactLfoSettingsMap(diff.lfoSettings);
  if (diff.name !== undefined) compact.nm = diff.name;
  return compact;
}
function fromCompactRobotOverrideDiff(compact: CompactRobotOverrideDiff): RobotAudioOverrideDiff {
  const diff: RobotAudioOverrideDiff = {};
  if (compact.a !== undefined) diff.adsr = fromCompactADSR(compact.a);
  if (compact.l !== undefined) diff.layers = compact.l.map(fromCompactLayer);
  if (compact.f !== undefined) diff.filterFreq = compact.f;
  if (compact.rd !== undefined) diff.rhythmicDensity = compact.rd;
  if (compact.rm !== undefined) diff.rhythmicMotifLength = fromCompactToggle(compact.rm);
  if (compact.nv !== undefined) diff.noteVariance = fromCompactToggle(compact.nv);
  if (compact.pr !== undefined) diff.pitchRepeat = compact.pr;
  if (compact.or !== undefined) diff.octaveRange = compact.or;
  if (compact.lf !== undefined) diff.lfoSettings = fromCompactLfoSettingsMap(compact.lf);
  if (compact.nm !== undefined) diff.name = compact.nm;
  return diff;
}

function toCompactCompanyDiff(diff: CompanyDiff): CompactCompanyDiff {
  const compact: CompactCompanyDiff = {};
  if (diff.name !== undefined) compact.n = diff.name;
  if (diff.robotIds !== undefined) compact.r = diff.robotIds;
  return compact;
}
function fromCompactCompanyDiff(compact: CompactCompanyDiff): CompanyDiff {
  const diff: CompanyDiff = {};
  if (compact.n !== undefined) diff.name = compact.n;
  if (compact.r !== undefined) diff.robotIds = compact.r;
  return diff;
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
  if (payload.pingVarianceAutomation !== undefined) compact.pv = payload.pingVarianceAutomation;
  if (payload.globalLfo !== undefined) compact.gl = toCompactLfoSettingsMap(payload.globalLfo);
  if (Object.keys(payload.robotOverrides).length > 0) {
    compact.r = Object.fromEntries(Object.entries(payload.robotOverrides).map(([id, diff]) => [id, toCompactRobotOverrideDiff(diff)]));
  }
  if (Object.keys(payload.companyDiffs).length > 0) {
    compact.d = Object.fromEntries(Object.entries(payload.companyDiffs).map(([id, diff]) => [id, toCompactCompanyDiff(diff)]));
  }
  if (payload.userCreatedCompanies.length > 0) compact.u = payload.userCreatedCompanies;
  return compact;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const { n, c, g, b, sf, sd, pv, gl, r, d, u } = parsed;
  if (typeof n !== 'string') return false;
  if (!isPlainObject(c) || typeof c.x !== 'number' || typeof c.y !== 'number') return false;
  if (!isPlainObject(g)) return false;
  if (b !== undefined && typeof b !== 'number') return false;
  if (sf !== undefined && typeof sf !== 'number') return false;
  if (sd !== undefined && typeof sd !== 'number') return false;
  if (pv !== undefined && typeof pv !== 'number') return false;
  if (gl !== undefined && !isPlainObject(gl)) return false;
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
    globalAudio: compact.g,
    bpm: compact.b,
    swellFrequency: compact.sf,
    swellDuration: compact.sd,
    pingVarianceAutomation: compact.pv,
    globalLfo: compact.gl !== undefined ? fromCompactLfoSettingsMap(compact.gl) : undefined,
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
 *  melody, reapplying company membership) fires exactly once per page load -- not again on every
 *  power cycle, which fully unmounts/remounts OceanScene without a page reload (ScreenViewport.tsx:
 *  `{isPoweredOn && <WorldView />}`), and would otherwise re-run it on every power-on for as long
 *  as `?session=` stays in the URL (durable/bookmarkable by design -- it's never cleared). */
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
