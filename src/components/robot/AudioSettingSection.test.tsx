import type { CSSProperties, ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Same reasoning as AudioRigDrawer/SignatureArrayDrawer's own test files: the shared
// vitest.setup.ts GSAP mock's timeline object has no kill() method, and useLfoTargetGroup's
// unmount cleanup calls killTimeline on an already-registered entry.
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Captures every `schema` prop the real Lfo component receives, without replacing its actual
// rendering (Lfo is itself already React.memo-wrapped, so it can't be spied on via vi.fn the way
// a plain function export can — Button.test.tsx's own resolveAccessibleName pattern doesn't apply
// here) — docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1's own schema-stability regression
// test needs this to prove the inline schema object this task fixes is genuinely stable across
// renders with the same displayLabel.
const capturedLfoSchemas = vi.hoisted(() => [] as unknown[]);
vi.mock('@/components/ui/controls/Lfo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/Lfo')>();
  function LfoSchemaCapture(props: ComponentProps<typeof actual.Lfo>) {
    capturedLfoSchemas.push(props.schema);
    return <actual.Lfo {...props} />;
  }
  return { ...actual, Lfo: LfoSchemaCapture };
});

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
import type { LfoValue } from '@/types/controls';
import type { Robot } from '@/types/Robot';
import { openAllAccordions } from '@/testUtils/openAccordions';

// AccordionContainer only mounts a section's controls once it has been opened (docs/specs/ACCORDION_LAZY_MOUNT.md), and
// every assertion in this file is about controls inside that section — so each render expands it first, exactly as a
// user would before touching a control. A test asserting that a section is *closed* would use plain render().
function renderOpen(ui: React.ReactElement) {
  const result = render(ui);
  openAllAccordions(result.container);
  return result;
}


const DEFAULT_VOLUME_LFO: LfoValue = { shape: 'sine', rate: 0, depth: 20 };

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

function makeValue(overrides: Partial<{ audioMode: NonNullable<Robot['audioMode']>; masterVolume: number; volumeLfo: LfoValue }> = {}) {
  return {
    audioMode: 'none' as NonNullable<Robot['audioMode']>,
    masterVolume: 0.42,
    volumeLfo: DEFAULT_VOLUME_LFO,
    ...overrides,
  };
}

