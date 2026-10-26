// The world link's compact codec (docs/specs/SHORT_WORLD_LINK.md §1.3, risk 2): a WorldDiff to and from its
// abbreviated blob JSON. Its own module, apart from sessionShareUtils.ts, so the import graph runs one way --
// sessionShareUtils -> worldLink -> worldDiffCodec / seedBaseline. With the codec inside sessionShareUtils.ts, the
// boot seam importing worldLink made a cycle that threw at load whenever worldLink was imported first. Imports no
// store and nothing from sessionShareUtils.ts or worldLink.ts.

// ========================================
// IMPORTS
// ========================================
import type { SessionPayload, RobotAudioOverrideDiff, CompanyDiff } from '../types/session';
import { ENVELOPE_CURVE_NAMES, ROBOT_FILTER_TYPES, type ADSREnvelope, type EnvelopeCurveName, type RobotFilterType } from '../types/Robot';
import type { OscillatorLayer } from '../types/layeredAudio';
import { withGlobalAudioDefaults, type GlobalAudioSettings } from '../types/globalAudio';
import type { WorldDiff } from './seedBaseline';
import { LFO_LANE_IDS, GLOBAL_LFO_TARGET_IDS, ROBOT_LFO_TARGET_IDS, type LfoLaneId, type GlobalLfoTargetId, type RobotLfoTargetId, type LfoLink, type BankLfoSettings } from '../types/lfo';
import { NOTE_VALUES, isNoteValue, type NoteDivision, type NoteModifier, type NoteValue } from '../data/noteValues';
import { ROBOT_SENDS } from '../data/robotSends';
import { PAN_MIN, PAN_MAX, SEND_MIN, SEND_MAX } from '../constants';

// ========================================
// TYPES
// ========================================

/** The world link's blob JSON (docs/specs/SHORT_WORLD_LINK.md assumption 3): the retired `?session=` wire's codes without
 *  the identity (`v` / `n` / `c` -- the link's own `seed` / `x` / `y` params carry it, and wire version 1 implies payload
 *  version 2), and every world-level field partial: `g` holds only the Audio Rig blocks that differ from the seed, each
 *  whole (assumption 4), `lb` only the lanes, `gll` only the targets, and a pacing scalar only when it differs. `r` / `d`
 *  / `u` are exactly as before. Every key is omitted when it carries nothing. */
interface CompactWorldDiff {
  g?: Partial<GlobalAudioSettings>;
  b?: number;
  sf?: number;
  sd?: number;
  hm?: number;
  pv?: number;
  lb?: Partial<Record<LfoLaneId, CompactBankLfoSettings>>;
  gll?: Partial<Record<GlobalLfoTargetId, CompactLfoLink>>;
  r?: Record<string, CompactRobotOverrideDiff>;
  d?: Record<string, CompactCompanyDiff>;
  u?: SessionPayload['userCreatedCompanies'];
}

/** BankLfoSettings, abbreviated. `y` is the lane's tempo-sync note (docs/specs/FREE_SYNC_TOGGLE.md
 *  §1.8) -- omitted entirely for a Free lane, so a Free lane's wire entry is exactly what it was
 *  before Sync existed. */
interface CompactBankLfoSettings {
  s: BankLfoSettings['shape'];
  r: number;
  rd: number;
  dd: number;
  y?: string;
}

/** LfoLink, abbreviated -- `l` omitted entirely for `lane: null` (every seeded/default link that
 *  hasn't been dragged onto a lane), same "no key if absent" contract as every other optional field. */
interface CompactLfoLink {
  l?: LfoLaneId;
  d: number;
}

