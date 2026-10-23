import type { CSSProperties } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

import { AudioSettingSection, SendRow } from './AudioSettingSection';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { AUDIO_SETTING_SCHEMA, VOLUME_SCHEMA, PAN_SCHEMA, PAN_AUTO_SCHEMA, ROBOT_SEND_SCHEMAS, DYNAMICS_SCHEMA } from '@/data/robotOptionsConfig';
import { ROBOT_SENDS, type RobotSendField } from '@/data/robotSends';
import { CONTENT, fill } from '@/content';
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

// The Pan row's two handlers, for every case that does not exercise Pan (docs/specs/ROBOT_PAN.md §1.5).
const PAN_NOOPS = { onPanChange: () => {}, onPanAutoChange: () => {} };
// The send and Dynamics rows' handlers, for every case that does not exercise them (docs/specs/ROBOT_SENDS.md §1.6;
// docs/specs/ROBOT_PERFORMANCE.md §1.6; docs/specs/ROBOT_EFFECT_SENDS.md §1.6).
// One onSendChange(field, pct) for the five send rows since docs/tasks/ROBOT_SEND_TABLE.md Task 13.
const LEVEL_NOOPS = { onSendChange: () => {}, onDynamicsChange: () => {} };

/** The sendSwelling record with the named sends true and the rest false. */
const swells = (...fields: RobotSendField[]): Record<RobotSendField, boolean> => ({
  reverbSend: fields.includes('reverbSend'), delaySend: fields.includes('delaySend'), gritSend: fields.includes('gritSend'),
  shimmerSend: fields.includes('shimmerSend'), doubleSend: fields.includes('doubleSend'),
});

