import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mutable so the Click Track dev-gating tests can flip DEV_TUNING false without faking
// import.meta.env.DEV directly — same pattern lfoDebug.test.ts already uses for the same flag.
let mockDevTuning = true;
vi.mock('@/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/constants')>();
  return { ...actual, get DEV_TUNING() { return mockDevTuning; } };
});

import { CompositionDetailsSection, CompositionRhythmMelodySection, type PingControlsValue } from './CompositionSections';
import { CONTENT, fill } from '@/content';


function makeValue(overrides: Partial<PingControlsValue> = {}): PingControlsValue {
  return {
    rhythmicDensity: 50,
    rhythmicMotifLength: 8,
    noteVariance: 0,
    pitchRepeat: 0,
    rests: 0,
    accents: 0,
    octaveRange: [3, 5],
    clickTrackActive: false,
    development: 0,
    journey: 'own',
    ...overrides,
  };
}

/** The melody journey row's two handlers, required since roadmap 92 Task 17. */
const JOURNEY_HANDLERS = { onDevelopmentChange: () => {}, onJourneyChange: () => {} };

/** Stubs window.matchMedia for the viewport tiers ('640px' is the phone query; every other query reads `tablet`), the
 *  shape LevelsSections.test.tsx's stub has, since a 'responsive' row resolves through the same tier hooks. */
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

