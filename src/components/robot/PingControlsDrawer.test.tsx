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

import { PingControlsDrawer, type PingControlsValue } from './PingControlsDrawer';


function makeValue(overrides: Partial<PingControlsValue> = {}): PingControlsValue {
  return {
    rhythmicDensity: 50,
    rhythmicMotifLength: 8,
    noteVariance: 0,
    pitchRepeat: 0,
    octaveRange: [3, 5],
    clickTrackActive: false,
    ...overrides,
  };
}

describe('PingControlsDrawer', () => {
  beforeEach(() => {
    mockDevTuning = true;
  });

  it('renders 2 nested panels — Phrasing and Frequency — with no accordion wrapper (docs/tasks/NAV_LAYOUT_REWRITE.md Task 15: the "Melody" label now lives on the tree node itself, not this drawer)', () => {
    const { container } = render(
      <PingControlsDrawer
        value={makeValue()}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );
    expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    expect(screen.queryByText('Melody')).toBeNull();
    expect(screen.getByText('Phrasing')).toBeTruthy();
    expect(screen.getByText('Frequency')).toBeTruthy();
    expect(screen.queryByText('Ping Controls')).toBeNull(); // old flat accordion label is gone
  });

  it('Density, Motif Length, and Pitch Repeat render inside the Phrasing panel; Octave Min/Max and Note Variance render inside the Frequency panel', () => {
    render(
      <PingControlsDrawer
        value={makeValue()}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
        onResetMelody={() => {}}
      />
    );
    const phrasingPanel = screen.getByText('Phrasing').closest('.sc-directional-panel')!;
    const frequencyPanel = screen.getByText('Frequency').closest('.sc-directional-panel')!;

    expect(phrasingPanel.contains(screen.getByRole('slider', { name: /density/i }))).toBe(true);
    expect(phrasingPanel.contains(screen.getByRole('slider', { name: /motif length/i }))).toBe(true);
    expect(phrasingPanel.contains(screen.getByRole('slider', { name: /pitch repeat/i }))).toBe(true);
    expect(phrasingPanel.contains(screen.getByRole('switch', { name: /Click Track/i }))).toBe(true);
    expect(phrasingPanel.contains(screen.getByRole('button', { name: 'Reset Melody' }))).toBe(true);

    expect(frequencyPanel.contains(screen.getByRole('slider', { name: /octave range min/i }))).toBe(true);
    expect(frequencyPanel.contains(screen.getByRole('slider', { name: /octave range max/i }))).toBe(true);
    expect(frequencyPanel.contains(screen.getByRole('slider', { name: /note variance/i }))).toBe(true);
  });

  it('changing Density calls onDensityChange', () => {
    const onDensityChange = vi.fn();
    render(
      <PingControlsDrawer
        value={makeValue()}
        onDensityChange={onDensityChange}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /density/i }), { key: 'ArrowRight' });

    expect(onDensityChange).toHaveBeenCalledWith(51);
  });

  it('changing Motif Length calls onMotifLengthChange with the raw number, no object wrapping', () => {
    const onMotifLengthChange = vi.fn();
    render(
      <PingControlsDrawer
        value={makeValue({ rhythmicMotifLength: 4 })}
        onDensityChange={() => {}}
        onMotifLengthChange={onMotifLengthChange}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /motif length/i }), { key: 'ArrowRight' });

    expect(onMotifLengthChange).toHaveBeenCalledWith(5);
  });

  it('Motif Length slider reaches 0 and stays interactive there — never disabled purely because its own value is 0', () => {
    render(
      <PingControlsDrawer
        value={makeValue({ rhythmicMotifLength: 0 })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    const slider = screen.getByRole('slider', { name: /motif length/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    expect(slider.getAttribute('data-disabled')).toBeNull();
  });

  it('changing Octave Range Min calls onOctaveMinChange', () => {
    const onOctaveMinChange = vi.fn();
    render(
      <PingControlsDrawer
        value={makeValue({ octaveRange: [3, 5] })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={onOctaveMinChange}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /octave range min/i }), { key: 'ArrowRight' });

    expect(onOctaveMinChange).toHaveBeenCalledWith(4);
  });

  it('changing Octave Range Max calls onOctaveMaxChange', () => {
    const onOctaveMaxChange = vi.fn();
    render(
      <PingControlsDrawer
        value={makeValue({ octaveRange: [3, 5] })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={onOctaveMaxChange}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /octave range max/i }), { key: 'ArrowLeft' });

    expect(onOctaveMaxChange).toHaveBeenCalledWith(4);
  });

  it('changing Note Variance calls onNoteVarianceChange with the raw number, no object wrapping', () => {
    const onNoteVarianceChange = vi.fn();
    render(
      <PingControlsDrawer
        value={makeValue({ noteVariance: 3 })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={onNoteVarianceChange}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /note variance/i }), { key: 'ArrowRight' });

    expect(onNoteVarianceChange).toHaveBeenCalledWith(4);
  });

  it('Note Variance slider reaches 0 and stays interactive there — never disabled purely because its own value is 0', () => {
    render(
      <PingControlsDrawer
        value={makeValue({ noteVariance: 0 })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    const slider = screen.getByRole('slider', { name: /note variance/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    expect(slider.getAttribute('data-disabled')).toBeNull();
  });

  it('changing Pitch Repeat calls onPitchRepeatChange', () => {
    const onPitchRepeatChange = vi.fn();
    render(
      <PingControlsDrawer
        value={makeValue({ pitchRepeat: 50, rhythmicMotifLength: 8 })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={onPitchRepeatChange}
      />
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /pitch repeat/i }), { key: 'ArrowRight' });

    expect(onPitchRepeatChange).toHaveBeenCalledWith(51);
  });

  it('Pitch Repeat is disabled when rhythmicMotifLength is 0, even though generationDisabled is otherwise false', () => {
    render(
      <PingControlsDrawer
        value={makeValue({ rhythmicMotifLength: 0 })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    // Density is NOT disabled here (motif being off doesn't gate it) — contrast confirms the
    // Pitch Repeat disabled state comes specifically from the motif gate, not generationDisabled.
    expect(screen.getByRole('slider', { name: /density/i }).getAttribute('data-disabled')).toBeNull();
    expect(screen.getByRole('slider', { name: /pitch repeat/i }).getAttribute('data-disabled')).toBe('');
  });

  it('Pitch Repeat is enabled when rhythmicMotifLength is nonzero and nothing else disables generation', () => {
    render(
      <PingControlsDrawer
        value={makeValue({ rhythmicMotifLength: 8 })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    expect(screen.getByRole('slider', { name: /pitch repeat/i }).getAttribute('data-disabled')).toBeNull();
  });

  it('Reset Melody is a plain one-click Button when onResetMelody is provided - no confirmation dialog', () => {
    const onResetMelody = vi.fn();
    render(
      <PingControlsDrawer
        value={makeValue()}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
        onResetMelody={onResetMelody}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Melody' }));

    expect(onResetMelody).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('omits the Reset Melody button entirely when onResetMelody is not provided (company mode)', () => {
    render(
      <PingControlsDrawer
        value={makeValue()}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: 'Reset Melody' })).toBeNull();
  });

  it('renders the Click Track toggle regardless of mode — unlike Reset Melody, it has a company-scoped meaning', () => {
    render(
      <PingControlsDrawer
        value={makeValue()}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    expect(screen.getByRole('switch', { name: /Click Track/i })).toBeTruthy();
  });

  it('shows "Click Track" as the toggle\'s own facade content, not external label text', () => {
    render(
      <PingControlsDrawer
        value={makeValue()}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    expect(screen.getByRole('switch', { name: /Click Track/i }).textContent).toBe('Click Track');
  });

  it('omits the Click Track toggle entirely when DEV_TUNING is false — never reachable in a production build', () => {
    mockDevTuning = false;
    render(
      <PingControlsDrawer
        value={makeValue()}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
      />
    );

    expect(screen.queryByRole('switch', { name: /Click Track/i })).toBeNull();
  });

  it('toggling Click Track calls onClickTrackActiveChange', () => {
    const onClickTrackActiveChange = vi.fn();
    render(
      <PingControlsDrawer
        value={makeValue({ clickTrackActive: false })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={onClickTrackActiveChange}
        onPitchRepeatChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('switch', { name: /Click Track/i }));

    expect(onClickTrackActiveChange).toHaveBeenCalledWith(true);
  });

  it('disables Density/Motif Length/Octave Range/Note Variance/Reset Melody, but not the Click Track toggle itself, while Click Track is active', () => {
    render(
      <PingControlsDrawer
        value={makeValue({ clickTrackActive: true })}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
        onResetMelody={() => {}}
      />
    );

    expect(screen.getByRole('slider', { name: /density/i }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider', { name: /motif length/i }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider', { name: /octave range min/i }).getAttribute('data-disabled')).toBe('');
    expect((screen.getByRole('button', { name: 'Reset Melody' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('switch', { name: /Click Track/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('slider', { name: /pitch repeat/i }).getAttribute('data-disabled')).toBe('');
  });

  it('disables every internal control, including Click Track, when disabled is true', () => {
    render(
      <PingControlsDrawer
        value={makeValue()}
        onDensityChange={() => {}}
        onMotifLengthChange={() => {}}
        onOctaveMinChange={() => {}}
        onOctaveMaxChange={() => {}}
        onNoteVarianceChange={() => {}}
        onClickTrackActiveChange={() => {}}
        onPitchRepeatChange={() => {}}
        disabled
      />
    );

    expect(screen.getByRole('slider', { name: /density/i }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider', { name: /motif length/i }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider', { name: /octave range min/i }).getAttribute('data-disabled')).toBe('');
    expect((screen.getByRole('switch', { name: /Click Track/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('slider', { name: /pitch repeat/i }).getAttribute('data-disabled')).toBe('');
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 10) — an optional
  // `style` prop forwarded to this drawer's own root (Task 15, docs/tasks/NAV_LAYOUT_REWRITE.md:
  // moved from the now-removed accordion wrapper to the plain .ping-controls-drawer
  // root), for trait-color scoping (getTraitColorStyle('composition'), applied at the
  // RobotOptionsTab call site in Task 12).
  describe('style prop', () => {
    function renderDrawer(style?: CSSProperties) {
      return render(
        <PingControlsDrawer
          value={makeValue()}
          onDensityChange={() => {}}
          onMotifLengthChange={() => {}}
          onOctaveMinChange={() => {}}
          onOctaveMaxChange={() => {}}
          onNoteVarianceChange={() => {}}
          onClickTrackActiveChange={() => {}}
          onPitchRepeatChange={() => {}}
          style={style}
        />,
      );
    }

    it('forwards a caller-supplied style to the drawer\'s own root', () => {
      const { container } = renderDrawer({ '--color-accent-a': '#68cb97', '--color-accent-b': '#a9e583' } as CSSProperties);
      const root = container.querySelector('.ping-controls-drawer') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#68cb97');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#a9e583');
    });

    it('renders with no inline style when the prop is omitted — existing consumers unaffected', () => {
      const { container } = renderDrawer(undefined);
      const root = container.querySelector('.ping-controls-drawer') as HTMLElement;
      expect(root.getAttribute('style')).toBeNull();
    });
  });

  describe('React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 2)', () => {
    // No internal instability in this component (unlike AudioSettingSection/PingContourDrawer/
    // RobotDisplaySection) — every schema is already a module-level constant and every onChange
    // passes straight through, unwrapped. That also means a delegated render-count marker (e.g.
    // resolveAccessibleName, called inside the already-memoized SliderLinear/Toggle/Button this
    // drawer composes) can't distinguish "this drawer bailed" from "its children independently
    // bailed on their own stable props" — tried this first and confirmed it passes identically
    // with or without the React.memo wrap below, so it's not a real regression guard. The
    // meaningful end-to-end proof that this drawer's own memo matters lives in
    // RobotOptionsTab.test.tsx's cascade test (Task 6), where the caller's own prop stability is
    // what's actually varied. This structural check is what's provable in isolation.
    it('is a React.memo-wrapped component', () => {
      expect((PingControlsDrawer as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });
});