describe('AudioSettingSection', () => {
  it('Audio Setting radio includes all 4 options and calls onAudioModeChange with the selected value', () => {
    const onAudioModeChange = vi.fn();
    renderOpen(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={onAudioModeChange}
        onVolumeChange={() => {}}
        onVolumeLfoChange={() => {}}
      />
    );

    ['Auto', 'Mute', 'Solo', 'Highlight'].forEach((label) => {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Solo' }));
    expect(onAudioModeChange).toHaveBeenCalledWith('solo');
  });

  it('Volume slider displays 0-100% of the 0..1 masterVolume value', () => {
    renderOpen(
      <AudioSettingSection
        value={makeValue({ masterVolume: 0.42 })}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}}
        onVolumeLfoChange={() => {}}
      />
    );

    const slider = screen.getByRole('slider', { name: /volume/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('42');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
  });

  it('a Volume edit calls onVolumeChange with the new percent (0-100), not the 0..1 fraction', () => {
    const onVolumeChange = vi.fn();
    renderOpen(
      <AudioSettingSection
        value={makeValue({ masterVolume: 0.42 })}
        onAudioModeChange={() => {}}
        onVolumeChange={onVolumeChange}
        onVolumeLfoChange={() => {}}
      />
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });

    expect(onVolumeChange).toHaveBeenCalledWith(43); // one 1% step up from 42%
  });

  describe('shared LFO display (LFO_CONSOLIDATED_DISPLAY — replaces the old nested "Modulation" accordion)', () => {
    it('renders Volume as a bare slider followed by its shared LFO display, inside exactly one Volume accordion (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.2)', () => {
      const { container } = renderOpen(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      const accordions = container.querySelectorAll('.sc-accordion');
      expect(accordions).toHaveLength(1);
      expect(accordions[0].querySelector('.sc-dual-label__human')?.textContent).toBe('Volume');
      // Rate + Depth from the shared Lfo display — no separate active toggle rendered.
      expect(screen.getAllByRole('slider', { name: 'Rate' })).toHaveLength(1);
      expect(screen.getAllByRole('slider', { name: 'Depth' })).toHaveLength(1);
    });

    it("the shared display's own label reads 'Volume' — from VOLUME_SCHEMA.humanLabel, no new copy", () => {
      const { container } = renderOpen(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      const display = container.querySelector('.sc-lfo-target-group__display')!;
      expect(display.textContent).toContain('Volume');
    });

    it('reflects volumeLfo and calls onVolumeLfoChange when the rate slider moves off 0', () => {
      const onVolumeLfoChange = vi.fn();
      renderOpen(
        <AudioSettingSection
          value={makeValue({ volumeLfo: { shape: 'sine', rate: 0, depth: 20 } })}
          onAudioModeChange={() => {}}
          onVolumeChange={() => {}}
          onVolumeLfoChange={onVolumeLfoChange}
        />
      );

      const rateSlider = screen.getByRole('slider', { name: 'Rate' });
      rateSlider.focus();
      fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });

      expect(onVolumeLfoChange).toHaveBeenCalledWith({ shape: 'sine', rate: 0.05, depth: 20 });
    });
  });

  describe('Volume accordion + 2-column desktop split (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.2)', () => {
    it('the Audio Setting radio and Volume slider both render inside the settings-column panel, and the Lfo display is a sibling of that panel', () => {
      renderOpen(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      // The settings-column panel (Audio Setting + Volume) is the innermost .sc-directional-panel
      // containing the radio.
      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(settingsColumn.contains(screen.getByRole('slider', { name: /volume/i }))).toBe(true);
      // The Lfo display (Rate/Depth) is NOT inside that same settings-column panel — it's a
      // sibling in the outer VOLUME_ROW_PANEL_SCHEMA row, not nested under the radio/slider pair.
      expect(settingsColumn.contains(screen.getByRole('slider', { name: 'Rate' }))).toBe(false);
    });

    it("the Volume row is not a flex container — 'audio-setting-section__row' adds display:flex, which shrinks a lone flex item (the slider) to its own content width instead of the row's full width, breaking useVoxelTrackBoxCount's self-observation (same pattern audio-rig-drawer__param-row / sc-lfo-target-group__row already avoid elsewhere by carrying no display rule at all)", () => {
      renderOpen(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      const volumeRow = screen.getByRole('slider', { name: /volume/i }).closest('.sc-lfo-target-group__row')!;
      expect(volumeRow.classList.contains('audio-setting-section__row')).toBe(false);
    });

    it('renders data-orientation="column" on the outer row panel when the mobile tier matches — everything stacks in one column', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      renderOpen(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      const outerRowContent = screen.getByRole('radio', { name: 'Solo' })
        .closest('.sc-directional-panel')! // settings-column panel
        .parentElement!; // VOLUME_ROW_PANEL_SCHEMA's own .sc-directional-panel__content
      expect(outerRowContent.getAttribute('data-orientation')).toBe('column');
    });

    it('renders data-orientation="row" on the outer row panel when neither tier matches (desktop) — settings column beside the Lfo display', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      renderOpen(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      const outerRowContent = settingsColumn.parentElement!;
      expect(outerRowContent.getAttribute('data-orientation')).toBe('row');
      // The Lfo display sits beside the settings column as a direct sibling of that same content div.
      const lfoDisplay = screen.getByRole('slider', { name: 'Rate' }).closest('.sc-lfo-target-group__display')!;
      expect(lfoDisplay.parentElement).toBe(outerRowContent);
    });

    it('the settings-column panel is always column-oriented, regardless of tier', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      renderOpen(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(settingsColumn.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('the Volume row carries the shared sc-lfo-target-group__row class and is targeted by default — the same targeting wiring AudioRigLfoGroup uses, even with only one field to target', () => {
      renderOpen(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      const volumeRow = screen.getByRole('slider', { name: /volume/i }).closest('.sc-lfo-target-group__row')!;
      expect(volumeRow).not.toBeNull();
      expect(volumeRow.classList.contains('isActive')).toBe(true);
    });
  });

  it('is not disabled by default', () => {
    renderOpen(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}}
        onVolumeLfoChange={() => {}}
      />
    );
    expect(screen.getByRole('radio', { name: 'Solo' }).getAttribute('data-disabled')).toBeNull();
  });

  it('disables Audio Setting, Volume, and the shared Volume LFO display\'s controls when disabled is true', () => {
    renderOpen(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}}
        onVolumeLfoChange={() => {}}
        disabled
      />
    );
    expect(screen.getByRole('radio', { name: 'Solo' }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider', { name: /volume/i }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('data-disabled')).toBe('');
  });

  it('does not call onAudioModeChange or onVolumeChange when disabled', () => {
    const onAudioModeChange = vi.fn();
    const onVolumeChange = vi.fn();
    renderOpen(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={onAudioModeChange}
        onVolumeChange={onVolumeChange}
        onVolumeLfoChange={() => {}}
        disabled
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Solo' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });

    expect(onAudioModeChange).not.toHaveBeenCalled();
    expect(onVolumeChange).not.toHaveBeenCalled();
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 11) — an optional
  // `style` prop forwarded to this section's own AccordionContainer, for trait-color scoping
  // (getTraitColorStyle('output'), applied at the RobotOptionsTab call site in Task 12).
  describe('style prop', () => {
    it('forwards a caller-supplied style to the section\'s own AccordionContainer root', () => {
      const { container } = renderOpen(
        <AudioSettingSection
          value={makeValue()}
          onAudioModeChange={() => {}}
          onVolumeChange={() => {}}
          onVolumeLfoChange={() => {}}
          style={{ '--color-accent-a': '#cd5e57', '--color-accent-b': '#da7e1b' } as CSSProperties}
        />,
      );
      const root = container.querySelector('.sc-accordion') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#cd5e57');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#da7e1b');
    });

    it('renders with no inline style when the prop is omitted — existing consumers unaffected', () => {
      const { container } = renderOpen(
        <AudioSettingSection
          value={makeValue()}
          onAudioModeChange={() => {}}
          onVolumeChange={() => {}}
          onVolumeLfoChange={() => {}}
        />,
      );
      const root = container.querySelector('.sc-accordion') as HTMLElement;
      expect(root.getAttribute('style')).toBeNull();
    });
  });

  describe('React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((AudioSettingSection as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('passes Lfo the same schema object reference across re-renders with the same displayLabel', () => {
      capturedLfoSchemas.length = 0;
      const { rerender } = renderOpen(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      rerender(
        <AudioSettingSection value={makeValue({ masterVolume: 0.55 })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );

      expect(capturedLfoSchemas.length).toBeGreaterThanOrEqual(2);
      expect(capturedLfoSchemas[1]).toBe(capturedLfoSchemas[0]);
    });
  });

  describe('per-field cascade regression (docs/todo/backlog.md #27 follow-up, 2026-09-15)', () => {
    // Found live: editing Volume re-rendered the Audio Setting RadioButton too. Root cause —
    // `onChange={(v) => onAudioModeChange(v as Robot['audioMode'])}` was a fresh inline closure
    // built every render, so whenever `value` changed (any field), the already-memoized
    // RadioButton got a new `onChange` reference regardless of whether audioMode itself changed.
    it('changing Volume does not re-render the Audio Setting radio', () => {
      const onAudioModeChange = vi.fn();
      const { rerender } = renderOpen(
        <AudioSettingSection value={makeValue({ masterVolume: 0.42 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(
        <AudioSettingSection value={makeValue({ masterVolume: 0.55 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} onVolumeLfoChange={() => {}} />
      );

      const radioCalls = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls
        .filter(([schema]) => schema.id === AUDIO_SETTING_SCHEMA.id).length;
      expect(radioCalls).toBe(0);
    });
  });

  // Audio Load Budget (plan task 22): the parent says this robot's Volume LFO is held off by the dial — the section stays a
  // pure value/prop component, so it just greys its LFO frame and says why.
  describe('Volume LFO held off by Audio Load', () => {
    const HELD = 'Held off by Audio Load';
    const rate = () => screen.getByRole('slider', { name: 'Rate' });
    const depth = () => screen.getByRole('slider', { name: 'Depth' });
    const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, onVolumeLfoChange: () => {} };

    it('greys out the LFO (controls disabled, stored values kept) and shows the label when held off', () => {
      renderOpen(<AudioSettingSection {...props} value={makeValue({ volumeLfo: { shape: 'sine', rate: 4, depth: 55 } })} volumeLfoHeldOff />);
      expect(rate().getAttribute('data-disabled')).not.toBeNull();
      expect(depth().getAttribute('data-disabled')).not.toBeNull();
      expect(rate().getAttribute('aria-valuenow')).toBe('4');
      expect(depth().getAttribute('aria-valuenow')).toBe('55');
      expect(screen.getByText(HELD)).toBeTruthy();
    });

    it('leaves Audio Setting and Volume editable — only the LFO is held off', () => {
      renderOpen(<AudioSettingSection {...props} value={makeValue()} volumeLfoHeldOff />);
      expect(screen.getByRole('slider', { name: 'Volume' }).getAttribute('data-disabled')).toBeNull();
      expect(screen.getByRole('radio', { name: 'Solo' }).getAttribute('data-disabled')).toBeNull();
    });

    it('is enabled and unlabelled when not held off, or when the prop is omitted (Full, company options)', () => {
      const { unmount } = renderOpen(<AudioSettingSection {...props} value={makeValue()} />);
      expect(rate().getAttribute('data-disabled')).toBeNull();
      expect(screen.queryByText(HELD)).toBeNull();
      unmount();

      renderOpen(<AudioSettingSection {...props} value={makeValue()} volumeLfoHeldOff={false} />);
      expect(rate().getAttribute('data-disabled')).toBeNull();
      expect(screen.queryByText(HELD)).toBeNull();
    });

    it('re-enables as soon as the prop flips back', () => {
      const { rerender } = renderOpen(<AudioSettingSection {...props} value={makeValue()} volumeLfoHeldOff />);
      expect(rate().getAttribute('data-disabled')).not.toBeNull();
      rerender(<AudioSettingSection {...props} value={makeValue()} volumeLfoHeldOff={false} />);
      expect(rate().getAttribute('data-disabled')).toBeNull();
      expect(screen.queryByText(HELD)).toBeNull();
    });
  });
});
