import type * as Tone from 'tone';

import { devWarn } from '../../utils/helpers';
import { ROBOT_BUS_FILTER_Q } from '@/constants';
import { ROBOT_FILTER_TYPES, type RobotFilterType } from '@/types/Robot';

/**
 * Per-robot bus low-pass cutoff used when a caller passes no `filterFreq` — the value every bus
 * filter was hardcoded to from the composite-voice rewrite until the robot's own seeded
 * `audioAttributes.filterFreq` was wired through (it drove body detail/greeble count the whole
 * time, but never the sound). Sits inside Classic's accent cutoff band, `robot.accentFilterFreq`
 * (400–2500 Hz, src/data/bands/classic.ts).
 */
const ROBOT_BUS_FILTER_DEFAULT_HZ = 1200;
/** `filterFreq: 0` means "no filter" (Robot.ts) — open the low-pass to the top of the audible band. */
const ROBOT_BUS_FILTER_OPEN_HZ = 20000;

/** Resolve a robot's bus-filter cutoff from its `filterFreq`, honouring the two special cases above. */
export function resolveBusFilterCutoff(filterFreq: number | undefined): number {
  if (filterFreq === undefined || Number.isNaN(filterFreq)) return ROBOT_BUS_FILTER_DEFAULT_HZ;
  if (filterFreq <= 0) return ROBOT_BUS_FILTER_OPEN_HZ;
  return filterFreq;
}

/** Resolve a robot's bus-filter resonance from its `filterQ`; absent or NaN keeps today's fixed Q. */
export function resolveBusFilterQ(filterQ: number | undefined): number {
  if (filterQ === undefined || Number.isNaN(filterQ)) return ROBOT_BUS_FILTER_Q;
  return filterQ;
}

/** Resolve a robot's bus-filter type from its `filterType`; absent or unrecognised (a stale payload) stays lowpass. */
export function resolveBusFilterType(filterType: RobotFilterType | undefined): RobotFilterType {
  return filterType !== undefined && ROBOT_FILTER_TYPES.includes(filterType) ? filterType : 'lowpass';
}

// ========================================
// THE NODE (docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md G2a)
// ========================================
// A Tone.Filter at its -12 rolloff is one BiquadFilterNode inside about 14 more nodes (its input and output Gains, and a
// ConstantSource and Gains for each of its frequency, detune, Q and gain Signals), every one rendering. The bus filter
// is the raw context's own biquad instead. Tone is handed in by AudioEngine.ts, so this module keeps no runtime Tone
// import (RobotScreen and companyOptions read its resolvers).

/** A robot's bus filter: the raw context's biquad, or a Tone.Filter where the context cannot make one. */
export type BusFilter = BiquadFilterNode | Tone.Filter;

/** What buildBusFilter needs from Tone: the raw context, and the Filter constructor for the fallback. */
export interface BusFilterContext {
  rawContext?: { createBiquadFilter?: () => BiquadFilterNode };
  FilterCtor?: new (options: BusFilterOptions) => Tone.Filter;
}

export interface BusFilterOptions {
  frequency: number;
  Q: number;
  type: RobotFilterType;
}

/** The biquads buildBusFilter made, so a native filter is told from a Tone.Filter, a mock or the stub by identity. */
const nativeFilters = new WeakSet<object>();
let warnedFallback = false;

/**
 * The bus filter for a new voice: the raw context's biquad with the cutoff, resonance and type set; where the context
 * has no `createBiquadFilter` (a mocked or headless Tone), a Tone.Filter with the same options, warned about once; null
 * when there is neither, for the caller's stub.
 */
export function buildBusFilter(context: BusFilterContext, options: BusFilterOptions): BusFilter | null {
  const make = context.rawContext?.createBiquadFilter;
  if (typeof make === 'function') {
    const filter = make.call(context.rawContext);
    filter.type = options.type;
    filter.frequency.value = options.frequency;
    filter.Q.value = options.Q;
    nativeFilters.add(filter);
    return filter;
  }
  if (!warnedFallback) {
    warnedFallback = true;
    devWarn('[AudioEngine] the raw context has no createBiquadFilter: robot bus filters are Tone Filters');
  }
  return context.FilterCtor ? new context.FilterCtor(options) : null;
}

/** Whether `filter` is a biquad buildBusFilter made from the raw context. */
export function isNativeBusFilter(filter: BusFilter): filter is BiquadFilterNode {
  return nativeFilters.has(filter);
}

/** Hold a native param where it is at `start`, then ramp it linearly to `target` over `seconds`. Without
 *  cancelAndHoldAtTime (Firefox), cancel from `start` and pin the param's present value there. */
function glideNative(param: AudioParam, target: number, start: number, seconds: number): void {
  if (!Number.isFinite(target)) return;
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(start);
  } else {
    param.cancelScheduledValues(start);
    param.setValueAtTime(param.value, start);
  }
  param.linearRampToValueAtTime(target, start + seconds);
}

/** A live edit of a native bus filter: cutoff and resonance glide from `start` (Tone's now, as a Tone ramp starts)
 *  over `seconds`; the type is assigned. */
export function glideBusFilter(
  filter: BiquadFilterNode,
  patch: { frequency?: number; Q?: number; type?: RobotFilterType },
  seconds: number,
  start: number,
): void {
  if (patch.frequency !== undefined) glideNative(filter.frequency, patch.frequency, start, seconds);
  if (patch.Q !== undefined) glideNative(filter.Q, patch.Q, start, seconds);
  if (patch.type !== undefined) filter.type = patch.type;
}
