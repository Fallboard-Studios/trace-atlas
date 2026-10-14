import type { CSSProperties } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// CabinetBox (every RadioButton here, and the LfoLink's own lane picker) pops via a real GSAP timeline
// registered in timelineMap; the shared GSAP mock's timeline has no kill(), so timelineMap is mocked the
// way every GSAP-timeline test in this codebase does (SignatureArrayDrawer.test.tsx).
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));
// The lane names follow the shell; pinned to desk so the lane radios read "Core LFO (A)".
vi.mock('@/components/panels/screen/useShell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/panels/screen/useShell')>()),
  useShell: () => 'desk',
}));
// Spied (still delegating) so a re-render test can tell which control's render body ran: every slider and
// radio calls resolveAccessibleName with its schema, so the calls can be attributed by schema.id.
vi.mock('@/components/ui/controls/accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { BusFilterDrawer, type BusFilterValue } from './BusFilterDrawer';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { DEFAULT_LFO_LINK } from '@/data/lfoConfig';
import { ROBOT_FILTER_TYPES } from '@/types/Robot';
import { CONTENT } from '@/content';

/** The slider's own Radix root operates on t in [0,1] for a log scale, so aria-valuenow is t; the visible
 *  formatted text is what shows the real domain value. */
const valueTexts = (container: HTMLElement) => Array.from(container.querySelectorAll('.sc-slider-log__value')).map((el) => el.textContent);

const makeValue = (overrides: Partial<BusFilterValue> = {}): BusFilterValue => ({
  filterFreq: 1200,
  filterQ: 1,
  filterType: 'lowpass',
  lfoLink: { lane: null, depth: 30 },
  ...overrides,
});

const noop = { onChange: () => {}, onLfoLinkChange: () => {} };

const group = (name: string) => screen.getByRole('group', { name });
const typeRadios = () => within(group('Type')).getAllByRole('radio');
const checkedType = () => typeRadios().filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.getAttribute('aria-label'));

/** SliderLinear's box-fitting needs a ResizeObserver (LfoLink's depth strip); same stub LfoLink.test.tsx installs. */
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
let originalResizeObserver: typeof ResizeObserver;

function stubMatchMedia(state: { mobile: boolean; tablet: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('640px') ? state.mobile : state.tablet,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  });
}

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  stubMatchMedia({ mobile: false, tablet: false });
});

afterEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
});

