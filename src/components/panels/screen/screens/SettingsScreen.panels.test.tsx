import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// The panels' real chain reaches retransmitWorld (Seeds' Retransmit, a session's Load), which builds a
// world through AudioEngine; that path has its own suites (SectorSettingsDrawer / SessionsPanel tests).
vi.mock('@/systems/worldTransition', () => ({ retransmitWorld: vi.fn() }));

import { SettingsScreen } from './SettingsScreen';
import { CONTENT } from '@/content';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '@/stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { describeLimits, effectsLoadToLimits, robotLoadToLimits } from '@/utils/audioBudget';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 17: the real panels inside the Settings tabs, unchanged — the chain
 * SettingsSubsections.integration.test.tsx exercised for the stacked screen (real AudioLoadPanel /
 * SectorSettingsDrawer under their host), now through the tabs, with SessionsPanel as the third.
 */
const UI_INITIAL = useUIStore.getInitialState();
const pick = (key: keyof typeof CONTENT) => fireEvent.mouseDown(screen.getByRole('tab', { name: CONTENT[key].human }));

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState(UI_INITIAL, true);
  useUIStore.setState({ activeHubTile: 'settings', isPoweredOn: true });
  useAudioStore.setState({ robotLoad: 1, effectsLoad: 1 });
  useAttenuationStyleStore.setState({
    attenuationStyles: [{ ...DEFAULT_PELAGOS, name: 'Pelagos' }],
    currentAttenuationStyleId: DEFAULT_PELAGOS.id,
  });
  useLocaleStore.setState({
    locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, coordinates: { x: 12, y: 68 } } },
  });
});

describe('SettingsScreen — the real panels in their tabs', () => {
  it('Audio Quality: the preset radio, the two limit sliders and the limits readout', () => {
    render(<SettingsScreen />);
    // RadioButton is a Radix ToggleGroup: a group of radios.
    expect(screen.getByRole('group', { name: CONTENT['settings.quality.preset'].human })).toBeTruthy();
    expect(screen.getByRole('radio', { name: CONTENT['settings.quality.preset'].options.full.human }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('slider', { name: CONTENT['settings.quality.robotLoad'].human })).toBeTruthy();
    expect(screen.getByRole('slider', { name: CONTENT['settings.quality.effectsLoad'].human })).toBeTruthy();
    expect(screen.getByText(describeLimits({ ...robotLoadToLimits(1), ...effectsLoadToLimits(1) }))).toBeTruthy();
    // Nothing from the other two tabs.
    expect(screen.queryByRole('button', { name: /retransmit/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /session name/i })).toBeNull();
  });

  // The panel keeps its static popped facade (spec §1.1 as amended), so the readout sits on that cabinet's
  // front; it is not a cabinet of its own.
  it('the limits readout is not drawn as a cabinet: the nearest one is the Audio Load panel\'s own facade', () => {
    render(<SettingsScreen />);
    const readout = screen.getByText(describeLimits({ ...robotLoadToLimits(1), ...effectsLoadToLimits(1) }));
    expect(readout.classList.contains('audio-load-panel__readout')).toBe(true);
    expect(readout.querySelector('.sc-cabinet-box')).toBeNull();
    const facade = readout.closest('.sc-cabinet-box')!;
    expect(facade).not.toBeNull();
    expect(facade.querySelector(':scope > .sc-cabinet-box__front > [data-panel-id="audioRig.audioLoadPanel"]')).not.toBeNull();
  });

  it('Seeds: Atmosphere, Location and Retransmit', () => {
    render(<SettingsScreen />);
    pick('settings.seeds');
    expect(screen.getByRole('button', { name: /retransmit/i })).toBeTruthy();
    expect(screen.getAllByRole('spinbutton').map((input) => (input as HTMLInputElement).value)).toEqual(['12', '68']);
    expect(screen.queryByRole('slider', { name: CONTENT['settings.quality.robotLoad'].human })).toBeNull();
  });

  it('Save & Share: the session name and Save', () => {
    render(<SettingsScreen />);
    pick('settings.sessions');
    expect(screen.getByRole('textbox', { name: /session name/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /save session/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /retransmit/i })).toBeNull();
  });

  it('a limit edit made on Audio Quality is still there after a trip to another tab', () => {
    render(<SettingsScreen />);
    fireEvent.keyDown(screen.getByRole('slider', { name: CONTENT['settings.quality.robotLoad'].human }), { key: 'ArrowLeft' });
    const edited = useAudioStore.getState().robotLoad;
    expect(edited).toBeLessThan(1);
    pick('settings.sessions');
    pick('settings.quality');
    expect(useAudioStore.getState().robotLoad).toBe(edited);
    expect(screen.getByRole('slider', { name: CONTENT['settings.quality.robotLoad'].human }).getAttribute('aria-valuenow')).toBe(String(Math.round(edited * 100)));
  });
});
