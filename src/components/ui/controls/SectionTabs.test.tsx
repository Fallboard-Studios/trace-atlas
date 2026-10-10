import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { useEffect, useState, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

import { SectionTabs, type SectionTabItem } from './SectionTabs';
import { labels } from '@/content';
import { getTraitColorStyle } from '@/utils/traitColors';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 11 (spec §1.3, Assumption 7): Radix Tabs whose triggers are
 * CabinetBoxes, one panel mounted at a time, an optional nested sub-tab row. CabinetBox is stubbed to
 * expose `popped` and its timeline key.
 */

vi.mock('./CabinetBox', () => ({
  CabinetBox: ({ popped, timelineKey, children }: { popped: boolean | number; timelineKey: string; children?: ReactNode }) => (
    <div data-testid="cabinet-box" data-popped={String(popped)} data-timeline-key={timelineKey}>
      {children}
    </div>
  ),
}));

type Section = 'pacing' | 'lfoBank' | 'eqFilters';

const panel = (name: string) => () => <p>{`${name} panel`}</p>;

const ITEMS: readonly SectionTabItem<Section>[] = [
  { id: 'pacing', content: 'fleet.pacing', trait: 'timeSpace', render: panel('pacing') },
  { id: 'lfoBank', content: 'fleet.lfoBank', trait: 'composition', render: panel('lfoBank') },
  { id: 'eqFilters', content: 'fleet.eqFilters', trait: 'spectral', render: panel('eqFilters') },
];

const name = (key: SectionTabItem<Section>['content']) => labels(key).humanLabel;

/** A controlled host — the store in miniature. */
function Host({ items = ITEMS, initial = 'pacing', onChange }: { items?: readonly SectionTabItem<Section>[]; initial?: Section; onChange?: (id: Section) => void }) {
  const [value, setValue] = useState<Section>(initial);
  return (
    <SectionTabs
      label="Fleet Params sections"
      items={items}
      value={value}
      onValueChange={(id) => { onChange?.(id); setValue(id); }}
    />
  );
}

const tab = (key: SectionTabItem<Section>['content']) => screen.getByRole('tab', { name: name(key) });
const poppedOf = (el: HTMLElement) => within(el).getByTestId('cabinet-box').getAttribute('data-popped');
/** Radix moves roving focus in a setTimeout after an arrow key. */
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe('SectionTabs', () => {
  describe('roles', () => {
    it('is a named tablist with one tab per item, the active one selected, and one tabpanel labelled by it', () => {
      render(<Host />);
      const list = screen.getByRole('tablist', { name: 'Fleet Params sections' });
      const tabs = within(list).getAllByRole('tab');
      expect(tabs.map((t) => t.textContent)).toEqual([name('fleet.pacing'), name('fleet.lfoBank'), name('fleet.eqFilters')]);
      expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);

      const panels = screen.getAllByRole('tabpanel');
      expect(panels).toHaveLength(1);
      expect(panels[0].getAttribute('aria-labelledby')).toBe(tabs[0].id);
      expect(tabs[0].getAttribute('aria-controls')).toBe(panels[0].id);
    });

    it('renders nothing for an empty item list', () => {
      const { container } = render(<SectionTabs label="Empty" items={[]} value={'pacing' as Section} onValueChange={() => {}} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('one panel mounted at a time', () => {
    it("only the active item's render() runs, and only its output is in the DOM", () => {
      const renders = { pacing: vi.fn(panel('pacing')), lfoBank: vi.fn(panel('lfoBank')), eqFilters: vi.fn(panel('eqFilters')) };
      const items = ITEMS.map((item) => ({ ...item, render: renders[item.id] }));
      render(<Host items={items} />);

      expect(screen.getByText('pacing panel')).toBeTruthy();
      expect(screen.queryByText('lfoBank panel')).toBeNull();
      expect(screen.queryByText('eqFilters panel')).toBeNull();
      expect(renders.lfoBank).not.toHaveBeenCalled();
      expect(renders.eqFilters).not.toHaveBeenCalled();
    });

    it('switching unmounts the old section and mounts the new one', () => {
      const lifecycle: string[] = [];
      function Tracked({ id }: { id: string }) {
        useEffect(() => {
          lifecycle.push(`mount ${id}`);
          return () => { lifecycle.push(`unmount ${id}`); };
        }, [id]);
        return <p>{`${id} panel`}</p>;
      }
      const items = ITEMS.map((item) => ({ ...item, render: () => <Tracked id={item.id} /> }));
      render(<Host items={items} />);
      expect(lifecycle).toEqual(['mount pacing']);

      fireEvent.mouseDown(tab('fleet.lfoBank'));

      expect(lifecycle).toEqual(['mount pacing', 'unmount pacing', 'mount lfoBank']);
      expect(screen.queryByText('pacing panel')).toBeNull();
      expect(screen.getByText('lfoBank panel')).toBeTruthy();
    });

    it('is controlled — a pick reports its id and the panel only changes when the value does', () => {
      const onValueChange = vi.fn();
      render(<SectionTabs label="Fixed" items={ITEMS} value="pacing" onValueChange={onValueChange} />);

      fireEvent.mouseDown(tab('fleet.eqFilters'));

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith('eqFilters');
      expect(screen.getByText('pacing panel')).toBeTruthy();
      expect(screen.queryByText('eqFilters panel')).toBeNull();
    });

    it('a value no item has falls back to the first item, without reporting a change', async () => {
      const onValueChange = vi.fn();
      render(<SectionTabs label="Stale" items={ITEMS} value={'gone' as Section} onValueChange={onValueChange} />);

      expect(tab('fleet.pacing').getAttribute('aria-selected')).toBe('true');
      expect(screen.getByText('pacing panel')).toBeTruthy();
      expect(poppedOf(tab('fleet.pacing'))).toBe('true');
      await flush(); // a change reported from an effect or a microtask would land here
      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe('keyboard', () => {
    it('arrow keys move the active tab, wrapping at both ends', async () => {
      const onChange = vi.fn();
      render(<Host onChange={onChange} />);
      act(() => tab('fleet.pacing').focus());

      fireEvent.keyDown(tab('fleet.pacing'), { key: 'ArrowRight' });
      await flush();
      expect(document.activeElement).toBe(tab('fleet.lfoBank'));
      expect(tab('fleet.lfoBank').getAttribute('aria-selected')).toBe('true');
      expect(screen.getByText('lfoBank panel')).toBeTruthy();

      fireEvent.keyDown(tab('fleet.lfoBank'), { key: 'ArrowLeft' });
      await flush();
      fireEvent.keyDown(tab('fleet.pacing'), { key: 'ArrowLeft' });
      await flush();
      expect(document.activeElement).toBe(tab('fleet.eqFilters'));
      expect(onChange).toHaveBeenLastCalledWith('eqFilters');
    });

    it('Home and End jump to the first and last tab', async () => {
      render(<Host initial="lfoBank" />);
      act(() => tab('fleet.lfoBank').focus());

      fireEvent.keyDown(tab('fleet.lfoBank'), { key: 'End' });
      await flush();
      expect(document.activeElement).toBe(tab('fleet.eqFilters'));
      expect(screen.getByText('eqFilters panel')).toBeTruthy();

      fireEvent.keyDown(tab('fleet.eqFilters'), { key: 'Home' });
      await flush();
      expect(document.activeElement).toBe(tab('fleet.pacing'));
      expect(screen.getByText('pacing panel')).toBeTruthy();
    });

    it('the row is one tab stop, and tabbing into it lands on the active tab', () => {
      render(<Host initial="lfoBank" />);
      const list = screen.getByRole('tablist');
      expect(list.tabIndex).toBe(0);
      expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([-1, -1, -1]);

      act(() => list.focus());

      expect(document.activeElement).toBe(tab('fleet.lfoBank'));
    });
  });

  describe('the cabinet triggers', () => {
    it('the active trigger is popped and the rest sit at rest', () => {
      render(<Host initial="lfoBank" />);
      expect(poppedOf(tab('fleet.lfoBank'))).toBe('true');
      expect(poppedOf(tab('fleet.pacing'))).toBe(String(CABINET_REST_POP));
      expect(poppedOf(tab('fleet.eqFilters'))).toBe(String(CABINET_REST_POP));

      fireEvent.mouseDown(tab('fleet.eqFilters'));
      expect(poppedOf(tab('fleet.eqFilters'))).toBe('true');
      expect(poppedOf(tab('fleet.lfoBank'))).toBe(String(CABINET_REST_POP));
    });

    it('a resting trigger pops while hovered and returns to rest after; the active one stays popped', () => {
      render(<Host />);
      fireEvent.mouseEnter(tab('fleet.eqFilters'));
      expect(poppedOf(tab('fleet.eqFilters'))).toBe('true');
      fireEvent.mouseLeave(tab('fleet.eqFilters'));
      expect(poppedOf(tab('fleet.eqFilters'))).toBe(String(CABINET_REST_POP));

      fireEvent.mouseEnter(tab('fleet.pacing'));
      fireEvent.mouseLeave(tab('fleet.pacing'));
      expect(poppedOf(tab('fleet.pacing'))).toBe('true');
    });

    it("each trigger carries its own section's trait colour", () => {
      render(<Host />);
      for (const item of ITEMS) {
        const expected = getTraitColorStyle(item.trait) as Record<string, string>;
        expect(tab(item.content).style.getPropertyValue('--color-accent')).toBe(expected['--color-accent']);
      }
    });

    it('a label never changes between rest and active, so flipping never resizes the box', () => {
      render(<Host />);
      const faces = () => screen.getAllByRole('tab').map((t) => within(t).getByTestId('cabinet-box').innerHTML);
      const before = faces();
      fireEvent.mouseDown(tab('fleet.eqFilters'));
      expect(faces()).toEqual(before);
    });

    it('every trigger has its own timeline key, unique across two rows with the same ids', () => {
      render(
        <>
          <SectionTabs label="One" items={ITEMS} value="pacing" onValueChange={() => {}} />
          <SectionTabs label="Two" items={ITEMS} value="pacing" onValueChange={() => {}} />
        </>,
      );
      const keys = screen.getAllByTestId('cabinet-box').map((b) => b.getAttribute('data-timeline-key'));
      expect(keys).toHaveLength(6);
      expect(new Set(keys).size).toBe(6);
      expect(keys.every((k) => k?.startsWith('section-tab-'))).toBe(true);
    });
  });

  describe('the sub-tab row', () => {
    type Lane = 'laneA' | 'laneB';
    const LANES: readonly SectionTabItem<Lane>[] = [
      { id: 'laneA', content: 'fleet.lfoBank.laneA', trait: 'composition', render: panel('laneA') },
      { id: 'laneB', content: 'fleet.lfoBank.laneB', trait: 'composition', render: panel('laneB') },
    ];

    function Nested() {
      const [section, setSection] = useState<Section>('lfoBank');
      const [lane, setLane] = useState<Lane>('laneA');
      const items = ITEMS.map((item) =>
        item.id === 'lfoBank'
          ? { ...item, render: () => <SectionTabs variant="sub" label="LFO Bank lanes" items={LANES} value={lane} onValueChange={setLane} /> }
          : item,
      );
      return <SectionTabs label="Fleet Params sections" items={items} value={section} onValueChange={setSection} />;
    }

    it('nests as a second, smaller tablist inside the active section', () => {
      render(<Nested />);
      const outer = screen.getByRole('tablist', { name: 'Fleet Params sections' });
      const sub = screen.getByRole('tablist', { name: 'LFO Bank lanes' });
      expect(outer.closest('.section-tabs')?.classList.contains('section-tabs--sub')).toBe(false);
      expect(sub.closest('.section-tabs')?.classList.contains('section-tabs--sub')).toBe(true);
      expect(screen.getByText('laneA panel')).toBeTruthy();
    });

    it('arrow keys in the sub row move only the sub row', async () => {
      render(<Nested />);
      const laneA = screen.getByRole('tab', { name: labels('fleet.lfoBank.laneA').humanLabel });
      act(() => laneA.focus());

      fireEvent.keyDown(laneA, { key: 'ArrowRight' });
      await flush();

      expect(screen.getByText('laneB panel')).toBeTruthy();
      expect(tab('fleet.lfoBank').getAttribute('aria-selected')).toBe('true');
    });

    it('leaving the section unmounts its sub row with it', () => {
      render(<Nested />);
      fireEvent.mouseDown(tab('fleet.pacing'));
      expect(screen.queryByRole('tablist', { name: 'LFO Bank lanes' })).toBeNull();
      expect(screen.getByText('pacing panel')).toBeTruthy();
    });
  });

  // docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md — every cabinetry primitive is React.memo-wrapped.
  it('is a React.memo-wrapped component', () => {
    expect((SectionTabs as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});

// jsdom computes no layout: the never-resize-on-flip contract is pinned at the source.
describe('SectionTabs.css', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'SectionTabs.css'), 'utf-8').replace(/\r\n/g, '\n');
  const SIZE_PROPERTIES = /(^|[\s;{])(font(-size|-weight|-family)?|letter-spacing|padding[\w-]*|margin[\w-]*|border(-\w+)?-width|border|width|height|min-width|min-height|max-width|line-height)\s*:/;

  it('no rule keyed on the active state changes anything that sizes the box', () => {
    const activeRules = [...css.matchAll(/([^{}]*\[data-state=['"]?active['"]?\][^{}]*)\{([^}]*)\}/g)];
    for (const [, selector, body] of activeRules) {
      expect(SIZE_PROPERTIES.test(body), `${selector.trim()} changes size: ${body.trim()}`).toBe(false);
    }
  });

  it('keeps a label on one line, and lets a row too wide for its pane scroll rather than wrap or clip', () => {
    expect(css).toMatch(/\.section-tabs__trigger\s*\{[^}]*white-space:\s*nowrap;/);
    expect(css).toMatch(/\.section-tabs__list\s*\{[^}]*overflow-x:\s*auto;/);
  });
});
