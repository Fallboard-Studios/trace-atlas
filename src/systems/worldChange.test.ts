// ========================================
// IMPORTS
// ========================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attachSceneWash, requestWorldChange } from './worldChange';
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

  it("passes straight on from 'covered' to 'uncovering': the request module, loaded here, runs the cover's change on it", () => {
    setWash('covered');
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

  it("runs the change once when the wash reaches 'covered', then sets 'uncovering'", () => {
    const change = vi.fn(() => expect(wash()).toBe('covered'));
    requestWorldChange(change);
    setWash('covered');
    expect(change).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('uncovering');
  });

  it('a second request before the cover lands replaces the first: only the second runs', () => {
    const first = vi.fn();
    const second = vi.fn();
    requestWorldChange(first);
    requestWorldChange(second);
    expect(wash()).toBe('covering');
    setWash('covered');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("exactly one run per cover: 'uncovering' then 'clear' runs nothing more, nor does a second 'covered' with no request", () => {
    const change = vi.fn();
    requestWorldChange(change);
    setWash('covered');
    setWash('clear');
    expect(change).toHaveBeenCalledTimes(1);
    setWash('covered');
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

  it("a request while the wash is uncovering covers again, and its change runs at the next 'covered'", () => {
    const first = vi.fn();
    const second = vi.fn();
    requestWorldChange(first);
    setWash('covered');
    expect(wash()).toBe('uncovering');
    requestWorldChange(second);
    expect(wash()).toBe('covering');
    expect(second).not.toHaveBeenCalled();
    setWash('covered');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('a request made inside the running change runs before the wash uncovers', () => {
    const inner = vi.fn();
    requestWorldChange(() => requestWorldChange(inner));
    setWash('covered');
    expect(inner).toHaveBeenCalledTimes(1);
    expect(wash()).toBe('uncovering');
  });

  it('a change that throws still uncovers, so the wash never sticks over the world', () => {
    requestWorldChange(() => {
      throw new Error('boom');
    });
    expect(() => setWash('covered')).toThrow('boom');
    expect(wash()).toBe('uncovering');
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

  it('a reduced-motion request replaces a pending one: the pending change never runs, the wash clears', () => {
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
