import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
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

import { AudioSettingSection } from './AudioSettingSection';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { AUDIO_SETTING_SCHEMA, VOLUME_SCHEMA, PAN_SCHEMA, PAN_AUTO_SCHEMA, REVERB_SEND_SCHEMA, DELAY_SEND_SCHEMA, DYNAMICS_SCHEMA,
  GRIT_SEND_SCHEMA, SHIMMER_SEND_SCHEMA, DOUBLE_SEND_SCHEMA } from '@/data/robotOptionsConfig';
import { CONTENT, fill } from '@/content';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
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

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'AudioSettingSection.css'), 'utf8');

// The Pan row's two handlers, for every case that does not exercise Pan (docs/specs/ROBOT_PAN.md §1.5).
const PAN_NOOPS = { onPanChange: () => {}, onPanAutoChange: () => {} };
// The send and Dynamics rows' handlers, for every case that does not exercise them (docs/specs/ROBOT_SENDS.md §1.6;
// docs/specs/ROBOT_PERFORMANCE.md §1.6; docs/specs/ROBOT_EFFECT_SENDS.md §1.6).
const LEVEL_NOOPS = {
  onReverbSendChange: () => {}, onDelaySendChange: () => {}, onDynamicsChange: () => {},
  onGritSendChange: () => {}, onShimmerSendChange: () => {}, onDoubleSendChange: () => {},
};

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

    it('the pan-slider wrapper grows to fill the row and is not itself a flex container (useVoxelTrackSlider must see a block box)', () => {
      const body = getCssRuleBody(css, '.audio-setting-section__pan-slider');
      expect(body).not.toBeNull();
      expect(body).toMatch(/flex(-grow)?\s*:\s*1/);
      expect(body).not.toMatch(/display\s*:\s*(inline-)?flex/);
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

    it('a Reverb keyboard step calls onReverbSendChange with the display number (send x 100 + 1), not the 0..1 fraction', () => {
      const onReverbSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ reverbSend: 0.3 })} {...baseProps} onReverbSendChange={onReverbSendChange} />);

      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      expect(onReverbSendChange).toHaveBeenCalledTimes(1);
      expect(onReverbSendChange).toHaveBeenCalledWith(31);
    });

    it('a Reverb keyboard step the other way steps down by one display unit', () => {
      const onReverbSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ reverbSend: 0.3 })} {...baseProps} onReverbSendChange={onReverbSendChange} />);

      fireEvent.keyDown(reverbSlider(), { key: 'ArrowLeft' });
      expect(onReverbSendChange).toHaveBeenCalledWith(29);
    });

    it('a fractional stored send (a swell lands between whole percents) keeps its fraction on the slider', () => {
      render(<AudioSettingSection value={makeValue({ reverbSend: 0.125 })} {...baseProps} />);
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('12.5');
    });

    it('a Delay keyboard step calls onDelaySendChange with the display number', () => {
      const onDelaySendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ delaySend: 0.1 })} {...baseProps} onDelaySendChange={onDelaySendChange} />);

      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      expect(onDelaySendChange).toHaveBeenCalledTimes(1);
      expect(onDelaySendChange).toHaveBeenCalledWith(11);
    });

    it('End and Home drive each slider to its full travel (100 and 0)', () => {
      const onReverbSendChange = vi.fn();
      const onDelaySendChange = vi.fn();
      render(<AudioSettingSection value={makeValue()} {...baseProps} onReverbSendChange={onReverbSendChange} onDelaySendChange={onDelaySendChange} />);

      fireEvent.keyDown(reverbSlider(), { key: 'End' });
      expect(onReverbSendChange).toHaveBeenLastCalledWith(100);
      fireEvent.keyDown(reverbSlider(), { key: 'Home' });
      expect(onReverbSendChange).toHaveBeenLastCalledWith(0);
      fireEvent.keyDown(delaySlider(), { key: 'End' });
      expect(onDelaySendChange).toHaveBeenLastCalledWith(100);
      fireEvent.keyDown(delaySlider(), { key: 'Home' });
      expect(onDelaySendChange).toHaveBeenLastCalledWith(0);
    });

    it('never emits a display number outside 0..100: stepping down from 0 or up from 100 stays in range', () => {
      const onReverbSendChange = vi.fn();
      const onDelaySendChange = vi.fn();
      const props = { ...baseProps, onReverbSendChange, onDelaySendChange };
      const dry = render(<AudioSettingSection value={makeValue({ reverbSend: 0, delaySend: 0 })} {...props} />);
      fireEvent.keyDown(reverbSlider(), { key: 'ArrowLeft' });
      fireEvent.keyDown(delaySlider(), { key: 'ArrowLeft' });
      dry.unmount();
      render(<AudioSettingSection value={makeValue({ reverbSend: 1, delaySend: 1 })} {...props} />);
      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });

      [...onReverbSendChange.mock.calls, ...onDelaySendChange.mock.calls].forEach(([n]) => {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      });
    });

    it('a step on one send never calls the other send, Volume, Pan or Audio Setting handlers', () => {
      const handlers = {
        onAudioModeChange: vi.fn(), onVolumeChange: vi.fn(), onPanChange: vi.fn(), onPanAutoChange: vi.fn(),
        onReverbSendChange: vi.fn(), onDelaySendChange: vi.fn(), onDynamicsChange: vi.fn(),
        onGritSendChange: vi.fn(), onShimmerSendChange: vi.fn(), onDoubleSendChange: vi.fn(),
      };
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...handlers} />);

      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      expect(handlers.onReverbSendChange).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      expect(handlers.onDelaySendChange).toHaveBeenCalledTimes(1);

      expect(handlers.onReverbSendChange).toHaveBeenCalledTimes(1);
      expect(handlers.onDelaySendChange).toHaveBeenCalledTimes(1);
      expect(handlers.onVolumeChange).not.toHaveBeenCalled();
      expect(handlers.onPanChange).not.toHaveBeenCalled();
      expect(handlers.onPanAutoChange).not.toHaveBeenCalled();
      expect(handlers.onDynamicsChange).not.toHaveBeenCalled();
      expect(handlers.onAudioModeChange).not.toHaveBeenCalled();
    });

    it('a Volume or Pan step never calls either send handler', () => {
      const onReverbSendChange = vi.fn();
      const onDelaySendChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...baseProps} onReverbSendChange={onReverbSendChange} onDelaySendChange={onDelaySendChange} />);

      fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });
      fireEvent.keyDown(screen.getByRole('slider', { name: new RegExp(`^${CONTENT['probe.pan'].human}`, 'i') }), { key: 'ArrowRight' });
      expect(onReverbSendChange).not.toHaveBeenCalled();
      expect(onDelaySendChange).not.toHaveBeenCalled();
    });

    it('disabled: both sliders are disabled and call nothing', () => {
      const onReverbSendChange = vi.fn();
      const onDelaySendChange = vi.fn();
      render(<AudioSettingSection value={makeValue()} disabled {...baseProps} onReverbSendChange={onReverbSendChange} onDelaySendChange={onDelaySendChange} />);

      expect(reverbSlider().getAttribute('data-disabled')).toBe('');
      expect(delaySlider().getAttribute('data-disabled')).toBe('');
      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      expect(onReverbSendChange).not.toHaveBeenCalled();
      expect(onDelaySendChange).not.toHaveBeenCalled();
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

    it('the component source writes no display string for the rows (they come from the schemas)', () => {
      const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'AudioSettingSection.tsx'), 'utf8');
      expect(source).not.toContain(CONTENT['probe.reverbSend'].human + '\'');
      expect(source).not.toContain('>' + CONTENT['probe.reverbSend'].human + '<');
      expect(source).not.toContain('>' + CONTENT['probe.delaySend'].human + '<');
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

    it('the stylesheet gives neither wrapper a display:flex rule (scanned, as the Pan wrapper is)', () => {
      for (const cls of ['.audio-setting-section__reverb-row', '.audio-setting-section__delay-row']) {
        const body = getCssRuleBody(css, cls);
        if (body !== null) expect(body, cls).not.toMatch(/display\s*:\s*(inline-)?flex/);
      }
      // ...and no combined selector rule smuggles flex onto them either.
      expect(css).not.toMatch(/__(reverb|delay)-row[^{]*\{[^}]*display\s*:\s*(inline-)?flex/);
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
      expect(rerendered).not.toContain(DELAY_SEND_SCHEMA.id);
      expect(rerendered).not.toContain(VOLUME_SCHEMA.id);
      expect(rerendered).not.toContain(PAN_SCHEMA.id);
      expect(rerendered).not.toContain(PAN_AUTO_SCHEMA.id);
      expect(rerendered).not.toContain(AUDIO_SETTING_SCHEMA.id);
    });

    it('editing Delay re-renders not Reverb, and editing Volume re-renders neither send', () => {
      const { rerender } = render(<AudioSettingSection value={makeValue({ delaySend: 0.1, masterVolume: 0.42 })} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<AudioSettingSection value={makeValue({ delaySend: 0.2, masterVolume: 0.42 })} {...baseProps} />);
      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id)).not.toContain(REVERB_SEND_SCHEMA.id);

      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();
      rerender(<AudioSettingSection value={makeValue({ delaySend: 0.2, masterVolume: 0.7 })} {...baseProps} />);
      const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
      expect(rerendered).not.toContain(REVERB_SEND_SCHEMA.id);
      expect(rerendered).not.toContain(DELAY_SEND_SCHEMA.id);
    });

    // docs/tasks/ROBOT_SENDS.md Task 13 - the swell flags. The flag reaches the slider's `swelling` prop, which makes
    // an external value change land at once (a swell tick is already smooth) instead of through the 250 ms ease. In
    // this test environment the ease completes on a microtask, so a synchronous read after a rerender tells the two apart.
    describe('swelling flags (Robot Sends Task 13)', () => {
      const shown = (slider: HTMLElement) => slider.getAttribute('aria-valuenow');

      it('reverbSendSwelling makes an external Reverb change land at once, and leaves Delay easing', async () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} reverbSendSwelling />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} reverbSendSwelling />);

        expect(shown(reverbSlider())).toBe('60'); // snapped
        expect(shown(delaySlider())).toBe('10'); // still easing
        await waitFor(() => expect(shown(delaySlider())).toBe('50'));
      });

      it('delaySendSwelling makes an external Delay change land at once, and leaves Reverb easing', async () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} delaySendSwelling />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} delaySendSwelling />);

        expect(shown(delaySlider())).toBe('50');
        expect(shown(reverbSlider())).toBe('30');
        await waitFor(() => expect(shown(reverbSlider())).toBe('60'));
      });

      it('with neither flag (the default) both sends ease, never snap', async () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} />);

        expect(shown(reverbSlider())).toBe('30');
        expect(shown(delaySlider())).toBe('10');
        await waitFor(() => expect(shown(reverbSlider())).toBe('60'));
        await waitFor(() => expect(shown(delaySlider())).toBe('50'));
      });

      it('an explicit false behaves as absent', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3 })} {...baseProps} reverbSendSwelling={false} delaySendSwelling={false} />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6 })} {...baseProps} reverbSendSwelling={false} delaySendSwelling={false} />);
        expect(shown(reverbSlider())).toBe('30');
      });

      it('both flags together snap both sends', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} reverbSendSwelling delaySendSwelling />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} reverbSendSwelling delaySendSwelling />);
        expect(shown(reverbSlider())).toBe('60');
        expect(shown(delaySlider())).toBe('50');
      });

      it('a send flag does not touch Volume: a Volume change still eases', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ masterVolume: 0.2 })} {...baseProps} reverbSendSwelling delaySendSwelling />);
        rerender(<AudioSettingSection value={makeValue({ masterVolume: 0.9 })} {...baseProps} reverbSendSwelling delaySendSwelling />);
        expect(shown(screen.getByRole('slider', { name: /volume/i }))).toBe('20');
      });

      it('flipping a flag by itself moves no slider and fires no change handler', () => {
        const onReverbSendChange = vi.fn();
        const onDelaySendChange = vi.fn();
        const props = { ...baseProps, onReverbSendChange, onDelaySendChange };
        const { rerender } = render(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...props} />);
        rerender(<AudioSettingSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...props} reverbSendSwelling delaySendSwelling />);
        expect(shown(reverbSlider())).toBe('30');
        expect(shown(delaySlider())).toBe('10');
        expect(onReverbSendChange).not.toHaveBeenCalled();
        expect(onDelaySendChange).not.toHaveBeenCalled();
      });

      it('flipping reverbSendSwelling re-renders the Reverb slider only', () => {
        const value = makeValue({ panAuto: false });
        const { rerender } = render(<AudioSettingSection value={value} {...baseProps} />);
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

        rerender(<AudioSettingSection value={value} {...baseProps} reverbSendSwelling />);

        const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
        expect(rerendered).toContain(REVERB_SEND_SCHEMA.id);
        expect(rerendered).not.toContain(DELAY_SEND_SCHEMA.id);
        expect(rerendered).not.toContain(VOLUME_SCHEMA.id);
        expect(rerendered).not.toContain(PAN_SCHEMA.id);
      });

      it('flipping delaySendSwelling re-renders the Delay slider only', () => {
        const value = makeValue({ panAuto: false });
        const { rerender } = render(<AudioSettingSection value={value} {...baseProps} />);
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

        rerender(<AudioSettingSection value={value} {...baseProps} delaySendSwelling />);

        const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
        expect(rerendered).toContain(DELAY_SEND_SCHEMA.id);
        expect(rerendered).not.toContain(REVERB_SEND_SCHEMA.id);
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
        onReverbSendChange: vi.fn(), onDelaySendChange: vi.fn(), onDynamicsChange: vi.fn(),
        onGritSendChange: vi.fn(), onShimmerSendChange: vi.fn(), onDoubleSendChange: vi.fn(),
      };
      render(<AudioSettingSection value={makeValue({ panAuto: false })} {...handlers} />);

      fireEvent.keyDown(dynamicsSlider(), { key: 'ArrowRight' });
      expect(handlers.onDynamicsChange).toHaveBeenCalledTimes(1);
      const others = [handlers.onAudioModeChange, handlers.onVolumeChange, handlers.onPanChange, handlers.onPanAutoChange, handlers.onReverbSendChange, handlers.onDelaySendChange];
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

    it('the component source writes no display string for the row (it comes from the schema)', () => {
      const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'AudioSettingSection.tsx'), 'utf8');
      expect(source).not.toContain('>' + CONTENT['probe.levels.dynamics'].human + '<');
      expect(source).not.toContain(CONTENT['probe.levels.dynamics'].human + '\'');
    });

    it('sits in its own wrapper that is not the display:flex row, and the stylesheet gives it no flex rule', () => {
      render(<AudioSettingSection value={makeValue()} {...baseProps} />);

      const wrapper = dynamicsSlider().closest('.audio-setting-section__dynamics-row')!;
      expect(wrapper).not.toBeNull();
      expect(wrapper.classList.contains('audio-setting-section__row')).toBe(false);
      const body = getCssRuleBody(css, '.audio-setting-section__dynamics-row');
      if (body !== null) expect(body).not.toMatch(/display\s*:\s*(inline-)?flex/);
      expect(css).not.toMatch(/__dynamics-row[^{]*\{[^}]*display\s*:\s*(inline-)?flex/);
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
      [DELAY_SEND_SCHEMA.id, REVERB_SEND_SCHEMA.id, VOLUME_SCHEMA.id, PAN_SCHEMA.id, PAN_AUTO_SCHEMA.id, AUDIO_SETTING_SCHEMA.id]
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
      { name: 'Grit', field: 'gritSend', key: 'probe.gritSend', handler: 'onGritSendChange', flag: 'gritSendSwelling', schema: GRIT_SEND_SCHEMA, wrapper: 'audio-setting-section__grit-row' },
      { name: 'Shimmer', field: 'shimmerSend', key: 'probe.shimmerSend', handler: 'onShimmerSendChange', flag: 'shimmerSendSwelling', schema: SHIMMER_SEND_SCHEMA, wrapper: 'audio-setting-section__shimmer-row' },
      { name: 'Double', field: 'doubleSend', key: 'probe.doubleSend', handler: 'onDoubleSendChange', flag: 'doubleSendSwelling', schema: DOUBLE_SEND_SCHEMA, wrapper: 'audio-setting-section__double-row' },
    ] as const;
    const ALL_SEND_HANDLERS = ['onReverbSendChange', 'onDelaySendChange', 'onGritSendChange', 'onShimmerSendChange', 'onDoubleSendChange'] as const;

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

    it('a step on one new send calls only its own handler: no other send, Volume, Pan, Dynamics or Audio Setting handler', () => {
      for (const row of ROWS) {
        const handlers = {
          onAudioModeChange: vi.fn(), onVolumeChange: vi.fn(), onPanChange: vi.fn(), onPanAutoChange: vi.fn(), onDynamicsChange: vi.fn(),
          onReverbSendChange: vi.fn(), onDelaySendChange: vi.fn(), onGritSendChange: vi.fn(), onShimmerSendChange: vi.fn(), onDoubleSendChange: vi.fn(),
        };
        const view = render(<AudioSettingSection value={makeValue({ panAuto: false })} {...handlers} />);

        fireEvent.keyDown(sliderFor(row.key), { key: 'ArrowRight' });

        const called = Object.entries(handlers).filter(([, fn]) => fn.mock.calls.length > 0).map(([name]) => name);
        expect(called, row.name).toEqual([row.handler]);
        view.unmount();
      }
    });

    // Task 14 made the three values and handlers required, so neither screen can leave a row out. `npm run build:types`
    // checks the directives: each goes unused (an error) if the prop it names turns optional again.
    it('the three values and the three handlers are required props', () => {
      const { onGritSendChange: _grit, onShimmerSendChange: _shimmer, onDoubleSendChange: _double, ...withoutNewHandlers } = LEVEL_NOOPS;
      const { gritSend: _g, shimmerSend: _s, doubleSend: _d, ...withoutNewValues } = makeValue();
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS };
      // @ts-expect-error onGritSendChange, onShimmerSendChange and onDoubleSendChange are required
      const missingHandlers = <AudioSettingSection value={makeValue()} {...props} {...withoutNewHandlers} />;
      // @ts-expect-error value.gritSend, shimmerSend and doubleSend are required
      const missingValues = <AudioSettingSection value={withoutNewValues} {...props} {...LEVEL_NOOPS} />;
      expect([missingHandlers, missingValues]).toHaveLength(2);
    });

    it('a Reverb or Delay step never calls a new send handler', () => {
      const onGritSendChange = vi.fn();
      const onShimmerSendChange = vi.fn();
      const onDoubleSendChange = vi.fn();
      render(<AudioSettingSection value={makeValue()} {...baseProps} onGritSendChange={onGritSendChange} onShimmerSendChange={onShimmerSendChange} onDoubleSendChange={onDoubleSendChange} />);

      fireEvent.keyDown(sliderFor('probe.reverbSend'), { key: 'ArrowRight' });
      fireEvent.keyDown(sliderFor('probe.delaySend'), { key: 'ArrowRight' });
      expect(onGritSendChange).not.toHaveBeenCalled();
      expect(onShimmerSendChange).not.toHaveBeenCalled();
      expect(onDoubleSendChange).not.toHaveBeenCalled();
    });

    describe.each(ROWS)('$name', ({ field, key, handler, flag, schema, wrapper }) => {
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

      it('a keyboard step calls its handler once with the display number (send x 100 +/- 1), not the 0..1 fraction', () => {
        const fn = vi.fn();
        const up = render(<AudioSettingSection value={makeValue({ [field]: 0.3 })} {...baseProps} {...{ [handler]: fn }} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowRight' });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenLastCalledWith(31);
        up.unmount();

        render(<AudioSettingSection value={makeValue({ [field]: 0.3 })} {...baseProps} {...{ [handler]: fn }} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowLeft' });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith(29);
      });

      it('End and Home drive it to its full travel, and it never emits outside 0..100', () => {
        const fn = vi.fn();
        const top = render(<AudioSettingSection value={makeValue({ [field]: 1 })} {...baseProps} {...{ [handler]: fn }} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowRight' });
        fireEvent.keyDown(sliderFor(key), { key: 'Home' });
        expect(fn).toHaveBeenLastCalledWith(0);
        top.unmount();
        render(<AudioSettingSection value={makeValue({ [field]: 0 })} {...baseProps} {...{ [handler]: fn }} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowLeft' });
        fireEvent.keyDown(sliderFor(key), { key: 'End' });
        expect(fn).toHaveBeenLastCalledWith(100);
        fn.mock.calls.forEach(([n]) => {
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
        render(<AudioSettingSection value={makeValue()} disabled {...baseProps} {...{ [handler]: fn }} />);
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
        const body = getCssRuleBody(css, `.${wrapper}`);
        if (body !== null) expect(body).not.toMatch(/display\s*:\s*(inline-)?flex/);
        expect(css).not.toMatch(new RegExp(`${wrapper}[^{]*\\{[^}]*display\\s*:\\s*(inline-)?flex`));
      });

      it('editing it re-renders no other slider, and editing Reverb or Volume does not re-render it', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ [field]: 0.3, panAuto: false })} {...baseProps} />);
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

        rerender(<AudioSettingSection value={makeValue({ [field]: 0.4, panAuto: false })} {...baseProps} />);
        const others = [REVERB_SEND_SCHEMA, DELAY_SEND_SCHEMA, VOLUME_SCHEMA, PAN_SCHEMA, AUDIO_SETTING_SCHEMA, DYNAMICS_SCHEMA, ...ROWS.map((r) => r.schema)]
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
        const { rerender } = render(<AudioSettingSection value={start} {...baseProps} {...{ [flag]: true }} />);
        rerender(<AudioSettingSection value={next} {...baseProps} {...{ [flag]: true }} />);

        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('50');
        for (const other of ROWS.filter((r) => r.key !== key)) {
          expect(sliderFor(other.key).getAttribute('aria-valuenow'), other.name).toBe('10');
        }
        await waitFor(() => ROWS.forEach((r) => expect(sliderFor(r.key).getAttribute('aria-valuenow')).toBe('50')));
      });

      it('without its flag (the default, or false) it eases, never snaps', () => {
        const { rerender } = render(<AudioSettingSection value={makeValue({ [field]: 0.1 })} {...baseProps} {...{ [flag]: false }} />);
        rerender(<AudioSettingSection value={makeValue({ [field]: 0.5 })} {...baseProps} {...{ [flag]: false }} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('10');
      });
    });

    it('the five send handlers are five props: each row gets its own', () => {
      const fns = Object.fromEntries(ALL_SEND_HANDLERS.map((h) => [h, vi.fn()]));
      render(<AudioSettingSection value={makeValue()} {...baseProps} {...fns} />);
      const keys = ['probe.reverbSend', 'probe.delaySend', 'probe.gritSend', 'probe.shimmerSend', 'probe.doubleSend'] as const;
      keys.forEach((k) => fireEvent.keyDown(sliderFor(k), { key: 'ArrowRight' }));
      ALL_SEND_HANDLERS.forEach((h) => expect(fns[h], h).toHaveBeenCalledTimes(1));
    });

    it('the component source writes no display string for the new rows (they come from the schemas)', () => {
      const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'AudioSettingSection.tsx'), 'utf8');
      for (const { key } of ROWS) {
        expect(source).not.toContain('>' + CONTENT[key].human + '<');
        expect(source).not.toContain('\'' + CONTENT[key].human + '\'');
      }
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
