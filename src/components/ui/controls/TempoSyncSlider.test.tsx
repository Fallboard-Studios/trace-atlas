import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ComponentProps } from 'react';

// Spied wrapper around the real SliderLinear (it still renders for real, so keyboard and aria
// assertions below go through Radix) so the memoisation/forwarding contracts — which schema object
// reaches the slider, whether `swelling`/`disabled` are forwarded — are observable.
const sliderCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('./SliderLinear', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./SliderLinear')>();
  const Real = actual.SliderLinear;
  return {
    SliderLinear: (props: ComponentProps<typeof Real>) => {
      sliderCalls.push(props as unknown as Record<string, unknown>);
      return <Real {...props} />;
    },
  };
});

import { TempoSyncSlider } from './TempoSyncSlider';
import { CONTENT } from '@/content';
import { isNoteValue, type NoteDivision, type NoteModifier, type NoteValue } from '@/data/noteValues';
import { allowedDelayNoteValues, allowedLaneNoteValues } from '@/utils/tempoSync';
import { formatNoteValue } from '@/utils/formatNoteValue';
import type { SliderLinearSchema } from '@/types/controls';

const schema: SliderLinearSchema = {
  id: 'lfoBank.a.rate',
  type: 'sliderLinear',
  humanLabel: 'Rate',
  loreLabel: 'Mutation Cadence',
  min: 0,
  max: 20,
  step: 0.05,
  unit: 'Hz',
  orientation: 'horizontal',
};

const nv = (division: NoteDivision, modifier: NoteModifier = 'straight'): NoteValue => ({ division, modifier });

/** A lane-shaped list, slowest -> fastest (descending beats), small enough to assert indices by eye. */
const LANE_LIST: NoteValue[] = [nv('1'), nv('1/2'), nv('1/4'), nv('1/8', 'dotted'), nv('1/8'), nv('1/16')];
/** A Delay-shaped list, shortest -> longest (ascending beats): the same notes reversed. */
const DELAY_LIST: NoteValue[] = [...LANE_LIST].reverse();

const FREE_WORD = CONTENT['ui.tempoSync'].options.free.lore;
const SYNC_WORD = CONTENT['ui.tempoSync'].options.sync.lore;
const TOGGLE_NAME = CONTENT['ui.tempoSync'].human;

const readout = (container: HTMLElement) => container.querySelector('.sc-slider-linear__value')?.textContent;
const lastSliderProps = () => sliderCalls[sliderCalls.length - 1] as { schema: SliderLinearSchema; value: number; swelling?: boolean; disabled?: boolean; onChange: (v: number) => void };

function press(key: string) {
  const slider = screen.getByRole('slider');
  slider.focus();
  fireEvent.keyDown(slider, { key });
}

function noop() {}

