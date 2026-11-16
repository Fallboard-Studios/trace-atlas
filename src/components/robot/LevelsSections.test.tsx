import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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

import { LevelsMixSection, LevelsSendsSection, SendRow } from './LevelsSections';
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
// The Dynamics row's handler, for every Mix case that does not exercise it (docs/specs/ROBOT_PERFORMANCE.md §1.6).
const DYNAMICS_NOOP = { onDynamicsChange: () => {} };

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

// docs/specs/CONTENT_LAYOUT.md §1.3 (docs/tasks/CONTENT_LAYOUT.md Task 13): Levels splits into Mix and Sends, each its own
// memoised component.
describe('Levels split into Mix and Sends (control layout Task 13)', () => {
  const DESKTOP = { mobile: false, tablet: false };
  const TABLET = { mobile: false, tablet: true };
  const MIX_PROPS = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, onDynamicsChange: () => {} };
  const panel = (container: HTMLElement, id: string) => container.querySelector(`[data-panel-id="${id}"]`) as HTMLElement;
  const orientationOf = (p: HTMLElement) => p.querySelector(':scope > .sc-directional-panel__content')!.getAttribute('data-orientation');
  const boxes = (container: HTMLElement) => container.querySelectorAll('.sc-directional-panel-facade');
  const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const named = (key: keyof typeof CONTENT) => new RegExp(`^${CONTENT[key].human}`, 'i');
  const sendSlider = (field: RobotSendField) =>
    screen.getByRole('slider', { name: named(ROBOT_SENDS.find((s) => s.field === field)!.contentKey as keyof typeof CONTENT) });

  describe('Mix', () => {
    it('renders two boxes: P1 Volume, then Monitor Mode beside Dynamics; P2 Pan beside Auto', () => {
      stubMatchMedia(DESKTOP);
      const { container } = render(<LevelsMixSection value={makeValue({ panAuto: false })} {...MIX_PROPS} />);
      expect(boxes(container)).toHaveLength(2);

      const p1 = panel(container, 'robotOptions.mix.p1');
      const r2 = panel(container, 'robotOptions.mix.p1.r2');
      const volume = within(p1).getByRole('slider', { name: /volume/i });
      const solo = within(r2).getByRole('radio', { name: 'Solo' });
      const dynamics = within(r2).getByRole('slider', { name: named('probe.levels.dynamics') });
      expect(p1.contains(r2)).toBe(true);
      expect(r2.contains(volume)).toBe(false);
      expect(before(volume, solo)).toBe(true);
      expect(before(solo, dynamics)).toBe(true);

      const p2 = panel(container, 'robotOptions.mix.p2');
      const r1 = panel(container, 'robotOptions.mix.p2.r1');
      expect(p2.contains(r1)).toBe(true);
      expect(within(r1).getByRole('slider', { name: named('probe.pan') })).toBeTruthy();
      expect(within(r1).getByRole('switch', { name: named('probe.pan.auto') })).toBeTruthy();
      expect(p1.contains(r1)).toBe(false);
      expect(before(p1, p2)).toBe(true);
    });

    it('Volume is the first control and its cell alone is featured', () => {
      const { container } = render(<LevelsMixSection value={makeValue({ panAuto: false })} {...MIX_PROPS} />);
      const volume = screen.getByRole('slider', { name: /volume/i });
      expect(screen.getAllByRole('slider')[0]).toBe(volume);
      const featured = container.querySelectorAll('.sc-featured');
      expect(featured).toHaveLength(1);
      expect(featured[0].contains(volume)).toBe(true);
      expect(featured[0].contains(screen.getByRole('radio', { name: 'Solo' }))).toBe(false);
    });

    it('holds no send: Volume, Dynamics and Pan are its only sliders', () => {
      render(<LevelsMixSection value={makeValue({ panAuto: false })} {...MIX_PROPS} />);
      expect(screen.getAllByRole('slider')).toHaveLength(3);
      for (const spec of ROBOT_SENDS) {
        expect(screen.queryByRole('slider', { name: named(spec.contentKey as keyof typeof CONTENT) }), spec.field).toBeNull();
      }
    });

    it.each([['desktop', 'row', DESKTOP], ['tablet', 'column', TABLET]] as const)(
      'on %s, Monitor Mode and Dynamics are a %s; Pan and Auto stay a row',
      (_tier, expected, state) => {
        stubMatchMedia(state);
        const { container } = render(<LevelsMixSection value={makeValue({ panAuto: false })} {...MIX_PROPS} />);
        expect(orientationOf(panel(container, 'robotOptions.mix.p1.r2'))).toBe(expected);
        expect(orientationOf(panel(container, 'robotOptions.mix.p2.r1'))).toBe('row');
      },
    );

    it('the Pan readout (Auto on) sits in the same row as the slider did', () => {
      const { container } = render(<LevelsMixSection value={makeValue({ panAuto: true })} livePan={0.1} {...MIX_PROPS} />);
      expect(panel(container, 'robotOptions.mix.p2.r1').contains(screen.getByRole('status'))).toBe(true);
    });

    it('is a React.memo-wrapped component', () => {
      expect((LevelsMixSection as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  describe('Sends', () => {
    it('renders one box: Reverb beside Delay, Grit beside Shimmer, then Double', () => {
      stubMatchMedia(DESKTOP);
      const { container } = render(<LevelsSendsSection value={makeValue()} onSendChange={() => {}} />);
      expect(boxes(container)).toHaveLength(1);

      const p1 = panel(container, 'robotOptions.sends.p1');
      const r1 = panel(container, 'robotOptions.sends.p1.r1');
      const r2 = panel(container, 'robotOptions.sends.p1.r2');
      expect(p1.contains(r1) && p1.contains(r2)).toBe(true);
      expect(r1.contains(sendSlider('reverbSend')) && r1.contains(sendSlider('delaySend'))).toBe(true);
      expect(r2.contains(sendSlider('gritSend')) && r2.contains(sendSlider('shimmerSend'))).toBe(true);
      const double = sendSlider('doubleSend');
      expect(p1.contains(double)).toBe(true);
      expect(r1.contains(double) || r2.contains(double)).toBe(false);

      const order = ROBOT_SENDS.map((spec) => sendSlider(spec.field));
      for (let i = 1; i < order.length; i++) expect(before(order[i - 1], order[i]), `send ${i}`).toBe(true);
    });

    it('holds the five sends and nothing else, none of them featured', () => {
      const { container } = render(<LevelsSendsSection value={makeValue()} onSendChange={() => {}} />);
      expect(screen.getAllByRole('slider')).toHaveLength(5);
      expect(screen.queryByRole('radio')).toBeNull();
      expect(screen.queryByRole('switch')).toBeNull();
      expect(container.querySelector('.sc-featured')).toBeNull();
    });

    it.each([['desktop', 'row', DESKTOP], ['tablet', 'column', TABLET]] as const)('on %s, its two shared rows are a %s', (_tier, expected, state) => {
      stubMatchMedia(state);
      const { container } = render(<LevelsSendsSection value={makeValue()} onSendChange={() => {}} />);
      expect(orientationOf(panel(container, 'robotOptions.sends.p1.r1'))).toBe(expected);
      expect(orientationOf(panel(container, 'robotOptions.sends.p1.r2'))).toBe(expected);
    });

    it('the held-off note sits once at the foot of the box, after Double, and the held-off row is dimmed with its value kept', () => {
      const { container } = render(<LevelsSendsSection value={makeValue({ gritSend: 0.6 })} onSendChange={() => {}} heldOffSends={swells('gritSend')} />);
      const notes = screen.getAllByText(CONTENT['ui.heldOff'].human);
      expect(notes).toHaveLength(1);
      expect(panel(container, 'robotOptions.sends.p1').contains(notes[0])).toBe(true);
      expect(before(sendSlider('doubleSend'), notes[0])).toBe(true);
      expect(sendSlider('gritSend').getAttribute('data-disabled')).not.toBeNull();
      expect(sendSlider('gritSend').getAttribute('aria-valuenow')).toBe('60');
    });

    it('is a React.memo-wrapped component', () => {
      expect((LevelsSendsSection as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });
});

describe('Levels halves', () => {
  it('Audio Setting radio includes all 4 options and calls onAudioModeChange with the selected value', () => {
    const onAudioModeChange = vi.fn();
    render(
      <LevelsMixSection
        value={makeValue()}
        onAudioModeChange={onAudioModeChange}
        onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP}
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
      <LevelsMixSection
        value={makeValue({ masterVolume: 0.42 })}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP}
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
      <LevelsMixSection
        value={makeValue({ masterVolume: 0.42 })}
        onAudioModeChange={() => {}}
        onVolumeChange={onVolumeChange} {...PAN_NOOPS} {...DYNAMICS_NOOP}
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
        <LevelsMixSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />
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
      render(<LevelsMixSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);
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
      render(<LevelsMixSection value={{ ...value, volumeLfo: { shape: 'sine', rate: 0, depth: 20 } }} onAudioModeChange={noop} onVolumeChange={noop} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);
      // @ts-expect-error onVolumeLfoChange no longer exists
      render(<LevelsMixSection value={value} onAudioModeChange={noop} onVolumeChange={noop} {...PAN_NOOPS} {...DYNAMICS_NOOP} onVolumeLfoChange={noop} />);
      // @ts-expect-error volumeLfoHeldOff no longer exists
      render(<LevelsMixSection value={value} onAudioModeChange={noop} onVolumeChange={noop} {...PAN_NOOPS} {...DYNAMICS_NOOP} volumeLfoHeldOff />);
      expect(screen.getAllByRole('radio', { name: 'Solo' })).toHaveLength(3);
    });
  });

  // The column layout this block pinned became Mix's two boxes (control layout Task 13, the describe at the top).
  describe('Volume row', () => {
    it("the Volume row is not a flex container — 'levels-sections__row' adds display:flex, which shrinks a lone flex item (the slider) to its own content width instead of the row's full width, breaking useVoxelTrackBoxCount's self-observation (same pattern audio-rig-drawer__param-row / sc-lfo-target-group__row already avoid elsewhere by carrying no display rule at all)", () => {
      render(
        <LevelsMixSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />
      );
      const volumeRow = screen.getByRole('slider', { name: /volume/i }).closest('.levels-sections__volume-row')!;
      expect(volumeRow).not.toBeNull();
      expect(volumeRow.classList.contains('levels-sections__row')).toBe(false);
    });

    it('the Volume row no longer carries LFO-group targeting (no sc-lfo-target-group__row, no isActive) — there is nothing left to target', () => {
      const { container } = render(
        <LevelsMixSection value={makeValue()} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />
      );
      expect(container.querySelector('.sc-lfo-target-group__row')).toBeNull();
      expect(screen.getByRole('slider', { name: /volume/i }).closest('.isActive')).toBeNull();
    });
  });

  it('is not disabled by default', () => {
    render(
      <LevelsMixSection
        value={makeValue()}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP}
      />
    );
    expect(screen.getByRole('radio', { name: 'Solo' }).getAttribute('data-disabled')).toBeNull();
  });

  it('disables Audio Setting and Volume when disabled is true', () => {
    render(
      <LevelsMixSection
        value={makeValue()}
        onAudioModeChange={() => {}}
        onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP}
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
      <LevelsMixSection
        value={makeValue()}
        onAudioModeChange={onAudioModeChange}
        onVolumeChange={onVolumeChange} {...PAN_NOOPS} {...DYNAMICS_NOOP}
        disabled
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Solo' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });

    expect(onAudioModeChange).not.toHaveBeenCalled();
    expect(onVolumeChange).not.toHaveBeenCalled();
  });

  // docs/specs/ROBOT_PAN.md §1.5 — the third row of the settings column: the Pan slider (a live readout
  // while Auto is on, an interactive slider while it is off) and the Auto toggle beside it.
  describe('Pan row (docs/tasks/ROBOT_PAN.md Task 8)', () => {
    const panName = new RegExp(`^${CONTENT['probe.pan'].human}`, 'i');
    const autoName = new RegExp(`^${CONTENT['probe.pan.auto'].human}`, 'i');
    const panSlider = () => screen.getByRole('slider', { name: panName });

    it('Auto on: the slider is a role=status readout of livePan x 100, with no interactive pan slider', () => {
      render(<LevelsMixSection value={makeValue({ pan: 0.9, panAuto: true })} livePan={-0.25} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);

      const readout = screen.getByRole('status');
      expect(readout.textContent).toContain('-25');
      expect(readout.getAttribute('data-readonly')).toBe('true');
      expect(screen.queryByRole('slider', { name: panName })).toBeNull();
      expect(screen.getByRole('slider', { name: /volume/i })).toBeTruthy(); // Volume is untouched
    });

    it('Auto on without a livePan (company screen, or before the first tick): shows the stored pan x 100', () => {
      render(<LevelsMixSection value={makeValue({ pan: 0.4, panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);
      expect(screen.getByRole('status').textContent).toContain('40');
    });

    it('Auto on with a livePan of exactly 0 shows 0, not the stored pan (nullish, not falsy)', () => {
      render(<LevelsMixSection value={makeValue({ pan: 0.9, panAuto: true })} livePan={0} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);
      expect(screen.getByRole('status').textContent).toContain('0');
      expect(screen.getByRole('status').textContent).not.toContain('90');
    });

    it('Auto on shows a fractional live pan without float noise', () => {
      render(<LevelsMixSection value={makeValue()} livePan={0.29} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);
      expect(screen.getByRole('status').textContent).toContain('29');
      expect(screen.getByRole('status').textContent).not.toContain('28.99');
    });

    it('Auto on: a readout change from livePan alone updates what is shown (the section re-renders on livePan)', async () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...DYNAMICS_NOOP };
      const value = makeValue({ pan: 0, panAuto: true });
      const { rerender } = render(<LevelsMixSection value={value} livePan={0.1} {...props} />);
      expect(screen.getByRole('status').textContent).toContain('10');

      rerender(<LevelsMixSection value={value} livePan={0.3} {...props} />);
      // The readout eases (useEasedControlValue); the shared gsap mock settles it in a microtask.
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('30'));
    });

    it('Auto off: an interactive -100..100 slider at the stored pan x 100, ignoring a stale livePan', () => {
      render(<LevelsMixSection value={makeValue({ pan: 0.4, panAuto: false })} livePan={-0.5} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);

      const slider = panSlider();
      expect(slider.getAttribute('aria-valuenow')).toBe('40');
      expect(slider.getAttribute('aria-valuemin')).toBe('-100');
      expect(slider.getAttribute('aria-valuemax')).toBe('100');
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('Auto off: reaches the full travel at both ends (-1 and 1 store as -100 and 100)', () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...DYNAMICS_NOOP };
      const left = render(<LevelsMixSection value={makeValue({ pan: -1, panAuto: false })} {...props} />);
      expect(panSlider().getAttribute('aria-valuenow')).toBe('-100');
      left.unmount();

      render(<LevelsMixSection value={makeValue({ pan: 1, panAuto: false })} {...props} />);
      expect(panSlider().getAttribute('aria-valuenow')).toBe('100');
    });

    it('Auto off: a keyboard step calls onPanChange with the display number (pan x 100 + 1), not the -1..1 fraction', () => {
      const onPanChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ pan: 0.4, panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...DYNAMICS_NOOP} />);

      fireEvent.keyDown(panSlider(), { key: 'ArrowRight' });
      expect(onPanChange).toHaveBeenCalledTimes(1);
      expect(onPanChange).toHaveBeenCalledWith(41);
    });

    it('Auto off: a keyboard step the other way steps down by one display unit', () => {
      const onPanChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ pan: 0.4, panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...DYNAMICS_NOOP} />);

      fireEvent.keyDown(panSlider(), { key: 'ArrowLeft' });
      expect(onPanChange).toHaveBeenCalledWith(39);
    });

    it('Auto off: End and Home drive the slider to the full left and right of the field', () => {
      const onPanChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ pan: 0.4, panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...DYNAMICS_NOOP} />);

      fireEvent.keyDown(panSlider(), { key: 'End' });
      expect(onPanChange).toHaveBeenLastCalledWith(100);
      fireEvent.keyDown(panSlider(), { key: 'Home' });
      expect(onPanChange).toHaveBeenLastCalledWith(-100);
    });

    it('Auto off: a step on Pan never calls the Volume or Audio Setting handlers', () => {
      const onVolumeChange = vi.fn();
      const onAudioModeChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ panAuto: false })} onAudioModeChange={onAudioModeChange} onVolumeChange={onVolumeChange} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);

      fireEvent.keyDown(panSlider(), { key: 'ArrowRight' });
      expect(onVolumeChange).not.toHaveBeenCalled();
      expect(onAudioModeChange).not.toHaveBeenCalled();
    });

    it('the Auto readout never calls onPanChange, whatever key is pressed', () => {
      const onPanChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ panAuto: true })} livePan={0.2} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={() => {}} {...DYNAMICS_NOOP} />);

      fireEvent.keyDown(screen.getByRole('status'), { key: 'ArrowRight' });
      expect(onPanChange).not.toHaveBeenCalled();
    });

    it('the Auto toggle reflects panAuto and is named from the content layer', () => {
      const { rerender } = render(<LevelsMixSection value={makeValue({ panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);
      expect(screen.getByRole('switch', { name: autoName }).getAttribute('aria-checked')).toBe('true');

      rerender(<LevelsMixSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);
      expect(screen.getByRole('switch', { name: autoName }).getAttribute('aria-checked')).toBe('false');
    });

    it('clicking the toggle while Auto is off calls onPanAutoChange(true)', () => {
      const onPanAutoChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={() => {}} onPanAutoChange={onPanAutoChange} {...DYNAMICS_NOOP} />);

      fireEvent.click(screen.getByRole('switch', { name: autoName }));
      expect(onPanAutoChange).toHaveBeenCalledTimes(1);
      expect(onPanAutoChange).toHaveBeenCalledWith(true);
    });

    it('clicking the toggle while Auto is on calls onPanAutoChange(false)', () => {
      const onPanAutoChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={() => {}} onPanAutoChange={onPanAutoChange} {...DYNAMICS_NOOP} />);

      fireEvent.click(screen.getByRole('switch', { name: autoName }));
      expect(onPanAutoChange).toHaveBeenCalledWith(false);
    });

    it('labels and help come from the content layer: both controls carry a "?" and the label text is the content entry', () => {
      render(<LevelsMixSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);

      expect(screen.getByText(CONTENT['probe.pan'].human)).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.pan'].human }) })).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.pan.auto'].human }) })).toBeTruthy();
    });

    it('the readout keeps its "?" while Auto is on', () => {
      render(<LevelsMixSection value={makeValue({ panAuto: true })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.pan'].human }) })).toBeTruthy();
    });

    it('disabled: the toggle and the manual slider are disabled and call nothing', () => {
      const onPanChange = vi.fn();
      const onPanAutoChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ panAuto: false })} disabled onAudioModeChange={() => {}} onVolumeChange={() => {}} onPanChange={onPanChange} onPanAutoChange={onPanAutoChange} {...DYNAMICS_NOOP} />);

      expect(panSlider().getAttribute('data-disabled')).toBe('');
      expect(screen.getByRole('switch', { name: autoName }).getAttribute('data-disabled')).toBe('');
      fireEvent.keyDown(panSlider(), { key: 'ArrowRight' });
      fireEvent.click(screen.getByRole('switch', { name: autoName }));
      expect(onPanChange).not.toHaveBeenCalled();
      expect(onPanAutoChange).not.toHaveBeenCalled();
    });

    it('the Pan row sits in Mix, after Volume, as a row panel holding the slider and the toggle', () => {
      const { container } = render(<LevelsMixSection value={makeValue({ panAuto: false })} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);

      const settingsColumn = container.querySelector('.levels-sections__mix')!;
      const volumeRow = screen.getByRole('slider', { name: /volume/i }).closest('.levels-sections__volume-row')!;
      const panWrapper = panSlider().closest('.levels-sections__pan-slider')!;
      expect(panWrapper).not.toBeNull();
      expect(settingsColumn.contains(panWrapper)).toBe(true);
      expect(volumeRow.compareDocumentPosition(panWrapper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const rowPanel = panWrapper.closest('.sc-directional-panel')!;
      expect(rowPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
      expect(rowPanel.contains(screen.getByRole('switch', { name: autoName }))).toBe(true);
      expect(rowPanel.contains(screen.getByRole('slider', { name: /volume/i }))).toBe(false);
    });

    it('the readout is wrapped in the same pan-slider wrapper as the manual slider, so the row never changes shape on flip', () => {
      render(<LevelsMixSection value={makeValue({ panAuto: true })} livePan={0.1} onAudioModeChange={() => {}} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />);
      expect(screen.getByRole('status').closest('.levels-sections__pan-slider')).not.toBeNull();
    });

    it('is still a React.memo section: a livePan change re-renders neither the Audio Setting radio nor the Volume slider', () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...DYNAMICS_NOOP };
      const value = makeValue({ panAuto: true });
      const { rerender } = render(<LevelsMixSection value={value} livePan={0.1} {...props} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsMixSection value={value} livePan={0.2} {...props} />);

      const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
      expect(rerendered).not.toContain(AUDIO_SETTING_SCHEMA.id);
      expect(rerendered).not.toContain(VOLUME_SCHEMA.id);
      expect(rerendered).not.toContain(PAN_AUTO_SCHEMA.id);
    });

    it('editing Volume does not re-render the Auto toggle or the Pan slider', () => {
      const props = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...DYNAMICS_NOOP };
      const { rerender } = render(<LevelsMixSection value={makeValue({ masterVolume: 0.42, panAuto: false })} {...props} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsMixSection value={makeValue({ masterVolume: 0.55, panAuto: false })} {...props} />);

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
    const baseProps = { onSendChange: () => {} };

    it('each slider shows 0-100 % of its own stored 0..1 send, with a 0..100 range', () => {
      render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} />);

      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('30');
      expect(delaySlider().getAttribute('aria-valuenow')).toBe('10');
      [reverbSlider(), delaySlider()].forEach((s) => {
        expect(s.getAttribute('aria-valuemin')).toBe('0');
        expect(s.getAttribute('aria-valuemax')).toBe('100');
      });
    });

    it('reaches both ends of the travel: 0 shows 0 and 1 shows 100', () => {
      const dry = render(<LevelsSendsSection value={makeValue({ reverbSend: 0, delaySend: 0 })} {...baseProps} />);
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('0');
      expect(delaySlider().getAttribute('aria-valuenow')).toBe('0');
      dry.unmount();

      render(<LevelsSendsSection value={makeValue({ reverbSend: 1, delaySend: 1 })} {...baseProps} />);
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('100');
      expect(delaySlider().getAttribute('aria-valuenow')).toBe('100');
    });

    it('the two sliders are independent: different stored values show as different numbers', () => {
      render(<LevelsSendsSection value={makeValue({ reverbSend: 0.9, delaySend: 0.05 })} {...baseProps} />);
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('90');
      expect(delaySlider().getAttribute('aria-valuenow')).toBe('5');
    });

    it.each([0.29, 0.07, 0.57])('a stored %s shows its whole-percent number, with no float noise from the x100', (send) => {
      render(<LevelsSendsSection value={makeValue({ reverbSend: send, delaySend: send })} {...baseProps} />);
      const shown = String(Math.round(send * 100));
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe(shown);
      expect(delaySlider().getAttribute('aria-valuenow')).toBe(shown);
    });

    it('a Reverb keyboard step calls onSendChange(reverbSend) with the display number (send x 100 + 1), not the 0..1 fraction', () => {
      const onSendChange = vi.fn();
      render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3 })} {...baseProps} onSendChange={onSendChange} />);

      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      expect(onSendChange).toHaveBeenCalledTimes(1);
      expect(onSendChange).toHaveBeenCalledWith('reverbSend', 31);
    });

    it('a Reverb keyboard step the other way steps down by one display unit', () => {
      const onSendChange = vi.fn();
      render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3 })} {...baseProps} onSendChange={onSendChange} />);

      fireEvent.keyDown(reverbSlider(), { key: 'ArrowLeft' });
      expect(onSendChange).toHaveBeenCalledWith('reverbSend', 29);
    });

    it('a fractional stored send (a swell lands between whole percents) keeps its fraction on the slider', () => {
      render(<LevelsSendsSection value={makeValue({ reverbSend: 0.125 })} {...baseProps} />);
      expect(reverbSlider().getAttribute('aria-valuenow')).toBe('12.5');
    });

    it('a Delay keyboard step calls onSendChange(delaySend) with the display number', () => {
      const onSendChange = vi.fn();
      render(<LevelsSendsSection value={makeValue({ delaySend: 0.1 })} {...baseProps} onSendChange={onSendChange} />);

      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      expect(onSendChange).toHaveBeenCalledTimes(1);
      expect(onSendChange).toHaveBeenCalledWith('delaySend', 11);
    });

    it('End and Home drive each slider to its full travel (100 and 0)', () => {
      const onSendChange = vi.fn();
      render(<LevelsSendsSection value={makeValue()} {...baseProps} onSendChange={onSendChange} />);

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
      const dry = render(<LevelsSendsSection value={makeValue({ reverbSend: 0, delaySend: 0 })} {...props} />);
      fireEvent.keyDown(reverbSlider(), { key: 'ArrowLeft' });
      fireEvent.keyDown(delaySlider(), { key: 'ArrowLeft' });
      dry.unmount();
      render(<LevelsSendsSection value={makeValue({ reverbSend: 1, delaySend: 1 })} {...props} />);
      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });

      onSendChange.mock.calls.forEach(([, n]) => {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      });
    });

    it('a step on one send reports that send only, and never calls the Volume, Pan, Dynamics or Audio Setting handlers', () => {
      const handlers = { onSendChange: vi.fn() };
      render(<LevelsSendsSection value={makeValue({ panAuto: false })} {...handlers} />);

      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      expect(handlers.onSendChange.mock.calls.map(([field]) => field)).toEqual(['reverbSend']);
      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      expect(handlers.onSendChange.mock.calls.map(([field]) => field)).toEqual(['reverbSend', 'delaySend']);
    });

    it('disabled: both sliders are disabled and call nothing', () => {
      const onSendChange = vi.fn();
      render(<LevelsSendsSection value={makeValue()} disabled {...baseProps} onSendChange={onSendChange} />);

      expect(reverbSlider().getAttribute('data-disabled')).toBe('');
      expect(delaySlider().getAttribute('data-disabled')).toBe('');
      fireEvent.keyDown(reverbSlider(), { key: 'ArrowRight' });
      fireEvent.keyDown(delaySlider(), { key: 'ArrowRight' });
      expect(onSendChange).not.toHaveBeenCalled();
    });

    it('is enabled by default', () => {
      render(<LevelsSendsSection value={makeValue()} {...baseProps} />);
      expect(reverbSlider().getAttribute('data-disabled')).toBeNull();
      expect(delaySlider().getAttribute('data-disabled')).toBeNull();
    });

    it('labels and help come from the content layer: each slider shows its content name and carries a "?"', () => {
      render(<LevelsSendsSection value={makeValue()} {...baseProps} />);

      expect(screen.getByText(CONTENT['probe.reverbSend'].human)).toBeTruthy();
      expect(screen.getByText(CONTENT['probe.delaySend'].human)).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.reverbSend'].human }) })).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.delaySend'].human }) })).toBeTruthy();
    });

    it('each slider sits in its own wrapper that is not the display:flex row (useVoxelTrackSlider needs a plain block box)', () => {
      render(<LevelsSendsSection value={makeValue()} {...baseProps} />);

      const reverbWrapper = reverbSlider().closest('.levels-sections__reverb-row')!;
      const delayWrapper = delaySlider().closest('.levels-sections__delay-row')!;
      expect(reverbWrapper).not.toBeNull();
      expect(delayWrapper).not.toBeNull();
      expect(reverbWrapper).not.toBe(delayWrapper);
      [reverbWrapper, delayWrapper].forEach((w) => expect(w.classList.contains('levels-sections__row')).toBe(false));
    });

    it('stays memo-stable: re-rendering with identical props re-renders none of the sliders', () => {
      const value = makeValue({ panAuto: false });
      const { rerender } = render(<LevelsSendsSection value={value} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsSendsSection value={value} {...baseProps} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });

    it('editing Reverb re-renders neither Delay, Volume, Pan nor the Audio Setting radio', () => {
      const { rerender } = render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3, panAuto: false })} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsSendsSection value={makeValue({ reverbSend: 0.4, panAuto: false })} {...baseProps} />);

      const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
      expect(rerendered).not.toContain(ROBOT_SEND_SCHEMAS.delaySend.id);
    });

    it('editing Delay re-renders not Reverb, and editing Volume re-renders neither send', () => {
      const { rerender } = render(<LevelsSendsSection value={makeValue({ delaySend: 0.1, masterVolume: 0.42 })} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsSendsSection value={makeValue({ delaySend: 0.2, masterVolume: 0.42 })} {...baseProps} />);
      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id)).not.toContain(ROBOT_SEND_SCHEMAS.reverbSend.id);
    });

    // docs/tasks/ROBOT_SENDS.md Task 13 - the swell flags. The flag reaches the slider's `swelling` prop, which makes
    // an external value change land at once (a swell tick is already smooth) instead of through the 250 ms ease. In
    // this test environment the ease completes on a microtask, so a synchronous read after a rerender tells the two apart.
    describe('swelling flags (Robot Sends Task 13)', () => {
      const shown = (slider: HTMLElement) => slider.getAttribute('aria-valuenow');

      it('sendSwelling.reverbSend makes an external Reverb change land at once, and leaves Delay easing', async () => {
        const { rerender } = render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} sendSwelling={swells('reverbSend')} />);
        rerender(<LevelsSendsSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} sendSwelling={swells('reverbSend')} />);

        expect(shown(reverbSlider())).toBe('60'); // snapped
        expect(shown(delaySlider())).toBe('10'); // still easing
        await waitFor(() => expect(shown(delaySlider())).toBe('50'));
      });

      it('sendSwelling.delaySend makes an external Delay change land at once, and leaves Reverb easing', async () => {
        const { rerender } = render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} sendSwelling={swells('delaySend')} />);
        rerender(<LevelsSendsSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} sendSwelling={swells('delaySend')} />);

        expect(shown(delaySlider())).toBe('50');
        expect(shown(reverbSlider())).toBe('30');
        await waitFor(() => expect(shown(reverbSlider())).toBe('60'));
      });

      it('with no record (the default) both sends ease, never snap', async () => {
        const { rerender } = render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} />);
        rerender(<LevelsSendsSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} />);

        expect(shown(reverbSlider())).toBe('30');
        expect(shown(delaySlider())).toBe('10');
        await waitFor(() => expect(shown(reverbSlider())).toBe('60'));
        await waitFor(() => expect(shown(delaySlider())).toBe('50'));
      });

      it('an all-false record behaves as absent', () => {
        const { rerender } = render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3 })} {...baseProps} sendSwelling={swells()} />);
        rerender(<LevelsSendsSection value={makeValue({ reverbSend: 0.6 })} {...baseProps} sendSwelling={swells()} />);
        expect(shown(reverbSlider())).toBe('30');
      });

      it('both flags together snap both sends', () => {
        const { rerender } = render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...baseProps} sendSwelling={swells('reverbSend', 'delaySend')} />);
        rerender(<LevelsSendsSection value={makeValue({ reverbSend: 0.6, delaySend: 0.5 })} {...baseProps} sendSwelling={swells('reverbSend', 'delaySend')} />);
        expect(shown(reverbSlider())).toBe('60');
        expect(shown(delaySlider())).toBe('50');
      });

      it('flipping a flag by itself moves no slider and fires no change handler', () => {
        const onSendChange = vi.fn();
        const props = { ...baseProps, onSendChange };
        const { rerender } = render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...props} />);
        rerender(<LevelsSendsSection value={makeValue({ reverbSend: 0.3, delaySend: 0.1 })} {...props} sendSwelling={swells('reverbSend', 'delaySend')} />);
        expect(shown(reverbSlider())).toBe('30');
        expect(shown(delaySlider())).toBe('10');
        expect(onSendChange).not.toHaveBeenCalled();
      });

      it('flipping sendSwelling.reverbSend re-renders the Reverb slider only', () => {
        const value = makeValue({ panAuto: false });
        const { rerender } = render(<LevelsSendsSection value={value} {...baseProps} sendSwelling={swells()} />);
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

        rerender(<LevelsSendsSection value={value} {...baseProps} sendSwelling={swells('reverbSend')} />);

        const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
        expect(rerendered).toContain(ROBOT_SEND_SCHEMAS.reverbSend.id);
        expect(rerendered).not.toContain(ROBOT_SEND_SCHEMAS.delaySend.id);
      });

      it('flipping sendSwelling.delaySend re-renders the Delay slider only', () => {
        const value = makeValue({ panAuto: false });
        const { rerender } = render(<LevelsSendsSection value={value} {...baseProps} sendSwelling={swells()} />);
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

        rerender(<LevelsSendsSection value={value} {...baseProps} sendSwelling={swells('delaySend')} />);

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
    const baseProps = { onAudioModeChange: () => {}, onVolumeChange: () => {}, ...PAN_NOOPS, ...DYNAMICS_NOOP };
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('renders beside Monitor Mode, ahead of Pan and the sends (control layout Task 13)', () => {
      render(<LevelsMixSection value={makeValue({ panAuto: false })} {...baseProps} />);

      const row = screen.getByRole('radio', { name: 'Solo' }).closest('.sc-directional-panel')!;
      expect(row.contains(dynamicsSlider())).toBe(true);
      expect(before(dynamicsSlider(), screen.getByRole('slider', { name: new RegExp(`^${CONTENT['probe.pan'].human}`, 'i') }))).toBe(true);
    });

    it('shows the stored 0-100 number as is, with a 0..100 range', () => {
      render(<LevelsMixSection value={makeValue({ dynamics: 70 })} {...baseProps} />);

      expect(dynamicsSlider().getAttribute('aria-valuenow')).toBe('70');
      expect(dynamicsSlider().getAttribute('aria-valuemin')).toBe('0');
      expect(dynamicsSlider().getAttribute('aria-valuemax')).toBe('100');
    });

    it('reaches both ends of the travel: 0 shows 0 and 100 shows 100', () => {
      const flat = render(<LevelsMixSection value={makeValue({ dynamics: 0 })} {...baseProps} />);
      expect(dynamicsSlider().getAttribute('aria-valuenow')).toBe('0');
      flat.unmount();

      render(<LevelsMixSection value={makeValue({ dynamics: 100 })} {...baseProps} />);
      expect(dynamicsSlider().getAttribute('aria-valuenow')).toBe('100');
    });

    it('a keyboard step calls onDynamicsChange with the next whole number, once', () => {
      const onDynamicsChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ dynamics: 50 })} {...baseProps} onDynamicsChange={onDynamicsChange} />);

      fireEvent.keyDown(dynamicsSlider(), { key: 'ArrowRight' });
      expect(onDynamicsChange).toHaveBeenCalledTimes(1);
      expect(onDynamicsChange).toHaveBeenCalledWith(51);
    });

    it('a keyboard step the other way steps down by one', () => {
      const onDynamicsChange = vi.fn();
      render(<LevelsMixSection value={makeValue({ dynamics: 50 })} {...baseProps} onDynamicsChange={onDynamicsChange} />);

      fireEvent.keyDown(dynamicsSlider(), { key: 'ArrowLeft' });
      expect(onDynamicsChange).toHaveBeenCalledWith(49);
    });

    it('End and Home drive it to its full travel (100 and 0), and every emitted number is a whole number in range', () => {
      const onDynamicsChange = vi.fn();
      render(<LevelsMixSection value={makeValue()} {...baseProps} onDynamicsChange={onDynamicsChange} />);

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
        onDynamicsChange: vi.fn(),
      };
      render(<LevelsMixSection value={makeValue({ panAuto: false })} {...handlers} />);

      fireEvent.keyDown(dynamicsSlider(), { key: 'ArrowRight' });
      expect(handlers.onDynamicsChange).toHaveBeenCalledTimes(1);
      const others = [handlers.onAudioModeChange, handlers.onVolumeChange, handlers.onPanChange, handlers.onPanAutoChange];
      others.forEach((h) => expect(h).not.toHaveBeenCalled());

      fireEvent.keyDown(screen.getByRole('slider', { name: /volume/i }), { key: 'ArrowRight' });
      fireEvent.keyDown(screen.getByRole('slider', { name: new RegExp(`^${CONTENT['probe.pan'].human}`, 'i') }), { key: 'ArrowRight' });
      expect(handlers.onDynamicsChange).toHaveBeenCalledTimes(1);
    });

    it('disabled: the slider is disabled and calls nothing; enabled by default', () => {
      const onDynamicsChange = vi.fn();
      const disabled = render(<LevelsMixSection value={makeValue()} disabled {...baseProps} onDynamicsChange={onDynamicsChange} />);
      expect(dynamicsSlider().getAttribute('data-disabled')).toBe('');
      fireEvent.keyDown(dynamicsSlider(), { key: 'ArrowRight' });
      expect(onDynamicsChange).not.toHaveBeenCalled();
      disabled.unmount();

      render(<LevelsMixSection value={makeValue()} {...baseProps} />);
      expect(dynamicsSlider().getAttribute('data-disabled')).toBeNull();
    });

    it('is named, helped and unit-ed from its content key: a "?" with its own name, and a percent readout', () => {
      render(<LevelsMixSection value={makeValue()} {...baseProps} />);

      expect(screen.getByText(CONTENT['probe.levels.dynamics'].human)).toBeTruthy();
      expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['probe.levels.dynamics'].human }) })).toBeTruthy();
      expect(DYNAMICS_SCHEMA.unit).toBe('%');
    });

    it('sits in its own wrapper that is not the display:flex row, and the stylesheet gives it no flex rule', () => {
      render(<LevelsMixSection value={makeValue()} {...baseProps} />);

      const wrapper = dynamicsSlider().closest('.levels-sections__dynamics-row')!;
      expect(wrapper).not.toBeNull();
      expect(wrapper.classList.contains('levels-sections__row')).toBe(false);
    });

    it('stays memo-stable, and editing Dynamics re-renders only the Dynamics slider (not Delay, Reverb, Volume, Pan or the radio)', () => {
      const value = makeValue({ panAuto: false });
      const { rerender } = render(<LevelsMixSection value={value} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();
      rerender(<LevelsMixSection value={value} {...baseProps} />);
      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);

      rerender(<LevelsMixSection value={makeValue({ panAuto: false, dynamics: 80 })} {...baseProps} />);
      const rerendered = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);
      expect(rerendered).toContain(DYNAMICS_SCHEMA.id);
      [VOLUME_SCHEMA.id, PAN_SCHEMA.id, PAN_AUTO_SCHEMA.id, AUDIO_SETTING_SCHEMA.id]
        .forEach((id) => expect(rerendered).not.toContain(id));
    });

    it('editing Delay or Volume does not re-render the Dynamics slider', () => {
      const { rerender } = render(<LevelsMixSection value={makeValue({ delaySend: 0.1, masterVolume: 0.42 })} {...baseProps} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsMixSection value={makeValue({ delaySend: 0.2, masterVolume: 0.7 })} {...baseProps} />);
      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id)).not.toContain(DYNAMICS_SCHEMA.id);
    });
  });

  // docs/specs/ROBOT_EFFECT_SENDS.md §1.6 (docs/tasks/ROBOT_EFFECT_SENDS.md Task 11) - three more send rows after Delay, on the
  // Reverb row's shape: Volume, Pan, Reverb, Delay, Grit, Shimmer, Double, then Dynamics. Both screens pass all three (Task 14).
  describe('Grit, Shimmer and Double rows (Robot Effect Sends Task 11)', () => {
    const nameOf = (key: 'probe.reverbSend' | 'probe.delaySend' | 'probe.gritSend' | 'probe.shimmerSend' | 'probe.doubleSend') =>
      new RegExp(`^${CONTENT[key].human}`, 'i');
    const sliderFor = (key: Parameters<typeof nameOf>[0]) => screen.getByRole('slider', { name: nameOf(key) });
    const baseProps = { onSendChange: () => {} };
    const rerenderedIds = () => (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id);

    const ROWS = [
      { name: 'Grit', field: 'gritSend', key: 'probe.gritSend', schema: ROBOT_SEND_SCHEMAS.gritSend, wrapper: 'levels-sections__grit-row' },
      { name: 'Shimmer', field: 'shimmerSend', key: 'probe.shimmerSend', schema: ROBOT_SEND_SCHEMAS.shimmerSend, wrapper: 'levels-sections__shimmer-row' },
      { name: 'Double', field: 'doubleSend', key: 'probe.doubleSend', schema: ROBOT_SEND_SCHEMAS.doubleSend, wrapper: 'levels-sections__double-row' },
    ] as const;

    it('the three sliders are independent: different stored values show as different numbers', () => {
      render(<LevelsSendsSection value={makeValue({ gritSend: 0.6, shimmerSend: 0.25, doubleSend: 0 })} {...baseProps} />);
      expect(sliderFor('probe.gritSend').getAttribute('aria-valuenow')).toBe('60');
      expect(sliderFor('probe.shimmerSend').getAttribute('aria-valuenow')).toBe('25');
      expect(sliderFor('probe.doubleSend').getAttribute('aria-valuenow')).toBe('0');
    });

    it('a robot with all three at 0 (most of a fleet) still shows all three rows, at 0', () => {
      render(<LevelsSendsSection value={makeValue({ gritSend: 0, shimmerSend: 0, doubleSend: 0 })} {...baseProps} />);
      ROWS.forEach(({ key }) => expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('0'));
    });

    it('a step on one new send reports that send only, and calls no Volume, Pan, Dynamics or Audio Setting handler', () => {
      for (const row of ROWS) {
        const handlers = { onSendChange: vi.fn() };
        const view = render(<LevelsSendsSection value={makeValue({ panAuto: false })} {...handlers} />);

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
      const { gritSend: _g, shimmerSend: _s, doubleSend: _d, ...withoutNewValues } = makeValue();
      // @ts-expect-error onSendChange is required
      const missingHandler = <LevelsSendsSection value={makeValue()} />;
      // @ts-expect-error value.gritSend, shimmerSend and doubleSend are required
      const missingValues = <LevelsSendsSection value={withoutNewValues} onSendChange={() => {}} />;
      expect([missingHandler, missingValues]).toHaveLength(2);
    });

    describe.each(ROWS)('$name', ({ field, key, schema, wrapper }) => {
      it('shows 0-100 % of its own stored 0..1 send, with a 0..100 range', () => {
        render(<LevelsSendsSection value={makeValue({ [field]: 0.37 })} {...baseProps} />);
        const slider = sliderFor(key);
        expect(slider.getAttribute('aria-valuenow')).toBe('37');
        expect(slider.getAttribute('aria-valuemin')).toBe('0');
        expect(slider.getAttribute('aria-valuemax')).toBe('100');
      });

      it.each([0.29, 0.07, 0.57])('a stored %s shows its whole-percent number, with no float noise from the x100', (send) => {
        render(<LevelsSendsSection value={makeValue({ [field]: send })} {...baseProps} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe(String(Math.round(send * 100)));
      });

      it('a fractional stored send keeps its fraction on the slider', () => {
        render(<LevelsSendsSection value={makeValue({ [field]: 0.125 })} {...baseProps} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('12.5');
      });

      it('reaches both ends of the travel: 0 shows 0 and 1 shows 100', () => {
        const dry = render(<LevelsSendsSection value={makeValue({ [field]: 0 })} {...baseProps} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('0');
        dry.unmount();
        render(<LevelsSendsSection value={makeValue({ [field]: 1 })} {...baseProps} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('100');
      });

      it('a keyboard step calls onSendChange once with its field and the display number (send x 100 +/- 1), not the 0..1 fraction', () => {
        const fn = vi.fn();
        const up = render(<LevelsSendsSection value={makeValue({ [field]: 0.3 })} {...baseProps} onSendChange={fn} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowRight' });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenLastCalledWith(field, 31);
        up.unmount();

        render(<LevelsSendsSection value={makeValue({ [field]: 0.3 })} {...baseProps} onSendChange={fn} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowLeft' });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith(field, 29);
      });

      it('End and Home drive it to its full travel, and it never emits outside 0..100', () => {
        const fn = vi.fn();
        const top = render(<LevelsSendsSection value={makeValue({ [field]: 1 })} {...baseProps} onSendChange={fn} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowRight' });
        fireEvent.keyDown(sliderFor(key), { key: 'Home' });
        expect(fn).toHaveBeenLastCalledWith(field, 0);
        top.unmount();
        render(<LevelsSendsSection value={makeValue({ [field]: 0 })} {...baseProps} onSendChange={fn} />);
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowLeft' });
        fireEvent.keyDown(sliderFor(key), { key: 'End' });
        expect(fn).toHaveBeenLastCalledWith(field, 100);
        fn.mock.calls.forEach(([, n]) => {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(100);
        });
      });

      it('labels and help come from the content layer: its content name and a "?"', () => {
        render(<LevelsSendsSection value={makeValue()} {...baseProps} />);
        expect(screen.getByText(CONTENT[key].human)).toBeTruthy();
        expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT[key].human }) })).toBeTruthy();
      });

      it('disabled: the slider is disabled and calls nothing', () => {
        const fn = vi.fn();
        render(<LevelsSendsSection value={makeValue()} disabled {...baseProps} onSendChange={fn} />);
        expect(sliderFor(key).getAttribute('data-disabled')).toBe('');
        fireEvent.keyDown(sliderFor(key), { key: 'ArrowRight' });
        expect(fn).not.toHaveBeenCalled();
      });

      it('sits in its own wrapper that is not the display:flex row, and the stylesheet gives it no flex rule', () => {
        render(<LevelsSendsSection value={makeValue()} {...baseProps} />);
        const w = sliderFor(key).closest(`.${wrapper}`)!;
        expect(w).not.toBeNull();
        expect(w.classList.contains('levels-sections__row')).toBe(false);
        expect(w.contains(sliderFor('probe.reverbSend'))).toBe(false);
      });

      it('editing it re-renders no other slider, and editing Reverb or Volume does not re-render it', () => {
        const { rerender } = render(<LevelsSendsSection value={makeValue({ [field]: 0.3, panAuto: false })} {...baseProps} />);
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

        rerender(<LevelsSendsSection value={makeValue({ [field]: 0.4, panAuto: false })} {...baseProps} />);
        const others = [ROBOT_SEND_SCHEMAS.reverbSend, ROBOT_SEND_SCHEMAS.delaySend, ...ROWS.map((r) => r.schema)]
          .filter((s) => s !== schema).map((s) => s.id);
        expect(rerenderedIds()).toContain(schema.id);
        others.forEach((id) => expect(rerenderedIds()).not.toContain(id));

        (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();
        rerender(<LevelsSendsSection value={makeValue({ [field]: 0.4, reverbSend: 0.9, masterVolume: 0.9, panAuto: false })} {...baseProps} />);
        expect(rerenderedIds()).not.toContain(schema.id);
      });

      // The flag reaches the slider's `swelling` prop: an external change lands at once instead of through the 250 ms ease
      // (in this environment the ease completes on a microtask, so a synchronous read tells the two apart). Task 13 passes it.
      it('its swelling flag makes an external change land at once, and leaves the other new sends easing', async () => {
        const start = makeValue({ gritSend: 0.1, shimmerSend: 0.1, doubleSend: 0.1 });
        const next = makeValue({ gritSend: 0.5, shimmerSend: 0.5, doubleSend: 0.5 });
        const { rerender } = render(<LevelsSendsSection value={start} {...baseProps} sendSwelling={swells(field)} />);
        rerender(<LevelsSendsSection value={next} {...baseProps} sendSwelling={swells(field)} />);

        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('50');
        for (const other of ROWS.filter((r) => r.key !== key)) {
          expect(sliderFor(other.key).getAttribute('aria-valuenow'), other.name).toBe('10');
        }
        await waitFor(() => ROWS.forEach((r) => expect(sliderFor(r.key).getAttribute('aria-valuenow')).toBe('50')));
      });

      it('without its flag (no record, or false) it eases, never snaps', () => {
        const { rerender } = render(<LevelsSendsSection value={makeValue({ [field]: 0.1 })} {...baseProps} sendSwelling={swells()} />);
        rerender(<LevelsSendsSection value={makeValue({ [field]: 0.5 })} {...baseProps} sendSwelling={swells()} />);
        expect(sliderFor(key).getAttribute('aria-valuenow')).toBe('10');
      });
    });

    it('the five rows share one handler: each reports its own field, once', () => {
      const fn = vi.fn();
      render(<LevelsSendsSection value={makeValue()} {...baseProps} onSendChange={fn} />);
      const keys = ['probe.reverbSend', 'probe.delaySend', 'probe.gritSend', 'probe.shimmerSend', 'probe.doubleSend'] as const;
      keys.forEach((k) => fireEvent.keyDown(sliderFor(k), { key: 'ArrowRight' }));
      expect(fn.mock.calls.map(([field]) => field)).toEqual(['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend']);
    });
  });

  // docs/specs/ROBOT_SEND_TABLE.md §1.4 (Robot Send Table T10, T13): the five rows come from ROBOT_SENDS, one memo'd
  // SendRow each, and report through one onSendChange(field, pct) with one sendSwelling record. T13 deleted the bridge
  // from the ten old per-field props; they no longer type-check.
  describe('send rows from the table (Robot Send Table T10)', () => {
    const NO_SWELLS: Record<RobotSendField, boolean> = { reverbSend: false, delaySend: false, gritSend: false, shimmerSend: false, doubleSend: false };
    const sliderOf = (field: RobotSendField) =>
      screen.getByRole('slider', { name: new RegExp(`^${CONTENT[ROBOT_SENDS.find((s) => s.field === field)!.contentKey].human}`, 'i') });
    const shown = (field: RobotSendField) => sliderOf(field).getAttribute('aria-valuenow');
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const rerenderedIds = () => (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.map(([schema]) => schema.id as string);
    const allSends = (send: number) => makeValue({ reverbSend: send, delaySend: send, gritSend: send, shimmerSend: send, doubleSend: send });

    it('renders one row per ROBOT_SENDS entry, in table order, each in the wrapper its engine key names', () => {
      const { container } = render(<LevelsSendsSection value={makeValue({ panAuto: false })} onSendChange={vi.fn()} />);

      const wrappers = ROBOT_SENDS.map((spec) => container.querySelector(`.levels-sections__${spec.engineKey}-row`));
      wrappers.forEach((w, i) => {
        expect(w, ROBOT_SENDS[i].field).not.toBeNull();
        expect(w!.contains(sliderOf(ROBOT_SENDS[i].field)), ROBOT_SENDS[i].field).toBe(true);
        expect(w!.classList.contains('levels-sections__row')).toBe(false);
      });
      for (let i = 1; i < wrappers.length; i++) expect(before(wrappers[i - 1]!, wrappers[i]!), `row ${i}`).toBe(true);
      // The five sends: no row twice, none missing.
      expect(screen.getAllByRole('slider')).toHaveLength(5);
    });

    it('each row renders its ROBOT_SEND_SCHEMAS schema, and the rows render in table order', () => {
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();
      render(<LevelsSendsSection value={makeValue()} onSendChange={vi.fn()} />);

      const sendIds = new Set(ROBOT_SENDS.map((spec) => ROBOT_SEND_SCHEMAS[spec.field].id));
      const rendered = [...new Set(rerenderedIds().filter((id) => sendIds.has(id)))];
      expect(rendered).toEqual(ROBOT_SENDS.map((spec) => `robotOptions.${spec.field}`));
    });

    it.each(ROBOT_SENDS)('a step on the $field row calls onSendChange($field, 40) once', (spec) => {
      const onSendChange = vi.fn();
      render(<LevelsSendsSection value={makeValue({ [spec.field]: 0.39 })} onSendChange={onSendChange} />);

      fireEvent.keyDown(sliderOf(spec.field), { key: 'ArrowRight' });

      expect(onSendChange.mock.calls).toEqual([[spec.field, 40]]);
    });

    it('onSendChange reports the display number at both ends of the travel (Home 0, End 100), never a fraction', () => {
      const onSendChange = vi.fn();
      render(<LevelsSendsSection value={makeValue({ shimmerSend: 0.5 })} onSendChange={onSendChange} />);
      fireEvent.keyDown(sliderOf('shimmerSend'), { key: 'Home' });
      fireEvent.keyDown(sliderOf('shimmerSend'), { key: 'End' });
      expect(onSendChange.mock.calls).toEqual([['shimmerSend', 0], ['shimmerSend', 100]]);
    });

    it('disabled: no row reaches onSendChange', () => {
      const onSendChange = vi.fn();
      render(<LevelsSendsSection value={makeValue()} disabled onSendChange={onSendChange} />);
      ROBOT_SENDS.forEach((spec) => fireEvent.keyDown(sliderOf(spec.field), { key: 'ArrowRight' }));
      expect(onSendChange).not.toHaveBeenCalled();
    });

    it('a new onSendChange is the one the next step reaches (no row holds a stale handler)', () => {
      const first = vi.fn();
      const second = vi.fn();
      const value = makeValue();
      const { rerender } = render(<LevelsSendsSection value={value} onSendChange={first} />);
      rerender(<LevelsSendsSection value={value} onSendChange={second} />);

      fireEvent.keyDown(sliderOf('doubleSend'), { key: 'ArrowRight' });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith('doubleSend', 6);
    });

    it.each(ROBOT_SENDS)('sendSwelling.$field snaps the $field row alone; the other four still ease', async (spec) => {
      const flags = { ...NO_SWELLS, [spec.field]: true };
      const { rerender } = render(<LevelsSendsSection value={allSends(0.1)} onSendChange={vi.fn()} sendSwelling={flags} />);
      rerender(<LevelsSendsSection value={allSends(0.5)} onSendChange={vi.fn()} sendSwelling={flags} />);

      expect(shown(spec.field)).toBe('50');
      ROBOT_SENDS.filter((s) => s !== spec).forEach((s) => expect(shown(s.field), s.field).toBe('10'));
      await waitFor(() => ROBOT_SENDS.forEach((s) => expect(shown(s.field)).toBe('50')));
    });

    it('an all-false sendSwelling eases every row, as no record does', () => {
      const { rerender } = render(<LevelsSendsSection value={allSends(0.1)} onSendChange={vi.fn()} sendSwelling={NO_SWELLS} />);
      rerender(<LevelsSendsSection value={allSends(0.5)} onSendChange={vi.fn()} sendSwelling={NO_SWELLS} />);
      ROBOT_SENDS.forEach((s) => expect(shown(s.field), s.field).toBe('10'));
    });

    it('with onSendChange, editing Reverb re-renders the Reverb row and no other send row', () => {
      const onSendChange = vi.fn();
      const { rerender } = render(<LevelsSendsSection value={makeValue({ reverbSend: 0.3 })} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsSendsSection value={makeValue({ reverbSend: 0.4 })} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);

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

    // Review follow-up (2026-10-22): a row compares the number its slider shows, as the five hand-written rows did, so a
    // stored change below the display's two decimals of a percent re-renders nothing (SliderLinear is memo'd too).
    it.each([1e-7, -1e-7, 4e-5])('a send change of %s, too small to show, re-renders no send slider', (delta) => {
      const onSendChange = vi.fn();
      const { rerender } = render(<LevelsSendsSection value={makeValue({ gritSend: 0.29 })} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsSendsSection value={makeValue({ gritSend: 0.29 + delta })} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);

      ROBOT_SENDS.forEach((spec) => expect(rerenderedIds(), spec.field).not.toContain(ROBOT_SEND_SCHEMAS[spec.field].id));
      expect(shown('gritSend')).toBe('29');
    });

    it('a send change of one display step still re-renders that row (the comparison is not too coarse)', () => {
      const onSendChange = vi.fn();
      const { rerender } = render(<LevelsSendsSection value={makeValue({ gritSend: 0.29 })} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsSendsSection value={makeValue({ gritSend: 0.2901 })} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);

      expect(rerenderedIds()).toContain(ROBOT_SEND_SCHEMAS.gritSend.id);
    });

    it('a fresh but equal sendSwelling record re-renders no slider (the rows compare booleans, not the record)', () => {
      const onSendChange = vi.fn();
      const value = makeValue({ panAuto: false });
      const { rerender } = render(<LevelsSendsSection value={value} onSendChange={onSendChange} sendSwelling={{ ...NO_SWELLS }} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsSendsSection value={value} onSendChange={onSendChange} sendSwelling={{ ...NO_SWELLS }} />);

      const sendIds = ROBOT_SENDS.map((spec) => ROBOT_SEND_SCHEMAS[spec.field].id);
      sendIds.forEach((id) => expect(rerenderedIds()).not.toContain(id));
    });

    it('flipping sendSwelling.gritSend re-renders the Grit row only', () => {
      const onSendChange = vi.fn();
      const value = makeValue({ panAuto: false });
      const { rerender } = render(<LevelsSendsSection value={value} onSendChange={onSendChange} sendSwelling={NO_SWELLS} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<LevelsSendsSection value={value} onSendChange={onSendChange} sendSwelling={{ ...NO_SWELLS, gritSend: true }} />);

      expect(rerenderedIds()).toContain(ROBOT_SEND_SCHEMAS.gritSend.id);
      for (const field of ['reverbSend', 'delaySend', 'shimmerSend', 'doubleSend'] as const) {
        expect(rerenderedIds(), field).not.toContain(ROBOT_SEND_SCHEMAS[field].id);
      }
    });

    // `npm run build:types` checks the directive: the bridge keeps the rows wired, so a caller passes onSendChange or all
    // five old handlers, and onSendChange alone needs none of the old ones.
    it('a caller must wire the send rows: onSendChange alone type-checks, without it nothing does', () => {
      // @ts-expect-error onSendChange is required
      const missing = <LevelsSendsSection value={makeValue()} />;
      const newOnly = <LevelsSendsSection value={makeValue()} onSendChange={() => {}} />;
      expect([missing, newOnly]).toHaveLength(2);
    });

    // Robot Send Table T13 (the 50.7 T14 pattern): the ten per-field props are gone from the type, so a caller still on
    // them fails `npm run build:types` instead of silently wiring nothing. Each directive goes unused if its prop returns.
    it('the ten old per-field send props no longer type-check', () => {
      const props = { onSendChange: () => {} };
      const handlers = [
        // @ts-expect-error onReverbSendChange is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} onReverbSendChange={() => {}} />,
        // @ts-expect-error onDelaySendChange is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} onDelaySendChange={() => {}} />,
        // @ts-expect-error onGritSendChange is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} onGritSendChange={() => {}} />,
        // @ts-expect-error onShimmerSendChange is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} onShimmerSendChange={() => {}} />,
        // @ts-expect-error onDoubleSendChange is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} onDoubleSendChange={() => {}} />,
      ];
      const flags = [
        // @ts-expect-error reverbSendSwelling is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} reverbSendSwelling />,
        // @ts-expect-error delaySendSwelling is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} delaySendSwelling />,
        // @ts-expect-error gritSendSwelling is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} gritSendSwelling />,
        // @ts-expect-error shimmerSendSwelling is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} shimmerSendSwelling />,
        // @ts-expect-error doubleSendSwelling is no longer a prop
        <LevelsSendsSection value={makeValue()} {...props} doubleSendSwelling />,
      ];
      expect([...handlers, ...flags]).toHaveLength(10);
    });
  });

  // Light tier standing cost T12b (Crawford, 2026-10-29: "if they don't do anything they should be dimmed").
  describe('held-off send rows (Light tier standing cost T12b)', () => {
    const baseProps = { onSendChange: () => {} };
    const HELD_OFF = CONTENT['ui.heldOff'].human;
    const held = (...fields: RobotSendField[]) => swells(...fields);
    const sendSlider = (field: RobotSendField) =>
      screen.getByRole('slider', { name: new RegExp('^' + CONTENT[ROBOT_SENDS.find((s) => s.field === field)!.contentKey].human, 'i') });

    it('dims the held-off send rows, keeps their values, and leaves every other row live', () => {
      render(<LevelsSendsSection value={makeValue({ panAuto: false, gritSend: 0.6 })} {...baseProps} heldOffSends={held('gritSend', 'shimmerSend', 'doubleSend')} />);
      for (const field of ['gritSend', 'shimmerSend', 'doubleSend'] as const) {
        const slider = sendSlider(field);
        expect(slider.getAttribute('data-disabled'), field).not.toBeNull();
        expect(slider.closest('.sc-held-off'), field).not.toBeNull();
      }
      expect(sendSlider('gritSend').getAttribute('aria-valuenow')).toBe('60');
      for (const field of ['reverbSend', 'delaySend'] as const) {
        expect(sendSlider(field).getAttribute('data-disabled'), field).toBeNull();
        expect(sendSlider(field).closest('.sc-held-off'), field).toBeNull();
      }
    });

    it('says why once, under the send rows', () => {
      render(<LevelsSendsSection value={makeValue()} {...baseProps} heldOffSends={held('gritSend', 'shimmerSend', 'doubleSend')} />);
      const notes = screen.getAllByText(HELD_OFF);
      expect(notes).toHaveLength(1);
      expect(!!(sendSlider('doubleSend').compareDocumentPosition(notes[0]) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    });

    it('dims any one send on its own (the Reverb, for the Reverb hold-off)', () => {
      render(<LevelsSendsSection value={makeValue()} {...baseProps} heldOffSends={held('reverbSend')} />);
      expect(sendSlider('reverbSend').getAttribute('data-disabled')).not.toBeNull();
      expect(sendSlider('gritSend').getAttribute('data-disabled')).toBeNull();
      expect(screen.getAllByText(HELD_OFF)).toHaveLength(1);
    });

    it('dims nothing and says nothing with no record, or with every send live', () => {
      const { unmount } = render(<LevelsSendsSection value={makeValue()} {...baseProps} />);
      expect(screen.queryByText(HELD_OFF)).toBeNull();
      expect(document.querySelector('.sc-held-off')).toBeNull();
      unmount();
      render(<LevelsSendsSection value={makeValue()} {...baseProps} heldOffSends={held()} />);
      expect(screen.queryByText(HELD_OFF)).toBeNull();
      for (const spec of ROBOT_SENDS) expect(sendSlider(spec.field).getAttribute('data-disabled'), spec.field).toBeNull();
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
        <LevelsMixSection value={makeValue({ masterVolume: 0.42 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />
      );
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(
        <LevelsMixSection value={makeValue({ masterVolume: 0.55 })} onAudioModeChange={onAudioModeChange} onVolumeChange={() => {}} {...PAN_NOOPS} {...DYNAMICS_NOOP} />
      );

      const radioCalls = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls
        .filter(([schema]) => schema.id === AUDIO_SETTING_SCHEMA.id).length;
      expect(radioCalls).toBe(0);
    });
  });

});
