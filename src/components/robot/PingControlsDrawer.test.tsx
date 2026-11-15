import type { CSSProperties } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mutable so the Click Track dev-gating tests can flip DEV_TUNING false without faking
// import.meta.env.DEV directly — same pattern lfoDebug.test.ts already uses for the same flag.
let mockDevTuning = true;
vi.mock('@/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/constants')>();
  return { ...actual, get DEV_TUNING() { return mockDevTuning; } };
});

import { PingControlsCompositionSection, type PingControlsValue } from './PingControlsDrawer';
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
    ...overrides,
  };
}

describe('PingControlsCompositionSection (docs/reference/layout-updates.md) — merges Rhythm/Pitches into one accordion', () => {
  beforeEach(() => {
    mockDevTuning = true;
  });

  function renderSection(
    overrides: Partial<PingControlsValue> = {},
    extra: { disabled?: boolean; onClickTrackActiveChange?: (active: boolean) => void } = {},
  ) {
    const value = makeValue(overrides);
    return render(
      <PingControlsCompositionSection
        value={value}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onPitchRepeatChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onRestsChange={() => {}}
        onAccentsChange={() => {}}
        {...extra}
      />,
    );
  }

  it('renders Density, Motif Length, Pitch Repeat, Note Variance, Octave Min, Octave Max — and no Click Track toggle without a Click Track handler', () => {
    renderSection();

    expect(screen.getByRole('slider', { name: /density/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /phrase length/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /pitch repeat/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /note variance/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /octave min/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /octave max/i })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: /Click Track/i })).toBeNull();
  });

  it('never renders a Reset Melody button — removed entirely (Deterministic Robot Melody Generation, Task 8)', () => {
    renderSection();
    expect(screen.queryByRole('button', { name: 'Reset Melody' })).toBeNull();
  });

  it('changing each field calls its own onChange with the raw number', () => {
    const onDensityChange = vi.fn();
    const onMotifLengthChange = vi.fn();
    const onPitchRepeatChange = vi.fn();
    const onOctaveMinChange = vi.fn();
    const onOctaveMaxChange = vi.fn();
    const onNoteVarianceChange = vi.fn();
    render(
      <PingControlsCompositionSection
        value={makeValue({ rhythmicMotifLength: 4, pitchRepeat: 10 })}
        onDensityChange={onDensityChange}
        onMotifLengthChange={onMotifLengthChange}
        onPitchRepeatChange={onPitchRepeatChange}
        onOctaveMinChange={onOctaveMinChange}
        onOctaveMaxChange={onOctaveMaxChange}
        onNoteVarianceChange={onNoteVarianceChange}
        onRestsChange={() => {}}
        onAccentsChange={() => {}}
      />,
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /density/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /phrase length/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /pitch repeat/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /octave min/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /octave max/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /note variance/i }), { key: 'ArrowRight' });

    expect(onDensityChange).toHaveBeenCalledWith(51);
    expect(onMotifLengthChange).toHaveBeenCalledWith(5);
    expect(onPitchRepeatChange).toHaveBeenCalledWith(11);
    expect(onOctaveMinChange).toHaveBeenCalled();
    expect(onOctaveMaxChange).toHaveBeenCalled();
    expect(onNoteVarianceChange).toHaveBeenCalled();
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

    it('renders a Click Track toggle, labelled Click Track, first in the section, before Density', () => {
      renderSection({}, { onClickTrackActiveChange: () => {} });
      expect(clickTrack().textContent).toBe(CONTENT['probe.composition.clickTrack'].human);
      const density = screen.getByRole('slider', { name: /density/i });
      expect(!!(clickTrack().compareDocumentPosition(density) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
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
      for (const name of [/density/i, /phrase length/i, /pitch repeat/i, /note variance/i, /octave min/i, /octave max/i, /^rests/i, /^accents/i]) {
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

  it('forwards an optional style to its own root', () => {
    const { container } = render(
      <PingControlsCompositionSection
        value={makeValue()}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onPitchRepeatChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onRestsChange={() => {}}
        onAccentsChange={() => {}}
        style={{ '--color-accent-a': '#68cb97' } as CSSProperties}
      />,
    );
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--color-accent-a')).toBe('#68cb97');
  });
});

// docs/specs/ROBOT_PERFORMANCE.md §1.6 (docs/tasks/ROBOT_PERFORMANCE.md Task 10) - the Articulation row: Rests and Accents,
// a labelled responsive panel after the three composition rows. The plan placed it in the retired PHRASING panel of the
// old combined drawer; the screens render this section, so that is where it lives (a deviation recorded in the plan).
describe('PingControlsCompositionSection — Articulation row (Robot Performance Task 10)', () => {
  const restsSlider = () => screen.getByRole('slider', { name: /^rests/i });
  const accentsSlider = () => screen.getByRole('slider', { name: /^accents/i });
  const handlers = () => ({
    onDensityChange: vi.fn(), onMotifLengthChange: vi.fn(), onPitchRepeatChange: vi.fn(), onOctaveMinChange: vi.fn(),
    onOctaveMaxChange: vi.fn(), onNoteVarianceChange: vi.fn(), onRestsChange: vi.fn(), onAccentsChange: vi.fn(),
  });
  function renderRow(overrides: Partial<PingControlsValue> = {}, extra: { disabled?: boolean } & Partial<ReturnType<typeof handlers>> = {}) {
    const h = { ...handlers(), ...extra };
    render(<PingControlsCompositionSection value={makeValue(overrides)} {...h} />);
    return h;
  }
  const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('renders Rests then Accents under an Articulation heading, after the Octave sliders', () => {
    renderRow();

    expect(screen.getByText(CONTENT['probe.composition.articulation'].human)).toBeTruthy();
    expect(before(screen.getByRole('slider', { name: /octave max/i }), restsSlider())).toBe(true);
    expect(before(restsSlider(), accentsSlider())).toBe(true);
  });

  it('puts both sliders in one panel of their own, apart from Density and Pitch Repeat', () => {
    renderRow();

    const panel = restsSlider().closest('[data-panel-id="robotOptions.articulation"]')!;
    expect(panel).not.toBeNull();
    expect(panel.contains(accentsSlider())).toBe(true);
    expect(panel.contains(screen.getByRole('slider', { name: /density/i }))).toBe(false);
    expect(panel.contains(screen.getByRole('slider', { name: /pitch repeat/i }))).toBe(false);
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
    const zero = render(<PingControlsCompositionSection value={makeValue({ rests: 0, accents: 0 })} {...handlers()} />);
    expect(restsSlider().getAttribute('aria-valuenow')).toBe('0');
    expect(accentsSlider().getAttribute('aria-valuenow')).toBe('0');
    zero.unmount();

    render(<PingControlsCompositionSection value={makeValue({ rests: 100, accents: 100 })} {...handlers()} />);
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
    expect(screen.getByRole('slider', { name: /pitch repeat/i }).getAttribute('data-disabled')).toBe('');
  });

  it('carries a help button named for each slider', () => {
    renderRow();

    expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.composition.rests'].human }) })).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.composition.accents'].human }) })).toBeTruthy();
  });
});
