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
import { AUDIO_SETTING_SCHEMA, VOLUME_SCHEMA, PAN_SCHEMA, PAN_AUTO_SCHEMA, REVERB_SEND_SCHEMA, DELAY_SEND_SCHEMA } from '@/data/robotOptionsConfig';
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
// The Reverb and Delay rows' two handlers, for every case that does not exercise them (docs/specs/ROBOT_SENDS.md §1.6).
const SEND_NOOPS = { onReverbSendChange: () => {}, onDelaySendChange: () => {} };

function makeValue(overrides: Partial<{
  audioMode: NonNullable<Robot['audioMode']>; masterVolume: number; pan: number; panAuto: boolean; reverbSend: number; delaySend: number;
}> = {}) {
  return {
    audioMode: 'none' as NonNullable<Robot['audioMode']>,
    masterVolume: 0.42,
    pan: 0,
    panAuto: true,
    reverbSend: 0.3,
    delaySend: 0.1,
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
        onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS}
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
        onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS}
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
        onVolumeChange={onVolumeChange} {...PAN_NOOPS} {...SEND_NOOPS}
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
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />
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
      render(<AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);
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
      render(<AudioSettingSection value={{ ...value, volumeLfo: { shape: 'sine', rate: 0, depth: 20 } }} onAudioModeChange={noop} onVolumeChange={noop} {...PAN_NOOPS} {...SEND_NOOPS} />);
      // @ts-expect-error onVolumeLfoChange no longer exists
      render(<AudioSettingSection value={value} onAudioModeChange={noop} onVolumeChange={noop} {...PAN_NOOPS} {...SEND_NOOPS} onVolumeLfoChange={noop} />);
      // @ts-expect-error volumeLfoHeldOff no longer exists
      render(<AudioSettingSection value={value} onAudioModeChange={noop} onVolumeChange={noop} {...PAN_NOOPS} {...SEND_NOOPS} volumeLfoHeldOff />);
      expect(screen.getAllByRole('radio', { name: 'Solo' })).toHaveLength(3);
    });
  });

  describe('Volume layout (was "always above its LFO"; the LFO is gone, the column stays)', () => {
    it('the Audio Setting radio and Volume slider both render inside the settings-column panel', () => {
      render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />
      );
      // The settings-column panel (Audio Setting + Volume) is the innermost .sc-directional-panel
      // containing the radio.
      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(settingsColumn.contains(screen.getByRole('slider', { name: /volume/i }))).toBe(true);
    });

    it("the Volume row is not a flex container — 'audio-setting-section__row' adds display:flex, which shrinks a lone flex item (the slider) to its own content width instead of the row's full width, breaking useVoxelTrackBoxCount's self-observation (same pattern audio-rig-drawer__param-row / sc-lfo-target-group__row already avoid elsewhere by carrying no display rule at all)", () => {
      render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />
      );
      const volumeRow = screen.getByRole('slider', { name: /volume/i }).closest('.audio-setting-section__volume-row')!;
      expect(volumeRow).not.toBeNull();
      expect(volumeRow.classList.contains('audio-setting-section__row')).toBe(false);
    });

    it('renders data-orientation="column" on the outer panel regardless of tier — Audio Setting then Volume, always stacked, never a side-by-side desktop split', () => {
      for (const state of [{ mobile: true, tablet: true }, { mobile: false, tablet: false }]) {
        stubMatchMedia(state);
        const { unmount } = render(
          <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />
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
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />
      );
      const settingsColumn = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(settingsColumn.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('the Volume row no longer carries LFO-group targeting (no sc-lfo-target-group__row, no isActive) — there is nothing left to target', () => {
      const { container } = render(
        <AudioSettingSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />
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
        onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS}
      />
    );
    expect(screen.getByRole('radio', { name: 'Solo' }).getAttribute('data-disabled')).toBeNull();
  });

  it('disables Audio Setting and Volume when disabled is true', () => {
    render(
      <AudioSettingSection
        value={makeValue()}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS}
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
        onVolumeChange={onVolumeChange} {...PAN_NOOPS} {...SEND_NOOPS}
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
          onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS}
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
          onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS}
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
      render(<AudioSettingSection value={makeValue({ pan: 0.9, panAuto: true })} livePan={-0.25} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);

      const readout = screen.getByRole('status');
      expect(readout.textContent).toContain('-25');
      expect(readout.getAttribute('data-readonly')).toBe('true');
      expect(screen.queryByRole('slider', { name: panName })).toBeNull();
      expect(screen.getByRole('slider', { name: /volume/i })).toBeTruthy(); // Volume is untouched
    });

    it('Auto on without a livePan (company screen, or before the first tick): shows the stored pan x 100', () => {
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);
      expect(screen.getByRole('status').textContent).toContain('40');
    });

    it('Auto on with a livePan of exactly 0 shows 0, not the stored pan (nullish, not falsy)', () => {
      render(<AudioSettingSection value={makeValue({ pan: 0.9, panAuto: true })} livePan={0} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);
      expect(screen.getByRole('status').textContent).toContain('0');
      expect(screen.getByRole('status').textContent).not.toContain('90');
    });

    it('Auto on shows a fractional live pan without float noise', () => {
      render(<AudioSettingSection value={makeValue()} livePan={0.29} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);
      expect(screen.getByRole('status').textContent).toContain('29');
      expect(screen.getByRole('status').textContent).not.toContain('28.99');
    });

    it('Auto on: a readout change from livePan alone updates what is shown (the section re-renders on livePan)', async () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...SEND_NOOPS };
      const value = makeValue({ pan: 0, panAuto: true });
      const { rerender } = render(<AudioSettingSection value={value} livePan={0.1} {...props} />);
      expect(screen.getByRole('status').textContent).toContain('10');

      rerender(<AudioSettingSection value={value} livePan={0.3} {...props} />);
      // The readout eases (useEasedControlValue); the shared gsap mock settles it in a microtask.
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('30'));
    });

    it('Auto off: an interactive -100..100 slider at the stored pan x 100, ignoring a stale livePan', () => {
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: false })} livePan={-0.5} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);

      const slider = panSlider();
      expect(slider.getAttribute('aria-valuenow')).toBe('40');
      expect(slider.getAttribute('aria-valuemin')).toBe('-100');
      expect(slider.getAttribute('aria-valuemax')).toBe('100');
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('Auto off: reaches the full travel at both ends (-1 and 1 store as -100 and 100)', () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...SEND_NOOPS };
      const left = render(<AudioSettingSection value={makeValue({ pan: -1, panAuto: false })} {...props} />);
      expect(panSlider().getAttribute('aria-valuenow')).toBe('-100');
      left.unmount();

      render(<AudioSettingSection value={makeValue({ pan: 1, panAuto: false })} {...props} />);
      expect(panSlider().getAttribute('aria-valuenow')).toBe('100');
    });

    it('Auto off: a keyboard step calls onPanChange with the display number (pan x 100 + 1), not the -1..1 fraction', () => {
      const onPanChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...SEND_NOOPS} />);

      fireEvent.keyDown(panSlider(), { key: 'ArrowRight' });
      expect(onPanChange).toHaveBeenCalledTimes(1);
      expect(onPanChange).toHaveBeenCalledWith(41);
    });

    it('Auto off: a keyboard step the other way steps down by one display unit', () => {
      const onPanChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...SEND_NOOPS} />);

      fireEvent.keyDown(panSlider(), { key: 'ArrowLeft' });
      expect(onPanChange).toHaveBeenCalledWith(39);
    });

    it('Auto off: End and Home drive the slider to the full left and right of the field', () => {
      const onPanChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ pan: 0.4, panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...SEND_NOOPS} />);

      fireEvent.keyDown(panSlider(), { key: 'End' });
      expect(onPanChange).toHaveBeenLastCalledWith(100);
      fireEvent.keyDown(panSlider(), { key: 'Home' });
      expect(onPanChange).toHaveBeenLastCalledWith(-100);
    });

    it('Auto off: a step on Pan never calls the Volume or Audio Setting handlers', () => {
      const onVolumeChange = vi.fn();
      const onAudioModeChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={onAudioModeChange} onVolumeChange={onVolumeChange} {...PAN_NOOPS} {...SEND_NOOPS} />);

      fireEvent.keyDown(panSlider(), { key: 'ArrowRight' });
      expect(onVolumeChange).not.toHaveBeenCalled();
      expect(onAudioModeChange).not.toHaveBeenCalled();
    });

    it('the Auto readout never calls onPanChange, whatever key is pressed', () => {
      const onPanChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: true })} livePan={0.2} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...SEND_NOOPS} />);

      fireEvent.keyDown(screen.getByRole('status'), { key: 'ArrowRight' });
      expect(onPanChange).not.toHaveBeenCalled();
    });

    it('the Auto toggle reflects panAuto and is named from the content layer', () => {
      const { rerender } = render(<AudioSettingSection value={makeValue({ panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);
      expect(screen.getByRole('switch', { name: autoName }).getAttribute('aria-checked')).toBe('true');

      rerender(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);
      expect(screen.getByRole('switch', { name: autoName }).getAttribute('aria-checked')).toBe('false');
    });

    it('clicking the toggle while Auto is off calls onPanAutoChange(true)', () => {
      const onPanAutoChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={() => {}} onPanAutoChange={onPanAutoChange} {...SEND_NOOPS} />);

      fireEvent.click(screen.getByRole('switch', { name: autoName }));
      expect(onPanAutoChange).toHaveBeenCalledTimes(1);
      expect(onPanAutoChange).toHaveBeenCalledWith(true);
    });

    it('clicking the toggle while Auto is on calls onPanAutoChange(false)', () => {
      const onPanAutoChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={() => {}} onPanAutoChange={onPanAutoChange} {...SEND_NOOPS} />);

      fireEvent.click(screen.getByRole('switch', { name: autoName }));
      expect(onPanAutoChange).toHaveBeenCalledWith(false);
    });

    it('labels and help come from the content layer: both controls carry a "?" and the label text is the content entry', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);

      expect(screen.getByText(CONTENT['probe.pan'].human)).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.pan'].human }) })).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.pan.auto'].human }) })).toBeTruthy();
    });

    it('the readout keeps its "?" while Auto is on', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.pan'].human }) })).toBeTruthy();
    });

    it('disabled: the toggle and the manual slider are disabled and call nothing', () => {
      const onPanChange = vi.fn();
      const onPanAutoChange = vi.fn();
      render(<AudioSettingSection value={makeValue({ panAuto: false })} disabled onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={onPanAutoChange} {...SEND_NOOPS} />);

      expect(panSlider().getAttribute('data-disabled')).toBe('');
      expect(screen.getByRole('switch', { name: autoName }).getAttribute('data-disabled')).toBe('');
      fireEvent.keyDown(panSlider(), { key: 'ArrowRight' });
      fireEvent.click(screen.getByRole('switch', { name: autoName }));
      expect(onPanChange).not.toHaveBeenCalled();
      expect(onPanAutoChange).not.toHaveBeenCalled();
    });

    it('the Pan row sits in the settings column, after Volume, as a row panel holding the slider and the toggle', () => {
      render(<AudioSettingSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);

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
      render(<AudioSettingSection value={makeValue({ panAuto: true })} livePan={0.1} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />);
      expect(screen.getByRole('status').closest('.audio-setting-section__pan-slider')).not.toBeNull();
    });

    it('the pan-slider wrapper grows to fill the row and is not itself a flex container (useVoxelTrackSlider must see a block box)', () => {
      const body = getCssRuleBody(css, '.audio-setting-section__pan-slider');
      expect(body).not.toBeNull();
      expect(body).toMatch(/flex(-grow)?\s*:\s*1/);
      expect(body).not.toMatch(/display\s*:\s*(inline-)?flex/);
    });

    it('is still a React.memo section: a livePan change re-renders neither the Audio Setting radio nor the Volume slider', () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...SEND_NOOPS };
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
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...SEND_NOOPS };
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
    const baseProps = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...SEND_NOOPS };
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
        onReverbSendChange: vi.fn(), onDelaySendChange: vi.fn(),
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
        <AudioSettingSection value={makeValue({ masterVolume: 0.42 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />
      );
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(
        <AudioSettingSection value={makeValue({ masterVolume: 0.55 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} {...PAN_NOOPS} {...SEND_NOOPS} />
      );

      const radioCalls = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls
        .filter(([schema]) => schema.id === AUDIO_SETTING_SCHEMA.id).length;
      expect(radioCalls).toBe(0);
    });
  });

});