/** ADSREnvelope, abbreviated. */
interface CompactADSR {
  at: number;
  dc: number;
  su: number;
  rl: number;
  /** Attack / release curve names; absent when the envelope carries none (Tone's linear default). */
  ac?: EnvelopeCurveName;
  rc?: EnvelopeCurveName;
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

/** RobotAudioOverrideDiff, abbreviated -- every field optional, same "absent if untouched"
 *  contract as the full shape. */
interface CompactRobotOverrideDiff {
  a?: CompactADSR;
  l?: CompactLayer[];
  f?: number;
  /** Portamento seconds; a 0 is a real value (the seeded glide switched off). */
  po?: number;
  /** Bus filter resonance and type. */
  fq?: number;
  ft?: RobotFilterType;
  rd?: number;
  rm?: CompactToggle;
  nv?: CompactToggle;
  pr?: number;
  /** A manual pan, −1…1; absent means Auto (RobotAudioOverrideDiff.pan's own contract). */
  p?: number;
  /** Reverb and Delay sends, 0…1 (RobotAudioOverrideDiff.reverbSend / delaySend); a 0 is a real value, the send switched off. */
  rs?: number;
  ds?: number;
  /** Grit, Shimmer and Double sends, 0…1 (RobotAudioOverrideDiff.gritSend / shimmerSend / doubleSend), as rs / ds. */
  gr?: number;
  sm?: number;
  db?: number;
  /** Dynamics, Rests and Accents, 0…100 (RobotAudioOverrideDiff.dynamics / rests / accents); a 0 is a real value. */
  dy?: number;
  rt?: number;
  ax?: number;
  or?: RobotAudioOverrideDiff['octaveRange'];
  nm?: string;
  /** Only the targets that changed (RobotAudioOverrideDiff.lfoLinks' own contract), abbreviated
   *  per-target via CompactLfoLink. */
  ll?: Partial<Record<RobotLfoTargetId, CompactLfoLink>>;
}

/** CompanyDiff, abbreviated. */
interface CompactCompanyDiff {
  n?: string;
  r?: string[];
}

// ========================================
// PRIVATE HELPERS
// ========================================

function toCompactADSR(a: ADSREnvelope): CompactADSR {
  const compact: CompactADSR = { at: a.attack, dc: a.decay, su: a.sustain, rl: a.release };
  if (a.attackCurve !== undefined) compact.ac = a.attackCurve;
  if (a.releaseCurve !== undefined) compact.rc = a.releaseCurve;
  return compact;
}
function fromCompactADSR(a: CompactADSR): ADSREnvelope {
  const adsr: ADSREnvelope = { attack: a.at, decay: a.dc, sustain: a.su, release: a.rl };
  // `ac` / `rc` come off an untrusted URL: a value that is not a listed curve name is dropped on its own,
  // so the stages and the other curve still restore.
  if (isCurveName(a.ac)) adsr.attackCurve = a.ac;
  if (isCurveName(a.rc)) adsr.releaseCurve = a.rc;
  return adsr;
}
function isCurveName(value: unknown): value is EnvelopeCurveName {
  return (ENVELOPE_CURVE_NAMES as readonly unknown[]).includes(value);
}
function isFilterType(value: unknown): value is RobotFilterType {
  return (ROBOT_FILTER_TYPES as readonly unknown[]).includes(value);
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isSendFraction(value: unknown): value is number {
  // The range comparison alone rejects NaN and +/-Infinity.
  return typeof value === 'number' && value >= SEND_MIN && value <= SEND_MAX;
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

/** The note-value code a lane's `y` carries: a division token plus a modifier suffix (none / d / t) --
 *  '4' is a quarter, '8d' a dotted eighth, '1b' one bar, '4b' four bars. '1/2' -> '2' and 2 bars ->
 *  '2b' never collide: only bars carry the 'b'. */
const SYNC_DIVISION_TOKENS: Record<NoteDivision, string> = {
  '1/32': '32',
  '1/16': '16',
  '1/8': '8',
  '1/4': '4',
  '1/2': '2',
  '1': '1b',
  '2': '2b',
  '4': '4b',
};
const SYNC_MODIFIER_SUFFIXES: Record<NoteModifier, string> = { straight: '', dotted: 'd', triplet: 't' };

function noteValueToCode(nv: NoteValue): string {
  return `${SYNC_DIVISION_TOKENS[nv.division]}${SYNC_MODIFIER_SUFFIXES[nv.modifier]}`;
}

/** Every valid code -> its note, built once from the real table: exactly the 20 NOTE_VALUES codes
 *  decode, and anything else -- unknown token, a modifier the division doesn't offer (2/4 bars are
 *  straight-only), wrong case, padding, a non-string -- misses. A Map, not an object, so a hostile
 *  key like '__proto__' or 'constructor' can't hit an inherited property. */
const NOTE_VALUE_BY_CODE: ReadonlyMap<string, NoteValue> = new Map(NOTE_VALUES.map((nv) => [noteValueToCode(nv), nv]));

function toCompactBankLfoSettings(b: BankLfoSettings): CompactBankLfoSettings {
  const compact: CompactBankLfoSettings = { s: b.shape, r: b.rate, rd: b.rateDrift, dd: b.depthDrift };
  // isNoteValue, not a bare `!== undefined`: a lane carrying a bogus `sync` is written as Free.
  if (isNoteValue(b.sync)) compact.y = noteValueToCode(b.sync);
  return compact;
}
function fromCompactBankLfoSettings(b: CompactBankLfoSettings): BankLfoSettings {
  const lane: BankLfoSettings = { shape: b.s, rate: b.r, rateDrift: b.rd, depthDrift: b.dd };
  // `y` comes off an untrusted URL: anything that isn't one of the 20 known codes leaves the lane Free.
  const sync = typeof b.y === 'string' ? NOTE_VALUE_BY_CODE.get(b.y) : undefined;
  if (sync !== undefined) lane.sync = sync;
  return lane;
}

function toCompactLfoLink(link: LfoLink): CompactLfoLink {
  const compact: CompactLfoLink = { d: link.depth };
  if (link.lane !== null) compact.l = link.lane;
  return compact;
}
function fromCompactLfoLink(compact: CompactLfoLink): LfoLink {
  return { lane: compact.l ?? null, depth: compact.d };
}

function toCompactRobotOverrideDiff(diff: RobotAudioOverrideDiff): CompactRobotOverrideDiff {
  const compact: CompactRobotOverrideDiff = {};
  if (diff.adsr !== undefined) compact.a = toCompactADSR(diff.adsr);
  if (diff.layers !== undefined) compact.l = diff.layers.map(toCompactLayer);
  if (diff.filterFreq !== undefined) compact.f = diff.filterFreq;
  if (diff.portamento !== undefined) compact.po = diff.portamento;
  if (diff.filterQ !== undefined) compact.fq = diff.filterQ;
  if (diff.filterType !== undefined) compact.ft = diff.filterType;
  if (diff.rhythmicDensity !== undefined) compact.rd = diff.rhythmicDensity;
  if (diff.rhythmicMotifLength !== undefined) compact.rm = toCompactToggle(diff.rhythmicMotifLength);
  if (diff.noteVariance !== undefined) compact.nv = toCompactToggle(diff.noteVariance);
  if (diff.pitchRepeat !== undefined) compact.pr = diff.pitchRepeat;
  if (diff.pan !== undefined) compact.p = diff.pan;
  // The five sends at this one position, in table order, so a link encodes to the same string (docs/specs/ROBOT_SEND_TABLE.md assumption 9).
  for (const spec of ROBOT_SENDS) if (diff[spec.field] !== undefined) compact[spec.shareCode] = diff[spec.field];
  if (diff.dynamics !== undefined) compact.dy = diff.dynamics;
  if (diff.rests !== undefined) compact.rt = diff.rests;
  if (diff.accents !== undefined) compact.ax = diff.accents;
  if (diff.octaveRange !== undefined) compact.or = diff.octaveRange;
  if (diff.name !== undefined) compact.nm = diff.name;
  if (diff.lfoLinks !== undefined) {
    compact.ll = Object.fromEntries(Object.entries(diff.lfoLinks).map(([target, link]) => [target, toCompactLfoLink(link as LfoLink)])) as Partial<Record<RobotLfoTargetId, CompactLfoLink>>;
  }
  return compact;
}
function fromCompactRobotOverrideDiff(compact: CompactRobotOverrideDiff): RobotAudioOverrideDiff {
  const diff: RobotAudioOverrideDiff = {};
  if (compact.a !== undefined) diff.adsr = fromCompactADSR(compact.a);
  if (compact.l !== undefined) diff.layers = compact.l.map(fromCompactLayer);
  if (compact.f !== undefined) diff.filterFreq = compact.f;
  // Robot Articulation: a non-finite or non-numeric `po` / `fq` and an unlisted `ft` are dropped one by one,
  // never misread as a value (JSON turns a NaN into null, which `typeof` rejects).
  if (isFiniteNumber(compact.po)) diff.portamento = compact.po;
  if (isFiniteNumber(compact.fq)) diff.filterQ = compact.fq;
  if (isFilterType(compact.ft)) diff.filterType = compact.ft;
  if (compact.rd !== undefined) diff.rhythmicDensity = compact.rd;
  if (compact.rm !== undefined) diff.rhythmicMotifLength = fromCompactToggle(compact.rm);
  if (compact.nv !== undefined) diff.noteVariance = fromCompactToggle(compact.nv);
  if (compact.pr !== undefined) diff.pitchRepeat = compact.pr;
  // A non-numeric, non-finite or out-of-range `p` is dropped, so the robot stays Auto -- never
  // misread as a manual pan (the same rule the `ll` decoder follows for an unknown target).
  if (typeof compact.p === 'number' && Number.isFinite(compact.p) && compact.p >= PAN_MIN && compact.p <= PAN_MAX) diff.pan = compact.p;
  // Robot Sends: a non-numeric, non-finite or out-of-[0, 1] `rs` / `ds` / `gr` / `sm` / `db` is dropped one by one, so
  // the robot keeps its seeded send -- never misread as a send of 0 or 1.
  for (const spec of ROBOT_SENDS) {
    const send = compact[spec.shareCode];
    if (isSendFraction(send)) diff[spec.field] = send;
  }
  // Robot Performance: a non-numeric or non-finite `dy` / `rt` / `ax` is dropped one by one (JSON writes a NaN as null),
  // so the robot keeps its seeded value; the store clamps the range on restore.
  if (isFiniteNumber(compact.dy)) diff.dynamics = compact.dy;
  if (isFiniteNumber(compact.rt)) diff.rests = compact.rt;
  if (isFiniteNumber(compact.ax)) diff.accents = compact.ax;
  if (compact.or !== undefined) diff.octaveRange = compact.or;
  if (compact.nm !== undefined) diff.name = compact.nm;
  if (compact.ll !== undefined) {
    // Drops any key that isn't a currently-recognized target -- same "a removed/renamed target
    // id loaded from an old link is just gone, never misread" treatment the lfo.ts doc comment
    // already describes for the old layerN.phase targets.
    diff.lfoLinks = Object.fromEntries(
      Object.entries(compact.ll)
        .filter(([target]) => (ROBOT_LFO_TARGET_IDS as readonly string[]).includes(target))
        .map(([target, link]) => [target, fromCompactLfoLink(link as CompactLfoLink)]),
    ) as Partial<Record<RobotLfoTargetId, LfoLink>>;
  }
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The Audio Rig blocks of an untrusted `g` that are real: withGlobalAudioDefaults is the one kind check, so a block it
 *  handed back as given is kept (whole, never merged), and one it would have replaced with a default -- missing, null,
 *  the wrong kind -- is simply not carried, so the fill takes the seed's instead (spec assumption 8). An unknown key is
 *  not in its output at all. */
function knownGlobalAudioBlocks(g: Record<string, unknown>): Partial<GlobalAudioSettings> {
  const checked = withGlobalAudioDefaults(g as Partial<GlobalAudioSettings>) as unknown as Record<string, unknown>;
  const known: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(checked)) {
    if (Object.prototype.hasOwnProperty.call(g, key) && g[key] === value) known[key] = value;
  }
  return known as Partial<GlobalAudioSettings>;
}

/** The plain-object entries of an untrusted record, each decoded; a non-object entry (a number, null, an array) is dropped
 *  rather than read as an empty override. */
function decodeEntries<C, T>(record: Record<string, unknown>, decode: (compact: C) => T): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, entry]) => isPlainObject(entry))
      .map(([id, entry]) => [id, decode(entry as C)]),
  );
}

