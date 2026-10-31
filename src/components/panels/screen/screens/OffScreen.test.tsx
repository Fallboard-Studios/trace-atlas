import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 27 (spec §1.9): the powered-off screen — the etched label and power hint
 * over the dimmed still world, and the Transmission row as a muted RadioButton (nothing comes off the plate
 * while the power is off) with a well naming the pick. Picking retransmits through applySessionPayload and
 * never starts audio; only the rocker starts sound.
 *
 * docs/tasks/OFF_SCREEN.md Task 10 (spec assumptions 7 and 8): the gate — a device that has never heard a world
 * sees the label and the hint only; one that has sees the chooser — and the Current row on top, selected by
 * default and named by describeWorld (the loaded world, fronted by the loaded save's name when there is one),
 * then the saves, a divider, then the presets. The readout names the pick through the same helper.
 */
// The live world Keep saves and the dirty test compares against (docs/tasks/OFF_SCREEN.md Task 14) — a marker
// payload a test can change to make the world dirty, with the identity every real payload carries so a pick of it
// can be described. buildSessionPayload hands out a fresh copy every call.
const live = vi.hoisted(() => {
  const marker = (m: string) =>
    ({ version: 2, marker: m, attenuationStyleName: 'live-as', coordinates: { x: 1, y: 2 } }) as unknown as import('@/types/session').SessionPayload;
  return { marker, payload: marker('live') };
});
vi.mock('@/utils/sessionDiff', () => ({
  applySessionPayload: vi.fn(),
  buildSessionPayload: vi.fn(() => structuredClone(live.payload)),
}));
vi.mock('@/engine/AudioEngine', () => ({
  AudioEngine: { start: vi.fn() },
}));
vi.mock('@/systems/worldTransition', () => ({
  rollWorld: vi.fn(),
}));

import { OffScreen } from './OffScreen';
import { applySessionPayload, buildSessionPayload } from '@/utils/sessionDiff';
import { rollWorld } from '@/systems/worldTransition';
import { AudioEngine } from '@/engine/AudioEngine';
import { TRANSMISSION_PRESETS, presetPayload } from '@/data/transmissionPresets';
import { listSessions, loadSession, saveNamedSession } from '@/utils/sessionStorageEngine';
import { markHeardWorld } from '@/utils/deviceFlags';
import { describeWorld } from '@/utils/describeWorld';
import { useSessionStore } from '@/stores/sessionStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { CONTENT } from '@/content';
import type { SessionPayload } from '@/types/session';

const human = (key: keyof typeof CONTENT) => CONTENT[key].human;
const presetName = (i: number) => human(TRANSMISSION_PRESETS[i].nameKey);
const picker = () => screen.getByRole('group', { name: human('home.off.transmission') });
const radioNames = () => within(picker()).getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
const readout = () => screen.getByTestId('off-screen-readout');

/** The world the stores hold — what Current names (the stores' module-level defaults, in these tests). */
function liveIdentity() {
  const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
  const locale = useLocaleStore.getState().getLocaleById(style.currentLocaleId!)!;
  return { attenuationStyleName: style.name, coordinates: locale.coordinates };
}
const currentLabel = (loadedName?: string) => describeWorld(liveIdentity(), loadedName);

// A save is a plain SessionPayload; the off screen only reads its name and hands the payload on.
const savedPayload = (style: string): SessionPayload => ({ ...presetPayload(TRANSMISSION_PRESETS[0])!, attenuationStyleName: style });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  live.payload = live.marker('live');
  useSessionStore.setState({ currentLoadedSessionName: null, currentSessionName: 'Quiet Harbour' });
});

