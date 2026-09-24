import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FleetParamsContent } from './FleetParamsContent';
import { useUIStore } from '@/stores/uiStore';
import { installIntersectionObserverStub, approachSection } from '@/testUtils/intersectionObserverStub';
import { clearSectionRef } from '@/utils/sectionRefs';

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
const LEAF_IDS = [
  'fleetParams.eqFilters.eq',
  'fleetParams.eqFilters.hpf',
  'fleetParams.eqFilters.lpf',
  'fleetParams.timeSpace.reverb',
  'fleetParams.timeSpace.delay',
  'fleetParams.output.compression',
  'fleetParams.output.limiter',
];

function openAndApproach(id: string) {
  // Lazy-mount is driven purely by approach — an accordion's own open/closed state (manual,
  // independent per accordion) has no bearing on whether its content is in the DOM.
  act(() => approachSection(id));
}

const LEAF_ID_TO_EFFECT: Record<string, import('@/data/audioRigConfig').AudioRigEffectKey> = {
  'fleetParams.eqFilters.eq': 'eq3',
  'fleetParams.eqFilters.hpf': 'filterHPF',
  'fleetParams.eqFilters.lpf': 'filterLPF',
  'fleetParams.timeSpace.reverb': 'reverb',
  'fleetParams.timeSpace.delay': 'delay',
  'fleetParams.output.compression': 'compressor',
  'fleetParams.output.limiter': 'limiter',
};

describe('FleetParamsContent — stacked view (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 8)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    installIntersectionObserverStub();
    LEAF_IDS.forEach(clearSectionRef);
  });

  it('always renders AudioRigDrawer (Automatic Effects) unwrapped, regardless of which leaf is open', () => {
    render(<FleetParamsContent />);
    expect(screen.getByTestId('audio-rig-drawer-stub')).toBeTruthy();

    act(() => useUIStore.getState().setSelectedFleetParamsEffect('limiter'));
    expect(screen.getByTestId('audio-rig-drawer-stub')).toBeTruthy();
  });

  it('renders all 3 group headings and all 7 leaf accordion triggers as shells', () => {
    render(<FleetParamsContent />);

    expect(screen.getByText('EQ & Filters')).toBeTruthy();
    expect(screen.getByText('Time & Space')).toBeTruthy();
    expect(screen.getByText('Output')).toBeTruthy();
    expect(screen.getByRole('button', { name: '3-Band EQ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'High-Pass Filter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Low-Pass Filter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reverb' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delay' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Compressor' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Limiter' })).toBeTruthy();
  });

  it('opens the first leaf (3-Band EQ) by default when no effect is selected yet', () => {
    render(<FleetParamsContent />);

    expect(screen.getByRole('button', { name: '3-Band EQ' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Reverb' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking a leaf trigger opens it directly, without touching selectedFleetParamsEffect', () => {
    render(<FleetParamsContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Reverb' }));

    expect(screen.getByRole('button', { name: 'Reverb' }).getAttribute('aria-expanded')).toBe('true');
    expect(useUIStore.getState().selectedFleetParamsEffect).toBeNull();
  });

  it('opening a second leaf across groups does not close a previously-open one — multiple can be open at once, no cross-group single-open anymore', () => {
    render(<FleetParamsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Reverb' }));

    fireEvent.click(screen.getByRole('button', { name: 'Limiter' }));

    expect(screen.getByRole('button', { name: 'Limiter' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Reverb' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('a leaf\'s real content (AudioRigEffectPanel) is not in the DOM until its anchor has been approached', () => {
    render(<FleetParamsContent />);
    expect(screen.queryByTestId('audio-rig-effect-panel-stub')).toBeNull();
  });

  it('mounts a leaf\'s AudioRigEffectPanel once its anchor is approached, bound to the right effect key', () => {
    render(<FleetParamsContent />);

    act(() => approachSection('fleetParams.eqFilters.eq'));

    const stub = screen.getByTestId('audio-rig-effect-panel-stub');
    expect(stub.getAttribute('data-effect-key')).toBe('eq3');
  });

  it('manually scrolling a leaf into view (scrollspy) updates selectedFleetParamsEffect for tree highlighting, without ever calling scrollToSection or touching any accordion\'s open state', async () => {
    const { scrollToSection } = await import('@/utils/sectionRefs');
    render(<FleetParamsContent />);

    act(() => approachSection('fleetParams.timeSpace.delay'));

    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('delay');
    expect(scrollToSection).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '3-Band EQ' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Delay' }).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('FleetParamsContent — every leaf routes to its correct AudioRigEffectPanel effectKey', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    installIntersectionObserverStub();
    LEAF_IDS.forEach(clearSectionRef);
  });

  it.each(Object.entries(LEAF_ID_TO_EFFECT))('%s -> %s', (id, effectKey) => {
    render(<FleetParamsContent />);
    openAndApproach(id);

    expect(screen.getByTestId('audio-rig-effect-panel-stub').getAttribute('data-effect-key')).toBe(effectKey);
  });
});
