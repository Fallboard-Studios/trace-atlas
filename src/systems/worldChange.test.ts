// ========================================
// IMPORTS
// ========================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attachSceneWash, cancelWorldChange, requestWorldChange } from './worldChange';
import { useUIStore, type SceneWash } from '../stores/uiStore';

/*
 * docs/tasks/OFF_SCREEN_REVISIONS.md Task 12 (Crawford's note 7 and his answer 4): a world change a user gesture asks for
 * waits under the scene wash. The request stores the change and sets 'covering'; the wash (animation/sceneWash.ts, Task 13)
 * sets 'covered' when it is opaque; that runs the change once and sets 'uncovering'; the wash fades and sets 'clear'.
 * Last request wins. Reduced motion, or no wash mounted to cover anything, runs the change at once. The store alone drives
 * this file: nothing here is GSAP or audio.
 */

// ========================================
// HELPERS
// ========================================

const wash = (): SceneWash => useUIStore.getState().sceneWash;
const setWash = (state: SceneWash) => useUIStore.getState().setSceneWash(state);
const reduceMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('prefers-reduced-motion: reduce') }));
/** docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R12: the cover's change runs on a resolved promise queued when 'covered' is
 *  set, off the call that set it (GSAP's onComplete, in the app). Awaiting one more resolved promise lets it run. */
const handOff = () => Promise.resolve();