/** The entries of an untrusted record under the canonical ids only (an unknown or stale id is gone), each decoded. */
function decodeKnownIds<K extends string, C, T>(ids: readonly K[], record: Record<string, unknown>, decode: (compact: C) => T): Partial<Record<K, T>> {
  const decoded: Partial<Record<K, T>> = {};
  for (const id of ids) {
    const entry = record[id];
    if (isPlainObject(entry)) decoded[id] = decode(entry as C);
  }
  return decoded;
}

function isNonEmpty(record: object): boolean {
  return Object.keys(record).length > 0;
}

// ========================================
// FUNCTIONS
// ========================================

/** A WorldDiff in its abbreviated blob JSON. Only what the diff carries is written: `g` / `lb` / `gll` hold exactly its
 *  blocks, lanes and targets, never a whole record, and an empty part is omitted (an empty diff is `{}`). */
export function toCompactWorldDiff(diff: WorldDiff): CompactWorldDiff {
  const compact: CompactWorldDiff = {};
  if (diff.globalAudio !== undefined && isNonEmpty(diff.globalAudio)) compact.g = diff.globalAudio;
  if (diff.bpm !== undefined) compact.b = diff.bpm;
  if (diff.swellFrequency !== undefined) compact.sf = diff.swellFrequency;
  if (diff.swellDuration !== undefined) compact.sd = diff.swellDuration;
  if (diff.humanize !== undefined) compact.hm = diff.humanize;
  if (diff.pingVarianceAutomation !== undefined) compact.pv = diff.pingVarianceAutomation;
  if (diff.lfoBank !== undefined && isNonEmpty(diff.lfoBank)) {
    compact.lb = Object.fromEntries(
      Object.entries(diff.lfoBank).map(([lane, b]) => [lane, toCompactBankLfoSettings(b as BankLfoSettings)]),
    ) as Partial<Record<LfoLaneId, CompactBankLfoSettings>>;
  }
  if (diff.globalLfoLinks !== undefined && isNonEmpty(diff.globalLfoLinks)) {
    compact.gll = Object.fromEntries(
      Object.entries(diff.globalLfoLinks).map(([target, link]) => [target, toCompactLfoLink(link as LfoLink)]),
    ) as Partial<Record<GlobalLfoTargetId, CompactLfoLink>>;
  }
  if (diff.robotOverrides !== undefined && isNonEmpty(diff.robotOverrides)) {
    compact.r = Object.fromEntries(Object.entries(diff.robotOverrides).map(([id, d]) => [id, toCompactRobotOverrideDiff(d)]));
  }
  if (diff.companyDiffs !== undefined && isNonEmpty(diff.companyDiffs)) {
    compact.d = Object.fromEntries(Object.entries(diff.companyDiffs).map(([id, d]) => [id, toCompactCompanyDiff(d)]));
  }
  if (diff.userCreatedCompanies !== undefined && diff.userCreatedCompanies.length > 0) compact.u = diff.userCreatedCompanies;
  return compact;
}