describe('OffScreen — the gate (spec assumption 7)', () => {
  it('a device that has never heard a world sees the label, its lore line and the hint, and no chooser', () => {
    render(<OffScreen />);
    expect(screen.getByText(human('home.off.label'))).toBeTruthy();
    expect(screen.getByText(CONTENT['home.off.label'].lore!)).toBeTruthy();
    expect(screen.getByText(human('home.off.powerHint'))).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByTestId('off-screen-readout')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull(); // no Roll either: nothing on a first visit is answerable
  });

  it('a device that has heard a world sees the chooser, with Current selected', () => {
    markHeardWorld();
    render(<OffScreen />);
    expect(screen.getByText(human('home.off.powerHint'))).toBeTruthy();
    const current = screen.getByRole('radio', { name: currentLabel() });
    expect(current.getAttribute('aria-checked')).toBe('true');
  });

  it('reads the flag once, on mount: a flag set after mount does not open the chooser until the next mount', () => {
    render(<OffScreen />);
    act(() => markHeardWorld());
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('OffScreen — content', () => {
  beforeEach(() => markHeardWorld());

  it('shows the etched label, its lore line and the power hint', () => {
    render(<OffScreen />);
    expect(screen.getByText(human('home.off.label'))).toBeTruthy();
    expect(screen.getByText(CONTENT['home.off.label'].lore!)).toBeTruthy();
    expect(screen.getByText(human('home.off.powerHint'))).toBeTruthy();
  });

  it('has no Theme row (the themes phase builds it)', () => {
    render(<OffScreen />);
    expect(screen.queryByText(/theme/i)).toBeNull();
  });
});

describe('OffScreen — the Current row (spec assumption 8)', () => {
  beforeEach(() => markHeardWorld());

  it('is the first option, named by describeWorld of the loaded world, under the Current eyebrow', () => {
    render(<OffScreen />);
    const current = screen.getByRole('radio', { name: currentLabel() });
    expect(radioNames()[0]).toBe(currentLabel());
    expect(within(current).getByText(human('home.off.current'))).toBeTruthy();
  });

  it("is named after the loaded save when one is loaded: '<save> · AS (x, y)'", () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(radioNames()[0]).toBe(currentLabel('Dusk Run'));
    expect(currentLabel('Dusk Run').startsWith('Dusk Run · ')).toBe(true);
  });

  it('follows the loaded world: a change of Attenuation Style renames the row and the readout', () => {
    render(<OffScreen />);
    const before = currentLabel();
    const { attenuationStyles, currentAttenuationStyleId } = useAttenuationStyleStore.getState();
    act(() => {
      useAttenuationStyleStore.setState({
        attenuationStyles: attenuationStyles.map((s) => (s.id === currentAttenuationStyleId ? { ...s, name: 'rolled-1' } : s)),
      });
    });
    expect(currentLabel()).not.toBe(before);
    expect(currentLabel().startsWith('rolled-1 · ')).toBe(true);
    expect(radioNames()[0]).toBe(currentLabel());
    expect(readout().textContent).toBe(currentLabel());
  });

  it('picking Current retransmits nothing: it is the loaded world already', () => {
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    fireEvent.click(screen.getByRole('radio', { name: currentLabel() }));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: currentLabel() }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: presetName(0) }).getAttribute('aria-checked')).toBe('false');
    expect(readout().textContent).toBe(currentLabel());
  });
});

describe('OffScreen — Roll (spec assumption 14)', () => {
  beforeEach(() => markHeardWorld());
  const roll = () => screen.getByRole('button', { name: human('home.off.roll') });

  it('is a flat button beside the Current row — nothing comes off the plate', () => {
    const { container } = render(<OffScreen />);
    expect(roll()).toBeTruthy();
    expect(container.querySelector('[class*="sc-cabinet-box"]')).toBeNull();
    expect(container.querySelector('.sc-button--muted')).not.toBeNull();
  });

  it('one click is one rollWorld(), and nothing is applied: the roll is the retransmit', () => {
    render(<OffScreen />);
    fireEvent.click(roll());
    expect(rollWorld).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).not.toHaveBeenCalled();
  });

  it('returns the pick to Current, and the readout names Current again', () => {
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(1) }));
    expect(screen.getByRole('radio', { name: presetName(1) }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(roll());
    expect(screen.getByRole('radio', { name: currentLabel() }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: presetName(1) }).getAttribute('aria-checked')).toBe('false');
    expect(readout().textContent).toBe(currentLabel());
  });

  it('never starts the AudioEngine: only the power switch starts sound', () => {
    render(<OffScreen />);
    fireEvent.click(roll());
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });
});

