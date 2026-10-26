/**
 * A Transport tick's time as a call's trailing argument, only when there is one (docs/specs/BEATCLOCK_TRANSPORT_TIME.md).
 * The swell path passes its tick's time down through functions that take `time?`; a hand edit passes none, and with
 * this its call stays exactly the call it always was, with no trailing `undefined`. Spread it last:
 * `AudioEngine.updateRobotMasterVolume(id, value, ...timeArg(time))`.
 */
export function timeArg(time: number | undefined): [] | [number] {
  return time === undefined ? [] : [time];
}
