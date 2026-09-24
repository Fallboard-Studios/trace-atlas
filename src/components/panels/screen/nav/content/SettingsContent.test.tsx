import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsContent } from './SettingsContent';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { installIntersectionObserverStub, approachSection } from '@/testUtils/intersectionObserverStub';
import { clearSectionRef } from '@/utils/sectionRefs';

vi.mock('@/utils/sectionRefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/sectionRefs')>();
  return { ...actual, scrollToSection: vi.fn() };
});

// SectorSettingsDrawer/AudioLoadPanel each have their own full test suite
// (SectorSettingsDrawer.test.tsx, AudioLoadPanel.test.tsx) — this file is about
// SettingsContent's own leaf-routing, not re-testing their content. Also avoids pulling in real
// Tone.js/AudioEngine paths that throw in this jsdom env, same boundary ConsolePanel.test.tsx
// already draws.
vi.mock('../../console/SectorSettingsDrawer', () => ({
  SectorSettingsDrawer: () => <div data-testid="sector-settings-drawer-stub" />,
  default: () => <div data-testid="sector-settings-drawer-stub" />,
}));
vi.mock('../../console/AudioLoadPanel', () => ({
  AudioLoadPanel: () => <div data-testid="audio-load-panel-stub" />,
  default: () => <div data-testid="audio-load-panel-stub" />,
}));

const UI_INITIAL_STATE = useUIStore.getState();
const SECTION_IDS = ['settings.volume', 'settings.quality', 'settings.tempo', 'settings.sectorSettings'];

function openAndApproach(leaf: 'volume' | 'quality' | 'tempo' | 'sectorSettings') {
  act(() => {
    useUIStore.getState().setSelectedSettingsLeaf(leaf);
    approachSection(`settings.${leaf}`);
  });
}

describe('SettingsContent — stacked view (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 7)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    useAudioStore.setState({ volume: 0.6, isMuted: false, bpm: 72 });
    useUIStore.getState().setPowerOn();
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  it('renders all 4 sections as accordion trigger shells, regardless of which (if any) is open', () => {
    render(<SettingsContent />);

    expect(screen.getByRole('button', { name: 'Volume' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quality' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tempo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sector Settings' })).toBeTruthy();
  });

  it('opens Volume\'s accordion by default when no Settings leaf is selected yet (bare "Settings" click) — the view/accordion model always has exactly one section open', () => {
    render(<SettingsContent />);

    expect(screen.getByRole('button', { name: 'Volume' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Quality' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Tempo' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Sector Settings' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('selecting Tempo opens only Tempo\'s accordion, closing whichever else was open — single-open-accordion, view-wide', () => {
    useUIStore.getState().setSelectedSettingsLeaf('tempo');
    render(<SettingsContent />);

    expect(screen.getByRole('button', { name: 'Tempo' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Volume' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Quality' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Sector Settings' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('a section\'s real content is not in the DOM until its anchor has been approached (lazy-mount gate)', () => {
    render(<SettingsContent />);
    // Volume is the open one by default, but has NOT been scrolled-near yet in this test.
    expect(screen.queryByRole('slider', { name: /volume/i })).toBeNull();
  });

  it('mounts a section\'s real content once its anchor is approached', () => {
    render(<SettingsContent />);

    act(() => approachSection('settings.volume'));

    expect(screen.getByRole('slider', { name: /volume/i })).toBeTruthy();
  });

  it('clicking an accordion trigger directly opens it and calls setSelectedSettingsLeaf, closing the previously open one', () => {
    render(<SettingsContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Tempo' }));

    expect(useUIStore.getState().selectedSettingsLeaf).toBe('tempo');
    expect(screen.getByRole('button', { name: 'Tempo' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Volume' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('manually scrolling a section into view (scrollspy) updates selectedSettingsLeaf without ever calling scrollToSection', async () => {
    const { scrollToSection } = await import('@/utils/sectionRefs');
    render(<SettingsContent />);

    act(() => approachSection('settings.tempo'));

    expect(useUIStore.getState().selectedSettingsLeaf).toBe('tempo');
    expect(scrollToSection).not.toHaveBeenCalled();
  });
});

describe('SettingsContent — Volume leaf content (docs/tasks/NAV_LAYOUT_REWRITE.md Task 11)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    useAudioStore.setState({ volume: 0.6, isMuted: false });
    useUIStore.getState().setPowerOn();
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  it('shows the volume slider, live-bound to audioStore.volume (0-100%, 1% steps)', () => {
    render(<SettingsContent />);
    openAndApproach('volume');

    const slider = screen.getByRole('slider', { name: /volume/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('60');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
  });

  it('stepping the volume slider calls setVolume, observable as a real store update', () => {
    render(<SettingsContent />);
    openAndApproach('volume');

    const slider = screen.getByRole('slider', { name: /volume/i });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(useAudioStore.getState().volume).toBeGreaterThan(0.6);
  });

  it('disables the volume slider when powered off', () => {
    useUIStore.setState({ isPoweredOn: false });
    render(<SettingsContent />);
    openAndApproach('volume');

    expect(screen.getByRole('slider', { name: /volume/i }).getAttribute('data-disabled')).toBe('');
  });
});

describe('SettingsContent — Tempo leaf content (docs/tasks/NAV_LAYOUT_REWRITE.md Task 12)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    useAudioStore.setState({ bpm: 72 });
    useUIStore.getState().setPowerOn();
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  it('shows the BPM slider, live-bound to audioStore.bpm, showing the store value directly (no scaling)', () => {
    render(<SettingsContent />);
    openAndApproach('tempo');

    const slider = screen.getByRole('slider', { name: /tempo/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('72');
  });

  it('dragging it calls setBPM directly with the dragged value — no conversion', () => {
    render(<SettingsContent />);
    openAndApproach('tempo');

    const slider = screen.getByRole('slider', { name: /tempo/i });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(useAudioStore.getState().bpm).toBeGreaterThan(72);
  });

  it('renders exactly once — no duplicate Tempo slider left behind anywhere', () => {
    render(<SettingsContent />);
    openAndApproach('tempo');
    expect(screen.getAllByRole('slider', { name: /tempo/i })).toHaveLength(1);
  });
});

describe('SettingsContent — Quality leaf content (docs/tasks/NAV_LAYOUT_REWRITE.md Task 13)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  it('shows AudioLoadPanel once Quality is open and approached', () => {
    render(<SettingsContent />);
    openAndApproach('quality');
    expect(screen.getByTestId('audio-load-panel-stub')).toBeTruthy();
  });

  it('shows only AudioLoadPanel — no SectorSettingsDrawer content mounted alongside it', () => {
    render(<SettingsContent />);
    openAndApproach('quality');
    expect(screen.queryByTestId('sector-settings-drawer-stub')).toBeNull();
  });
});

describe('SettingsContent — Sector Settings leaf content', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  it('shows SectorSettingsDrawer once Sector Settings is open and approached', () => {
    render(<SettingsContent />);
    openAndApproach('sectorSettings');
    expect(screen.getByTestId('sector-settings-drawer-stub')).toBeTruthy();
  });
});