describe('OffScreen — Keep (spec assumption 14)', () => {
  beforeEach(() => markHeardWorld());
  const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;
  const warning = () => screen.queryByText(human('home.off.unsavedWarning'));

  it('is lit, with the warning line under the chooser, when the loaded world is not kept (no save loaded)', () => {
    const { container } = render(<OffScreen />);
    expect(keep().disabled).toBe(false);
    expect(warning()).not.toBeNull();
    expect(container.querySelector('.sc-button--muted')).not.toBeNull(); // flat, like Roll: nothing pops
  });

  it('is dim, with no warning, when the loaded save equals the live world', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(keep().disabled).toBe(true);
    expect(warning()).toBeNull();
  });

  it('is lit when the loaded save differs from the live world', () => {
    saveNamedSession('Dusk Run', live.marker('older'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(keep().disabled).toBe(false);
    expect(warning()).not.toBeNull();
  });

  it('clicking Keep saves under the suggested name, lists the new row at once, names Current after it, and dims', () => {
    render(<OffScreen />);
    fireEvent.click(keep());
    expect(listSessions().map((s) => s.name)).toEqual(['Quiet Harbour']);
    expect(screen.getByRole('radio', { name: 'Quiet Harbour' })).toBeTruthy();
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Quiet Harbour');
    expect(radioNames()[0]).toBe(currentLabel('Quiet Harbour'));
    expect(screen.getByRole('radio', { name: currentLabel('Quiet Harbour') }).getAttribute('aria-checked')).toBe('true');
    expect(keep().disabled).toBe(true);
    expect(warning()).toBeNull();
  });

  it('keeps under the loaded name, overwriting that row rather than adding one', () => {
    saveNamedSession('Dusk Run', live.marker('older'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    fireEvent.click(keep());
    expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
    expect(radioNames().filter((n) => n === 'Dusk Run')).toHaveLength(1);
    expect(keep().disabled).toBe(true);
  });

  it('re-lights after a world change that a Roll brings, and dims again after keeping — the rolled world as its own new row', () => {
    render(<OffScreen />);
    fireEvent.click(keep());
    expect(keep().disabled).toBe(true);
    live.payload = live.marker('rolled');
    fireEvent.click(screen.getByRole('button', { name: human('home.off.roll') }));
    expect(keep().disabled).toBe(false);
    expect(warning()).not.toBeNull();
    fireEvent.click(keep());
    expect(keep().disabled).toBe(true);
    const names = listSessions().map((s) => s.name);
    expect(names).toHaveLength(2);
    expect(names).toContain('Quiet Harbour');
    expect(loadSession(useSessionStore.getState().currentLoadedSessionName!)).toEqual(live.marker('rolled'));
  });

  it('recomputes dirty after a pick, not on every render', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    saveNamedSession('Other', live.marker('other'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(keep().disabled).toBe(true);
    const onMount = vi.mocked(buildSessionPayload).mock.calls.length;
    expect(onMount).toBeGreaterThan(0);
    // A re-render from a store change does not rebuild the payload.
    const { attenuationStyles, currentAttenuationStyleId } = useAttenuationStyleStore.getState();
    act(() => {
      useAttenuationStyleStore.setState({
        attenuationStyles: attenuationStyles.map((s) => (s.id === currentAttenuationStyleId ? { ...s, name: 'renamed-1' } : s)),
      });
    });
    expect(vi.mocked(buildSessionPayload).mock.calls.length).toBe(onMount);
    // A pick does: the other save is now loaded, and the live world (unchanged under the mock) differs from it.
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    expect(vi.mocked(buildSessionPayload).mock.calls.length).toBeGreaterThan(onMount);
    expect(keep().disabled).toBe(false);
  });

  // A world that is no longer a save must not keep the save's name: Current would misname it, and Keep would
  // overwrite the save with a different world.
  it('a preset pick or a Roll clears the loaded save name, so Current is named by its identity alone and Keep writes a new row', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(radioNames()[0]).toBe(currentLabel('Dusk Run'));

    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    expect(radioNames()[0]).toBe(currentLabel());

    fireEvent.click(screen.getByRole('radio', { name: 'Dusk Run' }));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
    expect(useSessionStore.getState().currentSessionName).toBe('Dusk Run'); // the save pick names the session, as a Load does
    fireEvent.click(screen.getByRole('button', { name: human('home.off.roll') }));
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    expect(radioNames()[0]).toBe(currentLabel());
    expect(keep().disabled).toBe(false);
    // Keep after the roll writes a second row under a fresh suggestion — Dusk Run is not overwritten by a different world.
    const kept = useSessionStore.getState().currentSessionName;
    expect(kept).not.toBe('Dusk Run');
    fireEvent.click(keep());
    expect(listSessions().map((s) => s.name).sort()).toEqual(['Dusk Run', kept].sort());
    expect(screen.getByRole('radio', { name: kept })).toBeTruthy();
  });

  it('never starts the AudioEngine', () => {
    render(<OffScreen />);
    fireEvent.click(keep());
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });
});

describe('OffScreen — the Transmission row', () => {
  beforeEach(() => markHeardWorld());

  it('lists Current, then the three presets in order, under the Transmission label, with no divider when there are no saves', () => {
    const { container } = render(<OffScreen />);
    expect(radioNames()).toEqual([currentLabel(), presetName(0), presetName(1), presetName(2)]);
    expect(container.querySelector('.sc-radio-button__divider')).toBeNull();
  });

  it("lists the user's saves between Current and the presets, newest first, with exactly one divider ahead of the presets", () => {
    // Two saves in one millisecond would tie on savedAt; give the second a later clock so "newest first" is testable.
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Night, all freelance', savedPayload('night'));
    now.mockRestore();
    const { container } = render(<OffScreen />);
    const names = radioNames();
    expect(names[0]).toBe(currentLabel());
    expect(names.slice(1, 3)).toEqual(['Night, all freelance', 'Dusk Run']);
    expect(names.slice(3)).toEqual([presetName(0), presetName(1), presetName(2)]);
    const dividers = container.querySelectorAll('.sc-radio-button__divider');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].nextElementSibling).toBe(screen.getByRole('radio', { name: presetName(0) }));
  });

  it('has Current selected before a pick, and nothing else', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe(radio.getAttribute('aria-label') === currentLabel() ? 'true' : 'false');
    }
  });

  it("keeps a save that shares a preset's name apart from it: both render, and picking the save applies the save", () => {
    const save = savedPayload('same-name');
    saveNamedSession(presetName(0), save);
    render(<OffScreen />);
    const radios = screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-label') === presetName(0));
    expect(radios).toHaveLength(2);
    fireEvent.click(radios[0]); // the save sits ahead of the presets now
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });

  it('keeps a save named like a preset id apart from the preset', () => {
    const save = savedPayload('id-clash');
    saveNamedSession(TRANSMISSION_PRESETS[0].id, save);
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: TRANSMISSION_PRESETS[0].id }));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });
});

