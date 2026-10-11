import { describe, it, expect } from 'vitest';
import { act, render } from '@testing-library/react';
import { create } from 'zustand';

import { useStableSelector } from './useStableSelector';

interface Item {
  id: string;
  tick: number;
}

const useStore = create<{ items: Item[]; setItems: (items: Item[]) => void }>((set) => ({
  items: [{ id: 'a', tick: 0 }],
  setItems: (items) => set({ items }),
}));

const idsEqual = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

function Probe({ onRender }: { onRender: (ids: string[]) => void }) {
  const ids = useStableSelector(useStore, (s) => s.items.map((item) => item.id), idsEqual);
  onRender(ids);
  return null;
}

describe('useStableSelector', () => {
  it('returns the same reference, and does not re-render, while the projection is unchanged', () => {
    useStore.setState({ items: [{ id: 'a', tick: 0 }] });
    const seen: string[][] = [];
    render(<Probe onRender={(ids) => seen.push(ids)} />);

    // The store's array is replaced (a battery tick) but the ids are the same.
    act(() => useStore.getState().setItems([{ id: 'a', tick: 1 }]));
    act(() => useStore.getState().setItems([{ id: 'a', tick: 2 }]));

    expect(seen).toHaveLength(1);
  });

  it('re-renders with the new projection when it differs', () => {
    useStore.setState({ items: [{ id: 'a', tick: 0 }] });
    const seen: string[][] = [];
    render(<Probe onRender={(ids) => seen.push(ids)} />);

    act(() => useStore.getState().setItems([{ id: 'a', tick: 0 }, { id: 'b', tick: 0 }]));

    expect(seen.at(-1)).toEqual(['a', 'b']);
    expect(seen).toHaveLength(2);
  });
});
