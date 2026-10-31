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
const recorded = vi.hoisted(() => ({
  timelines: [] as RecordedTimeline[],
  sets: [] as { target: unknown; vars: Record<string, unknown> }[],
  audio: [] as string[],
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
  const mocked = {
    timeline,
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
const finish = (timeline: RecordedTimeline) => timeline.onComplete?.();
let el: HTMLDivElement;
let stop: () => void;

beforeEach(() => {
  recorded.timelines.length = 0;
  recorded.sets.length = 0;
  recorded.audio.length = 0;
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
  it("covers on 'covering': a 'ui' timeline 'scene-wash' takes the wash to opaque over 0.5 s, and its completion sets 'covered'", () => {
    const change = vi.fn();
    requestWorldChange(change);
    expect(wash()).toBe('covering');
    expect(getTimeline(SCENE_WASH_TIMELINE)).toBeDefined();
    expect(getTimelineScope(SCENE_WASH_TIMELINE)).toBe('ui');
    const cover = last();
    expect(cover.tweens).toEqual([{ target: el, vars: expect.objectContaining({ opacity: 1, duration: SCENE_WASH_SECONDS }) }]);
    expect(SCENE_WASH_SECONDS).toBe(0.5);
    expect(change).not.toHaveBeenCalled();
    finish(cover);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("uncovers after the change: a second timeline takes the wash to transparent over 0.5 s, and its completion sets 'clear'", () => {
    requestWorldChange(vi.fn());
    finish(last());
    expect(wash()).toBe('uncovering');
    const uncover = last();
    expect(uncover.tweens).toEqual([{ target: el, vars: expect.objectContaining({ opacity: 0, duration: SCENE_WASH_SECONDS }) }]);
    finish(uncover);
    expect(wash()).toBe('clear');
  });

  it('one request is one cover and one uncover: two timelines, not more', () => {
    requestWorldChange(vi.fn());
    finish(last());
    finish(last());
    expect(recorded.timelines).toHaveLength(2);
  });

  it("paints the cover in the sea's own colours at the hour it starts, the water column's two stops", () => {
    useUIStore.setState({ activeLocaleLocalTime: 0 });
    requestWorldChange(vi.fn());
    const night = waterColumnColors(0);
    expect(recorded.sets.at(-1)).toEqual({ target: el, vars: { backgroundImage: `linear-gradient(${night.top}, ${night.bottom})` } });
    finish(last());
    finish(last());
    useUIStore.setState({ activeLocaleLocalTime: 12 });
    requestWorldChange(vi.fn());
    const noon = waterColumnColors(12);
    expect(recorded.sets.at(-1)).toEqual({ target: el, vars: { backgroundImage: `linear-gradient(${noon.top}, ${noon.bottom})` } });
    expect(noon.top).not.toBe(night.top);
  });

  it('a new state kills the running tween first: a request while uncovering kills the fade-out and covers again', () => {
    requestWorldChange(vi.fn());
    finish(last());
    const uncover = last();
    const second = vi.fn();
    requestWorldChange(second);
    expect(uncover.kill).toHaveBeenCalled();
    expect(wash()).toBe('covering');
    expect(last()).not.toBe(uncover);
    expect(last().tweens[0].vars).toEqual(expect.objectContaining({ opacity: 1 }));
    finish(last());
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a 'clear' set mid-cover (a reduced-motion request) snaps the wash transparent and kills its tween", () => {
    requestWorldChange(vi.fn());
    const cover = last();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion: reduce') }));
    requestWorldChange(vi.fn());
    expect(wash()).toBe('clear');
    expect(cover.kill).toHaveBeenCalled();
    expect(recorded.sets.at(-1)).toEqual({ target: el, vars: { opacity: 0 } });
    expect(getTimeline(SCENE_WASH_TIMELINE)).toBeUndefined();
  });

  it('touches no audio through a whole cycle: the callbacks only set the store', () => {
    requestWorldChange(vi.fn());
    finish(last());
    finish(last());
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