describe('OffScreen — picking', () => {
  beforeEach(() => markHeardWorld());

  // docs/tasks/OFF_SCREEN.md Task 11 (spec assumption 13): a preset is a link; the pick applies what it decodes to.
  it("applies the payload the preset's link decodes to, once, on picking a preset", () => {
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(1) }));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(presetPayload(TRANSMISSION_PRESETS[1]));
  });

  it("applies the saved session's payload on picking a save", () => {
    const save = savedPayload('dusk');
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk Run' }));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });

  // Code review 2026-10-11: the Sessions list names the loaded save so a later Save overwrites it; the
  // off screen's pick must too, or powering on and pressing Save writes a second entry.
  it('picking a save names the session after it, as loading it from the Sessions list does', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk Run' }));
    expect(useSessionStore.getState().currentSessionName).toBe('Dusk Run');
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
  });

  it('picking a preset leaves the session name alone: a preset is not a save to overwrite', () => {
    const before = useSessionStore.getState().currentSessionName;
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    expect(useSessionStore.getState().currentSessionName).toBe(before);
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
  });

  it('never starts the AudioEngine: only the power switch starts sound', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk Run' }));
    fireEvent.click(screen.getByRole('radio', { name: currentLabel('Dusk Run') }));
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });

  it('marks the picked option selected, and only it — Current included', () => {
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(2) }));
    expect(screen.getByRole('radio', { name: presetName(2) }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: presetName(0) }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: currentLabel() }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    expect(screen.getByRole('radio', { name: presetName(2) }).getAttribute('aria-checked')).toBe('false');
    expect(applySessionPayload).toHaveBeenCalledTimes(2);
  });

  it('re-clicking the picked option does not retransmit', () => {
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: presetName(0) }).getAttribute('aria-checked')).toBe('true');
  });

  it('a save deleted since the screen mounted applies nothing and does not claim the pick', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    localStorage.clear();
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk Run' }));
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Dusk Run' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: currentLabel() }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('OffScreen — the well naming the pick', () => {
  beforeEach(() => markHeardWorld());

  it('names Current before a pick, the same string as the Current row', () => {
    render(<OffScreen />);
    expect(readout().textContent).toBe(currentLabel());
  });

  it('names the loaded save before a pick, as the Current row does', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(readout().textContent).toBe(currentLabel('Dusk Run'));
  });

  it("names a preset by its copy and its world: '<name> · AS (x, y)'", () => {
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(1) }));
    expect(readout().textContent).toBe(describeWorld(presetPayload(TRANSMISSION_PRESETS[1])!, presetName(1)));
  });

  it("names a save by its own name and its world: '<save> · AS (x, y)'", () => {
    const save = savedPayload('dusk');
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk Run' }));
    expect(readout().textContent).toBe(describeWorld(save, 'Dusk Run'));
    expect(readout().textContent!.startsWith('Dusk Run · dusk (')).toBe(true);
  });

  it('is labelled for assistive tech and announced politely', () => {
    render(<OffScreen />);
    expect(readout().getAttribute('role')).toBe('status');
    expect(readout().getAttribute('aria-label')).toBe(human('home.off.readout'));
  });
});

