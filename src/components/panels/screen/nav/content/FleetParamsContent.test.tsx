import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FleetParamsContent } from './FleetParamsContent';
import { useUIStore } from '@/stores/uiStore';

// AudioRigDrawer/AudioRigEffectPanel each have their own full test suite — this file is about
// FleetParamsContent's own leaf-routing, not re-testing their content.
vi.mock('../../console/AudioRigDrawer', () => ({
  AudioRigDrawer: () => <div data-testid="audio-rig-drawer-stub" />,
  AudioRigEffectPanel: ({ effectKey }: { effectKey: string }) => <div data-testid="audio-rig-effect-panel-stub" data-effect-key={effectKey} />,
}));

const UI_INITIAL_STATE = useUIStore.getState();

describe('FleetParamsContent — routes Fleet Params leaves to their content (docs/tasks/NAV_LAYOUT_REWRITE.md Task 14)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('shows AudioRigDrawer (Automatic Effects fallback) when no effect leaf is selected — bare "Fleet Params" or a category node', () => {
    render(<FleetParamsContent />);
    expect(screen.getByTestId('audio-rig-drawer-stub')).toBeTruthy();
    expect(screen.queryByTestId('audio-rig-effect-panel-stub')).toBeNull();
  });

  it('shows AudioRigEffectPanel bound to the selected effect when a leaf is selected', () => {
    useUIStore.getState().setSelectedFleetParamsEffect('eq3');
    render(<FleetParamsContent />);
    const stub = screen.getByTestId('audio-rig-effect-panel-stub');
    expect(stub.getAttribute('data-effect-key')).toBe('eq3');
    expect(screen.queryByTestId('audio-rig-drawer-stub')).toBeNull();
  });

  it('switches effect when selectedFleetParamsEffect changes to a different key', () => {
    useUIStore.getState().setSelectedFleetParamsEffect('compressor');
    render(<FleetParamsContent />);
    expect(screen.getByTestId('audio-rig-effect-panel-stub').getAttribute('data-effect-key')).toBe('compressor');
  });
});
