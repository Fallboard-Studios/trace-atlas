// ========================================
// IMPORTS
// ========================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ========================================
// MOCKS
// ========================================

/*
 * docs/tasks/OFF_SCREEN_REVISIONS.md Task 13: the scene wash, as GSAP and the store see it. A recording GSAP double (the
 * shared stub fires every onComplete on its own and ignores kill, which would hide what this file pins): each timeline
 * keeps its onComplete for the test to fire, its tweens, and a kill spy. The audio engine is a proxy that records any
 * touch, so a wash callback reaching for the audio fails here.
 */
interface RecordedTimeline {
  onComplete?: () => void;
  tweens: { target: unknown; vars: Record<string, unknown> }[];
  kill: ReturnType<typeof vi.fn>;
}
type Listener = (time: number, delta: number, frame: number) => void;
const recorded = vi.hoisted(() => ({
  timelines: [] as RecordedTimeline[],
  sets: [] as { target: unknown; vars: Record<string, unknown> }[],
  audio: [] as string[],
  // GSAP's ticker as a frame counter and its listeners: the test steps it (tick) where real frames would come.
  ticker: { frame: 0, listeners: [] as Listener[] },
}));

vi.mock('gsap', () => {
  const timeline = (config?: { onComplete?: () => void }) => {
    const record: RecordedTimeline = { onComplete: config?.onComplete, tweens: [], kill: vi.fn() };
    recorded.timelines.push(record);
    const tl = {
      to: (target: unknown, vars: Record<string, unknown>) => {
        record.tweens.push({ target, vars });
        return tl;
      },
      kill: record.kill,
      pause: () => tl,
      play: () => tl,
      paused: () => false,
      progress: () => 0,
    };
    return tl;
  };
  const ticker = {
    get frame() {
      return recorded.ticker.frame;
    },
    add: (fn: Listener) => {
      recorded.ticker.listeners.push(fn);
      return fn;
    },
    remove: (fn: Listener) => {
      recorded.ticker.listeners = recorded.ticker.listeners.filter((l) => l !== fn);
    },
  };
  const mocked = {
    timeline,
    ticker,
    set: (target: unknown, vars: Record<string, unknown>) => {
      recorded.sets.push({ target, vars });
    },
  };
  return { default: mocked, ...mocked };
});

vi.mock('../engine/AudioEngine', () => ({
  AudioEngine: new Proxy(
    {},
    {
      get: (_target, prop) => {
        recorded.audio.push(String(prop));
        return () => undefined;
      },
    },
  ),
}));

import { SCENE_WASH_SECONDS, SCENE_WASH_TIMELINE, WORLD_WASH_REF_KEY, startSceneWash } from './sceneWash';
import { getTimeline, getTimelineScope, killAllTimelines } from './timelineMap';
import { requestWorldChange } from '../systems/worldChange';
import { useUIStore } from '../stores/uiStore';
import { clearRefs, setRef } from '../utils/refs';
import { waterColumnColors } from '../utils/waterColumnColors';

// ========================================
// HELPERS
// ========================================

const wash = () => useUIStore.getState().sceneWash;
const last = () => recorded.timelines[recorded.timelines.length - 1];
/** One frame of GSAP's ticker: the frame count steps, then every listener runs with it, as real GSAP does. */
const tick = () => {
  recorded.ticker.frame += 1;
  for (const listener of [...recorded.ticker.listeners]) listener(0, 16, recorded.ticker.frame);
};
/** A timeline lands where real GSAP calls it: inside a tick (its root timeline updates first on every tick). Then the
 *  tick returns, and the cover's change runs on the promise the request module queued at 'covered'
 *  (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R12), as it does in a browser once GSAP's frame callback is done. */
const finish = async (timeline: RecordedTimeline) => {
  recorded.ticker.frame += 1;
  timeline.onComplete?.();
  for (const listener of [...recorded.ticker.listeners]) listener(0, 16, recorded.ticker.frame);
  await Promise.resolve();
};
/** The cover lands, the change runs, and the next frame starts the fade-out: the uncover timeline. */
const coverAndStartUncover = async () => {
  await finish(last());
  tick();
  return last();
};
let el: HTMLDivElement;
let stop: () => void;

beforeEach(() => {
  recorded.timelines.length = 0;
  recorded.sets.length = 0;
  recorded.audio.length = 0;
  recorded.ticker.listeners = [];
  useUIStore.setState({ sceneWash: 'clear', activeLocaleLocalTime: 12 });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  el = document.createElement('div');
  setRef(WORLD_WASH_REF_KEY, el);
  stop = startSceneWash();
});

afterEach(() => {
  stop();
  killAllTimelines();
  clearRefs();
  vi.unstubAllGlobals();
});

// ========================================
// TESTS
// ========================================

