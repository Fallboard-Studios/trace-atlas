// ========================================
// IMPORTS
// ========================================
import { formatUptime, peakToDb, STALL_RATE_THRESHOLD } from '../../utils/audioHealth';
import { effectsLoadToLimits } from '../../utils/audioBudget';
import { BYPASS_KEYS } from '../../engine/audioEngine/bypassCell';
import type { DiagInfo, DiagSnapshot } from '../../engine/audioDiagnostics';

// ========================================
// TYPES
// ========================================

/** What world this session loaded — printed so a screenshot of the HUD identifies it. */
export interface HudWorld {
  seed: string | null;
  x: number | undefined;
  y: number | undefined;
}

// ========================================
// HELPERS
// ========================================

const DASH = '-';
const ms = (value: number | null): string => (value === null ? DASH : `${Math.round(value)}ms`);
const isKnown = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value);
const count = (value: number | undefined): string => (isKnown(value) ? String(Math.round(value)) : DASH);

// ========================================
// FUNCTIONS
// ========================================

/** 'bad' when any of the failure signatures from docs/todo/scratchy-audio-phones.md is showing. */
export function hudStatus({ timing }: DiagSnapshot): 'ok' | 'bad' {
  if (timing.ctxState !== 'running') return 'bad';
  if (timing.clockRate !== null && timing.clockRate < STALL_RATE_THRESHOLD) return 'bad';
  if (timing.fps !== null && timing.fps === 0) return 'bad';
  if (timing.underrunActive) return 'bad';
  if (timing.silentActive || timing.masterNonFinite || timing.preNonFinite) return 'bad';
  return 'ok';
}

/** The Audio Load budget in one line: both dials, robots sounding out of the cap, robots standing by, notes used out of
 *  the live ceiling, and how many of the ten global effects are in the signal path. */
function budgetLine({ robotLoad, effectsLoad, soundingRobots, maxAudibleRobots, audibleRobots, voices, maxVoices, fxConnected }: DiagInfo): string {
  const pct = (load: number): string => (isKnown(load) ? `${Math.round(load * 100)}%` : DASH);
  const standingBy = isKnown(audibleRobots) && isKnown(soundingRobots) ? String(Math.max(0, audibleRobots - soundingRobots)) : DASH;
  return `load ${pct(robotLoad)}·fx ${pct(effectsLoad)} · sounding ${count(soundingRobots)}/${count(maxAudibleRobots)} · standing by ${standingBy} · poly ${count(voices)}/${count(maxVoices)} · fx in ${count(fxConnected)}/${BYPASS_KEYS.length}`;
}

/** The LFO Bank in one line (docs/tasks/LFO_BANK.md): how many of the 4 shared lanes are
 *  currently running (rate > 0), and how many modulation targets (global + every active robot's)
 *  are linked into the bank out of the total that could be. */
function bankLine({ bankRunning, linksOn, linksTotal }: DiagInfo): string {
  return `bank ${count(bankRunning)}/4   links ${count(linksOn)}/${count(linksTotal)}`;
}

/**
 * Which LFO tiers the Effects dial is holding off, in one line: drift, the global filter (LPF/HPF) links, and each
 * robot's own bus-filter links (Robot Articulation T14b). Derived from the dial through the same thresholds the budget
 * system applies, so reading it at a dropout says whether the bus links were running. A dash for an unknown dial,
 * since `effectsLoadToLimits` would read NaN as Full and the HUD must not guess.
 */
function tiersLine({ effectsLoad }: DiagInfo): string {
  if (!isKnown(effectsLoad)) return 'lfo drift - · filter - · bus -';
  const { driftEnabled, filterLfosEnabled, busFilterLfosEnabled } = effectsLoadToLimits(effectsLoad);
  const state = (on: boolean): string => (on ? 'on' : 'off');
  return `lfo drift ${state(driftEnabled)} · filter ${state(filterLfosEnabled)} · bus ${state(busFilterLfosEnabled)}`;
}

