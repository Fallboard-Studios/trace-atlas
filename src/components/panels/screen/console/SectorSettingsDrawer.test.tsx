// ========================================
// MOCKS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const retransmitWorldMock = vi.fn();
vi.mock('@/systems/worldTransition', () => ({
  retransmitWorld: (input: unknown) => retransmitWorldMock(input),
}));

// ========================================
// IMPORTS
// ========================================
import { SectorSettingsDrawer } from './SectorSettingsDrawer';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '@/stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { ATTENUATION_STYLE_PRESETS, COORDINATE_PRESETS } from '@/data/sectorSettingsConfig';

// ========================================
// TESTS
// ========================================

describe('SectorSettingsDrawer', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({
      attenuationStyles: [{ ...DEFAULT_PELAGOS, name: 'Pelagos' }],
      currentAttenuationStyleId: DEFAULT_PELAGOS.id,
    });
    useLocaleStore.setState({
      locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, coordinates: { x: 5, y: 9 } } },
    });
    retransmitWorldMock.mockClear();
  });

  it('pre-populates the Attenuation Style name field with the current Attenuation Style name', () => {
    render(<SectorSettingsDrawer />);
    const textInputs = screen.getAllByRole('textbox');
    const attenuationStyleInput = textInputs.find((el) => (el as HTMLInputElement).value === 'Pelagos');
    expect(attenuationStyleInput).toBeTruthy();
  });

  it('pre-populates the coordinate fields with the current locale coordinates', () => {
    render(<SectorSettingsDrawer />);
    const spinbuttons = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(spinbuttons.map((el) => el.value)).toEqual(['5', '9']);
  });

  it('renders the status header reflecting the current Attenuation Style and coordinates', () => {
    render(<SectorSettingsDrawer />);
    expect(screen.getByText(/Pelagos/)).toBeTruthy();
  });

  it('clicking a promoted Attenuation Style preset populates only the name field and calls retransmitWorld zero times', () => {
    render(<SectorSettingsDrawer />);
    const preset = ATTENUATION_STYLE_PRESETS[0];
    fireEvent.click(screen.getByText(preset.name));

    const textInputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const attenuationStyleInput = textInputs.find((el) => el.value === preset.value);
    expect(attenuationStyleInput).toBeTruthy();
    expect(retransmitWorldMock).not.toHaveBeenCalled();
  });

  it('clicking a promoted coordinate preset populates only the coordinate fields and calls retransmitWorld zero times', () => {
    render(<SectorSettingsDrawer />);
    const preset = COORDINATE_PRESETS[0];
    fireEvent.click(screen.getByText(preset.name));

    const spinbuttons = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(spinbuttons.map((el) => Number(el.value))).toEqual([preset.value.x, preset.value.y]);
    expect(retransmitWorldMock).not.toHaveBeenCalled();
  });

  it('clicking Retransmit with only the Attenuation Style name edited passes just attenuationStyleName', () => {
    render(<SectorSettingsDrawer />);
    const textInputs = screen.getAllByRole('textbox');
    const attenuationStyleInput = textInputs.find((el) => (el as HTMLInputElement).value === 'Pelagos')!;
    fireEvent.change(attenuationStyleInput, { target: { value: 'Kryndara' } });

    fireEvent.click(screen.getByText('Retransmit'));

    expect(retransmitWorldMock).toHaveBeenCalledWith({ attenuationStyleName: 'Kryndara' });
  });

  it('clicking Retransmit with only coordinates edited passes just coordinates', () => {
    render(<SectorSettingsDrawer />);
    const [xInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(xInput, { target: { value: '42' } });

    fireEvent.click(screen.getByText('Retransmit'));

    expect(retransmitWorldMock).toHaveBeenCalledWith({ coordinates: { x: 42, y: 9 } });
  });

  it('clicking Retransmit with neither field edited passes an empty input', () => {
    render(<SectorSettingsDrawer />);
    fireEvent.click(screen.getByText('Retransmit'));
    expect(retransmitWorldMock).toHaveBeenCalledWith({});
  });

  it('no longer renders the old "Enable automatic effects" toggle — relocated and reshaped into the Audio Rig drawer\'s Ping Variance Automation slider (docs/tasks/PING-VARIANCE-AUTOMATION.md Task 7)', () => {
    render(<SectorSettingsDrawer />);
    expect(screen.queryByRole('switch', { name: 'Enable automatic effects' })).toBeNull();
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 14) — the Seed trait's
  // own colors (rosewood/dustyRose, since the 2026-09-12 rebalance replaced the too-intense
  // tangerine/yellow pairing) on the drawer's own root.
  it("scopes its root to the Seed trait's colors (rosewood/dustyRose)", () => {
    const { container } = render(<SectorSettingsDrawer />);
    const root = container.querySelector('.sector-settings-drawer') as HTMLElement;
    expect(root.style.getPropertyValue('--color-accent-a')).toBe('#914652');
    expect(root.style.getPropertyValue('--color-accent-b')).toBe('#b67288');
  });
});

describe('SectorSettingsDrawer reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 14)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'SectorSettingsDrawer.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/\[c\]/);
  });
});