describe('startSceneWash (revisions Task 13)', () => {
  it("covers on 'covering': a 'ui' timeline 'scene-wash' takes the wash to opaque over 0.5 s, and its completion sets 'covered'", async () => {
    const change = vi.fn();
    requestWorldChange(change);
    expect(wash()).toBe('covering');
    expect(getTimeline(SCENE_WASH_TIMELINE)).toBeDefined();
    expect(getTimelineScope(SCENE_WASH_TIMELINE)).toBe('ui');
    const cover = last();
    expect(cover.tweens).toEqual([{ target: el, vars: expect.objectContaining({ opacity: 1, duration: SCENE_WASH_SECONDS }) }]);
    expect(SCENE_WASH_SECONDS).toBe(0.5);
    expect(change).not.toHaveBeenCalled();
    await finish(cover);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("uncovers after the change: on the next frame a second timeline takes the wash to transparent over 0.5 s, and its completion sets 'clear'", async () => {
    requestWorldChange(vi.fn());
    await finish(last());
    expect(wash()).toBe('uncovering');
    // Not in the frame the change ran in: a tween made then would be stamped before the rebuild and jump ahead after it.
    expect(recorded.timelines).toHaveLength(1);
    tick();
    expect(recorded.timelines).toHaveLength(2);
    const uncover = last();
    expect(uncover.tweens).toEqual([{ target: el, vars: expect.objectContaining({ opacity: 0, duration: SCENE_WASH_SECONDS }) }]);
    await finish(uncover);
    expect(wash()).toBe('clear');
    expect(recorded.ticker.listeners).toHaveLength(0);
  });

  it('one request is one cover and one uncover: two timelines, not more', async () => {
    requestWorldChange(vi.fn());
    await finish(await coverAndStartUncover());
    tick();
    expect(recorded.timelines).toHaveLength(2);
  });

  it('a request before the fade-out has started cancels it: the cover holds for the new change, no uncover on the next frame', async () => {
    requestWorldChange(vi.fn());
    await finish(last());
    const second = vi.fn();
    requestWorldChange(second);
    expect(wash()).toBe('covering');
    tick();
    expect(recorded.timelines).toHaveLength(2);
    expect(last().tweens[0].vars).toEqual(expect.objectContaining({ opacity: 1 }));
    await finish(last());
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('the stop removes a fade-out still waiting for its frame', async () => {
    requestWorldChange(vi.fn());
    await finish(last());
    stop();
    tick();
    expect(recorded.timelines).toHaveLength(1);
    expect(recorded.ticker.listeners).toHaveLength(0);
    stop = () => undefined;
  });

  it("paints the cover in the sea's own colours at the hour it starts, the water column's two stops", async () => {
    useUIStore.setState({ activeLocaleLocalTime: 0 });
    requestWorldChange(vi.fn());
    const night = waterColumnColors(0);
    expect(recorded.sets.at(-1)).toEqual({ target: el, vars: expect.objectContaining({ backgroundImage: `linear-gradient(${night.top}, ${night.bottom})` }) });
    await finish(await coverAndStartUncover());
    useUIStore.setState({ activeLocaleLocalTime: 12 });
    requestWorldChange(vi.fn());
    const noon = waterColumnColors(12);
    expect(recorded.sets.at(-1)).toEqual({ target: el, vars: expect.objectContaining({ backgroundImage: `linear-gradient(${noon.top}, ${noon.bottom})` }) });
    expect(noon.top).not.toBe(night.top);
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R21: a request while the wash is still fading out covers again from where
  // it is, in the colours it already shows: repainting there would swap the old hour's sea for the new world's under a
  // half-opaque wash. Only a cover that starts from clear is painted.
  describe('the colour holds through a re-cover (review R21)', () => {
    const paints = () => recorded.sets.filter((s) => 'backgroundImage' in s.vars);

    it('covering, covered, uncovering, covering again paints the gradient once', async () => {
      useUIStore.setState({ activeLocaleLocalTime: 0 });
      requestWorldChange(vi.fn());
      await coverAndStartUncover();
      expect(wash()).toBe('uncovering');
      useUIStore.setState({ activeLocaleLocalTime: 12 }); // the new world's hour, which the re-cover must not show
      requestWorldChange(vi.fn());
      expect(wash()).toBe('covering');
      const night = waterColumnColors(0);
      expect(paints()).toEqual([{ target: el, vars: expect.objectContaining({ backgroundImage: `linear-gradient(${night.top}, ${night.bottom})` }) }]);
    });

    it('a re-cover before the fade-out has started paints nothing either', async () => {
      requestWorldChange(vi.fn());
      await finish(last());
      expect(wash()).toBe('uncovering');
      requestWorldChange(vi.fn());
      expect(paints()).toHaveLength(1);
    });

    it('a cover from clear is painted every time: after a whole cycle, and after a reduced-motion snap to clear', async () => {
      requestWorldChange(vi.fn());
      await finish(await coverAndStartUncover());
      expect(wash()).toBe('clear');
      requestWorldChange(vi.fn());
      expect(paints()).toHaveLength(2);
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion: reduce') }));
      requestWorldChange(vi.fn());
      expect(wash()).toBe('clear');
      vi.stubGlobal('matchMedia', () => ({ matches: false }));
      requestWorldChange(vi.fn());
      expect(paints()).toHaveLength(3);
    });
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R26, item 5: an opacity tween on a wash with no layer of its own for it
  // re-rasters the whole wash in every frame of both fades (measured on a desk, audio running: about 0.9 of a screen per
  // frame). From the cover's first frame to 'clear' it asks for its own compositor layer, so both fades are the
  // compositor's alone.
  describe('the wash has a layer of its own while it fades (review R26)', () => {
    /** The wash's will-change as the sets so far leave it: the last one set, else the initial `auto`. */
    const layer = () => {
      const hints = recorded.sets.filter((s) => s.target === el && 'willChange' in s.vars);
      return hints.length ? hints[hints.length - 1].vars.willChange : 'auto';
    };

    it('asks for it as the cover starts, before the fade has drawn a frame', () => {
      expect(layer()).toBe('auto');
      requestWorldChange(vi.fn());
      expect(wash()).toBe('covering');
      expect(layer()).toBe('opacity');
    });

    it("holds it while covered, through the uncover and a re-cover, and lets it go at 'clear'", async () => {
      requestWorldChange(vi.fn());
      await finish(last());
      expect(wash()).toBe('uncovering');
      expect(layer()).toBe('opacity');
      tick();
      expect(layer()).toBe('opacity');
      requestWorldChange(vi.fn());
      expect(wash()).toBe('covering');
      expect(layer()).toBe('opacity');
      await finish(await coverAndStartUncover());
      expect(wash()).toBe('clear');
      expect(layer()).toBe('auto');
    });

    it("lets it go when 'clear' is set mid-cover (a reduced-motion request)", () => {
      requestWorldChange(vi.fn());
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion: reduce') }));
      requestWorldChange(vi.fn());
      expect(wash()).toBe('clear');
      expect(layer()).toBe('auto');
    });

    it('asks again on the next cover', async () => {
      requestWorldChange(vi.fn());
      await finish(await coverAndStartUncover());
      expect(layer()).toBe('auto');
      requestWorldChange(vi.fn());
      expect(layer()).toBe('opacity');
    });
  });

  it('a new state kills the running tween first: a request while uncovering kills the fade-out and covers again', async () => {
    requestWorldChange(vi.fn());
    const uncover = await coverAndStartUncover();
    const second = vi.fn();
    requestWorldChange(second);
    expect(uncover.kill).toHaveBeenCalled();
    expect(wash()).toBe('covering');
    expect(last()).not.toBe(uncover);
    expect(last().tweens[0].vars).toEqual(expect.objectContaining({ opacity: 1 }));
    await finish(last());
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a 'clear' set mid-cover (a reduced-motion request) snaps the wash transparent and kills its tween", () => {
    requestWorldChange(vi.fn());
    const cover = last();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion: reduce') }));
    requestWorldChange(vi.fn());
    expect(wash()).toBe('clear');
    expect(cover.kill).toHaveBeenCalled();
    expect(recorded.sets.at(-1)).toEqual({ target: el, vars: expect.objectContaining({ opacity: 0 }) });
    expect(getTimeline(SCENE_WASH_TIMELINE)).toBeUndefined();
  });

  it('touches no audio through a whole cycle: the callbacks only set the store', async () => {
    requestWorldChange(vi.fn());
    await finish(await coverAndStartUncover());
    expect(wash()).toBe('clear');
    expect(recorded.audio).toEqual([]);
  });

  it('the stop it returns unsubscribes, kills the timeline and lets requests run at once again', () => {
    requestWorldChange(vi.fn());
    const cover = last();
    stop();
    expect(cover.kill).toHaveBeenCalled();
    expect(getTimeline(SCENE_WASH_TIMELINE)).toBeUndefined();
    const count = recorded.timelines.length;
    const change = vi.fn();
    requestWorldChange(change);
    expect(change).toHaveBeenCalledTimes(1);
    expect(recorded.timelines).toHaveLength(count);
    stop = () => undefined;
  });

  it('without the wash element registered there is nothing to start: a no-op stop, and requests run at once', () => {
    stop();
    clearRefs();
    stop = startSceneWash();
    const change = vi.fn();
    requestWorldChange(change);
    expect(change).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('clear');
    expect(recorded.timelines).toHaveLength(0);
  });
});
