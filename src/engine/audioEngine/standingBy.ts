import * as Tone from 'tone';
import { devWarn } from '../../utils/helpers';

/**
 * Light tier standing cost H2 (docs/specs/LIGHT_TIER_STANDING_COST.md): robots standing by (eligible, over the Audio
 * Load budget) carry no voice. This is the budget's ledger of voices: who stands by, whose voice the budget took (or
 * refused) and so owes back, and the stand-downs waiting out a robot's last note. The voice work itself stays in
 * AudioEngine.ts, which hands it in as `StandingByHooks` and keeps the public calls (`setStandingByRobots`,
 * `setSoundingRobots`). Mute and solo never put a robot here.
 */

// A stand-down waits this long past a note's end plus its release: the composite voice starts the release 10 ms after
// the note's end (compositeVoice.ts), and the clock's tick granularity only ever makes the timer late.
const STAND_DOWN_MARGIN_SECONDS = 0.05;

/** The voice work the ledger asks AudioEngine.ts for. */
export interface StandingByHooks {
  /** Whether the robot has a composite voice now. */
  hasVoice(robotId: string): boolean;
  /** Release the robot's composite voice (AudioEngine.releaseVoice). */
  releaseVoice(robotId: string): void;
  /** Dispose the robot's LFO links: their targets are the voice's own params. */
  disposeLinks(robotId: string): void;
  /** The robot's envelope release, in seconds, for a stand-down to wait out. */
  releaseSeconds(robotId: string): number;
  /** Rebuild the robot's voice from its stored fields (AudioEngine.reReserveVoice); true when one was built. */
  rebuildVoice(robotId: string): boolean;
}

export type StandingBy = ReturnType<typeof createStandingBy>;

export function createStandingBy(hooks: StandingByHooks) {
  // Pushed beside the sounding set; empty = nobody stands by.
  let standingBy: ReadonlySet<string> = new Set();
  // Robots whose voice the budget took (or refused): rebuilt when admitted to the sounding set, or when it is lifted.
  const released = new Set<string>();
  // A stand-down waiting out its robot's last note, by token, so a stale timer from an earlier stand-down does nothing.
  const pending = new Map<string, number>();
  let token = 0;
  // The audio time each robot's latest scheduled note ends (cleared on release), for a stand-down to wait out.
  const noteEnd = new Map<string, number>();

  /** Release a standing-by robot's voice and its links, and remember the budget took it, so admission or a lifted
   *  budget rebuilds it. */
  function standDown(robotId: string): void {
    pending.delete(robotId);
    // Only a voice actually taken is owed back; a robot with none yet is marked when its reservation is refused.
    if (hooks.hasVoice(robotId)) {
      released.add(robotId);
      hooks.releaseVoice(robotId);
    }
    hooks.disposeLinks(robotId);
  }

  /**
   * Stand a robot down once its last scheduled note and that note's release have ended, so no note is cut; at once
   * when it is quiet. The timer is the AudioContext clock's (as AudioEngine's scheduleVoiceRelease's), which fires
   * against `now()` — the current time plus the lookahead — so the lookahead is added back: the voice goes when the
   * audio has passed the tail.
   */
  function scheduleStandDown(robotId: string): void {
    const quietAt = (noteEnd.get(robotId) ?? -Infinity) + hooks.releaseSeconds(robotId) + STAND_DOWN_MARGIN_SECONDS;
    try {
      const context = Tone.getContext();
      const delay = quietAt - Tone.now() + (context.lookAhead ?? 0);
      if (!(delay > 0)) {
        standDown(robotId);
        return;
      }
      const mine = ++token;
      pending.set(robotId, mine);
      context.setTimeout(() => {
        if (pending.get(robotId) === mine) standDown(robotId);
      }, delay);
    } catch (err) {
      devWarn('[AudioEngine] scheduleStandDown failed, standing down at once', err);
      standDown(robotId);
    }
  }

  /** The standing-by set: a robot no longer in it keeps the voice a pending stand-down would have taken; a newcomer
   *  that still has a voice is stood down. */
  function setStandingBy(ids: Iterable<string>): void {
    standingBy = new Set(ids);
    for (const id of [...pending.keys()]) {
      if (!standingBy.has(id)) pending.delete(id);
    }
    for (const id of standingBy) {
      if (!released.has(id) && !pending.has(id)) scheduleStandDown(id);
    }
  }

  return {
    setStandingBy,

    /** The new sounding set (null = no budget): nobody in it stands by, and every released robot it admits (all of
     *  them on null) is rebuilt. Returns the robots rebuilt, for the caller to prime their links. */
    admit(sounding: ReadonlySet<string> | null): string[] {
      setStandingBy(sounding === null ? [] : [...standingBy].filter((id) => !sounding.has(id)));
      const rebuilt: string[] = [];
      for (const id of [...released]) {
        if (sounding !== null && !sounding.has(id)) continue;
        released.delete(id);
        if (!hooks.hasVoice(id) && hooks.rebuildVoice(id)) rebuilt.push(id);
      }
      return rebuilt;
    },

    /** reserveVoice's gate: true for a robot standing by, which is then owed a voice on admission. */
    refuseReservation(robotId: string): boolean {
      if (!standingBy.has(robotId)) return false;
      released.add(robotId);
      return true;
    },

    /** Whether the budget took (or refused) this robot's voice, so it has none by design. */
    isReleased(robotId: string): boolean {
      return released.has(robotId);
    },

    /** A note for this robot was scheduled to end at `end` (audio time); the latest end is the one a stand-down waits for. */
    recordNoteEnd(robotId: string, end: number): void {
      if (end > (noteEnd.get(robotId) ?? -Infinity)) noteEnd.set(robotId, end);
    },

    /** The robot's voice was released, and with it the notes a stand-down would have waited for. */
    forgetNoteEnd(robotId: string): void {
      noteEnd.delete(robotId);
    },
  };
}
