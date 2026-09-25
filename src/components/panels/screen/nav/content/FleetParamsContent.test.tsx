import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FleetParamsContent } from './FleetParamsContent';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { installIntersectionObserverStub, approachSection } from '@/testUtils/intersectionObserverStub';
import { clearSectionRef } from '@/utils/sectionRefs';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { Trait } from '@/types/traits';

vi.mock('@/utils/sectionRefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/sectionRefs')>();
  return { ...actual, scrollToSection: vi.fn() };
});

// AudioRigDrawer/AudioRigEffectPanel each have their own full test suite — this file is about
// FleetParamsContent's own stacking/accordion wiring, not re-testing their content.
vi.mock('../../console/AudioRigDrawer', () => ({
  AudioRigDrawer: () => <div data-testid="audio-rig-drawer-stub" />,
  AudioRigEffectPanel: ({ effectKey }: { effectKey: string }) => (
    <div data-testid="audio-rig-effect-panel-stub" data-effect-key={effectKey} />
  ),
}));

const UI_INITIAL_STATE = useUIStore.getState();
const AUDIO_INITIAL_STATE = useAudioStore.getState();

const GROUP_IDS = ['fleetParams.pacing', 'fleetParams.eqFilters', 'fleetParams.timeSpace', 'fleetParams.output'];
const GROUP_LABELS: Record<string, string> = {
  'fleetParams.pacing': 'Pacing',
  'fleetParams.eqFilters': 'EQ & Filters',
  'fleetParams.timeSpace': 'Time & Space',
  'fleetParams.output': 'Output',
};
const GROUP_TRAITS: Trait[] = ['composition', 'spectral', 'timeSpace', 'output'];

const LEAF_ID_TO_EFFECT: Record<string, string> = {
  'fleetParams.pacing.tempo': 'tempo',
  'fleetParams.pacing.automaticEffects': 'automaticEffects',
  'fleetParams.eqFilters.eq': 'eq3',
  'fleetParams.eqFilters.hpf': 'filterHPF',
  'fleetParams.eqFilters.lpf': 'filterLPF',
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

describe('FleetParamsContent — 4 uniform group accordions (docs/tasks/FLEET_PARAMS_CONTENT_REWORK.md Task 3)', () => {
  it('renders exactly 4 accordion triggers — one per group — and no per-leaf accordion trigger for any of the 9 leaves', () => {
    render(<FleetParamsContent />);

    Object.values(GROUP_LABELS).forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    });
    ['Tempo', 'Automatic Intensity', '3-Band EQ', 'High-Pass Filter', 'Low-Pass Filter', 'Reverb', 'Delay', 'Compressor', 'Limiter'].forEach((label) => {
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

  it('colors each group accordion root with its own trait, in group order (composition/spectral/timeSpace/output)', () => {
    const { container } = render(<FleetParamsContent />);

    const roots = container.querySelectorAll('.sc-accordion');
    expect(roots.length).toBe(4);
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

  it.each(Object.entries(LEAF_ID_TO_EFFECT).filter(([id]) => !id.includes('.pacing.')))(
    '%s -> AudioRigEffectPanel effectKey=%s, once its own leaf anchor has approached',
    (leafId, effectKey) => {
      render(<FleetParamsContent />);
      approachLeaf(leafId);

      expect(screen.getByTestId('audio-rig-effect-panel-stub').getAttribute('data-effect-key')).toBe(effectKey);
    },
  );

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