// docs/specs/CONTENT_LAYOUT.md §1.3 (docs/tasks/CONTENT_LAYOUT.md Task 14): Composition splits into Rhythm & Melody and
// Details, each one box and its own memoised component.
describe('Composition split into Rhythm & Melody and Details (control layout Task 14)', () => {
  const DESKTOP = { mobile: false, tablet: false };
  const TABLET = { mobile: false, tablet: true };
  const panel = (container: HTMLElement, id: string) => container.querySelector(`[data-panel-id="${id}"]`) as HTMLElement;
  const orientationOf = (p: HTMLElement) => p.querySelector(':scope > .sc-directional-panel__content')!.getAttribute('data-orientation');
  const boxes = (container: HTMLElement) => container.querySelectorAll('.sc-directional-panel-facade');
  const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const slider = (name: RegExp) => screen.getByRole('slider', { name });
  const RHYTHM_HANDLERS = { onDensityChange: () => {}, onMotifLengthChange: () => {}, onPitchRepeatChange: () => {}, onNoteVarianceChange: () => {}, ...JOURNEY_HANDLERS };
  const DETAILS_HANDLERS = { onRestsChange: () => {}, onAccentsChange: () => {}, onOctaveMinChange: () => {}, onOctaveMaxChange: () => {} };

  beforeEach(() => {
    mockDevTuning = true;
  });

  describe('Rhythm & Melody', () => {
    // The third row, Development beside Journey, since the melody journey (roadmap 92 Tasks 16, 17).
    it('is one box: Note Density beside Phrase Length, then Pitch Repeat Chance beside Note Variance, then Development', () => {
      stubMatchMedia(DESKTOP);
      const { container } = render(<CompositionRhythmMelodySection value={makeValue()} {...RHYTHM_HANDLERS} />);
      expect(boxes(container)).toHaveLength(1);

      const p1 = panel(container, 'robotOptions.rhythmMelody.p1');
      const r1 = panel(container, 'robotOptions.rhythmMelody.p1.r1');
      const r2 = panel(container, 'robotOptions.rhythmMelody.p1.r2');
      expect(p1.contains(r1) && p1.contains(r2)).toBe(true);
      expect(r1.contains(slider(/density/i)) && r1.contains(slider(/phrase length/i))).toBe(true);
      expect(r2.contains(slider(/pitch repeat/i)) && r2.contains(slider(/note variance/i))).toBe(true);
      const order = [/density/i, /phrase length/i, /pitch repeat/i, /note variance/i, /development/i].map(slider);
      for (let i = 1; i < order.length; i++) expect(before(order[i - 1], order[i]), `slider ${i}`).toBe(true);
      expect(screen.getAllByRole('slider')).toHaveLength(5);
    });

    it.each([['desktop', 'row', DESKTOP], ['tablet', 'column', TABLET]] as const)('on %s, both rows are a %s', (_tier, expected, state) => {
      stubMatchMedia(state);
      const { container } = render(<CompositionRhythmMelodySection value={makeValue()} {...RHYTHM_HANDLERS} />);
      expect(orientationOf(panel(container, 'robotOptions.rhythmMelody.p1.r1'))).toBe(expected);
      expect(orientationOf(panel(container, 'robotOptions.rhythmMelody.p1.r2'))).toBe(expected);
    });

    it('Click Track (dev only, with a handler) is the last row of the box, below the sliders', () => {
      const { container } = render(<CompositionRhythmMelodySection value={makeValue()} {...RHYTHM_HANDLERS} onClickTrackActiveChange={() => {}} />);
      const clickTrack = screen.getByRole('switch', { name: /Click Track/i });
      expect(panel(container, 'robotOptions.rhythmMelody.p1').contains(clickTrack)).toBe(true);
      expect(panel(container, 'robotOptions.rhythmMelody.p1.r2').contains(clickTrack)).toBe(false);
      for (const name of [/density/i, /phrase length/i, /pitch repeat/i, /note variance/i]) expect(before(slider(name), clickTrack), String(name)).toBe(true);
    });

    it('has no Click Track when DEV_TUNING is false, handler or not', () => {
      mockDevTuning = false;
      render(<CompositionRhythmMelodySection value={makeValue()} {...RHYTHM_HANDLERS} onClickTrackActiveChange={() => {}} />);
      expect(screen.queryByRole('switch', { name: /Click Track/i })).toBeNull();
    });

    it('Pitch Repeat Chance is disabled while Phrase Length is 0, and only then', () => {
      const off = render(<CompositionRhythmMelodySection value={makeValue({ rhythmicMotifLength: 0 })} {...RHYTHM_HANDLERS} />);
      expect(slider(/pitch repeat/i).getAttribute('data-disabled')).toBe('');
      expect(slider(/phrase length/i).getAttribute('data-disabled')).toBeNull();
      off.unmount();
      render(<CompositionRhythmMelodySection value={makeValue({ rhythmicMotifLength: 1 })} {...RHYTHM_HANDLERS} />);
      expect(slider(/pitch repeat/i).getAttribute('data-disabled')).toBeNull();
    });

    it('is a React.memo-wrapped component', () => {
      expect((CompositionRhythmMelodySection as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  describe('Details', () => {
    it('is one box: Rests beside Accents, then Octave Min beside Octave Max, with no Articulation heading', () => {
      stubMatchMedia(DESKTOP);
      const { container } = render(<CompositionDetailsSection value={makeValue()} {...DETAILS_HANDLERS} />);
      expect(boxes(container)).toHaveLength(1);

      const p1 = panel(container, 'robotOptions.details.p1');
      const r1 = panel(container, 'robotOptions.details.p1.r1');
      const r2 = panel(container, 'robotOptions.details.p1.r2');
      expect(p1.contains(r1) && p1.contains(r2)).toBe(true);
      expect(r1.contains(slider(/^rests/i)) && r1.contains(slider(/^accents/i))).toBe(true);
      expect(r2.contains(slider(/octave min/i)) && r2.contains(slider(/octave max/i))).toBe(true);
      const order = [/^rests/i, /^accents/i, /octave min/i, /octave max/i].map(slider);
      for (let i = 1; i < order.length; i++) expect(before(order[i - 1], order[i]), `slider ${i}`).toBe(true);
      expect(screen.getAllByRole('slider')).toHaveLength(4);
      expect(screen.queryByText('Articulation')).toBeNull();
      expect(container.querySelector('[data-panel-id="robotOptions.articulation"]')).toBeNull();
    });

    it.each([['desktop', 'row', DESKTOP], ['tablet', 'column', TABLET]] as const)('on %s, both rows are a %s', (_tier, expected, state) => {
      stubMatchMedia(state);
      const { container } = render(<CompositionDetailsSection value={makeValue()} {...DETAILS_HANDLERS} />);
      expect(orientationOf(panel(container, 'robotOptions.details.p1.r1'))).toBe(expected);
      expect(orientationOf(panel(container, 'robotOptions.details.p1.r2'))).toBe(expected);
    });

    it('shows the stored octave range, Min from its first value and Max from its second', () => {
      render(<CompositionDetailsSection value={makeValue({ octaveRange: [2, 6] })} {...DETAILS_HANDLERS} />);
      expect(slider(/octave min/i).getAttribute('aria-valuenow')).toBe('2');
      expect(slider(/octave max/i).getAttribute('aria-valuenow')).toBe('6');
    });

    it('is a React.memo-wrapped component', () => {
      expect((CompositionDetailsSection as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });
});

// The melody journey's row (docs/specs/MELODY_JOURNEY.md §1.10; roadmap 92 Task 16): Development beside Journey, the
// third row of Rhythm & Melody.
describe('Rhythm & Melody: the Development and Journey row (melody journey Task 16)', () => {
  const RHYTHM_HANDLERS = { onDensityChange: () => {}, onMotifLengthChange: () => {}, onPitchRepeatChange: () => {}, onNoteVarianceChange: () => {} };
  const panel = (container: HTMLElement, id: string) => container.querySelector(`[data-panel-id="${id}"]`) as HTMLElement;
  const development = () => screen.getByRole('slider', { name: new RegExp(CONTENT['probe.composition.development'].human, 'i') });
  const journeyOption = (name: string) => screen.getByRole('radio', { name });
  const OPTIONS = ['Own', 'Company', 'Fleet'];

  function renderRow(overrides: Partial<PingControlsValue> = {}, extra: Record<string, unknown> = {}) {
    const onDevelopmentChange = vi.fn();
    const onJourneyChange = vi.fn();
    const result = render(
      <CompositionRhythmMelodySection
        value={makeValue({ development: 0.5, journey: 'own', ...overrides })}
        {...RHYTHM_HANDLERS}
        onDevelopmentChange={onDevelopmentChange}
        onJourneyChange={onJourneyChange}
        {...extra}
      />,
    );
    return { ...result, onDevelopmentChange, onJourneyChange };
  }

  beforeEach(() => {
    mockDevTuning = true;
    stubMatchMedia({ mobile: false, tablet: false });
  });

  it('renders Development beside Journey in a third row, after Pitch Repeat and Note Variance, with their content labels', () => {
    const { container } = renderRow();
    const r3 = panel(container, 'robotOptions.rhythmMelody.p1.r3');
    expect(r3).toBeTruthy();
    expect(panel(container, 'robotOptions.rhythmMelody.p1').contains(r3)).toBe(true);
    expect(r3.contains(development())).toBe(true);
    expect(screen.getByRole('group', { name: new RegExp(CONTENT['probe.composition.journey'].human, 'i') })).toBeTruthy();
    for (const name of OPTIONS) expect(r3.contains(journeyOption(name))).toBe(true);
    const noteVariance = screen.getByRole('slider', { name: /note variance/i });
    expect(!!(noteVariance.compareDocumentPosition(development()) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('shows the stored values: Development 1.375, Journey Company', () => {
    renderRow({ development: 1.375, journey: 'company' });
    expect(development().getAttribute('aria-valuenow')).toBe('1.375');
    expect(development().getAttribute('aria-valuemin')).toBe('0');
    expect(development().getAttribute('aria-valuemax')).toBe('8');
    expect(journeyOption('Company').getAttribute('aria-checked')).toBe('true');
    expect(journeyOption('Own').getAttribute('aria-checked')).toBe('false');
  });

  it('a Development step calls onDevelopmentChange with the next stop (0.5 to 0.625), and nothing else', () => {
    const { onDevelopmentChange, onJourneyChange } = renderRow({ development: 0.5 });
    fireEvent.keyDown(development(), { key: 'ArrowRight' });
    expect(onDevelopmentChange).toHaveBeenCalledWith(0.625);
    expect(onJourneyChange).not.toHaveBeenCalled();
  });

  it('choosing Fleet calls onJourneyChange with fleet, and nothing else', () => {
    const { onDevelopmentChange, onJourneyChange } = renderRow({ journey: 'own' });
    fireEvent.click(journeyOption('Fleet'));
    expect(onJourneyChange).toHaveBeenCalledWith('fleet');
    expect(onDevelopmentChange).not.toHaveBeenCalled();
  });

  it('Journey is disabled at Development 0, its stored value still shown, and calls nothing', () => {
    const { onJourneyChange } = renderRow({ development: 0, journey: 'fleet' });
    for (const name of OPTIONS) expect(journeyOption(name).getAttribute('data-disabled')).toBe('');
    expect(journeyOption('Fleet').getAttribute('aria-checked')).toBe('true');
    expect(development().getAttribute('data-disabled')).toBeNull();
    fireEvent.click(journeyOption('Own'));
    expect(onJourneyChange).not.toHaveBeenCalled();
  });

  it('Journey is enabled at the first stop above 0', () => {
    renderRow({ development: 0.125 });
    for (const name of OPTIONS) expect(journeyOption(name).getAttribute('data-disabled')).toBeNull();
  });

  it('a section disabled disables both', () => {
    renderRow({ development: 1 }, { disabled: true });
    expect(development().getAttribute('data-disabled')).toBe('');
    for (const name of OPTIONS) expect(journeyOption(name).getAttribute('data-disabled')).toBe('');
  });

});

describe('Composition halves (docs/reference/layout-updates.md) — merges Rhythm/Pitches into one accordion', () => {
  beforeEach(() => {
    mockDevTuning = true;
  });

  function renderSection(
    overrides: Partial<PingControlsValue> = {},
    extra: { disabled?: boolean; onClickTrackActiveChange?: (active: boolean) => void } = {},
  ) {
    const value = makeValue(overrides);
    return render(
      <CompositionRhythmMelodySection
        value={value}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onPitchRepeatChange={() => {}}
        onNoteVarianceChange={() => {}}
        {...JOURNEY_HANDLERS}
        {...extra}
      />,
    );
  }

  function renderDetails(overrides: Partial<PingControlsValue> = {}) {
    return render(
      <CompositionDetailsSection
        value={makeValue(overrides)}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onRestsChange={() => {}}
        onAccentsChange={() => {}}
      />,
    );
  }

  it('renders Density, Motif Length, Pitch Repeat, Note Variance — and no Click Track toggle without a Click Track handler (Rhythm & Melody)', () => {
    renderSection();

    expect(screen.getByRole('slider', { name: /density/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /phrase length/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /pitch repeat/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /note variance/i })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: /Click Track/i })).toBeNull();
  });

  it('renders Octave Min, Octave Max (Details)', () => {
    renderDetails();

    expect(screen.getByRole('slider', { name: /octave min/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /octave max/i })).toBeTruthy();
  });

  it('never renders a Reset Melody button — removed entirely (Deterministic Robot Melody Generation, Task 8) (Rhythm & Melody)', () => {
    renderSection();
    expect(screen.queryByRole('button', { name: 'Reset Melody' })).toBeNull();
  });

  it('never renders a Reset Melody button — removed entirely (Deterministic Robot Melody Generation, Task 8) (Details)', () => {
    renderDetails();
    expect(screen.queryByRole('button', { name: 'Reset Melody' })).toBeNull();
  });

  it('changing each field calls its own onChange with the raw number (Rhythm & Melody)', () => {
    const onDensityChange = vi.fn();
    const onMotifLengthChange = vi.fn();
    const onPitchRepeatChange = vi.fn();
    const onNoteVarianceChange = vi.fn();
    render(
      <CompositionRhythmMelodySection
        value={makeValue({ rhythmicMotifLength: 4, pitchRepeat: 10 })}
        onDensityChange={onDensityChange}
        onMotifLengthChange={onMotifLengthChange}
        onPitchRepeatChange={onPitchRepeatChange}
        onNoteVarianceChange={onNoteVarianceChange}
        {...JOURNEY_HANDLERS}
      />,
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /density/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /phrase length/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /pitch repeat/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /note variance/i }), { key: 'ArrowRight' });

    expect(onDensityChange).toHaveBeenCalledWith(51);
    expect(onMotifLengthChange).toHaveBeenCalledWith(5);
    expect(onPitchRepeatChange).toHaveBeenCalledWith(11);
    expect(onNoteVarianceChange).toHaveBeenCalled();
  });

  it('changing each field calls its own onChange with the raw number (Details)', () => {
    const onOctaveMinChange = vi.fn();
    const onOctaveMaxChange = vi.fn();
    render(
      <CompositionDetailsSection
        value={makeValue({ rhythmicMotifLength: 4, pitchRepeat: 10 })}
        onOctaveMinChange={onOctaveMinChange}
        onOctaveMaxChange={onOctaveMaxChange}
        onRestsChange={() => {}}
        onAccentsChange={() => {}}
      />,
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /octave min/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /octave max/i }), { key: 'ArrowRight' });

    expect(onOctaveMinChange).toHaveBeenCalled();
    expect(onOctaveMaxChange).toHaveBeenCalled();
  });

  it('Pitch Repeat is disabled when rhythmicMotifLength is 0', () => {
    renderSection({ rhythmicMotifLength: 0 });
    expect(screen.getByRole('slider', { name: /pitch repeat/i }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider', { name: /density/i }).getAttribute('data-disabled')).toBeNull();
  });

  it('disables every internal control when disabled is true', () => {
    renderSection({}, { disabled: true });
    expect(screen.getByRole('slider', { name: /density/i }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider', { name: /note variance/i }).getAttribute('data-disabled')).toBe('');
  });

  // The dev-only Click Track, back on the robot screen so the downbeat can be heard (one music clock, Task 10a).
  describe('Click Track (dev only, with a handler)', () => {
    const clickTrack = () => screen.getByRole('switch', { name: /Click Track/i });

    it('renders a Click Track toggle, labelled Click Track, after Note Variance (control layout Task 14: the last row of Rhythm & Melody)', () => {
      renderSection({}, { onClickTrackActiveChange: () => {} });
      expect(clickTrack().textContent).toBe(CONTENT['probe.composition.clickTrack'].human);
      const noteVariance = screen.getByRole('slider', { name: /note variance/i });
      expect(!!(noteVariance.compareDocumentPosition(clickTrack()) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    });

    it('reads off while the robot plays its melody and on while it plays the Click Track', () => {
      const off = renderSection({ clickTrackActive: false }, { onClickTrackActiveChange: () => {} });
      expect(clickTrack().getAttribute('aria-checked')).toBe('false');
      off.unmount();

      renderSection({ clickTrackActive: true }, { onClickTrackActiveChange: () => {} });
      expect(clickTrack().getAttribute('aria-checked')).toBe('true');
    });

    it('a flip calls onClickTrackActiveChange once with the new state: on from off, off from on', () => {
      const turnOn = vi.fn();
      const off = renderSection({ clickTrackActive: false }, { onClickTrackActiveChange: turnOn });
      fireEvent.click(clickTrack());
      expect(turnOn).toHaveBeenCalledTimes(1);
      expect(turnOn).toHaveBeenCalledWith(true);
      off.unmount();

      const turnOff = vi.fn();
      renderSection({ clickTrackActive: true }, { onClickTrackActiveChange: turnOff });
      fireEvent.click(clickTrack());
      expect(turnOff).toHaveBeenCalledTimes(1);
      expect(turnOff).toHaveBeenCalledWith(false);
    });

    it('leaves every slider live while the Click Track plays: an edit changes the melody heard once it is off', () => {
      renderSection({ clickTrackActive: true, rhythmicMotifLength: 4 }, { onClickTrackActiveChange: () => {} });
      for (const name of [/density/i, /phrase length/i, /pitch repeat/i, /note variance/i]) {
        expect(screen.getByRole('slider', { name }).getAttribute('data-disabled')).toBeNull();
      }
    });

    it('is disabled with the rest of the section', () => {
      renderSection({}, { disabled: true, onClickTrackActiveChange: () => {} });
      expect((clickTrack() as HTMLButtonElement).disabled).toBe(true);
    });

    it('is absent when DEV_TUNING is false, handler or not: never reachable in a production build', () => {
      mockDevTuning = false;
      renderSection({}, { onClickTrackActiveChange: () => {} });
      expect(screen.queryByRole('switch', { name: /Click Track/i })).toBeNull();
      expect(screen.getByRole('slider', { name: /density/i })).toBeTruthy();
    });
  });
});

// docs/specs/ROBOT_PERFORMANCE.md §1.6 (docs/tasks/ROBOT_PERFORMANCE.md Task 10) - the Articulation row: Rests and Accents,
// a labelled responsive panel after the three composition rows. The plan placed it in the retired PHRASING panel of the
// old combined drawer; the screens render this section, so that is where it lives (a deviation recorded in the plan).
describe('CompositionDetailsSection — Articulation row (Robot Performance Task 10)', () => {
  const restsSlider = () => screen.getByRole('slider', { name: /^rests/i });
  const accentsSlider = () => screen.getByRole('slider', { name: /^accents/i });
  const handlers = () => ({
    onOctaveMinChange: vi.fn(), onOctaveMaxChange: vi.fn(), onRestsChange: vi.fn(), onAccentsChange: vi.fn(),
  });
  function renderRow(overrides: Partial<PingControlsValue> = {}, extra: { disabled?: boolean } & Partial<ReturnType<typeof handlers>> = {}) {
    const h = { ...handlers(), ...extra };
    render(<CompositionDetailsSection value={makeValue(overrides)} {...h} />);
    return h;
  }
  const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('renders Rests then Accents, ahead of the Octave sliders (control layout Task 14: Details, no Articulation heading)', () => {
    renderRow();

    expect(before(restsSlider(), accentsSlider())).toBe(true);
    expect(before(accentsSlider(), screen.getByRole('slider', { name: /octave min/i }))).toBe(true);
  });

  it('puts both sliders in one row of their own, apart from Density and Pitch Repeat', () => {
    renderRow();

    const panel = restsSlider().closest('[data-panel-id="robotOptions.details.p1.r1"]')!;
    expect(panel).not.toBeNull();
    expect(panel.contains(accentsSlider())).toBe(true);
  });

  it('shows each stored 0-100 number as is, with a 0..100 range', () => {
    renderRow({ rests: 35, accents: 80 });

    expect(restsSlider().getAttribute('aria-valuenow')).toBe('35');
    expect(accentsSlider().getAttribute('aria-valuenow')).toBe('80');
    [restsSlider(), accentsSlider()].forEach((s) => {
      expect(s.getAttribute('aria-valuemin')).toBe('0');
      expect(s.getAttribute('aria-valuemax')).toBe('100');
    });
  });

  it('reaches both ends of the travel: 0 shows 0 and 100 shows 100', () => {
    const zero = render(<CompositionDetailsSection value={makeValue({ rests: 0, accents: 0 })} {...handlers()} />);
    expect(restsSlider().getAttribute('aria-valuenow')).toBe('0');
    expect(accentsSlider().getAttribute('aria-valuenow')).toBe('0');
    zero.unmount();

    render(<CompositionDetailsSection value={makeValue({ rests: 100, accents: 100 })} {...handlers()} />);
    expect(restsSlider().getAttribute('aria-valuenow')).toBe('100');
    expect(accentsSlider().getAttribute('aria-valuenow')).toBe('100');
  });

  it('a Rests step calls onRestsChange with the next whole number, and nothing else', () => {
    const h = renderRow({ rests: 40 });

    fireEvent.keyDown(restsSlider(), { key: 'ArrowRight' });

    expect(h.onRestsChange).toHaveBeenCalledTimes(1);
    expect(h.onRestsChange).toHaveBeenCalledWith(41);
    Object.entries(h).filter(([name]) => name !== 'onRestsChange').forEach(([name, fn]) => expect(fn, name).not.toHaveBeenCalled());
  });

  it('an Accents step calls onAccentsChange with the next whole number, and nothing else', () => {
    const h = renderRow({ accents: 60 });

    fireEvent.keyDown(accentsSlider(), { key: 'ArrowRight' });

    expect(h.onAccentsChange).toHaveBeenCalledTimes(1);
    expect(h.onAccentsChange).toHaveBeenCalledWith(61);
    Object.entries(h).filter(([name]) => name !== 'onAccentsChange').forEach(([name, fn]) => expect(fn, name).not.toHaveBeenCalled());
  });

  it('Home and End drive each slider to 0 and 100, every call a whole number in range', () => {
    const h = renderRow({ rests: 40, accents: 60 });

    fireEvent.keyDown(restsSlider(), { key: 'End' });
    fireEvent.keyDown(restsSlider(), { key: 'Home' });
    fireEvent.keyDown(accentsSlider(), { key: 'End' });
    fireEvent.keyDown(accentsSlider(), { key: 'Home' });

    expect(h.onRestsChange.mock.calls.map(([n]) => n)).toEqual([100, 0]);
    expect(h.onAccentsChange.mock.calls.map(([n]) => n)).toEqual([100, 0]);
  });

  it('disabled greys and silences both sliders', () => {
    const h = renderRow({}, { disabled: true });

    expect(restsSlider().getAttribute('data-disabled')).toBe('');
    expect(accentsSlider().getAttribute('data-disabled')).toBe('');
    fireEvent.keyDown(restsSlider(), { key: 'ArrowRight' });
    fireEvent.keyDown(accentsSlider(), { key: 'ArrowRight' });
    expect(h.onRestsChange).not.toHaveBeenCalled();
    expect(h.onAccentsChange).not.toHaveBeenCalled();
  });

  it('is enabled by default, and with Phrase Length at 0 (unlike Pitch Repeat they need no tiled motif)', () => {
    renderRow({ rhythmicMotifLength: 0 });

    expect(restsSlider().getAttribute('data-disabled')).toBeNull();
    expect(accentsSlider().getAttribute('data-disabled')).toBeNull();
  });

  it('carries a help button named for each slider', () => {
    renderRow();

    expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.composition.rests'].human }) })).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.composition.accents'].human }) })).toBeTruthy();
  });
});
