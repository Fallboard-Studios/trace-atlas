// ========================================
// IMPORTS
// ========================================
import { formatUptime, STALL_RATE_THRESHOLD } from '../../utils/audioHealth';
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
  return 'ok';
}

/** The Audio Load budget in one line: the dial, robots sounding out of the cap, robots standing by, and notes used out of the live ceiling. */
function budgetLine({ audioLoad, soundingRobots, maxAudibleRobots, audibleRobots, voices, maxVoices }: DiagInfo): string {
  const load = isKnown(audioLoad) ? `${Math.round(audioLoad * 100)}%` : DASH;
  const standingBy = isKnown(audibleRobots) && isKnown(soundingRobots) ? String(Math.max(0, audibleRobots - soundingRobots)) : DASH;
  return `load ${load} · sounding ${count(soundingRobots)}/${count(maxAudibleRobots)} · standing by ${standingBy} · poly ${count(voices)}/${count(maxVoices)}`;
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
    `voices ${info.voices}/${info.maxVoices}   audible ${info.audibleRobots}/${info.totalRobots}   LFOs ${info.globalLfosOn}/${info.globalLfosTotal}`,
    budgetLine(info),
    `fps ${fps}   lag ${ms(timing.lagMs)} (max ${ms(timing.maxLagMs)})`,
  ];

  if (timing.events.length === 0) {
    lines.push('no events yet');
  } else {
    for (const event of timing.events) lines.push(`${formatUptime(event.atMs)} ${event.text}`);
  }
  return lines;
}