describe('BusFilterDrawer', () => {
  describe('what it renders', () => {
    it('renders Cutoff, Resonance and the three filter types from CONTENT', () => {
      render(<BusFilterDrawer {...noop} value={makeValue()} heldOff={false} />);
      expect(screen.getByRole('slider', { name: CONTENT['probe.source.filter.cutoff'].human })).toBeTruthy();
      expect(screen.getByRole('slider', { name: CONTENT['probe.source.filter.resonance'].human })).toBeTruthy();
      const options = CONTENT['probe.source.filter.type'].options;
      expect(typeRadios().map((r) => r.getAttribute('aria-label'))).toEqual(ROBOT_FILTER_TYPES.map((t) => options[t].human));
    });

    it('renders the Cutoff link: five lane options and a Depth slider', () => {
      const { container } = render(<BusFilterDrawer {...noop} value={makeValue()} heldOff={false} />);
      const link = container.querySelector('.sc-lfo-link') as HTMLElement;
      expect(link).not.toBeNull();
      expect(within(link).getAllByRole('radio')).toHaveLength(5);
      expect(within(link).getAllByRole('slider')).toHaveLength(1);
    });

    it('lists the controls in the order Cutoff, its link, Resonance, Type', () => {
      const { container } = render(<BusFilterDrawer {...noop} value={makeValue()} heldOff={false} />);
      const order = [
        screen.getByRole('slider', { name: 'Cutoff' }),
        container.querySelector('.sc-lfo-link') as HTMLElement,
        screen.getByRole('slider', { name: 'Resonance' }),
        group('Type'),
      ];
      for (let i = 0; i < order.length - 1; i++) {
        expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING, `control ${i}`).toBeTruthy();
      }
    });

    it('sits inside one Filter panel, with no accordion wrapper and no repeated heading', () => {
      const { container } = render(<BusFilterDrawer {...noop} value={makeValue()} heldOff={false} />);
      expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
      const panel = screen.getByText('Filter').closest('.sc-directional-panel');
      expect(panel).not.toBeNull();
      expect(panel!.contains(screen.getByRole('slider', { name: 'Cutoff' }))).toBe(true);
      expect(panel!.contains(group('Type'))).toBe(true);
    });

    it('puts Resonance and Type in one row on desktop, stacked on mobile/tablet', () => {
      const rowOf = () => screen.getByRole('slider', { name: 'Resonance' }).closest('.sc-directional-panel') as HTMLElement;
      const orientation = (panel: HTMLElement) => panel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation');

      const { unmount } = render(<BusFilterDrawer {...noop} value={makeValue()} heldOff={false} />);
      expect(group('Type').closest('.sc-directional-panel')).toBe(rowOf());
      expect(rowOf().contains(screen.getByRole('slider', { name: 'Cutoff' }))).toBe(false);
      expect(orientation(rowOf())).toBe('row');
      unmount();

      stubMatchMedia({ mobile: true, tablet: true });
      render(<BusFilterDrawer {...noop} value={makeValue()} heldOff={false} />);
      expect(orientation(rowOf())).toBe('column');
    });

    it('forwards the style to its own root', () => {
      const style: CSSProperties = { '--color-accent-a': '#123456' } as CSSProperties;
      const { container } = render(<BusFilterDrawer {...noop} value={makeValue()} heldOff={false} style={style} />);
      const root = container.querySelector('.bus-filter-drawer') as HTMLElement;
      expect(root).not.toBeNull();
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#123456');
      expect(root.contains(screen.getByRole('slider', { name: 'Cutoff' }))).toBe(true);
    });
  });

  describe('what it shows', () => {
    it('shows the stored cutoff and resonance', () => {
      const { container } = render(<BusFilterDrawer {...noop} value={makeValue({ filterFreq: 900, filterQ: 4 })} heldOff={false} />);
      const [cutoff, resonance] = valueTexts(container);
      expect(cutoff).toMatch(/900/);
      expect(resonance).toMatch(/^4/);
    });

    it.each(ROBOT_FILTER_TYPES)('shows %s as the checked type, and only that one', (type) => {
      render(<BusFilterDrawer {...noop} value={makeValue({ filterType: type })} heldOff={false} />);
      expect(checkedType()).toEqual([CONTENT['probe.source.filter.type'].options[type].human]);
    });

    it('shows the stored lane and depth on the link', () => {
      render(<BusFilterDrawer {...noop} value={makeValue({ lfoLink: { lane: 'b', depth: 40 } })} heldOff={false} />);
      expect(screen.getByRole('radio', { name: 'Companion LFO (B)' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('slider', { name: /depth/i }).getAttribute('aria-valuenow')).toBe('40');
    });

    it('renders no held-off note while the link is live', () => {
      render(<BusFilterDrawer {...noop} value={makeValue({ lfoLink: { lane: 'b', depth: 40 } })} heldOff={false} />);
      expect(screen.queryByRole('note')).toBeNull();
    });
  });

  describe('edits', () => {
    it('a Cutoff drag calls onChange with exactly one key, filterFreq', () => {
      const onChange = vi.fn();
      render(<BusFilterDrawer {...noop} onChange={onChange} value={makeValue({ filterFreq: 1200 })} heldOff={false} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Cutoff' }), { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledTimes(1);
      const patch = onChange.mock.calls[0][0] as Record<string, number>;
      expect(Object.keys(patch)).toEqual(['filterFreq']);
      expect(patch.filterFreq).toBeGreaterThan(1200);
    });

    it('a Cutoff step the other way lowers it, and stays inside the slider bounds at the ends', () => {
      const onChange = vi.fn();
      const { rerender } = render(<BusFilterDrawer {...noop} onChange={onChange} value={makeValue({ filterFreq: 1200 })} heldOff={false} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Cutoff' }), { key: 'ArrowLeft' });
      expect((onChange.mock.calls[0][0] as { filterFreq: number }).filterFreq).toBeLessThan(1200);

      onChange.mockClear();
      rerender(<BusFilterDrawer {...noop} onChange={onChange} value={makeValue({ filterFreq: 20 })} heldOff={false} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Cutoff' }), { key: 'End' });
      const top = (onChange.mock.calls[0][0] as { filterFreq: number }).filterFreq;
      expect(top).toBeCloseTo(20000, 0);
    });

    it('a Resonance drag calls onChange with exactly one key, filterQ', () => {
      const onChange = vi.fn();
      render(<BusFilterDrawer {...noop} onChange={onChange} value={makeValue({ filterQ: 1 })} heldOff={false} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Resonance' }), { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledTimes(1);
      const patch = onChange.mock.calls[0][0] as Record<string, number>;
      expect(Object.keys(patch)).toEqual(['filterQ']);
      expect(patch.filterQ).toBeGreaterThan(1);
    });

    it.each(ROBOT_FILTER_TYPES.filter((t) => t !== 'lowpass'))('choosing %s calls onChange with exactly { filterType }', (type) => {
      const onChange = vi.fn();
      render(<BusFilterDrawer {...noop} onChange={onChange} value={makeValue({ filterType: 'lowpass' })} heldOff={false} />);
      fireEvent.click(within(group('Type')).getByRole('radio', { name: CONTENT['probe.source.filter.type'].options[type].human }));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ filterType: type });
    });

    it('a lane change calls onLfoLinkChange with the new lane and the stored depth, and not onChange', () => {
      const onChange = vi.fn();
      const onLfoLinkChange = vi.fn();
      render(<BusFilterDrawer onChange={onChange} onLfoLinkChange={onLfoLinkChange} value={makeValue({ lfoLink: { lane: null, depth: 30 } })} heldOff={false} />);
      fireEvent.click(screen.getByRole('radio', { name: 'Core LFO (A)' }));
      expect(onLfoLinkChange).toHaveBeenCalledTimes(1);
      expect(onLfoLinkChange).toHaveBeenCalledWith({ lane: 'a', depth: 30 });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('choosing Off on a linked lane reports lane null with the depth kept', () => {
      const onLfoLinkChange = vi.fn();
      render(<BusFilterDrawer {...noop} onLfoLinkChange={onLfoLinkChange} value={makeValue({ lfoLink: { lane: 'c', depth: 55 } })} heldOff={false} />);
      fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
      expect(onLfoLinkChange).toHaveBeenCalledWith({ lane: null, depth: 55 });
    });

    it('a Depth edit calls onLfoLinkChange with the lane kept', () => {
      const onLfoLinkChange = vi.fn();
      render(<BusFilterDrawer {...noop} onLfoLinkChange={onLfoLinkChange} value={makeValue({ lfoLink: { lane: 'd', depth: 30 } })} heldOff={false} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: /depth/i }), { key: 'ArrowRight' });
      expect(onLfoLinkChange).toHaveBeenCalledTimes(1);
      const next = onLfoLinkChange.mock.calls[0][0] as { lane: string; depth: number };
      expect(next.lane).toBe('d');
      expect(next.depth).toBeGreaterThan(30);
    });

    it('takes the default link as a value (an unlinked Cutoff reads Off)', () => {
      render(<BusFilterDrawer {...noop} value={makeValue({ lfoLink: DEFAULT_LFO_LINK['bus.frequency'] })} heldOff={false} />);
      expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('heldOff (the Audio Load dial is holding filter links off)', () => {
    const linked = makeValue({ lfoLink: { lane: 'b', depth: 40 } });

    it('shows the link as Off at depth 0 and says why', () => {
      render(<BusFilterDrawer {...noop} value={linked} heldOff />);
      expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('slider', { name: /depth/i }).getAttribute('aria-valuenow')).toBe('0');
      expect(screen.getByRole('note').textContent).toBe(CONTENT['ui.heldOff'].human);
    });

    it('greys the link only: Cutoff, Resonance and Type keep their values and stay editable', () => {
      const onChange = vi.fn();
      const { container } = render(<BusFilterDrawer {...noop} onChange={onChange} value={{ ...linked, filterFreq: 900, filterQ: 4, filterType: 'bandpass' }} heldOff />);
      expect(container.querySelector('.sc-lfo-link.sc-held-off')).not.toBeNull();
      expect(valueTexts(container)[0]).toMatch(/900/);
      expect(checkedType()).toEqual([CONTENT['probe.source.filter.type'].options.bandpass.human]);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Cutoff' }), { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('never reports a change on its own, so the stored lane and depth are untouched', () => {
      const onLfoLinkChange = vi.fn();
      const onChange = vi.fn();
      render(<BusFilterDrawer onChange={onChange} onLfoLinkChange={onLfoLinkChange} value={linked} heldOff />);
      expect(onLfoLinkChange).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('brings the stored link back, with no note, when the hold lifts', () => {
      const { rerender } = render(<BusFilterDrawer {...noop} value={linked} heldOff />);
      rerender(<BusFilterDrawer {...noop} value={linked} heldOff={false} />);
      expect(screen.getByRole('radio', { name: 'Companion LFO (B)' }).getAttribute('aria-checked')).toBe('true');
      // The depth strip eases back up from 0 rather than jumping, so only the lane and the note are checked at once.
      expect(screen.queryByRole('note')).toBeNull();
    });

    it('puts the note right beside the link, before Resonance', () => {
      render(<BusFilterDrawer {...noop} value={linked} heldOff />);
      const note = screen.getByRole('note');
      expect(screen.getByRole('slider', { name: 'Cutoff' }).compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(note.compareDocumentPosition(screen.getByRole('slider', { name: 'Resonance' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('disabled', () => {
    it('disables every control, and none of them reports an edit', () => {
      const onChange = vi.fn();
      const onLfoLinkChange = vi.fn();
      render(<BusFilterDrawer onChange={onChange} onLfoLinkChange={onLfoLinkChange} value={makeValue()} heldOff={false} disabled />);
      screen.getAllByRole('slider').forEach((slider) => expect(slider.getAttribute('data-disabled')).toBe(''));
      screen.getAllByRole('radio').forEach((radio) => expect(radio.hasAttribute('disabled') || radio.getAttribute('data-disabled') === '').toBe(true));

      screen.getAllByRole('slider').forEach((slider) => fireEvent.keyDown(slider, { key: 'ArrowRight' }));
      screen.getAllByRole('radio').forEach((radio) => fireEvent.click(radio));
      expect(onChange).not.toHaveBeenCalled();
      expect(onLfoLinkChange).not.toHaveBeenCalled();
    });

    it('is enabled by default', () => {
      render(<BusFilterDrawer {...noop} value={makeValue()} heldOff={false} />);
      screen.getAllByRole('slider').forEach((slider) => expect(slider.getAttribute('data-disabled')).toBeNull());
    });
  });

  describe('keyboard', () => {
    // @testing-library/user-event is not a dependency here, so the walk is done with focus() and key events:
    // every control must be focusable, and the sliders must answer the arrow keys.
    it('every slider and every radio group is reachable by focus', () => {
      render(<BusFilterDrawer {...noop} value={makeValue()} heldOff={false} />);
      screen.getAllByRole('slider').forEach((slider) => {
        slider.focus();
        expect(document.activeElement, slider.getAttribute('aria-label') ?? '').toBe(slider);
      });
      const groups = screen.getAllByRole('group').filter((g) => within(g).queryAllByRole('radio').length > 0);
      expect(groups.length).toBeGreaterThanOrEqual(2); // the filter Type and the link's lane
      groups.forEach((g) => {
        // Radix roving focus: the group (or one of its radios) is the single tab stop, and each radio can take focus.
        const radios = within(g).getAllByRole('radio');
        expect([g, ...radios].some((el) => el.tabIndex >= 0), 'the group has a tab stop').toBe(true);
        radios[0].focus();
        expect(document.activeElement).toBe(radios[0]);
      });
    });

    it('Cutoff, Resonance and Depth each answer ArrowRight with an edit', () => {
      const onChange = vi.fn();
      const onLfoLinkChange = vi.fn();
      render(<BusFilterDrawer onChange={onChange} onLfoLinkChange={onLfoLinkChange} value={makeValue({ lfoLink: { lane: 'a', depth: 30 } })} heldOff={false} />);
      for (const name of ['Cutoff', 'Resonance']) fireEvent.keyDown(screen.getByRole('slider', { name }), { key: 'ArrowRight' });
      fireEvent.keyDown(screen.getByRole('slider', { name: /depth/i }), { key: 'ArrowRight' });
      expect(onChange.mock.calls.map((c) => Object.keys(c[0] as object))).toEqual([['filterFreq'], ['filterQ']]);
      expect(onLfoLinkChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('React.memo', () => {
    it('is a React.memo-wrapped component', () => {
      expect((BusFilterDrawer as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-render any control when re-rendered with the same props', () => {
      const props = { ...noop, value: makeValue(), heldOff: false };
      const { rerender } = render(<BusFilterDrawer {...props} />);
      vi.mocked(resolveAccessibleName).mockClear();
      rerender(<BusFilterDrawer {...props} />);
      expect(resolveAccessibleName).not.toHaveBeenCalled();
    });

    it('a Cutoff change re-renders the Cutoff slider only, not Resonance, Type or the link', () => {
      // One link object shared by both values, as the screens hand it (a stable stored or default link).
      const lfoLink = DEFAULT_LFO_LINK['bus.frequency'];
      const { rerender } = render(<BusFilterDrawer {...noop} value={makeValue({ lfoLink })} heldOff={false} />);
      vi.mocked(resolveAccessibleName).mockClear();
      rerender(<BusFilterDrawer {...noop} value={makeValue({ filterFreq: 800, lfoLink })} heldOff={false} />);
      const ids = new Set(vi.mocked(resolveAccessibleName).mock.calls.map((c) => (c[0] as { id: string }).id));
      expect(ids.has('robotOptions.busFilter.cutoff')).toBe(true);
      expect(ids.has('robotOptions.busFilter.resonance')).toBe(false);
      expect(ids.has('robotOptions.busFilter.type')).toBe(false);
      expect([...ids].some((id) => id.startsWith('robotOptions.busFilter.link'))).toBe(false);
    });
  });
});