describe('TempoSyncSlider — Free mode', () => {
  it('renders the Free schema unchanged: min/max from the schema, value = freeValue', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('20');
    expect(slider.getAttribute('aria-valuenow')).toBe('1.5');
  });

  it('shows the number and unit readout, not a note name', () => {
    const { container } = render(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(readout(container)).toBe('1.5Hz');
  });

  it('hands SliderLinear the caller\'s own schema object, not a copy', () => {
    sliderCalls.length = 0;
    render(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(lastSliderProps().schema).toBe(schema);
  });

  it('an arrow key steps by the schema step and fires onFreeChange only', () => {
    const onFreeChange = vi.fn();
    const onSyncChange = vi.fn();
    const onModeChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={onFreeChange} onSyncChange={onSyncChange} onModeChange={onModeChange} />);
    press('ArrowRight');
    expect(onFreeChange).toHaveBeenCalledTimes(1);
    expect(onFreeChange.mock.calls[0][0]).toBeCloseTo(1.55, 10);
    expect(onSyncChange).not.toHaveBeenCalled();
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('ignores the allowed list entirely (an empty one changes nothing)', () => {
    const { container } = render(<TempoSyncSlider schema={schema} freeValue={7} syncValue={undefined} allowed={[]} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('7');
    expect(readout(container)).toBe('7Hz');
  });
});

describe('TempoSyncSlider — Sync mode', () => {
  it('spans the allowed list by index: min 0, max length - 1, value = the note\'s index', () => {
    render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={nv('1/8', 'dotted')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe(String(LANE_LIST.length - 1));
    expect(slider.getAttribute('aria-valuenow')).toBe('3');
  });

  it('shows the note name through formatNoteValue, with no unit even though the Free schema has one', () => {
    const { container } = render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={nv('1/8', 'dotted')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(readout(container)).toBe(formatNoteValue(nv('1/8', 'dotted')));
    expect(readout(container)).not.toContain(schema.unit);
  });

  it('derives its schema from the Free one: labels and orientation kept, own id, step 1, no unit', () => {
    sliderCalls.length = 0;
    render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={nv('1/8')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    const derived = lastSliderProps().schema;
    expect(derived.id).toBe(`${schema.id}.sync`);
    expect(derived.humanLabel).toBe(schema.humanLabel);
    expect(derived.loreLabel).toBe(schema.loreLabel);
    expect(derived.orientation).toBe(schema.orientation);
    expect(derived.min).toBe(0);
    expect(derived.max).toBe(LANE_LIST.length - 1);
    expect(derived.step).toBe(1);
    expect(derived.unit).toBeUndefined();
  });

  it('ignores freeValue — the stored Free number never moves the Sync thumb', () => {
    render(<TempoSyncSlider schema={schema} freeValue={0} syncValue={nv('1/2')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('1');
  });

  // Each key gets its own render: the callbacks here don't feed a new `syncValue` back in, so the
  // slider's own (instant, live-drag) display would carry a second press on from where the first left it.
  it('ArrowRight steps one note along the list and fires onSyncChange with a real NoteValue', () => {
    const onFreeChange = vi.fn();
    const onSyncChange = vi.fn();
    const onModeChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={nv('1/8', 'dotted')} allowed={LANE_LIST} onFreeChange={onFreeChange} onSyncChange={onSyncChange} onModeChange={onModeChange} />);
    press('ArrowRight');
    expect(onSyncChange).toHaveBeenCalledTimes(1);
    expect(onSyncChange).toHaveBeenCalledWith(LANE_LIST[4]);
    expect(isNoteValue(onSyncChange.mock.calls[0][0])).toBe(true);
    expect(onFreeChange).not.toHaveBeenCalled();
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('ArrowLeft steps one note back along the list', () => {
    const onFreeChange = vi.fn();
    const onSyncChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={nv('1/8', 'dotted')} allowed={LANE_LIST} onFreeChange={onFreeChange} onSyncChange={onSyncChange} onModeChange={noop} />);
    press('ArrowLeft');
    expect(onSyncChange).toHaveBeenCalledTimes(1);
    expect(onSyncChange).toHaveBeenCalledWith(LANE_LIST[2]);
    expect(onFreeChange).not.toHaveBeenCalled();
  });

  it('Home and End jump to the first and last allowed note', () => {
    const onSyncChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={nv('1/4')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={onSyncChange} onModeChange={noop} />);
    press('End');
    expect(onSyncChange).toHaveBeenLastCalledWith(LANE_LIST[LANE_LIST.length - 1]);
    press('Home');
    expect(onSyncChange).toHaveBeenLastCalledWith(LANE_LIST[0]);
  });

  it('fires nothing when stepping past the fast end of the list', () => {
    const onSyncChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={LANE_LIST[LANE_LIST.length - 1]} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={onSyncChange} onModeChange={noop} />);
    press('ArrowRight');
    expect(onSyncChange).not.toHaveBeenCalled();
  });

  it('fires nothing when stepping past the slow end of the list', () => {
    const onSyncChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={LANE_LIST[0]} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={onSyncChange} onModeChange={noop} />);
    press('ArrowLeft');
    expect(onSyncChange).not.toHaveBeenCalled();
  });

  it('a one-entry list shows its note on a disabled slider (nothing to choose between)', () => {
    const onSyncChange = vi.fn();
    const { container } = render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={[nv('1/4')]} onFreeChange={noop} onSyncChange={onSyncChange} onModeChange={noop} />);
    expect(readout(container)).toBe(formatNoteValue(nv('1/4')));
    expect(screen.getByRole('slider').getAttribute('data-disabled')).toBe('');
    press('ArrowRight');
    press('ArrowLeft');
    expect(onSyncChange).not.toHaveBeenCalled();
  });

  it('a one-entry list leaves the toggle usable, so the lane can still go back to Free', () => {
    const onModeChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={[nv('1/4')]} onFreeChange={noop} onSyncChange={noop} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onModeChange).toHaveBeenCalledWith(false);
  });

  it('works with a Delay-shaped (shortest -> longest) list: the index follows list order, not note length', () => {
    const onSyncChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={0.3} syncValue={nv('1/4')} allowed={DELAY_LIST} onFreeChange={noop} onSyncChange={onSyncChange} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('3');
    press('ArrowRight');
    expect(onSyncChange).toHaveBeenLastCalledWith(DELAY_LIST[4]);
  });
});

describe('TempoSyncSlider — an unrecognised syncValue (spec assumption 9)', () => {
  // The resolvers treat an unrecognised `sync` as Free, so the audio is running Free. Showing
  // Anchored over that would lie, and a NaN beat count would feed the index search.
  const corrupt = { division: '1/3', modifier: 'straight' } as unknown as NoteValue;

  it('renders as Free: unchecked switch, the Free value and unit on the slider', () => {
    const { container } = render(<TempoSyncSlider schema={schema} freeValue={3} syncValue={corrupt} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('switch').textContent).toBe(FREE_WORD);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('3');
    expect(readout(container)).toBe('3Hz');
  });

  it('a step writes the Free value, not a note', () => {
    const onFreeChange = vi.fn();
    const onSyncChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={3} syncValue={corrupt} allowed={LANE_LIST} onFreeChange={onFreeChange} onSyncChange={onSyncChange} onModeChange={noop} />);
    press('ArrowRight');
    expect(onFreeChange).toHaveBeenCalledTimes(1);
    expect(onSyncChange).not.toHaveBeenCalled();
  });

  it('clicking the switch asks for Sync, the way a Free control would', () => {
    const onModeChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={3} syncValue={corrupt} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onModeChange).toHaveBeenCalledWith(true);
  });

  it('a stringly or null syncValue is Free too', () => {
    for (const bad of ['1/4', null, 0, {}] as unknown[]) {
      const { unmount } = render(<TempoSyncSlider schema={schema} freeValue={3} syncValue={bad as NoteValue} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
      unmount();
    }
  });
});

describe('TempoSyncSlider — a stored note outside the allowed list (tempo moved)', () => {
  it('lane list: a note slower than the slowest allowed shows the first (slowest) stop', () => {
    const { container } = render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('4')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    expect(readout(container)).toBe(formatNoteValue(LANE_LIST[0]));
  });

  it('lane list: a note faster than the fastest allowed shows the last (fastest) stop', () => {
    const { container } = render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/32', 'triplet')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(String(LANE_LIST.length - 1));
    expect(readout(container)).toBe(formatNoteValue(LANE_LIST[LANE_LIST.length - 1]));
  });

  it('delay list: a note longer than the longest allowed shows the last (longest) stop', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('4')} allowed={DELAY_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(String(DELAY_LIST.length - 1));
  });

  it('delay list: a note shorter than the shortest allowed shows the first (shortest) stop', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/32', 'triplet')} allowed={DELAY_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
  });

  it('is display-only: no callback fires on the first render or on a re-render with new props', () => {
    const onFreeChange = vi.fn();
    const onSyncChange = vi.fn();
    const onModeChange = vi.fn();
    const props = { schema, freeValue: 1, syncValue: nv('4'), onFreeChange, onSyncChange, onModeChange };
    const { rerender } = render(<TempoSyncSlider {...props} allowed={LANE_LIST} />);
    rerender(<TempoSyncSlider {...props} allowed={LANE_LIST.slice(1)} />);
    rerender(<TempoSyncSlider {...props} allowed={LANE_LIST} />);
    expect(onFreeChange).not.toHaveBeenCalled();
    expect(onSyncChange).not.toHaveBeenCalled();
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('moving the tempo back restores the stored note, because nothing was written', async () => {
    // Real lists at two tempos: 1/32 triplet is 12 Hz at 60 BPM (allowed) but 40 Hz at 200 BPM (past the 20 Hz cap).
    const stored = nv('1/32', 'triplet');
    const slow = allowedLaneNoteValues(60);
    const fast = allowedLaneNoteValues(200);
    expect(slow.some((n) => n.division === stored.division && n.modifier === stored.modifier)).toBe(true);
    expect(fast.some((n) => n.division === stored.division && n.modifier === stored.modifier)).toBe(false);

    const props = { schema, freeValue: 1, syncValue: stored, onFreeChange: noop, onSyncChange: noop, onModeChange: noop };
    const { container, rerender } = render(<TempoSyncSlider {...props} allowed={slow} />);
    const storedText = readout(container);
    expect(storedText).toBe(formatNoteValue(stored));

    rerender(<TempoSyncSlider {...props} allowed={fast} />);
    await act(async () => {}); // let the slider's eased display settle
    expect(readout(container)).toBe(formatNoteValue(fast[fast.length - 1]));
    expect(readout(container)).not.toBe(storedText);

    rerender(<TempoSyncSlider {...props} allowed={slow} />);
    await act(async () => {});
    expect(readout(container)).toBe(storedText);
  });

  it('stepping from a clamped display moves from the shown stop, not from the stored note', () => {
    const onSyncChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/32', 'triplet')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={onSyncChange} onModeChange={noop} />);
    press('ArrowLeft');
    expect(onSyncChange).toHaveBeenCalledWith(LANE_LIST[LANE_LIST.length - 2]);
  });

  it('real Delay list at an extreme tempo: a note past the 10 s cap shows the longest allowed one', () => {
    const allowed = allowedDelayNoteValues(20); // 20 BPM: 3 s per beat, so 4 bars (48 s) and 2 bars (24 s) are out
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('4')} allowed={allowed} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(String(allowed.length - 1));
  });

  it('an empty allowed list in Sync mode renders a disabled slider with an empty readout and fires nothing', () => {
    const onSyncChange = vi.fn();
    const { container } = render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={[]} onFreeChange={noop} onSyncChange={onSyncChange} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    expect(readout(container)).toBe('');
    expect(screen.getByRole('slider').getAttribute('data-disabled')).toBe('');
    press('ArrowRight');
    expect(onSyncChange).not.toHaveBeenCalled();
  });

  it('two or more stops leave the slider enabled', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={[nv('1/4'), nv('1/8')]} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').hasAttribute('data-disabled')).toBe(false);
  });
});

describe('TempoSyncSlider — the mode toggle', () => {
  it('is a switch named from content (Tempo Sync), checked exactly when a syncValue is present', () => {
    const { rerender } = render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('switch', { name: TOGGLE_NAME }).getAttribute('aria-checked')).toBe('false');
    rerender(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('switch', { name: TOGGLE_NAME }).getAttribute('aria-checked')).toBe('true');
  });

  it('keeps one accessible name across both modes (the state is aria-checked, not the name)', () => {
    const { rerender } = render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    const freeName = screen.getByRole('switch').getAttribute('aria-label');
    rerender(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe(freeName);
  });

  it('the facade reads the current mode\'s lore word from content: Float in Free, Anchored in Sync', () => {
    const { rerender } = render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('switch').textContent).toBe(FREE_WORD);
    rerender(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('switch').textContent).toBe(SYNC_WORD);
  });

  it('clicking in Free fires onModeChange(true) and nothing else', () => {
    const onFreeChange = vi.fn();
    const onSyncChange = vi.fn();
    const onModeChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={onFreeChange} onSyncChange={onSyncChange} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith(true);
    expect(onFreeChange).not.toHaveBeenCalled();
    expect(onSyncChange).not.toHaveBeenCalled();
  });

  it('clicking in Sync fires onModeChange(false) and nothing else', () => {
    const onFreeChange = vi.fn();
    const onSyncChange = vi.fn();
    const onModeChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={LANE_LIST} onFreeChange={onFreeChange} onSyncChange={onSyncChange} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith(false);
    expect(onFreeChange).not.toHaveBeenCalled();
    expect(onSyncChange).not.toHaveBeenCalled();
  });

  it('is controlled: it does not flip on its own until the caller supplies a syncValue', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('switch').textContent).toBe(FREE_WORD);
  });
});