/** The shape check for a blob's parsed JSON -- untrusted input (spec assumption 8): an object, and every key it carries of
 *  the right kind (`g` / `lb` / `gll` / `r` / `d` plain objects, the pacing scalars numbers, `u` an array). Deeper entries
 *  are checked field by field as they decode. */
export function isValidCompactWorldDiff(parsed: unknown): parsed is CompactWorldDiff {
  if (!isPlainObject(parsed)) return false;
  const { g, b, sf, sd, hm, pv, lb, gll, r, d, u } = parsed;
  for (const scalar of [b, sf, sd, hm, pv]) if (scalar !== undefined && typeof scalar !== 'number') return false;
  for (const record of [g, lb, gll, r, d]) if (record !== undefined && !isPlainObject(record)) return false;
  if (u !== undefined && !Array.isArray(u)) return false;
  return true;
}

/** A blob's parsed JSON back to a WorldDiff, or null when its shape is wrong. Fills nothing (fillWorldFromSeed does):
 *  `lb` / `gll` are read under the canonical lane and target ids, so an unknown id is dropped and a missing one stays
 *  missing; every per-field guard of the robot codec applies; a part that decodes to nothing writes no key. */
export function fromCompactWorldDiff(parsed: unknown): WorldDiff | null {
  if (!isValidCompactWorldDiff(parsed)) return null;
  const diff: WorldDiff = {};
  if (parsed.g !== undefined) {
    const globalAudio = knownGlobalAudioBlocks(parsed.g as Record<string, unknown>);
    if (isNonEmpty(globalAudio)) diff.globalAudio = globalAudio;
  }
  if (parsed.b !== undefined) diff.bpm = parsed.b;
  if (parsed.sf !== undefined) diff.swellFrequency = parsed.sf;
  if (parsed.sd !== undefined) diff.swellDuration = parsed.sd;
  if (parsed.hm !== undefined) diff.humanize = parsed.hm;
  if (parsed.pv !== undefined) diff.pingVarianceAutomation = parsed.pv;
  if (parsed.lb !== undefined) {
    const lanes = decodeKnownIds(LFO_LANE_IDS, parsed.lb as Record<string, unknown>, fromCompactBankLfoSettings);
    if (isNonEmpty(lanes)) diff.lfoBank = lanes;
  }
  if (parsed.gll !== undefined) {
    const links = decodeKnownIds(GLOBAL_LFO_TARGET_IDS, parsed.gll as Record<string, unknown>, fromCompactLfoLink);
    if (isNonEmpty(links)) diff.globalLfoLinks = links;
  }
  if (parsed.r !== undefined) {
    const robots = decodeEntries(parsed.r as Record<string, unknown>, fromCompactRobotOverrideDiff);
    if (isNonEmpty(robots)) diff.robotOverrides = robots;
  }
  if (parsed.d !== undefined) {
    const companies = decodeEntries(parsed.d as Record<string, unknown>, fromCompactCompanyDiff);
    if (isNonEmpty(companies)) diff.companyDiffs = companies;
  }
  if (parsed.u !== undefined && parsed.u.length > 0) diff.userCreatedCompanies = parsed.u;
  return diff;
}