beforeEach(() => {
  useUIStore.setState({ sceneWash: 'clear' });
  reduceMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ========================================
// TESTS
// ========================================

describe('uiStore.sceneWash', () => {
  it("defaults to 'clear' and holds 'covering', 'uncovering' and 'clear' as JSON", () => {
    expect(useUIStore.getInitialState().sceneWash).toBe('clear');
    for (const state of ['covering', 'uncovering', 'clear'] as const) {
      setWash(state);
      expect(wash()).toBe(state);
      expect(JSON.parse(JSON.stringify({ sceneWash: wash() }))).toEqual({ sceneWash: state });
    }
  });

  it("passes on from 'covered' to 'uncovering': the request module, loaded here, runs the cover's change on it", async () => {
    setWash('covered');
    await handOff();
    expect(wash()).toBe('uncovering');
  });
});

describe('requestWorldChange, with a wash mounted', () => {
  let detach: () => void;
  beforeEach(() => {
    detach = attachSceneWash();
  });
  afterEach(() => detach());

  it("sets 'covering' and does not run the change yet", () => {
    const change = vi.fn();
    requestWorldChange(change);
    expect(wash()).toBe('covering');
    expect(change).not.toHaveBeenCalled();
  });

  it("runs the change once when the wash reaches 'covered', then sets 'uncovering'", async () => {
    const change = vi.fn(() => expect(wash()).toBe('covered'));
    requestWorldChange(change);
    setWash('covered');
    await handOff();
    expect(change).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('uncovering');
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R12: in the app 'covered' is set by the cover timeline's onComplete, which
  // GSAP calls mid-tick; a whole world rebuilt in there would run on GSAP's call stack, and a throw would unwind through
  // its ticker. The change waits for the call that landed the cover to return.
  it("runs the change after the call that set 'covered' has returned, not inside it", async () => {
    const change = vi.fn();
    requestWorldChange(change);
    setWash('covered');
    expect(change).not.toHaveBeenCalled();
    expect(wash()).toBe('covered');
    await handOff();
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('a second request before the cover lands replaces the first: only the second runs', async () => {
    const first = vi.fn();
    const second = vi.fn();
    requestWorldChange(first);
    requestWorldChange(second);
    expect(wash()).toBe('covering');
    setWash('covered');
    await handOff();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('a request after the cover lands but before its change has run replaces it too: the newest runs under this cover', async () => {
    const first = vi.fn();
    const second = vi.fn();
    requestWorldChange(first);
    setWash('covered');
    requestWorldChange(second);
    expect(wash()).toBe('covered');
    await handOff();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('uncovering');
  });

  it("exactly one run per cover: 'uncovering' then 'clear' runs nothing more, nor does a second 'covered' with no request", async () => {
    const change = vi.fn();
    requestWorldChange(change);
    setWash('covered');
    await handOff();
    setWash('clear');
    expect(change).toHaveBeenCalledTimes(1);
    setWash('covered');
    await handOff();
    expect(change).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('uncovering');
  });

  it("'uncovering' to 'clear' runs nothing", () => {
    const change = vi.fn();
    setWash('uncovering');
    setWash('clear');
    expect(change).not.toHaveBeenCalled();
    expect(wash()).toBe('clear');
  });

  it("a request while the wash is uncovering covers again, and its change runs at the next 'covered'", async () => {
    const first = vi.fn();
    const second = vi.fn();
    requestWorldChange(first);
    setWash('covered');
    await handOff();
    expect(wash()).toBe('uncovering');
    requestWorldChange(second);
    expect(wash()).toBe('covering');
    expect(second).not.toHaveBeenCalled();
    setWash('covered');
    await handOff();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('a request made inside the running change runs before the wash uncovers', async () => {
    const inner = vi.fn();
    requestWorldChange(() => requestWorldChange(inner));
    setWash('covered');
    await handOff();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('uncovering');
  });

  it('a change that throws still uncovers, so the wash never sticks over the world; the throw is logged, not thrown at the cover', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = new Error('boom');
    requestWorldChange(() => {
      throw boom;
    });
    expect(() => setWash('covered')).not.toThrow();
    await handOff();
    expect(wash()).toBe('uncovering');
    expect(logged).toHaveBeenCalledWith(expect.any(String), boom);
    logged.mockRestore();
  });

  // The hand-off opens a window between the cover landing and its change running. Anything that lets the cover go in
  // that window - the wash unmounting, a reduced-motion request - has already run or dropped the change and cleared the
  // state; the hand-off then finds the state no longer 'covered' and leaves it alone.
  it("the wash unmounting after the cover lands runs the change at once, and the hand-off leaves the state 'clear'", async () => {
    const change = vi.fn();
    requestWorldChange(change);
    setWash('covered');
    detach();
    expect(change).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('clear');
    await handOff();
    expect(change).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('clear');
  });

  it("a reduced-motion request after the cover lands runs at once, and the hand-off runs nothing and leaves 'clear'", async () => {
    const waiting = vi.fn();
    const now = vi.fn();
    requestWorldChange(waiting);
    setWash('covered');
    reduceMotion(true);
    requestWorldChange(now);
    expect(now).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('clear');
    await handOff();
    expect(waiting).not.toHaveBeenCalled();
    expect(now).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('clear');
  });
});

// docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R3: picking Current while a pick waits cancels it. The cover is already on
// its way, so it still lands and lifts; it just has nothing to run.
describe('cancelWorldChange, with a wash mounted', () => {
  let detach: () => void;
  beforeEach(() => {
    detach = attachSceneWash();
  });
  afterEach(() => detach());

  it("drops the pending change: the cover still lands and lifts, and nothing runs", async () => {
    const change = vi.fn();
    requestWorldChange(change);
    cancelWorldChange();
    expect(wash()).toBe('covering');
    setWash('covered');
    await handOff();
    expect(change).not.toHaveBeenCalled();
    expect(wash()).toBe('uncovering');
    setWash('clear');
    expect(wash()).toBe('clear');
    expect(change).not.toHaveBeenCalled();
  });

  it('with nothing pending does nothing: the state stands, clear or uncovering', async () => {
    cancelWorldChange();
    expect(wash()).toBe('clear');
    requestWorldChange(vi.fn());
    setWash('covered');
    await handOff();
    expect(wash()).toBe('uncovering');
    cancelWorldChange();
    expect(wash()).toBe('uncovering');
  });

  it('a request after a cancel runs at the next cover, the cancelled one never', async () => {
    const cancelled = vi.fn();
    const next = vi.fn();
    requestWorldChange(cancelled);
    cancelWorldChange();
    requestWorldChange(next);
    setWash('covered');
    await handOff();
    expect(cancelled).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing for the wash to run if it unmounts mid-cover', () => {
    const change = vi.fn();
    requestWorldChange(change);
    cancelWorldChange();
    detach();
    expect(change).not.toHaveBeenCalled();
    expect(wash()).toBe('clear');
  });
});

describe('requestWorldChange, with nothing to cover the change', () => {
  it("runs the change at once under prefers-reduced-motion: reduce, and the state stays 'clear'", () => {
    reduceMotion(true);
    const detach = attachSceneWash();
    const change = vi.fn();
    requestWorldChange(change);
    expect(change).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('clear');
    detach();
  });

  it('runs the change at once when no wash is mounted (nothing would ever cover it), the state untouched', () => {
    const change = vi.fn();
    requestWorldChange(change);
    expect(change).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('clear');
  });

  it('a reduced-motion request replaces a pending one: the pending change never runs, the wash clears', async () => {
    const detach = attachSceneWash();
    const pending = vi.fn();
    requestWorldChange(pending);
    expect(wash()).toBe('covering');
    reduceMotion(true);
    const now = vi.fn();
    requestWorldChange(now);
    expect(now).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('clear');
    setWash('covered');
    await handOff();
    expect(pending).not.toHaveBeenCalled();
    detach();
  });

  it("the wash unmounting mid-cover runs the pending change at once and clears, rather than leaving it waiting", () => {
    const detach = attachSceneWash();
    const change = vi.fn();
    requestWorldChange(change);
    detach();
    expect(change).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('clear');
  });
});