describe('OffScreen — muted: nothing comes off the plate', () => {
  beforeEach(() => markHeardWorld());

  it('has no cabinet box, wall or popped class anywhere in its DOM, picked or not', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    const { container } = render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    expect(container.querySelector('[class*="sc-cabinet-box"]')).toBeNull();
    expect(container.querySelector('[class*="popped"]')).toBeNull();
    expect(container.querySelector('.sc-radio-button--muted')).not.toBeNull();
  });
});

describe('OffScreen — on the phone shell (Task 28)', () => {
  beforeEach(() => markHeardWorld());

  // jsdom computes no layout, so "no horizontal overflow" is not checked here; the phone shell's DOM is: ScreenViewport marks
  // itself with data-shell, and Current, every preset, and a save with the longest legal name, is still in the picker.
  const renderOnPhone = () =>
    render(
      <main id="screen-viewport" data-shell="phone">
        <OffScreen />
      </main>,
    );

  it('renders Current and all three presets in the picker', () => {
    renderOnPhone();
    expect(radioNames()).toEqual([currentLabel(), presetName(0), presetName(1), presetName(2)]);
  });

  it('keeps a 128-character save name whole in its accessible name, drawn in the single-line label that ends in an ellipsis', () => {
    const longName = 'N'.repeat(128);
    saveNamedSession(longName, savedPayload('long'));
    renderOnPhone();
    const radio = screen.getByRole('radio', { name: longName });
    const label = radio.querySelector('.sc-radio-button__label');
    expect(label?.textContent).toBe(longName);
    expect(radio.querySelector('.sc-radio-button__flat')).not.toBeNull();
  });

  it('names a long pick in the readout whole, so the wrapping readout can take a second line', () => {
    const longName = 'N'.repeat(128);
    const save = savedPayload('long');
    saveNamedSession(longName, save);
    renderOnPhone();
    fireEvent.click(screen.getByRole('radio', { name: longName }));
    expect(screen.getByTestId('off-screen-readout').textContent).toBe(describeWorld(save, longName));
  });
});
