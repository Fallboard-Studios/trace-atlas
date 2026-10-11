import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 27 (spec §1.9): the powered-off screen — the etched label and power hint
 * over the dimmed still world, and the Transmission row: three presets, a divider, then the user's saves,
 * as a muted RadioButton (nothing comes off the plate while the power is off) with a well naming the pick.
 * Picking retransmits through applySessionPayload and never touches AudioEngine; only the rocker starts sound.
 */
vi.mock('@/utils/sessionDiff', () => ({
  applySessionPayload: vi.fn(),
}));
vi.mock('@/engine/AudioEngine', () => ({
  AudioEngine: { start: vi.fn(), stop: vi.fn(), scheduleNote: vi.fn() },
}));

import { OffScreen } from './OffScreen';
import { applySessionPayload } from '@/utils/sessionDiff';
import { AudioEngine } from '@/engine/AudioEngine';
import { TRANSMISSION_PRESETS } from '@/data/transmissionPresets';
import { saveNamedSession } from '@/utils/sessionStorageEngine';
import { CONTENT, fill } from '@/content';
import type { SessionPayload } from '@/types/session';

const human = (key: keyof typeof CONTENT) => CONTENT[key].human;
const presetName = (i: number) => human(TRANSMISSION_PRESETS[i].nameKey);
const picker = () => screen.getByRole('group', { name: human('home.off.transmission') });

// A save is a plain SessionPayload; the off screen only reads its name and hands the payload on.
const savedPayload = (style: string): SessionPayload => ({ ...TRANSMISSION_PRESETS[0].payload, attenuationStyleName: style });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('OffScreen — content', () => {
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

describe('OffScreen — the Transmission row', () => {
  it('lists the three presets, in order, under the Transmission label, with no divider when there are no saves', () => {
    const { container } = render(<OffScreen />);
    const radios = within(picker()).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([presetName(0), presetName(1), presetName(2)]);
    expect(container.querySelector('.sc-radio-button__divider')).toBeNull();
  });

  it("lists the user's saves after the presets, behind exactly one divider", () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Night, all freelance', savedPayload('night'));
    const { container } = render(<OffScreen />);
    const radios = within(picker()).getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
    expect(radios.slice(0, 3)).toEqual([presetName(0), presetName(1), presetName(2)]);
    expect(radios.slice(3).sort()).toEqual(['Dusk Run', 'Night, all freelance']);
    const dividers = container.querySelectorAll('.sc-radio-button__divider');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].nextElementSibling).toBe(screen.getAllByRole('radio')[3]);
  });

  it('has nothing selected before a pick', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    for (const radio of screen.getAllByRole('radio')) expect(radio.getAttribute('aria-checked')).toBe('false');
  });

  it("keeps a save that shares a preset's name apart from it: both render, and picking the save applies the save", () => {
    const save = savedPayload('same-name');
    saveNamedSession(presetName(0), save);
    render(<OffScreen />);
    const radios = screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-label') === presetName(0));
    expect(radios).toHaveLength(2);
    fireEvent.click(radios[1]);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });

  it("keeps a save named like a preset id apart from the preset", () => {
    const save = savedPayload('id-clash');
    saveNamedSession(TRANSMISSION_PRESETS[0].id, save);
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: TRANSMISSION_PRESETS[0].id }));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });
});

describe('OffScreen — picking', () => {
  it("applies the preset's payload, once, on picking a preset", () => {
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(1) }));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(TRANSMISSION_PRESETS[1].payload);
  });

  it("applies the saved session's payload on picking a save", () => {
    const save = savedPayload('dusk');
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk Run' }));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });

  it('never starts or touches the AudioEngine: only the power switch starts sound', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk Run' }));
    expect(AudioEngine.start).not.toHaveBeenCalled();
    expect(AudioEngine.stop).not.toHaveBeenCalled();
    expect(AudioEngine.scheduleNote).not.toHaveBeenCalled();
  });

  it('marks the picked option selected, and only it', () => {
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(2) }));
    expect(screen.getByRole('radio', { name: presetName(2) }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: presetName(0) }).getAttribute('aria-checked')).toBe('false');
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
  });
});

describe('OffScreen — the well naming the pick', () => {
  const readout = () => screen.getByTestId('off-screen-readout');

  it('names nothing before a pick, but the well is already in place so the row does not shift', () => {
    render(<OffScreen />);
    expect(readout().textContent).toBe('');
  });

  it('names a preset by its copy and its Attenuation Style code', () => {
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(1) }));
    expect(readout().textContent).toBe(
      fill('home.off.readout', { name: presetName(1), code: TRANSMISSION_PRESETS[1].payload.attenuationStyleName }),
    );
  });

  it('names a save by its own name and its Attenuation Style code', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk Run' }));
    expect(readout().textContent).toBe(fill('home.off.readout', { name: 'Dusk Run', code: 'dusk' }));
  });

  it('is labelled for assistive tech and announced politely', () => {
    render(<OffScreen />);
    expect(readout().getAttribute('role')).toBe('status');
    expect(readout().getAttribute('aria-label')).toBe(human('home.off.readout'));
  });
});

describe('OffScreen — muted: nothing comes off the plate', () => {
  it('has no cabinet box, wall or popped class anywhere in its DOM, picked or not', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    const { container } = render(<OffScreen />);
    fireEvent.click(screen.getByRole('radio', { name: presetName(0) }));
    expect(container.querySelector('[class*="sc-cabinet-box"]')).toBeNull();
    expect(container.querySelector('[class*="popped"]')).toBeNull();
    expect(container.querySelector('.sc-radio-button--muted')).not.toBeNull();
  });

  it('its stylesheet never mentions the cabinet, a pop or a glow', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'OffScreen.css'), 'utf-8');
    expect(css).not.toMatch(/cabinet|popped|glow/i);
  });
});

describe('OffScreen — on the phone shell (Task 28)', () => {
  // jsdom computes no layout, so "no horizontal overflow" is pinned at the source (OffScreen.css.test.ts,
  // RadioButton.css.test.ts, shell320.css.test.ts); here the phone shell's DOM is checked: ScreenViewport marks
  // itself with data-shell, and every preset, and a save with the longest legal name, is still in the picker.
  const renderOnPhone = () =>
    render(
      <main id="screen-viewport" data-shell="phone">
        <OffScreen />
      </main>,
    );

  it('renders all three presets in the picker', () => {
    renderOnPhone();
    expect(within(picker()).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([presetName(0), presetName(1), presetName(2)]);
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
    saveNamedSession(longName, savedPayload('long'));
    renderOnPhone();
    fireEvent.click(screen.getByRole('radio', { name: longName }));
    expect(screen.getByTestId('off-screen-readout').textContent).toBe(fill('home.off.readout', { name: longName, code: 'long' }));
  });
});
