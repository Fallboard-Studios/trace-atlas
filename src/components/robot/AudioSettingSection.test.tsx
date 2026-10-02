import type { CSSProperties } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Same reasoning as AudioRigDrawer/SignatureArrayDrawer's own test files: the shared
// vitest.setup.ts GSAP mock's timeline object has no kill() method, and a child's unmount
// cleanup calls killTimeline on an already-registered entry.
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Spied (real cross-module call, wrapped so it still delegates to the actual implementation) so
// a per-field cascade regression test (docs/todo/backlog.md #27 follow-up, 2026-09-15) can tell
// which specific control's render body actually re-executed — resolveAccessibleName is called
// unconditionally by RadioButton/SliderLinear, and receives the schema, so calls can be filtered
// by schema.id to attribute them to a specific field.
vi.mock('@/components/ui/controls/accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { AudioSettingSection } from './AudioSettingSection';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { AUDIO_SETTING_SCHEMA } from '@/data/robotOptionsConfig';
import type { Robot } from '@/types/Robot';

/** Stubs window.matchMedia so the mobile/tablet viewport tiers can be controlled — same shape
 *  as AudioRigDrawer.test.tsx's own stubMatchMedia, since the Volume row's 'responsive'
 *  orientation resolves through the same useResponsivePanelOrientation/useCabinetTier tiers. */
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

function makeValue(overrides: Partial<{ audioMode: NonNullable<Robot['audioMode']>; masterVolume: number }> = {}) {
  return {
    audioMode: 'none' as NonNullable<Robot['audioMode']>,
    masterVolume: 0.42,
    ...overrides,
  };
}

describe('AudioSettingSection', () => {
  it('Audio Setting radio includes all 4 options and calls onAudioModeChange with the selected value', () => {
    const onAudioModeChange = vi.fn();
    render(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={onAudioModeChange}
        onVolumeChange={() => {}}
      />
    );

    ['Auto', 'Mute', 'Solo', 'Highlight'].forEach((label) => {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Solo' }));
    expect(onAudioModeChange).toHaveBeenCalledWith('solo');
  });

  it('Volume slider displays 0-100% of the 0..1 masterVolume value', () => {
    render(
      <AudioSettingSection
        value={makeValue({ masterVolume: 0.42 })}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}}
      />
    );

    const slider = screen.getByRole('slider', { name: /volume/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('42');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
  });

  it('a Volume edit calls onVolumeChange with the new percent (0-100), not the 0..1 fraction', () => {
    const onVolumeChange = vi.fn();
    render(
      <AudioSettingSection
        value={makeValue({ masterVolume: 0.42 })}
        onAudioModeChange={() => {}}
        onVolumeChange={onVolumeChange}
      />
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });

    expect(onVolumeChange).toHaveBeenCalledWith(43); // one 1% step up from 42%
  });

  // The Volume LFO target was removed outright (docs/specs/LFO_LOAD_FIX.md assumption 9 /
  // §1.4, Crawford 2026-09-30: "not as impactful as I had hoped") — this section is now Mode +
  // Volume only. The shared LFO display, its held-off greying and the volumeLfo props are gone.
  describe('no Volume LFO (LFO Load Fix Task 2)', () => {
    it('renders Mode and Volume and no LFO frame — no .sc-lfo, no Rate/Depth slider, no accordion', () => {
      const { container } = render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} />
      );
      expect(screen.getByRole('radio', { name: 'Solo' })).toBeTruthy();
      expect(screen.getByRole('slider', { name: /volume/i })).toBeTruthy();
      expect(container.querySelector('.sc-lfo')).toBeNull();
      expect(container.querySelector('.sc-lfo-target-group__display')).toBeNull();
      expect(screen.queryByRole('slider', { name: 'Rate' })).toBeNull();
      expect(screen.queryByRole('slider', { name: 'Depth' })).toBeNull();
      expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    });

    it('never renders the held-off label — there is no LFO left to hold off', () => {
      render(<AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} />);
      expect(screen.queryByText('Held off by Audio Load')).toBeNull();
    });

    it('the props type carries no volumeLfo / onVolumeLfoChange / volumeLfoHeldOff members (compile-time)', () => {
      // Each line is a type error once the props are gone; a stray prop silently accepted would
      // mean the removal is incomplete. Runtime: render ignores unknown props, so this stays green.
      // One element per line: TS reports an unknown-attribute error on the element's opening tag,
      // so each directive must sit directly above a single-line element.
      const value = makeValue();
      const noop = () => {};
      // @ts-expect-error volumeLfo no longer exists on AudioSettingValue
      render(<AudioSettingSection value={{ ...value, volumeLfo: { shape: 'sine', rate: 0, depth: 20 } }} onAudioModeChange={noop} onVolumeChange={noop} />);
      // @ts-expect-error onVolumeLfoChange no longer exists
      render(<AudioSettingSection value={value} onAudioModeChange={noop} onVolumeChange={noop} onVolumeLfoChange={noop} />);
      // @ts-expect-error volumeLfoHeldOff no longer exists
      render(<AudioSettingSection value={value} onAudioModeChange={noop} onVolumeChange={noop} volumeLfoHeldOff />);
      expect(screen.getAllByRole('radio', { name: 'Solo' })).toHaveLength(3);
    });
  });

  describe('Volume layout (was "always above its LFO"; the LFO is gone, the column stays)', () => {
    it('the Audio Setting radio and Volume slider both render inside the settings-column panel', () => {
      render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} />
      );
      // The settings-column panel (Audio Setting + Volume) is the innermost .sc-directional-panel
      // containing the radio.
      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(settingsColumn.contains(screen.getByRole('slider', { name: /volume/i }))).toBe(true);
    });

    it("the Volume row is not a flex container — 'audio-setting-section__row' adds display:flex, which shrinks a lone flex item (the slider) to its own content width instead of the row's full width, breaking useVoxelTrackBoxCount's self-observation (same pattern audio-rig-drawer__param-row / sc-lfo-target-group__row already avoid elsewhere by carrying no display rule at all)", () => {
      render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} />
      );
      const volumeRow = screen.getByRole('slider', { name: /volume/i }).closest('.audio-setting-section__volume-row')!;
      expect(volumeRow).not.toBeNull();
      expect(volumeRow.classList.contains('audio-setting-section__row')).toBe(false);
    });

    it('renders data-orientation="column" on the outer panel regardless of tier — Audio Setting then Volume, always stacked, never a side-by-side desktop split', () => {
      for (const state of [{ mobile: true, tablet: true }, { mobile: false, tablet: false }]) {
        stubMatchMedia(state);
        const { unmount } = render(
          <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} />
        );
        const outerContent = screen.getByRole('radio', { name: 'Solo' })
          .closest('.sc-directional-panel')! // settings-column panel
          .parentElement!; // VOLUME_ROW_PANEL_SCHEMA's own .sc-directional-panel__content
        expect(outerContent.getAttribute('data-orientation')).toBe('column');
        unmount();
      }
    });

    it('the settings-column panel is always column-oriented too, regardless of tier — Audio Setting above Volume', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} />
      );
      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(settingsColumn.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('the Volume row no longer carries LFO-group targeting (no sc-lfo-target-group__row, no isActive) — there is nothing left to target', () => {
      const { container } = render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} />
      );
      expect(container.querySelector('.sc-lfo-target-group__row')).toBeNull();
      expect(screen.getByRole('slider', { name: /volume/i }).closest('.isActive')).toBeNull();
    });
  });

  it('is not disabled by default', () => {
    render(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}}
      />
    );
    expect(screen.getByRole('radio', { name: 'Solo' }).getAttribute('data-disabled')).toBeNull();
  });

  it('disables Audio Setting and Volume when disabled is true', () => {
    render(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}}
        disabled
      />
    );
    expect(screen.getByRole('radio', { name: 'Solo' }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider', { name: /volume/i }).getAttribute('data-disabled')).toBe('');
  });

  it('does not call onAudioModeChange or onVolumeChange when disabled', () => {
    const onAudioModeChange = vi.fn();
    const onVolumeChange = vi.fn();
    render(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={onAudioModeChange}
        onVolumeChange={onVolumeChange}
        disabled
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Solo' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });

    expect(onAudioModeChange).not.toHaveBeenCalled();
    expect(onVolumeChange).not.toHaveBeenCalled();
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 11) — an optional
  // `style` prop forwarded to this section's own root (Task 18 follow-up, docs/tasks/
  // NAV_LAYOUT_REWRITE.md: moved from the now-removed accordion wrapper to the plain
  // .audio-setting-section root), for trait-color scoping (getTraitColorStyle('output'), applied
  // at the RobotOptionsTab call site in Task 12).
  describe('style prop', () => {
    it('forwards a caller-supplied style to the section\'s own root', () => {
      const { container } = render(
        <AudioSettingSection
          value={makeValue()}
          onAudioModeChange={() => {}}
          onVolumeChange={() => {}}
          style={{ '--color-accent-a': '#cd5e57', '--color-accent-b': '#da7e1b' } as CSSProperties}
        />,
      );
      const root = container.querySelector('.audio-setting-section') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#cd5e57');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#da7e1b');
    });

    it('renders with no inline style when the prop is omitted — existing consumers unaffected', () => {
      const { container } = render(
        <AudioSettingSection
          value={makeValue()}
          onAudioModeChange={() => {}}
          onVolumeChange={() => {}}
        />,
      );
      const root = container.querySelector('.audio-setting-section') as HTMLElement;
      expect(root.getAttribute('style')).toBeNull();
    });
  });

  describe('React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((AudioSettingSection as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  describe('per-field cascade regression (docs/todo/backlog.md #27 follow-up, 2026-09-15)', () => {
    // Found live: editing Volume re-rendered the Audio Setting RadioButton too. Root cause —
    // `onChange={(v) => onAudioModeChange(v as Robot['audioMode'])}` was a fresh inline closure
    // built every render, so whenever `value` changed (any field), the already-memoized
    // RadioButton got a new `onChange` reference regardless of whether audioMode itself changed.
    it('changing Volume does not re-render the Audio Setting radio', () => {
      const onAudioModeChange = vi.fn();
      const { rerender } = render(
        <AudioSettingSection value={makeValue({ masterVolume: 0.42 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} />
      );
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(
        <AudioSettingSection value={makeValue({ masterVolume: 0.55 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} />
      );

      const radioCalls = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls
        .filter(([schema]) => schema.id === AUDIO_SETTING_SCHEMA.id).length;
      expect(radioCalls).toBe(0);
    });
  });

});