/** A linear level as dB with one decimal; `-inf` for silence, `-` when there is no reading. */
function db(level: number | undefined): string {
  if (!isKnown(level)) return DASH;
  const value = peakToDb(level);
  return value === -Infinity ? '-inf' : `${value.toFixed(1)}dB`;
}

/**
 * The output taps in one line (docs/specs/archive/AUDIO_OUTPUT_DIAGNOSTIC.md): master peak and RMS, the pre-chain peak,
 * and whether either tap saw a non-finite sample. Comparing `out` with `pre` at a dropout says whether the
 * silence is inside the FX chain (pre live, out silent) or upstream of it (both silent).
 */
function outputLine({ outputMaster, outputPre }: DiagInfo): string {
  const nonFinite = (outputMaster?.nonFinite ?? 0) + (outputPre?.nonFinite ?? 0);
  const finite = nonFinite > 0 ? 'NaN!' : outputMaster || outputPre ? 'ok' : DASH;
  return `out ${db(outputMaster?.peak)} rms ${db(outputMaster?.rms)}  pre ${db(outputPre?.peak)}  fin ${finite}`;
}

/** Seconds as whole milliseconds; `-` when the value is not a finite number. */
const msNum = (seconds: number): string => (Number.isFinite(seconds) ? String(Math.round(seconds * 1000)) : DASH);
const withUnit = (value: string): string => (value === DASH ? DASH : `${value}ms`);

/**
 * The browser's own playback statistics in one line (`AudioContext.playbackStats`): underruns so far, their total
 * duration, and the average (min-max) output latency. Rising underruns while the `out` level is normal mean the
 * graph is fine and the output could not be fed; a flat count with silence points downstream of the app.
 * `n/a` when the browser has no playbackStats (Chrome before 146).
 */
function underrunLine({ playback }: DiagInfo): string {
  if (!playback) return 'underruns n/a';
  const events = Number.isFinite(playback.underrunEvents) ? String(Math.round(playback.underrunEvents)) : DASH;
  const range =
    Number.isFinite(playback.minimumLatency) && Number.isFinite(playback.maximumLatency)
      ? `${msNum(playback.minimumLatency)}-${msNum(playback.maximumLatency)}`
      : DASH;
  return `underruns ${events} (${withUnit(msNum(playback.underrunDuration))}) · lat ${withUnit(msNum(playback.averageLatency))} (${range})`;
}

/** The HUD's text, one string per line. `uptimeMs` is the time since diagnostics started. */
export function buildHudLines(snapshot: DiagSnapshot, world: HudWorld, uptimeMs: number): string[] {
  const { timing, info } = snapshot;
  const seed = world.seed ?? 'random';
  const coords = world.x === undefined || world.y === undefined ? DASH : `${world.x},${world.y}`;
  const clock = timing.clockRate === null ? DASH : `x${timing.clockRate.toFixed(2)}`;
  const fps = timing.fps === null ? DASH : String(Math.round(timing.fps));

  const lines = [
    `${seed} @ ${coords}   up ${formatUptime(uptimeMs)}`,
    `ctx ${timing.ctxState}   clock ${clock}   transport ${info.transport}`,
    `latency ${info.latencyHint}   ahead ${info.lookAheadMs}ms   base ${ms(info.baseLatencyMs)}`,
    `voices ${info.voices}/${info.maxVoices}   audible ${info.audibleRobots}/${info.totalRobots}`,
    budgetLine(info),
    bankLine(info),
    tiersLine(info),
    `fps ${fps}   lag ${ms(timing.lagMs)} (max ${ms(timing.maxLagMs)})`,
    outputLine(info),
    underrunLine(info),
  ];

  if (timing.events.length === 0) {
    lines.push('no events yet');
  } else {
    for (const event of timing.events) lines.push(`${formatUptime(event.atMs)} ${event.text}`);
  }
  return lines;
}
