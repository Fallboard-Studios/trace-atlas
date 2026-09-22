import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so the "a change of robotLoad re-renders only..." test can tell whether a
// SPECIFIC sibling control's own render body re-executed. resolveAccessibleName(schema) is
// called unconditionally in every slider/radio's own render body, with that control's own
// `schema` object as its argument — filtering the spy's calls by `schema.id` isolates one
// specific control's own re-render count from the whole panel's.
vi.mock('@/components/ui/controls/accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { AudioLoadPanel } from './AudioLoadPanel';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { useAudioStore } from '@/stores/audioStore';

/**
 * The Audio Load panel (docs/specs/AUDIO_LOAD_BUDGET.md §4.5, decision F) — a self-contained,
 * prop-less component (no engine calls of its own; audioBudgetSystem reacts to the store write),
 * so it renders here in isolation rather than through its host. Lived inside AudioRigDrawer's
 * Transport & Composition accordion until it relocated to Settings -> Quality
 * (docs/tasks/NAV_LAYOUT_REWRITE.md Task 13, SettingsContent.tsx) — its own internals, and this
 * test file, are otherwise unchanged; only where it's rendered from changed. Extracted from
 * AudioRigDrawer.test.tsx originally (code-review follow-up, 2026-09-22).
 */

function resetAudioStore() {
  useAudioStore.setState({ robotLoad: 1, effectsLoad: 1 });
}

describe('Audio Load panel', () => {
  beforeEach(() => {
    resetAudioStore();
  });

  const presetRadio = (name: string) => screen.getByRole('radio', { name });
  const robotSlider = () => screen.getByRole('slider', { name: 'Robot Load' });
  const effectsSlider = () => screen.getByRole('slider', { name: 'Effects Load' });
  const selectedPresets = () =>
    ['Light', 'Standard', 'Full'].filter((name) => presetRadio(name).getAttribute('aria-checked') === 'true');

  it('renders its own Audio Load panel, with both sliders and the preset radio present', () => {
    render(<AudioLoadPanel />);
    const panel = robotSlider().closest('.sc-directional-panel')!;
    expect(panel.querySelector('.sc-dual-label__human')?.textContent).toBe('Audio Load');
    expect(effectsSlider().closest('.sc-directional-panel')).toBe(panel);
    expect(presetRadio('Light')).toBeTruthy();
  });

  it('shows the store’s two dials as percents, with the matching preset selected when both agree', () => {
    useAudioStore.setState({ robotLoad: 0.2, effectsLoad: 0.2 });
    render(<AudioLoadPanel />);
    expect(robotSlider().getAttribute('aria-valuenow')).toBe('20');
    expect(effectsSlider().getAttribute('aria-valuenow')).toBe('20');
    expect(selectedPresets()).toEqual(['Light']);
  });

  it('shows no preset selected when the two dials disagree, even if each alone sits on one', () => {
    useAudioStore.setState({ robotLoad: 1, effectsLoad: 0.2 });
    render(<AudioLoadPanel />);
    expect(selectedPresets()).toEqual([]);
  });

  it('selecting a preset sets both robotLoad and effectsLoad to its value, and both sliders follow', () => {
    render(<AudioLoadPanel />);
    fireEvent.click(presetRadio('Light'));
    expect(useAudioStore.getState().robotLoad).toBe(0.2);
    expect(useAudioStore.getState().effectsLoad).toBe(0.2);
    expect(robotSlider().getAttribute('aria-valuenow')).toBe('20');
    expect(effectsSlider().getAttribute('aria-valuenow')).toBe('20');
    fireEvent.click(presetRadio('Standard'));
    expect(useAudioStore.getState().robotLoad).toBe(0.6);
    expect(useAudioStore.getState().effectsLoad).toBe(0.6);
    fireEvent.click(presetRadio('Full'));
    expect(useAudioStore.getState().robotLoad).toBe(1);
    expect(useAudioStore.getState().effectsLoad).toBe(1);
    expect(selectedPresets()).toEqual(['Full']);
  });

  it('dragging the Robot Load slider updates only robotLoad and clears the radio selection when it lands between presets', () => {
    render(<AudioLoadPanel />);
    expect(selectedPresets()).toEqual(['Full']);
    robotSlider().focus();
    fireEvent.keyDown(robotSlider(), { key: 'ArrowLeft' });

    expect(useAudioStore.getState().robotLoad).toBeCloseTo(0.99, 5);
    expect(useAudioStore.getState().effectsLoad).toBe(1); // untouched
    expect(selectedPresets()).toEqual([]);
  });

  it('dragging the Effects Load slider updates only effectsLoad and clears the radio selection when it lands between presets', () => {
    render(<AudioLoadPanel />);
    expect(selectedPresets()).toEqual(['Full']);
    effectsSlider().focus();
    fireEvent.keyDown(effectsSlider(), { key: 'ArrowLeft' });

    expect(useAudioStore.getState().effectsLoad).toBeCloseTo(0.99, 5);
    expect(useAudioStore.getState().robotLoad).toBe(1); // untouched
    expect(selectedPresets()).toEqual([]);
  });

  it('re-selects a preset when both sliders land exactly on it', () => {
    useAudioStore.setState({ robotLoad: 0.59, effectsLoad: 0.59 });
    render(<AudioLoadPanel />);
    expect(selectedPresets()).toEqual([]);
    robotSlider().focus();
    fireEvent.keyDown(robotSlider(), { key: 'ArrowRight' });
    expect(selectedPresets()).toEqual([]); // robotLoad now 0.6 but effectsLoad still 0.59
    effectsSlider().focus();
    fireEvent.keyDown(effectsSlider(), { key: 'ArrowRight' });
    expect(useAudioStore.getState().robotLoad).toBeCloseTo(0.6, 5);
    expect(useAudioStore.getState().effectsLoad).toBeCloseTo(0.6, 5);
    expect(selectedPresets()).toEqual(['Standard']);
  });

  it('shows what the position means, live, in a readout line combining both dials', () => {
    useAudioStore.setState({ robotLoad: 1, effectsLoad: 1 });
    render(<AudioLoadPanel />);
    const panel = robotSlider().closest('.sc-directional-panel')!;
    expect(panel.textContent).toContain('Up to 12 robots · 16 notes · all LFOs and drift');

    fireEvent.click(presetRadio('Light'));
    expect(panel.textContent).toContain('Up to 4 robots · 8 notes · no drift or filter LFOs');
    expect(panel.textContent).toContain('latency: Playback (applies on next load)');
  });

  it('is a plain store write: no engine call from the panel (the budget system reacts)', () => {
    render(<AudioLoadPanel />);
    const before = { ...useAudioStore.getState() };
    fireEvent.click(presetRadio('Light'));
    const after = useAudioStore.getState();
    expect({ ...after, robotLoad: before.robotLoad, effectsLoad: before.effectsLoad }).toEqual(before);
  });

  it('renders enabled, with keyboard and radio semantics from the shared primitives', () => {
    render(<AudioLoadPanel />);
    expect(robotSlider().getAttribute('data-disabled')).toBeNull();
    expect(effectsSlider().getAttribute('data-disabled')).toBeNull();
    expect(presetRadio('Light').getAttribute('data-disabled')).toBeNull();
  });

  it('a change of robotLoad re-renders only the Robot Load control, not Effects Load', () => {
    render(<AudioLoadPanel />);
    const calls = (id: string) =>
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(([schema]) => schema.id === id).length;
    const robotBefore = calls('audioRig.robotLoad');
    const effectsBefore = calls('audioRig.effectsLoad');
    expect(robotBefore).toBeGreaterThan(0);

    act(() => useAudioStore.getState().setRobotLoad(0.3));

    expect(calls('audioRig.robotLoad')).toBeGreaterThan(robotBefore);
    expect(calls('audioRig.effectsLoad')).toBe(effectsBefore);
  });
});
