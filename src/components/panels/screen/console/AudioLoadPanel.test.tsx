import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Real lfoEngine would construct a real Tone.LFO on first setter call
// (getOrCreateLfo -> new Tone.LFO(...)), which throws without a real
// AudioContext — rendering the full AudioRigDrawer (below) pulls in every
// LFO group, so this mock is required even though this file's own
// assertions never touch an LFO control directly. Matches
// AudioRigDrawer.test.tsx's own convention for exactly this reason.
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so the "a change of robotLoad re-renders only..." test can tell whether a
// SPECIFIC sibling control's own render body re-executed. resolveAccessibleName(schema) is
// called unconditionally in every slider/radio's own render body, with that control's own
// `schema` object as its argument — filtering the spy's calls by `schema.id` isolates one
// specific control's own re-render count from the whole drawer's.
vi.mock('@/components/ui/controls/accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

vi.mock('../../../../engine/lfoEngine', () => ({
  lfoEngine: {
    getLfoSettings: vi.fn(),
    setLfoRate: vi.fn(),
    setLfoDepth: vi.fn(),
    setLfoShape: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    connectLfoTarget: vi.fn(() => true),
    disconnectLfoTarget: vi.fn(),
    setGlobalRateDrift: vi.fn(),
    setGlobalDepthDrift: vi.fn(),
  },
}));

import { AudioRigDrawer } from './AudioRigDrawer';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { useAudioStore } from '@/stores/audioStore';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import { DEFAULT_LFO_SETTINGS } from '@/data/lfoConfig';
import { GLOBAL_LFO_TARGET_IDS, type GlobalLfoTargetId } from '@/types/lfo';
import { openAllAccordions } from '@/testUtils/openAccordions';

/**
 * The Audio Load panel (docs/specs/AUDIO_LOAD_BUDGET.md §4.5, decision F) — inside Transport &
 * Composition. Shipped as two independent sliders 2026-09-22: Robot Load (robotLoad) and Effects Load
 * (effectsLoad), with one shared preset radio that sets both. Extracted from AudioRigDrawer.test.tsx
 * (code-review follow-up, 2026-09-22) — still renders the full drawer, not AudioLoadPanel in isolation,
 * since some assertions here are about the panel's placement WITHIN the drawer. Originally sat next
 * to a Tempo slider that also lived in this accordion — Tempo relocated to Settings -> Tempo
 * (docs/tasks/NAV_LAYOUT_REWRITE.md Task 12); AudioLoadPanel itself relocates in Task 13.
 */

// AccordionContainer only mounts a section's controls once it has been opened (docs/specs/ACCORDION_LAZY_MOUNT.md), and
// every assertion in this file is about controls inside those sections — so each render expands them all first, exactly
// as a user would before touching a slider.
function renderOpen(ui: React.ReactElement) {
  const result = render(ui);
  openAllAccordions(result.container);
  return result;
}

function buildLfoValue(target: GlobalLfoTargetId) {
  return { ...DEFAULT_LFO_SETTINGS[target] };
}

function resetAudioStore() {
  const globalLfo = {} as Record<GlobalLfoTargetId, ReturnType<typeof buildLfoValue>>;
  for (const target of GLOBAL_LFO_TARGET_IDS) globalLfo[target] = buildLfoValue(target);
  useAudioStore.setState({
    globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS },
    globalLfo,
    robotLoad: 1,
    effectsLoad: 1,
    soundingRobotIds: [],
    heldOffLfoKeys: [],
    driftHeldOff: false,
  });
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

  it('renders inside Transport & Composition, in its own Audio Load panel, with both sliders present', () => {
    renderOpen(<AudioRigDrawer />);
    const panel = robotSlider().closest('.sc-directional-panel')!;
    expect(panel.querySelector('.sc-dual-label__human')?.textContent).toBe('Audio Load');
    expect(effectsSlider().closest('.sc-directional-panel')).toBe(panel);
    expect(panel.closest('.sc-accordion')?.textContent).toContain('Transport & Composition');
  });

  it('shows the store’s two dials as percents, with the matching preset selected when both agree', () => {
    useAudioStore.setState({ robotLoad: 0.2, effectsLoad: 0.2 });
    renderOpen(<AudioRigDrawer />);
    expect(robotSlider().getAttribute('aria-valuenow')).toBe('20');
    expect(effectsSlider().getAttribute('aria-valuenow')).toBe('20');
    expect(selectedPresets()).toEqual(['Light']);
  });

  it('shows no preset selected when the two dials disagree, even if each alone sits on one', () => {
    useAudioStore.setState({ robotLoad: 1, effectsLoad: 0.2 });
    renderOpen(<AudioRigDrawer />);
    expect(selectedPresets()).toEqual([]);
  });

  it('selecting a preset sets both robotLoad and effectsLoad to its value, and both sliders follow', () => {
    renderOpen(<AudioRigDrawer />);
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
    renderOpen(<AudioRigDrawer />);
    expect(selectedPresets()).toEqual(['Full']);
    robotSlider().focus();
    fireEvent.keyDown(robotSlider(), { key: 'ArrowLeft' });

    expect(useAudioStore.getState().robotLoad).toBeCloseTo(0.99, 5);
    expect(useAudioStore.getState().effectsLoad).toBe(1); // untouched
    expect(selectedPresets()).toEqual([]);
  });

  it('dragging the Effects Load slider updates only effectsLoad and clears the radio selection when it lands between presets', () => {
    renderOpen(<AudioRigDrawer />);
    expect(selectedPresets()).toEqual(['Full']);
    effectsSlider().focus();
    fireEvent.keyDown(effectsSlider(), { key: 'ArrowLeft' });

    expect(useAudioStore.getState().effectsLoad).toBeCloseTo(0.99, 5);
    expect(useAudioStore.getState().robotLoad).toBe(1); // untouched
    expect(selectedPresets()).toEqual([]);
  });

  it('re-selects a preset when both sliders land exactly on it', () => {
    useAudioStore.setState({ robotLoad: 0.59, effectsLoad: 0.59 });
    renderOpen(<AudioRigDrawer />);
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
    renderOpen(<AudioRigDrawer />);
    const panel = robotSlider().closest('.sc-directional-panel')!;
    expect(panel.textContent).toContain('Up to 12 robots · 16 notes · all LFOs and drift');

    fireEvent.click(presetRadio('Light'));
    expect(panel.textContent).toContain('Up to 4 robots · 8 notes · no drift or filter LFOs');
    expect(panel.textContent).toContain('latency: Playback (applies on next load)');
  });

  it('is a plain store write: no engine call from the panel (the budget system reacts)', () => {
    renderOpen(<AudioRigDrawer />);
    const before = { ...useAudioStore.getState() };
    fireEvent.click(presetRadio('Light'));
    const after = useAudioStore.getState();
    expect({ ...after, robotLoad: before.robotLoad, effectsLoad: before.effectsLoad }).toEqual(before);
  });

  it('renders enabled, with keyboard and radio semantics from the shared primitives', () => {
    renderOpen(<AudioRigDrawer />);
    expect(robotSlider().getAttribute('data-disabled')).toBeNull();
    expect(effectsSlider().getAttribute('data-disabled')).toBeNull();
    expect(presetRadio('Light').getAttribute('data-disabled')).toBeNull();
  });

  it('a change of robotLoad re-renders only the Robot Load control, not Effects Load, Tempo or any effect control', () => {
    renderOpen(<AudioRigDrawer />);
    const calls = (id: string) =>
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(([schema]) => schema.id === id).length;
    const tempoBefore = calls('audioRig.bpm');
    const delayBefore = calls('delay.wet');
    const robotBefore = calls('audioRig.robotLoad');
    const effectsBefore = calls('audioRig.effectsLoad');
    expect(robotBefore).toBeGreaterThan(0);

    act(() => useAudioStore.getState().setRobotLoad(0.3));

    expect(calls('audioRig.robotLoad')).toBeGreaterThan(robotBefore);
    expect(calls('audioRig.effectsLoad')).toBe(effectsBefore);
    expect(calls('audioRig.bpm')).toBe(tempoBefore);
    expect(calls('delay.wet')).toBe(delayBefore);
  });
});
