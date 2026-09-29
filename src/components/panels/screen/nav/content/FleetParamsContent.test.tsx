import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FleetParamsContent } from './FleetParamsContent';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { installIntersectionObserverStub, approachSection } from '@/testUtils/intersectionObserverStub';
import { clearSectionRef } from '@/utils/sectionRefs';
import { openAccordionFromNav, clearPendingNavTarget } from '@/utils/accordionSync';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { Trait } from '@/types/traits';

vi.mock('@/utils/sectionRefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/sectionRefs')>();
  return { ...actual, scrollToSection: vi.fn() };
});

// AudioRigDrawer/AudioRigEffectPanel/FleetDriftPanel/RobotDriftPanel each have their own full test
// suite — this file is about FleetParamsContent's own stacking/accordion wiring, not re-testing
// their content.
vi.mock('../../console/AudioRigDrawer', () => ({
  AudioRigDrawer: () => <div data-testid="audio-rig-drawer-stub" />,
  AudioRigEffectPanel: ({ effectKey }: { effectKey: string }) => (
    <div data-testid="audio-rig-effect-panel-stub" data-effect-key={effectKey} />
  ),
  FleetDriftPanel: () => <div data-testid="fleet-drift-panel-stub" />,
}));
vi.mock('@/components/robot/SignatureArrayDrawer', () => ({
  RobotDriftPanel: () => <div data-testid="robot-drift-panel-stub" />,
}));

const UI_INITIAL_STATE = useUIStore.getState();
const AUDIO_INITIAL_STATE = useAudioStore.getState();

const GROUP_IDS = ['fleetParams.pacing', 'fleetParams.eqFilters', 'fleetParams.fleetDrift', 'fleetParams.timeSpace', 'fleetParams.output'];
const GROUP_LABELS: Record<string, string> = {
  'fleetParams.pacing': 'Pacing',
  'fleetParams.eqFilters': 'EQ & Filters',
  'fleetParams.fleetDrift': 'LFO Drift',
  'fleetParams.timeSpace': 'Time & Space',
  'fleetParams.output': 'Output',
};
const GROUP_TRAITS: Trait[] = ['composition', 'spectral', 'spectral', 'timeSpace', 'output'];

const LEAF_ID_TO_EFFECT: Record<string, string> = {
  'fleetParams.pacing.tempo': 'tempo',
  'fleetParams.pacing.frequency': 'swellFrequency',
  'fleetParams.pacing.duration': 'swellDuration',
  'fleetParams.pacing.automaticEffects': 'automaticEffects',
  'fleetParams.eqFilters.eq': 'eq3',
  'fleetParams.eqFilters.hpf': 'filterHPF',
  'fleetParams.eqFilters.lpf': 'filterLPF',
  'fleetParams.fleetDrift.drift': 'globalDrift',
  'fleetParams.fleetDrift.robots': 'robotDrift',
  'fleetParams.timeSpace.reverb': 'reverb',
  'fleetParams.timeSpace.delay': 'delay',
  'fleetParams.output.compression': 'compressor',
  'fleetParams.output.limiter': 'limiter',
};
const LEAF_IDS = Object.keys(LEAF_ID_TO_EFFECT);
const ALL_SECTION_IDS = ['fleetParams', ...GROUP_IDS, ...LEAF_IDS];

function groupIdOf(leafId: string): string {
  return leafId.split('.').slice(0, 2).join('.');
}

function approach(id: string) {
  act(() => approachSection(id));
}

// A leaf's own scroll anchor only exists in the DOM once its group has approached (leaves are
// lazy-mounted behind their group's own approach gate) — mirrors real scroll order.
function approachLeaf(leafId: string) {
  approach(groupIdOf(leafId));
  approach(leafId);
}

beforeEach(() => {
  useUIStore.setState(UI_INITIAL_STATE, true);
  useAudioStore.setState(AUDIO_INITIAL_STATE, true);
  installIntersectionObserverStub();
  ALL_SECTION_IDS.forEach(clearSectionRef);
});