function makeValue(overrides: Partial<{
  audioMode: NonNullable<Robot['audioMode']>; masterVolume: number; pan: number; panAuto: boolean; reverbSend: number; delaySend: number; dynamics: number;
  gritSend: number; shimmerSend: number; doubleSend: number;
}> = {}) {
  return {
    audioMode: 'none' as NonNullable<Robot['audioMode']>,
    masterVolume: 0.42,
    pan: 0,
    panAuto: true,
    reverbSend: 0.3,
    delaySend: 0.1,
    dynamics: 50,
    gritSend: 0.2,
    shimmerSend: 0.15,
    doubleSend: 0.05,
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
        onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS}
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
        onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS}
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
        onVolumeChange={onVolumeChange} {...PAN_NOOPS} {...LEVEL_NOOPS}
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
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />
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
      render(<AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);
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
      render(<AudioSettingSection value={{ ...value, volumeLfo: { shape: 'sine', rate: 0, depth: 20 } }} onAudioModeChange={noop} onVolumeChange={noop} {...PAN_NOOPS} {...LEVEL_NOOPS} />);
      // @ts-expect-error onVolumeLfoChange no longer exists
      render(<AudioSettingSection value={value} onAudioModeChange={noop} onVolumeChange={noop} {...PAN_NOOPS} {...LEVEL_NOOPS} onVolumeLfoChange={noop} />);
      // @ts-expect-error volumeLfoHeldOff no longer exists
      render(<AudioSettingSection value={value} onAudioModeChange={noop} onVolumeChange={noop} {...PAN_NOOPS} {...LEVEL_NOOPS} volumeLfoHeldOff />);
      expect(screen.getAllByRole('radio', { name: 'Solo' })).toHaveLength(3);
    });
  });

  describe('Volume layout (was "always above its LFO"; the LFO is gone, the column stays)', () => {
    it('the Audio Setting radio and Volume slider both render inside the settings-column panel', () => {
      render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />
      );
      // The settings-column panel (Audio Setting + Volume) is the innermost .sc-directional-panel
      // containing the radio.
      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(settingsColumn.contains(screen.getByRole('slider', { name: /volume/i }))).toBe(true);
    });

    it("the Volume row is not a flex container — 'audio-setting-section__row' adds display:flex, which shrinks a lone flex item (the slider) to its own content width instead of the row's full width, breaking useVoxelTrackBoxCount's self-observation (same pattern audio-rig-drawer__param-row / sc-lfo-target-group__row already avoid elsewhere by carrying no display rule at all)", () => {
      render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />
      );
      const volumeRow = screen.getByRole('slider', { name: /volume/i }).closest('.audio-setting-section__volume-row')!;
      expect(volumeRow).not.toBeNull();
      expect(volumeRow.classList.contains('audio-setting-section__row')).toBe(false);
    });

    it('renders data-orientation="column" on the outer panel regardless of tier — Audio Setting then Volume, always stacked, never a side-by-side desktop split', () => {
      for (const state of [{ mobile: true, tablet: true }, { mobile: false, tablet: false }]) {
        stubMatchMedia(state);
        const { unmount } = render(
          <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />
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
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />
      );
      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(settingsColumn.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('the Volume row no longer carries LFO-group targeting (no sc-lfo-target-group__row, no isActive) — there is nothing left to target', () => {
      const { container } = render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />
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
        onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS}
      />
    );
    expect(screen.getByRole('radio', { name: 'Solo' }).getAttribute('data-disabled')).toBeNull();
  });

  it('disables Audio Setting and Volume when disabled is true', () => {
    render(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS}
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
        onVolumeChange={onVolumeChange} {...PAN_NOOPS} {...LEVEL_NOOPS}
        disabled
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Solo' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });

    expect(onAudioModeChange).not.toHaveBeenCalled();
    expect(onVolumeChange).not.toHaveBeenCalled();
  });

  // Roadmap Phase 14 (docs/specs/archive/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 11) — an optional
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
          onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS}
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
          onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS}
        />,
      );
      const root = container.querySelector('.audio-setting-section') as HTMLElement;
      expect(root.getAttribute('style')).toBeNull();
    });
  });

  // docs/specs/ROBOT_PAN.md §1.5 — the third row of the settings column: the Pan slider (a live readout
  // while Auto is on, an interactive slider while it is off) and the Auto toggle beside it.
  describe('Pan row (docs/tasks/ROBOT_PAN.md Task 8)', () => {
    const panName = new RegExp(`^${CONTENT['probe.pan'].human}`, 'i');
    const autoName = new RegExp(`^${CONTENT['probe.pan.auto'].human}`, 'i');
    const panSlider = () => screen.getByRole('slider', { name: panName });

    it('Auto on: the slider is a role=status readout of livePan x 100, with no interactive pan slider', () => {
      render(<AudioSettingSection value={makeValue({ pan: 0.9, panAuto: true })} livePan={-0.25} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);

      const readout = screen.getByRole('status');
      expect(readout.textContent).toContain('-25');
      expect(readout.getAttribute('data-readonly')).toBe('true');
      expect(screen.queryByRole('slider', { name: panName })).toBeNull();
      expect(screen.getByRole('slider', { name: /volume/i })).toBeTruthy(); // Volume is untouched
    });

    it('Auto on without a livePan (company screen, or before the first tick): shows the stored pan x 100', () => {
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);
      expect(screen.getByRole('status').textContent).toContain('40');
    });

    it('Auto on with a livePan of exactly 0 shows 0, not the stored pan (nullish, not falsy)', () => {
      render(<AudioSettingSection value={makeValue({ pan: 0.9, panAuto: true })} livePan={0} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);
      expect(screen.getByRole('status').textContent).toContain('0');
      expect(screen.getByRole('status').textContent).not.toContain('90');
    });

    it('Auto on shows a fractional live pan without float noise', () => {
      render(<AudioSettingSection value={makeValue()} livePan={0.29} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);
      expect(screen.getByRole('status').textContent).toContain('29');
      expect(screen.getByRole('status').textContent).not.toContain('28.99');
    });

    it('Auto on: a readout change from livePan alone updates what is shown (the section re-renders on livePan)', async () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...LEVEL_NOOPS };
      const value = makeValue({ pan: 0, panAuto: true });
      const { rerender } = render(<AudioSettingSection value={value} livePan={0.1} {...props} />);
      expect(screen.getByRole('status').textContent).toContain('10');

      rerender(<AudioSettingSection value={value} livePan={0.3} {...props} />);
      // The readout eases (useEasedControlValue); the shared gsap mock settles it in a microtask.
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('30'));
    });

    it('Auto off: an interactive -100..100 slider at the stored pan x 100, ignoring a stale livePan', () => {
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: false })} livePan={-0.5} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);

      const slider = panSlider();
      expect(slider.getAttribute('aria-valuenow')).toBe('40');
      expect(slider.getAttribute('aria-valuemin')).toBe('-100');
      expect(slider.getAttribute('aria-valuemax')).toBe('100');
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('Auto off: reaches the full travel at both ends (-1 and 1 store as -100 and 100)', () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...LEVEL_NOOPS };
      const left = render(<AudioSettingSection value={makeValue({ pan: -1, panAuto: false })} {...props} />);
      expect(panSlider().getAttribute('aria-valuenow')).toBe('-100');
      left.unmount();

      render(<AudioSettingSection value={makeValue({ pan: 1, panAuto: false })} {...props} />);
      expect(panSlider().getAttribute('aria-valuenow')).toBe('100');
    });

    it('Auto off: a keyboard step calls onPanChange with the display number (pan x 100 + 1), not the -1..1 fraction', () => {
      const onPanChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...LEVEL_NOOPS} />);

      fireEvent.keyDown(panSlider(), { key: 'ArrowRight' });
      expect(onPanChange).toHaveBeenCalledTimes(1);
      expect(onPanChange).toHaveBeenCalledWith(41);
    });

    it('Auto off: a keyboard step the other way steps down by one display unit', () => {
      const onPanChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...LEVEL_NOOPS} />);

      fireEvent.keyDown(panSlider(), { key: 'ArrowLeft' });
      expect(onPanChange).toHaveBeenCalledWith(39);
    });

    it('Auto off: End and Home drive the slider to the full left and right of the field', () => {
      const onPanChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...LEVEL_NOOPS} />);

      fireEvent.keyDown(panSlider(), { key: 'End' });
      expect(onPanChange).toHaveBeenLastCalledWith(100);
      fireEvent.keyDown(panSlider(), { key: 'Home' });
      expect(onPanChange).toHaveBeenLastCalledWith(-100);
    });

    it('Auto off: a step on Pan never calls the Volume or Audio Setting handlers', () => {
      const onVolumeChange = vi.fn();
      const onAudioModeChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={onAudioModeChange} onVolumeChange={onVolumeChange} {...PAN_NOOPS} {...LEVEL_NOOPS} />);

      fireEvent.keyDown(panSlider(), { key: 'ArrowRight' });
      expect(onVolumeChange).not.toHaveBeenCalled();
      expect(onAudioModeChange).not.toHaveBeenCalled();
    });

    it('the Auto readout never calls onPanChange, whatever key is pressed', () => {
      const onPanChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: true })} livePan={0.2} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...LEVEL_NOOPS} />);

      fireEvent.keyDown(screen.getByRole('status'), { key: 'ArrowRight' });
      expect(onPanChange).not.toHaveBeenCalled();
    });

    it('the Auto toggle reflects panAuto and is named from the content layer', () => {
      const { rerender } = render(<AudioSettingSection value={makeValue({ panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);
      expect(screen.getByRole('switch', { name: autoName }).getAttribute('aria-checked')).toBe('true');

      rerender(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);
      expect(screen.getByRole('switch', { name: autoName }).getAttribute('aria-checked')).toBe('false');
    });

    it('clicking the toggle while Auto is off calls onPanAutoChange(true)', () => {
      const onPanAutoChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={() => {}} onPanAutoChange={onPanAutoChange} {...LEVEL_NOOPS} />);

      fireEvent.click(screen.getByRole('switch', { name: autoName }));
      expect(onPanAutoChange).toHaveBeenCalledTimes(1);
      expect(onPanAutoChange).toHaveBeenCalledWith(true);
    });

    it('clicking the toggle while Auto is on calls onPanAutoChange(false)', () => {
      const onPanAutoChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={() => {}} onPanAutoChange={onPanAutoChange} {...LEVEL_NOOPS} />);

      fireEvent.click(screen.getByRole('switch', { name: autoName }));
      expect(onPanAutoChange).toHaveBeenCalledWith(false);
    });

    it('labels and help come from the content layer: both controls carry a "?" and the label text is the content entry', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);

      expect(screen.getByText(CONTENT['probe.pan'].human)).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.pan'].human }) })).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.pan.auto'].human }) })).toBeTruthy();
    });

    it('the readout keeps its "?" while Auto is on', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.pan'].human }) })).toBeTruthy();
    });

    it('disabled: the toggle and the manual slider are disabled and call nothing', () => {
      const onPanChange = vi.fn();
      const onPanAutoChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: false })} disabled onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={onPanAutoChange} {...LEVEL_NOOPS} />);

      expect(panSlider().getAttribute('data-disabled')).toBe('');
      expect(screen.getByRole('switch', { name: autoName }).getAttribute('data-disabled')).toBe('');
      fireEvent.keyDown(panSlider(), { key: 'ArrowRight' });
      fireEvent.click(screen.getByRole('switch', { name: autoName }));
      expect(onPanChange).not.toHaveBeenCalled();
      expect(onPanAutoChange).not.toHaveBeenCalled();
    });

    it('the Pan row sits in the settings column, after Volume, as a row panel holding the slider and the toggle', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);

      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      const volumeRow = screen.getByRole('slider', { name: /volume/i }).closest('.audio-setting-section__volume-row')!;
      const panWrapper = panSlider().closest('.audio-setting-section__pan-slider')!;
      expect(panWrapper).not.toBeNull();
      expect(settingsColumn.contains(panWrapper)).toBe(true);
      expect(volumeRow.compareDocumentPosition(panWrapper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const rowPanel = panWrapper.closest('.sc-directional-panel')!;
      expect(rowPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
      expect(rowPanel.contains(screen.getByRole('switch', { name: autoName }))).toBe(true);
      expect(rowPanel.contains(screen.getByRole('slider', { name: /volume/i }))).toBe(false);
    });

    it('the readout is wrapped in the same pan-slider wrapper as the manual slider, so the row never changes shape on flip', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: true })} livePan={0.1} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />);
      expect(screen.getByRole('status').closest('.audio-setting-section__pan-slider')).not.toBeNull();
    });

    it('is still a React.memo section: a livePan change re-renders neither the Audio Setting radio nor the Volume slider', () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...LEVEL_NOOPS };
      const value = makeValue({ panAuto: true });
      const { rerender } = render(<AudioSettingSection value={value} livePan={0.1} {...props} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={value} livePan={0.2} {...props} />);

      const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
      expect(rerendered).not.toContain(AUDIO_SETTING_SCHEMA.id);
      expect(rerendered).not.toContain(VOLUME_SCHEMA.id);
      expect(rerendered).not.toContain(PAN_AUTO_SCHEMA.id);
    });

    it('editing Volume does not re-render the Auto toggle or the Pan slider', () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...LEVEL_NOOPS };
      const { rerender } = render(<AudioSettingSection value={makeValue({ masterVolume: 0.42, panAuto: false })} {...props} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={makeValue({ masterVolume: 0.55, panAuto: false })} {...props} />);

      const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
      expect(rerendered).not.toContain(PAN_AUTO_SCHEMA.id);
      expect(rerendered).not.toContain(PAN_SCHEMA.id);
    });
  });

  // docs/specs/ROBOT_SENDS.md §1.6 (docs/tasks/ROBOT_SENDS.md Task 9) - the fourth and fifth rows of the
  // settings column: a Reverb and a Delay send slider after the Pan row, each 0-100 % of the stored 0..1.
  describe('Reverb and Delay rows (Robot Sends Task 9)', () => {
    const reverbName = new RegExp(`^${CONTENT['probe.reverbSend'].human}`, 'i');
    const delayName = new RegExp(`^${CONTENT['probe.delaySend'].human}`, 'i');
    const reverbSlider = () => screen.getByRole('slider', { name: reverbName });
    const delaySlider = () => screen.getByRole('slider', { name: delayName });
    const baseProps = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...LEVEL_NOOPS };
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('renders Volume, Pan, Reverb, Delay in that order, all inside the settings column', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...baseProps} />);

      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      const volume = screen.getByRole('slider', { name: /volume/i });
      const pan = screen.getByRole('slider', { name: new RegExp(`^${CONTENT['probe.pan'].human}`, 'i') });
      expect(before(volume, pan)).toBe(true);
      expect(before(pan, reverbSlider())).toBe(true);
      expect(before(reverbSlider(), delaySlider())).toBe(true);
      expect(settingsColumn.contains(reverbSlider())).toBe(true);
      expect(settingsColumn.contains(delaySlider())).toBe(true);
    });

    it('the rows sit after the Pan row panel, not inside it beside the Auto toggle', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...baseProps} />);

      const panRowPanel = screen.getByRole('switch', { name: new RegExp(`^${CONTENT['probe.pan.auto'].human}`, 'i') }).closest('.sc-directional-panel')!;
      expect(panRowPanel.contains(reverbSlider())).toBe(false);
      expect(panRowPanel.contains(delaySlider())).toBe(false);
      expect(before(panRowPanel, reverbSlider())).toBe(true);
    });

    it('also renders after the Pan readout while Auto is on (the readout is a status, not a slider)', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: true })} livePan={0.1} {...baseProps} />);
      expect(before(screen.getByRole('status'), reverbSlider())).toBe(true);
      expect(before(reverbSlider(), delaySlider())).toBe(true);
    });

    it('each slider shows 0-100 % of its own stored 0..1 send, with a 0..100 range', () => {
      render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} />);

      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('30');
      expect(delaySlider().getAttribute('aria-valuenow')).toBe('10');
      [reverbSlider(), delaySlider()].forEach((s) => {
        expect(s.getAttribute('aria-valuemin')).toBe('0');
        expect(s.getAttribute('aria-valuemax')).toBe('100');
      });
    });

    it('reaches both ends of the travel: 0 shows 0 and 1 shows 100', () => {
      const dry = render(<AudioSettingSection value={makeValue({ reverbSend: 0, delaySend: 0 })} {...baseProps} />);
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('0');
      expect(delaySlider().getAttribute('aria-valuenow')).toBe('0');
      dry.unmount();

      render(<AudioSettingSection value={makeValue({ reverbSend: 1, delaySend: 1 })} {...baseProps} />);
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('100');
      expect(delaySlider().getAttribute('aria-valuenow')).toBe('100');
    });

    it('the two sliders are independent: different stored values show as different numbers', () => {
      render(<AudioSettingSection value={makeValue({ reverbSend: 0.9, delaySend: 0.05 })} {...baseProps} />);
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('90');
      expect(delaySlider().getAttribute('aria-valuenow')).toBe('5');
    });

    it.each([0.29, 0.07, 0.57])('a stored %s shows its whole-percent number, with no float noise from the x100', (send) => {
      render(<AudioSettingSection value={makeValue({ reverbSend: send, delaySend: send })} {...baseProps} />);
      const shown = String(Math.round(send * 100));
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe(shown);
      expect(delaySlider().getAttribute('aria-valuenow')).toBe(shown);
    });

    it('a Reverb keyboard step calls onSendChange(reverbSend) with the display number (send x 100 + 1), not the 0..1 fraction', () => {
      const onSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ reverbSend: 0.3 })} {...baseProps} onSendChange={onSendChange} />);

      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      expect(onSendChange).toHaveBeenCalledTimes(1);
      expect(onSendChange).toHaveBeenCalledWith('reverbSend', 31);
    });

    it('a Reverb keyboard step the other way steps down by one display unit', () => {
      const onSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ reverbSend: 0.3 })} {...baseProps} onSendChange={onSendChange} />);

      fireEvent.keyDown(reverbSlider(), { key: 'ArrowLeft' });
      expect(onSendChange).toHaveBeenCalledWith('reverbSend', 29);
    });

    it('a fractional stored send (a swell lands between whole percents) keeps its fraction on the slider', () => {
      render(<AudioSettingSection value={makeValue({ reverbSend: 0.125 })} {...baseProps} />);
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('12.5');
    });

    it('a Delay keyboard step calls onSendChange(delaySend) with the display number', () => {
      const onSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ delaySend: 0.1 })} {...baseProps} onSendChange={onSendChange} />);

      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      expect(onSendChange).toHaveBeenCalledTimes(1);
      expect(onSendChange).toHaveBeenCalledWith('delaySend', 11);
    });

    it('End and Home drive each slider to its full travel (100 and 0)', () => {
      const onSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue()} {...baseProps} onSendChange={onSendChange} />);

      fireEvent.keyDown(reverbSlider(), { key: 'End' });
      expect(onSendChange).toHaveBeenLastCalledWith('reverbSend', 100);
      fireEvent.keyDown(reverbSlider(), { key: 'Home' });
      expect(onSendChange).toHaveBeenLastCalledWith('reverbSend', 0);
      fireEvent.keyDown(delaySlider(), { key: 'End' });
      expect(onSendChange).toHaveBeenLastCalledWith('delaySend', 100);
      fireEvent.keyDown(delaySlider(), { key: 'Home' });
      expect(onSendChange).toHaveBeenLastCalledWith('delaySend', 0);
    });

    it('never emits a display number outside 0..100: stepping down from 0 or up from 100 stays in range', () => {
      const onSendChange = vi.fn();
      const props = { ...baseProps, onSendChange };
      const dry = render(<AudioSettingSection value={makeValue({ reverbSend: 0, delaySend: 0 })} {...props} />);
      fireEvent.keyDown(reverbSlider(), { key: 'ArrowLeft' });
      fireEvent.keyDown(delaySlider(), { key: 'ArrowLeft' });
      dry.unmount();
      render(<AudioSettingSection value={makeValue({ reverbSend: 1, delaySend: 1 })} {...props} />);
      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });

      onSendChange.mock.calls.forEach(([, n]) => {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      });
    });

    it('a step on one send reports that send only, and never calls the Volume, Pan, Dynamics or Audio Setting handlers', () => {
      const handlers = {
        onAudioModeChange: vi.fn(), onVolumeChange: vi.fn(), onPanChange: vi.fn(), onPanAutoChange: vi.fn(),
        onSendChange: vi.fn(), onDynamicsChange: vi.fn(),
      };
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...handlers} />);

      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      expect(handlers.onSendChange.mock.calls.map(([field]) => field)).toEqual(['reverbSend']);
      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      expect(handlers.onSendChange.mock.calls.map(([field]) => field)).toEqual(['reverbSend', 'delaySend']);

      expect(handlers.onVolumeChange).not.toHaveBeenCalled();
      expect(handlers.onPanChange).not.toHaveBeenCalled();
      expect(handlers.onPanAutoChange).not.toHaveBeenCalled();
      expect(handlers.onDynamicsChange).not.toHaveBeenCalled();
      expect(handlers.onAudioModeChange).not.toHaveBeenCalled();
    });

    it('a Volume or Pan step never calls the send handler', () => {
      const onSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...baseProps} onSendChange={onSendChange} />);

      fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });
      fireEvent.keyDown(screen.getByRole('slider', { name: new RegExp(`^${CONTENT['probe.pan'].human}`, 'i') }), { key: 'ArrowRight' });
      expect(onSendChange).not.toHaveBeenCalled();
    });

    it('disabled: both sliders are disabled and call nothing', () => {
      const onSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue()} disabled {...baseProps} onSendChange={onSendChange} />);

      expect(reverbSlider().getAttribute('data-disabled')).toBe('');
      expect(delaySlider().getAttribute('data-disabled')).toBe('');
      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      expect(onSendChange).not.toHaveBeenCalled();
    });

    it('is enabled by default', () => {
      render(<AudioSettingSection value={makeValue()} {...baseProps} />);
      expect(reverbSlider().getAttribute('data-disabled')).toBeNull();
      expect(delaySlider().getAttribute('data-disabled')).toBeNull();
    });

    it('labels and help come from the content layer: each slider shows its content name and carries a "?"', () => {
      render(<AudioSettingSection value={makeValue()} {...baseProps} />);

      expect(screen.getByText(CONTENT['probe.reverbSend'].human)).toBeTruthy();
      expect(screen.getByText(CONTENT['probe.delaySend'].human)).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.reverbSend'].human }) })).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.delaySend'].human }) })).toBeTruthy();
    });

    it('each slider sits in its own wrapper that is not the display:flex row (useVoxelTrackSlider needs a plain block box)', () => {
      render(<AudioSettingSection value={makeValue()} {...baseProps} />);

      const reverbWrapper = reverbSlider().closest('.audio-setting-section__reverb-row')!;
      const delayWrapper = delaySlider().closest('.audio-setting-section__delay-row')!;
      expect(reverbWrapper).not.toBeNull();
      expect(delayWrapper).not.toBeNull();
      expect(reverbWrapper).not.toBe(delayWrapper);
      [reverbWrapper, delayWrapper].forEach((w) => expect(w.classList.contains('audio-setting-section__row')).toBe(false));
    });

    it('stays memo-stable: re-rendering with identical props re-renders none of the sliders', () => {
      const value = makeValue({ panAuto: false });
      const { rerender } = render(<AudioSettingSection value={value} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={value} {...baseProps} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });

    it('editing Reverb re-renders neither Delay, Volume, Pan nor the Audio Setting radio', () => {
      const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, panAuto: false })} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.4, panAuto: false })} {...baseProps} />);

      const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
      expect(rerendered).not.toContain(ROBOT_SEND_SCHEMAS.delaySend.id);
      expect(rerendered).not.toContain(VOLUME_SCHEMA.id);
      expect(rerendered).not.toContain(PAN_SCHEMA.id);
      expect(rerendered).not.toContain(PAN_AUTO_SCHEMA.id);
      expect(rerendered).not.toContain(AUDIO_SETTING_SCHEMA.id);
    });

    it('editing Delay re-renders not Reverb, and editing Volume re-renders neither send', () => {
      const { rerender } = render(<AudioSettingSection value={makeValue({ delaySend: 0.1, masterVolume: 0.42 })} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={makeValue({ delaySend: 0.2, masterVolume: 0.42 })} {...baseProps} />);
      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id)).not.toContain(ROBOT_SEND_SCHEMAS.reverbSend.id);

      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();
      rerender(<AudioSettingSection value={makeValue({ delaySend: 0.2, masterVolume: 0.7 })} {...baseProps} />);
      const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
      expect(rerendered).not.toContain(ROBOT_SEND_SCHEMAS.reverbSend.id);
      expect(rerendered).not.toContain(ROBOT_SEND_SCHEMAS.delaySend.id);
    });

    // docs/tasks/ROBOT_SENDS.md Task 13 - the swell flags. The flag reaches the slider's `swelling` prop, which makes
    // an external value change land at once (a swell tick is already smooth) instead of through the 250 ms ease. In
    // this test environment the ease completes on a microtask, so a synchronous read after a rerender tells the two apart.
    describe('swelling flags (Robot Sends Task 13)', () => {
      const shown = (slider: HTMLElement) => slider.getAttribute('aria-valuenow');

      it('sendSwelling.reverbSend makes an external Reverb change land at once, and leaves Delay easing', async () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} sendSwelling={swells('reverbSend')} />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} sendSwelling={swells('reverbSend')} />);

        expect(shown(reverbSlider())).toBe('60'); // snapped
        expect(shown(delaySlider())).toBe('10'); // still easing
        await waitFor(() => expect(shown(delaySlider())).toBe('50'));
      });

      it('sendSwelling.delaySend makes an external Delay change land at once, and leaves Reverb easing', async () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} sendSwelling={swells('delaySend')} />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} sendSwelling={swells('delaySend')} />);

        expect(shown(delaySlider())).toBe('50');
        expect(shown(reverbSlider())).toBe('30');
        await waitFor(() => expect(shown(reverbSlider())).toBe('60'));
      });

      it('with no record (the default) both sends ease, never snap', async () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} />);

        expect(shown(reverbSlider())).toBe('30');
        expect(shown(delaySlider())).toBe('10');
        await waitFor(() => expect(shown(reverbSlider())).toBe('60'));
        await waitFor(() => expect(shown(delaySlider())).toBe('50'));
      });

      it('an all-false record behaves as absent', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3 })} {...baseProps} sendSwelling={swells()} />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6 })} {...baseProps} sendSwelling={swells()} />);
        expect(shown(reverbSlider())).toBe('30');
      });

      it('both flags together snap both sends', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} sendSwelling={swells('reverbSend', 'delaySend')} />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} sendSwelling={swells('reverbSend', 'delaySend')} />);
        expect(shown(reverbSlider())).toBe('60');
        expect(shown(delaySlider())).toBe('50');
      });

      it('a send flag does not touch Volume: a Volume change still eases', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ masterVolume: 0.2 })} {...baseProps} sendSwelling={swells('reverbSend', 'delaySend')} />);
        rerender(<AudioSettingSection value={makeValue({ masterVolume: 0.9 })} {...baseProps} sendSwelling={swells('reverbSend', 'delaySend')} />);
        expect(shown(screen.getByRole('slider', { name: /volume/i }))).toBe('20');
      });

      it('flipping a flag by itself moves no slider and fires no change handler', () => {
        const onSendChange = vi.fn();
        const props = { ...baseProps, onSendChange };
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...props} />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...props} sendSwelling={swells('reverbSend', 'delaySend')} />);
        expect(shown(reverbSlider())).toBe('30');
        expect(shown(delaySlider())).toBe('10');
        expect(onSendChange).not.toHaveBeenCalled();
      });

      it('flipping sendSwelling.reverbSend re-renders the Reverb slider only', () => {
        const value = makeValue({ panAuto: false });
        const { rerender } = render(<AudioSettingSection value={value} {...baseProps} sendSwelling={swells()} />);
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

        rerender(<AudioSettingSection value={value} {...baseProps} sendSwelling={swells('reverbSend')} />);

        const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
        expect(rerendered).toContain(ROBOT_SEND_SCHEMAS.reverbSend.id);
        expect(rerendered).not.toContain(ROBOT_SEND_SCHEMAS.delaySend.id);
        expect(rerendered).not.toContain(VOLUME_SCHEMA.id);
        expect(rerendered).not.toContain(PAN_SCHEMA.id);
      });

      it('flipping sendSwelling.delaySend re-renders the Delay slider only', () => {
        const value = makeValue({ panAuto: false });
        const { rerender } = render(<AudioSettingSection value={value} {...baseProps} sendSwelling={swells()} />);
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

        rerender(<AudioSettingSection value={value} {...baseProps} sendSwelling={swells('delaySend')} />);

        const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
        expect(rerendered).toContain(ROBOT_SEND_SCHEMAS.delaySend.id);
        expect(rerendered).not.toContain(ROBOT_SEND_SCHEMAS.reverbSend.id);
      });
    });
  });

  // docs/specs/ROBOT_PERFORMANCE.md §1.6 (docs/tasks/ROBOT_PERFORMANCE.md Task 9) - the sixth row of the settings
  // column: a Dynamics slider after Delay, 0-100 as stored (no conversion), no `swelling` (not a swell attribute).
  describe('Dynamics row (Robot Performance Task 9)', () => {
    const dynamicsName = new RegExp(`^${CONTENT['probe.levels.dynamics'].human}`, 'i');
    const dynamicsSlider = () => screen.getByRole('slider', { name: dynamicsName });
    const delaySlider = () => screen.getByRole('slider', { name: new RegExp(`^${CONTENT['probe.delaySend'].human}`, 'i') });
    const baseProps = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...LEVEL_NOOPS };
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('renders after Delay, inside the settings column', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...baseProps} />);

      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(before(delaySlider(), dynamicsSlider())).toBe(true);
      expect(settingsColumn.contains(dynamicsSlider())).toBe(true);
    });

    it('shows the stored 0-100 number as is, with a 0..100 range', () => {
      render(<AudioSettingSection value={makeValue({ dynamics: 70 })} {...baseProps} />);

      expect(dynamicsSlider().getAttribute('aria-valuenow')).toBe('70');
      expect(dynamicsSlider().getAttribute('aria-valuemin')).toBe('0');
      expect(dynamicsSlider().getAttribute('aria-valuemax')).toBe('100');
    });

    it('reaches both ends of the travel: 0 shows 0 and 100 shows 100', () => {
      const flat = render(<AudioSettingSection value={makeValue({ dynamics: 0 })} {...baseProps} />);
      expect(dynamicsSlider().getAttribute('aria-valuenow')).toBe('0');
      flat.unmount();

      render(<AudioSettingSection value={makeValue({ dynamics: 100 })} {...baseProps} />);
      expect(dynamicsSlider().getAttribute('aria-valuenow')).toBe('100');
    });

    it('a keyboard step calls onDynamicsChange with the next whole number, once', () => {
      const onDynamicsChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ dynamics: 50 })} {...baseProps} onDynamicsChange={onDynamicsChange} />);

      fireEvent.keyDown(dynamicsSlider(), { key: 'ArrowRight' });
      expect(onDynamicsChange).toHaveBeenCalledTimes(1);
      expect(onDynamicsChange).toHaveBeenCalledWith(51);
    });

    it('a keyboard step the other way steps down by one', () => {
      const onDynamicsChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ dynamics: 50 })} {...baseProps} onDynamicsChange={onDynamicsChange} />);

      fireEvent.keyDown(dynamicsSlider(), { key: 'ArrowLeft' });
      expect(onDynamicsChange).toHaveBeenCalledWith(49);
    });

    it('End and Home drive it to its full travel (100 and 0), and every emitted number is a whole number in range', () => {
      const onDynamicsChange = vi.fn();
      render(<AudioSettingSection value={makeValue()} {...baseProps} onDynamicsChange={onDynamicsChange} />);

      fireEvent.keyDown(dynamicsSlider(), { key: 'End' });
      expect(onDynamicsChange).toHaveBeenLastCalledWith(100);
      fireEvent.keyDown(dynamicsSlider(), { key: 'Home' });
      expect(onDynamicsChange).toHaveBeenLastCalledWith(0);
      onDynamicsChange.mock.calls.forEach(([n]) => {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      });
    });

    it('a step on Dynamics never calls any other handler, and a step on Delay, Volume or Pan never calls onDynamicsChange', () => {
      const handlers = {
        onAudioModeChange: vi.fn(), onVolumeChange: vi.fn(), onPanChange: vi.fn(), onPanAutoChange: vi.fn(),
        onSendChange: vi.fn(), onDynamicsChange: vi.fn(),
      };
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...handlers} />);

      fireEvent.keyDown(dynamicsSlider(), { key: 'ArrowRight' });
      expect(handlers.onDynamicsChange).toHaveBeenCalledTimes(1);
      const others = [handlers.onAudioModeChange, handlers.onVolumeChange, handlers.onPanChange, handlers.onPanAutoChange, handlers.onSendChange];
      others.forEach((h) => expect(h).not.toHaveBeenCalled());

      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });
      fireEvent.keyDown(screen.getByRole('slider', { name: new RegExp(`^${CONTENT['probe.pan'].human}`, 'i') }), { key: 'ArrowRight' });
      expect(handlers.onDynamicsChange).toHaveBeenCalledTimes(1);
    });

    it('disabled: the slider is disabled and calls nothing; enabled by default', () => {
      const onDynamicsChange = vi.fn();
      const disabled = render(<AudioSettingSection value={makeValue()} disabled {...baseProps} onDynamicsChange={onDynamicsChange} />);
      expect(dynamicsSlider().getAttribute('data-disabled')).toBe('');
      fireEvent.keyDown(dynamicsSlider(), { key: 'ArrowRight' });
      expect(onDynamicsChange).not.toHaveBeenCalled();
      disabled.unmount();

      render(<AudioSettingSection value={makeValue()} {...baseProps} />);
      expect(dynamicsSlider().getAttribute('data-disabled')).toBeNull();
    });

    it('is named, helped and unit-ed from its content key: a "?" with its own name, and a percent readout', () => {
      render(<AudioSettingSection value={makeValue()} {...baseProps} />);

      expect(screen.getByText(CONTENT['probe.levels.dynamics'].human)).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.levels.dynamics'].human }) })).toBeTruthy();
      expect(DYNAMICS_SCHEMA.unit).toBe('%');
    });

    it('sits in its own wrapper that is not the display:flex row, and the stylesheet gives it no flex rule', () => {
      render(<AudioSettingSection value={makeValue()} {...baseProps} />);

      const wrapper = dynamicsSlider().closest('.audio-setting-section__dynamics-row')!;
      expect(wrapper).not.toBeNull();
      expect(wrapper.classList.contains('audio-setting-section__row')).toBe(false);
    });

    it('stays memo-stable, and editing Dynamics re-renders only the Dynamics slider (not Delay, Reverb, Volume, Pan or the radio)', () => {
      const value = makeValue({ panAuto: false });
      const { rerender } = render(<AudioSettingSection value={value} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();
      rerender(<AudioSettingSection value={value} {...baseProps} />);
      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);

      rerender(<AudioSettingSection value={makeValue({ panAuto: false, dynamics: 80 })} {...baseProps} />);
      const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
      expect(rerendered).toContain(DYNAMICS_SCHEMA.id);
      [ROBOT_SEND_SCHEMAS.delaySend.id, ROBOT_SEND_SCHEMAS.reverbSend.id, VOLUME_SCHEMA.id, PAN_SCHEMA.id, PAN_AUTO_SCHEMA.id, AUDIO_SETTING_SCHEMA.id]
        .forEach((id) => expect(rerendered).not.toContain(id));
    });

    it('editing Delay or Volume does not re-render the Dynamics slider', () => {
      const { rerender } = render(<AudioSettingSection value={makeValue({ delaySend: 0.1, masterVolume: 0.42 })} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={makeValue({ delaySend: 0.2, masterVolume: 0.7 })} {...baseProps} />);
      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id)).not.toContain(DYNAMICS_SCHEMA.id);
    });
  });

  // docs/specs/ROBOT_EFFECT_SENDS.md §1.6 (docs/tasks/ROBOT_EFFECT_SENDS.md Task 11) - three more send rows after Delay, on the
  // Reverb row's shape: Volume, Pan, Reverb, Delay, Grit, Shimmer, Double, then Dynamics. Both screens pass all three (Task 14).
  describe('Grit, Shimmer and Double rows (Robot Effect Sends Task 11)', () => {
    const nameOf = (key: 'probe.reverbSend' | 'probe.delaySend' | 'probe.gritSend' | 'probe.shimmerSend' | 'probe.doubleSend') =>
      new RegExp(`^${CONTENT[key].human}`, 'i');
    const sliderFor = (key: Parameters<typeof nameOf>[0]) => screen.getByRole('slider', { name: nameOf(key) });
    const baseProps = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...LEVEL_NOOPS };
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const rerenderedIds = () => (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);

    const ROWS = [
      { name: 'Grit', field: 'gritSend', key: 'probe.gritSend', schema: ROBOT_SEND_SCHEMAS.gritSend, wrapper: 'audio-setting-section__grit-row' },
      { name: 'Shimmer', field: 'shimmerSend', key: 'probe.shimmerSend', schema: ROBOT_SEND_SCHEMAS.shimmerSend, wrapper: 'audio-setting-section__shimmer-row' },
      { name: 'Double', field: 'doubleSend', key: 'probe.doubleSend', schema: ROBOT_SEND_SCHEMAS.doubleSend, wrapper: 'audio-setting-section__double-row' },
    ] as const;

    it('renders Volume, Pan, Reverb, Delay, Grit, Shimmer, Double, Dynamics in that order, all inside the settings column', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...baseProps} />);

      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      const order = [
        screen.getByRole('slider', { name: /volume/i }),
        screen.getByRole('slider', { name: new RegExp(`^${CONTENT['probe.pan'].human}`, 'i') }),
        sliderFor('probe.reverbSend'),
        sliderFor('probe.delaySend'),
        sliderFor('probe.gritSend'),
        sliderFor('probe.shimmerSend'),
        sliderFor('probe.doubleSend'),
        screen.getByRole('slider', { name: new RegExp(`^${CONTENT['probe.levels.dynamics'].human}`, 'i') }),
      ];
      for (let i = 1; i < order.length; i++) expect(before(order[i - 1], order[i]), `row ${i}`).toBe(true);
      order.forEach((s) => expect(settingsColumn.contains(s)).toBe(true));
    });

    it('the three sliders are independent: different stored values show as different numbers', () => {
      render(<AudioSettingSection value={makeValue({ gritSend: 0.6, shimmerSend: 0.25, doubleSend: 0 })} {...baseProps} />);
      expect(sliderFor('probe.gritSend').getAttribute('aria-valuenow')).toBe('60');
      expect(sliderFor('probe.shimmerSend').getAttribute('aria-valuenow')).toBe('25');
      expect(sliderFor('probe.doubleSend').getAttribute('aria-valuenow')).toBe('0');
    });

    it('a robot with all three at 0 (most of a fleet) still shows all three rows, at 0', () => {
      render(<AudioSettingSection value={makeValue({ gritSend: 0, shimmerSend: 0, doubleSend: 0 })} {...baseProps} />);
      ROWS.forEach(({ key }) => expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('0'));
    });

    it('a step on one new send reports that send only, and calls no Volume, Pan, Dynamics or Audio Setting handler', () => {
      for (const row of ROWS) {
        const handlers = {
          onAudioModeChange: vi.fn(), onVolumeChange: vi.fn(), onPanChange: vi.fn(), onPanAutoChange: vi.fn(), onDynamicsChange: vi.fn(),
          onSendChange: vi.fn(),
        };
        const view = render(<AudioSettingSection value={makeValue({ panAuto: false })} {...handlers} />);

        fireEvent.keyDown(sliderFor(row.key), { key: 'ArrowRight' });

        const called = Object.entries(handlers).filter(([, fn]) => fn.mock.calls.length > 0).map(([name]) => name);
        expect(called, row.name).toEqual(['onSendChange']);
        expect(handlers.onSendChange.mock.calls.map(([field]) => field), row.name).toEqual([row.field]);
        view.unmount();
      }
    });

    // Effect Sends Task 14 made the three values required, and Robot Send Table Task 13 made onSendChange required, so
    // neither screen can leave a row out. `npm run build:types` checks the directives: each goes unused (an error) if
    // the prop it names turns optional again.
    it('the three values and onSendChange are required props', () => {
      const { onSendChange: _send, ...withoutSendHandler } = LEVEL_NOOPS;
      const { gritSend: _g, shimmerSend: _s, doubleSend: _d, ...withoutNewValues } = makeValue();
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS };
      // @ts-expect-error onSendChange is required
      const missingHandler = <AudioSettingSection value={makeValue()} {...props} {...withoutSendHandler} />;
      // @ts-expect-error value.gritSend, shimmerSend and doubleSend are required
      const missingValues = <AudioSettingSection value={withoutNewValues} {...props} {...LEVEL_NOOPS} />;
      expect([missingHandler, missingValues]).toHaveLength(2);
    });

    describe.each(ROWS)('$name', ({ field, key, schema, wrapper }) => {
      it('shows 0-100 % of its own stored 0..1 send, with a 0..100 range', () => {
        render(<AudioSettingSection value={makeValue({ [field]: 0.37 })} {...baseProps} />);
        const slider = sliderFor(key);
        expect(slider.getAttribute('aria-valuenow')).toBe('37');
        expect(slider.getAttribute('aria-valuemin')).toBe('0');
        expect(slider.getAttribute('aria-valuemax')).toBe('100');
      });

      it.each([0.29, 0.07, 0.57])('a stored %s shows its whole-percent number, with no float noise from the x100', (send) => {
        render(<AudioSettingSection value={makeValue({ [field]: send })} {...baseProps} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe(String(Math.round(send * 100)));
      });

      it('a fractional stored send keeps its fraction on the slider', () => {
        render(<AudioSettingSection value={makeValue({ [field]: 0.125 })} {...baseProps} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('12.5');
      });

      it('reaches both ends of the travel: 0 shows 0 and 1 shows 100', () => {
        const dry = render(<AudioSettingSection value={makeValue({ [field]: 0 })} {...baseProps} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('0');
        dry.unmount();
        render(<AudioSettingSection value={makeValue({ [field]: 1 })} {...baseProps} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('100');
      });

      it('a keyboard step calls onSendChange once with its field and the display number (send x 100 +/- 1), not the 0..1 fraction', () => {
        const fn = vi.fn();
        const up = render(<AudioSettingSection value={makeValue({ [field]: 0.3 })} {...baseProps} onSendChange={fn} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowRight' });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenLastCalledWith(field, 31);
        up.unmount();

        render(<AudioSettingSection value={makeValue({ [field]: 0.3 })} {...baseProps} onSendChange={fn} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowLeft' });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith(field, 29);
      });

      it('End and Home drive it to its full travel, and it never emits outside 0..100', () => {
        const fn = vi.fn();
        const top = render(<AudioSettingSection value={makeValue({ [field]: 1 })} {...baseProps} onSendChange={fn} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowRight' });
        fireEvent.keyDown(sliderFor(key), { key: 'Home' });
        expect(fn).toHaveBeenLastCalledWith(field, 0);
        top.unmount();
        render(<AudioSettingSection value={makeValue({ [field]: 0 })} {...baseProps} onSendChange={fn} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowLeft' });
        fireEvent.keyDown(sliderFor(key), { key: 'End' });
        expect(fn).toHaveBeenLastCalledWith(field, 100);
        fn.mock.calls.forEach(([, n]) => {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(100);
        });
      });

      it('labels and help come from the content layer: its content name and a "?"', () => {
        render(<AudioSettingSection value={makeValue()} {...baseProps} />);
        expect(screen.getByText(CONTENT[key].human)).toBeTruthy();
        expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT[key].human }) })).toBeTruthy();
      });

      it('disabled: the slider is disabled and calls nothing', () => {
        const fn = vi.fn();
        render(<AudioSettingSection value={makeValue()} disabled {...baseProps} onSendChange={fn} />);
        expect(sliderFor(key).getAttribute('data-disabled')).toBe('');
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowRight' });
        expect(fn).not.toHaveBeenCalled();
      });

      it('sits in its own wrapper that is not the display:flex row, and the stylesheet gives it no flex rule', () => {
        render(<AudioSettingSection value={makeValue()} {...baseProps} />);
        const w = sliderFor(key).closest(`.${wrapper}`)!;
        expect(w).not.toBeNull();
        expect(w.classList.contains('audio-setting-section__row')).toBe(false);
        expect(w.contains(sliderFor('probe.reverbSend'))).toBe(false);
      });

      it('editing it re-renders no other slider, and editing Reverb or Volume does not re-render it', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ [field]: 0.3, panAuto: false })} {...baseProps} />);
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

        rerender(<AudioSettingSection value={makeValue({ [field]: 0.4, panAuto: false })} {...baseProps} />);
        const others = [ROBOT_SEND_SCHEMAS.reverbSend, ROBOT_SEND_SCHEMAS.delaySend, VOLUME_SCHEMA, PAN_SCHEMA, AUDIO_SETTING_SCHEMA, DYNAMICS_SCHEMA, ...ROWS.map((r) => r.schema)]
          .filter((s) => s !== schema).map((s) => s.id);
        expect(rerenderedIds()).toContain(schema.id);
        others.forEach((id) => expect(rerenderedIds()).not.toContain(id));

        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();
        rerender(<AudioSettingSection value={makeValue({ [field]: 0.4, reverbSend: 0.9, masterVolume: 0.9, panAuto: false })} {...baseProps} />);
        expect(rerenderedIds()).not.toContain(schema.id);
      });

      // The flag reaches the slider's `swelling` prop: an external change lands at once instead of through the 250 ms ease
      // (in this environment the ease completes on a microtask, so a synchronous read tells the two apart). Task 13 passes it.
      it('its swelling flag makes an external change land at once, and leaves the other new sends easing', async () => {
        const start = makeValue({ gritSend: 0.1, shimmerSend: 0.1, doubleSend: 0.1 });
        const next = makeValue({ gritSend: 0.5, shimmerSend: 0.5, doubleSend: 0.5 });
        const { rerender } = render(<AudioSettingSection value={start} {...baseProps} sendSwelling={swells(field)} />);
        rerender(<AudioSettingSection value={next} {...baseProps} sendSwelling={swells(field)} />);

        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('50');
        for (const other of ROWS.filter((r) => r.key !== key)) {
          expect(sliderFor(other.key).getAttribute('aria-valuenow'), other.name).toBe('10');
        }
        await waitFor(() => ROWS.forEach((r) => expect(sliderFor(r.key).getAttribute('aria-valuenow')).toBe('50')));
      });

      it('without its flag (no record, or false) it eases, never snaps', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ [field]: 0.1 })} {...baseProps} sendSwelling={swells()} />);
        rerender(<AudioSettingSection value={makeValue({ [field]: 0.5 })} {...baseProps} sendSwelling={swells()} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('10');
      });
    });

    it('the five rows share one handler: each reports its own field, once', () => {
      const fn = vi.fn();
      render(<AudioSettingSection value={makeValue()} {...baseProps} onSendChange={fn} />);
      const keys = ['probe.reverbSend', 'probe.delaySend', 'probe.gritSend', 'probe.shimmerSend', 'probe.doubleSend'] as const;
      keys.forEach((k) => fireEvent.keyDown(sliderFor(k), { key: 'ArrowRight' }));
      expect(fn.mock.calls.map(([field]) => field)).toEqual(['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend']);
    });
  });

  // docs/specs/ROBOT_SEND_TABLE.md §1.4 (Robot Send Table T10, T13): the five rows come from ROBOT_SENDS, one memo'd
  // SendRow each, and report through one onSendChange(field, pct) with one sendSwelling record. T13 deleted the bridge
  // from the ten old per-field props; they no longer type-check.
  describe('send rows from the table (Robot Send Table T10)', () => {
    const NEW_PROPS = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, onDynamicsChange: () => {} };
    const NO_SWELLS: Record<RobotSendField, boolean> = { reverbSend: false, delaySend: false, gritSend: false, shimmerSend: false, doubleSend: false };
    const sliderOf = (field: RobotSendField) =>
      screen.getByRole('slider', { name: new RegExp(`^${CONTENT[ROBOT_SENDS.find((s) => s.field === field)!.contentKey].human}`, 'i') });
    const shown = (field: RobotSendField) => sliderOf(field).getAttribute('aria-valuenow');
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const rerenderedIds = () => (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id as string);
    const allSends = (send: number) => makeValue({ reverbSend: send, delaySend: send, gritSend: send, shimmerSend: send, doubleSend: send });

    it('renders one row per ROBOT_SENDS entry, in table order, each in the wrapper its engine key names', () => {
      const { container } = render(<AudioSettingSection value={makeValue({ panAuto: false })} {...NEW_PROPS} onSendChange={vi.fn()} />);

      const wrappers = ROBOT_SENDS.map((spec) => container.querySelector(`.audio-setting-section__${spec.engineKey}-row`));
      wrappers.forEach((w, i) => {
        expect(w, ROBOT_SENDS[i].field).not.toBeNull();
        expect(w!.contains(sliderOf(ROBOT_SENDS[i].field)), ROBOT_SENDS[i].field).toBe(true);
        expect(w!.classList.contains('audio-setting-section__row')).toBe(false);
      });
      for (let i = 1; i < wrappers.length; i++) expect(before(wrappers[i - 1]!, wrappers[i]!), `row ${i}`).toBe(true);
      // Volume, Pan, the five sends and Dynamics: no row twice, none missing.
      expect(screen.getAllByRole('slider')).toHaveLength(8);
    });

    it('each row renders its ROBOT_SEND_SCHEMAS schema, and the rows render in table order', () => {
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();
      render(<AudioSettingSection value={makeValue()} {...NEW_PROPS} onSendChange={vi.fn()} />);

      const sendIds = new Set(ROBOT_SENDS.map((spec) => ROBOT_SEND_SCHEMAS[spec.field].id));
      const rendered = [...new Set(rerenderedIds().filter((id) => sendIds.has(id)))];
      expect(rendered).toEqual(ROBOT_SENDS.map((spec) => `robotOptions.${spec.field}`));
    });

    it.each(ROBOT_SENDS)('a step on the $field row calls onSendChange($field, 40) once', (spec) => {
      const onSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ [spec.field]: 0.39 })} {...NEW_PROPS} onSendChange={onSendChange} />);

      fireEvent.keyDown(sliderOf(spec.field), { key: 'ArrowRight' });

      expect(onSendChange.mock.calls).toEqual([[spec.field, 40]]);
    });

    it('onSendChange reports the display number at both ends of the travel (Home 0, End 100), never a fraction', () => {
      const onSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ shimmerSend: 0.5 })} {...NEW_PROPS} onSendChange={onSendChange} />);
      fireEvent.keyDown(sliderOf('shimmerSend'), { key: 'Home' });
      fireEvent.keyDown(sliderOf('shimmerSend'), { key: 'End' });
      expect(onSendChange.mock.calls).toEqual([['shimmerSend', 0], ['shimmerSend', 100]]);
    });

    it('disabled: no row reaches onSendChange', () => {
      const onSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue()} disabled {...NEW_PROPS} onSendChange={onSendChange} />);
      ROBOT_SENDS.forEach((spec) => fireEvent.keyDown(sliderOf(spec.field), { key: 'ArrowRight' }));
      expect(onSendChange).not.toHaveBeenCalled();
    });

    it('a new onSendChange is the one the next step reaches (no row holds a stale handler)', () => {
      const first = vi.fn();
      const second = vi.fn();
      const value = makeValue();
      const { rerender } = render(<AudioSettingSection value={value} {...NEW_PROPS} onSendChange={first} />);
      rerender(<AudioSettingSection value={value} {...NEW_PROPS} onSendChange={second} />);

      fireEvent.keyDown(sliderOf('doubleSend'), { key: 'ArrowRight' });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith('doubleSend', 6);
    });

    it.each(ROBOT_SENDS)('sendSwelling.$field snaps the $field row alone; the other four still ease', async (spec) => {
      const flags = { ...NO_SWELLS, [spec.field]: true };
      const { rerender } = render(<AudioSettingSection value={allSends(0.1)} {...NEW_PROPS} onSendChange={vi.fn()} sendSwelling={flags} />);
      rerender(<AudioSettingSection value={allSends(0.5)} {...NEW_PROPS} onSendChange={vi.fn()} sendSwelling={flags} />);

      expect(shown(spec.field)).toBe('50');
      ROBOT_SENDS.filter((s) => s !== spec).forEach((s) => expect(shown(s.field), s.field).toBe('10'));
      await waitFor(() => ROBOT_SENDS.forEach((s) => expect(shown(s.field)).toBe('50')));
    });

    it('an all-false sendSwelling eases every row, as no record does', () => {
      const { rerender } = render(<AudioSettingSection value={allSends(0.1)} {...NEW_PROPS} onSendChange={vi.fn()} sendSwelling={NO_SWELLS} />);
      rerender(<AudioSettingSection value={allSends(0.5)} {...NEW_PROPS} onSendChange={vi.fn()} sendSwelling={NO_SWELLS} />);
      ROBOT_SENDS.forEach((s) => expect(shown(s.field), s.field).toBe('10'));
    });

    it('with onSendChange, editing Reverb re-renders the Reverb row and no other send row', () => {
      const onSendChange = vi.fn();
      const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3 })} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.4 })} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);

      expect(rerenderedIds()).toContain(ROBOT_SEND_SCHEMAS.reverbSend.id);
      for (const field of ['delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const) {
        expect(rerenderedIds(), field).not.toContain(ROBOT_SEND_SCHEMAS[field].id);
      }
    });

    // Without the memo every SendRow rebuilds its onChange closure on any section render, so every send slider re-renders
    // with it; the probe cases below see the result, this one names the cause.
    it('SendRow is a React.memo-wrapped component', () => {
      expect((SendRow as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('with onSendChange, editing Volume or Dynamics re-renders no send row', () => {
      const onSendChange = vi.fn();
      const { rerender } = render(<AudioSettingSection value={makeValue({ masterVolume: 0.4, dynamics: 50 })} {...NEW_PROPS} onSendChange={onSendChange} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={makeValue({ masterVolume: 0.7, dynamics: 80 })} {...NEW_PROPS} onSendChange={onSendChange} />);

      ROBOT_SENDS.forEach((spec) => expect(rerenderedIds(), spec.field).not.toContain(ROBOT_SEND_SCHEMAS[spec.field].id));
    });

    // Review follow-up (2026-10-22): a row compares the number its slider shows, as the five hand-written rows did, so a
    // stored change below the display's two decimals of a percent re-renders nothing (SliderLinear is memo'd too).
    it.each([1e-7, -1e-7, 4e-5])('a send change of %s, too small to show, re-renders no send slider', (delta) => {
      const onSendChange = vi.fn();
      const { rerender } = render(<AudioSettingSection value={makeValue({ gritSend: 0.29 })} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={makeValue({ gritSend: 0.29 + delta })} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);

      ROBOT_SENDS.forEach((spec) => expect(rerenderedIds(), spec.field).not.toContain(ROBOT_SEND_SCHEMAS[spec.field].id));
      expect(shown('gritSend')).toBe('29');
    });

    it('a send change of one display step still re-renders that row (the comparison is not too coarse)', () => {
      const onSendChange = vi.fn();
      const { rerender } = render(<AudioSettingSection value={makeValue({ gritSend: 0.29 })} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={makeValue({ gritSend: 0.2901 })} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);

      expect(rerenderedIds()).toContain(ROBOT_SEND_SCHEMAS.gritSend.id);
    });

    it('a fresh but equal sendSwelling record re-renders no slider (the rows compare booleans, not the record)', () => {
      const onSendChange = vi.fn();
      const value = makeValue({ panAuto: false });
      const { rerender } = render(<AudioSettingSection value={value} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={{ ...NO_SWELLS }} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={value} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={{ ...NO_SWELLS }} />);

      const sendIds = ROBOT_SENDS.map((spec) => ROBOT_SEND_SCHEMAS[spec.field].id);
      sendIds.forEach((id) => expect(rerenderedIds()).not.toContain(id));
    });

    it('flipping sendSwelling.gritSend re-renders the Grit row only', () => {
      const onSendChange = vi.fn();
      const value = makeValue({ panAuto: false });
      const { rerender } = render(<AudioSettingSection value={value} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={value} {...NEW_PROPS} onSendChange={onSendChange} sendSwelling={{ ...NO_SWELLS, gritSend: true }} />);

      expect(rerenderedIds()).toContain(ROBOT_SEND_SCHEMAS.gritSend.id);
      for (const field of ['reverbSend', 'delaySend', 'shimmerSend', 'doubleSend'] as const) {
        expect(rerenderedIds(), field).not.toContain(ROBOT_SEND_SCHEMAS[field].id);
      }
      expect(rerenderedIds()).not.toContain(VOLUME_SCHEMA.id);
    });

    // `npm run build:types` checks the directive: the bridge keeps the rows wired, so a caller passes onSendChange or all
    // five old handlers, and onSendChange alone needs none of the old ones.
    it('a caller must wire the send rows: onSendChange alone type-checks, without it nothing does', () => {
      // @ts-expect-error onSendChange is required
      const missing = <AudioSettingSection value={makeValue()} {...NEW_PROPS} />;
      const newOnly = <AudioSettingSection value={makeValue()} {...NEW_PROPS} onSendChange={() => {}} />;
      expect([missing, newOnly]).toHaveLength(2);
    });

    // Robot Send Table T13 (the 50.7 T14 pattern): the ten per-field props are gone from the type, so a caller still on
    // them fails `npm run build:types` instead of silently wiring nothing. Each directive goes unused if its prop returns.
    it('the ten old per-field send props no longer type-check', () => {
      const props = { ...NEW_PROPS, onSendChange: () => {} };
      const handlers = [
        // @ts-expect-error onReverbSendChange is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} onReverbSendChange={() => {}} />,
        // @ts-expect-error onDelaySendChange is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} onDelaySendChange={() => {}} />,
        // @ts-expect-error onGritSendChange is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} onGritSendChange={() => {}} />,
        // @ts-expect-error onShimmerSendChange is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} onShimmerSendChange={() => {}} />,
        // @ts-expect-error onDoubleSendChange is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} onDoubleSendChange={() => {}} />,
      ];
      const flags = [
        // @ts-expect-error reverbSendSwelling is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} reverbSendSwelling />,
        // @ts-expect-error delaySendSwelling is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} delaySendSwelling />,
        // @ts-expect-error gritSendSwelling is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} gritSendSwelling />,
        // @ts-expect-error shimmerSendSwelling is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} shimmerSendSwelling />,
        // @ts-expect-error doubleSendSwelling is no longer a prop
        <AudioSettingSection value={makeValue()} {...props} doubleSendSwelling />,
      ];
      expect([...handlers, ...flags]).toHaveLength(10);
    });
  });

  describe('React.memo (docs/tasks/archive/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1)', () => {
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
        <AudioSettingSection value={makeValue({ masterVolume: 0.42 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />
      );
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(
        <AudioSettingSection value={makeValue({ masterVolume: 0.55 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} {...PAN_NOOPS} {...LEVEL_NOOPS} />
      );

      const radioCalls = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls
        .filter(([schema]) => schema.id === AUDIO_SETTING_SCHEMA.id).length;
      expect(radioCalls).toBe(0);
    });
  });

});