describe('TempoSyncSlider — switching modes redraws the slider outright', () => {
  // The slider eases any external value change over 250 ms, and a Free value and a Sync index live
  // in different spaces. Easing across the switch would sweep the thumb and flash meaningless note
  // names, so the slider is remounted per mode and lands on its value immediately. (The shared gsap
  // mock settles an ease on a microtask, so a synchronous read straight after rerender() would see a
  // stale value if the slider were reused.)
  it('Free -> Sync lands on the note at once', () => {
    const { container, rerender } = render(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    rerender(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={nv('1/8', 'dotted')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('3');
    expect(readout(container)).toBe(formatNoteValue(nv('1/8', 'dotted')));
  });

  it('Sync -> Free lands on the number at once', () => {
    const { container, rerender } = render(<TempoSyncSlider schema={schema} freeValue={1.35} syncValue={nv('1/8', 'dotted')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    rerender(<TempoSyncSlider schema={schema} freeValue={1.35} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('1.35');
    expect(readout(container)).toBe('1.35Hz');
  });
});

describe('TempoSyncSlider — what a screen reader hears (Task 10, folded in from Task 8)', () => {
  const valueText = () => screen.getByRole('slider').getAttribute('aria-valuetext');

  it('in Sync the thumb announces the note name, not the index', () => {
    render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={nv('1/8', 'dotted')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('3');
    expect(valueText()).toBe(formatNoteValue(nv('1/8', 'dotted')));
  });

  it('in Free the thumb has no aria-valuetext — the number is already the right thing to read', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').hasAttribute('aria-valuetext')).toBe(false);
  });

  it('the announced name follows a step along the list', () => {
    render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={nv('1/8', 'dotted')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    press('ArrowRight');
    expect(valueText()).toBe(formatNoteValue(LANE_LIST[4]));
  });

  it('flipping Free -> Sync gives the thumb the note name at once, and Sync -> Free takes it away again', () => {
    const { rerender } = render(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    rerender(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={nv('1/4')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(valueText()).toBe(formatNoteValue(nv('1/4')));
    rerender(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').hasAttribute('aria-valuetext')).toBe(false);
  });

  it('a note pushed out of the list by a tempo change is announced as the stop actually shown', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('4')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(valueText()).toBe(formatNoteValue(LANE_LIST[0]));
  });

  it('matches the visible readout, so what is seen and what is heard cannot drift apart', () => {
    const { container } = render(<TempoSyncSlider schema={schema} freeValue={19} syncValue={nv('1/16')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(valueText()).toBe(readout(container));
  });
});

describe('TempoSyncSlider — disabled and swelling', () => {
  it('disables both the slider and the switch, in Free', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} disabled />);
    expect(screen.getByRole('slider').getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true);
  });

  it('disables both the slider and the switch, in Sync', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} disabled />);
    expect(screen.getByRole('slider').getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true);
  });

  it('a disabled control fires no callback on a click', () => {
    const onModeChange = vi.fn();
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={onModeChange} disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('is enabled by default', () => {
    render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(screen.getByRole('slider').hasAttribute('data-disabled')).toBe(false);
    expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(false);
  });

  it('forwards swelling to the slider in both modes, and false by default', () => {
    sliderCalls.length = 0;
    const { rerender } = render(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} />);
    expect(lastSliderProps().swelling).toBeFalsy();
    rerender(<TempoSyncSlider schema={schema} freeValue={1} syncValue={undefined} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} swelling />);
    expect(lastSliderProps().swelling).toBe(true);
    rerender(<TempoSyncSlider schema={schema} freeValue={1} syncValue={nv('1/4')} allowed={LANE_LIST} onFreeChange={noop} onSyncChange={noop} onModeChange={noop} swelling />);
    expect(lastSliderProps().swelling).toBe(true);
  });
});

describe('TempoSyncSlider — memoisation and stable handlers', () => {
  it('is a React.memo-wrapped component', () => {
    expect((TempoSyncSlider as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('reuses one Sync schema object across re-renders with the same schema and allowed list', () => {
    sliderCalls.length = 0;
    const props = { schema, freeValue: 1, allowed: LANE_LIST, onFreeChange: noop, onSyncChange: noop, onModeChange: noop };
    const { rerender } = render(<TempoSyncSlider {...props} syncValue={nv('1/4')} />);
    const first = lastSliderProps().schema;
    rerender(<TempoSyncSlider {...props} syncValue={nv('1/2')} />); // a different note, same schema + list
    expect(lastSliderProps().schema).toBe(first);
  });

  it('builds a new Sync schema when the allowed list changes (its max and readout depend on it)', () => {
    sliderCalls.length = 0;
    const props = { schema, freeValue: 1, syncValue: nv('1/4'), onFreeChange: noop, onSyncChange: noop, onModeChange: noop };
    const { rerender } = render(<TempoSyncSlider {...props} allowed={LANE_LIST} />);
    const first = lastSliderProps().schema;
    rerender(<TempoSyncSlider {...props} allowed={LANE_LIST.slice(0, 4)} />);
    expect(lastSliderProps().schema).not.toBe(first);
    expect(lastSliderProps().schema.max).toBe(3);
  });

  it('keeps the slider\'s onChange identity stable and routes to the latest callback props', () => {
    sliderCalls.length = 0;
    const firstFree = vi.fn();
    const secondFree = vi.fn();
    const { rerender } = render(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={firstFree} onSyncChange={noop} onModeChange={noop} />);
    const firstOnChange = lastSliderProps().onChange;
    rerender(<TempoSyncSlider schema={schema} freeValue={1.5} syncValue={undefined} allowed={LANE_LIST} onFreeChange={secondFree} onSyncChange={noop} onModeChange={noop} />);
    expect(lastSliderProps().onChange).toBe(firstOnChange);
    press('ArrowRight');
    expect(secondFree).toHaveBeenCalledTimes(1);
    expect(firstFree).not.toHaveBeenCalled();
  });

  it('a Sync step after the allowed list changed indexes into the new list', async () => {
    const onSyncChange = vi.fn();
    const props = { schema, freeValue: 1, syncValue: nv('1/4'), onFreeChange: noop, onSyncChange, onModeChange: noop };
    const { rerender } = render(<TempoSyncSlider {...props} allowed={LANE_LIST} />);
    rerender(<TempoSyncSlider {...props} allowed={DELAY_LIST} />); // '1/4' moves from index 2 to index 3
    await act(async () => {}); // let the slider's eased display settle on the new index
    press('ArrowRight');
    expect(onSyncChange).toHaveBeenCalledWith(DELAY_LIST[4]);
  });
});

describe('TempoSyncSlider reads its copy from src/content (docs/specs/CONTENT_LAYER.md)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // Comments are free to name the words (this file's own doc comments do); only code may not carry them.
    const source = readFileSync(resolve(__dirname, 'TempoSyncSlider.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/Float|Anchored|Anchoring|Tempo Sync|aria-label="[A-Za-z]/);
  });
});