describe('FleetParamsContent — view-fade-in on arrival from a different view', () => {
  afterEach(() => {
    clearPendingNavTarget();
  });

  it('renders normally (no opacity override) when no nav click was mid-flight', () => {
    const { container } = render(<FleetParamsContent />);

    const root = container.querySelector('.fleet-params-content') as HTMLElement;
    expect(root.style.opacity).toBe('');
  });

  it('starts at opacity 0 when a nav click was already queued for one of this view\'s accordions', () => {
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });

    const { container } = render(<FleetParamsContent />);

    const root = container.querySelector('.fleet-params-content') as HTMLElement;
    expect(root.style.opacity).toBe('0');
  });
});

describe('FleetParamsContent — 5 uniform group accordions (docs/tasks/FLEET_PARAMS_CONTENT_REWORK.md Task 3; fleetDrift added by docs/specs/FLEET_DRIFT_CONSOLIDATION.md Task 12)', () => {
  it('renders exactly 5 accordion triggers — one per group — and no per-leaf accordion trigger for any of the leaves', () => {
    render(<FleetParamsContent />);

    Object.values(GROUP_LABELS).forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    });
    ['Tempo', 'Frequency', 'Duration', 'Automatic Intensity', '3-Band EQ', 'High-Pass Filter', 'Low-Pass Filter', 'Fleet Drift', 'Robot Drift', 'Reverb', 'Delay', 'Compressor', 'Limiter'].forEach((label) => {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    });
  });

  it('opens Pacing by default — the first group in order', () => {
    render(<FleetParamsContent />);

    expect(screen.getByRole('button', { name: 'Pacing' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'EQ & Filters' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('each group accordion opens/closes independently — opening one does not close another', () => {
    render(<FleetParamsContent />);

    fireEvent.click(screen.getByRole('button', { name: 'EQ & Filters' }));

    expect(screen.getByRole('button', { name: 'EQ & Filters' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Pacing' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking a group trigger opens it directly without touching selectedFleetParamsEffect', () => {
    render(<FleetParamsContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Output' }));

    expect(screen.getByRole('button', { name: 'Output' }).getAttribute('aria-expanded')).toBe('true');
    expect(useUIStore.getState().selectedFleetParamsEffect).toBeNull();
  });

  it('colors each group accordion root with its own trait, in group order (composition/spectral/spectral/timeSpace/output)', () => {
    const { container } = render(<FleetParamsContent />);

    const roots = container.querySelectorAll('.sc-accordion');
    expect(roots.length).toBe(5);
    roots.forEach((root, i) => {
      const expected = getTraitColorStyle(GROUP_TRAITS[i]) as Record<string, string>;
      expect((root as HTMLElement).style.getPropertyValue('--color-accent-a')).toBe(expected['--color-accent-a']);
      expect((root as HTMLElement).style.getPropertyValue('--color-accent-b')).toBe(expected['--color-accent-b']);
    });
  });

  it('renders the section-level IntroPanel ungated — present before any group has approached', () => {
    render(<FleetParamsContent />);

    expect(screen.getByText('Fleet Params LORE TITLE')).toBeTruthy();
  });

  it("a group's IntroPanel and its leaves are not in the DOM until that group's own anchor has approached", () => {
    render(<FleetParamsContent />);

    expect(screen.queryByText('EQ & Filters LORE TITLE')).toBeNull();
    expect(screen.queryByTestId('audio-rig-effect-panel-stub')).toBeNull();
  });

  it("mounts a group's own IntroPanel once that group's anchor has approached, labeled per the LORE TITLE convention", () => {
    render(<FleetParamsContent />);

    approach('fleetParams.eqFilters');

    expect(screen.getByText('EQ & Filters LORE TITLE')).toBeTruthy();
  });

  it('renders "LFO Drift" positioned right after "EQ & Filters" and before "Time & Space", with its own IntroPanel once approached', () => {
    render(<FleetParamsContent />);

    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    const eqIndex = buttons.findIndex((t) => t?.includes('EQ & Filters'));
    const driftIndex = buttons.findIndex((t) => t?.includes('LFO Drift'));
    const timeSpaceIndex = buttons.findIndex((t) => t?.includes('Time & Space'));
    expect(driftIndex).toBe(eqIndex + 1);
    expect(timeSpaceIndex).toBe(driftIndex + 1);

    approach('fleetParams.fleetDrift');

    expect(screen.getByText('LFO Drift LORE TITLE')).toBeTruthy();
  });

  it.each(Object.entries(LEAF_ID_TO_EFFECT).filter(([id]) => !id.includes('.pacing.') && !id.includes('.fleetDrift.')))(
    '%s -> AudioRigEffectPanel effectKey=%s, once its own leaf anchor has approached',
    (leafId, effectKey) => {
      render(<FleetParamsContent />);
      approachLeaf(leafId);

      expect(screen.getByTestId('audio-rig-effect-panel-stub').getAttribute('data-effect-key')).toBe(effectKey);
    },
  );

  it('renders FleetDriftPanel for fleetParams.fleetDrift.drift once its own leaf anchor has approached (docs/specs/FLEET_DRIFT_CONSOLIDATION.md Task 12)', () => {
    render(<FleetParamsContent />);
    approachLeaf('fleetParams.fleetDrift.drift');

    expect(screen.getByTestId('fleet-drift-panel-stub')).toBeTruthy();
  });

  it('renders RobotDriftPanel for fleetParams.fleetDrift.robots once its own leaf anchor has approached, beneath Fleet Drift (moved out of Probes/Companies entirely)', () => {
    render(<FleetParamsContent />);
    approachLeaf('fleetParams.fleetDrift.drift');
    approachLeaf('fleetParams.fleetDrift.robots');

    expect(screen.getByTestId('fleet-drift-panel-stub')).toBeTruthy();
    expect(screen.getByTestId('robot-drift-panel-stub')).toBeTruthy();
    // "beneath" — Fleet Drift's own leaf div precedes Robot Drift's in DOM order.
    const driftPanel = screen.getByTestId('fleet-drift-panel-stub');
    const robotPanel = screen.getByTestId('robot-drift-panel-stub');
    expect(driftPanel.compareDocumentPosition(robotPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the Tempo slider, live-bound to audioStore.bpm, once its own leaf anchor has approached', () => {
    useAudioStore.setState({ bpm: 88 });
    render(<FleetParamsContent />);

    approachLeaf('fleetParams.pacing.tempo');

    const slider = screen.getByRole('slider', { name: /tempo/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('88');
  });

  it('dragging the Tempo slider calls setBPM with the new value', () => {
    render(<FleetParamsContent />);
    approachLeaf('fleetParams.pacing.tempo');
    const setBPM = vi.spyOn(useAudioStore.getState(), 'setBPM');

    const slider = screen.getByRole('slider', { name: /tempo/i });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(setBPM).toHaveBeenCalled();
  });

  it('renders AudioRigDrawer for Automatic Intensity once its own leaf anchor has approached', () => {
    render(<FleetParamsContent />);

    approachLeaf('fleetParams.pacing.automaticEffects');

    expect(screen.getByTestId('audio-rig-drawer-stub')).toBeTruthy();
  });

  it('renders Tempo and Frequency together inside one shared top row panel (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md)', () => {
    render(<FleetParamsContent />);
    approachLeaf('fleetParams.pacing.tempo');
    approachLeaf('fleetParams.pacing.frequency');

    const tempoSlider = screen.getByRole('slider', { name: /tempo/i });
    const frequencySlider = screen.getByRole('slider', { name: /frequency/i });
    const panel = tempoSlider.closest('.sc-directional-panel');

    expect(panel).not.toBeNull();
    expect(panel!.contains(frequencySlider)).toBe(true);
  });

  it('renders Duration and Automatic Intensity together inside one shared bottom row panel, separate from the Tempo/Frequency row', () => {
    render(<FleetParamsContent />);
    approachLeaf('fleetParams.pacing.duration');
    approachLeaf('fleetParams.pacing.automaticEffects');
    approachLeaf('fleetParams.pacing.tempo');

    const durationSlider = screen.getByRole('slider', { name: /duration/i });
    const drawerStub = screen.getByTestId('audio-rig-drawer-stub');
    const tempoSlider = screen.getByRole('slider', { name: /tempo/i });
    const bottomPanel = durationSlider.closest('.sc-directional-panel');

    expect(bottomPanel).not.toBeNull();
    expect(bottomPanel!.contains(drawerStub)).toBe(true);
    expect(bottomPanel!.contains(tempoSlider)).toBe(false);
  });

  it('renders the Frequency slider, live-bound to audioStore.swellFrequency, once its own leaf anchor has approached', () => {
    // SliderLog's aria-valuenow reflects its internal normalized t (0-1, per
    // Radix Slider.Root), not the raw display value — assert the formatted
    // display text instead, same convention SliderLog.test.tsx itself uses.
    useAudioStore.setState({ swellFrequency: 8 });
    render(<FleetParamsContent />);

    approachLeaf('fleetParams.pacing.frequency');

    expect(screen.getByRole('slider', { name: /frequency/i })).toBeTruthy();
    expect(screen.getByText('8/measure')).toBeTruthy();
  });

  it('dragging the Frequency slider calls setSwellFrequency with the new value', () => {
    render(<FleetParamsContent />);
    approachLeaf('fleetParams.pacing.frequency');
    const setSwellFrequency = vi.spyOn(useAudioStore.getState(), 'setSwellFrequency');

    const slider = screen.getByRole('slider', { name: /frequency/i });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(setSwellFrequency).toHaveBeenCalled();
  });

  it('renders the Duration slider, live-bound to audioStore.swellDuration, once its own leaf anchor has approached', () => {
    useAudioStore.setState({ swellDuration: 8 });
    render(<FleetParamsContent />);

    approachLeaf('fleetParams.pacing.duration');

    const slider = screen.getByRole('slider', { name: /duration/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('8');
  });

  it('dragging the Duration slider calls setSwellDuration with the new value', () => {
    render(<FleetParamsContent />);
    approachLeaf('fleetParams.pacing.duration');
    const setSwellDuration = vi.spyOn(useAudioStore.getState(), 'setSwellDuration');

    const slider = screen.getByRole('slider', { name: /duration/i });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(setSwellDuration).toHaveBeenCalled();
  });

  it("scrolling to a group's own anchor (scrollspy) sets selectedFleetParamsEffect to that group's first leaf", () => {
    render(<FleetParamsContent />);

    approach('fleetParams.eqFilters');

    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('eq3');
  });

  it("scrolling to Pacing's own anchor (scrollspy) sets selectedFleetParamsEffect to 'tempo' — Pacing's own first leaf", () => {
    render(<FleetParamsContent />);

    approach('fleetParams.pacing');

    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('tempo');
  });

  it("scrolling to a leaf's own anchor (scrollspy) sets selectedFleetParamsEffect to that leaf's effectKey", () => {
    render(<FleetParamsContent />);

    approachLeaf('fleetParams.timeSpace.delay');

    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('delay');
  });

  it('scrollspy never calls scrollToSection and never touches any accordion\'s own open state', async () => {
    const { scrollToSection } = await import('@/utils/sectionRefs');
    render(<FleetParamsContent />);

    approach('fleetParams.output');

    expect(scrollToSection).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pacing' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Output' }).getAttribute('aria-expanded')).toBe('false');
  });
});
